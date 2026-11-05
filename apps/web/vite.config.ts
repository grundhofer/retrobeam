// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// sebaro's classic scripts have to run before the first paint, outside the
// module graph, so index.html loads them as plain <script src> tags (sebaro
// spec/09 §1): theme-init.js ahead of every stylesheet, sb-start.js right
// after it, sb-fit.js deferred. Vite bundles only module scripts and leaves
// these tags alone, so each file has to reach /sebaro/js/<name> by itself:
// served from the export in `vite dev`, written into the build byte for byte
// (plan §2.4 F39, as novalis does). The fonts' licence texts travel the same
// way to /fonts/, because Vite ships no src/ file that nothing imports and the
// OFL wants its text beside the fonts. The start tile in index.html is the
// export's own SVG, put where its <!-- sb:inline src="…" --> comment stands
// (sebaro spec/03 §4.6). The export folder is never edited here (G6).
const SEBARO_DIR = new URL("./src/sebaro/", import.meta.url);
const SEBARO_FILES: Record<string, string> = {
  "sebaro/js/theme-init.js": "js/theme-init.js",
  "sebaro/js/sb-start.js": "js/sb-start.js",
  "sebaro/js/sb-fit.js": "js/sb-fit.js",
  "sebaro/js/sb-board.js": "js/sb-board.js",
  "fonts/sebaro-sans-OFL.txt": "fonts/web/sebaro-sans-OFL.txt",
  "fonts/sebaro-mono-OFL.txt": "fonts/web/sebaro-mono-OFL.txt",
};
const INLINED = ["brand/inline/tile-retrobeam.svg"];
const SB_INLINE = /<!-- sb:inline src="([\w./-]+)" -->/g;

const sebaroPath = (path: string) =>
  decodeURIComponent(new URL(path, SEBARO_DIR).pathname);
const contentType = (path: string) =>
  path.endsWith(".js")
    ? "text/javascript; charset=utf-8"
    : "text/plain; charset=utf-8";

// Read once when the build or the dev server starts (no node types in this
// tsconfig, so through the plugin context's fs); a new export means a
// restart anyway.
const files = new Map<string, Uint8Array>();
const sebaro: Plugin = {
  name: "retrobeam:sebaro",
  async buildStart() {
    for (const path of [...Object.values(SEBARO_FILES), ...INLINED]) {
      files.set(path, await this.fs.readFile(sebaroPath(path)));
    }
  },
  transformIndexHtml(html) {
    return html.replace(SB_INLINE, (comment, path: string) => {
      const file = files.get(path);
      if (!file)
        throw new Error(`retrobeam:sebaro: ${path} not read (${comment})`);
      return new TextDecoder().decode(file);
    });
  },
  configureServer(server) {
    for (const [served, source] of Object.entries(SEBARO_FILES)) {
      server.middlewares.use(`/${served}`, (_request, response) => {
        response.setHeader("Content-Type", contentType(served));
        response.end(files.get(source));
      });
    }
  },
  generateBundle() {
    for (const [served, source] of Object.entries(SEBARO_FILES)) {
      this.emitFile({
        type: "asset",
        fileName: served,
        source: files.get(source)!,
      });
    }
  },
};

// One `vite dev` runs the SPA, the Worker, and the BoardRoom DO in real
// workerd. The worker package owns the wrangler config.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sebaro,
    cloudflare({ configPath: "../worker/wrangler.jsonc" }),
  ],
});
