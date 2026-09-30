// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import i18n from "../i18n.js";
import { PhaseAnnouncer, PhaseGuide } from "./PhaseGuide.js";

// The line under the phase row: what to do now, and whose move it is. The
// engines run with different browser locales, so these pin the keys through
// i18n's own lookup instead of hard-coding one language.
const text = (key: string) => i18n.t(key);

test("members and the facilitator get different lines where their jobs differ", async () => {
  const member = await render(
    <PhaseGuide phase="write" isAdmin={false} anonymous={false} />,
  );
  await expect
    .element(member.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.write.member"));
  await member.unmount();

  const facilitator = await render(
    <PhaseGuide phase="write" isAdmin anonymous={false} />,
  );
  await expect
    .element(facilitator.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.write.facilitator"));
});

test("an anonymous board never promises that someone gets picked", async () => {
  for (const isAdmin of [false, true]) {
    const screen = await render(
      <PhaseGuide phase="present" isAdmin={isAdmin} anonymous />,
    );
    await expect
      .element(screen.getByTestId("phase-guide"))
      .toHaveTextContent(text("guide.present.anonymous"));
    await screen.unmount();
  }
});

test("the announcer is a status region that stays mounted, empty in the lobby", async () => {
  // Mounted in the lobby with no text, so the first real line is a CHANGE of
  // an existing live region — the only kind screen readers reliably announce.
  const screen = await render(
    <PhaseAnnouncer phase="lobby" isAdmin={false} anonymous={false} />,
  );
  const region = screen.getByTestId("phase-announcer");
  await expect.element(region).toHaveAttribute("role", "status");
  await expect.element(region).toHaveTextContent("");
  await screen.rerender(
    <PhaseAnnouncer phase="write" isAdmin={false} anonymous={false} />,
  );
  await expect
    .element(screen.getByTestId("phase-announcer"))
    .toHaveTextContent(text("guide.write.member"));
  expect(screen.getByTestId("phase-announcer").elements()).toHaveLength(1);
});

test("the visible line is silent in the lobby and when done", async () => {
  for (const phase of ["lobby", "done"] as const) {
    const screen = await render(
      <PhaseGuide phase={phase} isAdmin anonymous={false} />,
    );
    expect(screen.getByTestId("phase-guide").elements()).toHaveLength(0);
    await screen.unmount();
  }
});
