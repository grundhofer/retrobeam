// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId } from "react";
import { Icon } from "./Icon.js";

// sebaro's switch row (spec/02 §2.6): the label, then the switch at the end;
// with a help sentence (NV-Z11) the row and the sentence form one
// sb-switch-field, the sentence linked by aria-describedby. A disabled switch
// keeps its row and says why in that sentence, never by vanishing.
export function SwitchField({
  label,
  checked,
  onChange,
  disabled = false,
  help,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  help?: string | null | undefined;
  testId?: string;
}) {
  const id = useId();
  const row = (
    <div className="sb-switch-row">
      <span id={`${id}-label`}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={help ? `${id}-help` : undefined}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className="sb-switch"
      >
        <span className="sb-switch__track" />
        <span className="sb-switch__thumb">
          <Icon name="check" size={16} />
        </span>
      </button>
    </div>
  );
  if (!help) return row;
  return (
    <div className="sb-switch-field">
      {row}
      <p className="sb-field__help" id={`${id}-help`}>
        {help}
      </p>
    </div>
  );
}
