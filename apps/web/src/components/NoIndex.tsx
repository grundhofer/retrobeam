// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from "react";

// The client-side half of "board URLs are never indexed". A board URL is a
// capability, and one posted publicly could otherwise end up in a search
// index with the board's name as its title. The server half is the
// X-Robots-Tag rule in public/_headers, which a crawler sees without running
// any script; this tag is the fallback for wherever that header does not
// reach (a self-host behind another static server, a dev server), and it is
// what Google reads after rendering. robots.txt deliberately does NOT block
// /board/: a crawler that may not fetch a page never sees its noindex.
//
// Rendered next to a route's element, not inside it, so the page components
// stay unaware of it. Removed on unmount, so leaving a board for the landing
// page does not carry the tag along.
export function NoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.append(meta);
    return () => meta.remove();
  }, []);
  return null;
}
