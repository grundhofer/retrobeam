// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

const gifResultSchema = z.object({
  id: z.string(),
  url: z.string(),
  previewUrl: z.string(),
  width: z.number(),
  height: z.number(),
});
export type GifResult = z.infer<typeof gifResultSchema>;

const gifSearchResponseSchema = z.object({
  configured: z.boolean(),
  gifs: z.array(gifResultSchema),
  /** Set by the client, not the server: the lookup itself failed (offline,
   *  provider down, unreadable response) rather than GIFs being switched off. */
  failed: z.boolean().optional(),
  /** Too many searches just now — distinct from `failed` because the honest
   *  advice differs: this one really does clear up in a few seconds. */
  throttled: z.boolean().optional(),
});
export type GifSearchResponse = z.infer<typeof gifSearchResponseSchema>;

// Board-scoped on purpose: the route is rate limited per IP and refuses to
// call the provider at all when the board has GIFs switched off, so a caller
// without a board capability cannot spend the operator's search quota.
export async function searchGifs(
  boardId: string,
  query: string,
  locale: string,
  signal?: AbortSignal,
): Promise<GifSearchResponse> {
  const params = new URLSearchParams({ q: query, locale });
  try {
    const response = await fetch(
      `/api/boards/${boardId}/gifs/search?${params.toString()}`,
      signal ? { signal } : {},
    );
    // 429 and 5xx are transient; "not set up for this board" is not. Reporting
    // a rate limit as "unavailable" told people to give up on a working
    // feature, so the two are distinguished.
    if (response.status === 429) {
      return { configured: true, gifs: [], failed: true, throttled: true };
    }
    if (response.status >= 500) {
      return { configured: true, gifs: [], failed: true };
    }
    if (!response.ok) return { configured: false, gifs: [] };
    return gifSearchResponseSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    // Offline or an unparseable body: never leave the picker spinning.
    return { configured: true, gifs: [], failed: true };
  }
}
