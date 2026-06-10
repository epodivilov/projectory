import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { PostponedSuggestion } from "../types";
import type { SuggestionConfig } from "./configuration-service";
import type {
  WorkspaceHistoryService,
  WorkspaceHistoryEntry,
} from "./workspace-history-service";
import type { SavedProjectsService } from "./saved-projects-service";
import type { ProjectMetadataService } from "./project-metadata-service";
import { isWorktreePath } from "./git-info-service";
import { normalizePath, createNormalizedPathSet, normalizedSetHas } from "../utils/path-utils";
import type { StateStore } from "../core/state-store";
import type { ProjectStore } from "../core/project-store";

const IGNORED_SUGGESTIONS_KEY = "ignoredSuggestionPaths";
const POSTPONED_SUGGESTIONS_KEY = "postponedSuggestions";
const POSTPONE_DURATION_DAYS = 7;

/**
 * Service for managing folder save suggestions
 */
export class SuggestionService implements vscode.Disposable {
  private shownThisSession = new Set<string>();

  constructor(
    private readonly state: StateStore,
    private readonly historyService: WorkspaceHistoryService,
    private readonly savedProjectsService: SavedProjectsService,
    private readonly metadataService: ProjectMetadataService,
    private readonly store: ProjectStore
  ) {}

  dispose(): void {
    // Nothing to clean up — suggestions are fire-and-forget notifications.
  }

  private getAllProjectPaths(): string[] {
    const paths: string[] = [];
    for (const p of this.store.getProjects()) {
      paths.push(p.path);
      if (p.worktrees) {
        for (const w of p.worktrees) {
          paths.push(w.path);
        }
      }
    }
    return paths;
  }

  /**
   * Get permanently ignored paths
   */
  getIgnoredPaths(): string[] {
    return this.state.get(IGNORED_SUGGESTIONS_KEY, []);
  }

  /**
   * Permanently ignore a path
   */
  ignorePath(folderPath: string): void {
    const ignored = this.getIgnoredPaths();
    if (!ignored.includes(folderPath)) {
      ignored.push(folderPath);
      this.state.update(IGNORED_SUGGESTIONS_KEY, ignored);
    }
  }

  /**
   * Remove a path from ignored list
   */
  unignorePath(folderPath: string): void {
    const ignored = this.getIgnoredPaths();
    const filtered = ignored.filter((p) => p !== folderPath);
    this.state.update(IGNORED_SUGGESTIONS_KEY, filtered);
  }

  /**
   * Get postponed suggestions
   */
  getPostponedSuggestions(): PostponedSuggestion[] {
    return this.state.get(POSTPONED_SUGGESTIONS_KEY, []);
  }

  /**
   * Postpone a suggestion for later
   */
  postponeSuggestion(folderPath: string): void {
    const postponed = this.getPostponedSuggestions();
    // Remove existing entry if any
    const filtered = postponed.filter((p) => p.path !== folderPath);
    filtered.push({
      path: folderPath,
      postponedAt: Date.now(),
    });
    this.state.update(POSTPONED_SUGGESTIONS_KEY, filtered);
  }

  /**
   * Remove a path from postponed list
   */
  unpostponePath(folderPath: string): void {
    const postponed = this.getPostponedSuggestions();
    const filtered = postponed.filter((p) => p.path !== folderPath);
    this.state.update(POSTPONED_SUGGESTIONS_KEY, filtered);
  }

  /**
   * Check if a postponed suggestion has expired
   */
  private isPostponeExpired(suggestion: PostponedSuggestion): boolean {
    const expireTime =
      suggestion.postponedAt + POSTPONE_DURATION_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() > expireTime;
  }

  /**
   * Clean up expired postponements
   */
  cleanupExpiredPostponements(): void {
    const postponed = this.getPostponedSuggestions();
    const stillValid = postponed.filter((p) => !this.isPostponeExpired(p));
    if (stillValid.length !== postponed.length) {
      this.state.update(POSTPONED_SUGGESTIONS_KEY, stillValid);
    }
  }

