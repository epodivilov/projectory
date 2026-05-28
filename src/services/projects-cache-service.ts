import * as vscode from 'vscode';

const CACHE_KEY = 'projectory.scannedProjectsCache';

/**
 * Minimum subset of a Project that we persist between sessions.
 * `uri` is rebuilt from `path` on load; `worktrees` are filled in by the
 * background scan once it completes.
 */
export interface CachedProject {
	path: string;
	name: string;
	isGitRepo: boolean;
	hasWorktrees: boolean;
}

/**
 * Persists the last successful scan result in globalState so the panel can
 * paint a full tree (with tags and groupings) on cold start instead of waiting
 * for a fresh disk scan.
 */
export class ProjectsCacheService {
	constructor(private readonly globalState: vscode.Memento) {}

	get(): CachedProject[] {
		return this.globalState.get<CachedProject[]>(CACHE_KEY, []);
	}

	async save(projects: CachedProject[]): Promise<void> {
		await this.globalState.update(CACHE_KEY, projects);
	}

	async clear(): Promise<void> {
		await this.globalState.update(CACHE_KEY, undefined);
	}
}
