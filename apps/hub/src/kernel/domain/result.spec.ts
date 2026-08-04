import { Result } from "./result";

describe("Result", () => {
  describe("ok", () => {
    it("wraps a value as a success", () => {
      const result = Result.ok(42);

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.value).toBe(42);
    });

    it("supports void successes", () => {
      const result = Result.ok<void>(undefined);

      expect(result.isSuccess).toBe(true);
    });

    it("throws when reading error from a success", () => {
      const result = Result.ok(1);

      expect(() => result.error).toThrow();
    });
  });

  describe("fail", () => {
    it("wraps an error as a failure", () => {
      const error = new Error("boom");
      const result = Result.fail<number, Error>(error);

      expect(result.isFailure).toBe(true);
      expect(result.isSuccess).toBe(false);
      expect(result.error).toBe(error);
    });

    it("throws when reading value from a failure", () => {
      const result = Result.fail<number, Error>(new Error("boom"));

      expect(() => result.value).toThrow();
    });
  });

  describe("combine", () => {
    it("succeeds when every result succeeds", () => {
      const combined = Result.combine([Result.ok(1), Result.ok("a"), Result.ok(true)]);

      expect(combined.isSuccess).toBe(true);
    });

    it("returns the first failure encountered", () => {
      const first = new Error("first");
      const second = new Error("second");
      const combined = Result.combine([
        Result.ok(1),
        Result.fail<number, Error>(first),
        Result.fail<number, Error>(second),
      ]);

      expect(combined.isFailure).toBe(true);
      expect(combined.error).toBe(first);
    });
  });

  describe("map", () => {
    it("transforms the value of a success", () => {
      const result = Result.ok(2).map((n) => n * 10);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(20);
    });

    it("passes a failure through untouched", () => {
      const error = new Error("boom");
      const result = Result.fail<number, Error>(error).map((n) => n * 10);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(error);
    });
  });

  describe("flatMap", () => {
    const parsePositive = (n: number): Result<number, Error> =>
      n > 0 ? Result.ok(n) : Result.fail(new Error("not positive"));

    it("chains a result-returning operation on success", () => {
      const result = Result.ok<number, Error>(5).flatMap(parsePositive);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(5);
    });

    it("propagates the inner failure", () => {
      const result = Result.ok<number, Error>(-1).flatMap(parsePositive);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("not positive");
    });

    it("short-circuits on an outer failure without calling the function", () => {
      const fn = jest.fn(parsePositive);
      const outer = new Error("outer");

      const result = Result.fail<number, Error>(outer).flatMap(fn);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(outer);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("mapError", () => {
    it("transforms the error of a failure", () => {
      const result = Result.fail<number, string>("raw").mapError(
        (message) => new Error(`wrapped: ${message}`),
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("wrapped: raw");
    });

    it("passes a success through untouched", () => {
      const result = Result.ok<number, string>(7).mapError((m) => new Error(m));

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(7);
    });
  });
});
