// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from "react-router";
import { OperatorBlock, PlaceholderField } from "./OperatorBlock.js";
import { ACCESSIBILITY_DATE, AUTHORITY_CHECKED } from "./operator.js";

// German accessibility statement (F17 in docs/sebaro-umbau.md), after the
// template in sebaroDesign's shared/ACCESSIBILITY-STATEMENT.md. It names no
// target level, because under sebaro D103 accessibility can lose a
// trade-off, and it claims no conformance: every check carries one of the four state words (sebaro
// HAL-04), only checks that ran say "bestanden" (ZUG-07), and "keine bekannt"
// stays out until a manual check has run. Not yet reviewed by a lawyer; the
// review comes before it goes live, and it has to replace the sentence that
// says the BFSG question is not legally checked with its own conclusion.
// The page wrapper renders the title and the date line (ACCESSIBILITY_DATE).
export function AccessibilityDe() {
  return (
    <>
      <p>
        Diese Seite beschreibt, wie sich RetroBeam ohne Maus, mit einem
        Screenreader oder mit großer Schrift benutzen lässt, was dafür geprüft
        wurde und was nicht. Ob das Barrierefreiheitsstärkungsgesetz (BFSG) für
        RetroBeam gilt, ist rechtlich nicht geprüft; diese Seite trifft dazu
        keine Aussage.
      </p>

      <h2>Was RetroBeam ist</h2>

      <p>
        RetroBeam ist ein Werkzeug für Retrospektiven im Team. Eine Person
        moderiert und führt die Gruppe durch feste Phasen: Alle schreiben zuerst
        für sich, ein Glücksrad wählt, wer als Nächstes vorstellt, alle stimmen
        verdeckt ab, und die Retro endet mit Anerkennung füreinander. RetroBeam
        ist kostenlos, ohne Anmeldung und ohne Werbung, auf Deutsch und auf
        Englisch. Es ist ein privates, nicht gewerbliches Projekt einer Person.
      </p>

      <h2>So benutzt du RetroBeam</h2>

      <p>
        Wer moderiert, legt ein Board an und teilt den Link oder den QR-Code.
        Teilnehmende öffnen den Link und geben einen Anzeigenamen ein; ein Konto
        oder eine E-Mail-Adresse braucht es nicht. Die Phasen sind Check-in
        (optional), Schreiben, Vorstellen und Gruppieren, Abstimmen, Diskutieren
        und Abschluss; die Moderation kann einzelne Phasen überspringen. Ein
        Board hat das Layout „Spalten“ oder „Canvas“, eine freie Fläche. Das
        Ergebnis lässt sich als Markdown, CSV, JSON, PDF oder JPEG exportieren.
      </p>

      <h3>Tastatur</h3>

      <ul>
        <li>
          Der erste Tabstopp jeder Seite ist der Link „Zum Inhalt“. Er
          erscheint, sobald er den Fokus hat, und führt am Kopf der Seite vorbei
          zum Inhalt.
        </li>
        <li>
          Beim Schreiben einer Karte speichert Enter die Karte, Umschalt+Enter
          beginnt eine neue Zeile. Auf dem Canvas bricht Escape das Schreiben
          ab.
        </li>
        <li>
          Im Layout „Spalten“ öffnet die Schaltfläche „Verschieben oder stapeln“
          (⋯) an einer Karte eine Auswahl: „Verschieben nach“ in eine andere
          Spalte und, beim Vorstellen, „Stapeln mit“ einer anderen Karte. Sie
          ersetzt das Ziehen mit der Maus und steht dort, wo Ziehen erlaubt ist.
          Escape schließt die Auswahl und setzt den Fokus zurück auf die
          Schaltfläche; nach dem Verschieben oder Stapeln steht der Fokus wieder
          an der Karte.
        </li>
        <li>
          Auf dem Canvas öffnet dieselbe Schaltfläche (⋯) an einer Karte eine
          Auswahl: „Verschieben nach“ in eine andere Zone, an eine freie Stelle,
          und Schritte nach oben, unten, links und rechts, als Schaltflächen
          oder mit den Pfeiltasten. Sie ersetzt auch hier das Ziehen. Die
          Schaltfläche „+ Notiz“ öffnet das Schreibfeld für eine neue Karte,
          ohne Doppelklick. „Verkleinern“, „An Fenster anpassen“ und
          „Vergrößern“ sind Schaltflächen.
        </li>
        <li>
          Die Moderation verschiebt Zonen auf dem Canvas und ändert ihre Größe
          über die Schaltfläche „Zonen“ neben dem Zoom: Dort wählt sie eine Zone
          und hat Schritte für Position und Größe, als Schaltflächen oder mit
          den Pfeiltasten. Das ersetzt das Ziehen an der Zone und an ihrem
          Griff. Escape schließt die Auswahl und setzt den Fokus zurück auf die
          Schaltfläche.
        </li>
        <li>
          Das Board-Menü (⋯) und „Einladen“ schließen mit Escape, auf schmalen
          Bildschirmen auch mit ×; der Fokus kehrt dann zur Schaltfläche zurück,
          die sie geöffnet hat. Escape schließt auch die vergrößerte Ansicht des
          QR-Codes, ein zweites Escape die Einladung. Das Menü an einem Avatar
          schließt, sobald der Fokus es verlässt, nicht mit Escape. Wählt die
          Moderation mit verdeckten Karten aus, wer vorstellt, schließt Escape
          diese Kartenauswahl.
        </li>
        <li>
          Bedienelemente sollen einen sichtbaren Fokusrahmen zeigen; geprüft ist
          das nicht für jedes Element.
        </li>
      </ul>

      <h3>Screenreader</h3>

      <p>
        Phasenwechsel, abgelehnte Aktionen, Wechsel beim Vorstellen, das
        Ergebnis des Glücksrads und wer anwesend ist, gibt RetroBeam als
        Statusmeldung aus, einige Fehler als Warnmeldung, damit ein Screenreader
        sie vorlesen kann. Fehlt beim Anlegen eines Boards, beim Beitreten oder
        bei einem neuen Action Item der Name oder Text, steht die Meldung am
        Feld, ist mit ihm verbunden, und der Fokus springt dorthin. Mit einem
        Screenreader getestet ist das nicht.
      </p>

      <h3>Sprache</h3>

      <p>
        Beim ersten Besuch richtet sich die Sprache nach deinem Browser:
        Deutsch, wenn er auf Deutsch eingestellt ist, sonst Englisch. Die Taste
        „DE“ oder „EN“ oben wechselt die Sprache und speichert die Wahl in
        deinem Browser. Auf dieser Seite, dem{" "}
        <Link to="/impressum">Impressum</Link> und der{" "}
        <Link to="/datenschutz">Datenschutzerklärung</Link> führt sie
        stattdessen zur selben Seite in der anderen Sprache und speichert
        nichts.
      </p>

      <h3>Bewegung</h3>

      <p>
        Hast du in deinem System eingestellt, dass du weniger Bewegung möchtest,
        dreht sich das Glücksrad nicht, sondern zeigt sofort, wer dran ist.
        Einblend- und Puls-Animationen und das Konfetti entfallen, und beim
        Vorstellen springt die Ansicht, statt zu scrollen.
      </p>

      <h3>Hell oder Dunkel</h3>

      <p>
        RetroBeam hat nur eine helle Darstellung. Eine Wahl zwischen Hell und
        Dunkel gibt es noch nicht.
      </p>

      <h2>Anforderungen und Prüfstand</h2>

      <p>
        Jede Prüfung unten hat einen von vier Zuständen: bestanden, offen,
        übersprungen (mit Grund) oder nicht bestanden. Die Ergebnisse stammen
        von den Läufen am <PlaceholderField value={ACCESSIBILITY_DATE} />. Die
        automatischen Prüfungen laufen bei Änderungen am Quelltext; eine neue
        Version geht derzeit auch online, ohne auf ihr Ergebnis zu warten.
      </p>

      <h3>Automatische Prüfungen</h3>

      <ul>
        <li>
          Das Werkzeug axe-core 4.14.0 prüft im Browser Chromium bei
          390&nbsp;Pixel und 1440&nbsp;Pixel Breite die Regeln für WCAG 2.0 und
          2.1 (Stufen A und AA) und für WCAG 2.2 (Stufe AA). Auf Deutsch und auf
          Englisch prüft es die Seite zum Anlegen eines Boards, die Seite für
          unbekannte Adressen, Impressum, Datenschutzerklärung und diese Seite,
          nur auf Englisch die Startseite, ein Board in der Lobby und beim
          Schreiben und den Canvas, einmal mit geöffneter Auswahl zum
          Verschieben einer Karte und einmal mit geöffneter Auswahl der Zonen.
          Ergebnis: bestanden auf allen diesen Seiten außer dem Canvas. Auf dem
          Canvas nicht bestanden in vier Punkten: „⋯“, „✎“, „🗑“ und „+ Notiz“
          sind beim angepassten Zoom kleiner als 24&nbsp;Pixel. Das ist als
          bekannte Einschränkung eingetragen. Jeder andere Verstoß lässt die
          Prüfung scheitern. Ein solches Werkzeug findet nur einen Teil
          möglicher Barrieren.
        </li>
        <li>
          Seitliches Scrollen bei 390&nbsp;Pixel und 1440&nbsp;Pixel Breite, auf
          denselben Seiten außer dem Canvas und auf einem Board in der Lobby und
          beim Schreiben: bestanden.
        </li>
        <li>
          Seitliches Scrollen bei 360&nbsp;Pixel Breite mit doppelter
          Schriftgröße (200&nbsp;%), auf denselben Seiten wie oben: bestanden.
        </li>
        <li>
          Eine Prüfung im Quelltext auf zwei zu helle Grautöne für Text, neben
          denen keine Begründung steht: bestanden. Sie misst keinen Kontrast.
        </li>
        <li>
          Tests in Chromium und WebKit, wohin der Fokus nach Escape, nach dem
          Verschieben einer Karte und beim Ergebnis der Retro geht: bestanden.
          Tests in Chromium, Firefox und WebKit, die Karten mit Enter eingeben
          und Ansichten mit Escape schließen: bestanden. Beides ist kein
          Durchgang nur mit der Tastatur.
        </li>
        <li>
          Tests in Chromium, Firefox und WebKit, dass „Zum Inhalt“ der erste
          Tabstopp ist und den Fokus in den Inhalt setzt, dass Karten auf dem
          Canvas ohne Ziehen in eine andere Zone und schrittweise wandern, dass
          die Moderation Zonen ohne Ziehen verschiebt und in der Größe ändert
          und dass die Formulare zum Anlegen eines Boards und zum Beitreten am
          Feld sagen, was fehlt: bestanden. Für das Formular für Action Items
          läuft dieselbe Prüfung als Komponententest in Chromium und WebKit:
          bestanden.
        </li>
        <li>
          Ein Test, der ein Board bei 390&nbsp;Pixel Breite durch alle Phasen
          führt: bestanden. Er prüft die Darstellung, nicht die
          Barrierefreiheit.
        </li>
        <li>
          axe und das seitliche Scrollen in Firefox und WebKit: übersprungen.
          Grund: Diese Prüfungen laufen in einem Browser, damit ihre Ergebnisse
          vergleichbar bleiben.
        </li>
      </ul>

      <h3>Offene Prüfungen</h3>

      <ul>
        <li>
          Screenreader, zum Beispiel VoiceOver, NVDA oder TalkBack: offen.
        </li>
        <li>
          Echte Geräte und Touch-Bedienung, auch die Bildschirmtastatur unter
          iOS: offen.
        </li>
        <li>Ein Durchgang durch alle Aufgaben nur mit der Tastatur: offen.</li>
        <li>
          Die vier festen Aufgaben nur mit der Tastatur – etwas anlegen, es nach
          einer Rückfrage löschen, einen Beleg öffnen, zwischen Hell und Dunkel
          wechseln: offen. Die letzten beiden gibt es in RetroBeam noch nicht.
        </li>
        <li>
          axe für die späteren Phasen eines Boards (Vorstellen, Abstimmen,
          Diskutieren, Abschluss, Ergebnis), für Menüs, Dialoge, das Glücksrad
          und den Canvas außer beim Schreiben mit geöffneter Auswahl zum
          Verschieben: offen.
        </li>
        <li>
          axe für die deutsche Oberfläche der Startseite und eines Boards:
          offen.
        </li>
        <li>Erzwungene Farben und Kontrastmodi des Systems: offen.</li>
        <li>
          Vergrößern im Browser auf 400&nbsp;%, also eine Breite von
          320&nbsp;Pixel: offen. Die Prüfung oben verdoppelt die Schriftgröße;
          das ist nicht dasselbe.
        </li>
        <li>
          Größere Abstände zwischen Zeilen, Absätzen, Wörtern und Buchstaben:
          offen.
        </li>
        <li>Die Exporte als Markdown, CSV, JSON, PDF und JPEG: offen.</li>
      </ul>

      <h2>Bekannte Einschränkungen</h2>

      <p>
        Weil noch keine Prüfung von Hand gelaufen ist, ist diese Liste nicht
        vollständig. RetroBeam wird derzeit auf ein neues Design umgestellt;
        einige Punkte sind dafür geplant.
      </p>

      <ul>
        <li>
          Auf dem Canvas sind die Schaltflächen „⋯“, „✎“, „🗑“ und „+ Notiz“ beim
          angepassten Zoom kleiner als 24&nbsp;Pixel, weil sie mit der Fläche
          verkleinert werden. Die Auswahl zum Verschieben hat volle Größe. Der
          Canvas soll bei der Umstellung neu gebaut werden.
        </li>
        <li>
          Eine Wahl zwischen Hell und Dunkel fehlt. Sie ist für die Umstellung
          geplant.
        </li>
        <li>
          Screenreader, echte Geräte und ein Durchgang nur mit der Tastatur sind
          nicht getestet. Tests nur mit der Tastatur sind für die Umstellung
          geplant.
        </li>
      </ul>

      <h2>Rückmeldung</h2>

      <p>
        Wenn dir in RetroBeam eine Barriere begegnet oder du etwas nicht
        benutzen kannst, schreib an:
      </p>

      <OperatorBlock />

      <p>
        Hilfreich ist, welche Seite es war, welchen Browser und welche
        Hilfsmittel du benutzt. Eine Antwortzeit ist nicht zugesagt.
      </p>

      <h2>Zuständige Behörde</h2>

      <p>
        Für die Marktüberwachung nach dem BFSG ist diese Stelle der Länder
        zuständig:
      </p>

      {/* Name wie auf der Website der Stelle, mit Bindestrich. */}
      <p data-testid="authority-block">
        Marktüberwachungsstelle der Länder für die Barrierefreiheit von
        Produkten und Dienstleistungen - Anstalt öffentlichen Rechts (MLBF AöR)
        <br />
        Carl-Miller-Straße 6
        <br />
        39112 Magdeburg
        <br />
        Telefon: +49 391 289 230 23
        <br />
        E-Mail: kontakt@mlbf-barrierefrei.de
        <br />
        Web:{" "}
        <a
          href="https://www.mlbf-barrierefrei.de/"
          target="_blank"
          rel="noreferrer"
        >
          www.mlbf-barrierefrei.de
        </a>
      </p>

      <p>
        Die Angaben stammen von der Website der Stelle, abgerufen am{" "}
        <PlaceholderField value={AUTHORITY_CHECKED} />.
      </p>
    </>
  );
}
