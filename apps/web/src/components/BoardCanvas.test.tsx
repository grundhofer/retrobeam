// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { Column, Note, Participant } from "@retrobeam/shared";
import i18n from "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { BoardCanvas, nearestOpenCanvasPosition } from "./BoardCanvas.js";

const you: Participant = {
  id: "p1",
  name: "Anna",
  color: "#E8590C",
  role: "facilitator",
  online: true,
};
const column: Column = {
  id: "c".repeat(32),
  name: "Went well",
  order: 0,
  hidden: false,
  rect: null,
};
const note: Note = {
  id: "a".repeat(32),
  columnId: column.id,
  authorId: you.id,
  text: "Deploys are slow",
  gifUrl: null,
  order: 1,
  x: 0.5,
  y: 0.5,
  groupId: null,
  reactions: {},
};

const BOARD_ID = "a".repeat(32);

// THE free-tier gate: dragging a card must never touch the wire until it lands.
test("canvas drag commits exactly ONE note.move on drop and ZERO during the move", async () => {
  const mutate = vi.fn();
  const send = vi.fn();
  const screen = await render(
    <ConnectionProvider value={{ boardId: BOARD_ID, mutate, send }}>
      <BoardCanvas
        columns={[column]}
        notes={[note]}
        columnCounts={{}}
        canvasOccupancy={[]}
        roster={[you]}
        you={you}
        phase="write"
        editing={{}}
        isAdmin
        presenterId={null}
        unpresentedAuthorIds={null}
        gifsEnabled={false}
        cursors={{}}
        cursorsEnabled={false}
      />
    </ConnectionProvider>,
  );

  const card = screen.getByTestId("note-card").element();
  const wrapper = card.parentElement as HTMLElement;
  const zone = screen.getByTestId(`zone-${column.id}`).element() as HTMLElement;
  const rect = zone.getBoundingClientRect();
  // Drop at ~25% of the zone — a real position change (the note sits at 0.5).
  const dropX = rect.left + rect.width * 0.25;
  const dropY = rect.top + rect.height * 0.25;
  const ev = (type: string, x: number, y: number) =>
    new PointerEvent(type, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    });
  // Real pointer events arrive across ticks; flush React state between them so
  // the move/up handlers see the drag started on pointerdown.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  wrapper.dispatchEvent(ev("pointerdown", rect.left + 40, rect.top + 40));
  await tick();
  wrapper.dispatchEvent(ev("pointermove", rect.left + 60, rect.top + 60));
  await tick();
  wrapper.dispatchEvent(ev("pointermove", dropX, dropY));
  await tick();
  // No network yet — the whole point of commit-on-drop.
  expect(mutate).not.toHaveBeenCalled();

  wrapper.dispatchEvent(ev("pointerup", dropX, dropY));
  await tick();
  expect(mutate).toHaveBeenCalledTimes(1);
  const command = mutate.mock.calls[0]?.[0] as {
    type: string;
    noteId: string;
    columnId: string;
    x: number;
    y: number;
  };
  expect(command.type).toBe("note.move");
  expect(command.noteId).toBe(note.id);
  expect(command.columnId).toBe(column.id);
  expect(command.x).toBeGreaterThanOrEqual(0);
  expect(command.x).toBeLessThanOrEqual(1);
});

test("foreign canvas positions render as anonymous occupied cards", async () => {
  const mutate = vi.fn();
  const send = vi.fn();
  const screen = await render(
    <ConnectionProvider value={{ boardId: BOARD_ID, mutate, send }}>
      <BoardCanvas
        columns={[column]}
        notes={[note]}
        columnCounts={{ [column.id]: 2 }}
        canvasOccupancy={[{ columnId: column.id, x: 0.25, y: 0.25 }]}
        roster={[you]}
        you={you}
        phase="write"
        editing={{}}
        isAdmin
        presenterId={null}
        unpresentedAuthorIds={null}
        gifsEnabled={false}
        cursors={{}}
        cursorsEnabled={false}
      />
    </ConnectionProvider>,
  );

  await expect
    .element(screen.getByTestId("canvas-occupancy"))
    .toHaveTextContent(i18n.t("canvas.occupied"));
  expect(document.querySelector("[data-testid='canvas-tidy']")).toBeNull();
});

test("an occupied drop snaps to the nearest free card position", () => {
  const open = nearestOpenCanvasPosition(
    { x: 0.5, y: 0.5 },
    [{ x: 0.5, y: 0.5 }],
    0.25,
    0.2,
  );
  expect(open).not.toBeNull();
  expect(
    Math.abs(open!.x - 0.5) >= 0.25 || Math.abs(open!.y - 0.5) >= 0.2,
  ).toBe(true);
});

