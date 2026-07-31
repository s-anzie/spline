import { InvalidEmailError } from "../domain/user.errors";
import { EmailAlreadyInUseError } from "./identity-application.errors";
import { RegisterUserUseCase } from "./register-user.use-case";
import { FakePasswordHasher } from "./testing/fake-password-hasher";
import { InMemoryUserRepository } from "./testing/in-memory-user.repository";

describe("RegisterUserUseCase", () => {
  function setup() {
    const users = new InMemoryUserRepository();
    const useCase = new RegisterUserUseCase(users, new FakePasswordHasher());
    return { users, useCase };
  }

  it("registers a new user with a hashed password", async () => {
    const { users, useCase } = setup();

    const result = await useCase.execute({
      email: "someone@example.com",
      password: "correct-horse",
      displayName: "Someone",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.passwordHash).toBe("hashed:correct-horse");
    await expect(users.findByEmail("someone@example.com")).resolves.not.toBeNull();
  });

  it("rejects a duplicate email", async () => {
    const { useCase } = setup();
    await useCase.execute({ email: "dup@example.com", password: "pw", displayName: "A" });

    const result = await useCase.execute({ email: "dup@example.com", password: "pw2", displayName: "B" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmailAlreadyInUseError);
  });

  it("rejects an invalid email without hitting the repository", async () => {
    const { users, useCase } = setup();

    const result = await useCase.execute({
      email: "not-an-email",
      password: "pw",
      displayName: "A",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidEmailError);
    await expect(users.findByEmail("not-an-email")).resolves.toBeNull();
  });
});
