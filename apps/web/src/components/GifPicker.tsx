// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useConnection } from "../lib/connection.js";
import { searchGifs, type GifResult } from "../lib/gifs.js";

// The "GIF" button with its picker as a popover. The popover is portaled to
// <body> with fixed coordinates so it escapes the columns' horizontal-scroll
// container (which clips absolute children and made the picker overflow onto
// neighbouring columns) and the canvas's scaled world (a transform turns
// `position: fixed` into "fixed to the transformed box"). Anchored above the
// button, clamped to the viewport.
export function GifPickerButton({
  testId,
  onPick,
  onOpenChange,
}: {
  testId: string;
  onPick: (url: string) => void;
  /** called BEFORE the picker takes focus and before it gives it back, for a
   *  host that commits on blur (the canvas composer) */
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  function close() {
    onOpenChange?.(false);
    setOpen(false);
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 288; // GifPicker is w-72
      const height = 330; // w-72 search row + max-h-64 grid + attribution
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - width - 8),
      );
      // Above the button by default — but the composer now sits directly under
      // the column header, and a `position: fixed` picker that grows past the
      // top of the viewport is unreachable (nothing can scroll a fixed
      // element back into view). When there is no room above, flip below.
      setAnchor(
        rect.top >= height + 8
          ? { left, bottom: window.innerHeight - rect.top + 6 }
          : { left, top: rect.bottom + 6 },
      );
    }
    onOpenChange?.(true);
    setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        onClick={toggle}
        className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
      >
        🎞 {t("gif.add")}
      </button>
      {open && anchor
        ? createPortal(
            // A portal leaves the DOM tree but not React's: without these, a
            // press inside the picker bubbles to whatever holds the button —
            // on the canvas that starts a card drag or a pan, and a
            // double-click opens a new note behind the picker.
            <div
              className="fixed inset-0 z-50"
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label={t("note.cancel")}
                tabIndex={-1}
                onClick={close}
                className="absolute inset-0 cursor-default"
              />
              <div
                className="absolute"
                style={{
                  left: anchor.left,
                  top: anchor.top,
                  bottom: anchor.bottom,
                }}
              >
                <GifPicker
                  onPick={(url) => {
                    onPick(url);
                    close();
                  }}
                  onClose={close}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// Search runs through our Worker proxy (key server-side, employee IPs hidden).
// When no KLIPY key is configured the proxy returns empty + configured:false,
// and we show a friendly "unavailable" note instead of breaking.
export function GifPicker({
  onPick,
  onClose,
}: {
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [state, setState] = useState<
    | "idle"
    | "loading"
    | "empty"
    | "unavailable"
    | "failed"
    | "throttled"
    | "quota"
  >("idle");
  const { boardId } = useConnection();
  const locale = i18n.language.startsWith("de") ? "de" : "en";
  const reqId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    const id = ++reqId.current;
    // An in-flight search is aborted when the term changes, so a slow earlier
    // response cannot land on top of a newer one, and the request itself stops
    // rather than merely being ignored.
    const controller = new AbortController();
    // All state updates happen inside the (async) timeout callback, never
    // synchronously in the effect body.
    const timeout = setTimeout(
      () => {
        if (id !== reqId.current) return;
        if (term === "") {
          setResults([]);
          setState("idle");
          return;
        }
        setState("loading");
        searchGifs(boardId, term, locale, controller.signal).then(
          (res) => {
            if (id !== reqId.current) return; // superseded by a newer search
            if (res.quotaExceeded) setState("quota");
            else if (res.throttled) setState("throttled");
            else if (res.failed) setState("failed");
            else if (!res.configured) setState("unavailable");
            else if (res.gifs.length === 0) setState("empty");
            else setState("idle");
            setResults(res.failed ? [] : res.gifs);
          },
          () => {
            // Aborted, or a rejection nothing else caught: the picker must
            // never be left spinning on "Searching…".
            if (id === reqId.current) setState("failed");
          },
        );
      },
      term === "" ? 0 : 350,
    );
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [boardId, query, locale]);

  return (
    <div className="w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          data-testid="gif-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("gif.search")}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("note.cancel")}
          className="rounded px-1 text-sm text-zinc-400 hover:bg-zinc-100"
        >
          ✕
        </button>
      </div>
      {state === "quota" ? (
        <p
          data-testid="gif-quota"
          className="px-1 py-4 text-center text-xs text-zinc-500"
        >
          {t("gif.quota")}
        </p>
      ) : state === "throttled" ? (
        <p
          data-testid="gif-throttled"
          className="px-1 py-4 text-center text-xs text-zinc-400"
        >
          {t("gif.throttled")}
        </p>
      ) : state === "failed" ? (
        <p
          data-testid="gif-failed"
          className="px-1 py-4 text-center text-xs text-zinc-400"
        >
          {t("gif.failed")}
        </p>
      ) : state === "unavailable" ? (
        <p className="px-1 py-4 text-center text-xs text-zinc-400">
          {t("gif.unavailable")}
        </p>
      ) : state === "loading" ? (
        <p className="px-1 py-4 text-center text-xs text-zinc-400">
          {t("gif.loading")}
        </p>
      ) : state === "empty" ? (
        <p className="px-1 py-4 text-center text-xs text-zinc-400">
          {t("gif.none")}
        </p>
      ) : results.length === 0 ? (
        <p className="px-1 py-4 text-center text-xs text-zinc-400">
          {t("gif.hint")}
        </p>
      ) : (
        <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
          {results.map((gif) => (
            <button
              key={gif.id}
              type="button"
              data-testid="gif-result"
              onClick={() => onPick(gif.url)}
              className="overflow-hidden rounded-lg border border-zinc-100 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <img
                src={gif.previewUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-24 w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 px-1 text-right text-[10px] text-zinc-300">
        {t("gif.poweredBy")}
      </p>
    </div>
  );
}
