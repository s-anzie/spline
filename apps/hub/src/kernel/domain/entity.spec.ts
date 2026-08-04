import { Entity } from "./entity";
import { UniqueEntityId } from "./unique-entity-id";

interface Props {
  name: string;
}

class TestEntity extends Entity<Props> {
  constructor(props: Props, id?: UniqueEntityId) {
    super(props, id);
  }

  get name(): string {
    return this.props.name;
  }
}

describe("Entity", () => {
  it("exposes the id it was created with", () => {
    const id = new UniqueEntityId("e-1");
    const entity = new TestEntity({ name: "a" }, id);

    expect(entity.id.equals(id)).toBe(true);
  });

  it("generates an id when none is given", () => {
    const entity = new TestEntity({ name: "a" });

    expect(entity.id.value).toBeTruthy();
  });

  it("equality is identity-based, not structural", () => {
    const id = new UniqueEntityId("same");
    const a = new TestEntity({ name: "a" }, id);
    const b = new TestEntity({ name: "completely different" }, id);
    const c = new TestEntity({ name: "a" });

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("equals handles null and undefined", () => {
    const entity = new TestEntity({ name: "a" });

    expect(entity.equals(null)).toBe(false);
    expect(entity.equals(undefined)).toBe(false);
  });

  it("equals is reflexive", () => {
    const entity = new TestEntity({ name: "a" });

    expect(entity.equals(entity)).toBe(true);
  });
});
