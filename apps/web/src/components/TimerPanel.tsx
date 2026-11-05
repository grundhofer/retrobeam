// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Timer } from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { timeBox } from "../lib/timeBox.js";
import { useNow } from "../lib/useNow.js";
import { useBoardStore } from "../store/boardStore.js";
import { Icon } from "./Icon.js";

// The remaining time of the phase's time box as words (sebaro RB-1, owner
// D104 (8)): „noch 3 Min.“ in the line under the board's name, „Noch 3 Min.“
// as a sentence in the action zone. Its own small component with its own
// clock, so the board does not re-render every second; the words change at
// most once a minute, so a status region holding them speaks at most once a
// minute. Nothing for an idle timer.
export function TimeLeft({
  timer,
  form,
}: {
  timer: Timer;
  form: "line" | "sentence";
}) {
  const { t } = useTranslation();
  const clockOffsetMs = useBoardStore((store) => store.clockOffsetMs);
  const now = useNow();
  const box = timeBox(timer, now + clockOffsetMs);
  const key = `timer.${form}`;
  switch (box.kind) {
    case "idle":
      return null;
    case "running":
      return <>{t(`${key}.left`, { count: box.minutes })}</>;
    case "paused":
      return <>{t(`${key}.paused`, { count: box.minutes })}</>;
    case "up":
      return <>{t(`${key}.up`)}</>;
  }
}

// The facilitator's time box keys (RB-1): a length to start with, then
// „Pause“ / „Weiter“, „+1 Min.“ and „Stopp“, all secondary. Members have no
// keys here; they read the time in the head and the action zone. The chime
// at the end is gone (owner, 2026-11-05: sebaro's time box has no sound).
export function TimerPanel({
  timer,
  isAdmin,
}: {
  timer: Timer;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  if (!isAdmin) return null;

  const running = timer.endsAt !== null;
  const paused = timer.pausedRemainingMs !== null;
  const idle = !running && !paused;
  const key = "sb-secondary-action sb-secondary-action--compact";

  return (
    <div
      role="group"
      aria-label={t("timer.label")}
      data-testid="timer-panel"
      className="sb-cluster"
    >
      {idle ? (
        [5, 10, 15].map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() =>
              send({ type: "admin.timer.start", durationSec: minutes * 60 })
            }
            className={key}
          >
            {minutes === 5 ? <Icon name="timer" size={20} /> : null}
            {t("timer.minutes", { count: minutes })}
          </button>
        ))
      ) : (
        <>
          {running ? (
            <button
              type="button"
              onClick={() => send({ type: "admin.timer.pause" })}
              className={key}
            >
              <Icon name="pause" size={20} />
              {t("timer.pause")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => send({ type: "admin.timer.resume" })}
              className={key}
            >
              <Icon name="play" size={20} />
              {t("timer.resume")}
            </button>
          )}
          <button
            type="button"
            onClick={() => send({ type: "admin.timer.extend", addSec: 60 })}
            className={key}
          >
            {t("timer.extend")}
          </button>
          <button
            type="button"
            onClick={() => send({ type: "admin.timer.stop" })}
            className={key}
          >
            {t("timer.stop")}
          </button>
        </>
      )}
    </div>
  );
}
