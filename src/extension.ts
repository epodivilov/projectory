import * as vscode from 'vscode';
import { ProjectsTreeProvider } from './providers/projects-tree-provider';
import { DetailsWebviewProvider } from './providers/details-webview-provider';
import { WorkspaceHistoryService } from './services/workspace-history-service';
import { SavedProjectsService } from './services/saved-projects-service';
import { TagService } from './services/tag-service';
import { ProjectMetadataService } from './services/project-metadata-service';
import { getSuggestionConfig, onConfigChange } from './services/configuration-service';
import { SuggestionService } from './services/suggestion-service';
import { registerAllCommands, initializeViewContext, updateViewContextOnConfigChange, type CommandContext } from './commands';

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

export async function activate(context: vscode.ExtensionContext) {
	// Initialize services
	historyService = new WorkspaceHistoryService(context.globalState);
	historyService.cleanupWorktreeEntries(); // Clean up legacy worktree entries
	savedProjectsService = new SavedProjectsService(context.globalState);
	tagService = new TagService();
	metadataService = new ProjectMetadataService(context.globalState);
	detailsWebviewProvider = new DetailsWebviewProvider(context.extensionUri, historyService, savedProjectsService);
	projectsTreeProvider = new ProjectsTreeProvider(historyService, savedProjectsService, tagService, metadataService);
	suggestionService = new SuggestionService(
		context.globalState,
		historyService,
		savedProjectsService,
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

	// Folder suggestions (delayed to avoid startup overhead)
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

	// Always load projects on activation (needed for suggestions and other features)
	await projectsTreeProvider.refresh();

	// Refresh when view becomes visible (in case data changed while hidden)
	const visibilityListener = projectsTreeView.onDidChangeVisibility(async (e) => {
		if (e.visible) {
			await projectsTreeProvider.refresh();
		}
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
		visibilityListener,
		detailsViewDisposable,
		...commandDisposables,
		configChangeListener,
		workspaceChangeListener
	);
}

export function deactivate() {
	// Clear pending suggestion timeout
	if (suggestionTimeoutId) {
		clearTimeout(suggestionTimeoutId);
		suggestionTimeoutId = null;
	}

	// Clear selected project
	selectedProjectPath = null;
}
