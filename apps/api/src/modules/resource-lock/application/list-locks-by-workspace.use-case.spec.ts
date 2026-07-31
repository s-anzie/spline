import { LockResourceType } from "@repo/db";

import { ResourceLock } from "../domain/resource-lock";
import { ListLocksByWorkspaceUseCase } from "./list-locks-by-workspace.use-case";
import { InMemoryResourceLockRepository } from "./testing/in-memory-resource-lock.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("ListLocksByWorkspaceUseCase", () => {
  it("lists locks scoped to a workspace", async () => {
    const locks = new InMemoryResourceLockRepository();
    await locks.save(
      ResourceLock.acquire({
        workspaceId: "w1",
        resourceType: LockResourceType.PROCESS,
        resourceId: "p1",
        lockedBy: HUMAN_1,
      }),
    );
    await locks.save(
      ResourceLock.acquire({
        workspaceId: "w2",
        resourceType: LockResourceType.PROCESS,
        resourceId: "p2",
        lockedBy: HUMAN_1,
      }),
    );
    const useCase = new ListLocksByWorkspaceUseCase(locks);

    const found = await useCase.execute("w1");

    expect(found.map((l) => l.resourceId)).toEqual(["p1"]);
  });
});
