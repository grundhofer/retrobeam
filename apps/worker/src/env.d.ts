// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Secrets cannot be declared in wrangler.jsonc: a binding name may be either a
// var or a secret, never both, and declaring an empty var makes
// `wrangler secret put` fail outright. `wrangler types` therefore cannot see
// them, so they are declared here and merged into the generated Env.
//
// Optional on purpose — absent is a supported state. Without a key, GIF search
// reports itself unavailable and every other feature works.
interface Env {
  KLIPY_API_KEY?: string;
}
