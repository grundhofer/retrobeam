// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BoardPreview } from "../components/BoardPreview.js";
import { LegalFooter } from "../components/LegalFooter.js";
import { SiteHeader } from "../components/SiteHeader.js";

// The front door uses only the app's own visual vocabulary: zinc surfaces,
// white cards, rounded controls, the teal accent and system type. The product
// preview now sits in the hero, while alternating full-width surfaces give the
// long-form content a clearer rhythm. The create action appears at both ends
// of the page but always leads to the same form. Nothing is written to
// localStorage here — the language toggle is the only thing that stores
// anything, and only on a click.
const STEPS = ["share", "write", "decide"] as const;
const WHY = ["private", "nothing", "guided", "languages"] as const;
const FAQ_GROUPS = [
  {
    key: "basics",
    questions: ["cost", "account", "howLong"],
  },
  {
    key: "privacy",
    questions: ["where", "whoReads", "facilitator", "hideAuthors", "gifs"],
  },
  {
    key: "openSource",
    questions: ["work", "commercial", "selfHost", "license"],
  },
] as const;

// The app's primary-button class string, one size up.
const ctaClass =
  "inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-base font-medium text-white transition-colors duration-150 hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const labelClass =
  "text-sm font-semibold tracking-wide text-zinc-500 uppercase";
const sectionInnerClass = "mx-auto w-full max-w-6xl px-6 sm:px-10";

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <SiteHeader />
      <main className="flex-1">
        <section
          data-testid="landing-hero"
          className="border-b-[3px] border-zinc-900"
        >
          <div
            className={`${sectionInnerClass} py-12 sm:py-20 lg:grid lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-24`}
          >
            <div className="lg:col-span-6">
              <p className={labelClass}>{t("landing.kicker")}</p>
              <h1 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight text-zinc-900 sm:text-5xl">
                {t("app.tagline")}
              </h1>
              <p className="mt-6 max-w-prose text-lg leading-relaxed text-zinc-600">
                {t("landing.lede")}
              </p>
              <div className="mt-10">
                <Link to="/new" data-testid="landing-cta" className={ctaClass}>
                  {t("landing.cta")}
                </Link>
              </div>
              <p className="mt-4 text-sm text-zinc-600">
                {t("landing.ctaHint")}
              </p>
              <p className="mt-2 text-sm text-zinc-600 tabular-nums">
                {t("landing.trust")}
              </p>
            </div>
            <div className="mt-12 lg:col-span-6 lg:mt-0">
              <div className="rounded-2xl bg-accent/[0.06] p-3 sm:p-5">
                <p
                  className="mb-3 text-sm font-medium text-zinc-600"
                  aria-hidden="true"
                >
                  {t("landing.preview.label")}
                </p>
                <BoardPreview />
              </div>
            </div>
          </div>
        </section>

        <section
          data-testid="landing-how"
          className="border-b border-zinc-200 bg-white"
        >
          <div className={`${sectionInnerClass} py-12 sm:py-20`}>
            <h2 className={labelClass}>{t("landing.howTitle")}</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-5"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent-strong tabular-nums">
                    {index + 1}
                  </span>
                  <h3 className="mt-5 font-semibold text-zinc-900">
                    {t(`landing.steps.${step}.title`)}
                  </h3>
                  <p className="mt-2 leading-relaxed text-zinc-700">
                    {t(`landing.steps.${step}.text`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          data-testid="landing-why"
          className="border-b border-zinc-200 bg-accent/[0.045]"
        >
          <div
            className={`${sectionInnerClass} py-12 sm:py-20 lg:grid lg:grid-cols-12 lg:gap-12`}
          >
            <div className="lg:col-span-4">
              <h2 className={labelClass}>{t("landing.whyTitle")}</h2>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:col-span-8 lg:mt-0">
              {WHY.map((key) => (
                <li
                  key={key}
                  className="rounded-xl border border-zinc-200 bg-white p-5"
                >
                  <h3 className="font-semibold text-zinc-900">
                    {t(`landing.why.${key}.title`)}
                  </h3>
                  <p className="mt-2 leading-relaxed text-zinc-700">
                    {t(`landing.why.${key}.text`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          data-testid="landing-faq"
          className="border-b border-zinc-200 bg-white"
        >
          <div
            className={`${sectionInnerClass} py-12 sm:py-20 lg:grid lg:grid-cols-12 lg:gap-12`}
          >
            <div className="lg:col-span-4">
              <h2 className={labelClass}>{t("landing.faqTitle")}</h2>
            </div>
            <div className="mt-8 space-y-8 lg:col-span-8 lg:mt-0">
              {FAQ_GROUPS.map((group) => (
                <div key={group.key} data-testid="landing-faq-group">
                  <h3 className="text-base font-semibold text-zinc-900">
                    {t(`landing.faqGroups.${group.key}`)}
                  </h3>
                  <div className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-zinc-50 px-5">
                    {group.questions.map((key) => (
                      <details key={key} className="group">
                        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-4 font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                          <span>{t(`landing.faq.${key}.q`)}</span>
                          <span
                            aria-hidden="true"
                            className="shrink-0 text-zinc-500 transition-transform group-open:rotate-45"
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
              ))}
            </div>
          </div>
        </section>

        <section data-testid="landing-notice" className="bg-zinc-50">
          <div className={`${sectionInnerClass} py-12 sm:py-20`}>
            <div className="rounded-2xl bg-zinc-900 px-6 py-8 sm:flex sm:items-center sm:justify-between sm:gap-10 sm:px-8">
              <div>
                <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">
                  {t("landing.noticeTitle")}
                </h2>
                <p className="mt-4 max-w-2xl text-[17px] leading-[1.65] text-zinc-300">
                  {t("landing.notice")}
                </p>
              </div>
              <Link
                to="/new"
                data-testid="landing-bottom-cta"
                className={`${ctaClass} mt-8 w-full shrink-0 sm:mt-0 sm:w-auto`}
              >
                {t("landing.cta")}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}
