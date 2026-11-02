// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import tile from "../sebaro/brand/inline/tile-retrobeam-small.svg?raw";
import { LanguageSwitch } from "./LanguageSwitch.js";

// The header of every page outside a board, as sebaro builds it for a web app
// without a window (spec/03 §6.6, D102 (45)): the 32 px tile and the name
// back to the landing page, DE / EN, and the button „Hell oder Dunkel“. No
// navigation words; „Einstellungen“ joins with the settings view (5a), and
// the link to the source is in the footer (D102 (48)). The name carries a
// soft hyphen, so at large text it breaks as „Retro-“ / „Beam“ (D104 (30));
// translate="no" keeps translators and sb-fit.js off it.
//
// The theme button is in the markup but hidden until stage 6b switches dark
// mode on (plan §5.3).
//
// `languageTo` is the same page in the other language, for the pages that
// have one (the legal pages): DE / EN then links there instead of storing a
// choice.
export function SiteHeader({ languageTo }: { languageTo?: string }) {
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
        <LanguageSwitch to={languageTo} />
      </div>
      <button className="sb-theme-button" type="button" hidden>
        {t("site.theme")}
      </button>
    </header>
  );
}
