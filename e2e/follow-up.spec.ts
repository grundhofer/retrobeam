// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// The follow-up retro: finishing a board and preparing the next one carries
// the open Action Items over — and only those, as text — so the next retro
// opens on what the team promised last time.
test("a follow-up retro opens on last time's open Action Items", async ({
  browser,
}) => {
  const context = await newContext(browser, { reducedMotion: "reduce" });
  const anna = await context.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 47");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const sourceUrl = anna.url();
  await join(anna, "Anna");

  // write → present → vote → discuss
  for (let step = 0; step < 4; step++) {
    await anna.getByTestId("phase-next").click();
  }
  await expect(anna.getByTestId("action-input")).toBeVisible();
  await addAction(anna, "Quarantine the flaky tests");
  await addAction(anna, "Book the retro room");
  await anna
    .getByTestId("action-item")
    .filter({ hasText: "Book the retro room" })
    .getByRole("checkbox")
    .check();

  // close → done (the last step asks first)
  await anna.getByTestId("phase-next").click();
  await anna.getByTestId("phase-next").click();
  await anna.getByTestId("phase-done-confirm").click();

  const followUp = anna.getByTestId("results-follow-up");
  await expect(followUp).toBeVisible();
  await expect(anna.getByTestId("results-follow-up-hint")).toContainText(
    /the open action item and|das offene Action Item und/,
  );
  await followUp.click();

  // A new board, where this browser is the facilitator again.
  await expect(anna).not.toHaveURL(sourceUrl);
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(anna, "Anna");
  await expect(anna.getByTestId("phase-next")).toBeVisible();
  await expect(anna.getByRole("heading", { level: 1 })).toContainText(
    /Follow-up: Sprint 47|Folge-Retro: Sprint 47/,
  );

  // The lobby opens on what was still open — the done item stayed behind.
  const carried = anna.getByTestId("carried-action");
  await expect(carried).toHaveCount(1);
  await expect(carried).toHaveText("Quarantine the flaky tests");
  await expect(anna.getByTestId("carried-actions")).toContainText("Sprint 47");

  await context.close();
});

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
}

async function addAction(page: Page, text: string): Promise<void> {
  await page.getByTestId("action-input").fill(text);
  await page.getByRole("button", { name: /^(add|hinzufügen)$/i }).click();
  await expect(
    page.getByTestId("action-item").filter({ hasText: text }),
  ).toBeVisible();
}
