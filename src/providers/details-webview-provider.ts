import * as vscode from 'vscode';
import type { Project, RecentFolder, DetailItem, WebviewMessage } from '../types';
import { getNonce } from '../utils/webview-utils';
import { WorkspaceHistoryService } from '../services/workspace-history-service';
import { SavedProjectsService } from '../services/saved-projects-service';
import { getGitInfo } from '../services/git-info-service';

/**
 * WebviewViewProvider for the project details view
 */
export class DetailsWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'projectory.detailsView';

	private _view?: vscode.WebviewView;
	private _currentPath: string | null = null;
	private _currentIsProject: boolean = false;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly historyService: WorkspaceHistoryService,
		private readonly savedProjectsService: SavedProjectsService
	) {}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.extensionUri, 'dist'),
				vscode.Uri.joinPath(this.extensionUri, 'media'),
				vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode/codicons', 'dist')
			]
		};

		webviewView.webview.html = this.getHtmlContent(webviewView.webview);

		webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
			this.handleMessage(message);
		});

		// Send current item when view becomes visible
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible && this._currentPath) {
				// Re-fetch details when view becomes visible
				this.refreshCurrentItem().catch((err) => {
					console.error('Error refreshing details on visibility change:', err);
				});
			}
		});
	}

	/**
	 * Show details for a project
	 */
	showProject(project: Project): void {
		this._currentIsProject = true;
		this.showItem(project);
	}

	/**
	 * Show details for a recent folder
	 */
	showFolder(folder: RecentFolder): void {
		this._currentIsProject = false;
		this.showItem(folder);
	}

	/**
	 * Show details for any item (Project or RecentFolder)
	 */
	async showItem(item: Project | RecentFolder): Promise<void> {
		this._currentPath = item.path;

		if (this._view) {
			this._view.show?.(true);
			await this.updateDetailItem(item);
		} else {
			// View not yet initialized (collapsed on startup) — reveal via command
			vscode.commands.executeCommand(`${DetailsWebviewProvider.viewType}.focus`);
		}
	}

	/**
	 * Clear project details
	 */
	clearProject(): void {
		this._currentPath = null;

		if (this._view) {
			this._view.webview.postMessage({ command: 'clearProject' });
		}
	}

	/**
	 * Refresh current item details
	 */
	private async refreshCurrentItem(): Promise<void> {
		if (!this._currentPath) {
			return;
		}
		// Create a minimal item to refresh
		const name = this._currentPath.split('/').pop() ?? this._currentPath;
		await this.updateDetailItem({ name, path: this._currentPath });
	}

	/**
	 * Build and send DetailItem to the webview
	 */
	private async updateDetailItem(item: { name: string; path: string }): Promise<void> {
		if (!this._view) {
			return;
		}

		// Get git info asynchronously
		const gitInfo = await getGitInfo(item.path);
		const lastOpened = this.historyService.getLastOpened(item.path);
		const isSaved = this.savedProjectsService.isSaved(item.path);

		const detail: DetailItem = {
			name: item.name,
			path: item.path,
			lastOpened,
			gitInfo,
			isProject: this._currentIsProject,
			isSaved
		};

		this._view.webview.postMessage({
			command: 'updateDetail',
			payload: { detail }
		});
	}

	/**
	 * Handle messages from the webview
	 */
	private async handleMessage(message: WebviewMessage): Promise<void> {
		switch (message.command) {
			case 'ready':
				// Send stored item when webview is ready
				if (this._currentPath) {
					await this.refreshCurrentItem();
				}
				break;

			case 'openProject': {
				const payload = message.payload as { path: string; newWindow: boolean };
				this.historyService.recordOpen(payload.path);
				const uri = vscode.Uri.file(payload.path);
				vscode.commands.executeCommand('vscode.openFolder', uri, {
					forceNewWindow: payload.newWindow
				});
				break;
			}

			case 'saveToProjects': {
				const payload = message.payload as { path: string };
				this.savedProjectsService.saveProject(payload.path);
				await vscode.commands.executeCommand('projectory.refreshProjects');
				// Update details to reflect saved state
				await this.refreshCurrentItem();
				break;
			}

			case 'deleteProject': {
				const payload = message.payload as { path: string; isSaved: boolean };
				if (payload.isSaved) {
					// Remove from saved projects
					this.savedProjectsService.removeSavedProject(payload.path);
				} else {
					// Add to excluded paths (for scanned git repos)
					this.savedProjectsService.excludePath(payload.path);
				}
				vscode.commands.executeCommand('projectory.refreshProjects');
				this.clearProject();
				break;
			}
		}
	}

	/**
	 * Generate HTML content for the webview
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		const codiconsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
		);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'details-view.js')
		);
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<link href="${codiconsUri}" rel="stylesheet" id="vscode-codicon-stylesheet">
	<title>Project Details</title>
	<style>
		body {
			padding: 0;
			margin: 0;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: transparent;
		}
	</style>
</head>
<body>
	<details-view-app></details-view-app>
	<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
