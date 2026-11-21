// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// The group phase (owner, 2026-11-20, after a test retro): between presenting
// and voting, everyone sorts the cards into topics, so the room votes on
// topics rather than on single cards. On for a new board. Here a member
// stacks the facilitator's card onto their own by the card's arrange panel
// (the keyboard's way to do what a drag does), writing waits, and the vote
// counts the stack as one.
test("everyone stacks cards into topics before the vote", async ({
  browser,
}) => {
  const annaContext = await newContext(browser, { reducedMotion: "reduce" });
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 55 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  await anna.getByRole("textbox").fill("Anna");
  await anna.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(anna.getByTestId("phase-plan-group")).toBeChecked();

  const benContext = await newContext(browser, { reducedMotion: "reduce" });
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await ben.getByRole("textbox").fill("Ben");
  await ben.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);

  await anna.getByTestId("phase-next").click(); // write
  for (const [who, text] of [
    [anna, "Flaky CI"],
    [ben, "CI is red again"],
  ] as const) {
    const composer = who.getByPlaceholder(/write a note|notiz schreiben/i);
    await composer.first().fill(text);
    await composer.first().press("Enter");
    await expect(who.getByText(text)).toBeVisible();
  }
  await anna.getByTestId("phase-next").click(); // present
  await anna.getByTestId("phase-next").click(); // group
  await expect(ben.getByTestId("phase-compact")).toContainText(
    /group|gruppieren/i,
  );
  await expect(ben.getByTestId("action-zone")).toContainText(
    /onto each other|aufeinander/i,
  );
  // Sorting, not writing.
  await expect(
    ben.getByPlaceholder(/write a note|notiz schreiben/i),
  ).toHaveCount(0);

  const annasCard = ben
    .getByTestId("note-card")
    .filter({ hasText: "Flaky CI" });
  await annasCard.getByTestId("note-arrange-toggle").click();
  await ben
    .getByTestId("note-stack-option")
    .filter({ hasText: "CI is red again" })
    .click();
  for (const page of [anna, ben]) {
    const stack = page.getByTestId("note-stack");
    await expect(stack).toHaveCount(1);
    await expect(stack).toContainText("Flaky CI");
    await expect(stack).toContainText("CI is red again");
  }

  // The vote: one topic to vote on, and nothing to rearrange any more.
  await anna.getByTestId("phase-next").click();
  await expect(ben.getByTestId("phase-compact")).toContainText(
    /vote|abstimmen/i,
  );
  await expect(ben.getByTestId("vote-plus")).toHaveCount(1);
  await expect(ben.getByTestId("note-arrange-toggle")).toHaveCount(0);

  await benContext.close();
  await annaContext.close();
});
