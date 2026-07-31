export abstract class DomainError {
  protected constructor(
    public readonly code: string,
    public readonly message: string,
  ) {}
}
