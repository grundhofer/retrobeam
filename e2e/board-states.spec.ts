// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers.js";

// The board's own states besides the room (plan stage 3e): a lookup that
// fails is "not reachable" with a way to ask again, and a tab running a build
// from before the last deploy is told so and offered a reload.

async function createBoard(page: Page): Promise<string> {
  await page.goto("/new");
  await page.getByRole("textbox").fill("Sprint 50 retro");
  await page
    .getByRole("button", { name: /create board|board erstellen/i })
    .click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f]{32}$/);
  return page.url();
}

test("a board that cannot be reached says so and asks again on demand", async ({
  browser,
}) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const boardUrl = await createBoard(page);
  const id = boardUrl.split("/").pop()!;

  await page.route(`**/api/boards/${id}`, (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.goto(boardUrl);
  const failed = page.getByTestId("lookup-failed");
  await expect(failed).toBeVisible();
  await expect(failed.getByRole("heading", { level: 1 })).toBeVisible();

  await page.unroute(`**/api/boards/${id}`);
  await failed.getByRole("button").click();
  await expect(page.getByRole("textbox")).toBeVisible();
  await context.close();
});

test("a tab on an older build is offered a reload", async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const boardUrl = await createBoard(page);

  // The server's sync names a newer wire version than this bundle knows.
  await page.routeWebSocket(/\/api\/boards\/[0-9a-f]{32}\/ws$/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && message.startsWith("{")) {
        const event = JSON.parse(message) as {
          type?: string;
          protocolVersion?: number;
        };
        if (event.type === "sync") {
          event.protocolVersion = (event.protocolVersion ?? 0) + 1000;
          ws.send(JSON.stringify(event));
          return;
        }
      }
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });
  await page.goto(boardUrl);
  await page.getByRole("textbox").fill("Anna");
  await page.getByRole("button", { name: /^(join|beitreten)$/i }).click();
  const note = page.getByTestId("stale-build");
  await expect(note).toBeVisible();
  await expect(note.getByRole("button")).toBeVisible();
  await context.close();
});
