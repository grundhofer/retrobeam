// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  env,
  runDurableObjectAlarm,
  runInDurableObject,
  SELF,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KUDO_EVERYONE, type ServerEvent } from "@retrobeam/shared";
import { boardStub } from "../src/board-stub.js";
import { connect, createBoard, ipHeaders, type TestSocket } from "./helpers.js";

let opCounter = 8000;
function opId(): string {
  return (opCounter++).toString(16).padStart(32, "0");
}
function newId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

type SyncEvent = Extract<ServerEvent, { type: "sync" }>;

async function joined(
  boardId: string,
  name: string,
  adminToken?: string,
): Promise<{ socket: TestSocket; you: SyncEvent["you"]; sync: SyncEvent }> {
  const socket = await connect(boardId);
  socket.send({
    type: "join",
    name,
    ...(adminToken === undefined ? {} : { adminToken }),
  });
  const sync = await socket.waitFor((e) => e.type === "sync");
  if (sync.type !== "sync") throw new Error("unreachable");
  return { socket, you: sync.you, sync };
}

async function advance(
  admin: { socket: TestSocket },
  phases: ReadonlyArray<"write" | "present" | "vote" | "discuss" | "close">,
): Promise<void> {
  for (const phase of phases) {
    admin.socket.send({ type: "admin.phase.set", phase });
    await admin.socket.waitForNext(
      (e) => e.type === "phase.changed" && e.phase === phase,
    );
  }
}

describe("appreciation wall", () => {
  it("kudos are gated to close, revealed as a staged finale, and anonymity hides the sender", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");

    // Not before close.
    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: newId(),
      cardType: "great-job",
      toId: ben.you.id,
      text: "early",
      anonymous: false,
    });
    const locked = await admin.socket.waitForNext((e) => e.type === "reject");
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");

    await advance(admin, ["write", "present", "vote", "discuss", "close"]);

    // A named kudo — Ben sees the sender.
    const openId = newId();
    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: openId,
      cardType: "great-job",
      toId: ben.you.id,
      text: "shipped the picker",
      anonymous: false,
    });
    const created = await ben.socket.waitFor((e) => e.type === "kudo.created");
    if (created.type !== "kudo.created") throw new Error("unreachable");
    expect(created.kudo).toMatchObject({
      toId: ben.you.id,
      fromId: admin.you.id,
    });

    // An anonymous kudo — the sender id never reaches the wire.
    const anonId = newId();
    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: anonId,
      cardType: "thank-you",
      toId: ben.you.id,
      text: "secretly grateful",
      anonymous: true,
    });
    const anon = await ben.socket.waitFor(
      (e) => e.type === "kudo.created" && e.kudo.id === anonId,
    );
    if (anon.type !== "kudo.created") throw new Error("unreachable");
    expect(anon.kudo.fromId).toBeNull();
    // Ben's entire traffic must never carry the anonymous sender's id.
    const benKudoTraffic = ben.socket.events.filter(
      (e) => e.type === "kudo.created" && e.kudo.id === anonId,
    );
    expect(JSON.stringify(benKudoTraffic)).not.toContain(admin.you.id);

    // Staged reveal: a fresh joiner in the close phase sees the wall.
    const cara = await joined(boardId, "Cara");
    expect(cara.sync.kudos).toHaveLength(2);
  });

  // The composer leaves the sender out of its picker, but that is convenience.
  // The rule belongs to the server, so it is tested against the wire.
  it("a kudo addressed to yourself is refused; one to everyone is not", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    await advance(admin, ["write", "present", "vote", "discuss", "close"]);

    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: newId(),
      cardType: "great-job",
      toId: admin.you.id,
      text: "self five",
      anonymous: false,
    });
    const refused = await admin.socket.waitForNext((e) => e.type === "reject");
    if (refused.type !== "reject") throw new Error("unreachable");
    expect(refused.code).toBe("INVALID");
    // Nothing reached the room.
    expect(ben.socket.events.some((e) => e.type === "kudo.created")).toBe(
      false,
    );

    // An unknown-but-well-formed recipient must STILL be a NOT_FOUND: the
    // sentinel branch must not swallow the existence check.
    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: newId(),
      cardType: "great-job",
      toId: "f".repeat(32),
      text: "ghost",
      anonymous: false,
    });
    const missing = await admin.socket.waitForNext((e) => e.type === "reject");
    if (missing.type !== "reject") throw new Error("unreachable");
    expect(missing.code).toBe("NOT_FOUND");

    // "Thanks to all" is addressed to the room, and includes the sender the
    // way any toast does — so it is accepted.
    const allId = newId();
    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: allId,
      cardType: "thank-you",
      toId: KUDO_EVERYONE,
      text: "thanks everyone",
      anonymous: false,
    });
    const created = await ben.socket.waitFor(
      (e) => e.type === "kudo.created" && e.kudo.id === allId,
    );
    if (created.type !== "kudo.created") throw new Error("unreachable");
    expect(created.kudo.toId).toBe(KUDO_EVERYONE);

    // It survives persistence and the staged reveal, not just the broadcast.
    const cara = await joined(boardId, "Cara");
    expect(cara.sync.kudos.map((k) => k.toId)).toContain(KUDO_EVERYONE);
  });

  it("kudos are hidden again on rewind out of close", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    await advance(admin, ["write", "present", "vote", "discuss", "close"]);
    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: newId(),
      cardType: "well-done",
      // Addressed to the room — a kudo to yourself is refused (see the
      // self-kudo test above); the staging rule under test is unaffected.
      toId: KUDO_EVERYONE,
      text: "well played all",
      anonymous: false,
    });
    await admin.socket.waitFor((e) => e.type === "kudo.created");

    admin.socket.send({ type: "admin.phase.set", phase: "discuss" });
    await admin.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "discuss",
    );
    admin.socket.send({ type: "resync" });
    const sync = await admin.socket.waitFor(
      (e) => e.type === "sync" && e.phase === "discuss",
    );
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.kudos).toHaveLength(0); // staged: not visible outside close/done
  });
});

