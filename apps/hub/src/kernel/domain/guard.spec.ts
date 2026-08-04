import { Guard, GuardViolation } from "./guard";

describe("Guard", () => {
  describe("againstEmpty", () => {
    it("returns the trimmed value on success", () => {
      const result = Guard.againstEmpty("  hello  ", "name");

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe("hello");
    });

    it("fails on an empty string", () => {
      const result = Guard.againstEmpty("", "name");

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GuardViolation);
      expect(result.error.message).toContain("name");
    });

    it("fails on whitespace only", () => {
      expect(Guard.againstEmpty("   ", "name").isFailure).toBe(true);
    });

    it("fails on null and undefined", () => {
      expect(Guard.againstEmpty(null, "name").isFailure).toBe(true);
      expect(Guard.againstEmpty(undefined, "name").isFailure).toBe(true);
    });
  });

  describe("againstNullOrUndefined", () => {
    it("passes a present value through", () => {
      const result = Guard.againstNullOrUndefined(0, "count");

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(0);
    });

    it("accepts falsy-but-present values (0, empty string, false)", () => {
      expect(Guard.againstNullOrUndefined(0, "n").isSuccess).toBe(true);
      expect(Guard.againstNullOrUndefined("", "s").isSuccess).toBe(true);
      expect(Guard.againstNullOrUndefined(false, "b").isSuccess).toBe(true);
    });

    it("fails on null and undefined", () => {
      expect(Guard.againstNullOrUndefined(null, "x").isFailure).toBe(true);
      expect(Guard.againstNullOrUndefined(undefined, "x").isFailure).toBe(true);
    });
  });

  describe("againstNegative", () => {
    it("accepts zero and positive numbers", () => {
      expect(Guard.againstNegative(0, "n").isSuccess).toBe(true);
      expect(Guard.againstNegative(5, "n").isSuccess).toBe(true);
    });

    it("fails on negative numbers and non-finite values", () => {
      expect(Guard.againstNegative(-1, "n").isFailure).toBe(true);
      expect(Guard.againstNegative(Number.NaN, "n").isFailure).toBe(true);
      expect(Guard.againstNegative(Number.POSITIVE_INFINITY, "n").isFailure).toBe(true);
    });
  });

  describe("GuardViolation", () => {
    it("is a DomainError carrying the argument name", () => {
      const result = Guard.againstEmpty("", "displayName");

      expect(result.error.name).toBe("GuardViolation");
      expect(result.error.argumentName).toBe("displayName");
    });
  });
});
