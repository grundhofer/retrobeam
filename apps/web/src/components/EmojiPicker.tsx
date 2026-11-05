// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon.js";
import { Sheet } from "./Sheet.js";

// A compact, dependency-free emoji picker (native Unicode — zero bytes, zero
// third-party requests, GDPR-safe). A curated set covers the common retro
// reactions; the full emoji-picker-element (thousands + search) is a deferred
// nicety, not needed since notes accept typed native emoji directly.
const EMOJI_SET = [
  "👍",
  "👎",
  "❤️",
  "🎉",
  "😂",
  "😮",
  "😢",
  "😡",
  "👀",
  "🙌",
  "🔥",
  "🚀",
  "✅",
  "❌",
  "💡",
  "⚠️",
  "🤔",
  "🙏",
  "💪",
  "👏",
  "😅",
  "🥳",
  "😴",
  "🤯",
  "💯",
  "⭐",
  "🌟",
  "🐛",
  "🧹",
  "📈",
  "📉",
  "🎯",
];

// The emoji key and its picker in sebaro's bottom sheet (plan stage 5g, F24:
// the emoji are the participants' content, so they stay).
export function EmojiPickerButton({
  label,
  onPick,
}: {
  label: string;
  onPick: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        data-testid="emoji-open"
        onClick={() => setOpen(true)}
        className="sb-secondary-action sb-secondary-action--compact"
      >
        <Icon name="emoji" size={20} />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("emoji.title")}
        testId="emoji-sheet"
        returnTo={buttonRef}
      >
        <EmojiPicker
          onPick={(emoji) => {
            onPick(emoji);
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div
      data-testid="emoji-picker"
      className="grid grid-cols-8 gap-(--sb-space-1)"
    >
      {EMOJI_SET.map((emoji, index) => (
        <button
          key={emoji}
          type="button"
          // The sheet starts on the first emoji (Sheet.tsx).
          data-autofocus={index === 0 ? true : undefined}
          data-testid={`emoji-${emoji}`}
          onClick={() => onPick(emoji)}
          className="flex min-h-(--sb-size-target-touch) items-center justify-center rounded-(--sb-radius-control) text-xl hover:bg-(--sb-color-hover-fill)"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
