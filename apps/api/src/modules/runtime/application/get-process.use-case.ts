import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Process } from "../domain/process";
import { PROCESS_REPOSITORY, ProcessRepository } from "../domain/ports/process.repository.port";
import { ProcessNotFoundError } from "./runtime-application.errors";

@Injectable()
export class GetProcessUseCase {
  constructor(@Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository) {}

  async execute(processId: string): Promise<Result<Process, ProcessNotFoundError>> {
    const process = await this.processes.findById(UniqueEntityId.create(processId));
    if (!process) {
      return Result.fail(new ProcessNotFoundError(processId));
    }
    return Result.ok(process);
  }
}
