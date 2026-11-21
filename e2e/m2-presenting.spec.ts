// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// M2 acceptance: the wheel picks the same person on every screen, rotates
// without repeats until everyone presented, grouping syncs, handoff works.
test("wheel rotation, presenter focus, grouping and handoff", async ({
  browser,
}) => {
  const annaContext = await newContext(browser, { reducedMotion: "reduce" });
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 43 retro");
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
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);

  // Write phase: each writes a duplicate-ish point.
  await anna.getByTestId("phase-next").click();
  const annaComposer = anna
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await annaComposer.fill("Deploys are slow");
  await annaComposer.press("Enter");
  const benComposer = ben
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await benComposer.fill("Deploys take forever");
  await benComposer.press("Enter");

  // Present phase: the wheel appears.
  await anna.getByTestId("phase-next").click();
  await expect(anna.getByTestId("spin-button")).toBeVisible();
  await expect(ben.getByTestId("spin-button")).toHaveCount(0); // members don't spin

  // The phase alone reveals nothing to a member: Ben still holds only his own
  // card, while Anna, who moderates the round, holds the whole board.
  // The hint is the barrier — it only renders once BEN's client is in the
  // presenting phase, so the negative assertion below cannot pass simply
  // because the phase change has not landed yet.
  await expect(ben.getByTestId("present-scope-hint")).toBeVisible();
  await expect(ben.getByText("Deploys take forever")).toBeVisible();
  await expect(ben.getByText("Deploys are slow")).toHaveCount(0);
  await expect(anna.getByTestId("note-card")).toHaveCount(2);

  // Spin 1: reduced motion skips the animation; the SAME winner shows on
  // both screens (server-drawn, seed-synced).
  await anna.getByTestId("spin-button").click();
  await expect(anna.getByTestId("wheel-winner")).toBeVisible();
  await expect(ben.getByTestId("wheel-winner")).toBeVisible();
  const winnerTextAnna = (
    await anna.getByTestId("wheel-winner").innerText()
  ).trim();
  const winnerTextBen = (
    await ben.getByTestId("wheel-winner").innerText()
  ).trim();
  expect(winnerTextAnna).toBe(winnerTextBen);
  const firstPresenter = winnerTextAnna.includes("Anna") ? "Anna" : "Ben";

  // Presenter banner is synced.
  await expect(anna.getByTestId("presenter-banner")).toContainText(
    firstPresenter,
  );
  await expect(ben.getByTestId("presenter-banner")).toContainText(
    firstPresenter,
  );

  // The room reads a person's cards when the rotation reaches them — the
  // speaker's are lifted out, everybody else's are simply not there yet.
  await anna.getByTestId("wheel-winner").waitFor({ state: "hidden" });
  const presenterNote =
    firstPresenter === "Anna" ? "Deploys are slow" : "Deploys take forever";
  await expect(ben.getByText(presenterNote)).toBeVisible();
  await expect(
    ben.getByTestId("note-card").filter({ hasText: presenterNote }),
  ).toHaveAttribute("data-presenting", "true");
  if (firstPresenter === "Anna") {
    // Ben always keeps his own card; only a foreign author can still be hidden.
    await expect(ben.getByTestId("note-card")).toHaveCount(2);
  } else {
    await expect(ben.getByText("Deploys are slow")).toHaveCount(0);
  }

  // Spin 2: the other person — no repeats.
  const secondPresenter = firstPresenter === "Anna" ? "Ben" : "Anna";
  await anna.getByTestId("wheel-winner").waitFor({ state: "hidden" });
  await anna.getByTestId("spin-button").click();
  await expect(anna.getByTestId("presenter-banner")).toContainText(
    secondPresenter,
    {
      timeout: 15_000,
    },
  );

  // Cumulative: the second presenter's cards join the first's, they don't
  // replace them.
  await expect(ben.getByTestId("note-card")).toHaveCount(2);
  await expect(ben.getByText("Deploys are slow")).toBeVisible();
  await expect(ben.getByText("Deploys take forever")).toBeVisible();

  // Completing the final presenter finishes the rotation on all screens.
  await anna.getByTestId("wheel-winner").waitFor({ state: "hidden" });
  await anna.getByTestId("spin-button").click();
  await expect(anna.getByTestId("picker-finished")).toBeVisible();
  await expect(ben.getByTestId("picker-finished")).toBeVisible();

  // Grouping: drag Ben's duplicate onto Anna's note — stack appears for both.
  const source = ben
    .getByTestId("note-card")
    .filter({ hasText: "Deploys take forever" });
  const target = ben
    .getByTestId("note-card")
    .filter({ hasText: "Deploys are slow" });
  await source.dragTo(target);
  await expect(ben.getByTestId("note-stack")).toBeVisible();
  await expect(anna.getByTestId("note-stack")).toBeVisible();
  await expect(anna.getByTestId("note-stack")).toContainText("×2");

  // Unstack (in a card's „More“) dissolves the two-note group everywhere.
  await ben.getByTestId("note-stack").getByTestId("note-menu").first().click();
  await ben.getByRole("menuitem", { name: /unstack|aus stapel/i }).click();
  await expect(anna.getByTestId("note-stack")).toHaveCount(0);

  // Handoff: Anna promotes Ben via the avatar menu; Ben gains admin controls.
  await expect(ben.getByTestId("phase-next")).toHaveCount(0);
  await anna.getByTestId("avatar-Ben").click();
  await anna.getByTestId("role-toggle-Ben").click();
  await expect(ben.getByTestId("phase-next")).toBeVisible();

  await annaContext.close();
  await benContext.close();
});

