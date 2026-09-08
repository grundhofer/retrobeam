// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  KUDO_CARD_LABELS,
  summarizeExport,
  type BoardExport,
  type ExportNote,
  type ExportScope,
} from "@retropolis/shared";

// A picture of the board, drawn with nothing but a 2D canvas — the one export
// that can be pasted straight into a chat message instead of downloaded and
// opened. It renders the SAME BoardExport the Markdown/CSV/JSON exports
// render, row for row, so the image a team pastes into a channel can never
// disagree with the file they attach next to it.
//
// Everything here is deliberately dependency-free: an image encoder pulled in
// for one menu item would sit in the board bundle for everyone who never
// exports, and the browser already has both halves (canvas + JPEG).

const IMAGE_WIDTH = 900;
/** Fixed 2× oversample, the devicePixelRatio trick without the device: the
 *  canvas is twice the CSS size and the context is scaled to match, so text
 *  stays crisp when the image is opened full-size or on a retina screen.
 *  Fixed rather than read from window.devicePixelRatio because the file must
 *  look the same coming off every participant's machine. */
const IMAGE_SCALE = 2;
/** Chromium refuses to allocate a canvas beyond ~16384px on a side (and
 *  ~268MP in total); past that toBlob simply hands back null. At 900 CSS px
 *  wide the area ceiling is unreachable, so the side is the binding limit. */
const MAX_CANVAS_SIDE = 16384;
const MAX_CSS_HEIGHT = MAX_CANVAS_SIDE / IMAGE_SCALE;
const JPEG_QUALITY = 0.92;

const MARGIN = 44;
const CARD_PADDING = 14;
const CARD_GAP = 10;
const SECTION_GAP = 26;
const CARD_RADIUS = 10;

const TITLE_SIZE = 30;
const HEADING_SIZE = 19;
const BODY_SIZE = 15;
const META_SIZE = 12;

// The app's palette (index.css / Tailwind zinc), spelled out because a canvas
// resolves no CSS variables.
const PAGE_BG = "#fafafa"; // zinc-50
const CARD_BG = "#ffffff";
const CARD_BORDER = "#e4e4e7"; // zinc-200
const INK = "#18181b"; // zinc-900, headings
const BODY_INK = "#3f3f46"; // zinc-700, body copy
const MUTED_INK = "#a1a1aa"; // zinc-400, meta
const ACCENT = "#0e7c7b";

// Emoji faces are named explicitly: the crown below is the whole point of
// drawing this in a browser, and a stack that fell through to a text-only
// family would paint it as a tofu box.
const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

function fontOf(bold: boolean, size: number): string {
  return `${bold ? "600" : "400"} ${size}px ${FONT_STACK}`;
}

function lineHeight(size: number): number {
  return Math.round(size * 1.45);
}

/** Injected so the layout can be computed — and unit-tested — without a
 *  canvas. The real one is `ctx.measureText` under the very font the painter
 *  will use; a stub in the tests. */
export type MeasureText = (text: string, bold: boolean, size: number) => number;

export interface ImageTextLine {
  text: string;
  /** left edge, CSS px */
  x: number;
  /** TOP of the line box, CSS px — the painter sets textBaseline "top" */
  y: number;
  size: number;
  bold: boolean;
  color: string;
}

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageLayout {
  /** CSS pixels; the canvas itself is this times IMAGE_SCALE. */
  width: number;
  height: number;
  background: string;
  /** note cards, painted under the text */
  cards: ImageRect[];
  lines: ImageTextLine[];
  /** true when the board outgrew the canvas ceiling and rows were dropped */
  truncated: boolean;
}

/** One already-wrapped line, before it knows where it sits. */
interface Run {
  text: string;
  size: number;
  bold: boolean;
  color: string;
}

// Deterministic, timezone-free date string — the same one-liner export.ts
// keeps module-private for its Markdown header. Duplicated rather than
// exported, but it MUST stay identical: two export formats of one board
// printing two different dates is a bug report nobody can reproduce.
function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

// fillText does not break lines: a literal newline paints as nothing (or as a
// stray glyph) and the rest of the note keeps running off the card. Every
// field is flattened before wrapping — the same thing toMarkdown does to note
// bodies, for the same "one row is one row" reason.
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

