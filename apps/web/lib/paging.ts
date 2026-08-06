"use client";

import { useEffect, useState } from "react";

import { usePreferences } from "./store";

export interface Paged<T> {
  /** The slice to render. */
  items: T[];
  page: number;
  pageCount: number;
  size: number;
  /** 1-based, for "showing 26–50 of 137". */
  from: number;
  to: number;
  total: number;
  go(page: number): void;
  setSize(size: number): void;
}

/**
 * 10 earns its place: a laptop showing a queue and a stat row has room for
 * about that many rows before the list starts scrolling under the fold.
 * `PAGE_SIZES[0]` is also the threshold below which the pager hides entirely
 * — a list that fits needs no chrome telling you it fits.
 */
export const PAGE_SIZES = [10, 25, 50, 100, 250] as const;

/**
 * Paging, done here rather than by the hub.
 *
 * Most list routes take a `limit` and no offset — they answer with the most
 * recent N and nothing else — so paging over what arrived is the honest
 * option. What is NOT honest is hiding that: whenever the hub's own cap was
 * reached, `Pager` says so out loud rather than letting page 6 of 6 read as
 * the end of the record.
 *
 * The page size is a preference, not per-screen state: an operator who wants
 * dense lists wants them everywhere, and having to set it again on each
 * screen is the kind of small tax that makes people stop using a control.
 */
export function usePaged<T>(items: T[]): Paged<T> {
  const size = usePreferences((state) => state.pageSize);
  const setSize = usePreferences((state) => state.setPageSize);
  const [page, setPage] = useState(1);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));

  // A filter that shortens the list can leave the reader stranded on a page
  // that no longer exists, staring at an empty panel that looks like a bug.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const current = Math.min(page, pageCount);
  const start = (current - 1) * size;

  return {
    items: items.slice(start, start + size),
    page: current,
    pageCount,
    size,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
    total,
    go: (next) => setPage(Math.max(1, Math.min(next, pageCount))),
    setSize: (next) => {
      setSize(next);
      // Back to the top: keeping page 4 after switching to 250-per-page would
      // land somewhere nobody asked for.
      setPage(1);
    },
  };
}
