// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

test("facilitator chooses optional phases before the retro starts", async ({
  browser,
}) => {
  const context = await newContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Short retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Anna");

  const vote = page.getByTestId("phase-plan-vote");
  const close = page.getByTestId("phase-plan-close");
  await expect(vote).toBeChecked();
  await vote.click();
  await expect(vote).not.toBeChecked();
  await expect(close).toBeEnabled();
  await close.click();
  await expect(close).not.toBeChecked();

  // Start, rewind once, and prove that the chosen agenda cannot be changed
  // after the retro has begun.
  await page.getByTestId("phase-next").click();
  await page.getByTestId("phase-back").click();
  await expect(page.getByTestId("phase-plan-vote")).toBeDisabled();

  // The configured sequence is lobby -> write -> present -> discuss -> done.
  await page.getByTestId("phase-next").click();
  await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("phase-next")).toContainText(
    /discuss|diskutieren/i,
  );
  await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("phase-next")).toContainText(/done|fertig/i);
  await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("phase-next")).toHaveCount(0);

  await context.close();
});

// M5 acceptance: the check-in warm-up (icebreaker + shuffle + agreements) and
// the anonymous ROTI closing poll. This flow opts in through the creation API
// so it can focus on the phase itself; the lobby toggle is covered above.
test("check-in icebreaker, agreements, and anonymous ROTI", async ({
  browser,
}) => {
  const annaContext = await newContext(browser, { reducedMotion: "reduce" });
  const created = await annaContext.request.post("/api/boards", {
    data: { name: "Sprint 46 retro", checkin: true, locale: "en" },
  });
  expect(created.ok()).toBe(true);
  const { boardId, adminToken } = (await created.json()) as {
    boardId: string;
    adminToken: string;
  };
  await annaContext.addInitScript(
    (data: { boardId: string; adminToken: string }) => {
      localStorage.setItem(
        `retrobeam.board.${data.boardId}.adminToken`,
        data.adminToken,
      );
    },
    { boardId, adminToken },
  );
  const anna = await annaContext.newPage();
  const boardUrl = `/board/${boardId}`;
  await anna.goto(boardUrl);
  await join(anna, "Anna");

  const benContext = await newContext(browser, { reducedMotion: "reduce" });
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Ben");
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);

  // A third participant — the anonymous ROTI needs three responses before it
  // will reveal an average (see below).
  const caraContext = await newContext(browser, { reducedMotion: "reduce" });
  const cara = await caraContext.newPage();
  await cara.goto(boardUrl);
  await join(cara, "Cara");
  await expect(anna.getByTestId("roster-item")).toHaveCount(3);

  // Anna prepares the whole check-in privately in the lobby. Other members
  // see that the phase is enabled, but not the setup controls or draft.
  await anna.getByTestId("checkin-question-select").selectOption("weather");
  await anna.getByTestId("agreements-edit").click();
  await anna.getByTestId("agreements-input").fill("Cameras on, phones away.");
  await anna.getByRole("button", { name: /^(save|speichern)$/i }).click();
  await expect(ben.getByTestId("checkin-setup")).toHaveCount(0);
  await expect(ben.getByText("Cameras on, phones away.")).toHaveCount(0);

  // First "next" presents the prepared check-in to everyone.
  await anna.getByTestId("phase-next").click();
  await expect(anna.getByTestId("icebreaker-question")).toBeVisible();
  await expect(ben.getByTestId("icebreaker-question")).toBeVisible();
  const question = (
    await ben.getByTestId("icebreaker-question").innerText()
  ).trim();
  await expect(anna.getByTestId("icebreaker-question")).toHaveText(question);
  await expect(ben.getByText("Cameras on, phones away.")).toBeVisible();
  await expect(anna.getByTestId("icebreaker-shuffle")).toHaveCount(0);
  await expect(anna.getByTestId("agreements-edit")).toHaveCount(0);

  // Walk to the close phase (write → present → vote → discuss → close).
  for (let i = 0; i < 5; i++) await anna.getByTestId("phase-next").click();
  await expect(anna.getByTestId("roti-poll")).toBeVisible();
  await expect(ben.getByTestId("roti-poll")).toBeVisible();

  // While the poll is open only the count moves. A running average would be
  // differenceable: two consecutive means and their counts recover the marginal
  // respondent's exact score.
  await anna.getByTestId("roti-5").click();
  await ben.getByTestId("roti-3").click();
  await expect(ben.getByTestId("roti-pending")).toBeVisible();
  await expect(ben.getByTestId("roti-result")).toHaveCount(0);

  await cara.getByTestId("roti-4").click();
  await expect(ben.getByTestId("roti-pending")).toContainText("3");
  await expect(ben.getByTestId("roti-result")).toHaveCount(0);

  // Anna's own selection is highlighted for her; Ben can't tell it was a 5.
  await expect(anna.getByTestId("roti-5")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(ben.getByTestId("roti-5")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Closing the retro publishes the result once — (5 + 3 + 4) / 3 = 4.
  await anna.getByTestId("phase-next").click();
  await expect(anna.getByTestId("roti-result")).toContainText("4");
  await expect(ben.getByTestId("roti-result")).toContainText("4");

  await annaContext.close();
  await benContext.close();
  await caraContext.close();
});

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
}
