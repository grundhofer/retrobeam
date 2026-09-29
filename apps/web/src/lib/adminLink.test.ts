// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import {
  adminLinkUrl,
  adoptAdminLink,
  takeAdminFragment,
} from "./adminLink.js";
import { loadAdminToken, saveAdminToken } from "./session.js";

const BOARD = "0123456789abcdef0123456789abcdef";
const TOKEN = "fedcba9876543210fedcba9876543210";
// Written out rather than imported: the key IS the contract with every browser
// that already holds a token from before the link existed.
const STORAGE_KEY = `retrobeam.board.${BOARD}.adminToken`;

const startUrl = `${location.pathname}${location.search}`;
afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  history.replaceState(history.state, "", startUrl);
});

test("the link carries the token in the fragment, never the path or query", () => {
  const url = new URL(adminLinkUrl("https://retrobeam.de", BOARD, TOKEN));
  expect(url.pathname).toBe(`/board/${BOARD}`);
  expect(url.search).toBe("");
  expect(url.hash).toBe(`#admin=${TOKEN}`);
});

test("a well-formed token is taken and the fragment emptied", () => {
  expect(takeAdminFragment(`#admin=${TOKEN}`)).toEqual({
    token: TOKEN,
    hash: "",
  });
});

test("other fragment parts survive, in order", () => {
  expect(takeAdminFragment(`#a=1&admin=${TOKEN}&b`)).toEqual({
    token: TOKEN,
    hash: "#a=1&b",
  });
});

test("a fragment without admin= is not ours to touch", () => {
  expect(takeAdminFragment("")).toBeNull();
  expect(takeAdminFragment("#")).toBeNull();
  expect(takeAdminFragment("#section")).toBeNull();
  expect(takeAdminFragment("#administrator=1")).toBeNull();
});

test.each([
  ["truncated", `#admin=${TOKEN.slice(0, 31)}`],
  ["too long", `#admin=${TOKEN}0`],
  ["uppercase", `#admin=${TOKEN.toUpperCase()}`],
  ["not hex", `#admin=${"g".repeat(32)}`],
  ["empty", "#admin="],
  ["bare key", "#admin"],
  ["given twice", `#admin=${TOKEN}&admin=${TOKEN}`],
])("a malformed token (%s) is refused but still stripped", (_, hash) => {
  expect(takeAdminFragment(hash)).toEqual({ token: null, hash: "" });
});

test("adopting stores the token and leaves no trace of it in the URL", () => {
  history.replaceState(history.state, "", `${startUrl}#admin=${TOKEN}`);
  const before = history.length;

  expect(adoptAdminLink(BOARD)).toBe("adopted");
  expect(loadAdminToken(BOARD)).toBe(TOKEN);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(TOKEN);
  expect(location.hash).toBe("");
  expect(location.href).not.toContain(TOKEN);
  // Replaced, not pushed: Back must not lead to the tokened entry.
  expect(history.length).toBe(before);
});

// Nothing rotates a board's token, so a well-formed link that differs from the
// stored one can only be wrong — and any member who knows the board id can make
// one. Adopting it would cost the creator the real token, silently.
test("a link that differs from the stored token is stripped, not adopted", () => {
  const OTHER_BOARD = "abcdef0123456789abcdef0123456789";
  const OTHER = "0123456789abcdef0123456789abcdef";
  const key = `retrobeam.board.${OTHER_BOARD}.adminToken`;
  saveAdminToken(OTHER_BOARD, TOKEN);
  history.replaceState(history.state, "", `${startUrl}#admin=${OTHER}`);

  try {
    expect(adoptAdminLink(OTHER_BOARD)).toBe("conflict");
    expect(loadAdminToken(OTHER_BOARD)).toBe(TOKEN);
    expect(localStorage.getItem(key)).toBe(TOKEN);
    expect(location.href).not.toContain(OTHER);

    // The genuine link, opened again, is still just that.
    history.replaceState(history.state, "", `${startUrl}#admin=${TOKEN}`);
    expect(adoptAdminLink(OTHER_BOARD)).toBe("adopted");
    expect(loadAdminToken(OTHER_BOARD)).toBe(TOKEN);
  } finally {
    localStorage.removeItem(key);
  }
});

test("a malformed link is stripped and stores nothing", () => {
  history.replaceState(history.state, "", `${startUrl}#admin=nope&keep=1`);

  expect(adoptAdminLink(BOARD)).toBe("malformed");
  // localStorage itself: session.ts also keeps an in-memory copy that the
  // adopting test above has already filled for this board.
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(location.hash).toBe("#keep=1");
});

test("no link, no change", () => {
  history.replaceState(history.state, "", `${startUrl}#keep=1`);

  expect(adoptAdminLink(BOARD)).toBe("none");
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(location.hash).toBe("#keep=1");
});
