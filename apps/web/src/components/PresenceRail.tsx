// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  pickerFinished,
  pickerStyles,
  WHEEL_HOLD_MS,
  type Participant,
  type Phase,
  type PickerStyle,
  type PickerState,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { useNow } from "../lib/useNow.js";
import { useBoardStore } from "../store/boardStore.js";
import { Icon } from "./Icon.js";
import { PersonAvatar } from "./PersonAvatar.js";

export interface PresenceRailProps {
  phase: Phase;
  roster: Participant[];
  readyIds: string[];
  picker: PickerState | null;
  you: Participant;
  isAdmin: boolean;
  /** the presenting round is actually pacing the reveal — false on an anonymous
   *  board (never scoped) and once the board has been handed over */
  scopedRound?: boolean;
  /** anonymous board: nobody is called up, so the presenting phase gets no
   *  rotation board and no cockpit — the server refuses a spin there anyway */
  anonymous?: boolean;
  /** current draw skin — the facilitator switches it from the cockpit */
  pickerStyle?: PickerStyle;
  /** opens the full-screen face-down deck; the rail only launches it */
  onOpenCards?: () => void;
}

// The rail wears three hats depending on the phase, but always as ONE list:
//  - "ready"    (write/vote): each row carries a done glyph; your own toggle
//                sits in a separate bottom bay so it can't read as a label.
//  - "present"  the rotation board + facilitator cockpit + presenter self-advance.
//  - "presence" (discuss): just who is here.
type RailMode = "ready" | "present" | "presence";

function modeForPhase(phase: Phase): RailMode {
  if (phase === "present") return "present";
  if (phase === "write" || phase === "vote") return "ready";
  return "presence";
}

