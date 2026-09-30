// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Phase } from "@retrobeam/shared";

const GUIDED = ["checkin", "write", "present", "vote", "discuss", "close"];

// One line under the phase row saying what to do right now, and whose move it
// is. On a phone the stepper is compressed to "Step 3 of 7" and a phase change
// used to go unnoticed; the phase names alone never said that a member writes
// privately, or that moving on is the facilitator's call. role="status" makes
// it a polite live region, so a screen reader hears the new line once when the
// phase changes, not on every render. The lobby and the finished board speak
// for themselves and get nothing here.
export function PhaseGuide({
  phase,
  isAdmin,
  anonymous,
}: {
  phase: Phase;
  isAdmin: boolean;
  anonymous: boolean;
}) {
  const { t } = useTranslation();
  if (!GUIDED.includes(phase)) return null;
  // Nobody is called up to present on an anonymous board — promising a pick
  // there would be wrong, so that phase has its own line for both roles.
  const key =
    phase === "present" && anonymous
      ? "guide.present.anonymous"
      : phase === "write" && anonymous && !isAdmin
        ? "guide.write.memberAnonymous"
        : `guide.${phase}.${isAdmin ? "facilitator" : "member"}`;
  return (
    <p
      role="status"
      data-testid="phase-guide"
      className="w-full text-sm text-zinc-600"
    >
      {t(key)}
    </p>
  );
}
