// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Note, ParticipantRole } from "../protocol.js";
import { phaseRevealed, type Phase } from "./phases.js";
import { revealedAuthors, type PickerState } from "./picker.js";

// What ONE viewer may see, with the phase, the role and the rotation already
// folded in. It replaces the bare `phase` argument that used to gate these
// functions, because "present" stopped having one answer for the whole room:
// the facilitator holds the board, a member holds their own cards plus the
// cards of everyone the round has already put on stage.
//
// Changing the TYPE rather than adding an optional argument is deliberate. A
// defaulted argument would fail OPEN at any call site the change missed, and
// the house rule is fail loud — this way the compiler enumerates them.
export type NoteReveal =
  | { readonly kind: "own" }
  | { readonly kind: "stage"; readonly authorIds: ReadonlySet<string> }
  | { readonly kind: "all" };

export const REVEAL_OWN: NoteReveal = { kind: "own" };
export const REVEAL_ALL: NoteReveal = { kind: "all" };

// THE derivation. Role-based rather than viewer-based, so a fan-out resolves it
// once for every member and keeps viewerId as a separate argument.
//
// Order matters and every line is load-bearing:
//  1. before the reveal NOBODY sees a foreign note — the facilitator included.
//     This is the oldest rule in the product and the one people assume wrong.
//  2. facilitator: the whole board. They moderate the round and need to see
//     what is still to come (product spec §5).
//  3. any revealed phase other than "present": everything. Deliberately NOT
//     derived from the rotation — a corrupt picker row, or a phase plan that
//     omits presenting, must not black out the vote phase.
//  4. ANONYMOUS BOARDS ARE NEVER SCOPED. Handing a member exactly the cards of
//     the person the wheel just named IS attribution: over a round it would
//     name the author of every note on a board that promised not to. Anonymity
//     is the stronger promise, so it wins — presenter scoping is simply off
//     there.
//  5. a missing rotation inside "present" reads as "nothing shown yet" — loud
//     and safe rather than quiet and open. The server always writes a picker on
//     entering the phase, so this self-heals within one phase step.
//  6. otherwise: own cards plus every author already on stage (cumulative —
//     what the room has been shown once stays shown).
export function revealFor(
  phase: Phase,
  role: ParticipantRole,
  picker: PickerState | null,
  anonymous: boolean,
): NoteReveal {
  if (!phaseRevealed(phase)) return REVEAL_OWN;
  if (role === "facilitator") return REVEAL_ALL;
  if (phase !== "present") return REVEAL_ALL;
  if (anonymous) return REVEAL_ALL;
  if (picker === null) return { kind: "stage", authorIds: new Set() };
  if (picker.revealedAll) return REVEAL_ALL;
  return { kind: "stage", authorIds: revealedAuthors(picker) };
}

// The reveal for a viewer with no identity. The export endpoint is open to any
// holder of the board id and has no viewer to scope to, so the only honest
// filter is the intersection of what every member can see. Pair it with an
// empty viewer id — a viewer who owns nothing.
export function publicReveal(
  phase: Phase,
  picker: PickerState | null,
  anonymous: boolean,
): NoteReveal {
  return revealFor(phase, "member", picker, anonymous);
}

// THE privacy rule of the product: before reveal, a note exists on the wire
// only for its author; during the presenting round, only for the room the
// rotation has already reached. Everything the server sends — live events AND
// the join/reconnect snapshot — must pass through this filter.
//
// hiddenColumnIds gates a SECOND, orthogonal privacy dimension: a note in a
// facilitator-hidden column is invisible to the viewer regardless of phase or
// authorship. Pass null when the viewer sees every column (a facilitator, or
// callers with no hidden columns) — a hidden column composes with the reveal
// rule by AND (stricter), never OR.
export function noteVisibleTo(
  note: Pick<Note, "authorId" | "columnId">,
  viewerId: string,
  reveal: NoteReveal,
  hiddenColumnIds: ReadonlySet<string> | null = null,
): boolean {
  if (hiddenColumnIds !== null && hiddenColumnIds.has(note.columnId)) {
    return false;
  }
  switch (reveal.kind) {
    case "all":
      return true;
    // An authorId of null means the note has already been through
    // redactNoteForViewer — fail closed rather than re-derive a decision from
    // data the decision's own input was stripped from.
    case "own":
      return note.authorId !== null && note.authorId === viewerId;
    case "stage":
      return (
        note.authorId !== null &&
        (note.authorId === viewerId || reveal.authorIds.has(note.authorId))
      );
  }
}

// Per-viewer sanitisation of a note that has ALREADY passed noteVisibleTo.
// Two things are stripped:
//  1. authorship, on anonymous boards, for everyone but the author (who needs
//     it to know the note is editable). Applies in every phase.
//  2. groupId, when the viewer cannot see the stack's ANCHOR. A stack's id IS
//     its anchor note's id, so shipping it would name a note the viewer was
//     never shown — the same class of leak that broadcastNoteReorg's
//     previousColumnId closed. The note is delivered ungrouped and renders as a
//     plain card. This cannot be enforced when the notes are grouped instead:
//     the reveal boundary MOVES as authors take the stage, so a pair that was
//     legal when it was stacked becomes boundary-spanning later.
// `anchorVisible` is required, not defaulted: every call site must state the
// answer.
export function redactNoteForViewer(
  note: Note,
  viewerId: string,
  anonymous: boolean,
  anchorVisible: boolean,
): Note {
  const hideAuthor = anonymous && note.authorId !== viewerId;
  const hideGroup = note.groupId !== null && !anchorVisible;
  if (!hideAuthor && !hideGroup) return note;
  return {
    ...note,
    ...(hideAuthor ? { authorId: null } : {}),
    ...(hideGroup ? { groupId: null } : {}),
  };
}

export function visibleNotesFor(
  notes: readonly Note[],
  viewerId: string,
  reveal: NoteReveal,
  anonymous: boolean,
  hiddenColumnIds: ReadonlySet<string> | null = null,
): Note[] {
  const visible = notes.filter((note) =>
    noteVisibleTo(note, viewerId, reveal, hiddenColumnIds),
  );
  const visibleIds = new Set(visible.map((note) => note.id));
  return visible.map((note) =>
    redactNoteForViewer(
      note,
      viewerId,
      anonymous,
      // A missing anchor strips the group — the safe answer either way.
      note.groupId === null || visibleIds.has(note.groupId),
    ),
  );
}