describe("board export", () => {
  it("returns markdown with notes and actions, excluding authors by default", async () => {
    const { boardId, adminToken } = await createBoard("Sprint 50");
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    admin.socket.send({ type: "admin.phase.set", phase: "write" });
    await admin.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "write",
    );
    const noteId = newId();
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId,
      columnId,
      text: "Great sprint",
    });
    await admin.socket.waitFor((e) => e.type === "note.created");
    // Reveal before exporting — pre-reveal exports must not carry note bodies.
    // The export has no viewer to scope to, so it carries what EVERY member may
    // already read: during the presenting round that is the cards of the people
    // the rotation has reached, hence the pick.
    admin.socket.send({ type: "admin.phase.set", phase: "present" });
    await admin.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "present",
    );
    admin.socket.send({
      type: "admin.picker.pick",
      participantId: admin.you.id,
    });
    await admin.socket.waitFor((e) => e.type === "picker.changed");

    const md = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=md`,
    );
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(md.headers.get("content-disposition")).toContain("Sprint-50.md");
    const body = await md.text();
    expect(body).toContain("# Sprint 50");
    expect(body).toContain("Great sprint");
    expect(body).not.toContain("Anna"); // authors excluded by default

    const withAuthors = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=md&authors=true`,
    );
    expect(await withAuthors.text()).toContain("Anna");

    const json = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=json`,
    );
    expect(json.headers.get("content-type")).toContain("application/json");
    const parsed = (await json.json()) as { boardName: string };
    expect(parsed.boardName).toBe("Sprint 50");
  });

  it("404s for unknown boards and 400s for bad formats or scopes", async () => {
    const { boardId } = await createBoard();
    expect(
      (
        await SELF.fetch(
          `https://example.com/api/boards/${"0".repeat(32)}/export`,
        )
      ).status,
    ).toBe(404);
    // The route renders md/csv/json/pdf. JPEG is NOT one of them and must stay
    // a 400: a Worker has no canvas, so the browser draws that one itself —
    // answering 200 here would hand back a text body with an image filename.
    expect(
      (
        await SELF.fetch(
          `https://example.com/api/boards/${boardId}/export?format=jpeg`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await SELF.fetch(
          `https://example.com/api/boards/${boardId}/export?scope=top`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await SELF.fetch(
          `https://example.com/api/boards/${boardId}/export?scope=summary`,
        )
      ).status,
    ).toBe(200);
  });

  it("renders a real PDF from the same snapshot the markdown comes from", async () => {
    const { boardId, adminToken } = await createBoard("Sprint 52");
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advance(admin, ["write"]);
    const noteId = newId();
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId,
      columnId,
      // German, on purpose: the PDF encodes WinAnsi, and umlauts are the whole
      // reason that encoding was chosen over raw ASCII.
      text: "Rückblick über Größen",
    });
    await admin.socket.waitFor((e) => e.type === "note.created");
    await advance(admin, ["present"]);
    admin.socket.send({ type: "admin.picker.spin" });
    await admin.socket.waitFor((e) => e.type === "picker.spun");

    const response = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=pdf`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      "Sprint-52.pdf",
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    // A real PDF, not a string that happens to be served as one.
    expect(String.fromCharCode(...bytes.slice(0, 7))).toBe("%PDF-1.");
    expect(String.fromCharCode(...bytes.slice(-6))).toContain("%%EOF");
    // The umlauts survive as single CP1252 bytes (ü = 0xFC, ö = 0xF6).
    const body = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    expect(body).toContain("R\xfcckblick \xfcber Gr\xf6\xdfen");
  });

  it("does NOT leak unrevealed notes or blind-vote tallies", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advance(admin, ["write"]);
    const secret = newId();
    ben.socket.send({
      type: "note.create",
      opId: opId(),
      noteId: secret,
      columnId,
      text: "Ben's private draft",
    });
    await ben.socket.waitFor((e) => e.type === "note.created");

    // Mid write phase, anyone with the link exports → no note bodies.
    const midWrite = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=json`,
    );
    const writeData = (await midWrite.json()) as {
      columns: { notes: unknown[] }[];
    };
    expect(writeData.columns.every((c) => c.notes.length === 0)).toBe(true);
    expect(
      await (
        await SELF.fetch(
          `https://example.com/api/boards/${boardId}/export?format=md`,
        )
      ).text(),
    ).not.toContain("Ben's private draft");

    // In the vote phase, notes are revealed but tallies stay blind in export.
    await advance(admin, ["present", "vote"]);
    admin.socket.send({
      type: "vote.cast",
      opId: opId(),
      targetId: secret,
      delta: 1,
    });
    await admin.socket.waitFor((e) => e.type === "vote.progress");
    const voteExport = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=json`,
    );
    const voteData = (await voteExport.json()) as {
      columns: { notes: { text: string; votes: number | null }[] }[];
    };
    const exportedNote = voteData.columns
      .flatMap((c) => c.notes)
      .find((n) => n.text === "Ben's private draft");
    expect(exportedNote).toBeDefined(); // note revealed
    expect(exportedNote?.votes).toBeNull(); // but the tally stays blind
  });

  it("renders a kudo addressed to the room as Everyone, not as someone", async () => {
    const { boardId, adminToken } = await createBoard("Sprint 51");
    const admin = await joined(boardId, "Anna", adminToken);
    await advance(admin, ["write", "present", "vote", "discuss", "close"]);
    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: newId(),
      cardType: "thank-you",
      toId: KUDO_EVERYONE,
      text: "great sprint",
      anonymous: false,
    });
    await admin.socket.waitFor((e) => e.type === "kudo.created");

    const md = await (
      await SELF.fetch(
        `https://example.com/api/boards/${boardId}/export?format=md`,
      )
    ).text();
    // The sentinel is resolved server-side into a display name, so the file
    // never leaks the raw "everyone" token — and never falls back to the
    // "someone" the unknown-recipient path uses.
    expect(md).toContain("→ Everyone");
    expect(md).not.toContain("→ someone");

    const json = (await (
      await SELF.fetch(
        `https://example.com/api/boards/${boardId}/export?format=json`,
      )
    ).json()) as { kudos: { toName: string }[] };
    expect(json.kudos[0]?.toName).toBe("Everyone");
  });

  it("summarizes to the crowned cards and the action items, and says so in the filename", async () => {
    const { boardId, adminToken } = await createBoard("Sprint 50");
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advance(admin, ["write"]);
    const crowned = newId();
    const ignored = newId();
    for (const [noteId, text] of [
      [crowned, "Deploys are slow"],
      [ignored, "Nobody voted for this"],
    ] as const) {
      admin.socket.send({
        type: "note.create",
        opId: opId(),
        noteId,
        columnId,
        text,
      });
      await admin.socket.waitFor(
        (e) => e.type === "note.created" && e.note.id === noteId,
      );
    }
    await advance(admin, ["present", "vote"]);
    admin.socket.send({
      type: "vote.cast",
      opId: opId(),
      targetId: crowned,
      count: 3,
    });
    await admin.socket.waitFor((e) => e.type === "vote.progress");

    // Before the reveal the summary is deliberately empty: it must not be a
    // way to read the tallies the vote phase keeps blind.
    const blind = (await (
      await SELF.fetch(
        `https://example.com/api/boards/${boardId}/export?format=json&scope=summary`,
      )
    ).json()) as { columns: unknown[] };
    expect(blind.columns).toEqual([]);

    await advance(admin, ["discuss"]);
    admin.socket.send({
      type: "action.create",
      opId: opId(),
      actionId: newId(),
      text: "Cache the CI image",
      ownerId: null,
    });
    await admin.socket.waitFor((e) => e.type === "action.created");

    const json = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=json&scope=summary`,
    );
    expect(json.headers.get("content-disposition")).toContain(
      "Sprint-50-summary.json",
    );
    const summary = (await json.json()) as {
      columns: { notes: { text: string; crownedRank: number | null }[] }[];
      actions: { text: string }[];
      kudos: unknown[];
    };
    expect(summary.columns).toHaveLength(1);
    expect(summary.columns[0]?.notes).toHaveLength(1);
    expect(summary.columns[0]?.notes[0]?.text).toBe("Deploys are slow");
    expect(summary.columns[0]?.notes[0]?.crownedRank).toBe(1);
    expect(summary.actions.map((a) => a.text)).toEqual(["Cache the CI image"]);
    expect(summary.kudos).toEqual([]);

    // A crowned stack keeps its merged duplicates: the crown sits on the
    // anchor, but the board shows the whole stack and so must the summary.
    admin.socket.send({
      type: "admin.phase.set",
      phase: "present",
    });
    await admin.socket.waitForNext(
      (e) => e.type === "phase.changed" && e.phase === "present",
    );
    const merged = newId();
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId: merged,
      columnId,
      text: "CI takes twenty minutes",
    });
    await admin.socket.waitFor(
      (e) => e.type === "note.created" && e.note.id === merged,
    );
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: merged,
      targetNoteId: crowned,
    });
    await admin.socket.waitFor(
      (e) => e.type === "note.updated" && e.note.id === merged,
    );
    await advance(admin, ["vote", "discuss"]);

    const md = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=md&scope=summary`,
    );
    expect(md.headers.get("content-disposition")).toContain(
      "Sprint-50-summary.md",
    );
    const body = await md.text();
    expect(body).toContain("Summary (top cards & action items)");
    expect(body).toContain("Deploys are slow");
    expect(body).toContain("CI takes twenty minutes"); // the merged duplicate
    expect(body).not.toContain("Nobody voted for this");

    // The full scope is untouched — same board, both cards, old filename.
    const full = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=md`,
    );
    expect(full.headers.get("content-disposition")).toContain("Sprint-50.md");
    expect(await full.text()).toContain("Nobody voted for this");
  });

  it("exports every stacked note's text, attributing the tally to the anchor only", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advance(admin, ["write"]);
    const a = newId();
    const b = newId();
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId: a,
      columnId,
      text: "anchor idea",
    });
    await admin.socket.waitFor(
      (e) => e.type === "note.created" && e.note.id === a,
    );
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId: b,
      columnId,
      text: "duplicate idea",
    });
    await admin.socket.waitFor(
      (e) => e.type === "note.created" && e.note.id === b,
    );
    await advance(admin, ["present"]);
    admin.socket.send({
      type: "admin.picker.pick",
      participantId: admin.you.id,
    });
    await admin.socket.waitFor((e) => e.type === "picker.changed");
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: b,
      targetNoteId: a,
    });
    await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" && e.note.id === b && e.note.groupId === a,
    );

    const md = await (
      await SELF.fetch(
        `https://example.com/api/boards/${boardId}/export?format=md`,
      )
    ).text();
    // Both the anchor AND the stacked member's text survive the export.
    expect(md).toContain("anchor idea");
    expect(md).toContain("duplicate idea");
  });
});

