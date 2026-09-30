// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { PARTICIPANT_COLORS, templateColumnNames } from "@retrobeam/shared";

// A still of a board in the write phase, built from the board's own class
// strings (PhaseStepper pill, BoardColumns header, NoteCard and the dashed
// "cards from the team" placeholder) rather than from a screenshot: it never
// goes stale against the app and costs no bytes. It is the one colourful
// element of the landing page — the participant dots — exactly as product
// spec §12 wants it. Static on purpose: no store, no socket, no interaction.
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
const [orange] = PARTICIPANT_COLORS;

const cardClass = "rounded-xl border border-zinc-200 bg-white p-3 shadow-sm";

// BoardColumns' team-cards block. Its hint text is one step darker here
// (zinc-500, not zinc-400): on the landing page it is a sentence to read, not
// an ambient count.
function HiddenNotes({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-3 py-2">
      <div className="space-y-1.5">
        <div className="h-2 w-4/5 rounded bg-zinc-200/70" />
        <div className="h-2 w-3/5 rounded bg-zinc-200/70" />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {t("landing.preview.hiddenNotes", { count })}
      </p>
    </div>
  );
}

function Card({
  text,
  author,
  color,
}: {
  text: string;
  author: string;
  color: string;
}) {
  return (
    <div className={cardClass}>
      <p className="text-sm text-zinc-800">{text}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {author}
      </div>
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
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
    >
      <div aria-hidden="true">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 px-4 py-3">
          <span className="text-sm font-semibold text-zinc-800">
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
                  <span className="w-3 text-center text-zinc-300">·</span>
                  <span
                    className={
                      step === "write"
                        ? "mx-0.5 rounded-full bg-accent px-2.5 py-0.5 text-sm font-medium text-white"
                        : "px-1 text-sm text-zinc-500"
                    }
                  >
                    {t(`phase.${step}`)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="grid gap-3 bg-zinc-50 p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <h3 className="truncate text-sm font-semibold tracking-wide text-zinc-600 uppercase">
              {columns[0]}
            </h3>
            <Card
              text={t("landing.preview.note1")}
              author={t("landing.preview.author1")}
              color={orange}
            />
            <HiddenNotes count={HIDDEN_COUNTS[0]} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="truncate text-sm font-semibold tracking-wide text-zinc-600 uppercase">
              {columns[1]}
            </h3>
            <Card
              text={t("landing.preview.note2")}
              author={t("landing.preview.author2")}
              color={orange}
            />
            <HiddenNotes count={HIDDEN_COUNTS[1]} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="truncate text-sm font-semibold tracking-wide text-zinc-600 uppercase">
              {columns[2]}
            </h3>
            <Card
              text={t("landing.preview.note3")}
              author={t("landing.preview.author3")}
              color={orange}
            />
            <HiddenNotes count={HIDDEN_COUNTS[2]} />
          </div>
        </div>
      </div>
    </figure>
  );
}
