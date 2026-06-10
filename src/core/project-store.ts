import * as vscode from "vscode";
import * as fs from "fs";
import type { Project, RecentFolder } from "../types";
import { scanProjects } from "../services/project-scanner";
import { initializeProjectTimestamps } from "../services/git-info-service";
import { getConfig } from "../services/configuration-service";
import { computeDisplayNames } from "../utils/path-utils";
import * as path from "path";
import { partitionScannedSaved, countPathsUnder } from "./project-logic";
import type { WorkspaceHistoryService } from "../services/workspace-history-service";
import type { SavedProjectsService } from "../services/saved-projects-service";
import type { ProjectsCacheService } from "../services/projects-cache-service";

export type ProjectStoreChange = { kind: "reset" } | { kind: "paths"; paths: string[] };

/**
 * Single owner of _projects and _recentFolders.
 * Commands and services read data from here; the provider subscribes via onDidChange.
 */
export class ProjectStore implements vscode.Disposable {
  private _projects: Project[] = [];
  private _recentFolders: RecentFolder[] = [];
  private _loadingPromise: Promise<void> | null = null;
  private _hasLoaded = false;
  // Raw result of the last disk scan, before exclusion filtering. Lets
  // marker-only mutations (save/remove/tag/exclude) re-merge in memory
  // without touching the disk or spawning git.
  private _lastScanned: Project[] = [];
  private _loadGeneration = 0;
  private _scanTokenSource: vscode.CancellationTokenSource | null = null;
  private _disposed = false;

  // Resolved once, after the first seed/load. getChildren waits on this and
  // nothing else — the tree must never block on an in-flight rescan.
  private _initResolve: (() => void) | null = null;
  private readonly _initPromise = new Promise<void>((resolve) => {
    this._initResolve = resolve;
  });

