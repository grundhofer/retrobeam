// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  exportContentType,
  renderExport,
  summarizeExport,
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
          groupId: null,
        },
        {
          text: "Line one\nline two",
          gifUrl: "https://cdn.example/g.gif",
          authorName: null,
          votes: 0,
          crownedRank: null,
          groupId: null,
        },
        // Crowned, and deliberately AFTER rank 1 in the array so the summary's
        // rank sort is actually exercised rather than accidentally satisfied.
        {
          text: "Demo went smoothly",
          gifUrl: null,
          authorName: null,
          votes: 1,
          crownedRank: 3,
          groupId: null,
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
              groupId: null,
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
              groupId: null,
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

describe("summarizeExport", () => {
  const out = summarizeExport(sample);

  it("keeps a crowned stack's merged duplicates", () => {
    // The crown and the tally sit on the anchor, but the board shows the whole
    // stack — a summary that kept only the anchor would say less than the board.
    const anchor = "a".repeat(32);
    const stacked = summarizeExport({
      ...sample,
      columns: [
        {
          name: "Went well",
          notes: [
            {
              text: "anchor idea",
              gifUrl: null,
              authorName: null,
              votes: 3,
              crownedRank: 1,
              groupId: anchor,
            },
            {
              text: "duplicate idea",
              gifUrl: null,
              authorName: null,
              votes: null,
              crownedRank: null,
              groupId: anchor,
            },
            {
              text: "unrelated and uncrowned",
              gifUrl: null,
              authorName: null,
              votes: null,
              crownedRank: null,
              groupId: null,
            },
          ],
        },
      ],
    });
    expect(stacked.columns[0]?.notes.map((n) => n.text)).toEqual([
      "anchor idea",
      "duplicate idea",
    ]);
  });

  it("keeps only crowned cards, in crown order", () => {
    expect(out.columns.map((c) => c.name)).toEqual(["Went well"]);
    expect(out.columns[0]?.notes.map((n) => n.text)).toEqual([
      "Great teamwork",
      "Demo went smoothly",
    ]);
  });

  it("drops columns with nothing crowned, and the appreciation wall", () => {
    expect(out.columns.map((c) => c.name)).not.toContain("To improve");
    expect(out.kudos).toEqual([]);
    expect(out.actions).toEqual(sample.actions);
  });

  it("does not mutate the snapshot it projects", () => {
    // The same snapshot is rendered again when a second format is fetched; a
    // mutating sort would silently shrink the second file.
    expect(sample.columns[0]?.notes).toHaveLength(3);
    expect(sample.columns[0]?.notes[0]?.text).toBe("Great teamwork");
  });
});

describe("summary scope", () => {
  const md = renderExport("md", sample, "summary");

  it("says on its face that it is a summary", () => {
    expect(md).toContain("Summary (top cards & action items)");
  });

  it("carries the crowned cards in rank order and nothing else", () => {
    expect(md).toContain("👑1 Great teamwork _(4 votes)_");
    expect(md.indexOf("👑1")).toBeLessThan(md.indexOf("👑3"));
    expect(md).not.toContain("Line one line two");
    expect(md).not.toContain("## To improve");
    expect(md).not.toContain("## Appreciation");
  });

  it("still carries the action items", () => {
    expect(md).toContain("## Action items");
    expect(md).toContain("Automate deploys");
  });

  it("reads as intentional when nothing was crowned", () => {
    const empty = renderExport(
      "md",
      { ...sample, columns: [], actions: [] },
      "summary",
    );
    expect(empty).toContain("_No top cards yet._");
    expect(empty).toContain("## Action items");
    expect(empty).toContain("_(no action items)_");
    expect(renderExport("md", sample, "summary")).not.toContain(
      "_(no action items)_",
    );
  });

  it("reuses the CSV row shape unchanged, minus the kudo rows", () => {
    const csv = renderExport("csv", sample, "summary");
    expect(csv.split("\r\n")[0]).toBe(
      "section,column,text,votes,rank,author,gif",
    );
    expect(csv).not.toContain("kudo,");
    // header + 2 crowned notes + 2 actions + trailing terminator
    expect(csv.split("\r\n")).toHaveLength(6);
  });

  it("keeps the JSON keys stable across scopes", () => {
    const json = JSON.parse(renderExport("json", sample, "summary")) as {
      kudos: unknown[];
      columns: { notes: unknown[] }[];
    };
    expect(json.kudos).toEqual([]);
    expect(json.columns).toHaveLength(1);
    expect(json.columns[0]?.notes).toHaveLength(2);
  });

  it("leaves the full export unchanged", () => {
    // The scope argument defaults, so every caller that predates it keeps its
    // behaviour…
    expect(renderExport("md", sample, "all")).toBe(renderExport("md", sample));
    expect(renderExport("csv", sample, "all")).toBe(toCsv(sample));
    expect(renderExport("json", sample, "all")).toBe(toJson(sample));
    // …and the full document still carries the plain subtitle and everything
    // the summary drops. Comparing the two scopes to each other would only
    // prove they differ, not that the full one is still the old one.
    const full = renderExport("md", sample, "all");
    expect(full).toContain("_Retrospective · 2026-07-18_");
    expect(full).not.toContain("Summary");
    expect(full).toContain("Line one line two"); // uncrowned
    expect(full).toContain("## To improve"); // crownless column
    expect(full).toContain("## Appreciation"); // kudos
  });
});
