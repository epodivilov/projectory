import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Projectory Extension Test Suite', () => {
	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('projectory'));
	});

	test('Extension should activate', async () => {
		const extension = vscode.extensions.getExtension('projectory');
		if (extension) {
			await extension.activate();
			assert.ok(extension.isActive);
		}
	});
});
