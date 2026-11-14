// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import tile from "../../../../sebaro-product/sign/tile.svg?raw";
import { LanguageSwitch } from "./LanguageSwitch.js";

// The header of every page, the board's too, as sebaro builds it for a web
// app without a window (spec/03 §6.6, D102 (45)): the 32 px tile and the name
// back to the landing page, DE / EN, and the button „Hell oder Dunkel“. Only
// the board has navigation words (`nav` below); the link to the source is in
// the footer (D102 (48)). The name carries a
// soft hyphen, so at large text it breaks as „Retro-“ / „Beam“ (D104 (30));
// translate="no" keeps translators and sb-fit.js off it.
//
// „Hell oder Dunkel“ is sebaro's theme-button.js (index.html): it toggles to
// the other mode, two presses return to the system's, and the result is
// announced in the visually hidden status beside it (stage 6b).
//
// `nav` is the app's own places, for the board: „Board“ and „Einstellungen“
// last (spec/03 §6.6), words only, aria-current on the one shown.
//
// `languageTo` is the same page in the other language, for the pages that
// have one (the legal pages): DE / EN then links there instead of storing a
// choice.
export function SiteHeader({
  languageTo,
  nav,
}: {
  languageTo?: string;
  nav?: readonly { to: string; label: string; current: boolean }[];
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <header className="sb-site-header">
      <Link
        to="/"
        className="sb-lockup"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <span
          className="sb-sign-tile sb-sign-tile--32"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: tile }}
        />
        <span className="sb-wordmark" translate="no">
          Retro{"­"}Beam
        </span>
      </Link>
      <div className="sb-site-header__links">
        {nav ? (
          <nav className="sb-site-nav" aria-label={t("site.nav")}>
            {nav.map((place) => (
              <Link
                key={place.to}
                to={place.to}
                aria-current={place.current ? "page" : undefined}
              >
                {place.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <LanguageSwitch to={languageTo} />
      </div>
      <button
        className="sb-theme-button"
        type="button"
        data-testid="theme-button"
      >
        {t("site.theme")}
      </button>
      <p data-sb-theme-status role="status" className="sb-visually-hidden" />
    </header>
  );
}
