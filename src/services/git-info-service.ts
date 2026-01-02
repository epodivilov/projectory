import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { GitInfo, Project, Worktree } from '../types';
import * as fs from 'fs';
import type { WorkspaceHistoryService } from './workspace-history-service';

const execAsync = promisify(exec);

/**
 * Get the date of the last commit in a git repository
 * Returns Unix timestamp in milliseconds, or undefined if not available
 */
export async function getLastCommitDate(folderPath: string): Promise<number | undefined> {
	try {
		const gitPath = path.join(folderPath, '.git');
		await vscode.workspace.fs.stat(vscode.Uri.file(gitPath));

		const { stdout } = await execAsync('git log -1 --format=%ct', {
			cwd: folderPath
		});

		const unixSeconds = parseInt(stdout.trim(), 10);
		if (isNaN(unixSeconds)) {
			return undefined;
		}

		return unixSeconds * 1000;
	} catch {
		return undefined;
	}
}

/**
 * Get Git repository information for a folder
 */
export async function getGitInfo(folderPath: string): Promise<GitInfo | undefined> {
	try {
		// Check if .git directory exists
		const gitPath = path.join(folderPath, '.git');
		await vscode.workspace.fs.stat(vscode.Uri.file(gitPath));

		const info: GitInfo = {};

		// Get current branch
		try {
			const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
				cwd: folderPath
			});
			info.branch = stdout.trim();
		} catch {
			// Ignore errors (detached HEAD, etc.)
		}

		// Get remote origin URL
		try {
			const { stdout } = await execAsync('git config --get remote.origin.url', {
				cwd: folderPath
			});
			info.remoteUrl = stdout.trim();
		} catch {
			// No remote configured
		}

		// Check for uncommitted changes
		try {
			const { stdout } = await execAsync('git status --porcelain', {
				cwd: folderPath
			});
			info.hasUncommittedChanges = stdout.trim().length > 0;
		} catch {
			// Ignore errors
		}

		return info;
	} catch {
		// Not a git repository
		return undefined;
	}
}

/**
 * Initialize timestamps for projects without history entries.
 * Fetches last commit date from git, falls back to epoch (1970) if unavailable.
 *
 * @param projects - Array of projects to potentially initialize
 * @param historyService - The workspace history service
 * @param concurrency - Max concurrent git operations (default: 5)
 * @returns Number of projects initialized
 */
export async function initializeProjectTimestamps(
	projects: Project[],
	historyService: WorkspaceHistoryService,
	concurrency: number = 5
): Promise<number> {
	const projectsToInit = projects.filter((p) => !historyService.getEntry(p.path));

	if (projectsToInit.length === 0) {
		return 0;
	}

	let initialized = 0;

	for (let i = 0; i < projectsToInit.length; i += concurrency) {
		const batch = projectsToInit.slice(i, i + concurrency);

		await Promise.all(
			batch.map(async (project) => {
				const commitDate = await getLastCommitDate(project.path);
				// Use commit date if available, otherwise default to epoch (1970)
				const timestamp = commitDate ?? 0;
				if (historyService.initializeTimestamp(project.path, timestamp)) {
					initialized++;
				}
			})
		);
	}

	return initialized;
}

/**
 * Get all worktrees for a git repository
 * Returns array including main worktree (named "root") and all linked worktrees
 */
export async function getWorktrees(folderPath: string): Promise<Worktree[]> {
	try {
		const { stdout } = await execAsync('git worktree list --porcelain', {
			cwd: folderPath
		});

		return parseWorktreeOutput(stdout, folderPath);
	} catch {
		return [];
	}
}

/**
 * Parse git worktree list --porcelain output
 */
function parseWorktreeOutput(output: string, mainPath: string): Worktree[] {
	const worktrees: Worktree[] = [];
	const blocks = output.trim().split('\n\n');

	for (const block of blocks) {
		if (!block.trim()) {
			continue;
		}

		const lines = block.split('\n');
		let worktreePath = '';
		let branch = '';
		let commit = '';
		let isDetached = false;
		let isBare = false;

		for (const line of lines) {
			if (line.startsWith('worktree ')) {
				worktreePath = line.substring(9);
			} else if (line.startsWith('HEAD ')) {
				commit = line.substring(5);
			} else if (line.startsWith('branch ')) {
				branch = line.substring(7).replace('refs/heads/', '');
			} else if (line === 'detached') {
				isDetached = true;
			} else if (line === 'bare') {
				isBare = true;
			}
		}

		if (worktreePath && !isBare) {
			const isMain =
				worktreePath === mainPath || worktreePath === path.resolve(mainPath);

			worktrees.push({
				name: isMain ? 'root' : (isDetached ? `detached` : branch),
				path: worktreePath,
				branch: isDetached ? `(${commit.substring(0, 7)})` : branch,
				isMain,
				commit
			});
		}
	}

	return worktrees;
}

/**
 * Check if a path is a linked worktree (not main repo)
 * Linked worktrees have .git as a FILE containing "gitdir: path"
 */
export function isWorktreePath(folderPath: string): boolean {
	const gitPath = path.join(folderPath, '.git');
	try {
		const stat = fs.statSync(gitPath);
		if (stat.isFile()) {
			const content = fs.readFileSync(gitPath, 'utf-8').trim();
			return content.startsWith('gitdir:');
		}
	} catch {
		// File doesn't exist or can't be read
	}
	return false;
}

/**
 * Get the main repository path from a linked worktree
 * Returns null if not a worktree
 */
export function getMainRepoFromWorktree(worktreePath: string): string | null {
	const gitPath = path.join(worktreePath, '.git');
	try {
		const stat = fs.statSync(gitPath);
		if (stat.isFile()) {
			const content = fs.readFileSync(gitPath, 'utf-8').trim();
			const match = content.match(/^gitdir:\s*(.+)$/);
			if (match) {
				// gitdir points to /main/repo/.git/worktrees/worktree-name
				const gitdir = path.resolve(worktreePath, match[1]);
				const worktreesMatch = gitdir.match(/(.+)[/\\]\.git[/\\]worktrees[/\\].+/);
				if (worktreesMatch) {
					return worktreesMatch[1];
				}
			}
		}
	} catch {
		// Not a worktree
	}
	return null;
}
