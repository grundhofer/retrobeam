// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import "../i18n.js";
import "../index.css";
import { MAIN_ID, SkipLink } from "./SkipLink.js";

const page = () => (
  <>
    <SkipLink />
    <header>
      <button type="button">Menu</button>
    </header>
    {/* A field, not a button: WebKit on macOS tabs past buttons unless
        the system setting says otherwise. */}
    <main id={MAIN_ID}>
      <input aria-label="Inside" />
    </main>
  </>
);

// Enter on the link hands the focus to <main> without touching the address
// bar — on a board the fragment is the app's (#admin=), see SkipLink.tsx —
// and <main> stops being focusable once the focus moves on.
test("Enter moves the focus to main and leaves the URL alone", async () => {
  const screen = await render(page());
  const url = location.href;
  const link = screen.getByRole("link", {
    name: /^(skip to content|zum inhalt)$/i,
  });

  link.element().focus();
  await userEvent.keyboard("{Enter}");

  await expect.element(screen.getByRole("main")).toHaveFocus();
  expect(location.href).toBe(url);
  await userEvent.tab();
  await expect
    .element(screen.getByRole("textbox", { name: "Inside" }))
    .toHaveFocus();
  expect(screen.getByRole("main").element().hasAttribute("tabindex")).toBe(
    false,
  );
});

// A board still loading renders no <main>: the link then does nothing rather
// than leave #inhalt in the address.
test("without a main the link leaves the URL alone", async () => {
  const screen = await render(<SkipLink />);
  const url = location.href;

  screen
    .getByRole("link", { name: /^(skip to content|zum inhalt)$/i })
    .element()
    .focus();
  await userEvent.keyboard("{Enter}");

  expect(location.href).toBe(url);
});

// Hidden to the eye until it has the focus, then a real, readable box.
test("shows itself only while focused", async () => {
  const screen = await render(page());
  const link = screen.getByRole("link", {
    name: /^(skip to content|zum inhalt)$/i,
  });

  expect(link.element().getBoundingClientRect().width).toBeLessThanOrEqual(1);
  link.element().focus();
  expect(link.element().getBoundingClientRect().width).toBeGreaterThan(1);
});
