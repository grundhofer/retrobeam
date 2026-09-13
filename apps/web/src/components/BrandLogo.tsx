// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const name = t("app.name");

  return (
    <span
      data-testid="brand-logo"
      className="inline-flex shrink-0 items-center gap-2"
    >
      <img
        src="/brand-mark.svg"
        alt=""
        aria-hidden="true"
        className={`${compact ? "size-7" : "size-9"} transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-2 motion-reduce:transition-none`}
      />
      <span
        aria-hidden="true"
        className={`${compact ? "text-base" : "text-lg"} font-bold tracking-[-0.035em] text-zinc-900`}
      >
        Retro<span className="text-accent">Beam</span>
      </span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
