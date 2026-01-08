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
			await ctx.projectsTreeProvider.refresh();
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
			ctx.projectsTreeProvider.fireChange();
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
		saveToProjectsCommand,
		renameProjectCommand,
		editProjectDescriptionCommand
	];
}
