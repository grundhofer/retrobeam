// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// At large text sebaro's sb-fit.js turns the layout's segments into a select
// (D100 (3)). Choosing there has to reach the form, not only the page: the
// board is requested in the layout the select shows (plan §2.4 F38).
test("at 200 % text the layout select creates a canvas board", async ({
  browser,
}) => {
  const context = await newContext(browser, {
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/new");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const layout = page.locator("fieldset.sb-segmented");
  await expect(layout).toHaveAttribute("data-sb-fit", "select");
  await layout.locator("select").selectOption({ index: 1 });
  await expect(layout.locator(".sb-field__help")).toContainText(
    /freeform|freie/i,
  );
  await page.getByRole("textbox").first().fill("Sprint 50 retro");
  const created = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/api/boards"),
  );
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  expect((await created).postDataJSON()).toMatchObject({ layout: "canvas" });
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await context.close();
});
