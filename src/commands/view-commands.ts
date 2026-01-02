import * as vscode from 'vscode';
import * as os from 'os';
import { getConfig, setSortOrder, setSortDirection, setViewMode, setGroupingDepth } from '../services/configuration-service';
import type { SortOrder, SortDirection, ViewMode } from '../types';
import type { CommandContext, CommandDisposable } from './types';

/**
 * Format path with ~ for home directory
 */
function formatPath(fullPath: string): string {
	const homeDir = os.homedir();
	if (fullPath.startsWith(homeDir)) {
		return '~' + fullPath.slice(homeDir.length);
	}
	return fullPath;
}

/**
 * Helper to update context values
 */
async function updateContext(key: string, value: unknown): Promise<void> {
	await vscode.commands.executeCommand('setContext', `projectory.${key}`, value);
}

/**
 * Register view-related commands (sort, filter, search, view mode)
 */
export function registerViewCommands(ctx: CommandContext): CommandDisposable[] {
	const sortByRecentCommand = vscode.commands.registerCommand(
		'projectory.sortByRecent',
		async () => {
			await setSortOrder('recent');
			await updateContext('sortOrder', 'recent');
		}
	);

	const sortByAlphabeticalCommand = vscode.commands.registerCommand(
		'projectory.sortByAlphabetical',
		async () => {
			await setSortOrder('alphabetical');
			await updateContext('sortOrder', 'alphabetical');
		}
	);

	const sortAscendingCommand = vscode.commands.registerCommand(
		'projectory.sortAscending',
		async () => {
			await setSortDirection('asc');
			await updateContext('sortDirection', 'asc');
		}
	);

	const sortDescendingCommand = vscode.commands.registerCommand(
		'projectory.sortDescending',
		async () => {
			await setSortDirection('desc');
			await updateContext('sortDirection', 'desc');
		}
	);

	const viewFlatCommand = vscode.commands.registerCommand(
		'projectory.viewFlat',
		async () => {
			await setViewMode('flat');
			await updateContext('viewMode', 'flat');
			ctx.projectsTreeProvider.setFilter([]);
			ctx.projectsTreeProvider.fireChange();
		}
	);

	const viewByTagsCommand = vscode.commands.registerCommand(
		'projectory.viewByTags',
		async () => {
			await setViewMode('byTags');
			await updateContext('viewMode', 'byTags');
			ctx.projectsTreeProvider.fireChange();
		}
	);

	const filterByTagCommand = vscode.commands.registerCommand(
		'projectory.filterByTag',
		async () => {
			const tags = ctx.tagService.getTags();
			const currentFilter = ctx.projectsTreeProvider.getFilter();

			const items: { label: string; tagName: string; picked: boolean }[] = [
				{
					label: '$(archive) Untagged',
					tagName: '__untagged__',
					picked: currentFilter.includes('__untagged__')
				},
				...tags.map((t) => ({
					label: `$(tag) ${t.name}`,
					tagName: t.name,
					picked: currentFilter.includes(t.name)
				}))
			];

			const picked = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select tags to filter by (multiple selection)',
				canPickMany: true
			});

			if (picked) {
				ctx.projectsTreeProvider.setFilter(picked.map((p) => p.tagName));

				const config = getConfig();
				if (picked.length > 0 && config.viewMode === 'flat') {
					await setViewMode('byTags');
					await updateContext('viewMode', 'byTags');
				}

				ctx.projectsTreeProvider.fireChange();
			}
		}
	);

	const clearFilterCommand = vscode.commands.registerCommand(
		'projectory.clearFilter',
		async () => {
			ctx.projectsTreeProvider.setFilter([]);
			ctx.projectsTreeProvider.fireChange();
		}
	);

	const setGroupingDepthCommand = vscode.commands.registerCommand(
		'projectory.setGroupingDepth',
		async () => {
			const config = getConfig();
			const maxPriority = ctx.tagService.getMaxPriority();

			const items: vscode.QuickPickItem[] = [];

			for (let i = 0; i <= Math.max(maxPriority + 1, 3); i++) {
				const tagsAtLevel = ctx.tagService.getTagsByPriority(i);
				const tagNames = tagsAtLevel.map((t) => t.name).join(', ');
				items.push({
					label: `${i}`,
					description: i === config.groupingDepth ? '(current)' : undefined,
					detail: tagNames ? `Tags: ${tagNames}` : i === 0 ? 'Only top level tags' : 'No tags at this level'
				});
			}

			const picked = await vscode.window.showQuickPick(items, {
				placeHolder: `Current depth: ${config.groupingDepth}. Select new grouping depth.`
			});

			if (picked) {
				const depth = parseInt(picked.label, 10);
				await setGroupingDepth(depth);
				ctx.projectsTreeProvider.fireChange();
			}
		}
	);

	const searchProjectsCommand = vscode.commands.registerCommand(
		'projectory.searchProjects',
		async () => {
			const config = getConfig();
			const projects = ctx.historyService.sortProjects(
				ctx.projectsTreeProvider.getProjects(),
				config.sortOrder,
				config.sortDirection
			);

			const items: vscode.QuickPickItem[] = projects.map((project) => ({
				label: project.name,
				description: formatPath(project.path),
				detail: project.path
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Search projects...',
				matchOnDescription: true,
				matchOnDetail: true
			});

			if (selected && selected.detail) {
				ctx.historyService.recordOpen(selected.detail);
				const uri = vscode.Uri.file(selected.detail);
				vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
			}
		}
	);

	return [
		sortByRecentCommand,
		sortByAlphabeticalCommand,
		sortAscendingCommand,
		sortDescendingCommand,
		viewFlatCommand,
		viewByTagsCommand,
		filterByTagCommand,
		clearFilterCommand,
		setGroupingDepthCommand,
		searchProjectsCommand
	];
}

/**
 * Initialize view context values on activation
 */
export async function initializeViewContext(): Promise<void> {
	const config = getConfig();
	await updateContext('sortOrder', config.sortOrder);
	await updateContext('sortDirection', config.sortDirection);
	await updateContext('viewMode', config.viewMode);
	await updateContext('hasNoRootFolder', !config.rootFolder);
}

/**
 * Update context on configuration change
 */
export async function updateViewContextOnConfigChange(): Promise<void> {
	const config = getConfig();
	await updateContext('sortOrder', config.sortOrder);
	await updateContext('hasNoRootFolder', !config.rootFolder);
}
