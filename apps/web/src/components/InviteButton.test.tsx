// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import "../i18n.js";
import "../index.css";
import { adminLinkUrl, teamLinkUrl } from "../lib/adminLink.js";
import { qrPath } from "../lib/qr.js";
import { saveAdminToken } from "../lib/session.js";
import { InviteButton } from "./InviteButton.js";
import { ShareLink } from "./ShareLink.js";

// The invite panel and the lobby card put a link on a projector, as text and
// as a QR code. The one thing they must never do is carry the facilitator
// link: it is the whole capability (duplicate, delete, run the retro), and a
// QR code on a meeting-room screen is a photo away from every phone in it.
// So the browser here is set up as the facilitator's would be — the token
// stored AND the fragment still in the address bar — and the code has to
// encode the team link regardless. Each test uses its own board id: session.ts
// keeps an in-memory copy of every token it saved (see AdminLink.test.tsx).
const TOKEN = "fedcba9876543210fedcba9876543210";

afterEach(() => {
  history.replaceState(null, "", location.pathname + location.search);
});

function asFacilitator(boardId: string) {
  saveAdminToken(boardId, TOKEN);
  history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}#admin=${TOKEN}`,
  );
}

// The rendered code IS the encoded text: the same encoder, fed the team link,
// has to produce exactly the path on screen — and the admin link a different
// one, or the comparison would prove nothing.
async function expectTeamQr(qr: Element, boardId: string) {
  const drawn = qr.querySelector("path")?.getAttribute("d");
  const team = qrPath(teamLinkUrl(location.origin, boardId)).path;
  const admin = qrPath(adminLinkUrl(location.origin, boardId, TOKEN)).path;
  expect(admin).not.toBe(team);
  expect(drawn).toBe(team);
}

test("the invite dialog shows the team link and a QR code of it — never the facilitator link", async () => {
  const boardId = "7".repeat(32);
  asFacilitator(boardId);
  const screen = await render(<InviteButton boardId={boardId} />);

  await screen.getByTestId("invite-button").click();
  const dialog = screen.getByTestId("invite-panel");
  await expect.element(dialog).toBeVisible();
  expect((dialog.element() as HTMLDialogElement).open).toBe(true);
  // The link as a sentence, wrapping after every „.“ and „/“ (sebaro RB-6).
  const text = screen.getByTestId("share-link-text");
  await expect
    .element(text)
    .toHaveTextContent(
      teamLinkUrl(location.origin, boardId).replace(/^https?:\/\//, ""),
    );
  expect(text.element().querySelectorAll("wbr").length).toBeGreaterThanOrEqual(
    2,
  );
  expect(text.element().textContent).not.toContain("admin");
  const qr = screen.getByTestId("qr-code");
  await expect.element(qr).toBeVisible();
  await expectTeamQr(qr.element(), boardId);
  // Dark on light in both modes: scanners read inverted codes badly.
  expect(qr.element().closest("[data-theme]")?.getAttribute("data-theme")).toBe(
    "light",
  );
});

test("the lobby card copies the team link and enlarges its code in the same dialog", async () => {
  const boardId = "8".repeat(32);
  asFacilitator(boardId);
  const screen = await render(<ShareLink boardId={boardId} />);
  await expect
    .element(screen.getByTestId("share-link-input"))
    .toHaveValue(teamLinkUrl(location.origin, boardId));

  await screen.getByTestId("qr-enlarge").click();
  await expect.element(screen.getByTestId("invite-panel")).toBeVisible();
  await expect.element(screen.getByTestId("qr-code")).toBeVisible();
  await expectTeamQr(screen.getByTestId("qr-code").element(), boardId);
});

// A modal that shows (sebaro D104 (13)): Escape and „Schließen“ close it, and
// the focus comes back to what opened it.
test("Escape or „Schließen“ close the dialog, and focus comes back", async () => {
  const screen = await render(<InviteButton boardId={"9".repeat(32)} />);
  const trigger = screen.getByTestId("invite-button");
  // Open, or not in the page at all once closed.
  const dialog = () =>
    document.querySelector<HTMLDialogElement>(
      '[data-testid="invite-panel"]',
    ) ?? {
      open: false,
    };

  await trigger.click();
  expect(dialog().open).toBe(true);
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => dialog().open).toBe(false);
  await expect.element(trigger).toHaveFocus();

  await trigger.click();
  await screen.getByTestId("invite-panel-close").click();
  await expect.poll(() => dialog().open).toBe(false);
  await expect.element(trigger).toHaveFocus();
});

test("on a phone the dialog stays inside the screen", async () => {
  await page.viewport(390, 844);
  const screen = await render(<InviteButton boardId={"a7".repeat(16)} />);
  await screen.getByTestId("invite-button").click();
  await expect.element(screen.getByTestId("qr-code")).toBeVisible();
  const box = screen
    .getByTestId("invite-panel")
    .element()
    .getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(390);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(844);
});
