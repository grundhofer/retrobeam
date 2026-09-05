// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { translationResources } from "./i18n.js";

// German and English are a product promise, not a nice-to-have: a key present
// in one bundle and missing from the other renders the raw dotted key to the
// user, and tsc cannot see it because both bundles are plain object literals.
type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const en = flatten(translationResources.en.translation as unknown as Tree);
const de = flatten(translationResources.de.translation as unknown as Tree);

const placeholders = (value: string): string =>
  [...value.matchAll(/\{\{\s*(\w+)/g)]
    .map((m) => m[1])
    .sort()
    .join(",");

describe("i18n bundles", () => {
  it("has a non-trivial number of keys", () => {
    expect(en.size).toBeGreaterThan(100);
  });

  it("German covers every English key", () => {
    expect([...en.keys()].filter((key) => !de.has(key))).toEqual([]);
  });

  it("English covers every German key", () => {
    expect([...de.keys()].filter((key) => !en.has(key))).toEqual([]);
  });

  it("uses the same interpolation placeholders in both languages", () => {
    const mismatched = [...en.entries()]
      .filter(([key, value]) => {
        const other = de.get(key);
        return (
          other !== undefined && placeholders(value) !== placeholders(other)
        );
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("has no empty translations", () => {
    const blank = [...en.entries(), ...de.entries()]
      .filter(([, value]) => value.trim() === "")
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });
});
