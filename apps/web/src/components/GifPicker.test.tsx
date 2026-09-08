// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { GifPicker } from "./GifPicker.js";

// Four different things stop a GIF search, and each needs its own answer,
// because the useful advice differs: wait seconds, wait an hour, it is broken,
// or it will never work on this board. Collapsing them is how a temporarily
// busy feature gets abandoned permanently — which is exactly what happened
// while our own throttle rendered as "isn't set up for this board".

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answer every GIF search with one canned response. */
function respondWith(status: number, body: unknown) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("/gifs/search"))
      return realFetch(input as RequestInfo, init);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
}

async function searchFor(term: string) {
  const screen = await render(
    <ConnectionProvider
      value={{ boardId: "a".repeat(32), send: () => {}, mutate: () => {} }}
    >
      <GifPicker onPick={() => {}} onClose={() => {}} />
    </ConnectionProvider>,
  );
  await screen.getByTestId("gif-search").fill(term);
  return screen;
}

test("the provider's hourly quota says so, and says it comes back", async () => {
  // The limit a real retro meets first: the key allows 100 searches an hour,
  // account-wide. "Try again in a moment" would send someone straight back
  // into the same wall, so this message names the hour.
  respondWith(200, { configured: true, gifs: [], quotaExceeded: true });
  const screen = await searchFor("celebrate");
  await expect
    .element(screen.getByTestId("gif-quota"))
    .toHaveTextContent(/hour|Stunde/);
});

test("our own per-board budget asks for seconds, not an hour", async () => {
  respondWith(429, { error: "RATE_LIMITED" });
  const screen = await searchFor("celebrate");
  await expect
    .element(screen.getByTestId("gif-throttled"))
    .toHaveTextContent(/seconds|Sekunden/);
});

test("a provider fault reads as a fault, not as a limit", async () => {
  respondWith(200, { configured: true, gifs: [], failed: true });
  const screen = await searchFor("celebrate");
  await expect.element(screen.getByTestId("gif-failed")).toBeInTheDocument();
  expect(screen.getByTestId("gif-quota").elements()).toHaveLength(0);
});

test("switched off for this board is permanent, and worded that way", async () => {
  respondWith(200, { configured: false, gifs: [] });
  const screen = await searchFor("celebrate");
  await expect
    .element(screen.getByText(/isn't set up|nicht eingerichtet/))
    .toBeInTheDocument();
  // A merely busy or quota-spent board must never reach this wording.
  expect(screen.getByTestId("gif-throttled").elements()).toHaveLength(0);
  expect(screen.getByTestId("gif-quota").elements()).toHaveLength(0);
});

test("an empty result is not reported as any kind of limit", async () => {
  respondWith(200, { configured: true, gifs: [] });
  const screen = await searchFor("zzzzzzzz");
  await expect
    .element(screen.getByText(/No GIFs found|Keine GIFs gefunden/))
    .toBeInTheDocument();
  expect(screen.getByTestId("gif-quota").elements()).toHaveLength(0);
  expect(screen.getByTestId("gif-throttled").elements()).toHaveLength(0);
  expect(screen.getByTestId("gif-failed").elements()).toHaveLength(0);
});

test("results render, and carry no referrer to the provider", async () => {
  respondWith(200, {
    configured: true,
    gifs: [
      {
        id: "1",
        url: "https://static.klipy.com/a.gif",
        previewUrl: "https://static.klipy.com/a-sm.gif",
        width: 200,
        height: 100,
      },
    ],
  });
  const screen = await searchFor("celebrate");
  await expect.element(screen.getByTestId("gif-result")).toBeInTheDocument();
  const image = screen.getByTestId("gif-result").element().querySelector("img");
  // The board URL is the capability; it must never travel to a third party.
  expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
});
