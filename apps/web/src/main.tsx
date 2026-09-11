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
import { ImprintPage } from "./pages/ImprintPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { PrivacyPage } from "./pages/PrivacyPage.js";

// errorElement on every route: a render exception during a live retro must
// offer a way back (the board itself is safe on the server), not a blank page.
//
// The legal pages answer to a German and an English path each; the language
// of the text follows the UI language, not the path, so both spellings of a
// link land on the same page.
const router = createBrowserRouter([
  { path: "/", element: <LandingPage />, errorElement: <ErrorBoundary /> },
  { path: "/new", element: <HomePage />, errorElement: <ErrorBoundary /> },
  {
    path: "/datenschutz",
    element: <PrivacyPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: "/privacy",
    element: <PrivacyPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: "/impressum",
    element: <ImprintPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: "/imprint",
    element: <ImprintPage />,
    errorElement: <ErrorBoundary />,
  },
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
