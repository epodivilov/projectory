import type * as vscode from 'vscode';
import type { SavedProject, ProjectMetadata, PostponedSuggestion } from '../types';
import type { WorkspaceHistoryEntry } from '../services/workspace-history-service';
import type { CachedProject } from '../services/projects-cache-service';

const DEBOUNCE_MS = 300;

export interface StateSchema {
	savedProjects: SavedProject[];
	excludedPaths: string[];
	projectMetadata: Record<string, ProjectMetadata>;
	workspaceHistory: Record<string, WorkspaceHistoryEntry>;
	treeExpandState: Record<string, boolean>;
	'projectory.scannedProjectsCache': CachedProject[];
	ignoredSuggestionPaths: string[];
	postponedSuggestions: PostponedSuggestion[];
}

export class StateStore {
	private readonly cache = new Map<keyof StateSchema, unknown>();
	private readonly dirty = new Set<keyof StateSchema>();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private writeChain: Promise<void> = Promise.resolve();

	constructor(private readonly memento: vscode.Memento) {}

	get<K extends keyof StateSchema>(key: K): StateSchema[K] | undefined;
	get<K extends keyof StateSchema>(key: K, defaultValue: StateSchema[K]): StateSchema[K];
	get<K extends keyof StateSchema>(key: K, defaultValue?: StateSchema[K]): StateSchema[K] | undefined {
		if (!this.cache.has(key)) {
			const persisted = this.memento.get<StateSchema[K]>(key);
			this.cache.set(key, persisted);
		}
		const cached = this.cache.get(key) as StateSchema[K] | undefined;
		if (cached === undefined) {
			return defaultValue;
		}
		return cached;
	}

	update<K extends keyof StateSchema>(key: K, value: StateSchema[K] | undefined): void {
		this.cache.set(key, value);
		this.dirty.add(key);
		this.scheduleDebounce();
	}

	flush(): Promise<void> {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.enqueuePersist();
		return this.writeChain;
	}

	private scheduleDebounce(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			this.enqueuePersist();
		}, DEBOUNCE_MS);
	}

	private enqueuePersist(): void {
		if (this.dirty.size === 0) {
			return;
		}
		const keys = [...this.dirty] as (keyof StateSchema)[];
		this.dirty.clear();

		this.writeChain = this.writeChain.then(async () => {
			for (const key of keys) {
				const value = this.cache.get(key) as StateSchema[typeof key] | undefined;
				try {
					await this.memento.update(key, value);
				} catch (err) {
					console.error(`StateStore: failed to persist key "${key}":`, err);
				}
			}
		});
	}
}
