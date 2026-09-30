// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  BOARD_LOCALES,
  parseTemplateLinkColumns,
  TEMPLATE_KEYS,
  TEMPLATE_LINK_MAX_COLUMNS,
  templateColumnNames,
  templateLinkQuery,
} from "../src/domain/templates.js";
import { columnNameSchema } from "../src/protocol.js";

describe("built-in templates", () => {
  it("every template names its columns in every board language", () => {
    for (const key of TEMPLATE_KEYS) {
      for (const locale of BOARD_LOCALES) {
        const names = templateColumnNames(key, locale);
        expect(names.length, `${key}/${locale}`).toBeGreaterThan(0);
        for (const name of names) {
          expect(columnNameSchema.safeParse(name).success, name).toBe(true);
        }
      }
    }
  });

  it("a template has as many columns in German as in English", () => {
    // A board created in German must be the same retro format, not a cousin.
    for (const key of TEMPLATE_KEYS) {
      expect(templateColumnNames(key, "de").length, key).toBe(
        templateColumnNames(key, "en").length,
      );
    }
  });

  it("offers the curated formats", () => {
    expect(templateColumnNames("daki", "de")).toEqual([
      "Weglassen",
      "Hinzufügen",
      "Beibehalten",
      "Verbessern",
    ]);
    expect(templateColumnNames("rose-bud-thorn", "en")).toEqual([
      "Rose",
      "Bud",
      "Thorn",
    ]);
    expect(templateColumnNames("kalm", "en")).toEqual([
      "Keep",
      "Add",
      "Less",
      "More",
    ]);
  });
});

/** What `/new` reads back: the decoded `columns` value. */
function columnsValue(query: string): string {
  return decodeURIComponent(query.replace(/^\?columns=/, ""));
}

describe("template links", () => {
  it("round-trips a column set through the query", () => {
    const names = ["Gut", "Schlecht & teuer", "Ideen?"];
    const query = templateLinkQuery(names);
    expect(query).toMatch(/^\?columns=[^&]+$/);
    expect(parseTemplateLinkColumns(columnsValue(query))).toEqual(names);
  });

  it("a pipe inside a name cannot split it into two columns", () => {
    const query = templateLinkQuery(["A|B", "C"]);
    expect(parseTemplateLinkColumns(columnsValue(query))).toEqual(["A/B", "C"]);
  });

  it("trims names and rejects a set with any blank or overlong name", () => {
    expect(parseTemplateLinkColumns(" Keep | Drop ")).toEqual(["Keep", "Drop"]);
    expect(parseTemplateLinkColumns("Keep||Drop")).toBeNull();
    expect(parseTemplateLinkColumns("")).toBeNull();
    expect(parseTemplateLinkColumns(`Keep|${"x".repeat(61)}`)).toBeNull();
  });

  it("caps the number of columns", () => {
    const max = Array.from({ length: TEMPLATE_LINK_MAX_COLUMNS }, (_, i) =>
      String(i),
    );
    expect(parseTemplateLinkColumns(max.join("|"))).toEqual(max);
    expect(parseTemplateLinkColumns([...max, "one more"].join("|"))).toBeNull();
  });
});
