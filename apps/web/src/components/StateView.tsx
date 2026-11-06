// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ReactNode } from "react";
import { MAIN_ID } from "./SkipLink.js";

// A screen that is only a state — a page that does not exist, a board that
// is gone or cannot be reached — as sebaro builds a page: the main area in a
// container section, the state as the page's h1, one sentence under it, and
// the one way on as the primary action (sebaro spec/02 §5, spec/07 §4.1).
// `header` and `footer` are the frame of the place it stands in: the site's
// on its own pages, the board's (none yet) on a board.
export function StateView({
  view,
  testId,
  header,
  title,
  text,
  action,
  footer,
}: {
  view: string;
  testId?: string;
  header?: ReactNode;
  title: string;
  text: ReactNode;
  action?: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div data-sb-view={view} className="flex min-h-dvh flex-col">
      {header}
      <main
        id={MAIN_ID}
        data-testid={testId}
        className="sb-container sb-section sb-stack sb-stack--group sb-stack--start flex-1"
      >
        <h1>{title}</h1>
        <p className="sb-page-lead__text">{text}</p>
        {action}
      </main>
      {footer}
    </div>
  );
}
