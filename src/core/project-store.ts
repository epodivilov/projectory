import * as vscode from "vscode";
import * as fs from "fs";
import type { Project, RecentFolder } from "../types";
import { scanProjects } from "../services/project-scanner";
import { initializeProjectTimestamps } from "../services/git-info-service";
import { getConfig } from "../services/configuration-service";
import { computeDisplayNames } from "../utils/path-utils";
import { partitionScannedSaved } from "./project-logic";
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
  private _loadGeneration = 0;
  private _scanTokenSource: vscode.CancellationTokenSource | null = null;
  private _disposed = false;

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

  getLoadingPromise(): Promise<void> | null {
    return this._loadingPromise;
  }

  emitChange(change: ProjectStoreChange): void {
    if (this._disposed) {
      return;
    }
    this._onDidChange.fire(change);
  }

  // ==================== Refresh ====================

  /**
   * Cancel any in-progress scan and start a fresh one.
   * Returns a promise that resolves when the new load completes.
   */
  async refresh(): Promise<void> {
    // Cancel the previous scan
    if (this._scanTokenSource) {
      this._scanTokenSource.cancel();
      this._scanTokenSource.dispose();
    }
    this._scanTokenSource = new vscode.CancellationTokenSource();
    const token = this._scanTokenSource.token;

    const myGeneration = ++this._loadGeneration;
    this._loadingPromise = this._loadProjects(token, myGeneration);
    try {
      await this._loadingPromise;
    } finally {
      // Only the most recent load clears the promise and fires reset.
      // A superseded load must not null the newer load's promise or fire a premature reset.
      if (myGeneration === this._loadGeneration) {
        this._loadingPromise = null;
        if (!this._disposed) {
          this._onDidChange.fire({ kind: "reset" });
        }
      }
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
    }

    // 2. Reconcile with a full filesystem scan, then repaint.
    const scannedProjects = await scanProjects(config, token);

    if (token.isCancellationRequested) {
      return;
    }

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
