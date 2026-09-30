// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";
import { columnNameSchema } from "../protocol.js";

export const BOARD_LOCALES = ["en", "de"] as const;
export const boardLocaleSchema = z.enum(BOARD_LOCALES);
export type BoardLocale = z.infer<typeof boardLocaleSchema>;

export const TEMPLATE_KEYS = [
  "went-well",
  "start-stop-continue",
  "mad-sad-glad",
  "four-ls",
  "sailboat",
  "starfish",
  "daki",
  "rose-bud-thorn",
  "kalm",
] as const;

export const templateKeySchema = z.enum(TEMPLATE_KEYS);
export type TemplateKey = z.infer<typeof templateKeySchema>;

// Column names are DATA, not UI strings: they are materialized in the
// creator's language at board creation and stay editable afterwards.
const TEMPLATE_COLUMNS: Record<
  TemplateKey,
  Record<BoardLocale, readonly string[]>
> = {
  "went-well": {
    en: ["Went well", "To improve", "Action items"],
    de: ["Lief gut", "Zu verbessern", "Action Items"],
  },
  "start-stop-continue": {
    en: ["Start", "Stop", "Continue"],
    de: ["Anfangen", "Aufhören", "Weitermachen"],
  },
  "mad-sad-glad": {
    en: ["Mad", "Sad", "Glad"],
    de: ["Wütend", "Traurig", "Froh"],
  },
  "four-ls": {
    en: ["Liked", "Learned", "Lacked", "Longed for"],
    de: ["Gefallen", "Gelernt", "Gefehlt", "Gewünscht"],
  },
  sailboat: {
    en: [
      "Wind (pushes us)",
      "Anchors (hold us back)",
      "Rocks (risks ahead)",
      "Island (our goal)",
    ],
    de: [
      "Wind (treibt uns an)",
      "Anker (bremsen uns)",
      "Felsen (Risiken)",
      "Insel (unser Ziel)",
    ],
  },
  starfish: {
    en: ["Keep doing", "Less of", "More of", "Stop doing", "Start doing"],
    de: ["Beibehalten", "Weniger davon", "Mehr davon", "Aufhören", "Anfangen"],
  },
  daki: {
    en: ["Drop", "Add", "Keep", "Improve"],
    de: ["Weglassen", "Hinzufügen", "Beibehalten", "Verbessern"],
  },
  "rose-bud-thorn": {
    en: ["Rose", "Bud", "Thorn"],
    de: ["Rose", "Knospe", "Dorn"],
  },
  kalm: {
    en: ["Keep", "Add", "Less", "More"],
    de: ["Beibehalten", "Hinzufügen", "Weniger", "Mehr"],
  },
};

export function templateColumnNames(
  key: TemplateKey,
  locale: BoardLocale,
): readonly string[] {
  return TEMPLATE_COLUMNS[key][locale];
}

// Template links: `/new?columns=A|B|C` hands a column set to somebody else
// without an account or a stored template — the link IS the template. The
// cap keeps a hand-edited link from minting a board nobody can read on one
// screen; the per-name rule is the one every column rename already obeys.
export const TEMPLATE_LINK_MAX_COLUMNS = 8;
export const templateLinkColumnsSchema = z
  .array(columnNameSchema)
  .min(1)
  .max(TEMPLATE_LINK_MAX_COLUMNS);

const TEMPLATE_LINK_SEPARATOR = "|";

/** The decoded `columns` query value as column names, or null when it is not a
 *  valid set. All or nothing: a link with one bad name is a broken link, and
 *  quietly dropping that column would hand over a template nobody wrote. */
export function parseTemplateLinkColumns(raw: string): string[] | null {
  const parsed = templateLinkColumnsSchema.safeParse(
    raw.split(TEMPLATE_LINK_SEPARATOR),
  );
  return parsed.success ? parsed.data : null;
}

/** The `/new` query for a column set, e.g. `?columns=Keep%7CDrop`. A "|" inside
 *  a name would read as a separator once decoded — whether the link keeps it
 *  literal or a chat tool percent-encodes it — so it becomes "/" here. */
export function templateLinkQuery(names: readonly string[]): string {
  const value = names
    .map((name) => name.trim().replaceAll(TEMPLATE_LINK_SEPARATOR, "/"))
    .join(TEMPLATE_LINK_SEPARATOR);
  return `?columns=${encodeURIComponent(value)}`;
}
