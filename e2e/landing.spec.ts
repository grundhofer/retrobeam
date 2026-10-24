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
  const context = await newContext(browser, { locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByTestId("landing-notice")).toBeVisible();

  await page
    .getByTestId("legal-footer")
    .getByRole("link", { name: "Datenschutz" })
    .click();
  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Datenschutzerklärung" }),
  ).toBeVisible();
  await expect(page.getByTestId("operator-block")).toBeVisible();

  // On a legal page the switch is a link to the other version (sebaro
  // WEB-10), named in the language it leads to and starting with what it
  // shows (WCAG 2.5.3).
  await page.goto("/impressum");
  await expect(
    page.getByRole("heading", { level: 1, name: "Impressum" }),
  ).toBeVisible();
  const toEnglish = page.getByRole("link", {
    name: "EN, switch to English",
    exact: true,
  });
  await expect(toEnglish).toHaveText("EN");
  await expect(toEnglish).toHaveAttribute("href", "/imprint");
  await expect(toEnglish).toHaveAttribute("lang", "en");
  await expect(toEnglish).toHaveAttribute("hreflang", "en");
  await toEnglish.click();
  await expect(page).toHaveURL(/\/imprint$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Imprint" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("link", { name: "DE, auf Deutsch umschalten", exact: true }),
  ).toHaveAttribute("href", "/impressum");

  await context.close();
});

// A page without a language in its path (F18b) keeps the button: it flips the
// visible text and <html lang>, and stores the choice.
test("the language button switches and stores the UI language", async ({
  browser,
}) => {
  const context = await newContext(browser, { locale: "de-DE" });
  const page = await context.newPage();

  // The other pages without a language URL have the same button, no link.
  for (const path of ["/new", "/does-not-exist"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "EN, switch to English", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /switch to English/ }),
    ).toHaveCount(0);
  }

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");

  const toEnglish = page.getByRole("button", {
    name: "EN, switch to English",
    exact: true,
  });
  await expect(toEnglish).toHaveText("EN");
  await expect(toEnglish).toHaveAttribute("lang", "en");
  await toEnglish.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByTestId("legal-footer").getByRole("link", { name: "Privacy" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("retrobeam.lang")),
  ).toBe("en");
  await expect(
    page.getByRole("button", {
      name: "DE, auf Deutsch umschalten",
      exact: true,
    }),
  ).toHaveAttribute("lang", "de");

  await context.close();
});