// Flightdeck: one docked right-side rail that is a live crew board for everyone
// and, in the presenting phase, the facilitator's cockpit for driving the round.
export function PresenceRail({
  phase,
  roster,
  readyIds,
  picker,
  you,
  isAdmin,
  scopedRound = false,
  anonymous = false,
  pickerStyle = "wheel",
  onOpenCards,
}: PresenceRailProps) {
  const { t } = useTranslation();
  const { send } = useConnection();
  // An anonymous board reads its cards together, with no speaker: during the
  // presenting phase the rail is just who is here.
  const mode =
    anonymous && phase === "present" ? "presence" : modeForPhase(phase);

  // Same in-flight guard as the old picker panel: no spinning (or hand-picking)
  // while the wheel is still animating.
  const lastSpin = useBoardStore((store) => store.state.lastSpin);
  const clockOffsetMs = useBoardStore((store) => store.clockOffsetMs);
  const now = useNow();
  const spinning =
    lastSpin !== null &&
    now <
      lastSpin.startAt - clockOffsetMs + lastSpin.durationMs + WHEEL_HOLD_MS;

  const onlineCount = roster.filter((p) => p.online).length;
  const youReady = readyIds.includes(you.id);
  const finished = picker !== null && pickerFinished(picker);
  const onlineRemaining =
    picker?.remaining.filter((id) =>
      roster.some((p) => p.id === id && p.online),
    ).length ?? 0;
  const cardCount =
    onlineRemaining > 0 ? onlineRemaining : (picker?.remaining.length ?? 0);

  // Spin control label — spin, then next … until the pool empties.
  const spinLabel =
    picker === null
      ? null
      : picker.remaining.length > 0
        ? picker.current !== null || picker.presented.length > 0
          ? t("picker.next")
          : pickerStyle === "slots"
            ? t("picker.startSlots")
            : t("picker.spin")
        : picker.current !== null
          ? t("picker.finishRound")
          : null;

  const youArePresenting = mode === "present" && picker?.current === you.id;

  // sebaro (plan stage 5f): a column of the page beside the board, its
  // parts as sections, the people as a list. The draw keys are secondary —
  // in the presenting phase the facilitator's primary action is the phase
  // change (F5) — and nothing celebrates with confetti (F7).
  return (
    // Bounded on purpose: a sticky column with no max height and no scroller
    // parks its lower bays — the ready toggle and "done presenting" — below
    // the fold of a viewport that never scrolls them back. The list scrolls,
    // the bays stay pinned. lg:min-h-0 is what makes that work: a flex
    // child's automatic min-height refuses to shrink below its content.
    <aside
      aria-labelledby="rail-title"
      className="sb-stack w-full self-start lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-2rem)] lg:w-80 lg:shrink-0 lg:border-s lg:border-border lg:ps-4"
    >
      <h2 id="rail-title" className="sb-list-header lg:shrink-0">
        {t("board.participants")}{" "}
        <span
          className="sb-list-header__count tabular-nums"
          {...(mode === "ready" ? { "data-testid": "ready-count" } : {})}
        >
          {mode === "ready"
            ? t("ready.count", { ready: readyIds.length, total: onlineCount })
            : t("rail.online", { count: onlineCount })}
        </span>
      </h2>

      {mode === "present" && isAdmin && !finished && spinLabel !== null ? (
        <div className="sb-cluster lg:shrink-0">
          {pickerStyle === "cards" && cardCount > 0 ? (
            <button
              type="button"
              data-testid="open-card-picker"
              aria-busy={spinning || undefined}
              disabled={spinning}
              onClick={onOpenCards}
              className="sb-secondary-action sb-secondary-action--compact"
            >
              <Icon name="pages" size={20} />
              {t("picker.chooseCard")}
            </button>
          ) : (
            <button
              type="button"
              data-testid="spin-button"
              aria-busy={spinning || undefined}
              disabled={spinning}
              onClick={() => send({ type: "admin.picker.spin" })}
              className="sb-secondary-action sb-secondary-action--compact"
            >
              <Icon
                name={pickerStyle === "slots" ? "slots" : "wheel"}
                size={20}
              />
              {spinLabel}
            </button>
          )}
          {picker?.current != null ? (
            <button
              type="button"
              onClick={() => send({ type: "admin.picker.skip" })}
              className="sb-secondary-action sb-secondary-action--compact"
            >
              {t("picker.skip")}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* The draw's SKIN, right beside the button that runs it — the one
          place a facilitator is actually looking when choosing between a
          wheel and a slot machine. Its own bay rather than inside the cockpit
          above: that block hides itself once the rotation is exhausted, and
          the skin is a board setting — a facilitator setting up the next
          round must still be able to change it. */}
      {mode === "present" && isAdmin ? (
        <div className="lg:shrink-0">
          <PickerStyleSelect style={pickerStyle} disabled={spinning} />
        </div>
      ) : null}

      {mode === "present" && finished ? (
        <p
          data-testid="picker-finished"
          className="flex items-center gap-1 lg:shrink-0"
        >
          <Icon name="success" size={20} />
          {t("picker.everyone")}
        </p>
      ) : null}

      <ul
        data-testid="rail-list"
        className="sb-list lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
        aria-live="polite"
      >
        {roster.map((p) => (
          <PresenceRow
            key={p.id}
            participant={p}
            youId={you.id}
            mode={mode}
            ready={readyIds.includes(p.id)}
            picker={picker}
            isAdmin={isAdmin}
            spinning={spinning}
          />
        ))}
      </ul>

      {mode === "ready" ? (
        // One key with a fixed label, its state in aria-pressed and the check
        // (as the check-in's ReadyBar).
        <p className="lg:shrink-0">
          <button
            type="button"
            data-testid="ready-toggle"
            aria-pressed={youReady}
            onClick={() => send({ type: "ready.set", ready: !youReady })}
            className="sb-secondary-action w-full"
          >
            {youReady ? (
              <Icon name="check" size={20} className="text-success" />
            ) : null}
            {t("ready.imDone")}
          </button>
        </p>
      ) : null}

      {youArePresenting ? (
        <div className="sb-stack lg:shrink-0">
          <p className="sb-field__help">{t("rail.youPresenting")}</p>
          <button
            type="button"
            data-testid="present-done"
            onClick={() => send({ type: "picker.done" })}
            className="sb-secondary-action w-full"
          >
            {t("rail.donePresenting")}
            <Icon name="arrow-right" size={20} />
          </button>
        </div>
      ) : mode === "present" && !isAdmin && !finished ? (
        <p className="sb-field__help lg:shrink-0">{t("rail.waiting")}</p>
      ) : null}

      {/* The rotation is missing on purpose here, and a missing wheel with no
          word about it reads as a broken one. */}
      {phase === "present" && anonymous ? (
        <p
          data-testid="present-anonymous-hint"
          className="sb-field__help lg:shrink-0"
        >
          {t("present.anonymous")}
        </p>
      ) : null}

      {/* Without a word about it, a scoped board reads as "where did the cards
          go?" — the room sees each person's cards as the round reaches them. */}
      {mode === "present" && scopedRound ? (
        <p
          data-testid="present-scope-hint"
          className="sb-field__help lg:shrink-0"
        >
          {isAdmin ? t("present.scoped.facilitator") : t("present.scoped.hint")}
        </p>
      ) : null}
    </aside>
  );
}

// The draw skin picker. Sends the same admin.picker.style command the board
// menu used to own; the menu no longer carries a second copy of it, because two
// controls for one setting is how they drift.
function PickerStyleSelect({
  style,
  disabled,
}: {
  style: PickerStyle;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const id = useId();
  return (
    <div className="sb-field sb-field--compact">
      <label htmlFor={id} className="sb-field__label">
        {t("menu.pickerStyle")}
      </label>
      <div className="sb-field__control sb-select">
        <select
          id={id}
          data-testid="picker-style"
          value={style}
          disabled={disabled}
          onChange={(event) =>
            send({
              type: "admin.picker.style",
              style: event.target.value as PickerStyle,
            })
          }
        >
          {pickerStyles.map((value) => (
            <option key={value} value={value}>
              {t(`menu.picker.${value}`)}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" />
      </div>
    </div>
  );
}

type RotationStatus =
  "current" | "presented" | "remaining" | "excluded" | "other";

function rotationStatus(
  picker: PickerState | null,
  id: string,
): RotationStatus {
  if (picker === null) return "other";
  if (picker.current === id) return "current";
  if (picker.presented.includes(id)) return "presented";
  if (picker.remaining.includes(id)) return "remaining";
  if (picker.excluded.includes(id)) return "excluded";
  return "other";
}

function PresenceRow({
  participant,
  youId,
  mode,
  ready,
  picker,
  isAdmin,
  spinning,
}: {
  participant: Participant;
  youId: string;
  mode: RailMode;
  ready: boolean;
  picker: PickerState | null;
  isAdmin: boolean;
  spinning: boolean;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const isYou = participant.id === youId;
  const status =
    mode === "present" ? rotationStatus(picker, participant.id) : "other";
  const isCurrent = status === "current";

  // A list row (sebaro): the avatar, the name and the state in words — never
  // dimmed, never a colour or a glyph alone; the facilitator's keys at the
  // end.
  const meta =
    status === "current"
      ? t("picker.current")
      : status === "presented"
        ? t("rail.presented")
        : status === "excluded"
          ? t("rail.excluded")
          : mode === "ready" && ready
            ? t("rail.ready")
            : !participant.online
              ? t("board.offline")
              : null;
  return (
    <li
      data-testid={isCurrent ? "presenter-banner" : "rail-row"}
      aria-current={isCurrent ? "true" : undefined}
      className={
        status === "presented" ? "sb-list-row sb-list-row--done" : "sb-list-row"
      }
    >
      <span className="sb-list-row__lead">
        <PersonAvatar participant={participant} />
      </span>
      <div className="sb-list-row__main">
        <p className="sb-list-row__title">
          {participant.name}
          {isYou ? ` ${t("roster.you")}` : null}
        </p>
        {meta !== null ? (
          <p className="sb-list-row__meta">
            {/* „fertig“ in the success green, word and check together
                (owner, 2026-11-07); a span, as sebaro's unlayered row rule
                would win over a utility on the p. */}
            {meta === t("rail.ready") ? (
              <span className="text-success">{meta}</span>
            ) : (
              meta
            )}
          </p>
        ) : null}
      </div>

      {mode === "ready" && ready ? (
        <span className="sb-list-row__trail">
          <Icon name="check" size={20} className="text-success" />
        </span>
      ) : null}

      {mode === "present" && isAdmin && status === "remaining" ? (
        <span className="sb-list-row__trail">
          <button
            type="button"
            data-testid={`pick-${participant.name}`}
            disabled={spinning}
            aria-label={t("picker.pickAria", { name: participant.name })}
            onClick={() =>
              send({
                type: "admin.picker.pick",
                participantId: participant.id,
              })
            }
            className="sb-secondary-action sb-secondary-action--compact"
          >
            {t("picker.pick")}
          </button>
          <button
            type="button"
            aria-label={t("picker.exclude", { name: participant.name })}
            onClick={() =>
              send({
                type: "admin.picker.exclude",
                participantId: participant.id,
              })
            }
            className="sb-icon-button"
          >
            <Icon name="close" />
          </button>
        </span>
      ) : mode === "present" && isAdmin && status === "excluded" ? (
        <span className="sb-list-row__trail">
          <button
            type="button"
            onClick={() =>
              send({
                type: "admin.picker.include",
                participantId: participant.id,
              })
            }
            className="sb-secondary-action sb-secondary-action--compact"
          >
            <Icon name="plus" size={20} />
            {t("picker.pick")}
          </button>
        </span>
      ) : null}
    </li>
  );
}