describe("gif URL safety", () => {
  it("drops a note gifUrl from a non-allowlisted host", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advance(admin, ["write"]);
    const noteId = newId();
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId,
      columnId,
      text: "sneaky",
      gifUrl: "https://attacker.example/beacon.gif",
    });
    const created = await admin.socket.waitFor(
      (e) => e.type === "note.created",
    );
    if (created.type !== "note.created") throw new Error("unreachable");
    expect(created.note.gifUrl).toBeNull(); // arbitrary host rejected
  });

  it("drops gifUrl entirely when the board has GIFs disabled", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    admin.socket.send({ type: "admin.gifs.set", enabled: false });
    await admin.socket.waitFor((e) => e.type === "config.changed");
    await advance(admin, ["write"]);
    const noteId = newId();
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId,
      columnId,
      text: "with gif",
      gifUrl: "https://media.klipy.com/ok.gif",
    });
    const created = await admin.socket.waitFor(
      (e) => e.type === "note.created",
    );
    if (created.type !== "note.created") throw new Error("unreachable");
    expect(created.note.gifUrl).toBeNull(); // opt-out enforced server-side
  });

  it("keeps a gifUrl on the allowlisted provider host", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advance(admin, ["write"]);
    const noteId = newId();
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId,
      columnId,
      text: "good gif",
      gifUrl: "https://media.klipy.com/party.gif",
    });
    const created = await admin.socket.waitFor(
      (e) => e.type === "note.created",
    );
    if (created.type !== "note.created") throw new Error("unreachable");
    expect(created.note.gifUrl).toBe("https://media.klipy.com/party.gif");
  });
});

