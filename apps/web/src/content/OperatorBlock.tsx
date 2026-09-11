// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { isPlaceholder, OPERATOR } from "./operator.js";

export function PlaceholderField({ value }: { value: string }) {
  // A placeholder is rendered as <mark> so it is loud on every screen until
  // operator.ts is filled in — never silently shipped as if it were an address.
  return isPlaceholder(value) ? <mark>{value}</mark> : <>{value}</>;
}

/** Name, postal address and e-mail of the operator, as a postal block. */
export function OperatorBlock({
  emailLabel = "E-Mail:",
}: {
  emailLabel?: string;
}) {
  return (
    <p data-testid="operator-block">
      {OPERATOR.name}
      <br />
      <PlaceholderField value={OPERATOR.street} />
      <br />
      <PlaceholderField value={OPERATOR.city} />
      <br />
      {emailLabel} <PlaceholderField value={OPERATOR.email} />
    </p>
  );
}

/** The operator's e-mail address for use inside running text. */
export function OperatorEmail() {
  return <PlaceholderField value={OPERATOR.email} />;
}
