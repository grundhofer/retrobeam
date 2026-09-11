// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// The landing page has one job: get a visitor to the create form. One hero,
// exactly one call to action, and the form that already works at /new.
test("the landing page invites to try and leads to the create form", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByTestId("landing-hero")).toBeVisible();
  await expect(page.getByTestId("landing-cta")).toHaveCount(1);
  await page.getByTestId("landing-cta").click();

  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole("textbox")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /create board|board erstellen/i }),
  ).toBeVisible();

  await context.close();
});

// Native <details>: the answers are in the DOM for search and screen readers,
// but only unfold when asked.
test("FAQ answers open on demand", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  const faq = page.getByTestId("landing-faq");
  const items = faq.locator("details");
  expect(await items.count()).toBeGreaterThanOrEqual(10);

  await faq.locator("summary").first().click();
  await expect(items.first()).toHaveAttribute("open");

  await context.close();
});

test("the non-commercial notice and the legal pages are reachable in both languages", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByTestId("landing-notice")).toBeVisible();

  await page
    .getByTestId("legal-footer")
    .getByRole("link", { name: /datenschutz|privacy/i })
    .click();
  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Datenschutzerklärung|Privacy notice/,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("operator-block")).toBeVisible();

  await page.goto("/impressum");
  await expect(
    page.getByRole("heading", { level: 1, name: /Impressum|Imprint/ }),
  ).toBeVisible();

  // The toggle flips both the visible text and <html lang>, whichever
  // language the browser started in.
  const before = await page.locator("html").getAttribute("lang");
  expect(before).toMatch(/^(de|en)$/);
  const after = before === "de" ? "en" : "de";
  await page
    .getByRole("button", { name: /Auf Deutsch umschalten|Switch to English/ })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", after);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: after === "de" ? /Impressum/ : /Imprint/,
    }),
  ).toBeVisible();

  await context.close();
});

// The privacy notice argues under §25 TDDDG that merely reading the landing
// page stores nothing on the visitor's device. Opening a FAQ item is the one
// interaction the page offers; the language toggle is deliberately left alone
// here because that choice IS allowed to persist.
test("the landing page writes nothing to localStorage", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  const faq = page.getByTestId("landing-faq");
  await faq.locator("summary").first().click();
  await expect(faq.locator("details").first()).toHaveAttribute("open");

  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("retrobeam.")),
  );
  expect(keys).toEqual([]);

  await context.close();
});
