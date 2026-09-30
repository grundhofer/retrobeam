// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Text contrast floor, enforced — because a muted grey that "looks fine" on a
// retina screen is the one class that silently drifts back in.
//
// On white or zinc-50, zinc-400 text is about 2.6:1 and zinc-300 about 1.5:1;
// WCAG AA wants 4.5:1 for body text (3:1 for large text and UI glyphs).
// zinc-500 is about 4.8:1 and is the house muted tone. So any text-zinc-300 /
// text-zinc-400 (including placeholder: and hover: variants) in a .tsx file
// fails, unless the line itself or the line directly above carries
// "contrast-ok: <reason>" — decorative separators, aria-hidden glyphs, disabled
// states, or light text on a dark surface where the grey is the CONTRAST.
// A reason is required so the allow-list stays auditable.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATTERN = /(^|[\s"'`:])text-zinc-(300|400)(?![\w-])/;
const MARKER = /contrast-ok:\s*\w/;

/** Line numbers (1-based) of unmarked low-contrast text classes. */
function findViolations(source) {
  const lines = source.split("\n");
  const hits = [];
  lines.forEach((line, index) => {
    if (!PATTERN.test(line)) return;
    if (MARKER.test(line) || MARKER.test(lines[index - 1] ?? "")) return;
    hits.push(index + 1);
  });
  return hits;
}

// The matcher tests itself first: a regex regression that matches nothing
// would otherwise turn this guard into a silent pass.
const selfTest = [
  ['<p className="text-xs text-zinc-400">', 1],
  ['<input className="placeholder:text-zinc-300" />', 1],
  ['<b className="hover:text-zinc-400">', 1],
  ['<p className="text-zinc-500 border-zinc-300 bg-zinc-400">', 0],
  ['<p className="text-zinc-4000">', 0],
  [
    '<span className="text-zinc-300">·</span> {/* contrast-ok: separator */}',
    0,
  ],
  ['{/* contrast-ok: dark surface */}\n<p className="text-zinc-300">', 0],
  ['{/* contrast-ok: */}\n<p className="text-zinc-300">', 1],
];
for (const [sample, expected] of selfTest) {
  const actual = findViolations(sample).length;
  if (actual !== expected) {
    console.error(
      `check-contrast self-test failed: expected ${expected} hit(s), got ${actual} for:\n  ${sample}`,
    );
    process.exit(1);
  }
}

const ROOT = new URL("../apps/web/src/", import.meta.url);
const root = fileURLToPath(ROOT);
const files = (await readdir(root, { recursive: true, withFileTypes: true }))
  .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".tsx"))
  .map((dirent) =>
    path.relative(root, path.join(dirent.parentPath, dirent.name)),
  )
  .sort();
const problems = [];

for (const entry of files) {
  const source = await readFile(path.join(root, entry), "utf8");
  for (const line of findViolations(source)) {
    problems.push(`apps/web/src/${entry}:${line}`);
  }
}

if (problems.length > 0) {
  console.error(
    `Low-contrast text (text-zinc-300/400 fails WCAG AA on light surfaces) in ${root}:\n` +
      problems.map((p) => `  - ${p}`).join("\n") +
      `\n\nUse text-zinc-500, or mark a decorative use with "contrast-ok: <reason>" on the line or the line above.` +
      `\nSee scripts/check-contrast.mjs for why.`,
  );
  process.exit(1);
}
