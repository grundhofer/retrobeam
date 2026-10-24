// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { ImprintDe } from "../content/imprint.de.js";
import { ImprintEn } from "../content/imprint.en.js";
import { LEGAL_PATHS, type LegalLanguage } from "../lib/legalPaths.js";
import { LegalPage } from "./LegalPage.js";

// §18 Abs. 1 MStV: name and postal address for any public web offer, whether
// commercial or not — the "not commercial" line on the landing page does not
// waive it. German at /impressum, English at /imprint, whatever the UI
// language.
export function ImprintPage({ lang }: { lang: LegalLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <LegalPage
      lang={lang}
      paths={LEGAL_PATHS.imprint}
      title={t("legal.imprintTitle")}
    >
      {lang === "de" ? <ImprintDe /> : <ImprintEn />}
    </LegalPage>
  );
}
