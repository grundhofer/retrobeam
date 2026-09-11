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

// The page has one job: invite people to try RetroBeam. So it carries exactly
// one primary action, and that action is the create form.
test("has exactly one primary action, leading to the create form", async () => {
  const screen = await render(page());
  const cta = screen.getByTestId("landing-cta");
  await expect.element(cta).toBeVisible();
  expect(cta.element().getAttribute("href")).toBe("/new");
  expect(
    screen.getByTestId("landing-hero").element().querySelectorAll("a"),
  ).toHaveLength(1);
});

test("answers the FAQ on demand and states that it is not commercial", async () => {
  const screen = await render(page());
  const faq = screen.getByTestId("landing-faq").element();
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
