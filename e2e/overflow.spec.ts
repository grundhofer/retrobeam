// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// No page may scroll sideways — at a phone width, on a desktop, and at a
// phone width with the text doubled, the way a reader with large text sees it
// (sebaro D100 (5), docs/sebaro-umbau.md §4.2 gate G10). mobile.spec.ts walks
// the board through every phase at 390 px; this checks the views at all three
// sizes. A view that does not pass yet is listed in KNOWN with the stage that
// rebuilds it, and runs as test.fixme until then.
const SIZES = [
  { name: "390", width: 390, height: 844, fontSize: "100%" },
  { name: "1440", width: 1440, height: 900, fontSize: "100%" },
  { name: "360@200%", width: 360, height: 800, fontSize: "200%" },
] as const;

// The website header keeps its links on one row: at 200 % text the "GitHub"
// link and the language toggle push it 88 px past a 360 px screen. The
// header is rebuilt in stage 3a.
const WEBSITE_HEADER =
  "stage 3a: the website header does not wrap at 200 % text";
const KNOWN: Record<string, string> = {
  "landing 360@200%": WEBSITE_HEADER,
  "new-board 360@200%": WEBSITE_HEADER,
  "impressum 360@200%": WEBSITE_HEADER,
  "datenschutz 360@200%": WEBSITE_HEADER,
  "imprint 360@200%": WEBSITE_HEADER,
  "privacy 360@200%": WEBSITE_HEADER,
  "not-found 360@200%": WEBSITE_HEADER,
};

async function sideways(page: Page, fontSize: string): Promise<number> {
  await page.evaluate((size) => {
    document.documentElement.style.fontSize = size;
  }, fontSize);
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "layout check in one engine",
);

for (const [name, path] of [
  ["landing", "/"],
  ["new-board", "/new"],
  ["impressum", "/impressum"],
  ["datenschutz", "/datenschutz"],
  ["imprint", "/imprint"],
  ["privacy", "/privacy"],
  ["not-found", "/does-not-exist"],
] as const) {
  for (const size of SIZES) {
    const id = `${name} ${size.name}`;
    test(`no sideways scroll: ${id}`, async ({ browser }) => {
      test.fixme(id in KNOWN, KNOWN[id]);
      const context = await newContext(browser, {
        viewport: { width: size.width, height: size.height },
      });
      const page = await context.newPage();
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await sideways(page, size.fontSize)).toBeLessThanOrEqual(0);
      await context.close();
    });
  }
}

for (const size of SIZES) {
  const id = `board ${size.name}`;
  test(`no sideways scroll: ${id}`, async ({ browser }) => {
    test.fixme(id in KNOWN, KNOWN[id]);
    const context = await newContext(browser, {
      viewport: { width: size.width, height: size.height },
    });
    const page = await context.newPage();
    await page.goto("/new");
    await page.getByRole("textbox").fill("Sprint 50 retro");
    await page
      .getByRole("button", { name: /create board|board erstellen/i })
      .click();
    await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
    await page.getByRole("textbox").fill("Anna");
    await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
    await expect(page.getByTestId("roster-item").first()).toBeVisible();
    expect(await sideways(page, size.fontSize)).toBeLessThanOrEqual(0);

    await page.getByTestId("phase-next").click();
    await expect(page.getByTestId("phase-compact")).toContainText(
      /write|schreiben/i,
    );
    expect(await sideways(page, size.fontSize)).toBeLessThanOrEqual(0);
    await context.close();
  });
}
