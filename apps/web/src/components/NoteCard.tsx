// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  generateHexId,
  phaseRevealed,
  REACTION_EMOJI,
  type Note,
  type Participant,
  type Phase,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";
import { Dialog } from "./Dialog.js";
import { GifPickerButton } from "./GifPicker.js";
import { Icon } from "./Icon.js";
import { Menu, type MenuItem } from "./Menu.js";

const NOTE_DRAG_MIME = "application/x-retrobeam-note";

export type NudgeDirection = "left" | "up" | "down" | "right";

// The step buttons in keyboard order, each with the arrow key that does the
// same while focus is in their group. The canvas's zone panel steps the same
// way.
export const NUDGES = [
  { direction: "left", key: "ArrowLeft", glyph: "←", label: "note.nudgeLeft" },
  { direction: "up", key: "ArrowUp", glyph: "↑", label: "note.nudgeUp" },
  { direction: "down", key: "ArrowDown", glyph: "↓", label: "note.nudgeDown" },
  {
    direction: "right",
    key: "ArrowRight",
    glyph: "→",
    label: "note.nudgeRight",
  },
] as const;

// The card's own surface, shared with the canvas's arrange panel, which hangs
// outside the card and has to read as part of it, and with the zone panel.
// sebaro's card (plan stage 5g); the canvas is rebuilt in 5h.
export const CARD_SURFACE = "sb-card";
export const CARD_EDGE = "";
// One look for every single-press option in the arrange panel: the column
// keys and the canvas's step keys, the zone panel's too — sebaro's compact
// secondary action; a step that cannot go stays pressable, aria-disabled
// (sebaro STA-03).
export const ARRANGE_OPTION =
  "sb-secondary-action sb-secondary-action--compact";
export const ARRANGE_LABEL = "sb-field__label";
export const ARRANGE_STEP = ARRANGE_OPTION;
export const ARRANGE_PANEL = "flex flex-col gap-2";

// Cards that are to take the focus when they mount next (a move or a stack
// remounts a card elsewhere). A request lapses after two seconds, and at
// once when the card leaves the page without coming back in the same commit
// (it was deleted, or the view went away).
const REFOCUS = new Set<string>();
const MOUNTED = new Map<string, number>();
function askRefocus(noteId: string) {
  REFOCUS.add(noteId);
  setTimeout(() => REFOCUS.delete(noteId), 2000);
}

function focusArrangeKey(card: HTMLElement) {
  const target =
    card.querySelector<HTMLElement>('[data-testid="note-arrange-toggle"]') ??
    card.querySelector<HTMLElement>("button");
  target?.focus();
}

export interface NoteCardProps {
  note: Note;
  roster: Participant[];
  you: Participant;
  phase: Phase;
  isAdmin: boolean;
  revealIndex: number;
  /** current presenter — their notes are spotlighted, the rest stepped back */
  presenterId: string | null;
  /** authors the room has NOT been shown yet, during the presenting round.
   *  null outside that round. Only a facilitator can ever hold such a card, so
   *  the marker answers "can the room read this one yet?" at a glance. */
  unpresentedAuthorIds?: ReadonlySet<string> | null;
  /** the board's GIF switch — gates adding one while editing. Required: a
   *  defaulted flag would switch the feature off silently at a missed site. */
  gifsEnabled: boolean;
  onDropNote: (sourceNoteId: string, target: Note) => void;
  onUngroup: (note: Note) => void;
  /** read-only rendering (the presenter reader): drag/edit/delete/curate off,
   *  reactions kept. Default true. */
  interactive?: boolean;
  /** HTML5 drag affordance; the canvas turns this off and drags a wrapper via
   *  pointer events instead, while keeping edit/delete. Default true. */
  draggable?: boolean;
  /** The keyboard and touch path for the two drag gestures (WCAG 2.1.1):
   *  "Move to…" lists these columns and calls onMoveToColumn — the very
   *  callback a column drop calls. Absent or null = no "Move to…" (the
   *  canvas, the reader). */
  moveTargets?: readonly { id: string; name: string }[];
  onMoveToColumn?: ((sourceNoteId: string, columnId: string) => void) | null;
  /** Whether a move to that column would be taken — false for a canvas zone
   *  with no free spot, which a drop refuses too. Default: always. */
  canMoveTo?: (columnId: string) => boolean;
  /** The cards of this card's column; "Stack with…" offers them and calls
   *  onDropNote, exactly like dropping this card on the chosen one. */
  stackCandidates?: readonly Note[];
  /** The canvas's twin of dragging a card around inside its zone (WCAG
   *  2.5.7): one step per press of a step button or arrow key, each one
   *  note.move like one drop. canNudge says whether a step that way would
   *  move the card at all (the zone's edge, a neighbour in the way). Absent
   *  or null = no steps (the columns, the reader). */
  onNudge?: ((sourceNoteId: string, direction: NudgeDirection) => void) | null;
  canNudge?: (sourceNoteId: string, direction: NudgeDirection) => boolean;
  /** The canvas: the ⋯ panel hangs below the card instead of growing it, and
   *  is scaled by this factor to undo the world's zoom. Absent or null = the
   *  panel sits inside the card (the columns). */
  arrangeScale?: number | null;
  /** Told when the ⋯ panel opens and when it closes or unmounts, so the
   *  canvas can lift the card above its neighbours. Keep it stable. */
  onArrangeChange?: (noteId: string, open: boolean) => void;
}

