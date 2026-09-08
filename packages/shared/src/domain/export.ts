// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { KudoCardType } from "../protocol.js";

// Structured board snapshot for export. Author names are only ever included
// when the exporter opts in — the depersonalized form is the default (the
// keepable artifact should carry the ideas, not who said what).
export interface ExportNote {
  text: string;
  gifUrl: string | null;
  authorName: string | null;
  votes: number | null;
  crownedRank: number | null;
  /** The stack this card belongs to, identified by its anchor. Only the anchor
   *  carries the tally and the crown, so without this a reader cannot tell a
   *  three-card stack from three unrelated notes — and the summary could not
   *  keep a crowned stack's merged duplicates. Null for a loose card, and also
   *  null when the anchor itself is not in this export (the id would name a
   *  note the file does not contain). */
  groupId: string | null;
}

export interface ExportColumn {
  name: string;
  notes: ExportNote[];
}

export interface ExportAction {
  text: string;
  ownerName: string | null;
  done: boolean;
}

export interface ExportKudo {
  cardType: KudoCardType;
  toName: string;
  fromName: string | null;
  text: string;
}

export interface BoardExport {
  boardName: string;
  createdAt: number;
  columns: ExportColumn[];
  actions: ExportAction[];
  kudos: ExportKudo[];
}

