# Retropolis — Architecture & Tech Stack

Status: **as-built for v1.2** (reconciled 2026-09-05 after a full review) · originally
drafted 2026-07-17, when every version/limit claim below was verified against primary
sources.

> Read this as a description of what exists, not a plan. Where the two diverged the code
> won and this file was corrected — the drift had reached the point where the document
> CONTRIBUTING points newcomers at first was a source of false confidence. Anything still
> aspirational is labelled inline, in bold, where it appears.

Stack chosen by a three-proposal judge panel (angles: boring/proven · DX-first ·
performance-first); winner was **boring/proven**, with the best runner-up ideas grafted on.

## 1. Platform decision: Cloudflare Workers + Durable Objects

A sanity check across Vercel, Netlify, Fly.io, Railway, Render, Supabase, Deno Deploy and PartyKit confirmed: **nothing on a free tier beats Cloudflare Workers + Durable Objects** for a realtime room app. Netlify can't do WebSockets; Vercel can't hold them open durably; Fly/Railway aren't free anymore; Render's free Postgres self-destructs after 30 days; Supabase free projects pause after a week idle and lack an authoritative per-room server. PartyKit is Cloudflare-owned and just sugar over Durable Objects (we use its client library, see §4).

**Free-tier budget we design against (verified July 2026):**

| Resource        | Free limit                                                                                            | Our exposure                                           |
| --------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Worker requests | 100k/day (static assets **free & unlimited**)                                                         | Trivial — SPA loads are static                         |
| DO requests     | 100k/day; incoming WS messages get a **20:1 discount** (twenty messages = one request), outgoing free | Comfortable — see §8 for the measured per-retro figure |
| DO duration     | 13,000 GB-s/day; hibernated sockets bill **zero**                                                     | Safe iff hibernation is never broken                   |
| DO SQLite       | 5M rows read/day · 100k written/day · 5 GB total · 1 GB/object                                        | **Rows written is the real ceiling** — measured below  |
| Limit behavior  | Hard fail until midnight UTC (≈ 1–2 a.m. German time)                                                 | Graceful degradation required (§8)                     |

Escape hatch if the company outgrows this: Workers Paid, $5/month.

## 2. System overview

```
Browser (React SPA)
   │  static assets (free, unlimited)
   ▼
Cloudflare Worker (Hono 4)
   ├─ POST /api/boards                    → create board, mint admin token (rate limited per IP)
   ├─ POST /api/boards/:id/duplicate      → structure-only copy, gated on the source admin token
   ├─ GET  /api/boards/:id                → board name/created-at, for the join screen
   ├─ GET  /api/boards/:id/export         → Markdown/CSV/JSON from the board DO
   ├─ GET  /api/boards/:id/gifs/search    → KLIPY proxy (key server-side, rating forced,
   │                                        refused unless THIS board has GIFs on)
   └─ GET  /api/boards/:id/ws             → WebSocket upgrade, routed to ↓
BoardRoom Durable Object  (one per board · SQLite-backed · jurisdiction "eu")
   ├─ WebSocket Hibernation API (ctx.acceptWebSocket), binding BOARD_ROOM
   ├─ SQLite: board_meta · participants · columns · notes · reactions · votes ·
   │          actions · kudos · roti   (groups are a group_id on notes, not a table;
   │          there is no phase_log — board_meta holds the current phase)
   └─ Alarms: ONE slot, shared by timer expiry and the 90-day retention delete
```

Decisions that follow from research, each load-bearing:

