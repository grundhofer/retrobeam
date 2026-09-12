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

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await page.getByTestId("roster-item").first().waitFor();
}
