// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { templateColumnNames } from "@retrobeam/shared";

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

const cardClass =
  "rounded-xl border border-(--sb-color-border) bg-(--sb-color-surface) p-3";

// BoardColumns' team-cards block. Its hint text is one step darker here
// (text-muted): on the landing page it is a sentence to read, not an ambient
// count.
function HiddenNotes({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-dashed border-(--sb-color-border-strong) px-3 py-2">
      <div className="space-y-1.5">
        <div className="h-2 w-4/5 rounded bg-(--sb-color-border)" />
        <div className="h-2 w-3/5 rounded bg-(--sb-color-border)" />
      </div>
      <p className="mt-2 text-xs text-(--sb-color-text-muted)">
        {t("landing.preview.hiddenNotes", { count })}
      </p>
    </div>
  );
}

function Card({ text, author }: { text: string; author: string }) {
  return (
    <div className={cardClass}>
      <p className="text-sm text-(--sb-color-text)">{text}</p>
      <p className="mt-2 text-xs text-(--sb-color-text-muted)">{author}</p>
    </div>
  );
}

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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-(--sb-color-border) px-4 py-3">
          <span className="text-sm font-semibold text-(--sb-color-text)">
            {t("landing.preview.boardName")}
          </span>
          {/* Wraps on narrow frames, where the app's own stepper would run
              off the edge. Every step carries its separator and the list is
              pulled left by one separator width inside a clipping box, so the
              first step of EACH line — not just the first overall — starts
              without a stray "·". */}
          <div className="overflow-hidden">
            <ol className="-ml-3 flex flex-wrap items-center gap-y-1.5">
              {PHASES.map((step) => (
                <li key={step} className="flex items-center">
                  {/* contrast-ok: decorative separator */}
                  <span className="w-3 text-center text-(--sb-color-text-muted)">
                    ·
                  </span>
                  <span
                    className={
                      step === "write"
                        ? "mx-0.5 rounded-full bg-(--sb-color-accent) px-2.5 py-0.5 text-sm font-medium text-(--sb-color-on-accent)"
                        : "px-1 text-sm text-(--sb-color-text-muted)"
                    }
                  >
                    {t(`phase.${step}`)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="grid gap-3 bg-(--sb-color-surface-sunken) p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <h3 className="truncate text-sm font-semibold text-(--sb-color-text-muted)">
              {columns[0]}
            </h3>
            <Card
              text={t("landing.preview.note1")}
              author={t("landing.preview.author1")}
            />
            <HiddenNotes count={HIDDEN_COUNTS[0]} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="truncate text-sm font-semibold text-(--sb-color-text-muted)">
              {columns[1]}
            </h3>
            <Card
              text={t("landing.preview.note2")}
              author={t("landing.preview.author2")}
            />
            <HiddenNotes count={HIDDEN_COUNTS[1]} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="truncate text-sm font-semibold text-(--sb-color-text-muted)">
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
