import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { parseActorToken } from "../domain/actor-token";
import {
  FakePasswordHasher,
  FakeSecretGenerator,
  InMemoryActorCredentialRepository,
} from "./testing/identity.doubles";
import { IssueActorCredentialUseCase } from "./issue-actor-credential.use-case";
import { RevokeActorCredentialUseCase } from "./revoke-actor-credential.use-case";
import { VerifyActorTokenUseCase } from "./verify-actor-token.use-case";

function makeUseCases() {
  const credentials = new InMemoryActorCredentialRepository();
  const hasher = new FakePasswordHasher();
  const clock = new FakeClock(new Date("2026-08-04T10:00:00Z"));
  const publisher = new FakeEventPublisher();
  const issue = new IssueActorCredentialUseCase(
    credentials,
    hasher,
    new FakeSecretGenerator(),
    clock,
    publisher,
  );
  const revoke = new RevokeActorCredentialUseCase(credentials, clock, publisher);
  const verify = new VerifyActorTokenUseCase(credentials, hasher, clock);
  return { credentials, issue, revoke, verify, clock };
}

describe("actor credential lifecycle", () => {
  it("issues a parseable token whose secret is stored only as a hash", async () => {
    const { issue, credentials } = makeUseCases();

    const result = await issue.execute({ actorType: "AGENT", actorId: "a-1" });

    expect(result.isSuccess).toBe(true);
    const parsed = parseActorToken(result.value.token).value;
    expect(parsed.actorType).toBe("AGENT");
    const stored = await credentials.findById(parsed.credentialId);
    expect(stored?.tokenHash).toBe(`hashed:${parsed.secret}`);
  });

  it("refuses to issue a credential for a human", async () => {
    const { issue } = makeUseCases();

    const result = await issue.execute({
      actorType: "HUMAN" as never,
      actorId: "u-1",
    });

    expect(result.isFailure).toBe(true);
  });

  it("verify accepts a valid token, touches lastUsedAt, and identifies the actor", async () => {
    const { issue, verify, credentials, clock } = makeUseCases();
    const issued = await issue.execute({ actorType: "WORKER", actorId: "m-1" });
    clock.advance(60_000);

    const result = await verify.execute({ token: issued.value.token });

    expect(result.isSuccess).toBe(true);
    expect(result.value.actor.type).toBe("WORKER");
    expect(result.value.actor.actorId).toBe("m-1");
    const parsed = parseActorToken(issued.value.token).value;
    const stored = await credentials.findById(parsed.credentialId);
    expect(stored?.lastUsedAt).toEqual(new Date("2026-08-04T10:01:00Z"));
  });

  it("verify rejects a revoked credential", async () => {
    const { issue, revoke, verify } = makeUseCases();
    const issued = await issue.execute({ actorType: "AGENT", actorId: "a-1" });
    const credentialId = parseActorToken(issued.value.token).value.credentialId;
    await revoke.execute({ credentialId });

    const result = await verify.execute({ token: issued.value.token });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("CredentialRevokedError");
  });

  it("verify rejects a wrong secret and a malformed token", async () => {
    const { issue, verify } = makeUseCases();
    const issued = await issue.execute({ actorType: "AGENT", actorId: "a-1" });
    const credentialId = parseActorToken(issued.value.token).value.credentialId;

    const wrongSecret = await verify.execute({ token: `agent_${credentialId}.bad` });
    const malformed = await verify.execute({ token: "garbage" });

    expect(wrongSecret.isFailure).toBe(true);
    expect(malformed.isFailure).toBe(true);
  });

  it("issuing a second credential does not revoke the first — rotation without a gap", async () => {
    const { issue, verify } = makeUseCases();
    const first = await issue.execute({ actorType: "AGENT", actorId: "a-1" });
    const second = await issue.execute({ actorType: "AGENT", actorId: "a-1" });

    expect((await verify.execute({ token: first.value.token })).isSuccess).toBe(true);
    expect((await verify.execute({ token: second.value.token })).isSuccess).toBe(true);
  });

  it("revoke is idempotent at the use-case level", async () => {
    const { issue, revoke } = makeUseCases();
    const issued = await issue.execute({ actorType: "AGENT", actorId: "a-1" });
    const credentialId = parseActorToken(issued.value.token).value.credentialId;

    const first = await revoke.execute({ credentialId });
    const again = await revoke.execute({ credentialId });

    expect(first.isSuccess).toBe(true);
    expect(again.isSuccess).toBe(true);
  });

  it("revoke fails cleanly on an unknown credential", async () => {
    const { revoke } = makeUseCases();

    const result = await revoke.execute({ credentialId: "nope" });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("CredentialNotFoundError");
  });
});
