// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import i18n from "../i18n.js";
import { LEGAL_PATHS } from "../lib/legalPaths.js";
import { LegalFooter } from "./LegalFooter.js";

// The footer links into the app's own routes, so it needs a router around it.
const footer = (openLegalLinksInNewTab = false) => (
  <MemoryRouter>
    <LegalFooter openLegalLinksInNewTab={openLegalLinksInNewTab} />
  </MemoryRouter>
);

// AGPL §0 defines the Appropriate Legal Notices that §5(d) makes mandatory for
// an interactive UI: a copyright notice, the fact that recipients may convey
// the work under this licence, the absence of warranty, and how to view the
// licence. §13 adds the source offer. All five are asserted here — this footer
// is the only place the deployed app discharges them.
test("carries the copyright, licence, warranty and source notices", async () => {
  const screen = await render(footer());

  await expect
    .element(screen.getByText(/© 2026 Sebastian Grundhöfer/))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText(/AGPL-3\.0-or-later/))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText(/Redistribution|Weitergabe/))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText(/no warranty|ohne Gewährleistung/))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: /Source code|Quelltext/ }))
    .toBeInTheDocument();
});

test("both notices resolve into the repository", async () => {
  const screen = await render(footer());
  const links = [
    ...screen.getByTestId("legal-footer").element().querySelectorAll("a"),
  ];

  // Two statutory pages of our own, then the two AGPL notices in the repo.
  expect(links).toHaveLength(4);
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  expect(links.slice(0, 2).map((link) => link.getAttribute("href"))).toEqual([
    LEGAL_PATHS.privacy[lang],
    LEGAL_PATHS.imprint[lang],
  ]);
  for (const link of links.slice(2)) {
    expect(link.getAttribute("href")).toContain(
      "github.com/grundhofer/retrobeam",
    );
  }
  expect(links[2]?.getAttribute("href")).toContain("/LICENSE");
});

// Art. 13 GDPR and § 18 Abs. 1 MStV both require their page to be reachable
// from every screen; the footer is on every screen, so the links live here.
test("links the privacy notice and the imprint", async () => {
  const screen = await render(footer());
  await expect
    .element(screen.getByRole("link", { name: /Datenschutz|Privacy/ }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: /Impressum|Imprint/ }))
    .toBeInTheDocument();
});

// Each legal page has a path per language; the footer links the version in
// the language it is rendered in.
test("links the legal pages in the reader's language", async () => {
  for (const [lng, privacy, imprint] of [
    ["de", "/datenschutz", "/impressum"],
    ["en", "/privacy", "/imprint"],
  ] as const) {
    const screen = await render(
      <I18nextProvider i18n={i18n.cloneInstance({ lng })}>
        {footer()}
      </I18nextProvider>,
    );
    const links = screen.getByTestId("legal-footer").element();
    expect(links.querySelector(`a[href="${privacy}"]`)).not.toBeNull();
    expect(links.querySelector(`a[href="${imprint}"]`)).not.toBeNull();
    await screen.unmount();
  }
});

test("can preserve a live board when opening the legal pages", async () => {
  const screen = await render(footer(true));
  const privacy = screen.getByRole("link", { name: /Datenschutz|Privacy/ });
  const imprint = screen.getByRole("link", { name: /Impressum|Imprint/ });
  expect(privacy.element().getAttribute("target")).toBe("_blank");
  expect(imprint.element().getAttribute("target")).toBe("_blank");
});
