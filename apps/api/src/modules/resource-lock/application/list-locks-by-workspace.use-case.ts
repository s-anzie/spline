import { Inject, Injectable } from "@nestjs/common";

import { ResourceLock } from "../domain/resource-lock";
import { RESOURCE_LOCK_REPOSITORY, ResourceLockRepository } from "../domain/ports/resource-lock.repository.port";

@Injectable()
export class ListLocksByWorkspaceUseCase {
  constructor(@Inject(RESOURCE_LOCK_REPOSITORY) private readonly locks: ResourceLockRepository) {}

  async execute(workspaceId: string): Promise<ResourceLock[]> {
    return this.locks.listByWorkspace(workspaceId);
  }
}
