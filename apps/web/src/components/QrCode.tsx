// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
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
        className={`sb-card__meta flex aspect-square items-center justify-center p-(--sb-space-2) text-center ${className}`}
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
        // A still placeholder (sebaro has no pulse).
        className={`aspect-square bg-(--sb-color-surface-sunken) ${className}`}
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
      // Dark on light in both modes (sebaro §4.6: scanners read inverted
      // codes badly): the light scheme's ink on its raised white.
      data-theme="light"
      className={`aspect-square ${className}`}
    >
      {/* Its own light ground: the quiet zone has to be light whatever the
          card behind it is. */}
      <rect
        width={qr.size}
        height={qr.size}
        style={{ fill: "var(--sb-color-surface-raised)" }}
      />
      <path d={qr.path} style={{ fill: "var(--sb-color-text)" }} />
    </svg>
  );
}
