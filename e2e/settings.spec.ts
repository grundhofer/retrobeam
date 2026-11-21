// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// The board's settings view (plan stage 5a, sebaro spec/03 §6.6): reached by
// „Einstellungen“ in the head's „Mehr“ (round 7), a child route of the board,
// left by „Zurück zum Board“, so the room keeps
// its socket — nobody sees the facilitator go offline while they change a
// setting — and every switch applies at once, for the whole room.
test("the settings view keeps the room connected and applies a switch at once", async ({
  browser,
}) => {
  const annaContext = await newContext(browser);
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 53 retro");
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
  await expect(ben.getByTestId("roster-item")).toHaveCount(2);

  await anna.getByTestId("board-menu").click();
  await anna.getByTestId("menu-settings").click();
  await expect(anna).toHaveURL(`${boardUrl}/settings`);
  await expect(anna.getByRole("heading", { level: 1 })).toHaveText(
    /^(settings|einstellungen)$/i,
  );

  // A switch, by keyboard: Space flips it, the server confirms it.
  const gifs = anna.getByRole("switch", { name: /gif/i });
  await expect(gifs).toHaveAttribute("aria-checked", "true");
  await gifs.focus();
  await anna.keyboard.press("Space");
  await expect(gifs).toHaveAttribute("aria-checked", "false");

  // Anna never left the room.
  await expect(ben.getByTestId("roster-item").first()).not.toContainText(
    /offline/i,
  );
  await expect(ben.getByTestId("roster-item").nth(1)).not.toContainText(
    /offline/i,
  );

  // Back to the board by the view's own text action.
  await anna.getByTestId("settings-back").click();
  await expect(anna).toHaveURL(boardUrl);
  await expect(anna.getByTestId("phase-next")).toBeVisible();

  // A participant's settings view has the device's own settings (language,
  // tone, motion, the timer sound), not the board's switches. Waited for: a count of 0 right
  // after the click could still be the board view.
  await ben.getByTestId("board-menu").click();
  await ben.getByTestId("menu-settings").click();
  await expect(ben.getByRole("heading", { level: 1 })).toHaveText(
    /^(settings|einstellungen)$/i,
  );
  await expect(ben.getByRole("radio", { name: "Deutsch" })).toBeVisible();
  await expect(ben.getByTestId("motion-toggle")).toBeVisible();
  await expect(ben.getByTestId("timer-sound-toggle")).toBeVisible();
  await expect(ben.getByRole("switch")).toHaveCount(2);

  await benContext.close();
  await annaContext.close();
});

// The timer sound (owner, 2026-11-20): each person's own choice, off unless
// chosen. Switching it on plays it once; when the time box runs out it plays
// for whoever chose it, once, and not again after a reload. The tones are
// counted where they are made (AudioContext.createOscillator, two per
// sound); whether a speaker sounds is for a hand check. The facilitator's
// keys start at 5 minutes, so the test starts a 10-second time box (the
// protocol's least) over the page's own socket.
test("the timer sound plays for whoever chose it, once, when time is up", async ({
  browser,
}) => {
  // Two people, then a 10-second time box and the alarm that ends it.
  test.setTimeout(60_000);
  const tones = () => {
    const counted = window as unknown as { __tones: number };
    counted.__tones = 0;
    const make = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      counted.__tones += 1;
      return make.call(this);
    };
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args: [string, string[]?]) {
        const socket = Reflect.construct(target, args) as WebSocket;
        (window as unknown as { __socket: WebSocket }).__socket = socket;
        return socket;
      },
    });
  };
  const count = (page: import("@playwright/test").Page) =>
    page.evaluate(() => (window as unknown as { __tones: number }).__tones);

  const annaContext = await newContext(browser);
  const anna = await annaContext.newPage();
  await anna.addInitScript(tones);
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 54 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  await anna.getByRole("textbox").fill("Anna");
  await anna.getByRole("button", { name: /^(join|beitreten)$/i }).click();

  const benContext = await newContext(browser);
  const ben = await benContext.newPage();
  await ben.addInitScript(tones);
  await ben.goto(boardUrl);
  await ben.getByRole("textbox").fill("Ben");
  await ben.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(ben.getByTestId("roster-item")).toHaveCount(2);

  // Ben switches it on and hears it once; Anna leaves it off.
  await ben.getByTestId("board-menu").click();
  await ben.getByTestId("menu-settings").click();
  const sound = ben.getByTestId("timer-sound-toggle");
  await expect(sound).toHaveAttribute("aria-checked", "false");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => count(ben)).toBe(2);
  await ben.getByTestId("settings-back").click();
  await expect(ben).toHaveURL(boardUrl);

  await anna.evaluate(() =>
    (window as unknown as { __socket: WebSocket }).__socket.send(
      JSON.stringify({ type: "admin.timer.start", durationSec: 10 }),
    ),
  );
  await expect(ben.getByTestId("action-zone")).toContainText(/1\s*min/i);
  // The server's end of the time box sets the timer idle again, so the line
  // „Zeit um“ is only a moment; the sound is what is waited for.
  await expect.poll(() => count(ben), { timeout: 20_000 }).toBe(4);
  await expect(ben.getByTestId("action-zone")).not.toContainText(/min/i);
  expect(await count(anna)).toBe(0);

  // A reload after the time ran out stays quiet: the sound comes from the
  // moment itself, not from a board whose time is up. A click unlocks the
  // audio, which makes no tone of its own.
  await ben.reload();
  await ben.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(ben.getByTestId("roster-item")).toHaveCount(2);
  await ben.getByRole("heading", { level: 1 }).click();
  expect(await count(ben)).toBe(0);

  await benContext.close();
  await annaContext.close();
});