// The facilitator shares their screen in the call, so "one card at a time" has
// to be a property of the ROOM, not of the moderator's browser: the remote
// participants must land on the same card at the same moment.
test("focus mode walks the presenter's cards on every screen", async ({
  browser,
}) => {
  const annaContext = await newContext(browser, { reducedMotion: "reduce" });
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 46 retro");
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

  // Anna writes two cards; Ben writes one, so the rotation has two people.
  await anna.getByTestId("phase-next").click();
  const annaComposer = anna
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await annaComposer.fill("First card");
  await annaComposer.press("Enter");
  await annaComposer.fill("Second card");
  await annaComposer.press("Enter");
  const benComposer = ben
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await benComposer.fill("Ben's only card");
  await benComposer.press("Enter");

  await anna.getByTestId("phase-next").click(); // present
  await anna.getByTestId("focus-mode-toggle").click();
  // Members see the state too — otherwise "where did the cards go?" has no
  // answer on screen.
  await expect(ben.getByTestId("focus-mode-state")).toBeVisible();

  // Put Anna on stage deliberately rather than spinning, so the assertions do
  // not depend on the draw.
  await anna.getByTestId("pick-Anna").click();
  await expect(anna.getByTestId("presenter-banner")).toContainText("Anna");

  // ONE card, centred, and the server picked the first one — no click needed
  // to start the walkthrough.
  await expect(anna.getByTestId("present-stage")).toBeVisible();
  await expect(anna.getByTestId("present-stage")).toContainText("First card");
  await expect(ben.getByTestId("present-stage")).toContainText("First card");

  // Ben follows Anna's "next" without touching anything himself.
  await expect(anna.getByTestId("present-next")).toContainText(
    /next card|nächste karte/i,
  );
  await anna.getByTestId("present-next").click();
  await expect(anna.getByTestId("present-stage")).toContainText("Second card");
  await expect(ben.getByTestId("present-stage")).toContainText("Second card");

  // On the LAST card the button stops offering another card and offers the
  // next person instead — which is what actually happens next.
  await expect(anna.getByTestId("present-next")).not.toContainText(
    /next card|nächste karte/i,
  );
  await anna.getByTestId("present-next").click();
  await expect(anna.getByTestId("presenter-banner")).toContainText("Ben", {
    timeout: 15_000,
  });
  await expect(ben.getByTestId("present-stage")).toContainText(
    "Ben's only card",
  );

  await annaContext.close();
  await benContext.close();
});

// The wheel turns for real here (no reduced motion): the server commits the
// draw at once and sends the winner's cards with the spin, but the board
// behind the overlay must not show who it is before the wheel lands, and focus
// mode must not drop to the whole board between two people (owner,
// 2026-11-20).
test("focus mode holds a stage between people and the draw spoils nothing", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const annaContext = await newContext(browser);
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 47 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  await join(anna, "Anna");
  const benContext = await newContext(browser);
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Ben");
  const caraContext = await newContext(browser);
  const cara = await caraContext.newPage();
  await cara.goto(boardUrl);
  await join(cara, "Cara");

  await anna.getByTestId("phase-next").click();
  const people = [
    [anna, "Anna's card"],
    [ben, "Ben's card"],
    [cara, "Cara's card"],
  ] as const;
  for (const [page, text] of people) {
    const composer = page
      .getByPlaceholder(/write a note|notiz schreiben/i)
      .first();
    await composer.fill(text);
    await composer.press("Enter");
  }
  await anna.getByTestId("phase-next").click(); // present
  await anna.getByTestId("focus-mode-toggle").click();

  // Before the first draw: the stage, not the board.
  await expect(ben.getByTestId("present-interlude")).toBeVisible();
  await expect(ben.getByTestId("column-strip")).toHaveCount(0);

  // While the wheel turns, nobody is on stage on any screen — the
  // facilitator's, which the room watches, included.
  await anna.getByTestId("spin-button").click();
  for (const page of [anna, ben, cara]) {
    await expect(page.getByTestId("wheel-overlay")).toBeVisible();
    await expect(page.getByTestId("wheel-winner")).toHaveCount(0);
    await expect(page.getByTestId("presenter-banner")).toHaveCount(0);
    await expect(page.getByTestId("present-stage")).toHaveCount(0);
    await expect(page.getByTestId("present-interlude")).toBeAttached();
  }

  // Landed: the winner is on stage everywhere, with their first card.
  await expect(anna.getByTestId("wheel-winner")).toBeVisible({
    timeout: 15_000,
  });
  const winner = /Anna/.test(await anna.getByTestId("wheel-winner").innerText())
    ? 0
    : /Ben/.test(await anna.getByTestId("wheel-winner").innerText())
      ? 1
      : 2;
  const [presenter, presenterCard] = people[winner];
  // Somebody who is neither the facilitator nor the winner.
  const watcher = winner === 1 ? cara : ben;
  await expect(watcher.getByTestId("present-stage")).toContainText(
    presenterCard,
  );
  await anna.getByTestId("wheel-overlay").waitFor({ state: "hidden" });
  await presenter.getByTestId("wheel-overlay").waitFor({ state: "hidden" });

  // „Fertig mit Vorstellen“: still the stage, now asking who is next.
  await presenter.getByTestId("present-done").click();
  const interlude = watcher.getByTestId("present-interlude");
  await expect(interlude).toBeVisible();
  await expect(interlude.getByRole("heading")).toHaveText(
    /who presents next|wer stellt als nächstes vor/i,
  );
  await expect(watcher.getByTestId("column-strip")).toHaveCount(0);

  await annaContext.close();
  await benContext.close();
  await caraContext.close();
});

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
}
