// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Runs the legal guard against a copy of the files it reads, so each case can
// change them (or the git remote, or GITHUB_REPOSITORY) without touching the
// real checkout. Every run has a timeout: a parser that loops forever would
// otherwise hang the deploy job instead of failing it.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = "scripts/check-legal-placeholders.mjs";
const OPERATOR = "apps/web/src/content/operator.ts";
const WRANGLER = "apps/worker/wrangler.jsonc";
const HOST_FILES = [
  "apps/web/index.html",
  "apps/web/public/robots.txt",
  "apps/web/public/sitemap.xml",
  "apps/web/src/content/imprint.en.tsx",
  "apps/web/src/content/imprint.de.tsx",
  "apps/web/src/content/privacy.en.tsx",
  "apps/web/src/content/privacy.de.tsx",
];

const base = mkdtempSync(join(tmpdir(), "check-legal-"));
after(() => rmSync(base, { recursive: true, force: true }));
let runs = 0;

// `edit` maps a repo-relative path to a function over its content.
function run({ edit = {}, origin, env = {} } = {}) {
  const dir = join(base, String(runs++));
  for (const path of [SCRIPT, OPERATOR, WRANGLER, ...HOST_FILES]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    const content = readFileSync(join(ROOT, path), "utf8");
    writeFileSync(join(dir, path), edit[path] ? edit[path](content) : content);
  }
  if (origin) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["remote", "add", "origin", origin], { cwd: dir });
  }
  const {
    GITHUB_REPOSITORY: _repo,
    GITHUB_SERVER_URL: _server,
    ...rest
  } = process.env;
  const result = spawnSync(process.execPath, [join(dir, SCRIPT)], {
    encoding: "utf8",
    timeout: 5000,
    // Never let git find the real checkout above the temp directory.
    env: { ...rest, GIT_CEILING_DIRECTORIES: base, ...env },
  });
  assert.equal(result.signal, null, "the guard did not finish within 5s");
  return result;
}

// A fork that has done everything the README asks, deployed to workers.dev.
const FORK_HOST = "retrobeam.jane-doe.workers.dev";
const debranded = (operator = (content) => content) => ({
  [OPERATOR]: (content) =>
    operator(
      content
        .replace('"Sebastian Grundhöfer"', '"Jane Doe"')
        .replace('"Stettiner Str. 41"', '"Musterweg 1"')
        .replace('"info@sebaro-ventures.de"', '"jane@example.org"')
        .replace("github.com/grundhofer/retrobeam", "github.com/jane/retrobeam")
        .replace("retrobeam.sebastiangrundhoefer.workers.dev", FORK_HOST)
        .replace(
          'INSTANCE_HOST = "retrobeam.de"',
          `INSTANCE_HOST = "${FORK_HOST}"`,
        ),
    ),
  [WRANGLER]: (content) =>
    content.replace(/"routes": \[.*\],/, '"routes": [],'),
  ...Object.fromEntries(
    HOST_FILES.map((path) => [
      path,
      (content) => content.replaceAll("retrobeam.de", FORK_HOST),
    ]),
  ),
});

test("retrobeam.de's own checkout passes, locally and in its CI", () => {
  assert.equal(run().status, 0);
  assert.equal(
    run({ origin: "git@github.com:grundhofer/retrobeam.git" }).status,
    0,
  );
  assert.equal(
    run({ origin: "https://github.com/Grundhofer/retrobeam.git" }).status,
    0,
  );
  assert.equal(
    run({ env: { GITHUB_REPOSITORY: "grundhofer/retrobeam" } }).status,
    0,
  );
});

test("an unchanged fork is blocked although it keeps the retrobeam.de route", () => {
  for (const setup of [
    { env: { GITHUB_REPOSITORY: "jane/retrobeam" } },
    { origin: "git@github.com:jane/retrobeam.git" },
    { origin: "https://github.com/jane/retrobeam" },
  ]) {
    const { status, stderr } = run(setup);
    assert.equal(status, 1);
    assert.match(stderr, /routes retrobeam\.de, but this is github\.com\/jane/);
    assert.match(stderr, /OPERATOR\.name/);
    assert.match(stderr, /REPO_URL/);
  }
});

test("a de-branded workers.dev fork passes", () => {
  const { status, stderr } = run({
    edit: debranded(),
    origin: "git@github.com:jane/retrobeam.git",
  });
  assert.equal(stderr, "");
  assert.equal(status, 0);
});

test("INSTANCE_HOST may name WORKERS_DEV_HOST instead of repeating it", () => {
  const { status, stderr } = run({
    edit: debranded((content) =>
      content.replace(
        /INSTANCE_HOST = "[^"]*"/,
        "INSTANCE_HOST = WORKERS_DEV_HOST",
      ),
    ),
  });
  assert.equal(stderr, "");
  assert.equal(status, 0);
});

test("values prettier wrapped onto the next line still parse", () => {
  const { status, stderr } = run({
    edit: debranded((content) =>
      content
        .replace(`WORKERS_DEV_HOST = "`, `WORKERS_DEV_HOST =\n  "`)
        .replace(`INSTANCE_HOST = "`, `INSTANCE_HOST =\n  "`)
        .replace('name: "Jane Doe"', 'name:\n    "Jane Doe"'),
    ),
  });
  assert.equal(stderr, "");
  assert.equal(status, 0);
});

test("wrangler.jsonc with an escaped backslash at a string's end parses", () => {
  const { status, stderr } = run({
    edit: {
      [WRANGLER]: (content) =>
        content.replace(
          '"name": "retrobeam",',
          '"name": "retrobeam", "x": "C:\\\\",',
        ),
    },
  });
  assert.equal(stderr, "");
  assert.equal(status, 0);
});

test("an unterminated block comment or string fails instead of hanging", () => {
  for (const [broken, what] of [
    [(content) => `${content}\n/* never closed`, "block comment"],
    [(content) => `${content}\n"never closed`, "string"],
  ]) {
    const { status, stderr } = run({ edit: { [WRANGLER]: broken } });
    assert.equal(status, 1);
    assert.match(stderr, new RegExp(`unterminated ${what}`));
  }
});

// Keeps the helper honest if the fixture list above ever drifts from the
// script's own: a missing file would make every case fail on ENOENT.
test("the fixture copies every file the guard reads", () => {
  const script = readFileSync(join(ROOT, SCRIPT), "utf8");
  for (const path of HOST_FILES) assert.ok(script.includes(`"${path}"`), path);
});
