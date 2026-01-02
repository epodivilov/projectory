import * as vscode from 'vscode';
import { ProjectTreeItem } from '../providers/projects-tree-provider';
import { RecentFolderTreeItem, WorktreeTreeItem } from '../providers/base-tree-item';

/**
 * Union type for all possible command arguments that represent a project/folder
 */
export type ProjectItemArg =
	| ProjectTreeItem
	| RecentFolderTreeItem
	| WorktreeTreeItem
	| string
	| { path: string; uri: vscode.Uri };

/**
 * Extract path and URI from various command argument types
 */
export function extractProjectPath(itemOrPath: ProjectItemArg): { path: string; uri: vscode.Uri } {
	if (itemOrPath instanceof ProjectTreeItem) {
		return {
			path: itemOrPath.project.path,
			uri: itemOrPath.project.uri
		};
	}

	if (itemOrPath instanceof RecentFolderTreeItem) {
		return {
			path: itemOrPath.folder.path,
			uri: itemOrPath.folder.uri
		};
	}

	if (itemOrPath instanceof WorktreeTreeItem) {
		return {
			path: itemOrPath.worktree.path,
			uri: vscode.Uri.file(itemOrPath.worktree.path)
		};
	}

	if (typeof itemOrPath === 'string') {
		return {
			path: itemOrPath,
			uri: vscode.Uri.file(itemOrPath)
		};
	}

	return {
		path: itemOrPath.path,
		uri: itemOrPath.uri
	};
}
