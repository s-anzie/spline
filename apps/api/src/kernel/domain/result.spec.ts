import { DomainError } from "./domain-error";
import { Result } from "./result";

class SampleError extends DomainError {
  constructor() {
    super("SAMPLE_ERROR", "something went wrong");
  }
}

describe("Result", () => {
  it("carries a value on success", () => {
    const result = Result.ok<number>(42);

    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    expect(result.value).toBe(42);
  });

  it("carries an error on failure", () => {
    const error = new SampleError();
    const result = Result.fail<number, SampleError>(error);

    expect(result.isFailure).toBe(true);
    expect(result.isSuccess).toBe(false);
    expect(result.error).toBe(error);
  });

  it("throws when reading the value of a failed result", () => {
    const result = Result.fail<number, SampleError>(new SampleError());

    expect(() => result.value).toThrow();
  });

  it("throws when reading the error of a successful result", () => {
    const result = Result.ok<number>(1);

    expect(() => result.error).toThrow();
  });
});
