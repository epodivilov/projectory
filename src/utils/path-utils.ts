import * as fs from 'fs';

/**
 * Normalize path to canonical form using realpath.
 * Handles case differences on case-insensitive filesystems (Mac/Windows)
 * and resolves symlinks.
 *
 * @param filePath - Path to normalize
 * @returns Canonical path, or original path if resolution fails
 */
export function normalizePath(filePath: string): string {
	try {
		return fs.realpathSync(filePath);
	} catch {
		return filePath;
	}
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