describe("kudos wall re-entry", () => {
  it("re-pushes existing kudos when re-entering the close phase after a rewind", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    await advance(admin, ["write", "present", "vote", "discuss", "close"]);
    const kudoId = newId();
    admin.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId,
      cardType: "great-job",
      toId: ben.you.id,
      text: "nice",
      anonymous: false,
    });
    await ben.socket.waitFor((e) => e.type === "kudo.created");

    // Rewind to discuss (clients clear kudos), then re-enter close.
    admin.socket.send({ type: "admin.phase.set", phase: "discuss" });
    await ben.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "discuss",
    );
    admin.socket.send({ type: "admin.phase.set", phase: "close" });
    // Ben's client must receive the existing kudo again (no manual resync).
    const rePushed = await ben.socket.waitFor(
      (e) => e.type === "kudo.created" && e.kudo.id === kudoId,
    );
    expect(rePushed.type).toBe("kudo.created");
  });
});

describe("GIF proxy", () => {
  it("degrades gracefully to empty when no key is configured", async () => {
    const { boardId } = await createBoard();
    const res = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/gifs/search?q=celebrate`,
      { headers: ipHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean; gifs: unknown[] };
    expect(body.gifs).toEqual([]);
    expect(body.configured).toBe(false); // KLIPY_API_KEY empty in tests
  });

  it("needs a board capability and honours the board's own GIF switch", async () => {
    // Unscoped and non-existent ids never reach the provider: the route used to
    // be an open relay for the operator's search quota.
    expect(
      (
        await SELF.fetch("https://example.com/api/gifs/search?q=x", {
          headers: ipHeaders(),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await SELF.fetch(
          "https://example.com/api/boards/not-a-board/gifs/search?q=x",
          { headers: ipHeaders() },
        )
      ).status,
    ).toBe(404);

    // A board that switched GIFs off answers exactly like an unconfigured key,
    // so the search term never leaves the edge and a member learns nothing.
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    admin.socket.send({ type: "admin.gifs.set", enabled: false });
    await admin.socket.waitFor(
      (e) => e.type === "config.changed" && !e.config.gifsEnabled,
    );
    const off = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/gifs/search?q=celebrate`,
      { headers: ipHeaders() },
    );
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ configured: false, gifs: [] });
    // Switched off is a 200 with configured:false — permanent, "not set up".
    // Being merely BUSY must not look like that; see rate-limiter.test.ts.
  });
});

