// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import type { BoardExport, ExportNote } from "@retropolis/shared";
import {
  layoutBoardImage,
  renderBoardImage,
  type ImageLayout,
  type MeasureText,
} from "./exportImage.js";

// Every glyph is 8px wide, whatever the font. The whole point of injecting the
// measurer is that the layout assertions below do not depend on which of the
// three browser engines is running the file, nor on which fonts it happens to
// have installed — real ctx.measureText would make the wrap points drift
// between Chromium, Firefox and WebKit and the line counts with them.
const measure: MeasureText = (text) => text.length * 8;

function board(overrides: Partial<BoardExport> = {}): BoardExport {
  return {
    boardName: "Sprint 42",
    createdAt: Date.UTC(2026, 8, 8),
    columns: [],
    actions: [],
    kudos: [],
    ...overrides,
  };
}

function note(overrides: Partial<ExportNote> = {}): ExportNote {
  return {
    text: "a card",
    gifUrl: null,
    authorName: null,
    votes: null,
    crownedRank: null,
    groupId: null,
    voterNames: null,
    ...overrides,
  };
}

function texts(layout: ImageLayout): string[] {
  return layout.lines.map((line) => line.text);
}

test("long note text wraps into several lines and the page grows to fit", () => {
  const one = layoutBoardImage(
    board({
      columns: [{ name: "Went well", notes: [note({ text: "tiny" })] }],
    }),
    "all",
    measure,
  );
  const many = layoutBoardImage(
    board({
      columns: [
        {
          name: "Went well",
          notes: [note({ text: "word ".repeat(80).trim() })],
        },
      ],
    }),
    "all",
    measure,
  );

  const wrapped = texts(many).filter((text) => text.startsWith("word"));
  expect(wrapped.length).toBeGreaterThan(3);
  // Nothing may be laid out wider than the card it sits in, or the painter
  // clips it — the whole reason wrapping exists.
  const card = many.cards[0];
  expect(card).toBeDefined();
  for (const line of wrapped) {
    expect(measure(line, false, 15)).toBeLessThanOrEqual(card?.width ?? 0);
  }
  expect(many.height).toBeGreaterThan(one.height);
  expect(many.truncated).toBe(false);
});

test("a crowned, voted-on card carries its rank, tally, voters and author", () => {
  const layout = layoutBoardImage(
    board({
      columns: [
        {
          name: "Went well",
          notes: [
            note({
              text: "pairing helped",
              crownedRank: 2,
              votes: 3,
              voterNames: ["Ada", "Grace"],
              authorName: "Ada",
              gifUrl: "https://example.test/cat.gif",
            }),
          ],
        },
      ],
    }),
    "all",
    measure,
  );

  const all = texts(layout);
  expect(all).toContain("👑2");
  expect(all.join("\n")).toContain("3 votes, voted by Ada, Grace, Ada");
  // The GIF is named, never fetched: a remote image would taint the canvas and
  // leak the exporter's IP to the provider.
  expect(all).toContain("[GIF]");
  expect(all.join("\n")).not.toContain("example.test");
});

test("an uncrowned, unvoted card carries no rank and no voter line", () => {
  const layout = layoutBoardImage(
    board({
      columns: [
        {
          name: "Went well",
          notes: [note({ text: "pairing helped", votes: 0 })],
        },
      ],
    }),
    "all",
    measure,
  );

  const joined = texts(layout).join("\n");
  expect(joined).toContain("pairing helped");
  expect(joined).not.toContain("👑");
  expect(joined).not.toContain("voted by");
  // A zero tally is omitted, exactly as toMarkdown omits it.
  expect(joined).not.toContain("votes");
});

test("a summary with nothing crowned says so instead of rendering blank", () => {
  const layout = layoutBoardImage(
    board({
      columns: [
        { name: "Went well", notes: [note({ text: "nobody voted for me" })] },
      ],
    }),
    "summary",
    measure,
  );

  const all = texts(layout);
  expect(all).toContain("No top cards yet.");
  // The projection can only remove rows: an uncrowned card must not appear.
  expect(all.join("\n")).not.toContain("nobody voted for me");
  // Action items are half the promised summary, so the empty state is printed.
  expect(all).toContain("(no action items)");
  expect(all.join("\n")).toContain("Summary (top cards & action items)");
});

const fullBoard = board({
  columns: [
    {
      name: "Went well",
      notes: [
        note({ text: "pairing helped", crownedRank: 1, votes: 4 }),
        note({ text: "the deploy script finally behaves" }),
      ],
    },
    { name: "To improve", notes: [] },
  ],
  actions: [
    { text: "split the retro board template", ownerName: "Ada", done: false },
    { text: "book the room", ownerName: null, done: true },
  ],
  kudos: [
    {
      cardType: "thank-you",
      toName: "Grace",
      fromName: "Ada",
      text: "for the on-call swap",
    },
  ],
});

test("the render resolves to a JPEG blob", async () => {
  const blob = await renderBoardImage(fullBoard, "all");
  expect(blob.type).toBe("image/jpeg");
  expect(blob.size).toBeGreaterThan(1000);
});

// The regression test for the missing-background bug: JPEG has no alpha, so a
// canvas that was never filled encodes every transparent pixel as BLACK and
// the export is a solid black rectangle that still passes every "it is a
// JPEG" assertion above.
test("the rendered image is not a black rectangle", async () => {
  const blob = await renderBoardImage(fullBoard, "all");
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2D context to read the image back");
  ctx.drawImage(bitmap, 0, 0);

  // The four corners sit in the page margin, which is background wherever the
  // content happens to fall — sampling them cannot land on a glyph.
  const inset = 6;
  const corners = [
    [inset, inset],
    [bitmap.width - inset, inset],
    [inset, bitmap.height - inset],
    [bitmap.width - inset, bitmap.height - inset],
  ] as const;
  for (const corner of corners) {
    const [x, y] = corner;
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const [r = 0, g = 0, b = 0] = pixel;
    expect(Math.min(r, g, b)).toBeGreaterThan(200);
  }

  // ...and something dark was actually painted, so a page filled white and
  // left empty cannot pass either.
  const all = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let darkest = 255;
  for (let i = 0; i < all.length; i += 4) {
    darkest = Math.min(darkest, all[i] ?? 255);
  }
  expect(darkest).toBeLessThan(120);
});
