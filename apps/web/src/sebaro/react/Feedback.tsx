import { Fragment } from "react";
import { Icon } from "./Icon";

// Feedback (Blueprint parts/feedback, NAV-12, EIN-07): the markup of the panel or sheet and of the picture editor, with
// the app's words. The behaviour is the pack's script sb-feedback.js (load it once, at the end of the body): opening,
// the picture with every [data-sb-private] black, the editor, the proof of work and sending. React renders the markup
// once and never changes it while the dialog is open; the script owns the dialog's state.

export type FeedbackWords = {
  title: string;
  /** "Schritt {n} von 2": the script writes the number into the span */
  stepBefore: string;
  stepAfter: string;
  close: string;
  kindLegend: string;
  optional: string;
  kinds: { fehler: string; wunsch: string; frage: string };
  kindHints: { fehler: string; wunsch: string; frage: string };
  back: string;
  textLabel: string;
  textHelp: string;
  pictures: string;
  pictureName: string;
  pictureUnseen: string;
  pictureSeen: string;
  look: string;
  drop: string;
  add: string;
  contextTitle: string;
  /** the names of the context keys shown: version, view, browser, os, viewport, theme, locale, recentErrors */
  contextNames: Record<string, string>;
  note: string;
  send: string;
  doneTitle: string;
  /** the sentence around the issue's link: before „Issue #212“ and after it */
  doneBefore: string;
  doneLink: string;
  doneAfter: string;
  editorTitle: string;
  editorHint: string;
  tools: string;
  redact: string;
  mark: string;
  undo: string;
  apply: string;
};

type Props = {
  id: string;
  /** the product's id of sebaro.product.json, as the feedback service knows it */
  product: string;
  /** the feedback service, e.g. https://rueckmeldung.example */
  endpoint: string;
  version?: string;
  commit?: string;
  /** false for a product with sensitive data (TEC-12): no picture at all */
  pictures?: boolean;
  words: FeedbackWords;
};

const KINDS = [
  ["fehler", "bug"],
  ["wunsch", "lightbulb"],
  ["frage", "help"],
] as const;

declare global {
  interface Window {
    sbFeedback?: {
      open(dialog: HTMLDialogElement, opener?: Element | null): void;
      close(dialog: HTMLDialogElement): void;
    };
  }
}

/** Opens the feedback dialog `id` (the menu item „Rückmeldung geben“), the focus returns to `opener` when it closes. */
export function openFeedback(id: string, opener?: Element | null) {
  const dialog = document.getElementById(id);
  if (dialog instanceof HTMLDialogElement) window.sbFeedback?.open(dialog, opener ?? document.activeElement);
}

