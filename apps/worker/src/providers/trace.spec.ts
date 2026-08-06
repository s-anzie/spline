import { lastEnvelope, TraceReader } from "./trace";

/**
 * §17 — what an agent was doing while it was doing it.
 *
 * A run used to be a black box that reported a number at the end. An operator
 * asking "is it working, and on what?" had nothing to read, which is the same
 * position as having no agent, minus the money.
 */
describe("TraceReader", () => {
  const at = () => new Date("2026-08-06T12:00:00.000Z");

  const said = (text: string) =>
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } });
  const used = (name: string, input: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name, input }] },
    });

  it("reads what the agent said and which tools it reached for", () => {
    const reader = new TraceReader(at);

    reader.read(`${said("Looking at the intake form first.")}\n`);
    reader.read(`${used("Read", { file_path: "/app/src/form.tsx" })}\n`);

    expect(reader.trace.map((entry) => entry.kind)).toEqual(["said", "used"]);
    expect(reader.trace[0]?.text).toContain("intake form");
    expect(reader.trace[1]?.text).toContain("Read");
    expect(reader.trace[1]?.text).toContain("form.tsx");
  });

  /**
   * A chunk from a pipe is not a line: it can end mid-object, and parsing half
   * an object throws. This is the entire reason the reader holds state.
   */
  it("waits for the rest of a line that arrived in pieces", () => {
    const reader = new TraceReader(at);
    const line = said("A sentence split across two reads");

    const half = reader.read(line.slice(0, 20));
    expect(half).toEqual([]);

    const rest = reader.read(`${line.slice(20)}\n`);
    expect(rest).toHaveLength(1);
    expect(rest[0]?.text).toContain("split across two reads");
  });

  it("ignores anything that is not JSON, rather than failing on it", () => {
    const reader = new TraceReader(at);

    reader.read("warning: something on stderr leaked here\n");
    reader.read("{not json at all}\n");
    reader.read(`${said("Still fine")}\n`);

    expect(reader.trace).toHaveLength(1);
  });

  /**
   * A tool's input is often the agent's whole output — a file's contents. In a
   * trace that would store the work twice, once where nobody expects it.
   */
  it("keeps a hint of a tool's input, never the whole of it", () => {
    const reader = new TraceReader(at);
    const enormous = "x".repeat(50_000);

    reader.read(`${used("Write", { file_path: "/app/a.ts", content: enormous })}\n`);

    expect(reader.trace[0]?.text).toContain("/app/a.ts");
    expect(reader.trace[0]?.text.length).toBeLessThan(300);
  });

  it("stops collecting long before a trace becomes a log nobody reads", () => {
    const reader = new TraceReader(at);

    for (let step = 0; step < 500; step += 1) {
      reader.read(`${said(`step ${step}`)}\n`);
    }

    expect(reader.trace.length).toBeLessThanOrEqual(200);
  });

  it("records the closing result as the end of the story", () => {
    const reader = new TraceReader(at);

    reader.read(`${JSON.stringify({ type: "result", result: "Done: two files changed." })}\n`);

    expect(reader.trace[0]?.kind).toBe("result");
    expect(reader.trace[0]?.text).toContain("two files changed");
  });
});

/**
 * `--output-format json` printed one object, so `JSON.parse(stdout)` worked.
 * `stream-json` prints many, and parsing the whole thing throws.
 */
describe("lastEnvelope", () => {
  it("picks the closing envelope out of a stream", () => {
    const stream = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: { content: [] } }),
      JSON.stringify({ type: "result", result: "done", total_cost_usd: 0.02 }),
      "",
    ].join("\n");

    const envelope = lastEnvelope(stream);

    expect(envelope).not.toBeNull();
    expect(JSON.parse(envelope!)).toMatchObject({ result: "done" });
  });

  it("finds nothing when the run printed no result", () => {
    expect(lastEnvelope('{"type":"assistant"}\n')).toBeNull();
    expect(lastEnvelope("")).toBeNull();
  });

  /** An agent that said the word "result" earlier is not the result. */
  it("takes the last one, not the first thing that looks like one", () => {
    const stream = [
      JSON.stringify({ type: "result", result: "first" }),
      JSON.stringify({ type: "result", result: "last" }),
    ].join("\n");

    expect(JSON.parse(lastEnvelope(stream)!)).toMatchObject({ result: "last" });
  });
});