describe("retention", () => {
  it("keep clears the auto-delete deadline", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    expect(admin.sync.retentionAt).not.toBeNull();

    admin.socket.send({ type: "admin.board.keep" });
    const kept = await admin.socket.waitFor(
      (e) => e.type === "retention.changed",
    );
    if (kept.type !== "retention.changed") throw new Error("unreachable");
    expect(kept.retentionAt).toBeNull();
  });

  it("the retention alarm deletes the board", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);

    // Backdate the retention deadline so the alarm treats it as due.
    const stub = boardStub(env, boardId);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE board_meta SET value = ? WHERE key = 'retentionAt'",
        String(Date.now() - 1000),
      );
    });
    const fired = await runDurableObjectAlarm(stub);
    expect(fired).toBe(true);

    const gone = await admin.socket.waitFor((e) => e.type === "board.deleted");
    expect(gone.type).toBe("board.deleted");
    // The board's meta is wiped — a fresh info() no longer finds it.
    const board = await stub.info();
    expect(board).toBeNull();
  });

  it("delete-now removes the board immediately (admin only)", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");

    ben.socket.send({ type: "admin.board.delete" });
    const rejected = await ben.socket.waitForNext((e) => e.type === "reject");
    if (rejected.type !== "reject") throw new Error("unreachable");
    expect(rejected.code).toBe("NOT_ADMIN");

    admin.socket.send({ type: "admin.board.delete" });
    await admin.socket.waitFor((e) => e.type === "board.deleted");
    expect(await boardStub(env, boardId).info()).toBeNull();
  });

  it("the phase timer still fires when a retention deadline is also armed", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    await advance(admin, ["write"]);
    admin.socket.send({ type: "admin.timer.start", durationSec: 10 });
    await admin.socket.waitFor(
      (e) => e.type === "timer.changed" && e.timer.endsAt !== null,
    );

    const stub = boardStub(env, boardId);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE board_meta SET value = ? WHERE key = 'timerEndsAt'",
        String(Date.now() - 1000),
      );
    });
    await runDurableObjectAlarm(stub);
    const ended = await admin.socket.waitFor((e) => e.type === "timer.ended");
    expect(ended.type).toBe("timer.ended");
    // Board still exists — retention was far in the future.
    expect(await stub.info()).not.toBeNull();
  });
});
