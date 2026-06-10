import * as vscode from "vscode";
import type { Project, ProjectTag } from "../types";
import {
  FolderTreeItem,
  ProjectsRootTreeItem,
  RecentFolderTreeItem,
  RecentRootTreeItem,
  ScannedRootTreeItem,
  TagTreeItem,
  UntaggedTreeItem,
  WorktreeTreeItem,
} from "./base-tree-item";
import { WorkspaceHistoryService } from "../services/workspace-history-service";
import { SavedProjectsService } from "../services/saved-projects-service";
import { TagService } from "../services/tag-service";
import { ProjectMetadataService } from "../services/project-metadata-service";
import { TreeStateService } from "../services/tree-state-service";
import { getConfig } from "../services/configuration-service";
import type { ProjectStore, ProjectStoreChange } from "../core/project-store";

const DRAG_MIME_TYPE = "application/vnd.code.tree.projectoryprojects";

/**
 * Union type for all tree elements
 */
export type ProjectsTreeElement =
  | ProjectsRootTreeItem
  | ScannedRootTreeItem
  | RecentRootTreeItem
  | RecentFolderTreeItem
  | ProjectTreeItem
  | TagTreeItem
  | UntaggedTreeItem
  | WorktreeTreeItem;

/**
 * Tree item representing a project
 */
export class ProjectTreeItem extends FolderTreeItem {
  constructor(
    public readonly project: Project,
    public readonly isSaved: boolean,
    isCurrent: boolean,
    tagDescription?: string,
    isWorktreeCurrent?: boolean,
    displayName?: string,
    projectDescription?: string
  ) {
    super(
      displayName ?? project.name,
      project.path,
      project.uri,
      isCurrent,
      isSaved ? "savedProject" : "scannedProject",
      project.hasWorktrees
        ? undefined! // No command for container - click expands
        : {
            command: "projectory.toggleSelectProject",
            title: "Toggle Select Project",
            arguments: [{ path: project.path }],
          }
    );

    // Override collapsible state if has worktrees
    if (project.hasWorktrees) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    // Override description to show tags and worktree status
    if (tagDescription) {
      if (isCurrent) {
        this.description = `${tagDescription} (current)`;
      } else if (isWorktreeCurrent) {
        this.description = `${tagDescription} (worktree open)`;
      } else {
        this.description = tagDescription;
      }
    } else if (isWorktreeCurrent && !isCurrent) {
      this.description = "(worktree open)";
    }

    // Override tooltip with displayName, description and path
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${displayName ?? project.name}**\n\n`);
    if (projectDescription) {
      this.tooltip.appendMarkdown(`${projectDescription}\n\n`);
    }
    this.tooltip.appendMarkdown(`\`${project.path}\``);
  }
}

/**
 * TreeDataProvider for the Projects view with drag & drop support
 * Uses priority-based tag grouping.
 * Pure view — data is owned by ProjectStore; subscribe via onDidChange.
 */
