// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// M4 acceptance: the appreciation wall (kudos with anonymity), export, and
// admin delete-now. Reduced motion for deterministic transitions.
test("kudos wall, export and delete-now", async ({ browser }) => {
  const annaContext = await newContext(browser, { reducedMotion: "reduce" });
  const anna = await annaContext.newPage();
  await anna.goto("/");
  await anna.getByRole("textbox").fill("Sprint 45 retro");
  await anna
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(anna).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  const boardUrl = anna.url();
  await join(anna, "Anna");

  const benContext = await newContext(browser, { reducedMotion: "reduce" });
  const ben = await benContext.newPage();
  await ben.goto(boardUrl);
  await join(ben, "Ben");
  await expect(anna.getByTestId("roster-item")).toHaveCount(2);

  // Walk to the close phase (write → present → vote → discuss → close).
  for (let i = 0; i < 5; i++) await anna.getByTestId("phase-next").click();
  await expect(
    anna.getByRole("heading", { name: /appreciation|wertschätzung/i }),
  ).toBeVisible();
  await expect(
    ben.getByRole("heading", { name: /appreciation|wertschätzung/i }),
  ).toBeVisible();

  // Anna sends a named kudo to Ben.
  await anna.getByTestId("kudo-type-great-job").click();
  await anna.getByTestId("kudo-recipient").selectOption({ label: "Ben" });
  await anna.getByTestId("kudo-text").fill("shipped the wheel");
  await anna.getByTestId("kudo-send").click();

  // Both see the card; Ben sees Anna is the sender.
  const bensView = ben
    .getByTestId("kudo-card")
    .filter({ hasText: "shipped the wheel" });
  await expect(bensView).toBeVisible();
  await expect(bensView).toContainText("Anna");

  // Ben sends an ANONYMOUS kudo to Anna.
  await ben.getByTestId("kudo-recipient").selectOption({ label: "Anna" });
  await ben.getByTestId("kudo-text").fill("quietly grateful");
  await ben.getByLabel(/send anonymously|anonym senden/i).check();
  await ben.getByTestId("kudo-send").click();

  // Anna sees the kudo but NOT that it came from Ben.
  const annasView = anna
    .getByTestId("kudo-card")
    .filter({ hasText: "quietly grateful" });
  await expect(annasView).toBeVisible();
  await expect(annasView).toContainText(/anonymous|anonym/i);
  await expect(annasView).not.toContainText("Ben");

  // "Thanks to all": addressed to the room, and the sender is not an option —
  // appreciation is for other people, and the server refuses a self-kudo.
  await expect(
    anna.getByTestId("kudo-recipient").locator("option", { hasText: "Anna" }),
  ).toHaveCount(0);
  // Selected by VALUE, so the assertion does not depend on the UI language.
  await anna.getByTestId("kudo-recipient").selectOption("everyone");
  await anna.getByTestId("kudo-text").fill("great sprint everyone");
  await anna.getByTestId("kudo-send").click();
  const forAll = ben
    .getByTestId("kudo-card")
    .filter({ hasText: "great sprint everyone" });
  await expect(forAll).toBeVisible();
  await expect(forAll).toContainText(/everyone|alle/i);

  // Export: the Markdown download carries the kudos, authors excluded by default.
  const exportUrl =
    new URL(boardUrl).pathname.replace("/board/", "/api/boards/") +
    "/export?format=md";
  const md = await anna.request.get(exportUrl);
  expect(md.ok()).toBe(true);
  const body = await md.text();
  expect(body).toContain("# Sprint 45 retro");
  expect(body).toContain("shipped the wheel");
  expect(body).toContain("Everyone");
  // Kudo SENDERS are excluded by default (recipients are always named — that's
  // inherent to appreciation). Anna's kudo must not attribute her as sender.
  expect(body).not.toContain("— Anna");

  // The PDF comes off the SAME route and the same snapshot — a real document,
  // not a text body with a .pdf name.
  const pdf = await anna.request.get(
    new URL(boardUrl).pathname.replace("/board/", "/api/boards/") +
      "/export?format=pdf",
  );
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 7).toString("latin1")).toBe("%PDF-1.");

  // The condensed scope is chosen in the menu, and the link the menu builds is
  // what the browser downloads — assert the chain, not just the server.
  await openMenu(anna);
  await anna.getByTestId("export-scope-summary").click();
  const summaryHref = await anna.getByTestId("export-md").getAttribute("href");
  expect(summaryHref).toContain("scope=summary");
  const summary = await anna.request.get(summaryHref ?? "");
  const summaryBody = await summary.text();
  expect(summaryBody).toContain("Summary (top cards & action items)");
  expect(summaryBody).not.toContain("shipped the wheel"); // kudos stay out

  // JPEG is drawn by the BROWSER from that same export JSON — the Worker has
  // no canvas — so the only honest test of it is a real download. Done from
  // the menu that is already open: whether a download click also blurs the
  // menu shut differs between engines, so nothing here may depend on it.
  const download = anna.waitForEvent("download");
  await anna.getByTestId("export-jpeg").click();
  const file = await download;
  // A download only fires at all if the canvas produced a real Blob, and the
  // name proves the scope reached the renderer. The BYTES are asserted in
  // apps/web/src/lib/exportImage.test.ts, which decodes the image back and
  // checks it is not the all-black rectangle a missing background produces —
  // this spec is in no workspace package and deliberately has no node types.
  expect(file.suggestedFilename()).toMatch(/-summary\.jpg$/);

  // Finish and archive: the wall persists read-only on the done screen.
  await anna.getByTestId("phase-next").click();
  await expect(
    anna.getByText(/retro finished|retro abgeschlossen/i),
  ).toBeVisible();
  await expect(anna.getByTestId("kudo-card").first()).toBeVisible();

  // Admin delete-now removes the board for everyone.
  await openMenu(anna);
  await anna.getByTestId("delete-board").click();
  await anna.getByTestId("delete-board-confirm").click();
  await expect(ben.getByText(/board deleted|board gelöscht/i)).toBeVisible({
    timeout: 15_000,
  });

  await annaContext.close();
  await benContext.close();
});

test("GIF search degrades gracefully with no key configured", async ({
  browser,
}) => {
  const context = await newContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox").fill("Gif board");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  await join(page, "Solo");
  await page.getByTestId("phase-next").click(); // write

  const columnId = await page
    .getByTestId(/^composer-/)
    .first()
    .getAttribute("data-testid");
  const suffix = columnId!.replace("composer-", "");
  await page.getByTestId(`composer-gif-${suffix}`).click();
  await page.getByTestId("gif-search").fill("celebrate");
  await expect(page.getByText(/isn't set up|nicht eingerichtet/i)).toBeVisible({
    timeout: 10_000,
  });

  await context.close();
});

// The board menu is a blur-closed popover, and engines disagree about whether
// a click inside it (a download link, say) leaves focus there: WebKit does not
// focus a button on click, so the menu stays open where Chromium closes it.
// Toggling blindly therefore closes a menu that was already open. Assert the
// state instead of assuming it.
async function openMenu(page: Page): Promise<void> {
  if (await page.getByTestId("export-md").isVisible()) return;
  await page.getByTestId("board-menu").click();
  await expect(page.getByTestId("export-md")).toBeVisible();
}

async function join(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox").fill(name);
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  await expect(page.getByTestId("roster-item").first()).toBeVisible();
}
