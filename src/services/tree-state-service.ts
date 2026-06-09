import type { StateStore } from '../core/state-store';

const TREE_EXPAND_STATE_KEY = 'treeExpandState';

/**
 * Persists tree view expand/collapse state across sessions.
 *
 * State is keyed by stable tree item id and only records nodes the user has
 * explicitly toggled. Untouched nodes — and dynamically added ones — keep the
 * default collapsible state assigned in their constructor, so the tree still
 * opens sensibly on first run and adapts as projects come and go.
 */
export class TreeStateService {
	constructor(private readonly state: StateStore) {}

	/**
	 * Get the stored expand state for a node id.
	 *
	 * @returns true/false if the user has toggled this node before,
	 *          undefined if it should fall back to its default state.
	 */
	isExpanded(id: string): boolean | undefined {
		return this.getStored()[id];
	}

	/**
	 * Record that a node was expanded (true) or collapsed (false).
	 */
	setExpanded(id: string, expanded: boolean): void {
		const stored = this.getStored();
		stored[id] = expanded;
		this.state.update(TREE_EXPAND_STATE_KEY, stored);
	}

	private getStored(): Record<string, boolean> {
		return this.state.get(TREE_EXPAND_STATE_KEY, {});
	}
}
