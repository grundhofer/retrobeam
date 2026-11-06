// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// The board's settings view (plan stage 5a, sebaro spec/03 §6.6): reached by
// „Einstellungen“ in the header, a child route of the board, so the room keeps
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

  const settings = anna.getByRole("link", {
    name: /^(settings|einstellungen)$/i,
  });
  await settings.click();
  await expect(anna).toHaveURL(`${boardUrl}/settings`);
  await expect(settings).toHaveAttribute("aria-current", "page");
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

  // Back to the board by the header's own word.
  await anna.getByRole("link", { name: /^board$/i }).click();
  await expect(anna).toHaveURL(boardUrl);
  await expect(anna.getByTestId("phase-next")).toBeVisible();

  // A participant's settings view has the device's own settings (language,
  // tone, motion), not the board's switches. Waited for: a count of 0 right
  // after the click could still be the board view.
  await ben.getByRole("link", { name: /^(settings|einstellungen)$/i }).click();
  await expect(ben.getByRole("heading", { level: 1 })).toHaveText(
    /^(settings|einstellungen)$/i,
  );
  await expect(ben.getByRole("radio", { name: "Deutsch" })).toBeVisible();
  await expect(ben.getByTestId("motion-toggle")).toBeVisible();
  await expect(ben.getByRole("switch")).toHaveCount(1);

  await benContext.close();
  await annaContext.close();
});
