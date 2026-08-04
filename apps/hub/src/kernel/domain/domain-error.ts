/**
 * Base class for every expected domain failure carried inside a Result.
 * The name always mirrors the concrete class so failures stay identifiable
 * after serialization or logging.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
