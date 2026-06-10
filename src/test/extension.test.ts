import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { computeDisplayNames } from '../utils/path-utils';
import { WorkspaceHistoryService } from '../services/workspace-history-service';
import { TreeStateService } from '../services/tree-state-service';
import { hasLinkedWorktrees, parseWorktreeOutput } from '../services/git-info-service';
import { ProjectsCacheService, type CachedProject } from '../services/projects-cache-service';
import { SavedProjectsService } from '../services/saved-projects-service';
import { ProjectMetadataService } from '../services/project-metadata-service';
import { StateStore } from '../core/state-store';
import { partitionScannedSaved, filterProjectsWithAllTags, countPathsUnder } from '../core/project-logic';

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

/**
 * Create a spy Memento that records update calls.
 */
function createSpyMemento(): { memento: vscode.Memento; updates: Array<{ key: string; value: unknown }> } {
	const store = new Map<string, unknown>();
	const updates: Array<{ key: string; value: unknown }> = [];
	const memento: vscode.Memento = {
		keys: () => [...store.keys()],
		get: (<T>(key: string, defaultValue?: T) =>
			store.has(key) ? (store.get(key) as T) : defaultValue) as vscode.Memento['get'],
		update: (key: string, value: unknown) => {
			updates.push({ key, value });
			if (value === undefined) {
				store.delete(key);
			} else {
				store.set(key, value);
			}
			return Promise.resolve();
		}
	};
	return { memento, updates };
}

/**
 * Create a StateStore backed by a plain createMemento().
 */
function createStateStore(): StateStore {
	return new StateStore(createMemento());
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
		const service = new WorkspaceHistoryService(createStateStore());
		service.recordOpen('/tmp/projectory-test-a');
		service.recordOpen('/tmp/projectory-test-b');

		service.removeFromHistory('/tmp/projectory-test-a');

		const paths = service.getHistorySorted().map((entry) => entry.path);
		assert.deepStrictEqual(paths, ['/tmp/projectory-test-b']);
	});

	test('removeFromHistory is a no-op for an unknown path', () => {
		const service = new WorkspaceHistoryService(createStateStore());
		service.recordOpen('/tmp/projectory-test-a');

		service.removeFromHistory('/tmp/projectory-test-missing');

		assert.strictEqual(service.getHistorySorted().length, 1);
	});

	test('clearHistory removes all entries', () => {
		const service = new WorkspaceHistoryService(createStateStore());
		service.recordOpen('/tmp/projectory-test-a');
		service.recordOpen('/tmp/projectory-test-b');

		service.clearHistory();

		assert.strictEqual(service.getHistorySorted().length, 0);
	});
});

