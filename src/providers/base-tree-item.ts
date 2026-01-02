import * as vscode from "vscode";
import type { ProjectTag, Worktree } from "../types";

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
    this.id = `project-${Buffer.from(folderPath).toString("base64")}`;
    this.contextValue = contextValue;
    this.description = isCurrent ? "(current)" : undefined;

    // Unified tooltip - only name and path
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${name}**\n\n`);
    this.tooltip.appendMarkdown(`\`${folderPath}\``);

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
    projectCount: number,
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

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${tag.name}**\n\n`);
    this.tooltip.appendMarkdown(`Priority: ${tag.priority}\n\n`);
    this.tooltip.appendMarkdown(
      `${projectCount} project${projectCount !== 1 ? "s" : ""}`
    );

    this.iconPath = new vscode.ThemeIcon("tag");
  }
}

/**
 * Tree item representing the "Untagged" virtual group
 */
export class UntaggedTreeItem extends vscode.TreeItem {
  constructor(projectCount: number) {
    // Expanded by default
    super("Untagged", vscode.TreeItemCollapsibleState.Expanded);

    // Stable ID - don't change it to preserve expansion state
    this.id = "untagged";
    this.contextValue = "untaggedGroup";
    this.description = `${projectCount}`;

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown("**Untagged Projects**\n\n");
    this.tooltip.appendMarkdown(
      `${projectCount} project${projectCount !== 1 ? "s" : ""} without tags`
    );

    // Distinct icon for untagged group
    this.iconPath = new vscode.ThemeIcon("archive");
  }
}

/**
 * Root container tree item for saved projects
 * Used to avoid VS Code's special handling of root-level items
 */
export class ProjectsRootTreeItem extends vscode.TreeItem {
  constructor(projectCount: number) {
    super("Saved", vscode.TreeItemCollapsibleState.Expanded);

    this.id = "projects-root";
    this.contextValue = "projectsRoot";
    this.description = `${projectCount}`;

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown("**Saved Projects**\n\n");
    this.tooltip.appendMarkdown(
      `${projectCount} project${projectCount !== 1 ? "s" : ""}`
    );

    this.iconPath = new vscode.ThemeIcon("folder-library");
  }
}

/**
 * Root container tree item for recent folders
 */
export class RecentRootTreeItem extends vscode.TreeItem {
  constructor(folderCount: number) {
    super("Recent", vscode.TreeItemCollapsibleState.Collapsed);

    this.id = "recent-root";
    this.contextValue = "recentRoot";
    this.description = `${folderCount}`;

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown("**Recent Folders**\n\n");
    this.tooltip.appendMarkdown(
      `${folderCount} folder${folderCount !== 1 ? "s" : ""} not yet saved`
    );
    this.tooltip.appendMarkdown("\n\n*Drag to Saved or a tag to save*");

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
    this.id = `worktree-${Buffer.from(worktree.path).toString("base64")}`;
    this.contextValue = "worktree";
    this.description = isCurrent ? "(current)" : worktree.branch;

    // Tooltip with branch and path info
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${worktree.name}**\n\n`);
    this.tooltip.appendMarkdown(`Branch: \`${worktree.branch}\`\n\n`);
    this.tooltip.appendMarkdown(`Path: \`${worktree.path}\``);

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
