import { Inject, Injectable } from "@nestjs/common";

import { HealthSignal, Rollup } from "../../observability/domain/health";
import {
  HealthProbe,
  ProbeContext,
} from "../../observability/domain/ports/health-probe.port";
import { COMMAND_STORE, CommandStore } from "../domain/ports/runtime.repository.port";

/** §17.7's third monitored resource. */
export const DEFAULT_COMMAND_STALENESS_MS = 10 * 60 * 1000;

/**
 * The probe 0.3.3 was written about, in the observation the spec quotes:
 * **"21 commandes runtime bloquées" sans savoir lesquelles**. A stuck command
 * is one a worker claimed and never reported on — the order is neither
 * waiting nor done, and nothing else in the system notices.
 *
 * It reports which ones, since when, and of what type. That is the whole
 * point of §17.8, and this is the case that produced it.
 */
@Injectable()
export class CommandHealthProbe implements HealthProbe {
  readonly name = "runtime_commands";

  constructor(@Inject(COMMAND_STORE) private readonly commands: CommandStore) {}

  async assess(context: ProbeContext): Promise<HealthSignal> {
    const { thresholdMs, source } = context.thresholdMsFor(
      "staleness_commands_ms",
      DEFAULT_COMMAND_STALENESS_MS,
    );
    const claimed = await this.commands.listClaimed(context.workspaceId);
    const stuck = claimed
      .filter((command) => command.isStuckAt(context.now, thresholdMs))
      .map((command) => ({
        id: command.id.value,
        type: `command:${command.type}`,
        since: command.claimedAt ?? command.createdAt,
      }));

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
