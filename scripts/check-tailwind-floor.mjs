// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Tailwind's minimum version, enforced — because package.json cannot hold a
// comment and a caret range is a floor nobody can see the reasoning for.
//
// TWO facts this guards, both verified rather than assumed:
//
//  1. THE FLOOR IS 4.2.2, and it has nothing to do with the stylesheet. The CSS
//     itself (`@import "tailwindcss"` plus a two-token `@theme`) compiles
//     byte-identically from 4.0 upwards — no @utility, no @custom-variant, no
//     color-mix, no oklch. 4.2.2 is the first `@tailwindcss/vite` whose Vite
//     peer range includes ^8, and apps/web is on Vite 8. On 4.2.1 the peer is
//     `^5.2.0 || ^6 || ^7`, so the install warns and the plugin is unsupported.
//
//  2. THE TWO ENTRIES MUST NOT DRIFT. `@tailwindcss/vite` depends on an EXACT
//     `tailwindcss`, so the BUILD always uses the plugin's own copy — but
//     prettier-plugin-tailwindcss resolves `tailwindcss` from the stylesheet's
//     package (.prettierrc.json's tailwindStylesheet), i.e. the sibling
//     devDependency. Let those two versions drift and the class ORDER prettier
//     writes stops matching the engine the CSS is built with: `format:check`
//     starts failing for a reason nothing in the diff explains.
//
// Deliberately not solved with an exact pin or a pnpm override: every other
// dependency in this repo is a caret, and an exact pin would fight dependabot's
// `development` group forever. The caret is the floor; this script is the WHY.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FLOOR = "4.2.2";
const PACKAGE = new URL("../apps/web/package.json", import.meta.url);

const { devDependencies } = JSON.parse(readFileSync(PACKAGE, "utf8"));
const entries = ["tailwindcss", "@tailwindcss/vite"];
const problems = [];

const versions = entries.map((name) => {
  const range = devDependencies?.[name];
  if (typeof range !== "string") {
    problems.push(`${name} is missing from apps/web devDependencies`);
    return null;
  }
  if (!range.startsWith("^")) {
    problems.push(
      `${name} is "${range}" — keep it a caret range like the rest of the repo`,
    );
  }
  return range.replace(/^[^0-9]*/, "");
});

if (versions[0] !== null && versions[0] !== versions[1]) {
  problems.push(
    `tailwindcss (${versions[0]}) and @tailwindcss/vite (${versions[1]}) must ` +
      `declare the SAME version — prettier sorts classes with one and the ` +
      `build compiles with the other`,
  );
}

const parse = (v) => (v ?? "0").split(".").map(Number);
const below = (v) => {
  const [a, b, c] = parse(v);
  const [x, y, z] = parse(FLOOR);
  return a < x || (a === x && (b < y || (b === y && c < z)));
};

for (const [index, version] of versions.entries()) {
  if (version !== null && below(version)) {
    problems.push(
      `${entries[index]} ${version} is below the ${FLOOR} floor (the first ` +
        `@tailwindcss/vite that supports Vite 8)`,
    );
  }
}

if (problems.length > 0) {
  console.error(
    `Tailwind version floor violated in ${fileURLToPath(PACKAGE)}:\n` +
      problems.map((p) => `  - ${p}`).join("\n") +
      `\n\nSee scripts/check-tailwind-floor.mjs for why this floor exists.`,
  );
  process.exit(1);
}
