import * as fs from 'fs';

// realpathSync is a blocking disk syscall, and normalizePath sits on the
// hottest render path (isSaved/isMarked run it per project per repaint).
// Memoize per session: project paths don't move while VS Code is running.
// CPU-profiled before the cache: 26s of 40s spent inside realpathSync.
const realpathCache = new Map<string, string>();

/**
 * Normalize path to canonical form using realpath.
 * Handles case differences on case-insensitive filesystems (Mac/Windows)
 * and resolves symlinks. Results are memoized for the session.
 *
 * @param filePath - Path to normalize
 * @returns Canonical path, or original path if resolution fails
 */
export function normalizePath(filePath: string): string {
	const cached = realpathCache.get(filePath);
	if (cached !== undefined) {
		return cached;
	}
	let result: string;
	try {
		result = fs.realpathSync(filePath);
	} catch {
		result = filePath;
	}
	realpathCache.set(filePath, result);
	return result;
}

/**
 * Create a Set of normalized paths for efficient lookup.
 *
 * @param paths - Array of paths to normalize
 * @returns Set of normalized paths
 */
export function createNormalizedPathSet(paths: string[]): Set<string> {
	return new Set(paths.map(normalizePath));
}

/**
 * Check if a normalized path set contains the given path.
 *
 * @param pathSet - Set of normalized paths
 * @param path - Path to check
 * @returns true if path is in the set
 */
export function normalizedSetHas(pathSet: Set<string>, path: string): boolean {
	return pathSet.has(normalizePath(path));
}

/**
 * Split a filesystem path into non-empty segments.
 * Handles both POSIX and Windows separators regardless of host platform.
 */
function splitSegments(filePath: string): string[] {
	return filePath.split(/[\\/]/).filter((segment) => segment.length > 0);
}

/**
 * Compute display names for a set of paths, disambiguating only where needed.
 *
 * Each name starts as the path's last segment (leaf). Whenever two or more
 * paths share the same name, the colliding ones grow by one more parent
 * segment until every name is unique (or its path runs out of segments).
 * Names are joined with '/' for consistent cross-platform display.
 *
 * Examples:
 *   ['/code/alpha', '/code/beta']          -> alpha, beta
 *   ['/code/api/root', '/code/web/root']   -> api/root, web/root
 *   ['/a/x/root', '/a/y/root']             -> x/root, y/root
 *
 * @param paths - Project/folder paths to name
 * @returns Map from each input path to its disambiguated display name
 */
export function computeDisplayNames(paths: string[]): Map<string, string> {
	const segments = new Map<string, string[]>();
	const depth = new Map<string, number>();
	for (const p of paths) {
		segments.set(p, splitSegments(p));
		depth.set(p, 1);
	}

	const nameFor = (p: string): string => {
		const segs = segments.get(p)!;
		const used = Math.min(depth.get(p)!, segs.length);
		return segs.slice(segs.length - used).join('/');
	};

	let changed = true;
	while (changed) {
		changed = false;

		const groups = new Map<string, string[]>();
		for (const p of paths) {
			const name = nameFor(p);
			const members = groups.get(name);
			if (members) {
				members.push(p);
			} else {
				groups.set(name, [p]);
			}
		}

		for (const members of groups.values()) {
			if (members.length < 2) {
				continue;
			}
			// Grow only the colliding paths that still have parents to add.
			for (const p of members) {
				const segs = segments.get(p)!;
				if (depth.get(p)! < segs.length) {
					depth.set(p, depth.get(p)! + 1);
					changed = true;
				}
			}
		}
	}

	const result = new Map<string, string>();
	for (const p of paths) {
		result.set(p, nameFor(p));
	}
	return result;
}
