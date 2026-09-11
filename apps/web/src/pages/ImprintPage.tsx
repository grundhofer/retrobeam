// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { ImprintDe } from "../content/imprint.de.js";
import { ImprintEn } from "../content/imprint.en.js";
import { LegalPage } from "./LegalPage.js";

// §18 Abs. 1 MStV: name and postal address for any public web offer, whether
// commercial or not — the "not commercial" line on the landing page does not
// waive it. Reachable as /impressum and /imprint.
export function ImprintPage() {
  const { t, i18n } = useTranslation();
  const de = i18n.language.startsWith("de");
  return (
    <LegalPage title={t("legal.imprintTitle")}>
      {de ? <ImprintDe /> : <ImprintEn />}
    </LegalPage>
  );
}
