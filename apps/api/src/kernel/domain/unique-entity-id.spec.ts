import { UniqueEntityId } from "./unique-entity-id";

describe("UniqueEntityId", () => {
  it("generates a fresh id when none is provided", () => {
    const a = UniqueEntityId.create();
    const b = UniqueEntityId.create();

    expect(a.toString()).toHaveLength(36);
    expect(a.equals(b)).toBe(false);
  });

  it("wraps a provided value instead of generating a new one", () => {
    const id = UniqueEntityId.create("fixed-id");

    expect(id.toString()).toBe("fixed-id");
  });

  it("is equal to another id with the same value", () => {
    const a = UniqueEntityId.create("same");
    const b = UniqueEntityId.create("same");

    expect(a.equals(b)).toBe(true);
  });

  it("is never equal to undefined", () => {
    const a = UniqueEntityId.create("same");

    expect(a.equals(undefined)).toBe(false);
  });
});
