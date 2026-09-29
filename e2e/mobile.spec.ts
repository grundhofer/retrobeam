// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Locator, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// A board on a phone, walked through every phase as facilitator and member.
// Every board page used to be ~588px wide at 390: the page scrolled sideways,
// the fixed wheel overlay sat off centre and cut off (a phone widens its
// layout viewport to the widest content), and the ⋯ menu began at x=-48 with
// its export options out of reach. One board for the whole walk — creation is
// rate limited (helpers.ts).
const PHONE = { width: 390, height: 844 };

test("board fits a phone", async ({ browser }) => {
  // The facilitator skips the animation (it only gets in the way of her
  // clicks); the member keeps it, because the spinning wheel on HIS screen is
  // what was off centre.
  const annaContext = await newContext(browser, {
    viewport: PHONE,
    reducedMotion: "reduce",
  });
  const anna = await annaContext.newPage();
  await anna.goto("/new");
  // Long on purpose: the board name shares the header with everything else.
  await anna.getByRole("textbox").fill("Sprint 47 retro — platform team (Q3)");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  await join(anna, "Anna");

  const benContext = await newContext(browser, { viewport: PHONE });
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Benjamin Mustermann-Schulze");
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);

  // Lobby. The phone gets the compact step line instead of the phase row.
  await expect(anna.getByTestId("phase-compact")).toBeVisible();
  await expectFits(anna, ben, "lobby");

  // The menu: every export option reachable, the whole panel on screen.
  await openPanel(anna, "board-menu", "board-menu-panel");
  await expectOnScreen(anna.getByTestId("export-pdf"));
  await expectOnScreen(anna.getByTestId("export-md"));
  await expectOnScreen(anna.getByTestId("export-scope-all"));
  await expectOnScreen(anna.getByTestId("delete-board"));
  await anna.keyboard.press("Escape");
  await expect(anna.getByTestId("board-menu-panel")).toHaveCount(0);

  // The member's invite panel: the team link and its QR code, on screen.
  await openPanel(ben, "invite-button", "invite-panel");
  await expect(
    ben.getByTestId("invite-panel").getByTestId("qr-code"),
  ).toBeVisible();
  await expect(
    ben.getByTestId("invite-panel").getByTestId("share-link-input"),
  ).toHaveValue(boardUrl);
  await ben.getByTestId("invite-panel-close").click();
  await expect(ben.getByTestId("invite-panel")).toHaveCount(0);

  // Write, in columns.
  await step(anna, ben, /write|schreiben/i);
  for (const [page, text] of [
    [anna, "Deploys are slow on Fridays"],
    [ben, "Flaky pipeline in the integration stage"],
  ] as const) {
    const composer = page
      .getByPlaceholder(/write a note|notiz schreiben/i)
      .first();
    await composer.fill(text);
    await composer.press("Enter");
  }
  await expectFits(anna, ben, "write (columns)");

  // Write, on the canvas — switched from the phone's own menu.
  await openPanel(anna, "board-menu", "board-menu-panel");
  await anna.getByTestId("layout-canvas").click();
  await anna.keyboard.press("Escape");
  await expect(anna.getByTestId("canvas-viewport")).toBeVisible();
  await expect(ben.getByTestId("canvas-viewport")).toBeVisible();
  await expectFits(anna, ben, "write (canvas)");

  // Present, with the wheel mid-spin on the member's screen.
  await step(anna, ben, /present|vorstellen/i);
  await expectFits(anna, ben, "present");
  await anna.getByTestId("spin-button").click();
  const wheel = ben.getByTestId("wheel");
  await expect(wheel).toBeVisible();
  const box = await wheel.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
    // Centred, not merely inside: off centre is how the bug looked.
    expect(Math.abs(box.x + box.width / 2 - PHONE.width / 2)).toBeLessThan(2);
  }
  await expectFits(anna, ben, "present (wheel)");
  await expect(ben.getByTestId("wheel-winner")).toBeVisible({
    timeout: 15_000,
  });
  await anna.getByTestId("wheel-winner").waitFor({ state: "hidden" });
  await ben.getByTestId("wheel-winner").waitFor({ state: "hidden" });

  await step(anna, ben, /vote|abstimmen/i);
  await expectFits(anna, ben, "vote");
  await step(anna, ben, /discuss|diskutieren/i);
  await expectFits(anna, ben, "discuss");
  await step(anna, ben, /close|abschluss/i);
  await expectFits(anna, ben, "close");
  await step(anna, ben, /done|fertig/i);
  await expectFits(anna, ben, "done");
  // Nobody joins a finished retro to take part.
  await expect(anna.getByTestId("invite-button")).toHaveCount(0);

  await Promise.all([annaContext.close(), benContext.close()]);
});

// The board root clips horizontal overflow as a safety net. Measuring with
// it on would pass whatever overflows, so it is switched off here: what is
// asserted is that nothing is wider than the phone in the first place.
async function expectFits(anna: Page, ben: Page, phase: string) {
  for (const page of [anna, ben]) {
    const { scrollWidth, innerWidth } = await page.evaluate(() => {
      if (!document.getElementById("e2e-no-clip")) {
        const style = document.createElement("style");
        style.id = "e2e-no-clip";
        style.textContent =
          "[data-board-root] { overflow-x: visible !important; }";
        document.head.append(style);
      }
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    expect(
      scrollWidth,
      `${phase}: page wider than the phone`,
    ).toBeLessThanOrEqual(innerWidth);
  }
}

async function expectOnScreen(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  }
}

// Opens a header popover and checks the whole panel is inside the phone.
async function openPanel(page: Page, trigger: string, panel: string) {
  await page.getByTestId(trigger).click();
  const sheet = page.getByTestId(panel);
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
  }
}

// One phase forward, and wait until BOTH screens show it.
async function step(anna: Page, ben: Page, phase: RegExp) {
  await anna.getByTestId("phase-next").click();
  await expect(anna.getByTestId("phase-compact")).toContainText(phase);
  await expect(ben.getByTestId("phase-compact")).toContainText(phase);
}

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
}
