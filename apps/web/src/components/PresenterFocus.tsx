// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  presenterCardOrder,
  WHEEL_HOLD_MS,
  type Column,
  type Note,
  type Participant,
  type Phase,
  type PickerStyle,
  type PickerState,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { useNow } from "../lib/useNow.js";
import { useBoardStore } from "../store/boardStore.js";
import { NoteCard } from "./NoteCard.js";

export interface PresenterFocusProps {
  notes: Note[];
  columns: Column[];
  roster: Participant[];
  you: Participant;
  phase: Phase;
  isAdmin: boolean;
  presenter: Participant;
  /** the card the facilitator has on stage; null = show the whole list */
  spotlightId: string | null;
  /** one card at a time instead of the presenter's whole list */
  focusMode: boolean;
  /** the rotation, so the last card can offer "next person" instead of "next" */
  picker: PickerState | null;
  pickerStyle: PickerStyle;
}

// The readable "reader" for the presenting round: instead of hunting a sprawling
// board, everyone sees ONLY the current presenter's cards, grouped by zone, in
// one calm centered column. Read-only (reactions kept).
//
// With focus mode on it narrows further to ONE card, and the facilitator walks
// the row with a single button — the room shares a screen, so what matters is
// that the remote participants land on the same card at the same moment. The
// card on stage is the server's, not this component's: `spotlightId` comes down
// the wire and is already filtered per viewer.
export function PresenterFocus({
  notes,
  columns,
  roster,
  you,
  phase,
  isAdmin,
  presenter,
  spotlightId,
  focusMode,
  picker,
  pickerStyle,
}: PresenterFocusProps) {
  const { t } = useTranslation();
  const theirs = notes.filter((note) => note.authorId === presenter.id);
  const zones = columns
    .map((column) => ({
      column,
      cards: theirs
        .filter((note) => note.columnId === column.id)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    }))
    .filter((zone) => zone.cards.length > 0);

  // The SAME order the server seeds and steps — one implementation, so "next"
  // means the same card on every screen.
  const order = useMemo(
    () => presenterCardOrder(notes, columns, presenter.id),
    [notes, columns, presenter.id],
  );
  const index = spotlightId === null ? -1 : order.indexOf(spotlightId);
  const onStage =
    index >= 0 ? (theirs.find((n) => n.id === order[index]) ?? null) : null;
  const staged = focusMode && onStage !== null;

  return (
    <div
      className={`mx-auto flex flex-col gap-6 ${staged ? "max-w-3xl" : "max-w-2xl"}`}
    >
      <header className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-full"
          style={{ backgroundColor: presenter.color }}
        />
        <h2 className="text-lg font-semibold text-zinc-800">
          🎤 {t("present.focus.heading", { name: presenter.name })}
        </h2>
        <span className="ml-auto text-sm text-zinc-400 tabular-nums">
          {staged
            ? t("present.walkthrough.position", {
                index: index + 1,
                total: order.length,
              })
            : t("present.focus.count", { count: theirs.length })}
        </span>
      </header>

      {zones.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-300">
          {t("present.focus.empty")}
        </p>
      ) : staged && onStage !== null ? (
        <StagedCard
          note={onStage}
          columnName={
            columns.find((c) => c.id === onStage.columnId)?.name ?? ""
          }
          roster={roster}
          you={you}
          phase={phase}
          isAdmin={isAdmin}
        />
      ) : (
        zones.map((zone) => (
          <section key={zone.column.id} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              {zone.column.name}
            </h3>
            {zone.cards.map((note, cardIndex) => (
              <NoteCard
                key={note.id}
                note={note}
                revealIndex={cardIndex}
                roster={roster}
                you={you}
                phase={phase}
                isAdmin={isAdmin}
                // The staged card keeps the existing spotlight ring when the
                // list is shown, so a participant who is NOT in focus mode can
                // still see which card the room is on.
                presenterId={note.id === spotlightId ? presenter.id : null}
                interactive={false}
                onDropNote={() => {}}
                onUngroup={() => {}}
              />
            ))}
          </section>
        ))
      )}

      {isAdmin ? (
        <WalkthroughControl
          order={order}
          index={index}
          picker={picker}
          pickerStyle={pickerStyle}
        />
      ) : null}
    </div>
  );
}

