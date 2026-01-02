import * as vscode from 'vscode';
import { ProjectTreeItem } from '../providers/projects-tree-provider';
import { TagTreeItem } from '../providers/base-tree-item';
import type { CommandContext, CommandDisposable } from './types';

/**
 * Register tag-related commands (create, rename, delete, edit, priority)
 */
export function registerTagCommands(ctx: CommandContext): CommandDisposable[] {
	const createTagCommand = vscode.commands.registerCommand(
		'projectory.createTag',
		async () => {
			const name = await vscode.window.showInputBox({
				prompt: 'Enter tag name',
				placeHolder: 'work',
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Tag name is required';
					}
					if (ctx.tagService.findByName(value.trim())) {
						return 'Tag already exists';
					}
					return null;
				}
			});

			if (!name) {
				return;
			}

			const maxPriority = ctx.tagService.getMaxPriority();
			const priorityItems: vscode.QuickPickItem[] = [];

			for (let i = 0; i <= maxPriority; i++) {
				const tagsAtLevel = ctx.tagService.getTagsByPriority(i);
				const tagNames = tagsAtLevel.map((t) => t.name).join(', ');
				priorityItems.push({
					label: `Level ${i}`,
					description: tagNames ? `(${tagNames})` : '(empty)',
					detail: i === 0 ? 'Top level grouping' : `${i} level${i > 1 ? 's' : ''} deep`
				});
			}

			priorityItems.push({
				label: `Level ${maxPriority + 1}`,
				description: '(new level)',
				detail: 'Create a new deeper grouping level'
			});

			const pickedPriority = await vscode.window.showQuickPick(priorityItems, {
				placeHolder: 'Select priority level for tag grouping'
			});

			if (pickedPriority) {
				const priority = parseInt(pickedPriority.label.replace('Level ', ''), 10);
				await ctx.tagService.createTag(name.trim(), priority);
				ctx.projectsTreeProvider.fireChange();
			}
		}
	);

	const renameTagCommand = vscode.commands.registerCommand(
		'projectory.renameTag',
		async (item: TagTreeItem) => {
			const oldName = item.tag.name;
			const newName = await vscode.window.showInputBox({
				prompt: 'Enter new tag name',
				value: oldName,
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Tag name is required';
					}
					if (value.trim() !== oldName && ctx.tagService.findByName(value.trim())) {
						return 'Tag already exists';
					}
					return null;
				}
			});

			if (newName && newName.trim() !== oldName) {
				const trimmedNewName = await ctx.tagService.renameTag(oldName, newName.trim());
				ctx.metadataService.renameTagInAll(oldName, trimmedNewName);
				await ctx.projectsTreeProvider.refresh();
			}
		}
	);

	const deleteTagCommand = vscode.commands.registerCommand(
		'projectory.deleteTag',
		async (item: TagTreeItem) => {
			const confirm = await vscode.window.showWarningMessage(
				`Delete tag "${item.tag.name}"?`,
				{ modal: true },
				'Delete'
			);

			if (confirm === 'Delete') {
				ctx.metadataService.clearTagFromAll(item.tag.name);
				await ctx.tagService.deleteTag(item.tag.name);
				await ctx.projectsTreeProvider.refresh();
			}
		}
	);

	const editProjectTagsCommand = vscode.commands.registerCommand(
		'projectory.editProjectTags',
		async (item: ProjectTreeItem) => {
			const CREATE_TAG_LABEL = '$(add) Create new tag...';

			const showTagPicker = async (): Promise<void> => {
				const allTags = ctx.tagService.getTags();
				const currentTagNames = ctx.metadataService.getTags(item.project.path);

				const sortedTags = [...allTags].sort((a, b) => {
					if (a.priority !== b.priority) {
						return a.priority - b.priority;
					}
					return a.name.localeCompare(b.name);
				});

				const tagItems: (vscode.QuickPickItem & { tagName: string; isCreateNew?: boolean })[] = sortedTags.map((t) => ({
					label: t.name,
					description: `Level ${t.priority}`,
					tagName: t.name,
					picked: currentTagNames.includes(t.name)
				}));

				tagItems.push({
					label: CREATE_TAG_LABEL,
					description: '',
					tagName: '',
					isCreateNew: true
				});

				const picked = await vscode.window.showQuickPick(tagItems, {
					placeHolder: allTags.length === 0 ? 'No tags yet. Create one!' : 'Toggle tags for this project',
					canPickMany: true
				});

				if (picked === undefined) {
					return;
				}

				const createNewSelected = picked.some((p) => p.isCreateNew);
				if (createNewSelected) {
					const tagName = await vscode.window.showInputBox({
						placeHolder: 'Enter new tag name',
						prompt: 'Create a new tag'
					});

					if (tagName && tagName.trim()) {
						const trimmedName = tagName.trim();
						await ctx.tagService.createTag(trimmedName, 0);
						await showTagPicker();
						return;
					}
				}

				const newTagNames = picked.filter((p) => !p.isCreateNew).map((p) => p.tagName);
				ctx.metadataService.setTags(item.project.path, newTagNames);
				ctx.projectsTreeProvider.fireChange();
			};

			await showTagPicker();
		}
	);

	const changeTagPriorityCommand = vscode.commands.registerCommand(
		'projectory.changeTagPriority',
		async (item: TagTreeItem) => {
			const maxPriority = ctx.tagService.getMaxPriority();
			const items: vscode.QuickPickItem[] = [];

			for (let i = 0; i <= maxPriority + 1; i++) {
				const tagsAtLevel = ctx.tagService.getTagsByPriority(i).filter((t) => t.name !== item.tag.name);
				const tagNames = tagsAtLevel.map((t) => t.name).join(', ');
				items.push({
					label: `Level ${i}`,
					description: i === item.tag.priority ? '(current)' : tagNames ? `(${tagNames})` : undefined,
					detail: i === 0 ? 'Top level grouping' : `${i} level${i > 1 ? 's' : ''} deep`
				});
			}

			const picked = await vscode.window.showQuickPick(items, {
				placeHolder: `Change priority for "${item.tag.name}"`
			});

			if (picked) {
				const priority = parseInt(picked.label.replace('Level ', ''), 10);
				await ctx.tagService.updatePriority(item.tag.name, priority);
				ctx.projectsTreeProvider.fireChange();
			}
		}
	);

	return [
		createTagCommand,
		renameTagCommand,
		deleteTagCommand,
		editProjectTagsCommand,
		changeTagPriorityCommand
	];
}
