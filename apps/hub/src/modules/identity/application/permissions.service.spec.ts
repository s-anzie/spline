import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryWorkspaceMembershipRepository } from "./testing/identity.doubles";
import { GrantWorkspaceMembershipUseCase } from "./grant-workspace-membership.use-case";
import { PermissionsService } from "./permissions.service";

async function makeService() {
  const memberships = new InMemoryWorkspaceMembershipRepository();
  const grant = new GrantWorkspaceMembershipUseCase(
    memberships,
    new FakeClock(),
    new FakeEventPublisher(),
  );
  await grant.execute({
    actorType: "HUMAN",
    actorId: "u-owner",
    workspaceId: "w-1",
    role: "OWNER",
  });
  await grant.execute({
    actorType: "AGENT",
    actorId: "a-contrib",
    workspaceId: "w-1",
    role: "AGENT_CONTRIBUTOR",
  });
  return new PermissionsService(memberships, nothingLent);
}

/** No workspace has lent anything: the ordinary case, and the matrix alone decides. */
const nothingLent = { lentTo: async () => [] };

describe("PermissionsService", () => {
  it("grants a permission the actor's role holds", async () => {
    const service = await makeService();

    await expect(
      service.can({ actorType: "HUMAN", actorId: "u-owner" }, "manage_workspace", "w-1"),
    ).resolves.toBe(true);
    await expect(
      service.can({ actorType: "AGENT", actorId: "a-contrib" }, "execute_tasks", "w-1"),
    ).resolves.toBe(true);
  });

  it("denies a permission the role lacks", async () => {
    const service = await makeService();

    await expect(
      service.can({ actorType: "AGENT", actorId: "a-contrib" }, "approve_validation", "w-1"),
    ).resolves.toBe(false);
  });

  it("denies everything to an actor without membership in that workspace", async () => {
    const service = await makeService();

    await expect(
      service.can({ actorType: "HUMAN", actorId: "u-owner" }, "read_workspace_state", "w-2"),
    ).resolves.toBe(false);
    await expect(
      service.can({ actorType: "HUMAN", actorId: "stranger" }, "read_workspace_state", "w-1"),
    ).resolves.toBe(false);
  });

  it("actor identity is type-scoped: same id, different type, no rights", async () => {
    const service = await makeService();

    await expect(
      service.can({ actorType: "WORKER", actorId: "u-owner" }, "read_workspace_state", "w-1"),
    ).resolves.toBe(false);
  });
});
