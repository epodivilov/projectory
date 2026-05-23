import * as assert from 'assert';
import * as vscode from 'vscode';

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
