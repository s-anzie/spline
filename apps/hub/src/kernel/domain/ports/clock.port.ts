/**
 * Time source port: domain and application code never call `new Date()`
 * directly, so tests can freeze or advance time deterministically.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = "kernel/Clock";
