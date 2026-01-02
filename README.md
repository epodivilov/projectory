# Projectory

A VS Code extension for managing your projects with tags, git worktree support, and smart folder suggestions.

## Features

- **Project Tree View** - Browse all your projects from a dedicated sidebar
- **Tag Organization** - Organize projects with priority-based tags and hierarchical grouping
- **Git Worktree Support** - Automatically detects and displays git worktrees
- **Recent Folders** - Quick access to recently opened folders
- **Smart Suggestions** - Get notified when frequently opened folders could be saved as projects
- **Drag & Drop** - Reorder and organize projects easily
- **Search** - Quickly find projects with fuzzy search

## Getting Started

1. Open the Projectory panel from the Activity Bar
2. Set your projects root folder via the welcome view or command palette
3. Your git repositories will be automatically discovered
4. Use tags to organize projects by category, technology, or any criteria you prefer

## Extension Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `projectory.rootFolder` | Path to the folder containing your projects | `""` |
| `projectory.viewMode` | Display mode: `flat` or `byTags` | `flat` |
| `projectory.sortOrder` | Sort by: `recent` or `alphabetical` | `recent` |
| `projectory.sortDirection` | Sort direction: `asc` or `desc` | `desc` |
| `projectory.showRecentFolders` | Show recently opened folders | `true` |
| `projectory.tags` | Tag definitions with priority levels | `{}` |
| `projectory.groupingDepth` | Tag hierarchy depth in grouped view | `1` |
| `projectory.maxScanDepth` | Maximum folder depth when scanning | `2` |
| `projectory.excludePatterns` | Folder patterns to exclude | `["node_modules", ".git", ...]` |
| `projectory.suggestFrequentFolders` | Suggest saving frequent folders | `true` |
| `projectory.suggestMinOpenCount` | Opens before suggesting | `5` |
| `projectory.suggestTimePeriodDays` | Time period for suggestions | `14` |

## Commands

All commands are available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- `Projectory: Refresh Projects` - Refresh the project list
- `Projectory: Set Root Folder` - Configure the projects folder
- `Projectory: Search Projects` - Quick search across all projects
- `Projectory: Rescan Root Folder` - Rescan for new projects
- `Projectory: Tags: Create` - Create a new tag
- `Projectory: View: Flat List` - Switch to flat view
- `Projectory: View: By Tags` - Switch to grouped tag view
- `Projectory: Filter: By Tag...` - Filter projects by tag
- `Projectory: Reset All Data...` - Clear all extension data

## Tag System

Tags support priority levels for hierarchical organization:

- **Level 0** - Primary categories (e.g., "Work", "Personal")
- **Level 1** - Secondary categories (e.g., "Frontend", "Backend")
- **Level 2+** - Further subcategories

In "By Tags" view mode, projects are grouped according to tag priorities up to the configured grouping depth.

## Requirements

- VS Code 1.107.0 or higher

## Known Issues

Please report issues on [GitHub](https://github.com/epodivilov/projectory/issues).

## Release Notes

### 0.1.0

Initial release:
- Project scanning and tree view
- Git worktree detection
- Tag-based organization with priorities
- Recent folders tracking
- Smart folder save suggestions
- Drag & drop support
- Search functionality

## License

[MIT](LICENSE)
