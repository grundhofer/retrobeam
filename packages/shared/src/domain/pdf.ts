// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  KUDO_CARD_LABELS,
  type BoardExport,
  type ExportScope,
} from "./export.js";

// A hand-rolled PDF 1.4 writer.
//
// The export runs inside a Cloudflare Worker: no Node APIs, no canvas, no
// font files on disk, no room in the bundle for a PDF library. So the
// document is emitted byte by byte against the 14 standard Type1 fonts —
// Helvetica and Helvetica-Bold are built into every reader, which means no
// font has to be embedded and the output stays a few kilobytes.
//
// This file renders the SAME `BoardExport` snapshot `toMarkdown` does, and
// deliberately mirrors its rows one for one: both formats are downloaded from
// the same URL with a different extension, and a reader who diffs them must
// not find a card in one and not the other. Scoping is NOT re-applied here —
// `renderExport` already narrowed the snapshot with `summarizeExport`, and a
// second per-format filter is exactly how two formats of one board drift.
// `scope` is used only for the things toMarkdown uses it for: the subtitle,
// the empty-summary line, and the always-printed action heading.

// ---------------------------------------------------------------------------
// Text encoding
// ---------------------------------------------------------------------------

// The fonts are declared /WinAnsiEncoding, i.e. CP1252: one byte per glyph.
// 0x20-0x7E and 0xA0-0xFF are their own code points, which is what carries
// the German alphabet — ä ö ü Ä Ö Ü ß and every other Latin-1 accent survive
// untouched. This app's primary language is German, so that range is not a
// nicety, it is the requirement.
//
// 0x80-0x9F is where CP1252 diverges from Latin-1: it fills the C1 control
// block with typography. These have to be listed by hand, because a user who
// pastes a smart quote or an en dash out of a chat client would otherwise get
// a "?" in a place where the glyph exists.
const CP1252_SPECIALS: Record<string, number> = {
  "€": 0x80, // €
  "‚": 0x82, // ‚
  ƒ: 0x83, // ƒ
  "„": 0x84, // „
  "…": 0x85, // …
  "†": 0x86, // †
  "‡": 0x87, // ‡
  ˆ: 0x88, // ˆ
  "‰": 0x89, // ‰
  Š: 0x8a, // Š
  "‹": 0x8b, // ‹
  Œ: 0x8c, // Œ
  Ž: 0x8e, // Ž
  "‘": 0x91, // '
  "’": 0x92, // '
  "“": 0x93, // "
  "”": 0x94, // "
  "•": 0x95, // •
  "–": 0x96, // –
  "—": 0x97, // —
  "˜": 0x98, // ˜
  "™": 0x99, // ™
  š: 0x9a, // š
  "›": 0x9b, // ›
  œ: 0x9c, // œ
  ž: 0x9e, // ž
  Ÿ: 0x9f, // Ÿ
};

// Everything CP1252 cannot name — emoji, →, ✓, Cyrillic, CJK — becomes "?".
// That is a REAL and documented divergence from the other renderers: the JPEG
// rasterises the whole Unicode plane and toMarkdown passes UTF-8 through
// verbatim, so a note reading "🎉 shipped" is "🎉 shipped" there and
// "? shipped" here. Embedding a Unicode font to fix it would mean shipping a
// subsetted TrueType and a CID font program in a Worker, for one glyph class.
//
// The consequence is that the renderer's OWN decorations must never lean on a
// character it cannot print: this file writes "#1" where toMarkdown writes
// "👑1", and "->" where toMarkdown writes "→", so the structural furniture of
// the document is never the thing that degrades to a question mark.
//
// Iteration is by code point, not by UTF-16 unit: an astral emoji is one
// unrepresentable character, and charCodeAt would turn it into two "?".
function toCp1252(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += ch;
      continue;
    }
    const special = CP1252_SPECIALS[ch];
    out += special === undefined ? "?" : String.fromCharCode(special);
  }
  return out;
}

