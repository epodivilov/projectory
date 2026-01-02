import * as vscode from 'vscode';
import type { ProjectMetadata } from '../types';

const METADATA_KEY = 'projectMetadata';

type MetadataStorage = Record<string, ProjectMetadata>;

/**
 * Service for managing project metadata (tags association)
 * Tags are now identified by name (not UUID)
 */
export class ProjectMetadataService {
	constructor(private readonly globalState: vscode.Memento) {}

	/**
	 * Get all metadata
	 */
	private getAll(): MetadataStorage {
		return this.globalState.get<MetadataStorage>(METADATA_KEY, {});
	}

	/**
	 * Save all metadata
	 */
	private saveAll(data: MetadataStorage): void {
		this.globalState.update(METADATA_KEY, data);
	}

	/**
	 * Get metadata for a project
	 */
	getMetadata(projectPath: string): ProjectMetadata {
		const all = this.getAll();
		return all[projectPath] || { tagIds: [] };
	}

	/**
	 * Get tag IDs for a project
	 */
	getTags(projectPath: string): string[] {
		return this.getMetadata(projectPath).tagIds;
	}

	/**
	 * Set tags for a project
	 */
	setTags(projectPath: string, tagIds: string[]): void {
		const all = this.getAll();

		if (tagIds.length === 0) {
			// Remove entry if no tags
			delete all[projectPath];
		} else {
			all[projectPath] = { tagIds };
		}

		this.saveAll(all);
	}

	/**
	 * Add a tag to a project
	 */
	addTag(projectPath: string, tagId: string): void {
		const tags = this.getTags(projectPath);

		if (!tags.includes(tagId)) {
			tags.push(tagId);
			this.setTags(projectPath, tags);
		}
	}

	/**
	 * Remove a tag from a project
	 */
	removeTag(projectPath: string, tagId: string): void {
		const tags = this.getTags(projectPath);
		const filtered = tags.filter((id) => id !== tagId);
		this.setTags(projectPath, filtered);
	}

	/**
	 * Check if a project has a specific tag
	 */
	hasTag(projectPath: string, tagId: string): boolean {
		return this.getTags(projectPath).includes(tagId);
	}

	/**
	 * Get all projects with a specific tag (exact match)
	 */
	getProjectsByTag(tagId: string): string[] {
		const all = this.getAll();
		return Object.entries(all)
			.filter(([, meta]) => meta.tagIds.includes(tagId))
			.map(([path]) => path);
	}

	/**
	 * Get projects that have no tags
	 */
	getUntaggedProjects(allProjectPaths: string[]): string[] {
		const all = this.getAll();
		return allProjectPaths.filter((path) => {
			const meta = all[path];
			return !meta || meta.tagIds.length === 0;
		});
	}

	/**
	 * Remove a tag from all projects (used when deleting a tag)
	 */
	clearTagFromAll(tagName: string): void {
		const all = this.getAll();
		let changed = false;

		for (const [path, meta] of Object.entries(all)) {
			const index = meta.tagIds.indexOf(tagName);
			if (index !== -1) {
				meta.tagIds.splice(index, 1);
				changed = true;

				// Remove entry if no tags left
				if (meta.tagIds.length === 0) {
					delete all[path];
				}
			}
		}

		if (changed) {
			this.saveAll(all);
		}
	}

	/**
	 * Rename a tag across all projects (used when renaming a tag)
	 */
	renameTagInAll(oldName: string, newName: string): void {
		const all = this.getAll();
		let changed = false;

		for (const meta of Object.values(all)) {
			const index = meta.tagIds.indexOf(oldName);
			if (index !== -1) {
				meta.tagIds[index] = newName;
				changed = true;
			}
		}

		if (changed) {
			this.saveAll(all);
		}
	}

	/**
	 * Clean up metadata for non-existent projects
	 */
	cleanup(existingPaths: string[]): void {
		const all = this.getAll();
		const pathSet = new Set(existingPaths);
		let changed = false;

		for (const path of Object.keys(all)) {
			if (!pathSet.has(path)) {
				delete all[path];
				changed = true;
			}
		}

		if (changed) {
			this.saveAll(all);
		}
	}

	/**
	 * Reset all metadata (clear everything)
	 */
	resetAll(): void {
		this.globalState.update(METADATA_KEY, {});
	}
}
