import * as vscode from 'vscode';
import { ProjectTreeItem } from '../providers/projects-tree-provider';
import { RecentFolderTreeItem } from '../providers/base-tree-item';
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
				ctx.projectsTreeProvider.fireChange();
			} else {
				ctx.setSelectedPath(itemPath);
				const project = ctx.projectsTreeProvider.findProjectByPath(itemPath);
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
				ctx.projectsTreeProvider.fireChange();
			} else {
				ctx.setSelectedPath(itemPath);
				const folder = ctx.projectsTreeProvider.findFolderByPath(itemPath);
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
				ctx.projectsTreeProvider.fireChange();
			} else {
				ctx.setSelectedPath(itemPath);
				const parentProject = ctx.projectsTreeProvider.findProjectByPath(arg.parentPath);
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
			if (item.isSaved) {
				ctx.savedProjectsService.removeSavedProject(item.project.path);
			} else {
				ctx.savedProjectsService.excludePath(item.project.path);
			}
			await ctx.projectsTreeProvider.refresh();
			ctx.setSelectedPath(null);
			ctx.detailsWebviewProvider.clearProject();
		}
	);

	const saveToProjectsCommand = vscode.commands.registerCommand(
		'projectory.saveToProjects',
		async (item: RecentFolderTreeItem) => {
			ctx.savedProjectsService.saveProject(item.folder.path);
			await ctx.projectsTreeProvider.refresh();
		}
	);

	return [
		openProjectCommand,
		openInNewWindowCommand,
		toggleSelectProjectCommand,
		toggleSelectRecentFolderCommand,
		toggleSelectWorktreeCommand,
		removeFromProjectsCommand,
		saveToProjectsCommand
	];
}
