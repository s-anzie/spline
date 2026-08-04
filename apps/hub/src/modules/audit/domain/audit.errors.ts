import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class AuditEntryNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("AuditEntry", id);
  }
}
