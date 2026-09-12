// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import {
  boardSurface,
  CURSORS_ACTIVATABLE,
  PROTOCOL_VERSION,
  type BoardInfo,
  type ClientCommand,
  type ServerEvent,
} from "@retrobeam/shared";
import { ActionsPanel } from "../components/ActionsPanel.js";
import { AvatarRow } from "../components/AvatarRow.js";
import { BoardCanvas } from "../components/BoardCanvas.js";
import { BoardColumns } from "../components/BoardColumns.js";
import { BoardMenu } from "../components/BoardMenu.js";
import { PresenterFocus } from "../components/PresenterFocus.js";
import { FocusToggle } from "../components/FocusToggle.js";
import { CheckinPanel } from "../components/CheckinPanel.js";
import { DiscussBar } from "../components/DiscussBar.js";
import { KudosWall } from "../components/KudosWall.js";
import { RotiPoll } from "../components/RotiPoll.js";
import { LanguageToggle } from "../components/LanguageToggle.js";
import { LegalFooter } from "../components/LegalFooter.js";
import { NoticeRail } from "../components/NoticeRail.js";
import { PhaseStepper } from "../components/PhaseStepper.js";
import { PresenceRail } from "../components/PresenceRail.js";
import { ReadyBar } from "../components/ReadyBar.js";
import { Roster } from "../components/Roster.js";
import { ShareLink } from "../components/ShareLink.js";
import { TimerPanel } from "../components/TimerPanel.js";
import { VoteBar } from "../components/VoteBar.js";
import { WheelOverlay } from "../components/WheelOverlay.js";
import { fetchBoardInfo } from "../lib/api.js";
import { playTimerChime, soundEnabled, unlockAudio } from "../lib/beep.js";
import { ConnectionProvider, type BoardConnection } from "../lib/connection.js";
import {
  ensureSessionKey,
  loadAdminToken,
  loadDisplayName,
  saveDisplayName,
  saveSessionKey,
} from "../lib/session.js";
import { BoardSocket } from "../lib/socket.js";
import { useBoardStore } from "../store/boardStore.js";

