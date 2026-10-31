// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from "react-router";
import { OperatorBlock, PlaceholderField } from "./OperatorBlock.js";
import { ACCESSIBILITY_DATE, AUTHORITY_CHECKED } from "./operator.js";

/**
 * English accessibility statement. Structure mirrors accessibility.de.tsx,
 * and so does its pending legal review.
 */
export function AccessibilityEn() {
  return (
    <>
      <p>
        This page describes how RetroBeam can be used without a mouse, with a
        screen reader or with large text, what was checked for that and what was
        not. Whether the German Accessibility Strengthening Act (
        <span lang="de">Barrierefreiheitsstärkungsgesetz</span>, BFSG) applies
        to RetroBeam has not been legally checked; this page makes no statement
        about it.
      </p>

      <h2>What RetroBeam is</h2>

      <p>
        RetroBeam is a tool for team retrospectives. One person facilitates and
        leads the group through fixed phases: everyone writes on their own
        first, a wheel of fortune picks who presents next, everyone votes blind,
        and the retro ends on appreciation for each other. RetroBeam is free,
        without sign-up and without advertising, in German and in English. It is
        the private, non-commercial project of one person.
      </p>

      <h2>How to use RetroBeam</h2>

      <p>
        The facilitator creates a board and shares the link or the QR code.
        Participants open the link and type a display name; no account or e-mail
        address is needed. The phases are check-in (optional), write, present
        and group, vote, discuss and close; the facilitator can skip some
        phases. A board has the layout “Columns” or “Canvas”, a freeform
        surface. The result can be exported as Markdown, CSV, JSON, PDF or JPEG.
      </p>

      <h3>Keyboard</h3>

      <ul>
        <li>
          The first tab stop of every page is the “Skip to content” link. It
          appears once it has focus and takes you past the page header to the
          content.
        </li>
        <li>
          While you write a card, Enter saves it and Shift+Enter starts a new
          line. On the canvas, Escape cancels writing.
        </li>
        <li>
          In the “Columns” layout, the “Move or stack” button (⋯) on a card
          opens a choice: “Move to” another column and, while presenting, “Stack
          with” another card. It replaces dragging with the mouse and is offered
          where dragging is allowed. Escape closes the choice and puts focus
          back on the button; after a move or a stack, focus is on the card
          again.
        </li>
        <li>
          On the canvas, the same button (⋯) on a card opens a choice: “Move to”
          another zone, at a free spot, and steps up, down, left and right, as
          buttons or with the arrow keys. Here too it replaces dragging. The “+
          Note” button opens the field for writing a new card, without a
          double-click. “Zoom out”, “Fit to screen” and “Zoom in” are buttons.
        </li>
        <li>
          The facilitator moves and resizes zones on the canvas with the “Zones”
          button next to the zoom: there they pick a zone and have steps for
          position and size, as buttons or with the arrow keys. This replaces
          dragging the zone and its handle. Escape closes the choice and puts
          focus back on the button.
        </li>
        <li>
          The board menu (⋯) and “Invite” close with Escape, and on narrow
          screens also with ×; focus then returns to the button that opened
          them. Escape also closes the enlarged QR code, a second Escape the
          invitation. The menu on an avatar closes once focus leaves it, not
          with Escape. When the facilitator picks who presents with face-down
          cards, Escape closes that card choice.
        </li>
        <li>
          Controls are meant to show a visible focus outline; this has not been
          checked for every control.
        </li>
      </ul>

      <h3>Screen readers</h3>

      <p>
        Phase changes, refused actions, changes while presenting, the result of
        the wheel of fortune and who is present are given out as status
        messages, and some errors as alerts, so that a screen reader can read
        them. When a name or text is missing while creating a board, joining or
        adding an action item, the message is at the field, linked to it, and
        focus moves there. This has not been tested with a screen reader.
      </p>

      <h3>Language</h3>

      <p>
        On your first visit the language follows your browser: German if it is
        set to German, English otherwise. The “DE” or “EN” button at the top
        switches the language and stores the choice in your browser. On this
        page, the <Link to="/imprint">imprint</Link> and the{" "}
        <Link to="/privacy">privacy notice</Link>, it leads to the same page in
        the other language instead and stores nothing.
      </p>

      <h3>Motion</h3>

      <p>
        If your system is set to reduce motion, the wheel of fortune does not
        spin but shows at once whose turn it is. Fade-in and pulse animations
        and the confetti are left out, and while presenting the view jumps
        instead of scrolling.
      </p>

      <h3>Light or dark</h3>

      <p>
        RetroBeam has a light appearance only. There is no choice between light
        and dark yet.
      </p>

      <h2>Requirements and checks</h2>

      <p>
        The target is level AA of the Web Content Accessibility Guidelines
        (WCAG) 2.2. The European standard EN&nbsp;301&nbsp;549 refers to WCAG
        2.1 level AA in version V3.2.1. Version V4.1.1 refers to WCAG 2.2 level
        AA; it is published, but not yet cited in the Official Journal of the
        EU.
      </p>

      <p>
        RetroBeam does not reach this target at present. At least one known
        limitation misses it: controls on the canvas that are smaller than
        24&nbsp;pixels at the fitted zoom. Whether the other limitations below
        miss it has not been checked by hand, and much has not been checked at
        all.
      </p>

      <p>
        When a decision weighs accessibility against another goal, the other
        goal may come first. Every such deliberate deviation is listed with its
        reason under the known limitations. There are none at present.
      </p>

      <p>
        Each check below has one of four states: passed, open, skipped (with a
        reason) or failed. The results come from the runs on{" "}
        <PlaceholderField value={ACCESSIBILITY_DATE} />. The automated checks
        run when the source code changes; a new version currently goes online
        without waiting for their result.
      </p>

      <h3>Automated checks</h3>

      <ul>
        <li>
          The tool axe-core 4.14.0 checks, in the Chromium browser at
          390&nbsp;pixels and 1440&nbsp;pixels wide, the rules for WCAG 2.0 and
          2.1 (levels A and AA) and for WCAG 2.2 (level AA). In German and in
          English it checks the page for creating a board, the page for unknown
          addresses, the imprint, the privacy notice and this page; in English
          only, the start page, a board in the lobby and while writing, and the
          canvas, once with a card's move choice open and once with the zone
          choice open. Result: passed on all of these pages except the canvas.
          On the canvas, failed on four points: “⋯”, “✎”, “🗑” and “+ Note” are
          smaller than 24&nbsp;pixels at the fitted zoom. This is listed as a
          known limitation. Any other violation fails the check. A tool like
          this finds only part of the possible barriers.
        </li>
        <li>
          Sideways scrolling at 390&nbsp;pixels and 1440&nbsp;pixels wide, on
          the same pages apart from the canvas and on a board in the lobby and
          while writing: passed.
        </li>
        <li>
          Sideways scrolling at 360&nbsp;pixels wide with the text at double
          size (200&nbsp;%), on the same pages as above: passed.
        </li>
        <li>
          A check of the source code for two too-light grays for text with no
          reason next to them: passed. It measures no contrast.
        </li>
        <li>
          Tests in Chromium and WebKit of where focus goes after Escape, after
          moving a card and on the result of the retro: passed. Tests in
          Chromium, Firefox and WebKit that enter cards with Enter and close
          views with Escape: passed. Neither is a walk-through with the keyboard
          only.
        </li>
        <li>
          Tests in Chromium, Firefox and WebKit that “Skip to content” is the
          first tab stop and puts focus in the content, that cards on the canvas
          move to another zone and step by step without dragging, that the
          facilitator moves and resizes zones without dragging, and that the
          forms for creating a board and for joining say at the field what is
          missing: passed. For the action item form the same check runs as a
          component test in Chromium and WebKit: passed.
        </li>
        <li>
          One test that walks a board through every phase at 390&nbsp;pixels
          wide: passed. It checks the layout, not accessibility.
        </li>
        <li>
          axe and the sideways-scrolling check in Firefox and WebKit: skipped.
          Reason: these checks run in one browser so that their results stay
          comparable.
        </li>
      </ul>

      <h3>Open checks</h3>

      <ul>
        <li>Screen readers, for example VoiceOver, NVDA or TalkBack: open.</li>
        <li>
          Real devices and touch, including the on-screen keyboard on iOS: open.
        </li>
        <li>A walk-through of all tasks with the keyboard only: open.</li>
        <li>
          The four fixed tasks with the keyboard only – create something, delete
          it after a confirmation, switch between light and dark, open a note:
          open. RetroBeam does not have the last two yet.
        </li>
        <li>
          axe for the later phases of a board (present, vote, discuss, close,
          results), for menus, dialogs, the wheel of fortune and the canvas
          other than while writing with the move choice open: open.
        </li>
        <li>
          axe for the German interface of the start page and a board: open.
        </li>
        <li>Forced colors and the system’s contrast modes: open.</li>
        <li>
          Zooming the browser to 400&nbsp;%, which means a width of
          320&nbsp;pixels: open. The check above doubles the text size; that is
          not the same.
        </li>
        <li>
          Larger spacing between lines, paragraphs, words and letters: open.
        </li>
        <li>The exports as Markdown, CSV, JSON, PDF and JPEG: open.</li>
      </ul>

      <h2>Known limitations</h2>

      <p>
        Because no manual check has run yet, this list is not complete.
        RetroBeam is currently moving to a new design; some points are planned
        for that move.
      </p>

      <ul>
        <li>
          On the canvas, the “⋯”, “✎”, “🗑” and “+ Note” buttons are smaller than
          24&nbsp;pixels at the fitted zoom, because they shrink with the
          canvas. The move choice is full size. The canvas is to be rebuilt
          during the move.
        </li>
        <li>
          A choice between light and dark is missing. It is planned for the
          move.
        </li>
        <li>
          Screen readers, real devices and a walk-through with the keyboard only
          have not been tested. Keyboard-only tests are planned for the move.
        </li>
      </ul>

      <h2>Feedback</h2>

      <p>
        If you run into a barrier in RetroBeam or cannot use something, write
        to:
      </p>

      <OperatorBlock emailLabel="E-mail:" />

      <p>
        It helps to know which page it was, and which browser and assistive
        technology you use. No response time is promised.
      </p>

      <h2>Competent authority</h2>

      <p>
        Market surveillance under the BFSG is the responsibility of this joint
        body of the German federal states:
      </p>

      {/* The authority's German name and address, as on its website, with
          its plain hyphen. */}
      <p data-testid="authority-block">
        <span lang="de">
          Marktüberwachungsstelle der Länder für die Barrierefreiheit von
          Produkten und Dienstleistungen - Anstalt öffentlichen Rechts (MLBF
          AöR)
        </span>
        <br />
        Carl-Miller-Straße 6
        <br />
        39112 Magdeburg
        <br />
        Germany
        <br />
        Phone: +49 391 289 230 23
        <br />
        E-mail: kontakt@mlbf-barrierefrei.de
        <br />
        Web:{" "}
        <a
          href="https://www.mlbf-barrierefrei.de/"
          target="_blank"
          rel="noreferrer"
        >
          www.mlbf-barrierefrei.de
        </a>
      </p>

      <p>
        The details are taken from the body’s website, retrieved on{" "}
        <PlaceholderField value={AUTHORITY_CHECKED} />.
      </p>
    </>
  );
}
