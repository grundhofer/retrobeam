// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { PARTICIPANT_COLORS, templateColumnNames } from "@retrobeam/shared";

// A still of a board in the write phase, built from the board's own class
// strings (PhaseStepper pill, BoardColumns header and NoteCard)
// rather than from a screenshot: it never goes stale against the app and
// costs no bytes. It is the one colourful element of the landing page — the
// participant dots — exactly as product spec §12 wants it. Static on purpose:
// no store, no socket, no interaction.
const PHASES = ["lobby", "write", "present", "vote", "discuss"] as const;
const [orange] = PARTICIPANT_COLORS;

const cardClass = "rounded-xl border border-zinc-200 bg-white p-3 shadow-sm";

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
          <ol className="flex items-center gap-1">
            {PHASES.map((step, index) => (
              <li key={step} className="flex items-center gap-1">
                {index > 0 ? <span className="text-zinc-300">·</span> : null}
                <span
                  className={
                    step === "write"
                      ? "rounded-full bg-accent px-2.5 py-0.5 text-sm font-medium text-white"
                      : "px-1 text-sm text-zinc-500"
                  }
                >
                  {t(`phase.${step}`)}
                </span>
              </li>
            ))}
          </ol>
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
          </div>
        </div>
      </div>
    </figure>
  );
}
