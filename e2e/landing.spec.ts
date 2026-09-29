// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "@playwright/test";
import { newContext } from "./helpers.js";

// The landing page has one job: get a visitor to the create form. The hero
// shows the product and leads straight to the form that already works at /new.
test("the landing page invites to try and leads to the create form", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByTestId("brand-logo")).toBeVisible();
  await expect(page.getByRole("link", { name: "RetroBeam" })).toBeVisible();
  await expect(page.getByTestId("landing-hero")).toBeVisible();
  await expect(page.getByTestId("landing-cta")).toHaveCount(1);
  await expect(
    page.getByTestId("landing-hero").getByTestId("board-preview"),
  ).toBeVisible();
  await expect(page.getByTestId("landing-bottom-cta")).toHaveAttribute(
    "href",
    "/new",
  );
  await page.getByTestId("landing-cta").click();

  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole("textbox")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /create board|board erstellen/i }),
  ).toBeVisible();

  await context.close();
});

for (const width of [375, 390]) {
  test(`the landing page fits a ${width}px phone`, async ({ browser }) => {
    const context = await newContext(browser, {
      viewport: { width, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page.getByTestId("landing-cta")).toBeVisible();
    const preview = page
      .getByTestId("landing-hero")
      .getByTestId("board-preview");
    await expect(preview).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    // The preview clips its overflow, so the page staying narrow says nothing
    // about the phase pills inside it: they used to run past its edge and get
    // cut off ("Abstimm…"). Every pill has to sit fully inside the frame.
    const clipped = await preview.evaluate((figure) => {
      const frame = figure.getBoundingClientRect();
      return [...figure.querySelectorAll("ol > li > span:last-child")]
        .map((item) => item.getBoundingClientRect())
        .filter(
          (box) => box.left < frame.left - 0.5 || box.right > frame.right + 0.5,
        ).length;
    });
    expect(clipped).toBe(0);
    await expect(preview.locator("ol > li")).toHaveCount(6);

    await context.close();
  });
}

// Each hero claim is the short form of a FAQ answer with its caveats; the chip
// has to land on that answer AND open it — a fragment alone leaves a <details>
// shut in some engines.
test("a trust chip scrolls to its FAQ answer and opens it", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  const chips = page.getByTestId("landing-trust").getByRole("link");
  expect(await chips.count()).toBeGreaterThanOrEqual(4);
  const chip = page
    .getByTestId("landing-trust")
    .locator('a[href="#faq-where"]');
  await chip.click();
  const answer = page.locator("details#faq-where");
  await expect(answer).toHaveAttribute("open");
  await expect(answer).toBeInViewport();

  // A shared link with the fragment opens the answer on arrival, too.
  await page.goto("/#faq-howLong");
  await expect(page.locator("details#faq-howLong")).toHaveAttribute("open");
  await expect(page.locator("details#faq-howLong")).toBeInViewport();

  await context.close();
});

// Native <details>: the answers are in the DOM for search and screen readers,
// but only unfold when asked.
test("FAQ answers open on demand", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  const faq = page.getByTestId("landing-faq");
  const items = faq.locator("details");
  expect(await items.count()).toBeGreaterThanOrEqual(10);

  await faq.locator("summary").first().click();
  await expect(items.first()).toHaveAttribute("open");

  await context.close();
});

test("the non-commercial notice and the legal pages are reachable in both languages", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByTestId("landing-notice")).toBeVisible();

  await page
    .getByTestId("legal-footer")
    .getByRole("link", { name: /datenschutz|privacy/i })
    .click();
  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Datenschutzerklärung|Privacy notice/,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("operator-block")).toBeVisible();

  await page.goto("/impressum");
  await expect(
    page.getByRole("heading", { level: 1, name: /Impressum|Imprint/ }),
  ).toBeVisible();

  // The toggle flips both the visible text and <html lang>, whichever
  // language the browser started in.
  const before = await page.locator("html").getAttribute("lang");
  expect(before).toMatch(/^(de|en)$/);
  const after = before === "de" ? "en" : "de";
  await page
    .getByRole("button", { name: /Auf Deutsch umschalten|Switch to English/ })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", after);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: after === "de" ? /Impressum/ : /Imprint/,
    }),
  ).toBeVisible();

  await context.close();
});

