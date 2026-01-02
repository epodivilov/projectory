import * as vscode from 'vscode';
import type { ProjectoryConfig, SortOrder, SortDirection, ViewMode } from '../types';

const SECTION = 'projectory';

/**
 * Get current extension configuration
 */
export function getConfig(): ProjectoryConfig {
	const config = vscode.workspace.getConfiguration(SECTION);
	return {
		rootFolder: config.get<string>('rootFolder', ''),
		excludePatterns: config.get<string[]>('excludePatterns', ['node_modules', '.git']),
		maxScanDepth: config.get<number>('maxScanDepth', 2),
		showRecentFolders: config.get<boolean>('showRecentFolders', true),
		sortOrder: config.get<SortOrder>('sortOrder', 'recent'),
		sortDirection: config.get<SortDirection>('sortDirection', 'desc'),
		viewMode: config.get<ViewMode>('viewMode', 'flat'),
		groupingDepth: config.get<number>('groupingDepth', 1),
		suggestFrequentFolders: config.get<boolean>('suggestFrequentFolders', true),
		suggestMinOpenCount: config.get<number>('suggestMinOpenCount', 5),
		suggestTimePeriodDays: config.get<number>('suggestTimePeriodDays', 14)
	};
}

/**
 * Configuration for folder suggestions
 */
export interface SuggestionConfig {
	enabled: boolean;
	minOpenCount: number;
	timePeriodDays: number;
}

/**
 * Get suggestion-related configuration
 */
export function getSuggestionConfig(): SuggestionConfig {
	const config = vscode.workspace.getConfiguration(SECTION);
	return {
		enabled: config.get<boolean>('suggestFrequentFolders', true),
		minOpenCount: config.get<number>('suggestMinOpenCount', 5),
		timePeriodDays: config.get<number>('suggestTimePeriodDays', 14)
	};
}

/**
 * Set sort order
 */
export async function setSortOrder(order: SortOrder): Promise<void> {
	const config = vscode.workspace.getConfiguration(SECTION);
	await config.update('sortOrder', order, vscode.ConfigurationTarget.Global);
}

/**
 * Set sort direction
 */
export async function setSortDirection(direction: SortDirection): Promise<void> {
	const config = vscode.workspace.getConfiguration(SECTION);
	await config.update('sortDirection', direction, vscode.ConfigurationTarget.Global);
}

/**
 * Set view mode
 */
export async function setViewMode(mode: ViewMode): Promise<void> {
	const config = vscode.workspace.getConfiguration(SECTION);
	await config.update('viewMode', mode, vscode.ConfigurationTarget.Global);
}

/**
 * Set grouping depth
 */
export async function setGroupingDepth(depth: number): Promise<void> {
	const config = vscode.workspace.getConfiguration(SECTION);
	await config.update('groupingDepth', depth, vscode.ConfigurationTarget.Global);
}

/**
 * Set root folder path
 */
export async function setRootFolder(path: string): Promise<void> {
	const config = vscode.workspace.getConfiguration(SECTION);
	await config.update('rootFolder', path, vscode.ConfigurationTarget.Global);
}

/**
 * Listen for configuration changes
 */
export function onConfigChange(
	callback: (e: vscode.ConfigurationChangeEvent) => void
): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration(SECTION)) {
			callback(e);
		}
	});
}

/**
 * Prompt user to select root folder
 */
export async function selectRootFolder(): Promise<string | undefined> {
	const result = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		title: 'Select Projects Root Folder'
	});

	if (result && result[0]) {
		await setRootFolder(result[0].fsPath);
		return result[0].fsPath;
	}

	return undefined;
}
