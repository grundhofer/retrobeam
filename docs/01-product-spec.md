# RetroBeam — Product Specification

Status: draft v1 · 2026-07-17 · based on competitive/platform research verified July 2026 (see `03-competitive-analysis.md`)

## 1. Vision

RetroBeam is a **guided, playful, genuinely free** retrospective tool for teams. One facilitator steps the whole room through a clear phase flow; participants write in private, present in a random order picked by a wheel of fortune, vote blind, and end on appreciation. Clean and minimal to look at, with moments of deliberate delight (the spin, the reveal, the confetti).

**Positioning — the empty quadrant.** Research across 11 competitors shows the market splits into _guided-but-utilitarian_ tools (Parabol, Retrium, Neatro — repeatedly criticized as joyless) and _playful-but-unguided_ ones (Metro Retro/Spreo — fun, but novices get lost without a phase flow). Nobody occupies **guided + playful**. On top of that, the market has retreated from free (Retrium/TeamRetro/Spreo are trial-only; EasyRetro is down to 1 board/month), and no mainstream tool offers German UI or EU data residency. RetroBeam takes all three: guided **and** playful **and** free, with board data stored in the EU and a German/English UI.

**Unique features no competitor has (verified July 2026):**

- A random presenter picker with **"everyone presents once" rotation tracking** — zero tools track who already presented; only Spreo has any picker at all (a generic spinner gadget).
- An **appreciation/kudos closing phase** — essentially absent everywhere (TeamRetro has kudos only as a comment type).
- Admin-configured **top-N voted highlight** for discussion — only TeamRetro has anything comparable.

## 2. Users & roles

| Role                    | How they get it                                                                                                                                                                     | Capabilities                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Facilitator (admin)** | Creates the board; the admin token is kept in that browser's `localStorage` (there is no admin link — see docs/02 §9). Can promote any participant to co-facilitator; can hand off. | Advance/rewind phases, start/pause/extend timer, configure voting, spin the picker, reveal notes/columns, manage participants, delete board. |
| **Participant**         | Opens the share link (or scans the QR code shown next to it), types a display name. No account, no e-mail.                                                                          | Write/edit/delete own notes, react, vote, mark "I'm done", present when picked.                                                              |

No user accounts in v1 (decided). Identity per board = self-chosen display name + server-assigned color + a session token in localStorage so a refresh keeps your notes yours. **Facilitator handoff is MVP** — the session must survive the admin's dropped connection (Retrium's lack of this dominated its negative reviews).

## 3. The session flow (phase state machine)

The facilitator steps through phases with **one big "next phase" button**. Every phase has a preset, editable timer. Optional **auto-advance** when everyone has pressed "I'm done" (freshest competitor pattern, Kollabe 2026). Server owns the phase state; illegal transitions are rejected.

Default flow (60-min defaults, phases marked _(opt)_ are skippable per board):

| #   | Phase                          | Default time | What happens                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Check-in** _(opt)_           | 5 min        | Random icebreaker question from the built-in bank (GIF answers encouraged). Prime Directive shown as dismissible splash.                                                                                                                                                                                                                          |
| 2   | **Review actions** _(opt, v2)_ | 5 min        | Open action items from the team's last retro are shown first — the single biggest driver of retro value per facilitation research.                                                                                                                                                                                                                |
| 3   | **Write**                      | 15 min       | Private writing. Each participant sees **only their own notes**. Others appear as ghost cards ("Anna is writing in _Went well_") — activity visible, content never. Ready-check: "I'm done" ✓ per participant.                                                                                                                                    |
| 4   | **Present & group**            | 15 min       | Notes revealed (all at once, or column by column). The **picker** (wheel/lotto) chooses who presents next, excluding everyone who already presented, until the pool is empty → small celebration. The picked person's notes get spotlighted on every screen (synced presenter focus). Duplicate cards are merged by drag-to-stack (with unmerge). |
| 5   | **Vote**                       | 3 min        | Blind dot-voting (see §6). Ready-check + admin progress meter.                                                                                                                                                                                                                                                                                    |
| 6   | **Discuss**                    | 15 min       | Voting closes → cards auto-sort by votes → the **top N** (admin-configured) are visually crowned and walked one at a time. Action items with an owner are captured.                                                                                                                                                                               |
| 7   | **Close**                      | 5 min        | **Appreciation wall** revealed (see §7) and read aloud. Optional anonymous ROTI poll (v2). Board archives; export offered.                                                                                                                                                                                                                        |

