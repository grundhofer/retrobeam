// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// The menu „Mehr“ (sebaro spec/02 §4.10, its behaviour ported to React) and
// the deletion it leads to (plan stage 5a, ZUG-08): created, then deleted
// with the confirmation dialog — by keyboard alone, in every engine, since
// the component tests do not run in Firefox.
test("the menu works by keyboard, and a board is deleted only after asking", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 54 retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();

  const more = page.getByRole("button", { name: /^(more|mehr)$/i });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByTestId("delete-board")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();

  // „Board löschen …“: Cancel first and focused, so Enter by habit keeps it.
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("delete-board")).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByTestId("delete-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Sprint 54 retro");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();

  await more.click();
  await page.getByTestId("delete-board").click();
  await page.getByTestId("delete-board-confirm").click();
  await expect(page.getByText(/board deleted|board gelöscht/i)).toBeVisible({
    timeout: 15_000,
  });
  await context.close();
});
