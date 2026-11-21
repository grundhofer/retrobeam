// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";
import { join } from "./visual-helpers.js";

// The three control levels (sebaro D143 (7), D144 (6), round 7): at most one
// outlined action (sb-secondary-action) per task area, everything else beside
// the one primary action is a text action, and a web app's head has no theme
// button. Counted by sebaro's own check, checks/sb-colour-count.js, on every
// view at a phone and a desktop width. Asserted here: its control-level part
// and the number of primary actions (at most one per view; outside the board
// exactly one, or none where the view says data-sb-primary-expected="0"); the
// colour count's other parts are not this gate's job. Chromium only: the count reads the layout, and one engine is
// enough for that.
//
// The script is loaded by path (relative to the repo root, where Playwright
// runs) because e2e/ has no Node types to read files with.
const CHECK = "apps/web/src/sebaro/checks/sb-colour-count.js";
const WIDTHS = [390, 1440];

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "the count runs in one engine",
);

// Every view on the page that has more than one outlined action in one area,
// a theme button in a web app's head, or another number of primary actions
// than it expects, as one line each. After the resize
// the media queries report at the next frame, and the board's layout follows
// them synchronously (useNarrow); two frames later the count reads the layout
// of this width, not the last one. `ready` then waits for what the view must
// show at this width, so a view that did not come up fails instead of
// counting nothing.
async function levels(
  page: Page,
  name: string,
  ready?: (width: number) => Promise<void>,
  widths: readonly number[] = WIDTHS,
): Promise<string[]> {
  const found: string[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await ready?.(width);
    await page.addScriptTag({ path: CHECK });
    const lines = await page.evaluate(() => {
      const count = (
        window as unknown as {
          sbColourCount: (view: Element) => {
            outlinedAreas: { area: string; outlined: number }[];
            headerThemeButtons: number;
            primary: number;
            expected: number;
          };
        }
      ).sbColourCount;
      return Array.from(document.querySelectorAll("[data-sb-view]")).flatMap(
        (view) => {
          const result = count(view);
          return [
            ...result.outlinedAreas
              .filter((area) => area.outlined > 1)
              .map((area) => `${area.area}: ${area.outlined} outlined`),
            ...(result.headerThemeButtons
              ? [`${result.headerThemeButtons} theme button(s) in the head`]
              : []),
            // At most one everywhere. The board does not declare how many
            // it expects: a member's board has none in most phases, a
            // facilitator's one, so there only the most is counted.
            ...(result.primary > 1 ||
            (view.getAttribute("data-sb-view") !== "board" &&
              result.primary !== result.expected)
              ? [`${result.primary} primary, ${result.expected} expected`]
              : []),
          ];
        },
      );
    });
    found.push(...lines.map((line) => `${name} at ${width}: ${line}`));
  }
  return found;
}