// The privacy notice argues under §25 TDDDG that merely reading the landing
// page stores nothing on the visitor's device. Opening a FAQ item is the one
// interaction the page offers; the language toggle is deliberately left alone
// here because that choice IS allowed to persist.
test("the landing page writes nothing to localStorage", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  const faq = page.getByTestId("landing-faq");
  await faq.locator("summary").first().click();
  await expect(faq.locator("details").first()).toHaveAttribute("open");

  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("retrobeam.")),
  );
  expect(keys).toEqual([]);

  await context.close();
});

// Link previews (Teams, Slack) and crawlers read the served file and run no
// script, so these assertions go at the raw HTML, not the rendered page.
test("the served HTML carries the link-preview tags and a static fallback", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  for (const tag of [
    /<html lang="de">/,
    /<meta\s+name="description"\s+content="[^"]+"/,
    /<meta property="og:type" content="website"/,
    /<meta property="og:site_name" content="RetroBeam"/,
    /<meta\s+property="og:title"\s+content="[^"]+"/,
    /<meta\s+property="og:description"\s+content="[^"]+"/,
    /<meta property="og:image" content="https:\/\/retrobeam\.de\/og\.png"/,
    /<meta property="og:locale" content="de_DE"/,
    /<meta property="og:locale:alternate" content="en_US"/,
    /<meta name="twitter:card" content="summary_large_image"/,
    /<meta name="theme-color" content="#0e7c7b"/,
    /data-static-fallback[\s\S]*href="\/new"/,
  ]) {
    expect(html).toMatch(tag);
  }
  // The same shell answers /board/<id>: a fixed og:url or canonical would turn
  // every invitation into a link to "/".
  expect(html).not.toMatch(/property="og:url"|rel="canonical"/);

  const image = await request.get("/og.png");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");

  // Real files, not the SPA shell answering 200 for every path.
  const robots = await request.get("/robots.txt");
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /api/");
  expect(robotsText).not.toMatch(/Disallow: \/board/);
  expect(robotsText).not.toContain("<html");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<urlset");
  expect(sitemap).not.toContain("/board/");
});

// Once the app runs, the fallback is gone (createRoot replaced it) and the
// tab title follows the UI language.
test("the static fallback gives way to the app", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("landing-hero")).toBeVisible();
  await expect(page.locator("[data-static-fallback]")).toHaveCount(0);
  await expect(page).toHaveTitle(
    /RetroBeam — (Retros, auf die sich dein Team freut\.|Retros your team will look forward to\.)/,
  );
  await context.close();
});

// A board URL is a capability; one posted publicly must never be indexed.
// The X-Robots-Tag header (public/_headers) only exists behind Cloudflare's
// asset layer, not on the dev server, so this checks the page's own half.
test("a board page is noindex, the landing page is not", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const robots = page.locator('head meta[name="robots"]');

  await page.goto("/");
  await expect(page.getByTestId("landing-hero")).toBeVisible();
  await expect(robots).toHaveCount(0);

  await page.goto(`/board/${"0".repeat(32)}`);
  await expect(robots).toHaveAttribute("content", "noindex");
  // Loaded straight from the link, the board does not keep index.html's
  // German landing title (for link previews) as its tab title.
  await expect(page).toHaveTitle("RetroBeam");

  await context.close();
});

// A mistyped or truncated link — /en included — gets a real not-found page
// with the way home, never the error boundary's "[object Object]".
test("an unknown path shows the not-found page", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  for (const path of ["/en", "/board", "/boards/abc"]) {
    await page.goto(path);
    await expect(page.getByTestId("page-not-found")).toBeVisible();
    await expect(page.getByTestId("error-boundary")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("[object Object]");
  }
  await page
    .getByTestId("page-not-found")
    .getByRole("link", { name: /Zur Startseite|Go to the home page/ })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("landing-hero")).toBeVisible();

  await context.close();
});
