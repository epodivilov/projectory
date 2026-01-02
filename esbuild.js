const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copy codicons assets to dist folder for webview usage
 */
function copyCodeicons() {
	const srcDir = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist');
	const destDir = path.join(__dirname, 'dist', 'codicons');

	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true });
	}

	const files = ['codicon.css', 'codicon.ttf'];
	for (const file of files) {
		const src = path.join(srcDir, file);
		const dest = path.join(destDir, file);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, dest);
		}
	}
	console.log('[build] codicons copied to dist/codicons');
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(`    ${location.file}:${location.line}:${location.column}:`);
				}
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	// Copy codicons before building
	copyCodeicons();

	// Extension build (Node.js)
	const extensionCtx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	// Webview builds (Browser)
	const webviewCtx = await esbuild.context({
		entryPoints: [
			'src/webview/details-view.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outdir: 'dist/webview',
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	if (watch) {
		await Promise.all([
			extensionCtx.watch(),
			webviewCtx.watch()
		]);
	} else {
		await Promise.all([
			extensionCtx.rebuild(),
			webviewCtx.rebuild()
		]);
		await extensionCtx.dispose();
		await webviewCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
