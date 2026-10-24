// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// The ratchet is only as good as its patterns: these cases pin what must count
// and, just as important, what must not.

import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "./check-tw-defaults.mjs";

const rules = (text) => scan(text).map((hit) => `${hit.rule}:${hit.match}`);

test("counts Tailwind's default vocabulary, with and without variants", () => {
  assert.deepEqual(
    rules(
      'className="bg-zinc-100 hover:text-white border-amber-400/50 rounded-lg text-sm shadow-md md:flex px-2.5 uppercase"',
    ),
    [
      "palette:bg-zinc-100",
      "palette:hover:text-white",
      "palette:border-amber-400/50",
      "radius:rounded-lg",
      "type-scale:text-sm",
      "shadow:shadow-md",
      "breakpoint:md:",
      "half-step:px-2.5",
      "uppercase:uppercase",
    ],
  );
});

test("counts the app's accent in every utility, with opacity and the strong step", () => {
  assert.deepEqual(
    rules(
      "outline-accent bg-accent/10 text-accent-strong focus-visible:ring-accent",
    ),
    [
      "accent:outline-accent",
      "accent:bg-accent/10",
      "accent:text-accent-strong",
      "accent:focus-visible:ring-accent",
    ],
  );
});

test("counts dark:, motion variants, font-mono, dashed borders and hex colours", () => {
  assert.deepEqual(
    rules(
      'dark:bg-black motion-reduce:transition-none font-mono border-dashed color: "#18181b";',
    ),
    [
      "palette:dark:bg-black",
      "dark-variant:dark:",
      "motion-variant:motion-reduce:",
      "font-mono:font-mono",
      "dashed:border-dashed",
      "hex:#18181b",
    ],
  );
});

test("leaves look-alikes alone", () => {
  assert.deepEqual(
    rules(
      'rounded-full rounded-none rounded-control whitespace-nowrap required text-text-subtle bg-surface sm:grid lg:block href="#admin" gap-2 py-10.5x',
    ),
    [],
  );
});

test("reports the line of each hit", () => {
  assert.deepEqual(
    scan("one\ntwo bg-red-500\n").map((hit) => hit.line),
    [2],
  );
});
