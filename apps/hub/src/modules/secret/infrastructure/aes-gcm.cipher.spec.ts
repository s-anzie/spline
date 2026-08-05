import { AesGcmCipher } from "./aes-gcm.cipher";

const KEY = "0".repeat(64); // 32 bytes, hex
const OTHER_KEY = "1".repeat(64);

describe("AesGcmCipher", () => {
  const cipher = new AesGcmCipher(KEY);

  it("returns what was sealed", () => {
    const sealed = cipher.seal("sk-ant-secret-value");

    expect(cipher.open(sealed).value).toBe("sk-ant-secret-value");
  });

  it("never puts the value in what it stores", () => {
    expect(cipher.seal("sk-ant-secret-value")).not.toContain("sk-ant");
  });

  /**
   * A deterministic ciphertext leaks equality: two workspaces holding the
   * same key would be visibly holding the same key, to anyone who can read
   * the table. A fresh IV per seal is what prevents that.
   */
  it("seals the same value differently every time", () => {
    expect(cipher.seal("same")).not.toBe(cipher.seal("same"));
  });

  it("still opens both of them", () => {
    for (const sealed of [cipher.seal("same"), cipher.seal("same")]) {
      expect(cipher.open(sealed).value).toBe("same");
    }
  });

  /**
   * GCM authenticates as well as encrypts, and that is the reason to choose
   * it here: a row an attacker edited must not decrypt to something the
   * attacker chose. It fails instead.
   */
  describe("tampering is detected, not decrypted", () => {
    it("refuses a ciphertext whose bytes changed", () => {
      const sealed = cipher.seal("sk-ant-secret-value");
      const [version, iv, tag, body] = sealed.split(".");
      const flipped = `${body?.slice(0, -2)}ff`;

      expect(cipher.open([version, iv, tag, flipped].join(".")).isFailure).toBe(true);
    });

    it("refuses a ciphertext whose authentication tag changed", () => {
      const sealed = cipher.seal("sk-ant-secret-value");
      const [version, iv, , body] = sealed.split(".");

      expect(
        cipher.open([version, iv, "00".repeat(16), body].join(".")).isFailure,
      ).toBe(true);
    });

    it("refuses a ciphertext sealed with another key", () => {
      const sealed = new AesGcmCipher(OTHER_KEY).seal("sk-ant-secret-value");

      expect(cipher.open(sealed).isFailure).toBe(true);
    });

    it.each(["", "not-even-close", "v1.aa.bb", "v9.aa.bb.cc"])(
      "refuses %j rather than throwing",
      (malformed) => {
        expect(cipher.open(malformed).isFailure).toBe(true);
      },
    );
  });

  /**
   * A key that is too short is not a weaker key, it is a different algorithm
   * pretending to be this one. Refused where it is configured, not where it
   * is used.
   */
  describe("the key", () => {
    it.each(["", "short", "0".repeat(62), "zz".repeat(32)])(
      "refuses %j at construction",
      (key) => {
        expect(() => new AesGcmCipher(key)).toThrow();
      },
    );

    it("accepts exactly 32 bytes of hex", () => {
      expect(() => new AesGcmCipher(KEY)).not.toThrow();
    });
  });

  /**
   * The version prefix is what makes a key rotation possible later without
   * guessing at every stored row's format.
   */
  it("stamps the format it used", () => {
    expect(cipher.seal("x").startsWith("v1.")).toBe(true);
  });
});
