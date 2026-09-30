// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { MemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import i18n from "../i18n.js";
import { HomePage } from "./HomePage.js";

// Anonymity is chosen here and nowhere else — it cannot be switched on or off
// once the board exists. So the form has to say that BEFORE the box is ticked,
// and the choice has to actually reach the create request.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Capture the create request's body and answer it with a fresh board. */
function captureCreate(): { body: Record<string, unknown> | null } {
  const seen: { body: Record<string, unknown> | null } = { body: null };
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).endsWith("/api/boards"))
      return realFetch(input as RequestInfo, init);
    seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(
      new Response(
        JSON.stringify({ boardId: "c".repeat(32), adminToken: "d".repeat(32) }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;
  return seen;
}

async function fillForm() {
  const screen = await render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
  await screen
    .getByPlaceholder(i18n.t("home.boardNamePlaceholder"))
    .fill("Sprint 42");
  return screen;
}

test("an anonymous board is opt-in, and the form says it is permanent", async () => {
  const seen = captureCreate();
  const screen = await fillForm();
  const box = screen.getByTestId("home-anonymous");
  await expect.element(box).not.toBeChecked();
  await expect
    .element(screen.getByText(i18n.t("home.anonymousHint")))
    .toBeVisible();

  await box.click();
  await screen.getByRole("button", { name: i18n.t("home.create") }).click();
  await expect.poll(() => seen.body?.anonymous).toBe(true);
});

test("a board left alone is created with names", async () => {
  const seen = captureCreate();
  const screen = await fillForm();
  await screen.getByRole("button", { name: i18n.t("home.create") }).click();
  await expect.poll(() => seen.body?.anonymous).toBe(false);
});

// Whoever creates the board on a laptop and runs it elsewhere must learn that
// the facilitator link exists before they need it, not after.
test("the form says a private facilitator link comes with the board", async () => {
  const screen = await fillForm();
  await expect
    .element(screen.getByText(i18n.t("home.adminLinkHint")))
    .toBeVisible();
});
