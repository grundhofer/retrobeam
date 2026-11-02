// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { MemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import i18n, { setLanguage } from "../i18n.js";
import { LanguageSwitch } from "./LanguageSwitch.js";

afterEach(() => {
  setLanguage("en");
  localStorage.clear();
});

test("without a language URL, DE / EN is a choice that stores sb-lang", async () => {
  setLanguage("en");
  const changes: string[] = [];
  const listener = (event: Event) =>
    changes.push((event as CustomEvent<{ lang: string }>).detail.lang);
  document.addEventListener("sb-language-change", listener);
  const screen = await render(
    <MemoryRouter>
      <LanguageSwitch />
    </MemoryRouter>,
  );
  const english = screen.getByRole("radio", { name: "EN" });
  const german = screen.getByRole("radio", { name: "DE" });
  await expect.element(english).toBeChecked();

  await userEvent.click(screen.getByText("DE", { exact: true }));
  await expect.element(german).toBeChecked();
  expect(i18n.language).toBe("de");
  expect(document.documentElement.lang).toBe("de");
  expect(localStorage.getItem("sb-lang")).toBe("de");
  expect(changes).toEqual(["de"]);
  document.removeEventListener("sb-language-change", listener);
});

test("two choices on one page are separate radio groups", async () => {
  const screen = await render(
    <MemoryRouter>
      <LanguageSwitch />
      <LanguageSwitch />
    </MemoryRouter>,
  );
  const names = Array.from(
    screen.container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    (radio) => radio.name,
  );
  expect(new Set(names).size).toBe(2);
});

test("with a language URL, both codes are links and the current one is marked", async () => {
  setLanguage("de");
  const screen = await render(
    <MemoryRouter initialEntries={["/impressum"]}>
      <LanguageSwitch to="/imprint" />
    </MemoryRouter>,
  );
  const german = screen.getByRole("link", { name: "DE" });
  const english = screen.getByRole("link", { name: "EN" });
  expect(german.element().getAttribute("aria-current")).toBe("true");
  expect(german.element().getAttribute("href")).toBe("/impressum");
  expect(english.element().getAttribute("href")).toBe("/imprint");
  expect(english.element().getAttribute("hreflang")).toBe("en");
  expect(english.element().getAttribute("aria-current")).toBeNull();
});
