import { LocalMachineRuntimeStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { LocalMachine } from "../domain/local-machine";
import { LOCAL_MACHINE_REPOSITORY, LocalMachineRepository } from "../domain/ports/local-machine.repository.port";
import { MachineNotFoundError } from "./runtime-application.errors";

export interface UpdateMachinePresenceInput {
  machineId: string;
  connected: boolean;
}

/** Driven by MachineGateway on every WS connect/disconnect — idempotent like UpdateAgentPresenceUseCase. */
@Injectable()
export class UpdateMachinePresenceUseCase {
  constructor(
    @Inject(LOCAL_MACHINE_REPOSITORY) private readonly machines: LocalMachineRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    input: UpdateMachinePresenceInput,
    at: Date = new Date(),
  ): Promise<Result<LocalMachine, MachineNotFoundError>> {
    const machine = await this.machines.findById(UniqueEntityId.create(input.machineId));
    if (!machine) {
      return Result.fail(new MachineNotFoundError(input.machineId));
    }

    if (input.connected) {
      if (machine.runtimeStatus !== LocalMachineRuntimeStatus.ONLINE) {
        machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE, at);
      } else {
        machine.recordHeartbeat(at);
      }
    } else if (machine.runtimeStatus !== LocalMachineRuntimeStatus.OFFLINE) {
      machine.changeRuntimeStatus(LocalMachineRuntimeStatus.OFFLINE, at);
    }

    await this.machines.save(machine);
    this.eventPublisher.publishAll(machine.domainEvents);
    machine.clearEvents();

    return Result.ok(machine);
  }
}