- **One board = one SQLite-backed DO**, always created via `env.BOARDS.jurisdiction('eu').idFromName(boardId)` — _everywhere_, since the same name in different jurisdictions yields different objects. EU jurisdiction pins execution+storage to EU data centers, works on the free plan.
- **WebSocket Hibernation API is mandatory** (`ctx.acceptWebSocket()` + `webSocketMessage()` handlers, never `ws.accept()`): hibernation-eligible idle DOs bill zero duration. Per-socket identity/role rides in `serializeAttachment` (≤16 KB). Heartbeats via `setWebSocketAutoResponse("ping"→"pong")` — answered without waking the DO, free.
- **The #1 footgun: never `setInterval` in the DO.** One pinned DO burns ~10,800 GB-s/day ≈ 83% of the entire free duration budget. Timers are: persist absolute `endsAt` + one **DO Alarm**; clients render the countdown locally from `{endsAt, serverNow}` (clock-offset corrected). Pause/extend = broadcast a new deadline.
- **No D1, no KV in v1.** The board's own SQLite is the single source of truth for live _and_ archived state; there is no cross-board query (boards are share-link-only). KV's 1k writes/day makes it useless for anything session-shaped. Retention needs no cron: each board sets its own deletion alarm. The wipe is a `DELETE FROM` over every table (content first, `board_meta` last) rather than `deleteAll()`, because `deleteAll` drops the tables and a query on the still-live instance then fails with "no such table"; the object keeps an empty schema and reports the board as gone. v2 team spaces will add a `TeamRoom` DO (same pattern), not D1.
- Static SPA served via Workers Static Assets with `not_found_handling: "single-page-application"`. (Cloudflare Pages is in maintenance mode — new projects go Workers.)
- **Deploys disconnect every WebSocket** (documented platform behavior) → the client must silently reconnect + resync (§5).

## 3. Repository layout

```
retropolis/
├─ apps/
│  ├─ web/        React SPA (Vite)
│  └─ worker/     Hono worker + BoardRoom DO (wrangler)
├─ packages/
│  └─ shared/     protocol schemas + ALL domain logic (pure, I/O-free)
├─ docs/
└─ .github/workflows/
```

pnpm workspaces; **no Turborepo** in v1 (three packages need no build graph). TypeScript 5.x strict with project references. ESLint 9 flat config + typescript-eslint + Prettier 3 + prettier-plugin-tailwindcss (not Biome: plugin gaps are real). wrangler ≥ 4.21.

**"Hexagonal-lite" layering — the core architectural rule:** all domain logic lives in `packages/shared` as pure functions — the phase state machine (with a legal-transition table), vote tallying + top-N selection, the seeded no-repeat picker, the per-recipient visibility filter, and the `applyServerEvent` reducer. The BoardRoom DO is a thin adapter: _parse → `domain.decide(state, command, role)` → persist → broadcast filtered events_. The React app is a thin renderer over the same reducer. This keeps the bulk of tests framework-free and fast, and makes the DO swappable if Cloudflare ever stops being the answer.

## 4. Frontend stack (judge verdict, grafts noted)

| Concern          | Choice                                                                                                                                                             | Why                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework        | **React 19.2**                                                                                                                                                     | Hiring pool, ecosystem, 5-year maintainability — the winning angle                                                                                                                   |
| Build            | **Vite 7** + `@cloudflare/vite-plugin` 1.44.x                                                                                                                      | One `vite dev` runs SPA + Worker + DO in real workerd with HMR. **Not Vite 8**: verified open plugin issues (production build failures, nodejs_compat breakage); revisit in 6 months |
| Routing          | react-router 7 **library mode** (`createBrowserRouter`)                                                                                                            | 3 routes; record in an ADR (docs increasingly assume framework mode)                                                                                                                 |
| State            | **zustand 5** — `useBoardStore` (server-authoritative snapshot) + `useSessionStore` (identity/connection/drafts)                                                   | Boring, tiny, testable                                                                                                                                                               |
| Presence/cursors | Transient zustand slice; any future pixel cursors bypass React: one ref-backed DOM node per user, `transform: translate3d` + rAF lerp                              | 60 fps without render churn (performance-proposal graft)                                                                                                                             |
| Socket           | **partysocket 1.1.x** (Cloudflare-maintained) wrapped in a `BoardSocket` class                                                                                     | Reconnect + buffering built in; PartyServer server-side abstraction considered and rejected — we need direct Hibernation API control                                                 |
| Styling          | **Tailwind CSS 4.3** + shadcn/ui on Base UI primitives                                                                                                             | shadcn defaults to Base UI since July 2026 (verified)                                                                                                                                |
| Animation        | **motion 12** (`motion/react`) for reveal stagger/phase transitions; CSS for the mundane; wheel + confetti (`canvas-confetti` 1.9.x) lazy-loaded `import()` chunks | Playfulness without paying for it on first load                                                                                                                                      |
| Emoji            | **Shipped: a hand-rolled fixed row** of five reaction emoji, rendered as native Unicode. `emoji-picker-element` was planned and is not used                        | Five reactions need no 12.5 kB dependency and no self-hosted data set. Revisit only if a free-choice picker ships; the GDPR argument (no CDN call) holds either way                  |
| i18n             | react-i18next, DE + EN resource bundles                                                                                                                            | Boring standard; chosen after the panel (i18n was decided later)                                                                                                                     |
| Wheel            | Hand-rolled SVG/canvas (~250 lines, cubic ease-out, animate-to-server-chosen-angle)                                                                                | Full control of the visual language; `spin-wheel@5.0.2` (zero-dep, MIT) is the fallback. **Avoid** react-custom-roulette & winwheel.js (both unmaintained, verified)                 |
| Sounds           | Raw Web Audio API, 3 short samples                                                                                                                                 | howler.js is maintenance-inactive; ~30 lines suffice                                                                                                                                 |

