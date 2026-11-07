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
import { Icon } from "./Icon.js";
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
    // sebaro's sections (spec/02 sb-section): 48 px (64 from 1024) of room
    // and a hairline between each, no fills (owner, 2026-11-07). The first
    // starts at the top of the page's own padding.
    <div className="mx-auto w-full max-w-5xl">
      <section
        data-testid="results-header"
        className="sb-stack sb-section"
        style={{ paddingBlockStart: 0 }}
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          data-testid="results-title"
          className="sb-section__title focus:outline-none"
        >
          {t("done.title")}
        </h2>
        {/* Counts of what this screen holds and nothing else — no author
            tallies, which on an anonymous board would be attribution. The
            people are the server's count at "done", not the roster: everyone
            who opens the finished board to read it joins the roster too. */}
        <ul data-testid="results-recap" className="sb-stats">
          <li className="sb-stat">
            <p className="sb-stat__label">{t("done.stat.cards")}</p>
            <p className="sb-stat__value">{notes.length}</p>
          </li>
          {headcount === null ? null : (
            <li className="sb-stat">
              <p className="sb-stat__label">{t("done.stat.people")}</p>
              <p className="sb-stat__value">{headcount}</p>
            </li>
          )}
          <li className="sb-stat">
            <p className="sb-stat__label">{t("done.stat.actions")}</p>
            <p className="sb-stat__value">{actions.length}</p>
          </li>
        </ul>
        <p data-testid="results-retention">
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
          <div className="sb-stack">
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
              aria-busy={copying !== null || undefined}
              className="sb-secondary-action self-start"
            >
              <Icon name="repeat" size={20} />
              {t("done.followUp")}
            </button>
            <p data-testid="results-follow-up-hint" className="sb-field__help">
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
              <p role="alert" className="sb-field__error">
                <Icon name="error" size={16} />
                <span>{t("done.followUpFailed")}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {topics.length > 0 || actions.length > 0 ? (
        // The discussion phase's own arrangement — the board on the left, the
        // action list in its 320px column on the right — so the outcome sits
        // where the room last saw it. Stacked on a phone, topics first.
        <div className="sb-section flex flex-col gap-6 lg:flex-row lg:items-start">
          {topics.length > 0 ? (
            <section
              data-testid="top-topics"
              aria-labelledby={topId}
              className="sb-stack min-w-0 flex-1"
            >
              {/* h2, the level ActionsPanel and KudosWall already use beside
                  it, so heading navigation lists the sections as peers. */}
              <h2 id={topId} className="sb-section__title">
                {t("done.topTopics")}
              </h2>
              <p className="sb-field__help">{t("done.topTopicsHint")}</p>
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] items-start gap-4">
                {topics.map((topic, index) => (
                  <li
                    key={topic.targetId}
                    data-testid="top-topic"
                    className="sb-stack"
                  >
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
              <VotesChart topics={topics} tallies={votes.tallies} />
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

      <div className="sb-section">
        <ResultsExport boardId={boardId} anonymous={anonymous} />
      </div>

      {/* The ROTI result is published exactly once, on leaving the closing
          phase — so the archived board is where the room actually reads it. */}
      {rotiReleased ? (
        <div className="sb-section">
          <RotiPoll readOnly />
        </div>
      ) : null}
      {kudos.length > 0 ? (
        <div className="sb-section">
          <KudosWall
            kudos={kudos}
            roster={roster}
            you={you}
            isAdmin={isAdmin}
            gifsEnabled={gifsEnabled}
            readOnly
          />
        </div>
      ) : null}

      <section
        data-testid="all-cards"
        aria-labelledby={cardsHeadingId}
        className="sb-stack sb-section"
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
            className="sb-secondary-action sb-secondary-action--compact"
          >
            <Icon
              name={cardsOpen ? "chevron-down" : "chevron-right"}
              size={20}
            />
            {t("done.allCards")}
            <span className="tabular-nums">{notes.length}</span>
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
// The votes of the crowned topics as sebaro's grey chart rows (plan stage
// 5e): each row the card's words and its count as text, the bar only beside
// it, never colour alone.
function VotesChart({
  topics,
  tallies,
}: {
  topics: Topic[];
  tallies: Record<string, number> | null;
}) {
  const { t } = useTranslation();
  if (tallies === null) return null;
  const counts = topics.map((topic) => tallies[topic.targetId] ?? 0);
  const max = Math.max(1, ...counts);
  return (
    <figure data-testid="votes-chart" className="sb-chart">
      <ul className="sb-chart__rows">
        {topics.map((topic, index) => {
          const words = topic.stack[0]?.text ?? "";
          const short = words.length > 40 ? `${words.slice(0, 39)}…` : words;
          return (
            <li key={topic.targetId} className="sb-chart__row">
              <span className="sb-chart__name">
                {short} <b>{counts[index]}</b>
              </span>
              <svg
                viewBox="0 0 100 12"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <rect
                  className="sb-chart__fill"
                  width={((counts[index] ?? 0) / max) * 100}
                  height="12"
                />
              </svg>
            </li>
          );
        })}
      </ul>
      <figcaption>{t("done.votesChart")}</figcaption>
    </figure>
  );
}

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
    includeGifs,
    setIncludeGifs,
    imaging,
    imageFailed,
    downloadImage,
    exportHref,
    copyState,
    copyRich,
  } = useBoardExport(boardId, "summary");
  const id = useId();
  // Summary first: it is the keepsake the page is about.
  const scopes = [...EXPORT_SCOPES].reverse();
  const more: ExportFormat[] = ["csv", "json"];

  // sebaro (plan stage 5e): the scope as a segmented choice, summary first;
  // names off when the page loads, and on an anonymous board no option to
  // put them in at all (§6.1 e); „Ergebnis sichern“ (the PDF) as the view's
  // primary action with its data path under it; the other formats beside.
  return (
    <section
      data-testid="results-export"
      aria-labelledby={`${id}-title`}
      className="sb-stack"
    >
      <h2 id={`${id}-title`} className="sb-section__title">
        {t("done.exportTitle")}
      </h2>
      <fieldset className="sb-segmented">
        <legend>{t("menu.exportScope")}</legend>
        <div className="sb-segmented__options">
          {scopes.map((value) => (
            <label key={value} className="sb-segmented__option">
              <input
                type="radio"
                name={`${id}-scope`}
                value={value}
                checked={scope === value}
                data-testid={`results-scope-${value}`}
                onChange={() => setScope(value)}
              />
              <span className="sb-segmented__face">
                <Icon name="check" size={16} />
                {t(`menu.scope.${value}`)}
              </span>
            </label>
          ))}
        </div>
        <p className="sb-field__help">
          <span>{t(`done.scopeHint.${scope}`)}</span>
        </p>
      </fieldset>
      {anonymous ? (
        // The server leaves names out on this board whatever is asked; there
        // is no box to ask with, only the sentence that says so.
        <p className="sb-field__help">{t("menu.includeAuthorsAnonymous")}</p>
      ) : (
        <label className="sb-checkbox">
          <input
            type="checkbox"
            data-testid="results-include-authors"
            checked={includeAuthors}
            onChange={(event) => setIncludeAuthors(event.target.checked)}
          />
          <span>{t("menu.includeAuthors")}</span>
        </label>
      )}
      <label className="sb-checkbox">
        <input
          type="checkbox"
          data-testid="results-include-gifs"
          checked={includeGifs}
          onChange={(event) => setIncludeGifs(event.target.checked)}
        />
        <span>{t("menu.includeGifs")}</span>
      </label>
      <div>
        <a
          href={exportHref("pdf")}
          download
          data-testid="results-export-pdf"
          aria-describedby={`${id}-hint`}
          className="sb-primary-action"
        >
          {t("done.export")}
        </a>
        <p id={`${id}-hint`} className="sb-action-hint">
          {t("done.exportPdfHint")}
        </p>
      </div>
      <div
        role="group"
        aria-label={t("done.moreFormats")}
        className="sb-cluster"
      >
        <span className="sb-field__help">{t("done.moreFormats")}:</span>
        {(["md", ...more] as ExportFormat[]).map((format) => (
          <a
            key={format}
            href={exportHref(format)}
            download
            data-testid={`results-export-${format}`}
            className="sb-secondary-action sb-secondary-action--compact"
          >
            {format === "md" ? "Markdown" : format.toUpperCase()}
          </a>
        ))}
        {/* Not a link: the browser draws it from the export JSON — see
            useBoardExport. */}
        <button
          type="button"
          data-testid="results-export-jpeg"
          aria-busy={imaging || undefined}
          onClick={() => void downloadImage()}
          className="sb-secondary-action sb-secondary-action--compact"
        >
          {imaging ? t("menu.rendering") : "JPEG"}
        </button>
      </div>
      <div className="sb-stack sb-stack--start">
        <button
          type="button"
          data-testid="results-copy-rich"
          aria-describedby={`${id}-copy-hint`}
          onClick={() => void copyRich()}
          className="sb-secondary-action sb-secondary-action--compact"
        >
          <Icon name="copy" size={20} />
          {t("done.copyRich")}
        </button>
        <p id={`${id}-copy-hint`} className="sb-field__help">
          {t("done.copyRichHint")}
        </p>
        <p role="status" data-testid="results-copy-status">
          {copyState === "copied" ? (
            <span className="sb-status sb-status--success">
              <Icon name="success" size={16} />
              <span>{t("done.copied")}</span>
            </span>
          ) : null}
        </p>
        {copyState === "failed" ? (
          <p role="alert" className="sb-field__error">
            <Icon name="error" size={16} />
            <span>{t("done.copyFailed")}</span>
          </p>
        ) : null}
      </div>
      {imageFailed ? (
        <p role="alert" className="sb-field__error">
          <Icon name="error" size={16} />
          <span>{t("menu.imageFailed")}</span>
        </p>
      ) : null}
    </section>
  );
}
