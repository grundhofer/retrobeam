// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useMatch, useParams } from "react-router";
import {
  boardSurface,
  CURSORS_ACTIVATABLE,
  pickerBeforeDraw,
  pickerFinished,
  PROTOCOL_VERSION,
  rotationExhausted,
  voteCapacity,
  type BoardInfo,
  type ClientCommand,
  type ServerEvent,
} from "@retrobeam/shared";
import { ActionsPanel } from "../components/ActionsPanel.js";
import { CarriedActions } from "../components/CarriedActions.js";
import { ActionZone } from "../components/ActionZone.js";
import { AdminLink } from "../components/AdminLink.js";
import { AvatarRow } from "../components/AvatarRow.js";
import { BoardCanvas } from "../components/BoardCanvas.js";
import { BoardColumns } from "../components/BoardColumns.js";
import { BoardMenu } from "../components/BoardMenu.js";
import { BoardSettings } from "../components/BoardSettings.js";
import {
  PhaseAnnouncer,
  PhaseGuide,
  phaseGuideKey,
  type GuideSituation,
} from "../components/PhaseGuide.js";
import {
  PresentInterlude,
  PresenterFocus,
} from "../components/PresenterFocus.js";
import { FocusToggle } from "../components/FocusToggle.js";
import { InviteButton } from "../components/InviteButton.js";
import { CheckinPanel } from "../components/CheckinPanel.js";
import { DiscussBar } from "../components/DiscussBar.js";
import { KudosWall } from "../components/KudosWall.js";
import { RetroResults } from "../components/RetroResults.js";
import { RotiPoll } from "../components/RotiPoll.js";
import { LegalFooter } from "../components/LegalFooter.js";
import { PhaseStepper } from "../components/PhaseStepper.js";
import { PhasePlanPanel } from "../components/PhasePlanPanel.js";
import {
  PickerControls,
  PresenceRail,
  PresentStatus,
} from "../components/PresenceRail.js";
import { RoundStatus } from "../components/RoundStatus.js";
import { Roster } from "../components/Roster.js";
import { ShareLink } from "../components/ShareLink.js";
import { Icon } from "../components/Icon.js";
import { MAIN_ID } from "../components/SkipLink.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { StateView } from "../components/StateView.js";
import { TimeLeft, TimerPanel, TimeState } from "../components/TimerPanel.js";
import { VoteBar, VoteSettings } from "../components/VoteBar.js";
import { WheelOverlay } from "../components/WheelOverlay.js";
import { adoptAdminLink } from "../lib/adminLink.js";
import { fetchBoardInfo } from "../lib/api.js";
import { ConnectionProvider, type BoardConnection } from "../lib/connection.js";
import {
  ensureSessionKey,
  loadAdminToken,
  loadDisplayName,
  saveDisplayName,
  saveSessionKey,
} from "../lib/session.js";
import { BoardSocket } from "../lib/socket.js";
import {
  playTimerSound,
  timerSoundEnabled,
  unlockAudio,
} from "../lib/timerSound.js";
import { heldDuringDraw, useDrawInFlight } from "../lib/useDrawInFlight.js";
import { useMissingField } from "../lib/useMissingField.js";
import { useNarrow } from "../lib/useNarrow.js";
import { useBoardStore } from "../store/boardStore.js";
import tile from "../../../../sebaro-product/sign/tile.svg?raw";

type Gate =
  | { step: "loading" }
  | { step: "missing" }
  | { step: "error" }
  | { step: "join"; board: BoardInfo; takenName?: string }
  | { step: "room"; board: BoardInfo; displayName: string };

