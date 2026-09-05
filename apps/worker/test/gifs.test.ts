// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { searchGifs } from "../src/gifs.js";

// The provider integration had no test at all, and it fails CLOSED: a response
// shape we cannot read produces zero results and the picker says "no GIFs
// found" — for every search, forever, with nothing in the logs. That is the
// worst failure mode available, because it is indistinguishable from a working
// integration with an unlucky query.
//
// KLIPY's docs describe media under `files` on each result AND show flat
// url/src fields, so these fixtures cover both plus the nested-variant shape.

/** Swap global fetch for one canned response, restoring afterwards. */
async function withResponse<T>(
  status: number,
  body: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    )) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

const env = { KLIPY_API_KEY: "test-key", GIF_HOST_SUFFIX: "klipy.com" } as Env;

describe("KLIPY response parsing", () => {
  it("reads the flat shape (id/url/src/width/height)", async () => {
    const result = await withResponse(
      200,
      {
        success: true,
        data: [
          {
            id: "abc",
            title: "party",
            url: "https://media.klipy.com/abc.gif",
            src: "https://media.klipy.com/abc-small.gif",
            width: 480,
            height: 270,
          },
        ],
      },
      () => searchGifs(env, "party", "en"),
    );
    expect(result.failed).toBeFalsy();
    expect(result.gifs).toHaveLength(1);
    expect(result.gifs[0]?.url).toBe("https://media.klipy.com/abc.gif");
    expect(result.gifs[0]?.width).toBe(480);
  });

  it("reads media nested under `files` with format variants", async () => {
    const result = await withResponse(
      200,
      {
        data: {
          data: [
            {
              id: "xyz",
              files: {
                hd: {
                  gif: {
                    url: "https://media.klipy.com/xyz-hd.gif",
                    width: 640,
                    height: 360,
                  },
                },
                sm: {
                  gif: {
                    url: "https://media.klipy.com/xyz-sm.gif",
                    width: 160,
                    height: 90,
                  },
                },
              },
            },
          ],
        },
      },
      () => searchGifs(env, "party", "en"),
    );
    expect(result.failed).toBeFalsy();
    expect(result.gifs).toHaveLength(1);
    expect(result.gifs[0]?.url).toBe("https://media.klipy.com/xyz-hd.gif");
    expect(result.gifs[0]?.previewUrl).toBe(
      "https://media.klipy.com/xyz-sm.gif",
    );
    expect(result.gifs[0]?.height).toBe(360);
  });

  it("reads KLIPY's real v1 shape: envelope + file.<size>.<format>", async () => {
    // Confirmed against a working KLIPY v1 client (Activepieces): the envelope
    // is { result, data: { data: [...] } } and each item nests a size bucket
    // containing a format bucket. The parser this replaced stopped one level
    // short and returned nothing for every search.
    const result = await withResponse(
      200,
      {
        result: true,
        data: {
          data: [
            {
              id: 42,
              slug: "celebrate",
              title: "celebrate",
              file: {
                hd: {
                  gif: {
                    url: "https://media.klipy.com/hd.gif",
                    width: 498,
                    height: 280,
                  },
                  webp: { url: "https://media.klipy.com/hd.webp" },
                },
                sm: {
                  gif: {
                    url: "https://media.klipy.com/sm.gif",
                    width: 220,
                    height: 124,
                  },
                },
              },
            },
          ],
          current_page: 1,
          per_page: 24,
          has_next: false,
        },
      },
      () => searchGifs(env, "celebrate", "en"),
    );
    expect(result.failed).toBeFalsy();
    expect(result.gifs).toHaveLength(1);
    expect(result.gifs[0]?.id).toBe("42");
    expect(result.gifs[0]?.url).toBe("https://media.klipy.com/hd.gif");
    expect(result.gifs[0]?.previewUrl).toBe("https://media.klipy.com/sm.gif");
    expect(result.gifs[0]?.width).toBe(498);
    expect(result.gifs[0]?.height).toBe(280);
  });

  it("forces the safe-content filter under the name KLIPY actually reads", async () => {
    // `rating` is GIPHY's parameter; KLIPY's v1 surface ignores it silently, so
    // for as long as that name was sent the filter did nothing at all.
    let requested = "";
    const real = globalThis.fetch;
    globalThis.fetch = ((url: string) => {
      requested = String(url);
      return Promise.resolve(new Response(JSON.stringify({ data: [] })));
    }) as unknown as typeof fetch;
    try {
      await searchGifs(env, "party", "de");
    } finally {
      globalThis.fetch = real;
    }
    expect(requested).toContain("content_filter=g");
    expect(requested).not.toContain("rating=");
    // Locale is passed through, and no per-user identifier ever is.
    expect(requested).toContain("locale=de");
    expect(requested).not.toContain("customer_id");
  });

  it("reads the singular `file` container too", async () => {
    const result = await withResponse(
      200,
      {
        data: [
          {
            id: "one",
            file: {
              md: {
                url: "https://media.klipy.com/one.gif",
                width: 320,
                height: 200,
              },
            },
          },
        ],
      },
      () => searchGifs(env, "party", "en"),
    );
    expect(result.gifs[0]?.url).toBe("https://media.klipy.com/one.gif");
  });

  it("REPORTS a shape it cannot read instead of pretending nothing matched", async () => {
    // The whole point: items came back, none were usable. If this returned an
    // empty list the picker would say "no GIFs found" for every search and
    // nobody would ever learn the integration was broken.
    const result = await withResponse(
      200,
      { data: [{ id: "a", something: "unrecognised" }] },
      () => searchGifs(env, "party", "en"),
    );
    expect(result.failed).toBe(true);
    expect(result.gifs).toEqual([]);
  });

  it("a genuinely empty result is NOT a failure", async () => {
    const result = await withResponse(200, { data: [] }, () =>
      searchGifs(env, "zzzzz", "en"),
    );
    expect(result.failed).toBeFalsy();
    expect(result.gifs).toEqual([]);
  });

  it("reports provider errors rather than swallowing them", async () => {
    const result = await withResponse(429, { error: "slow down" }, () =>
      searchGifs(env, "party", "en"),
    );
    expect(result.failed).toBe(true);
    expect(result.configured).toBe(true);
  });

  it("refuses non-https media", async () => {
    const result = await withResponse(
      200,
      { data: [{ id: "a", url: "http://media.klipy.com/insecure.gif" }] },
      () => searchGifs(env, "party", "en"),
    );
    expect(result.gifs).toEqual([]);
    expect(result.failed).toBe(true);
  });

  it("says 'not configured' when no key is set, without calling the provider", async () => {
    let called = false;
    const real = globalThis.fetch;
    globalThis.fetch = (() => {
      called = true;
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;
    try {
      const result = await searchGifs(
        { KLIPY_API_KEY: "", GIF_HOST_SUFFIX: "klipy.com" } as Env,
        "party",
        "en",
      );
      expect(result.configured).toBe(false);
      expect(result.failed).toBeFalsy();
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = real;
    }
  });
});