test("every view keeps one outlined action per area", async ({ browser }) => {
  test.setTimeout(240_000);
  const found: string[] = [];

  const context = await newContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  for (const [view, path] of [
    ["landing", "/"],
    ["new-board", "/new"],
    ["impressum", "/impressum"],
    ["barrierefreiheit", "/barrierefreiheit"],
    ["not-found", "/does-not-exist"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    found.push(...(await levels(page, view)));
  }

  const anna = page;
  await anna.goto("/new");
  await anna.getByRole("textbox").fill("Sprint 50 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  found.push(...(await levels(anna, "join")));
  await join(anna, "Anna");

  const benContext = await newContext(browser, { reducedMotion: "reduce" });
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Ben");
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);
  found.push(...(await levels(anna, "lobby")));
  found.push(...(await levels(ben, "lobby (member)")));
  await anna.getByTestId("invite-button").click();
  await expect(anna.getByTestId("invite-panel")).toBeVisible();
  found.push(...(await levels(anna, "invite dialog")));
  await anna.getByTestId("invite-panel-close").click();

  await anna.getByTestId("board-menu").click();
  await anna.getByTestId("menu-settings").click();
  await expect(anna.getByTestId("settings-back")).toBeVisible();
  found.push(...(await levels(anna, "settings")));
  await anna.getByTestId("settings-back").click();

  await anna.getByTestId("board-menu").click();
  await anna.getByTestId("delete-board").click();
  await expect(anna.getByTestId("delete-board-confirm")).toBeVisible();
  found.push(...(await levels(anna, "delete board dialog")));
  await anna.keyboard.press("Escape");
  await expect(anna.getByTestId("delete-board-confirm")).toBeHidden();

  for (const [phase, name] of [
    [/write|schreiben/i, "write"],
    [/present|vorstellen/i, "present"],
    [/group|gruppieren/i, "group"],
    [/vote|abstimmen/i, "vote"],
    [/discuss|diskutieren/i, "discuss"],
    [/close|abschluss/i, "close"],
  ] as const) {
    await anna.getByTestId("phase-next").click();
    await expect(anna.getByTestId("phase-compact")).toContainText(phase);
    await expect(ben.getByTestId("phase-compact")).toContainText(phase);
    if (name === "write") {
      for (const [who, text] of [
        [anna, "Deploys are slow on Fridays"],
        [ben, "Keep the short stand-ups"],
      ] as const) {
        const composer = who.getByPlaceholder(/write a note|notiz schreiben/i);
        await composer.first().fill(text);
        await composer.first().press("Enter");
        await expect(who.getByText(text)).toBeVisible();
      }
    }
    found.push(...(await levels(anna, name)));
    found.push(...(await levels(ben, `${name} (member)`)));
    if (name === "write") {
      // A card's own controls: the arrange panel, the ⋯ menu, editing and
      // the delete dialog.
      const card = anna
        .getByTestId("note-card")
        .filter({ hasText: "Deploys are slow on Fridays" });
      await card.getByTestId("note-arrange-toggle").click();
      await expect(card.getByTestId("note-arrange")).toBeVisible();
      found.push(...(await levels(anna, "card arrange panel")));
      await card.getByTestId("note-arrange-toggle").click();
      // A menu closes when the width changes: opened again for each.
      const menuOpen = async () => {
        if (!(await anna.getByTestId("note-edit").isVisible()))
          await card.getByTestId("note-menu").click();
        await expect(anna.getByTestId("note-edit")).toBeVisible();
      };
      found.push(...(await levels(anna, "card menu", menuOpen)));
      await menuOpen();
      await anna.getByTestId("note-edit").click();
      await expect(card.locator("textarea")).toBeVisible();
      found.push(...(await levels(anna, "card editing")));
      await card.getByRole("button", { name: /^(cancel|abbrechen)$/i }).click();
      await expect(card.locator("textarea")).toBeHidden();
      await card.getByTestId("note-menu").click();
      await anna.getByTestId("note-delete").click();
      await expect(anna.getByTestId("note-delete-confirm")).toBeVisible();
      found.push(...(await levels(anna, "card delete dialog")));
      await anna.keyboard.press("Escape");
      await expect(anna.getByTestId("note-delete-confirm")).toBeHidden();
    }
    if (name === "present") {
      await anna.getByTestId("spin-button").click();
      await expect(anna.getByTestId("wheel-overlay")).toBeVisible();
      found.push(...(await levels(anna, "wheel")));
      await anna.getByTestId("wheel-overlay-close").click();
      await expect(anna.getByTestId("wheel-overlay")).toBeHidden();
    }
    if (name === "vote") {
      await anna.getByTestId("vote-settings").click();
      found.push(...(await levels(anna, "vote settings dialog")));
      await anna.keyboard.press("Escape");
    }
    if (name === "close") {
      await anna.getByTestId("kudos-gif").click();
      await expect(anna.getByTestId("gif-sheet")).toBeVisible();
      found.push(...(await levels(anna, "gif sheet")));
      await anna.keyboard.press("Escape");
      await anna.getByTestId("emoji-open").click();
      found.push(...(await levels(anna, "emoji sheet")));
      await anna.keyboard.press("Escape");
    }
  }

  await anna.getByTestId("phase-next").click();
  await expect(anna.getByTestId("results-header")).toBeVisible();
  await expect(ben.getByTestId("results-header")).toBeVisible();
  found.push(...(await levels(anna, "results")));
  found.push(...(await levels(ben, "results (member)")));

  await Promise.all([context.close(), benContext.close()]);
  expect(found).toEqual([]);
});

// The canvas layout has its own keys over the canvas: the zoom and the
// facilitator's zones.
test("the canvas keeps one outlined action per area", async ({ browser }) => {
  const context = await newContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Canvas retro");
  await page.getByTestId("home-layout-canvas").click();
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Anna");
  await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("canvas-viewport")).toBeVisible();
  // The canvas is drawn from 640 px on; under it the zones are columns.
  const found = await levels(page, "canvas", async (width) => {
    const canvas = page.locator("[data-canvas-control]");
    if (width >= 640) await expect(canvas).toBeVisible();
    else await expect(canvas).toHaveCount(0);
  });

  // The facilitator's zone panel and a card's arrange panel exist only on
  // the canvas, so only at the desktop width: under 640 px the zones are
  // columns, and the panels would be gone when it comes back.
  const desktop = [1440];
  await page.getByTestId("zones-toggle").click();
  await expect(page.getByTestId("zones-panel")).toBeVisible();
  found.push(...(await levels(page, "zone panel", undefined, desktop)));
  await page.getByTestId("zones-close").click();
  await expect(page.getByTestId("zones-panel")).toHaveCount(0);
  await page.getByTestId("canvas-add-note").click();
  await page.getByRole("menuitem").first().click();
  await page.getByTestId("canvas-composer").fill("Deploys are slow");
  await page.keyboard.press("Enter");
  await page.getByTestId("note-arrange-toggle").click();
  await expect(page.getByTestId("note-arrange")).toBeVisible();
  found.push(...(await levels(page, "canvas card panel", undefined, desktop)));
  await context.close();
  expect(found).toEqual([]);
});