// Literal strings are delimited by parentheses, so an unbalanced paren or a
// backslash in a note would end the string early and desynchronise the whole
// content stream. Control characters cannot appear: toCp1252 has already
// turned them into "?".
function pdfString(latin1: string): string {
  return `(${latin1.replace(/[\\()]/g, (ch) => `\\${ch}`)})`;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

// Helvetica advance widths in 1/1000 em from the standard AFM, indexed by
// (character code - 32), so the table covers codes 32-126 in order — space,
// !, ", # … } and ~. Word wrapping needs real metrics: a monospace guess
// makes "IIIII" wrap three words early and "MMMMM" run off the page.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

// The accented upper half averages close to this, and it is also the width of
// the "?" every unrepresentable character collapses to.
const DEFAULT_WIDTH = 556;

// Helvetica-Bold is the same design a touch wider (i 222→278, r 333→389,
// M 833→889). Carrying a second 95-entry table to serve the handful of bold
// headings is not worth the bytes; a flat over-estimate makes a long heading
// wrap one word early, which is invisible, rather than one word late, which
// crosses the margin.
const BOLD_WIDTH_FACTOR = 1.08;

function measure(latin1: string, size: number, bold: boolean): number {
  let units = 0;
  for (let i = 0; i < latin1.length; i++) {
    // Out-of-table codes (the 0xA0-0xFF accents) land on undefined here, which
    // is precisely what the default is for.
    units += HELVETICA_WIDTHS[latin1.charCodeAt(i) - 32] ?? DEFAULT_WIDTH;
  }
  return ((units * size) / 1000) * (bold ? BOLD_WIDTH_FACTOR : 1);
}

// A single token longer than the column (a pasted URL, a stack trace frame)
// has no break opportunity, so it is cut at the character that overflows.
// Without this it would simply run off the right edge and be lost.
function splitLongToken(
  token: string,
  size: number,
  bold: boolean,
  width: number,
): string[] {
  const parts: string[] = [];
  let chunk = "";
  for (const ch of token) {
    if (chunk !== "" && measure(chunk + ch, size, bold) > width) {
      parts.push(chunk);
      chunk = ch;
    } else {
      chunk += ch;
    }
  }
  if (chunk !== "") parts.push(chunk);
  return parts;
}

function wrap(
  latin1: string,
  size: number,
  bold: boolean,
  width: number,
): string[] {
  const words: string[] = [];
  for (const token of latin1.split(/\s+/)) {
    if (token === "") continue;
    if (measure(token, size, bold) > width) {
      words.push(...splitLongToken(token, size, bold, width));
    } else {
      words.push(token);
    }
  }
  // An empty paragraph still occupies its line, so the caller's spacing model
  // holds whether or not a note turned out to be blank.
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (line !== "" && measure(candidate, size, bold) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4 portrait, in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const TOP = PAGE_HEIGHT - MARGIN;
// Text stops here; the band below carries the page number.
const FLOOR = MARGIN;
const FOOTER_BASELINE = 30;
const FOOTER_SIZE = 8;

// A 500-note board must not turn into an unbounded document: Worker CPU on the
// free tier is metered in milliseconds, and both the layout loop and the final
// string concatenation grow with the page count. The cap is a stop, not a
// crash — the last page says so in the reader's own words.
const MAX_PAGES = 200;
const TRUNCATION_NOTE =
  "Content truncated: this export is longer than the page limit.";
const TRUNCATION_SIZE = 9;
const TRUNCATION_ADVANCE = 14;

interface Block {
  text: string;
  size: number;
  leading: number;
  spaceBefore: number;
  bold: boolean;
  /** 0 = black, higher = greyer. Headings stay black; meta lines recede. */
  tone: number;
  indent: number;
  /** Drawn at the start of the first line; continuation lines hang under it. */
  prefix: string;
}

interface PlacedLine {
  text: string; // already CP1252
  x: number;
  y: number;
  size: number;
  bold: boolean;
  tone: number;
}

const BODY_SIZE = 10;
const BODY_LEADING = 13.5;

function block(text: string, overrides: Partial<Block> = {}): Block {
  return {
    text,
    size: BODY_SIZE,
    leading: BODY_LEADING,
    spaceBefore: 0,
    bold: false,
    tone: 0,
    indent: 0,
    prefix: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

// Must stay identical to export.ts's private `isoDate`: the two renderers date
// the same snapshot, and a PDF dated a day off from its Markdown sibling is a
// bug report nobody can reproduce.
function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function buildBlocks(data: BoardExport, scope: ExportScope): Block[] {
  const blocks: Block[] = [
    block(data.boardName, { size: 20, leading: 26, bold: true }),
    block(
      scope === "summary"
        ? `Retrospective · ${isoDate(data.createdAt)} · Summary (top cards & action items)`
        : `Retrospective · ${isoDate(data.createdAt)}`,
      // U+00B7 is CP1252 0xB7, so the separator toMarkdown uses survives the
      // encoder unchanged — no "?" in the very first line of the document.
      { size: 9.5, leading: 18, spaceBefore: 3, tone: 0.45 },
    ),
  ];

  // A summary with nothing crowned is a real state — nobody voted, or the vote
  // is still blind — and a blank page must never be how that state looks.
  if (scope === "summary" && data.columns.length === 0) {
    blocks.push(block("No top cards yet.", { spaceBefore: 14, tone: 0.45 }));
  }

  for (const column of data.columns) {
    blocks.push(
      block(column.name, {
        size: 13,
        leading: 17,
        spaceBefore: 18,
        bold: true,
      }),
    );
    if (column.notes.length === 0) {
      blocks.push(
        block("(no notes)", { spaceBefore: 4, tone: 0.45, indent: 12 }),
      );
      continue;
    }
    for (const note of column.notes) {
      const parts: string[] = [];
      // "#1" rather than toMarkdown's "👑1": the crown is not in CP1252, and a
      // rank marker that renders as "?1" would read as a defect.
      if (note.crownedRank !== null) parts.push(`#${note.crownedRank}`);
      parts.push(note.text.replace(/\n/g, " "));
      const meta: string[] = [];
      if (note.votes !== null && note.votes > 0)
        meta.push(`${note.votes} votes`);
      if (note.voterNames !== null && note.voterNames.length > 0)
        meta.push(`voted by ${note.voterNames.join(", ")}`);
      if (note.authorName !== null) meta.push(note.authorName);
      const suffix = meta.length > 0 ? ` (${meta.join(", ")})` : "";
      // note.gifUrl is deliberately dropped. A PDF cannot fetch a remote image
      // at open time, and the bare URL would be a line of tracking-parameter
      // noise wrapped across the page for a picture nobody can see.
      blocks.push(
        block(`${parts.join(" ")}${suffix}`, {
          spaceBefore: 4,
          prefix: "• ", // CP1252 0x95 (bullet) — representable, unlike →
        }),
      );
    }
  }

  // In summary scope the action items are half of what the document promised,
  // so their absence is recorded rather than left as a missing heading.
  if (data.actions.length > 0 || scope === "summary") {
    blocks.push(
      block("Action items", {
        size: 13,
        leading: 17,
        spaceBefore: 18,
        bold: true,
      }),
    );
    if (data.actions.length === 0) {
      blocks.push(
        block("(no action items)", { spaceBefore: 4, tone: 0.45, indent: 12 }),
      );
    }
    for (const action of data.actions) {
      const owner = action.ownerName !== null ? ` - ${action.ownerName}` : "";
      blocks.push(
        block(`[${action.done ? "x" : " "}] ${action.text}${owner}`, {
          spaceBefore: 4,
        }),
      );
    }
  }

  if (data.kudos.length > 0) {
    blocks.push(
      block("Appreciation", {
        size: 13,
        leading: 17,
        spaceBefore: 18,
        bold: true,
      }),
    );
    for (const kudo of data.kudos) {
      const from = kudo.fromName !== null ? ` - ${kudo.fromName}` : "";
      const text =
        kudo.text.trim() === "" ? "" : `: ${kudo.text.replace(/\n/g, " ")}`;
      blocks.push(
        block(
          `${KUDO_CARD_LABELS[kudo.cardType]} -> ${kudo.toName}${text}${from}`,
          { spaceBefore: 4, prefix: "• " },
        ),
      );
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layout(blocks: Block[]): PlacedLine[][] {
  // Always at least one page: a /Pages node with no kids is not a document.
  let page: PlacedLine[] = [];
  const pages: PlacedLine[][] = [page];
  let y = TOP;
  let truncated = false;

  for (const b of blocks) {
    if (truncated) break;
    const prefix = toCp1252(b.prefix);
    const hang = measure(prefix, b.size, b.bold);
    // Hanging indent: the first line spends `hang` on the bullet, the rest
    // start `hang` further in — so both have the same text width.
    const width = CONTENT_WIDTH - b.indent - hang;
    const lines = wrap(toCp1252(b.text), b.size, b.bold, width);

    for (let i = 0; i < lines.length; i++) {
      const onLastPage = pages.length >= MAX_PAGES;
      // On the final page the floor is raised so the truncation note is
      // guaranteed a slot; otherwise the message that explains the missing
      // content would itself be the thing that does not fit.
      const floor = onLastPage ? FLOOR + TRUNCATION_ADVANCE : FLOOR;
      // Space above a block is swallowed at a page break — leading whitespace
      // at the top of a page reads as a rendering fault.
      let top = i === 0 ? y - b.spaceBefore : y;
      if (top - b.leading < floor) {
        if (onLastPage) {
          truncated = true;
          break;
        }
        page = [];
        pages.push(page);
        top = TOP;
      }
      page.push({
        text: i === 0 ? prefix + (lines[i] ?? "") : (lines[i] ?? ""),
        x: MARGIN + b.indent + (i === 0 ? 0 : hang),
        // The baseline sits one em below the slot's top edge; `leading` is the
        // advance to the next slot, so leading > size leaves the line gap.
        y: top - b.size,
        size: b.size,
        bold: b.bold,
        tone: b.tone,
      });
      y = top - b.leading;
    }
  }

  if (truncated) {
    // `y` is never below the raised floor (a line is only placed when its
    // advance clears it), so this always lands above the footer band.
    page.push({
      text: toCp1252(TRUNCATION_NOTE),
      x: MARGIN,
      y: y - TRUNCATION_SIZE,
      size: TRUNCATION_SIZE,
      bold: false,
      tone: 0.45,
    });
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

// Fixed precision keeps the output byte-identical across runs: JS default
// number formatting would print 785.8900000000001 for some arithmetic paths
// and quietly change every downstream offset.
function fmt(value: number): string {
  return value.toFixed(2);
}

function contentStream(
  lines: PlacedLine[],
  pageNumber: number,
  pageCount: number,
): string {
  const ops: string[] = ["BT"];
  let font = "";
  let size = -1;
  let tone = -1;
  for (const line of lines) {
    const name = line.bold ? "/F2" : "/F1";
    if (name !== font || line.size !== size) {
      ops.push(`${name} ${fmt(line.size)} Tf`);
      font = name;
      size = line.size;
    }
    if (line.tone !== tone) {
      ops.push(`${fmt(line.tone)} g`);
      tone = line.tone;
    }
    // Tm is absolute, so a line's position never depends on the one before it.
    ops.push(`1 0 0 1 ${fmt(line.x)} ${fmt(line.y)} Tm`);
    ops.push(`${pdfString(line.text)} Tj`);
  }
  const footer = toCp1252(`Page ${pageNumber} of ${pageCount}`);
  ops.push(`/F1 ${fmt(FOOTER_SIZE)} Tf`);
  ops.push("0.55 g");
  ops.push(
    `1 0 0 1 ${fmt((PAGE_WIDTH - measure(footer, FOOTER_SIZE, false)) / 2)} ${fmt(FOOTER_BASELINE)} Tm`,
  );
  ops.push(`${pdfString(footer)} Tj`);
  ops.push("ET");
  return `${ops.join("\n")}\n`;
}

// Objects 1-4 are fixed; each page then contributes a page object and its
// content stream, so page i is object 5 + 2i.
const FIRST_PAGE_OBJECT = 5;

function fontObject(baseFont: string): string {
  return `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`;
}

// Builds the whole file as a JS string in which EVERY character code is 0-255.
// This is the single load-bearing invariant of the writer: the xref table and
// every /Length are byte offsets, and they are computed from `out.length`. A
// stray character above 0xFF would make String#length disagree with the byte
// length from that point on, every later offset would be wrong, and the reader
// would report nothing beyond "failed to load". Hence toCp1252 on all user
// text, and no TextEncoder anywhere near the assembled document.
function serialize(pages: PlacedLine[][]): string {
  const kids = pages
    .map((_page, i) => `${FIRST_PAGE_OBJECT + i * 2} 0 R`)
    .join(" ");
  const bodies: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    fontObject("Helvetica"),
    fontObject("Helvetica-Bold"),
  ];
  pages.forEach((lines, i) => {
    const contentObject = FIRST_PAGE_OBJECT + i * 2 + 1;
    bodies.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(PAGE_WIDTH)} ${fmt(PAGE_HEIGHT)}]` +
        ` /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    const data = contentStream(lines, i + 1, pages.length);
    // data.length IS the byte count, by the invariant above.
    bodies.push(`<< /Length ${data.length} >>\nstream\n${data}\nendstream`);
  });

  // The binary comment marks the file as non-text for tools that sniff it;
  // its bytes are 0xE2 0xE3 0xCF 0xD3, all within the latin1 range.
  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = out.length;
  // Every xref entry is exactly 20 bytes: 10 digits, space, 5 digits, space,
  // type, space, newline. Readers seek into this table by multiplication.
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  // No /ID and no /CreationDate: both would make identical input produce
  // different bytes, which would make this renderer untestable.
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\n`;
  out += `startxref\n${xrefOffset}\n%%EOF\n`;
  return out;
}

/**
 * Render a board snapshot as a PDF 1.4 document.
 *
 * Pure and deterministic: the only date in the output is derived from
 * `data.createdAt`, and the same input always produces byte-identical output.
 */
export function toPdf(data: BoardExport, scope: ExportScope): Uint8Array {
  const document = serialize(layout(buildBlocks(data, scope)));
  const bytes = new Uint8Array(document.length);
  for (let i = 0; i < document.length; i++) {
    // Lossless because every character came from an ASCII literal or from
    // toCp1252. Uint8Array would silently truncate anything wider, which is
    // exactly why nothing may reach this string unencoded.
    bytes[i] = document.charCodeAt(i);
  }
  return bytes;
}
