import { randomUUID } from "node:crypto";

export class UniqueEntityId {
  readonly value: string;

  constructor(value?: string) {
    this.value = value ?? randomUUID();
  }

  equals(other: UniqueEntityId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
