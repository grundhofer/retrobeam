// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { REPO_URL } from "../content/operator.js";

// AGPL §13 obliges a version reachable over a network to offer its users the
// Corresponding Source *of that version*; §5(d) obliges the interactive UI to
// carry the copyright notice, the licence terms and the warranty disclaimer.
// Both are discharged here, on every screen a participant actually uses —
// as are the two statutory pages: the privacy notice (Art. 13 GDPR) and the
// imprint (§ 18 Abs. 1 MStV), which must be reachable from every page.
//
// The commit is injected at build time (VITE_COMMIT_SHA — see deploy.yml and
// the `deploy` script). Without it the links degrade to the default branch,
// which is correct for dev and tests but not for a deployed build.
const commit = import.meta.env.VITE_COMMIT_SHA;
const sourceUrl = commit ? `${REPO_URL}/tree/${commit}` : REPO_URL;
const licenseUrl = `${REPO_URL}/blob/${commit ?? "main"}/LICENSE`;
const shortCommit = commit ? commit.slice(0, 7) : null;

const linkClass =
  "inline-block py-1 underline underline-offset-2 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent";

export function LegalFooter({
  openLegalLinksInNewTab = false,
}: {
  openLegalLinksInNewTab?: boolean;
}) {
  const { t } = useTranslation();
  const legalLinkTarget = openLegalLinksInNewTab ? "_blank" : undefined;
  const legalLinkRel = openLegalLinksInNewTab ? "noreferrer" : undefined;
  return (
    <footer
      data-testid="legal-footer"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-6 py-4 text-xs text-zinc-600"
    >
      <span>© 2026 Sebastian Grundhöfer</span>
      <span aria-hidden="true">·</span>
      <Link
        to="/datenschutz"
        target={legalLinkTarget}
        rel={legalLinkRel}
        className={linkClass}
      >
        {t("legal.privacy")}
      </Link>
      <span aria-hidden="true">·</span>
      <Link
        to="/impressum"
        target={legalLinkTarget}
        rel={legalLinkRel}
        className={linkClass}
      >
        {t("legal.imprint")}
      </Link>
      <span aria-hidden="true">·</span>
      <a
        href={licenseUrl}
        target="_blank"
        rel="noreferrer"
        className={linkClass}
      >
        {t("legal.license")}
      </a>
      <span aria-hidden="true">·</span>
      <span>{t("legal.redistribute")}</span>
      <span aria-hidden="true">·</span>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={t("legal.sourceVersion")}
        className={linkClass}
      >
        {t("legal.source")}
        {shortCommit ? ` ${shortCommit}` : null}
      </a>
    </footer>
  );
}
