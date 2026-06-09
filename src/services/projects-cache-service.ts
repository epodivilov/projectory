import type { StateStore } from '../core/state-store';

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
	constructor(private readonly state: StateStore) {}

	get(): CachedProject[] {
		// `??` rather than the second arg to `.get`: vscode's real Memento returns
		// `undefined` (not the default) for keys that were explicitly cleared via
		// `update(key, undefined)`.
		return this.state.get(CACHE_KEY) ?? [];
	}

	async save(projects: CachedProject[]): Promise<void> {
		this.state.update(CACHE_KEY, projects);
	}

	async clear(): Promise<void> {
		this.state.update(CACHE_KEY, undefined);
	}
}
