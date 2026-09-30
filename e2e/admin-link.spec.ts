// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// The facilitator link, end to end: the board is created on one "device" and
// run from another — a fresh browser context with nothing in its storage. One
// board for every case, because board creation is rate limited (helpers.ts).
test("the facilitator link carries the controls to another device", async ({
  browser,
}) => {
  const laptop = await newContext(browser, { reducedMotion: "reduce" });
  const creator = await laptop.newPage();
  await creator.goto("/new");
  await expect(creator.getByTestId("home-admin-link-hint")).toBeVisible();
  await creator.getByRole("textbox").fill("Handover retro");
  await creator
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(creator).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(creator, "Anna");

  // Read the link from the UI. Revealing it rather than reading the clipboard
  // keeps the spec engine-neutral (see playwright.config.ts).
  await expect(creator.getByTestId("admin-link")).toBeVisible();
  await creator.getByTestId("admin-link-reveal").click();
  const link = await creator.getByTestId("admin-link-input").inputValue();
  expect(link).toMatch(/\/board\/[0-9a-f]{32}#admin=[0-9a-f]{32}$/);
  const teamLink = link.slice(0, link.indexOf("#"));

  // The meeting-room PC: nothing stored, only the link.
  const roomPc = await newContext(browser, { reducedMotion: "reduce" });
  const room = await roomPc.newPage();
  await room.goto(link);
  // Gone from the address bar before anyone has typed a name.
  await expect(room).toHaveURL(teamLink);
  await join(room, "Anna (room)");
  await expect(room.getByTestId("phase-next")).toBeVisible();
  await expect(room.getByTestId("admin-link")).toBeVisible();

  // A team member on the ordinary link gets neither.
  const memberContext = await newContext(browser, { reducedMotion: "reduce" });
  const member = await memberContext.newPage();
  await member.goto(teamLink);
  await join(member, "Ben");
  await expect(member.getByTestId("phase-next")).toHaveCount(0);
  await expect(member.getByTestId("admin-link")).toHaveCount(0);

  // Pasting the link over a tab that is already in the room changes only the
  // fragment — no reload — and must still hand over the controls.
  await member.goto(link);
  await expect(member.getByTestId("phase-next")).toBeVisible();
  await expect(member).toHaveURL(teamLink);

  // A forged link — well-formed, any member can make one from the board id —
  // opened by the creator must not replace the real token this browser holds.
  // The join cannot tell (the session stays facilitator), so the tab says it.
  await creator.goto(`${teamLink}#admin=${"0".repeat(32)}`);
  await expect(creator).toHaveURL(teamLink);
  await expect(creator.getByTestId("notice")).toContainText(
    /already holds|schon gespeichert/i,
  );
  await expect(creator.getByTestId("phase-next")).toBeVisible();
  await creator.getByTestId("admin-link-reveal").click();
  await expect(creator.getByTestId("admin-link-input")).toHaveValue(link);

  // A link cut short: stripped, nothing granted, and said so.
  const cutContext = await newContext(browser, { reducedMotion: "reduce" });
  const cut = await cutContext.newPage();
  await cut.goto(link.slice(0, -1));
  await expect(cut).toHaveURL(teamLink);
  await join(cut, "Carla");
  await expect(cut.getByTestId("notice")).toContainText(
    /facilitator link|moderationslink/i,
  );
  await expect(cut.getByTestId("phase-next")).toHaveCount(0);

  // The controls on the room PC really work: it starts the retro for everyone.
  await room.getByTestId("phase-next").click();
  await expect(creator.getByTestId("phase-back")).toBeVisible();

  await Promise.all(
    [laptop, roomPc, memberContext, cutContext].map((c) => c.close()),
  );
});

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
}
