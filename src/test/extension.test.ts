import * as assert from 'assert';
import * as vscode from 'vscode';
import { computeDisplayNames } from '../utils/path-utils';
import { WorkspaceHistoryService } from '../services/workspace-history-service';
import { TreeStateService } from '../services/tree-state-service';

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
