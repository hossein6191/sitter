// Asks contracts/sitter.py itself, through tests/unit/contract_oracle.py, with no network: a
// list of calls in, the contract's answers out. null when no python3 is on this machine, and the
// tests that need it say so and skip.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./contract_oracle.py", import.meta.url));

export function askContract(calls) {
  for (const python of ["python3", "python"]) {
    const run = spawnSync(python, ["-I", "-B", script], { input: JSON.stringify(calls), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    if (run.error) continue;
    if (run.status !== 0) throw new Error(`the contract oracle failed: ${run.stderr.slice(0, 400)}`);
    return JSON.parse(run.stdout);
  }
  return null;
}
