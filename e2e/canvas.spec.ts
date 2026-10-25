// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// Canvas mode: create a freeform board, add a note by double-clicking empty
// space, then flip live to columns and confirm the note survives.
test("canvas layout: freeform zones, add-by-double-click, and the live switch", async ({
  browser,
}) => {
  const context = await newContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Canvas retro");
  await page.getByTestId("home-layout-canvas").click();
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = page.url();
  await join(page, "Anna");

  const benContext = await newContext(browser, { reducedMotion: "reduce" });
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Ben");

  // Start the retro → the write phase renders the CANVAS (zones), not columns.
  await page.getByTestId("phase-next").click();
  const zones = page.getByTestId(/^zone-/);
  await expect(zones.first()).toBeVisible();
  await expect(page.getByTestId(/^composer-/)).toHaveCount(0);
  // The canvas keeps only its zoom controls; auto-tidy was removed.
  await expect(page.getByTestId("canvas-tidy")).toHaveCount(0);
  await expect(page.getByTestId("canvas-viewport")).toBeVisible();

  // Double-click empty canvas space → an inline composer at that spot.
  await zones.first().dblclick({ position: { x: 130, y: 130 } });
  const composer = page.getByTestId("canvas-composer");
  await expect(composer).toBeVisible();
  await composer.fill("Freeform idea");
  await composer.press("Enter");
  await expect(page.getByText("Freeform idea")).toBeVisible();

  // Ben cannot read Anna's private card, but sees its occupied footprint.
  const occupied = ben.getByTestId("canvas-occupancy");
  await expect(occupied).toBeVisible();
  await expect(ben.getByText("Freeform idea")).toHaveCount(0);

  // Choosing the same point snaps Ben's card to the nearest free slot instead
  // of stacking it on Anna's hidden card.
  const benZone = ben.getByTestId(/^zone-/).first();
  await benZone.dblclick({ position: { x: 130, y: 130 } });
  const benComposer = ben.getByTestId("canvas-composer");
  await benComposer.fill("Another idea");
  await benComposer.press("Enter");
  const benCard = ben.getByTestId("note-card");
  await expect(benCard).toContainText("Another idea");
  const occupiedBox = await occupied.boundingBox();
  const benCardBox = await benCard.boundingBox();
  expect(occupiedBox).not.toBeNull();
  expect(benCardBox).not.toBeNull();
  const overlaps =
    occupiedBox!.x < benCardBox!.x + benCardBox!.width &&
    occupiedBox!.x + occupiedBox!.width > benCardBox!.x &&
    occupiedBox!.y < benCardBox!.y + benCardBox!.height &&
    occupiedBox!.y + occupiedBox!.height > benCardBox!.y;
  expect(overlaps).toBe(false);

  // Ben's invite panel and its full-screen code sit above the canvas's own
  // controls. The zoom control (z-40, later in the page) was drawn over both —
  // over the share link, and over the code on the projector, still clickable.
  await ben.getByTestId("invite-button").click();
  const panel = ben.getByTestId("invite-panel");
  await expect(panel.getByTestId("qr-code")).toBeVisible();
  expect(await topmostOverControl(ben, "invite-panel")).not.toBe("beneath");
  await panel.getByTestId("qr-enlarge").click();
  await expect(ben.getByTestId("qr-fullscreen")).toBeVisible();
  expect(await topmostOverControl(ben, "qr-fullscreen")).toBe("above");
  await ben.keyboard.press("Escape");
  await expect(ben.getByTestId("qr-fullscreen")).toHaveCount(0);
  await ben.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // Flip live to columns via the board menu → the column composer returns and
  // the note is still there (positions are ignored, not lost).
  await page.getByTestId("board-menu").click();
  await page.getByTestId("layout-columns").click();
  await page.keyboard.press("Escape"); // close the menu
  await expect(page.getByTestId(/^composer-/).first()).toBeVisible();
  await expect(page.getByText("Freeform idea")).toBeVisible();

  await benContext.close();
  await context.close();
});

