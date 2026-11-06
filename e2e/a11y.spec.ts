// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Browser, type Page } from "@playwright/test";
import { waivers } from "./a11y-waivers.js";
import { newContext } from "./helpers.js";

// axe-core (WCAG 2.0/2.1/2.2 A and AA) on every view, light and dark, at a
// phone and a desktop width (docs/sebaro-umbau.md §4.2, gate G9). The same
// axe version and waiver fields as the sebaro guide's check, so one finding
// reads the same in both places. A violation fails unless e2e/a11y-waivers.ts
// names it with a reason: the state before the sebaro move, going away view
// by view, or a trade-off decided under sebaro D103. Chromium only: axe's verdicts are the
// engine's computed styles, and one engine keeps the waivers comparable.
//
// The script is loaded by path (relative to the repo root, where Playwright
// runs) because e2e/ has no Node types to read files with.
const AXE = "node_modules/axe-core/axe.min.js";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// The warm tone (stage 6b, G15: contrast in light, dark and warm) at the
// desktop width: the tone changes only grounds, text and lines.
const RUNS = [
  { width: 390, height: 844, scheme: "light", tone: "cool" },
  { width: 390, height: 844, scheme: "dark", tone: "cool" },
  { width: 1440, height: 900, scheme: "light", tone: "cool" },
  { width: 1440, height: 900, scheme: "dark", tone: "cool" },
  { width: 1440, height: 900, scheme: "light", tone: "warm" },
  { width: 1440, height: 900, scheme: "dark", tone: "warm" },
] as const;

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "axe runs in one engine",
);

// On the sebaro-umbau branch, from stage 2c on, sebaro.css styles every view
// before the view itself has moved to sebaro: a button or link no longer
// keeps Tailwind's colour and size, and in dark mode the not yet converted
// zinc surfaces stay light under light text (docs/sebaro-umbau.md §5.3,
// §5.4). Each view still waiting for its stage is listed here with that stage
// and runs as test.fixme; the stage takes it out, and from then on axe must
// pass there (owner decision of 2026-11-02). The waiver list is not used for
// this, and the list must be empty before the final merge to main.
const KNOWN: Record<string, string> = {};
const known = (...names: string[]) =>
  names
    .filter((name) => name in KNOWN)
    .map((name) => `${name}: ${KNOWN[name]}`)
    .join("; ");

test("every waiver has a page, a rule, a target and a reason", () => {
  for (const waiver of waivers) {
    expect(
      waiver.page && waiver.rule && waiver.target && waiver.reason,
    ).toBeTruthy();
  }
});

// The violations axe finds on the page as it is, minus the waived ones. A
// waiver's target is matched against the node's selector and its HTML, because
// axe picks whichever selector is shortest and that changes with the classes.
// `settle` runs after each resize, for a view that has to adapt to the width
// before it is the view a visitor sees there.
async function audit(
  page: Page,
  name: string,
  settle?: () => Promise<void>,
  runs: readonly (typeof RUNS)[number][] = RUNS,
): Promise<string[]> {
  const found: string[] = [];
  for (const run of runs) {
    await page.setViewportSize({ width: run.width, height: run.height });
    await page.emulateMedia({ colorScheme: run.scheme });
    await page.evaluate((tone) => {
      if (tone === "warm") document.documentElement.dataset.sbTone = "warm";
      else delete document.documentElement.dataset.sbTone;
    }, run.tone);
    await settle?.();
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async (tags) => {
      // @ts-expect-error -- axe is the script injected above
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: tags },
        resultTypes: ["violations"],
      });
      return (
        result.violations as {
          id: string;
          nodes: { target: string[]; html: string }[];
        }[]
      ).flatMap((v) =>
        v.nodes.map((n) => ({
          rule: v.id,
          target: n.target.join(" "),
          html: n.html,
        })),
      );
    }, TAGS);
    for (const { rule, target, html } of violations) {
      const waived = waivers.some(
        (w) =>
          w.page === name &&
          w.rule === rule &&
          `${target} ${html}`.includes(w.target),
      );
      if (!waived)
        found.push(
          `${name} ${run.width}/${run.scheme}/${run.tone}: ${rule} at ${target} ${html}`,
        );
    }
  }
  return found;
}

for (const [name, path] of [
  ["landing", "/"],
  ["new-board", "/new"],
  ["impressum", "/impressum"],
  ["datenschutz", "/datenschutz"],
  ["imprint", "/imprint"],
  ["privacy", "/privacy"],
  ["barrierefreiheit", "/barrierefreiheit"],
  ["accessibility", "/accessibility"],
  ["not-found", "/does-not-exist"],
] as const) {
  test(`axe: ${name}`, async ({ browser }) => {
    test.fixme(known(name) !== "", known(name));
    const context = await newContext(browser);
    const page = await context.newPage();
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await audit(page, name)).toEqual([]);
    await context.close();
  });
}

