// Local dev server (node, no shell): NEXT_PUBLIC_MOCK=1 by default; NEXT_PUBLIC_MOCK=0 reads the chain.
// PORT picks the port (3240 when unset).
import { spawn } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// macOS writes "._" side files on some drives; left inside .next they break the dev server.
const sweep = (dir) => {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (name.startsWith("._")) {
      try {
        rmSync(p, { force: true });
      } catch {}
      continue;
    }
    try {
      if (statSync(p).isDirectory()) sweep(p);
    } catch {}
  }
};
sweep(join(root, ".next"));
const env = { ...process.env, NEXT_PUBLIC_MOCK: process.env.NEXT_PUBLIC_MOCK ?? "1" };
const port = process.env.PORT ?? "3240";
const child = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", port], { cwd: root, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
