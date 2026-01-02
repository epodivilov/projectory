import * as vscode from 'vscode';
import type { ProjectTag } from '../types';

/**
 * Tags storage format in VS Code configuration
 * Key = tag name, Value = priority level (0 = primary, 1 = secondary, etc.)
 */
type TagsConfig = Record<string, number>;

/**
 * Service for managing project tags
 * Tags are stored in VS Code configuration (projectory.tags)
 * Format: { "Frontend": 0, "Backend": 0, "React": 1, "Vue": 1 }
 */
export class TagService {
	/**
	 * Get tags from VS Code configuration
	 */
	private getTagsConfig(): TagsConfig {
		const config = vscode.workspace.getConfiguration('projectory');
		return config.get<TagsConfig>('tags', {});
	}

	/**
	 * Save tags to VS Code configuration
	 */
	private async saveTagsConfig(tags: TagsConfig): Promise<void> {
		const config = vscode.workspace.getConfiguration('projectory');
		await config.update('tags', tags, vscode.ConfigurationTarget.Global);
	}

	/**
	 * Get all tags as ProjectTag array
	 */
	getTags(): ProjectTag[] {
		const config = this.getTagsConfig();
		return Object.entries(config).map(([name, priority]) => ({
			name,
			priority
		}));
	}

	/**
	 * Get a tag by name
	 */
	getTag(name: string): ProjectTag | undefined {
		const config = this.getTagsConfig();
		const priority = config[name];
		if (priority === undefined) {
			return undefined;
		}
		return { name, priority };
	}

	/**
	 * Get tags by priority level
	 */
	getTagsByPriority(priority: number): ProjectTag[] {
		return this.getTags()
			.filter((t) => t.priority === priority)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Get all unique priority levels (sorted)
	 */
	getPriorityLevels(): number[] {
		const levels = new Set(this.getTags().map((t) => t.priority));
		return Array.from(levels).sort((a, b) => a - b);
	}

	/**
	 * Get maximum priority level used
	 */
	getMaxPriority(): number {
		const tags = this.getTags();
		if (tags.length === 0) {
			return -1;
		}
		return Math.max(...tags.map((t) => t.priority));
	}

	/**
	 * Create a new tag
	 */
	async createTag(name: string, priority: number): Promise<ProjectTag> {
		const config = this.getTagsConfig();
		const trimmedName = name.trim();

		// Return existing tag if already exists
		if (config[trimmedName] !== undefined) {
			return { name: trimmedName, priority: config[trimmedName] };
		}

		config[trimmedName] = priority;
		await this.saveTagsConfig(config);

		return { name: trimmedName, priority };
	}

	/**
	 * Rename a tag
	 * Returns the new tag name for updating references
	 */
	async renameTag(oldName: string, newName: string): Promise<string> {
		const config = this.getTagsConfig();
		const trimmedNewName = newName.trim();

		if (config[oldName] === undefined) {
			return oldName;
		}

		const priority = config[oldName];
		delete config[oldName];
		config[trimmedNewName] = priority;
		await this.saveTagsConfig(config);

		return trimmedNewName;
	}

	/**
	 * Update tag priority
	 */
	async updatePriority(name: string, priority: number): Promise<void> {
		const config = this.getTagsConfig();

		if (config[name] !== undefined) {
			config[name] = priority;
			await this.saveTagsConfig(config);
		}
	}

	/**
	 * Delete a tag
	 */
	async deleteTag(name: string): Promise<void> {
		const config = this.getTagsConfig();
		delete config[name];
		await this.saveTagsConfig(config);
	}

	/**
	 * Find a tag by name (alias for getTag for backward compatibility)
	 */
	findByName(name: string): ProjectTag | undefined {
		return this.getTag(name);
	}

	/**
	 * Check if a tag exists
	 */
	exists(name: string): boolean {
		const config = this.getTagsConfig();
		return config[name] !== undefined;
	}

	/**
	 * Reset all tags (clear everything)
	 */
	async resetAll(): Promise<void> {
		await this.saveTagsConfig({});
	}
}
