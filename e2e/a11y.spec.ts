// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
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
const RUNS = [
  { width: 390, height: 844, scheme: "light" },
  { width: 390, height: 844, scheme: "dark" },
  { width: 1440, height: 900, scheme: "light" },
  { width: 1440, height: 900, scheme: "dark" },
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
const FRAME = "stages 3a and 3b (site header and footer)";
const KNOWN: Record<string, string> = {
  landing: `${FRAME}, 4c (landing)`,
  "new-board": `${FRAME}, 4a (/new)`,
  impressum: `${FRAME}, 3d (legal pages)`,
  datenschutz: `${FRAME}, 3d (legal pages)`,
  imprint: `${FRAME}, 3d (legal pages)`,
  privacy: `${FRAME}, 3d (legal pages)`,
  barrierefreiheit: `${FRAME}, 3c (accessibility statement)`,
  accessibility: `${FRAME}, 3c (accessibility statement)`,
  "not-found": `${FRAME}, 3e (not-found and error views)`,
  "board-lobby": "stages 5a (board frame) and 5b (lobby)",
  "board-write": "stages 5a (board frame), 5c and 5g (board core)",
  "board-canvas-arrange": "stage 5h (free canvas)",
};
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
): Promise<string[]> {
  const found: string[] = [];
  for (const run of RUNS) {
    await page.setViewportSize({ width: run.width, height: run.height });
    await page.emulateMedia({ colorScheme: run.scheme });
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
          `${name} ${run.width}/${run.scheme}: ${rule} at ${target} ${html}`,
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
// participant sees. The later phases follow as their views move to sebaro.
test("axe: board", async ({ browser }) => {
  test.fixme(
    known("board-lobby", "board-write") !== "",
    known("board-lobby", "board-write"),
  );
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
  const lobby = await audit(page, "board-lobby");

  await page.getByTestId("phase-next").click();
  await expect(page.getByTestId("phase-compact")).toContainText(
    /write|schreiben/i,
  );
  const write = await audit(page, "board-write");

  expect([...lobby, ...write]).toEqual([]);
  await context.close();
});

// The canvas, with a card's ⋯ open on its move and step options, then the
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
  await page.getByTestId("canvas-add-note").first().click();
  await page.getByTestId("canvas-composer").fill("Deploys are slow");
  await page.keyboard.press("Enter");
  // The new card fades in; mid-fade its text would fail contrast.
  await expect(page.getByTestId("note-card")).toHaveCSS("opacity", "1");
  const toggle = page.getByTestId("note-arrange-toggle");
  const panel = page.getByTestId("note-arrange");
  const fit = page.getByRole("button", {
    name: /fit to screen|an fenster anpassen/i,
  });

  expect(
    await audit(page, "board-canvas-arrange", async () => {
      // Fitted to this width, then the panel opened the way a visitor would.
      if (await panel.isVisible()) {
        await toggle.focus();
        await page.keyboard.press("Enter");
      }
      await fit.click();
      await toggle.focus();
      await page.keyboard.press("Enter");
      // axe skips what is off screen; the panel has to be there to count.
      await expect(panel).toBeInViewport({ ratio: 1 });
    }),
  ).toEqual([]);

  // The facilitator's zone panel, the zone drag's twin: the same canvas, the
  // card's panel closed.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);
  const zones = page.getByTestId("zones-toggle");
  const zonePanel = page.getByTestId("zones-panel");
  expect(
    await audit(page, "board-canvas-arrange", async () => {
      if (!(await zonePanel.isVisible())) await zones.click();
      await fit.click();
      await expect(zonePanel).toBeInViewport({ ratio: 1 });
    }),
  ).toEqual([]);
  await context.close();
});
