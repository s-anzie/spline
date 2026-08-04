import { Email } from "./email";
import { User } from "./user";

const now = new Date("2026-08-04T10:00:00.000Z");

function validProps() {
  return {
    email: Email.create("bradley@example.com").value,
    passwordHash: "$2b$10$hash",
    displayName: "Bradley",
    now,
  };
}

describe("User", () => {
  it("creates a user and raises identity.user_registered", () => {
    const result = User.create(validProps());

    expect(result.isSuccess).toBe(true);
    const user = result.value;
    expect(user.email.value).toBe("bradley@example.com");
    expect(user.displayName).toBe("Bradley");
    expect(user.createdAt).toEqual(now);
    expect(user.domainEvents).toHaveLength(1);
    expect(user.domainEvents[0]?.eventName).toBe("identity.user_registered");
  });

  it("trims the display name", () => {
    const user = User.create({ ...validProps(), displayName: "  Bradley  " }).value;

    expect(user.displayName).toBe("Bradley");
  });

  it("rejects an empty display name or password hash", () => {
    expect(User.create({ ...validProps(), displayName: " " }).isFailure).toBe(true);
    expect(User.create({ ...validProps(), passwordHash: "" }).isFailure).toBe(true);
  });

  it("reconstitute rebuilds from persistence without raising events", () => {
    const user = User.reconstitute(
      {
        email: Email.create("x@y.dev").value,
        passwordHash: "$2b$10$hash",
        displayName: "X",
        createdAt: now,
      },
      "user-1",
    );

    expect(user.id.value).toBe("user-1");
    expect(user.domainEvents).toHaveLength(0);
  });
});
