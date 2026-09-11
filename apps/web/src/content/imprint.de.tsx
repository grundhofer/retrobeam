// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from "react-router";
import { OperatorBlock } from "./OperatorBlock.js";
import { REPO_URL } from "./operator.js";

export function ImprintDe() {
  return (
    <>
      <h2>Angaben gemäß § 18 Abs. 1 MStV</h2>
      <OperatorBlock />
      <p>
        RetroBeam ist ein privates, nicht gewerbliches Projekt. Es gibt keine
        Umsatzsteuer-Identifikationsnummer, keine Registereintragung und keine
        zuständige Aufsichtsbehörde. Die Angaben nach § 5 DDG werden vorsorglich
        gemacht.
      </p>
      <h2>Datenschutz</h2>
      <p>
        Welche Daten beim Aufruf dieser Seite und bei der Nutzung eines Boards
        verarbeitet werden, steht in der{" "}
        <Link to="/datenschutz">Datenschutzerklärung</Link>.
      </p>
      <h2>Quelltext und Lizenz</h2>
      <p>
        RetroBeam ist freie Software unter der GNU Affero General Public License
        v3.0 oder später. Der Quelltext liegt auf{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        ; der Quelltext der hier laufenden Version ist in der Fußzeile verlinkt.
        Die Software wird ohne Gewährleistung bereitgestellt.
      </p>
    </>
  );
}