// F18: the path decides a legal page's language — content, chrome, title and
// <html lang> — never the stored UI language, which the page leaves alone:
// the next page is in the reader's language again.
for (const view of [
  {
    stored: "de",
    path: "/privacy",
    lang: "en",
    title: "Privacy notice",
    footer: ["/privacy", "/imprint"],
    other: { name: "DE, auf Deutsch umschalten", href: "/datenschutz" },
    home: ["/datenschutz", "/impressum"],
  },
  {
    stored: "en",
    path: "/datenschutz",
    lang: "de",
    title: "Datenschutzerklärung",
    footer: ["/datenschutz", "/impressum"],
    other: { name: "EN, switch to English", href: "/privacy" },
    home: ["/privacy", "/imprint"],
  },
] as const) {
  test(`${view.path} is in its own language when the stored one is ${view.stored}`, async ({
    browser,
  }) => {
    const context = await newContext(browser);
    await context.addInitScript((stored) => {
      localStorage.setItem("retrobeam.lang", stored);
    }, view.stored);
    const page = await context.newPage();
    const footerLinks = page
      .getByTestId("legal-footer")
      .locator("a[href^='/']");

    await page.goto(view.path);
    await expect(
      page.getByRole("heading", { level: 1, name: view.title }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", view.lang);
    await expect(page).toHaveTitle(`${view.title} · RetroBeam`);
    await expect(
      page.getByRole("link", { name: view.other.name, exact: true }),
    ).toHaveAttribute("href", view.other.href);
    expect(
      await footerLinks.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      ),
    ).toEqual(view.footer);

    // Back to the landing page: the reader's language again, still stored.
    await page.getByRole("link", { name: "RetroBeam", exact: true }).click();
    await expect(page.getByTestId("landing-hero")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", view.stored);
    expect(
      await footerLinks.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      ),
    ).toEqual(view.home);
    expect(
      await page.evaluate(() => localStorage.getItem("retrobeam.lang")),
    ).toBe(view.stored);

    await context.close();
  });
}

// The footer has no path of its own to follow, so it links the version in
// the UI language — here from the browser language, nothing stored.
for (const [locale, privacy, imprint] of [
  ["de-DE", ["Datenschutz", "/datenschutz"], ["Impressum", "/impressum"]],
  ["en-US", ["Privacy", "/privacy"], ["Imprint", "/imprint"]],
] as const) {
  test(`the footer links the ${locale} legal pages`, async ({ browser }) => {
    const context = await newContext(browser, { locale });
    const page = await context.newPage();
    await page.goto("/");
    const footer = page.getByTestId("legal-footer");
    for (const [name, href] of [privacy, imprint]) {
      await expect(
        footer.getByRole("link", { name, exact: true }),
      ).toHaveAttribute("href", href);
    }
    await context.close();
  });
}

// Both versions of a legal page name each other for search engines, with
// absolute URLs on the instance host; the landing page has no second version
// and names none, and leaving a legal page takes its links away again.
test("legal pages carry hreflang alternates, the landing page does not", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const alternates = page.locator('head link[rel="alternate"][hreflang]');

  await page.goto("/");
  await expect(page.getByTestId("landing-hero")).toBeVisible();
  await expect(alternates).toHaveCount(0);

  for (const pair of [
    { de: "/impressum", en: "/imprint" },
    { de: "/datenschutz", en: "/privacy" },
  ]) {
    for (const path of [pair.de, pair.en]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(alternates).toHaveCount(2);
      for (const lang of ["de", "en"] as const) {
        await expect(
          page.locator(`head link[rel="alternate"][hreflang="${lang}"]`),
        ).toHaveAttribute("href", `https://retrobeam.de${pair[lang]}`);
      }
    }
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

  await page.getByRole("link", { name: "RetroBeam", exact: true }).click();
  await expect(page.getByTestId("landing-hero")).toBeVisible();
  await expect(alternates).toHaveCount(0);

  await context.close();
});

// The legal pages fall under the same §25 TDDDG argument as the landing page
// below: reading them, and following the switch to the other version, stores
// nothing.
test("reading the legal pages writes nothing to browser storage", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/datenschutz");
  await page
    .getByRole("link", { name: "EN, switch to English", exact: true })
    .click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page
    .getByTestId("legal-footer")
    .getByRole("link", { name: "Imprint" })
    .click();
  await expect(page).toHaveURL(/\/imprint$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Imprint" }),
  ).toBeVisible();

  const keys = await page.evaluate(() => [
    ...Object.keys(localStorage),
    ...Object.keys(sessionStorage),
  ]);
  expect(keys).toEqual([]);

  await context.close();
});

// The privacy notice argues under §25 TDDDG that merely reading the landing
// page stores nothing on the visitor's device. Opening a FAQ item is the one
// interaction the page offers; the language toggle is deliberately left alone
// here because that choice IS allowed to persist. Every key counts, not only
// RetroBeam's own, and sessionStorage too: the sebaro scripts bring keys of
// their own, and none may appear without a choice the visitor made.
test("the landing page writes nothing to browser storage", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/");

  const faq = page.getByTestId("landing-faq");
  await faq.locator("summary").first().click();
  await expect(faq.locator("details").first()).toHaveAttribute("open");

  const keys = await page.evaluate(() => [
    ...Object.keys(localStorage),
    ...Object.keys(sessionStorage),
  ]);
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
  for (const path of ["/impressum", "/imprint", "/datenschutz", "/privacy"]) {
    expect(sitemap).toContain(`<loc>https://retrobeam.de${path}</loc>`);
  }
  expect(sitemap).toContain(
    '<xhtml:link rel="alternate" hreflang="en" href="https://retrobeam.de/privacy"/>',
  );
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
