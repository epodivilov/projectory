import type * as vscode from 'vscode';
import type { ProjectsTreeProvider } from '../providers/projects-tree-provider';
import type { DetailsWebviewProvider } from '../providers/details-webview-provider';
import type { WorkspaceHistoryService } from '../services/workspace-history-service';
import type { SavedProjectsService } from '../services/saved-projects-service';
import type { TagService } from '../services/tag-service';
import type { ProjectMetadataService } from '../services/project-metadata-service';
import type { SuggestionService } from '../services/suggestion-service';

/**
 * Context object containing all services and providers needed by commands
 */
export interface CommandContext {
	projectsTreeProvider: ProjectsTreeProvider;
	detailsWebviewProvider: DetailsWebviewProvider;
	historyService: WorkspaceHistoryService;
	savedProjectsService: SavedProjectsService;
	tagService: TagService;
	metadataService: ProjectMetadataService;
	suggestionService: SuggestionService;
	getSelectedPath: () => string | null;
	setSelectedPath: (path: string | null) => void;
}

/**
 * Command registration result
 */
export type CommandDisposable = vscode.Disposable;
