// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Locator, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// Plan stage 5a: the board's action zone is sticky at the foot of the view,
// so on a phone it must never sit over the field someone is typing in, and the
// primary action stays on screen. A real on-screen keyboard is out of reach
// for Playwright; it is stood in for by the height it leaves (390 × 420), which
// is what the layout viewport becomes without interactive-widget.
const PHONE = { width: 390, height: 844 };
const WITH_KEYBOARD = { width: 390, height: 420 };

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

async function expectClearOfZone(page: Page, field: Locator) {
  const zone = await box(page.getByTestId("action-zone"));
  const focused = await box(field);
  const height = page.viewportSize()!.height;
  expect(focused.y).toBeGreaterThanOrEqual(0);
  expect(focused.y + focused.height).toBeLessThanOrEqual(zone.y + 0.5);
  expect(zone.y + zone.height).toBeLessThanOrEqual(height + 0.5);
}

test("on a phone the focused field and the primary action stay in view", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "webkit", "the phone case is WebKit's (Safari)");
  const context = await newContext(browser, {
    viewport: PHONE,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Phone retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await page.getByTestId("phase-next").click();

  // The last column's composer, far down the page on a phone.
  const composer = page
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .last();
  await composer.focus();
  await expect(composer).toBeFocused();
  await page.setViewportSize(WITH_KEYBOARD);
  // A phone brings the focused field into view as its keyboard comes up; a
  // resize alone does not, and focus() on a focused element is a no-op, so
  // focus is taken anew, as the browser does it.
  await composer.blur();
  await composer.focus();
  await expect(composer).toBeInViewport();
  await expectClearOfZone(page, composer);
  await expect(page.getByTestId("phase-next")).toBeInViewport();

  await context.close();
});
