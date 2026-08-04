import { Email } from "./email";

describe("Email", () => {
  it("normalizes to lowercase and trims", () => {
    const result = Email.create("  Bradley@Example.COM  ");

    expect(result.isSuccess).toBe(true);
    expect(result.value.value).toBe("bradley@example.com");
  });

  it("rejects malformed addresses", () => {
    for (const raw of ["", "not-an-email", "a@b", "a b@c.com", "@x.com", "a@.com"]) {
      expect(Email.create(raw).isFailure).toBe(true);
    }
  });

  it("failure is an InvalidEmailError", () => {
    expect(Email.create("nope").error.name).toBe("InvalidEmailError");
  });

  it("equality is structural after normalization", () => {
    const a = Email.create("X@Y.dev").value;
    const b = Email.create("x@y.dev").value;

    expect(a.equals(b)).toBe(true);
  });
});