export function BoardPage() {
  const { t } = useTranslation();
  const { boardId } = useParams<{ boardId: string }>();
  const [gate, setGate] = useState<Gate>({ step: "loading" });
  const appName = t("app.name");

  // The plain product name, whichever way in. index.html's static <title> is
  // the German landing wording for link previews, and a board opened straight
  // from its invitation link would otherwise keep it for the whole retro, in
  // any UI language, while whoever came in through /new saw "RetroBeam".
  useEffect(() => {
    document.title = appName;
  }, [appName]);

  // Counts the facilitator links opened in this tab (see adoptAdminLink). The
  // fragment is read and wiped here, before anyone types a name, so the token
  // is already stored when the join goes out — the ordinary join path carries
  // it from there, exactly as it does for the browser that created the board.
  // hashchange too: pasting the link over this board's own address changes
  // only the fragment, which reloads nothing. A member already in the room is
  // then re-joined (Room is keyed on this count) and comes back facilitator.
  const [adminLinks, setAdminLinks] = useState(0);
  // Whether the latest of those links was set aside for the token this
  // browser already holds — the join cannot tell (see adoptAdminLink).
  const [adminLinkConflict, setAdminLinkConflict] = useState(false);
  useEffect(() => {
    if (!boardId) return;
    const id = boardId;
    function adopt() {
      const outcome = adoptAdminLink(id);
      if (outcome === "none") return;
      setAdminLinkConflict(outcome === "conflict");
      setAdminLinks((n) => n + 1);
    }
    adopt();
    window.addEventListener("hashchange", adopt);
    return () => window.removeEventListener("hashchange", adopt);
  }, [boardId]);

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
          takenName={gate.takenName}
          onJoin={(displayName) =>
            setGate({ step: "room", board: gate.board, displayName })
          }
        />
      );
    case "room":
      return (
        <Room
          key={adminLinks}
          boardId={boardId}
          board={gate.board}
          displayName={gate.displayName}
          fromAdminLink={adminLinks > 0}
          adminLinkConflict={adminLinkConflict}
          onNameTaken={() =>
            setGate({
              step: "join",
              board: gate.board,
              takenName: gate.displayName,
            })
          }
        />
      );
  }
}

// The board's title in the head, set as sebaro's specimen sets it (body type,
// spec/03 §6.6). Inline, because sebaro.css is unlayered: its h1 rule would
// beat a utility class.
const APP_HEAD_TITLE: CSSProperties = {
  margin: 0,
  minInlineSize: 0,
  font: "var(--sb-type-body)",
  letterSpacing: "var(--sb-type-body-tracking)",
  overflowWrap: "anywhere",
};

function JoinGate({
  board,
  takenName,
  onJoin,
}: {
  board: BoardInfo;
  /** the name the server refused: someone in this board already has it */
  takenName?: string | undefined;
  onJoin: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => takenName ?? loadDisplayName() ?? "");
  // The server's refusal stands at the field until the name is changed.
  const taken = takenName !== undefined && name.trim() === takenName;
  const takenId = useId();
  // Same as the create form: the button stays pressable and an empty name is
  // answered at the field (sebaro STA-03).
  const nameField = useMissingField();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      nameField.report();
      return;
    }
    saveDisplayName(trimmed);
    onJoin(trimmed);
  }

  // The same form as /new (stage 4a): sebaro's grid, the name in an
  // sb-field with its missing-name error at the field (STA-03), the primary
  // action never disabled, and under it where the name goes (BEL-10, F20).
  // Joining is still outside the board, so it has the site's header.
  return (
    <div data-sb-view="board" className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id={MAIN_ID} className="sb-container sb-section flex-1">
        <div className="mx-auto max-w-md">
          <form className="sb-form-grid" onSubmit={submit}>
            <h1 className="sb-form-grid__wide">
              {t("join.title", { board: board.name })}
            </h1>
            <div className="sb-field sb-form-grid__wide">
              <label
                className="sb-field__label"
                htmlFor={nameField.fieldProps.id}
              >
                {t("join.yourName")}
              </label>
              <div className="sb-field__control">
                <input
                  {...nameField.fieldProps}
                  {...(taken
                    ? { "aria-invalid": true, "aria-describedby": takenId }
                    : {})}
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    nameField.typed(event.target.value);
                  }}
                  maxLength={40}
                  autoComplete="off"
                />
              </div>
              {nameField.missing ? (
                <p className="sb-field__error" id={nameField.messageId}>
                  <Icon name="error--filled-16" size={16} />
                  {t("join.nameMissing")}
                </p>
              ) : taken ? (
                <p
                  className="sb-field__error"
                  id={takenId}
                  data-testid="join-name-taken"
                >
                  <Icon name="error--filled-16" size={16} />
                  {t("join.nameTaken", { name: takenName })}
                </p>
              ) : null}
              <p role="status" className="sb-visually-hidden">
                {nameField.spoken ? t("join.nameMissing") : ""}
              </p>
            </div>
            <div className="sb-form-grid__actions">
              <button type="submit" className="sb-primary-action">
                <span className="sb-primary-action__label">
                  {t("join.submit")}
                </span>
              </button>
              <p className="sb-action-hint">{t("home.dataPath")}</p>
            </div>
          </form>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}

