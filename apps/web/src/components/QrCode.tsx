// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { QrPath } from "../lib/qr.js";

// A QR code as inline SVG: it stays sharp at any size, from the lobby card to
// a meeting-room projector. The encoder arrives through a dynamic import, so
// Vite splits it into its own chunk and the entry bundle does not carry it.
//
// A small code takes `modulePx` rather than a size class: its width is then a
// whole number of CSS pixels per module. At a fractional module size (a
// 41-module code in 112px is 2.73px each) WebKit at device pixel ratio 1 —
// Safari on the meeting-room projector — snaps every crisp edge outward, the
// dark modules swallow their light neighbours and the code no longer scans.
// Large renders take a class: at a dozen pixels per module a pixel of bleed
// does not matter.
export function QrCode({
  value,
  label,
  className = "",
  modulePx,
}: {
  value: string;
  label: string;
  className?: string;
  modulePx?: number;
}) {
  const { t } = useTranslation();
  // Tagged with the text it encodes, so a changed value never shows the old
  // code for a frame while the new one is computed.
  const [qr, setQr] = useState<(QrPath & { value: string }) | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("../lib/qr.js").then(
      ({ qrPath }) => {
        if (!cancelled) setQr({ value, ...qrPath(value) });
      },
      () => {
        // The chunk can fail to load — most likely in a tab still running
        // the previous deploy, whose chunk names no longer exist. The link
        // beside the code still works; say so instead of pulsing forever.
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [value]);

  // Until the encoder has run the module count is unknown; a board link on
  // retrobeam.de is a version-4 code, 33 modules plus the quiet zone on each
  // side. On a host with a longer origin the code can be a version larger,
  // and the box grows by four modules when it lands.
  const modules = qr?.value === value ? qr.size : 41;
  const box =
    modulePx === undefined
      ? undefined
      : { width: modules * modulePx, height: modules * modulePx };

  if (failed) {
    return (
      <div
        data-testid="qr-failed"
        style={box}
        className={`flex aspect-square items-center justify-center rounded bg-zinc-50 p-2 text-center text-xs text-zinc-500 ${className}`}
      >
        {t("invite.qrFailed")}
      </div>
    );
  }
  if (qr === null || qr.value !== value) {
    // Same box as the code, so nothing jumps when it lands.
    return (
      <div
        aria-hidden="true"
        style={box}
        className={`aspect-square animate-pulse rounded bg-zinc-100 motion-reduce:animate-none ${className}`}
      />
    );
  }
  return (
    <svg
      data-testid="qr-code"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      // No anti-aliased seams between neighbouring modules — a grey hairline
      // is enough to trip a scanner on a projected image.
      shapeRendering="crispEdges"
      style={box}
      className={`aspect-square ${className}`}
    >
      {/* Its own white ground: the quiet zone has to be light whatever the
          card behind it is. */}
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={qr.path} fill="#18181b" />
    </svg>
  );
}

// The code as large as the screen allows, for the room: the typical invite is
// a laptop on the meeting-room projector while half the team is remote and
// the other half has a phone in hand.
//
// Portaled to <body>. Rendered in place, inside the invite panel, its z-60
// only counted within the panel's own stacking context: the canvas zoom
// control and the join toasts, later in the page, were drawn over the code on
// the projector — and the zoom control stayed clickable. The invite popover
// closes when focus leaves its DOM subtree, so this root carries
// `data-popover-layer`, which HeaderPopover counts as inside (see there).
export function QrFullscreen({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // On the window, in the capture phase: a click on the code or the text
  // leaves focus on the overlay itself (tabIndex below), but a handler on the
  // overlay still misses a key pressed with focus anywhere else. Capture runs
  // before HeaderPopover's own Escape listener, which skips an event this
  // layer has claimed — one key press closes one layer, not both.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="qr-fullscreen"
      data-popover-layer=""
      // Focusable so that a press on the code or the text keeps focus in
      // the dialog rather than dropping it to <body> behind it.
      tabIndex={-1}
      onKeyDown={(event) => {
        // The close button is the only control, so Tab has nowhere to go —
        // keep focus inside rather than let it wander behind the overlay.
        if (event.key === "Tab") event.preventDefault();
      }}
      className="fixed inset-0 z-60 flex flex-col items-center justify-center gap-4 bg-white px-4 py-6 text-center focus:outline-none"
    >
      <button
        ref={closeRef}
        type="button"
        data-testid="qr-fullscreen-close"
        aria-label={t("invite.close")}
        onClick={onClose}
        className="absolute top-3 right-3 rounded-full px-3 py-1.5 text-2xl text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent"
      >
        ×
      </button>
      <h2
        id={titleId}
        className="text-xl font-semibold text-zinc-900 sm:text-3xl"
      >
        {t("invite.scan")}
      </h2>
      {/* Bounded by the shorter axis, like the wheel: on a landscape
          projector the height decides, on a phone the width. */}
      <QrCode
        value={url}
        label={t("invite.qrLabel")}
        className="w-[min(88vw,70dvh)]"
      />
      <p className="max-w-full text-sm break-all text-zinc-600 sm:text-lg">
        {url}
      </p>
    </div>,
    document.body,
  );
}
