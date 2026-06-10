import * as vscode from 'vscode';
import { getSuggestionConfig, onConfigChange } from './services/configuration-service';
import { registerAllCommands, initializeViewContext, updateViewContextOnConfigChange, type CommandContext } from './commands';
import { Container } from './container';
import { DetailsWebviewProvider } from './providers/details-webview-provider';

// Container instance
let container: Container | null = null;

// Track selected path for toggle functionality
let selectedProjectPath: string | null = null;

// Track suggestion timeout for cleanup
let suggestionTimeoutId: ReturnType<typeof setTimeout> | null = null;

export async function activate(context: vscode.ExtensionContext) {
	const c = new Container(context);
	container = c;

	// Clean up legacy worktree entries
	c.historyService.cleanupWorktreeEntries();

	// Create tree view
	const projectsTreeView = vscode.window.createTreeView('projectory.projectsView', {
		treeDataProvider: c.projectsTreeProvider,
		dragAndDropController: c.projectsTreeProvider,
		canSelectMany: true,
		showCollapseAll: false
	});

	// Record current workspace in history
	c.historyService.recordCurrentWorkspace();

	// Load projects in the background. refresh() paints cached (saved) projects
	// immediately and reconciles with a disk scan without blocking activation —
	// so the panel shows known projects at once instead of a loading spinner.
	void c.store.refresh().catch((err) => {
		console.error('Error loading projects on activation:', err);
	});

	// Folder suggestions (delayed to avoid startup overhead, but after projects are loaded)
	suggestionTimeoutId = setTimeout(async () => {
		try {
			const suggestionConfig = getSuggestionConfig();
			const suggestibleEntry = c.suggestionService.checkCurrentWorkspace(suggestionConfig);
			if (suggestibleEntry) {
				await c.suggestionService.showSuggestion(suggestibleEntry);
			}
		} catch (error) {
			console.error('Error showing folder suggestion:', error);
		}
	}, 3000);

	// Persist expand/collapse state so it survives reloads and restarts
	const expandListener = projectsTreeView.onDidExpandElement((e) => {
		c.projectsTreeProvider.recordExpandState(e.element, true);
	});
	const collapseListener = projectsTreeView.onDidCollapseElement((e) => {
		c.projectsTreeProvider.recordExpandState(e.element, false);
	});

	// Register details webview provider
	const detailsViewDisposable = vscode.window.registerWebviewViewProvider(
		DetailsWebviewProvider.viewType,
		c.detailsWebviewProvider
	);

	// Initialize view context (sort order, view mode, etc.)
	await initializeViewContext();

	// Create command context
	const commandContext: CommandContext = {
		store: c.store,
		projectsTreeProvider: c.projectsTreeProvider,
		detailsWebviewProvider: c.detailsWebviewProvider,
		historyService: c.historyService,
		savedProjectsService: c.savedProjectsService,
		tagService: c.tagService,
		metadataService: c.metadataService,
		suggestionService: c.suggestionService,
		getSelectedPath: () => selectedProjectPath,
		setSelectedPath: (path) => { selectedProjectPath = path; }
	};

	// Register all commands
	const commandDisposables = registerAllCommands(commandContext);

	// Listen for configuration changes
	const configChangeListener = onConfigChange(async () => {
		await updateViewContextOnConfigChange();
		await c.store.refresh();
	});

	// Update when workspace changes
	const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
		await c.store.refresh();
	});

	// Register all disposables
	context.subscriptions.push(
		projectsTreeView,
		expandListener,
		collapseListener,
		detailsViewDisposable,
		...commandDisposables,
		configChangeListener,
		workspaceChangeListener
	);
}

export function deactivate(): Promise<void> | undefined {
	// Clear pending suggestion timeout
	if (suggestionTimeoutId) {
		clearTimeout(suggestionTimeoutId);
		suggestionTimeoutId = null;
	}

	// Clear selected project
	selectedProjectPath = null;

	// Flush any pending state writes and dispose services
	return container?.flushAndDispose();
}
