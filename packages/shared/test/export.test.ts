// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  exportContentType,
  renderExport,
  toCsv,
  toJson,
  toMarkdown,
  type BoardExport,
} from "../src/domain/export.js";

const sample: BoardExport = {
  boardName: "Sprint 42",
  createdAt: Date.UTC(2026, 6, 18),
  columns: [
    {
      name: "Went well",
      notes: [
        {
          text: "Great teamwork",
          gifUrl: null,
          authorName: null,
          votes: 4,
          crownedRank: 1,
        },
        {
          text: "Line one\nline two",
          gifUrl: "https://cdn.example/g.gif",
          authorName: null,
          votes: 0,
          crownedRank: null,
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
      cardType: "great-job",
      toName: "Anna",
      fromName: null,
      text: "shipped the picker",
    },
  ],
};

describe("toMarkdown", () => {
  const md = toMarkdown(sample);

  it("has the board title and the ISO date", () => {
    expect(md).toContain("# Sprint 42");
    expect(md).toContain("2026-07-18");
  });

  it("crowns and vote counts appear; newlines are flattened", () => {
    expect(md).toContain("👑1 Great teamwork _(4 votes)_");
    expect(md).toContain("Line one line two");
    expect(md).toContain("![gif](https://cdn.example/g.gif)");
  });

  it("empty columns are marked, actions are checkboxes, kudos render", () => {
    expect(md).toContain("_(no notes)_");
    expect(md).toContain("- [ ] Automate deploys — **Ben**");
    expect(md).toContain("- [x] Write more tests");
    expect(md).toContain("**Great job** → Anna: shipped the picker");
  });

  it("never leaks author names when they were excluded (null)", () => {
    expect(md).not.toContain("Anna's");
  });
});

describe("toCsv", () => {
  const csv = toCsv(sample);
  it("has a header and quotes cells with commas/newlines", () => {
    expect(csv.split("\r\n")[0]).toBe(
      "section,column,text,votes,rank,author,gif",
    );
    expect(csv).toContain('"Line one\nline two"');
  });
  it("includes actions and kudos rows", () => {
    expect(csv).toContain("action,");
    expect(csv).toContain("kudo,");
  });

  it("neutralizes spreadsheet formulas typed into a note", () => {
    const note = (text: string) => ({
      ...sample,
      columns: [
        {
          name: "Went well",
          notes: [
            {
              text,
              gifUrl: null,
              authorName: null,
              votes: null,
              crownedRank: null,
            },
          ],
        },
      ],
      actions: [],
      kudos: [],
    });
    for (const payload of [
      '=HYPERLINK("http://evil.example","click")',
      "+1+1",
      "-2+3",
      "@SUM(A1:A9)",
    ]) {
      const row = toCsv(note(payload)).split("\r\n")[1] ?? "";
      expect(row).not.toContain(`,${payload}`);
      expect(row).toContain(`'${payload.slice(0, 1)}`);
    }
  });

  it("quotes a bare carriage return so it cannot split the row", () => {
    const csv = toCsv({
      ...sample,
      columns: [
        {
          name: "Went well",
          notes: [
            {
              text: "before\rafter",
              gifUrl: null,
              authorName: null,
              votes: null,
              crownedRank: null,
            },
          ],
        },
      ],
      actions: [],
      kudos: [],
    });
    expect(csv).toContain('"before\rafter"');
    // header + one note row + trailing terminator
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});

describe("toJson", () => {
  it("round-trips the structure", () => {
    expect(JSON.parse(toJson(sample))).toEqual(sample);
  });
});

describe("renderExport / content types", () => {
  it("dispatches by format", () => {
    expect(renderExport("md", sample)).toBe(toMarkdown(sample));
    expect(renderExport("csv", sample)).toBe(toCsv(sample));
    expect(renderExport("json", sample)).toBe(toJson(sample));
  });
  it("maps to sensible content types", () => {
    expect(exportContentType("md")).toContain("text/markdown");
    expect(exportContentType("csv")).toContain("text/csv");
    expect(exportContentType("json")).toContain("application/json");
  });
});