  /**
   * Get folders eligible for suggestion
   */
  getSuggestibleFolders(config: SuggestionConfig): WorkspaceHistoryEntry[] {
    if (!config.enabled) {
      return [];
    }

    this.cleanupExpiredPostponements();

    const now = Date.now();
    const periodStart = now - config.timePeriodDays * 24 * 60 * 60 * 1000;

    const ignoredPaths = createNormalizedPathSet(this.getIgnoredPaths());
    const postponedPaths = createNormalizedPathSet(
      this.getPostponedSuggestions()
        .filter((s) => !this.isPostponeExpired(s))
        .map((s) => s.path)
    );
    const savedProjects = this.savedProjectsService.getSavedProjects();

    // Get all known project paths: saved + scanned + tagged-out-of-tree.
    // The metadata key list catches paths the user has tagged that aren't in
    // the current scan roots — under the "tag = marked" model they should be
    // treated as known and never re-suggested.
    const scannedPaths = this.getAllProjectPaths();
    const taggedPaths = this.metadataService.getTaggedPaths();
    const allKnownPaths = createNormalizedPathSet([
      ...savedProjects.map((p) => p.path),
      ...scannedPaths,
      ...taggedPaths,
    ]);

    // Get frequent folders from history service
    const frequentFolders = this.historyService.getFrequentFolders(
      config.minOpenCount
    );

    return frequentFolders.filter((entry) => {
      // Not already a known project (saved or scanned)
      if (normalizedSetHas(allKnownPaths, entry.path)) {
        return false;
      }

      // Not ignored
      if (normalizedSetHas(ignoredPaths, entry.path)) {
        return false;
      }

      // Not postponed (and not expired)
      if (normalizedSetHas(postponedPaths, entry.path)) {
        return false;
      }

      // Last opened should be within the period for relevance
      if (entry.lastOpened < periodStart) {
        return false;
      }

      // Folder must exist
      if (!fs.existsSync(entry.path)) {
        return false;
      }

      // Skip worktrees
      if (isWorktreePath(entry.path)) {
        return false;
      }

      // Skip .worktrees directories
      if (entry.path.includes('.worktrees')) {
        return false;
      }

      return true;
    });
  }

  /**
   * Check if current workspace should trigger a suggestion
   */
  checkCurrentWorkspace(
    config: SuggestionConfig
  ): WorkspaceHistoryEntry | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const currentPath = normalizePath(workspaceFolders[0].uri.fsPath);
    const suggestible = this.getSuggestibleFolders(config);

    return suggestible.find((entry) => normalizePath(entry.path) === currentPath) || null;
  }

  /**
   * Show the suggestion notification
   */
  async showSuggestion(entry: WorkspaceHistoryEntry): Promise<void> {
    // Don't show if already shown this session
    if (this.shownThisSession.has(entry.path)) {
      return;
    }

    // Re-check known-ness — covers race where state changed since the entry
    // was added to the suggestible list (e.g. user just tagged it).
    if (this.savedProjectsService.isMarked(entry.path, this.metadataService)) {
      return;
    }
    const scannedPathSet = createNormalizedPathSet(this.getAllProjectPaths());
    if (normalizedSetHas(scannedPathSet, entry.path)) {
      return;
    }

    this.shownThisSession.add(entry.path);

    const folderName = path.basename(entry.path);

    const result = await vscode.window.showInformationMessage(
      `You've opened "${folderName}" ${entry.openCount} times. Save it to your projects?`,
      "Save",
      "Later",
      "Ignore"
    );

    switch (result) {
      case "Save":
        this.savedProjectsService.saveProject(entry.path);
        // Clean up any postponed entry
        this.unpostponePath(entry.path);
        // Refresh tree view
        void this.store.refresh();
        break;
      case "Later":
        this.postponeSuggestion(entry.path);
        break;
      case "Ignore":
        this.ignorePath(entry.path);
        break;
      // undefined = dismissed by clicking away, do nothing
    }
  }

  /**
   * Reset all suggestion data
   */
  resetAll(): void {
    this.state.update(IGNORED_SUGGESTIONS_KEY, []);
    this.state.update(POSTPONED_SUGGESTIONS_KEY, []);
    this.shownThisSession.clear();
  }
}
