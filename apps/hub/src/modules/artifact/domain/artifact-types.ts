/**
 * §15.1 reference catalogue. Deliberately NOT an enum: §19.2 lets an Engine
 * declare the artifact types it produces, so a closed set would force a core
 * migration for every community extension. These are useful constants; the
 * validation only requires a SCREAMING_SNAKE_CASE identifier.
 */
export const REFERENCE_ARTIFACT_TYPES = [
  "DOCUMENT",
  "LOG",
  "DIFF",
  "COMMIT",
  "CAPTION",
  "REPORT",
  "SCREENSHOT",
  "SPECIFICATION",
  "BENCHMARK",
  "PLAN",
  "METRICS",
  "MODEL",
  "BUNDLE",
] as const;

const TYPE_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export function isValidArtifactType(type: string): boolean {
  return TYPE_PATTERN.test(type);
}
