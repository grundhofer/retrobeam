// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useBoardStore } from "../store/boardStore.js";
import { Icon } from "./Icon.js";

// The board's action zone (sebaro spec/03 §2, spec/02 §4.17): the bottom
// block, sticky at the foot of the view, with the facilitator's primary
// action (PhaseStepper portals it into `slotRef`) and, after a failure, the
// reason as a sentence with the error glyph (sb-primary-action-bar__message).
//
// A refusal is an error, and sebaro never puts an error in a toast (spec/07
// §4.3): it stands in the view. The server says what it refused, not which
// control sent it, so the reason stands here, in the zone everyone sees
// whatever they scrolled to, rather than at a guessed place. It stays until
// the room moves on (the next acknowledged command, a phase change: see
// BoardPage), never on a timer.
//
// The sentence is announced by a status region that is always in the page,
// so the first one is heard too; the drawn sentence is not a live region
// itself, or it would be read twice. Without a sentence and without a
// primary action the block is not drawn at all.
//
// A sticky block covers the foot of the page, and a browser that scrolls a
// focused field into view stops at the window's edge, under the block — on a
// phone with its keyboard up the field one types in was hidden (WebKit, CI).
// So while the block stands, the page's scroll padding at its end is the
// block's height, measured, so it holds with a failure sentence and at large
// text too (reported to sebaroDesign).
export function ActionZone({
  slotRef,
}: {
  slotRef: (element: HTMLDivElement | null) => void;
}) {
  const { t } = useTranslation();
  const notice = useBoardStore((store) => store.notices.at(-1) ?? null);
  const zoneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const root = document.documentElement;
    const pad = () => {
      root.style.scrollPaddingBlockEnd = `${zone.offsetHeight}px`;
    };
    pad();
    const observer = new ResizeObserver(pad);
    observer.observe(zone);
    return () => {
      observer.disconnect();
      root.style.scrollPaddingBlockEnd = "";
    };
  }, []);
  return (
    <>
      <p role="status" data-testid="notices" className="sb-visually-hidden">
        {notice ? t(notice.key) : ""}
      </p>
      <div
        ref={zoneRef}
        data-testid="action-zone"
        className="sb-bottom-block hidden has-[.sb-primary-action,[data-notice]]:block"
      >
        <div className="sb-primary-action-bar">
          {notice ? (
            <p
              data-notice
              data-testid="notice"
              className="sb-primary-action-bar__message"
            >
              {notice.tone === "error" ? <Icon name="error" size={16} /> : null}
              <span>{t(notice.key)}</span>
            </p>
          ) : null}
          <div ref={slotRef} className="contents" />
        </div>
      </div>
    </>
  );
}
