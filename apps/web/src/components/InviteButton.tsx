// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HeaderPopover } from "./HeaderPopover.js";
import { ShareLink } from "./ShareLink.js";

// "Invite" in the board header, for everyone and in every phase but the last.
// The server lets latecomers in at any point, yet the lobby card was the only
// place the link was ever shown — once the retro had started, someone who
// arrived late could only be let in by a person who knew to copy the address
// bar. Only ever the TEAM link: the facilitator link lives in the ⋯ menu,
// behind its own mask, for the one person who holds it.
export function InviteButton({ boardId }: { boardId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <HeaderPopover
      open={open}
      onOpenChange={setOpen}
      title={t("invite.title")}
      trigger={t("invite.button")}
      triggerTestId="invite-button"
      triggerClassName="rounded-lg border border-zinc-200 px-2.5 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-accent"
      panelTestId="invite-panel"
      panelWidth={{ className: "sm:w-80", px: 320 }}
    >
      <p className="text-zinc-600">{t("invite.hint")}</p>
      <ShareLink boardId={boardId} />
    </HeaderPopover>
  );
}
