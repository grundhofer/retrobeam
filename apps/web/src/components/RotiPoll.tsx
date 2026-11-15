// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useConnection } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";
import { Icon } from "./Icon.js";

const SCORES = [1, 2, 3, 4, 5] as const;

// Return On Time Invested — an anonymous 1-5 closing pulse. Individual scores
// never leave the server, and the average is published once when the poll
// closes (a running mean would be differenceable, see ROTI_MIN_ANONYMOUS).
// `readOnly` renders the published result on the archived board.
//
// sebaro (plan stage 5d): the scores as a segmented choice, the result as a
// rating, a star and „4 von 5“ with its count. Only the average, and only
// from enough answers to stay anonymous (§6.1 g); the server decides both.
export function RotiPoll({ readOnly = false }: { readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const { send } = useConnection();
  const roti = useBoardStore((store) => store.state.roti);
  const name = useId();
  const format = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 1,
  });

  return (
    <section
      data-testid="roti-poll"
      aria-labelledby={`${name}-title`}
      className="sb-stack max-w-(--sb-size-measure-prose)"
    >
      <h2 id={`${name}-title`} className="sb-section__title">
        {t("roti.title")}
      </h2>
      {/* Closed for good once its result is out — also in a retro opened
          again after finishing: a second round of answers could be
          differenced against the published average. */}
      {readOnly || roti.released ? null : (
        <fieldset className="sb-segmented">
          <legend>{t("roti.question")}</legend>
          <div className="sb-segmented__options">
            {SCORES.map((score) => (
              <label key={score} className="sb-segmented__option">
                <input
                  type="radio"
                  name={name}
                  value={score}
                  data-testid={`roti-${score}`}
                  checked={roti.yourScore === score}
                  onChange={() => send({ type: "roti.set", score })}
                />
                <span className="sb-segmented__face">
                  <Icon name="check" size={16} />
                  {score}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {roti.average !== null ? (
        <p data-testid="roti-result" className="sb-rating">
          <Icon name="star--filled" />
          <span className="sb-visually-hidden">{t("roti.rating")} </span>
          <span className="sb-rating__value">
            {t("roti.value", { average: format.format(roti.average) })}
          </span>{" "}
          <span className="sb-rating__count">
            · {t("roti.responses", { count: roti.count })}
          </span>
        </p>
      ) : roti.released ? (
        // Closed with too few answers to summarise anonymously — say so, rather
        // than leave a promise of an average that will never arrive.
        <p data-testid="roti-too-few" className="sb-field__help">
          {t("roti.tooFew")}
        </p>
      ) : roti.count > 0 ? (
        <p data-testid="roti-pending" className="sb-field__help tabular-nums">
          {t("roti.pending", { count: roti.count })}
        </p>
      ) : (
        <p className="sb-field__help">{t("roti.anonymous")}</p>
      )}
    </section>
  );
}
