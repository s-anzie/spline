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
];
