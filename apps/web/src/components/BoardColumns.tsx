// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  generateHexId,
  phaseRevealed,
  type Column,
  type Note,
  type Participant,
  type Phase,
  type ServerEvent,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";
import { Dialog } from "./Dialog.js";
import { GifPickerButton } from "./GifPicker.js";
import { Icon } from "./Icon.js";
import { Menu, type MenuItem } from "./Menu.js";
import { NOTE_DRAG_MIME, NoteCard } from "./NoteCard.js";

export interface DecidingState {
  voteActive: boolean;
  /** your own votes. The vote itself is blind — nobody else's reach the client
   *  until the reveal, and then only if the board shows voter names. */
  mine: Record<string, number>;
  remaining: number;
  maxPerTarget: number | null;
  /** tallies/crowns are shown from the discussion phase on */
  talliesShown: boolean;
  tallies: Record<string, number> | null;
  topTargetIds: string[];
  /** who voted for each target (targetId -> participantId -> dots); null while
   *  blind — before the reveal, on anonymous boards, and wherever the
   *  facilitator turned names off */
  voters: Record<string, Record<string, number>> | null;
  focusId: string | null;
}

export interface BoardColumnsProps {
  columns: Column[];
  notes: Note[];
  /** write-phase anonymized note totals per column (all authors); used to show
   *  "N cards from the team" without leaking author or text */
  columnCounts: Record<string, number>;
  roster: Participant[];
  you: Participant;
  phase: Phase;
  editing: Record<string, string>;
  isAdmin: boolean;
  presenterId: string | null;
  /** authors the presenting round has not reached yet — a facilitator-only
   *  marker for "the room cannot read this card yet" (null outside the round) */
  unpresentedAuthorIds: ReadonlySet<string> | null;
  deciding: DecidingState;
  /** presentation mode: cards that are not on stage are hidden rather than
   *  dimmed. Optional-with-default so existing call sites and tests that
   *  enumerate every prop keep compiling. */
  focusMode?: boolean;
  gifsEnabled: boolean;
}

type ColumnItem =
  | { kind: "note"; note: Note }
  | { kind: "stack"; groupId: string; notes: Note[] };

