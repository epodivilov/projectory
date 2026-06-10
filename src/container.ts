import * as vscode from "vscode";
import { StateStore } from "./core/state-store";
import { ProjectStore } from "./core/project-store";
import { ScanWatcher } from "./core/scan-watcher";
import { WorkspaceHistoryService } from "./services/workspace-history-service";
import { SavedProjectsService } from "./services/saved-projects-service";
import { TagService } from "./services/tag-service";
import { ProjectMetadataService } from "./services/project-metadata-service";
import { TreeStateService } from "./services/tree-state-service";
import { ProjectsCacheService } from "./services/projects-cache-service";
import { ProjectsTreeProvider } from "./providers/projects-tree-provider";
import { DetailsWebviewProvider } from "./providers/details-webview-provider";
import { SuggestionService } from "./services/suggestion-service";

/**
 * Lazy service locator. Create once in activate(), dispose in deactivate().
 */
export class Container implements vscode.Disposable {
  private _stateStore?: StateStore;
  private _historyService?: WorkspaceHistoryService;
  private _savedProjectsService?: SavedProjectsService;
  private _tagService?: TagService;
  private _metadataService?: ProjectMetadataService;
  private _treeStateService?: TreeStateService;
  private _projectsCacheService?: ProjectsCacheService;
  private _store?: ProjectStore;
  private _scanWatcher?: ScanWatcher;
  private _projectsTreeProvider?: ProjectsTreeProvider;
  private _detailsWebviewProvider?: DetailsWebviewProvider;
  private _suggestionService?: SuggestionService;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get stateStore(): StateStore {
    if (!this._stateStore) {
      this._stateStore = new StateStore(this.context.globalState);
    }
    return this._stateStore;
  }

  get historyService(): WorkspaceHistoryService {
    if (!this._historyService) {
      this._historyService = new WorkspaceHistoryService(this.stateStore);
    }
    return this._historyService;
  }

  get savedProjectsService(): SavedProjectsService {
    if (!this._savedProjectsService) {
      this._savedProjectsService = new SavedProjectsService(this.stateStore);
    }
    return this._savedProjectsService;
  }

  get tagService(): TagService {
    if (!this._tagService) {
      this._tagService = new TagService();
    }
    return this._tagService;
  }

  get metadataService(): ProjectMetadataService {
    if (!this._metadataService) {
      this._metadataService = new ProjectMetadataService(this.stateStore);
    }
    return this._metadataService;
  }

  get treeStateService(): TreeStateService {
    if (!this._treeStateService) {
      this._treeStateService = new TreeStateService(this.stateStore);
    }
    return this._treeStateService;
  }

  get projectsCacheService(): ProjectsCacheService {
    if (!this._projectsCacheService) {
      this._projectsCacheService = new ProjectsCacheService(this.stateStore);
    }
    return this._projectsCacheService;
  }

  get store(): ProjectStore {
    if (!this._store) {
      this._store = new ProjectStore(
        this.historyService,
        this.savedProjectsService,
        this.projectsCacheService
      );
    }
    return this._store;
  }

  get scanWatcher(): ScanWatcher {
    if (!this._scanWatcher) {
      this._scanWatcher = new ScanWatcher(this.store);
    }
    return this._scanWatcher;
  }

  get projectsTreeProvider(): ProjectsTreeProvider {
    if (!this._projectsTreeProvider) {
      this._projectsTreeProvider = new ProjectsTreeProvider(
        this.store,
        this.historyService,
        this.savedProjectsService,
        this.tagService,
        this.metadataService,
        this.treeStateService
      );
    }
    return this._projectsTreeProvider;
  }

  get detailsWebviewProvider(): DetailsWebviewProvider {
    if (!this._detailsWebviewProvider) {
      this._detailsWebviewProvider = new DetailsWebviewProvider(
        this.context.extensionUri,
        this.historyService,
        this.savedProjectsService
      );
    }
    return this._detailsWebviewProvider;
  }

  get suggestionService(): SuggestionService {
    if (!this._suggestionService) {
      this._suggestionService = new SuggestionService(
        this.stateStore,
        this.historyService,
        this.savedProjectsService,
        this.metadataService,
        this.store
      );
    }
    return this._suggestionService;
  }

  dispose(): void {
    this._scanWatcher?.dispose();
    this._store?.dispose();
    this._projectsTreeProvider?.dispose();
    this._detailsWebviewProvider?.dispose();
    this._suggestionService?.dispose();
  }

  /**
   * Dispose services and flush pending state writes.
   * Used by deactivate().
   */
  flushAndDispose(): Promise<void> | undefined {
    this.dispose();
    return this._stateStore?.flush();
  }
}
