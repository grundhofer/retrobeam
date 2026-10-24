// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { userEvent } from "vitest/browser";
import type { Column, Note, Participant, ServerEvent } from "@retrobeam/shared";
import i18n from "../i18n.js";
// The zones' flex layout gives their card area its height; without the
// styles it is 0px tall and no step has room.
import "../index.css";
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

// WCAG 2.1.1: a canvas note used to be double-click only. The zone's "+ Note"
// opens the same composer — for the facilitator too, whose zone header is also
// the zone's drag handle — at a free spot, not on top of the existing card.
test("the zone's + Note button opens the composer at a free spot", async () => {
  const mutate = vi.fn();
  const screen = await render(
    <ConnectionProvider value={{ boardId: BOARD_ID, mutate, send: vi.fn() }}>
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

  await expect
    .element(screen.getByTestId("canvas-composer"))
    .not.toBeInTheDocument();
  await screen.getByTestId("canvas-add-note").click();
  const composer = screen.getByTestId("canvas-composer");
  await expect.element(composer).toHaveFocus();
  // Where it OPENS, not only where it commits: createNote nudges the commit
  // again, so the command below would pass even with a composer drawn on top
  // of the fixture's card at the centre.
  const shown = composer
    .element()
    .closest<HTMLElement>("[data-canvas-composer]");
  expect(shown).not.toBe(null);
  expect(
    shown!.style.left !== `${note.x! * 100}%` ||
      shown!.style.top !== `${note.y! * 100}%`,
  ).toBe(true);
  await composer.fill("from the button");
  await userEvent.keyboard("{Enter}");

  expect(mutate).toHaveBeenCalledTimes(1);
  const command = mutate.mock.calls[0]?.[0] as {
    type: string;
    columnId: string;
    text: string;
    x: number;
    y: number;
  };
  expect(command).toMatchObject({
    type: "note.create",
    columnId: column.id,
    text: "from the button",
  });
  // The centre is taken by the fixture's card; the composer moved off it.
  expect(command.x !== note.x || command.y !== note.y).toBe(true);
});

// WCAG 2.5.7 and 2.1.1: a canvas card used to move by dragging only. Its ⋯
// carries the column layout's "Move to …" and, for the fine position, step
// buttons that also answer the arrow keys. Each press is one note.move — the
// command and echo a drop sends — and none is offered the drop would not be.
const zones: Column[] = [
  column,
  { ...column, id: "d".repeat(32), name: "To improve", order: 1 },
];
const ben: Participant = { ...you, id: "p2", name: "Ben", role: "member" };

function canvas(
  props: Partial<React.ComponentProps<typeof BoardCanvas>>,
  mutate: (...args: unknown[]) => void = vi.fn(),
) {
  return (
    <ConnectionProvider value={{ boardId: BOARD_ID, mutate, send: vi.fn() }}>
      <BoardCanvas
        columns={zones}
        notes={[note]}
        columnCounts={{}}
        canvasOccupancy={[]}
        roster={[you, ben]}
        you={you}
        phase="present"
        editing={{}}
        isAdmin
        presenterId={null}
        unpresentedAuthorIds={null}
        gifsEnabled={false}
        cursors={{}}
        cursorsEnabled={false}
        {...props}
      />
    </ConnectionProvider>
  );
}

test("a canvas card moves to another zone and steps without dragging", async () => {
  const mutate = vi.fn();
  const stacked = { ...note, groupId: "e".repeat(32) };
  const screen = await render(canvas({ notes: [stacked] }, mutate));

  await screen.getByTestId("note-arrange-toggle").click();
  // The other zone only, as in the columns; nothing to stack with on its own.
  const options = screen.getByTestId("note-move-option");
  expect(options.elements().map((el) => el.textContent)).toEqual([
    zones[1]!.name,
  ]);
  expect(screen.getByTestId("note-stack-option").elements()).toHaveLength(0);

  // A step right: same zone, further right, same height — and the stack kept,
  // exactly as a same-zone drop keeps it.
  await screen.getByTestId("note-nudge-right").click();
  expect(mutate).toHaveBeenCalledTimes(1);
  const [stepped, steppedEcho] = mutate.mock.calls[0] as [
    { type: string; noteId: string; columnId: string; x: number; y: number },
    { type: string; note: Note },
  ];
  expect(stepped).toMatchObject({
    type: "note.move",
    noteId: note.id,
    columnId: column.id,
    y: note.y,
  });
  expect(stepped.x).toBeGreaterThan(note.x!);
  expect(steppedEcho).toMatchObject({
    type: "note.updated",
    note: { ...stacked, x: stepped.x, y: stepped.y },
  });

  // The arrow keys do the same while focus is in the step group; a held key's
  // repeats are not a stream of frames.
  const down = screen.getByTestId("note-nudge-down").element() as HTMLElement;
  down.focus();
  await userEvent.keyboard("{ArrowUp}");
  expect(mutate).toHaveBeenCalledTimes(2);
  expect(mutate.mock.calls[1]?.[0]).toMatchObject({ x: note.x });
  expect((mutate.mock.calls[1]?.[0] as { y: number }).y).toBeLessThan(note.y!);
  down.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "ArrowUp",
      repeat: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(mutate).toHaveBeenCalledTimes(2);

  // "Move to …": the other zone, at a free spot inside it, out of any stack.
  await screen.getByTestId("note-move-option").click();
  expect(mutate).toHaveBeenCalledTimes(3);
  const [moved, movedEcho] = mutate.mock.calls[2] as [
    { type: string; columnId: string; x: number; y: number },
    { note: Note },
  ];
  expect(moved).toMatchObject({ type: "note.move", columnId: zones[1]!.id });
  expect(moved.x).toBeGreaterThanOrEqual(0);
  expect(moved.x).toBeLessThanOrEqual(1);
  expect(movedEcho.note).toMatchObject({
    columnId: zones[1]!.id,
    x: moved.x,
    y: moved.y,
    groupId: null,
  });
});

test("a step that would not move the card is marked and sends nothing", async () => {
  const mutate = vi.fn();
  // At the zone's right edge: a step right has nowhere to go.
  const screen = await render(
    canvas({ notes: [{ ...note, x: 1, y: 0.5 }] }, mutate),
  );
  await screen.getByTestId("note-arrange-toggle").click();
  const right = screen.getByTestId("note-nudge-right");
  await expect.element(right).toHaveAttribute("aria-disabled", "true");
  await expect
    .element(screen.getByTestId("note-nudge-left"))
    .toHaveAttribute("aria-disabled", "false");
  // Still focusable and pressable (not `disabled`), so press it for real.
  (right.element() as HTMLElement).click();
  (right.element() as HTMLElement).focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(mutate).not.toHaveBeenCalled();
});

test("the canvas offers moves exactly where a drag is allowed", async () => {
  // Voting freezes the board.
  let screen = await render(canvas({ phase: "vote" }));
  expect(screen.getByTestId("note-card").elements()).toHaveLength(1);
  expect(screen.getByTestId("note-arrange-toggle").elements()).toHaveLength(0);
  await screen.unmount();

  // While writing, only the author moves a card — the server's NOT_AUTHOR.
  screen = await render(canvas({ phase: "write", you: ben, isAdmin: false }));
  expect(screen.getByTestId("note-card").elements()).toHaveLength(1);
  expect(screen.getByTestId("note-arrange-toggle").elements()).toHaveLength(0);
  await screen.unmount();

  // Closed for good once the retro is done.
  screen = await render(canvas({ phase: "done" }));
  expect(screen.getByTestId("note-card").elements()).toHaveLength(1);
  expect(screen.getByTestId("note-arrange-toggle").elements()).toHaveLength(0);
  await screen.unmount();

  screen = await render(canvas({ phase: "write" }));
  await screen.getByTestId("note-arrange-toggle").click();
  await expect
    .element(screen.getByTestId("note-nudge-left"))
    .toBeInTheDocument();
  expect(screen.getByTestId("note-move-option").elements()).toHaveLength(1);
  await screen.unmount();

  // While presenting, anyone moves anyone's card — a member included.
  screen = await render(canvas({ phase: "present", you: ben, isAdmin: false }));
  await screen.getByTestId("note-arrange-toggle").click();
  await expect
    .element(screen.getByTestId("note-nudge-left"))
    .toBeInTheDocument();
  expect(screen.getByTestId("note-move-option").elements()).toHaveLength(1);
});

// A move to another zone remounts the card there and takes the focused option
// with the old mount; a step keeps the mount and the focus. The echo is
// applied the way the store applies it, so the remount is real.
test("focus stays with the canvas card through a keyboard move and step", async () => {
  function Live() {
    const [notes, setNotes] = useState([note]);
    const apply = (_: unknown, echo: ServerEvent | ServerEvent[]) => {
      const events = Array.isArray(echo) ? echo : [echo];
      setNotes((current) =>
        events.reduce(
          (acc, event) =>
            event.type === "note.updated"
              ? acc.map((n) => (n.id === event.note.id ? event.note : n))
              : acc,
          current,
        ),
      );
    };
    return canvas({ notes }, apply as (...args: unknown[]) => void);
  }
  const screen = await render(<Live />);
  const toggle = () =>
    document.querySelector(
      `[data-note-id="${note.id}"] [data-testid="note-arrange-toggle"]`,
    );

  await screen.getByTestId("note-arrange-toggle").click();
  await screen.getByTestId("note-move-option").click();
  await expect
    .element(
      screen.getByTestId(`zone-${zones[1]!.id}`).getByTestId("note-card"),
    )
    .toBeVisible();
  await expect.poll(() => document.activeElement).toBe(toggle());

  await userEvent.keyboard("{Enter}");
  const left = screen.getByTestId("note-nudge-left");
  // The card's position lives on its drag wrapper.
  const placed = () =>
    (left.element().closest("[data-testid='canvas-card']") as HTMLElement).style
      .left;
  const before = placed();
  // By key, not click: WebKit does not focus a clicked button, and this is
  // about the mount surviving, not about what a click focuses.
  (left.element() as HTMLElement).focus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.poll(placed).not.toBe(before);
  await expect.element(left).toHaveFocus();
});

// The columns' twin test (BoardColumns.test.tsx): a drop on the other zone's
// centre and "Move to …" that zone are the same command and the same echo.
test("a canvas drop and Move to … send the same note.move", async () => {
  const mutate = vi.fn();
  const stacked = { ...note, groupId: "e".repeat(32) };
  const screen = await render(canvas({ notes: [stacked] }, mutate));
  const wrapper = screen.getByTestId("canvas-card").element() as HTMLElement;
  const target = screen
    .getByTestId(`zone-${zones[1]!.id}`)
    .element()
    .getBoundingClientRect();
  const start = wrapper.getBoundingClientRect();
  const ev = (type: string, x: number, y: number) =>
    new PointerEvent(type, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const dropX = target.left + target.width / 2;
  const dropY = target.top + target.height / 2;
  wrapper.dispatchEvent(ev("pointerdown", start.left + 8, start.top + 8));
  await tick();
  wrapper.dispatchEvent(ev("pointermove", dropX, dropY));
  await tick();
  wrapper.dispatchEvent(ev("pointerup", dropX, dropY));
  await tick();

  await screen.getByTestId("note-arrange-toggle").click();
  await screen.getByTestId("note-move-option").click();

  expect(mutate).toHaveBeenCalledTimes(2);
  type Call = [
    { type: string; noteId: string; columnId: string; x: number; y: number },
    { note: Note },
  ];
  const [dropped, moved] = mutate.mock.calls as [Call, Call];
  for (const [command, echo] of [dropped, moved]) {
    expect(command).toMatchObject({
      type: "note.move",
      noteId: note.id,
      columnId: zones[1]!.id,
    });
    expect(echo.note).toMatchObject({
      columnId: zones[1]!.id,
      x: command.x,
      y: command.y,
      groupId: null,
    });
  }
  // The pointer's fraction of a pixel aside, the same spot.
  expect(dropped[0].x).toBeCloseTo(moved[0].x, 2);
  expect(dropped[0].y).toBeCloseTo(moved[0].y, 2);
});

// A full zone refuses a drop and "+ Note"; "Move to …" does not offer it. In
// the write phase a teammate's anonymous placeholders take room like cards.
test("Move to … leaves out a zone with no free spot", async () => {
  const full = [];
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      full.push({ columnId: zones[1]!.id, x: i / 20, y: j / 20 });
    }
  }
  const screen = await render(
    canvas({ phase: "write", canvasOccupancy: full }),
  );
  // Not even the ⋯ panel's "Move to …" group: nothing in it to offer.
  await screen.getByTestId("note-arrange-toggle").click();
  await expect
    .element(screen.getByTestId("note-nudge-left"))
    .toBeInTheDocument();
  expect(screen.getByTestId("note-move-option").elements()).toHaveLength(0);
});

