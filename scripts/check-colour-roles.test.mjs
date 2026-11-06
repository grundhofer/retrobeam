// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import { test } from "node:test";
import { scanText } from "./check-colour-roles.mjs";

test("a status or accent fill and a -subtle tint count, with variants", () => {
  const hits = scanText(
    [
      'className="bg-accent text-on-accent"',
      'className="hover:bg-danger"',
      'className="border-accent-subtle"',
      'className="bg-success-subtle"',
    ].join("\n"),
  ).map((hit) => hit.token);
  assert.deepEqual(hits, [
    "bg-accent",
    "bg-danger",
    "border-accent-subtle",
    "bg-success-subtle",
  ]);
});

test("sebaro's quiet text role, the accent as ink and plain words do not", () => {
  const hits = scanText(
    [
      'className="text-text-subtle"',
      'className="text-(--sb-color-accent) outline-(--sb-color-accent)"',
      "// a link in the text",
    ].join("\n"),
  );
  assert.deepEqual(hits, []);
});
