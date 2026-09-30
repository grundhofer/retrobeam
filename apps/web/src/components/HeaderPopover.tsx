// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

// A board-header popover: the ⋯ menu and the invite panel. From `sm` up it is
// the dropdown it always was; below `sm` it becomes a sheet pinned to the
// bottom of the screen, full width less a margin and scrollable — a 256px
// panel hung off a button that sits near the LEFT edge of a phone started at
// x=-48, and the export options it cut off could not be scrolled back into
// view.
//
// Closing follows the header's existing popovers (AvatarRow, the old menu):
// focus leaving the whole thing closes it. On top of that, Escape and the
// sheet's × close it and hand focus back to the trigger, and a tap on the dim
// backdrop closes it on a phone.
export function HeaderPopover({
  open,
  onOpenChange,
  title,
  trigger,
  triggerTestId,
  triggerClassName,
  triggerAriaLabel,
  panelTestId,
  panelWidth,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the panel; also its visible heading on the phone sheet. */
  title: string;
  trigger: ReactNode;
  triggerTestId: string;
  triggerClassName: string;
  triggerAriaLabel?: string;
  panelTestId: string;
  /** Dropdown width in px from `sm` up, as a Tailwind class and its value. */
  panelWidth: { className: string; px: number };
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Which edge of the trigger the dropdown hangs from. The header wraps, and
  // on a tablet — even at 1280px with a long agenda — the trigger lands at the
  // START of its own row, where a right-aligned panel runs off the left edge
  // just as it did on the phone. Decided once, at opening, like GifPicker's
  // clamp: nothing moves the trigger while the panel is open.
  const [align, setAlign] = useState<"left" | "right">("right");

  function toggle() {
    if (open) {
      onOpenChange(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAlign(rect.right - panelWidth.px >= 8 ? "right" : "left");
    onOpenChange(true);
  }

  function closeAndRefocus() {
    onOpenChange(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    // On the window, not the wrapper: WebKit does not focus a button on
    // click, so after a tap on the trigger focus is not inside the wrapper at
    // all. A layer above (the full-screen QR code) claims its Escape with
    // preventDefault.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      onOpenChange(false);
      triggerRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (event.currentTarget.contains(next)) return;
        // A layer portaled out of the panel (the full-screen QR code) is
        // outside this DOM subtree but inside it in React's tree, so its focus
        // events bubble here too. Focus moving into such a layer is not focus
        // leaving; neither is focus moving within or out of one — it is
        // modal, has its own close, and has to outlive the presenter
        // switching windows to the video call.
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (next instanceof Element && next.closest("[data-popover-layer]")) {
          return;
        }
        onOpenChange(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        data-testid={triggerTestId}
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <>
          {/* Phone only. Inside the wrapper on purpose: pressing it keeps
              focus in the subtree, so the blur rule above does not race the
              click. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("menu.close")}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-50 cursor-default bg-zinc-900/30 sm:hidden"
          />
          <div
            id={panelId}
            role="dialog"
            aria-label={title}
            data-testid={panelTestId}
            // Focusable so that a press on the panel's own text or padding
            // keeps focus inside — before, it went to <body> and the blur
            // rule shut the menu under the pointer.
            tabIndex={-1}
            // z-45 from `sm` up: at z-40 the canvas zoom control, later in
            // the page, was drawn over the dropdown and covered the share
            // link. Not z-50 — the wheel and the card picker are z-50 and
            // earlier in the page, and a dropdown left open must not sit on
            // top of the spin.
            className={`fixed inset-x-4 bottom-4 z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-lg focus:outline-none sm:absolute sm:inset-x-auto sm:top-9 sm:bottom-auto sm:z-45 sm:max-h-none sm:overflow-visible ${panelWidth.className} ${
              align === "right" ? "sm:right-0" : "sm:left-0"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-3 sm:hidden">
              <h2 className="font-semibold text-zinc-900">{title}</h2>
              <button
                type="button"
                data-testid={`${panelTestId}-close`}
                aria-label={t("menu.close")}
                onClick={closeAndRefocus}
                className="rounded-full px-2.5 py-0.5 text-xl text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-3">{children}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
