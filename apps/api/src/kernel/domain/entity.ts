import { UniqueEntityId } from "./unique-entity-id";

export abstract class Entity<Props> {
  protected readonly props: Props;
  public readonly id: UniqueEntityId;

  protected constructor(props: Props, id?: UniqueEntityId) {
    this.props = props;
    this.id = id ?? UniqueEntityId.create();
  }

  equals(other?: Entity<Props>): boolean {
    if (!other) {
      return false;
    }
    if (this === other) {
      return true;
    }
    return this.id.equals(other.id);
  }
}
