// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useSyncExternalStore, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

// The id every screen's <main> carries. "inhalt" is sebaro's name for it
// (spec/09 §2), so the move keeps the target as it is.
export const MAIN_ID = "inhalt";

// "Zum Inhalt" (WCAG 2.4.1 Bypass Blocks): the first tab stop of every screen,
// past the header to the screen's <main>. Rendered once, above the router in
// main.tsx, so no page can forget it and nothing a page renders comes before
// it. Visually hidden until focused; focused, it floats at the top start over
// the header, as sebaro's sb-skip-link does, so nothing on the page moves.
// bg-[Canvas] is the CSS system colour (white in the app's light scheme), not
// a palette class; sb-skip-link replaces the look with the move.
//
// The click moves focus itself instead of following the fragment: a board URL
// is a capability whose fragment the app reads (#admin=, lib/adminLink.ts),
// and #inhalt left in the address bar would ride along when someone copies
// the link, and add a step to Back. <main> is focusable only while it holds
// that focus: a lasting tabIndex={-1} would let a click on its empty space
// (in WebKit, a click on any button in it) focus <main>, and RetroResults
// picks up dropped focus only from <body>.
// The link sits above the router, outside a legal page's own i18n instance
// (LegalPage.tsx), so it reads the page's language from <html lang>, which
// both the app (i18n.ts) and a legal page keep current. On /privacy with a
// German UI it says "Skip to content", like the page it skips into.
function subscribeToLang(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["lang"] });
  return () => observer.disconnect();
}
const pageLang = () => document.documentElement.lang;

export function SkipLink() {
  const { i18n } = useTranslation();
  const lang = useSyncExternalStore(subscribeToLang, pageLang);
  const t = i18n.getFixedT(lang.startsWith("de") ? "de" : "en");

  function skip(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const main = document.getElementById(MAIN_ID);
    if (main === null) return;
    main.setAttribute("tabindex", "-1");
    main.addEventListener("blur", () => main.removeAttribute("tabindex"), {
      once: true,
    });
    main.focus();
  }

  return (
    <a
      href={`#${MAIN_ID}`}
      lang={lang.startsWith("de") ? "de" : "en"}
      onClick={skip}
      className="sr-only font-medium underline underline-offset-4 focus:not-sr-only focus:fixed focus:start-0 focus:top-0 focus:z-50 focus:bg-[Canvas] focus:px-6 focus:py-3"
    >
      {t("site.skipToContent")}
    </a>
  );
}
