// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EXPORT_SCOPES,
  FOLLOW_UP_ACTION_CAP,
  type Action,
  type Column,
  type ExportFormat,
  type Kudo,
  type Note,
  type Participant,
  type VotesState,
} from "@retrobeam/shared";
import { loadAdminToken } from "../lib/session.js";
import { useBoardCopy } from "../lib/useBoardCopy.js";
import { useBoardExport } from "../lib/useBoardExport.js";
import { ActionsPanel } from "./ActionsPanel.js";
import {
  BoardColumns,
  NoteStack,
  readingOrder,
  TargetFrame,
  type DecidingState,
} from "./BoardColumns.js";
import { KudosWall } from "./KudosWall.js";
import { NoteCard } from "./NoteCard.js";
import { RotiPoll } from "./RotiPoll.js";

export interface RetroResultsProps {
  boardId: string;
  boardName: string;
  columns: Column[];
  notes: Note[];
  roster: Participant[];
  you: Participant;
  isAdmin: boolean;
  votes: VotesState;
  actions: Action[];
  kudos: Kudo[];
  rotiReleased: boolean;
  /** epoch-ms auto-delete deadline; null once the facilitator kept the board */
  retentionAt: number | null;
  /** people who had joined when the retro finished; null if not recorded */
  headcount: number | null;
  anonymous: boolean;
  voterNamesEnabled: boolean;
  gifsEnabled: boolean;
}

