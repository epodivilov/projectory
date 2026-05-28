import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { computeDisplayNames } from '../utils/path-utils';
import { WorkspaceHistoryService } from '../services/workspace-history-service';
import { TreeStateService } from '../services/tree-state-service';
import { hasLinkedWorktrees } from '../services/git-info-service';
import { ProjectsCacheService, type CachedProject } from '../services/projects-cache-service';
import { SavedProjectsService } from '../services/saved-projects-service';
import { ProjectMetadataService } from '../services/project-metadata-service';

/**
 * Minimal in-memory Memento for testing services that depend on globalState.
 */
function createMemento(): vscode.Memento {
	const store = new Map<string, unknown>();
	return {
		keys: () => [...store.keys()],
		get: (<T>(key: string, defaultValue?: T) =>
			store.has(key) ? (store.get(key) as T) : defaultValue) as vscode.Memento['get'],
		update: (key: string, value: unknown) => {
			store.set(key, value);
			return Promise.resolve();
		}
	};
}

suite('Projectory Extension Test Suite', () => {
	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('epodivilov.projectory'));
	});

	test('Extension should activate', async () => {
		const extension = vscode.extensions.getExtension('epodivilov.projectory');
		if (extension) {
			await extension.activate();
			assert.ok(extension.isActive);
		}
	});
});

suite('computeDisplayNames', () => {
	test('keeps unique leaf segments as-is', () => {
		const names = computeDisplayNames([
			'/code/alpha',
			'/code/beta',
			'/code/gamma'
		]);
		assert.strictEqual(names.get('/code/alpha'), 'alpha');
		assert.strictEqual(names.get('/code/beta'), 'beta');
		assert.strictEqual(names.get('/code/gamma'), 'gamma');
	});

	test('adds one parent on a simple collision', () => {
		const names = computeDisplayNames([
			'/code/3jane-api/root',
			'/code/3jane-web/root'
		]);
		assert.strictEqual(names.get('/code/3jane-api/root'), '3jane-api/root');
		assert.strictEqual(names.get('/code/3jane-web/root'), '3jane-web/root');
	});

	test('grows further when parents also collide', () => {
		const names = computeDisplayNames([
			'/code/a/x/root',
			'/code/a/y/root'
		]);
		assert.strictEqual(names.get('/code/a/x/root'), 'x/root');
		assert.strictEqual(names.get('/code/a/y/root'), 'y/root');
	});

	test('disambiguates only colliding paths in a mixed set', () => {
		const names = computeDisplayNames([
			'/code/api/root',
			'/code/web/root',
			'/code/dotfiles'
		]);
		assert.strictEqual(names.get('/code/api/root'), 'api/root');
		assert.strictEqual(names.get('/code/web/root'), 'web/root');
		assert.strictEqual(names.get('/code/dotfiles'), 'dotfiles');
	});

	test('handles Windows-style separators', () => {
		const names = computeDisplayNames([
			'C:\\dev\\api\\root',
			'C:\\dev\\web\\root'
		]);
		assert.strictEqual(names.get('C:\\dev\\api\\root'), 'api/root');
		assert.strictEqual(names.get('C:\\dev\\web\\root'), 'web/root');
	});
});

suite('WorkspaceHistoryService recent management', () => {
	test('removeFromHistory deletes only the given entry', () => {
		const service = new WorkspaceHistoryService(createMemento());
		service.recordOpen('/tmp/projectory-test-a');
		service.recordOpen('/tmp/projectory-test-b');

		service.removeFromHistory('/tmp/projectory-test-a');

		const paths = service.getHistorySorted().map((entry) => entry.path);
		assert.deepStrictEqual(paths, ['/tmp/projectory-test-b']);
	});

	test('removeFromHistory is a no-op for an unknown path', () => {
		const service = new WorkspaceHistoryService(createMemento());
		service.recordOpen('/tmp/projectory-test-a');

		service.removeFromHistory('/tmp/projectory-test-missing');

		assert.strictEqual(service.getHistorySorted().length, 1);
	});

	test('clearHistory removes all entries', () => {
		const service = new WorkspaceHistoryService(createMemento());
		service.recordOpen('/tmp/projectory-test-a');
		service.recordOpen('/tmp/projectory-test-b');

		service.clearHistory();

		assert.strictEqual(service.getHistorySorted().length, 0);
	});
});

suite('TreeStateService', () => {
	test('returns undefined for an untouched node', () => {
		const service = new TreeStateService(createMemento());
		assert.strictEqual(service.isExpanded('projects-root'), undefined);
	});

	test('persists expanded state', () => {
		const service = new TreeStateService(createMemento());
		service.setExpanded('recent-root', true);
		assert.strictEqual(service.isExpanded('recent-root'), true);
	});

	test('persists collapsed state', () => {
		const service = new TreeStateService(createMemento());
		service.setExpanded('projects-root', false);
		assert.strictEqual(service.isExpanded('projects-root'), false);
	});

	test('overwrites a previously stored state', () => {
		const service = new TreeStateService(createMemento());
		service.setExpanded('tag-work', true);
		service.setExpanded('tag-work', false);
		assert.strictEqual(service.isExpanded('tag-work'), false);
	});

	test('keeps independent state per node id', () => {
		const service = new TreeStateService(createMemento());
		service.setExpanded('projects-root', true);
		service.setExpanded('recent-root', false);
		assert.strictEqual(service.isExpanded('projects-root'), true);
		assert.strictEqual(service.isExpanded('recent-root'), false);
	});

	test('reads state back from a shared memento (survives restart)', () => {
		const memento = createMemento();
		new TreeStateService(memento).setExpanded('recent-root', true);
		// A fresh service over the same store simulates a new session.
		assert.strictEqual(new TreeStateService(memento).isExpanded('recent-root'), true);
	});
});

