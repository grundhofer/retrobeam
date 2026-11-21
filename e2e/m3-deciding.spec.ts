// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// M3 acceptance: blind voting (nobody sees others' votes), the anonymous
// meter, top-N crowns after the reveal, the synced discussion focus, action
// items, re-blinding on rewind — and the result that survives finishing.
test("blind voting, crowns, discussion queue and action items", async ({
  browser,
}) => {
  const annaContext = await newContext(browser, { reducedMotion: "reduce" });
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 44 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  await join(anna, "Anna");

  const benContext = await newContext(browser, { reducedMotion: "reduce" });
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Ben");

  // Write two notes, reveal them.
  await anna.getByTestId("phase-next").click();
  const annaComposer = anna
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await annaComposer.fill("Slow deploys");
  await annaComposer.press("Enter");
  const benComposer = ben
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await benComposer.fill("Great teamwork");
  await benComposer.press("Enter");
  await anna.getByTestId("phase-next").click(); // present
  await anna.getByTestId("phase-next").click(); // group

  // Into the vote phase: vote controls appear, budget dots show.
  await anna.getByTestId("phase-next").click();
  // What is left is a sentence, never dots alone (sebaro RB-2).
  await expect(anna.getByTestId("votes-remaining")).toContainText(
    /(\d+ of \d+\svotes left|Noch \d+ von \d+\sStimmen)/,
  );
  await expect(anna.getByTestId("vote-control").first()).toBeVisible();

  // Anna spends her 3 votes on "Slow deploys".
  const annaPlus = anna
    .getByTestId("vote-target")
    .filter({ hasText: "Slow deploys" })
    .getByTestId("vote-plus");
  await annaPlus.click();
  await annaPlus.click();
  await annaPlus.click();
  // Budget spent: sebaro keeps the key pressable (aria-disabled) so the focus
  // stays on it.
  await expect(annaPlus).toHaveAttribute("aria-disabled", "true");

  // Blindness: Ben sees no counts from Anna — his own counts are all 0 and
  // no tallies/crowns exist anywhere.
  // (the anonymous „x of y done voting“ count left the strip on 2026-11-08:
  // the round's status row above the board says who is done)
  await expect(ben.getByTestId("votes-remaining")).toContainText(/3\D+3/);
  await expect(ben.getByTestId("crown")).toHaveCount(0);
  await expect(ben.getByTestId("tally")).toHaveCount(0);
  // The names go with them: last round's attribution must not sit on the cards
  // while the next round's dots are being cast.
  await expect(ben.getByTestId("voter-Anna")).toHaveCount(0);
  const bensCounts = await ben.getByTestId("vote-count").allInnerTexts();
  expect(bensCounts.every((count) => count.trim() === "0")).toBe(true);

  // Ben votes 2 on teamwork, 1 on deploys → his budget is spent.
  const benTeamworkPlus = ben
    .getByTestId("vote-target")
    .filter({ hasText: "Great teamwork" })
    .getByTestId("vote-plus");
  await benTeamworkPlus.click();
  await benTeamworkPlus.click();
  const benDeploysPlus = ben
    .getByTestId("vote-target")
    .filter({ hasText: "Slow deploys" })
    .getByTestId("vote-plus");
  await benDeploysPlus.click();
  await expect(ben.getByTestId("votes-remaining")).toContainText(
    /all 3|alle 3/i,
  );

  // Voting is blind, and the bar says so BEFORE anyone spends a dot — that
  // disclosure is what makes naming the voters afterwards a consented setting
  // rather than a surprise.
  await expect(ben.getByTestId("vote-privacy")).toBeVisible();

  // Reveal: crowns + tallies on both screens, "Slow deploys" ranks first (4 votes).
  await anna.getByTestId("phase-next").click(); // discuss
  await expect(anna.getByTestId("crown").first()).toBeVisible();
  await expect(ben.getByTestId("crown").first()).toBeVisible();
  await expect(ben.getByTestId("discuss-chip-1")).toContainText("Slow deploys");
  await expect(ben.getByTestId("discuss-chip-1")).toContainText(
    /4\s(votes|Stimmen)/,
  );

  // The discussion phase is where the board is narrowest — it pays 320px for
  // the action list. Every column must still be on screen: they used to be
  // clipped inside a scroll container with no visible scrollbar, which read as
  // "the participant panel is covering the board". toBeVisible() would NOT
  // catch that (it ignores overflow clipping), so assert the viewport.
  const columnCount = await anna.getByTestId("board-column").count();
  expect(columnCount).toBe(3);
  for (let i = 0; i < columnCount; i++) {
    await expect(anna.getByTestId("board-column").nth(i)).toBeInViewport({
      ratio: 0.9,
    });
  }

  // After the reveal you can see what YOU voted for — the half of the request
  // that needs no server work, and which used to vanish with the +/- control.
  await expect(
    anna
      .getByTestId("vote-target")
      .filter({ hasText: "Slow deploys" })
      .getByTestId("your-vote"),
  ).toBeVisible();
  // …and who voted for what: new boards ship with names on, so Ben can see
  // that Anna backed the card the room is about to discuss.
  await expect(
    ben
      .getByTestId("vote-target")
      .filter({ hasText: "Slow deploys" })
      .getByTestId("voter-Anna"),
  ).toBeVisible();

  // Synced focus: Anna clicks the first queue chip, Ben's board dims the rest.
  await anna.getByTestId("discuss-chip-1").click();
  // The chip in discussion is marked by its state, not its colour.
  await expect(ben.getByTestId("discuss-chip-1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Focus mode: with a card focused, the room sees ONLY that card, on a
  // stage instead of the columns, as when presenting (owner, 2026-11-07) —
  // the moderator shares a screen, so the switch hides the rest rather than
  // dimming it, on every participant's screen and not just the facilitator's.
  await expect(ben.getByTestId("note-card")).toHaveCount(2);
  await anna.getByTestId("focus-mode-toggle").click();
  const stage = ben.getByTestId("discuss-stage");
  await expect(stage.getByTestId("note-card")).toHaveCount(1);
  await expect(stage.getByTestId("note-card")).toContainText("Slow deploys");
  await expect(ben.getByTestId("column-strip")).toBeHidden();
  // Taking the focus off goes back to the top topics on the stage.
  await anna
    .getByTestId("discuss-stage")
    .getByTestId("discuss-focus-card")
    .click();
  await expect(stage.getByTestId("vote-target")).not.toHaveCount(0);
  await anna.getByTestId("discuss-chip-1").click();
  await expect(stage.getByTestId("note-card")).toHaveCount(1);
  // And turning it back off restores the board instantly — nothing was
  // un-sent, so nothing has to be re-fetched.
  await anna.getByTestId("focus-mode-toggle").click();
  await expect(stage).toHaveCount(0);
  await expect(ben.getByTestId("column-strip")).toBeVisible();
  await expect(ben.getByTestId("note-card")).toHaveCount(2);

  // Action item with an owner, live on both screens; Ben checks it off.
  await anna.getByTestId("action-input").fill("Automate the deploy pipeline");
  await anna.getByTestId("action-owner").selectOption({ label: "Ben" });
  await anna.getByRole("button", { name: /^(add|hinzufügen)$/i }).click();
  const bensAction = ben
    .getByTestId("action-item")
    .filter({ hasText: "Automate the deploy" });
  await expect(bensAction).toBeVisible();
  await expect(bensAction).toContainText("Ben");
  await bensAction.getByRole("checkbox").check();
  // Done on Anna's screen too: checked, in sebaro's done form.
  const annasAction = anna
    .getByTestId("action-item")
    .filter({ hasText: "Automate the deploy" });
  await expect(annasAction.getByRole("checkbox")).toBeChecked();
  await expect(annasAction).toHaveClass(/sb-list-row--done/);

  // Rewind to vote: blind again on every screen.
  await anna.getByTestId("phase-back").click();
  await expect(ben.getByTestId("crown")).toHaveCount(0);
  await expect(ben.getByTestId("tally")).toHaveCount(0);

  // Back through the reveal and the close, and finish: the facilitator's
  // primary action, like every other step (owner, 2026-11-07).
  await anna.getByTestId("phase-next").click(); // discuss, re-revealed
  await expect(ben.getByTestId("crown").first()).toBeVisible();
  await anna.getByTestId("phase-next").click(); // close
  await expect(anna.getByTestId("phase-next")).toContainText(/finish|beenden/i);
  await expect(ben.getByTestId("results-header")).toHaveCount(0);
  await anna.getByTestId("phase-next").click();
  // The key is gone with the phase; focus lands on the result rather than
  // falling back to the top of the document.
  await expect(anna.getByTestId("results-title")).toBeFocused();

  // The results page leads with the outcome: the crowned topic in first place
  // with its tally, and the action item. On the member's screen — and again
  // after a reload, which is drawn from the snapshot, not the live stream.
  for (const reload of [false, true]) {
    if (reload) {
      await ben.reload();
      await ben.getByRole("button", { name: /^(join|beitreten)$/i }).click();
    }
    await expect(ben.getByTestId("results-header")).toBeVisible();
    const first = ben.getByTestId("top-topic").first();
    await expect(first).toContainText("Slow deploys");
    await expect(first.getByTestId("crown")).toContainText("1");
    await expect(first.getByTestId("tally")).toContainText("4");
    await expect(first.getByTestId("voter-Anna")).toBeVisible();
    await expect(
      ben.getByTestId("action-item").filter({ hasText: "Automate the deploy" }),
    ).toBeVisible();
    await expect(ben.getByTestId("results-export-pdf")).toBeVisible();
    // Two people finished it — however many opened it since.
    await expect(
      ben
        .getByTestId("results-recap")
        .locator(".sb-stat")
        .filter({ hasText: /people|Personen/i })
        .locator(".sb-stat__value"),
    ).toHaveText("2");
  }
  // The whole board is one click away, read-only.
  await ben.getByTestId("all-cards-toggle").click();
  await expect(
    ben.getByTestId("board-column").getByTestId("note-card"),
  ).toHaveCount(2);
  await expect(
    ben.getByPlaceholder(/write a note|notiz schreiben/i),
  ).toHaveCount(0);

  await annaContext.close();
  await benContext.close();
});

// The line in the action zone fits where you stand, and a full hand of votes
// marks you ready on every screen (owner, 2026-11-20).
test("a full hand of votes marks you ready, and the line says so", async ({
  browser,
}) => {
  const annaContext = await newContext(browser, { reducedMotion: "reduce" });
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 48 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  await join(anna, "Anna");
  const benContext = await newContext(browser, { reducedMotion: "reduce" });
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Ben");

  await anna.getByTestId("phase-next").click(); // write
  const composer = ben
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await composer.fill("Slow deploys");
  await composer.press("Enter");
  await anna.getByTestId("phase-next").click(); // present

  // Ben is put on stage: his line says he is presenting, not „when picked“.
  await anna.getByTestId("pick-Ben").click();
  await expect(ben.getByTestId("phase-guide")).toHaveText(
    /you're presenting|du stellst gerade vor/i,
  );

  await anna.getByTestId("phase-next").click(); // group
  await anna.getByTestId("phase-next").click(); // vote
  const benReady = ben.getByTestId("ready-toggle");
  await expect(benReady).toHaveAttribute("aria-pressed", "false");
  const plus = ben
    .getByTestId("vote-target")
    .filter({ hasText: "Slow deploys" })
    .getByTestId("vote-plus");
  await plus.click();
  await plus.click();
  await expect(benReady).toHaveAttribute("aria-pressed", "false");
  await plus.click();
  // The third of three: ready, and told the hand is full.
  await expect(benReady).toHaveAttribute("aria-pressed", "true");
  await expect(ben.getByTestId("phase-guide")).toHaveText(
    /all your votes are given|alle stimmen vergeben/i,
  );
  await expect(anna.getByTestId("ready-count")).toContainText(/1 (of|von) 2/);

  // Taking one back: not ready any more, and the line asks again.
  await ben
    .getByTestId("vote-target")
    .filter({ hasText: "Slow deploys" })
    .getByTestId("vote-minus")
    .click();
  await expect(benReady).toHaveAttribute("aria-pressed", "false");
  await expect(ben.getByTestId("phase-guide")).toHaveText(
    /spend your votes|verteil deine stimmen/i,
  );

  await annaContext.close();
  await benContext.close();
});

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
}
