// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// The one place the deployment-specific legal facts live. §18 Abs. 1 MStV
// requires name and a postal address for any public web offer, commercial or
// not, and Art. 13(1)(a) GDPR requires the controller's contact data in the
// privacy notice — so the imprint and the privacy notice both read from here.
//
// Bracketed values are placeholders. They render highlighted so they are
// impossible to miss; replace them with the operator's public details.
export const OPERATOR = {
  name: "Sebastian Grundhöfer",
  street: "[Straße Hausnummer]",
  city: "[PLZ Ort]",
  email: "[E-Mail-Adresse]",
} as const;

export const NOTICE_DATE = "2026-09-11";

// Confirm the Cloudflare dashboard settings named in privacy §6, then replace
// this with the ISO date of that check. `pnpm check:legal` reports bracketed
// values in this file when preparing a release.
export const CLOUDFLARE_SETTINGS_CHECKED = "2026-09-11";

// Full production fallback origin, for example "retrobeam.example.workers.dev".
export const WORKERS_DEV_HOST = "retrobeam.sebastiangrundhoefer.workers.dev";

export const REPO_URL = "https://github.com/grundhofer/retrobeam";

export function isPlaceholder(value: string): boolean {
  return value.startsWith("[") && value.endsWith("]");
}
