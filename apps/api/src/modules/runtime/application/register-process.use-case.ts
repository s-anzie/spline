import { RestartPolicy } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Process } from "../domain/process";
import { EmptyProcessCommandError, EmptyProcessNameError } from "../domain/process.errors";
import { PROCESS_REPOSITORY, ProcessRepository } from "../domain/ports/process.repository.port";

export interface RegisterProcessInput {
  workspaceId: string;
  name: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
  ownerAgentId?: string;
  ports?: number[];
  restartPolicy?: RestartPolicy;
}

export type RegisterProcessError = WorkspaceNotFoundError | EmptyProcessNameError | EmptyProcessCommandError;

@Injectable()
export class RegisterProcessUseCase {
  constructor(
    @Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: RegisterProcessInput): Promise<Result<Process, RegisterProcessError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    let process: Process;
    try {
      process = Process.create(input);
    } catch (error) {
      if (error instanceof EmptyProcessNameError || error instanceof EmptyProcessCommandError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.processes.save(process);
    this.eventPublisher.publishAll(process.domainEvents);
    process.clearEvents();

    return Result.ok(process);
  }
}
