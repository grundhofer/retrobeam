// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import i18n from "../i18n.js";
import {
  PhaseAnnouncer,
  PhaseGuide,
  type GuideSituation,
} from "./PhaseGuide.js";

// The line under the phase row: what to do now, and whose move it is. The
// engines run with different browser locales, so these pin the keys through
// i18n's own lookup instead of hard-coding one language.
const text = (key: string) => i18n.t(key);

test("members and the facilitator get different lines where their jobs differ", async () => {
  const member = await render(
    <PhaseGuide
      phase="write"
      isAdmin={false}
      anonymous={false}
      situation={null}
    />,
  );
  await expect
    .element(member.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.write.member"));
  await member.unmount();

  const facilitator = await render(
    <PhaseGuide phase="write" isAdmin anonymous={false} situation={null} />,
  );
  await expect
    .element(facilitator.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.write.facilitator"));
});

test("an anonymous board never promises that someone gets picked", async () => {
  for (const isAdmin of [false, true]) {
    const screen = await render(
      <PhaseGuide
        phase="present"
        isAdmin={isAdmin}
        anonymous
        situation={null}
      />,
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
      <PhaseGuide phase={phase} isAdmin anonymous={false} situation={null} />,
    );
    expect(screen.getByTestId("phase-guide").elements()).toHaveLength(0);
    await screen.unmount();
  }
});

// The line fits where you stand (owner, 2026-11-20): it told the person
// presenting „Wenn du gezogen wirst …“, and someone with no votes left to
// spread them.
const standing: GuideSituation = {
  ready: false,
  turn: "waiting",
  votesLeft: null,
};

test("the person presenting is told so, and so is everyone who had a turn", async () => {
  const cases: [GuideSituation["turn"], boolean, string][] = [
    ["now", false, "guide.present.you"],
    ["now", true, "guide.present.you"],
    ["had", false, "guide.present.had"],
    // The facilitator who had a turn still picks the next person.
    ["had", true, "guide.present.facilitator"],
    ["over", false, "guide.present.over"],
    ["waiting", false, "guide.present.member"],
  ];
  for (const [turn, isAdmin, key] of cases) {
    const screen = await render(
      <PhaseGuide
        phase="present"
        isAdmin={isAdmin}
        anonymous={false}
        situation={{ ...standing, turn }}
      />,
    );
    await expect
      .element(screen.getByTestId("phase-guide"))
      .toHaveTextContent(text(key));
    await screen.unmount();
  }
});

test("a member with no votes left is not told to spread them", async () => {
  const done = await render(
    <PhaseGuide
      phase="vote"
      isAdmin={false}
      anonymous={false}
      situation={{ ...standing, votesLeft: 0 }}
    />,
  );
  await expect
    .element(done.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.vote.memberDone"));
  await done.unmount();
  const open = await render(
    <PhaseGuide
      phase="vote"
      isAdmin={false}
      anonymous={false}
      situation={{ ...standing, votesLeft: 2 }}
    />,
  );
  await expect
    .element(open.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.vote.member"));
});

test("a member who is done writing is told so; an anonymous board keeps no promise of a pick", async () => {
  const ready = await render(
    <PhaseGuide
      phase="write"
      isAdmin={false}
      anonymous={false}
      situation={{ ...standing, ready: true }}
    />,
  );
  await expect
    .element(ready.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.write.memberReady"));
  await ready.unmount();
  // Anonymous: nobody is called up, whatever the rotation says.
  const anonymous = await render(
    <PhaseGuide
      phase="present"
      isAdmin={false}
      anonymous
      situation={{ ...standing, turn: "now" }}
    />,
  );
  await expect
    .element(anonymous.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.present.anonymous"));
});

// The group phase (owner, 2026-11-20): everyone sorts, the facilitator
// decides when the topics stand.
test("the group phase tells everyone to stack, and the facilitator when to move on", async () => {
  const member = await render(
    <PhaseGuide
      phase="group"
      isAdmin={false}
      anonymous={false}
      situation={{ ready: false, turn: "over", votesLeft: null }}
    />,
  );
  await expect
    .element(member.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.group.member"));
  await member.unmount();
  const facilitator = await render(
    <PhaseGuide phase="group" isAdmin anonymous situation={null} />,
  );
  await expect
    .element(facilitator.getByTestId("phase-guide"))
    .toHaveTextContent(text("guide.group.facilitator"));
});
