import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class MemoryEntryNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("MemoryEntry", id);
  }
}
