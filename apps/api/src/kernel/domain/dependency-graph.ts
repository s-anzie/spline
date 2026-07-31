interface DependencyNode {
  dependencies: readonly string[];
}

/**
 * True if giving `nodeId` these `candidateDependencyIds` would create a
 * cycle — i.e. if any candidate already (transitively) depends on nodeId.
 * Shared by any module with a self-referencing dependency graph (Task, Goal).
 */
export function wouldCreateCycle(
  nodeId: string,
  candidateDependencyIds: string[],
  nodesById: ReadonlyMap<string, DependencyNode>,
): boolean {
  const visited = new Set<string>();

  function dependsOn(fromId: string, targetId: string): boolean {
    if (fromId === targetId) {
      return true;
    }
    if (visited.has(fromId)) {
      return false;
    }
    visited.add(fromId);

    const node = nodesById.get(fromId);
    if (!node) {
      return false;
    }
    return node.dependencies.some((dependencyId) => dependsOn(dependencyId, targetId));
  }

  return candidateDependencyIds.some((dependencyId) => dependsOn(dependencyId, nodeId));
}
