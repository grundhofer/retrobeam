// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import {
  Feedback,
  openFeedback,
  type FeedbackWords,
} from "../sebaro/react/Feedback";

// „Rückmeldung geben“ (sebaro Blueprint parts/feedback, NAV-12, EIN-07): the
// panel or sheet and its picture editor, once beside the router. The board's
// „Mehr“ menu and the footer of every screen open it; the copy's
// sb-feedback.js (index.html) does the rest — the picture with everything
// marked data-sb-private black, the proof of work, sending to the family's
// feedback service, which files a public issue in the repository. The view
// that goes along is the opener's data-sb-view, never the path: a board's
// path is its capability (NoIndex.tsx).
export const FEEDBACK_SERVICE = "https://rueckmeldung.sebaro-ventures.de";
export const FEEDBACK_ID = "app-feedback";

// RetroBeam has no version number; the running commit names the build, as
// the footer's source link does (VITE_COMMIT_SHA, see deploy.yml).
const commit = import.meta.env.VITE_COMMIT_SHA?.slice(0, 7);

export function AppFeedback() {
  const { t } = useTranslation();
  const words = t("feedback", { returnObjects: true }) as FeedbackWords;
  return (
    <Feedback
      id={FEEDBACK_ID}
      product="retrobeam"
      endpoint={FEEDBACK_SERVICE}
      {...(commit ? { commit } : {})}
      words={words}
    />
  );
}

/** Opens the dialog; focus returns to `opener` (the menu's button). */
export function openAppFeedback(opener?: Element | null) {
  openFeedback(FEEDBACK_ID, opener);
}
