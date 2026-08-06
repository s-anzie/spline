import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Run } from "../domain/run";
import { RunRepository } from "../domain/ports/run.repository.port";
import {
  AbandonSilentRunsUseCase,
  DEFAULT_SILENCE_MS,
} from "./abandon-silent-runs.use-case";

class InMemoryRunRepository implements RunRepository {
  readonly runs: Run[] = [];

  async save(run: Run): Promise<void> {
    const at = this.runs.findIndex((candidate) => candidate.id.equals(run.id));
    if (at >= 0) this.runs[at] = run;
    else this.runs.push(run);
  }

  async findById(id: string): Promise<Run | null> {
    return this.runs.find((run) => run.id.value === id) ?? null;
  }

  async list(): Promise<Run[]> {
    return [...this.runs];
  }

  async countForTask(): Promise<number> {
    return this.runs.length;
  }

  async listLive(): Promise<Run[]> {
    return this.runs.filter((run) => run.status === "PENDING" || run.status === "RUNNING");
  }

  async countLive(): Promise<number> {
    return (await this.listLive()).length;
  }

  async countSince(): Promise<number> {
    return this.runs.length;
  }
}

/**
 * §9.13 — the sweep that keeps an automatic workspace from stopping in
 * silence.
 *
 * A run stays RUNNING until a machine reports. A machine that dies reports
 * nothing. On its own that is a stale row; under a ceiling of three
 * concurrent runs it is a third of the workspace's capacity, permanently.
 */
describe("AbandonSilentRunsUseCase", () => {
  const start = new Date("2026-08-06T10:00:00.000Z");

  const build = () => {
    const clock = new FakeClock(start);
    const runs = new InMemoryRunRepository();
    const publisher = new FakeEventPublisher();
    return {
      clock,
      runs,
      publisher,
      use: new AbandonSilentRunsUseCase(runs, clock, publisher),
    };
  };

  const openRun = (runs: InMemoryRunRepository) => {
    const run = Run.start({
      workspaceId: "w-1",
      taskId: "t-1",
      attemptNumber: 1,
      now: start,
    });
    void runs.save(run.value);
    return run.value;
  };

  it("leaves a run that is merely young alone", async () => {
    const ctx = build();
    openRun(ctx.runs);

    ctx.clock.advance(DEFAULT_SILENCE_MS - 1);
    const swept = await ctx.use.execute({ workspaceId: "w-1" });

    expect(swept.value).toEqual([]);
    expect(ctx.runs.runs[0]?.status).not.toBe("FAILED");
  });

  it("ends a run that has said nothing for too long, and says why", async () => {
    const ctx = build();
    openRun(ctx.runs);

    ctx.clock.advance(DEFAULT_SILENCE_MS + 60_000);
    const swept = await ctx.use.execute({ workspaceId: "w-1" });

    expect(swept.value).toHaveLength(1);
    const run = ctx.runs.runs[0];
    expect(run?.status).toBe("FAILED");
    // The reason has to be actionable: a person reading it should know
    // whether their work was lost and what to do next.
    expect(run?.failureReason).toMatch(/no sign of life/i);
    expect(run?.failureReason).toMatch(/dispatch it again/i);
  });

  it("announces it, so the journal shows why a slot came back", async () => {
    const ctx = build();
    openRun(ctx.runs);
    ctx.clock.advance(DEFAULT_SILENCE_MS + 1);

    await ctx.use.execute({ workspaceId: "w-1" });

    expect(ctx.publisher.published.map((event) => event.eventName)).toContain(
      "execution.run_finished",
    );
  });

  it("takes a shorter silence when asked, so a caller can be stricter", async () => {
    const ctx = build();
    openRun(ctx.runs);

    ctx.clock.advance(60_000);
    const swept = await ctx.use.execute({ workspaceId: "w-1", silenceMs: 30_000 });

    expect(swept.value).toHaveLength(1);
  });

  it("is safe to run when there is nothing to sweep", async () => {
    const ctx = build();

    const swept = await ctx.use.execute({ workspaceId: "w-1" });

    expect(swept.value).toEqual([]);
  });
});
