import type * as vscode from 'vscode';
import { registerProjectCommands } from './project-commands';
import { registerTagCommands } from './tag-commands';
import { registerViewCommands, initializeViewContext, updateViewContextOnConfigChange } from './view-commands';
import { registerSettingsCommands } from './settings-commands';
import type { CommandContext } from './types';

export { type CommandContext } from './types';
export { initializeViewContext, updateViewContextOnConfigChange } from './view-commands';

/**
 * Register all extension commands
 */
export function registerAllCommands(ctx: CommandContext): vscode.Disposable[] {
	return [
		...registerProjectCommands(ctx),
		...registerTagCommands(ctx),
		...registerViewCommands(ctx),
		...registerSettingsCommands(ctx)
	];
}
