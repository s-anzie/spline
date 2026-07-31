import { BcryptPasswordHasher } from "./bcrypt-password-hasher";

describe("BcryptPasswordHasher", () => {
  it("produces a hash that verifies against the original plain text", async () => {
    const hasher = new BcryptPasswordHasher();

    const hash = await hasher.hash("correct-horse-battery-staple");

    expect(hash).not.toBe("correct-horse-battery-staple");
    await expect(hasher.compare("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect plain text", async () => {
    const hasher = new BcryptPasswordHasher();
    const hash = await hasher.hash("correct-horse-battery-staple");

    await expect(hasher.compare("wrong-guess", hash)).resolves.toBe(false);
  });

  it("produces a different hash for the same input each time (random salt)", async () => {
    const hasher = new BcryptPasswordHasher();

    const [a, b] = await Promise.all([hasher.hash("same-input"), hasher.hash("same-input")]);

    expect(a).not.toBe(b);
  });
});