Timer behavior: visible to all, color warning near the end, a chime at zero (on by default, muted per person in one click), pause / +1 min extension. Timeouts are **soft** — a signal, never an input lock (TeamRetro pattern; locking is the top facilitation complaint elsewhere).

## 4. Boards & templates

- **6 launch templates** (curated beats EasyRetro's 200 — nobody praises the pile): Went Well / To Improve / Action Items · Start / Stop / Continue · Mad / Sad / Glad · 4Ls · Sailboat (the flagship playful one) · Starfish. Each template card in the picker carries a one-line _"when to use this"_ — directly serves "easy to understand".
- **Custom columns** always: rename, recolor, reorder, add, remove.
- Optional **appreciation section** can be attached to any template (see §7).
- Board options at creation (all changeable later): anonymity (hide authors — off by default per decision, one toggle away), GIFs on/off, votes per person, top-N count, retention.
- Second wave (v1.x/v2): KALM, DAKI, Hot Air Balloon, Rose/Bud/Thorn, Plus/Delta; Lean Coffee and Team Health Check as **distinct board types** (they need different mechanics), v2.

## 5. Notes, presence & privacy model

- **Sticky notes**: text (with emoji), optional GIF, author chip (unless anonymous board), emoji reactions (fixed row 👍 ❤️ 😂 🎉 👀 + "more" opens the full picker — Slack/GitHub pattern).
- **Private-until-reveal is server-side**: during the write phase the server never sends other people's note content down the wire — not hidden by CSS, _absent from the payload_, including in join/reconnect snapshots (the classic leak path). This is also a works-council selling point: anti-surveillance by design.
- **The reveal is presenter-scoped, not all-at-once**: the writing phase ending does not hand the board to the room. During the presenting round a participant holds their own cards plus, within visible columns, the cards of everyone the rotation has already put on stage — cumulative, so nothing that was shown is ever taken back, with the current speaker's cards highlighted rather than isolated. The facilitator holds the whole board throughout (they moderate the round and need to see what is still to come, and their screen carries a marker for the cards the room cannot read yet). When the rotation can stage nobody else — everyone presented, or the rest were excluded or left — all non-hidden content opens to the room, as it does in every phase after the round; facilitator-hidden columns remain hidden from members. Enforced by payload omission exactly like the write phase, including in snapshots and in the export.
  - **Exception: anonymous boards are never scoped.** Handing a member exactly the cards of the person the wheel just named _is_ attribution; over a round it would name the author of every note. Anonymity is the stronger promise, so presenter scoping is off on those boards.
- **Presence** ("see where colleagues are adding notes"): participant roster with status, plus **ghost cards** — skeleton shimmer cards in the column where someone is typing, carrying no content and no true length signal. Canvas boards additionally offer facilitator-controlled live cursors at 1 Hz. They send only after meaningful movement from a visible tab, are never persisted, and stop globally after 1.2M raw cursor frames per UTC day to preserve the Free tier for notes and voting.
- Grouping: drag a card onto another to stack; stacks show a count badge; unstack via the stack's menu; votes attach to the stack.

## 6. Voting

- Admin configures **votes per person** (default 3; heuristic hint in UI: ~√(number of cards)) and optionally **max votes per card**.
- **Blind by design** (no free competitor combines all three): vote counts hidden during voting · uniform dot rendering (no colors betraying who voted) · admin sees only an anonymous progress meter ("7/9 have used all votes"). Blindness covers the VOTE itself and is never negotiable. What the **result** carries is a per-board choice: the facilitator can attach voter names to the reveal so a crowned card is discussed with the people who picked it. That switch is off for every board created before it existed, impossible on an anonymous board, disclosed in the vote bar before anyone spends a dot, and one-way once voting closes — names can be withdrawn afterwards, never added.
- Voting closes → server computes tallies + **top N** → cards crowned, discussion queue walks them one at a time. Votes are rejected server-side when over budget or out of phase.

## 7. Appreciation wall ("thank you" section)

Optional final section, hidden until the Close phase (staged reveal — the surprise finale):

- Cards are **addressed to a named teammate or to the whole room ("Everyone")** — never to the sender themselves, with Management-3.0-style card types (Thank You · Great Job · Well Done · Congratulations · Totally Awesome) + free text + GIF/emoji.
- Optionally anonymous senders. Read aloud in Close. Included in the export.
- v2: per-person kudos history across a team's boards.

## 8. Pickers ("who presents next")

One shared abstraction, three skins (see architecture doc §6 for the sync protocol):

1. **Wheel of Fortune (MVP)** — equal segments per remaining participant, 4–6 s ease-out spin with per-segment tick, pointer-flapper overshoot, confetti + big winner card on stop, frozen ~2 s.
2. **Slot machine (v1.x)** — hand-rolled reels; better than a wheel for long name lists.
3. **Lotto ball machine (v2)** — matter-js cosmetic tumbling, scripted draw.

Rules: the rotation is also what paces the reveal — a person's cards reach the room when the rotation puts them on stage (§5). Winner is drawn **server-side with `crypto.getRandomValues()` before the animation starts** (decide first, animate second — the wheelofnames.com fairness model; a one-line "how picks work" note builds trust). Winner auto-moves from pool to a visible ordered **pick history** (doubles as meeting progress). Admin controls: re-spin, skip/defer, remove person, add latecomer, manual pick. No engineered near-misses — organic deceleration only. Everyone watches the _same_ animation land on the _same_ name.

**Accessibility**: `prefers-reduced-motion` → instant crossfade to the winner from the same server payload; `aria-live="polite"` announces "Ana presents next, 4 remaining"; the textual pick history is the accessible source of truth (canvas is invisible to screen readers); the picker itself is silent — the timer chime is the product's only sound.

## 9. GIFs & emoji

- **GIF search: KLIPY** (the post-Tenor default; Discord migrated to it, and it ships in Discourse core. Reports that WhatsApp moved to KLIPY conflict with reports putting it on GIPHY, and the Figma claim is uncorroborated — do not repeat either). Tenor's API was decommissioned June 30, 2026 (verified against Google's own announcement). GIPHY is alive but its free key is capped at the same 100 calls/hour, so it is a lateral move, not an upgrade. KLIPY charges nothing today and its production key lifts the cap, but "free lifetime" is marketing copy, not a term — there is no pricing page and no fees clause. All searches go **through our Worker proxy** (key secrecy, employee IPs/search terms never reach the US operator, `content_filter=g` enforced server-side, cached). Required KLIPY attribution shown in the picker. **Per-board GIF toggle** for privacy-strict teams. Provider isolated behind one module — GIFs are a degradable feature.
- **Emoji: native Unicode** (zero bytes, zero third-party requests). _Shipped: a fixed row of five reactions, hand-rolled — no picker dependency at all. `emoji-picker-element` (~12.5 kB, self-hosted data) remains the choice if free-choice emoji ever ship; the GDPR constraint (never the default CDN) applies to any such library._

