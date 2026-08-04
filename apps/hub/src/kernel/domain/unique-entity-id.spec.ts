import { UniqueEntityId } from "./unique-entity-id";

describe("UniqueEntityId", () => {
  it("generates a UUID when no value is provided", () => {
    const id = new UniqueEntityId();

    expect(id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("keeps the provided value", () => {
    const id = new UniqueEntityId("agent-1");

    expect(id.value).toBe("agent-1");
  });

  it("two generated ids differ", () => {
    expect(new UniqueEntityId().value).not.toBe(new UniqueEntityId().value);
  });

  it("equals compares by value", () => {
    expect(new UniqueEntityId("x").equals(new UniqueEntityId("x"))).toBe(true);
    expect(new UniqueEntityId("x").equals(new UniqueEntityId("y"))).toBe(false);
  });

  it("toString returns the raw value", () => {
    expect(new UniqueEntityId("abc").toString()).toBe("abc");
  });
});
