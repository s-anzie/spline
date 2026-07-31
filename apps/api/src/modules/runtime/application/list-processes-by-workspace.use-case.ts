import { Inject, Injectable } from "@nestjs/common";

import { Process } from "../domain/process";
import { PROCESS_REPOSITORY, ProcessRepository } from "../domain/ports/process.repository.port";

@Injectable()
export class ListProcessesByWorkspaceUseCase {
  constructor(@Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository) {}

  async execute(workspaceId: string): Promise<Process[]> {
    return this.processes.listByWorkspace(workspaceId);
  }
}
