// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { MemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
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

async function fillForm(entry = "/new") {
  const screen = await render(
    <MemoryRouter initialEntries={[entry]}>
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

// Template links arrive from chat tools and wikis, hand-edited and sometimes
// truncated. A good one presets the form; a bad one must never break it.
test("a template link preselects a built-in template", async () => {
  const seen = captureCreate();
  const screen = await fillForm("/new?template=kalm");
  await expect.element(screen.getByRole("combobox")).toHaveValue("kalm");
  await screen.getByRole("button", { name: i18n.t("home.create") }).click();
  await expect.poll(() => seen.body?.template).toBe("kalm");
  expect(seen.body).not.toHaveProperty("columns");
});

test("a column link replaces the template, and can be dropped for one", async () => {
  const seen = captureCreate();
  const screen = await fillForm(
    `/new?columns=${encodeURIComponent("Gut|Schlecht & teuer|Ideen")}`,
  );
  await expect
    .element(screen.getByTestId("home-link-columns"))
    .toHaveTextContent(
      i18n.t("home.linkColumns", {
        columns: "Gut · Schlecht & teuer · Ideen",
      }),
    );
  await expect.element(screen.getByRole("combobox")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: i18n.t("home.create") }).click();
  await expect
    .poll(() => seen.body?.columns)
    .toEqual(["Gut", "Schlecht & teuer", "Ideen"]);
});

test("dropping the link's columns falls back to the template picker", async () => {
  const seen = captureCreate();
  const screen = await fillForm("/new?columns=Gut|Schlecht");
  await screen.getByTestId("home-link-columns-drop").click();
  await expect
    .element(screen.getByTestId("home-link-columns"))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole("combobox")).toHaveValue("went-well");
  // The button removed itself; focus lands on what replaced it, not <body>.
  await expect.element(screen.getByRole("combobox")).toHaveFocus();
  await screen.getByRole("button", { name: i18n.t("home.create") }).click();
  await expect.poll(() => seen.body?.template).toBe("went-well");
  expect(seen.body).not.toHaveProperty("columns");
});

test("an unreadable link is ignored with a quiet hint", async () => {
  const nine = Array.from({ length: 9 }, (_, i) => `C${i}`).join("|");
  for (const [entry, hint] of [
    ["/new?columns=Gut||Schlecht", "home.linkColumnsInvalid"],
    [`/new?columns=${nine}`, "home.linkColumnsInvalid"],
    [`/new?columns=${"x".repeat(61)}`, "home.linkColumnsInvalid"],
    ["/new?template=nope", "home.linkTemplateInvalid"],
  ] as const) {
    const seen = captureCreate();
    const screen = await fillForm(entry);
    await expect
      .element(screen.getByTestId("home-link-invalid"))
      .toHaveTextContent(i18n.t(hint));
    await expect.element(screen.getByRole("combobox")).toHaveValue("went-well");
    await screen.getByRole("button", { name: i18n.t("home.create") }).click();
    await expect.poll(() => seen.body?.template).toBe("went-well");
    expect(seen.body, entry).not.toHaveProperty("columns");
    await screen.unmount();
  }
});

test("a clean /new says nothing about links", async () => {
  const screen = await fillForm();
  await expect
    .element(screen.getByTestId("home-link-invalid"))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByTestId("home-link-columns"))
    .not.toBeInTheDocument();
});

// An empty name keeps the button pressable (sebaro STA-03): the press sends
// nothing, says at the field what is missing and puts the cursor there.
test("creating without a name says so at the field and sends nothing", async () => {
  const seen = captureCreate();
  const screen = await render(
    <MemoryRouter initialEntries={["/new"]}>
      <HomePage />
    </MemoryRouter>,
  );
  const field = screen.getByRole("textbox", { name: i18n.t("home.boardName") });
  const create = screen.getByRole("button", { name: i18n.t("home.create") });
  await expect.element(create).toBeEnabled();
  screen.getByRole("combobox").element().focus();

  await create.click();
  await expect
    .element(screen.getByText(i18n.t("home.boardNameMissing")))
    .toBeVisible();
  await expect.element(field).toHaveFocus();
  await expect.element(field).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(field)
    .toHaveAccessibleDescription(i18n.t("home.boardNameMissing"));
  // The focus moved, so the field's description carries the message.
  await expect.element(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(seen.body).toBeNull();

  // Spaces alone leave the field empty, so the message stays.
  await field.fill("  ");
  await expect.element(field).toHaveAttribute("aria-invalid", "true");

  await field.fill("Sprint 42");
  await expect
    .element(screen.getByText(i18n.t("home.boardNameMissing")))
    .not.toBeInTheDocument();
  await expect.element(field).not.toHaveAttribute("aria-invalid");
  await create.click();
  await expect.poll(() => seen.body?.name).toBe("Sprint 42");
});

// Enter in the field, which already has the focus: no focus event fires, so a
// live region says the message instead (the press above moves focus and leaves
// the region empty, or the message would be read twice).
test("Enter in the empty name field says the message aloud", async () => {
  const seen = captureCreate();
  const screen = await render(
    <MemoryRouter initialEntries={["/new"]}>
      <HomePage />
    </MemoryRouter>,
  );
  const field = screen.getByRole("textbox", { name: i18n.t("home.boardName") });
  await expect.element(field).toHaveFocus();
  await expect.element(screen.getByRole("status")).toBeEmptyDOMElement();

  await userEvent.keyboard("{Enter}");
  await expect.element(field).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent(i18n.t("home.boardNameMissing"));
  await expect.element(field).toHaveFocus();
  expect(seen.body).toBeNull();
});

// A failed create stays on screen until the next press; an empty-name press
// sends nothing, so the old failure must not stand next to the new message.
test("an empty-name press clears an earlier create failure", async () => {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).endsWith("/api/boards")
      ? Promise.reject(new TypeError("offline"))
      : realFetch(input as RequestInfo, init)) as typeof fetch;
  const screen = await fillForm();
  const create = screen.getByRole("button", { name: i18n.t("home.create") });
  await create.click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(i18n.t("home.createFailed"));

  await screen
    .getByRole("textbox", { name: i18n.t("home.boardName") })
    .fill("");
  await create.click();
  await expect
    .element(screen.getByText(i18n.t("home.boardNameMissing")))
    .toBeVisible();
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
});
