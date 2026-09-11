// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import "../i18n.js";
import { LandingPage } from "./LandingPage.js";

const page = () => (
  <MemoryRouter>
    <LandingPage />
  </MemoryRouter>
);

const storedKeys = () =>
  Object.keys(localStorage).filter((key) => key.startsWith("retrobeam."));

// The page has one job: invite people to try RetroBeam. The action is repeated
// after the long-form content, and both instances lead to the create form.
test("keeps the create action clear at the start and end", async () => {
  const screen = await render(page());
  const cta = screen.getByTestId("landing-cta");
  await expect.element(cta).toBeVisible();
  expect(cta.element().getAttribute("href")).toBe("/new");
  await expect
    .element(cta)
    .toHaveTextContent(/Retro-Board erstellen|Create a retro board/);
  expect(
    screen.getByTestId("landing-hero").element().querySelectorAll("a"),
  ).toHaveLength(1);
  expect(
    screen
      .getByTestId("landing-hero")
      .element()
      .querySelector('[data-testid="board-preview"]'),
  ).not.toBeNull();

  const bottomCta = screen.getByTestId("landing-bottom-cta");
  expect(bottomCta.element().getAttribute("href")).toBe("/new");
  expect(document.querySelectorAll('a[href="/new"]')).toHaveLength(2);
});

test("answers the FAQ on demand and states that it is not commercial", async () => {
  const screen = await render(page());
  const faq = screen.getByTestId("landing-faq").element();
  expect(
    faq.querySelectorAll('[data-testid="landing-faq-group"]'),
  ).toHaveLength(3);
  const items = faq.querySelectorAll("details");
  expect(items.length).toBeGreaterThanOrEqual(10);
  for (const item of items) expect(item.open).toBe(false);

  await screen.getByText(/wo ist der Haken|where's the catch/).click();
  expect(items[0]?.open).toBe(true);

  await expect
    .element(screen.getByTestId("landing-notice"))
    .toHaveTextContent(/kein Unternehmen|not a company/);
});

// § 25 TDDDG: the case for "no consent banner" rests on the landing page
// storing nothing at all — only a deliberate action (the language toggle, a
// board) may write to localStorage. Rendering and reading the FAQ must not.
test("writes nothing to localStorage", async () => {
  const before = storedKeys();
  const screen = await render(page());
  await screen.getByText(/wo ist der Haken|where's the catch/).click();
  expect(storedKeys()).toEqual(before);
});
