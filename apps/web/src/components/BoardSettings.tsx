// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  CURSORS_ACTIVATABLE,
  layoutModes,
  type LayoutMode,
  type Phase,
} from "@retrobeam/shared";
import { setLanguage } from "../i18n.js";
import { useConnection } from "../lib/connection.js";
import { Icon } from "./Icon.js";
import { SwitchField } from "./SwitchField.js";

// The board's settings view, as sebaro builds it for a web app without a
// window (spec/03 §6.6, plan §2.4 F2): a view of the app's own shell, not a
// dialog, with the heading „Einstellungen“ and the few settings in one group.
// Every choice applies at once, so there is no action zone and no primary
// action (D74). The board's own switches are the facilitator's; everyone has
// the language. „Farbton“ and „Bewegung immer reduzieren“ join in stage 6b,
// the timer sound in 5c.
export function BoardSettings({
  isAdmin,
  gifsEnabled,
  cursorsEnabled,
  voterNamesEnabled,
  anonymous,
  phase,
  layout,
  retentionAt,
}: {
  isAdmin: boolean;
  gifsEnabled: boolean;
  cursorsEnabled: boolean;
  voterNamesEnabled: boolean;
  anonymous: boolean;
  phase: Phase;
  layout: LayoutMode;
  retentionAt: number | null;
}) {
  const { t, i18n } = useTranslation();
  const { send } = useConnection();
  const language = i18n.language.startsWith("de") ? "de" : "en";
  const languageName = useId();
  const layoutName = useId();
  // §6.1 c: never on an anonymous board, and once voting has started it can
  // only be switched off — the lock is one-way, exactly like the server's.
  const voterNamesBlocked =
    anonymous || (voterNamesLocked(phase) && !voterNamesEnabled);

  return (
    <div data-testid="board-settings" className="sb-container sb-section">
      {/* One column at the reading measure, so a switch stays near its
          label on a wide screen. */}
      <div className="sb-stack sb-stack--group max-w-(--sb-size-measure-prose)">
        <h1>{t("settings.title")}</h1>
        <fieldset className="sb-choice-row">
          <legend>{t("site.language")}</legend>
          <div className="sb-choice-row__options">
            {(["de", "en"] as const).map((lang) => (
              <label key={lang} className="sb-radio">
                <input
                  type="radio"
                  name={languageName}
                  value={lang}
                  checked={language === lang}
                  onChange={() => setLanguage(lang)}
                />
                <span lang={lang}>{t(`settings.languageName.${lang}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {isAdmin ? (
          <>
            <SwitchField
              label={t("menu.gifsEnabled")}
              checked={gifsEnabled}
              testId="gifs-toggle"
              onChange={(enabled) => send({ type: "admin.gifs.set", enabled })}
            />
            {/* Disabled rather than hidden once voting has closed: the lock is
              part of the promise — nobody may be de-blinded in a round they
              already voted in — and a control that silently vanishes teaches
              nothing. The server refuses it either way. */}
            <SwitchField
              label={t("menu.voterNamesEnabled")}
              checked={voterNamesEnabled && !anonymous}
              disabled={voterNamesBlocked}
              help={
                anonymous
                  ? t("menu.voterNamesAnonymous")
                  : voterNamesBlocked
                    ? t("menu.voterNamesLocked")
                    : null
              }
              testId="voter-names-toggle"
              onChange={(enabled) =>
                send({ type: "admin.voterNames.set", enabled })
              }
            />
            {/* Kept behind one emergency feature gate even though the 1 Hz
              client throttle and daily server budget normally make it safe.
              Refused by the server on an anonymous board, like voter names —
              disabled with the reason rather than hidden. */}
            {CURSORS_ACTIVATABLE ? (
              <SwitchField
                label={t("menu.cursorsEnabled")}
                checked={cursorsEnabled && !anonymous}
                disabled={anonymous}
                help={anonymous ? t("menu.cursorsAnonymous") : null}
                testId="cursors-toggle"
                onChange={(enabled) =>
                  send({ type: "admin.cursors.set", enabled })
                }
              />
            ) : null}
            <fieldset className="sb-segmented">
              <legend>{t("menu.layout")}</legend>
              <div className="sb-segmented__options">
                {layoutModes.map((mode) => (
                  <label key={mode} className="sb-segmented__option">
                    <input
                      type="radio"
                      name={layoutName}
                      value={mode}
                      checked={layout === mode}
                      data-testid={`layout-${mode}`}
                      onChange={() =>
                        send({ type: "admin.layout.set", layout: mode })
                      }
                    />
                    <span className="sb-segmented__face">
                      <Icon name="check" size={16} />
                      {t(`menu.layoutMode.${mode}`)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sb-stack">
              <p data-testid="retention">
                {retentionAt === null
                  ? t("menu.retentionKept")
                  : t("menu.retentionNotice", {
                      date: formatDate(retentionAt),
                    })}
              </p>
              {retentionAt !== null ? (
                <p>
                  <button
                    type="button"
                    data-testid="keep-board"
                    onClick={() => send({ type: "admin.board.keep" })}
                    className="sb-secondary-action"
                  >
                    {t("menu.keep")}
                  </button>
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// Once voting has started, the setting is frozen: turning names on afterwards
// would attribute dots that were cast under the blind promise, and nobody can
// take a dot back. The server draws the line at the first dot; the settings
// draw it one step earlier, at the vote phase itself, so the control never
// offers a click the server would refuse.
function voterNamesLocked(phase: Phase): boolean {
  return (
    phase === "vote" ||
    phase === "discuss" ||
    phase === "close" ||
    phase === "done"
  );
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}
