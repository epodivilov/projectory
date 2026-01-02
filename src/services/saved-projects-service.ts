import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { SavedProject, Project } from '../types';

const SAVED_PROJECTS_KEY = 'savedProjects';
const EXCLUDED_PATHS_KEY = 'excludedPaths';

/**
 * Service for managing manually saved projects and excluded paths
 */
export class SavedProjectsService {
	constructor(private readonly globalState: vscode.Memento) {}

	getSavedProjects(): SavedProject[] {
		const saved = this.globalState.get<SavedProject[]>(SAVED_PROJECTS_KEY, []);
		return saved.filter((p) => fs.existsSync(p.path));
	}

	saveProject(folderPath: string): void {
		const saved = this.getSavedProjects();
		if (saved.some((p) => p.path === folderPath)) {
			return;
		}

		saved.push({
			name: path.basename(folderPath),
			path: folderPath,
			savedAt: Date.now()
		});
		this.globalState.update(SAVED_PROJECTS_KEY, saved);
		this.unexcludePath(folderPath);
	}

	removeSavedProject(folderPath: string): void {
		const saved = this.getSavedProjects();
		this.globalState.update(SAVED_PROJECTS_KEY, saved.filter((p) => p.path !== folderPath));
	}

	isSaved(folderPath: string): boolean {
		return this.getSavedProjects().some((p) => p.path === folderPath);
	}

	toProjects(): Project[] {
		return this.getSavedProjects().map((saved) => ({
			name: saved.name,
			path: saved.path,
			uri: vscode.Uri.file(saved.path)
		}));
	}

	getExcludedPaths(): string[] {
		return this.globalState.get<string[]>(EXCLUDED_PATHS_KEY, []);
	}

	excludePath(folderPath: string): void {
		const excluded = this.getExcludedPaths();
		if (!excluded.includes(folderPath)) {
			excluded.push(folderPath);
			this.globalState.update(EXCLUDED_PATHS_KEY, excluded);
		}
	}

	unexcludePath(folderPath: string): void {
		const excluded = this.getExcludedPaths();
		this.globalState.update(EXCLUDED_PATHS_KEY, excluded.filter((p) => p !== folderPath));
	}

	isExcluded(folderPath: string): boolean {
		return this.getExcludedPaths().includes(folderPath);
	}

	clearExcludedPaths(): void {
		this.globalState.update(EXCLUDED_PATHS_KEY, []);
	}

	resetAll(): void {
		this.globalState.update(SAVED_PROJECTS_KEY, []);
		this.globalState.update(EXCLUDED_PATHS_KEY, []);
	}
}