function StagedCard({
  note,
  columnName,
  roster,
  you,
  phase,
  isAdmin,
}: {
  note: Note;
  columnName: string;
  roster: Participant[];
  you: Participant;
  phase: Phase;
  isAdmin: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keyed by note id, so stepping the row brings the new card into view on a
  // small screen without the facilitator having to scroll for the room.
  useEffect(() => {
    ref.current?.scrollIntoView({
      block: "center",
      behavior:
        typeof matchMedia !== "undefined" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
    });
  }, [note.id]);

  return (
    <div
      ref={ref}
      data-testid="present-stage"
      className="flex flex-col gap-2"
      // The card on stage changes because SOMEBODY ELSE clicked — a scroll is
      // not something a screen reader announces, so the stage says what it now
      // holds. Polite, not assertive: it is a change of subject, not an alert.
      aria-live="polite"
      aria-atomic="true"
    >
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {columnName}
      </h3>
      <div className="text-lg">
        <NoteCard
          note={note}
          revealIndex={0}
          roster={roster}
          you={you}
          phase={phase}
          isAdmin={isAdmin}
          presenterId={null}
          interactive={false}
          onDropNote={() => {}}
          onUngroup={() => {}}
        />
      </div>
    </div>
  );
}

// One button that means two things, which is the point: while cards remain it
// steps the row, and on the last one it hands back to the rotation — because
// that is what actually happens next, and the facilitator should not have to
// look elsewhere to find out that this person is finished.
function WalkthroughControl({
  order,
  index,
  picker,
  pickerStyle,
}: {
  order: string[];
  index: number;
  picker: PickerState | null;
  pickerStyle: PickerStyle;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const lastSpin = useBoardStore((store) => store.state.lastSpin);
  const clockOffsetMs = useBoardStore((store) => store.clockOffsetMs);
  const now = useNow();
  // Same in-flight guard as the rail: no advancing while the wheel animates.
  const spinning =
    lastSpin !== null &&
    now <
      lastSpin.startAt - clockOffsetMs + lastSpin.durationMs + WHEEL_HOLD_MS;

  // Three states, not two. "Nothing staged" (index -1) is NOT the same as
  // "on the last card": the server clears the stage whenever the staged card
  // is deleted, moved into a staged column, or its column is deleted — and
  // this button is the only thing in the client that can set a spotlight, so
  // treating that as "done" would end the presenter's turn while their cards
  // were still unread, with no way back in.
  const nextIndex = index < 0 ? 0 : index + 1;
  const hasNextCard = nextIndex < order.length;
  const chooseFromDeck =
    !hasNextCard &&
    pickerStyle === "cards" &&
    (picker?.remaining.length ?? 0) > 0;
  const label = hasNextCard
    ? t("present.walkthrough.nextCard")
    : (picker?.remaining.length ?? 0) > 0
      ? t("picker.next")
      : t("picker.finishRound");

  if (chooseFromDeck) {
    return (
      <p
        data-testid="choose-card-hint"
        className="text-center text-sm font-medium text-zinc-500"
      >
        🂠 {t("picker.chooseCardHint")}
      </p>
    );
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        data-testid="present-next"
        disabled={spinning}
        onClick={() =>
          hasNextCard
            ? send({
                type: "admin.spotlight.set",
                targetId: order[nextIndex] ?? null,
              })
            : // The SAME command the rail's spin button sends, so the wheel,
              // the rotation and the reveal path stay completely unchanged.
              // (picker.done is wrong here: it only accepts the person who is
              // presenting, and the facilitator usually is not.)
              send({ type: "admin.picker.spin" })
        }
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
      >
        {label} ›
      </button>
    </div>
  );
}
