import { spawn } from 'child_process';
import type * as vscode from 'vscode';

const MAX_CONCURRENCY = 5;
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
	promise: Promise<string>;
	expiresAt: number;
}

let activeCount = 0;
const waitQueue: Array<() => void> = [];
const cache = new Map<string, CacheEntry>();

function acquireSlot(): Promise<void> {
	if (activeCount < MAX_CONCURRENCY) {
		activeCount++;
		return Promise.resolve();
	}
	return new Promise<void>((resolve) => {
		waitQueue.push(resolve);
	});
}

function releaseSlot(): void {
	const next = waitQueue.shift();
	if (next) {
		next();
	} else {
		activeCount--;
	}
}

export function invalidateCache(cwd: string): void {
	const prefix = cwd + '\0';
	for (const key of cache.keys()) {
		if (key.startsWith(prefix)) {
			cache.delete(key);
		}
	}
}

export function runGit(args: string[], cwd: string, token?: vscode.CancellationToken): Promise<string> {
	// Bypass cache when a CancellationToken is provided: a cancellable process
	// must not be shared across callers since killing it would affect all of them.
	if (!token) {
		const cacheKey = cwd + '\0' + args.join('\0');
		const entry = cache.get(cacheKey);
		if (entry && entry.expiresAt > Date.now()) {
			return entry.promise;
		}

		const promise = spawnGit(args, cwd, token);
		cache.set(cacheKey, { promise, expiresAt: Date.now() + CACHE_TTL_MS });
		// Remove entry from cache when the promise settles (on error) so stale
		// failures don't get served from cache.
		promise.catch(() => {
			const current = cache.get(cacheKey);
			if (current && current.promise === promise) {
				cache.delete(cacheKey);
			}
		});
		return promise;
	}

	return spawnGit(args, cwd, token);
}

async function spawnGit(args: string[], cwd: string, token?: vscode.CancellationToken): Promise<string> {
	await acquireSlot();

	return new Promise<string>((resolve, reject) => {
		const proc = spawn('git', args, { cwd });

		let tokenListener: vscode.Disposable | undefined;
		let released = false;
		const release = () => {
			if (released) { return; }
			released = true;
			tokenListener?.dispose();
			releaseSlot();
		};

		if (token) {
			tokenListener = token.onCancellationRequested(() => {
				proc.kill();
				reject(new Error('git operation cancelled'));
			});
		}

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

		proc.on('close', (code) => {
			release();

			if (code === 0) {
				resolve(Buffer.concat(stdoutChunks).toString('utf-8'));
			} else {
				const stderr = Buffer.concat(stderrChunks).toString('utf-8');
				reject(new Error(`git ${args[0]} exited with code ${code}: ${stderr}`));
			}
		});

		proc.on('error', (err) => {
			release();
			reject(err);
		});
	});
}
