// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers";

// One name per board (owner, 2026-11-08): a second „Anna“ is sent back to
// the join form, which says so at the field and suggests an addition.
test("a name already in the board is refused at the field", async ({
  browser,
}) => {
  const annaContext = await newContext(browser, { reducedMotion: "reduce" });
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 59 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await anna.getByRole("textbox").fill("Anna");
  await anna.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(anna.getByTestId("roster-item").first()).toBeVisible();

  const otherContext = await newContext(browser, { reducedMotion: "reduce" });
  const other = await otherContext.newPage();
  await other.goto(anna.url());
  const field = other.getByRole("textbox");
  await field.fill("anna");
  await other.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  const error = other.getByTestId("join-name-taken");
  await expect(error).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveValue("anna");

  await field.fill("Anna B.");
  await expect(error).toHaveCount(0);
  await other.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);
  await annaContext.close();
  await otherContext.close();
});
