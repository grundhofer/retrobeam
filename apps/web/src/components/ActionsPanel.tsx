// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  actionTextSchema,
  generateHexId,
  type Action,
  type Participant,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { useMissingField } from "../lib/useMissingField.js";

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

  return (
    <aside
      data-testid="actions-panel"
      className="w-80 shrink-0 rounded-xl border border-zinc-200 bg-white p-4"
      aria-label={t("action.title")}
    >
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-600 uppercase">
        ✅ {t("action.title")}
      </h2>

      {!readOnly ? (
        <form onSubmit={add} className="mb-4 flex flex-col gap-2">
          <input
            {...textField.fieldProps}
            value={text}
            data-testid="action-input"
            onChange={(event) => {
              setText(event.target.value);
              textField.typed(event.target.value);
            }}
            maxLength={300}
            placeholder={t("action.placeholder")}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-accent"
          />
          {textField.missing ? (
            <p id={textField.messageId}>{t("action.textMissing")}</p>
          ) : null}
          <p role="status" className="sr-only">
            {textField.spoken ? t("action.textMissing") : ""}
          </p>
          <div className="flex items-end gap-2">
            {/* The owner may stay empty ("None"), so the label says
                "(optional)". The type size sits on the label; the select
                inherits it. */}
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-zinc-600">
              <span>
                {t("action.owner")} <span>{t("form.optional")}</span>
              </span>
              <select
                value={ownerId}
                data-testid="action-owner"
                onChange={(event) => setOwnerId(event.target.value)}
                className="rounded-lg border border-zinc-200 px-2 py-1"
              >
                <option value="">{t("action.ownerNone")}</option>
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-strong"
            >
              {t("action.add")}
            </button>
          </div>
        </form>
      ) : null}

      <ul className="flex flex-col gap-2">
        {actions.map((action) => {
          const owner =
            action.ownerId === null
              ? null
              : roster.find((p) => p.id === action.ownerId);
          return (
            <li
              key={action.id}
              data-testid="action-item"
              className="flex items-start gap-2 rounded-lg border border-zinc-100 p-2"
            >
              <input
                type="checkbox"
                checked={action.status === "done"}
                disabled={readOnly}
                onChange={() =>
                  update(action, {
                    status: action.status === "done" ? "open" : "done",
                  })
                }
                aria-label={t("action.toggle")}
                className="mt-0.5 accent-accent"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm break-words ${
                    action.status === "done"
                      ? "text-zinc-500 line-through"
                      : "text-zinc-800"
                  }`}
                >
                  {action.text}
                </span>
                {owner ? (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: owner.color }}
                    />
                    {owner.name}
                  </span>
                ) : null}
                {/* Carried in by a follow-up retro: the previous board's name,
                    so the room can tell last time's promises from today's. */}
                {action.carriedFrom !== null ? (
                  <span
                    data-testid="action-carried"
                    className="mt-0.5 block text-xs text-zinc-500"
                  >
                    {t("action.carriedFrom", { name: action.carriedFrom })}
                  </span>
                ) : null}
              </span>
              {!readOnly ? (
                <button
                  type="button"
                  aria-label={t("action.delete")}
                  onClick={() => remove(action)}
                  className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  🗑
                </button>
              ) : null}
            </li>
          );
        })}
        {actions.length === 0 ? (
          <li className="text-sm text-zinc-500">{t("action.empty")}</li>
        ) : null}
      </ul>
    </aside>
  );
}
