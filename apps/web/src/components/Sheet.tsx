// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon.js";

// sebaro's bottom sheet for pickers (spec/02 §4.7) as a modal <dialog>: a
// head with the title and „Schließen“, the content under it in a
// <form method="dialog">, so Escape and „Schließen“ close it without script.
// sb-sheet.js (index.html) adds the scrim press and the Tab trap for every
// open sheet. Mounted only while open, like Dialog: opening remembers where
// the focus was and shows it as a modal; closing unmounts it and hands the
// focus back (WebKit does not), unless the focus has already moved on — a
// host that takes it back itself (the canvas composer) keeps it. Every way
// of closing goes through `onClose`.
//
// The modal sits in the top layer, so neither the columns' clipping nor the
// canvas's scaled world reaches it — no portal and no anchoring. React's
// tree still holds it, though: a press inside would bubble to whatever holds
// the opener (a card drag, a pan, a double-click that opens a new note), so
// the dialog stops those.
export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
  returnTo,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testId?: string;
  returnTo?: RefObject<HTMLElement | null> | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const sheet = ref.current;
    if (!open || !sheet) return;
    const back =
      returnTo?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (!sheet.open) sheet.showModal();
    // The control that should start with the focus (sebaro: the checked
    // radio, else the first control of the content). React's autoFocus does
    // not do it here: it focuses before showModal(), which then moves the
    // focus to the first control of the sheet — „Schließen“.
    sheet.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      const active = document.activeElement;
      if (
        back?.isConnected &&
        (active === null ||
          active === document.body ||
          !active.isConnected ||
          sheet.contains(active))
      )
        back.focus();
    };
  }, [open, returnTo]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      data-testid={testId}
      className="sb-sheet"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <form method="dialog">
        <div className="sb-sheet__head">
          <h2 className="sb-sheet__title" id={`${id}-title`}>
            {title}
          </h2>
          <button
            className="sb-icon-button"
            aria-label={t("sheet.close")}
            value="close"
            data-testid={testId ? `${testId}-close` : undefined}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </form>
    </dialog>
  );
}
