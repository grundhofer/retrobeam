// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { REPO_URL } from "../content/operator.js";
import { LEGAL_PATHS } from "../lib/legalPaths.js";
import { Icon } from "./Icon.js";

// sebaro's website footer (spec/02 §5, WEB-03) as a web app without a window
// has it (spec/03 §6.6): the copyright line, then Impressum, Datenschutz,
// Barrierefreiheit and GitHub, without „Darstellung“ (D104 (29)). It is on
// every screen a participant uses, so the two statutory pages (Art. 13 GDPR,
// § 18 Abs. 1 MStV) and the accessibility statement are always one step away.
//
// AGPL: §13 asks a version reachable over a network to offer its users the
// source of that version, so „GitHub“ leads to the commit that is running
// (owner F16, 2026-11-02, within sebaro's single GitHub link, D102 (48)).
// §5(d)'s Appropriate Legal Notices (copyright, the licence, that the work may
// be conveyed, no warranty) stand as text in the copyright line, and the
// repository shows the licence itself. The fonts' OFL texts are linked too, as
// their licence asks for (plan §2.4).
//
// The commit is injected at build time (VITE_COMMIT_SHA — see deploy.yml and
// the `deploy` script). Without it the link degrades to the repository, which
// is right for dev and tests but not for a deployed build.
const commit = import.meta.env.VITE_COMMIT_SHA;
const sourceUrl = commit ? `${REPO_URL}/tree/${commit}` : REPO_URL;

// The legal pages have a path per language (lib/legalPaths.ts), so the links
// lead to the version in the reader's language: the UI language, or on a legal
// page that page's own language.
export function LegalFooter({
  openLegalLinksInNewTab = false,
}: {
  openLegalLinksInNewTab?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const target = openLegalLinksInNewTab ? "_blank" : undefined;
  const rel = openLegalLinksInNewTab ? "noreferrer" : undefined;
  return (
    <footer data-testid="legal-footer" className="sb-site-footer">
      <p>
        © 2026 Sebastian Grundhöfer · <span translate="no">RetroBeam</span> ·{" "}
        {t("legal.notice")}
      </p>
      <ul className="sb-site-footer__links">
        <li>
          <Link to={LEGAL_PATHS.imprint[lang]} target={target} rel={rel}>
            {t("legal.imprint")}
          </Link>
        </li>
        <li>
          <Link to={LEGAL_PATHS.privacy[lang]} target={target} rel={rel}>
            {t("legal.privacy")}
          </Link>
        </li>
        <li>
          <Link to={LEGAL_PATHS.accessibility[lang]} target={target} rel={rel}>
            {t("legal.accessibility")}
          </Link>
        </li>
        <li>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            title={t("legal.source")}
          >
            GitHub
            <Icon name="external-link" size={16} />
          </a>
        </li>
        <li>
          {t("legal.fonts")}{" "}
          <a href="/fonts/sebaro-sans-OFL.txt" target="_blank" rel="noreferrer">
            {t("legal.fontSans")}
          </a>{" "}
          ·{" "}
          <a href="/fonts/sebaro-mono-OFL.txt" target="_blank" rel="noreferrer">
            {t("legal.fontMono")}
          </a>
        </li>
      </ul>
    </footer>
  );
}
