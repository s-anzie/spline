import { User } from "./user";
import { InvalidEmailError } from "./user.errors";

describe("User", () => {
  it("normalizes the email (trimmed, lowercased)", () => {
    const user = User.create({
      email: "  Someone@Example.com  ",
      passwordHash: "hash",
      displayName: "Someone",
    });

    expect(user.email).toBe("someone@example.com");
  });

  it("rejects an invalid email", () => {
    expect(() =>
      User.create({ email: "not-an-email", passwordHash: "hash", displayName: "Someone" }),
    ).toThrow(InvalidEmailError);
  });

  it("exposes the display name and password hash as given", () => {
    const user = User.create({
      email: "someone@example.com",
      passwordHash: "hashed-secret",
      displayName: "Someone",
    });

    expect(user.displayName).toBe("Someone");
    expect(user.passwordHash).toBe("hashed-secret");
  });
});
