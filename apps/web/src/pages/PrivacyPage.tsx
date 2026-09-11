// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { NOTICE_DATE } from "../content/operator.js";
import { PrivacyDe } from "../content/privacy.de.js";
import { PrivacyEn } from "../content/privacy.en.js";
import { LegalPage } from "./LegalPage.js";

// Art. 13 GDPR notice, in the UI language. Reachable as /datenschutz and
// /privacy; the content lives in content/privacy.*.tsx as plain HTML.
export function PrivacyPage() {
  const { t, i18n } = useTranslation();
  const de = i18n.language.startsWith("de");
  return (
    <LegalPage title={t("legal.privacyTitle")} updated={NOTICE_DATE}>
      {de ? <PrivacyDe /> : <PrivacyEn />}
    </LegalPage>
  );
}
