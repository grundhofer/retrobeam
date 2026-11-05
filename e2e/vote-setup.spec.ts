// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// The vote's set-up (plan stage 5c): a dialog the facilitator opens from the
// strip, by keyboard too, in every engine. Its change reaches the room — the
// member's sentence of votes left follows the new budget — and the line on
// whether names go with the result stands for the member before any vote
// (§6.1 b).
test("the facilitator sets up the vote in a dialog, and the room follows", async ({
  browser,
}) => {
  const annaContext = await newContext(browser);
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

  const benContext = await newContext(browser);
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await ben.getByRole("textbox").fill("Ben");
  await ben.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);

  // Lobby → write → present → vote.
  for (let i = 0; i < 3; i++) {
    const before = await anna.getByTestId("phase-compact").textContent();
    await anna.getByTestId("phase-next").click();
    await expect(anna.getByTestId("phase-compact")).not.toHaveText(
      before ?? "",
    );
  }
  await expect(ben.getByTestId("votes-remaining")).toContainText(/3/);
  await expect(ben.getByTestId("vote-privacy")).toBeVisible();

  const setup = anna.getByTestId("vote-settings");
  await setup.focus();
  await anna.keyboard.press("Enter");
  const votes = anna.getByLabel(/^(votes per person|stimmen pro person)$/i);
  await expect(votes).toBeVisible();
  await votes.fill("5");
  await anna.getByTestId("vote-settings-apply").click();
  await expect(votes).toBeHidden();
  await expect(setup).toBeFocused();

  await expect(ben.getByTestId("votes-remaining")).toContainText(/5/);

  await benContext.close();
  await annaContext.close();
});
