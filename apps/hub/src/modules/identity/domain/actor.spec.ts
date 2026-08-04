import { ACTOR_TYPES, ActorRef } from "./actor";

describe("ActorRef", () => {
  it("exposes the four v3 actor types (§18.2)", () => {
    expect(ACTOR_TYPES).toEqual(["HUMAN", "AGENT", "WORKER", "SERVICE"]);
  });

  it("creates a reference from a type and id", () => {
    const result = ActorRef.create("AGENT", "a-1");

    expect(result.isSuccess).toBe(true);
    expect(result.value.type).toBe("AGENT");
    expect(result.value.actorId).toBe("a-1");
  });

  it("rejects an empty id", () => {
    expect(ActorRef.create("HUMAN", "").isFailure).toBe(true);
    expect(ActorRef.create("HUMAN", "   ").isFailure).toBe(true);
  });

  it("equality is structural", () => {
    const a = ActorRef.create("AGENT", "a-1").value;
    const b = ActorRef.create("AGENT", "a-1").value;
    const c = ActorRef.create("WORKER", "a-1").value;

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
