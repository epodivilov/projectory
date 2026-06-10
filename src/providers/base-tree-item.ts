import * as vscode from "vscode";
import type { ProjectTag, Worktree } from "../types";

/**
 * Stable tree item id for a project path.
 */
export function projectId(path: string): string {
  return `project-${Buffer.from(path).toString("base64")}`;
}

/**
 * Stable tree item id for a worktree path.
 */
export function worktreeId(path: string): string {
  return `worktree-${Buffer.from(path).toString("base64")}`;
}

/**
 * Base tree item for folder-based items (Projects and Recent Folders)
 */
export class FolderTreeItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly folderPath: string,
    public readonly uri: vscode.Uri,
    public readonly isCurrent: boolean,
    contextValue: string,
    command: vscode.Command
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);

    // Stable ID - encode path to avoid special characters
    this.id = projectId(folderPath);
    this.contextValue = contextValue;
    this.description = isCurrent ? "(current)" : undefined;

    this.iconPath = new vscode.ThemeIcon("folder");

    this.resourceUri = uri;

    this.command = command;
  }
}

/**
 * Tree item representing a tag in hierarchical view
 * Uses tagPath for unique identification and hierarchical grouping
 */
export class TagTreeItem extends vscode.TreeItem {
  constructor(
    public readonly tag: ProjectTag,
    public readonly displayName: string,
    public readonly tagPath: string[],
    public readonly projectCount: number,
    hasChildren: boolean
  ) {
    // Expanded if has children, collapsed if only projects
    super(
      displayName,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );

    // Stable ID - include tagPath for uniqueness (same tag can appear under different paths)
    this.id = `tag-${tagPath.join("-")}`;
    this.contextValue = "projectTag";
    this.description = `${projectCount}`;

    this.iconPath = new vscode.ThemeIcon("tag");
  }
}

/**
 * Tree item representing the "Untagged" virtual group
 */
export class UntaggedTreeItem extends vscode.TreeItem {
  constructor(public readonly projectCount: number) {
    // Expanded by default
    super("Untagged", vscode.TreeItemCollapsibleState.Expanded);

    // Stable ID - don't change it to preserve expansion state
    this.id = "untagged";
    this.contextValue = "untaggedGroup";
    this.description = `${projectCount}`;

    // Distinct icon for untagged group
    this.iconPath = new vscode.ThemeIcon("archive");
  }
}

/**
 * Root container tree item for saved projects
 * Used to avoid VS Code's special handling of root-level items
 */
export class ProjectsRootTreeItem extends vscode.TreeItem {
  constructor(public readonly projectCount: number) {
    super("Saved", vscode.TreeItemCollapsibleState.Expanded);

    this.id = "projects-root";
    this.contextValue = "projectsRoot";
    this.description = `${projectCount}`;

    this.iconPath = new vscode.ThemeIcon("folder-library");
  }
}

/**
 * Root container tree item for scanned-but-unmarked projects.
 * Collapsed by default — these are discovered automatically and the user
 * hasn't expressed intent to keep them yet.
 */
export class ScannedRootTreeItem extends vscode.TreeItem {
  constructor(public readonly projectCount: number) {
    super("Scanned", vscode.TreeItemCollapsibleState.Collapsed);

    this.id = "scanned-root";
    this.contextValue = "scannedRoot";
    this.description = `${projectCount}`;

    this.iconPath = new vscode.ThemeIcon("search");
  }
}

/**
 * Root container tree item for recent folders
 */
export class RecentRootTreeItem extends vscode.TreeItem {
  constructor(public readonly folderCount: number) {
    super("Recent", vscode.TreeItemCollapsibleState.Collapsed);

    this.id = "recent-root";
    this.contextValue = "recentRoot";
    this.description = `${folderCount}`;

    this.iconPath = new vscode.ThemeIcon("history");
  }
}

/**
 * Tree item representing a recent folder
 */
export class RecentFolderTreeItem extends FolderTreeItem {
  constructor(
    public readonly folder: { name: string; path: string; uri: vscode.Uri },
    isCurrent: boolean
  ) {
    super(folder.name, folder.path, folder.uri, isCurrent, "recentFolder", {
      command: "projectory.toggleSelectRecentFolder",
      title: "Toggle Select Folder",
      arguments: [{ path: folder.path }],
    });
  }
}

/**
 * Tree item representing a git worktree under a project
 */
export class WorktreeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly worktree: Worktree,
    public readonly parentProjectPath: string,
    public readonly isCurrent: boolean
  ) {
    super(worktree.name, vscode.TreeItemCollapsibleState.None);

    // Stable ID
    this.id = worktreeId(worktree.path);
    this.contextValue = "worktree";
    this.description = isCurrent ? "(current)" : worktree.branch;

    // Icon: file-directory for root, git-branch for linked worktrees
    this.iconPath = new vscode.ThemeIcon(
      worktree.isMain ? "file-directory" : "git-branch"
    );

    // Command to toggle selection
    this.command = {
      command: "projectory.toggleSelectWorktree",
      title: "Toggle Select Worktree",
      arguments: [{ path: worktree.path, parentPath: parentProjectPath }],
    };
  }
}
