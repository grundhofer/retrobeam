// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers";

// The steps carry their names from 1024 px (owner, 2026-11-07), against
// sebaro's long form from five steps (D131), which sb-fit.js applies again on
// every resize and theme change. Under 1024 px the long form stands, and its
// line names the step under the step itself.
test("the step names hold through a resize and a theme change", async ({
  browser,
}) => {
  const context = await newContext(browser, {
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 57 retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await page.getByTestId("phase-next").click();

  const steps = page.locator(".sb-progress__steps");
  const line = page.getByTestId("phase-compact");
  const word = steps.locator(".sb-progress__word").nth(1);
  await expect(steps).toHaveAttribute("data-sb-long", "");
  await expect(line).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(word).toBeVisible();
  await expect(steps).not.toHaveAttribute("data-sb-long");
  await expect(line).toBeHidden();

  // a resize at the same side and a theme change run sb-fit.js again
  await page.setViewportSize({ width: 1200, height: 900 });
  await page
    .getByRole("button", { name: /light or dark|hell oder dunkel/i })
    .click();
  await page.waitForTimeout(300);
  await expect(word).toBeVisible();
  await expect(steps).not.toHaveAttribute("data-sb-long");

  // under 1024 px the line stands under the current step (the second of
  // seven: from that step on, start-aligned)
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(line).toBeVisible();
  const stepBox = (await steps
    .locator(".sb-progress__step")
    .nth(1)
    .boundingBox())!;
  const textBox = (await line.locator("span > span").boundingBox())!;
  expect(Math.abs(textBox.x - stepBox.x)).toBeLessThan(2);
  await context.close();
});
