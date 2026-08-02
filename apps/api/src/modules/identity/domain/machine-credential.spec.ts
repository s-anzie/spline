import { MachineCredential } from "./machine-credential";

describe("MachineCredential", () => {
  it("is active right after creation", () => {
    const credential = MachineCredential.create({
      machineId: "machine-1",
      tokenHash: "hash",
    });

    expect(credential.isActive()).toBe(true);
    expect(credential.revokedAt).toBeUndefined();
  });

  it("becomes inactive once revoked", () => {
    const credential = MachineCredential.create({
      machineId: "machine-1",
      tokenHash: "hash",
    });

    credential.revoke(new Date());

    expect(credential.isActive()).toBe(false);
    expect(credential.revokedAt).toBeInstanceOf(Date);
  });

  it("becomes active again with a new hash after rotation", () => {
    const credential = MachineCredential.create({
      machineId: "machine-1",
      tokenHash: "old",
    });
    credential.revoke(new Date());
    credential.rotate("new");
    expect(credential.isActive()).toBe(true);
    expect(credential.tokenHash).toBe("new");
  });
});
