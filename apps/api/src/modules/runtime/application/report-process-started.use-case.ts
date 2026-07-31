import { ProcessStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PROCESS_REPOSITORY, ProcessRepository } from "../domain/ports/process.repository.port";
import { Process } from "../domain/process";
import { ProcessNotFoundError } from "./runtime-application.errors";

export interface ReportProcessStartedInput {
  processId: string;
  pid: number;
}

/**
 * Resilient to arriving straight from STOPPED (the restart flow enqueues
 * stop+start together without an intermediate hub-side STARTING hop) as
 * well as from the regular STARTING (direct start) path.
 */
@Injectable()
export class ReportProcessStartedUseCase {
  constructor(@Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository) {}

  async execute(input: ReportProcessStartedInput): Promise<Result<Process, ProcessNotFoundError>> {
    const process = await this.processes.findById(UniqueEntityId.create(input.processId));
    if (!process) {
      return Result.fail(new ProcessNotFoundError(input.processId));
    }

    if (process.status === ProcessStatus.RUNNING) {
      // Duplicate/late report (e.g. a retried WS message) — already running, just refresh the pid.
      process.recordPid(input.pid);
      await this.processes.save(process);
      return Result.ok(process);
    }

    if (process.status !== ProcessStatus.STARTING) {
      process.changeStatus(ProcessStatus.STARTING);
    }
    process.recordPid(input.pid);
    process.changeStatus(ProcessStatus.RUNNING);
    await this.processes.save(process);

    return Result.ok(process);
  }
}
