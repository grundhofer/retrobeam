// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  generateHexId,
  KUDO_CARD_TYPES,
  KUDO_EVERYONE,
  type Kudo,
  type KudoCardType,
  type Participant,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { Dialog } from "./Dialog.js";
import { EmojiPicker } from "./EmojiPicker.js";
import { GifPicker } from "./GifPicker.js";
import { Icon } from "./Icon.js";

// sebaro (plan stage 5d): a kind of kudo is an icon and its word, never a
// colour of its own.
const CARD_ICON: Record<KudoCardType, string> = {
  "thank-you": "heart",
  "great-job": "thumbs-up",
  "well-done": "star",
  congratulations: "success",
  "totally-awesome": "flash",
};

export interface KudosWallProps {
  kudos: Kudo[];
  roster: Participant[];
  you: Participant;
  isAdmin: boolean;
  gifsEnabled: boolean;
  readOnly: boolean;
}

// The appreciation wall — the retro's closing finale: end on positives.
export function KudosWall({
  kudos,
  roster,
  you,
  isAdmin,
  gifsEnabled,
  readOnly,
}: KudosWallProps) {
  const { t } = useTranslation();
  const byId = new Map(roster.map((p) => [p.id, p]));

  return (
    <div className="sb-stack sb-stack--group mx-auto max-w-4xl">
      <section aria-labelledby="kudos-title" className="sb-stack">
        <h2 id="kudos-title" className="sb-section__title">
          {t("kudos.title")}
        </h2>
        <p className="sb-page-lead__text">{t("kudos.subtitle")}</p>
      </section>

      {!readOnly ? (
        <KudoComposer roster={roster} you={you} gifsEnabled={gifsEnabled} />
      ) : null}

      {kudos.length === 0 ? (
        <p className="sb-field__help">{t("kudos.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-(--sb-space-3) sm:grid-cols-2 lg:grid-cols-3">
          {kudos.map((kudo) => {
            const to = byId.get(kudo.toId);
            const from = kudo.fromId === null ? null : byId.get(kudo.fromId);
            const canRemove = !readOnly && (kudo.fromId === you.id || isAdmin);
            return (
              <li
                key={kudo.id}
                data-testid="kudo-card"
                className="reveal-in sb-card sb-card--item sb-stack"
              >
                <div className="flex items-center justify-between gap-(--sb-space-2)">
                  <span className="sb-card__meta flex items-center gap-(--sb-space-1)">
                    <Icon name={CARD_ICON[kudo.cardType]} size={20} />
                    {t(`kudos.card.${kudo.cardType}`)}
                  </span>
                  {canRemove ? <RemoveButton kudoId={kudo.id} /> : null}
                </div>
                <p className="sb-card__title">
                  {t("kudos.toName", {
                    name:
                      kudo.toId === KUDO_EVERYONE
                        ? t("kudos.everyone")
                        : (to?.name ?? t("kudos.someone")),
                  })}
                </p>
                {kudo.text.trim() !== "" ? (
                  <p className="whitespace-pre-wrap">{kudo.text}</p>
                ) : null}
                {kudo.gifUrl !== null ? (
                  <img
                    src={kudo.gifUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="max-h-40 w-full object-contain"
                  />
                ) : null}
                <p className="sb-card__meta">
                  {from
                    ? t("kudos.from", { name: from.name })
                    : t("kudos.anonymous")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Removing a kudo asks first, in sebaro's confirmation dialog: it is gone
// for everyone and cannot be brought back.
function RemoveButton({ kudoId }: { kudoId: string }) {
  const { t } = useTranslation();
  const { mutate } = useConnection();
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t("kudos.remove")}
        aria-haspopup="dialog"
        onClick={() => setAsking(true)}
        className="sb-icon-button"
      >
        <Icon name="trash" />
      </button>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title={t("kudos.removeTitle")}
        returnTo={trigger}
        actions={
          <>
            <button
              type="button"
              autoFocus
              onClick={() => setAsking(false)}
              className="sb-secondary-action"
            >
              {t("note.cancel")}
            </button>
            <button
              type="button"
              data-testid="kudo-remove-confirm"
              onClick={() => {
                setAsking(false);
                mutate(
                  { type: "kudo.delete", opId: generateHexId(), kudoId },
                  { type: "kudo.deleted", seq: 0, kudoId },
                );
              }}
              className="sb-danger-action sb-danger-action--outlined"
            >
              <Icon name="trash" size={20} />
              {t("menu.deleteConfirm")}
            </button>
          </>
        }
      >
        <p className="sb-dialog__text">{t("kudos.removeText")}</p>
      </Dialog>
    </>
  );
}

function KudoComposer({
  roster,
  you,
  gifsEnabled,
}: {
  roster: Participant[];
  you: Participant;
  gifsEnabled: boolean;
}) {
  const { t } = useTranslation();
  const { mutate } = useConnection();
  const others = roster.filter((p) => p.id !== you.id);
  const [cardType, setCardType] = useState<KudoCardType>("thank-you");
  const [toId, setToId] = useState<string>(KUDO_EVERYONE);
  const [text, setText] = useState("");
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [popover, setPopover] = useState<"none" | "gif" | "emoji">("none");
  const id = useId();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (toId === "") return;
    const kudoId = generateHexId();
    mutate(
      {
        type: "kudo.create",
        opId: generateHexId(),
        kudoId,
        cardType,
        toId,
        text: text.trim(),
        gifUrl,
        anonymous,
      },
      {
        type: "kudo.created",
        seq: 0,
        kudo: {
          id: kudoId,
          cardType,
          toId,
          fromId: anonymous ? null : you.id,
          text: text.trim(),
          gifUrl,
        },
      },
    );
    setText("");
    setGifUrl(null);
    setAnonymous(false);
    setPopover("none");
  }

  // sebaro's form (plan stage 5d, F5b): the kind as chips, the recipient and
  // the reason as labelled fields, „Anonym senden“ (§6.1 f), and „Kudos
  // senden“ as the close phase's primary action.
  return (
    <form
      onSubmit={submit}
      aria-label={t("kudos.send")}
      className="sb-form-grid"
    >
      <div
        role="group"
        aria-label={t("kudos.kind")}
        className="sb-chips sb-form-grid__wide"
      >
        {KUDO_CARD_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            data-testid={`kudo-type-${type}`}
            aria-pressed={cardType === type}
            onClick={() => setCardType(type)}
            className="sb-chip"
          >
            <Icon name="check" size={16} />
            {t(`kudos.card.${type}`)}
          </button>
        ))}
      </div>

      <div className="sb-field sb-form-grid__wide">
        <label htmlFor={`${id}-to`} className="sb-field__label">
          {t("kudos.to")}
        </label>
        <div className="sb-field__control sb-select">
          <select
            id={`${id}-to`}
            value={toId}
            data-testid="kudo-recipient"
            onChange={(event) => setToId(event.target.value)}
          >
            {/* "Everyone" leads the list: thanking the room is the common
                closing move, and on a one-person board it is the only option.
                The sender is left OUT rather than greyed out — a disabled
                "Anna (you)" invites the question, absence answers it. The
                server refuses a self-kudo anyway, so this is convenience, not
                the rule. */}
            <option value={KUDO_EVERYONE}>{t("kudos.everyone")}</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" />
        </div>
      </div>

      {/* A kudo may go without a reason, so the label says "(optional)". */}
      <div className="sb-field sb-form-grid__wide">
        <label htmlFor={`${id}-reason`} className="sb-field__label">
          {t("kudos.reason")} {t("form.optional")}
        </label>
        <div className="sb-field__control">
          <textarea
            id={`${id}-reason`}
            value={text}
            data-testid="kudo-text"
            onChange={(event) => setText(event.target.value)}
            maxLength={300}
            rows={2}
          />
        </div>
      </div>

      {gifUrl !== null ? (
        <div className="sb-form-grid__wide flex items-start gap-(--sb-space-2)">
          <img
            src={gifUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="max-h-28"
          />
          <button
            type="button"
            onClick={() => setGifUrl(null)}
            aria-label={t("gif.remove")}
            className="sb-icon-button"
          >
            <Icon name="close" />
          </button>
        </div>
      ) : null}

      <div className="sb-cluster sb-form-grid__wide">
        {gifsEnabled ? (
          <div className="relative">
            <button
              type="button"
              aria-expanded={popover === "gif"}
              onClick={() => setPopover(popover === "gif" ? "none" : "gif")}
              className="sb-secondary-action sb-secondary-action--compact"
            >
              <Icon name="gif" size={20} />
              {t("gif.add")}
            </button>
            {popover === "gif" ? (
              <div className="absolute bottom-full left-0 z-40 mb-(--sb-space-1)">
                <GifPicker
                  onPick={(url) => {
                    setGifUrl(url);
                    setPopover("none");
                  }}
                  onClose={() => setPopover("none")}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="relative">
          <button
            type="button"
            aria-label={t("kudos.emoji")}
            aria-expanded={popover === "emoji"}
            onClick={() => setPopover(popover === "emoji" ? "none" : "emoji")}
            className="sb-secondary-action sb-secondary-action--compact"
          >
            <Icon name="emoji" size={20} />
          </button>
          {popover === "emoji" ? (
            <div className="absolute bottom-full left-0 z-40 mb-(--sb-space-1)">
              <EmojiPicker
                onPick={(emoji) => {
                  setText((current) => current + emoji);
                  setPopover("none");
                }}
              />
            </div>
          ) : null}
        </div>
        <label className="sb-checkbox">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
          />
          <span>{t("kudos.anonymousSend")}</span>
        </label>
      </div>

      <div className="sb-form-grid__wide">
        <button
          type="submit"
          data-testid="kudo-send"
          className="sb-primary-action"
        >
          {t("kudos.send")}
        </button>
      </div>
    </form>
  );
}
