// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon.js";
import { InviteDialog } from "./InviteDialog.js";

// "Invite" in the board header, for everyone and in every phase but the last.
// The server lets latecomers in at any point, yet the lobby card was the only
// place the link was ever shown — once the retro had started, someone who
// arrived late could only be let in by a person who knew to copy the address
// bar. Only ever the TEAM link: the facilitator link lives in the ⋯ menu,
// behind its own mask, for the one person who holds it.
//
// sebaro's invite dialog (spec/02 §4.6, RB-6) behind an sb-secondary-action
// with the qr-code icon, the icon belonging to the trigger, not the dialog.
export function InviteButton({ boardId }: { boardId: string }) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        data-testid="invite-button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="sb-secondary-action sb-secondary-action--compact"
      >
        <Icon name="qr-code" size={20} />
        {t("invite.button")}
      </button>
      <InviteDialog
        boardId={boardId}
        open={open}
        onClose={() => setOpen(false)}
        returnTo={triggerRef}
      />
    </>
  );
}
