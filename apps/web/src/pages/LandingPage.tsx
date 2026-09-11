// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BoardPreview } from "../components/BoardPreview.js";
import { LegalFooter } from "../components/LegalFooter.js";
import { SiteHeader } from "../components/SiteHeader.js";

// The front door. It borrows nothing new: every surface token is the app's
// own (zinc ground, white boxed lists with 1px borders, rounded-lg controls,
// the one teal accent, system type) — a visitor who clicks "Start a retro"
// lands in the create form and then a board without a visual jolt. What the
// page adds is a page grammar the app never needed: left-aligned content in
// seven of twelve columns with the right third left empty, block spacing in
// 24px multiples, the accent on exactly one filled button plus text links,
// and one 3px rule under the hero. Six sections, then the footer. Nothing is
// written to localStorage here — the language toggle is the only thing that
// stores anything, and only on a click.
const STEPS = ["share", "write", "decide"] as const;
const WHY = ["private", "nothing", "guided", "languages"] as const;
const FAQ = [
  "cost",
  "account",
  "where",
  "howLong",
  "whoReads",
  "facilitator",
  "hideAuthors",
  "gifs",
  "selfHost",
  "license",
  "commercial",
  "work",
] as const;

// The app's primary-button class string, one size up.
const ctaClass =
  "inline-block rounded-lg bg-accent px-5 py-3 text-base font-medium text-white transition-colors duration-150 hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const textLinkClass =
  "rounded text-accent underline underline-offset-4 transition-colors duration-150 hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent";
const labelClass =
  "text-sm font-semibold tracking-wide text-zinc-500 uppercase";
const listClass =
  "divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white";

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 sm:px-10">
        <section
          data-testid="landing-hero"
          className="py-12 sm:py-24 lg:grid lg:grid-cols-12"
        >
          <div className="lg:col-span-7">
            <p className={labelClass}>{t("landing.kicker")}</p>
            <h1 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              {t("app.tagline")}
            </h1>
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-zinc-600">
              {t("landing.lede")}
            </p>
            <div className="mt-12">
              <Link to="/new" data-testid="landing-cta" className={ctaClass}>
                {t("landing.cta")}
              </Link>
            </div>
            <p className="mt-6 text-sm text-zinc-600 tabular-nums">
              {t("landing.trust")}
            </p>
          </div>
        </section>

        {/* The one visible structural rule on the page. */}
        <div className="border-t-[3px] border-zinc-900" aria-hidden="true" />

        <section className="py-12 sm:py-24 lg:grid lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className={labelClass}>{t("landing.howTitle")}</h2>
            <ol className={`mt-6 ${listClass}`}>
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-4 px-5 py-4">
                  <span className="text-sm font-semibold text-zinc-600 tabular-nums">
                    {index + 1}
                  </span>
                  <p className="leading-relaxed text-zinc-700">
                    <strong className="font-semibold text-zinc-900">
                      {t(`landing.steps.${step}.title`)}
                    </strong>{" "}
                    {t(`landing.steps.${step}.text`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-12 lg:col-span-12">
            <BoardPreview />
          </div>
        </section>

        <section className="border-t border-zinc-200 py-12 sm:py-24 lg:grid lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className={labelClass}>{t("landing.whyTitle")}</h2>
            <ul className={`mt-6 ${listClass}`}>
              {WHY.map((key) => (
                <li key={key} className="px-5 py-4">
                  <p className="leading-relaxed text-zinc-700">
                    <strong className="font-semibold text-zinc-900">
                      {t(`landing.why.${key}.title`)}
                    </strong>{" "}
                    {t(`landing.why.${key}.text`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          data-testid="landing-faq"
          className="border-t border-zinc-200 py-12 sm:py-24 lg:grid lg:grid-cols-12"
        >
          <div className="lg:col-span-7">
            <h2 className={labelClass}>{t("landing.faqTitle")}</h2>
            <div className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">
              {FAQ.map((key) => (
                <details key={key} className="group">
                  <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-4 font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                    <span>{t(`landing.faq.${key}.q`)}</span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-zinc-500 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-prose pb-5 text-[17px] leading-[1.65] text-zinc-700">
                    {t(`landing.faq.${key}.a`)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          data-testid="landing-notice"
          className="border-t border-zinc-200 py-12 sm:py-24 lg:grid lg:grid-cols-12"
        >
          <div className="lg:col-span-7">
            <h2 className={labelClass}>{t("landing.noticeTitle")}</h2>
            <p className="mt-6 max-w-prose text-[17px] leading-[1.65] text-zinc-700">
              {t("landing.notice")}
            </p>
            <p className="mt-6">
              <Link to="/new" className={textLinkClass}>
                {t("landing.noticeCta")}
              </Link>
            </p>
          </div>
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}
