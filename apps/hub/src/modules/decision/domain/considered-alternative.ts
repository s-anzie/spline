/**
 * An option that was weighed and lost, with why. Structured rather than free
 * text because §16.10 rebuilds memory from decisions: "what did we rule out
 * and on what grounds" has to stay machine-readable.
 */
export interface ConsideredAlternative {
  option: string;
  rejectedBecause: string;
}