## 5. Realtime protocol (server-authoritative, no CRDT)

Figma-model rationale: notes are small single-author objects — there is _no_ concurrent same-text editing in a retro; phases, vote budgets and privacy are **business rules a CRDT cannot enforce**; Yjs whole-doc sync is structurally at odds with per-recipient redaction. The DO's serialized execution makes it a natural sequencer: per-property last-writer-wins with a monotonic `seq` is trivially well-defined. (`y-durableobjects` exists as an escape hatch if collaborative rich text is ever needed.)

Mechanics:

- **Optimistic updates**: client applies locally, tags with `opId` (UUID), sends; server validates (phase, role, budget), assigns `seq`, persists, broadcasts; client reconciles on `ack {opId, seq}` or rolls back on `reject {opId, code}` (`PHASE_LOCKED`, `NOT_ADMIN`, `VOTE_BUDGET`, `NOT_AUTHOR`, …). Idempotent `opId` allows safe resend after reconnect.
- **Both ends share one pure reducer** (`applyServerEvent` in `packages/shared`): the client uses it for optimistic echo, the DO as authority — reconciliation symmetric by construction.
- **Reconnect = full snapshot, no replay buffer**: board state is tiny; every (re)join gets a complete **per-recipient-filtered** snapshot, then the client re-applies and resends its unacked ops. `seq` is a board-global ordering stamp and deliberately **not** a gap detector — the privacy filter drops events per recipient by design, so holes in one participant's stream are correct rather than evidence of loss (a few private frames carry no `seq` at all). Recovery is blanket instead: a reject, a refused frame, or a reconnect asks for a fresh snapshot. Backoff with jitter; heartbeat with pong verification, and an immediate ping on `visibilitychange`.
- **Privacy is enforced at the filter**: during the write phase, note events and snapshots to non-authors simply _omit_ other people's notes (ghosts come from presence events carrying `{userId, columnId, active}` — no content, no true length). The join/reconnect snapshot goes through the same filter — that snapshot is the classic leak path. If the board is anonymous, `authorId` is stripped from all broadcast payloads permanently. Blind voting: mid-phase, clients know only their own remaining votes; tallies + top-N are computed server-side and land as one `votes.revealed` event.

Message families (full table lives in `packages/shared` as zod v4 discriminated unions; both ends parse every frame):

- C→S: `join` · `cursor`/`presence.editing` (fire-and-forget, never persisted) · `note.create/update/delete/react` · `vote.cast` · `ready.set` · `admin.phase.set` · `admin.timer.start/stop/extend` · `admin.reveal` · `admin.vote.config` · `admin.picker.spin` · `admin.participant.promote/remove` · `leave`
- S→C: `sync` (filtered snapshot + `serverNow`) · `ack`/`reject` · `presence.*` · `note.ghost` · `note.created/updated/deleted` (per-recipient) · `notes.revealed` · `phase.changed` · `timer.*` · `picker.result` · `vote.progress` (per-recipient) · `votes.revealed` · `board.closed`/`error`