export function NoteCard({
  note,
  roster,
  you,
  phase,
  isAdmin,
  revealIndex,
  presenterId,
  unpresentedAuthorIds = null,
  gifsEnabled,
  onDropNote,
  onUngroup,
  interactive = true,
  draggable = true,
  moveTargets = [],
  onMoveToColumn = null,
  canMoveTo = () => true,
  stackCandidates = [],
  onNudge = null,
  canNudge = () => true,
  arrangeScale = null,
  onArrangeChange,
}: NoteCardProps) {
  const { t } = useTranslation();
  const { mutate } = useConnection();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [draftGif, setDraftGif] = useState(note.gifUrl);
  const [dropHover, setDropHover] = useState(false);
  const [arranging, setArranging] = useState(false);
  const arrangeId = useId();
  const arrangeTrigger = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  // Open and close, including the close a remount is (a move elsewhere,
  // mine or a teammate's): the canvas never keeps a closed card lifted.
  useEffect(() => {
    if (!arranging || onArrangeChange === undefined) return;
    onArrangeChange(note.id, true);
    return () => onArrangeChange(note.id, false);
  }, [arranging, note.id, onArrangeChange]);

  // An anonymous board shows no author chip at all — not even on your own
  // cards. Everyone else's arrive without an author anyway; your own would be
  // the only named cards on your screen, and the screen you share with the
  // room (the facilitator's, typically) would name exactly those.
  const anonymous = useBoardStore(
    (store) => store.state.config?.anonymous ?? false,
  );
  const mine = note.authorId === you.id;
  const author =
    note.authorId === null || anonymous
      ? null
      : roster.find((p) => p.id === note.authorId);
  const revealed = phaseRevealed(phase) && phase !== "done";
  const canEdit =
    interactive && mine && (phase === "write" || phase === "present");
  const canDelete = interactive && (mine || isAdmin) && phase !== "done";
  // Reorganizing (drag to group/move, unstack) happens in write (own notes)
  // and present (everyone) — frozen once voting starts, stacks are votables.
  const canCurate = interactive && phase === "present";
  // Whether this card may be moved at all — the server's note.move gate.
  const canMove = interactive && (canCurate || (phase === "write" && mine));
  // The canvas positions cards via a pointer-drag wrapper, so it turns off the
  // card's own HTML5 drag while keeping edit/delete.
  const canDrag = canMove && draggable;
  // Same gates as the gestures they stand in for: a card may be moved exactly
  // when it may be dragged — by the card's own drag or the canvas wrapper's,
  // hence canMove, not canDrag — and stacked only where a drop on a card is
  // taken (the presenting phase — the server refuses note.group anywhere else).
  const moveOptions =
    canMove && onMoveToColumn !== null
      ? moveTargets.filter(
          (column) => column.id !== note.columnId && canMoveTo(column.id),
        )
      : [];
  const canStep = canMove && onNudge !== null;
  // Not the card itself, nor a card already in its stack — groupNotes would
  // drop that as a no-op, and an option that does nothing is a trap.
  const stackOptions = canCurate
    ? stackCandidates.filter(
        (other) =>
          other.id !== note.id && (other.groupId ?? other.id) !== note.groupId,
      )
    : [];
  const canArrange =
    moveOptions.length > 0 || stackOptions.length > 0 || canStep;
  const spotlighted = presenterId !== null && note.authorId === presenterId;
  // Stepped back, not hidden: the board is cumulative now, so most cards carry
  // this and they still have to be readable. A note whose authorship was
  // stripped (anonymous board) is neither — there is nobody to tell apart, and
  // dimming every card on the board would just make it unreadable.
  const dimmed =
    presenterId !== null &&
    note.authorId !== null &&
    note.authorId !== presenterId;
  const pending =
    unpresentedAuthorIds !== null &&
    note.authorId !== null &&
    unpresentedAuthorIds.has(note.authorId);

  function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    const gifChanged = draftGif !== note.gifUrl;
    if (text === "" || (text === note.text && !gifChanged)) {
      setEditing(false);
      return;
    }
    mutate(
      {
        type: "note.update",
        opId: generateHexId(),
        noteId: note.id,
        text,
        // Omitted = the server keeps the stored GIF. Sent only when it
        // changed, so an untouched GIF survives a board whose GIFs were
        // switched off since (the server would drop a re-sent URL there).
        ...(gifChanged ? { gifUrl: draftGif } : {}),
      },
      {
        type: "note.updated",
        seq: 0,
        note: { ...note, text, gifUrl: draftGif },
      },
    );
    setEditing(false);
  }

  function remove() {
    mutate(
      { type: "note.delete", opId: generateHexId(), noteId: note.id },
      { type: "note.deleted", seq: 0, noteId: note.id },
    );
  }

  function toggleReaction(emoji: string) {
    const current = note.reactions[emoji] ?? [];
    const on = !current.includes(you.id);
    const reactions = {
      ...note.reactions,
      [emoji]: on
        ? [...current, you.id]
        : current.filter((id) => id !== you.id),
    };
    if (reactions[emoji]?.length === 0) delete reactions[emoji];
    mutate(
      {
        type: "note.react",
        opId: generateHexId(),
        noteId: note.id,
        emoji: emoji as (typeof REACTION_EMOJI)[number],
        on,
      },
      { type: "note.updated", seq: 0, note: { ...note, reactions } },
    );
  }

  // A move or a stack remounts this card elsewhere — another column, or
  // inside a NoteStack — and the option button that had focus goes with the
  // old one, dropping a keyboard user back to <body>. So once the echo has
  // rendered, hand focus to the same card's ⋯ (or, if it has nothing left
  // to offer, its first button). By id, not a ref: the ref dies with the
  // old mount.
  //
  // Not timed: a frame later React had not always committed the move (the
  // canvas waits for the server's answer), the old card was still the one in
  // the page, it took the focus and then left with it (task #12, about 2 runs
  // in 10). Now this card's key takes the focus at once — where it stays if
  // the move is refused — and the card's next mount takes it over.
  function refocusAfterArrange() {
    askRefocus(note.id);
    if (articleRef.current) focusArrangeKey(articleRef.current);
  }
  // Every mount within the request's two seconds takes it, not only the
  // first: a move can remount the card twice (its optimistic place, then the
  // server's), and the second took the focus away again. Only a focus that
  // is lost (on <body>) is taken back, so nothing is ever pulled away from
  // where the person went meanwhile.
  useEffect(() => {
    if (!interactive) return;
    const id = note.id;
    MOUNTED.set(id, (MOUNTED.get(id) ?? 0) + 1);
    if (REFOCUS.has(id)) {
      const active = document.activeElement;
      if ((active === null || active === document.body) && articleRef.current)
        focusArrangeKey(articleRef.current);
    }
    return () => {
      MOUNTED.set(id, (MOUNTED.get(id) ?? 1) - 1);
      // A move unmounts and mounts in one commit; after it, a card that is
      // nowhere drops its request.
      setTimeout(() => {
        if ((MOUNTED.get(id) ?? 0) <= 0) REFOCUS.delete(id);
      }, 0);
    };
  }, [interactive, note.id]);

  // A step stays in the zone, so the card keeps its mount and the focused
  // step button keeps focus: the panel stays open for the next one.
  function step(direction: NudgeDirection) {
    if (canNudge(note.id, direction)) onNudge?.(note.id, direction);
  }

  // The card's „Mehr“ (sebaro's menu): edit, take out of its stack, and
  // delete last, which asks first.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cardMenu: MenuItem[] = [];
  if (canEdit) {
    cardMenu.push({
      key: "edit",
      label: t("note.edit"),
      icon: "edit",
      testId: "note-edit",
      onSelect: () => {
        setDraft(note.text);
        setDraftGif(note.gifUrl);
        setEditing(true);
      },
    });
  }
  if (note.groupId !== null && canCurate) {
    cardMenu.push({
      key: "ungroup",
      label: t("group.ungroup"),
      icon: "undo",
      testId: "note-ungroup",
      onSelect: () => onUngroup(note),
    });
  }
  if (canDelete) {
    cardMenu.push({
      key: "delete",
      label: t("note.deleteOpen"),
      icon: "trash",
      danger: true,
      separatorBefore: cardMenu.length > 0,
      testId: "note-delete",
      onSelect: () => setConfirmingDelete(true),
    });
  }

  return (
    <article
      ref={articleRef}
      data-testid="note-card"
      // Interactive cards only: the presenter reader can show the same note,
      // and refocusAfterArrange must not land in it.
      data-note-id={interactive ? note.id : undefined}
      draggable={canDrag && !editing}
      onDragStart={(event) => {
        event.dataTransfer.setData(NOTE_DRAG_MIME, note.id);
        event.dataTransfer.setData("text/plain", note.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (canCurate && event.dataTransfer.types.includes(NOTE_DRAG_MIME)) {
          event.preventDefault();
          event.stopPropagation();
          setDropHover(true);
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(event) => {
        if (!canCurate) return;
        event.preventDefault();
        event.stopPropagation();
        setDropHover(false);
        const sourceId = event.dataTransfer.getData(NOTE_DRAG_MIME);
        if (sourceId && sourceId !== note.id) onDropNote(sourceId, note);
      }}
      data-presenting={spotlighted ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
      title={
        spotlighted
          ? t("present.spotlight", { name: author?.name ?? "" })
          : pending
            ? t("note.notPresented")
            : undefined
      }
      // sebaro's item card (plan stage 5g): the speaker's cards carry the
      // place mark (aria-current, the 3 px edge), a card not yet shown to the
      // room says so in its meta line (glyph and word, never a dashed edge
      // alone), a drop target the cobalt outline.
      aria-current={spotlighted ? "true" : undefined}
      className={`reveal-in sb-card sb-card--item transition-opacity ${
        dropHover
          ? "outline-2 outline-offset-2 outline-(--sb-color-accent) outline-solid"
          : ""
      } ${dimmed && !arranging ? "opacity-70" : ""} ${
        canDrag && !editing ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      style={{ animationDelay: `${Math.min(revealIndex, 12) * 45}ms` }}
    >
      {editing ? (
        <form onSubmit={saveEdit}>
          <div className="sb-field">
            <label htmlFor={`${arrangeId}-edit`} className="sb-visually-hidden">
              {t("note.edit")}
            </label>
            <div className="sb-field__control">
              <textarea
                id={`${arrangeId}-edit`}
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
          {draftGif !== null ? (
            <div className="flex items-start gap-1">
              <img
                src={draftGif}
                alt=""
                referrerPolicy="no-referrer"
                className="max-h-24"
              />
              <button
                type="button"
                data-testid="note-edit-gif-remove"
                onClick={() => setDraftGif(null)}
                aria-label={t("gif.remove")}
                className="sb-icon-button"
              >
                <Icon name="close" />
              </button>
            </div>
          ) : null}
          <div className="sb-cluster">
            <button
              type="submit"
              className="sb-secondary-action sb-secondary-action--compact"
            >
              {t("note.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="sb-secondary-action sb-secondary-action--compact"
            >
              {t("note.cancel")}
            </button>
            {/* Same rule as the composer: a GIF only ever joins text. */}
            {gifsEnabled && draftGif === null && draft.trim() !== "" ? (
              <GifPickerButton testId="note-edit-gif" onPick={setDraftGif} />
            ) : null}
          </div>
        </form>
      ) : (
        <>
          {/* break-words: the columns are grid tracks now, and a grid item
              cannot push its track wider — an unbroken 200-character word
              would simply paint outside it and drag the whole page sideways.
              The old horizontal scroller clipped that; nothing does now. */}
          <p className="sb-card__title whitespace-pre-wrap">{note.text}</p>
          {note.gifUrl !== null ? (
            <img
              src={note.gifUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              // The whole width, like the meta line below: in the card's
              // auto column the picture took the width and squeezed the title
              // to a letter per line (owner, 2026-11-07).
              className="col-span-full max-h-40 w-full object-contain"
            />
          ) : null}
          {/* The meta line spans the card (sebaro's board card puts it under
              the title, the whole width): beside the title, in the grid's
              auto column, a wide line squeezed the title to nothing. */}
          <div className="col-span-full flex items-center gap-1">
            {/* §6.1 d: on an anonymous board nobody, not even you. */}
            {author ? (
              <p className="sb-card__meta min-w-0 flex-1 truncate">
                {author.name}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            {pending ? (
              <span data-testid="note-pending" className="sb-tag shrink-0">
                <Icon name="eye-off" size={16} />
                {t("note.notPresented")}
              </span>
            ) : null}
            {/* The card's keys. On the canvas they are drawn against the
                world's zoom, as the arrange panel is: 32 px on screen at
                any zoom (WCAG 2.5.8; owner, 2026-11-05). They grow from the
                card's corner over its text, which at such a zoom nobody
                reads; the panel and the menu open at full size anyway. */}
            <span
              className="flex shrink-0 items-center gap-1"
              style={
                arrangeScale === null
                  ? undefined
                  : {
                      transform: `scale(${arrangeScale})`,
                      transformOrigin: "right bottom",
                    }
              }
            >
              {canArrange ? (
                <button
                  ref={arrangeTrigger}
                  type="button"
                  data-testid="note-arrange-toggle"
                  aria-label={t("note.arrange")}
                  title={t("note.arrange")}
                  aria-expanded={arranging}
                  aria-controls={arranging ? arrangeId : undefined}
                  onClick={() => setArranging(!arranging)}
                  className={
                    arrangeScale === null
                      ? "sb-icon-button"
                      : "sb-icon-button sb-icon-button--compact"
                  }
                >
                  <Icon name="grip" />
                </button>
              ) : null}
              {cardMenu.length > 0 ? (
                <Menu
                  label={t("note.more")}
                  items={cardMenu}
                  triggerTestId="note-menu"
                  // The canvas's cards are dense: there the 32 px form.
                  compact={arrangeScale !== null}
                />
              ) : null}
            </span>
          </div>
          {canDelete ? (
            <Dialog
              open={confirmingDelete}
              onClose={() => setConfirmingDelete(false)}
              title={t("note.deleteTitle")}
              testId="note-delete-dialog"
              actions={
                <>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmingDelete(false)}
                    className="sb-secondary-action"
                  >
                    {t("note.cancel")}
                  </button>
                  <button
                    type="button"
                    data-testid="note-delete-confirm"
                    onClick={() => {
                      setConfirmingDelete(false);
                      remove();
                    }}
                    className="sb-danger-action sb-danger-action--outlined"
                  >
                    <Icon name="trash" size={20} />
                    {t("menu.deleteConfirm")}
                  </button>
                </>
              }
            >
              <p className="sb-dialog__text">{t("note.deleteText")}</p>
            </Dialog>
          ) : null}
          {/* Inline, not a floating menu: a dimmed card (opacity) or a hidden
              column is its own stacking context, so a popover hung off the
              card would be drawn under the next one and faded with it. Being
              inside means taking the card's fade, though — at opacity-70 the
              panel's zinc-500 labels are 2.8:1 — so the card drops its dim
              while the panel is open (see the article's className).
              The canvas is the exception: its world is scaled, and options
              inside the card would shrink with it (about half size at the
              fitted zoom, under WCAG 2.5.8's 24px). There the panel hangs
              below the card, unscaled back to its own size, and the canvas
              lifts the card and its zone while it is open (onArrangeChange).
              Still the card's child, so Tab goes from the ⋯ straight in. */}
          {arranging && canArrange ? (
            <div
              id={arrangeId}
              data-testid="note-arrange"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                setArranging(false);
                arrangeTrigger.current?.focus();
              }}
              className={`col-span-full ${ARRANGE_PANEL} ${
                arrangeScale === null
                  ? "border-t border-border pt-2"
                  : `mt-1 ${CARD_SURFACE}`
              }`}
              style={
                arrangeScale === null
                  ? undefined
                  : {
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      width: "100%",
                      transform: `scale(${arrangeScale})`,
                      transformOrigin: "top center",
                    }
              }
            >
              {moveOptions.length > 0 ? (
                <div role="group" aria-label={t("note.moveTo")}>
                  <p className={ARRANGE_LABEL}>{t("note.moveTo")}</p>
                  <div className="flex flex-wrap gap-1">
                    {moveOptions.map((column) => (
                      <button
                        key={column.id}
                        type="button"
                        data-testid="note-move-option"
                        onClick={() => {
                          setArranging(false);
                          onMoveToColumn?.(note.id, column.id);
                          refocusAfterArrange();
                        }}
                        className={`max-w-full truncate ${ARRANGE_OPTION}`}
                      >
                        {column.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {canStep ? (
                <div
                  role="group"
                  aria-label={t("note.position")}
                  onKeyDown={(event) => {
                    const nudge = NUDGES.find((n) => n.key === event.key);
                    if (nudge === undefined) return;
                    // The page would scroll under the canvas otherwise.
                    event.preventDefault();
                    // A held key repeats some 30 times a second, and every
                    // step is a frame on the wire (the socket's bucket refills
                    // at 8 a second). One step per press, as one drop per drag.
                    if (event.repeat) return;
                    step(nudge.direction);
                  }}
                >
                  <p className={ARRANGE_LABEL}>{t("note.position")}</p>
                  <div className="flex flex-wrap gap-1">
                    {NUDGES.map((nudge) => (
                      <button
                        key={nudge.direction}
                        type="button"
                        data-testid={`note-nudge-${nudge.direction}`}
                        aria-label={t(nudge.label)}
                        // The tooltip names the key too (sebaro NAV-10); the
                        // font's arrows are for keys only (ICO-06).
                        title={`${t(nudge.label)} (${nudge.glyph})`}
                        aria-keyshortcuts={nudge.key}
                        // Not `disabled`: the button that just reached the
                        // zone's edge has focus, and a disabled one drops it
                        // to <body>.
                        aria-disabled={!canNudge(note.id, nudge.direction)}
                        onClick={() => step(nudge.direction)}
                        className={ARRANGE_STEP}
                      >
                        <Icon name={`arrow-${nudge.direction}`} size={20} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {stackOptions.length > 0 ? (
                <div role="group" aria-label={t("note.stackWith")}>
                  <p className={ARRANGE_LABEL}>{t("note.stackWith")}</p>
                  <div className="flex flex-col gap-1">
                    {stackOptions.map((other) => (
                      <button
                        key={other.id}
                        type="button"
                        data-testid="note-stack-option"
                        title={other.text}
                        onClick={() => {
                          setArranging(false);
                          onDropNote(note.id, other);
                          refocusAfterArrange();
                        }}
                        className={`max-w-full truncate ${ARRANGE_OPTION}`}
                      >
                        {other.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {/* The reactions are the room's own content (plan §2.4 F24): they
              keep their emoji, in sebaro's colour roles. */}
          {revealed ? (
            <div className="col-span-full flex flex-wrap gap-1">
              {REACTION_EMOJI.map((emoji) => {
                const reactors = note.reactions[emoji] ?? [];
                const reacted = reactors.includes(you.id);
                const unused = reactors.length === 0 && !reacted;
                return (
                  <button
                    key={emoji}
                    type="button"
                    data-testid={`react-${emoji}`}
                    aria-pressed={unused ? undefined : reacted}
                    onClick={() => toggleReaction(emoji)}
                    className={`rounded-control border px-1 py-(--sb-space-0-5) tabular-nums [font:var(--sb-type-caption)] ${
                      reacted
                        ? "border-(--sb-color-accent) text-link"
                        : unused
                          ? "border-transparent opacity-40 grayscale hover:opacity-100 hover:grayscale-0"
                          : "border-border text-text-muted"
                    }`}
                  >
                    {unused ? emoji : `${emoji} ${reactors.length}`}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

export { NOTE_DRAG_MIME };
