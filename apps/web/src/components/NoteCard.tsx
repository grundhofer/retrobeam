// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
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
import { GifPickerButton } from "./GifPicker.js";

const NOTE_DRAG_MIME = "application/x-retrobeam-note";

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
  /** The cards of this card's column; "Stack with…" offers them and calls
   *  onDropNote, exactly like dropping this card on the chosen one. */
  stackCandidates?: readonly Note[];
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
  stackCandidates = [],
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
  // The canvas positions cards via a pointer-drag wrapper, so it turns off the
  // card's own HTML5 drag while keeping edit/delete.
  const canDrag =
    interactive && draggable && (canCurate || (phase === "write" && mine));
  // Same gates as the gestures they stand in for: a card may be moved exactly
  // when it may be dragged, and stacked only where a drop on a card is taken
  // (the presenting phase — the server refuses note.group anywhere else).
  const moveOptions =
    canDrag && onMoveToColumn !== null
      ? moveTargets.filter((column) => column.id !== note.columnId)
      : [];
  // Not the card itself, nor a card already in its stack — groupNotes would
  // drop that as a no-op, and an option that does nothing is a trap.
  const stackOptions = canCurate
    ? stackCandidates.filter(
        (other) =>
          other.id !== note.id && (other.groupId ?? other.id) !== note.groupId,
      )
    : [];
  const canArrange = moveOptions.length > 0 || stackOptions.length > 0;
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

  return (
    <article
      data-testid="note-card"
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
      className={`reveal-in rounded-xl bg-white p-3 shadow-sm transition-opacity ${
        dropHover
          ? "border border-accent ring-2 ring-accent/40"
          : pending
            ? "border border-dashed border-zinc-300"
            : "border border-zinc-200"
      } ${spotlighted ? "shadow-md ring-2 ring-accent" : ""} ${dimmed ? "opacity-70" : ""} ${
        canDrag && !editing ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      style={{ animationDelay: `${Math.min(revealIndex, 12) * 45}ms` }}
    >
      {editing ? (
        <form onSubmit={saveEdit}>
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            rows={3}
            className="w-full resize-none rounded-lg border border-zinc-200 px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent"
          />
          {draftGif !== null ? (
            <div className="relative mt-1 w-fit">
              <img
                src={draftGif}
                alt=""
                referrerPolicy="no-referrer"
                className="max-h-24 rounded-lg"
              />
              <button
                type="button"
                data-testid="note-edit-gif-remove"
                onClick={() => setDraftGif(null)}
                aria-label={t("gif.remove")}
                className="absolute -top-1.5 -right-1.5 rounded-full bg-zinc-800 px-1.5 text-xs text-white"
              >
                ✕
              </button>
            </div>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-accent px-2.5 py-0.5 text-sm font-medium text-white hover:bg-accent-strong"
            >
              {t("note.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-2 py-0.5 text-sm text-zinc-500 hover:bg-zinc-100"
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
          <p className="text-sm break-words whitespace-pre-wrap text-zinc-800">
            {note.text}
          </p>
          {note.gifUrl !== null ? (
            <img
              src={note.gifUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="mt-2 max-h-40 w-full rounded-lg object-contain"
            />
          ) : null}
          <div className="mt-2 flex items-center gap-1.5">
            {author ? (
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: author.color }}
                />
                {author.name}
              </span>
            ) : null}
            <span className="ml-auto flex gap-0.5">
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
                  className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ⋯
                </button>
              ) : null}
              {note.groupId !== null && canCurate ? (
                <button
                  type="button"
                  aria-label={t("group.ungroup")}
                  title={t("group.ungroup")}
                  onClick={() => onUngroup(note)}
                  className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ⇱
                </button>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t("note.edit")}
                  onClick={() => {
                    setDraft(note.text);
                    setDraftGif(note.gifUrl);
                    setEditing(true);
                  }}
                  className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ✎
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  aria-label={t("note.delete")}
                  onClick={remove}
                  className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  🗑
                </button>
              ) : null}
            </span>
          </div>
          {/* Inline, not a floating menu: a dimmed card (opacity) or a hidden
              column is its own stacking context, so a popover hung off the
              card would be drawn under the next one and faded with it. */}
          {arranging && canArrange ? (
            <div
              id={arrangeId}
              data-testid="note-arrange"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                setArranging(false);
                arrangeTrigger.current?.focus();
              }}
              className="mt-2 flex flex-col gap-2 border-t border-zinc-100 pt-2 text-xs"
            >
              {moveOptions.length > 0 ? (
                <div role="group" aria-label={t("note.moveTo")}>
                  <p className="mb-1 text-zinc-500">{t("note.moveTo")}</p>
                  <div className="flex flex-wrap gap-1">
                    {moveOptions.map((column) => (
                      <button
                        key={column.id}
                        type="button"
                        data-testid="note-move-option"
                        onClick={() => {
                          setArranging(false);
                          onMoveToColumn?.(note.id, column.id);
                        }}
                        className="max-w-full truncate rounded-full border border-zinc-200 px-2 py-0.5 text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {column.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {stackOptions.length > 0 ? (
                <div role="group" aria-label={t("note.stackWith")}>
                  <p className="mb-1 text-zinc-500">{t("note.stackWith")}</p>
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
                        }}
                        className="truncate rounded border border-zinc-200 px-2 py-0.5 text-left text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {other.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {revealed ? (
            <div className="mt-2 flex gap-1">
              {REACTION_EMOJI.map((emoji) => {
                const reactors = note.reactions[emoji] ?? [];
                const reacted = reactors.includes(you.id);
                if (reactors.length === 0 && !reacted) {
                  return (
                    <button
                      key={emoji}
                      type="button"
                      data-testid={`react-${emoji}`}
                      onClick={() => toggleReaction(emoji)}
                      className="rounded-full px-1.5 py-0.5 text-xs opacity-40 grayscale hover:opacity-100 hover:grayscale-0 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {emoji}
                    </button>
                  );
                }
                return (
                  <button
                    key={emoji}
                    type="button"
                    data-testid={`react-${emoji}`}
                    aria-pressed={reacted}
                    onClick={() => toggleReaction(emoji)}
                    className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-accent ${
                      reacted
                        ? "bg-accent/10 text-accent-strong"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {emoji} {reactors.length}
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
