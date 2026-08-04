import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Email } from "../domain/email";
import { User } from "../domain/user";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceMembershipRepository,
} from "./testing/identity.doubles";
import { GrantWorkspaceMembershipUseCase } from "./grant-workspace-membership.use-case";
import { InviteWorkspaceMemberUseCase } from "./invite-workspace-member.use-case";

const now = new Date("2026-08-04T10:00:00.000Z");

async function makeContext() {
  const users = new InMemoryUserRepository();
  const memberships = new InMemoryWorkspaceMembershipRepository();
  const grant = new GrantWorkspaceMembershipUseCase(
    memberships,
    new FakeClock(now),
    new FakeEventPublisher(),
  );
  const invitee = User.create({
    email: Email.create("colleague@example.com").value,
    passwordHash: "h",
    displayName: "Colleague",
    now,
  }).value;
  await users.save(invitee);

  return {
    users,
    memberships,
    invitee,
    useCase: new InviteWorkspaceMemberUseCase(users, grant),
  };
}

describe("InviteWorkspaceMemberUseCase", () => {
  it("invites a human by email — the real onboarding path", async () => {
    const ctx = await makeContext();

    const result = await ctx.useCase.execute({
      workspaceId: "w-1",
      email: "  COLLEAGUE@example.com ",
      role: "HUMAN_OPERATOR",
    });

    expect(result.isSuccess).toBe(true);
    const members = await ctx.memberships.listByWorkspace("w-1");
    expect(members).toHaveLength(1);
    expect(members[0]?.actor.actorId).toBe(ctx.invitee.id.value);
    expect(members[0]?.role).toBe("HUMAN_OPERATOR");
  });

  it("reports an unknown email as UserNotFoundError", async () => {
    const ctx = await makeContext();

    const result = await ctx.useCase.execute({
      workspaceId: "w-1",
      email: "nobody@example.com",
      role: "VIEWER",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("UserNotFoundError");
  });

  it("rejects a malformed email before touching the repositories", async () => {
    const ctx = await makeContext();

    const result = await ctx.useCase.execute({
      workspaceId: "w-1",
      email: "not-an-email",
      role: "VIEWER",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("InvalidEmailError");
  });

  it("invites a non-human actor by explicit id", async () => {
    const ctx = await makeContext();

    const result = await ctx.useCase.execute({
      workspaceId: "w-1",
      actorType: "AGENT",
      actorId: "a-1",
      role: "AGENT_CONTRIBUTOR",
    });

    expect(result.isSuccess).toBe(true);
    const members = await ctx.memberships.listByWorkspace("w-1");
    expect(members[0]?.actor.type).toBe("AGENT");
  });

  it("requires either an email or an explicit actor reference", async () => {
    const ctx = await makeContext();

    const result = await ctx.useCase.execute({ workspaceId: "w-1", role: "VIEWER" });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("GuardViolation");
  });

  it("propagates the duplicate-membership rule", async () => {
    const ctx = await makeContext();
    const input = {
      workspaceId: "w-1",
      email: "colleague@example.com",
      role: "VIEWER" as const,
    };
    await ctx.useCase.execute(input);

    const result = await ctx.useCase.execute(input);

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("MembershipAlreadyExistsError");
  });

  it("propagates the role/actor-type compatibility rule", async () => {
    const ctx = await makeContext();

    const result = await ctx.useCase.execute({
      workspaceId: "w-1",
      email: "colleague@example.com",
      role: "AGENT_MANAGER",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("IncompatibleRoleError");
  });
});
