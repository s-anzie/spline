export class Result<T, E> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value: T | undefined,
    private readonly _error: E | undefined,
  ) {}

  static ok<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  static fail<T, E>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  get isSuccess(): boolean {
    return this._isSuccess;
  }

  get isFailure(): boolean {
    return !this._isSuccess;
  }

  get value(): T {
    if (!this._isSuccess) {
      throw new Error("Cannot read the value of a failed Result");
    }
    return this._value as T;
  }

  get error(): E {
    if (this._isSuccess) {
      throw new Error("Cannot read the error of a successful Result");
    }
    return this._error as E;
  }
}