// A URL, a stack trace, an unbroken 200-character word: nothing to break at,
// and canvas clips rather than reflows, so without a character-level split it
// would run past the card edge and off the image. Iterated with for..of, which
// walks code POINTS — splitting a surrogate pair would turn an emoji into two
// replacement characters.
function splitLongWord(
  word: string,
  maxWidth: number,
  bold: boolean,
  size: number,
  measure: MeasureText,
): string[] {
  if (measure(word, bold, size) <= maxWidth) return [word];
  const pieces: string[] = [];
  let piece = "";
  for (const char of word) {
    const candidate = piece + char;
    if (piece !== "" && measure(candidate, bold, size) > maxWidth) {
      pieces.push(piece);
      piece = char;
    } else {
      piece = candidate;
    }
  }
  if (piece !== "") pieces.push(piece);
  return pieces;
}

function wrapText(
  text: string,
  maxWidth: number,
  bold: boolean,
  size: number,
  measure: MeasureText,
): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter((part) => part !== "")) {
    for (const piece of splitLongWord(word, maxWidth, bold, size, measure)) {
      const candidate = current === "" ? piece : `${current} ${piece}`;
      if (current !== "" && measure(candidate, bold, size) > maxWidth) {
        out.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
  }
  if (current !== "") out.push(current);
  return out;
}

function runsHeight(runs: readonly Run[]): number {
  return runs.reduce((total, run) => total + lineHeight(run.size), 0);
}

function wrapRun(
  text: string,
  maxWidth: number,
  style: Omit<Run, "text">,
  measure: MeasureText,
): Run[] {
  return wrapText(text, maxWidth, style.bold, style.size, measure).map(
    (line) => ({ ...style, text: line }),
  );
}

// One note, as the stack of lines that will fill its card.
function noteRuns(
  note: ExportNote,
  maxWidth: number,
  measure: MeasureText,
): Run[] {
  const runs: Run[] = [];

  // The crown takes its own accent-coloured line rather than being spliced
  // into the first line of body text: the layout is pure and knows only
  // widths, so a two-colour, two-font run sharing one line box would cost a
  // second measuring pass for no reader benefit.
  //
  // "👑<rank>" is the deliberate divergence from the PDF export, which prints
  // "#<rank>". A browser has the whole Unicode plane and the board crowns its
  // top cards with this exact glyph on screen, so the image shows the room
  // what the room saw; the PDF cannot, because a WinAnsi-encoded standard PDF
  // font has no code point for an emoji at all.
  if (note.crownedRank !== null) {
    runs.push({
      text: `👑${note.crownedRank}`,
      size: META_SIZE,
      bold: true,
      color: ACCENT,
    });
  }

  runs.push(
    ...wrapRun(
      oneLine(note.text),
      maxWidth,
      { size: BODY_SIZE, bold: false, color: BODY_INK },
      measure,
    ),
  );

  // NEVER load note.gifUrl (or any remote image). Two independent reasons,
  // either one fatal:
  //  1. drawImage of a cross-origin image served without CORS headers TAINTS
  //     the canvas, and every later toBlob throws SecurityError — the export
  //     would break for precisely the boards that used GIFs, and only there.
  //  2. fetching it hands the participant's IP straight to the GIF provider.
  //     That is the exact exposure the Worker-side GIF proxy exists to
  //     prevent; an export must not be the hole in it.
  // A text marker keeps the row honest about what the card carried.
  if (note.gifUrl !== null) {
    runs.push({
      text: "[GIF]",
      size: META_SIZE,
      bold: false,
      color: MUTED_INK,
    });
  }

  // Assembled in toMarkdown's order and wording — votes, voters, author — so
  // the two formats read as one document. A zero tally is omitted there and
  // omitted here.
  const meta: string[] = [];
  if (note.votes !== null && note.votes > 0) meta.push(`${note.votes} votes`);
  if (note.voterNames !== null && note.voterNames.length > 0) {
    meta.push(`voted by ${note.voterNames.join(", ")}`);
  }
  if (note.authorName !== null) meta.push(note.authorName);
  if (meta.length > 0) {
    runs.push(
      ...wrapRun(
        meta.join(", "),
        maxWidth,
        { size: META_SIZE, bold: false, color: MUTED_INK },
        measure,
      ),
    );
  }

  // A card with no text, no crown and no meta is still a row the board had;
  // one blank line keeps it a visible empty card instead of a collapsed
  // border.
  if (runs.length === 0) {
    runs.push({ text: "", size: BODY_SIZE, bold: false, color: BODY_INK });
  }
  return runs;
}

/** Pure: no canvas, no DOM, no clock. Everything the painter needs, in CSS
 *  pixels, from the snapshot plus a way to measure text. */
export function layoutBoardImage(
  data: BoardExport,
  scope: ExportScope,
  measure: MeasureText,
): ImageLayout {
  // The same projection renderExport applies, applied HERE for the same
  // reason: one filter for every format, so the image can never show a row the
  // Markdown hides. summarizeExport is idempotent (a crowned card stays
  // crowned), so this is harmless when the caller already asked the server for
  // a summary-scoped snapshot.
  const scoped = scope === "summary" ? summarizeExport(data) : data;

  const lines: ImageTextLine[] = [];
  const cards: ImageRect[] = [];
  const contentWidth = IMAGE_WIDTH - MARGIN * 2;
  const cardTextWidth = contentWidth - CARD_PADDING * 2;
  let y = MARGIN;
  let truncated = false;

  // The single gate on growth. Once it says no it keeps saying no, so the
  // document stops at a row boundary instead of running off a canvas that
  // cannot be reallocated; the reserved tail is the "… truncated" line plus
  // the bottom margin, which must still fit after the last row that did.
  function fits(height: number): boolean {
    if (truncated) return false;
    if (y + height + lineHeight(META_SIZE) + MARGIN > MAX_CSS_HEIGHT) {
      truncated = true;
      return false;
    }
    return true;
  }

  function emit(runs: readonly Run[], x: number): void {
    for (const run of runs) {
      lines.push({
        text: run.text,
        x,
        y,
        size: run.size,
        bold: run.bold,
        color: run.color,
      });
      y += lineHeight(run.size);
    }
  }

  function block(runs: readonly Run[], x: number): void {
    if (!fits(runsHeight(runs))) return;
    emit(runs, x);
  }

  const title = wrapRun(
    oneLine(scoped.boardName),
    contentWidth,
    { size: TITLE_SIZE, bold: true, color: INK },
    measure,
  );
  block(title, MARGIN);
  y += 4;
  // Mirrors toMarkdown's subtitle exactly, scope suffix included.
  block(
    wrapRun(
      scope === "summary"
        ? `Retrospective · ${isoDate(scoped.createdAt)} · Summary (top cards & action items)`
        : `Retrospective · ${isoDate(scoped.createdAt)}`,
      contentWidth,
      { size: META_SIZE, bold: false, color: MUTED_INK },
      measure,
    ),
    MARGIN,
  );
  y += SECTION_GAP;

  // A summary with nothing crowned is a real state — nobody voted, or the vote
  // is not revealed yet — and must not render as a blank picture.
  if (scope === "summary" && scoped.columns.length === 0) {
    block(
      wrapRun(
        "No top cards yet.",
        contentWidth,
        { size: BODY_SIZE, bold: false, color: MUTED_INK },
        measure,
      ),
      MARGIN,
    );
    y += SECTION_GAP;
  }

  for (const column of scoped.columns) {
    if (truncated) break;
    block(
      wrapRun(
        oneLine(column.name),
        contentWidth,
        { size: HEADING_SIZE, bold: true, color: INK },
        measure,
      ),
      MARGIN,
    );
    y += 8;
    if (column.notes.length === 0) {
      block(
        wrapRun(
          "(no notes)",
          contentWidth,
          { size: BODY_SIZE, bold: false, color: MUTED_INK },
          measure,
        ),
        MARGIN,
      );
      y += SECTION_GAP;
      continue;
    }
    for (const note of column.notes) {
      if (truncated) break;
      // The card is measured whole and placed whole: a note split across the
      // truncation boundary would leave a bordered box with half a sentence.
      const runs = noteRuns(note, cardTextWidth, measure);
      const height = runsHeight(runs) + CARD_PADDING * 2;
      if (!fits(height + CARD_GAP)) break;
      cards.push({ x: MARGIN, y, width: contentWidth, height });
      y += CARD_PADDING;
      emit(runs, MARGIN + CARD_PADDING);
      y += CARD_PADDING + CARD_GAP;
    }
    y += SECTION_GAP - CARD_GAP;
  }

  // In summary scope the action items are half the promised document, so their
  // absence is a fact worth printing rather than a missing heading — same rule
  // toMarkdown follows.
  if (!truncated && (scoped.actions.length > 0 || scope === "summary")) {
    block(
      wrapRun(
        "Action items",
        contentWidth,
        { size: HEADING_SIZE, bold: true, color: INK },
        measure,
      ),
      MARGIN,
    );
    y += 8;
    if (scoped.actions.length === 0) {
      block(
        wrapRun(
          "(no action items)",
          contentWidth,
          { size: BODY_SIZE, bold: false, color: MUTED_INK },
          measure,
        ),
        MARGIN,
      );
    }
    for (const action of scoped.actions) {
      if (truncated) break;
      const owner =
        action.ownerName !== null ? ` — ${oneLine(action.ownerName)}` : "";
      block(
        wrapRun(
          `${action.done ? "☑" : "☐"} ${oneLine(action.text)}${owner}`,
          contentWidth,
          { size: BODY_SIZE, bold: false, color: BODY_INK },
          measure,
        ),
        MARGIN,
      );
      y += 4;
    }
    y += SECTION_GAP;
  }

  // Kudos never survive the summary projection (summarizeExport empties them
  // on purpose), so this section only ever appears on a full export.
  if (!truncated && scoped.kudos.length > 0) {
    block(
      wrapRun(
        "Appreciation",
        contentWidth,
        { size: HEADING_SIZE, bold: true, color: INK },
        measure,
      ),
      MARGIN,
    );
    y += 8;
    for (const kudo of scoped.kudos) {
      if (truncated) break;
      block(
        wrapRun(
          `${KUDO_CARD_LABELS[kudo.cardType]} → ${oneLine(kudo.toName)}`,
          contentWidth,
          { size: BODY_SIZE, bold: true, color: BODY_INK },
          measure,
        ),
        MARGIN,
      );
      const text = oneLine(kudo.text);
      if (text !== "") {
        block(
          wrapRun(
            text,
            contentWidth,
            { size: BODY_SIZE, bold: false, color: BODY_INK },
            measure,
          ),
          MARGIN,
        );
      }
      if (kudo.fromName !== null) {
        block(
          wrapRun(
            `— ${oneLine(kudo.fromName)}`,
            contentWidth,
            { size: META_SIZE, bold: false, color: MUTED_INK },
            measure,
          ),
          MARGIN,
        );
      }
      y += 8;
    }
    y += SECTION_GAP;
  }

  if (truncated) {
    lines.push({
      text: "… truncated",
      x: MARGIN,
      y,
      size: META_SIZE,
      bold: false,
      color: MUTED_INK,
    });
    y += lineHeight(META_SIZE);
  }

  return {
    width: IMAGE_WIDTH,
    height: Math.min(Math.round(y + MARGIN), MAX_CSS_HEIGHT),
    background: PAGE_BG,
    cards,
    lines,
    truncated,
  };
}

function paint(ctx: CanvasRenderingContext2D, layout: ImageLayout): void {
  // JPEG HAS NO ALPHA CHANNEL. A fresh canvas is transparent black, and the
  // encoder drops the alpha rather than compositing on white — so without this
  // opaque fill the whole export encodes as a solid black rectangle. It has to
  // come first, and it has to cover everything.
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // Cards first, as a background pass: they are opaque and would otherwise
  // paint over the text that belongs to them.
  ctx.lineWidth = 1;
  for (const card of layout.cards) {
    ctx.beginPath();
    ctx.roundRect(card.x, card.y, card.width, card.height, CARD_RADIUS);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    ctx.strokeStyle = CARD_BORDER;
    ctx.stroke();
  }

  // "top" makes a line's y its top edge, which is what the layout advanced by;
  // with the default alphabetic baseline every block would sit one ascent high.
  ctx.textBaseline = "top";
  for (const line of layout.lines) {
    ctx.font = fontOf(line.bold, line.size);
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, line.x, line.y);
  }
}

