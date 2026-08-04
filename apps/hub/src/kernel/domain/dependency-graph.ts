import { DomainError } from "./domain-error";
import { Result } from "./result";

export class DependencyCycleError extends DomainError {
  constructor(node: string, dependsOn: string) {
    super(`Adding "${node}" → "${dependsOn}" would create a dependency cycle`);
  }
}

/**
 * DAG primitive backing the Scheduler (v3 spec §9.5): cycles are rejected at
 * insertion time, and readiness is a pure function of the completed set.
 * Node insertion order is preserved in every listing for determinism.
 */
export class DependencyGraph {
  /** node -> its direct dependencies */
  private readonly dependencies = new Map<string, Set<string>>();

  addNode(id: string): void {
    if (!this.dependencies.has(id)) {
      this.dependencies.set(id, new Set());
    }
  }

  addDependency(node: string, dependsOn: string): Result<void, DependencyCycleError> {
    if (node === dependsOn || this.dependsTransitivelyOn(dependsOn, node)) {
      return Result.fail(new DependencyCycleError(node, dependsOn));
    }
    this.addNode(node);
    this.addNode(dependsOn);
    this.dependencies.get(node)?.add(dependsOn);
    return Result.ok(undefined);
  }

  dependenciesOf(node: string): string[] {
    return [...(this.dependencies.get(node) ?? [])];
  }

  /** Nodes not yet completed whose dependencies are all completed. */
  readyNodes(completed: ReadonlySet<string>): string[] {
    const ready: string[] = [];
    for (const [node, deps] of this.dependencies) {
      if (completed.has(node)) continue;
      if ([...deps].every((dep) => completed.has(dep))) {
        ready.push(node);
      }
    }
    return ready;
  }

  topologicalOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visit = (node: string): void => {
      if (visited.has(node)) return;
      visited.add(node);
      for (const dep of this.dependencies.get(node) ?? []) {
        visit(dep);
      }
      order.push(node);
    };
    for (const node of this.dependencies.keys()) {
      visit(node);
    }
    return order;
  }

  private dependsTransitivelyOn(node: string, target: string): boolean {
    const stack = [...(this.dependencies.get(node) ?? [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...(this.dependencies.get(current) ?? []));
    }
    return false;
  }
}