export function BoardColumns(props: BoardColumnsProps) {
  const { columns, notes, phase, isAdmin, deciding } = props;
  const { t } = useTranslation();
  const { mutate } = useConnection();

  function castVote(targetId: string, delta: 1 | -1) {
    const current = deciding.mine[targetId] ?? 0;
    const next = current + delta;
    if (next < 0) return;
    const yourVotes = { ...deciding.mine };
    if (next === 0) delete yourVotes[targetId];
    else yourVotes[targetId] = next;
    mutate(
      // Absolute count, not a delta: a resend after a reconnect must not
      // double-count, which is what makes replaying unacked ops safe.
      { type: "vote.cast", opId: generateHexId(), targetId, count: next },
      { type: "vote.progress", yourVotes },
    );
  }

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  // Curation callbacks live here — building optimistic echoes needs the full
  // note list, which the cards themselves don't have.
  function groupNotes(sourceNoteId: string, target: Note) {
    const source = notes.find((n) => n.id === sourceNoteId);
    if (!source || source.id === target.id) return;
    const groupId = target.groupId ?? target.id; // deterministic, matches the server
    if (source.groupId === groupId) return;
    const events: ServerEvent[] = [];
    if (target.groupId === null) {
      events.push({
        type: "note.updated",
        seq: 0,
        note: { ...target, groupId },
      });
    }
    events.push({
      type: "note.updated",
      seq: 0,
      note: { ...source, groupId, columnId: target.columnId },
    });
    mutate(
      {
        type: "note.group",
        opId: generateHexId(),
        noteId: source.id,
        targetNoteId: target.id,
      },
      events,
    );
  }

  function ungroupNote(note: Note) {
    mutate(
      { type: "note.ungroup", opId: generateHexId(), noteId: note.id },
      { type: "note.updated", seq: 0, note: { ...note, groupId: null } },
    );
  }

  function moveNote(sourceNoteId: string, columnId: string) {
    const source = notes.find((n) => n.id === sourceNoteId);
    if (!source) return;
    if (source.columnId === columnId && source.groupId === null) return;
    mutate(
      { type: "note.move", opId: generateHexId(), noteId: source.id, columnId },
      {
        type: "note.updated",
        seq: 0,
        note: { ...source, columnId, groupId: null },
      },
    );
  }

  function addColumn(event: React.FormEvent) {
    event.preventDefault();
    const name = newColumnName.trim();
    if (name === "") return;
    const columnId = generateHexId();
    const order = (columns[columns.length - 1]?.order ?? -1) + 1;
    mutate(
      { type: "admin.column.create", opId: generateHexId(), columnId, name },
      {
        type: "column.created",
        seq: 0,
        column: { id: columnId, name, order, hidden: false, rect: null },
      },
    );
    setNewColumnName("");
    setAddingColumn(false);
  }

  // Reorganizing is frozen once voting starts (stacks are votables).
  const allowColumnDrop = phase === "write" || phase === "present";
  // The finished board is frozen for the facilitator too — the server refuses
  // every column command in "done", so the controls would only earn a reject
  // and a resync. It is rendered read-only on the results page.
  const manageColumns = isAdmin && phase !== "done";

  // sebaro's board (spec/02 §3.16): the columns side by side, separated by
  // hairlines; below 640 px of its own width they are swiped, and sb-board.js
  // keeps a position bar „Spalte 2 von 3: …“ with a step key each way. The
  // bar is in the markup, so the script inserts nothing into React's tree; it
  // only writes the position's words and the keys' aria-disabled, which React
  // never sets. setup after mount, teardown before unmount (L12).
  const boardRef = useRef<HTMLDivElement>(null);
  const boardId = `board-${useId().replace(/:/g, "")}`;
  useEffect(() => {
    const board = boardRef.current;
    const script = (
      window as {
        sbBoard?: {
          setup: (el: HTMLElement) => void;
          teardown?: (el: HTMLElement) => void;
        };
      }
    ).sbBoard;
    if (!board || !script) return;
    script.setup(board);
    return () => script.teardown?.(board);
  }, []);

  // Focus mode in the discussion: like presenting, the room sees a stage
  // instead of the columns (owner, 2026-11-07) — the card being discussed,
  // large and centred, or, before one is picked, the top topics to pick
  // from. With nothing voted the columns stay.
  const stageIds =
    props.focusMode && phase === "discuss"
      ? deciding.focusId !== null
        ? [deciding.focusId]
        : deciding.topTargetIds
      : [];

  return (
    <div className="sb-stack pb-4">
      {stageIds.length > 0 ? (
        <DiscussStage
          targetIds={stageIds}
          notes={notes}
          columns={columns}
          deciding={deciding}
          roster={props.roster}
          you={props.you}
          isAdmin={isAdmin}
          onVote={castVote}
        />
      ) : null}
      {/* Kept mounted while the stage stands, so sb-board.js stays set up;
          the wrapper hides it (sebaro's .sb-board would outrank [hidden]). */}
      <div hidden={stageIds.length > 0}>
        <div
          ref={boardRef}
          id={boardId}
          data-testid="column-strip"
          className="sb-board"
        >
          <div className="sb-board__nav" hidden>
            <button
              type="button"
              className="sb-icon-button"
              data-sb-board-step="-1"
              aria-label={t("column.previous")}
            >
              <Icon name="chevron-left" />
            </button>
            <p className="sb-board__position" />
            <button
              type="button"
              className="sb-icon-button"
              data-sb-board-step="1"
              aria-label={t("column.next")}
            >
              <Icon name="chevron-right" />
            </button>
          </div>
          {/* Room for a focus ring in the first and last column: sebaro gives
            them a 1 px inner edge, a ring reaches 4 px past its field, and the
            columns' scroll box cut it off (owner, 2026-11-07). The negative
            margin keeps the columns where they were. Only in the column
            layout: the swipe layout under 640 px has its own room. Reported
            to sebaroDesign. */}
          <div className="sb-board__columns @min-[640px]/sb-board:-mx-1 @min-[640px]/sb-board:px-1">
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                {...props}
                onDropNote={groupNotes}
                onUngroup={ungroupNote}
                onMoveToColumn={allowColumnDrop ? moveNote : null}
                onVote={castVote}
              />
            ))}
          </div>
        </div>
      </div>
      {manageColumns && stageIds.length === 0 ? (
        // Outside the board: a facilitator-only affordance must not take a
        // column's place and narrow the facilitator's board.
        addingColumn ? (
          <form onSubmit={addColumn} className="sb-stack max-w-80">
            <div className="sb-field sb-field--compact">
              <label htmlFor={`${boardId}-new`} className="sb-field__label">
                {t("column.namePlaceholder")}
              </label>
              <div className="sb-field__control">
                <input
                  id={`${boardId}-new`}
                  autoFocus
                  value={newColumnName}
                  onChange={(event) => setNewColumnName(event.target.value)}
                  maxLength={60}
                />
              </div>
            </div>
            <div className="sb-cluster">
              <button
                type="submit"
                className="sb-secondary-action sb-secondary-action--compact"
              >
                {t("column.add")}
              </button>
              <button
                type="button"
                onClick={() => setAddingColumn(false)}
                className="sb-secondary-action sb-secondary-action--compact"
              >
                {t("note.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <p>
            <button
              type="button"
              onClick={() => setAddingColumn(true)}
              className="sb-secondary-action sb-secondary-action--compact"
            >
              <Icon name="plus" size={20} />
              {t("column.addColumn")}
            </button>
          </p>
        )
      ) : null}
    </div>
  );
}

