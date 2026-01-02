import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { PostponedSuggestion } from '../types';
import type { SuggestionConfig } from './configuration-service';
import type { WorkspaceHistoryService, WorkspaceHistoryEntry } from './workspace-history-service';
import type { SavedProjectsService } from './saved-projects-service';
import { isWorktreePath } from './git-info-service';

const IGNORED_SUGGESTIONS_KEY = 'ignoredSuggestionPaths';
const POSTPONED_SUGGESTIONS_KEY = 'postponedSuggestions';
const POSTPONE_DURATION_DAYS = 7;

/**
 * Service for managing folder save suggestions
 */
export class SuggestionService {
	private shownThisSession = new Set<string>();

	constructor(
		private readonly globalState: vscode.Memento,
		private readonly historyService: WorkspaceHistoryService,
		private readonly savedProjectsService: SavedProjectsService
	) {}

	/**
	 * Get permanently ignored paths
	 */
	getIgnoredPaths(): string[] {
		return this.globalState.get<string[]>(IGNORED_SUGGESTIONS_KEY, []);
	}

	/**
	 * Permanently ignore a path
	 */
	ignorePath(folderPath: string): void {
		const ignored = this.getIgnoredPaths();
		if (!ignored.includes(folderPath)) {
			ignored.push(folderPath);
			this.globalState.update(IGNORED_SUGGESTIONS_KEY, ignored);
		}
	}

	/**
	 * Remove a path from ignored list
	 */
	unignorePath(folderPath: string): void {
		const ignored = this.getIgnoredPaths();
		const filtered = ignored.filter((p) => p !== folderPath);
		this.globalState.update(IGNORED_SUGGESTIONS_KEY, filtered);
	}

	/**
	 * Get postponed suggestions
	 */
	getPostponedSuggestions(): PostponedSuggestion[] {
		return this.globalState.get<PostponedSuggestion[]>(POSTPONED_SUGGESTIONS_KEY, []);
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
			postponedAt: Date.now()
		});
		this.globalState.update(POSTPONED_SUGGESTIONS_KEY, filtered);
	}

	/**
	 * Remove a path from postponed list
	 */
	unpostponePath(folderPath: string): void {
		const postponed = this.getPostponedSuggestions();
		const filtered = postponed.filter((p) => p.path !== folderPath);
		this.globalState.update(POSTPONED_SUGGESTIONS_KEY, filtered);
	}

	/**
	 * Check if a postponed suggestion has expired
	 */
	private isPostponeExpired(suggestion: PostponedSuggestion): boolean {
		const expireTime = suggestion.postponedAt + POSTPONE_DURATION_DAYS * 24 * 60 * 60 * 1000;
		return Date.now() > expireTime;
	}

	/**
	 * Clean up expired postponements
	 */
	cleanupExpiredPostponements(): void {
		const postponed = this.getPostponedSuggestions();
		const stillValid = postponed.filter((p) => !this.isPostponeExpired(p));
		if (stillValid.length !== postponed.length) {
			this.globalState.update(POSTPONED_SUGGESTIONS_KEY, stillValid);
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

		const ignoredPaths = new Set(this.getIgnoredPaths());
		const postponedPaths = new Set(
			this.getPostponedSuggestions()
				.filter((s) => !this.isPostponeExpired(s))
				.map((s) => s.path)
		);
		const savedProjects = this.savedProjectsService.getSavedProjects();
		const savedPaths = new Set(savedProjects.map((p) => p.path));

		// Get frequent folders from history service
		const frequentFolders = this.historyService.getFrequentFolders(config.minOpenCount);

		return frequentFolders.filter((entry) => {
			// Not already saved
			if (savedPaths.has(entry.path)) {
				return false;
			}

			// Not ignored
			if (ignoredPaths.has(entry.path)) {
				return false;
			}

			// Not postponed (and not expired)
			if (postponedPaths.has(entry.path)) {
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

			return true;
		});
	}

	/**
	 * Check if current workspace should trigger a suggestion
	 */
	checkCurrentWorkspace(config: SuggestionConfig): WorkspaceHistoryEntry | null {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return null;
		}

		const currentPath = workspaceFolders[0].uri.fsPath;
		const suggestible = this.getSuggestibleFolders(config);

		return suggestible.find((entry) => entry.path === currentPath) || null;
	}

	/**
	 * Show the suggestion notification
	 */
	async showSuggestion(entry: WorkspaceHistoryEntry): Promise<void> {
		// Don't show if already shown this session
		if (this.shownThisSession.has(entry.path)) {
			return;
		}
		this.shownThisSession.add(entry.path);

		const folderName = path.basename(entry.path);

		const result = await vscode.window.showInformationMessage(
			`You've opened "${folderName}" ${entry.openCount} times. Save it to your projects?`,
			'Save',
			'Later',
			'Ignore'
		);

		switch (result) {
			case 'Save':
				this.savedProjectsService.saveProject(entry.path);
				// Clean up any postponed entry
				this.unpostponePath(entry.path);
				// Refresh tree view
				vscode.commands.executeCommand('projectory.refreshProjects');
				break;
			case 'Later':
				this.postponeSuggestion(entry.path);
				break;
			case 'Ignore':
				this.ignorePath(entry.path);
				break;
			// undefined = dismissed by clicking away, do nothing
		}
	}

	/**
	 * Reset all suggestion data
	 */
	resetAll(): void {
		this.globalState.update(IGNORED_SUGGESTIONS_KEY, []);
		this.globalState.update(POSTPONED_SUGGESTIONS_KEY, []);
		this.shownThisSession.clear();
	}
}