// Cursors OFF must produce ZERO traffic on pointer move (the free-tier gate);
// ON sends at most one presence.cursor per second.
async function moveOverCanvas(enabled: boolean, moves = 1) {
  const send = vi.fn();
  const mutate = vi.fn();
  const screen = await render(
    <ConnectionProvider value={{ boardId: BOARD_ID, mutate, send }}>
      <BoardCanvas
        columns={[column]}
        notes={[]}
        columnCounts={{}}
        canvasOccupancy={[]}
        roster={[you]}
        you={you}
        phase="write"
        editing={{}}
        isAdmin
        presenterId={null}
        unpresentedAuthorIds={null}
        gifsEnabled={false}
        cursors={{}}
        cursorsEnabled={enabled}
      />
    </ConnectionProvider>,
  );
  const vp = screen.getByTestId("canvas-viewport").element();
  const rect = vp.getBoundingClientRect();
  for (let i = 0; i < moves; i++) {
    vp.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: rect.left + 60 + i * 20,
        clientY: rect.top + 60,
        bubbles: true,
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  return send.mock.calls.filter(
    (c) => (c[0] as { type?: string })?.type === "presence.cursor",
  ).length;
}

test("cursors OFF send nothing on pointer move (free-tier gate)", async () => {
  expect(await moveOverCanvas(false)).toBe(0);
});

test("cursors ON send a presence.cursor on pointer move", async () => {
  expect(await moveOverCanvas(true)).toBe(1);
});

test("cursors ON coalesce rapid pointer moves to the 1 Hz budget", async () => {
  expect(await moveOverCanvas(true, 5)).toBe(1);
});

test("double-clicking empty canvas space opens a composer", async () => {
  const mutate = vi.fn();
  const send = vi.fn();
  const screen = await render(
    <ConnectionProvider value={{ boardId: BOARD_ID, mutate, send }}>
      <BoardCanvas
        columns={[column]}
        notes={[]}
        columnCounts={{}}
        canvasOccupancy={[]}
        roster={[you]}
        you={you}
        phase="write"
        editing={{}}
        isAdmin
        presenterId={null}
        unpresentedAuthorIds={null}
        gifsEnabled={false}
        cursors={{}}
        cursorsEnabled={false}
      />
    </ConnectionProvider>,
  );

  const zone = screen.getByTestId(`zone-${column.id}`).element() as HTMLElement;
  const rect = zone.getBoundingClientRect();
  zone.dispatchEvent(
    new MouseEvent("dblclick", {
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.5,
      bubbles: true,
    }),
  );
  await expect
    .element(screen.getByTestId("canvas-composer"))
    .toBeInTheDocument();
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// The canvas composer commits when focus leaves it — and the GIF picker takes
// focus into a portal. Opening the picker must not post the note half-done,
// and picking must hand focus back so Enter still posts it, GIF included.
test("the canvas composer takes a GIF once there is text", async () => {
  const gif = "https://static.klipy.com/a.gif";
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("/gifs/search"))
      return realFetch(input as RequestInfo, init);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          configured: true,
          gifs: [{ id: "1", url: gif, previewUrl: gif, width: 2, height: 1 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;
  const mutate = vi.fn();
  const screen = await render(
    <ConnectionProvider value={{ boardId: BOARD_ID, mutate, send: vi.fn() }}>
      <BoardCanvas
        columns={[column]}
        notes={[]}
        columnCounts={{}}
        canvasOccupancy={[]}
        roster={[you]}
        you={you}
        phase="write"
        editing={{}}
        isAdmin
        presenterId={null}
        unpresentedAuthorIds={null}
        gifsEnabled
        cursors={{}}
        cursorsEnabled={false}
      />
    </ConnectionProvider>,
  );
  const zone = screen.getByTestId(`zone-${column.id}`).element() as HTMLElement;
  const rect = zone.getBoundingClientRect();
  zone.dispatchEvent(
    new MouseEvent("dblclick", {
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.5,
      bubbles: true,
    }),
  );

  const composer = screen.getByTestId("canvas-composer");
  await expect.element(composer).toBeInTheDocument();
  expect(screen.getByTestId("canvas-composer-gif").elements()).toHaveLength(0);
  await composer.fill("Ship it");
  await screen.getByTestId("canvas-composer-gif").click();
  await screen.getByTestId("gif-search").fill("ship");
  // Focus is in the picker now, and the note is still unposted.
  expect(mutate).not.toHaveBeenCalled();
  await expect.element(composer).toBeInTheDocument();

  await screen.getByTestId("gif-result").click();
  await expect.element(composer).toHaveFocus();
  expect(mutate).not.toHaveBeenCalled();
  (composer.element() as HTMLTextAreaElement).dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );

  await expect.poll(() => mutate.mock.calls.length).toBe(1);
  expect(mutate.mock.calls[0]?.[0]).toMatchObject({
    type: "note.create",
    text: "Ship it",
    gifUrl: gif,
  });
});

// A pinch made where the canvas is not (the presenter reader) zooms the page.
// Back on the canvas, the pinch-out that would undo it has to reach the page —
// swallowing it left the board stuck magnified with no way back.
test("a pinch belongs to the page while the page itself is zoomed", async () => {
  const screen = await render(
    <ConnectionProvider
      value={{ boardId: BOARD_ID, mutate: vi.fn(), send: vi.fn() }}
    >
      <BoardCanvas
        columns={[column]}
        notes={[note]}
        columnCounts={{}}
        canvasOccupancy={[]}
        roster={[you]}
        you={you}
        phase="write"
        editing={{}}
        isAdmin
        presenterId={null}
        unpresentedAuthorIds={null}
        gifsEnabled={false}
        cursors={{}}
        cursorsEnabled={false}
      />
    </ConnectionProvider>,
  );
  const viewport = screen.getByTestId("canvas-viewport").element();
  const world = () =>
    (viewport.firstElementChild as HTMLElement).style.transform;
  // deltaY < 0 is a pinch in: the fitted view may already sit at the minimum
  // zoom in a small test frame, where a pinch out would change nothing.
  const pinch = (deltaY: number) => {
    const event = new WheelEvent("wheel", {
      deltaY,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(event);
    return event;
  };

  const own = Object.getOwnPropertyDescriptor(window, "visualViewport");
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { scale: 2 },
  });
  try {
    // Not cancelled = the browser gets to zoom the page back out.
    expect(pinch(40).defaultPrevented).toBe(false);
  } finally {
    if (own) Object.defineProperty(window, "visualViewport", own);
    else delete (window as { visualViewport?: unknown }).visualViewport;
  }

  // At 1× the pinch is the canvas's own zoom again.
  const before = world();
  expect(pinch(-40).defaultPrevented).toBe(true);
  await expect.poll(world).not.toBe(before);
});
