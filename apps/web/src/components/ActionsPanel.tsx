// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  actionTextSchema,
  generateHexId,
  type Action,
  type Participant,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { useMissingField } from "../lib/useMissingField.js";
import { Dialog } from "./Dialog.js";
import { Icon } from "./Icon.js";

export interface ActionsPanelProps {
  actions: Action[];
  roster: Participant[];
  you: Participant;
  readOnly: boolean;
}

// Action items: the retro's lasting output. First-class objects, not notes —
// captured while discussing, each with an owner.
export function ActionsPanel({
  actions,
  roster,
  you,
  readOnly,
}: ActionsPanelProps) {
  const { t } = useTranslation();
  const { mutate } = useConnection();
  const [text, setText] = useState("");
  const [ownerId, setOwnerId] = useState<string>(you.id);
  // "Add" stays pressable on an empty field and says at the field what is
  // missing (sebaro STA-03), like the create and join forms.
  const textField = useMissingField();
  const id = useId();

  function add(event: React.FormEvent) {
    event.preventDefault();
    const parsed = actionTextSchema.safeParse(text);
    if (!parsed.success) {
      textField.report();
      return;
    }
    const actionId = generateHexId();
    const owner = ownerId === "" ? null : ownerId;
    mutate(
      {
        type: "action.create",
        opId: generateHexId(),
        actionId,
        text: parsed.data,
        ownerId: owner,
      },
      {
        type: "action.created",
        seq: 0,
        action: {
          id: actionId,
          text: parsed.data,
          ownerId: owner,
          status: "open",
          carriedFrom: null,
        },
      },
    );
    setText("");
  }

  function update(
    action: Action,
    patch: Partial<Pick<Action, "ownerId" | "status">>,
  ) {
    mutate(
      {
        type: "action.update",
        opId: generateHexId(),
        actionId: action.id,
        ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
      { type: "action.updated", seq: 0, action: { ...action, ...patch } },
    );
  }

  function remove(action: Action) {
    mutate(
      { type: "action.delete", opId: generateHexId(), actionId: action.id },
      { type: "action.deleted", seq: 0, actionId: action.id },
    );
  }

  // sebaro (plan stage 5f): a section of the side column, the form with
  // labelled fields — the item's words, „Verantwortlich (optional)“ with
  // „Keine“ — and „Hinzufügen“ never locked, saying at the field what is
  // missing; the items as list rows with their check, the owner by name
  // only (F6), and removing with a confirmation.
  return (
    <aside
      data-testid="actions-panel"
      className="sb-stack w-80 shrink-0"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} className="sb-section__title">
        {t("action.title")}
      </h2>

      {!readOnly ? (
        <form onSubmit={add} className="sb-stack">
          <div className="sb-field">
            <label
              className="sb-field__label"
              htmlFor={textField.fieldProps.id}
            >
              {t("action.label")}
            </label>
            <div className="sb-field__control">
              <input
                {...textField.fieldProps}
                value={text}
                data-testid="action-input"
                onChange={(event) => {
                  setText(event.target.value);
                  textField.typed(event.target.value);
                }}
                maxLength={300}
              />
            </div>
            {textField.missing ? (
              <p className="sb-field__error" id={textField.messageId}>
                <Icon name="error--filled-16" size={16} />
                {t("action.textMissing")}
              </p>
            ) : null}
            <p role="status" className="sb-visually-hidden">
              {textField.spoken ? t("action.textMissing") : ""}
            </p>
          </div>
          <div className="sb-field">
            <label htmlFor={`${id}-owner`} className="sb-field__label">
              {t("action.owner")} {t("form.optional")}
            </label>
            <div className="sb-field__control sb-select">
              <select
                id={`${id}-owner`}
                value={ownerId}
                data-testid="action-owner"
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">{t("action.ownerNone")}</option>
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" />
            </div>
          </div>
          <p>
            <button
              type="submit"
              data-testid="action-add"
              className="sb-secondary-action"
            >
              <Icon name="plus" size={20} />
              {t("action.add")}
            </button>
          </p>
        </form>
      ) : null}

      {actions.length === 0 ? (
        <p className="sb-field__help">{t("action.empty")}</p>
      ) : (
        <ul className="sb-list">
          {actions.map((action) => {
            const owner =
              action.ownerId === null
                ? null
                : roster.find((p) => p.id === action.ownerId);
            const done = action.status === "done";
            return (
              <li
                key={action.id}
                data-testid="action-item"
                className={
                  done ? "sb-list-row sb-list-row--done" : "sb-list-row"
                }
              >
                <span className="sb-list-row__lead">
                  <label className="sb-checkbox">
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={readOnly}
                      onChange={() =>
                        update(action, { status: done ? "open" : "done" })
                      }
                      aria-label={t("action.toggle")}
                    />
                  </label>
                </span>
                <div className="sb-list-row__main">
                  <p className="sb-list-row__title break-words">
                    {done ? (
                      <span className="sb-visually-hidden">
                        {t("lobby.carried.done")}:{" "}
                      </span>
                    ) : null}
                    {action.text}
                  </p>
                  {owner ? (
                    <p className="sb-list-row__meta">{owner.name}</p>
                  ) : null}
                  {/* Carried in by a follow-up retro: the previous board's
                      name, so the room can tell last time's promises from
                      today's. */}
                  {action.carriedFrom !== null ? (
                    <p
                      data-testid="action-carried"
                      className="sb-list-row__meta"
                    >
                      {t("action.carriedFrom", { name: action.carriedFrom })}
                    </p>
                  ) : null}
                </div>
                {!readOnly ? (
                  <span className="sb-list-row__trail">
                    <DeleteAction
                      onConfirm={() => remove(action)}
                      text={action.text}
                    />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

// Removing an action item asks first, in sebaro's confirmation dialog: it is
// gone for everyone and cannot be brought back.
function DeleteAction({
  onConfirm,
  text,
}: {
  onConfirm: () => void;
  text: string;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t("action.delete")}
        aria-haspopup="dialog"
        onClick={() => setAsking(true)}
        className="sb-icon-button"
      >
        <Icon name="trash" />
      </button>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title={t("action.deleteTitle")}
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
              data-testid="action-delete-confirm"
              onClick={() => {
                setAsking(false);
                onConfirm();
              }}
              className="sb-danger-action sb-danger-action--outlined"
            >
              <Icon name="trash" size={20} />
              {t("menu.deleteConfirm")}
            </button>
          </>
        }
      >
        <p className="sb-dialog__text">{t("action.deleteText", { text })}</p>
      </Dialog>
    </>
  );
}
