import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryWorkspaceMembershipRepository } from "./testing/identity.doubles";
import { ChangeMembershipRoleUseCase } from "./change-membership-role.use-case";
import { GrantWorkspaceMembershipUseCase } from "./grant-workspace-membership.use-case";
import { RevokeWorkspaceMembershipUseCase } from "./revoke-workspace-membership.use-case";

function makeUseCases() {
  const memberships = new InMemoryWorkspaceMembershipRepository();
  const clock = new FakeClock(new Date("2026-08-04T10:00:00Z"));
  const publisher = new FakeEventPublisher();
  const grant = new GrantWorkspaceMembershipUseCase(memberships, clock, publisher);
  const changeRole = new ChangeMembershipRoleUseCase(memberships, clock, publisher);
  const revoke = new RevokeWorkspaceMembershipUseCase(memberships, clock, publisher, {
    hasOpenWork: async () => false,
  });
  return { memberships, grant, changeRole, revoke, publisher };
}

const owner = { actorType: "HUMAN" as const, actorId: "u-1", workspaceId: "w-1", role: "OWNER" as const };

describe("workspace membership use-cases", () => {
  it("grants a membership and publishes the event", async () => {
    const { grant, publisher } = makeUseCases();

    const result = await grant.execute(owner);

    expect(result.isSuccess).toBe(true);
    expect(publisher.published.map((e) => e.eventName)).toContain(
      "identity.membership_granted",
    );
  });

  it("rejects a second membership for the same actor in the same workspace", async () => {
    const { grant } = makeUseCases();
    await grant.execute(owner);

    const result = await grant.execute({ ...owner, role: "VIEWER" });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("MembershipAlreadyExistsError");
  });

  it("the same actor can join two different workspaces", async () => {
    const { grant } = makeUseCases();
    await grant.execute(owner);

    const result = await grant.execute({ ...owner, workspaceId: "w-2" });

    expect(result.isSuccess).toBe(true);
  });

  it("changes a role and publishes the event", async () => {
    const { grant, changeRole, memberships } = makeUseCases();
    const granted = await grant.execute(owner);
    await grant.execute({ ...owner, actorId: "u-2", role: "OWNER" });

    const result = await changeRole.execute({
      membershipId: granted.value.membershipId,
      role: "HUMAN_OPERATOR",
    });

    expect(result.isSuccess).toBe(true);
    const stored = await memberships.findById(granted.value.membershipId);
    expect(stored?.role).toBe("HUMAN_OPERATOR");
  });

  it("refuses to demote the last OWNER of a workspace", async () => {
    const { grant, changeRole } = makeUseCases();
    const granted = await grant.execute(owner);

    const result = await changeRole.execute({
      membershipId: granted.value.membershipId,
      role: "VIEWER",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("CannotRemoveLastOwnerError");
  });

  it("refuses to revoke the last OWNER of a workspace", async () => {
    const { grant, revoke } = makeUseCases();
    const granted = await grant.execute(owner);

    const result = await revoke.execute({ membershipId: granted.value.membershipId });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("CannotRemoveLastOwnerError");
  });

  it("revokes a non-owner membership, deletes it, publishes the event", async () => {
    const { grant, revoke, memberships, publisher } = makeUseCases();
    await grant.execute(owner);
    const viewer = await grant.execute({ ...owner, actorId: "u-2", role: "VIEWER" });

    const result = await revoke.execute({ membershipId: viewer.value.membershipId });

    expect(result.isSuccess).toBe(true);
    expect(await memberships.findById(viewer.value.membershipId)).toBeNull();
    expect(publisher.published.map((e) => e.eventName)).toContain(
      "identity.membership_revoked",
    );
  });

  it("revoking an OWNER works when another OWNER remains", async () => {
    const { grant, revoke } = makeUseCases();
    const first = await grant.execute(owner);
    await grant.execute({ ...owner, actorId: "u-2" });

    const result = await revoke.execute({ membershipId: first.value.membershipId });

    expect(result.isSuccess).toBe(true);
  });

  it("fails cleanly on an unknown membership", async () => {
    const { changeRole } = makeUseCases();

    const result = await changeRole.execute({ membershipId: "nope", role: "VIEWER" });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("MembershipNotFoundError");
  });
});

/** Recorded as a deferral by the task module, settled here. */
describe("revoking a member who still owns live work", () => {
  async function contextWithWorkload(hasOpenWork: boolean) {
    const memberships = new InMemoryWorkspaceMembershipRepository();
    const clock = new FakeClock(new Date("2026-08-04T10:00:00Z"));
    const publisher = new FakeEventPublisher();
    const grant = new GrantWorkspaceMembershipUseCase(memberships, clock, publisher);
    await grant.execute({ ...owner });
    const worker = await grant.execute({
      actorType: "AGENT",
      actorId: "a-1",
      workspaceId: "w-1",
      role: "AGENT_CONTRIBUTOR",
    });
    const revoke = new RevokeWorkspaceMembershipUseCase(memberships, clock, publisher, {
      hasOpenWork: async () => hasOpenWork,
    });
    return { revoke, membershipId: worker.value.membershipId };
  }

  it("is refused while the actor owns open work", async () => {
    const { revoke, membershipId } = await contextWithWorkload(true);

    const result = await revoke.execute({ membershipId });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("ActorStillOwnsWorkError");
  });

  it("succeeds once their work has been reassigned or settled", async () => {
    const { revoke, membershipId } = await contextWithWorkload(false);

    expect((await revoke.execute({ membershipId })).isSuccess).toBe(true);
  });
});
