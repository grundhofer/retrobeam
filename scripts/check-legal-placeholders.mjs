// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Runs before every deploy (both jobs in .github/workflows/deploy.yml and the
// `deploy` script in apps/web/package.json). Two ways the legal pages can go
// out wrong, both blocked here:
//
//  1. A bracketed placeholder in operator.ts publishes an imprint with no
//     reachable operator.
//  2. A clone deployed to its own host still carries retrobeam.de's operator
//     data. That imprint would name someone who does not run the instance,
//     and the §13 source link would point at upstream, not at the modified
//     build. The route in wrangler.jsonc is the one fact a self-hoster MUST
//     change (the retrobeam.de zone is not theirs), so it is the trigger: once
//     it no longer matches INSTANCE_HOST, or INSTANCE_HOST is not retrobeam.de,
//     or the repository being deployed is not retrobeam.de's (see
//     deployingRepository), none of retrobeam.de's values may remain.
// No network, no dependencies: it reads files, asks git for the origin remote
// and compares strings.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const OPERATOR_FILE = "apps/web/src/content/operator.ts";
const WRANGLER_FILE = "apps/worker/wrangler.jsonc";
// Files that name the host outside operator.ts: crawlers and link previews
// need absolute URLs, and the privacy notice and imprint describe the
// instance by name — a self-hoster is the controller of a different one.
const HOST_FILES = [
  "apps/web/index.html",
  "apps/web/public/robots.txt",
  "apps/web/public/sitemap.xml",
  "apps/web/src/content/imprint.en.tsx",
  "apps/web/src/content/imprint.de.tsx",
  "apps/web/src/content/privacy.en.tsx",
  "apps/web/src/content/privacy.de.tsx",
];

// retrobeam.de's own values. Only compared against, never rendered.
const UPSTREAM_HOST = "retrobeam.de";
const UPSTREAM = {
  "OPERATOR.name": "Sebastian Grundhöfer",
  "OPERATOR.street": "Stettiner Str. 41",
  "OPERATOR.email": "info@sebaro-ventures.de",
  REPO_URL: "https://github.com/grundhofer/retrobeam",
  WORKERS_DEV_HOST: "retrobeam.sebastiangrundhoefer.workers.dev",
};

const problems = [];
const source = await read(OPERATOR_FILE);

const placeholders = [...source.matchAll(/"(\[[^"\n]+\])"/g)].map(
  ([, value]) => value,
);
if (placeholders.length > 0) {
  problems.push(
    `replace the legal placeholders in ${OPERATOR_FILE} (${placeholders.join(", ")}).`,
  );
}

// `\s*` after the colon or `=`: prettier moves a value longer than the line
// onto the next one. A bare identifier (`INSTANCE_HOST = WORKERS_DEV_HOST`,
// as the README suggests for workers.dev) resolves to that constant's value.
function constant(name, seen = new Set()) {
  const match = source.match(
    new RegExp(`export const ${name}(?:: \\w+)?\\s*=\\s*(?:"([^"]*)"|(\\w+);)`),
  );
  if (!match) return undefined;
  if (match[1] !== undefined) return match[1];
  return seen.has(name) ? undefined : constant(match[2], seen.add(name));
}
const field = (name) =>
  source.match(new RegExp(`^\\s+${name}:\\s*"([^"]*)",$`, "m"))?.[1];
const current = {
  "OPERATOR.name": field("name"),
  "OPERATOR.street": field("street"),
  "OPERATOR.email": field("email"),
  REPO_URL: constant("REPO_URL"),
  WORKERS_DEV_HOST: constant("WORKERS_DEV_HOST"),
};
const instanceHost = constant("INSTANCE_HOST");

