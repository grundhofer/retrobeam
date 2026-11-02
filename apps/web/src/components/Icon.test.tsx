// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Icon, symbolOf } from "./Icon.js";

test("at 16 px an icon takes its own master where the sprite has one", () => {
  expect(symbolOf("check", 16)).toBe("check--16");
  expect(symbolOf("check", 24)).toBe("check");
  expect(symbolOf("wheel", 16)).toBe("wheel");
});

test("a name the sprite does not have fails loud", () => {
  expect(() => symbolOf("no-such-icon", 24)).toThrow(/no-such-icon/);
});

test("an icon is a decorative use of its symbol at its size", async () => {
  const screen = await render(<Icon name="check" size={16} />);
  const svg = screen.container.querySelector("svg")!;
  expect(svg.getAttribute("class")).toBe("sb-icon sb-icon--16");
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(svg.querySelector("use")!.getAttribute("href")).toBe("#check--16");
});