// WCAG 2.5.7 and 2.1.1: a canvas card moves without a drag — to another zone
// through the card's ⋯, and step by step with the arrow keys — and the real
// server takes every one of those note.moves: a reload shows them kept.
test("canvas layout: a card moves by keyboard alone", async ({ browser }) => {
  const context = await newContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Canvas keyboard retro");
  await page.getByTestId("home-layout-canvas").click();
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Anna");
  await page.getByTestId("phase-next").click();

  const zones = page.getByTestId(/^zone-/);
  await expect(zones.nth(1)).toBeVisible();
  await page.getByTestId("canvas-add-note").first().focus();
  await page.keyboard.press("Enter");
  await page.getByTestId("canvas-composer").fill("Keyboard card");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("note-card");
  await expect(zones.nth(0).getByTestId("note-card")).toContainText(
    "Keyboard card",
  );

  // "Move to …" the second zone; focus comes back to the card's ⋯ there.
  await card.getByTestId("note-arrange-toggle").focus();
  await page.keyboard.press("Enter");
  const target = card.getByTestId("note-move-option").first();
  const zoneName = (await target.textContent()) ?? "";
  await target.focus();
  await page.keyboard.press("Enter");
  await expect(zones.nth(1).getByTestId("note-card")).toContainText(
    "Keyboard card",
  );
  await expect(card.getByTestId("note-arrange-toggle")).toBeFocused();
  await expect(page.getByRole("region", { name: zoneName })).toContainText(
    "Keyboard card",
  );

  // Two steps down and one to the right with the arrow keys. The position
  // lives on the card's drag wrapper.
  const wrapper = page.getByTestId("canvas-card").filter({ has: card });
  const placed = () =>
    wrapper.evaluate((el) => [
      (el as HTMLElement).style.left,
      (el as HTMLElement).style.top,
    ]);
  const [left0, top0] = await placed();
  await page.keyboard.press("Enter");
  await card.getByTestId("note-nudge-down").focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await placed())[1]).not.toBe(top0);
  const [, top1] = await placed();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await placed())[1]).not.toBe(top1);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await placed())[0]).not.toBe(left0);
  await expect(card.getByTestId("note-nudge-down")).toBeFocused();
  const stepped = await placed();
  expect(parseFloat(stepped[1]!)).toBeGreaterThan(parseFloat(top0!));
  expect(parseFloat(stepped[0]!)).toBeGreaterThan(parseFloat(left0!));

  // Escape closes the panel and hands focus back to the ⋯.
  await page.keyboard.press("Escape");
  await expect(card.getByTestId("note-arrange")).toHaveCount(0);
  await expect(card.getByTestId("note-arrange-toggle")).toBeFocused();

  // Kept by the server: the same zone and spot after a reload.
  await page.reload();
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(zones.nth(1).getByTestId("note-card")).toContainText(
    "Keyboard card",
  );
  await expect.poll(placed).toEqual(stepped);

  await context.close();
});

test("canvas layout: the facilitator moves and sizes a zone by keyboard alone", async ({
  browser,
}) => {
  const context = await newContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Canvas zone retro");
  await page.getByTestId("home-layout-canvas").click();
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Anna");
  await page.getByTestId("phase-next").click();

  // The second zone's box, in world pixels, from its own style.
  const zone = page.locator("section").filter({
    has: page.getByTestId(/^zone-/),
  });
  const second = zone.nth(1);
  const box = () =>
    second.evaluate((el) =>
      ["left", "top", "width", "height"].map((side) =>
        parseFloat((el as HTMLElement).style.getPropertyValue(side)),
      ),
    );
  const [left0, top0, width0, height0] = await box();

  await page.getByTestId("zones-toggle").focus();
  await page.keyboard.press("Enter");
  const option = page.getByTestId("zones-option").nth(1);
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(option).toHaveAttribute("aria-pressed", "true");

  // One step right, then one taller, with the arrow keys.
  await page.getByTestId("zones-move-left").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await box())[0]).toBeGreaterThan(left0!);
  await page.getByTestId("zones-size-left").focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await box())[3]).toBeGreaterThan(height0!);
  const arranged = await box();
  expect(arranged[1]).toBe(top0);
  expect(arranged[2]).toBe(width0);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("zones-panel")).toHaveCount(0);
  await expect(page.getByTestId("zones-toggle")).toBeFocused();

  // Kept by the server.
  await page.reload();
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect.poll(box).toEqual(arranged);

  await context.close();
});

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await page.getByTestId("roster-item").first().waitFor();
}

// Whether the layer with this test id is what a click would hit where it
// overlaps the canvas zoom control: "above", "beneath", or "apart" when the
// two do not overlap at all (the dropdown's place depends on the header).
async function topmostOverControl(page: Page, testId: string) {
  return page.evaluate((testId) => {
    const control = document.querySelector("[data-canvas-control]");
    const layer = document.querySelector(`[data-testid="${testId}"]`);
    if (!control || !layer) throw new Error(`missing control or ${testId}`);
    const a = control.getBoundingClientRect();
    const b = layer.getBoundingClientRect();
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    if (left >= right || top >= bottom) return "apart";
    const hit = document.elementFromPoint(
      (left + right) / 2,
      (top + bottom) / 2,
    );
    return layer.contains(hit) ? "above" : "beneath";
  }, testId);
}
