import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import {
  FakePasswordHasher,
  FakeTokenSigner,
  InMemoryOrganizationRepository,
  InMemoryUserRepository,
} from "./testing/identity.doubles";
import { LoginUseCase } from "./login.use-case";
import { RegisterUserUseCase } from "./register-user.use-case";

async function makeLoggedOutUser() {
  const users = new InMemoryUserRepository();
  const register = new RegisterUserUseCase(
    users,
    new InMemoryOrganizationRepository(),
    new FakePasswordHasher(),
    new FakeClock(),
    new FakeEventPublisher(),
  );
  const registered = await register.execute({
    email: "bradley@example.com",
    password: "a-strong-password",
    displayName: "Bradley",
  });
  const useCase = new LoginUseCase(users, new FakePasswordHasher(), new FakeTokenSigner());
  return { useCase, userId: registered.value.userId };
}

describe("LoginUseCase", () => {
  it("returns a signed token for valid credentials, normalizing the email", async () => {
    const { useCase, userId } = await makeLoggedOutUser();

    const result = await useCase.execute({
      email: "  BRADLEY@example.com ",
      password: "a-strong-password",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.accessToken).toBe(`jwt:${userId}`);
    expect(result.value.userId).toBe(userId);
  });

  it("fails with the same error for unknown email and wrong password (anti-enumeration)", async () => {
    const { useCase } = await makeLoggedOutUser();

    const unknown = await useCase.execute({
      email: "who@example.com",
      password: "a-strong-password",
    });
    const wrongPassword = await useCase.execute({
      email: "bradley@example.com",
      password: "not-the-password",
    });

    expect(unknown.isFailure).toBe(true);
    expect(wrongPassword.isFailure).toBe(true);
    expect(unknown.error.name).toBe("InvalidCredentialsError");
    expect(wrongPassword.error.name).toBe(unknown.error.name);
  });

  it("fails the same way for a malformed email — no format oracle either", async () => {
    const { useCase } = await makeLoggedOutUser();

    const result = await useCase.execute({ email: "garbage", password: "x" });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("InvalidCredentialsError");
  });
});
