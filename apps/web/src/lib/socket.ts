// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { WebSocket as ReconnectingWebSocket } from "partysocket";
import {
  parseServerEvent,
  type ClientCommand,
  type ServerEvent,
} from "@retrobeam/shared";

export type ConnectionStatus = "connecting" | "online" | "offline";

export interface BoardSocketOptions {
  boardId: string;
  /** Called on every (re)connect — the join carries the stored session key,
   *  so a reconnect reclaims identity and the fresh `sync` resyncs state. */
  join: () => Extract<ClientCommand, { type: "join" }>;
  onEvent: (event: ServerEvent) => void;
  onStatus: (status: ConnectionStatus) => void;
}

const HEARTBEAT_INTERVAL_MS = 30_000; // Cloudflare idle timeout is ~100s; the DO answers without waking
// The runtime answers "ping" with "pong" without waking the Durable Object, so
// silence for two intervals means the socket is dead rather than idle. TCP can
// hold a half-open connection open for minutes; until it notices, every send
// goes into a socket nobody is reading.
const PONG_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2;
// A queue that grows without bound is a memory leak and, on reconnect, a burst
// of stale frames. Kept comfortably BELOW the server's per-socket
// budget (120 with an 8/s refill): a flush larger than that bucket would be
// partly refused, which would lose exactly the offline work the queue exists to
// protect. Well past any real burst — a legacy canvas batch is one frame.
const MAX_QUEUED = 50;

/** Commands the server can safely be told twice. Everything the client replays
 *  after a reconnect must be idempotent, because it cannot know whether the
 *  original was applied before the socket died — only that no ack came back.
 *  Entity mutations carry a client-minted id and are absolute, so a duplicate
 *  is a no-op the server acks. */
function isResendable(
  command: ClientCommand,
): command is ClientCommand & { opId: string } {
  return "opId" in command;
}

export class BoardSocket {
  private readonly ws: ReconnectingWebSocket;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly onVisibility: () => void;
  // Commands must never travel before this connection's `join` frame — the
  // server drops un-joined traffic. partysocket's own queue flushes BEFORE
  // the open event (i.e. before our join), so library buffering is disabled
  // and BoardSocket queues offline commands itself, flushing them right
  // after join. Client-minted idempotent ids make the replay safe.
  private joinedThisConnection = false;
  private pending: ClientCommand[] = [];
  // Sent, but not yet acked or rejected. The queue above only covers commands
  // written while offline; a frame handed to a socket that then dies was
  // simply lost, and the next snapshot erased it from the screen — silently
  // destroying whatever the user had just typed. These are replayed on the
  // next connection, before the offline queue drains, so ordering holds.
  private inFlight = new Map<string, ClientCommand>();
  private lastPongAt = Date.now();
  private pingOutstanding = false;

  constructor(options: BoardSocketOptions) {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${location.host}/api/boards/${options.boardId}/ws`;
    options.onStatus("connecting");

    this.ws = new ReconnectingWebSocket(url, [], { maxEnqueuedMessages: 0 });
    this.ws.addEventListener("open", () => {
      options.onStatus("online");
      this.lastPongAt = Date.now();
      this.pingOutstanding = false;
      this.ws.send(JSON.stringify(options.join()));
      this.joinedThisConnection = true;
      // Replay first: these were sent earlier than anything still queued.
      for (const command of this.inFlight.values()) {
        this.ws.send(JSON.stringify(command));
      }
      for (const command of this.pending.splice(0)) {
        this.ws.send(JSON.stringify(command));
      }
    });
    this.ws.addEventListener("message", (event) => {
      const data = event.data as unknown;
      if (data === "pong") {
        this.lastPongAt = Date.now();
        this.pingOutstanding = false;
        return;
      }
      const parsed = parseServerEvent(data);
      if (!parsed) return;
      // The server has spoken about this operation either way, so it is no
      // longer in flight. A reject is still resolved — the caller reacts to it.
      if (parsed.type === "ack" || parsed.type === "reject") {
        if (parsed.opId !== undefined) this.inFlight.delete(parsed.opId);
      }
      options.onEvent(parsed);
    });
    this.ws.addEventListener("close", () => {
      this.joinedThisConnection = false;
      this.pingOutstanding = false;
      options.onStatus("offline");
    });

    this.heartbeat = setInterval(() => {
      if (this.ws.readyState !== this.ws.OPEN) return;
      // A ping that was never answered means this socket is half-open: it looks
      // writable and nothing arrives. Force a reconnect rather than keep
      // feeding it, which is what leaves a room silently frozen.
      if (
        this.pingOutstanding &&
        Date.now() - this.lastPongAt > PONG_TIMEOUT_MS
      ) {
        this.ws.reconnect();
        return;
      }
      this.pingOutstanding = true;
      this.ws.send("ping");
    }, HEARTBEAT_INTERVAL_MS);

    // Coming back to a backgrounded tab is exactly when a socket turns out to
    // have died while nobody was looking; probe immediately instead of waiting
    // out the interval.
    this.onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (this.ws.readyState === this.ws.OPEN) {
        this.pingOutstanding = true;
        this.ws.send("ping");
      } else {
        this.ws.reconnect();
      }
    };
    document.addEventListener("visibilitychange", this.onVisibility);

    // Dev-only e2e hook: lets tests force a disconnect deterministically
    // (browser offline emulation does not close established WebSockets).
    if (import.meta.env.DEV) {
      (
        window as unknown as { __retrobeamWs?: ReconnectingWebSocket }
      ).__retrobeamWs = this.ws;
    }
  }

  send(command: ClientCommand): void {
    if (this.joinedThisConnection && this.ws.readyState === this.ws.OPEN) {
      if (isResendable(command)) this.inFlight.set(command.opId, command);
      this.ws.send(JSON.stringify(command));
      return;
    }
    // Presence is a snapshot of *now*; replaying it after a gap would announce
    // a ghost writing in a column the user left minutes ago.
    if (
      command.type === "presence.editing" ||
      command.type === "presence.cursor"
    ) {
      return;
    }
    if (this.pending.length >= MAX_QUEUED) this.pending.shift();
    this.pending.push(command);
  }

  close(): void {
    clearInterval(this.heartbeat);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ws.close();
  }
}
