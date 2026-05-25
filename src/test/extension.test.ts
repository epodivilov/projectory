import * as assert from 'assert';
import * as vscode from 'vscode';
import { computeDisplayNames } from '../utils/path-utils';

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
