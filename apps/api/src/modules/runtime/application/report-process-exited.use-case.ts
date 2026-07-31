import { ProcessStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PROCESS_REPOSITORY, ProcessRepository } from "../domain/ports/process.repository.port";
import { Process } from "../domain/process";
import { ProcessNotFoundError } from "./runtime-application.errors";

export interface ReportProcessExitedInput {
  processId: string;
  exitCode: number;
}

/**
 * STOPPING -> STOPPED when the exit was requested (we asked it to stop);
 * anything else (STARTING/RUNNING exiting on its own) -> CRASHED, regardless
 * of exit code — an unprompted exit is a crash even if the code was 0.
 */
@Injectable()
export class ReportProcessExitedUseCase {
  constructor(@Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository) {}

  async execute(input: ReportProcessExitedInput): Promise<Result<Process, ProcessNotFoundError>> {
    const process = await this.processes.findById(UniqueEntityId.create(input.processId));
    if (!process) {
      return Result.fail(new ProcessNotFoundError(input.processId));
    }

    const next = process.status === ProcessStatus.STOPPING ? ProcessStatus.STOPPED : ProcessStatus.CRASHED;
    process.changeStatus(next);
    await this.processes.save(process);

    return Result.ok(process);
  }
}
