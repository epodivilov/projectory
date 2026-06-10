/**
 * Pure, vscode-free project logic helpers.
 * No vscode import — safe to unit-test without an extension host.
 */

/**
 * Partition scanned projects into:
 * - filteredScanned: scanned entries minus excluded paths
 * - uniqueSavedCandidates: saved entries not already present in filteredScanned
 *
 * The caller is responsible for the async fs.promises.access existence filter
 * on uniqueSavedCandidates before merging into the final project list.
 */
export function partitionScannedSaved<T extends { path: string }>(
  scanned: T[],
  saved: T[],
  excludedPaths: string[]
): { filteredScanned: T[]; uniqueSavedCandidates: T[] } {
  const filteredScanned = scanned.filter((p) => !excludedPaths.includes(p.path));
  const scannedPaths = new Set(filteredScanned.map((p) => p.path));
  const uniqueSavedCandidates = saved.filter((p) => !scannedPaths.has(p.path));
  return { filteredScanned, uniqueSavedCandidates };
}

/**
 * Filter projects that have ALL of the specified tag IDs.
 * When tagIds is empty, all projects are returned.
 */
export function filterProjectsWithAllTags<T extends { path: string }>(
  projects: T[],
  getTags: (path: string) => string[],
  tagIds: string[]
): T[] {
  if (tagIds.length === 0) {
    return projects;
  }
  return projects.filter((project) => {
    const projectTags = getTags(project.path);
    return tagIds.every((tagId) => projectTags.includes(tagId));
  });
}