function BoardColumn({
  column,
  columns,
  notes,
  columnCounts,
  roster,
  you,
  phase,
  editing,
  isAdmin,
  presenterId,
  unpresentedAuthorIds,
  deciding,
  focusMode = false,
  gifsEnabled,
  onDropNote,
  onUngroup,
  onMoveToColumn,
  onVote,
}: BoardColumnsProps & {
  column: Column;
  onDropNote: (sourceNoteId: string, target: Note) => void;
  onUngroup: (note: Note) => void;
  onMoveToColumn: ((sourceNoteId: string, columnId: string) => void) | null;
  onVote: (targetId: string, delta: 1 | -1) => void;
}) {
  const { t } = useTranslation();
  const { mutate, send } = useConnection();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleId = `column-${column.id}`;

  function focusDiscussion(targetId: string) {
    send({
      type: "admin.discuss.focus",
      targetId: deciding.focusId === targetId ? null : targetId,
    });
  }

  // Presenting focus is a HIGHLIGHT, not a filter. The board grows as the
  // rotation moves — the server sends a member the cards of the people it has
  // already reached and nothing else — so the speaker's cards are lifted out of
  // what the room has read so far rather than being the only thing on screen.
  // (It used to filter here, which also blanked an anonymous board entirely:
  // foreign notes arrive with authorId stripped, so nothing matched.)

  // order is per-author (pre-reveal privacy: a global counter would leak the
  // hidden note count), so ties across authors are broken by id for stability.
  //
  // While WRITING the list runs newest-first, and the composer sits above it
  // (below): a column you keep adding to otherwise pushed your last card
  // further from the box you are typing in with every note, and a card that
  // someone else finished landed on top of yours. Only the write phase is
  // flipped — from the reveal on, the board is being READ, and presenting,
  // stacking and the export all follow the same ascending order the room sees.
  //
  // An ANONYMOUS board sorts a revealed column by id alone. The server sends
  // other people's cards with order 0 (their per-author order would link
  // them), but your own keep theirs — so sorting on it would sink your cards
  // to the bottom of every column, and a shared screen would show the room
  // which ones are yours. While writing you only hold your own, so the order
  // stays useful there.
  const anonymous = useBoardStore(
    (store) => store.state.config?.anonymous ?? false,
  );
  const byOrder = !(anonymous && phaseRevealed(phase));
  const newestFirst = phase === "write";
  const columnNotes = notes
    .filter((note) => note.columnId === column.id)
    .sort(
      newestFirst
        ? (a, b) =>
            (byOrder ? b.order - a.order : 0) || b.id.localeCompare(a.id)
        : readingOrder(byOrder),
    );

  const ColumnTitle = phase === "done" ? "h3" : "h2";

  // Write-phase "cards exist" signal: how many of the column's cards belong to
  // OTHER people. Before the reveal the client only holds its own notes, so
  // (server total − my own) is exactly everyone else's — no author, no text.
  const othersCardCount =
    phase === "write"
      ? Math.max(0, (columnCounts[column.id] ?? 0) - columnNotes.length)
      : 0;

  // Stacks: notes sharing a groupId render together, at the position of the
  // stack's first note.
  // Stacks only render in revealed phases: after a rewind your own grouped
  // notes would otherwise show as unbreakable ×1 stacks (partners hidden).
  const stacksVisible = phaseRevealed(phase);
  const items: ColumnItem[] = [];
  const seenGroups = new Set<string>();
  for (const note of columnNotes) {
    if (note.groupId === null || !stacksVisible) {
      items.push({ kind: "note", note });
    } else if (!seenGroups.has(note.groupId)) {
      seenGroups.add(note.groupId);
      const members = columnNotes.filter((n) => n.groupId === note.groupId);
      // A stack you can only see one card of is not a stack yet — the rest of
      // it belongs to people the round has not reached. Render the loose card
      // rather than a "×1" pile.
      if (members.length < 2) items.push({ kind: "note", note });
      else items.push({ kind: "stack", groupId: note.groupId, notes: members });
    }
  }

  // Ghost cards: colleagues writing in this column right now — activity
  // without content (write phase only; from present on the notes are visible).
  // Never on an anonymous board (plan stage 5g): who is writing where
  // would say whose card lands in which column.
  const ghosts =
    phase === "write" && !anonymous
      ? Object.entries(editing)
          .filter(
            ([participantId, columnId]) =>
              columnId === column.id && participantId !== you.id,
          )
          .map(([participantId]) => roster.find((p) => p.id === participantId))
          .filter((p): p is Participant => p !== undefined)
      : [];

  function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const name = renameValue.trim();
    if (name === "" || name === column.name) {
      setRenaming(false);
      return;
    }
    mutate(
      {
        type: "admin.column.rename",
        opId: generateHexId(),
        columnId: column.id,
        name,
      },
      { type: "column.renamed", seq: 0, column: { ...column, name } },
    );
    setRenaming(false);
  }

  function deleteColumn() {
    mutate(
      {
        type: "admin.column.delete",
        opId: generateHexId(),
        columnId: column.id,
      },
      { type: "column.deleted", seq: 0, columnId: column.id },
    );
  }

  function toggleHidden() {
    const hidden = !column.hidden;
    mutate(
      {
        type: "admin.column.setHidden",
        opId: generateHexId(),
        columnId: column.id,
        hidden,
      },
      { type: "column.updated", seq: 0, column: { ...column, hidden } },
    );
  }

  const cardProps = {
    roster,
    you,
    phase,
    isAdmin,
    presenterId,
    unpresentedAuthorIds,
    gifsEnabled,
    onDropNote,
    onUngroup,
    // The drag gestures' keyboard twin (the card's ⋯): the same callbacks
    // the drops call, so it sends the same commands with the same echoes.
    moveTargets: columns,
    onMoveToColumn,
    stackCandidates: columnNotes,
  };

  // The column's „Mehr“ (sebaro: „Mehr zu <Spalte>“): rename, hide or
  // show, and delete last, which asks first — its cards go with it.
  const columnMenu: MenuItem[] = [
    {
      key: "rename",
      label: t("column.rename"),
      icon: "edit",
      testId: "column-rename",
      onSelect: () => {
        setRenameValue(column.name);
        setRenaming(true);
      },
    },
    {
      key: "hide",
      label: column.hidden ? t("column.reveal") : t("column.hide"),
      icon: column.hidden ? "eye" : "eye-off",
      testId: "column-hide-toggle",
      onSelect: toggleHidden,
    },
    {
      key: "delete",
      label: t("column.deleteOpen"),
      icon: "trash",
      danger: true,
      separatorBefore: true,
      testId: "column-delete",
      onSelect: () => setConfirmingDelete(true),
    },
  ];

  return (
    <section
      data-testid="board-column"
      aria-labelledby={titleId}
      className="sb-board__column"
      onDragOver={(event) => {
        if (
          onMoveToColumn !== null &&
          event.dataTransfer.types.includes(NOTE_DRAG_MIME)
        ) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (onMoveToColumn === null) return;
        const sourceId = event.dataTransfer.getData(NOTE_DRAG_MIME);
        if (sourceId === "") return;
        event.preventDefault();
        onMoveToColumn(sourceId, column.id);
      }}
    >
      <div className="sb-board__head">
        {renaming ? (
          <form onSubmit={submitRename} className="min-w-0 flex-1">
            <div className="sb-field">
              <label
                htmlFor={`${titleId}-rename`}
                className="sb-visually-hidden"
              >
                {t("column.rename")}
              </label>
              <div className="sb-field__control">
                <input
                  id={`${titleId}-rename`}
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={submitRename}
                  maxLength={60}
                />
              </div>
            </div>
          </form>
        ) : (
          // h3 in "done": there the board sits under the results page's "All
          // cards" h2, and an h2 per column read as top-level sections.
          <ColumnTitle id={titleId} className="sb-board__title">
            <span className="sb-board__name">{column.name}</span>
            {column.hidden ? (
              <>
                {" "}
                <span data-testid="column-hidden-badge" className="sb-tag">
                  {t("column.hidden")}
                </span>
              </>
            ) : null}{" "}
            <span className="sb-board__count">
              {columnNotes.length}
              <span className="sb-visually-hidden">
                {" "}
                {t("column.cards", { count: columnNotes.length })}
              </span>
            </span>
          </ColumnTitle>
        )}
        {isAdmin && !renaming && phase !== "done" ? (
          <Menu
            label={t("column.more", { name: column.name })}
            items={columnMenu}
            triggerTestId="column-menu"
          />
        ) : null}
      </div>
      {isAdmin ? (
        <Dialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title={t("column.deleteTitle")}
          testId="column-delete-dialog"
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
                data-testid="column-delete-confirm"
                onClick={() => {
                  setConfirmingDelete(false);
                  deleteColumn();
                }}
                className="sb-danger-action sb-danger-action--outlined"
              >
                <Icon name="trash" size={20} />
                {t("menu.deleteConfirm")}
              </button>
            </>
          }
        >
          <p className="sb-dialog__text">
            {t("column.deleteText", { name: column.name })}
          </p>
        </Dialog>
      ) : null}

      <div className="sb-board__cards">
        {/* The composer is PINNED ABOVE the cards: the card you are writing has
            to stay in view while the column fills up around you, and a
            teammate finishing one in the same column must not shove your input
            down the page. No new cards while somebody holds the mic — the room
            is reading, not writing. */}
        {phaseAllowsComposer(phase) && presenterId === null ? (
          <NoteComposer
            columnId={column.id}
            you={you}
            notes={columnNotes}
            gifsEnabled={gifsEnabled}
          />
        ) : null}
        {/* In-progress work sits together at the top: your own composer, then
            the colleagues writing in this column right now. For a viewer who is
            NOT the writer, a ghost IS the card being written, so the same rule
            — being written above, finished below — has to hold for them too. */}
        {ghosts.map((ghost) => (
          <div
            key={ghost.id}
            data-testid="ghost-card"
            className="sb-card sb-card--item"
          >
            <p className="sb-card__meta flex items-center gap-1">
              <Icon name="edit" size={16} />
              {t("note.ghostWriting", { name: ghost.name })}
            </p>
          </div>
        ))}
        {items.map((item, index) => {
          const targetId = item.kind === "note" ? item.note.id : item.groupId;
          return (
            <TargetFrame
              key={targetId}
              targetId={targetId}
              deciding={deciding}
              roster={roster}
              onVote={onVote}
              onFocus={
                phase === "discuss" &&
                isAdmin &&
                deciding.topTargetIds.length === 0
                  ? () => focusDiscussion(targetId)
                  : null
              }
            >
              {item.kind === "note" ? (
                <NoteCard note={item.note} revealIndex={index} {...cardProps} />
              ) : (
                <NoteStack count={item.notes.length}>
                  {item.notes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      revealIndex={index}
                      {...cardProps}
                    />
                  ))}
                </NoteStack>
              )}
            </TargetFrame>
          );
        })}
        {/* Only while somebody is on stage: between presenters the composer is
            back, and an empty column with a placeholder above a live input
            reads as broken. */}
        {/* sebaro §4.2: an empty column says so. Not while the cards of
            others are still hidden — the column is not empty then. */}
        {items.length === 0 && ghosts.length === 0 && othersCardCount === 0 ? (
          <p className="sb-board__empty">{t("column.empty")}</p>
        ) : null}
        {/* sebaro RB-3: the others' cards as hidden cards with a count, no
            words of theirs. */}
        {othersCardCount > 0 ? (
          <div
            data-testid="team-cards"
            className="sb-card sb-card--item sb-card--hidden"
          >
            <p className="sb-card__title">
              <Icon name="eye-off" size={20} />
              {t("rail.teamCards", { count: othersCardCount })}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// The order a revealed column is read in — ascending, ties by id. `byOrder`
// is false on an anonymous board (see BoardColumn). Exported so the results
// page lists a crowned stack's cards in the same order as the board.
export function readingOrder(byOrder: boolean) {
  return (a: Note, b: Note): number =>
    (byOrder ? a.order - b.order : 0) || a.id.localeCompare(b.id);
}

// A stack's frame: its cards, bundled and counted. Shared with the results
// page, whose crowned stacks must look like the ones the room voted on.
// The discussion's stage (focus mode): one card, or the top topics, out of
// their columns and centred, as the presenting stage does it. A change of
// card comes from the facilitator's screen, so the stage says what it now
// holds.
function DiscussStage({
  targetIds,
  notes,
  columns,
  deciding,
  roster,
  you,
  isAdmin,
  onVote,
}: {
  targetIds: string[];
  notes: Note[];
  columns: Column[];
  deciding: DecidingState;
  roster: Participant[];
  you: Participant;
  isAdmin: boolean;
  onVote: (targetId: string, delta: 1 | -1) => void;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const anonymous = useBoardStore(
    (store) => store.state.config?.anonymous ?? false,
  );
  const single = deciding.focusId !== null;
  const order = readingOrder(!anonymous);
  return (
    <div
      data-testid="discuss-stage"
      aria-live="polite"
      aria-atomic={single}
      className={`mx-auto w-full ${single ? "max-w-3xl" : "max-w-5xl"}`}
    >
      <ol
        className={
          single
            ? "sb-stack"
            : "grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] items-start gap-4"
        }
      >
        {targetIds.map((targetId, index) => {
          const members = notes
            .filter((n) => n.id === targetId || n.groupId === targetId)
            .sort(order);
          const first = members[0];
          if (first === undefined) return null;
          const columnName =
            columns.find((c) => c.id === first.columnId)?.name ?? "";
          const card = (note: Note) => (
            <NoteCard
              key={note.id}
              note={note}
              revealIndex={index}
              roster={roster}
              you={you}
              phase="discuss"
              isAdmin={isAdmin}
              presenterId={null}
              unpresentedAuthorIds={null}
              interactive={false}
              gifsEnabled={false}
              onDropNote={() => {}}
              onUngroup={() => {}}
            />
          );
          return (
            <li key={targetId} className="sb-stack">
              <h3 className="sb-field__label m-0">{columnName}</h3>
              <TargetFrame
                targetId={targetId}
                deciding={deciding}
                roster={roster}
                onVote={onVote}
                onFocus={
                  isAdmin
                    ? () =>
                        send({
                          type: "admin.discuss.focus",
                          targetId:
                            deciding.focusId === targetId ? null : targetId,
                        })
                    : null
                }
                // on the stage, taking the focus off goes back to the top
                // topics, not to every card
                clearLabel={t("discuss.backToTop")}
              >
                {members.length > 1 ? (
                  <NoteStack count={members.length}>
                    {members.map(card)}
                  </NoteStack>
                ) : (
                  card(first)
                )}
              </TargetFrame>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function NoteStack({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="note-stack"
      className="sb-stack rounded-container border border-border p-1"
    >
      <span className="sb-tag self-start tabular-nums">×{count}</span>
      {children}
    </div>
  );
}

// Chrome around each votable (ungrouped note or stack): the blind vote
// control during voting, crown/tally/focus once discussion opened. Exported
// for the results page, which lists the crowned votables with the same chrome.
export function TargetFrame({
  targetId,
  deciding,
  roster,
  onVote,
  onFocus,
  clearLabel,
  children,
}: {
  targetId: string;
  deciding: DecidingState;
  roster: Participant[];
  onVote: (targetId: string, delta: 1 | -1) => void;
  onFocus: (() => void) | null;
  /** what taking the focus off leads back to, when not all cards */
  clearLabel?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const rank = deciding.topTargetIds.indexOf(targetId);
  const focused = deciding.focusId === targetId;
  const dim = deciding.focusId !== null && !focused;
  const myCount = deciding.mine[targetId] ?? 0;
  const tally = deciding.talliesShown
    ? deciding.tallies?.[targetId]
    : undefined;
  const voterChips = Object.entries(deciding.voters?.[targetId] ?? {})
    .map(([participantId, count]) => ({
      participant: roster.find((p) => p.id === participantId),
      count,
    }))
    .filter(
      (entry): entry is { participant: Participant; count: number } =>
        entry.participant !== undefined,
    )
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.participant.name.localeCompare(b.participant.name),
    );
  const plusDisabled =
    deciding.remaining <= 0 ||
    (deciding.maxPerTarget !== null && myCount >= deciding.maxPerTarget);

  // sebaro (plan stage 5g, RB-2): the place in words, never a crown; the
  // tally as thumbs-up and its number; your votes as „− 2 +“ in an sb-vote
  // group, minus and plus aria-disabled at their ends so the focus stays;
  // the voters by name only (F6), each labelled.
  return (
    <div
      data-testid="vote-target"
      className={`sb-stack ${
        focused
          ? "rounded-container outline-[3px] outline-offset-2 outline-(--sb-color-accent) outline-solid"
          : ""
      } ${dim ? "opacity-40" : ""}`}
    >
      {onFocus !== null ? (
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="discuss-focus-card"
            aria-pressed={focused}
            onClick={onFocus}
            className="sb-chip"
          >
            <Icon name="check" size={16} />
            {focused
              ? (clearLabel ?? t("discuss.clearFocus"))
              : t("discuss.focusCard")}
          </button>
        </div>
      ) : null}
      {deciding.talliesShown &&
      (rank >= 0 || tally !== undefined || myCount > 0) ? (
        <div className="flex flex-wrap items-center gap-2">
          {rank >= 0 ? (
            <span data-testid="crown" className="sb-tag">
              {t("done.rank", {
                rank: rank + 1,
                total: deciding.topTargetIds.length,
              })}
            </span>
          ) : null}
          {tally !== undefined ? (
            <span
              data-testid="tally"
              className="sb-card__meta flex items-center gap-1 tabular-nums"
            >
              <Icon name="thumbs-up" size={16} />
              {tally}
              <span className="sb-visually-hidden">
                {" "}
                {t("discuss.votes", { count: tally })}
              </span>
            </span>
          ) : null}
          {/* Your own dots, after the reveal: `mine` survives into discuss,
              so you can still tell which cards were yours. */}
          {myCount > 0 ? (
            <span data-testid="your-vote" className="sb-tag tabular-nums">
              {t("vote.yours", { count: myCount })}
            </span>
          ) : null}
          {/* And who else did — only when the board reveals names. An id with
              no roster row is skipped rather than rendered raw. Each one is
              LABELLED: read aloud, a bare name beside a card is
              indistinguishable from the card's own text. */}
          {voterChips.map((voter) => (
            <span
              key={voter.participant.id}
              data-testid={`voter-${voter.participant.name}`}
              aria-label={t("vote.voterLabel", {
                name: voter.participant.name,
                count: voter.count,
              })}
              className="sb-tag"
            >
              {voter.count > 1
                ? t("vote.voterMulti", {
                    name: voter.participant.name,
                    count: voter.count,
                  })
                : voter.participant.name}
            </span>
          ))}
        </div>
      ) : null}
      {children}
      {deciding.voteActive ? (
        <div
          data-testid="vote-control"
          role="group"
          aria-label={t("vote.group")}
          className="sb-vote self-end"
        >
          <button
            type="button"
            data-testid="vote-minus"
            aria-label={t("vote.minus")}
            aria-disabled={myCount === 0}
            onClick={() => {
              if (myCount > 0) onVote(targetId, -1);
            }}
            className="sb-icon-button"
          >
            <Icon name="minus" />
          </button>
          <span data-testid="vote-count" className="sb-vote__count">
            {myCount}
          </span>
          <button
            type="button"
            data-testid="vote-plus"
            aria-label={t("vote.plus")}
            aria-disabled={plusDisabled}
            onClick={() => {
              if (!plusDisabled) onVote(targetId, 1);
            }}
            className="sb-icon-button"
          >
            <Icon name="plus" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function phaseAllowsComposer(phase: Phase): boolean {
  return phase === "write" || phase === "present";
}

function NoteComposer({
  columnId,
  you,
  notes,
  gifsEnabled,
}: {
  columnId: string;
  you: Participant;
  notes: Note[];
  gifsEnabled: boolean;
}) {
  const { t } = useTranslation();
  const { send, mutate } = useConnection();
  const [text, setText] = useState("");
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const fieldId = useId();
  function submit() {
    const trimmed = text.trim();
    if (trimmed === "") return;
    const noteId = generateHexId();
    // Matches the server's per-author ordering rule.
    const own = notes.filter((note) => note.authorId === you.id);
    const order = Math.max(0, ...own.map((note) => note.order)) + 1;
    const opId = generateHexId();
    mutate(
      {
        type: "note.create",
        opId,
        noteId,
        columnId,
        text: trimmed,
        gifUrl,
      },
      {
        type: "note.created",
        seq: 0,
        note: {
          id: noteId,
          columnId,
          authorId: you.id,
          text: trimmed,
          gifUrl,
          order,
          x: null,
          y: null,
          groupId: null,
          reactions: {},
        },
      },
      // Refused (wrong phase, a board that moved on): hand the text back rather
      // than let the composer's own optimism destroy it.
      () => {
        setText((current) => (current === "" ? trimmed : current));
        setGifUrl((current) => current ?? gifUrl);
      },
    );
    setText("");
    setGifUrl(null);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="sb-field">
        <label htmlFor={fieldId} className="sb-visually-hidden">
          {t("note.placeholder")}
        </label>
        <div className="sb-field__control">
          <textarea
            id={fieldId}
            value={text}
            data-testid={`composer-${columnId}`}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => send({ type: "presence.editing", columnId })}
            onBlur={() => send({ type: "presence.editing", columnId: null })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            maxLength={500}
            rows={2}
            placeholder={t("note.placeholder")}
          />
        </div>
      </div>
      {gifUrl !== null ? (
        <div className="mt-1 flex items-start gap-1">
          <img
            src={gifUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="max-h-24"
          />
          <button
            type="button"
            onClick={() => setGifUrl(null)}
            aria-label={t("gif.remove")}
            className="sb-icon-button"
          >
            <Icon name="close" />
          </button>
        </div>
      ) : null}
      <div className="sb-cluster mt-1">
        {text.trim() !== "" ? (
          <button
            type="submit"
            className="sb-secondary-action sb-secondary-action--compact"
          >
            {t("note.add")}
          </button>
        ) : null}
        {/* A GIF illustrates a note, it is never the note: the button
            waits for text, the same as the submit button beside it. */}
        {gifsEnabled && gifUrl === null && text.trim() !== "" ? (
          <GifPickerButton
            testId={`composer-gif-${columnId}`}
            onPick={setGifUrl}
          />
        ) : null}
      </div>
    </form>
  );
}
