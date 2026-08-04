import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import {
  FakePasswordHasher,
  InMemoryOrganizationRepository,
  InMemoryUserRepository,
} from "./testing/identity.doubles";
import { RegisterUserUseCase } from "./register-user.use-case";

function makeUseCase() {
  const users = new InMemoryUserRepository();
  const organizations = new InMemoryOrganizationRepository();
  const publisher = new FakeEventPublisher();
  const useCase = new RegisterUserUseCase(
    users,
    organizations,
    new FakePasswordHasher(),
    new FakeClock(new Date("2026-08-04T10:00:00Z")),
    publisher,
  );
  return { useCase, users, organizations, publisher };
}

const input = {
  email: "Bradley@Example.com",
  password: "a-strong-password",
  displayName: "Bradley",
};

describe("RegisterUserUseCase", () => {
  it("registers the user and auto-creates their personal organization", async () => {
    const { useCase, users, organizations } = makeUseCase();

    const result = await useCase.execute(input);

    expect(result.isSuccess).toBe(true);
    expect(result.value.userId).toBeTruthy();
    expect(result.value.organizationId).toBeTruthy();
    const stored = await users.findByEmail("bradley@example.com");
    expect(stored?.passwordHash).toBe("hashed:a-strong-password");
    const orgs = await organizations.listByOwnerId(result.value.userId);
    expect(orgs).toHaveLength(1);
  });

  it("publishes user_registered and organization_created after persistence, then clears", async () => {
    const { useCase, publisher, users } = makeUseCase();

    const result = await useCase.execute(input);

    const names = publisher.published.map((event) => event.eventName);
    expect(names).toContain("identity.user_registered");
    expect(names).toContain("identity.organization_created");
    const stored = await users.findById(result.value.userId);
    expect(stored?.domainEvents).toHaveLength(0);
  });

  it("rejects a duplicate email, case-insensitively", async () => {
    const { useCase } = makeUseCase();
    await useCase.execute(input);

    const result = await useCase.execute({ ...input, email: "BRADLEY@example.COM" });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("EmailAlreadyInUseError");
  });

  it("rejects a weak password (< 12 chars)", async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ ...input, password: "short" });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("WeakPasswordError");
  });

  it("rejects an invalid email without touching the repositories", async () => {
    const { useCase, users } = makeUseCase();

    const result = await useCase.execute({ ...input, email: "nope" });

    expect(result.isFailure).toBe(true);
    expect(users.users.size).toBe(0);
  });
});
