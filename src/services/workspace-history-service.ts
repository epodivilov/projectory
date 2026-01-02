import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { RecentFolder, Project, SortOrder, SortDirection } from '../types';
import { isWorktreePath } from './git-info-service';

const WORKSPACE_HISTORY_KEY = 'workspaceHistory';
const MAX_HISTORY_ENTRIES = 100;

/**
 * Entry in workspace history
 */
export interface WorkspaceHistoryEntry {
	path: string;
	lastOpened: number;
	openCount: number;
	firstOpened: number;
}

/**
 * Unified service for tracking workspace history.
 */
export class WorkspaceHistoryService {
	constructor(private readonly globalState: vscode.Memento) {}

	/**
	 * Record current workspace as opened.
	 * Call this in extension activate() to track when VS Code opens a folder.
	 * Skips recording for worktrees.
	 */
	recordCurrentWorkspace(): void {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		// Record the first workspace folder (main folder)
		const mainFolder = workspaceFolders[0];
		const folderPath = mainFolder.uri.fsPath;

		// Skip recording for worktrees
		if (isWorktreePath(folderPath)) {
			return;
		}

		this.recordOpen(folderPath);
	}

	/**
	 * Record that a folder was opened.
	 * Skips recording for worktrees.
	 */
	recordOpen(folderPath: string): void {
		// Skip recording for worktrees
		if (isWorktreePath(folderPath)) {
			return;
		}

		const history = this.getHistory();
		const now = Date.now();

		const existing = history[folderPath];
		if (existing) {
			existing.lastOpened = now;
			existing.openCount += 1;
		} else {
			history[folderPath] = {
				path: folderPath,
				lastOpened: now,
				openCount: 1,
				firstOpened: now
			};
		}

		// Prune old entries if exceeds max
		this.pruneHistory(history);

		this.globalState.update(WORKSPACE_HISTORY_KEY, history);
	}

	/**
	 * Remove a folder from history
	 */
	removeFromHistory(folderPath: string): void {
		const history = this.getHistory();
		delete history[folderPath];
		this.globalState.update(WORKSPACE_HISTORY_KEY, history);
	}

	/**
	 * Get all history entries sorted by lastOpened (most recent first)
	 */
	getHistorySorted(): WorkspaceHistoryEntry[] {
		const history = this.getHistory();
		return Object.values(history).sort((a, b) => b.lastOpened - a.lastOpened);
	}

	/**
	 * Get recent folders excluding projects.
	 * Returns folders sorted by lastOpened (most recent first).
	 * Also removes non-existing paths from history.
	 */
	getRecentFolders(excludeProjects: Project[]): RecentFolder[] {
		const history = this.getHistorySorted();
		const projectPaths = new Set(excludeProjects.map((p) => p.path));
		const projectNames = new Set(excludeProjects.map((p) => p.name));

		const folders: RecentFolder[] = [];
		const pathsToRemove: string[] = [];

		for (const entry of history) {
			// Skip and mark for removal if path doesn't exist
			if (!fs.existsSync(entry.path)) {
				pathsToRemove.push(entry.path);
				continue;
			}

			// Skip if it's a project
			if (projectPaths.has(entry.path)) {
				continue;
			}

			// Skip if it's a subfolder of a project
			let isSubfolder = false;
			for (const projectPath of projectPaths) {
				if (entry.path.startsWith(projectPath + path.sep)) {
					isSubfolder = true;
					break;
				}
			}
			if (isSubfolder) {
				continue;
			}

			// Skip worktrees
			if (entry.path.includes('.worktrees')) {
				const parts = entry.path.split(path.sep);
				let isWorktree = false;
				for (const part of parts) {
					if (part.endsWith('.worktrees')) {
						const baseName = part.replace('.worktrees', '');
						if (projectNames.has(baseName)) {
							isWorktree = true;
							break;
						}
					}
				}
				if (isWorktree) {
					continue;
				}
			}

			folders.push({
				name: path.basename(entry.path),
				path: entry.path,
				uri: vscode.Uri.file(entry.path),
				lastOpened: entry.lastOpened,
				openCount: entry.openCount
			});
		}

		// Clean up non-existing paths from history
		for (const pathToRemove of pathsToRemove) {
			this.removeFromHistory(pathToRemove);
		}

		return folders;
	}