function Room({
  boardId,
  board,
  displayName,
  fromAdminLink,
  adminLinkConflict,
  onNameTaken,
}: {
  boardId: string;
  board: BoardInfo;
  displayName: string;
  // A facilitator link was opened in this tab — see BoardPage.
  fromAdminLink: boolean;
  // ...and the latest one differed from the token already stored here.
  adminLinkConflict: boolean;
  /** the server refused the name: someone in this board already has it */
  onNameTaken: () => void;
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
  const [cardsOpen, setCardsOpen] = useState(false);
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);
  const boardPath = `/board/${boardId}`;
  const inSettings = useMatch("/board/:boardId/settings") !== null;

  // Stable connection facade over whichever socket is currently alive. User
  // interactions can only happen after the effect below has run, so the ref
  // is always populated by then.
  // opId -> what to restore if the server refuses that command. Lives in a ref
  // rather than state: nothing renders from it, and a re-render must not lose
  // an entry that is waiting on a round trip.
  const rejectHandlers = useRef(new Map<string, () => void>());
  // Whether the first sync after a facilitator link has been checked yet.
  const adminLinkChecked = useRef(false);
  // When the timer sound last played — see the timer.ended handler.
  const lastTimerSoundAt = useRef(0);
  // Read through a ref, so a new callback from the gate does not reconnect.
  const onNameTakenRef = useRef(onNameTaken);
  useEffect(() => {
    onNameTakenRef.current = onNameTaken;
  }, [onNameTaken]);
  // The browser lets audio start only inside a click or key press, so with
  // the timer sound on, every one of them on the board starts (or, after the
  // tab was in the background, resumes) the audio the sound will need.
  // Someone who has not touched the page since loading it hears nothing; the
  // switch's sentence says so.
  useEffect(() => {
    const unlock = () => {
      if (timerSoundEnabled()) unlockAudio();
    };
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    };
  }, []);

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
    const { dispatch, setStatus, setClockOffset, notify, clearNotices } =
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
          // The server never says why a token did not count — a wrong one
          // joins as a member, silently, like any link holder. So the tab
          // that just opened a facilitator link says it for the server: once,
          // gently, and without guessing which of the two reasons applies (a
          // link cut short in a chat, or a demotion that sticks to this
          // session by design).
          //
          // A link set aside for the stored token is said regardless of the
          // role: this browser may well still be facilitator — on the token it
          // kept, not on the link that was just opened.
          if (fromAdminLink && !adminLinkChecked.current) {
            adminLinkChecked.current = true;
            if (adminLinkConflict) {
              notify("adminLink.conflict", "warning");
            } else if (event.you.role !== "facilitator") {
              notify("adminLink.notAccepted", "warning");
            }
          }
          if ((event.protocolVersion ?? PROTOCOL_VERSION) > PROTOCOL_VERSION) {
            setStaleBuild(true);
          }
        }
        if (event.type === "timer.changed") {
          setClockOffset(event.serverNow - Date.now());
        }
        // The sound comes only from this live event, so a reload after the
        // time ran out stays quiet. The DO broadcasts timer.ended before it
        // clears the deadline and leans on an alarm retry that may send it
        // again; the reducer does not mind, a sound would ring twice.
        if (event.type === "timer.ended" && timerSoundEnabled()) {
          const at = Date.now();
          if (at - lastTimerSoundAt.current > 3000) {
            lastTimerSoundAt.current = at;
            playTimerSound();
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
        if (event.type === "ack") {
          rejectHandlers.current.delete(event.opId);
          // The next command went through: a refusal shown before is past.
          clearNotices();
        }
        if (event.type === "phase.changed") clearNotices();
        // The name is someone else's here: back to the join form, which says
        // so at the field. Closing stops the socket from rejoining with it.
        if (event.type === "error" && event.code === "NAME_TAKEN") {
          socket.close();
          onNameTakenRef.current();
          return;
        }
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
  }, [boardId, displayName, fromAdminLink, adminLinkConflict]);

  const you = state.you;
  const isAdmin = you?.role === "facilitator";
  const adminToken = loadAdminToken(boardId);
  const phasePlan = state.config?.phasePlan;
  const inLobby = state.phase === "lobby";
  const config = state.config;
  const pickerStyle = config?.pickerCards
    ? "cards"
    : (config?.pickerStyle ?? "wheel");
  const usedVotes = Object.values(state.votes.mine).reduce(
    (sum, count) => sum + count,
    0,
  );
  const talliesShown =
    state.phase === "discuss" ||
    state.phase === "close" ||
    state.phase === "done";
  const showActions = talliesShown;
  // The phases that wait for everyone to finish: the round's status stands
  // above the board instead of the side rail.
  const roundPhase = state.phase === "write" || state.phase === "vote";

  // While a draw is still turning, the board shows the rotation as it stood
  // before it: nobody on stage, the winner's cards not there yet. The server
  // has committed the draw already and sends their cards with the spin, but
  // the overlay's scrim lets the board show through — „Gerade: Anna“ and her
  // first card were readable behind the turning wheel (owner, 2026-11-20).
  // The facilitator's own controls keep the real rotation (PickerControls).
  const drawing = useDrawInFlight();
  const shownPicker = useMemo(
    () =>
      state.picker !== null && drawing !== null
        ? pickerBeforeDraw(state.picker, drawing)
        : state.picker,
    [state.picker, drawing],
  );
  const heldAuthorId = heldDuringDraw(
    drawing,
    { id: you?.id, isAdmin },
    state.picker?.revealedAll ?? false,
  );
  const shownNotes = useMemo(
    () =>
      heldAuthorId === null
        ? state.notes
        : state.notes.filter((note) => note.authorId !== heldAuthorId),
    [state.notes, heldAuthorId],
  );
  // Which surface the board area renders: classic columns, the freeform canvas,
  // or the presenter reader. Canvas is confined to write + the between-presenters
  // overview; everything read/voted/discussed routes to the structured columns.
  const presenterId =
    state.phase === "present" ? (shownPicker?.current ?? null) : null;
  const layout = config?.layout ?? "columns";
  // The facilitator's presentation switch: non-active cards are hidden rather
  // than dimmed. Purely a rendering decision — the server sends the same cards
  // either way, so flipping it back restores the board instantly.
  const focusMode = config?.focusMode ?? false;
  const anonymous = config?.anonymous ?? false;
  // Presenting with a rotation (not on an anonymous board): the presenting
  // round's status row stands above the board instead of the rail.
  const presentRound = state.phase === "present" && !anonymous;
  // Where you stand, for the action zone's line (owner, 2026-11-20). From
  // the rotation as shown, so a turning draw names nobody here either; the
  // votes you can still give count a per-card limit that leaves some of the
  // budget unspendable (voteCapacity, the server's rule for a full hand).
  const guideSituation: GuideSituation | null =
    you === null
      ? null
      : {
          ready: state.readyIds.includes(you.id),
          turn:
            presenterId === you.id
              ? "now"
              : shownPicker !== null && pickerFinished(shownPicker)
                ? "over"
                : (shownPicker?.presented.includes(you.id) ?? false)
                  ? "had"
                  : "waiting",
          votesLeft:
            state.phase === "vote" && config
              ? Math.max(
                  0,
                  voteCapacity(
                    config.votesPerPerson,
                    config.maxPerTarget,
                    state.notes,
                  ) - usedVotes,
                )
              : null,
        };
  // The action zone's state sentence: the phase's guide and the time box.
  const timerActive =
    state.timer.endsAt !== null || state.timer.pausedRemainingMs !== null;
  // The facilitator reads the time in the „Moderation“ group, beside its
  // keys; the action zone keeps the time for everyone else.
  const hasStatus =
    phaseGuideKey({
      phase: state.phase,
      isAdmin,
      anonymous,
      situation: guideSituation,
    }) !== null ||
    (timerActive && !isAdmin);
  const moderationId = useId();
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
    // Somebody can still be called up: the stage between two people holds.
    shownPicker === null ||
      (!shownPicker.revealedAll && !rotationExhausted(shownPicker)),
  );
  const narrow = useNarrow();
  // sebaro's pointers (RB-5) are aria-hidden; the action zone says how many
  // others are on the canvas: „2 Personen sind auf der Fläche.“ Counted as
  // BoardCanvas draws them.
  const cursorsShown =
    (config?.cursorsEnabled ?? false) && CURSORS_ACTIVATABLE && !anonymous;
  const pointerCount =
    surface === "canvas" && !narrow && cursorsShown
      ? state.roster.filter(
          (p) => p.id !== you?.id && state.cursors[p.id] !== undefined,
        ).length
      : 0;
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
    // The rotation as shown: during a draw the winner keeps the mark.
    if (!isAdmin || state.phase !== "present" || shownPicker === null) {
      return null;
    }
    if (shownPicker.revealedAll || (config?.anonymous ?? false)) return null;
    const shown = new Set(shownPicker.revealed);
    return new Set(
      state.roster.map((p) => p.id).filter((id) => !shown.has(id)),
    );
  }, [isAdmin, config?.anonymous, state.phase, shownPicker, state.roster]);
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
      <StateView
        view="board"
        title={t("deleted.title")}
        text={t("deleted.body")}
        action={
          <Link to="/new" className="sb-primary-action">
            {t("notFound.home")}
          </Link>
        }
        footer={<LegalFooter />}
      />
    );
  }

  if (you === null || phasePlan === undefined) {
    return (
      <div data-sb-view="board" className="flex min-h-dvh flex-col">
        <main id={MAIN_ID} className="sb-container sb-section flex-1">
          <p className="sb-loading" role="status">
            <Icon name="loader" size={20} className="sb-spinner" />
            {t("status.connecting")}
          </p>
        </main>
        <LegalFooter openLegalLinksInNewTab />
      </div>
    );
  }

  const gifsEnabled = config?.gifsEnabled ?? true;

  return (
    <ConnectionProvider value={connection}>
      <WheelOverlay
        cardSelectionOpen={cardsOpen}
        isAdmin={isAdmin}
        onCloseCardSelection={() => setCardsOpen(false)}
      />
      <PhaseAnnouncer
        phase={state.phase}
        isAdmin={isAdmin}
        anonymous={anonymous}
      />
      {staleBuild ? (
        // A note, not an error: the board works on, and reloading fetches the
        // new version (sebaro spec/02 §3.11, one sentence with an action).
        <div
          role="status"
          data-testid="stale-build"
          className="sb-callout sb-callout--note m-2"
        >
          <Icon name="info--filled" size={20} />
          <p className="sb-callout__text">{t("update.available")}</p>
          <div className="sb-callout__actions">
            <button
              type="button"
              onClick={() => location.reload()}
              className="sb-secondary-action sb-secondary-action--compact"
            >
              {t("update.reload")}
            </button>
          </div>
        </div>
      ) : null}
      {/* overflow-x: clip is a safety net, not the fix: every known cause of
          sideways scrolling on a phone is fixed where it arises (the phase
          row, the header popovers), and e2e/mobile.spec.ts measures with this
          clip switched off. It stays because one overflowing descendant is
          enough to widen the whole layout viewport on a phone — and that is
          what threw the fixed wheel overlay off centre. `clip`, not `hidden`:
          it creates no scroll container, so nothing sticky breaks. */}
      <div
        data-board-root
        data-sb-view="board"
        className="sb-view sb-view--wide min-h-dvh overflow-x-clip"
      >
        {/* sebaro's web app without a window, round 7 (spec/03 §6.6,
            D143 (7)): one head with the tile and the name back to the
            start, the board's title, the people, „Einladen“ as a text
            action and „Mehr“, which holds the board's actions, „Hell oder
            Dunkel“, „Farbton“, „Sprache“ and „Einstellungen“. No navigation
            words and no theme button. The settings view is a child route,
            so this same Room — and its socket — renders it; there the
            board's title is no heading, „Einstellungen“ is. */}
        <header
          data-sb-web-app-head
          className="sb-cluster border-b border-border px-gutter py-3"
        >
          {/* The title follows the name; the lockup's own margin (a
              website header's) would push it to the far end. */}
          <Link to="/" className="sb-lockup" style={{ marginInlineEnd: 0 }}>
            <span
              className="sb-sign-tile sb-sign-tile--32 flex-none"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: tile }}
            />
            <span className="sb-wordmark" translate="no">
              Retro{"\u00ad"}Beam
            </span>
          </Link>
          {inSettings ? (
            <p style={APP_HEAD_TITLE}>{state.board?.name ?? board.name}</p>
          ) : (
            <h1 style={APP_HEAD_TITLE}>{state.board?.name ?? board.name}</h1>
          )}
          {/* People, „Einladen“ and „Mehr“ at the head's end; they wrap as
              one group. Inline, as sebaro.css's cluster rule beats ms-auto. */}
          <div className="sb-cluster" style={{ marginInlineStart: "auto" }}>
            <AvatarRow
              participants={state.roster}
              youId={you.id}
              isAdmin={isAdmin}
            />
            {/* Only where there is no rail to carry it — otherwise the same
                count would render twice on one screen. */}
            {showActions && !inSettings ? (
              <span className="sb-top-bar__subtitle tabular-nums">
                {t("rail.online", { count: onlineCount })}
              </span>
            ) : null}
            {/* Not once the retro is over: "done" is terminal and nobody
                joins it to take part. */}
            {state.phase !== "done" ? <InviteButton boardId={boardId} /> : null}
            <BoardMenu
              boardId={boardId}
              boardName={state.board?.name ?? board.name}
              isAdmin={isAdmin}
              anonymous={config?.anonymous ?? false}
              columns={state.columns}
              settingsPath={`${boardPath}/settings`}
            />
          </div>
        </header>
        {inSettings ? null : (
          <div className="flex flex-col gap-4 border-b border-border px-gutter py-4">
            {/* On every screen, in every phase: anonymity only earns trust
                if the room can see it is on — a latecomer never passes the
                lobby that explains it. The tag names it, the sentence
                beside it says what it means. */}
            {anonymous ? (
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span data-testid="anonymous-badge" className="sb-tag">
                  {t("board.anonymous")}
                </span>
                <span className="sb-top-bar__subtitle">
                  {t("board.anonymousHint")}
                </span>
              </p>
            ) : null}
            <PhaseStepper
              phase={state.phase}
              phasePlan={phasePlan}
              isAdmin={isAdmin}
              actionSlot={actionSlot}
              timeLeft={
                timerActive ? (
                  <TimeLeft timer={state.timer} form="line" />
                ) : null
              }
            />
          </div>
        )}

        {status !== "online" ? (
          // sebaro's warning callout: the glyph and the sentence, never the
          // colour alone.
          <div
            role="status"
            data-testid="connection-status"
            className="sb-callout sb-callout--warning mx-gutter"
          >
            <Icon name="warning" size={20} />
            <p className="sb-callout__text">
              {status === "connecting"
                ? t("status.connecting")
                : t("status.offline")}
            </p>
          </div>
        ) : null}

        {inSettings ? (
          <main id={MAIN_ID} className="flex-1">
            <BoardSettings
              isAdmin={isAdmin}
              gifsEnabled={gifsEnabled}
              cursorsEnabled={config?.cursorsEnabled ?? false}
              voterNamesEnabled={config?.voterNamesEnabled ?? false}
              anonymous={anonymous}
              phase={state.phase}
              layout={layout}
              retentionAt={state.retentionAt}
              boardPath={boardPath}
            />
          </main>
        ) : (
          <>
            {!inLobby && state.phase !== "done" ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-6 py-2 empty:hidden">
                {/* The facilitator's session controls as one named group,
                „Moderation“ (owner, 2026-11-07; sebaro's named tool row, like
                the reader's „Leser“): the time box keys with the time's state
                beside them, and the focus switch. Navigation (← Lobby) stays
                with the steps; content and structure actions stay with the
                board. Focus mode only where it bites — presenting a person's
                cards, and walking the crowned ones in the discussion; not
                while presenting on an anonymous board, where nobody is on
                stage. */}
                {isAdmin ? (
                  <div
                    role="group"
                    aria-labelledby={moderationId}
                    data-testid="moderation"
                    className="flex flex-wrap items-center gap-x-3 gap-y-2"
                  >
                    <span
                      id={moderationId}
                      className="text-caption [font-weight:var(--sb-type-title-weight)] text-text-muted"
                    >
                      {t("timer.moderation")}
                    </span>
                    <TimerPanel timer={state.timer} isAdmin />
                    <TimeState timer={state.timer} />
                    {/* The phase's own session controls, after a hairline:
                        the draw while presenting, the vote's set-up, the
                        topic in discussion (owner, 2026-11-08). */}
                    {state.phase === "present" && !anonymous ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="self-stretch border-s border-border"
                        />
                        <PickerControls
                          picker={state.picker}
                          roster={state.roster}
                          pickerStyle={pickerStyle}
                          onOpenCards={() => setCardsOpen(true)}
                        />
                      </>
                    ) : null}
                    {state.phase === "vote" && config ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="self-stretch border-s border-border"
                        />
                        <VoteSettings config={config} />
                      </>
                    ) : null}
                    {(state.phase === "present" && !anonymous) ||
                    state.phase === "discuss" ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="self-stretch border-s border-border"
                        />
                        <FocusToggle focusMode={focusMode} isAdmin />
                      </>
                    ) : null}
                    {state.phase === "discuss" ? (
                      <DiscussBar
                        topTargetIds={state.votes.topTargetIds}
                        tallies={state.votes.tallies}
                        focusId={state.discussFocusId}
                        notes={state.notes}
                        isAdmin
                      />
                    ) : null}
                  </div>
                ) : ((state.phase === "present" && !anonymous) ||
                    state.phase === "discuss") &&
                  focusMode ? (
                  // Only when it says something: an empty block here kept
                  // the strip from hiding itself for members.
                  <div className="mx-auto">
                    <FocusToggle focusMode={focusMode} isAdmin={false} />
                  </div>
                ) : null}
                {state.phase === "vote" && config ? (
                  <VoteBar config={config} />
                ) : null}
                {state.phase === "discuss" && !isAdmin ? (
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

            {/* Where "Zum Inhalt" lands: past the header and the phase strip, on
            what the phase is about — the columns or the canvas with the rail
            beside them, or the lobby, check-in, close and results that take
            their place. The phase strip's controls (timer, votes left, ready)
            sit right before it. */}
            <main id={MAIN_ID} className="flex-1 px-6 py-6">
              {inLobby ? (
                <div
                  data-testid="lobby"
                  className="mx-auto max-w-(--sb-size-measure-prose)"
                >
                  {/* Who's in and how to get others in comes first — for the
                  facilitator, inviting is the first job; for everyone else the
                  first thing to know is that they are in and what happens next.
                  The agenda follows. Sections on the page's own ground, no
                  cards (sebaro). The list of who is here stands at the very
                  top (owner, 2026-11-07): under the agenda it sat below the
                  fold. Each part a sebaro section: room and a hairline
                  between them (owner, 2026-11-07). */}
                  <div className="sb-section" style={{ paddingBlockStart: 0 }}>
                    <Roster
                      participants={state.roster}
                      youId={you.id}
                      isAdmin={isAdmin}
                    />
                  </div>
                  <section className="sb-stack sb-section">
                    <p data-testid="lobby-hint">
                      {isAdmin
                        ? t("lobby.hint", { count: onlineCount })
                        : t("lobby.memberHint")}
                    </p>
                    {anonymous ? (
                      <p
                        data-testid="lobby-anonymous"
                        className="sb-field__help"
                      >
                        {t("board.anonymousHint")}
                      </p>
                    ) : null}
                    <ShareLink boardId={boardId} />
                    {/* Only in the browser that holds the token — a
                    co-facilitator promoted by role has none and must not be
                    handed one — and only while it still counts here: a
                    demoted holder is not running this retro. */}
                    {isAdmin && adminToken !== null ? (
                      <AdminLink boardId={boardId} adminToken={adminToken} />
                    ) : null}
                  </section>
                  {/* no empty section: CarriedActions draws nothing without
                      carried items */}
                  {state.actions.some((a) => a.carriedFrom !== null) ? (
                    <div className="sb-section">
                      <CarriedActions actions={state.actions} />
                    </div>
                  ) : null}
                  <div className="sb-section">
                    <PhasePlanPanel
                      phasePlan={phasePlan}
                      isAdmin={isAdmin}
                      locked={config?.phasePlanLocked ?? false}
                      icebreakerId={state.icebreakerId}
                      workingAgreements={state.workingAgreements}
                    />
                  </div>
                </div>
              ) : state.phase === "checkin" ? (
                <>
                  <RoundStatus
                    roster={state.roster}
                    readyIds={state.readyIds}
                    you={you}
                    isAdmin={isAdmin}
                    actionSlot={isAdmin ? null : actionSlot}
                  />
                  <CheckinPanel
                    icebreakerId={state.icebreakerId}
                    workingAgreements={state.workingAgreements}
                  />
                </>
              ) : state.phase === "close" ? (
                // Two things happen here: appreciation for colleagues and the
                // room's rating of the retro. One column, one start edge, two
                // sebaro sections with the hairline between them (owner,
                // 2026-11-10).
                <div className="mx-auto w-full max-w-4xl">
                  <div className="sb-section" style={{ paddingBlockStart: 0 }}>
                    <KudosWall
                      kudos={state.kudos}
                      roster={state.roster}
                      you={you}
                      isAdmin={isAdmin}
                      gifsEnabled={gifsEnabled}
                      readOnly={false}
                    />
                  </div>
                  <div className="sb-section">
                    <RotiPoll />
                  </div>
                </div>
              ) : state.phase === "done" ? (
                <RetroResults
                  boardId={boardId}
                  boardName={state.board?.name ?? board.name}
                  columns={state.columns}
                  notes={state.notes}
                  roster={state.roster}
                  you={you}
                  isAdmin={isAdmin}
                  votes={state.votes}
                  actions={state.actions}
                  kudos={state.kudos}
                  rotiReleased={state.roti.released}
                  retentionAt={state.retentionAt}
                  headcount={state.headcount}
                  anonymous={anonymous}
                  voterNamesEnabled={config?.voterNamesEnabled ?? false}
                  gifsEnabled={gifsEnabled}
                />
              ) : (
                <>
                  {/* The round's status above the board while everyone is
                    asked to finish (sketch B2a), instead of the side rail. */}
                  {presentRound ? (
                    <PresentStatus
                      roster={state.roster}
                      picker={shownPicker}
                      you={you}
                      isAdmin={isAdmin}
                      scopedRound={scopedRound}
                      actionSlot={isAdmin ? null : actionSlot}
                    />
                  ) : null}
                  {roundPhase ? (
                    <RoundStatus
                      roster={state.roster}
                      readyIds={state.readyIds}
                      you={you}
                      isAdmin={isAdmin}
                      actionSlot={isAdmin ? null : actionSlot}
                    />
                  ) : null}
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      {/* On a phone a canvas board shows its zones as the
                        board's swiping columns (owner, 2026-11-05): at the
                        zoom that fits a phone a card is some 35 px wide and
                        its keys cannot keep their size. The places stay
                        stored; a card written here is placed on the canvas. */}
                      {surface === "canvas" && !narrow ? (
                        <BoardCanvas
                          columns={state.columns}
                          notes={shownNotes}
                          columnCounts={state.columnCounts}
                          canvasOccupancy={state.canvasOccupancy}
                          roster={state.roster}
                          you={you}
                          phase={state.phase}
                          editing={state.editing}
                          isAdmin={isAdmin}
                          presenterId={presenterId}
                          unpresentedAuthorIds={unpresentedAuthorIds}
                          gifsEnabled={gifsEnabled}
                          cursors={state.cursors}
                          cursorsEnabled={cursorsShown}
                          canvasHeight={state.config?.canvasHeight ?? 1}
                        />
                      ) : surface === "between" ? (
                        <PresentInterlude
                          isAdmin={isAdmin}
                          first={(shownPicker?.presented.length ?? 0) === 0}
                        />
                      ) : surface === "focus" && presenter ? (
                        <PresenterFocus
                          notes={shownNotes}
                          columns={state.columns}
                          roster={state.roster}
                          you={you}
                          phase={state.phase}
                          isAdmin={isAdmin}
                          presenter={presenter}
                          spotlightId={state.spotlightId}
                          focusMode={focusMode}
                          picker={shownPicker}
                          pickerStyle={pickerStyle}
                        />
                      ) : (
                        <BoardColumns
                          columns={state.columns}
                          notes={shownNotes}
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
                    ) : roundPhase || presentRound ? null : (
                      <PresenceRail
                        phase={state.phase}
                        roster={state.roster}
                        you={you}
                        isAdmin={isAdmin}
                        anonymous={anonymous}
                      />
                    )}
                  </div>
                </>
              )}
            </main>
            {/* The bottom block (sebaro spec/03 §2): a child of the view
                itself, so its position: sticky holds to the viewport's
                bottom. The facilitator's phase change comes in through a
                portal from PhaseStepper. */}
            <ActionZone
              slotRef={setActionSlot}
              status={
                hasStatus || pointerCount > 0 ? (
                  <>
                    <PhaseGuide
                      phase={state.phase}
                      isAdmin={isAdmin}
                      anonymous={anonymous}
                      situation={guideSituation}
                    />{" "}
                    {isAdmin ? null : (
                      <TimeLeft timer={state.timer} form="sentence" />
                    )}
                    {pointerCount > 0 ? (
                      <>
                        {" "}
                        <span data-testid="pointer-count">
                          {t("canvas.pointers", { count: pointerCount })}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : null
              }
            />
          </>
        )}
        <LegalFooter openLegalLinksInNewTab />
      </div>
    </ConnectionProvider>
  );
}

function LookupFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <StateView
      view="board"
      testId="lookup-failed"
      title={t("lookupFailed.title")}
      text={t("lookupFailed.body")}
      action={
        <button type="button" onClick={onRetry} className="sb-primary-action">
          {t("lookupFailed.retry")}
        </button>
      }
      footer={<LegalFooter />}
    />
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <StateView
      view="board"
      title={t("notFound.title")}
      text={t("notFound.body")}
      action={
        <Link to="/new" className="sb-primary-action">
          {t("notFound.home")}
        </Link>
      }
      footer={<LegalFooter />}
    />
  );
}
