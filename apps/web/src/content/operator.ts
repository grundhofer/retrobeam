// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// The one place the deployment-specific legal facts live. §18 Abs. 1 MStV
// requires name and a postal address for any public web offer, commercial or
// not, and Art. 13(1)(a) GDPR requires the controller's contact data in the
// privacy notice — so the imprint and the privacy notice both read from here.
//
// Bracketed values are placeholders. They render highlighted so they are
// impossible to miss; replace them with the operator's public details.
//
// `careOf` carries the "c/o" line of an address service. It is a ladungsfähige
// Anschrift (§18 Abs. 1 MStV is satisfied, a P.O. box would not be) and the
// line is load-bearing: post only reaches the operator when it is addressed
// with it. Leave it empty when the address needs no such line.
// Typed rather than `as const`: a self-hoster edits these values, and an empty
// careOf has to stay a legal value for the renderer to test against.
export interface Operator {
  readonly name: string;
  readonly careOf: string;
  readonly street: string;
  readonly city: string;
  readonly email: string;
}

export const OPERATOR: Operator = {
  name: "Sebastian Grundhöfer",
  careOf: "c/o Impressumservice Dein-Impressum",
  street: "Stettiner Str. 41",
  city: "35410 Hungen",
  email: "info@sebaro-ventures.de",
};

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
