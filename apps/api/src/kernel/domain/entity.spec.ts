import { Entity } from "./entity";
import { UniqueEntityId } from "./unique-entity-id";

interface DummyProps {
  name: string;
}

class Dummy extends Entity<DummyProps> {
  static create(props: DummyProps, id?: UniqueEntityId): Dummy {
    return new Dummy(props, id);
  }

  get name(): string {
    return this.props.name;
  }
}

describe("Entity", () => {
  it("is equal to itself", () => {
    const dummy = Dummy.create({ name: "a" });

    expect(dummy.equals(dummy)).toBe(true);
  });

  it("is equal to another entity sharing the same id, regardless of props", () => {
    const id = UniqueEntityId.create("shared");
    const a = Dummy.create({ name: "a" }, id);
    const b = Dummy.create({ name: "b" }, id);

    expect(a.equals(b)).toBe(true);
  });

  it("is not equal to an entity with a different id", () => {
    const a = Dummy.create({ name: "a" });
    const b = Dummy.create({ name: "a" });

    expect(a.equals(b)).toBe(false);
  });

  it("is not equal to undefined", () => {
    const a = Dummy.create({ name: "a" });

    expect(a.equals(undefined)).toBe(false);
  });
});
