// What this browser remembers about each booking: the transactions it sent for it, with what each one
// did. A contract does not know the hashes of the transactions that ran it, so a booking on chain
// cannot list them; the browser that sent them can, and the diary links each one to the explorer. A
// report whose round stored nothing is remembered too, so the diary can say it was tried.

import { readItem, writeItem } from "./browser-store.ts";
import { contractAddress } from "./config.ts";

export type Remembered = { hash: string; label: string; at: number };

const HASH = /^0x[0-9a-fA-F]{64}$/;
// The in-memory contract of mock mode starts again on every load and hands out B1, B2... again, so
// what this browser remembers about it is kept per load: a new B7 never inherits an old B7's list.
const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const MOCK_LOAD = typeof window === "undefined" ? "" : Math.random().toString(36).slice(2, 10);
const scope = () => (MOCK ? `mock-${MOCK_LOAD}` : contractAddress() || "no-contract").toLowerCase();
const keyOf = (thing: string) => `sitter:tx:${scope()}:${thing}`;

/** The raw stored list for a booking id (a string, so it can be a stable store snapshot). */
export const rememberedRaw = (thing: string): string => readItem(keyOf(thing));

export function parseRemembered(raw: string): Remembered[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Remembered[];
    return Array.isArray(list) ? list.filter((r) => r && HASH.test(String(r.hash)) && typeof r.label === "string") : [];
  } catch {
    return [];
  }
}

export function rememberTx(thing: string, hash: string, label: string): void {
  if (!thing || !HASH.test(hash)) return;
  const list = parseRemembered(rememberedRaw(thing)).filter((r) => r.hash !== hash);
  list.unshift({ hash, label, at: Math.floor(Date.now() / 1000) });
  writeItem(keyOf(thing), JSON.stringify(list.slice(0, 16)));
}
