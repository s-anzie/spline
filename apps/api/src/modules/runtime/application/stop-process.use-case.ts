import { LockResourceType, ProcessStatus, RuntimeCommandType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { IsResourceLockedByActorUseCase } from "../../resource-lock/application/is-resource-locked-by-actor.use-case";
import { Actor as LockActor } from "../../resource-lock/domain/resource-lock";
import { PROCESS_REPOSITORY, ProcessRepository } from "../domain/ports/process.repository.port";
import { RUNTIME_COMMAND_REPOSITORY, RuntimeCommandRepository } from "../domain/ports/runtime-command.repository.port";
import { Process } from "../domain/process";
import { RuntimeCommand } from "../domain/runtime-command";
import { ProcessNotFoundError, ProcessNotLockedByRequesterError } from "./runtime-application.errors";

export interface StopProcessInput {
  workspaceId: string;
  processId: string;
  requester: LockActor;
}

export type StopProcessError = ProcessNotFoundError | ProcessNotLockedByRequesterError;

@Injectable()
export class StopProcessUseCase {
  constructor(
    @Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository,
    @Inject(RUNTIME_COMMAND_REPOSITORY) private readonly commands: RuntimeCommandRepository,
    private readonly isResourceLockedByActor: IsResourceLockedByActorUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: StopProcessInput): Promise<Result<Process, StopProcessError>> {
    const process = await this.processes.findById(UniqueEntityId.create(input.processId));
    if (!process || process.workspaceId !== input.workspaceId) {
      return Result.fail(new ProcessNotFoundError(input.processId));
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
      const command = RuntimeCommand.enqueue(
        {
          machineId,
          workspaceId: input.workspaceId,
          type: RuntimeCommandType.STOP_PROCESS,
          payload: { processId: input.processId, pid },
        },
        now,
      );
      await this.commands.save(command);
    }

    this.eventPublisher.publishAll(process.domainEvents);
    process.clearEvents();

    return Result.ok(process);
  }
}
