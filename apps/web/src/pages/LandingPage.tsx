// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { BoardPreview } from "../components/BoardPreview.js";
import { Icon } from "../components/Icon.js";
import { LegalFooter } from "../components/LegalFooter.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { MAIN_ID } from "../components/SkipLink.js";

// The front door in sebaro (BIL-02, plan stage 4c): the first screen is only
// the h1, one sentence and the primary action; everything else follows in
// sections — no eyebrows, no tinted grounds, no dark band. The create action
// appears at both ends of the page and always leads to the same form.
// Nothing is written to localStorage here; only the language choice stores
// anything, and only on a choice.
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

// The hero's claims, each one a link to the FAQ answer that carries its
// caveats: "stored in the EU" is only honest next to the answer that says the
// edge can be outside it, "90 days" next to the one that says a facilitator
// can keep a board. The chips are the short form; the answer is the promise.
// No "no account" chip — the kicker and the hint under the button say it.
const TRUST_CHIPS = [
  { key: "private", faq: "whoReads" },
  { key: "anonymous", faq: "hideAuthors" },
  { key: "eu", faq: "where" },
  { key: "deletes", faq: "howLong" },
  { key: "openSource", faq: "license" },
] as const;

const faqId = (key: string) => `faq-${key}`;

// A fragment alone scrolls to a <details> but leaves it shut in some engines,
// so a chip (or a shared /#faq-… link) opens the answer it points at as well.
// Only the element's `open` state changes — nothing is stored.
function openFaq(id: string): HTMLElement | null {
  const target = document.getElementById(id);
  if (target instanceof HTMLDetailsElement) target.open = true;
  return target;
}

export function LandingPage() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const appName = t("app.name");
  const tagline = t("app.tagline");

  // index.html carries the German title for crawlers and link previews; once
  // the app runs, the tab follows the UI language.
  useEffect(() => {
    document.title = `${appName} — ${tagline}`;
    return () => {
      document.title = appName;
    };
  }, [appName, tagline]);

  // The browser's own fragment scroll runs before React has rendered the FAQ,
  // so a link that arrives with #faq-… would land at the top, answer closed.
  useEffect(() => {
    if (!hash.startsWith("#faq-")) return;
    openFaq(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div data-sb-view="landing" className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id={MAIN_ID} className="flex-1">
        <section data-testid="landing-hero" className="sb-container sb-section">
          <div className="sb-stack sb-stack--group">
            <h1>{t("app.tagline")}</h1>
            <p className="sb-page-lead__text">{t("landing.lede")}</p>
            <p>
              <Link
                to="/new"
                data-testid="landing-cta"
                className="sb-primary-action"
              >
                {t("landing.cta")}
              </Link>
            </p>
          </div>
        </section>

        <section
          data-testid="landing-intro"
          className="sb-container sb-section"
        >
          <div className="grid gap-(--sb-space-10) lg:grid-cols-2 lg:items-start">
            <div className="sb-prose">
              <p>{t("landing.description")}</p>
              <p className="text-(--sb-color-text-muted)">
                {t("landing.ctaHint")}
              </p>
              {/* Each one short, a link to the FAQ answer that carries its
                  caveats: "stored in the EU" is only honest next to the
                  answer that says the edge can be outside it, "90 days" next
                  to the one that says a facilitator can keep a board. */}
              <ul data-testid="landing-trust">
                {TRUST_CHIPS.map(({ key, faq }) => (
                  <li key={key}>
                    <a
                      href={`#${faqId(faq)}`}
                      onClick={() => openFaq(faqId(faq))}
                    >
                      {t(`landing.trustChips.${key}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <BoardPreview />
          </div>
        </section>

        <section data-testid="landing-how" className="sb-container sb-section">
          <h2 className="sb-section__title">{t("landing.howTitle")}</h2>
          <p className="sb-page-lead__text">{t("landing.howRoles")}</p>
          <ol className="mt-(--sb-space-8) grid gap-(--sb-space-8) sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step} className="sb-stack">
                <h3>{t(`landing.steps.${step}.title`)}</h3>
                <p>{t(`landing.steps.${step}.text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section data-testid="landing-why" className="sb-container sb-section">
          <h2 className="sb-section__title">{t("landing.whyTitle")}</h2>
          <ul className="grid gap-(--sb-space-8) sm:grid-cols-2">
            {WHY.map((key) => (
              <li key={key} className="sb-stack">
                <h3>{t(`landing.why.${key}.title`)}</h3>
                <p>{t(`landing.why.${key}.text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section data-testid="landing-faq" className="sb-container sb-section">
          <h2 className="sb-section__title">{t("landing.faqTitle")}</h2>
          <div className="sb-stack sb-stack--group">
            {FAQ_GROUPS.map((group) => (
              <div
                key={group.key}
                data-testid="landing-faq-group"
                className="sb-stack"
              >
                <h3>{t(`landing.faqGroups.${group.key}`)}</h3>
                <div className="sb-faq">
                  {group.questions.map((key) => (
                    <details key={key} id={faqId(key)} className="sb-faq__item">
                      <summary className="sb-faq__question">
                        <span>{t(`landing.faq.${key}.q`)}</span>
                        <Icon
                          name="chevron-down"
                          size={20}
                          className="sb-faq__chevron"
                        />
                      </summary>
                      <div className="sb-faq__answer">
                        <p>{t(`landing.faq.${key}.a`)}</p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The last word before the decision is an invitation, not a caveat.
            The private-project line stays visible right under it: docs/06
            relies on the landing saying "not a commercial service". */}
        <section
          data-testid="landing-closing"
          className="sb-container sb-section"
        >
          <h2 className="sb-section__title">{t("landing.closingTitle")}</h2>
          <p className="sb-page-lead__text">{t("landing.closingText")}</p>
          <p className="mt-(--sb-space-8)">
            <Link
              to="/new"
              data-testid="landing-bottom-cta"
              className="sb-primary-action"
            >
              {t("landing.cta")}
            </Link>
          </p>
          <p
            data-testid="landing-notice"
            className="mt-(--sb-space-8) max-w-prose text-(--sb-color-text-muted)"
          >
            {t("landing.notice")}
          </p>
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}
