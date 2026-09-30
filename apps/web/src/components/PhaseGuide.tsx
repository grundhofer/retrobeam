// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Phase } from "@retrobeam/shared";

const GUIDED = ["checkin", "write", "present", "vote", "discuss", "close"];

interface GuideProps {
  phase: Phase;
  isAdmin: boolean;
  anonymous: boolean;
}

/** The i18n key of the line for this phase and role; null in the lobby and on
 *  the finished board, which speak for themselves. */
export function phaseGuideKey({
  phase,
  isAdmin,
  anonymous,
}: GuideProps): string | null {
  if (!GUIDED.includes(phase)) return null;
  // Nobody is called up to present on an anonymous board — promising a pick
  // there would be wrong, so that phase has its own line for both roles.
  if (phase === "present" && anonymous) return "guide.present.anonymous";
  if (phase === "write" && anonymous && !isAdmin) {
    return "guide.write.memberAnonymous";
  }
  return `guide.${phase}.${isAdmin ? "facilitator" : "member"}`;
}

// One line under the phase row saying what to do right now, and whose move it
// is. On a phone the stepper is compressed to "Step 3 of 7" and a phase change
// used to go unnoticed; the phase names alone never said that a member writes
// privately, or that moving on is the facilitator's call.
export function PhaseGuide(props: GuideProps) {
  const { t } = useTranslation();
  const key = phaseGuideKey(props);
  if (key === null) return null;
  return (
    <p data-testid="phase-guide" className="w-full text-sm text-zinc-600">
      {t(key)}
    </p>
  );
}

// The same line for screen readers, as a live region that is mounted from the
// lobby on and only changes its text. A region inserted together with its
// content is not reliably announced — and the visible line above only mounts
// when the retro leaves the lobby, so the first phase change would go unheard.
export function PhaseAnnouncer(props: GuideProps) {
  const { t } = useTranslation();
  const key = phaseGuideKey(props);
  return (
    <p role="status" data-testid="phase-announcer" className="sr-only">
      {key === null ? "" : t(key)}
    </p>
  );
}
