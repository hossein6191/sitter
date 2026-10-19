// A tiny subscription over browser-only values (localStorage, and the in-memory contract of mock
// mode). Components read them through the useLocal hook in components/use-local.ts; this module has
// no React in it, so node and server code may import it freely. Writers call notify() after a
// change; other tabs come through the "storage" event.

const listeners = new Set<() => void>();

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = () => cb();
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function notify(): void {
  for (const l of Array.from(listeners)) l();
}

export function readItem(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeItem(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the change lasts for this page only */
  }
  notify();
}
