// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import {
  exportFileName,
  type ExportFormat,
  type ExportScope,
} from "@retrobeam/shared";
import { fetchBoardExport } from "./api.js";
import { renderBoardImage } from "./exportImage.js";

// The export's state and actions, shared by the board menu and the results
// page. Two surfaces offer the same downloads; one hook builds the URLs and
// draws the image, so the two can differ in layout and never in what the file
// contains. `initialScope` is the only knob: the menu has always opened on
// "everything", the finished retro leads with the summary.
export function useBoardExport(
  boardId: string,
  initialScope: ExportScope = "all",
) {
  const [includeAuthors, setIncludeAuthors] = useState(false);
  const [scope, setScope] = useState<ExportScope>(initialScope);
  const [imaging, setImaging] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Render the board to a JPEG in this tab and hand it to the browser as a
  // download. The bytes never leave the machine, and the SNAPSHOT is re-fetched
  // from the export route rather than read from the board store — see
  // fetchBoardExport for why that distinction is the whole point.
  async function downloadImage() {
    if (imaging) return;
    setImaging(true);
    setImageFailed(false);
    let url: string | null = null;
    try {
      const data = await fetchBoardExport(boardId, scope, includeAuthors);
      const blob = await renderBoardImage(data, scope);
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(data.boardName, scope, "jpg");
      link.click();
    } catch {
      // A silent no-op click is the worst outcome here: the person clicked
      // "JPEG" and nothing happened, with no way to tell whether it worked.
      setImageFailed(true);
    } finally {
      // Revoke on the next tick — Safari has not started the download yet when
      // click() returns, and revoking synchronously cancels it.
      if (url !== null) {
        const revoke = url;
        setTimeout(() => URL.revokeObjectURL(revoke), 10_000);
      }
      setImaging(false);
    }
  }

  function exportHref(format: ExportFormat): string {
    const params = new URLSearchParams({ format });
    // Only when non-default, so the "everything" URL stays byte-identical to
    // the one that shipped before scopes existed (same as `authors`).
    if (scope !== "all") params.set("scope", scope);
    if (includeAuthors) params.set("authors", "true");
    return `/api/boards/${boardId}/export?${params.toString()}`;
  }

  return {
    scope,
    setScope,
    includeAuthors,
    setIncludeAuthors,
    imaging,
    imageFailed,
    downloadImage,
    exportHref,
  };
}
