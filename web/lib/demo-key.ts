// Reading the demo sitter's key (DEMO_SITTER_KEY) from the host's environment, forgivingly, and saying exactly what
// is wrong with it when it cannot be used, in words that never repeat it. Pure, so node runs it in
// tests/unit; only lib/demo-server.ts calls it with the real environment.

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;

/** The two things that can be wrong, word for word what GET /api/demo/status says. */
export const NO_KEY = "no key set";
export const BAD_KEY = "the key set is not a 0x private key of 64 hex characters";

/**
 * The key as it was pasted into the host, made usable when it can be: spaces and surrounding quotes
 * are dropped and a 64-hex key without its 0x is given one. Anything else stays unusable.
 */
export function cleanKey(raw: string | undefined): string {
  let key = String(raw ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) key = "0x" + key;
  if (/^0X[0-9a-fA-F]{64}$/.test(key)) key = "0x" + key.slice(2);
  return key;
}

/** "" when the key can be used, else exactly which problem it is. */
export function keyProblem(raw: string | undefined): string {
  if (!String(raw ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim()) return NO_KEY;
  if (!KEY_RE.test(cleanKey(raw))) return BAD_KEY;
  return "";
}
