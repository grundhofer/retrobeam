// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  nameGraphemes,
  nameInitials,
  nameMonogram,
} from "../src/domain/names.js";

// The bug this file exists for: a participant called "Christian 🤖" rendered as
// "C?" in the header avatar row, because `"Christian 🤖".split(/\s+/)[1][0]` is
// "\ud83e" — half a surrogate pair, which the browser draws as the replacement
// glyph. Every assertion below is that class of mistake.
describe("nameInitials", () => {
  it("ignores an emoji decoration and uses the letters", () => {
    expect(nameInitials("Christian 🤖")).toBe("C");
    expect(nameInitials("Anna 🎉 Meier")).toBe("AM");
  });

  it("still gives a name that is ONLY an emoji something to show", () => {
    // Never "?" — the whole point. The cluster comes back whole.
    expect(nameInitials("🤖")).toBe("🤖");
    expect(nameInitials("👨‍💻")).toBe("👨‍💻");
  });

  it("takes the first and last word of a multi-word name", () => {
    expect(nameInitials("Anna Meier")).toBe("AM");
    expect(nameInitials("anna von meier")).toBe("AM");
    expect(nameInitials("  Anna   Meier  ")).toBe("AM");
  });

  it("handles non-Latin scripts without splitting a character", () => {
    expect(nameInitials("李明")).toBe("李");
    expect(nameInitials("Мария Иванова")).toBe("МИ");
  });

  it("returns an empty string for a blank name rather than a question mark", () => {
    // A blank name cannot reach the client — displayNameSchema is
    // trim().min(1) — so there is nothing to stand in for. The old "?" was a
    // placeholder for a case that does not exist; do not restore it.
    expect(nameInitials("")).toBe("");
    expect(nameInitials("   ")).toBe("");
  });
});

describe("nameMonogram", () => {
  it("is a single character, letters preferred", () => {
    expect(nameMonogram("Christian 🤖")).toBe("C");
    expect(nameMonogram("Anna Meier")).toBe("A");
    expect(nameMonogram("🤖")).toBe("🤖");
  });
});

describe("nameGraphemes", () => {
  it("counts what a reader sees, not UTF-16 code units", () => {
    // This is the unit the wheel measures names in. "Christian 🤖".length is
    // 12 for 11 characters, which is how a label gets sized wrong.
    expect("Christian 🤖".length).toBe(12);
    expect(nameGraphemes("Christian 🤖")).toHaveLength(11);
  });

  it("keeps a ZWJ sequence and a flag together", () => {
    expect(nameGraphemes("👨‍💻")).toHaveLength(1);
    expect(nameGraphemes("🇩🇪")).toHaveLength(1);
  });
});
