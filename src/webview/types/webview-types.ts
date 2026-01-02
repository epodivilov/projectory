/**
 * Project data for webview (without vscode.Uri)
 */
export interface WebviewProject {
	name: string;
	path: string;
	lastModified?: number;
	isGitRepo?: boolean;
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
 * Unified item for Details panel
 */
export interface DetailItem {
	name: string;
	path: string;
	lastOpened?: number;
	gitInfo?: GitInfo;
	isProject?: boolean;
	isSaved?: boolean;
}

/**
 * Base message structure
 */
export interface WebviewMessage<T = unknown> {
	command: string;
	payload?: T;
}

/**
 * Message payloads for Details View
 */
export interface OpenProjectPayload {
	path: string;
	newWindow: boolean;
}
export interface DetailUpdatePayload {
	detail: DetailItem;
}

export interface SaveProjectPayload {
	path: string;
}

export interface DeleteProjectPayload {
	path: string;
	isSaved: boolean;
}

/**
 * Custom event detail types
 */
export interface ProjectClickDetail {
	path: string;
	newWindow: boolean;
}

export interface SearchChangeDetail {
	value: string;
}
