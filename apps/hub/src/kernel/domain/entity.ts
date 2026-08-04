import { UniqueEntityId } from "./unique-entity-id";

/**
 * Identity-based building block: two entities are the same iff their ids
 * match, regardless of their current attribute values.
 */
export abstract class Entity<Props> {
  readonly id: UniqueEntityId;
  protected readonly props: Props;

  protected constructor(props: Props, id?: UniqueEntityId) {
    this.id = id ?? new UniqueEntityId();
    this.props = props;
  }

  equals(other?: Entity<Props> | null): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (other === this) {
      return true;
    }
    return this.id.equals(other.id);
  }
}
