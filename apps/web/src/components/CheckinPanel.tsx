// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { IcebreakerId } from "@retrobeam/shared";
import { Icon } from "./Icon.js";

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

  // sebaro: sections on the page's ground; the Prime Directive is a quote
  // with its source (plan stage 5d), and can be put away for this screen.
  return (
    <div className="sb-stack sb-stack--group mx-auto max-w-(--sb-size-measure-prose)">
      <section aria-labelledby="checkin-title" className="sb-stack">
        <h2 id="checkin-title" className="sb-section__title">
          {t("checkin.icebreaker")}
        </h2>
        <p data-testid="icebreaker-question" className="sb-page-lead__text">
          {icebreakerId !== null
            ? t(`icebreaker.${icebreakerId}`)
            : t("checkin.noQuestion")}
        </p>
      </section>

      {showDirective ? (
        <section aria-labelledby="directive-title" className="sb-stack">
          <div className="flex items-center justify-between gap-2">
            <h2 id="directive-title" className="sb-section__title">
              {t("checkin.primeDirectiveTitle")}
            </h2>
            <button
              type="button"
              onClick={() => setShowDirective(false)}
              aria-label={t("checkin.hideDirective")}
              className="sb-icon-button"
            >
              <Icon name="close" />
            </button>
          </div>
          <figure className="sb-quote">
            <blockquote className="sb-quote__text">
              <p>{t("checkin.primeDirective")}</p>
            </blockquote>
            <figcaption className="sb-quote__source">
              {t("checkin.primeDirectiveSource")}
            </figcaption>
          </figure>
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
    <section aria-labelledby="agreements-title" className="sb-stack">
      <h2 id="agreements-title" className="sb-section__title">
        {t("checkin.agreements")}
      </h2>
      <p className="whitespace-pre-wrap">{display}</p>
    </section>
  );
}
