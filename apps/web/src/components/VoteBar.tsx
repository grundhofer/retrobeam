// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BoardConfig } from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";
import { Dialog } from "./Dialog.js";
import { Icon } from "./Icon.js";

// The vote phase strip: your own budget as dots, the anonymous progress
// meter, and the facilitator's voting settings.
// The vote's strip (plan stage 5c, sebaro RB-2): what is left as a sentence,
// never dots alone — „Noch 3 von 5 Stimmen.“ / „Alle 5 Stimmen vergeben.“ —,
// how many have finished, and, for everyone and before the first vote, whether
// names go with the result (§6.1 b). The facilitator sets the vote up in a
// dialog.
export function VoteBar({ config }: { config: BoardConfig }) {
  const { t } = useTranslation();
  const votes = useBoardStore((store) => store.state.votes);
  const used = Object.values(votes.mine).reduce((sum, count) => sum + count, 0);
  const remaining = Math.max(0, config.votesPerPerson - used);

  // Your budget is your state (sebaro's state voice, sb-status); how many
  // are done is the round's status row above the board (owner, 2026-11-08),
  // so it is not counted here a second time.
  return (
    <div className="sb-cluster">
      <p
        role="status"
        data-testid="votes-remaining"
        className="sb-status sb-status--info tabular-nums"
      >
        <Icon name="thumbs-up" size={16} />
        <span>
          {remaining === 0
            ? t("vote.allGiven", { total: config.votesPerPerson })
            : t("vote.left", {
                count: remaining,
                total: config.votesPerPerson,
              })}
        </span>
      </p>
      {/* The consent surface. People must know BEFORE they spend a dot whether
          their name will be attached to it — which is also why the setting is
          frozen from the discussion phase on. Shown to everyone, not just the
          facilitator: the person it affects is the voter (§6.1 b). */}
      <span data-testid="vote-privacy" className="sb-field__help">
        {t(
          config.voterNamesEnabled && !config.anonymous
            ? "vote.namesShown"
            : "vote.namesBlind",
        )}
      </span>
    </div>
  );
}

// The vote's set-up: a session control, so it stands in the facilitator's
// „Moderation“ group (owner, 2026-11-08).
export function VoteSettings({ config }: { config: BoardConfig }) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [votesPerPerson, setVotesPerPerson] = useState(config.votesPerPerson);
  const [maxPerTarget, setMaxPerTarget] = useState<number | null>(
    config.maxPerTarget,
  );
  const [topN, setTopN] = useState(config.topN);

  function apply() {
    send({ type: "admin.vote.config", votesPerPerson, maxPerTarget, topN });
    setOpen(false);
  }

  function openDialog() {
    // Seed the fields from the CURRENT config each time the dialog opens, so
    // a concurrent facilitator's change is not clobbered by a stale apply.
    setVotesPerPerson(config.votesPerPerson);
    setMaxPerTarget(config.maxPerTarget);
    setTopN(config.topN);
    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="vote-settings"
        aria-haspopup="dialog"
        onClick={openDialog}
        className="sb-secondary-action sb-secondary-action--compact"
      >
        <Icon name="settings" size={20} />
        {t("vote.settings")}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("vote.settingsTitle")}
        returnTo={triggerRef}
        actions={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="sb-secondary-action"
            >
              {t("note.cancel")}
            </button>
            <button
              type="button"
              data-testid="vote-settings-apply"
              onClick={apply}
              className="sb-secondary-action"
            >
              {t("vote.apply")}
            </button>
          </>
        }
      >
        <div className="sb-stack">
          <NumberField
            id={`${id}-votes`}
            label={t("vote.votesPerPerson")}
            value={votesPerPerson}
            onChange={setVotesPerPerson}
          />
          {/* Left empty, a card takes any number of votes: "(optional)". */}
          <div className="sb-field sb-field--compact">
            <label htmlFor={`${id}-max`} className="sb-field__label">
              {t("vote.maxPerTarget")} {t("form.optional")}
            </label>
            <div className="sb-field__control">
              <input
                id={`${id}-max`}
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                value={maxPerTarget ?? ""}
                onChange={(event) =>
                  // Clamp to the schema's own 1..10, the way NumberField below
                  // does. Unclamped, one out-of-range digit made the whole
                  // admin.vote.config frame fail server-side parsing, silently
                  // discarding the facilitator's other edits with it.
                  setMaxPerTarget(
                    event.target.value === ""
                      ? null
                      : Math.min(
                          10,
                          Math.max(
                            1,
                            Math.round(Number(event.target.value)) || 1,
                          ),
                        ),
                  )
                }
              />
            </div>
          </div>
          <NumberField
            id={`${id}-top`}
            label={t("vote.topN")}
            value={topN}
            onChange={setTopN}
          />
        </div>
      </Dialog>
    </>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="sb-field sb-field--compact">
      <label htmlFor={id} className="sb-field__label">
        {label}
      </label>
      <div className="sb-field__control">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          value={value}
          onChange={(event) =>
            onChange(Math.min(10, Math.max(1, Number(event.target.value) || 1)))
          }
        />
      </div>
    </div>
  );
}
