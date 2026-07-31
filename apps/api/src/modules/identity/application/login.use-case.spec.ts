import { InvalidCredentialsError } from "./identity-application.errors";
import { LoginUseCase } from "./login.use-case";
import { RegisterUserUseCase } from "./register-user.use-case";
import { FakePasswordHasher } from "./testing/fake-password-hasher";
import { FakeTokenService } from "./testing/fake-token-service";
import { InMemoryUserRepository } from "./testing/in-memory-user.repository";

describe("LoginUseCase", () => {
  async function setup() {
    const users = new InMemoryUserRepository();
    const passwordHasher = new FakePasswordHasher();
    const tokenService = new FakeTokenService();
    const registerUseCase = new RegisterUserUseCase(users, passwordHasher);
    await registerUseCase.execute({
      email: "someone@example.com",
      password: "correct-horse",
      displayName: "Someone",
    });

    return { useCase: new LoginUseCase(users, passwordHasher, tokenService), tokenService };
  }

  it("logs in with correct credentials and returns a token", async () => {
    const { useCase, tokenService } = await setup();

    const result = await useCase.execute({ email: "someone@example.com", password: "correct-horse" });

    expect(result.isSuccess).toBe(true);
    expect(result.value.user.email).toBe("someone@example.com");
    expect(tokenService.verify(result.value.token)).toEqual({
      sub: result.value.user.id.toString(),
      kind: "user",
    });
  });

  it("rejects a wrong password", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute({ email: "someone@example.com", password: "wrong" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects an unknown email without leaking whether the account exists", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute({ email: "nobody@example.com", password: "whatever" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidCredentialsError);
  });
});
