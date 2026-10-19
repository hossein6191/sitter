"use client";

import * as React from "react";

import { write } from "@/lib/chain";
import type { Call, TxStatus } from "@/lib/types";
import { sentence } from "@/lib/rules";

export type TxRun = {
  /** the tx being tracked, null when nothing is running; a new start() clears the old one first */
  hash: string | null;
  /** the call that produced `hash` */
  call: Call | null;
  /** the final status once the rail reports done */
  final: TxStatus | null;
  /** browser-clock seconds when `hash` was sent; 0 when nothing is running */
  at: number;
  /** an error thrown by write() itself (wallet refused, wrong chain) */
  error: string;
  sending: boolean;
  start: (call: Call) => Promise<string | null>;
  /** track a hash some other signer sent (the demo provider) */
  track: (hash: string, call: Call) => void;
  onDone: (s: TxStatus) => void;
  reset: () => void;
};

/**
 * One write at a time. The previous run's hash and result leave the screen the moment a new run
 * starts, so a stale explorer link never sits over a new transaction.
 */
export function useTx(onFinal?: (s: TxStatus, hash: string, call: Call) => void): TxRun {
  const [hash, setHash] = React.useState<string | null>(null);
  const [call, setCall] = React.useState<Call | null>(null);
  const [final, setFinal] = React.useState<TxStatus | null>(null);
  const [at, setAt] = React.useState(0);
  const [error, setError] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const running = React.useRef<{ hash: string; call: Call } | null>(null);
  const cb = React.useRef(onFinal);
  React.useEffect(() => {
    cb.current = onFinal;
  });

  const reset = React.useCallback(() => {
    running.current = null;
    setHash(null);
    setCall(null);
    setFinal(null);
    setAt(0);
    setError("");
    setSending(false);
  }, []);

  const track = React.useCallback(
    (h: string, c: Call) => {
      reset();
      running.current = { hash: h, call: c };
      setHash(h);
      setCall(c);
      setAt(Math.floor(Date.now() / 1000));
    },
    [reset],
  );

  const start = React.useCallback(
    async (c: Call) => {
      reset();
      setSending(true);
      try {
        const h = await write(c);
        running.current = { hash: h, call: c };
        setHash(h);
        setCall(c);
        setAt(Math.floor(Date.now() / 1000));
        return h;
      } catch (e) {
        setError(cleanWalletError(e instanceof Error ? e.message : String(e)));
        return null;
      } finally {
        setSending(false);
      }
    },
    [reset],
  );

  const onDone = React.useCallback((s: TxStatus) => {
    setFinal(s);
    const r = running.current;
    if (r) cb.current?.(s, r.hash, r.call);
  }, []);

  return { hash, call, final, at, error, sending, start, track, onDone, reset };
}

/** Wallet errors are long JSON; keep the sentence a person can act on. */
export function cleanWalletError(msg: string): string {
  if (!msg) return "The wallet returned an error.";
  if (/user rejected|user denied|rejected the request/i.test(msg)) return "You cancelled the signature in the wallet. Nothing was sent.";
  if (/insufficient funds/i.test(msg)) return "Not enough test GEN. The wallet menu gives 10 test GEN.";
  const m = msg.match(/\[(?:EXPECTED|LLM_ERROR)\]\s*([^"}\n]+)/);
  if (m) return sentence(m[1]);
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}
