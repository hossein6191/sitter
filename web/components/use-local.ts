"use client";

// Read a browser-only value (localStorage-backed) during render, without an effect that sets
// state: useSyncExternalStore re-renders when lib/browser-store notifies. Snapshots must be
// stable primitives. `server` is what the server renders and what hydration starts from.

import { useSyncExternalStore } from "react";
import { subscribe } from "@/lib/browser-store";

export function useLocal<T extends string | number | boolean | null>(read: () => T, server: T): T {
  return useSyncExternalStore(subscribe, read, () => server);
}
