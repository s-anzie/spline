import { randomUUID } from "node:crypto";

export class UniqueEntityId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value?: string): UniqueEntityId {
    return new UniqueEntityId(value ?? randomUUID());
  }

  toString(): string {
    return this.value;
  }

  equals(other?: UniqueEntityId): boolean {
    if (!other) {
      return false;
    }
    return this.value === other.value;
  }
}
