import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    rules: {
      // Nest DTOs are validated classes with no members beyond decorators.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  {
    /**
     * Type-aware linting, for one rule this codebase has already paid for.
     * When EventPublisher became asynchronous, the compiler only flagged the
     * call sites whose return value was used. Thirty-four calls to
     * `flushDomainEvents` kept compiling as discarded promises, so facts were
     * written after the request had already returned — surfacing as
     * foreign-key violations against rows a later test had truncated, and as
     * unhandled rejections in production.
     *
     * A promise nobody awaits is the exact failure mode this system refuses
     * everywhere else. It is an error now, not a review habit.
     */
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
];
