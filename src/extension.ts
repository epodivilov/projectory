import * as vscode from 'vscode';
import { ProjectsTreeProvider } from './providers/projects-tree-provider';
import { DetailsWebviewProvider } from './providers/details-webview-provider';
import { WorkspaceHistoryService } from './services/workspace-history-service';
import { SavedProjectsService } from './services/saved-projects-service';
import { TagService } from './services/tag-service';
import { ProjectMetadataService } from './services/project-metadata-service';
import { TreeStateService } from './services/tree-state-service';
import { ProjectsCacheService } from './services/projects-cache-service';
import { getSuggestionConfig, onConfigChange } from './services/configuration-service';
import { SuggestionService } from './services/suggestion-service';
import { registerAllCommands, initializeViewContext, updateViewContextOnConfigChange, type CommandContext } from './commands';
import { StateStore } from './core/state-store';

// Service instances
let projectsTreeProvider: ProjectsTreeProvider;
let detailsWebviewProvider: DetailsWebviewProvider;
let historyService: WorkspaceHistoryService;
let savedProjectsService: SavedProjectsService;
let tagService: TagService;
let metadataService: ProjectMetadataService;
let suggestionService: SuggestionService;

// Track selected path for toggle functionality
let selectedProjectPath: string | null = null;

// Track suggestion timeout for cleanup
let suggestionTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Shared state store
let stateStore: StateStore | null = null;

export async function activate(context: vscode.ExtensionContext) {
	// Initialize shared state store
	stateStore = new StateStore(context.globalState);

	// Initialize services
	historyService = new WorkspaceHistoryService(stateStore);
	historyService.cleanupWorktreeEntries(); // Clean up legacy worktree entries
	savedProjectsService = new SavedProjectsService(stateStore);
	tagService = new TagService();
	metadataService = new ProjectMetadataService(stateStore);
	const treeStateService = new TreeStateService(stateStore);
	const projectsCacheService = new ProjectsCacheService(stateStore);
	detailsWebviewProvider = new DetailsWebviewProvider(context.extensionUri, historyService, savedProjectsService);
	projectsTreeProvider = new ProjectsTreeProvider(historyService, savedProjectsService, tagService, metadataService, treeStateService, projectsCacheService);
	suggestionService = new SuggestionService(
		stateStore,
		historyService,
		savedProjectsService,
		metadataService,
		() => {
			const projects = projectsTreeProvider.getProjects();
			const paths: string[] = [];
			for (const p of projects) {
				paths.push(p.path);
				if (p.worktrees) {
					for (const w of p.worktrees) {
						paths.push(w.path);
					}
				}
			}
			return paths;
		}
	);

	// Create tree view
	const projectsTreeView = vscode.window.createTreeView('projectory.projectsView', {
		treeDataProvider: projectsTreeProvider,
		dragAndDropController: projectsTreeProvider,
		canSelectMany: true,
		showCollapseAll: false
	});

	// Record current workspace in history
	historyService.recordCurrentWorkspace();

	// Load projects in the background. refresh() paints cached (saved) projects
	// immediately and reconciles with a disk scan without blocking activation —
	// so the panel shows known projects at once instead of a loading spinner.
	void projectsTreeProvider.refresh().catch((err) => {
		console.error('Error loading projects on activation:', err);
	});

	// Folder suggestions (delayed to avoid startup overhead, but after projects are loaded)
	suggestionTimeoutId = setTimeout(async () => {
		try {
			const suggestionConfig = getSuggestionConfig();
			const suggestibleEntry = suggestionService.checkCurrentWorkspace(suggestionConfig);
			if (suggestibleEntry) {
				await suggestionService.showSuggestion(suggestibleEntry);
			}
		} catch (error) {
			console.error('Error showing folder suggestion:', error);
		}
	}, 3000);

	// Persist expand/collapse state so it survives reloads and restarts
	const expandListener = projectsTreeView.onDidExpandElement((e) => {
		projectsTreeProvider.recordExpandState(e.element, true);
	});
	const collapseListener = projectsTreeView.onDidCollapseElement((e) => {
		projectsTreeProvider.recordExpandState(e.element, false);
	});

	// Register details webview provider
	const detailsViewDisposable = vscode.window.registerWebviewViewProvider(
		DetailsWebviewProvider.viewType,
		detailsWebviewProvider
	);

	// Initialize view context (sort order, view mode, etc.)
	await initializeViewContext();

	// Create command context
	const commandContext: CommandContext = {
		projectsTreeProvider,
		detailsWebviewProvider,
		historyService,
		savedProjectsService,
		tagService,
		metadataService,
		suggestionService,
		getSelectedPath: () => selectedProjectPath,
		setSelectedPath: (path) => { selectedProjectPath = path; }
	};

	// Register all commands
	const commandDisposables = registerAllCommands(commandContext);

	// Listen for configuration changes
	const configChangeListener = onConfigChange(async () => {
		await updateViewContextOnConfigChange();
		await projectsTreeProvider.refresh();
	});

	// Update when workspace changes
	const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
		await projectsTreeProvider.refresh();
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

	// Flush any pending state writes
	return stateStore?.flush();
}