/** Draw the board to an offscreen canvas and encode it as JPEG. Rejects rather
 *  than resolving something unusable — the caller reports it; swallowing the
 *  failure here would be a download button that does nothing. */
export async function renderBoardImage(
  data: BoardExport,
  scope: ExportScope,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("image export failed: no 2D canvas context");
  }

  // measureText is unaffected by the transform, so the layout can be measured
  // before the canvas is sized — which is necessary, because the height comes
  // out of the layout.
  const measure: MeasureText = (text, bold, size) => {
    ctx.font = fontOf(bold, size);
    return ctx.measureText(text).width;
  };
  const layout = layoutBoardImage(data, scope, measure);

  // Assigning width/height RESETS the context (transform, font, styles), so
  // the scale and every paint setting has to come after the resize, not before.
  canvas.width = Math.round(layout.width * IMAGE_SCALE);
  canvas.height = Math.round(layout.height * IMAGE_SCALE);
  ctx.scale(IMAGE_SCALE, IMAGE_SCALE);
  paint(ctx, layout);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });
  // toBlob hands back null instead of throwing when the browser will not
  // encode the canvas — over its size ceiling, or out of memory. The layout
  // clamps the height to stay under it, so this is the belt to that brace;
  // still, a real Error beats a promise that resolves to nothing.
  if (blob === null) {
    throw new Error("image export failed: the board is too large to encode");
  }
  return blob;
}
