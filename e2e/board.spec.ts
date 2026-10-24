// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// The M0 definition of done: two browsers see each other join a board.
test("two participants meet on a board and see each other live", async ({
  browser,
}) => {
  // Anna creates the board (fresh context = fresh localStorage).
  const annaContext = await newContext(browser);
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 42 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();

  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();

  // Anna joins with her name; as creator she holds the admin capability.
  await anna.getByRole("textbox").fill("Anna");
  await anna.getByRole("button", { name: /join|beitreten/i }).click();
  await expect(anna.getByTestId("roster-item")).toHaveCount(1);
  await expect(anna.getByTestId("roster-item").first()).toContainText("Anna");
  await expect(
    anna
      .getByTestId("roster-item")
      .first()
      .getByText(/facilitator|moderation/i),
  ).toBeVisible();

  // Ben opens the share link in a second, independent browser context.
  const benContext = await newContext(browser);
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await expect(
    ben.getByRole("heading", { name: /sprint 42 retro/i }),
  ).toBeVisible();
  await ben.getByRole("textbox").fill("Ben");
  await ben.getByRole("button", { name: /join|beitreten/i }).click();

  // Both rosters converge — the realtime loop works end to end.
  await expect(ben.getByTestId("roster-item")).toHaveCount(2);
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);
  await expect(anna.getByTestId("roster-item").nth(1)).toContainText("Ben");
  // Ben is a plain member: exactly one facilitator badge in his roster.
  await expect(
    ben.getByTestId("roster-item").getByText(/^(facilitator|moderation)$/i),
  ).toHaveCount(1);

  // Ben leaves; Anna sees him go offline (kept in roster, dimmed).
  await benContext.close();
  await expect(anna.getByTestId("roster-item").nth(1)).toContainText(
    /offline/i,
  );

  await annaContext.close();
});

test("a refresh keeps identity: no duplicate participant", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Refresh test");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /join|beitreten/i }).click();
  await expect(page.getByTestId("roster-item")).toHaveCount(1);

  await page.reload();
  // The stored display name pre-fills the join form; rejoin reclaims identity.
  await page.getByRole("button", { name: /join|beitreten/i }).click();
  await expect(page.getByTestId("roster-item")).toHaveCount(1);
  await expect(page.getByTestId("roster-item").first()).toContainText("Anna");

  await context.close();
});

// An empty field keeps the button pressable (sebaro STA-03): the press sends
// nothing, names what is missing at the field and puts the cursor there.
test("an empty name is answered at the field, on create and on join", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const creates: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/boards"))
      creates.push(request.url());
  });
  await page.goto("/new");
  const boardName = page.getByRole("textbox");
  await page.getByRole("combobox").focus();
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(boardName).toBeFocused();
  await expect(boardName).toHaveAttribute("aria-invalid", "true");
  await expect(boardName).toHaveAccessibleDescription(
    /^(board name is missing|name des boards fehlt)\.$/i,
  );
  await expect(page).toHaveURL(/\/new$/);
  expect(creates).toHaveLength(0);
  await boardName.fill("Empty fields");
  await expect(boardName).not.toHaveAttribute("aria-invalid");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  expect(creates).toHaveLength(1);

  // Enter in the field, which has the focus already: a live region says it.
  const yourName = page.getByRole("textbox");
  const missingName = /^(your name is missing|dein name fehlt)\.$/i;
  await expect(yourName).toBeFocused();
  await yourName.press("Enter");
  await expect(yourName).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("status").filter({ hasText: missingName }),
  ).toHaveCount(1);

  // The button, with the focus on it first: the press moves it to the field.
  const join = page.getByRole("button", { name: /join|beitreten/i });
  await join.focus();
  await join.click();
  await expect(yourName).toBeFocused();
  await expect(yourName).toHaveAttribute("aria-invalid", "true");
  await expect(yourName).toHaveAccessibleDescription(missingName);
  await expect(page.getByTestId("roster-item")).toHaveCount(0);
  await yourName.fill("Anna");
  await expect(page.getByText(missingName)).toHaveCount(0);
  await join.click();
  await expect(page.getByTestId("roster-item")).toHaveCount(1);

  await context.close();
});

test("an unknown board id shows the not-found page", async ({ page }) => {
  await page.goto(`/board/${"0".repeat(32)}`);
  await expect(
    page.getByText(/board not found|board nicht gefunden/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: /create a new board|neues board erstellen/i,
    }),
  ).toHaveAttribute("href", "/new");
  await expect(page.getByTestId("legal-footer")).toBeVisible();
});
