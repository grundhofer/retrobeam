// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { templateColumnNames } from "@retrobeam/shared";
import { Icon } from "./Icon.js";

// A still of a board in the write phase, built from the board's own class
// strings (PhaseStepper pill, BoardColumns header, NoteCard and the dashed
// "cards from the team" placeholder) rather than from a screenshot: it never
// goes stale against the app and costs no bytes. It stands in sebaro's
// screenshot frame (sb-shot); participants carry no colour of their own, only
// their name (plan §2.4 F6). The cards inside follow the board's own move in
// stage 5g. Static on purpose: no store, no socket, no interaction.
//
// The placeholder is what makes "private means private" visible: Mira sees
// her own card and only a COUNT of everyone else's, because the server has
// not sent them yet.
const PHASES = [
  "lobby",
  "write",
  "present",
  "vote",
  "discuss",
  "close",
] as const;
const HIDDEN_COUNTS = [3, 2, 4] as const;

// The board's own card patterns (plan stage 4c, with the 5g cards): the
// team's cards as sebaro's hidden card — glyph and word — and a card as
// sebaro's item card with its title and meta line.
function HiddenNotes({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <div className="sb-card sb-card--item sb-card--hidden">
      <p className="sb-card__title">
        <Icon name="eye-off" size={20} />
        {t("landing.preview.hiddenNotes", { count })}
      </p>
    </div>
  );
}

function Card({ text, author }: { text: string; author: string }) {
  return (
    <div className="sb-card sb-card--item">
      <p className="sb-card__title">{text}</p>
      <p className="sb-card__meta">{author}</p>
    </div>
  );
}

const LABEL =
  "[font:var(--sb-type-label)] [letter-spacing:var(--sb-type-label-tracking)]";

export function BoardPreview() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("de") ? "de" : "en";
  const columns = templateColumnNames("went-well", locale);
  return (
    <figure
      data-testid="board-preview"
      aria-label={t("landing.preview.label")}
      className="sb-shot"
    >
      <div
        aria-hidden="true"
        className="sb-shot__frame"
        // sebaro frames a phone screenshot (390 / 844); this still is a wide
        // board drawn as markup, as tall as its content. Inline, because
        // sebaro.css is unlayered and outranks a Tailwind utility.
        style={{ aspectRatio: "auto" }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
          <span className={`${LABEL} font-semibold text-text`}>
            {t("landing.preview.boardName")}
          </span>
          {/* Wraps on narrow frames, where the app's own stepper would run
              off the edge. Every step carries its separator and the list is
              pulled left by one separator width inside a clipping box, so the
              first step of EACH line — not just the first overall — starts
              without a stray "·". */}
          <div className="overflow-hidden">
            <ol className="-ml-3 flex flex-wrap items-center gap-y-1">
              {PHASES.map((step) => (
                <li key={step} className="flex items-center">
                  <span className="w-3 text-center text-text-muted">·</span>
                  <span
                    // The current step as the board's own step line marks it:
                    // ink and weight, not a filled pill.
                    className={
                      step === "write"
                        ? `${LABEL} px-1 font-semibold text-text underline decoration-2 underline-offset-4`
                        : `${LABEL} px-1 text-text-muted`
                    }
                  >
                    {t(`phase.${step}`)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="grid gap-3 bg-surface-sunken p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <h3 className={`${LABEL} truncate font-semibold text-text`}>
              {columns[0]}
            </h3>
            <Card
              text={t("landing.preview.note1")}
              author={t("landing.preview.author1")}
            />
            <HiddenNotes count={HIDDEN_COUNTS[0]} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className={`${LABEL} truncate font-semibold text-text`}>
              {columns[1]}
            </h3>
            <Card
              text={t("landing.preview.note2")}
              author={t("landing.preview.author2")}
            />
            <HiddenNotes count={HIDDEN_COUNTS[1]} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className={`${LABEL} truncate font-semibold text-text`}>
              {columns[2]}
            </h3>
            <Card
              text={t("landing.preview.note3")}
              author={t("landing.preview.author3")}
            />
            <HiddenNotes count={HIDDEN_COUNTS[2]} />
          </div>
        </div>
      </div>
      <figcaption>{t("landing.preview.label")}</figcaption>
    </figure>
  );
}
