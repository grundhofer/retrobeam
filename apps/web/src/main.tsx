// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "./index.css";
import "./i18n.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { BoardPage } from "./pages/BoardPage.js";
import { HomePage } from "./pages/HomePage.js";

// errorElement on every route: a render exception during a live retro must
// offer a way back (the board itself is safe on the server), not a blank page.
const router = createBrowserRouter([
  { path: "/", element: <HomePage />, errorElement: <ErrorBoundary /> },
  {
    path: "/board/:boardId",
    element: <BoardPage />,
    errorElement: <ErrorBoundary />,
  },
]);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
