// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// "Zum Inhalt" (WCAG 2.4.1): the skip link is the first tab stop of a screen,
// it shows itself only once focused, and Enter puts the focus on the screen's
// <main> — so the next Tab starts inside it, past the header. The address bar
// keeps no #inhalt (see SkipLink.tsx for why that matters on a board).
// `reach` is the keystrokes that bring the focus to it from where the screen
// leaves it.
async function skipToMain(page: Page, reach: string[]) {
  const skip = page.getByRole("link", {
    name: /^(skip to content|zum inhalt)$/i,
  });
  const url = page.url();

  expect((await skip.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
  for (const key of reach) await page.keyboard.press(key);
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  expect((await skip.boundingBox())?.width ?? 0).toBeGreaterThan(1);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  expect(page.url()).toBe(url);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("main").locator(":focus")).toHaveCount(1);
}

test("the landing page's first Tab skips to its content", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("landing-hero")).toBeVisible();

  await skipToMain(page, ["Tab"]);

  await context.close();
});

// The board is entered through the name form, whose field takes the focus on
// load; the room after it is where the link earns its keep, past a header of
// stepper, avatars, invite, menu and language switch. Joining removes the
// focused button with the form, and where the next Tab starts then is up to
// each browser. So the test puts the focus on the room's first control itself
// and shows the link as the stop before it, one Shift+Tab back; the landing
// test above walks the Tab from the top of a freshly loaded page.
test("a board's first tab stop skips to the board", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 51 retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
  await page.getByTestId("phase-next").focus();

  await skipToMain(page, ["Shift+Tab"]);

  await context.close();
});

// The link sits above the router, outside a legal page's own language
// (LegalPage.tsx), and follows <html lang>: /privacy says "Skip to content"
// to a reader whose stored UI language is German, /datenschutz the reverse.
test("on a legal page the skip link speaks the page's language", async ({
  browser,
}) => {
  const context = await newContext(browser, { locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/privacy");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toHaveAttribute("lang", "en");

  await page.goto("/datenschutz");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(
    page.getByRole("link", { name: "Zum Inhalt", exact: true }),
  ).toHaveAttribute("lang", "de");
  await skipToMain(page, ["Tab"]);

  await context.close();
});
