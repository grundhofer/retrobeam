// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Phase } from "@retrobeam/shared";

const GUIDED = [
  "checkin",
  "write",
  "present",
  "group",
  "vote",
  "discuss",
  "close",
];

/** Where you stand right now, for a line that fits it (owner, 2026-11-20:
 *  „Wenn du gezogen wirst …“ told the person presenting, and „Verteil deine
 *  Stimmen …“ a person with none left). */
export interface GuideSituation {
  /** „Ich bin fertig“ is on, pressed or set by a full hand of votes */
  ready: boolean;
  /** your place in the presenting round as the board shows it — a draw
   *  that is still turning has drawn nobody yet */
  turn: "now" | "had" | "waiting" | "over";
  /** votes you can still give; null outside the vote */
  votesLeft: number | null;
}

interface GuideProps {
  phase: Phase;
  isAdmin: boolean;
  anonymous: boolean;
  /** Required, nullable: null gives the phase's own line (the announcer,
   *  which speaks on a phase change, not on every vote). */
  situation: GuideSituation | null;
}

/** The i18n key of the line for this phase, role and situation; null in the
 *  lobby and on the finished board, which speak for themselves. */
export function phaseGuideKey({
  phase,
  isAdmin,
  anonymous,
  situation,
}: GuideProps): string | null {
  if (!GUIDED.includes(phase)) return null;
  // Nobody is called up to present on an anonymous board — promising a pick
  // there would be wrong, so that phase has its own line for both roles.
  if (phase === "present" && anonymous) return "guide.present.anonymous";
  if (situation !== null) {
    if (phase === "present") {
      // The facilitator can be in the rotation too.
      if (situation.turn === "now") return "guide.present.you";
      if (situation.turn === "over") return "guide.present.over";
      if (situation.turn === "had" && !isAdmin) return "guide.present.had";
    }
    if (!isAdmin && phase === "write" && situation.ready) {
      return "guide.write.memberReady";
    }
    if (!isAdmin && phase === "vote" && situation.votesLeft === 0) {
      return "guide.vote.memberDone";
    }
  }
  if (phase === "write" && anonymous && !isAdmin) {
    return "guide.write.memberAnonymous";
  }
  return `guide.${phase}.${isAdmin ? "facilitator" : "member"}`;
}

// One sentence saying what to do right now, and whose move it is; since stage
// 5c the first part of the action zone's state sentence (ActionZone), the
// time box's words after it. On a phone the stepper is compressed to "Step 3 of 7" and a phase change
// used to go unnoticed; the phase names alone never said that a member writes
// privately, or that moving on is the facilitator's call.
export function PhaseGuide(props: GuideProps) {
  const { t } = useTranslation();
  const key = phaseGuideKey(props);
  if (key === null) return null;
  return <span data-testid="phase-guide">{t(key)}</span>;
}

// The same line for screen readers, as a live region that is mounted from the
// lobby on and only changes its text. A region inserted together with its
// content is not reliably announced — and the visible line above only mounts
// when the retro leaves the lobby, so the first phase change would go unheard.
export function PhaseAnnouncer(props: Omit<GuideProps, "situation">) {
  const { t } = useTranslation();
  // The phase's own line: the action zone's status region already speaks
  // the situation as it changes.
  const key = phaseGuideKey({ ...props, situation: null });
  return (
    <p role="status" data-testid="phase-announcer" className="sr-only">
      {key === null ? "" : t(key)}
    </p>
  );
}
