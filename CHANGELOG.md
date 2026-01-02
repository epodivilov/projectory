# Changelog

All notable changes to the "Projectory" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-01-02

### Added
- Extension icon for VS Code Marketplace
- Sponsor link (GitHub Sponsors)

## [0.1.0] - 2025-01-02

### Added
- Project tree view in Activity Bar sidebar
- Automatic git repository detection in root folder
- Git worktree support with parent-child grouping
- Tag system with priority-based hierarchical grouping
- Recent folders section with VS Code workspace history integration
- Smart folder suggestions for frequently opened directories
- Drag & drop support for project organization
- Quick search across all projects
- Multiple view modes: flat list and grouped by tags
- Sorting by name or last opened date
- Tag filtering with multi-select
- Configurable scan depth and exclude patterns
- Project details panel with git information

### Configuration
- `projectory.rootFolder` - Projects root folder
- `projectory.viewMode` - Flat or grouped display
- `projectory.sortOrder` - Sort by recent or alphabetical
- `projectory.sortDirection` - Ascending or descending
- `projectory.showRecentFolders` - Toggle recent folders section
- `projectory.tags` - Tag definitions with priorities
- `projectory.groupingDepth` - Tag hierarchy depth
- `projectory.maxScanDepth` - Folder scan depth limit
- `projectory.excludePatterns` - Folders to skip during scan
- `projectory.suggestFrequentFolders` - Enable folder suggestions
- `projectory.suggestMinOpenCount` - Minimum opens for suggestion
- `projectory.suggestTimePeriodDays` - Suggestion time window
