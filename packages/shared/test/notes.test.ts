// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  noteVisibleTo,
  publicReveal,
  redactNoteForViewer,
  revealFor,
  REVEAL_ALL,
  REVEAL_OWN,
  visibleNotesFor,
} from "../src/domain/notes.js";
import { EMPTY_PICKER, type PickerState } from "../src/domain/picker.js";
import type { Note } from "../src/protocol.js";

const annaNote: Note = {
  id: "a".repeat(32),
  columnId: "c".repeat(32),
  authorId: "anna",
  text: "Anna's secret draft",
  order: 1,
  gifUrl: null,
  x: null,
  y: null,
  groupId: null,
  reactions: {},
};
const benNote: Note = {
  ...annaNote,
  id: "b".repeat(32),
  authorId: "ben",
  text: "Ben's note",
};
const caraNote: Note = {
  ...annaNote,
  id: "d".repeat(32),
  authorId: "cara",
  text: "Cara's note",
};

const rotation: PickerState = {
  ...EMPTY_PICKER,
  remaining: ["cara"],
  current: "anna",
  revealed: ["anna"],
};
const onStage = revealFor("present", "member", rotation, false);

describe("revealFor", () => {
  it("shows nobody a foreign note before the reveal — the facilitator included", () => {
    expect(revealFor("write", "member", null, false)).toEqual(REVEAL_OWN);
    // The rule people assume wrong: moderating does not mean reading drafts.
    expect(revealFor("write", "facilitator", null, false)).toEqual(REVEAL_OWN);
    expect(revealFor("lobby", "facilitator", rotation, false)).toEqual(
      REVEAL_OWN,
    );
  });

  it("gives the facilitator the whole board once the writing is done", () => {
    expect(revealFor("present", "facilitator", rotation, false)).toEqual(
      REVEAL_ALL,
    );
  });

  it("scopes a member to the authors the rotation has reached", () => {
    expect(onStage).toEqual({
      kind: "stage",
      authorIds: new Set(["anna"]),
    });
  });

  it("opens the board for every phase after the presenting round", () => {
    // Deliberately NOT derived from the rotation: a corrupt picker row, or a
    // phase plan without a presenting round, must not black out the vote.
    for (const phase of ["vote", "discuss", "close", "done"] as const) {
      expect(revealFor(phase, "member", rotation, false)).toEqual(REVEAL_ALL);
    }
  });

  it("latches open when the round handed the board over", () => {
    expect(
      revealFor("present", "member", { ...rotation, revealedAll: true }, false),
    ).toEqual(REVEAL_ALL);
  });

  it("never scopes an anonymous board", () => {
    // Handing a member exactly the cards of the person the wheel just named IS
    // attribution — over a round it would name every author.
    expect(revealFor("present", "member", rotation, true)).toEqual(REVEAL_ALL);
  });

  it("reads a missing rotation as nothing shown yet", () => {
    expect(revealFor("present", "member", null, false)).toEqual({
      kind: "stage",
      authorIds: new Set(),
    });
  });

  it("gives the export the intersection of what every member may read", () => {
    expect(publicReveal("present", rotation, false)).toEqual(onStage);
    expect(publicReveal("write", rotation, false)).toEqual(REVEAL_OWN);
  });
});

describe("noteVisibleTo", () => {
  it("write phase: only the author sees their note", () => {
    expect(noteVisibleTo(annaNote, "anna", REVEAL_OWN)).toBe(true);
    expect(noteVisibleTo(annaNote, "ben", REVEAL_OWN)).toBe(false);
  });

  it("presenting: your own cards plus the authors already on stage", () => {
    expect(noteVisibleTo(annaNote, "ben", onStage)).toBe(true); // anna staged
    expect(noteVisibleTo(benNote, "ben", onStage)).toBe(true); // your own
    expect(noteVisibleTo(caraNote, "ben", onStage)).toBe(false); // still to come
  });

  it("later phases: everyone sees everything", () => {
    expect(noteVisibleTo(caraNote, "ben", REVEAL_ALL)).toBe(true);
  });

  it("fails closed on a note whose authorship was already stripped", () => {
    const redacted: Note = { ...annaNote, authorId: null };
    expect(noteVisibleTo(redacted, "ben", REVEAL_OWN)).toBe(false);
    expect(noteVisibleTo(redacted, "ben", onStage)).toBe(false);
  });

  it("composes with hidden columns by AND, even for the author", () => {
    const staged = new Set([annaNote.columnId]);
    expect(noteVisibleTo(annaNote, "anna", REVEAL_OWN, staged)).toBe(false);
    expect(noteVisibleTo(annaNote, "ben", REVEAL_ALL, staged)).toBe(false);
    expect(noteVisibleTo(annaNote, "ben", REVEAL_ALL, new Set())).toBe(true);
  });

  it("only ever grows as more authors take the stage", () => {
    const wider = revealFor(
      "present",
      "member",
      { ...rotation, revealed: ["anna", "cara"] },
      false,
    );
    for (const note of [annaNote, benNote, caraNote]) {
      if (noteVisibleTo(note, "ben", onStage)) {
        expect(noteVisibleTo(note, "ben", wider)).toBe(true);
      }
    }
    expect(noteVisibleTo(caraNote, "ben", wider)).toBe(true);
  });
});

describe("redactNoteForViewer", () => {
  it("anonymous boards strip authorship for others but never for the author", () => {
    expect(
      redactNoteForViewer(annaNote, "ben", true, true).authorId,
    ).toBeNull();
    expect(redactNoteForViewer(annaNote, "anna", true, true).authorId).toBe(
      "anna",
    );
    expect(redactNoteForViewer(annaNote, "ben", false, true).authorId).toBe(
      "anna",
    );
  });

  it("strips a stack id whose anchor the viewer cannot see", () => {
    // A stack's id IS its anchor note's id, so shipping it would name a card
    // the viewer was never shown.
    const stacked: Note = { ...benNote, groupId: annaNote.id };
    expect(
      redactNoteForViewer(stacked, "ben", false, false).groupId,
    ).toBeNull();
    expect(redactNoteForViewer(stacked, "ben", false, true).groupId).toBe(
      annaNote.id,
    );
  });
});

describe("visibleNotesFor", () => {
  const all = [annaNote, benNote, caraNote];

  it("write phase snapshot contains only own notes", () => {
    expect(visibleNotesFor(all, "ben", REVEAL_OWN, false)).toEqual([benNote]);
  });

  it("presenting snapshot contains own cards and the authors on stage", () => {
    expect(
      visibleNotesFor(all, "ben", onStage, false).map((n) => n.text),
    ).toEqual(["Anna's secret draft", "Ben's note"]);
  });

  it("anonymous boards redact foreign authors only", () => {
    const notes = visibleNotesFor(all, "ben", REVEAL_ALL, true);
    expect(notes.find((n) => n.id === annaNote.id)?.authorId).toBeNull();
    expect(notes.find((n) => n.id === benNote.id)?.authorId).toBe("ben");
  });

  it("resolves stack anchors against what the viewer actually receives", () => {
    const stacked: Note = { ...benNote, groupId: caraNote.id };
    const notes = visibleNotesFor([stacked, caraNote], "ben", onStage, false);
    // Cara is not on stage, so her id must not ride along on Ben's own card.
    expect(notes).toHaveLength(1);
    expect(notes[0]?.groupId).toBeNull();
  });
});
