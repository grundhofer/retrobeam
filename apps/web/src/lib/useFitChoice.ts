// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef } from "react";

// sebaro's sb-fit.js turns a segmented control into a select at large text
// (D100 (3)); a choice there checks the radio and fires input and change on
// it. React hears a radio change only through a click, so without this the
// form would keep the old value while the page shows the new one. The
// fieldset listens for the native change itself (plan §2.4 F38; reported to
// sebaroDesign). Pass a stable callback, such as a state setter.
export function useFitChoice<T extends string>(onValue: (value: T) => void) {
  const ref = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const fieldset = ref.current;
    if (!fieldset) return;
    function changed(event: Event) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "radio") {
        onValue(target.value as T);
      }
    }
    fieldset.addEventListener("change", changed);
    return () => fieldset.removeEventListener("change", changed);
  }, [onValue]);
  return ref;
}