// A step goes straight: past a teammate's placeholder in the way, onto the
// first free spot behind it on the same line, never into another row.
test("a step hops a placeholder in the way and stays on its line", async () => {
  const mutate = vi.fn();
  const slot = { columnId: column.id, x: 0.55, y: 0.5 };
  const screen = await render(
    canvas(
      {
        phase: "write",
        notes: [{ ...note, x: 0.3, y: 0.5 }],
        canvasOccupancy: [slot],
      },
      mutate,
    ),
  );
  await screen.getByTestId("note-arrange-toggle").click();
  (screen.getByTestId("note-nudge-right").element() as HTMLElement).focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(mutate).toHaveBeenCalledTimes(1);
  const stepped = mutate.mock.calls[0]?.[0] as { x: number; y: number };
  const zone = screen.getByTestId(`zone-${column.id}`).element() as HTMLElement;
  // The footprint the canvas keeps clear around every card, in zone units.
  const separation = (176 + 12) / zone.offsetWidth;
  expect(stepped.y).toBe(0.5);
  expect(stepped.x).toBeGreaterThan(slot.x);
  expect(stepped.x - slot.x).toBeGreaterThanOrEqual(separation - 1e-9);
});

// WCAG 2.4.11 and 2.5.8 on a scaled world: the panel hangs below its card at
// its own size, on top of the card below it, and not clipped by the zone.
test("the canvas's ⋯ panel is on top, unclipped and full size", async () => {
  const below = { ...note, id: "b".repeat(32), text: "Below", x: 0.5, y: 0.45 };
  const bottom = { ...note, id: "f".repeat(32), text: "Bottom", x: 0.5, y: 1 };
  const screen = await render(
    canvas({ notes: [{ ...note, y: 0.3 }, below, bottom] }),
  );
  const topmost = async (cardText: string, testId: string) => {
    const card = screen.getByTestId("note-card").filter({ hasText: cardText });
    await card.getByTestId("note-arrange-toggle").click();
    const button = card.getByTestId(testId).element() as HTMLElement;
    button.focus();
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    expect(hit === button || button.contains(hit)).toBe(true);
    // Unscaled: as tall on screen as its own layout box, at any zoom.
    expect(box.height).toBeCloseTo(button.offsetHeight, 0);
    return box;
  };

  await topmost("Deploys are slow", "note-nudge-down");
  // The card below lies under the open panel, and the panel is what shows.
  const panel = screen.getByTestId("note-arrange").element();
  const neighbour = screen
    .getByTestId("note-card")
    .filter({ hasText: "Below" })
    .element()
    .getBoundingClientRect();
  const covered = document.elementFromPoint(
    neighbour.left + neighbour.width / 2,
    neighbour.top + neighbour.height / 2,
  );
  expect(panel.contains(covered)).toBe(true);

  // A card at the zone's bottom edge: its panel reaches past the zone.
  const edge = await topmost("Bottom", "note-nudge-up");
  const zone = screen
    .getByTestId(`zone-${column.id}`)
    .element()
    .getBoundingClientRect();
  expect(edge.bottom).toBeGreaterThan(zone.bottom);
});
