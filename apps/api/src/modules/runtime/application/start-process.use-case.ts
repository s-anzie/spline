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
import { LOCAL_MACHINE_REPOSITORY, LocalMachineRepository } from "../domain/ports/local-machine.repository.port";
import { PROCESS_REPOSITORY, ProcessRepository } from "../domain/ports/process.repository.port";
import { RUNTIME_COMMAND_REPOSITORY, RuntimeCommandRepository } from "../domain/ports/runtime-command.repository.port";
import { Process } from "../domain/process";
import { RuntimeCommand } from "../domain/runtime-command";
import { resolveCwdWithinRoot } from "./resolve-cwd-within-root";
import {
  MachineNotFoundError,
  MachineNotLinkedToWorkspaceError,
  ProcessCwdOutsideWorkspaceRootError,
  ProcessNotFoundError,
  ProcessNotLockedByRequesterError,
  WorkspaceRootPathNotConfiguredError,
} from "./runtime-application.errors";

export interface StartProcessInput {
  workspaceId: string;
  processId: string;
  machineId: string;
  requester: LockActor;
}

export type StartProcessError =
  | WorkspaceNotFoundError
  | WorkspaceRootPathNotConfiguredError
  | ProcessNotFoundError
  | ProcessCwdOutsideWorkspaceRootError
  | MachineNotFoundError
  | MachineNotLinkedToWorkspaceError
  | ProcessNotLockedByRequesterError;

@Injectable()
export class StartProcessUseCase {
  constructor(
    @Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    @Inject(LOCAL_MACHINE_REPOSITORY) private readonly machines: LocalMachineRepository,
    @Inject(RUNTIME_COMMAND_REPOSITORY) private readonly commands: RuntimeCommandRepository,
    private readonly isResourceLockedByActor: IsResourceLockedByActorUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: StartProcessInput): Promise<Result<Process, StartProcessError>> {
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

    const machine = await this.machines.findById(UniqueEntityId.create(input.machineId));
    if (!machine) {
      return Result.fail(new MachineNotFoundError(input.machineId));
    }
    if (!machine.workspaceIds.includes(input.workspaceId)) {
      return Result.fail(new MachineNotLinkedToWorkspaceError(input.machineId, input.workspaceId));
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
    process.changeStatus(ProcessStatus.STARTING, now);
    process.recordDispatch(input.machineId, undefined, now);
    await this.processes.save(process);

    const command = RuntimeCommand.enqueue(
      {
        machineId: input.machineId,
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
    );
    await this.commands.save(command);

    this.eventPublisher.publishAll(process.domainEvents);
    process.clearEvents();

    return Result.ok(process);
  }
}
