import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { IssueMachineTokenUseCase } from "../../identity/application/issue-machine-token.use-case";
import { LocalMachine } from "../domain/local-machine";
import { EmptyMachineHostnameError } from "../domain/local-machine.errors";
import { LOCAL_MACHINE_REPOSITORY, LocalMachineRepository } from "../domain/ports/local-machine.repository.port";

export interface RegisterMachineInput {
  hostname: string;
  os: string;
}

export interface RegisterMachineOutput {
  machine: LocalMachine;
  plainTextToken: string;
}

@Injectable()
export class RegisterMachineUseCase {
  constructor(
    @Inject(LOCAL_MACHINE_REPOSITORY) private readonly machines: LocalMachineRepository,
    private readonly issueMachineToken: IssueMachineTokenUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    input: RegisterMachineInput,
  ): Promise<Result<RegisterMachineOutput, EmptyMachineHostnameError>> {
    let machine: LocalMachine;
    try {
      machine = LocalMachine.register(input);
    } catch (error) {
      if (error instanceof EmptyMachineHostnameError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.machines.save(machine);
    const { plainTextToken } = await this.issueMachineToken.execute(machine.id.toString());
    this.eventPublisher.publishAll(machine.domainEvents);
    machine.clearEvents();

    return Result.ok({ machine, plainTextToken });
  }
}
