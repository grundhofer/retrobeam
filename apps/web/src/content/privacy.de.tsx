// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from "react-router";
import { CLOUDFLARE_SETTINGS_CHECKED, WORKERS_DEV_HOST } from "./operator.js";
import {
  OperatorBlock,
  OperatorEmail,
  PlaceholderField,
} from "./OperatorBlock.js";

// German privacy notice. The wording was checked against the implementation,
// but has not been reviewed by a lawyer; docs/07 lists the open legal points.
// The page wrapper renders the title and date line.
export function PrivacyDe() {
  return (
    <>
      <p>
        RetroBeam ist ein kostenloses, nicht-kommerzielles Hobbyprojekt einer
        Privatperson. Es gibt keine Konten, keine Werbung und keine
        Analyse-Werkzeuge; die Anwendung setzt keine Cookies. Diese Erklärung
        beschreibt trotzdem vollständig, welche Daten beim Aufruf von
        retrobeam.de und bei der Nutzung eines Retro-Boards verarbeitet werden,
        wo das geschieht, wie lange, und welche Rechte Sie haben.
      </p>

      <h2>1. Verantwortlicher</h2>

      <p>
        Verantwortlich im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:
      </p>

      <OperatorBlock />

      <p>
        Es gibt keinen Datenschutzbeauftragten; eine Benennungspflicht besteht
        für dieses private, nicht-kommerzielle Angebot nicht.
      </p>

      <h2>2. Hosting und technischer Betrieb</h2>

      <h3>2.1 Cloudflare</h3>

      <p>
        Die Anwendung läuft auf der Plattform von{" "}
        <strong>Cloudflare, Inc.</strong>, 101 Townsend St, San Francisco, CA
        94107, USA, in den Produkten „Cloudflare Workers“ (Anwendungscode) und
        „Durable Objects“ (Speicherung der Boards). Die Board-Daten werden in
        einem Durable Object mit der Zuständigkeit „EU“ (Cloudflare-Jurisdiction{" "}
        <em>eu</em>) gespeichert, das heißt: die dauerhafte Speicherung und die
        Board-Logik (das Durable Object) sind auf Rechenzentren in der
        Europäischen Union festgelegt. Der vorgeschaltete Worker läuft am
        jeweils nächstgelegenen Cloudflare-Standort — auch außerhalb der EU —
        und verarbeitet Board-Inhalte dort flüchtig, zum Beispiel beim
        Weiterleiten der Verbindung, beim Entgegennehmen des Board-Namens beim
        Anlegen, beim Übernehmen der Struktur beim Duplizieren und beim Erzeugen
        der Export-Datei; gespeichert wird dort nichts.
      </p>

      <p>Zwei Einschränkungen dazu, offen benannt:</p>

      <ul>
        <li>
          Die verschlüsselte Verbindung (TLS) endet am jeweils nächstgelegenen
          Cloudflare-Rechenzentrum. Eine vollständige Netzwerk-Residenz in der
          EU ist bei Cloudflare ein Unternehmensprodukt, das dieses Hobbyprojekt
          nicht nutzt. Ihre Anfragen werden also möglicherweise an einem
          Standort außerhalb der EU entgegengenommen und — wie oben beschrieben
          — flüchtig verarbeitet, bevor sie das EU-Durable-Object erreichen.
        </li>
        <li>
          Cloudflare ist ein US-Unternehmen und unterliegt unabhängig vom
          Speicherort dem US CLOUD Act. Ausgleichend gelten der EU-US Data
          Privacy Framework (Cloudflare ist zertifiziert) sowie die
          Standardvertragsklauseln der EU-Kommission; hinzu kommt, dass die
          Daten wenig sensibel, auf das Nötigste beschränkt und kurzlebig sind.
        </li>
      </ul>

      <p>
        Cloudflare verarbeitet als Betreiber seines Netzes eigene technische
        Daten zu jeder Anfrage (u. a. IP-Adresse, aufgerufene Adresse,
        Zeitpunkt, Browser-Kennung), um das Netz zu betreiben, vor Angriffen zu
        schützen und Fehler zu erkennen. Diese Verarbeitung findet in
        Cloudflares eigenen Systemen statt; Einzelheiten stehen in der
        Datenschutzerklärung von Cloudflare (
        <a
          href="https://www.cloudflare.com/privacypolicy/"
          target="_blank"
          rel="noreferrer"
        >
          https://www.cloudflare.com/privacypolicy/
        </a>
        ). Ein Vertrag zur Auftragsverarbeitung mit Cloudflare besteht über
        Cloudflares Standard-Datenverarbeitungszusatz.
      </p>

      <p>
        Rechtsgrundlage für das Hosting: Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse am sicheren, kostenlosen und stabilen Betrieb
        des Angebots).
      </p>

      <h3>2.2 Was die Anwendung selbst protokolliert — und was nicht</h3>

      <ul>
        <li>
          Die Anwendung schreibt <strong>keine Zugriffsprotokolle</strong>.
          Cloudflares „Invocation Logs“, die die vollständige Anfrage-Adresse
          für einige Tage aufbewahren würden, sind für diese Anwendung
          ausdrücklich abgeschaltet. Das ist Absicht: die Adresse eines Boards
          ist gleichzeitig der Zugangsschlüssel dazu (siehe Abschnitt 3.5), und
          auch GIF-Suchbegriffe stehen in Anfrage-Adressen.
        </li>
        <li>
          Was übrig bleibt, sind reine Fehlermeldungen (
          <code>console.error</code>), die die Anwendung in seltenen Fällen
          ausgibt — etwa wenn eine geplante Löschung nicht eingeplant werden
          konnte oder der GIF-Anbieter nicht antwortet. Diese Meldungen
          enthalten eine kurze Bezeichnung des Fehlers, bei Störungen auch die
          technische Fehlermeldung (der Plattform oder des GIF-Anbieters), und
          in einem Fall den Hostnamen einer abgelehnten Bild-Adresse (wenn ein
          Client versucht, ein GIF von einem anderen Host als klipy.com
          einzufügen) — nie Board-Inhalte wie Notiz- oder Kudo-Texte, Titel oder
          Spaltennamen, nie Namen, nie IP-Adressen. Sie landen in Cloudflares
          Worker-Logs und unterliegen dort Cloudflares Aufbewahrungsfristen.
        </li>
        <li>
          Die Anwendung <strong>speichert keine IP-Adressen</strong>. Eine
          Ausnahme muss ehrlich genannt werden: Um zu verhindern, dass ein
          Skript in kurzer Zeit tausende Boards anlegt und damit das kostenlose
          Kontingent für alle aufbraucht, wird beim{" "}
          <strong>Anlegen und Duplizieren eines Boards</strong> die IP-Adresse
          des Anfragenden (Header <code>cf-connecting-ip</code>) als
          Zählschlüssel verwendet. Dieser Zähler lebt ausschließlich im
          Arbeitsspeicher eines einzelnen Durable Objects, wird nie auf einen
          Datenträger geschrieben, ist nicht an die EU gebunden (er enthält nach
          Auffassung des Betreibers keine Board-Daten) und wird spätestens
          wenige Minuten nach der letzten Anfrage verworfen. Zwei Mechanismen
          greifen dabei: Der Zähler ist 60 Sekunden nach der letzten Anfrage
          wieder „voll“ und wird bei der nächsten Bereinigung gelöscht; diese
          Bereinigung wird durch eine spätere Anfrage (irgendeines Nutzers)
          ausgelöst und läuft höchstens einmal pro Minute. Bleibt jede weitere
          Anfrage aus, entfernt Cloudflare das inaktive Durable Object samt
          Zählern aus dem Arbeitsspeicher — laut Cloudflares Dokumentation
          derzeit nach etwa 10 Sekunden, spätestens nach 70–140 Sekunden
          Inaktivität. Ein sekundengenauer Zeitpunkt lässt sich nicht zusichern;
          die Obergrenze von wenigen Minuten beruht auf dem dokumentierten
          Verhalten der Plattform, nicht auf einer vertraglichen Zusage.
          Zusätzlich läuft vorgeschaltet Cloudflares eigene
          Rate-Limiting-Funktion mit demselben IP-Schlüssel; deren flüchtige
          Zähler verwaltet Cloudflare. Die GIF-Suche wird nicht pro IP, sondern
          pro Board gedrosselt.
        </li>
      </ul>

      <p>
        Rechtsgrundlage für die Missbrauchsbremse: Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse, das kostenlose Angebot vor Überlastung zu
        schützen).
      </p>

      <h2>3. Was verarbeitet wird, wenn Sie ein Board nutzen</h2>

      <h3>3.1 Die Daten</h3>

      <p>
        RetroBeam hat keine Nutzerkonten. Sie treten einem Board über dessen
        Link bei und wählen dabei selbst einen Anzeigenamen — ein Pseudonym ist
        ausdrücklich in Ordnung. Im Board werden dann gespeichert:
      </p>

      <div
        className="table-scroll"
        role="region"
        aria-label="Gespeicherte Board-Daten"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Daten</th>
              <th>Herkunft</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Anzeigename (selbst gewählt), zugewiesene Farbe, Rolle
                (Teilnehmer/Moderator; ggf. Vermerk, dass eine Moderatorrolle
                entzogen wurde), Online-Status, „Bereit“-Status, Zeitpunkt des
                Beitritts und der letzten Aktivität
              </td>
              <td>Ihr Beitritt</td>
            </tr>
            <tr>
              <td>
                Ein zufälliger Sitzungsschlüssel, den Ihr Browser vor dem ersten
                Beitritt erzeugt (damit Sie nach einem Neuladen wieder „Sie“
                sind)
              </td>
              <td>Ihr Browser</td>
            </tr>
            <tr>
              <td>
                Notizen (Text, Spalte, Position, Zugehörigkeit zu einem
                Kartenstapel, Erstellungszeitpunkt, optional die Adresse eines
                GIFs), jeweils verknüpft mit dem Verfasser
              </td>
              <td>Ihre Eingaben</td>
            </tr>
            <tr>
              <td>
                Reaktionen (Emoji pro Notiz und Person), Stimmen (Anzahl pro
                Karte und Person). Bei neu angelegten Boards wird nach Abschluss
                der Abstimmung allen Teilnehmern angezeigt, wer für welche Karte
                gestimmt hat; die Abstimmungsleiste sagt vor der ersten Stimme,
                ob Namen gezeigt werden. Der Moderator kann die Namensanzeige
                jederzeit abschalten; einschalten kann er sie nur, solange noch
                niemand abgestimmt hat. Ein dupliziertes Board übernimmt die
                Einstellung des Originals. Mit hinzugeschalteten Personennamen
                enthält der Export diese Namen ebenfalls (Abschnitt 3.4).
              </td>
              <td>Ihre Eingaben</td>
            </tr>
            <tr>
              <td>
                Aktionspunkte (Text, optional eine verantwortliche Person,
                Status, Erstellungszeitpunkt)
              </td>
              <td>Eingaben im Board</td>
            </tr>
            <tr>
              <td>
                Kudos (Kartentyp, Empfänger, optional Absender, Text, optional
                GIF-Adresse, Erstellungszeitpunkt)
              </td>
              <td>Ihre Eingaben</td>
            </tr>
            <tr>
              <td>
                ROTI-Bewertung („Return on Time Invested“, eine Zahl), verknüpft
                mit Ihrem Teilnehmereintrag; angezeigt wird nur der
                Durchschnitt, einmalig, und erst ab drei Bewertungen
              </td>
              <td>Ihre Eingabe</td>
            </tr>
            <tr>
              <td>
                Board-Name, Spalten (Name, Reihenfolge, ausgeblendet ja/nein,
                Lage auf der Fläche), Arbeitsvereinbarungen,
                Board-Einstellungen, Phase, Timer, Ablaufzustand der
                Vorstellungsrunde (wer bereits vorgestellt hat, wer gerade dran
                ist, wen der Moderator ausgenommen hat), die gerade
                hervorgehobene Karte sowie der veröffentlichte ROTI-Durchschnitt
              </td>
              <td>Moderator / Ablauf des Boards</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        Der Moderator sieht während der Vorstellungsrunde bereits alle Karten,
        einschließlich der Karten in ausgeblendeten Spalten. Die übrigen
        Teilnehmer bekommen die Karten aus den für sie sichtbaren Spalten nach
        und nach zu sehen. Vor der Aufdeckung sieht niemand — auch der Moderator
        nicht — die Notizen anderer; die Schreibphase wird serverseitig
        durchgesetzt, fremde Entwürfe werden gar nicht erst übertragen.
        Zusätzlich zu den in der Tabelle genannten Statusdaten (Online- und
        „Bereit“-Status) erfahren Teilnehmer in der Schreibphase für die jeweils
        sichtbaren Spalten, dass eine Person dort gerade schreibt (Name und
        Spalte, kein Inhalt, keine Länge) und wie viele Karten das Team je
        Spalte bereits angelegt hat.
      </p>

      <h3>3.2 Wo</h3>

      <p>
        Ausschließlich im Durable Object dieses einen Boards, in der EU
        (Abschnitt 2.1). Es gibt keine zentrale Datenbank und kein Verzeichnis
        aller Boards; die Anwendung selbst legt keine Sicherungskopien an.
        Cloudflare hält für diese Speicherart (SQLite-gestützte Durable Objects)
        plattformseitig eine Wiederherstellungshistorie vor (Abschnitt 3.3).
      </p>

      <h3>3.3 Wie lange</h3>

      <ul>
        <li>
          Ein Board löscht sich{" "}
          <strong>90 Tage nach seiner Erstellung automatisch</strong>. Die
          Anwendung löscht dabei sämtliche Zeilen aller Tabellen des Boards:
          Notizen, Reaktionen, Stimmen, Aktionspunkte, Kudos, ROTI-Bewertungen,
          Spalten, Teilnehmer und Board-Metadaten. Der Link führt danach zu
          „Board nicht gefunden“, wie bei einem Board, das nie angelegt wurde.
        </li>
        <li>
          Der Moderator kann das Board <strong>jederzeit früher löschen</strong>{" "}
          („Jetzt löschen“ im Board-Menü). Die Anwendung löscht die Daten
          sofort. Für beide Löschwege gilt: Cloudflare hält für SQLite-gestützte
          Durable Objects plattformseitig eine Wiederherstellungshistorie vor —
          laut Cloudflares Dokumentation bis zu 30 Tage —, aus der nur der
          Betreiber über eine Programmierschnittstelle wiederherstellen könnte.
          Die Anwendung nutzt diese Funktion nicht; eine Abschaltmöglichkeit ist
          nicht dokumentiert. Erst nach Ablauf dieser Frist sind gelöschte Daten
          auch plattformseitig verschwunden.
        </li>
        <li>
          Der Moderator kann die automatische Löschung auch{" "}
          <strong>abschalten</strong> („Behalten“). Ein so behaltenes Board
          bleibt gespeichert, bis der Moderator es von Hand löscht. Der
          Moderator sieht im Board-Menü, ob und wann sich das Board löscht; die
          übrigen Teilnehmer sehen diese Angabe derzeit nicht und erfahren die
          Löschfrist nur über ihn.
        </li>
        <li>
          Beim <strong>Duplizieren</strong> eines Boards wird nur die Struktur
          (Board-Name — in der Anwendung als „Kopie von …“ —, Spalten
          einschließlich ausgeblendeter Spalten, die ausgeblendet bleiben,
          Einstellungen, Arbeitsvereinbarungen) in ein neues Board mit frischer
          90-Tage-Frist übernommen — keine Notizen, Stimmen, Teilnehmer, Kudos
          oder Bewertungen.
        </li>
      </ul>

      <h3>3.4 Export</h3>

      <p>
        Wer den Board-Link kennt, kann das Board als Markdown, CSV, JSON oder
        PDF exportieren sowie als JPEG-Bild, das Ihr Browser selbst aus dem
        JSON-Export zeichnet (der Server erzeugt kein Bild; für das Bild gelten
        dieselben Inhaltsregeln wie für den JSON-Export). Der Export enthält bei
        Notizen, ausgeblendeten Spalten und Abstimmungen nur, was ein Teilnehmer
        ohne besondere Rolle zu diesem Zeitpunkt auch auf dem Bildschirm sehen
        dürfte: noch nicht aufgedeckte Notizen, ausgeblendete Spalten und
        laufende Abstimmungen fehlen. Kudos werden dagegen unabhängig von der
        aktuellen Phase exportiert, sobald sie geschrieben wurden — also auch
        dann, wenn der Moderator das Board nach der Abschlussphase in eine
        frühere Phase zurückgesetzt hat und die Kudos-Wand deshalb gerade nicht
        angezeigt wird.{" "}
        <strong>Personennamen sind standardmäßig nicht enthalten</strong> — das
        gilt für Verfasser von Notizen, Absender von Kudos, verantwortliche
        Personen bei Aktionspunkten und die Namen der Abstimmenden (soweit das
        Board sie anzeigt, Abschnitt 3.1); sie lassen sich beim Export gezielt
        hinzuschalten. Eine Ausnahme: Der vollständige Export nennt den
        Anzeigenamen des Empfängers eines Kudos immer, sofern das Kudo an eine
        Person gerichtet ist. Nur die Variante „Zusammenfassung“ (die am
        höchsten bewerteten Karten und die Aktionspunkte, keine Kudos-Wand)
        enthält mit der Standardeinstellung gar keine Personennamen. Was Sie
        exportieren, liegt danach bei Ihnen; auf dem Server bleibt vom Export
        nichts zurück.
      </p>

      <h3>3.5 Der Link ist der Schlüssel — bitte lesen</h3>

      <p>
        Ein Board hat keine Zugangskontrolle außer seinem Link: Die Adresse
        enthält eine zufällige 128-Bit-Kennung, und{" "}
        <strong>
          wer den Link hat, kann die für Teilnehmer freigegebenen Teile des
          Boards lesen
        </strong>{" "}
        — nach der Aufdeckung einschließlich aller Notizen in sichtbaren
        Spalten, und jederzeit den entsprechend gefilterten Export abrufen.
        Geben Sie den Link nur an Ihr Team weiter, posten Sie ihn nicht in
        offenen Kanälen, und bedenken Sie, dass er in Chat-Verläufen und
        Browser-Historien stehen bleibt. Die Anwendung sendet den Link
        ihrerseits nie an Dritte weiter (kein Referer, Abschnitt 5).
      </p>

      <p>
        Der Moderator besitzt zusätzlich einen Admin-Schlüssel, der nur in
        seinem Browser liegt (Abschnitt 4) und nie in einer Adresse auftaucht.
      </p>

      <h3>3.6 Rechtsgrundlage</h3>

      <p>
        Sie nutzen ein Retro-Board, weil Sie oder Ihr Team es angefordert haben;
        die Verarbeitung der oben genannten Daten ist genau das, was nötig ist,
        um dieses Board bereitzustellen. Rechtsgrundlage ist daher Art. 6 Abs. 1
        lit. b DSGVO (Erfüllung eines unentgeltlichen Nutzungsverhältnisses, das
        durch das Anlegen bzw. Beitreten zustande kommt), ergänzend Art. 6 Abs.
        1 lit. f DSGVO (berechtigtes Interesse, ein funktionierendes,
        missbrauchsarmes Angebot bereitzustellen). Für die Kernfunktion wird{" "}
        <strong>keine Einwilligung</strong> eingeholt und keine benötigt; es
        gibt deshalb auch keinen Zustimmungsdialog.
      </p>

      <p>
        Nutzen Sie RetroBeam im Rahmen Ihrer Arbeit, ist Ihr Arbeitgeber
        gegebenenfalls selbst datenschutzrechtlich verantwortlich für die
        Entscheidung, das Werkzeug einzusetzen; das berührt diese Erklärung
        nicht.
      </p>

      <h2>4. Speicherung in Ihrem Browser (localStorage) — keine Cookies</h2>

      <p>
        Die Anwendung setzt <strong>keine Cookies</strong>, weder eigene noch
        fremde. Stattdessen legt sie wenige Einträge im lokalen Speicher Ihres
        Browsers (localStorage) ab. Diese verlassen Ihren Browser nur, wenn die
        Anwendung sie braucht (welche Einträge wann übertragen werden, steht
        unter der Tabelle), und werden nie zu Zwecken der Wiedererkennung über
        Boards hinweg verwendet:
      </p>

      <div
        className="table-scroll"
        role="region"
        aria-label="Lokale Browser-Speicherung"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Schlüssel</th>
              <th>Inhalt</th>
              <th>Zweck</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>retrobeam.name</code>
              </td>
              <td>Ihr zuletzt verwendeter Anzeigename</td>
              <td>Vorausfüllen beim nächsten Beitritt</td>
            </tr>
            <tr>
              <td>
                <code>retrobeam.lang</code>
              </td>
              <td>Gewählte Sprache (de/en)</td>
              <td>Sprache merken</td>
            </tr>
            <tr>
              <td>
                <code>retrobeam.sound</code>
              </td>
              <td>Ton an/aus</td>
              <td>Einstellung merken</td>
            </tr>
            <tr>
              <td>
                <code>retrobeam.board.{"<Board-ID>"}.sessionKey</code>
              </td>
              <td>Zufälliger Sitzungsschlüssel für genau dieses Board</td>
              <td>Nach Neuladen derselbe Teilnehmer bleiben</td>
            </tr>
            <tr>
              <td>
                <code>retrobeam.board.{"<Board-ID>"}.adminToken</code>
              </td>
              <td>Admin-Schlüssel (nur beim Ersteller eines Boards)</td>
              <td>Moderatorrechte ohne Konto</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        Diese Einträge bleiben bestehen, bis Sie sie löschen
        (Browser-Einstellungen: Website-Daten für die verwendete Adresse
        löschen, in der Regel retrobeam.de; siehe Abschnitt 9 zu weiteren
        Adressen). Es werden keine Einträge zu Analyse-, Werbe- oder
        Tracking-Zwecken abgelegt. Der Browser hängt keinen dieser Einträge von
        sich aus an Anfragen an (anders als bei Cookies). Die Anwendung
        überträgt sie in genau diesen Fällen: Beim Beitritt zu einem Board — und
        bei jeder automatischen Neuverbindung, etwa nach einer Netzunterbrechung
        — sendet sie Anzeigename, Sitzungsschlüssel und, falls vorhanden, den
        Admin-Schlüssel dieses Boards an das jeweilige Board; der
        Admin-Schlüssel geht außerdem beim Duplizieren eines Boards mit; die
        gewählte Sprache wird beim Anlegen eines Boards übermittelt, damit die
        Standardspalten in dieser Sprache benannt werden, und bei jeder
        GIF-Suche an den RetroBeam-Server (Abschnitt 5). Die Toneinstellung
        verlässt den Browser nie. Ist der lokale Speicher nicht verfügbar (z. B.
        privater Modus), arbeitet die Anwendung mit einem Ersatz im
        Arbeitsspeicher, der mit dem Tab endet.
      </p>

      <p>
        Das Speichern dieser Einträge ist nach § 25 Abs. 2 Nr. 2 TDDDG von der
        Einwilligungspflicht ausgenommen, weil es unbedingt erforderlich ist, um
        den von Ihnen ausdrücklich gewünschten Dienst — Ihr Board, Ihre Sitzung,
        Ihre Sprache — bereitzustellen. Deshalb gibt es keinen Cookie-Banner.
      </p>

      <h2>5. GIFs (KLIPY)</h2>

      <p>
        Teilnehmer können Notizen und Kudos mit animierten GIFs versehen. Die
        GIFs stammen von <strong>KLIPY</strong>, einem Dienst der Kikliko, Inc.,
        USA. Der Moderator kann GIFs für ein Board abschalten
        (Board-Einstellungen); danach werden keine Suchen mehr ausgeführt und
        keine neuen GIF-Adressen gespeichert. Bereits eingefügte GIFs bleiben in
        den Karten gespeichert und werden weiterhin von KLIPYs CDN geladen, bis
        die betreffende Notiz bzw. das Kudo gelöscht wird oder das Board
        gelöscht ist.
      </p>

      <p>Zwei getrennte Vorgänge:</p>

      <ol>
        <li>
          <strong>Suche.</strong> Ihre Suchbegriffe gehen an den
          RetroBeam-Server, und erst dieser fragt KLIPY. Übermittelt werden an
          KLIPY der Suchbegriff (auch Zwischenstände, während Sie tippen — die
          Suche läuft nach einer kurzen Tipppause automatisch), die Sprache
          Ihrer Oberfläche (de/en) und der Schlüssel des Betreiberkontos; keine
          Kennung, die auf Sie hinweist. KLIPY sieht dabei ausschließlich die
          Server-Adresse, nie Ihre IP-Adresse, und der Jugendschutzfilter ist
          serverseitig fest auf die strengste Stufe (
          <code>content_filter=g</code>) gesetzt. Suchbegriffe werden auf dem
          Server nicht gespeichert (Abschnitt 2.2). Die Suche ist nur aus einem
          Board heraus möglich und wird pro Board gedrosselt.
        </li>
        <li>
          <strong>Anzeige der Bilder.</strong> Die Bilddateien selbst — sowohl
          die Vorschaubilder der Suchergebnisse als auch jedes in eine Notiz
          oder ein Kudo eingefügte GIF — lädt{" "}
          <strong>Ihr Browser direkt</strong> vom Content-Delivery-Netz des
          Anbieters (derzeit <code>static.klipy.com</code>). In Notizen und
          Kudos speichert die Anwendung nur Bildadressen von klipy.com oder
          einer seiner Unterdomains (verschlüsselt, https); die Vorschaubilder
          einer Suche und die Vorschau eines gerade ausgewählten GIFs lädt Ihr
          Browser von der https-Adresse, die KLIPYs Schnittstelle für das
          jeweilige Ergebnis nennt — dort erzwingt die Anwendung keinen
          bestimmten Host. Dabei erfährt KLIPYs CDN zwangsläufig Ihre
          IP-Adresse, Browser-Kennung und die angeforderte Bildadresse — bei
          Suchergebnissen für alle angezeigten Vorschaubilder, bei eingefügten
          GIFs für jeden Teilnehmer, der die Karte sieht. Die Adresse Ihres
          Boards wird dabei <strong>nicht</strong> übermittelt (Referrer-Policy{" "}
          <code>no-referrer</code>, sowohl für die ganze Seite als auch für
          jedes einzelne Bild). Was KLIPY mit diesen Zugriffsdaten macht, regelt
          dessen Datenschutzerklärung (
          <a
            href="https://klipy.com/privacy-policy"
            target="_blank"
            rel="noreferrer"
          >
            https://klipy.com/privacy-policy
          </a>
          ); es handelt sich um eine Übermittlung in die USA, für die keine
          Angemessenheitsgarantie des Betreibers besteht.
        </li>
      </ol>

      <p>
        Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an
        einer Bildfunktion, die Ihr Team in einem Board nutzen möchte). Wer
        keinen Bildabruf bei KLIPY möchte, bittet den Moderator, GIFs für das
        Board abzuschalten — das verhindert neue Suchen und neue GIF-Adressen;
        bereits eingefügte GIFs werden weiterhin geladen, solange die Karte
        besteht —, oder verwendet die Funktion nicht; die Vorschaubilder werden
        nur geladen, wenn Sie selbst eine Suche eingeben.
      </p>

      <h2>6. Was es nicht gibt</h2>

      <ul>
        <li>keine Web-Analyse, keine Zählpixel, kein Fingerprinting;</li>
        <li>
          keine Schriftarten, Skripte oder Stylesheets von fremden Servern
          (alles wird von retrobeam.de selbst ausgeliefert; Emojis sind
          gewöhnliche Unicode-Zeichen, die Ihr Gerät mit seiner eigenen Schrift
          darstellt — es werden keine Emoji-Daten nachgeladen);
        </li>
        <li>keine Werbung, keine Werbenetzwerke;</li>
        <li>
          keine Profilbildung, keine automatisierten Entscheidungen im Sinne von
          Art. 22 DSGVO;
        </li>
        <li>
          keine Zusammenführung von Daten über mehrere Boards hinweg (der
          Betreiber weiß nicht, wer welche Boards nutzt).
        </li>
      </ul>

      <p>
        Der Quelltext von RetroBeam ist unter der AGPL-3.0-or-later
        veröffentlicht; die Aussagen zur Anwendung selbst lassen sich dort
        nachprüfen. Die Einstellungen des Cloudflare-Kontos (kein
        Web-Analytics-Beacon, keine Bot-Schutz-Cookies, keine Challenge-Seiten)
        sind nicht Teil des Quelltexts; der Betreiber hat sie am{" "}
        <PlaceholderField value={CLOUDFLARE_SETTINGS_CHECKED} /> überprüft. Die
        Fußzeile der Anwendung verlinkt auf den genau laufenden Stand bei
        GitHub. Der Aufruf dieses Links führt Sie zu GitHub, Inc.; dabei wird
        die Board-Adresse nicht als Referer übermittelt.
      </p>

      <h2>7. Empfänger und Übermittlung in Drittländer</h2>

      <div
        className="table-scroll"
        role="region"
        aria-label="Empfänger und Drittlandübermittlungen"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Empfänger</th>
              <th>Was</th>
              <th>Grundlage für die Übermittlung</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cloudflare, Inc. (USA) — Auftragsverarbeiter</td>
              <td>
                Alle Daten aus Abschnitt 2 und 3 (Board-Daten in
                EU-Rechenzentren gespeichert; Verbindungsdaten am
                nächstgelegenen Edge)
              </td>
              <td>
                EU-US Data Privacy Framework, ergänzend Standardvertragsklauseln
              </td>
            </tr>
            <tr>
              <td>Kikliko, Inc. / KLIPY (USA)</td>
              <td>
                Nur beim Laden von GIF-Bildern: IP-Adresse, Browser-Kennung,
                Bildadresse (Abschnitt 5). Suchbegriffe (auch Zwischenstände
                beim Tippen) und Oberflächensprache (de/en), ohne Ihre
                IP-Adresse.
              </td>
              <td>
                Art. 49 Abs. 1 lit. b DSGVO / berechtigtes Interesse; für neue
                GIFs abschaltbar
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        Sonst niemand. Der Betreiber gibt keine Daten an weitere Dritte weiter,
        verkauft nichts und gibt Board-Inhalte nur heraus, wenn er gesetzlich
        dazu verpflichtet ist.
      </p>

      <h2>8. Ihre Rechte</h2>

      <p>
        Sie haben nach der DSGVO das Recht auf Auskunft (Art. 15), Berichtigung
        (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
        Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf
        Grundlage des berechtigten Interesses (Art. 21). Außerdem können Sie
        sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77), etwa
        bei der für Ihren Wohnort zuständigen Landesbehörde.
      </p>

      <p>
        Die praktische Seite, ehrlich beschrieben: Der Betreiber kann{" "}
        <strong>nicht</strong> erkennen, welche Person hinter einem Anzeigenamen
        steht — es gibt keine Konten, keine E-Mail-Adressen, keine IP-Protokolle
        und kein Verzeichnis der Boards. Eine Anfrage muss deshalb den{" "}
        <strong>Board-Link</strong> nennen (Art. 11 DSGVO), sonst kann der
        Betreiber die Daten nicht zuordnen. Dann gilt:
      </p>

      <ul>
        <li>
          <strong>Auskunft und Datenübertragbarkeit:</strong> Der Export im
          Board (Abschnitt 3.4) liefert die für alle sichtbaren Board-Inhalte,
          standardmäßig ohne Personennamen (Ausnahme: Kudo-Empfänger; Namen
          lassen sich hinzuschalten). Nicht enthalten sind unter anderem
          Reaktionen, die Einzelstimmen pro Person, ROTI-Bewertungen, die
          Teilnehmerliste mit Farbe, Rolle, Beitritts- und Aktivitätszeitpunkten
          und Sitzungsschlüssel, die Zeitstempel einzelner Beiträge,
          GIF-Adressen von Kudos, ausgeblendete Spalten und noch nicht
          aufgedeckte Notizen. Für eine vollständige Auskunft nach Art. 15 oder
          eine Übertragung nach Art. 20 richten Sie eine Anfrage unter Nennung
          des Board-Links an <OperatorEmail />.
        </li>
        <li>
          <strong>Berichtigung</strong> eigener Notizen ist im Board direkt
          möglich, solange sich das Board in der Schreib- oder Vorstellungsphase
          befindet (der Moderator kann eine frühere Phase wieder öffnen, solange
          die Retro nicht abgeschlossen ist); löschen können Sie eigene Notizen
          bis zum Abschluss der Retro, danach kann nur noch der Moderator das
          ganze Board löschen.
        </li>
        <li>
          <strong>Löschung</strong> bedeutet: Der Moderator löscht das Board
          (sofort; zur plattformseitigen Wiederherstellungshistorie siehe
          Abschnitt 3.3), oder es läuft nach 90 Tagen ab. Eine Löschung
          einzelner Personen aus einem laufenden Board nimmt der Betreiber auf
          Anfrage vor, wenn Sie den Link nennen; er löscht dann das gesamte
          Board, weil er einzelne Beiträge keiner Person zuordnen kann.
        </li>
      </ul>

      <p>
        <strong>Widerspruchsrecht (Art. 21 DSGVO).</strong> Soweit Daten auf
        Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeitet werden (Hosting,
        Abschnitt 2.1; Missbrauchsbremse, Abschnitt 2.2; ergänzende Grundlage
        für den Board-Betrieb, Abschnitt 3.6; GIF-Abruf, Abschnitt 5), können
        Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben,
        jederzeit Widerspruch einlegen: <OperatorEmail />. Die praktische Folge,
        ehrlich beschrieben: Hosting und Missbrauchsbremse sind Bausteine, ohne
        die der Betreiber kein Board betreiben kann; ein Widerspruch dagegen ist
        technisch gleichbedeutend mit der Nichtnutzung des Dienstes. Dem
        GIF-Abruf entgehen Sie, indem Sie die Funktion nicht nutzen oder den
        Moderator bitten, sie abzuschalten (Abschnitt 5).
      </p>

      <p>
        Richten Sie Anfragen an <OperatorEmail />.
      </p>

      <h2>9. Sonstiges</h2>

      <p>
        <strong>Kinder.</strong> Das Angebot richtet sich an Teams im Arbeits-
        und Projektkontext und nicht an Kinder unter 16 Jahren. Es werden keine
        Altersangaben erhoben.
      </p>

      <p>
        <strong>Keine Pflicht zur Bereitstellung.</strong> Sie sind weder
        gesetzlich noch vertraglich verpflichtet, Daten anzugeben. Ohne einen
        Anzeigenamen können Sie einem Board allerdings nicht beitreten; er darf
        ein Pseudonym sein.
      </p>

      <p>
        <strong>Weitere Adressen.</strong> Dieselbe Anwendung ist technisch auch
        unter einer Reserveadresse von Cloudflare (
        <PlaceholderField value={WORKERS_DEV_HOST} />) erreichbar und nutzt dort
        denselben Board-Speicher. Entwicklungsvorschauen laufen unter eigenen
        workers.dev-Adressen (retrobeam-preview…) mit einem getrennten
        Board-Speicher, den alle Vorschauen gemeinsam nutzen und der nicht mit
        dem Speicher von retrobeam.de verbunden ist. Diese Erklärung gilt für
        alle diese Adressen; Verarbeitung, Speicherort und Löschfristen sind
        dort identisch. Die Browser-Einträge aus Abschnitt 4 legt Ihr Browser je
        Adresse getrennt ab.
      </p>

      <p>
        <strong>Änderungen.</strong> Diese Erklärung wird angepasst, wenn sich
        die Anwendung ändert — insbesondere, wenn ein neuer Dienstleister
        hinzukommt oder ein bestehender wegfällt. Die jeweils aktuelle Fassung
        steht unter{" "}
        <Link to="/datenschutz">https://retrobeam.de/datenschutz</Link>; das
        Datum oben zeigt den Stand. Eine gesonderte Benachrichtigung ist mangels
        Konten nicht möglich.
      </p>
    </>
  );
}
