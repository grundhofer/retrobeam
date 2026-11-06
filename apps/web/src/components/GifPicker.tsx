// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useConnection } from "../lib/connection.js";
import { searchGifs, type GifResult } from "../lib/gifs.js";
import { Icon } from "./Icon.js";
import { Sheet } from "./Sheet.js";

// The „GIF“ key and its picker in sebaro's bottom sheet (plan stage 5g).
export function GifPickerButton({
  testId,
  onPick,
  onOpenChange,
}: {
  testId: string;
  onPick: (url: string) => void;
  /** called BEFORE the picker takes focus, and once it is gone again, for a
   *  host that commits on blur (the canvas composer). Gone first: while the
   *  modal sheet is open the page behind it is inert, and a focus() there
   *  does nothing. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    flushSync(() => setOpen(false));
    onOpenChange?.(false);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        onClick={() => {
          onOpenChange?.(true);
          setOpen(true);
        }}
        className="sb-secondary-action sb-secondary-action--compact"
      >
        <Icon name="gif" size={20} />
        {t("gif.add")}
      </button>
      <Sheet
        open={open}
        onClose={close}
        title={t("gif.title")}
        testId="gif-sheet"
        returnTo={buttonRef}
      >
        <GifPicker
          onPick={(url) => {
            onPick(url);
            close();
          }}
        />
      </Sheet>
    </>
  );
}

// Search runs through our Worker proxy (key server-side, employee IPs hidden).
// When no KLIPY key is configured the proxy returns empty + configured:false,
// and we show a friendly "unavailable" note instead of breaking.
export function GifPicker({ onPick }: { onPick: (url: string) => void }) {
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
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

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

  const message =
    state === "quota"
      ? { testId: "gif-quota", text: t("gif.quota") }
      : state === "throttled"
        ? { testId: "gif-throttled", text: t("gif.throttled") }
        : state === "failed"
          ? { testId: "gif-failed", text: t("gif.failed") }
          : state === "unavailable"
            ? { testId: undefined, text: t("gif.unavailable") }
            : state === "loading"
              ? { testId: undefined, text: t("gif.loading") }
              : state === "empty"
                ? { testId: undefined, text: t("gif.none") }
                : results.length === 0
                  ? { testId: undefined, text: t("gif.hint") }
                  : null;

  return (
    <div className="sb-stack">
      <div className="sb-field">
        <label htmlFor={searchId} className="sb-visually-hidden">
          {t("gif.search")}
        </label>
        <div className="sb-field__control sb-search">
          <Icon name="search" />
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            data-autofocus
            value={query}
            data-testid="gif-search"
            aria-describedby={`${searchId}-path`}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter would submit the sheet's form, which closes it.
              if (event.key === "Enter") event.preventDefault();
              // Escape empties a filled field and the focus stays (sebaro's
              // search); on an empty one it closes the sheet.
              if (event.key === "Escape" && query !== "") {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder={t("gif.search")}
          />
          <button
            type="button"
            className="sb-icon-button"
            aria-label={t("gif.clear")}
            hidden={query === ""}
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        {/* BEL-10: the data path of the search, from the privacy notice §5. */}
        <p id={`${searchId}-path`} className="sb-action-hint">
          {t("gif.dataPath")}
        </p>
      </div>
      {message !== null ? (
        <p data-testid={message.testId} role="status" className="sb-card__meta">
          {message.text}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {results.map((gif) => (
            <button
              key={gif.id}
              type="button"
              data-testid="gif-result"
              onClick={() => onPick(gif.url)}
              className="overflow-hidden rounded-control border border-border hover:border-(--sb-color-accent)"
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
      <p className="sb-card__meta text-end">{t("gif.poweredBy")}</p>
    </div>
  );
}
