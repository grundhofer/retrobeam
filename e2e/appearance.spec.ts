// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// sebaro's display choices, live from stage 6b (spec/03 §6.6, spec/09 §6):
// „Hell oder Dunkel“ as the website header's button and, on the board (round
// 7), as a choice in the head's „Mehr“ and in the settings view; „Farbton“ in
// „Mehr“ and the settings view, „Bewegung immer reduzieren“ in the settings
// view. Each applies at once, is kept in the browser (sb-theme, sb-tone,
// sb-motion) and comes back after a reload; going back to the standard
// removes its key.

const stored = (page: Page, key: string) =>
  page.evaluate((k) => localStorage.getItem(k), key);
const rootAttr = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.getAttribute(n), name);

const settings = async (page: Page) => {
  await page.getByTestId("board-menu").click();
  await page.getByTestId("menu-settings").click();
};
// After a reload the board asks to join again, or is back at once.
const rejoin = async (page: Page) => {
  const join = page.getByRole("button", { name: /^(join|beitreten)$/i });
  await expect(join.or(page.getByTestId("tone-choice"))).toBeVisible();
  if (await join.isVisible()) await join.click();
};

async function board(page: Page): Promise<string> {
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 60 retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
  return page.url();
}

test("„Hell oder Dunkel“: one press stores the other mode, two return to the system", async ({
  browser,
}) => {
  const context = await newContext(browser, { colorScheme: "light" });
  const page = await context.newPage();
  await page.goto("/");
  const button = page.getByTestId("theme-button");
  await expect(button).toBeVisible();
  // Nothing is announced on load.
  await expect(page.locator("[data-sb-theme-status]")).toBeEmpty();

  await button.click();
  await expect.poll(() => rootAttr(page, "data-theme")).toBe("dark");
  expect(await stored(page, "sb-theme")).toBe("dark");
  await expect(page.locator("[data-sb-theme-status]")).not.toBeEmpty();
  await page.reload();
  await expect.poll(() => rootAttr(page, "data-theme")).toBe("dark");

  await page.getByTestId("theme-button").click();
  await expect.poll(() => rootAttr(page, "data-theme")).toBe(null);
  expect(await stored(page, "sb-theme")).toBe(null);
  await context.close();
});

test("„Farbton“ in the settings view: warm is kept, cool removes the key", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await board(page);
  await settings(page);
  await expect(page.getByTestId("tone-choice")).toBeVisible();
  await expect(page.getByTestId("tone-cool")).toBeChecked();

  await page.getByTestId("tone-warm").check();
  await expect.poll(() => rootAttr(page, "data-sb-tone")).toBe("warm");
  expect(await stored(page, "sb-tone")).toBe("warm");
  await page.reload();
  await expect.poll(() => rootAttr(page, "data-sb-tone")).toBe("warm");
  await rejoin(page);
  await expect(page.getByTestId("tone-warm")).toBeChecked();

  await page.getByTestId("tone-cool").check();
  await expect.poll(() => rootAttr(page, "data-sb-tone")).toBe(null);
  expect(await stored(page, "sb-tone")).toBe(null);
  await context.close();
});

test("„Bewegung immer reduzieren“ stills the wheel as the system setting does", async ({
  browser,
}) => {
  const context = await newContext(browser, { reducedMotion: "no-preference" });
  const page = await context.newPage();
  await board(page);
  await settings(page);
  const toggle = page.getByTestId("motion-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => rootAttr(page, "data-sb-motion")).toBe("reduce");
  expect(await stored(page, "sb-motion")).toBe("reduce");

  // Back on the board, two phases on, the wheel names the person at once.
  await page.getByTestId("settings-back").click();
  await page.getByTestId("phase-next").click();
  await page.getByTestId("phase-next").click();
  await page.getByTestId("spin-button").click();
  await expect(page.getByTestId("wheel-winner")).toBeVisible();
  await expect(page.getByTestId("wheel")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await settings(page);
  await page.getByTestId("motion-toggle").click();
  await expect.poll(() => rootAttr(page, "data-sb-motion")).toBe(null);
  expect(await stored(page, "sb-motion")).toBe(null);
  await context.close();
});

// Round 7 (D143 (7)): a web app's head has no theme button. On the board
// „Hell oder Dunkel“ and „Farbton“ are submenus of „Mehr“, and the settings
// view shows the same stored choice.
test("on the board „Mehr“ chooses „Hell oder Dunkel“ and „Farbton“, the settings view follows", async ({
  browser,
}) => {
  const context = await newContext(browser, { colorScheme: "light" });
  const page = await context.newPage();
  await board(page);
  await expect(page.locator("[data-sb-web-app-head]")).toBeVisible();
  await expect(page.getByTestId("theme-button")).toHaveCount(0);

  await page.getByTestId("board-menu").click();
  await page.getByTestId("menu-theme").click();
  await page.getByTestId("menu-theme-dark").click();
  await expect.poll(() => rootAttr(page, "data-theme")).toBe("dark");
  expect(await stored(page, "sb-theme")).toBe("dark");

  await page.getByTestId("board-menu").click();
  await page.getByTestId("menu-tone").click();
  await page.getByTestId("menu-tone-warm").click();
  await expect.poll(() => rootAttr(page, "data-sb-tone")).toBe("warm");
  expect(await stored(page, "sb-tone")).toBe("warm");

  await settings(page);
  await expect(page.getByTestId("theme-dark")).toBeChecked();
  await expect(page.getByTestId("tone-warm")).toBeChecked();
  // and back from the settings view: the menu shows it too
  await page.getByTestId("theme-system").check();
  await expect.poll(() => rootAttr(page, "data-theme")).toBe(null);
  expect(await stored(page, "sb-theme")).toBe(null);
  await page.getByTestId("tone-cool").check();
  await expect.poll(() => rootAttr(page, "data-sb-tone")).toBe(null);
  await page.getByTestId("board-menu").click();
  await page.getByTestId("menu-theme").click();
  await expect(page.getByTestId("menu-theme-system")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await context.close();
});
