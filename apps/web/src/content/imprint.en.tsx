// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from "react-router";
import { OperatorBlock } from "./OperatorBlock.js";
import { REPO_URL } from "./operator.js";

export function ImprintEn() {
  return (
    <>
      <h2>Information under § 18 (1) MStV</h2>
      <OperatorBlock emailLabel="E-mail:" />
      <p>
        RetroBeam is a private project, not a business; retrobeam.de is run
        without charge and without advertising. There is no VAT ID, no register
        entry and no supervisory authority. The information under § 5 DDG is
        provided as a precaution.
      </p>
      <h2>Privacy</h2>
      <p>
        Which data is processed when you open this site and when you use a board
        is described in the <Link to="/datenschutz">privacy notice</Link>.
      </p>
      <h2>Source and licence</h2>
      <p>
        RetroBeam is free software under the GNU Affero General Public License
        v3.0 or later. The source is on{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        ; the source of the version running here is linked in the footer. The
        software is provided without warranty.
      </p>
    </>
  );
}
