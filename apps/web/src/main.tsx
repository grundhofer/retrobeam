// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "./index.css";
import "./i18n.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { NoIndex } from "./components/NoIndex.js";
import { LEGAL_PATHS } from "./lib/legalPaths.js";
import { AccessibilityPage } from "./pages/AccessibilityPage.js";
import { BoardPage } from "./pages/BoardPage.js";
import { HomePage } from "./pages/HomePage.js";
import { ImprintPage } from "./pages/ImprintPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { PrivacyPage } from "./pages/PrivacyPage.js";

// errorElement on every route: a render exception during a live retro must
// offer a way back (the board itself is safe on the server), not a blank page.
//
// The legal pages answer to a German and an English path each, and the path
// decides the language (F18): /datenschutz, /impressum and /barrierefreiheit
// are German, /privacy, /imprint and /accessibility English, whatever the UI
// language — which a legal page neither changes nor stores (see
// LegalPage.tsx). The paths come from lib/legalPaths.ts, which the links
// between the versions read too.
//
// The board route carries <NoIndex /> beside the page (a board URL is a
// capability — see NoIndex.tsx), and "*" catches every other path, so a
// mistyped link gets a not-found page rather than the error boundary.
const router = createBrowserRouter([
  { path: "/", element: <LandingPage />, errorElement: <ErrorBoundary /> },
  { path: "/new", element: <HomePage />, errorElement: <ErrorBoundary /> },
  {
    path: LEGAL_PATHS.privacy.de,
    element: <PrivacyPage lang="de" />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: LEGAL_PATHS.privacy.en,
    element: <PrivacyPage lang="en" />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: LEGAL_PATHS.imprint.de,
    element: <ImprintPage lang="de" />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: LEGAL_PATHS.imprint.en,
    element: <ImprintPage lang="en" />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: LEGAL_PATHS.accessibility.de,
    element: <AccessibilityPage lang="de" />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: LEGAL_PATHS.accessibility.en,
    element: <AccessibilityPage lang="en" />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: "/board/:boardId",
    element: (
      <>
        <NoIndex />
        <BoardPage />
      </>
    ),
    errorElement: <ErrorBoundary />,
  },
  { path: "*", element: <NotFoundPage />, errorElement: <ErrorBoundary /> },
]);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
