import { DependencyGraph } from "./dependency-graph";

/**
 * DAG primitive backing the Scheduler (v3 spec §9.5): a task becomes
 * executable when all of its dependencies are satisfied, and cycles are
 * rejected at insertion time rather than discovered during scheduling.
 */
describe("DependencyGraph", () => {
  it("a node with no dependencies is immediately ready", () => {
    const graph = new DependencyGraph();
    graph.addNode("a");

    expect(graph.readyNodes(new Set())).toEqual(["a"]);
  });

  it("a node is not ready until every dependency is completed", () => {
    const graph = new DependencyGraph();
    graph.addNode("a");
    graph.addNode("b");
    graph.addNode("c");
    graph.addDependency("c", "a");
    graph.addDependency("c", "b");

    expect(graph.readyNodes(new Set())).toEqual(["a", "b"]);
    expect(graph.readyNodes(new Set(["a"]))).toEqual(["b"]);
    expect(graph.readyNodes(new Set(["a", "b"]))).toEqual(["c"]);
  });

  it("completed nodes are not reported as ready again", () => {
    const graph = new DependencyGraph();
    graph.addNode("a");

    expect(graph.readyNodes(new Set(["a"]))).toEqual([]);
  });

  it("addDependency registers unknown nodes implicitly", () => {
    const graph = new DependencyGraph();
    const result = graph.addDependency("b", "a");

    expect(result.isSuccess).toBe(true);
    expect(graph.readyNodes(new Set())).toEqual(["a"]);
  });

  it("rejects a direct cycle", () => {
    const graph = new DependencyGraph();
    graph.addDependency("b", "a");

    const result = graph.addDependency("a", "b");

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("DependencyCycleError");
  });

  it("rejects a transitive cycle", () => {
    const graph = new DependencyGraph();
    graph.addDependency("b", "a");
    graph.addDependency("c", "b");

    const result = graph.addDependency("a", "c");

    expect(result.isFailure).toBe(true);
  });

  it("rejects a self-dependency", () => {
    const graph = new DependencyGraph();

    const result = graph.addDependency("a", "a");

    expect(result.isFailure).toBe(true);
  });

  it("topologicalOrder lists dependencies before dependents", () => {
    const graph = new DependencyGraph();
    graph.addDependency("c", "b");
    graph.addDependency("b", "a");

    const order = graph.topologicalOrder();

    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  it("dependenciesOf returns direct dependencies only", () => {
    const graph = new DependencyGraph();
    graph.addDependency("c", "b");
    graph.addDependency("b", "a");

    expect(graph.dependenciesOf("c")).toEqual(["b"]);
    expect(graph.dependenciesOf("a")).toEqual([]);
  });
});
