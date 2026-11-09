// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useState } from "react";
import { createPortal } from "react-dom";
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
  you: Participant;
  isAdmin: boolean;
  /** anonymous board: nobody is called up, so the presenting phase gets no
   *  rotation — the rail says why */
  anonymous?: boolean;
}

// A row's mode: "present" in the presenting round's list (PresentStatus),
// "presence" in the rail — just who is here.
type RailMode = "present" | "presence";

// The rail beside the board where no round status stands above it: who is
// here, and on an anonymous board while presenting, why there is no rotation.
// Writing, voting and check-in show the round's status instead (RoundStatus),
// presenting with a rotation the presenting round's (PresentStatus; owner,
// 2026-11-08).
export function PresenceRail({
  phase,
  roster,
  you,
  isAdmin,
  anonymous = false,
}: PresenceRailProps) {
  const { t } = useTranslation();
  const onlineCount = roster.filter((p) => p.online).length;

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
        <span className="sb-list-header__count tabular-nums">
          {t("rail.online", { count: onlineCount })}
        </span>
      </h2>

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
            mode="presence"
            picker={null}
            isAdmin={isAdmin}
            spinning={false}
          />
        ))}
      </ul>

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
    </aside>
  );
}

// Same in-flight guard as the old picker panel: no spinning (or hand-picking)
// while the wheel is still animating.
function useSpinning(): boolean {
  const lastSpin = useBoardStore((store) => store.state.lastSpin);
  const clockOffsetMs = useBoardStore((store) => store.clockOffsetMs);
  const now = useNow();
  return (
    lastSpin !== null &&
    now < lastSpin.startAt - clockOffsetMs + lastSpin.durationMs + WHEEL_HOLD_MS
  );
}

