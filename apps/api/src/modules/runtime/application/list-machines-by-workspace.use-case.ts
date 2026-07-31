import { Inject, Injectable } from "@nestjs/common";

import { LocalMachine } from "../domain/local-machine";
import { LOCAL_MACHINE_REPOSITORY, LocalMachineRepository } from "../domain/ports/local-machine.repository.port";

@Injectable()
export class ListMachinesByWorkspaceUseCase {
  constructor(@Inject(LOCAL_MACHINE_REPOSITORY) private readonly machines: LocalMachineRepository) {}

  async execute(workspaceId: string): Promise<LocalMachine[]> {
    return this.machines.listByWorkspace(workspaceId);
  }
}
