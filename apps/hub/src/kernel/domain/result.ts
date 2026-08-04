/**
 * Explicit success/failure return type for expected domain failures.
 * Exceptions are reserved for programmer errors; anything a caller is
 * expected to handle flows through a Result.
 */
export class Result<T, E = never> {
  private constructor(
    readonly isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  get isFailure(): boolean {
    return !this.isSuccess;
  }

  get value(): T {
    if (!this.isSuccess) {
      throw new Error("Cannot read the value of a failed Result");
    }
    return this._value as T;
  }

  get error(): E {
    if (this.isSuccess) {
      throw new Error("Cannot read the error of a successful Result");
    }
    return this._error as E;
  }

  static ok<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  static fail<T, E>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  /** Succeeds when every result succeeds; otherwise returns the first failure. */
  static combine<E>(results: readonly Result<unknown, E>[]): Result<void, E> {
    for (const result of results) {
      if (result.isFailure) {
        return Result.fail<void, E>(result.error);
      }
    }
    return Result.ok<void, E>(undefined);
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.isFailure) {
      return Result.fail<U, E>(this.error);
    }
    return Result.ok<U, E>(fn(this.value));
  }

  /** Chains a result-returning operation; short-circuits on failure. */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this.isFailure) {
      return Result.fail<U, E>(this.error);
    }
    return fn(this.value);
  }

  mapError<F>(fn: (error: E) => F): Result<T, F> {
    if (this.isSuccess) {
      return Result.ok<T, F>(this.value);
    }
    return Result.fail<T, F>(fn(this.error));
  }
}
