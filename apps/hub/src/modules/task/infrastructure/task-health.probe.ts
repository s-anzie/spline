import { Inject, Injectable } from "@nestjs/common";

import { isStale } from "../../../kernel/domain/staleness";
import { HealthSignal, Rollup } from "../../observability/domain/health";
import {
  DEFAULT_STALENESS_MS,
  HealthProbe,
  ProbeContext,
} from "../../observability/domain/ports/health-probe.port";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";

/** §4.22 — "une tâche bloquée ne progresse plus". Long enough, and nothing does. */
@Injectable()
export class TaskHealthProbe implements HealthProbe {
  readonly name = "blocked_tasks";

  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository) {}

  async assess(context: ProbeContext): Promise<HealthSignal> {
    const { thresholdMs, source } = context.thresholdMsFor(
      "staleness_blocked_tasks_ms",
      DEFAULT_STALENESS_MS.staleness_blocked_tasks_ms,
    );
    const tasks = await this.tasks.list({
      workspaceId: context.workspaceId,
      statuses: ["BLOCKED"],
    });
    const stuck = tasks
      .filter((task) => isStale(task.updatedAt, thresholdMs, context.now))
      .map((task) => ({ id: task.id.value, type: "task", since: task.updatedAt }));

    return HealthSignal.from({
      probe: this.name,
      rollup: Rollup.of(stuck),
      thresholdMs,
      thresholdSource: source,
      degradedAt: 3,
      unhealthyAt: 10,
    });
  }
}