## 6. Picker synchronization

Server decides, clients replay: on `admin.picker.spin` the DO draws uniformly from the not-yet-presented pool with `crypto.getRandomValues()`, then broadcasts `picker.result {selectedUserId, remaining, seed, startAt, durationMs}`. Every client derives _all_ animation randomness (extra rotations, in-segment jitter, reel stagger) from `seed` via mulberry32 — identical spin, identical landing, on every screen. Never sync physics engines across clients (float/framerate divergence); the v2 lotto machine runs _local cosmetic_ tumbling and scripts only the reveal. Last pick event is kept in state for late joiners. ±200 ms start skew is imperceptible over a 5 s spin.

## 7. Data model (BoardRoom SQLite)

```
board_meta    id, name, template, phase, timer_deadline, votes_per_person,
              max_per_note, top_n, anonymous, gifs_enabled, locale_default,
              retention_deadline, created_at
participants  id, name, color, role, ready, presented_at, last_seen
notes         id, column_id, group_id?, author_id, text, gif_url?, order, created_seq
groups        id, column_id, label?, order
reactions     note_id, participant_id, emoji
votes         note_or_group_id, participant_id, count
actions       id, text, owner_participant_id, status
kudos         id, to_participant_id, from_participant_id?, card_type, text, gif_url?
phase_log     seq, phase, at, by
```

Multiple storage ops without `await` batch into one implicit transaction (DO input/output gates). Budget note: `setAlarm()` = 1 row written; deletes count as writes; a whole session writes a few hundred rows against 100k/day.

## 8. Free-tier survival rules (all verified, all load-bearing)

0. **What one retro actually costs (measured, not estimated).** `apps/worker/test/cost.test.ts` plays a full session — eight people, forty notes, every phase — against a real Durable Object and counts the rows it touches:

   | Metric             | One retro | Free-tier ceiling | Retros/day |
   | ------------------ | --------- | ----------------- | ---------- |
   | Billed DO requests | ~18       | 100k/day          | ~5,500     |
   | Rows written       | 553       | 100k/day          | **~180**   |
   | Rows read          | 10,902    | 5M/day            | ~460       |

   **Rows written is the binding constraint, not requests** — the opposite of what §1 assumed, because the 20:1 ratio on incoming WebSocket messages is a discount rather than a multiplier. Reads are the number that grows with board size (a join reads the whole board), so a very large board moves that column faster than the others. The test holds all three under a ceiling so a change that adds a write per keystroke is caught.

1. **Presence is still the thing to watch.** At a naive 10 Hz cursor rate one session is ~27k billed requests, which would exhaust a day in four sessions. v1 ships column-level ghost presence only (start/stop + ≤1 Hz keepalive ≈ noise) and cursors are hard-disabled behind `CURSORS_ACTIVATABLE`. If pixel cursors ship: 3–4 Hz max, send only while moving, pause on hidden tabs and non-interactive phases.
2. **Coalesce** cursor + editing + ready presence into one message type per tick — billing counts messages, not bytes, and the 20:1 discount applies per message however small.
3. **Never persist presence** — RAM + broadcast only; the rows-written budget belongs to notes/votes/phases.
4. **Never break hibernation** — no `setInterval`, no dangling outbound fetches (an outbound connection pins the DO up to 15 min).
5. **Degrade gracefully at the cliff**: on DO limit errors, drop presence first, keep notes/voting working; banner explains; resets midnight UTC.
6. **Count what we spend**: partly done. There is no runtime counter or stats page, but `cost.test.ts` measures a full retro on every CI run and fails if the cost per session grows past its ceiling — which catches the regression that would matter (a change making each event cost more) without shipping instrumentation.
7. GIF **search** goes through the Worker proxy; GIF **media** loads from KLIPY's CDN in v1 (proxying every thumbnail would eat Worker subrequest limits) — disclosed in the privacy note, R2 thumbnail cache is a v2 hardening option. _(This resolves a genuine tension between the platform research — "don't proxy media" — and the privacy research — "proxy everything": search terms + key are the sensitive part and cheap to proxy; media is bulky and merely reveals viewer IPs, which the per-board GIF toggle + disclosure covers.)_