type Gate =
  | { step: "loading" }
  | { step: "missing" }
  | { step: "error" }
  | { step: "join"; board: BoardInfo }
  | { step: "room"; board: BoardInfo; displayName: string };

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [gate, setGate] = useState<Gate>({ step: "loading" });

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    void fetchBoardInfo(boardId).then((result) => {
      if (cancelled) return;
      setGate(
        result.status === "ok"
          ? { step: "join", board: result.board }
          : { step: result.status },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, attempt]);

  if (!boardId) return <NotFound />;
  switch (gate.step) {
    case "loading":
      return null;
    case "missing":
      return <NotFound />;
    case "error":
      return (
        <LookupFailed
          onRetry={() => {
            // Reset the gate from the event handler rather than the effect —
            // an effect that sets state on entry costs an extra render pass.
            setGate({ step: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      );
    case "join":
      return (
        <JoinGate
          board={gate.board}
          onJoin={(displayName) =>
            setGate({ step: "room", board: gate.board, displayName })
          }
        />
      );
    case "room":
      return (
        <Room
          boardId={boardId}
          board={gate.board}
          displayName={gate.displayName}
        />
      );
  }
}

function JoinGate({
  board,
  onJoin,
}: {
  board: BoardInfo;
  onJoin: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => loadDisplayName() ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;
    saveDisplayName(trimmed);
    // Start the audio context while the join click is still on the stack — the
    // autoplay policy will not let us open one later, when the timer ends.
    unlockAudio();
    onJoin(trimmed);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold text-zinc-800">{t("app.name")}</span>
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-4">
          <h1 className="text-2xl font-semibold text-zinc-900">
            {t("join.title", { board: board.name })}
          </h1>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">
              {t("join.yourName")}
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <button
            type="submit"
            disabled={name.trim() === ""}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {t("join.submit")}
          </button>
        </form>
      </main>
      <LegalFooter />
    </div>
  );
}

function Room({
  boardId,
  board,
  displayName,
}: {
  boardId: string;
  board: BoardInfo;
  displayName: string;
}) {
  const { t } = useTranslation();
  const state = useBoardStore((store) => store.state);
  const status = useBoardStore((store) => store.status);
  const socketRef = useRef<BoardSocket | null>(null);
  // A deploy disconnects every socket, and the tab that reconnects is still
  // running the previous bundle. Rather than let it quietly misread a changed
  // wire shape, offer a reload — the board is safe on the server, so reloading
  // costs nothing but the click.
  const [staleBuild, setStaleBuild] = useState(false);

  // Stable connection facade over whichever socket is currently alive. User
  // interactions can only happen after the effect below has run, so the ref
  // is always populated by then.
  // opId -> what to restore if the server refuses that command. Lives in a ref
  // rather than state: nothing renders from it, and a re-render must not lose
  // an entry that is waiting on a round trip.
  const rejectHandlers = useRef(new Map<string, () => void>());
  // Last time the timer chime actually played — see the timer.ended handler.
  const lastChimeAt = useRef(0);

  const connection = useMemo<BoardConnection>(
    () => ({
      boardId,
      send: (command: ClientCommand) => socketRef.current?.send(command),
      mutate: (command, optimistic, onReject) => {
        const events = Array.isArray(optimistic) ? optimistic : [optimistic];
        for (const event of events) useBoardStore.getState().dispatch(event);
        if (onReject && "opId" in command) {
          rejectHandlers.current.set(command.opId, onReject);
        }
        socketRef.current?.send(command);
      },
    }),
    [boardId],
  );

  useEffect(() => {
    const { dispatch, setStatus, setClockOffset, notify } =
      useBoardStore.getState();
    const socket = new BoardSocket({
      boardId,
      join: () => ({
        type: "join",
        name: displayName,
        sessionKey: ensureSessionKey(boardId),
        adminToken: loadAdminToken(boardId) ?? undefined,
      }),
      onEvent: (event: ServerEvent) => {
        if (event.type === "sync") {
          saveSessionKey(boardId, event.you.sessionKey);
          setClockOffset(event.serverNow - Date.now());
          if ((event.protocolVersion ?? PROTOCOL_VERSION) > PROTOCOL_VERSION) {
            setStaleBuild(true);
          }
        }
        if (event.type === "timer.changed") {
          setClockOffset(event.serverNow - Date.now());
        }
        if (event.type === "timer.ended" && soundEnabled()) {
          // The DO broadcasts timer.ended BEFORE clearing the deadline and
          // leans on an at-least-once alarm retry re-broadcasting it. The
          // reducer is idempotent, but a chime is not — and seq is explicitly
          // not a dedupe key (see reducer.ts). While sound was off by default
          // the duplicate was inaudible; now it would ring twice.
          const at = Date.now();
          if (at - lastChimeAt.current > 3000) {
            lastChimeAt.current = at;
            playTimerChime();
          }
        }
        if (event.type === "board.deleted") {
          // The board is gone — stop reconnecting (the DO would 404 anyway).
          dispatch(event);
          socket.close();
          return;
        }
        // A refusal must reach the user in words. Without this the command
        // vanished, the board silently resynced, and whatever had just been
        // typed disappeared with no explanation at all.
        if (event.type === "reject") {
          notify(`reject.${event.code}`);
          if (event.opId !== undefined) {
            rejectHandlers.current.get(event.opId)?.();
            rejectHandlers.current.delete(event.opId);
          }
        }
        if (event.type === "ack") rejectHandlers.current.delete(event.opId);
        if (event.type === "error" && event.code === "RATE_LIMIT") {
          notify("reject.RATE_LIMIT", "warning");
        }
        if (event.type === "error" && event.code === "CURSOR_BUDGET") {
          notify("reject.CURSOR_BUDGET", "warning");
        }
        if (
          event.type === "reject" ||
          (event.type === "error" &&
            (event.code === "NOT_JOINED" || event.code === "BAD_MESSAGE"))
        ) {
          // An optimistic prediction was wrong (race, permission, phase), a
          // command raced the join, or the server refused the frame outright —
          // the snapshot is tiny, so the recovery is a full resync. BAD_MESSAGE
          // matters because it carries no opId: without a resync the optimistic
          // echo would stay applied forever against a server that never saw it.
          socket.send({ type: "resync" });
        }
        dispatch(event);
      },
      onStatus: setStatus,
    });
    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
      useBoardStore.getState().reset();
    };
  }, [boardId, displayName]);

  const you = state.you;
  const isAdmin = you?.role === "facilitator";
  const phasePlan = state.config?.phasePlan;
  const inLobby = state.phase === "lobby";
  const config = state.config;
  const usedVotes = Object.values(state.votes.mine).reduce(
    (sum, count) => sum + count,
    0,
  );
  const talliesShown =
    state.phase === "discuss" ||
    state.phase === "close" ||
    state.phase === "done";
  const showActions = talliesShown;

  // Which surface the board area renders: classic columns, the freeform canvas,
  // or the presenter reader. Canvas is confined to write + the between-presenters
  // overview; everything read/voted/discussed routes to the structured columns.
  const presenterId =
    state.phase === "present" ? (state.picker?.current ?? null) : null;
  const layout = config?.layout ?? "columns";
  // The facilitator's presentation switch: non-active cards are hidden rather
  // than dimmed. Purely a rendering decision — the server sends the same cards
  // either way, so flipping it back restores the board instantly.
  const focusMode = config?.focusMode ?? false;
  const surface = boardSurface(
    layout,
    state.phase,
    presenterId !== null,
    focusMode,
    // Anonymity is what decides whether the presenter reader can work at all —
    // boardSurface owns that rule so the canvas path obeys it too. The focus
    // switch still bites in the discussion phase, which selects cards by
    // target id and does not care who wrote what.
    config?.anonymous ?? false,
  );
  const presenter =
    presenterId !== null
      ? (state.roster.find((p) => p.id === presenterId) ?? null)
      : null;
  // Who the round has NOT reached yet — the facilitator's "the room cannot read
  // this one yet" marker. Facilitator-only on purpose: a member holds no such
  // card except their OWN, and marking someone's own cards as unreadable is
  // exactly backwards. Null once the round has handed the board over, outside
  // the round entirely, and on an anonymous board, where nothing is scoped and
  // authorship is stripped anyway.
  const unpresentedAuthorIds = useMemo(() => {
    if (!isAdmin || state.phase !== "present" || state.picker === null) {
      return null;
    }
    if (state.picker.revealedAll || (config?.anonymous ?? false)) return null;
    const shown = new Set(state.picker.revealed);
    return new Set(
      state.roster.map((p) => p.id).filter((id) => !shown.has(id)),
    );
  }, [isAdmin, config?.anonymous, state.phase, state.picker, state.roster]);
  // Whether the presenting round is actually pacing the reveal — false on an
  // anonymous board and once the board has been handed over, so the rail does
  // not promise a staged reveal that is not happening.
  const scopedRound =
    state.phase === "present" &&
    state.picker !== null &&
    !state.picker.revealedAll &&
    !(config?.anonymous ?? false);

  const onlineCount = useMemo(
    () => state.roster.filter((p) => p.online).length,
    [state.roster],
  );

  if (state.deleted) {
    return (
      <div className="flex min-h-dvh flex-col bg-zinc-50">
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">
            {t("deleted.title")}
          </h1>
          <p className="text-zinc-500">{t("deleted.body")}</p>
          <Link
            to="/new"
            className="text-accent underline underline-offset-4 hover:text-accent-strong"
          >
            {t("notFound.home")}
          </Link>
        </main>
        <LegalFooter />
      </div>
    );
  }

  if (you === null || phasePlan === undefined) {
    return (
      <div className="flex min-h-dvh flex-col bg-zinc-50">
        <main className="flex flex-1 items-center justify-center text-zinc-600">
          {t("status.connecting")}
        </main>
        <LegalFooter openLegalLinksInNewTab />
      </div>
    );
  }

  const gifsEnabled = config?.gifsEnabled ?? true;

  return (
    <ConnectionProvider value={connection}>
      <WheelOverlay />
      <NoticeRail />
      {staleBuild ? (
        <div
          role="status"
          data-testid="stale-build"
          className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900"
        >
          {t("update.available")}
          <button
            type="button"
            onClick={() => location.reload()}
            className="rounded-md bg-amber-900 px-2 py-0.5 font-medium text-white"
          >
            {t("update.reload")}
          </button>
        </div>
      ) : null}
      <div className="flex min-h-dvh flex-col bg-zinc-50">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-200 bg-white px-6 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="font-semibold text-zinc-800">{t("app.name")}</span>
            <h1 className="truncate text-zinc-600">
              {state.board?.name ?? board.name}
            </h1>
          </div>
          <div className="mx-auto">
            <PhaseStepper
              phase={state.phase}
              phasePlan={phasePlan}
              isAdmin={isAdmin}
            />
          </div>
          <div className="flex items-center gap-3">
            <AvatarRow
              participants={state.roster}
              youId={you.id}
              isAdmin={isAdmin}
            />
            {/* Only where there is no rail to carry it — otherwise the same
                count would render twice on one screen. */}
            {showActions ? (
              <span className="text-xs text-zinc-400 tabular-nums">
                {t("rail.online", { count: onlineCount })}
              </span>
            ) : null}
            <BoardMenu
              boardId={boardId}
              boardName={state.board?.name ?? board.name}
              isAdmin={isAdmin}
              gifsEnabled={gifsEnabled}
              cursorsEnabled={config?.cursorsEnabled ?? false}
              voterNamesEnabled={config?.voterNamesEnabled ?? false}
              anonymous={config?.anonymous ?? false}
              phase={state.phase}
              layout={layout}
              retentionAt={state.retentionAt}
            />
            <LanguageToggle />
          </div>
        </header>

        {status !== "online" ? (
          <div
            role="status"
            className="bg-amber-100 px-6 py-2 text-sm text-amber-900"
          >
            {status === "connecting"
              ? t("status.connecting")
              : t("status.offline")}
          </div>
        ) : null}

        {!inLobby && state.phase !== "done" ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-100 bg-white/60 px-6 py-2">
            <TimerPanel timer={state.timer} isAdmin={isAdmin} />
            {/* Top-centre, in the phase strip rather than the header: every
                other phase-scoped control lives here, and the header already
                has one primary element (the phase stepper). Only where it
                bites — presenting a person's cards, and walking the crowned
                ones in the discussion. */}
            {state.phase === "present" || state.phase === "discuss" ? (
              <div className="mx-auto">
                <FocusToggle focusMode={focusMode} isAdmin={isAdmin} />
              </div>
            ) : null}
            {/* Ready lives in the presence rail for the board phases; check-in
                has no rail, so keep the inline toggle there. */}
            {state.phase === "checkin" ? (
              <ReadyBar
                readyIds={state.readyIds}
                roster={state.roster}
                youId={you.id}
              />
            ) : null}
            {state.phase === "vote" && config ? (
              <VoteBar config={config} isAdmin={isAdmin} />
            ) : null}
            {state.phase === "discuss" ? (
              <DiscussBar
                topTargetIds={state.votes.topTargetIds}
                tallies={state.votes.tallies}
                focusId={state.discussFocusId}
                notes={state.notes}
                isAdmin={isAdmin}
              />
            ) : null}
          </div>
        ) : null}

        <main className="flex-1 px-6 py-6">
          {inLobby ? (
            <div className="mx-auto flex max-w-2xl flex-col gap-8">
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <p className="mb-4 text-sm text-zinc-500">
                  {t("lobby.hint", { count: onlineCount })}
                </p>
                <ShareLink boardId={boardId} />
              </div>
              <Roster participants={state.roster} youId={you.id} />
            </div>
          ) : state.phase === "checkin" ? (
            <CheckinPanel
              icebreakerId={state.icebreakerId}
              workingAgreements={state.workingAgreements}
              isAdmin={isAdmin}
            />
          ) : state.phase === "close" ? (
            <div className="flex flex-col gap-8">
              <KudosWall
                kudos={state.kudos}
                roster={state.roster}
                you={you}
                isAdmin={isAdmin}
                gifsEnabled={gifsEnabled}
                readOnly={false}
              />
              <RotiPoll />
            </div>
          ) : state.phase === "done" ? (
            <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 py-12">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-zinc-900">
                  {t("done.title")}
                </h2>
                <p className="mt-2 text-zinc-500">{t("done.body")}</p>
              </div>
              {/* The ROTI result is published exactly once, on leaving the
                  closing phase — so the archived board is where the room
                  actually reads it. */}
              {state.roti.released ? <RotiPoll readOnly /> : null}
              {state.kudos.length > 0 ? (
                <KudosWall
                  kudos={state.kudos}
                  roster={state.roster}
                  you={you}
                  isAdmin={isAdmin}
                  gifsEnabled={gifsEnabled}
                  readOnly
                />
              ) : null}
              {state.actions.length > 0 ? (
                <ActionsPanel
                  actions={state.actions}
                  roster={state.roster}
                  you={you}
                  readOnly
                />
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                {surface === "canvas" ? (
                  <BoardCanvas
                    columns={state.columns}
                    notes={state.notes}
                    columnCounts={state.columnCounts}
                    roster={state.roster}
                    you={you}
                    phase={state.phase}
                    editing={state.editing}
                    isAdmin={isAdmin}
                    presenterId={presenterId}
                    unpresentedAuthorIds={unpresentedAuthorIds}
                    gifsEnabled={gifsEnabled}
                    cursors={state.cursors}
                    cursorsEnabled={
                      (config?.cursorsEnabled ?? false) && CURSORS_ACTIVATABLE
                    }
                  />
                ) : surface === "focus" && presenter ? (
                  <PresenterFocus
                    notes={state.notes}
                    columns={state.columns}
                    roster={state.roster}
                    you={you}
                    phase={state.phase}
                    isAdmin={isAdmin}
                    presenter={presenter}
                    spotlightId={state.spotlightId}
                    focusMode={focusMode}
                    picker={state.picker}
                  />
                ) : (
                  <BoardColumns
                    columns={state.columns}
                    notes={state.notes}
                    columnCounts={state.columnCounts}
                    roster={state.roster}
                    you={you}
                    phase={state.phase}
                    editing={state.editing}
                    isAdmin={isAdmin}
                    presenterId={presenterId}
                    unpresentedAuthorIds={unpresentedAuthorIds}
                    deciding={{
                      voteActive: state.phase === "vote",
                      mine: state.votes.mine,
                      remaining: Math.max(
                        0,
                        (config?.votesPerPerson ?? 0) - usedVotes,
                      ),
                      maxPerTarget: config?.maxPerTarget ?? null,
                      talliesShown,
                      tallies: state.votes.tallies,
                      topTargetIds: state.votes.topTargetIds,
                      voters: state.votes.voters,
                      focusId: state.discussFocusId,
                    }}
                    focusMode={focusMode}
                    gifsEnabled={gifsEnabled}
                  />
                )}
              </div>
              {/* One right-hand column, never two. In the discussion phase the
                  rail is a heading and a roster list and nothing else (its
                  ready toggle and picker cockpit are write/vote/present only),
                  and that roster is already in the header — so 288px of
                  duplicate was pushing board columns out of view in exactly
                  the phase that also pays 320px for the action list. */}
              {showActions ? (
                <ActionsPanel
                  actions={state.actions}
                  roster={state.roster}
                  you={you}
                  readOnly={false}
                />
              ) : (
                <PresenceRail
                  phase={state.phase}
                  roster={state.roster}
                  readyIds={state.readyIds}
                  picker={state.picker}
                  you={you}
                  isAdmin={isAdmin}
                  scopedRound={scopedRound}
                  pickerStyle={config?.pickerStyle ?? "wheel"}
                />
              )}
            </div>
          )}
        </main>
        <LegalFooter openLegalLinksInNewTab />
      </div>
    </ConnectionProvider>
  );
}

function LookupFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <main
        data-testid="lookup-failed"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <h1 className="text-2xl font-semibold text-zinc-900">
          {t("lookupFailed.title")}
        </h1>
        <p className="max-w-prose text-zinc-500">{t("lookupFailed.body")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("lookupFailed.retry")}
        </button>
      </main>
      <LegalFooter />
    </div>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {t("notFound.title")}
        </h1>
        <p className="text-zinc-500">{t("notFound.body")}</p>
        <Link
          to="/new"
          className="text-accent underline underline-offset-4 hover:text-accent-strong"
        >
          {t("notFound.home")}
        </Link>
      </main>
      <LegalFooter />
    </div>
  );
}
