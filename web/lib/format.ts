// Display helpers. Pure functions, no React, no imports: node runs them in tests/unit.

const ATTO = 10n ** 18n;

/** "0.5 GEN", "1.25 GEN", "0.0125 GEN" from an atto amount (string, bigint or number): up to four decimals, trailing zeros dropped. */
export function gen(atto: string | bigint | number | null | undefined, unit = " GEN"): string {
  if (atto === null || atto === undefined || atto === "") return "0" + unit;
  let v: bigint;
  try {
    v = typeof atto === "bigint" ? atto : BigInt(String(atto).trim());
  } catch {
    return "?" + unit;
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / ATTO;
  const frac = v % ATTO;
  const f = (frac / 10n ** 14n).toString().padStart(4, "0").replace(/0+$/, "");
  let out = whole.toString() + (f ? "." + f : "");
  if (frac > 0n && !f && whole === 0n) out = "<0.0001";
  return (neg ? "-" : "") + out + unit;
}

/** GEN to atto. Accepts "1", "0.5", "1.25"; throws on anything else. */
export function toAtto(genText: string): bigint {
  const t = genText.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) throw new Error("Enter an amount like 0.5 or 12");
  const [w, f = ""] = t.split(".");
  return BigInt(w) * ATTO + BigInt((f + "0".repeat(18)).slice(0, 18));
}

/** GEN text to atto, or null when it is not an amount. */
export function tryAtto(genText: string): bigint | null {
  try {
    return toAtto(genText);
  } catch {
    return null;
  }
}

/** An atto amount as plain GEN text with every decimal kept ("1.25"), for a form field. */
export function genText(atto: string | bigint): string {
  let v: bigint;
  try {
    v = typeof atto === "bigint" ? atto : BigInt(String(atto).trim());
  } catch {
    return "";
  }
  const frac = (v % ATTO).toString().padStart(18, "0").replace(/0+$/, "");
  return (v / ATTO).toString() + (frac ? "." + frac : "");
}

/** 0x1234…abcd */
export function short(address: string | null | undefined, head = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= head + tail + 1) return address;
  return address.slice(0, head) + "…" + address.slice(-tail);
}

/** "4 min 12 s", "2 h 5 min", "3 d 4 h" from a number of seconds; "0 s" at or below zero. */
export function span(seconds: number): string {
  const left = Math.max(0, Math.floor(seconds));
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return s ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** "20 minutes", "1 hour", "2 days", "90 seconds": an allowance or a step as a person says it. */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s > 0 && s % 86400 === 0) return s === 86400 ? "1 day" : `${s / 86400} days`;
  if (s > 0 && s % 3600 === 0) return s === 3600 ? "1 hour" : `${s / 3600} hours`;
  if (s > 0 && s % 60 === 0) return s === 60 ? "1 minute" : `${s / 60} minutes`;
  return s === 1 ? "1 second" : `${s} seconds`;
}

/** "2 Oct 2026, 21:40" in the reader's own zone, from chain seconds; "" for zero or junk. */
export function when(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(seconds * 1000));
}

/** "3 min ago", "2 h ago", "4 days ago"; "just now" under a minute. */
export function ago(seconds: number, nowSeconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const s = Math.max(0, Math.floor(nowSeconds - seconds));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** "14:32" in the reader's own zone, or "11 Oct, 14:32" when it is not today; "" for zero or junk. */
export function clockTime(seconds: number | null | undefined, nowSeconds: number = Math.floor(Date.now() / 1000)): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  const d = new Date(seconds * 1000);
  const today = new Date(nowSeconds * 1000);
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  if (sameDay) return time;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d) + ", " + time;
}

/** "one", "two" ... for small counts in running text. */
export const countWord = (n: number): string => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"][n] ?? String(n);

/** "1 message", "3 messages". */
export const plural = (n: number, one: string, many = one + "s"): string => `${n} ${n === 1 ? one : many}`;

/** The share of `part` in `whole` as a percentage from 0 to 100, for widths. */
export function share(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  const p = part < 0n ? 0n : part > whole ? whole : part;
  return Number((p * 10000n) / whole) / 100;
}