## 9. Security model

- **Capability URLs**: `boardId` (unguessable, 128-bit) = participant capability; admin token (separate secret, minted at creation) = facilitator capability. **Shipped behaviour: the admin token lives in the creator's `localStorage` only — there is no admin link.** Facilitator rights are therefore bound to one browser profile: clearing storage or switching device loses them, and the only recovery is `admin.role.set` from another facilitator. Promotion grants the ROLE, never the token, so a promoted co-facilitator cannot duplicate the board. Server checks role per message type. Acceptable for internal retros; stated plainly in the spec (not "auth-less by accident").
- All server-side: phase gates, vote budgets, authorship checks, write-phase redaction, picker draws. The client is untrusted rendering.
- No IP logging in the app; no analytics SDKs; KLIPY key is a Worker secret; `rating=g|pg` forced server-side.

## 10. Testing strategy (a stated requirement — four layers)

| Layer                        | Tooling                                                                                                                                                                            | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Domain (bulk of coverage) | Vitest 4.1+, plain node pool, `packages/shared`                                                                                                                                    | Phase machine legality, vote tally + top-N, picker fairness/no-repeat (seeded), visibility filter (the privacy property!), reducer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2. Worker/DO integration     | `@cloudflare/vitest-pool-workers` in real workerd: real WebSockets end to end, plus `runInDurableObject` where a test needs to reach into storage                                  | Storage, alarms, the whole command surface, the privacy filter, the authorization matrix (derived from the command schema), and stream/snapshot convergence. **As built**: storage is isolated per FILE, not per test, so the WS flow tests simply live in their own file — the separate `--no-isolate` project the plan called for was never needed. Hibernation survival IS covered: `evictAllDurableObjects()` tears the instance down while keeping storage and hibernating the sockets, and the test then drives the SAME socket and asserts identity, role, phase and notes all came back. Verified to fail when a single value is moved into an instance field. Pool-workers is beta: **pin vitest+pool-workers+wrangler as a set** |
| 3. Component                 | Vitest Browser Mode (stable in Vitest 4) + vitest-browser-react on Playwright provider (real Chromium — motion/drag/canvas need no jsdom shims); socket faked behind `BoardSocket` | Reveal rendering, vote-limit UI, timer display, reduced-motion paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 4. E2E                       | Playwright 1.61.x, `webServer = pnpm build && wrangler dev` (true workerd + DO)                                                                                                    | **Multi-context tests are the essence**: A writes, B must NOT see it; admin reveals, B must; vote caps enforced; picker excludes past presenters until everyone went; reconnect resyncs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

CI (GitHub Actions), as built: install (frozen lockfile) → `pnpm audit --prod` → lint (zero warnings) → format → `tsc --noEmit` across all four projects → **production build** → domain → worker → component (real Chromium) → Playwright (chromium-only, serial, trace-on-retry). **Not shipped**: coverage reporting and the coverage ratchet; the browser matrix is Chromium only, with no WebKit, Firefox or touch viewport. **PR previews**: `wrangler versions upload --preview-alias pr-<n>` against a separate `env.preview` (own DO namespace — previews can never touch production boards); `wrangler deploy` on main.

## 11. Top risks & mitigations

1. **vitest-pool-workers is open beta** → versions pinned as a set; most coverage lives in pure domain tests anyway.
2. **Free-tier caps are hard cliffs** (reset 1–2 a.m. German time) → survival rules §8, telemetry, $5/mo escape hatch.
3. **KLIPY is young** (US operator; terms could change) → isolated behind one provider-agnostic module; GIFs degradable per board; fallbacks: curated R2 GIF set, GIPHY beta key as stopgap. Verify KLIPY's ad-insertion terms for our tier before build.
4. **DO lock-in** → all domain logic is pure in `packages/shared`; a migration rewrites only the BoardRoom adapter.
5. **Deploys drop all WebSockets** → auto-reconnect + snapshot resync is a day-one requirement, not polish.
6. **Capability-URL access model** → documented; links are secrets; retention limits blast radius; revisit if the tool leaves the intranet audience.
