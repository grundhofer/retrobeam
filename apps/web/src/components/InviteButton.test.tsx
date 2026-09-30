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

test("the invite panel shows the team link and a QR code of it — never the facilitator link", async () => {
  const boardId = "7".repeat(32);
  asFacilitator(boardId);
  const screen = await render(<InviteButton boardId={boardId} />);

  await screen.getByTestId("invite-button").click();
  const panel = screen.getByTestId("invite-panel");
  await expect.element(panel).toBeVisible();
  await expect
    .element(screen.getByTestId("share-link-input"))
    .toHaveValue(teamLinkUrl(location.origin, boardId));
  const qr = screen.getByTestId("qr-code");
  // The encoder is a lazily loaded chunk; the code lands a moment later.
  await expect.element(qr).toBeVisible();
  await expectTeamQr(qr.element(), boardId);

  // Nowhere in the panel — not in a value, an attribute or the text.
  const html = panel.element().outerHTML;
  expect(html).not.toContain("#admin=");
  expect(html).not.toContain(TOKEN);
  expect(screen.getByTestId("admin-link").elements()).toHaveLength(0);
});

test("the lobby card's QR code encodes the team link, enlarged too", async () => {
  const boardId = "8".repeat(32);
  asFacilitator(boardId);
  const screen = await render(<ShareLink boardId={boardId} />);

  await expect.element(screen.getByTestId("qr-code")).toBeVisible();
  await expectTeamQr(screen.getByTestId("qr-code").element(), boardId);
  // A whole number of pixels per module: at 112px for 41 modules, WebKit at
  // device pixel ratio 1 merged neighbouring modules and the code stopped
  // scanning.
  const modules = qrPath(teamLinkUrl(location.origin, boardId)).size;
  const small = screen.getByTestId("qr-code").element().getBoundingClientRect();
  expect(small.width).toBe(modules * 3);
  expect(small.height).toBe(modules * 3);

  await screen.getByTestId("qr-enlarge").click();
  const large = screen.getByTestId("qr-fullscreen");
  await expect.element(large).toBeVisible();
  await expect
    .element(large.getByTestId("qr-code"))
    .toHaveAttribute("role", "img");
  await expectTeamQr(large.getByTestId("qr-code").element(), boardId);
  expect(large.element().outerHTML).not.toContain("#admin=");
  // The overlay is for a room: the code fills most of the shorter axis.
  const box = large.getByTestId("qr-code").element().getBoundingClientRect();
  expect(box.width).toBeGreaterThan(
    Math.min(window.innerWidth, window.innerHeight) * 0.5,
  );
});

test("Escape closes the enlarged code first, then the panel, and focus comes back", async () => {
  const boardId = "9".repeat(32);
  const screen = await render(<InviteButton boardId={boardId} />);
  const trigger = screen.getByTestId("invite-button");
  await trigger.click();
  await expect.element(screen.getByTestId("qr-code")).toBeVisible();

  await screen.getByTestId("qr-enlarge").click();
  await expect.element(screen.getByTestId("qr-fullscreen-close")).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  // One layer per key press: the room still has the panel with the link.
  await expect
    .element(screen.getByTestId("qr-fullscreen"))
    .not.toBeInTheDocument();
  await expect.element(screen.getByTestId("invite-panel")).toBeVisible();
  await expect.element(screen.getByTestId("qr-enlarge")).toHaveFocus();

  await userEvent.keyboard("{Escape}");
  await expect
    .element(screen.getByTestId("invite-panel"))
    .not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
});

test("on a phone the panel is a sheet inside the screen, with its own close button", async () => {
  await page.viewport(390, 844);
  const boardId = "a1".repeat(16);
  const screen = await render(
    // Pushed to the left edge, where the old right-aligned dropdown began
    // off-screen.
    <div style={{ paddingLeft: 8 }}>
      <InviteButton boardId={boardId} />
    </div>,
  );
  await screen.getByTestId("invite-button").click();
  const panel = screen.getByTestId("invite-panel");
  await expect.element(panel).toBeVisible();
  const box = panel.element().getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(window.innerWidth);
  expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);

  await screen.getByTestId("invite-panel-close").click();
  await expect.element(panel).not.toBeInTheDocument();
  await expect.element(screen.getByTestId("invite-button")).toHaveFocus();
});

// The enlarged code is for the room, so the presenter clicks on it — to focus
// the window, or by habit — before pressing Escape. That click used to drop
// focus out of the overlay: from the lobby card Escape then did nothing, from
// the invite panel it closed both layers at once.
test("Escape still closes only the enlarged code after a click on it", async () => {
  const boardId = "b2".repeat(16);
  const lobby = await render(<ShareLink boardId={boardId} />);
  await lobby.getByTestId("qr-enlarge").click();
  const large = lobby.getByTestId("qr-fullscreen");
  await large.getByTestId("qr-code").click();
  await userEvent.keyboard("{Escape}");
  await expect.element(large).not.toBeInTheDocument();
  await lobby.unmount();

  const screen = await render(<InviteButton boardId={boardId} />);
  await screen.getByTestId("invite-button").click();
  await screen.getByTestId("qr-enlarge").click();
  await screen.getByTestId("qr-fullscreen").getByTestId("qr-code").click();
  // The click did not count as focus leaving the popover either.
  await expect.element(screen.getByTestId("invite-panel")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(screen.getByTestId("qr-fullscreen"))
    .not.toBeInTheDocument();
  await expect.element(screen.getByTestId("invite-panel")).toBeVisible();
  await expect.element(screen.getByTestId("qr-enlarge")).toHaveFocus();
});

// The board puts its own layers above the page: the canvas zoom control at
// z-40 and the notice toasts at z-50, both later in the DOM than the header.
// Rendered inside the panel, the full-screen code was capped at the panel's
// z-40 and drawn beneath them on the projector; the zoom control stayed
// clickable through it.
test("the enlarged code and the dropdown sit above the board's own layers", async () => {
  await page.viewport(1280, 800);
  const boardId = "c3".repeat(16);
  const screen = await render(
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <InviteButton boardId={boardId} />
    </div>,
  );
  await screen.getByTestId("invite-button").click();
  const panel = screen.getByTestId("invite-panel");
  await expect.element(panel.getByTestId("qr-code")).toBeVisible();

  // Stand-ins for the zoom control and a toast, appended after the app.
  const layers = [40, 50].map((zIndex) => {
    const layer = document.createElement("div");
    layer.style.cssText = `position: fixed; inset: 0; z-index: ${zIndex}`;
    return layer;
  });
  function topAt(x: number, y: number) {
    return document.elementFromPoint(x, y);
  }
  try {
    document.body.append(layers[0]!);
    const box = panel.element().getBoundingClientRect();
    const centre = [
      box.left + box.width / 2,
      box.top + box.height / 2,
    ] as const;
    expect(panel.element().contains(topAt(...centre))).toBe(true);

    await screen.getByTestId("qr-enlarge").click();
    const large = screen.getByTestId("qr-fullscreen");
    await expect.element(large).toBeVisible();
    document.body.append(layers[1]!);
    for (const [x, y] of [centre, [10, 10], [1270, 790]] as const) {
      expect(large.element().contains(topAt(x, y))).toBe(true);
    }
  } finally {
    for (const layer of layers) layer.remove();
  }
});
