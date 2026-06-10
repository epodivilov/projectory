import * as vscode from 'vscode';
import { getConfig } from '../services/configuration-service';
import { invalidateCache } from '../git/git-service';
import type { ProjectStore } from './project-store';

const DEBOUNCE_MS = 2000;

export class ScanWatcher implements vscode.Disposable {
	private _rootWatcher?: vscode.FileSystemWatcher;
	private _worktreeWatchers: vscode.FileSystemWatcher[] = [];
	/** Sorted paths of repos currently being watched for worktree changes. */
	private _watchedRepoPaths: string[] = [];
	private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _storeSubscription?: vscode.Disposable;
	private _disposed = false;

	constructor(private readonly store: ProjectStore) {}

	start(): void {
		this._setupRootWatcher();
		this._storeSubscription = this.store.onDidChange((change) => {
			if (change.kind === 'reset') {
				this._rebuildWorktreeWatchers();
			}
		});
		this._rebuildWorktreeWatchers();
	}

	private _setupRootWatcher(): void {
		const rootFolder = getConfig().rootFolder;

		// Dispose existing root watcher
		this._rootWatcher?.dispose();
		this._rootWatcher = undefined;

		if (!rootFolder) {
			return;
		}

		this._rootWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(rootFolder, '{*,*/*}')
		);
		this._rootWatcher.onDidCreate(() => this._scheduleRescan());
		this._rootWatcher.onDidDelete(() => this._scheduleRescan());
	}

	private _rebuildWorktreeWatchers(): void {
		if (this._disposed) {
			return;
		}

		const newPaths = this.store
			.getProjects()
			.filter((p) => p.isGitRepo === true)
			.map((p) => p.path)
			.sort();

		// Skip the expensive dispose+recreate cycle when the watched set is unchanged.
		// reconcileMarkers fires a reset on every save/remove/tag without touching
		// the project set, so this guard eliminates redundant watcher churn.
		if (
			newPaths.length === this._watchedRepoPaths.length &&
			newPaths.every((p, i) => p === this._watchedRepoPaths[i])
		) {
			return;
		}

		for (const w of this._worktreeWatchers) {
			w.dispose();
		}
		this._worktreeWatchers = [];
		this._watchedRepoPaths = newPaths;

		for (const project of this.store.getProjects()) {
			if (project.isGitRepo === true) {
				const watcher = vscode.workspace.createFileSystemWatcher(
					new vscode.RelativePattern(project.path, '.git/worktrees/*')
				);
				watcher.onDidCreate(() => {
					invalidateCache(project.path);
					this._scheduleRescan();
				});
				watcher.onDidDelete(() => {
					invalidateCache(project.path);
					this._scheduleRescan();
				});
				this._worktreeWatchers.push(watcher);
			}
		}
	}

	private _scheduleRescan(): void {
		if (this._disposed) {
			return;
		}

		if (this._debounceTimer !== null) {
			clearTimeout(this._debounceTimer);
		}

		this._debounceTimer = setTimeout(() => {
			this._debounceTimer = null;
			void this.store.rescan().catch((err) => console.error('ScanWatcher rescan failed:', err));
		}, DEBOUNCE_MS);
	}

	reconfigureRoot(): void {
		this._setupRootWatcher();
	}

	dispose(): void {
		this._disposed = true;

		if (this._debounceTimer !== null) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = null;
		}

		this._rootWatcher?.dispose();
		this._rootWatcher = undefined;

		for (const w of this._worktreeWatchers) {
			w.dispose();
		}
		this._worktreeWatchers = [];
		this._watchedRepoPaths = [];

		this._storeSubscription?.dispose();
		this._storeSubscription = undefined;
	}
}