  private _onDidChange = new vscode.EventEmitter<ProjectStoreChange>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly historyService: WorkspaceHistoryService,
    private readonly savedProjectsService: SavedProjectsService,
    private readonly projectsCacheService: ProjectsCacheService
  ) {}

  // ==================== Public reads ====================

  getProjects(): Project[] {
    return this._projects;
  }

  getRecentFolders(): RecentFolder[] {
    return this._recentFolders;
  }

  findProjectByPath(path: string): Project | undefined {
    return this._projects.find((p) => p.path === path);
  }

  findFolderByPath(folderPath: string): RecentFolder | undefined {
    return this._recentFolders.find((f) => f.path === folderPath);
  }

  /**
   * Resolves after the first seed/load. Already-resolved afterwards, so
   * awaiting it on every getChildren is effectively free.
   */
  whenInitialized(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Returns true once the first full disk scan has completed.
   * Used to guard operations that must not run against a partial seed.
   */
  hasLoaded(): boolean {
    return this._hasLoaded;
  }

  /**
   * Number of recent folders nested under the given path. Saving an
   * ancestor folder hides these via the subfolder filter in
   * getRecentFolders — callers should warn the user before proceeding.
   */
  countRecentUnder(parentPath: string): number {
    return countPathsUnder(
      this._recentFolders.map((f) => f.path),
      parentPath,
      path.sep
    );
  }

  emitChange(change: ProjectStoreChange): void {
    if (this._disposed) {
      return;
    }
    this._onDidChange.fire(change);
  }

  // ==================== Refresh ====================

  /**
   * Reconcile with a disk scan. If a load is already in flight, join it
   * instead of starting a competing scan — concurrent callers share one scan.
   */
  refresh(): Promise<void> {
    if (this._loadingPromise) {
      return this._loadingPromise;
    }
    return this._startLoad();
  }

  /**
   * Cancel any in-progress scan and start a fresh one. Use only when the
   * previous scan's result is known to be stale (root folder / exclude
   * patterns changed, explicit Rescan command) — everything else should
   * join via refresh().
   */
  rescan(): Promise<void> {
    if (this._scanTokenSource) {
      this._scanTokenSource.cancel();
      this._scanTokenSource.dispose();
      this._scanTokenSource = null;
    }
    return this._startLoad();
  }

  /**
   * Re-merge the project list from the last scan result and the CURRENT
   * markers (saved records, tags, excluded paths) — no disk scan, no git.
   * This is what save/remove/tag/exclude mutations call: the set of folders
   * on disk did not change, only their classification did.
   */
  async reconcileMarkers(): Promise<void> {
    if (!this._hasLoaded) {
      // First load hasn't completed yet — fall back to a full load.
      return this.refresh();
    }

    const excludedPaths = this.savedProjectsService.getExcludedPaths();
    const savedProjects = this.savedProjectsService.toProjects();
    const { filteredScanned, uniqueSavedCandidates } = partitionScannedSaved(
      this._lastScanned,
      savedProjects,
      excludedPaths
    );

    const existsResults = await Promise.all(
      uniqueSavedCandidates.map((p) =>
        fs.promises.access(p.path).then(() => true).catch(() => false)
      )
    );
    const uniqueSaved = uniqueSavedCandidates.filter((_, i) => existsResults[i]);

    if (this._disposed) {
      return;
    }

    this._projects = [...filteredScanned, ...uniqueSaved];

    const config = getConfig();
    if (config.showRecentFolders) {
      this._recentFolders = this.historyService.getRecentFolders(this._projects);
    } else {
      this._recentFolders = [];
    }

    this._applyDisplayNames(this._projects);
    this._applyDisplayNames(this._recentFolders);

    void this.projectsCacheService.save(
      this._projects.map((p) => ({
        path: p.path,
        name: p.name,
        isGitRepo: p.isGitRepo ?? false,
        hasWorktrees: p.hasWorktrees ?? false,
      }))
    );
    this._onDidChange.fire({ kind: "reset" });
  }

  private async _startLoad(): Promise<void> {
    this._scanTokenSource = new vscode.CancellationTokenSource();
    const token = this._scanTokenSource.token;

    const myGeneration = ++this._loadGeneration;
    const loading = this._loadProjects(token, myGeneration);
    this._loadingPromise = loading;
    try {
      await loading;
    } finally {
      // Only the most recent load clears the promise and fires reset.
      // A superseded load must not null the newer load's promise or fire a premature reset.
      if (myGeneration === this._loadGeneration) {
        this._loadingPromise = null;
        if (!this._disposed) {
          this._onDidChange.fire({ kind: "reset" });
        }
      }
      this._markInitialized();
    }
  }

  private _markInitialized(): void {
    if (this._initResolve) {
      this._initResolve();
      this._initResolve = null;
    }
  }

  // ==================== Internal load ====================

  private async _loadProjects(token: vscode.CancellationToken, generation: number): Promise<void> {
    const config = getConfig();

    // 1. Cold start only: paint the user's known (saved) projects right away so
    //    the panel isn't blank/spinning while the first scan runs.
    if (!this._hasLoaded) {
      this._seedFromCache(config);
      this._onDidChange.fire({ kind: "reset" });
      // The seeded tree is paintable right away — getChildren must not wait
      // for the disk scan that follows.
      this._markInitialized();
    }

    // 2. Reconcile with a full filesystem scan, then repaint.
    const scannedProjects = await scanProjects(config, token);

    if (token.isCancellationRequested) {
      return;
    }

    // Keep the raw scan result so marker-only mutations can re-merge
    // in memory via reconcileMarkers() without rescanning the disk.
    this._lastScanned = scannedProjects;

    const excludedPaths = this.savedProjectsService.getExcludedPaths();
    const savedProjects = this.savedProjectsService.toProjects();

    const { filteredScanned, uniqueSavedCandidates } = partitionScannedSaved(
      scannedProjects,
      savedProjects,
      excludedPaths
    );

    const existsResults = await Promise.all(
      uniqueSavedCandidates.map((p) =>
        fs.promises.access(p.path).then(() => true).catch(() => false)
      )
    );

    if (token.isCancellationRequested) {
      return;
    }

    const uniqueSaved = uniqueSavedCandidates.filter((_, i) => existsResults[i]);

    this._projects = [...filteredScanned, ...uniqueSaved];

    // Persist the scan result so the next cold start can paint the full tree
    // from globalState instead of waiting for another scan.
    void this.projectsCacheService.save(
      this._projects.map((p) => ({
        path: p.path,
        name: p.name,
        isGitRepo: p.isGitRepo ?? false,
        hasWorktrees: p.hasWorktrees ?? false,
      }))
    );

    // Load recent folders before renaming projects
    if (config.showRecentFolders) {
      this._recentFolders = this.historyService.getRecentFolders(this._projects);
    } else {
      this._recentFolders = [];
    }

    // Disambiguate display names so projects sharing a last path segment
    // don't all show the same name.
    this._applyDisplayNames(this._projects);
    this._applyDisplayNames(this._recentFolders);

    this._hasLoaded = true;

    // Initialize timestamps for new projects in background (non-blocking)
    initializeProjectTimestamps(this._projects, this.historyService)
      .then((count) => {
        if (this._disposed) {
          return;
        }
        if (count > 0) {
          this._onDidChange.fire({ kind: "reset" });
        }
      })
      .catch((err) => {
        console.error("Error initializing project timestamps:", err);
      });

    // Remove stale recent-folder entries from history in background (non-blocking)
    if (config.showRecentFolders) {
      const foldersToCheck = [...this._recentFolders];
      Promise.all(
        foldersToCheck.map((folder) =>
          fs.promises.access(folder.path).then(() => true).catch(() => false)
        )
      )
        .then((folderExistsResults) => {
          if (this._disposed) {
            return;
          }
          const missing = foldersToCheck.filter((_, i) => !folderExistsResults[i]);
          if (missing.length > 0) {
            for (const folder of missing) {
              this.historyService.removeFromHistory(folder.path);
            }
            if (generation !== this._loadGeneration) {
              return;
            }
            this._recentFolders = this.historyService.getRecentFolders(this._projects);
            this._applyDisplayNames(this._recentFolders);
            this._onDidChange.fire({ kind: "reset" });
          }
        })
        .catch((err) => {
          console.error("Error cleaning up recent folders:", err);
        });
    }
  }

  private _seedFromCache(config: ReturnType<typeof getConfig>): void {
    const cached = this.projectsCacheService.get();

    if (cached.length > 0) {
      this._projects = cached.map((c) => ({
        name: c.name,
        path: c.path,
        uri: vscode.Uri.file(c.path),
        isGitRepo: c.isGitRepo,
        hasWorktrees: c.hasWorktrees,
      }));
    } else {
      this._projects = this.savedProjectsService.toProjects();
    }

    if (config.showRecentFolders) {
      this._recentFolders = this.historyService.getRecentFolders(this._projects);
    } else {
      this._recentFolders = [];
    }

    this._applyDisplayNames(this._projects);
    this._applyDisplayNames(this._recentFolders);
  }

  private _applyDisplayNames(items: { name: string; path: string }[]): void {
    if (items.length === 0) {
      return;
    }
    const names = computeDisplayNames(items.map((item) => item.path));
    for (const item of items) {
      const name = names.get(item.path);
      if (name) {
        item.name = name;
      }
    }
  }

  // ==================== Disposable ====================

  dispose(): void {
    this._disposed = true;
    if (this._scanTokenSource) {
      this._scanTokenSource.cancel();
      this._scanTokenSource.dispose();
      this._scanTokenSource = null;
    }
    this._onDidChange.dispose();
  }
}
