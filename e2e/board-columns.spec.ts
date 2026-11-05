// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// The board's columns in sebaro (plan stage 5g): each column's „Mehr“ with
// its deletion asking first, and on a phone the swipe layout with its
// position bar — in every engine, as the component tests do not run Firefox.

async function board(page: Page): Promise<void> {
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 56 retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
  await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("phase-compact")).toContainText(
    /write|schreiben/i,
  );
}

test("a column is deleted only after asking", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await board(page);
  const columns = page.getByTestId("board-column");
  await expect(columns).toHaveCount(3);
  const first = columns.first();

  await first.getByTestId("column-menu").click();
  await first.getByTestId("column-delete").click();
  const dialog = page.getByTestId("column-delete-dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(columns).toHaveCount(3);

  await first.getByTestId("column-menu").click();
  await first.getByTestId("column-delete").click();
  await page.getByTestId("column-delete-confirm").click();
  await expect(columns).toHaveCount(2);
  await context.close();
});

test("on a phone the columns are swiped, with a bar that says where you are", async ({
  browser,
}) => {
  const context = await newContext(browser, {
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await board(page);
  const position = page.locator(".sb-board__position");
  await expect(position).toBeVisible();
  await expect(position).toHaveText(/(Column|Spalte) 1 (of|von) 3/);
  await page
    .getByRole("button", { name: /^(next column|nächste spalte)$/i })
    .click();
  await expect(position).toHaveText(/(Column|Spalte) 2 (of|von) 3/);
  // The page itself never scrolls sideways; the columns do, inside the board.
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(sideways).toBe(false);
  await context.close();
});
