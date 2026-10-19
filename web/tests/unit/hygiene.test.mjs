// Nothing personal and nothing internal in the site's files: no local paths, no e-mail addresses, no
// private keys, no notes for coding tools, no mention of the tools that helped write it, no account
// name, and no place this site must not name.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", "package-lock.json", ".DS_Store", "tsconfig.tsbuildinfo", "next-env.d.ts"]);
const self = fileURLToPath(import.meta.url);

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith("._")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|mjs|js|json|css|md|svg|html|py|example)$/.test(name) || name.startsWith(".")) out.push(p);
  }
  return out;
}

// Spelled in pieces so this file does not trip over itself.
const FORBIDDEN = [
  ["a local volume path", new RegExp("/" + "Volumes/")],
  ["a home directory", new RegExp("/" + "Users/")],
  ["an e-mail address", /[A-Za-z0-9._%+-]+@(?!\d)[A-Za-z0-9-]+\.(com|org|net|io|dev|ai)\b/],
  ["a private key", /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/],
  ["an assistant", new RegExp("\\b(" + ["Cla" + "ude", "Anth" + "ropic", "Chat" + "GPT", "Co-" + "Authored"].join("|") + ")\\b", "i")],
  ["a place this site must not name", new RegExp("\\b(" + ["Ir" + "an", "Teh" + "ran"].join("|") + ")\\b", "i")],
  ["an account name", new RegExp(["hos" + "sein6191", "hos" + "seinraid", "m\\.h\\." + "rez" + "aei", "project" + ":genlayer"].join("|"), "i")],
];

test("no file of the site carries anything personal or internal", () => {
  const found = [];
  // `next dev` writes two notes for coding tools when it runs under one; they never belong in the repository.
  for (const name of ["AGE" + "NTS.md", "CLA" + "UDE.md"]) {
    try {
      statSync(join(root, name));
      found.push(`${name}: a note written for a coding tool`);
    } catch {
      /* absent, as it should be */
    }
  }
  const all = files(root);
  assert.ok(all.length > 50, `read ${all.length} files`);
  for (const f of all) {
    if (f === self) continue;
    const text = readFileSync(f, "utf8");
    for (const [what, re] of FORBIDDEN) if (re.test(text)) found.push(`${relative(root, f)}: ${what}`);
  }
  assert.deepEqual(found, []);
});

test("the repository link comes from the environment, never from a name written here", () => {
  const config = readFileSync(join(root, "lib", "config.ts"), "utf8");
  assert.match(config, /process\.env\.NEXT_PUBLIC_REPO_URL \|\| builtFrom \|\| ""/);
  assert.doesNotMatch(config, /github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+["`]/, "no repository address is written into the source");
});
