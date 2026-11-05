// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, type ReactNode } from "react";

// sebaro's dialog (spec/02 §4.6) as a modal <dialog>: the title, the body, and
// the keys at the end. Escape closes it and the browser hands focus back to
// what opened it. Open and closed by the `open` prop; every way of closing —
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  testId?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
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
