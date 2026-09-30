// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { encode } from "uqr";

// The QR code for the team link, encoded here in the tab: the link never goes
// to a QR service, and nothing is fetched to draw it. This module is the only
// importer of `uqr` and is itself only ever loaded with a dynamic import (see
// QrCode.tsx), so the encoder stays out of the entry bundle for everyone who
// never opens a lobby or the invite panel.

// The four-module light margin the QR spec asks for. Phone cameras find the
// code by its finder squares, and a board's own dark card edges right beside
// them are exactly what makes a scan from across a meeting room fail.
export const QR_QUIET_ZONE = 4;

export interface QrPath {
  /** Modules per side, quiet zone included — the SVG viewBox. */
  size: number;
  /** Every dark module as one SVG path, in module units. */
  path: string;
}

export function qrPath(text: string): QrPath {
  // Level M (15% recovery): a projected code loses a corner to glare or a
  // head in the way, and a board link is short enough that M still fits a
  // small version with big, easy-to-scan modules.
  const { data, size } = encode(text, { ecc: "M", border: QR_QUIET_ZONE });
  // One path of horizontal runs rather than a <rect> per module: a version-4
  // code is ~600 dark modules, and one element scales to a projector as
  // cheaply as to a phone.
  let path = "";
  data.forEach((row, y) => {
    let x = 0;
    while (x < size) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < size && row[end]) end += 1;
      path += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return { size, path };
}