	/**
	 * Sort projects by recently opened (most recent first)
	 */
	sortProjectsByRecent(projects: Project[]): Project[] {
		const history = this.getHistory();
		return [...projects].sort((a, b) => {
			const timeA = history[a.path]?.lastOpened ?? 0;
			const timeB = history[b.path]?.lastOpened ?? 0;
			return timeB - timeA;
		});
	}

	/**
	 * Sort projects alphabetically by name (case-insensitive)
	 */
	sortProjectsByName(projects: Project[]): Project[] {
		return [...projects].sort((a, b) =>
			a.name.toLowerCase().localeCompare(b.name.toLowerCase())
		);
	}

	/**
	 * Sort projects by the specified sort order and direction
	 */
	sortProjects(projects: Project[], sortOrder: SortOrder, sortDirection: SortDirection = 'desc'): Project[] {
		let sorted: Project[];
		let needsReverse: boolean;

		switch (sortOrder) {
			case 'alphabetical':
				// sortProjectsByName returns A→Z (ascending)
				sorted = this.sortProjectsByName(projects);
				needsReverse = sortDirection === 'desc'; // reverse for Z→A
				break;
			case 'recent':
			default:
				// sortProjectsByRecent returns newest first (descending)
				sorted = this.sortProjectsByRecent(projects);
				needsReverse = sortDirection === 'asc'; // reverse for oldest first
				break;
		}
		return needsReverse ? sorted.reverse() : sorted;
	}

	/**
	 * Get last opened timestamp for a path
	 */
	getLastOpened(folderPath: string): number | undefined {
		const history = this.getHistory();
		return history[folderPath]?.lastOpened;
	}

	/**
	 * Get history entry for a specific path
	 */
	getEntry(folderPath: string): WorkspaceHistoryEntry | undefined {
		const history = this.getHistory();
		return history[folderPath];
	}

	/**
	 * Initialize a history entry with a custom timestamp if no entry exists.
	 * Used to set initial lastOpened from git commit date for newly discovered projects.
	 * Does NOT overwrite existing entries.
	 *
	 * @returns true if entry was created, false if entry already existed
	 */
	initializeTimestamp(folderPath: string, timestamp: number): boolean {
		const history = this.getHistory();

		if (history[folderPath]) {
			return false;
		}

		history[folderPath] = {
			path: folderPath,
			lastOpened: timestamp,
			openCount: 0,
			firstOpened: timestamp
		};

		this.globalState.update(WORKSPACE_HISTORY_KEY, history);
		return true;
	}

	/**
	 * Get frequently opened folders (for suggesting to save as projects)
	 * Returns folders opened more than threshold times
	 */
	getFrequentFolders(minOpenCount: number = 3): WorkspaceHistoryEntry[] {
		return this.getHistorySorted().filter((entry) => entry.openCount >= minOpenCount);
	}

	/**
	 * Clear all history
	 */
	clearHistory(): void {
		this.globalState.update(WORKSPACE_HISTORY_KEY, {});
	}

	/**
	 * Get raw history map
	 */
	private getHistory(): Record<string, WorkspaceHistoryEntry> {
		return this.globalState.get<Record<string, WorkspaceHistoryEntry>>(WORKSPACE_HISTORY_KEY, {});
	}

	/**
	 * Prune history to keep only MAX_HISTORY_ENTRIES most recent entries
	 */
	private pruneHistory(history: Record<string, WorkspaceHistoryEntry>): void {
		const entries = Object.values(history);
		if (entries.length <= MAX_HISTORY_ENTRIES) {
			return;
		}

		// Sort by lastOpened descending
		entries.sort((a, b) => b.lastOpened - a.lastOpened);

		// Remove oldest entries
		const toRemove = entries.slice(MAX_HISTORY_ENTRIES);
		for (const entry of toRemove) {
			delete history[entry.path];
		}
	}
}