export class ProjectsTreeProvider
  implements
    vscode.TreeDataProvider<ProjectsTreeElement>,
    vscode.TreeDragAndDropController<ProjectsTreeElement>,
    vscode.Disposable
{
  // Drag and drop MIME types
  readonly dropMimeTypes = [DRAG_MIME_TYPE];
  readonly dragMimeTypes = [DRAG_MIME_TYPE];

  private _onDidChangeTreeData = new vscode.EventEmitter<
    ProjectsTreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // View-only state
  private _filterTagIds: string[] = [];

  // Cached root section instances for targeted re-fires
  private _savedRoot?: ProjectsRootTreeItem;
  private _scannedRoot?: ScannedRootTreeItem;
  private _recentRoot?: RecentRootTreeItem;

  private _storeSubscription: vscode.Disposable;

  constructor(
    private readonly store: ProjectStore,
    private readonly historyService: WorkspaceHistoryService,
    private readonly savedProjectsService: SavedProjectsService,
    private readonly tagService: TagService,
    private readonly metadataService: ProjectMetadataService,
    private readonly treeStateService: TreeStateService
  ) {
    this._storeSubscription = this.store.onDidChange((change) =>
      this._onStoreChange(change)
    );
  }

  dispose(): void {
    this._storeSubscription.dispose();
    this._onDidChangeTreeData.dispose();
  }

  /**
   * Handle store data changes with targeted section-level fires.
   *
   * Count changes (add/remove project) always arrive as `reset` via store.refresh().
   * `paths` is for in-place metadata edits where only affected sections need updating.
   */
  private _onStoreChange(change: ProjectStoreChange): void {
    if (change.kind === "reset") {
      // Clear cached roots so getChildren creates fresh instances next render
      this._savedRoot = undefined;
      this._scannedRoot = undefined;
      this._recentRoot = undefined;
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    // kind === 'paths': fire only affected cached root sections
    const { paths } = change;
    const recentPaths = new Set(this.store.getRecentFolders().map((f) => f.path));

    let affectsSaved = false;
    let affectsScanned = false;
    let affectsRecent = false;

    for (const p of paths) {
      if (recentPaths.has(p)) {
        affectsRecent = true;
      } else if (this.savedProjectsService.isMarked(p, this.metadataService)) {
        affectsSaved = true;
      } else {
        affectsScanned = true;
      }
    }

    if (affectsSaved) {
      if (this._savedRoot) {
        this._onDidChangeTreeData.fire(this._savedRoot);
      } else {
        this._onDidChangeTreeData.fire(undefined);
      }
    }
    if (affectsScanned) {
      if (this._scannedRoot) {
        this._onDidChangeTreeData.fire(this._scannedRoot);
      } else {
        this._onDidChangeTreeData.fire(undefined);
      }
    }
    if (affectsRecent) {
      if (this._recentRoot) {
        this._onDidChangeTreeData.fire(this._recentRoot);
      } else {
        this._onDidChangeTreeData.fire(undefined);
      }
    }
  }

  getTreeItem(element: ProjectsTreeElement): vscode.TreeItem {
    // Restore persisted expand/collapse state for collapsible nodes the user
    // has toggled before. Untouched (and dynamically added) nodes keep the
    // default state set in their constructor.
    if (
      element.id &&
      element.collapsibleState !== undefined &&
      element.collapsibleState !== vscode.TreeItemCollapsibleState.None
    ) {
      const expanded = this.treeStateService.isExpanded(element.id);
      if (expanded !== undefined) {
        element.collapsibleState = expanded
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed;
      }
    }
    return element;
  }

  /**
   * Persist the expand/collapse state of a node, keyed by its stable id.
   * Called from the tree view's onDidExpand/onDidCollapse listeners.
   */
  recordExpandState(element: ProjectsTreeElement, expanded: boolean): void {
    if (element.id) {
      this.treeStateService.setExpanded(element.id, expanded);
    }
  }

  /**
   * Get children based on view mode
   */
  async getChildren(
    element?: ProjectsTreeElement
  ): Promise<ProjectsTreeElement[]> {
    // Wait only for the very first seed/load. In-flight rescans must never
    // block rendering — the tree paints from memory and the store fires a
    // reset when fresh data lands.
    await this.store.whenInitialized();

    const config = getConfig();

    // Root level - return root containers
    if (!element) {
      // Return empty array when no root folder is configured
      // This allows the welcome view to be displayed
      if (!config.rootFolder) {
        return [];
      }

      const saved = this.getSavedSubset();
      const scanned = this.getScannedSubset();
      const recentFolders = this.store.getRecentFolders();

      // Construct and cache root instances for targeted re-fires
      this._savedRoot = new ProjectsRootTreeItem(saved.length);
      const items: ProjectsTreeElement[] = [this._savedRoot];

      // Add Scanned section if there are unmarked discovered projects.
      // Hidden when empty to avoid noise once the user has marked everything.
      if (scanned.length > 0) {
        this._scannedRoot = new ScannedRootTreeItem(scanned.length);
        items.push(this._scannedRoot);
      } else {
        this._scannedRoot = undefined;
      }

      // Add Recent section if there are recent folders
      if (config.showRecentFolders && recentFolders.length > 0) {
        this._recentRoot = new RecentRootTreeItem(recentFolders.length);
        items.push(this._recentRoot);
      } else {
        this._recentRoot = undefined;
      }

      return items;
    }

    // Children of Recent root - return recent folders
    if (element instanceof RecentRootTreeItem) {
      return this.getRecentFoldersList();
    }

    // Children of Scanned root - flat list, no tag grouping (scanned items are
    // unmarked by definition, so tag groups would always be empty)
    if (element instanceof ScannedRootTreeItem) {
      return this.getScannedList();
    }

    // Children of Projects root - return based on view mode
    if (element instanceof ProjectsRootTreeItem) {
      switch (config.viewMode) {
        case "flat":
          return this.getFlatList();
        case "byTags":
          return this.getTagHierarchyRoot();
        default:
          return this.getFlatList();
      }
    }

    // Children of tags - pass the tag path for hierarchical grouping
    if (element instanceof TagTreeItem) {
      return this.getTagChildren(element.tag, element.tagPath);
    }

    // Children of untagged group
    if (element instanceof UntaggedTreeItem) {
      return this.getUntaggedProjects();
    }

    // Children of projects with worktrees
    if (
      element instanceof ProjectTreeItem &&
      element.project.hasWorktrees &&
      element.project.worktrees
    ) {
      const currentPath = this.getCurrentWorkspacePath();
      return element.project.worktrees.map(
        (w) =>
          new WorktreeTreeItem(w, element.project.path, w.path === currentPath)
      );
    }

    return [];
  }

  /**
   * Get parent element (needed for tree navigation)
   */
  getParent(
    _element: ProjectsTreeElement
  ): vscode.ProviderResult<ProjectsTreeElement> {
    return undefined;
  }

  // ==================== View Mode Methods ====================

  /**
   * Get recent folders list
   */
  private getRecentFoldersList(): ProjectsTreeElement[] {
    const currentPath = this.getCurrentWorkspacePath();
    return this.store.getRecentFolders().map(
      (folder) => new RecentFolderTreeItem(folder, folder.path === currentPath)
    );
  }

  /**
   * Get flat list of projects (default view) — Saved subset only.
   */
  private getFlatList(): ProjectsTreeElement[] {
    const config = getConfig();
    const currentPath = this.getCurrentWorkspacePath();
    const sorted = this.historyService.sortProjects(
      this.getSavedSubset(),
      config.sortOrder,
      config.sortDirection
    );

    return sorted.map((project) =>
      this.createProjectTreeItem(project, currentPath)
    );
  }

  /**
   * Get flat sorted list of scanned-but-unmarked projects.
   */
  private getScannedList(): ProjectsTreeElement[] {
    const config = getConfig();
    const currentPath = this.getCurrentWorkspacePath();
    const sorted = this.historyService.sortProjects(
      this.getScannedSubset(),
      config.sortOrder,
      config.sortDirection
    );

    // Hide tags column — scanned items definitionally carry no tags.
    return sorted.map((project) =>
      this.createProjectTreeItem(project, currentPath, false)
    );
  }

  /**
   * Saved subset = projects the user has marked (saved record or tags).
   */
  private getSavedSubset(): Project[] {
    return this.store.getProjects().filter((p) =>
      this.savedProjectsService.isMarked(p.path, this.metadataService)
    );
  }

  /**
   * Scanned subset = projects with no markers — found by disk scan only.
   */
  private getScannedSubset(): Project[] {
    return this.store.getProjects().filter(
      (p) => !this.savedProjectsService.isMarked(p.path, this.metadataService)
    );
  }

  /**
   * Get root elements for tag hierarchy view (priority 0 tags)
   */
  private getTagHierarchyRoot(): ProjectsTreeElement[] {
    const items: ProjectsTreeElement[] = [];
    const config = getConfig();
    // Tag grouping operates over the Saved subset only — scanned items live in
    // their own root and are unmarked by definition.
    const savedPaths = this.getSavedSubset().map((p) => p.path);
    const untaggedPaths = this.metadataService.getUntaggedProjects(savedPaths);

    // If filter is active, show hierarchy leading to filtered tags
    if (this._filterTagIds.length > 0) {
      // Handle untagged filter separately
      const hasUntaggedFilter = this._filterTagIds.includes("__untagged__");
      if (hasUntaggedFilter && untaggedPaths.length > 0) {
        items.push(new UntaggedTreeItem(untaggedPaths.length));
      }

      // Get non-untagged filter tag names
      const filterTagNames = this._filterTagIds.filter(
        (name) => name !== "__untagged__"
      );

      if (filterTagNames.length > 0) {
        // Build hierarchy from root tags down to filtered tags
        const rootTags = this.tagService.getTagsByPriority(0);

        for (const rootTag of rootTags) {
          // Check if this root tag leads to any filtered tag
          const count = this.getFilteredProjectCountUnderTag(
            [rootTag.name],
            filterTagNames
          );

          if (count > 0) {
            // Check if this root tag itself is a filter tag
            const isFilterTag = filterTagNames.includes(rootTag.name);
            // Has children if not a filter tag and depth allows
            const hasChildren = !isFilterTag && config.groupingDepth > 0;
            items.push(
              new TagTreeItem(
                rootTag,
                rootTag.name,
                [rootTag.name],
                count,
                hasChildren
              )
            );
          }
        }
      }

      return items;
    }

    // Show tags with priority 0
    const rootTags = this.tagService.getTagsByPriority(0);

    for (const tag of rootTags) {
      const count = this.getProjectCountWithTags([tag.name]);
      if (count > 0) {
        const hasChildren = config.groupingDepth > 0;
        items.push(
          new TagTreeItem(tag, tag.name, [tag.name], count, hasChildren)
        );
      }
    }

    // Add untagged group
    if (untaggedPaths.length > 0) {
      items.push(new UntaggedTreeItem(untaggedPaths.length));
    }

    return items;
  }

  /**
   * Get children of a tag based on priority-based grouping
   * When filter is active, only show path to filtered tags
   * @param parentTag The parent tag
   * @param tagPath Array of tag names that must ALL be present on projects
   */
  private getTagChildren(
    parentTag: ProjectTag,
    tagPath: string[]
  ): ProjectsTreeElement[] {
    const items: ProjectsTreeElement[] = [];
    const config = getConfig();
    const currentPath = this.getCurrentWorkspacePath();

    const currentPriority = parentTag.priority;
    const nextPriority = currentPriority + 1;

    // Check if we're in filtered mode with non-untagged filters
    const filterTagNames = this._filterTagIds.filter(
      (name) => name !== "__untagged__"
    );
    const isFiltered = filterTagNames.length > 0;

    // Get all projects that match the current tag path
    const projectsWithAllTags = this.getProjectsWithAllTags(tagPath);

    // Track which projects are grouped into sub-tags
    const groupedProjectPaths = new Set<string>();

    // Check if we should show next level tags
    if (currentPriority < config.groupingDepth) {
      // Get tags of next priority level
      const nextLevelTags = this.tagService.getTagsByPriority(nextPriority);

      for (const tag of nextLevelTags) {
        const newTagPath = [...tagPath, tag.name];

        if (isFiltered) {
          // In filtered mode: only show this tag if it's a filter tag or leads to filter tags
          const isFilterTag = filterTagNames.includes(tag.name);
          const matchingProjects = this.getProjectsWithAllTags(
            newTagPath
          ).filter((p) => {
            const pTags = this.metadataService.getTags(p.path);
            return filterTagNames.some((fn) => pTags.includes(fn));
          });

          if (matchingProjects.length > 0) {
            // Has children only if NOT a filter tag and depth allows
            const hasMoreChildren =
              !isFilterTag && nextPriority < config.groupingDepth;
            items.push(
              new TagTreeItem(
                tag,
                tag.name,
                newTagPath,
                matchingProjects.length,
                hasMoreChildren
              )
            );

            // Only mark as grouped if this IS a filter tag (projects shown under it)
            if (isFilterTag) {
              for (const project of matchingProjects) {
                groupedProjectPaths.add(project.path);
              }
            }
          }
        } else {
          // Normal mode: show all matching tags
          const matchingProjects = this.getProjectsWithAllTags(newTagPath);

          if (matchingProjects.length > 0) {
            const hasMoreChildren = nextPriority < config.groupingDepth;
            items.push(
              new TagTreeItem(
                tag,
                tag.name,
                newTagPath,
                matchingProjects.length,
                hasMoreChildren
              )
            );

            // Mark these projects as grouped (they'll appear deeper in the tree)
            for (const project of matchingProjects) {
              groupedProjectPaths.add(project.path);
            }
          }
        }
      }
    }

    // Collect projects at this level (not grouped into deeper levels)
    const projectsAtThisLevel: Project[] = [];

    for (const project of projectsWithAllTags) {
      // Skip if this project is grouped into a deeper level
      if (groupedProjectPaths.has(project.path)) {
        continue;
      }

      // In filtered mode, only show projects if current tag is a filter tag
      if (isFiltered) {
        const projectTags = this.metadataService.getTags(project.path);
        const matchesFilter = filterTagNames.some((fn) =>
          projectTags.includes(fn)
        );
        const currentIsFilter = filterTagNames.includes(parentTag.name);
        if (!matchesFilter || !currentIsFilter) {
          continue;
        }
      }

      projectsAtThisLevel.push(project);
    }

    // Sort projects according to current settings
    const sortedProjects = this.historyService.sortProjects(
      projectsAtThisLevel,
      config.sortOrder,
      config.sortDirection
    );

    // Create tree items for sorted projects
    for (const project of sortedProjects) {
      const projectTagNames = this.metadataService.getTags(project.path);
      const remainingTags = projectTagNames
        .filter((name) => !tagPath.includes(name))
        .map((name) => this.tagService.getTag(name))
        .filter((t): t is ProjectTag => t !== undefined)
        .map((t) => t.name);

      const tagDescription =
        remainingTags.length > 0
          ? remainingTags.map((n) => `[${n}]`).join(" ")
          : undefined;

      const isSaved = this.savedProjectsService.isSaved(project.path);
      const isCurrent = project.path === currentPath;
      const displayName = this.savedProjectsService.getDisplayName(project.path);
      const projectDescription = this.savedProjectsService.getDescription(project.path);
      items.push(
        new ProjectTreeItem(project, isSaved, isCurrent, tagDescription, false, displayName, projectDescription)
      );
    }

    return items;
  }

  /**
   * Get untagged projects
   */
  private getUntaggedProjects(): ProjectsTreeElement[] {
    const config = getConfig();
    const currentPath = this.getCurrentWorkspacePath();
    // Restrict to Saved subset — scanned items are excluded from the Saved tree.
    const savedPaths = this.getSavedSubset().map((p) => p.path);
    const untaggedPaths = this.metadataService.getUntaggedProjects(savedPaths);

    const untaggedProjects = untaggedPaths
      .map((path) => this.store.findProjectByPath(path))
      .filter((p): p is Project => p !== undefined);

    // Sort according to current settings
    const sorted = this.historyService.sortProjects(
      untaggedProjects,
      config.sortOrder,
      config.sortDirection
    );

    return sorted.map((project) =>
      this.createProjectTreeItem(project, currentPath, false)
    );
  }

  /**
   * Set filter tags for filtered view mode
   */
  setFilter(tagNames: string[] | null): void {
    this._filterTagIds = tagNames ?? [];
  }

  /**
   * Get current filter tag names
   */
  getFilter(): string[] {
    return this._filterTagIds;
  }

  // ==================== Drag and Drop ====================

  /**
   * Handle drag start
   */
  handleDrag(
    source: readonly ProjectsTreeElement[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const paths: string[] = [];
    const isFromRecent: boolean[] = [];

    for (const item of source) {
      if (item instanceof ProjectTreeItem) {
        paths.push(item.project.path);
        isFromRecent.push(false);
      } else if (item instanceof RecentFolderTreeItem) {
        paths.push(item.folder.path);
        isFromRecent.push(true);
      }
    }

    if (paths.length > 0) {
      dataTransfer.set(
        DRAG_MIME_TYPE,
        new vscode.DataTransferItem({ paths, isFromRecent })
      );
    }
  }

  /**
   * Handle drop
   */
  async handleDrop(
    target: ProjectsTreeElement | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = dataTransfer.get(DRAG_MIME_TYPE);
    if (!transferItem) {
      return;
    }

    const { paths, isFromRecent } = transferItem.value as {
      paths: string[];
      isFromRecent: boolean[];
    };

    // Mark dropped items so they end up in the Saved section. Tag drops imply
    // marked-ness via the tag; root/Untagged drops need an explicit save record
    // because dragging a Scanned item onto Saved must persist user intent.
    const markDropped = (targetTagIds?: string[]) => {
      for (const path of paths) {
        if (targetTagIds && targetTagIds.length > 0) {
          for (const tagId of targetTagIds) {
            this.metadataService.addTag(path, tagId);
          }
        } else {
          // No tag → mark via explicit save so the item lands in Saved.
          this.savedProjectsService.saveProject(path);
        }
      }
    };

    if (target instanceof ProjectsRootTreeItem) {
      // Drop on Saved root - save (no tags)
      markDropped();
      await this.store.refresh();
    } else if (target instanceof TagTreeItem) {
      // Drop on tag - add tags (tag itself marks the project as Saved)
      markDropped(target.tagPath);
      await this.store.refresh();
    } else if (target instanceof UntaggedTreeItem) {
      // Drop on Untagged - save and strip any existing tags
      markDropped();
      for (const path of paths) {
        this.metadataService.setTags(path, []);
      }
      await this.store.refresh();
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Create a ProjectTreeItem with tag description
   */
  private createProjectTreeItem(
    project: Project,
    currentPath: string | null,
    showTags = true
  ): ProjectTreeItem {
    const isSaved = this.savedProjectsService.isSaved(project.path);
    const isCurrent = project.path === currentPath;
    const isWorktreeCurrent = this.isProjectWorktreeCurrent(
      project,
      currentPath
    );
    const displayName = this.savedProjectsService.getDisplayName(project.path);
    const projectDescription = this.savedProjectsService.getDescription(project.path);

    let tagDescription: string | undefined;
    if (showTags) {
      const tagIds = this.metadataService.getTags(project.path);
      if (tagIds.length > 0) {
        const tagNames = tagIds
          .map((id) => this.tagService.getTag(id)?.name)
          .filter((name): name is string => name !== undefined);
        if (tagNames.length > 0) {
          tagDescription = tagNames.map((n) => `[${n}]`).join(" ");
        }
      }
    }

    return new ProjectTreeItem(
      project,
      isSaved,
      isCurrent,
      tagDescription,
      isWorktreeCurrent,
      displayName,
      projectDescription
    );
  }

  /**
   * Check if current workspace is one of the project's worktrees
   */
  private isProjectWorktreeCurrent(
    project: Project,
    currentPath: string | null
  ): boolean {
    if (!currentPath || !project.worktrees) {
      return false;
    }
    return project.worktrees.some((w) => w.path === currentPath);
  }

  /**
   * Get count of projects that have ALL specified tags
   */
  private getProjectCountWithTags(tagIds: string[]): number {
    return this.getProjectsWithAllTags(tagIds).length;
  }

  /**
   * Get Saved-subset projects that have ALL specified tags
   */
  private getProjectsWithAllTags(tagIds: string[]): Project[] {
    return this.getSavedSubset().filter((project) => {
      const projectTags = this.metadataService.getTags(project.path);
      return tagIds.every((tagId) => projectTags.includes(tagId));
    });
  }

  /**
   * Get count of Saved-subset projects that match the tagPath AND at least one filter tag
   */
  private getFilteredProjectCountUnderTag(
    tagPath: string[],
    filterTagIds: string[]
  ): number {
    return this.getSavedSubset().filter((project) => {
      const projectTags = this.metadataService.getTags(project.path);
      // Must have all tags in tagPath
      const hasPathTags = tagPath.every((tagId) => projectTags.includes(tagId));
      if (!hasPathTags) {
        return false;
      }
      // Must have at least one filter tag
      return filterTagIds.some((filterId) => projectTags.includes(filterId));
    }).length;
  }

  /**
   * Fire change event to refresh UI (view-only repaints: selection, filter, view mode, grouping).
   */
  fireChange(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get current workspace path
   */
  private getCurrentWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath ?? null;
  }
}
