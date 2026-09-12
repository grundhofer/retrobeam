// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { IcebreakerId } from "@retrobeam/shared";

export interface CheckinPanelProps {
  icebreakerId: IcebreakerId | null;
  workingAgreements: string;
}

// The warm-up: an icebreaker question the room answers, the Prime Directive,
// and the prepared working agreements. Configuration happens privately in the
// facilitator's lobby; the live phase is presentation-only for everyone.
export function CheckinPanel({
  icebreakerId,
  workingAgreements,
}: CheckinPanelProps) {
  const { t } = useTranslation();
  const [showDirective, setShowDirective] = useState(true);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-center">
        <p className="mb-2 text-sm font-semibold tracking-wide text-accent uppercase">
          {t("checkin.icebreaker")}
        </p>
        <p
          data-testid="icebreaker-question"
          className="text-xl font-medium text-zinc-800"
        >
          {icebreakerId !== null
            ? t(`icebreaker.${icebreakerId}`)
            : t("checkin.noQuestion")}
        </p>
      </section>

      {showDirective ? (
        <section className="relative rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <button
            type="button"
            onClick={() => setShowDirective(false)}
            aria-label={t("note.cancel")}
            className="absolute top-2 right-3 text-sm text-amber-700/60 hover:text-amber-700"
          >
            ✕
          </button>
          <p className="mb-1 text-sm font-semibold text-amber-800">
            {t("checkin.primeDirectiveTitle")}
          </p>
          <p className="text-sm text-amber-900/90 italic">
            {t("checkin.primeDirective")}
          </p>
        </section>
      ) : null}

      <WorkingAgreements text={workingAgreements} />
    </div>
  );
}

function WorkingAgreements({ text }: { text: string }) {
  const { t } = useTranslation();
  const display = text.trim() === "" ? t("checkin.agreementsDefault") : text;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
          {t("checkin.agreements")}
        </h2>
      </div>
      <p className="text-sm whitespace-pre-wrap text-zinc-700">{display}</p>
    </section>
  );
}