// The runs above have an English browser. A German browser renders the same
// views in German, with DE chosen in the header's language choice, checked
// here on the views that carry no waiver.
for (const [name, path] of [
  ["new-board", "/new"],
  ["not-found", "/does-not-exist"],
] as const) {
  test(`axe: ${name} in a German browser`, async ({ browser }) => {
    test.fixme(known(name) !== "", known(name));
    const context = await newContext(browser, { locale: "de-DE" });
    const page = await context.newPage();
    await page.goto(path);
    await expect(
      page.getByRole("group", { name: "Sprache" }).getByRole("radio", {
        name: "DE",
      }),
    ).toBeChecked();
    expect(await audit(page, name)).toEqual([]);
    await context.close();
  });
}

// One board, pictured in the lobby and the write phase: the two screens every
// participant sees, each its own test, so the lobby (done in stage 5b) is held
// to axe while the write phase still waits for its stages. The later phases
// follow as their views move to sebaro.
async function joinedBoard(browser: Browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 50 retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
  return { context, page };
}

test("axe: board lobby", async ({ browser }) => {
  test.fixme(known("board-lobby") !== "", known("board-lobby"));
  const { context, page } = await joinedBoard(browser);
  expect(await audit(page, "board-lobby")).toEqual([]);
  await context.close();
});

test("axe: board write", async ({ browser }) => {
  test.fixme(known("board-write") !== "", known("board-write"));
  const { context, page } = await joinedBoard(browser);
  await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("phase-compact")).toContainText(
    /write|schreiben/i,
  );
  expect(await audit(page, "board-write")).toEqual([]);
  await context.close();
});

// The canvas, with a card's arrange panel open on its move and step options, then the
// facilitator's zone panel: the drags' keyboard twins have to pass the same
// audit as the rest of the write phase, at the zoom a visitor gets — the
// fitted one, refitted at each width. The first audit of the canvas at all,
// hence its waivers: the controls drawn in the zoomed world, which shrink
// below 24px with it.
test("axe: canvas arrange panel", async ({ browser }) => {
  test.fixme(
    known("board-canvas-arrange") !== "",
    known("board-canvas-arrange"),
  );
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 51 retro");
  await page.getByTestId("home-layout-canvas").click();
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
  await page.getByTestId("phase-next").click();
  await page.getByTestId("canvas-add-note").click();
  await page.getByRole("menuitem").first().click();
  await page.getByTestId("canvas-composer").fill("Deploys are slow");
  await page.keyboard.press("Enter");
  // The new card fades in; mid-fade its text would fail contrast.
  await expect(page.getByTestId("note-card")).toHaveCSS("opacity", "1");
  const toggle = page.getByTestId("note-arrange-toggle");
  const panel = page.getByTestId("note-arrange");
  const fit = page.getByRole("button", {
    name: /fit to screen|an fenster anpassen/i,
  });

  // The canvas is drawn from 640 px on; under it a canvas board shows its
  // zones as columns (owner, 2026-11-05), audited at the end.
  const wide = RUNS.filter((run) => run.width >= 640);
  expect(
    await audit(
      page,
      "board-canvas-arrange",
      async () => {
        // Fitted to this width, then the panel opened the way a visitor would.
        if (await panel.isVisible()) {
          await toggle.focus();
          await page.keyboard.press("Enter");
        }
        await fit.click();
        // Off the key again: a hovered key fades its fill when the scheme
        // changes, and axe would read the frame in between (sebaro's keys
        // fade their background).
        await page.mouse.move(0, 0);
        await toggle.focus();
        await page.keyboard.press("Enter");
        // axe skips what is off screen; the panel has to be there to count.
        await expect(panel).toBeInViewport({ ratio: 1 });
      },
      wide,
    ),
  ).toEqual([]);

  // The facilitator's zone panel, the zone drag's twin: the same canvas, the
  // card's panel closed.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);
  const zones = page.getByTestId("zones-toggle");
  const zonePanel = page.getByTestId("zones-panel");
  expect(
    await audit(
      page,
      "board-canvas-arrange",
      async () => {
        if (!(await zonePanel.isVisible())) await zones.click();
        await fit.click();
        await page.mouse.move(0, 0);
        await expect(zonePanel).toBeInViewport({ ratio: 1 });
      },
      wide,
    ),
  ).toEqual([]);

  // On a phone the same board is the swiping columns, with the card.
  const narrow = RUNS.filter((run) => run.width < 640);
  expect(
    await audit(
      page,
      "board-canvas-phone",
      async () => {
        // The columns mount at this width and their card fades in, and the
        // scheme just changed: wait until nothing fades any more, or axe
        // reads a colour in between.
        await expect(page.getByTestId("note-card")).toBeVisible();
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.effect?.getComputedTiming().iterations !== Infinity,
              )
              .map((animation) => animation.finished),
          ),
        );
      },
      narrow,
    ),
  ).toEqual([]);
  await context.close();
});
