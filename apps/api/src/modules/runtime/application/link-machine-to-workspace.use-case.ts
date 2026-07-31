import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { LocalMachine } from "../domain/local-machine";
import { LOCAL_MACHINE_REPOSITORY, LocalMachineRepository } from "../domain/ports/local-machine.repository.port";
import { MachineNotFoundError } from "./runtime-application.errors";

export interface LinkMachineToWorkspaceInput {
  machineId: string;
  workspaceId: string;
}

export type LinkMachineToWorkspaceError = WorkspaceNotFoundError | MachineNotFoundError;

@Injectable()
export class LinkMachineToWorkspaceUseCase {
  constructor(
    @Inject(LOCAL_MACHINE_REPOSITORY) private readonly machines: LocalMachineRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    input: LinkMachineToWorkspaceInput,
  ): Promise<Result<LocalMachine, LinkMachineToWorkspaceError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    const machine = await this.machines.findById(UniqueEntityId.create(input.machineId));
    if (!machine) {
      return Result.fail(new MachineNotFoundError(input.machineId));
    }

    machine.linkToWorkspace(input.workspaceId);
    await this.machines.save(machine);
    this.eventPublisher.publishAll(machine.domainEvents);
    machine.clearEvents();

    return Result.ok(machine);
  }
}
