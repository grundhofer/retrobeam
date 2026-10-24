// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { NOTICE_DATE } from "../content/operator.js";
import { PrivacyDe } from "../content/privacy.de.js";
import { PrivacyEn } from "../content/privacy.en.js";
import { LEGAL_PATHS, type LegalLanguage } from "../lib/legalPaths.js";
import { LegalPage } from "./LegalPage.js";

// Art. 13 GDPR notice, in the language of its path: German at /datenschutz,
// English at /privacy, whatever the UI language. The content lives in
// content/privacy.*.tsx as plain HTML.
export function PrivacyPage({ lang }: { lang: LegalLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <LegalPage
      lang={lang}
      paths={LEGAL_PATHS.privacy}
      title={t("legal.privacyTitle")}
      updated={NOTICE_DATE}
    >
      {lang === "de" ? <PrivacyDe /> : <PrivacyEn />}
    </LegalPage>
  );
}
