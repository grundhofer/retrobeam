// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// The M1 acceptance flow: private write with ghost cards and ready-check,
// reveal on phase change, reactions, rewind hiding notes again, and the timer.
test("write → reveal core loop with two participants", async ({ browser }) => {
  const annaContext = await newContext(browser);
  const anna = await annaContext.newPage();
  await anna.goto("/");
  await anna.getByRole("textbox").fill("Sprint 42 retro");
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
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);

  // Admin starts the retro → write phase for everyone.
  await toWrite(anna);
  const annaComposer = anna
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await expect(annaComposer).toBeVisible();
  const benComposer = ben
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await expect(benComposer).toBeVisible();

  // Ghost cards: Ben sees THAT Anna writes, not WHAT.
  await annaComposer.click();
  await expect(ben.getByTestId("ghost-card")).toBeVisible();
  await expect(ben.getByText(/Anna (is writing|schreibt)/)).toBeVisible();

  // Anna adds her note; Ben must not see a trace of it.
  await annaComposer.fill("Secret note from Anna");
  await annaComposer.press("Enter");
  await expect(anna.getByText("Secret note from Anna")).toBeVisible();
  await expect(ben.getByTestId("note-card")).toHaveCount(0);
  await expect(ben.getByText("Secret note from Anna")).toHaveCount(0);
  // …but Ben DOES see that a card exists — an anonymized count, no content.
  await expect(ben.getByTestId("team-cards")).toBeVisible();
  await expect(ben.getByTestId("team-cards")).toContainText("1");

  // Ben writes his own — Anna doesn't see it either.
  await benComposer.fill("Ben's point");
  await benComposer.press("Enter");
  await expect(ben.getByText("Ben's point")).toBeVisible();
  await expect(anna.getByText("Ben's point")).toHaveCount(0);

  // Ready-check aggregates across the room.
  await ben.getByTestId("ready-toggle").click();
  await expect(anna.getByTestId("ready-count")).toContainText("1/2");
  await anna.getByTestId("ready-toggle").click();
  await expect(anna.getByTestId("ready-count")).toContainText("2/2");

  // Present: the facilitator gets the board straight away, a member gets each
  // person's cards as the rotation reaches them.
  await anna.getByTestId("phase-next").click();
  await expect(anna.getByText("Ben's point")).toBeVisible();
  // Barrier on BEN's page before the negative: the hint only exists in the
  // presenting phase, so a count of 0 cannot merely mean "the phase change has
  // not arrived yet".
  await expect(ben.getByTestId("present-scope-hint")).toBeVisible();
  await expect(ben.getByText("Secret note from Anna")).toHaveCount(0);
  await anna.getByTestId("pick-Anna").click();
  await expect(ben.getByText("Secret note from Anna")).toBeVisible();

  // Reactions after reveal, live for the author.
  const annasNoteOnBensScreen = ben
    .getByTestId("note-card")
    .filter({ hasText: "Secret note from Anna" });
  await annasNoteOnBensScreen.getByTestId("react-👍").click();
  await expect(
    anna
      .getByTestId("note-card")
      .filter({ hasText: "Secret note from Anna" })
      .getByTestId("react-👍"),
  ).toContainText("1");

  // Rewind to write: Anna's note disappears from Ben's board again.
  await anna.getByTestId("phase-back").click();
  await expect(ben.getByText("Secret note from Anna")).toHaveCount(0);
  await expect(ben.getByText("Ben's point")).toBeVisible();

  // Timer: admin starts 5 minutes, both see the countdown; Ben has no controls.
  await anna.getByRole("button", { name: "5m", exact: true }).click();
  await expect(anna.getByTestId("timer-display")).toContainText(
    /0?4:5\d|05:00/,
  );
  await expect(ben.getByTestId("timer-display")).toBeVisible();
  await expect(ben.getByRole("button", { name: /pause/i })).toHaveCount(0);

  await annaContext.close();
  await benContext.close();
});

test("board is created with localized template columns", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox").fill("Template check");
  await page
    .getByLabel(/template|vorlage/i)
    .selectOption("start-stop-continue");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Solo");
  await toWrite(page);
  await expect(page.getByRole("heading", { name: /^start/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^stop/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^continue/i })).toBeVisible();
});

