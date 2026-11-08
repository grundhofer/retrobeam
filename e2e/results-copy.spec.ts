// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers";

// „Formatiert kopieren“ on the results (owner, 2026-11-07): the summary goes
// onto the clipboard as HTML, with the Markdown as its plain text. Only
// Chromium lets a test grant clipboard reading; WebKit and Firefox are
// skipped here, and the HTML itself is covered by the shared unit tests.
test("the results copy the summary as HTML and Markdown", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "clipboard read needs Chromium");
  const context = await newContext(browser, { reducedMotion: "reduce" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 58 <retro>");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await page.getByTestId("phase-next").click();
  const composer = page.locator('[data-testid^="composer-"]').first();
  await composer.fill("Deploys are slow");
  await composer.press("Enter");
  // write → present → vote → discuss → close, then finish
  for (let i = 0; i < 4; i++) await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("phase-next")).toContainText(/finish|beenden/i);
  await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("results-header")).toBeVisible();

  await page.getByTestId("results-copy-rich").click();
  await expect(page.getByTestId("results-copy-status")).toContainText(
    /copied|kopiert/i,
  );
  const clip = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const html = await (await item!.getType("text/html")).text();
    const text = await (await item!.getType("text/plain")).text();
    return { html, text };
  });
  expect(clip.html).toContain("<h1>Sprint 58 &lt;retro&gt;</h1>");
  expect(clip.html).toContain("Summary (top cards &amp; action items)");
  expect(clip.text).toContain("# Sprint 58 <retro>");
  // the confirmation goes again, so a second copy can say so anew
  await expect(page.getByTestId("results-copy-status")).toHaveText("", {
    timeout: 10_000,
  });
  await context.close();
});
