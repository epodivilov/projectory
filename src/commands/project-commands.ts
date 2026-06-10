import * as vscode from 'vscode';
import { ProjectTreeItem } from '../providers/projects-tree-provider';
import { RecentFolderTreeItem, RecentRootTreeItem } from '../providers/base-tree-item';
import { extractProjectPath, type ProjectItemArg } from '../utils/command-helpers';
import type { CommandContext, CommandDisposable } from './types';

/**
 * Register project-related commands (open, toggle, save, remove)
 */
export function registerProjectCommands(ctx: CommandContext): CommandDisposable[] {
	const openProjectCommand = vscode.commands.registerCommand(
		'projectory.openProject',
		(itemOrPath: ProjectItemArg) => {
			const { path, uri } = extractProjectPath(itemOrPath);
			ctx.historyService.recordOpen(path);
			vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
		}
	);

	const openInNewWindowCommand = vscode.commands.registerCommand(
		'projectory.openInNewWindow',
		(itemOrPath: ProjectItemArg) => {
			const { path, uri } = extractProjectPath(itemOrPath);
			ctx.historyService.recordOpen(path);
			vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
		}
	);

	const toggleSelectProjectCommand = vscode.commands.registerCommand(
		'projectory.toggleSelectProject',
		(arg: { path: string }) => {
			const itemPath = arg.path;
			const selectedPath = ctx.getSelectedPath();

			if (selectedPath === itemPath) {
				ctx.setSelectedPath(null);
				ctx.detailsWebviewProvider.clearProject();
			} else {
				ctx.setSelectedPath(itemPath);
				const project = ctx.store.findProjectByPath(itemPath);
				if (project) {
					ctx.detailsWebviewProvider.showProject(project);
				}
			}
		}
	);

	const toggleSelectRecentFolderCommand = vscode.commands.registerCommand(
		'projectory.toggleSelectRecentFolder',
		(arg: { path: string }) => {
			const itemPath = arg.path;
			const selectedPath = ctx.getSelectedPath();

			if (selectedPath === itemPath) {
				ctx.setSelectedPath(null);
				ctx.detailsWebviewProvider.clearProject();
			} else {
				ctx.setSelectedPath(itemPath);
				const folder = ctx.store.findFolderByPath(itemPath);
				if (folder) {
					ctx.detailsWebviewProvider.showFolder(folder);
				}
			}
		}
	);

	const toggleSelectWorktreeCommand = vscode.commands.registerCommand(
		'projectory.toggleSelectWorktree',
		(arg: { path: string; parentPath: string }) => {
			const itemPath = arg.path;
			const selectedPath = ctx.getSelectedPath();

			if (selectedPath === itemPath) {
				ctx.setSelectedPath(null);
				ctx.detailsWebviewProvider.clearProject();
			} else {
				ctx.setSelectedPath(itemPath);
				const parentProject = ctx.store.findProjectByPath(arg.parentPath);
				if (parentProject?.worktrees) {
					const worktree = parentProject.worktrees.find((w) => w.path === itemPath);
					if (worktree) {
						ctx.detailsWebviewProvider.showFolder({
							name: worktree.name,
							path: worktree.path,
							uri: vscode.Uri.file(worktree.path),
							isGitRepo: true
						});
					}
				}
			}
		}
	);

	const removeFromProjectsCommand = vscode.commands.registerCommand(
		'projectory.removeFromProjects',
		async (item: ProjectTreeItem) => {
			// Strip every marker (save record + tags + displayName + description).
			// Without this a tagged-but-unsaved project would immediately reappear
			// in Saved on the next render.
			ctx.savedProjectsService.clearAllMarkers(item.project.path, ctx.metadataService);
			await ctx.store.reconcileMarkers();
			ctx.setSelectedPath(null);
			ctx.detailsWebviewProvider.clearProject();
		}
	);

	const ignoreScannedCommand = vscode.commands.registerCommand(
		'projectory.ignoreScanned',
		async (item: ProjectTreeItem) => {
			// Hide from future scans without touching markers (there are none).
			ctx.savedProjectsService.excludePath(item.project.path);
			await ctx.store.reconcileMarkers();
			ctx.setSelectedPath(null);
			ctx.detailsWebviewProvider.clearProject();
		}
	);

	const saveToProjectsCommand = vscode.commands.registerCommand(
		'projectory.saveToProjects',
		async (item: RecentFolderTreeItem) => {
			// Saving an ancestor folder hides every recent entry nested under it
			// (subfolder filter in getRecentFolders) — make that consequence explicit.
			const hiddenCount = ctx.store.countRecentUnder(item.folder.path);
			if (hiddenCount > 0) {
				const confirm = await vscode.window.showWarningMessage(
					`Saving "${item.folder.name}" will hide ${hiddenCount} recent folder${hiddenCount !== 1 ? 's' : ''} nested under it. Save anyway?`,
					{ modal: true },
					'Save'
				);
				if (confirm !== 'Save') {
					return;
				}
			}
			ctx.savedProjectsService.saveProject(item.folder.path);
			await ctx.store.reconcileMarkers();
		}
	);

	const removeFromRecentCommand = vscode.commands.registerCommand(
		'projectory.removeFromRecent',
		async (item: RecentFolderTreeItem) => {
			ctx.historyService.removeFromHistory(item.folder.path);
			await ctx.store.reconcileMarkers();
		}
	);

	const clearAndIgnoreRecentCommand = vscode.commands.registerCommand(
		'projectory.clearAndIgnoreRecent',
		async (item: RecentFolderTreeItem) => {
			// Drop from history AND from future scans — the user wants this path
			// off the radar entirely. excludePath is a no-op if the folder isn't
			// inside a scan root, which is harmless.
			ctx.historyService.removeFromHistory(item.folder.path);
			ctx.savedProjectsService.excludePath(item.folder.path);
			await ctx.store.reconcileMarkers();
		}
	);

	const clearRecentFoldersCommand = vscode.commands.registerCommand(
		'projectory.clearRecentFolders',
		async (_item?: RecentRootTreeItem) => {
			const confirmed = await vscode.window.showWarningMessage(
				'Clear all recent folders?',
				{ modal: true },
				'Clear'
			);
			if (confirmed !== 'Clear') {
				return;
			}
			ctx.historyService.clearHistory();
			await ctx.store.reconcileMarkers();
		}
	);

	const renameProjectCommand = vscode.commands.registerCommand(
		'projectory.renameProject',
		async (item: ProjectTreeItem) => {
			const currentDisplayName = ctx.savedProjectsService.getDisplayName(item.project.path);
			const newName = await vscode.window.showInputBox({
				prompt: 'Enter project name',
				value: currentDisplayName ?? item.project.name,
				placeHolder: item.project.name
			});

			if (newName === undefined) {
				return;
			}

			ctx.savedProjectsService.updateProject(item.project.path, {
				displayName: newName.trim()
			});
			await ctx.store.reconcileMarkers();
			await ctx.detailsWebviewProvider.refreshCurrentItem();
		}
	);

	const editProjectDescriptionCommand = vscode.commands.registerCommand(
		'projectory.editProjectDescription',
		async (item: ProjectTreeItem) => {
			const currentDescription = ctx.savedProjectsService.getDescription(item.project.path);
			const newDescription = await vscode.window.showInputBox({
				prompt: 'Enter project description',
				value: currentDescription ?? '',
				placeHolder: 'A short description of the project'
			});

			if (newDescription === undefined) {
				return;
			}

			ctx.savedProjectsService.updateProject(item.project.path, {
				description: newDescription.trim()
			});
			ctx.store.emitChange({ kind: 'reset' });
			await ctx.detailsWebviewProvider.refreshCurrentItem();
		}
	);

	return [
		openProjectCommand,
		openInNewWindowCommand,
		toggleSelectProjectCommand,
		toggleSelectRecentFolderCommand,
		toggleSelectWorktreeCommand,
		removeFromProjectsCommand,
		ignoreScannedCommand,
		saveToProjectsCommand,
		removeFromRecentCommand,
		clearAndIgnoreRecentCommand,
		clearRecentFoldersCommand,
		renameProjectCommand,
		editProjectDescriptionCommand
	];
}