test("a note written while offline is delivered after reconnect", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox").fill("Offline resilience");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Anna");
  await toWrite(page);

  const composer = page
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await expect(composer).toBeVisible();

  // Cut the network and force the socket closed (offline emulation alone
  // does not terminate an established WebSocket), then write into the void.
  await context.setOffline(true);
  await page.evaluate(() =>
    (
      window as unknown as { __retrobeamWs?: { reconnect: () => void } }
    ).__retrobeamWs?.reconnect(),
  );
  await expect(page.getByRole("status")).toBeVisible(); // offline banner
  await composer.fill("Written while offline");
  await composer.press("Enter");
  await expect(page.getByText("Written while offline")).toBeVisible(); // optimistic
  await context.setOffline(false);

  // The queued command flushes after the rejoin; a reload proves the note
  // was actually persisted server-side, not just rendered optimistically.
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 20_000 });
  await page.reload();
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByText("Written while offline")).toBeVisible({
    timeout: 20_000,
  });

  await context.close();
});

test("a note in flight when the socket dies survives the reconnect", async ({
  browser,
}) => {
  // The offline test above covers the QUEUE: written while known-disconnected.
  // This covers the harder case the queue never did — the frame was handed to a
  // live socket that then died, so it was neither queued nor acknowledged, and
  // the next snapshot wiped it off the screen along with whatever was typed.
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox").fill("In-flight resilience");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Anna");
  await toWrite(page);

  const composer = page
    .getByPlaceholder(/write a note|notiz schreiben/i)
    .first();
  await expect(composer).toBeVisible();

  // Silently swallow outbound frames, so the client still believes it is
  // online: exactly the half-open case. The note is "sent" and lost.
  type WsHandle = {
    send: (data: string) => void;
    reconnect: () => void;
  };
  await page.evaluate(() => {
    const ws = (window as unknown as { __retrobeamWs?: WsHandle })
      .__retrobeamWs;
    if (!ws) return;
    (window as unknown as { __realSend?: WsHandle["send"] }).__realSend =
      ws.send.bind(ws);
    ws.send = () => {};
  });
  await composer.fill("Sent into a dead socket");
  await composer.press("Enter");
  await expect(page.getByText("Sent into a dead socket")).toBeVisible();

  // Put the socket back the way it was, then drop it. The frame is gone — it
  // was never written — and only the in-flight replay can recover it.
  await page.evaluate(() => {
    const ws = (window as unknown as { __retrobeamWs?: WsHandle })
      .__retrobeamWs;
    const real = (window as unknown as { __realSend?: WsHandle["send"] })
      .__realSend;
    if (ws && real) ws.send = real;
    ws?.reconnect();
  });

  // A reload proves it reached the server rather than merely staying on screen.
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 20_000 });
  await page.reload();
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByText("Sent into a dead socket")).toBeVisible({
    timeout: 20_000,
  });

  await context.close();
});

test("a refused command is explained instead of vanishing", async ({
  browser,
}) => {
  // Every refusal used to be silent: the command vanished, the board quietly
  // resynced, and nothing told the user anything. The composer's own
  // restore-on-reject path rides on the same wiring (mutate's onReject).
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox").fill("Refusal feedback");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Anna");

  // A vote cast in the lobby is refused by the server's phase gate. Sent over
  // the live socket so the whole client path runs, exactly as it would for a
  // note typed the instant the facilitator moved the room on.
  await page.evaluate(() => {
    const ws = (
      window as unknown as { __retrobeamWs?: { send: (d: string) => void } }
    ).__retrobeamWs;
    ws?.send(
      JSON.stringify({
        type: "vote.cast",
        opId: "a".repeat(32),
        targetId: "b".repeat(32),
        count: 1,
      }),
    );
  });

  const notice = page.getByTestId("notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/phase|Phase/);
  // It is announced, not just drawn.
  await expect(page.getByTestId("notices")).toHaveAttribute(
    "aria-live",
    "polite",
  );

  await notice.getByRole("button").click();
  await expect(page.getByTestId("notice")).toHaveCount(0);

  await context.close();
});

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
}

// lobby → write (check-in is off by default now).
async function toWrite(page: Page): Promise<void> {
  await page.getByTestId("phase-next").click();
}
