// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Fragment, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { teamLinkUrl } from "../lib/adminLink.js";
import { Dialog } from "./Dialog.js";
import { Icon } from "./Icon.js";
import { QrCode } from "./QrCode.js";

// sebaro's invite dialog (spec/02 §4.6, RB-6): a modal that shows rather than
// asks — the sentence, the code, the link as a sentence, „Link kopieren“ and
// „Schließen“ last; no primary action. The code is dark on light in both
// modes (data-theme="light" on its frame), because scanners read inverted
// codes badly. The link is text that wraps after every „.“ and „/“, so
// nothing is cut at large text. „Link kopieren“ shows its own result
// („Kopiert“ for 2 s, no toast) and a hidden status region in the dialog says
// it, in case the focus has moved on before the clipboard answered.
export function InviteDialog({
  boardId,
  open,
  onClose,
  returnTo,
}: {
  boardId: string;
  open: boolean;
  onClose: () => void;
  returnTo?: RefObject<HTMLElement | null> | undefined;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = teamLinkUrl(location.origin, boardId);
  const shown = url.replace(/^https?:\/\//, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-secure origin): the link stands in the
      // dialog as text to copy by hand.
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("invite.title")}
      testId="invite-panel"
      returnTo={returnTo}
      actions={
        <>
          <button
            type="button"
            data-testid="invite-copy"
            onClick={() => void copy()}
            className="sb-secondary-action"
          >
            <Icon name="copy" size={20} />
            {copied ? t("board.copied") : t("invite.copyLink")}
          </button>
          <button
            type="button"
            data-testid="invite-panel-close"
            onClick={onClose}
            className="sb-secondary-action"
          >
            {t("invite.close")}
          </button>
        </>
      }
    >
      {open ? (
        <>
          <p className="sb-dialog__text">{t("invite.hint")}</p>
          <span className="sb-dialog__qr" data-theme="light">
            <QrCode value={url} label={t("invite.qrLabel")} />
          </span>
          <p className="sb-dialog__text" data-testid="share-link-text">
            {t("invite.linkSentence")}{" "}
            <code className="sb-file-name">
              {shown.split(/(?<=[./])/).map((part, index) => (
                <Fragment key={index}>
                  {index > 0 ? <wbr /> : null}
                  {part}
                </Fragment>
              ))}
            </code>
          </p>
          <p role="status" className="sb-visually-hidden">
            {copied ? t("board.copied") : ""}
          </p>
        </>
      ) : null}
    </Dialog>
  );
}