// JSONC → JSON: drop comments outside strings, then trailing commas. Strings
// are walked character by character so an escaped backslash before the
// closing quote ("C:\\") ends the string, and anything left open throws
// instead of restarting the scan from the top.
function parseJsonc(text) {
  const unterminated = (what) =>
    new Error(`${WRANGLER_FILE}: unterminated ${what}.`);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      let close = i + 1;
      while (close < text.length && text[close] !== '"') {
        close += text[close] === "\\" ? 2 : 1;
      }
      if (close >= text.length) throw unterminated("string");
      out += text.slice(i, close + 1);
      i = close;
    } else if (char === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      if (end < 0) break;
      i = end - 1;
    } else if (char === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw unterminated("block comment");
      i = end + 1;
    } else {
      out += char;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

// Top-level routes only: env.preview deliberately has none and deploys to
// its own workers.dev alias.
const routes = parseJsonc(await read(WRANGLER_FILE)).routes ?? [];
const routeHosts = routes.map(
  (route) => (typeof route === "string" ? route : route.pattern).split("/")[0],
);
const deployHost = routeHosts.length > 0 ? routeHosts : ["workers.dev only"];

// The route alone does not tell a clone apart: one that keeps the
// retrobeam.de route passes the host checks above, and wrangler uploads the
// Worker and switches on its workers.dev origin BEFORE the custom domain fails
// on a zone that is not theirs — so retrobeam.de's imprint would be live. The
// repository being deployed is the second signal: GITHUB_REPOSITORY in
// Actions, the `origin` remote for the local deploy script. Unknown (no git,
// no remote) falls back to the host checks alone. A fresh `git clone` of
// upstream deployed unchanged still passes — it looks exactly like
// retrobeam.de's own checkout, which is why the README says to fork first.
function repoSlug(url) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^[a-z+]+:\/\//, "") // https://, ssh://, git+ssh://
    .replace(/^[^@/]+@/, "") // git@
    .replace(/^([^/:]+):(?:\d+\/)?/, "$1/") // scp form host:owner, or a port
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}
function deployingRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
    return repoSlug(`${server}/${process.env.GITHUB_REPOSITORY}`);
  }
  try {
    const origin = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return origin.trim() ? repoSlug(origin) : undefined;
  } catch {
    return undefined;
  }
}
const deployRepo = deployingRepository();

if (!instanceHost) {
  problems.push(`${OPERATOR_FILE} must export INSTANCE_HOST.`);
} else {
  if (
    routeHosts.length > 0
      ? !routeHosts.includes(instanceHost)
      : instanceHost !== current.WORKERS_DEV_HOST
  ) {
    problems.push(
      `${WRANGLER_FILE} deploys to ${deployHost.join(", ")}, but ${OPERATOR_FILE} describes the instance at ${instanceHost}.`,
    );
  }
  const isOtherRepo =
    deployRepo !== undefined && deployRepo !== repoSlug(UPSTREAM.REPO_URL);
  const isUpstream =
    instanceHost === UPSTREAM_HOST &&
    routeHosts.includes(UPSTREAM_HOST) &&
    !isOtherRepo;
  if (isOtherRepo && routeHosts.includes(UPSTREAM_HOST)) {
    problems.push(
      `${WRANGLER_FILE} routes ${UPSTREAM_HOST}, but this is ${deployRepo}, not retrobeam.de's repository — route your own domain, or [] for workers.dev only.`,
    );
  }
  if (!isUpstream) {
    const leftovers = Object.entries(UPSTREAM)
      .filter(([key, value]) => current[key] === value)
      .map(([key]) => key);
    if (leftovers.length > 0) {
      problems.push(
        `${OPERATOR_FILE} still carries retrobeam.de's ${leftovers.join(", ")}. Your imprint must name you, and REPO_URL must point at the source of the build you run (AGPL §13).`,
      );
    }
    for (const path of HOST_FILES) {
      if ((await read(path)).includes(UPSTREAM_HOST)) {
        problems.push(
          `${path} still names ${UPSTREAM_HOST} — describe your own instance.`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(
    [
      "Deployment blocked by the legal-notice check:",
      ...problems.map((problem) => `  - ${problem}`),
      "Self-hosting? README.md → Self-hosting lists every file to change: " +
        "operator.ts (OPERATOR, REPO_URL, WORKERS_DEV_HOST, INSTANCE_HOST), " +
        "wrangler.jsonc routes, index.html og:image, public/robots.txt, public/sitemap.xml, " +
        "the imprint and privacy notice in apps/web/src/content/.",
    ].join("\n"),
  );
  process.exitCode = 1;
}
