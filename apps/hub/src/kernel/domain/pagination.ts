/**
 * Canonical page bounds (v3 spec §20). Every list query goes through
 * `pageSize` instead of hand-rolling a `take`, so "no limit given" never
 * means "return everything".
 *
 * This became a kernel primitive after an audit found the convention in three
 * modules and absent from eight: eleven list endpoints returned an entire
 * table. On day one that is invisible; on day one hundred it is a wall, and
 * a client cannot even tell it is loading more than it asked for.
 *
 * Two constants rather than one: the default protects a caller who said
 * nothing, the ceiling protects the server from a caller who said too much.
 */
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

export function pageSize(
  requested: number | undefined,
  bounds: { fallback?: number; ceiling?: number } = {},
): number {
  const fallback = bounds.fallback ?? DEFAULT_PAGE_SIZE;
  const ceiling = bounds.ceiling ?? MAX_PAGE_SIZE;
  if (requested === undefined || !Number.isFinite(requested) || requested < 1) {
    return Math.min(fallback, ceiling);
  }
  return Math.min(Math.floor(requested), ceiling);
}
