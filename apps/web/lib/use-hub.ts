"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { HubResult } from "./hub";

interface Resource<T> {
  data: T | null;
  error: string | null;
  /** True only on the FIRST load. A refresh must not blank the screen. */
  loading: boolean;
  /** True while a refresh is in flight, so the screen can say so quietly. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * One request, kept fresh.
 *
 * Two things here are deliberate and were both bugs first:
 *
 * `loading` is only true before there has ever been data. A console that
 * blanked itself every poll would be unreadable at exactly the moment it
 * matters, and an operator would learn to stop looking at it.
 *
 * A late answer is dropped rather than applied. When the workspace changes
 * mid-flight, the previous workspace's answer can still arrive — and showing
 * one workspace's rows under another's name is the one thing §4.2 forbids
 * outright.
 */
export function useResource<T>(
  load: () => Promise<HubResult<T>>,
  deps: React.DependencyList,
  options: { pollMs?: number; enabled?: boolean } = {},
): Resource<T> {
  const { pollMs, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);

  const generation = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    const mine = ++generation.current;
    setRefreshing(true);
    const result = await loadRef.current();
    if (mine !== generation.current) return;
    if (result.ok) {
      setData(result.value);
      setError(null);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setData(null);
    void run();
    if (!pollMs) return;
    const timer = setInterval(() => void run(), pollMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, pollMs]);

  return { data, error, loading, refreshing, reload: run };
}

/**
 * A write, and what came of it.
 *
 * The hub's refusals carry the reason and often the affordance (§20.6), so
 * the error is kept and shown where the button is — not raised to a toast
 * that disappears before it has been read.
 */
export function useAction(): {
  run: (
    call: () => Promise<HubResult<unknown>>,
    onDone?: () => void,
  ) => Promise<boolean>;
  pending: boolean;
  error: string | null;
  clear: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (call: () => Promise<HubResult<unknown>>, onDone?: () => void) => {
      setPending(true);
      setError(null);
      const result = await call();
      setPending(false);
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      onDone?.();
      return true;
    },
    [],
  );

  return { run, pending, error, clear: () => setError(null) };
}