suite('TreeStateService', () => {
	test('returns undefined for an untouched node', () => {
		const service = new TreeStateService(createStateStore());
		assert.strictEqual(service.isExpanded('projects-root'), undefined);
	});

	test('persists expanded state', () => {
		const service = new TreeStateService(createStateStore());
		service.setExpanded('recent-root', true);
		assert.strictEqual(service.isExpanded('recent-root'), true);
	});

	test('persists collapsed state', () => {
		const service = new TreeStateService(createStateStore());
		service.setExpanded('projects-root', false);
		assert.strictEqual(service.isExpanded('projects-root'), false);
	});

	test('overwrites a previously stored state', () => {
		const service = new TreeStateService(createStateStore());
		service.setExpanded('tag-work', true);
		service.setExpanded('tag-work', false);
		assert.strictEqual(service.isExpanded('tag-work'), false);
	});

	test('keeps independent state per node id', () => {
		const service = new TreeStateService(createStateStore());
		service.setExpanded('projects-root', true);
		service.setExpanded('recent-root', false);
		assert.strictEqual(service.isExpanded('projects-root'), true);
		assert.strictEqual(service.isExpanded('recent-root'), false);
	});

	test('reads state back from a shared store (survives restart)', async () => {
		const memento = createMemento();
		const storeA = new StateStore(memento);
		new TreeStateService(storeA).setExpanded('recent-root', true);
		// Flush to ensure the memento is updated before creating a new store.
		await storeA.flush();
		// A fresh store over the same memento simulates a new session.
		const storeB = new StateStore(memento);
		assert.strictEqual(new TreeStateService(storeB).isExpanded('recent-root'), true);
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

	test('returns false when .git/worktrees is absent', async () => {
		fs.mkdirSync(path.join(tmpDir, '.git'));
		assert.strictEqual(await hasLinkedWorktrees(tmpDir), false);
	});

	test('returns false when .git/worktrees exists but is empty', async () => {
		fs.mkdirSync(path.join(tmpDir, '.git', 'worktrees'), { recursive: true });
		assert.strictEqual(await hasLinkedWorktrees(tmpDir), false);
	});

	test('returns true when .git/worktrees contains an entry', async () => {
		fs.mkdirSync(path.join(tmpDir, '.git', 'worktrees', 'feature-x'), { recursive: true });
		assert.strictEqual(await hasLinkedWorktrees(tmpDir), true);
	});
});

suite('ProjectsCacheService', () => {
	const sample: CachedProject[] = [
		{ path: '/code/alpha', name: 'alpha', isGitRepo: true, hasWorktrees: false },
		{ path: '/code/beta', name: 'beta', isGitRepo: true, hasWorktrees: true }
	];

	test('returns an empty array when the cache is untouched', () => {
		const service = new ProjectsCacheService(createStateStore());
		assert.deepStrictEqual(service.get(), []);
	});

	test('round-trips a saved list', async () => {
		const service = new ProjectsCacheService(createStateStore());
		await service.save(sample);
		assert.deepStrictEqual(service.get(), sample);
	});

	test('overwrites a previously cached list', async () => {
		const service = new ProjectsCacheService(createStateStore());
		await service.save(sample);

		const next: CachedProject[] = [
			{ path: '/code/gamma', name: 'gamma', isGitRepo: false, hasWorktrees: false }
		];
		await service.save(next);
		assert.deepStrictEqual(service.get(), next);
	});

	test('clear() empties the cache', async () => {
		const service = new ProjectsCacheService(createStateStore());
		await service.save(sample);
		await service.clear();
		assert.deepStrictEqual(service.get(), []);
	});

	test('survives a fresh store over the same memento', async () => {
		const memento = createMemento();
		const storeA = new StateStore(memento);
		await new ProjectsCacheService(storeA).save(sample);
		await storeA.flush();
		// Simulates a new session sharing the same globalState.
		const storeB = new StateStore(memento);
		assert.deepStrictEqual(new ProjectsCacheService(storeB).get(), sample);
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
		const store = createStateStore();
		const saved = new SavedProjectsService(store);
		const metadata = new ProjectMetadataService(store);
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

suite('StateStore', () => {
	test('read-your-writes: get returns updated value immediately after update', () => {
		const { memento } = createSpyMemento();
		const store = new StateStore(memento);
		store.update('excludedPaths', ['/some/path']);
		assert.deepStrictEqual(store.get('excludedPaths', []), ['/some/path']);
	});

	test('debounce coalescing: multiple updates to same key produce single persist', async () => {
		const { memento, updates } = createSpyMemento();
		const store = new StateStore(memento);
		store.update('excludedPaths', ['/a']);
		store.update('excludedPaths', ['/b']);
		store.update('excludedPaths', ['/c']);
		await store.flush();
		const calls = updates.filter((u) => u.key === 'excludedPaths');
		assert.strictEqual(calls.length, 1);
		assert.deepStrictEqual(calls[0].value, ['/c']);
	});

	test('concurrent writes serialized: all dirty keys persisted with last-written values', async () => {
		const { memento, updates } = createSpyMemento();
		const store = new StateStore(memento);
		store.update('excludedPaths', ['/x']);
		store.update('ignoredSuggestionPaths', ['/y']);
		await store.flush();
		const excludedCalls = updates.filter((u) => u.key === 'excludedPaths');
		const ignoredCalls = updates.filter((u) => u.key === 'ignoredSuggestionPaths');
		assert.strictEqual(excludedCalls.length, 1);
		assert.deepStrictEqual(excludedCalls[0].value, ['/x']);
		assert.strictEqual(ignoredCalls.length, 1);
		assert.deepStrictEqual(ignoredCalls[0].value, ['/y']);
	});

	test('flush: memento.update called with pending value immediately', async () => {
		const { memento, updates } = createSpyMemento();
		const store = new StateStore(memento);
		store.update('excludedPaths', ['/flush-test']);
		assert.strictEqual(updates.filter((u) => u.key === 'excludedPaths').length, 0);
		await store.flush();
		const calls = updates.filter((u) => u.key === 'excludedPaths');
		assert.strictEqual(calls.length, 1);
		assert.deepStrictEqual(calls[0].value, ['/flush-test']);
	});

	test('undefined clear: update with undefined then no-default get returns undefined', async () => {
		const { memento } = createSpyMemento();
		const store = new StateStore(memento);
		store.update('projectory.scannedProjectsCache', [{ path: '/p', name: 'p', isGitRepo: true, hasWorktrees: false }]);
		store.update('projectory.scannedProjectsCache', undefined);
		assert.strictEqual(store.get('projectory.scannedProjectsCache'), undefined);
	});
});

suite('countPathsUnder', () => {
	test('counts entries strictly nested under the parent', () => {
		const paths = ['/home/u/foo', '/home/u/bar/baz', '/home/u/bar'];
		assert.strictEqual(countPathsUnder(paths, '/home/u', '/'), 3);
		assert.strictEqual(countPathsUnder(paths, '/home/u/bar', '/'), 1);
	});

	test('does not count the parent path itself', () => {
		assert.strictEqual(countPathsUnder(['/home/u'], '/home/u', '/'), 0);
	});

	test('does not count a sibling sharing a name prefix', () => {
		assert.strictEqual(countPathsUnder(['/foobar', '/foobar/x'], '/foo', '/'), 0);
	});

	test('handles a parent path with a trailing separator', () => {
		assert.strictEqual(countPathsUnder(['/a/b'], '/a/', '/'), 1);
	});
});

suite('partitionScannedSaved', () => {
	type P = { path: string };
	const p = (path: string): P => ({ path });

	test('deduplicates saved by scanned paths', () => {
		const scanned = [p('/code/alpha'), p('/code/beta')];
		const saved = [p('/code/alpha'), p('/code/gamma')];
		const { filteredScanned, uniqueSavedCandidates } = partitionScannedSaved(scanned, saved, []);
		assert.deepStrictEqual(filteredScanned.map((x) => x.path), ['/code/alpha', '/code/beta']);
		assert.deepStrictEqual(uniqueSavedCandidates.map((x) => x.path), ['/code/gamma']);
	});

	test('removes excluded paths from scanned', () => {
		const scanned = [p('/code/alpha'), p('/code/beta'), p('/code/gamma')];
		const saved: P[] = [];
		const { filteredScanned } = partitionScannedSaved(scanned, saved, ['/code/beta']);
		assert.deepStrictEqual(filteredScanned.map((x) => x.path), ['/code/alpha', '/code/gamma']);
	});

	test('empty inputs produce empty outputs', () => {
		const { filteredScanned, uniqueSavedCandidates } = partitionScannedSaved([], [], []);
		assert.deepStrictEqual(filteredScanned, []);
		assert.deepStrictEqual(uniqueSavedCandidates, []);
	});

	test('all saved already in scanned → empty uniqueSavedCandidates', () => {
		const scanned = [p('/code/a'), p('/code/b')];
		const saved = [p('/code/a'), p('/code/b')];
		const { uniqueSavedCandidates } = partitionScannedSaved(scanned, saved, []);
		assert.deepStrictEqual(uniqueSavedCandidates, []);
	});
});

suite('filterProjectsWithAllTags', () => {
	type P = { path: string };
	const p = (path: string): P => ({ path });

	const tags: Record<string, string[]> = {
		'/code/alpha': ['work', 'frontend'],
		'/code/beta': ['work', 'backend'],
		'/code/gamma': ['personal'],
		'/code/delta': [],
	};
	const getTags = (path: string): string[] => tags[path] ?? [];

	test('matches projects with all specified tags', () => {
		const projects = [p('/code/alpha'), p('/code/beta'), p('/code/gamma')];
		const result = filterProjectsWithAllTags(projects, getTags, ['work']);
		assert.deepStrictEqual(result.map((x) => x.path), ['/code/alpha', '/code/beta']);
	});

	test('missing any tag excludes the project', () => {
		const projects = [p('/code/alpha'), p('/code/beta')];
		const result = filterProjectsWithAllTags(projects, getTags, ['work', 'frontend']);
		assert.deepStrictEqual(result.map((x) => x.path), ['/code/alpha']);
	});

	test('empty tagIds returns all projects', () => {
		const projects = [p('/code/alpha'), p('/code/beta'), p('/code/gamma')];
		const result = filterProjectsWithAllTags(projects, getTags, []);
		assert.deepStrictEqual(result.length, 3);
	});

	test('project with no tags is excluded when tagIds is non-empty', () => {
		const projects = [p('/code/delta')];
		const result = filterProjectsWithAllTags(projects, getTags, ['work']);
		assert.deepStrictEqual(result, []);
	});
});

suite('parseWorktreeOutput', () => {
	test('main worktree is named root', () => {
		const output = [
			'worktree /repo/main',
			'HEAD abc1234',
			'branch refs/heads/main',
			''
		].join('\n');
		const result = parseWorktreeOutput(output, '/repo/main');
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].name, 'root');
		assert.strictEqual(result[0].isMain, true);
	});

	test('linked worktree uses branch name', () => {
		const output = [
			'worktree /repo/main',
			'HEAD abc1234',
			'branch refs/heads/main',
			'',
			'worktree /repo/.worktrees/feature-x',
			'HEAD def5678',
			'branch refs/heads/feature-x',
			''
		].join('\n');
		const result = parseWorktreeOutput(output, '/repo/main');
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[1].name, 'feature-x');
		assert.strictEqual(result[1].branch, 'feature-x');
		assert.strictEqual(result[1].isMain, false);
	});

	test('detached HEAD yields short-sha branch and detached name', () => {
		const output = [
			'worktree /repo/main',
			'HEAD abc1234',
			'branch refs/heads/main',
			'',
			'worktree /repo/.worktrees/detached-wt',
			'HEAD abcdef1',
			'detached',
			''
		].join('\n');
		const result = parseWorktreeOutput(output, '/repo/main');
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[1].name, 'detached');
		assert.strictEqual(result[1].branch, '(abcdef1)');
	});

	test('bare entries are skipped', () => {
		const output = [
			'worktree /repo/main',
			'HEAD abc1234',
			'branch refs/heads/main',
			'',
			'worktree /repo/bare',
			'HEAD 0000000',
			'bare',
			''
		].join('\n');
		const result = parseWorktreeOutput(output, '/repo/main');
		assert.strictEqual(result.length, 1);
	});

	test('empty input returns empty array', () => {
		assert.deepStrictEqual(parseWorktreeOutput('', '/repo/main'), []);
	});
});