// The draw's keys and its skin: session controls, so they stand in the
// facilitator's „Moderation“ group (owner, 2026-11-08), not in the column of
// people. Spin, then next … until the pool empties; skip the current one; the
// skin beside the key that runs it, also once the round is through (it is a
// board setting, and the next round may want another).
export function PickerControls({
  picker,
  roster,
  pickerStyle,
  onOpenCards,
}: {
  picker: PickerState | null;
  roster: Participant[];
  pickerStyle: PickerStyle;
  onOpenCards?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const spinning = useSpinning();
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

  return (
    <>
      {!finished && spinLabel !== null ? (
        <div className="sb-cluster">
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

      <PickerStyleSelect style={pickerStyle} disabled={spinning} />
    </>
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

// The presenting round's status above the board (owner, 2026-11-08,
// „Vorstellrunde“), replacing the side rail as „Runde“ did for writing: how
// many have been on, who is on now, and who is still open BY NAME. For the
// facilitator an open name is itself the key that picks that person; the full
// list, with excluding and taking back, is one key away. The presenter's own
// „Fertig mit Vorstellen“ is a member's primary action at the bottom.
export function PresentStatus({
  roster,
  picker,
  you,
  isAdmin,
  scopedRound = false,
  actionSlot = null,
}: {
  roster: Participant[];
  picker: PickerState | null;
  you: Participant;
  isAdmin: boolean;
  scopedRound?: boolean;
  /** the action zone's slot, for a member only */
  actionSlot?: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const spinning = useSpinning();
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  const listId = useId();
  const byId = (id: string) => roster.find((p) => p.id === id);
  const nameOf = (p: Participant) =>
    p.id === you.id ? `${p.name} ${t("roster.you")}` : p.name;
  const presented = picker?.presented ?? [];
  const remaining = (picker?.remaining ?? [])
    .map(byId)
    .filter((p): p is Participant => p !== undefined);
  const current = picker?.current != null ? byId(picker.current) : undefined;
  const total = presented.length + remaining.length + (current ? 1 : 0);
  const finished = picker !== null && pickerFinished(picker);
  const youArePresenting = current?.id === you.id;

  const done = (
    <button
      type="button"
      data-testid="present-done"
      onClick={() => send({ type: "picker.done" })}
      className={
        isAdmin
          ? "sb-secondary-action sb-secondary-action--compact"
          : "sb-primary-action"
      }
    >
      {t("rail.donePresenting")}
      <Icon name="arrow-right" size={20} />
    </button>
  );

  return (
    <section
      aria-labelledby={titleId}
      data-testid="present-status"
      className="mb-4 flex flex-col gap-3 border-b border-border pb-4"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p
          id={titleId}
          className="text-caption [font-weight:var(--sb-type-title-weight)] text-text-muted"
        >
          {t("present.round.title")}
        </p>
        <div className="sb-progress w-40">
          <p role="status" className="sb-status tabular-nums">
            <span>
              {t("present.round.count", { done: presented.length, total })}
            </span>
          </p>
          <progress
            max={Math.max(total, 1)}
            value={presented.length}
            aria-hidden="true"
          />
        </div>
        {current ? (
          <p
            data-testid="presenter-banner"
            className="sb-status sb-status--info"
          >
            <Icon name="microphone" size={16} />
            <span>{t("present.round.now", { name: nameOf(current) })}</span>
          </p>
        ) : null}
        {finished ? (
          <p
            data-testid="picker-finished"
            className="sb-status sb-status--success"
          >
            <Icon name="success" size={16} />
            <span>{t("picker.everyone")}</span>
          </p>
        ) : remaining.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-text-muted">
              {t("round.open")}
            </span>
            <ul className="sb-tags" data-testid="present-open">
              {remaining.map((p) =>
                isAdmin ? (
                  <li key={p.id}>
                    <button
                      type="button"
                      data-testid={`pick-${p.name}`}
                      disabled={spinning}
                      aria-label={t("picker.pickAria", { name: p.name })}
                      onClick={() =>
                        send({ type: "admin.picker.pick", participantId: p.id })
                      }
                      className="sb-secondary-action sb-secondary-action--compact"
                    >
                      <Icon name="pending" size={16} />
                      {nameOf(p)}
                    </button>
                  </li>
                ) : (
                  <li key={p.id} className="sb-tag">
                    <Icon name="pending" size={16} />
                    {nameOf(p)}
                  </li>
                ),
              )}
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          data-testid="present-all"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((value) => !value)}
          className="sb-text-action sb-text-action--compact"
        >
          {t("round.all", { count: roster.length })}
        </button>
        {youArePresenting && isAdmin ? (
          <span className="ms-auto">{done}</span>
        ) : null}
      </div>
      {youArePresenting && !isAdmin && actionSlot !== null
        ? createPortal(done, actionSlot)
        : null}
      {/* Without a word about it, a scoped board reads as "where did the
          cards go?" — the room sees each person's cards as the round reaches
          them. */}
      {scopedRound ? (
        <p data-testid="present-scope-hint" className="sb-field__help">
          {isAdmin ? t("present.scoped.facilitator") : t("present.scoped.hint")}
        </p>
      ) : null}
      {showAll ? (
        <ul id={listId} className="sb-list">
          {roster.map((p) => (
            <PresenceRow
              key={p.id}
              participant={p}
              youId={you.id}
              mode="present"
              picker={picker}
              isAdmin={isAdmin}
              spinning={spinning}
              inList
            />
          ))}
        </ul>
      ) : null}
    </section>
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
  picker,
  isAdmin,
  spinning,
  inList = false,
}: {
  participant: Participant;
  youId: string;
  mode: RailMode;
  picker: PickerState | null;
  isAdmin: boolean;
  spinning: boolean;
  /** in PresentStatus's full list: the open names above are the pick keys */
  inList?: boolean;
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
          : !participant.online
            ? t("board.offline")
            : null;
  return (
    <li
      data-testid={
        inList ? "present-person" : isCurrent ? "presenter-banner" : "rail-row"
      }
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
        {meta !== null ? <p className="sb-list-row__meta">{meta}</p> : null}
      </div>

      {mode === "present" && isAdmin && status === "remaining" ? (
        <span className="sb-list-row__trail">
          <button
            type="button"
            data-testid={
              inList
                ? `list-pick-${participant.name}`
                : `pick-${participant.name}`
            }
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
