// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFile } from "node:fs/promises";

const operatorFile = new URL(
  "../apps/web/src/content/operator.ts",
  import.meta.url,
);
const source = await readFile(operatorFile, "utf8");
const placeholders = [...source.matchAll(/"(\[[^"\n]+\])"/g)].map(
  ([, value]) => value,
);

if (placeholders.length > 0) {
  console.error(
    `Deployment blocked: replace the legal placeholders in apps/web/src/content/operator.ts (${placeholders.join(
      ", ",
    )}).`,
  );
  process.exitCode = 1;
}