## 10. Persistence, retention & export

- Boards persist under their stable URL, readable (archived, read-only) after Close.
- **Retention (decided)**: boards auto-delete after 90 days (per-board override: keep/extend/delete-now). The board's own alarm does the cleanup — see architecture doc.
- **Export**: open to any holder of the board link, not facilitator-only — the board id is already a full participant capability and the export carries nothing a participant cannot read on screen. That claim is enforced literally: the file is built under the reveal a viewer with no identity would get, so mid-round it carries only the cards the rotation has already reached, pre-reveal note bodies and staged columns are omitted, tallies stay blind until the reveal, and an anonymous board strips note authorship. Markdown (paste-ready for Confluence/Slack) + CSV + JSON + PDF from the board itself, plus a JPEG the browser renders from the same snapshot; includes columns, notes, groups, vote counts, top-N, action items, kudos; **author names excluded by default** (opt-in, and voter names ride that same opt-in). The PDF is written by hand against the standard Helvetica fonts and WinAnsi-encoded, so German umlauts survive but emoji cannot — it prints `#1` where the other formats print 👑1. Export-then-purge is the promoted workflow ("keep the best notes, let the personal data die").
- **Two export scopes**: _everything_ (the full board) and a _summary_ — the cards the board itself crowned (👑, the vote round's top-N) plus the action items, with the appreciation wall left out. A crowned _stack_ carries its merged duplicates into the summary: the crown sits on the anchor, but the board shows the whole pile and so does the file. Fetched mid-round, a summary is empty by design — the tallies are still blind, so nothing is crowned yet, and the file says so rather than looking broken. The summary is a pure projection of the same snapshot, so it can only ever drop rows, never surface something the full export hides; with author names off (the default) it contains no personal names at all, which is what makes it safe to paste into a team channel. Chosen in the board menu; both scopes available in every format.

## 11. i18n & language (decided)

German + English from day one. All strings externalized; language auto-detected, switchable in the header; icebreaker question bank maintained in both languages. Template names keep their established English names in both locales (retro jargon), with German descriptions.

## 12. UI/UX principles

1. **One primary action per screen per role.** The facilitator's is the big "next phase" button; the participant's is the phase's core verb (write / vote / present). Everything else recedes.
2. **A phase stepper is always visible** — everyone knows where in the retro they are and what comes next. This is the single biggest complaint-fixer vs. EasyRetro/GoRetro's settings-toggle chaos.
3. **Clean, minimal surface; playfulness in moments, not decoration.** Generous whitespace, calm neutral palette with one accent, sticky notes as the only colorful element. Delight is reserved for events: the reveal stagger, the wheel, confetti when the pool empties. No mascots, no clutter. (Skip list: whiteboard shapes, drawing tools, 30k icon libraries.)
4. **Zero-friction entry**: share link or QR code → type a name → you're in. Under 10 seconds.
5. **Motion respects `prefers-reduced-motion` everywhere**; the timer chime is ON by default and muted per person in one click from the timer panel. It used to be off by default for open offices and calls — but a timer nobody hears is a timer that failed, and the mute button beside the countdown serves that case without costing every other room the signal.
6. **Explain in place**: template "when to use" one-liners, vote-count heuristic hint, "how picks work" fairness note. No manual.
7. Responsive web; no native apps (no competitor has them either).

## 13. Feature cut lines

**MVP (v1.0):** board create/join via link + QR · 6 templates + custom columns · phase machine with timer (pause/+1 min/sound) · private write with ghost cards + roster presence · ready-check · reveal (all/per-column) · presenting via wheel + rotation tracking + synced presenter focus · drag grouping with unmerge · blind voting + top-N crowning · action items (per board) · appreciation wall · emoji reactions + picker · GIFs via KLIPY proxy + per-board toggle · facilitator handoff · Markdown/CSV/JSON/PDF export (plus a JPEG rendered in the browser) · DE+EN · 90-day auto-delete · reduced-motion + aria-live a11y.

**v1.x:** slot machine skin · icebreaker question bank (~100 questions DE/EN) + weather-report check-in · hidden/staged columns as a general feature · working-agreements pinned card · board duplication.

**v2:** team spaces (named team → action-item carry-over into next retro, kudos history, board list) · ROTI closing poll with trend · Lean Coffee + Team Health Check board types · lotto machine · multi-round voting · parking lot · safety check (anonymous 1–5).

**Later:** AI grouping suggestions (suggest-only, never auto-apply) + AI summary · Jira/Slack push · async mode · E2E encryption option · template import/export.

**Never (deliberate skips, see analysis doc):** planning poker/standup suite · infinite freeform canvas · 200-template pile · autonomous auto-grouping · enterprise SSO/SCIM/SOC2 · built-in video chat · cross-board analytics dashboards · native mobile apps.

## 14. Naming & domain

**`retrobeam.de` is registered** (2026-09-09) and is the product's home.

The project was called _Retropolis_ until then. It was renamed because `retropolis.de` was taken and the fallbacks (`getretropolis.de` and friends) were all compromises. The replacement was chosen against four criteria — free as a `.de`, effortless to pronounce for a German speaker, an English word tied to what the product does, and **no existing name collision**. That last one killed most candidates: `RetroSpark` is already a real-time agile retrospective tool, `RetroLeap` is a LeapFrog emulation firmware on GitHub, `RetroLift` is a Photoshop product, `Everyturn` is a UK mental-health charity, and `Echo`/`Prisma` are taken inside this very category (Echometer) and in the JS ecosystem. `RetroBeam` returned no hits at all.

One caveat worth remembering: "Retro-" is the most crowded prefix in this market — Retrium, EasyRetro, GoRetro, TeamRetro, RetroTool, TeleRetro, Reetro, MetroRetro, Retrotime, Retrospected and retroflow all exist. The second half of the name has to carry the differentiation, which is why a bland one was rejected.
