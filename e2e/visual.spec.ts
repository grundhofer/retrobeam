// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { newContext } from "./helpers.js";
import { join } from "./visual-helpers.js";

// The before/after picture report for UI changes (.github/workflows/visual.yml).
// Every view at a phone and a desktop width, light and dark: the base commit
// writes the baseline, the head commit compares against it. It asserts nothing
// about behaviour — the other specs do that — only that the pixels hold still,
// so everything here is about taking the same picture twice.
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];
const SCHEMES = ["light", "dark"] as const;
// Any instant will do, as long as it is the same one on every run.
const FIXED_NOW = new Date("2026-09-01T10:00:00Z");

// Reduced motion skips the wheel and the confetti, which would otherwise be
// mid-flight in a picture that has to come out the same every time.
async function visualContext(browser: Browser): Promise<BrowserContext> {
  const context = await newContext(browser, { reducedMotion: "reduce" });
  await context.clock.setFixedTime(FIXED_NOW);
  return context;
}

// Four soft assertions per view, so one diff does not hide the other three.
async function shoot(page: Page, view: string): Promise<void> {
  for (const viewport of VIEWPORTS) {
    for (const colorScheme of SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect
        .soft(page)
        .toHaveScreenshot(`${view}-${viewport.width}-${colorScheme}.png`, {
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          // The default per-pixel tolerance (0.2) lets a step along the
          // palette through — zinc-500 to zinc-600 does not register — and
          // a step along the palette is exactly what this report is for.
          // Zero is too strict the other way: the native <select>'s rounded
          // corners rasterize ±1 per channel from one run to the next.
          threshold: 0.02,
          // Everything that differs per board or per run: the board id lives
          // in the invite link, its QR code and the facilitator link, and the
          // retention date is counted from the server's clock, which the
          // fixed browser clock does not reach.
          mask: [
            page.getByTestId("share-link-input"),
            page.getByTestId("qr-code"),
            page.getByTestId("admin-link-input"),
            page.getByTestId("results-retention"),
          ],
        });
    }
  }
}

for (const [view, path] of [
  ["landing", "/"],
  ["new-board", "/new"],
  ["impressum", "/impressum"],
  ["datenschutz", "/datenschutz"],
  ["not-found", "/does-not-exist"],
] as const) {
  test(`static page: ${view}`, async ({ browser }) => {
    const context = await visualContext(browser);
    const page = await context.newPage();
    await page.goto(path);
    await expect(page.locator("[data-static-fallback]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shoot(page, view);
    await context.close();
  });
}

// One board walked through every phase, pictured from the facilitator's
// screen. A member is there so the roster, the private write phase and the
// vote meter have someone else to show.
test("board through every phase", async ({ browser }) => {
  test.setTimeout(120_000);
  const annaContext = await visualContext(browser);
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 50 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  await join(anna, "Anna");

  const benContext = await visualContext(browser);
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Ben");
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);
  await shoot(anna, "board-lobby");

  await step(anna, ben, /write|schreiben/i);
  // Cards are ordered per author with ties broken by their random id, so two
  // authors sharing a column would swap places from run to run once revealed.
  // Each author keeps to their own columns.
  for (const [page, column, text] of [
    [anna, 0, "Deploys are slow on Fridays"],
    [anna, 1, "Pairing on the parser worked well"],
    [ben, 2, "Flaky pipeline in the integration stage"],
    [ben, 2, "Keep the short stand-ups"],
  ] as const) {
    const composer = page
      .getByPlaceholder(/write a note|notiz schreiben/i)
      .nth(column);
    await composer.fill(text);
    await composer.press("Enter");
    await expect(page.getByText(text)).toBeVisible();
    // A focused composer is a ghost card on the other screen.
    await composer.blur();
  }
  // Ben's two cards reach Anna only as a count.
  await expect(anna.getByTestId("team-cards")).toContainText("2");
  await expect(anna.getByTestId("ghost-card")).toHaveCount(0);
  await shoot(anna, "board-write");

  await step(anna, ben, /present|vorstellen/i);
  await shoot(anna, "board-present");

  await step(anna, ben, /vote|abstimmen/i);
  // Unequal totals (4 and 2): a tie would be ranked by id, and the crowns
  // would swap from run to run just like the cards.
  for (const [page, text, dots] of [
    [anna, "Deploys are slow on Fridays", 3],
    [ben, "Flaky pipeline in the integration stage", 2],
    [ben, "Deploys are slow on Fridays", 1],
  ] as const) {
    const target = page.getByTestId("vote-target").filter({ hasText: text });
    for (let i = 0; i < dots; i++) {
      await target.getByTestId("vote-plus").click();
    }
    await expect(target.getByTestId("vote-count")).toHaveText(String(dots));
  }
  await expect(anna.getByTestId("vote-meter")).toContainText("2 / 2");
  await shoot(anna, "board-vote");

  await step(anna, ben, /discuss|diskutieren/i);
  await expect(anna.getByTestId("crown").first()).toBeVisible();
  await anna.getByTestId("action-input").fill("Split the integration stage");
  await anna.getByTestId("action-input").press("Enter");
  await expect(ben.getByTestId("action-item")).toHaveCount(1);
  await anna.getByTestId("action-input").blur();
  await shoot(anna, "board-discuss");

  await step(anna, ben, /close|abschluss/i);
  await shoot(anna, "board-close");

  await anna.getByTestId("phase-next").click();
  await anna.getByTestId("phase-done-confirm").click();
  await expect(anna.getByTestId("results-header")).toBeVisible();
  await expect(ben.getByTestId("results-header")).toBeVisible();
  await shoot(anna, "board-results");

  await Promise.all([annaContext.close(), benContext.close()]);
});

// One phase forward, and wait until BOTH screens show it (as in mobile.spec).
async function step(anna: Page, ben: Page, phase: RegExp): Promise<void> {
  await anna.getByTestId("phase-next").click();
  await expect(anna.getByTestId("phase-compact")).toContainText(phase);
  await expect(ben.getByTestId("phase-compact")).toContainText(phase);
}
