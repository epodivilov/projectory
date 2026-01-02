import * as vscode from 'vscode';
import * as path from 'path';
import type { Project, ProjectoryConfig } from '../types';
import { getWorktrees } from './git-info-service';

/**
 * Scan for projects in root folder
 */
export async function scanProjects(config: ProjectoryConfig): Promise<Project[]> {
	const { rootFolder, excludePatterns, maxScanDepth } = config;

	if (!rootFolder) {
		return [];
	}

	const rootUri = vscode.Uri.file(rootFolder);
	const projects: Project[] = [];

	await scanDirectory(rootUri, projects, excludePatterns, maxScanDepth, 0);

	return projects.sort((a, b) => a.name.localeCompare(b.name));
}

async function scanDirectory(
	uri: vscode.Uri,
	projects: Project[],
	excludePatterns: string[],
	maxDepth: number,
	currentDepth: number
): Promise<void> {
	if (currentDepth > maxDepth) {
		return;
	}

	try {
		const entries = await vscode.workspace.fs.readDirectory(uri);

		// Check for .git entry
		const gitEntry = entries.find(([name]) => name === '.git');
		const hasGitDir = gitEntry && gitEntry[1] === vscode.FileType.Directory;
		const hasGitFile = gitEntry && gitEntry[1] === vscode.FileType.File;

		// Skip linked worktrees (they have .git as a file, not directory)
		// They will be discovered through the main repo's git worktree list
		if (hasGitFile) {
			return;
		}

		// This is a main git repository
		if (hasGitDir) {
			const project = await createProjectWithWorktrees(uri);
			projects.push(project);
			return; // Don't scan subdirectories of a project
		}

		// Scan subdirectories
		for (const [name, type] of entries) {
			if (type !== vscode.FileType.Directory) {
				continue;
			}
			if (shouldExclude(name, excludePatterns)) {
				continue;
			}

			const subUri = vscode.Uri.joinPath(uri, name);
			await scanDirectory(subUri, projects, excludePatterns, maxDepth, currentDepth + 1);
		}
	} catch (error) {
		console.error(`Error scanning ${uri.fsPath}:`, error);
	}
}

function shouldExclude(name: string, patterns: string[]): boolean {
	return patterns.some((pattern) => {
		if (pattern.includes('*')) {
			const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
			return regex.test(name);
		}
		return name === pattern;
	});
}

async function createProjectWithWorktrees(uri: vscode.Uri): Promise<Project> {
	const name = path.basename(uri.fsPath);
	const allWorktrees = await getWorktrees(uri.fsPath);
	const linkedWorktrees = allWorktrees.filter((w) => !w.isMain);
	const hasLinkedWorktrees = linkedWorktrees.length > 0;

	return {
		name,
		path: uri.fsPath,
		uri,
		isGitRepo: true,
		worktrees: hasLinkedWorktrees ? allWorktrees : undefined,
		hasWorktrees: hasLinkedWorktrees
	};
}
