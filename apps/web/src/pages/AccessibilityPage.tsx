// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { AccessibilityDe } from "../content/accessibility.de.js";
import { AccessibilityEn } from "../content/accessibility.en.js";
import { ACCESSIBILITY_DATE } from "../content/operator.js";
import { LEGAL_PATHS, type LegalLanguage } from "../lib/legalPaths.js";
import { LegalPage } from "./LegalPage.js";

// Accessibility statement (F17, sebaro ZUG-07): what was checked and what was
// not, without a conformance claim. German at /barrierefreiheit, English at
// /accessibility, whatever the UI language. The content lives in
// content/accessibility.*.tsx as plain HTML.
export function AccessibilityPage({ lang }: { lang: LegalLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <LegalPage
      lang={lang}
      paths={LEGAL_PATHS.accessibility}
      title={t("legal.accessibilityTitle")}
      updated={ACCESSIBILITY_DATE}
    >
      {lang === "de" ? <AccessibilityDe /> : <AccessibilityEn />}
    </LegalPage>
  );
}
