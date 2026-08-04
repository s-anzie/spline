/**
 * Application-layer convention: one class per operation, a single
 * `execute`. Inputs are plain objects; outputs are `Result`s for every
 * expected failure. The interface exists for uniformity, not polymorphism.
 */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}
