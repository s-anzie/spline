import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class ValidationNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Validation", id);
  }
}
