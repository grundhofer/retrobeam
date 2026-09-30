// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import i18n from "../i18n.js";
import { NotFoundPage } from "../pages/NotFoundPage.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

// A mistyped link used to print "Something went wrong … [object Object]": the
// router reports unknown paths and thrown responses as plain objects, and the
// boundary stringified them. Both cases are rendered through a real router
// here, because the router is what builds those objects.

const robotsMeta = () =>
  document.head.querySelectorAll('meta[name="robots"][content="noindex"]');

test("an unmatched path renders the not-found page, not the error text", async () => {
  const router = createMemoryRouter(
    [{ path: "/", element: <p>home</p>, errorElement: <ErrorBoundary /> }],
    { initialEntries: ["/board"] },
  );
  const screen = await render(<RouterProvider router={router} />);

  await expect.element(screen.getByTestId("page-not-found")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { level: 1 }))
    .toHaveTextContent(i18n.t("pageNotFound.title"));
  expect(document.body.textContent).not.toContain("[object Object]");
  expect(document.querySelector('[data-testid="error-boundary"]')).toBeNull();
});

test("any other route error shows its status, not [object Object]", async () => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: () => {
          throw new Response(null, {
            status: 503,
            statusText: "Service Unavailable",
          });
        },
        element: <p>never</p>,
        hydrateFallbackElement: <p>loading</p>,
        errorElement: <ErrorBoundary />,
      },
    ],
    { initialEntries: ["/"] },
  );
  const screen = await render(<RouterProvider router={router} />);

  await expect.element(screen.getByTestId("error-boundary")).toBeVisible();
  await expect
    .element(screen.getByText("503 Service Unavailable"))
    .toBeVisible();
  expect(document.body.textContent).not.toContain("[object Object]");
});

// The worker answers 200 for every path (the SPA shell), so the page itself
// has to keep a typo out of a search index — and has to take that back when
// it unmounts, or the landing page would inherit it.
test("the not-found page shows a whole board link, links home and is noindex while mounted", async () => {
  const before = robotsMeta().length;
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>home</p> },
      { path: "*", element: <NotFoundPage /> },
    ],
    { initialEntries: ["/en"] },
  );
  const screen = await render(<RouterProvider router={router} />);

  await expect
    .element(screen.getByTestId("page-not-found"))
    .toHaveTextContent(`${location.host}/board/…`);
  expect(robotsMeta().length).toBe(before + 1);

  await screen.getByRole("link", { name: i18n.t("pageNotFound.home") }).click();
  await expect.element(screen.getByText("home")).toBeVisible();
  // The tag goes in NoIndex's effect cleanup, which React may run after the
  // new route has painted — so wait for it rather than read it in the same
  // tick (a fast CI runner caught the old immediate read one frame early).
  await vi.waitFor(() => expect(robotsMeta().length).toBe(before));
});
