// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

// An empty field does not grey its form's button out (sebaro STA-03): the
// press sends nothing, says at the field what is missing and puts the cursor
// there. The create, join and action item forms share this.
//
// Moving the focus is what makes a screen reader read the message, along with
// the label, through aria-describedby. When the field already has the focus —
// Enter pressed in it, the usual way to send these forms — no focus event
// fires and a description that appears later is not read. `spoken` is then
// set, for a live region to say the message. It stays off when the focus does
// move, or the message would be read twice.
export function useMissingField() {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  const [state, setState] = useState<"none" | "shown" | "spoken">("none");
  const missing = state !== "none";
  const messageId = `${id}-missing`;

  function report() {
    const stays = document.activeElement === ref.current;
    // Rendered before the focus moves, so the description is there when the
    // field is read.
    flushSync(() => setState(stays ? "spoken" : "shown"));
    ref.current?.focus();
  }

  // Spaces alone do not count as typed: the field is still empty.
  function typed(value: string) {
    if (value.trim() !== "") setState("none");
  }

  return {
    missing,
    spoken: state === "spoken",
    messageId,
    report,
    typed,
    fieldProps: {
      ref,
      id,
      "aria-invalid": missing || undefined,
      "aria-describedby": missing ? messageId : undefined,
    },
  };
}
