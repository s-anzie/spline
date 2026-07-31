import { LockResourceType, ProcessStatus, RuntimeCommandType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { IsResourceLockedByActorUseCase } from "../../resource-lock/application/is-resource-locked-by-actor.use-case";
import { Actor as LockActor } from "../../resource-lock/domain/resource-lock";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { PROCESS_REPOSITORY, ProcessRepository } from "../domain/ports/process.repository.port";
import { RUNTIME_COMMAND_REPOSITORY, RuntimeCommandRepository } from "../domain/ports/runtime-command.repository.port";
import { Process } from "../domain/process";
import { RuntimeCommand } from "../domain/runtime-command";
import { resolveCwdWithinRoot } from "./resolve-cwd-within-root";
import {
  ProcessCwdOutsideWorkspaceRootError,
  ProcessNotFoundError,
  ProcessNotLockedByRequesterError,
  WorkspaceRootPathNotConfiguredError,
} from "./runtime-application.errors";

export interface RestartProcessInput {
  workspaceId: string;
  processId: string;
  requester: LockActor;
}

export type RestartProcessError =
  | WorkspaceNotFoundError
  | WorkspaceRootPathNotConfiguredError
  | ProcessNotFoundError
  | ProcessCwdOutsideWorkspaceRootError
  | ProcessNotLockedByRequesterError;

/**
 * Stops then re-enqueues a start for the same machine — both commands are
 * enqueued now, PENDING, for the same machine; the daemon's per-machine
 * command loop processes them in order, so the start naturally waits for
 * the stop to actually finish. See ReportProcessStartedUseCase for how a
 * "started" report is made resilient to arriving straight from STOPPED.
 */
@Injectable()
export class RestartProcessUseCase {
  constructor(
    @Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    @Inject(RUNTIME_COMMAND_REPOSITORY) private readonly commands: RuntimeCommandRepository,
    private readonly isResourceLockedByActor: IsResourceLockedByActorUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: RestartProcessInput): Promise<Result<Process, RestartProcessError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }
    const workspace = workspaceResult.value;
    if (!workspace.rootPath) {
      return Result.fail(new WorkspaceRootPathNotConfiguredError(input.workspaceId));
    }

    const process = await this.processes.findById(UniqueEntityId.create(input.processId));
    if (!process || process.workspaceId !== input.workspaceId) {
      return Result.fail(new ProcessNotFoundError(input.processId));
    }

    const resolvedCwd = resolveCwdWithinRoot(workspace.rootPath, process.cwd);
    if (!resolvedCwd) {
      return Result.fail(new ProcessCwdOutsideWorkspaceRootError(process.cwd));
    }

    const isLocked = await this.isResourceLockedByActor.execute({
      workspaceId: input.workspaceId,
      resourceType: LockResourceType.PROCESS,
      resourceId: input.processId,
      actor: input.requester,
    });
    if (!isLocked) {
      return Result.fail(new ProcessNotLockedByRequesterError(input.processId));
    }

    const now = this.clock.now();
    const pid = process.pid;
    const machineId = process.machineId;
    process.changeStatus(ProcessStatus.STOPPING, now);
    await this.processes.save(process);

    if (machineId) {
      await this.commands.save(
        RuntimeCommand.enqueue(
          {
            machineId,
            workspaceId: input.workspaceId,
            type: RuntimeCommandType.STOP_PROCESS,
            payload: { processId: input.processId, pid },
          },
          now,
        ),
      );
      await this.commands.save(
        RuntimeCommand.enqueue(
          {
            machineId,
            workspaceId: input.workspaceId,
            type: RuntimeCommandType.START_PROCESS,
            payload: {
              processId: input.processId,
              command: process.command,
              cwd: resolvedCwd,
              env: process.env,
              ports: process.ports,
            },
          },
          now,
        ),
      );
    }

    this.eventPublisher.publishAll(process.domainEvents);
    process.clearEvents();

    return Result.ok(process);
  }
}
