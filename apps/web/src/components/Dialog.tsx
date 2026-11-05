// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

// sebaro's dialog (spec/02 §4.6) as a modal <dialog>: the title, the body, and
// the keys at the end. Escape closes it and the focus goes back to what opened
// it — the opener is remembered and focused again, as WebKit does not do it
// for a modal by itself; WebKit does not focus a button on a click either, so
// a trigger passes itself as `returnTo`. Open and closed by the `open` prop; every way of closing —
// Escape included — goes through `onClose`.
//
// m-auto: Tailwind's preflight zeroes every margin, also the browser's
// margin: auto that centres a modal <dialog> (sebaroDesign set it back in
// 90522a0; until that export the class does it).
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  testId,
  returnTo,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  testId?: string;
  returnTo?: RefObject<HTMLElement | null> | undefined;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  // Mounted only while open: a page can hold the same dialog twice (the
  // lobby's and the header's invite) without both standing in it. Opening
  // remembers where to come back to and shows it as a modal; closing unmounts
  // it and hands the focus back, unless the focus has already moved on.
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const back =
      returnTo?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (!dialog.open) dialog.showModal();
    return () => {
      const active = document.activeElement;
      if (
        back?.isConnected &&
        (active === null ||
          active === document.body ||
          !active.isConnected ||
          dialog.contains(active))
      )
        back.focus();
    };
  }, [open, returnTo]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      data-testid={testId}
      className="sb-dialog m-auto"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
    >
      <p className="sb-dialog__title" id={`${id}-title`}>
        {title}
      </p>
      {children}
      <div className="sb-dialog__actions">{actions}</div>
    </dialog>
  );
}