/** The feedback dialog and, once per page, its picture editor. */
export function Feedback({ id, product, endpoint, version, commit, pictures = true, words }: Props) {
  return (
    <>
      <dialog
        className="sb-feedback"
        id={id}
        aria-labelledby={`${id}-title`}
        data-sb-feedback-product={product}
        data-sb-feedback-endpoint={endpoint}
        data-sb-feedback-version={version}
        data-sb-feedback-commit={commit}
        data-sb-feedback-pictures={pictures ? undefined : "off"}
      >
        <form noValidate>
          <div className="sb-feedback__head">
            <div>
              <p className="sb-feedback__step">
                {words.stepBefore}
                <span data-sb-feedback-step-n="">1</span>
                {words.stepAfter}
              </p>
              <h2 className="sb-feedback__title" id={`${id}-title`}>
                {words.title}
              </h2>
            </div>
            <button className="sb-icon-button" type="button" aria-label={words.close} data-sb-feedback-close="">
              <Icon name="close" />
            </button>
          </div>
          <fieldset className="sb-feedback__kinds">
            <legend className="sb-feedback__legend">
              {words.kindLegend} <span className="sb-feedback__optional">{words.optional}</span>
            </legend>
            {KINDS.map(([kind, icon]) => (
              <label key={kind} className={`sb-feedback__kind sb-feedback__kind--${kind}`}>
                <input type="radio" name="kind" value={kind} />
                <span className="sb-feedback__kind-icon">
                  <Icon name={icon} size={20} />
                </span>
                <span className="sb-feedback__kind-text">
                  <span>{words.kinds[kind]}</span>
                  <span className="sb-feedback__kind-hint">{words.kindHints[kind]}</span>
                </span>
                <Icon name="chevron-right" className="sb-feedback__kind-go" />
              </label>
            ))}
          </fieldset>
          <div className="sb-feedback__write">
            <button className="sb-text-action sb-feedback__back" type="button" data-sb-feedback-back="">
              <Icon name="arrow-left" />
              {words.back}
            </button>
            <div className="sb-field">
              <label className="sb-field__label" htmlFor={`${id}-text`}>
                {words.textLabel}
              </label>
              <div className="sb-field__control">
                <textarea
                  id={`${id}-text`}
                  name="text"
                  rows={3}
                  required
                  maxLength={4000}
                  aria-describedby={`${id}-help`}
                />
              </div>
              <p className="sb-field__help" id={`${id}-help`}>
                {words.textHelp}
              </p>
            </div>
            <ul className="sb-feedback__pictures" aria-label={words.pictures} />
            <template data-sb-feedback-picture="">
              <li>
                <figure className="sb-feedback__picture">
                  <img alt={words.pictureName} />
                  <figcaption>
                    <span data-sb-feedback-says-unseen="">{words.pictureUnseen}</span>
                    <span data-sb-feedback-says-seen="">{words.pictureSeen}</span>
                    <span className="sb-feedback__picture-actions">
                      <button className="sb-text-action" type="button" data-sb-feedback-edit="">
                        {words.look}
                      </button>
                      <button className="sb-text-action" type="button" data-sb-feedback-drop="">
                        {words.drop}
                      </button>
                    </span>
                  </figcaption>
                </figure>
              </li>
            </template>
            <button className="sb-text-action sb-feedback__add" type="button" data-sb-feedback-add="">
              <Icon name="image" />
              {words.add}
            </button>
            <details className="sb-feedback__context">
              <summary>{words.contextTitle}</summary>
              <dl>
                {Object.entries(words.contextNames).map(([key, name]) => (
                  <Fragment key={key}>
                    <dt>{name}</dt>
                    <dd data-sb-feedback-context={key} />
                  </Fragment>
                ))}
              </dl>
            </details>
            <p className="sb-feedback__note">
              <Icon name="info--16" size={16} />
              <span>{words.note}</span>
            </p>
            <p className="sb-feedback__message" role="alert" />
            <div className="sb-feedback__actions">
              <button className="sb-primary-action" type="submit">
                <span className="sb-primary-action__label">{words.send}</span>
                <span className="sb-primary-action__bar" aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
        <div className="sb-feedback__done" hidden>
          <h2 className="sb-feedback__done-title" tabIndex={-1}>
            {words.doneTitle}
          </h2>
          <p>
            {words.doneBefore}
            <a href="#" data-sb-feedback-issue="">
              {words.doneLink}
              <span data-sb-feedback-issue-number="" />
            </a>
            {words.doneAfter}
          </p>
          <div className="sb-feedback__actions">
            <button className="sb-text-action" type="button" data-sb-feedback-close="">
              {words.close}
            </button>
          </div>
        </div>
      </dialog>
      <dialog
        className="sb-feedback-editor"
        aria-labelledby={`${id}-editor-title`}
        aria-describedby={`${id}-editor-hint`}
      >
        <div className="sb-feedback-editor__head">
          <div>
            <h2 className="sb-feedback-editor__title" id={`${id}-editor-title`}>
              {words.editorTitle}
            </h2>
            <p className="sb-feedback-editor__hint" id={`${id}-editor-hint`}>
              {words.editorHint}
            </p>
          </div>
          <div className="sb-feedback-editor__tools" role="toolbar" aria-label={words.tools}>
            <button className="sb-chip" type="button" aria-pressed="true" data-sb-feedback-tool="redact">
              {words.redact}
            </button>
            <button className="sb-chip" type="button" aria-pressed="false" data-sb-feedback-tool="mark">
              {words.mark}
            </button>
            <button className="sb-icon-button" type="button" aria-label={words.undo} data-sb-feedback-undo="">
              <Icon name="undo" />
            </button>
          </div>
        </div>
        <div className="sb-feedback-editor__stage">
          <canvas role="img" aria-label={words.pictureName} />
        </div>
        <div className="sb-feedback-editor__actions">
          <button className="sb-text-action" type="button" data-sb-feedback-drop="">
            {words.drop}
          </button>
          <button className="sb-primary-action" type="button" data-sb-feedback-apply="">
            <span className="sb-primary-action__label">{words.apply}</span>
          </button>
        </div>
      </dialog>
    </>
  );
}
