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
});
export type GifSearchResponse = z.infer<typeof gifSearchResponseSchema>;

// Board-scoped on purpose: the route is rate limited per IP and refuses to
// call the provider at all when the board has GIFs switched off, so a caller
// without a board capability cannot spend the operator's search quota.
export async function searchGifs(
  boardId: string,
  query: string,
  locale: string,
): Promise<GifSearchResponse> {
  const params = new URLSearchParams({ q: query, locale });
  const response = await fetch(
    `/api/boards/${boardId}/gifs/search?${params.toString()}`,
  );
  if (!response.ok) return { configured: false, gifs: [] };
  return gifSearchResponseSchema.parse(await response.json());
}