export const EXPORT_SCOPES = ["all", "summary"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

// The condensed keepsake: the cards the board itself crowned (👑 — the vote
// round's top-N) plus the action items. A pure projection of the SAME snapshot
// the full export renders, so every server-side gate that shaped it — no note
// bodies before the reveal, tallies blind until discuss, staged columns
// dropped, author names opt-in — is INHERITED rather than re-implemented. The
// projection can only remove rows, never add one, so the summary can never
// surface something the full export hides. `crownedRank` is the same value the
// board draws its crown from, so "top cards" cannot drift from what the team
// saw on screen.
//
// Kudos are deliberately left out: the ask was "top cards + action items", and
// a kudo names its recipient unconditionally — it is the one name `?authors=`
// cannot suppress. Without it the default summary carries no personal names at
// all, which is what makes it safe to paste into a team channel.
export function summarizeExport(data: BoardExport): BoardExport {
  const columns = data.columns
    .map((column) => {
      // A crowned STACK is one top theme with several cards under it: the crown
      // and the tally sit on the anchor, but the merged duplicates are text the
      // team wrote and the board shows them together. Dropping them would make
      // the summary say less than the board did.
      const crownedStacks = new Set(
        column.notes
          .filter((note) => note.crownedRank !== null && note.groupId !== null)
          .map((note) => note.groupId as string),
      );
      return {
        name: column.name,
        notes: column.notes
          // filter copies first, so the sort never touches the caller's array —
          // the same snapshot is rendered again when a second format is fetched.
          .filter(
            (note) =>
              note.crownedRank !== null ||
              (note.groupId !== null && crownedStacks.has(note.groupId)),
          )
          // Rank order, not the full export's stack adjacency; a stack's
          // members follow their anchor, which carries the rank they sort by.
          .sort(
            (a, b) =>
              (a.crownedRank ?? Number.MAX_SAFE_INTEGER) -
                (b.crownedRank ?? Number.MAX_SAFE_INTEGER) ||
              (a.crownedRank === null ? 1 : -1),
          ),
      };
    })
    // A column with nothing crowned is dropped whole — rendering it as
    // "_(no notes)_" would claim it was empty, which it was not.
    .filter((column) => column.notes.length > 0);
  return {
    boardName: data.boardName,
    createdAt: data.createdAt,
    columns,
    actions: data.actions,
    kudos: [],
  };
}

export const KUDO_CARD_LABELS: Record<KudoCardType, string> = {
  "thank-you": "Thank you",
  "great-job": "Great job",
  "well-done": "Well done",
  congratulations: "Congratulations",
  "totally-awesome": "Totally awesome",
};

function isoDate(epochMs: number): string {
  // Deterministic, timezone-free date string (avoids Date-in-render concerns).
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function toMarkdown(
  data: BoardExport,
  scope: ExportScope = "all",
): string {
  const lines: string[] = [];
  lines.push(
    `# ${data.boardName}`,
    "",
    scope === "summary"
      ? `_Retrospective · ${isoDate(data.createdAt)} · Summary (top cards & action items)_`
      : `_Retrospective · ${isoDate(data.createdAt)}_`,
    "",
  );

  // A summary with nothing crowned is a real state — nobody voted, or the vote
  // has not been revealed yet — and must not read as a broken file.
  if (scope === "summary" && data.columns.length === 0) {
    lines.push("_No top cards yet._", "");
  }

  for (const column of data.columns) {
    lines.push(`## ${column.name}`, "");
    if (column.notes.length === 0) {
      lines.push("_(no notes)_", "");
      continue;
    }
    for (const note of column.notes) {
      const parts: string[] = [];
      if (note.crownedRank !== null) parts.push(`👑${note.crownedRank}`);
      parts.push(note.text.replace(/\n/g, " "));
      const meta: string[] = [];
      if (note.votes !== null && note.votes > 0)
        meta.push(`${note.votes} votes`);
      if (note.authorName !== null) meta.push(note.authorName);
      const suffix = meta.length > 0 ? ` _(${meta.join(", ")})_` : "";
      lines.push(`- ${parts.join(" ")}${suffix}`);
      if (note.gifUrl !== null) lines.push(`  ![gif](${note.gifUrl})`);
    }
    lines.push("");
  }

  // In summary scope the action items are half the promised document, so their
  // absence is a fact worth recording rather than a silently missing heading.
  if (data.actions.length > 0 || scope === "summary") {
    lines.push("## Action items", "");
    if (data.actions.length === 0) lines.push("_(no action items)_");
    for (const action of data.actions) {
      const owner =
        action.ownerName !== null ? ` — **${action.ownerName}**` : "";
      lines.push(`- [${action.done ? "x" : " "}] ${action.text}${owner}`);
    }
    lines.push("");
  }

  if (data.kudos.length > 0) {
    lines.push("## Appreciation", "");
    for (const kudo of data.kudos) {
      const from = kudo.fromName !== null ? ` — ${kudo.fromName}` : "";
      const text =
        kudo.text.trim() === "" ? "" : `: ${kudo.text.replace(/\n/g, " ")}`;
      lines.push(
        `- **${KUDO_CARD_LABELS[kudo.cardType]}** → ${kudo.toName}${text}${from}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// A retro export is opened in Excel/Sheets, and every cell is text a
// participant typed. Two hazards follow:
//  1. Formula injection — a note reading `=HYPERLINK("http://evil","hi")` is
//     evaluated on open. Prefixing with an apostrophe forces text.
//  2. A bare CR inside a note would split the row, since rows join on CRLF.
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/["\n\r,]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

export function toCsv(data: BoardExport): string {
  const rows: string[][] = [
    ["section", "column", "text", "votes", "rank", "author", "gif"],
  ];
  for (const column of data.columns) {
    for (const note of column.notes) {
      rows.push([
        "note",
        column.name,
        note.text,
        note.votes === null ? "" : String(note.votes),
        note.crownedRank === null ? "" : String(note.crownedRank),
        note.authorName ?? "",
        note.gifUrl ?? "",
      ]);
    }
  }
  for (const action of data.actions) {
    rows.push([
      "action",
      action.done ? "done" : "open",
      action.text,
      "",
      "",
      action.ownerName ?? "",
      "",
    ]);
  }
  for (const kudo of data.kudos) {
    rows.push([
      "kudo",
      KUDO_CARD_LABELS[kudo.cardType],
      kudo.text,
      "",
      "",
      kudo.fromName ?? "",
      "",
    ]);
    // recipient goes in the column slot's neighbour — keep it simple: encode in text-adjacent
    rows[rows.length - 1]![1] =
      `${KUDO_CARD_LABELS[kudo.cardType]} → ${kudo.toName}`;
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function toJson(data: BoardExport): string {
  return JSON.stringify(data, null, 2);
}

export const EXPORT_FORMATS = ["md", "csv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function renderExport(
  format: ExportFormat,
  data: BoardExport,
  scope: ExportScope = "all",
): string {
  // Applied ONCE, here, so all three formats render the same rows — a
  // per-format filter is how a CSV and a Markdown of the same board drift.
  const scoped = scope === "summary" ? summarizeExport(data) : data;
  switch (format) {
    case "md":
      return toMarkdown(scoped, scope);
    case "csv":
      return toCsv(scoped);
    case "json":
      return toJson(scoped);
  }
}

export function exportContentType(format: ExportFormat): string {
  switch (format) {
    case "md":
      return "text/markdown; charset=utf-8";
    case "csv":
      return "text/csv; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
  }
}
