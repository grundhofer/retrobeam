// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import "../i18n.js";
import { ImprintDe } from "./imprint.de.js";
import { ImprintEn } from "./imprint.en.js";
import { PrivacyDe } from "./privacy.de.js";
import { PrivacyEn } from "./privacy.en.js";

// The two languages of a legal text are the same document. Like the i18n
// parity test for UI strings, this fingerprints the language-independent parts
// so a missing section, link, list item, table row or placeholder cannot drift.
function outline(root: Element): string[] {
  return [...root.querySelectorAll("h2, h3, table")].map((element) => {
    const section = element.textContent?.trim().match(/^\d+(?:\.\d+)?/)?.[0];
    return `${element.tagName}:${section ?? ""}`;
  });
}

async function structure(view: React.ReactElement) {
  const screen = await render(<MemoryRouter>{view}</MemoryRouter>);
  const root = screen.container;
  return {
    outline: outline(root),
    h2: root.querySelectorAll("h2").length,
    h3: root.querySelectorAll("h3").length,
    tables: root.querySelectorAll("table").length,
    tableRegions: root.querySelectorAll(
      '.table-scroll[role="region"][tabindex="0"][aria-label]',
    ).length,
    rows: root.querySelectorAll("tr").length,
    items: root.querySelectorAll("li").length,
    marks: root.querySelectorAll("mark").length,
    hrefs: [...root.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    ),
    codeKeys: [...root.querySelectorAll("code")].map((code) =>
      (code.textContent ?? "").replace(/<[^>]+>/g, "<board-id>").toLowerCase(),
    ),
    h1: root.querySelectorAll("h1").length,
    operator: root.querySelectorAll('[data-testid="operator-block"]').length,
    externalUnsafe: [...root.querySelectorAll('a[href^="http"]')].filter(
      (a) =>
        a.getAttribute("target") !== "_blank" ||
        !(a.getAttribute("rel") ?? "").includes("noreferrer"),
    ).length,
  };
}

test("privacy notice: German and English share one structure", async () => {
  const de = await structure(<PrivacyDe />);
  const en = await structure(<PrivacyEn />);
  expect(de.h2).toBeGreaterThanOrEqual(8);
  expect(de.outline).toEqual(en.outline);
  expect(de.tableRegions).toBe(de.tables);
  expect(en.tableRegions).toBe(en.tables);
  expect(de.rows).toBe(en.rows);
  expect(de.items).toBe(en.items);
  expect(de.marks).toBe(en.marks);
  expect(de.hrefs).toEqual(en.hrefs);
  expect(de.codeKeys).toEqual(en.codeKeys);
  expect([de.h1, en.h1]).toEqual([0, 0]); // the page layout owns the title
  expect([de.operator, en.operator]).toEqual([1, 1]);
  expect([de.externalUnsafe, en.externalUnsafe]).toEqual([0, 0]);
});

test("imprint: German and English share one structure", async () => {
  const de = await structure(<ImprintDe />);
  const en = await structure(<ImprintEn />);
  expect(de.outline).toEqual(en.outline);
  expect([de.operator, en.operator]).toEqual([1, 1]);
  expect([de.externalUnsafe, en.externalUnsafe]).toEqual([0, 0]);
});
