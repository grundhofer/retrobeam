// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { planJoin } from "../src/domain/join.js";
import type { Participant } from "../src/protocol.js";

const existing: Participant = {
  id: "p1",
  name: "Old Name",
  tone: 1,
  role: "member",
  online: false,
};

describe("planJoin", () => {
  it("creates a new member with a free color", () => {
    const plan = planJoin({
      requestedName: "Anna",
      isAdmin: false,
      existing: null,
      takenTones: [1],
      newId: "p9",
    });
    expect(plan.isNew).toBe(true);
    expect(plan.participant).toMatchObject({
      id: "p9",
      name: "Anna",
      role: "member",
      online: true,
    });
    expect(plan.participant.tone).toBe(2);
  });

  it("grants the facilitator role when the admin token matched", () => {
    const plan = planJoin({
      requestedName: "Anna",
      isAdmin: true,
      existing: null,
      takenTones: [],
      newId: "p9",
    });
    expect(plan.participant.role).toBe("facilitator");
  });

  it("reclaims identity on rejoin: same id and tone, new name, back online", () => {
    const plan = planJoin({
      requestedName: "New Name",
      isAdmin: false,
      existing,
      takenTones: [existing.tone],
      newId: "unused",
    });
    expect(plan.isNew).toBe(false);
    expect(plan.participant).toEqual({
      ...existing,
      name: "New Name",
      online: true,
    });
  });

  it("only ever upgrades the role, never demotes", () => {
    const facilitator: Participant = { ...existing, role: "facilitator" };
    const withoutToken = planJoin({
      requestedName: "Anna",
      isAdmin: false,
      existing: facilitator,
      takenTones: [],
      newId: "unused",
    });
    expect(withoutToken.participant.role).toBe("facilitator");

    const upgraded = planJoin({
      requestedName: "Anna",
      isAdmin: true,
      existing,
      takenTones: [],
      newId: "unused",
    });
    expect(upgraded.participant.role).toBe("facilitator");
  });
});
