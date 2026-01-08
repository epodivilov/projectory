import type * as vscode from 'vscode';

/**
 * Represents a project found in the file system
 */
export interface Project {
	name: string;
	path: string;
	uri: vscode.Uri;
	lastModified?: Date;
	isGitRepo?: boolean;
	worktrees?: Worktree[];
	hasWorktrees?: boolean;
}

/**
 * Represents a git worktree
 */
export interface Worktree {
	name: string;
	path: string;
	branch: string;
	isMain: boolean;
	commit?: string;
}

/**
 * Git repository information
 */
export interface GitInfo {
	branch?: string;
	remoteUrl?: string;
	hasUncommittedChanges?: boolean;
}

/**
 * Unified item for Details panel (Project or RecentFolder)
 */
export interface DetailItem {
	name: string;
	path: string;
	lastOpened?: number;
	gitInfo?: GitInfo;
	isProject?: boolean;
	isSaved?: boolean;
	displayName?: string;
	description?: string;
}

/**
 * Manually saved project (non-git folder)
 */
export interface SavedProject {
	name: string;
	path: string;
	savedAt: number;
	displayName?: string;
	description?: string;
}

/**
 * A folder suggestion that was postponed by the user
 */
export interface PostponedSuggestion {
	path: string;
	postponedAt: number;
}

/**
 * Represents a recently opened folder
 */
export interface RecentFolder {
	name: string;
	path: string;
	uri: vscode.Uri;
	lastOpened?: number;
	openCount?: number;
	isGitRepo?: boolean;
}

/**
 * Sort order for projects
 */
export type SortOrder = 'recent' | 'alphabetical';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * View mode for projects tree
 */
export type ViewMode = 'flat' | 'byTags';

/**
 * Project tag for organization
 * Tags have priority levels for hierarchical grouping
 * Stored in VS Code config as Record<string, number> (name -> priority)
 */
export interface ProjectTag {
	name: string;
	priority: number; // 0 = top level, 1 = second level, etc.
}

/**
 * Metadata linking projects to tags
 */
export interface ProjectMetadata {
	tagIds: string[];
}

/**
 * Extension configuration
 */
export interface ProjectoryConfig {
	rootFolder: string;
	excludePatterns: string[];
	maxScanDepth: number;
	showRecentFolders: boolean;
	sortOrder: SortOrder;
	sortDirection: SortDirection;
	viewMode: ViewMode;
	groupingDepth: number;
	suggestFrequentFolders: boolean;
	suggestMinOpenCount: number;
	suggestTimePeriodDays: number;
}

/**
 * Message sent between extension and webview
 */
export interface WebviewMessage {
	command: string;
	payload?: unknown;
}