suite('hasLinkedWorktrees', () => {
	let tmpDir: string;

	setup(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectory-wt-'));
	});

	teardown(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test('returns false when .git/worktrees is absent', () => {
		fs.mkdirSync(path.join(tmpDir, '.git'));
		assert.strictEqual(hasLinkedWorktrees(tmpDir), false);
	});

	test('returns false when .git/worktrees exists but is empty', () => {
		fs.mkdirSync(path.join(tmpDir, '.git', 'worktrees'), { recursive: true });
		assert.strictEqual(hasLinkedWorktrees(tmpDir), false);
	});

	test('returns true when .git/worktrees contains an entry', () => {
		fs.mkdirSync(path.join(tmpDir, '.git', 'worktrees', 'feature-x'), { recursive: true });
		assert.strictEqual(hasLinkedWorktrees(tmpDir), true);
	});
});

suite('ProjectsCacheService', () => {
	const sample: CachedProject[] = [
		{ path: '/code/alpha', name: 'alpha', isGitRepo: true, hasWorktrees: false },
		{ path: '/code/beta', name: 'beta', isGitRepo: true, hasWorktrees: true }
	];

	test('returns an empty array when the cache is untouched', () => {
		const service = new ProjectsCacheService(createMemento());
		assert.deepStrictEqual(service.get(), []);
	});

	test('round-trips a saved list', async () => {
		const service = new ProjectsCacheService(createMemento());
		await service.save(sample);
		assert.deepStrictEqual(service.get(), sample);
	});

	test('overwrites a previously cached list', async () => {
		const service = new ProjectsCacheService(createMemento());
		await service.save(sample);

		const next: CachedProject[] = [
			{ path: '/code/gamma', name: 'gamma', isGitRepo: false, hasWorktrees: false }
		];
		await service.save(next);
		assert.deepStrictEqual(service.get(), next);
	});

	test('clear() empties the cache', async () => {
		const service = new ProjectsCacheService(createMemento());
		await service.save(sample);
		await service.clear();
		assert.deepStrictEqual(service.get(), []);
	});

	test('survives a fresh service over the same memento', async () => {
		const memento = createMemento();
		await new ProjectsCacheService(memento).save(sample);
		// Simulates a new session sharing the same globalState.
		assert.deepStrictEqual(new ProjectsCacheService(memento).get(), sample);
	});
});

suite('SavedProjectsService marker logic', () => {
	// SavedProjectsService.getSavedProjects() filters by fs.existsSync, so the
	// marker logic only sees paths that exist on disk. We create real tmpdirs
	// per suite and tear them down after.
	let dirA: string;
	let dirB: string;

	setup(() => {
		dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'projectory-marker-a-'));
		dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'projectory-marker-b-'));
	});

	teardown(() => {
		fs.rmSync(dirA, { recursive: true, force: true });
		fs.rmSync(dirB, { recursive: true, force: true });
	});

	function makeServices() {
		const memento = createMemento();
		const saved = new SavedProjectsService(memento);
		const metadata = new ProjectMetadataService(memento);
		return { saved, metadata };
	}

	test('isMarked returns false for an unknown path', () => {
		const { saved, metadata } = makeServices();
		assert.strictEqual(saved.isMarked(dirA, metadata), false);
	});

	test('isMarked is true when only saved', () => {
		const { saved, metadata } = makeServices();
		saved.saveProject(dirA);
		assert.strictEqual(saved.isMarked(dirA, metadata), true);
	});

	test('isMarked is true when only tagged (no save record)', () => {
		const { saved, metadata } = makeServices();
		metadata.addTag(dirA, 'work');
		assert.strictEqual(saved.isMarked(dirA, metadata), true);
		// Sanity: tagging does NOT autosave — keeps Saved-vs-tagged distinction clean.
		assert.strictEqual(saved.isSaved(dirA), false);
	});

	test('isMarked is true when displayName set (autosaves via updateProject)', () => {
		const { saved, metadata } = makeServices();
		saved.updateProject(dirA, { displayName: 'Alpha' });
		assert.strictEqual(saved.isMarked(dirA, metadata), true);
	});

	test('isMarked is true when description set (autosaves via updateProject)', () => {
		const { saved, metadata } = makeServices();
		saved.updateProject(dirA, { description: 'main work repo' });
		assert.strictEqual(saved.isMarked(dirA, metadata), true);
	});

	test('clearAllMarkers strips save record, tags, displayName and description', () => {
		const { saved, metadata } = makeServices();
		saved.updateProject(dirA, { displayName: 'Alpha', description: 'main repo' });
		metadata.addTag(dirA, 'work');
		assert.strictEqual(saved.isMarked(dirA, metadata), true);

		saved.clearAllMarkers(dirA, metadata);

		assert.strictEqual(saved.isMarked(dirA, metadata), false);
		assert.strictEqual(saved.isSaved(dirA), false);
		assert.deepStrictEqual(metadata.getTags(dirA), []);
		assert.strictEqual(saved.getDisplayName(dirA), undefined);
		assert.strictEqual(saved.getDescription(dirA), undefined);
	});

	test('clearAllMarkers leaves other paths untouched', () => {
		const { saved, metadata } = makeServices();
		saved.saveProject(dirA);
		saved.saveProject(dirB);
		metadata.addTag(dirB, 'work');

		saved.clearAllMarkers(dirA, metadata);

		assert.strictEqual(saved.isMarked(dirA, metadata), false);
		assert.strictEqual(saved.isMarked(dirB, metadata), true);
	});
});
