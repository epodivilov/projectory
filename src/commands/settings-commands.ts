import * as vscode from 'vscode';
import { getConfig, selectRootFolder } from '../services/configuration-service';
import type { CommandContext, CommandDisposable } from './types';

/**
 * Register settings-related commands (setRootFolder, rescan, reset)
 */
export function registerSettingsCommands(ctx: CommandContext): CommandDisposable[] {
	const setRootFolderCommand = vscode.commands.registerCommand(
		'projectory.setRootFolder',
		async () => {
			await selectRootFolder();
			await ctx.projectsTreeProvider.refresh();
		}
	);

	const rescanProjectsCommand = vscode.commands.registerCommand(
		'projectory.rescanProjects',
		async () => {
			const config = getConfig();

			if (!config.rootFolder) {
				const result = await vscode.window.showWarningMessage(
					'Root folder is not set. Would you like to set it now?',
					'Set Root Folder',
					'Cancel'
				);
				if (result === 'Set Root Folder') {
					await vscode.commands.executeCommand('projectory.setRootFolder');
				}
				return;
			}

			// Clear all excluded paths so previously removed projects come back
			ctx.savedProjectsService.clearExcludedPaths();

			// Refresh the project list
			await ctx.projectsTreeProvider.refresh();

			const projects = ctx.projectsTreeProvider.getProjects();
			vscode.window.showInformationMessage(`Found ${projects.length} projects in root folder`);
		}
	);

	const resetAllDataCommand = vscode.commands.registerCommand(
		'projectory.resetAllData',
		async () => {
			const confirm = await vscode.window.showWarningMessage(
				'This will reset ALL Projectory data: tags, project metadata, saved projects, excluded paths, and workspace history. This cannot be undone!',
				{ modal: true },
				'Reset All Data',
				'Cancel'
			);

			if (confirm === 'Reset All Data') {
				// Reset all services
				await ctx.tagService.resetAll();
				ctx.metadataService.resetAll();
				ctx.savedProjectsService.resetAll();
				ctx.historyService.clearHistory();
				ctx.suggestionService.resetAll();

				// Refresh everything
				await ctx.projectsTreeProvider.refresh();

				vscode.window.showInformationMessage('All Projectory data has been reset. Projects will be rescanned from root folder.');
			}
		}
	);

	const refreshCommand = vscode.commands.registerCommand(
		'projectory.refreshProjects',
		async () => {
			await ctx.projectsTreeProvider.refresh();
		}
	);

	return [
		refreshCommand,
		setRootFolderCommand,
		rescanProjectsCommand,
		resetAllDataCommand
	];
}
