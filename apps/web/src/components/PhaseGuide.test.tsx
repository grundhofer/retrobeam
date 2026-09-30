// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import i18n from "../i18n.js";
import { PhaseGuide } from "./PhaseGuide.js";

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

test("it is a polite status region, and silent in the lobby and when done", async () => {
  const vote = await render(
    <PhaseGuide phase="vote" isAdmin={false} anonymous={false} />,
  );
  await expect
    .element(vote.getByTestId("phase-guide"))
    .toHaveAttribute("role", "status");
  await vote.unmount();

  for (const phase of ["lobby", "done"] as const) {
    const screen = await render(
      <PhaseGuide phase={phase} isAdmin anonymous={false} />,
    );
    expect(screen.getByTestId("phase-guide").elements()).toHaveLength(0);
    await screen.unmount();
  }
});
