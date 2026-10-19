"use client";

import * as React from "react";

import { useLocal } from "@/components/use-local";
import { chainVersion } from "@/lib/chain";
import type { ReadResult } from "@/lib/types";

export type ReadState<T> = {
  data: T | null;
  source: "chain" | "mock" | null;
  loading: boolean;
  /** set when the read threw; the page shows "could not reach the network" with a retry, never "no data" */
  error: string;
  retry: () => void;
  /** re-read without clearing what is on screen (after a write landed) */
  refresh: () => Promise<void>;
};

type Result<T> = { key: string | null; data: T | null; source: "chain" | "mock" | null; error: string };

/**
 * One chain read with the three states every page must show: skeleton, data, or
 * "could not reach the network" + retry. `deps` restarts the read; pass `enabled: false` to wait.
 * A new key (deps changed, or retry) clears the old data so a stale page never shows under a new id;
 * `refresh` keeps the current data on screen while it re-reads.
 */
export function useRead<T>(
  read: () => Promise<ReadResult<T>>,
  deps: React.DependencyList,
  options: { enabled?: boolean } = {},
): ReadState<T> {
  const enabled = options.enabled ?? true;
  const [tick, setTick] = React.useState(0);
  // deps are ids and addresses (strings, numbers, booleans); the key names one read attempt
  const key = tick + "|" + deps.map((d) => String(d)).join("|");
  const [res, setRes] = React.useState<Result<T>>({ key: null, data: null, source: null, error: "" });
  const readRef = React.useRef(read);
  const seq = React.useRef(0);

  React.useEffect(() => {
    readRef.current = read;
  });

  const run = React.useCallback(async (k: string) => {
    const mine = ++seq.current;
    try {
      const r = await readRef.current();
      if (mine !== seq.current) return;
      setRes({ key: k, data: r.data, source: r.source, error: "" });
    } catch (e) {
      if (mine !== seq.current) return;
      const msg = (e instanceof Error ? e.message : String(e)) || "could not reach the network";
      setRes((prev) => (prev.key === k ? { ...prev, error: msg } : { key: k, data: null, source: null, error: msg }));
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    void run(key);
  }, [enabled, key, run]);

  const retry = React.useCallback(() => setTick((t) => t + 1), []);
  const refresh = React.useCallback(() => run(key), [run, key]);

  const current = res.key === key;
  return {
    data: current ? res.data : null,
    source: current ? res.source : null,
    loading: enabled && !current,
    error: current ? res.error : "",
    retry,
    refresh,
  };
}

const noopSubscribe = () => () => {};

/** A browser-only boolean read during render without an effect (false on the server). */
export function useBrowserFlag(read: () => boolean): boolean {
  return React.useSyncExternalStore(noopSubscribe, read, () => false);
}

/** `window.matchMedia(query).matches`, live. */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The current `window.location.search` (empty on the server). */
export function useSearchString(): string {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => window.location.search,
    () => "",
  );
}

/**
 * Re-reads in place (keeping what is on screen) every time the chain moves under the page: a list
 * beside the diary, or a count in the rail, catches up with a transaction another pane just finished.
 */
export function useAfterTx(refresh: () => void | Promise<void>): void {
  const version = useLocal(chainVersion, 0);
  const ref = React.useRef(refresh);
  React.useEffect(() => {
    ref.current = refresh;
  });
  React.useEffect(() => {
    if (version > 0) void ref.current();
  }, [version]);
}
