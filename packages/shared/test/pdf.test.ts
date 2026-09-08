// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { toPdf } from "../src/domain/pdf.js";
import type { BoardExport } from "../src/domain/export.js";

// The document is a byte stream, not UTF-8 text: TextDecoder would fold the
// 0xE2 0xE3 0xCF 0xD3 binary marker (and every CP1252 umlaut) into U+FFFD and
// shift every offset the assertions below depend on.
function latin1(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function board(overrides: Partial<BoardExport> = {}): BoardExport {
  return {
    boardName: "Sprint 42",
    createdAt: Date.UTC(2026, 6, 18),
    columns: [
      {
        name: "Went well",
        notes: [
          {
            text: "Great teamwork",
            gifUrl: "https://cdn.example/g.gif",
            authorName: "Ben",
            votes: 4,
            crownedRank: 1,
            groupId: null,
            voterNames: ["Ada", "Ben"],
          },
          {
            text: "Line one\nline two",
            gifUrl: null,
            authorName: null,
            votes: 0,
            crownedRank: null,
            groupId: null,
            voterNames: null,
          },
        ],
      },
      { name: "To improve", notes: [] },
    ],
    actions: [
      { text: "Automate deploys", ownerName: "Ben", done: false },
      { text: "Write more tests", ownerName: null, done: true },
    ],
    kudos: [
      {
        cardType: "thank-you",
        toName: "Ada",
        fromName: "Ben",
        text: "saved us",
      },
      { cardType: "great-job", toName: "Cleo", fromName: null, text: "  " },
    ],
    ...overrides,
  };
}

// Every content stream declares its byte length up front; a reader trusts that
// number and starts parsing the next object at stream start + N. If a renderer
// ever measures a JS string that is not byte-for-byte latin1, this is the
// assertion that catches it — the file still "looks" fine as text.
function expectStreamLengthsHonest(text: string): void {
  const pattern = /\/Length (\d+) >>\nstream\n/g;
  let found = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    const declared = Number(match[1]);
    const start = match.index + match[0].length;
    expect(text.slice(start + declared, start + declared + 10)).toBe(
      "\nendstream",
    );
    found += 1;
    match = pattern.exec(text);
  }
  expect(found).toBeGreaterThan(0);
}

describe("toPdf", () => {
  it("emits a structurally complete PDF file", () => {
    const text = latin1(toPdf(board(), "all"));
    expect(text.startsWith("%PDF-1.")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Encoding /WinAnsiEncoding");
    expectStreamLengthsHonest(text);
  });

  it("is deterministic — no clock, no /ID, no /CreationDate", () => {
    const a = toPdf(board(), "all");
    const b = toPdf(board(), "all");
    expect(a).toEqual(b);
    const text = latin1(a);
    expect(text).not.toContain("/CreationDate");
    expect(text).not.toContain("/ID");
  });

  it("round-trips German umlauts as CP1252 bytes", () => {
    const text = latin1(
      toPdf(board({ boardName: "Rückblick über Größen" }), "all"),
    );
    // ü = 0xFC, ö = 0xF6, ß = 0xDF — one byte each, no "?" substitution.
    expect(text).toContain("Rückblick über Größen");
    expect(text).toContain("ü");
    expect(text).toContain("ö");
    expect(text).toContain("ß");
  });

  it("survives an emoji without corrupting the byte offsets", () => {
    const data = board();
    const column = data.columns[0];
    expect(column).toBeDefined();
    column?.notes.push({
      text: "🎉 shipped",
      gifUrl: null,
      authorName: null,
      votes: null,
      crownedRank: null,
      groupId: null,
      voterNames: null,
    });
    const bytes = toPdf(data, "all");
    const text = latin1(bytes);
    expect(text.startsWith("%PDF-1.")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expectStreamLengthsHonest(text);
    // Documented degradation: the glyph is not in CP1252, so it becomes "?".
    expect(text).toContain("? shipped");
    // Every byte is a byte — nothing above 0xFF reached the encoder.
    expect(bytes.length).toBe(text.length);
  });

  it("says so when a summary has nothing crowned", () => {
    const text = latin1(
      toPdf(board({ columns: [], actions: [], kudos: [] }), "summary"),
    );
    expect(text).toContain("No top cards yet.");
    expect(text).toContain("Summary \\(top cards & action items\\)");
    // The action heading is printed even when empty, exactly like toMarkdown.
    expect(text).toContain("Action items");
    expect(text).toContain("\\(no action items\\)");
  });

  it("mirrors toMarkdown's rows, minus what CP1252 cannot print", () => {
    const text = latin1(toPdf(board(), "all"));
    expect(text).toContain("#1 Great teamwork");
    expect(text).toContain("4 votes, voted by Ada, Ben, Ben");
    expect(text).toContain("Line one line two");
    expect(text).toContain("no notes");
    expect(text).toContain("[x] Write more tests");
    expect(text).toContain("Automate deploys - Ben");
    expect(text).toContain("Thank you -> Ada: saved us - Ben");
    // A blank kudo text contributes no colon clause.
    expect(text).toContain("Great job -> Cleo");
    // The GIF url is deliberately dropped: a PDF cannot fetch it.
    expect(text).not.toContain("cdn.example");
  });

  it("writes xref offsets that actually point at their objects", () => {
    const text = latin1(toPdf(board(), "all"));
    const startxref = /startxref\n(\d+)\n%%EOF/.exec(text);
    expect(startxref).not.toBeNull();
    const tableAt = Number(startxref?.[1] ?? -1);
    const table = text.slice(tableAt);
    const header = /^xref\n0 (\d+)\n/.exec(table);
    expect(header).not.toBeNull();
    const size = Number(header?.[1] ?? 0);
    expect(size).toBeGreaterThan(4);
    const entriesAt = header?.[0].length ?? 0;
    // Entry 0 is the free-list head; 1..size-1 must each land on "<n> 0 obj".
    expect(table.slice(entriesAt, entriesAt + 20)).toBe(
      "0000000000 65535 f \n",
    );
    for (let object = 1; object < size; object++) {
      const entry = table.slice(
        entriesAt + object * 20,
        entriesAt + object * 20 + 20,
      );
      expect(entry).toMatch(/^\d{10} 00000 n \n$/);
      expect(text.slice(Number(entry.slice(0, 10)))).toMatch(
        new RegExp(`^${object} 0 obj\\n`),
      );
    }
    expect(text).toContain(`/Size ${size} /Root 1 0 R`);
  });

  it("stops cleanly at the page cap instead of running unbounded", () => {
    const notes = Array.from({ length: 14000 }, (_unused, i) => ({
      text: `Note number ${i}`,
      gifUrl: null,
      authorName: null,
      votes: null,
      crownedRank: null,
      groupId: null,
      voterNames: null,
    }));
    const text = latin1(
      toPdf(
        board({ columns: [{ name: "Went well", notes }], kudos: [] }),
        "all",
      ),
    );
    const count = /\/Count (\d+)/.exec(text);
    expect(Number(count?.[1] ?? 0)).toBeLessThanOrEqual(200);
    expect(text).toContain("Content truncated");
    expectStreamLengthsHonest(text);
  });
});