// The finished retro. It used to say "archived" and then show none of the
// board — the cards and the vote result vanished on "Done", while the spec
// promises a readable archive. It now leads with what the retro produced (the
// crowned topics and the action items), offers the export right after them
// because the board deletes itself, then the pulse and the kudos, and keeps
// the whole board one click away, read-only. Outcome before export on
// purpose: on a phone the export card alone filled the first screen.
//
// It shows nothing the room did not already see in the discussion: the server
// sends the same revealed tallies, crowns and (gated) voter map in "done" as in
// "discuss", and every card goes through NoteCard's own anonymity rule.
export function RetroResults({
  boardId,
  boardName,
  columns,
  notes,
  roster,
  you,
  isAdmin,
  votes,
  actions,
  kudos,
  rotiReleased,
  retentionAt,
  headcount,
  anonymous,
  voterNamesEnabled,
  gifsEnabled,
}: RetroResultsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("de") ? "de-DE" : "en-GB";
  const topics = crownedTopics(votes.topTargetIds, notes, anonymous);
  // A board that never voted has no ranking to lead with — its cards ARE the
  // result, so they start open there instead of behind a click. Derived, not
  // fixed at mount: a plan that goes straight from vote to done sends
  // phase.changed BEFORE votes.revealed, so the page mounts crownless for a
  // moment and must close again when the crowns land. Only a click pins it.
  const [cardsToggled, setCardsToggled] = useState<boolean | null>(null);
  const cardsOpen = cardsToggled ?? topics.length === 0;
  const cardsId = useId();
  const topId = useId();
  const cardsHeadingId = useId();
  const { copying, failed: copyFailed, copy } = useBoardCopy(boardId);
  // The token itself, not the role: a co-facilitator promoted in the room
  // holds none, and the server would refuse the follow-up (as AdminLink).
  const canFollowUp = isAdmin && loadAdminToken(boardId) !== null;
  const openActions = actions.filter((a) => a.status === "open").length;
  // What will actually arrive: the server carries the oldest items up to the
  // cap, so the hint must not promise more than that.
  const carried = Math.min(openActions, FOLLOW_UP_ACTION_CAP);

  // Finishing unmounts the control that did it (the confirm button, a ROTI
  // score, the whole phase row), so focus falls to <body> and a keyboard or
  // screen-reader user is left at the top of the document with nothing said.
  // Pick it up here — but only when it was dropped, never taken from a
  // control that still has it.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) {
      headingRef.current?.focus();
    }
  }, []);

  // Names only where the board shows them, as the vote bar promised before
  // anyone voted. The server already sends null otherwise; this is the same
  // belt and braces VoteBar wears, so a stale map can never outlive the rule.
  const deciding: DecidingState = {
    voteActive: false,
    mine: votes.mine,
    remaining: 0,
    maxPerTarget: null,
    talliesShown: true,
    tallies: votes.tallies,
    topTargetIds: votes.topTargetIds,
    voters: voterNamesEnabled && !anonymous ? votes.voters : null,
    focusId: null,
  };

  const cardProps = {
    roster,
    you,
    phase: "done" as const,
    isAdmin,
    presenterId: null,
    gifsEnabled,
    onDropNote: () => {},
    onUngroup: () => {},
    interactive: false,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 py-4 sm:py-8">
      <section data-testid="results-header" className="flex flex-col gap-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          data-testid="results-title"
          className="text-2xl font-semibold text-zinc-900 focus:outline-none"
        >
          {t("done.title")}
        </h2>
        {/* Counts of what this screen holds and nothing else — no author
            tallies, which on an anonymous board would be attribution. The
            people are the server's count at "done", not the roster: everyone
            who opens the finished board to read it joins the roster too. */}
        <p
          data-testid="results-recap"
          className="text-sm text-zinc-500 tabular-nums"
        >
          {[
            t("done.cards", { count: notes.length }),
            ...(headcount === null
              ? []
              : [t("done.people", { count: headcount })]),
            t("done.actions", { count: actions.length }),
          ].join(" · ")}
        </p>
        <p data-testid="results-retention" className="text-zinc-600">
          {retentionAt === null
            ? t("done.retentionKept")
            : t("done.retention", {
                date: new Intl.DateTimeFormat(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }).format(retentionAt),
              })}
        </p>
        {canFollowUp ? (
          // The retro's natural next step, so it sits with the header rather
          // than in the menu only: what the room agreed to do comes along,
          // without a card or a name — the owner of an item is this board's
          // participant, and no name may outlive this board's 90 days.
          <div className="mt-2 flex flex-col items-start gap-1">
            <button
              type="button"
              data-testid="results-follow-up"
              onClick={() =>
                void copy(
                  "follow-up",
                  t("menu.followUpName", { name: boardName }),
                )
              }
              disabled={copying !== null}
              className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {t("done.followUp")}
            </button>
            <p
              data-testid="results-follow-up-hint"
              className="text-sm text-zinc-500"
            >
              {openActions === 0
                ? t("done.followUpHintNone")
                : openActions > carried
                  ? t("done.followUpHintCapped", {
                      count: openActions,
                      cap: carried,
                    })
                  : t("done.followUpHint", { count: openActions })}
            </p>
            {copyFailed ? (
              <p role="alert" className="text-sm text-red-700">
                {t("done.followUpFailed")}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {topics.length > 0 || actions.length > 0 ? (
        // The discussion phase's own arrangement — the board on the left, the
        // action list in its 320px column on the right — so the outcome sits
        // where the room last saw it. Stacked on a phone, topics first.
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {topics.length > 0 ? (
            <section
              data-testid="top-topics"
              aria-labelledby={topId}
              className="min-w-0 flex-1"
            >
              {/* h2, the level ActionsPanel and KudosWall already use beside
                  it, so heading navigation lists the sections as peers. */}
              <h2
                id={topId}
                className="text-sm font-semibold tracking-wide text-zinc-600 uppercase"
              >
                👑 {t("done.topTopics")}
              </h2>
              <p className="mt-1 mb-3 text-sm text-zinc-500">
                {t("done.topTopicsHint")}
              </p>
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] items-start gap-4">
                {topics.map((topic, index) => (
                  <li key={topic.targetId} data-testid="top-topic">
                    <TargetFrame
                      targetId={topic.targetId}
                      deciding={deciding}
                      roster={roster}
                      onVote={() => {}}
                      onFocus={null}
                    >
                      {topic.stack.length > 1 ? (
                        <NoteStack count={topic.stack.length}>
                          {topic.stack.map((note) => (
                            <NoteCard
                              key={note.id}
                              note={note}
                              revealIndex={index}
                              {...cardProps}
                            />
                          ))}
                        </NoteStack>
                      ) : (
                        <NoteCard
                          note={topic.stack[0] as Note}
                          revealIndex={index}
                          {...cardProps}
                        />
                      )}
                    </TargetFrame>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {actions.length > 0 ? (
            <div className={topics.length > 0 ? "" : "mx-auto"}>
              <ActionsPanel
                actions={actions}
                roster={roster}
                you={you}
                readOnly
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <ResultsExport boardId={boardId} anonymous={anonymous} />

      {/* The ROTI result is published exactly once, on leaving the closing
          phase — so the archived board is where the room actually reads it. */}
      {rotiReleased ? <RotiPoll readOnly /> : null}
      {kudos.length > 0 ? (
        <KudosWall
          kudos={kudos}
          roster={roster}
          you={you}
          isAdmin={isAdmin}
          gifsEnabled={gifsEnabled}
          readOnly
        />
      ) : null}

      <section
        data-testid="all-cards"
        aria-labelledby={cardsHeadingId}
        className="flex flex-col gap-4"
      >
        {/* The disclosure inside a heading, so the section is reachable by
            heading navigation while closed and the column titles (h3 in
            "done") sit under it. */}
        <h2 id={cardsHeadingId}>
          <button
            type="button"
            data-testid="all-cards-toggle"
            aria-expanded={cardsOpen}
            aria-controls={cardsId}
            onClick={() => setCardsToggled(!cardsOpen)}
            className="-ml-2 flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold tracking-wide text-zinc-600 uppercase hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span
              aria-hidden="true"
              // contrast-ok: aria-hidden chevron beside the labelled text
              className={`inline-block text-zinc-400 transition-transform motion-reduce:transition-none ${
                cardsOpen ? "rotate-90" : ""
              }`}
            >
              ▸
            </span>
            {t("done.allCards")}
            <span className="font-normal text-zinc-500 tabular-nums">
              {notes.length}
            </span>
          </button>
        </h2>
        {cardsOpen ? (
          <div id={cardsId}>
            {/* The board itself, in its "done" mode: no composer, no drag, no
                edit, no reactions, no column controls — the server refuses
                all of them on a finished board. A canvas board reads as its
                zones here, as it does in every phase after writing. */}
            <BoardColumns
              columns={columns}
              notes={notes}
              columnCounts={{}}
              roster={roster}
              you={you}
              phase="done"
              editing={{}}
              isAdmin={isAdmin}
              presenterId={null}
              unpresentedAuthorIds={null}
              deciding={deciding}
              gifsEnabled={gifsEnabled}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

interface Topic {
  targetId: string;
  /** the votable's cards: one for a loose note, the members for a stack */
  stack: Note[];
}

// The crowned votables in rank order — the SAME list the discussion walked
// and the summary export prints (top = crowned, not "anything with a vote").
// A stack's id is its anchor note's id; a crown this screen holds no card for
// is skipped rather than drawn empty.
function crownedTopics(
  topTargetIds: string[],
  notes: Note[],
  anonymous: boolean,
): Topic[] {
  const topics: Topic[] = [];
  for (const targetId of topTargetIds) {
    const members = notes
      .filter((n) => n.groupId === targetId)
      .sort(readingOrder(!anonymous));
    if (members.length > 1) {
      topics.push({ targetId, stack: members });
      continue;
    }
    const single = notes.find((n) => n.id === targetId) ?? members[0];
    if (single !== undefined) topics.push({ targetId, stack: [single] });
  }
  return topics;
}

// The export, where the finished retro needs it. Same hook as the board menu
// — same URLs, same image renderer, same author opt-in — laid out for the
// page: the summary first and PDF/Markdown up front, the rest one line down.
function ResultsExport({
  boardId,
  anonymous,
}: {
  boardId: string;
  anonymous: boolean;
}) {
  const { t } = useTranslation();
  const {
    scope,
    setScope,
    includeAuthors,
    setIncludeAuthors,
    imaging,
    imageFailed,
    downloadImage,
    exportHref,
  } = useBoardExport(boardId, "summary");
  // Summary first: it is the keepsake the page is about.
  const scopes = [...EXPORT_SCOPES].reverse();
  const more: ExportFormat[] = ["csv", "json"];

  return (
    <section
      data-testid="results-export"
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-600 uppercase">
          {t("done.export")}
        </h2>
        <div className="flex gap-1.5" role="group">
          {scopes.map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`results-scope-${value}`}
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={`rounded-lg border px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent ${
                scope === value
                  ? "border-accent bg-accent/10 text-accent-strong"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {t(`menu.scope.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="-mt-2 text-sm text-zinc-500">
        {t(`done.scopeHint.${scope}`)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={exportHref("pdf")}
          download
          data-testid="results-export-pdf"
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          PDF
        </a>
        <a
          href={exportHref("md")}
          download
          data-testid="results-export-md"
          className="rounded-lg border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Markdown
        </a>
        <span className="ml-1 flex flex-wrap items-center gap-1 text-sm text-zinc-500">
          {t("done.moreFormats")}:
          {more.map((format) => (
            <a
              key={format}
              href={exportHref(format)}
              download
              data-testid={`results-export-${format}`}
              className="rounded px-1.5 py-0.5 font-medium text-zinc-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {format.toUpperCase()}
            </a>
          ))}
          {/* Not a link: the browser draws it from the export JSON — see
              useBoardExport. */}
          <button
            type="button"
            data-testid="results-export-jpeg"
            disabled={imaging}
            onClick={() => void downloadImage()}
            className="rounded px-1.5 py-0.5 font-medium text-zinc-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {imaging ? t("menu.rendering") : "JPEG"}
          </button>
        </span>
      </div>
      {imageFailed ? (
        <p className="-mt-2 text-xs text-red-700">{t("menu.imageFailed")}</p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1.5 text-sm text-zinc-600">
          <input
            type="checkbox"
            data-testid="results-include-authors"
            checked={includeAuthors}
            onChange={(event) => setIncludeAuthors(event.target.checked)}
            className="accent-accent"
          />
          {t("menu.includeAuthors")}
        </label>
        {/* The server leaves them out whatever this box says; say so, so the
            box cannot be read as a way to get them back. zinc-500, not the
            menu's zinc-400: this line is the only thing saying the box does
            nothing here, and zinc-400 on white is ~2.6:1. */}
        {anonymous ? (
          <p className="text-xs text-zinc-500">
            {t("menu.includeAuthorsAnonymous")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
