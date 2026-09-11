// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from "react-router";
import { CLOUDFLARE_SETTINGS_CHECKED, WORKERS_DEV_HOST } from "./operator.js";
import {
  OperatorBlock,
  OperatorEmail,
  PlaceholderField,
} from "./OperatorBlock.js";

/** English privacy notice. Structure mirrors privacy.de.tsx one-to-one. */
export function PrivacyEn() {
  return (
    <>
      <p>
        The German version is the binding one; this translation is provided for
        convenience.
      </p>

      <p>
        RetroBeam is a free, non-commercial hobby project run by a private
        individual. There are no accounts, no advertising and no analytics; the
        application sets no cookies. This notice nevertheless describes in full
        what data is processed when you open retrobeam.de and when you use a
        retro board, where that happens, for how long, and what rights you have.
      </p>

      <h2>1. Controller</h2>

      <p>
        The controller under the General Data Protection Regulation (GDPR) is:
      </p>

      <OperatorBlock emailLabel="E-mail:" />

      <p>
        There is no data protection officer; this private, non-commercial
        service is not required to appoint one.
      </p>

      <h2>2. Hosting and technical operation</h2>

      <h3>2.1 Cloudflare</h3>

      <p>
        The application runs on the platform of{" "}
        <strong>Cloudflare, Inc.</strong>, 101 Townsend St, San Francisco, CA
        94107, USA, using the products "Cloudflare Workers" (application code)
        and "Durable Objects" (board storage). Board data is stored in a Durable
        Object placed under Cloudflare's "EU" jurisdiction, meaning that
        persistent storage and the board logic (the Durable Object) are pinned
        to data centres in the European Union. The Worker in front of it runs at
        the nearest Cloudflare location — including outside the EU — and
        processes board content there transiently, for example when relaying the
        connection, receiving the board name on creation, carrying over the
        structure on duplication and generating the export file; nothing is
        stored there.
      </p>

      <p>Two limitations, stated openly:</p>

      <ul>
        <li>
          The encrypted connection (TLS) terminates at the Cloudflare data
          centre nearest to you. Full network-level EU residency is an
          enterprise product at Cloudflare that this hobby project does not use.
          Your requests may therefore be received and — as described above —
          transiently processed at a location outside the EU before they reach
          the EU Durable Object.
        </li>
        <li>
          Cloudflare is a US company and remains subject to the US CLOUD Act
          regardless of where data is stored. The compensating measures are the
          EU-US Data Privacy Framework (Cloudflare is certified) and the EU
          Commission's standard contractual clauses, together with the fact that
          the data is low-sensitivity, minimised and short-lived.
        </li>
      </ul>

      <p>
        As the operator of its network, Cloudflare processes its own technical
        data about every request (including IP address, requested address, time
        and browser identification) in order to run the network, defend against
        attacks and detect faults. That processing happens in Cloudflare's own
        systems; details are in Cloudflare's privacy policy (
        <a
          href="https://www.cloudflare.com/privacypolicy/"
          target="_blank"
          rel="noreferrer"
        >
          https://www.cloudflare.com/privacypolicy/
        </a>
        ). A data processing agreement with Cloudflare exists through
        Cloudflare's standard data processing addendum.
      </p>

      <p>
        Legal basis for hosting: Art. 6(1)(f) GDPR (legitimate interest in
        operating the service securely, free of charge and reliably).
      </p>

      <h3>2.2 What the application itself logs — and what it does not</h3>

      <ul>
        <li>
          The application writes <strong>no access logs</strong>. Cloudflare's
          "invocation logs", which would retain the full request address for
          several days, are explicitly switched off for this application. That
          is deliberate: a board's address is also the key to it (see section
          3.5), and GIF search terms appear in request addresses too.
        </li>
        <li>
          What remains are plain error messages (<code>console.error</code>)
          that the application emits in rare cases — for example when a
          scheduled deletion could not be armed or the GIF provider does not
          respond. These messages contain a short label for the error, in the
          case of outages also the technical error message (from the platform or
          the GIF provider), and in one case the hostname of a rejected image
          address (when a client tries to insert a GIF from a host other than
          klipy.com) — never board content such as note or kudo texts, titles or
          column names, never names, never IP addresses. They reach Cloudflare's
          Workers Logs and are subject to Cloudflare's retention there.
        </li>
        <li>
          The application <strong>stores no IP addresses</strong>. One exception
          has to be named honestly: to stop a script from creating thousands of
          boards in a short time and thereby exhausting the free quota for
          everyone, the requester's IP address (header{" "}
          <code>cf-connecting-ip</code>) is used as a counter key when a board
          is <strong>created or duplicated</strong>. This counter lives only in
          the memory of a single Durable Object, is never written to disk, is
          not EU-pinned (in the operator's view it contains no board data), and
          is discarded at most a few minutes after the last request. Two
          mechanisms are at work: the counter is "full" again 60 seconds after
          the last request and is removed by the next sweep; that sweep is
          triggered by a later request (from anyone) and runs at most once a
          minute. If no further request arrives at all, Cloudflare removes the
          idle Durable Object, counters included, from memory — according to
          Cloudflare's documentation currently after about 10 seconds, and at
          the latest after 70–140 seconds of inactivity. A second-exact moment
          cannot be guaranteed; the upper bound of a few minutes rests on the
          platform's documented behaviour, not on a contractual commitment. In
          front of that, Cloudflare's own rate-limiting feature runs with the
          same IP key; its transient counters are managed by Cloudflare. GIF
          search is throttled per board, not per IP.
        </li>
      </ul>

      <p>
        Legal basis for the abuse brake: Art. 6(1)(f) GDPR (legitimate interest
        in protecting the free service from overload).
      </p>

      <h2>3. What is processed when you use a board</h2>

      <h3>3.1 The data</h3>

      <p>
        RetroBeam has no user accounts. You join a board through its link and
        choose a display name yourself — a pseudonym is explicitly fine. The
        board then stores:
      </p>

      <div
        className="table-scroll"
        role="region"
        aria-label="Stored board data"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Display name (self-chosen), assigned colour, role
                (participant/facilitator; if applicable a note that a
                facilitator role was withdrawn), online status, "ready" status,
                time of joining and of last activity
              </td>
              <td>Your join</td>
            </tr>
            <tr>
              <td>
                A random session key that your browser generates before the
                first join (so that you are still "you" after a reload)
              </td>
              <td>Your browser</td>
            </tr>
            <tr>
              <td>
                Notes (text, column, position, membership in a card stack,
                creation time, optionally the address of a GIF), each linked to
                its author
              </td>
              <td>Your input</td>
            </tr>
            <tr>
              <td>
                Reactions (emoji per note and person), votes (count per card and
                person). On newly created boards, once voting is over, every
                participant is shown who voted for which card; the vote bar
                states before the first vote whether names will be shown. The
                facilitator can switch the display of names off at any time;
                switching it on is only possible while nobody has voted yet. A
                duplicated board inherits the original's setting. With personal
                names switched on, the export contains these names too (section
                3.4).
              </td>
              <td>Your input</td>
            </tr>
            <tr>
              <td>
                Action items (text, optionally a responsible person, status,
                creation time)
              </td>
              <td>Input on the board</td>
            </tr>
            <tr>
              <td>
                Kudos (card type, recipient, optionally sender, text, optionally
                a GIF address, creation time)
              </td>
              <td>Your input</td>
            </tr>
            <tr>
              <td>
                ROTI rating ("Return on Time Invested", a number), linked to
                your participant entry; only the average is shown, once, and
                only from three ratings upwards
              </td>
              <td>Your input</td>
            </tr>
            <tr>
              <td>
                Board name, columns (name, order, hidden yes/no, position on the
                canvas), working agreements, board settings, phase, timer, state
                of the presenting round (who has already presented, who is up
                now, whom the facilitator has excluded), the currently
                highlighted card and the published ROTI average
              </td>
              <td>Facilitator / course of the board</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        During the presenting round the facilitator already sees all cards,
        including cards in hidden columns. The other participants receive the
        cards from columns visible to them one person at a time. Before the
        reveal nobody — the facilitator included — sees other people's notes;
        the writing phase is enforced server-side and other people's drafts are
        never transmitted at all. In addition to the status data listed in the
        table (online and "ready" status), during the writing phase participants
        are told, for the columns visible to them, that a person is currently
        writing there (name and column, no content, no length) and how many
        cards the team already has per column.
      </p>

      <h3>3.2 Where</h3>

      <p>
        Exclusively in the Durable Object of that one board, in the EU (section
        2.1). There is no central database and no directory of all boards; the
        application itself keeps no backups. For this type of storage
        (SQLite-backed Durable Objects) Cloudflare keeps a platform-side
        recovery history (section 3.3).
      </p>

      <h3>3.3 For how long</h3>

      <ul>
        <li>
          A board{" "}
          <strong>
            deletes itself automatically 90 days after it was created
          </strong>
          . The application then deletes every row of every table of the board:
          notes, reactions, votes, action items, kudos, ROTI ratings, columns,
          participants and board metadata. Afterwards the link leads to "board
          not found", as for a board that was never created.
        </li>
        <li>
          The facilitator can{" "}
          <strong>delete the board earlier at any time</strong> ("Delete now" in
          the board menu). The application deletes the data immediately. For
          both deletion paths: for SQLite-backed Durable Objects Cloudflare
          keeps a platform-side recovery history — up to 30 days according to
          Cloudflare's documentation — from which only the operator could
          restore via a programming interface. The application does not use that
          function; no way to switch it off is documented. Only after that
          period are deleted data gone on the platform side as well.
        </li>
        <li>
          The facilitator can also{" "}
          <strong>switch off automatic deletion</strong> ("Keep"). A kept board
          stays stored until the facilitator deletes it manually. The
          facilitator sees in the board menu whether and when the board deletes
          itself; the other participants currently do not see this information
          and learn the deadline only from the facilitator.
        </li>
        <li>
          <strong>Duplicating</strong> a board copies only its structure (board
          name — in the application as "Copy of …" —, columns including hidden
          columns, which stay hidden, settings, working agreements) into a new
          board with a fresh 90-day window — no notes, votes, participants,
          kudos or ratings.
        </li>
      </ul>

      <h3>3.4 Export</h3>

      <p>
        Anyone who knows the board link can export the board as Markdown, CSV,
        JSON or PDF, and as a JPEG image that your browser draws itself from the
        JSON export (the server produces no image; the same content rules apply
        to the image as to the JSON export). For notes, hidden columns and
        votes, the export contains only what a participant without a special
        role would be allowed to see on screen at that moment: notes not yet
        revealed, hidden columns and votes still in progress are omitted. Kudos,
        by contrast, are exported regardless of the current phase as soon as
        they have been written — including when the facilitator has moved the
        board back from the closing phase to an earlier one and the appreciation
        wall is therefore not shown at that moment.{" "}
        <strong>Personal names are not included by default</strong> — this
        applies to note authors, kudo senders, owners of action items and the
        names of voters (where the board shows them, section 3.1); they can be
        switched on deliberately when exporting. One exception: the full export
        always names the recipient of a kudo, provided the kudo is addressed to
        a person. Only the "summary" variant (the top-voted cards and the action
        items, no appreciation wall) contains no personal names at all with the
        default setting. Whatever you export is then in your hands; nothing of
        the export remains on the server.
      </p>

      <h3>3.5 The link is the key — please read</h3>

      <p>
        A board has no access control other than its link: the address contains
        a random 128-bit identifier, and{" "}
        <strong>
          whoever has the link can read the parts of the board released to
          participants
        </strong>{" "}
        — after the reveal including all notes in visible columns, and can fetch
        the correspondingly filtered export at any time. Share the link only
        with your team, do not post it in open channels, and bear in mind that
        it stays in chat histories and browser histories. The application itself
        never passes the link on to third parties (no referrer, section 5).
      </p>

      <p>
        The facilitator additionally holds an admin key that lives only in their
        browser (section 4) and never appears in an address.
      </p>

      <h3>3.6 Legal basis</h3>

      <p>
        You use a retro board because you or your team asked for one; processing
        the data listed above is exactly what is needed to provide that board.
        The legal basis is therefore Art. 6(1)(b) GDPR (performance of a
        free-of-charge usage relationship that comes into being when you create
        or join a board), supplemented by Art. 6(1)(f) GDPR (legitimate interest
        in providing a working, abuse-resistant service).{" "}
        <strong>No consent</strong> is requested or needed for the core
        function; accordingly there is no consent dialog.
      </p>

      <p>
        If you use RetroBeam as part of your work, your employer may itself be
        the controller for the decision to use the tool; that does not affect
        this notice.
      </p>

      <h2>4. Storage in your browser (localStorage) — no cookies</h2>

      <p>
        The application sets <strong>no cookies</strong>, neither its own nor
        third-party ones. Instead it stores a few entries in your browser's
        local storage (localStorage). They leave your browser only when the
        application needs them (which entries are transmitted when is stated
        below the table), and they are never used to recognise you across
        boards:
      </p>

      <div
        className="table-scroll"
        role="region"
        aria-label="Local browser storage"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Content</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>retrobeam.name</code>
              </td>
              <td>Your last-used display name</td>
              <td>Pre-fill on the next join</td>
            </tr>
            <tr>
              <td>
                <code>retrobeam.lang</code>
              </td>
              <td>Chosen language (de/en)</td>
              <td>Remember the language</td>
            </tr>
            <tr>
              <td>
                <code>retrobeam.sound</code>
              </td>
              <td>Sound on/off</td>
              <td>Remember the setting</td>
            </tr>
            <tr>
              <td>
                <code>{"retrobeam.board.<board id>.sessionKey"}</code>
              </td>
              <td>Random session key for this one board</td>
              <td>Remain the same participant after a reload</td>
            </tr>
            <tr>
              <td>
                <code>{"retrobeam.board.<board id>.adminToken"}</code>
              </td>
              <td>Admin key (only for the creator of a board)</td>
              <td>Facilitator rights without an account</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        These entries persist until you delete them (browser settings: clear
        site data for the address you used, normally retrobeam.de; see section 9
        on further addresses). No entries are stored for analytics, advertising
        or tracking purposes. The browser never attaches any of these entries to
        requests on its own (unlike cookies). The application transmits them in
        exactly these cases: when joining a board — and on every automatic
        reconnect, for example after a network interruption — it sends the
        display name, the session key and, if present, the admin key of that
        board to the respective board; the admin key is also sent when
        duplicating a board; the chosen language is sent when creating a board
        so that the default columns are named in that language, and with every
        GIF search to the RetroBeam server (section 5). The sound setting never
        leaves the browser. If local storage is unavailable (e.g. private mode),
        the application falls back to an in-memory substitute that ends with the
        tab.
      </p>

      <p>
        Storing these entries is exempt from the consent requirement under §
        25(2) no. 2 TDDDG (the German implementation of the ePrivacy rule)
        because it is strictly necessary to provide the service you explicitly
        requested — your board, your session, your language. That is why there
        is no cookie banner.
      </p>

      <h2>5. GIFs (KLIPY)</h2>

      <p>
        Participants can attach animated GIFs to notes and kudos. The GIFs come
        from <strong>KLIPY</strong>, a service of Kikliko, Inc., USA. The
        facilitator can switch GIFs off for a board (board settings); after that
        no searches are run and no new GIF addresses are stored. GIFs already
        inserted stay stored in the cards and keep loading from KLIPY's CDN
        until the note or kudo in question is deleted or the board is deleted.
      </p>

      <p>Two separate operations:</p>

      <ol>
        <li>
          <strong>Search.</strong> Your search terms go to the RetroBeam server,
          and only the server queries KLIPY. KLIPY receives the search term
          (including intermediate states while you type — the search runs
          automatically after a short typing pause), the language of your
          interface (de/en) and the operator's account key; no identifier that
          points to you. KLIPY therefore sees only the server's address, never
          your IP address, and the content filter is fixed server-side to the
          strictest level (<code>content_filter=g</code>). Search terms are not
          stored on the server (section 2.2). Search is possible only from
          within a board and is throttled per board.
        </li>
        <li>
          <strong>Displaying the images.</strong> The image files themselves —
          both the preview thumbnails of search results and every GIF inserted
          into a note or kudo — are loaded{" "}
          <strong>directly by your browser</strong> from the provider's content
          delivery network (currently <code>static.klipy.com</code>). In notes
          and kudos the application stores only image addresses on klipy.com or
          one of its subdomains (encrypted, https); the preview thumbnails of a
          search and the preview of a GIF you have just picked are loaded by
          your browser from the https address that KLIPY's interface names for
          that result — there the application enforces no particular host. In
          doing so KLIPY's CDN necessarily learns your IP address, browser
          identification and the requested image address — for all displayed
          thumbnails when you search, and for every participant who views a card
          with an inserted GIF. Your board's address is <strong>not</strong>{" "}
          transmitted (referrer policy <code>no-referrer</code>, for the whole
          page and for each individual image). What KLIPY does with these access
          data is governed by its privacy policy (
          <a
            href="https://klipy.com/privacy-policy"
            target="_blank"
            rel="noreferrer"
          >
            https://klipy.com/privacy-policy
          </a>
          ); this is a transfer to the USA for which the operator holds no
          adequacy guarantee.
        </li>
      </ol>

      <p>
        Legal basis: Art. 6(1)(f) GDPR (legitimate interest in an image feature
        your team wants to use on a board). If you do not want any image
        requests to KLIPY, ask the facilitator to switch GIFs off for the board
        — that prevents new searches and new GIF addresses; GIFs already
        inserted keep loading as long as the card exists — or do not use the
        feature; thumbnails are only loaded when you yourself type a search.
      </p>

      <h2>6. What does not exist</h2>

      <ul>
        <li>no web analytics, no tracking pixels, no fingerprinting;</li>
        <li>
          no fonts, scripts or stylesheets from third-party servers (everything
          is served by retrobeam.de itself; emojis are ordinary Unicode
          characters that your device renders with its own font — no emoji data
          is loaded);
        </li>
        <li>no advertising, no ad networks;</li>
        <li>
          no profiling, no automated decisions within the meaning of Art. 22
          GDPR;
        </li>
        <li>
          no linking of data across boards (the operator does not know who uses
          which boards).
        </li>
      </ul>

      <p>
        RetroBeam's source code is published under the AGPL-3.0-or-later; the
        statements about the application itself can be verified there. The
        settings of the Cloudflare account (no web analytics beacon, no
        bot-protection cookies, no challenge pages) are not part of the source
        code; the operator checked them on{" "}
        <PlaceholderField value={CLOUDFLARE_SETTINGS_CHECKED} />. The
        application footer links to the exact running revision on GitHub.
        Following that link takes you to GitHub, Inc.; the board address is not
        sent as a referrer.
      </p>

      <h2>7. Recipients and transfers to third countries</h2>

      <div
        className="table-scroll"
        role="region"
        aria-label="Recipients and transfers to third countries"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Recipient</th>
              <th>What</th>
              <th>Basis for the transfer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cloudflare, Inc. (USA) — processor</td>
              <td>
                All data from sections 2 and 3 (board data stored in EU data
                centres; connection data at the nearest edge)
              </td>
              <td>
                EU-US Data Privacy Framework, supplemented by standard
                contractual clauses
              </td>
            </tr>
            <tr>
              <td>Kikliko, Inc. / KLIPY (USA)</td>
              <td>
                Only when GIF images are loaded: IP address, browser
                identification, image address (section 5). Search terms
                (including intermediate states while typing) and interface
                language (de/en), without your IP address.
              </td>
              <td>
                Art. 49(1)(b) GDPR / legitimate interest; can be switched off
                for new GIFs
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        Nobody else. The operator passes no data to further third parties, sells
        nothing, and hands over board content only when legally obliged to.
      </p>

      <h2>8. Your rights</h2>

      <p>
        Under the GDPR you have the right of access (Art. 15), rectification
        (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data
        portability (Art. 20) and objection to processing based on legitimate
        interest (Art. 21). You may also lodge a complaint with a data
        protection supervisory authority (Art. 77), for example the authority
        responsible for your place of residence.
      </p>

      <p>
        The practical side, described honestly: the operator{" "}
        <strong>cannot</strong> tell which person is behind a display name —
        there are no accounts, no e-mail addresses, no IP logs and no directory
        of boards. A request must therefore name the <strong>board link</strong>{" "}
        (Art. 11 GDPR); otherwise the operator cannot attribute the data. Then:
      </p>

      <ul>
        <li>
          <strong>Access and data portability:</strong> the export in the board
          (section 3.4) delivers the board content visible to everyone, by
          default without personal names (exception: kudo recipients; names can
          be switched on). Not included are, among other things, reactions, the
          individual votes per person, ROTI ratings, the participant list with
          colour, role, join and activity times and session key, the timestamps
          of individual contributions, GIF addresses of kudos, hidden columns
          and notes not yet revealed. For full access under Art. 15 or a
          transfer under Art. 20, send a request naming the board link to{" "}
          <OperatorEmail />.
        </li>
        <li>
          <strong>Rectification</strong> of your own notes is possible directly
          in the board while the board is in the writing or presenting phase
          (the facilitator can reopen an earlier phase as long as the retro has
          not been finished); you can delete your own notes until the retro is
          finished, after which only the facilitator can delete the whole board.
        </li>
        <li>
          <strong>Erasure</strong> means: the facilitator deletes the board
          (immediately; see section 3.3 on the platform-side recovery history),
          or it expires after 90 days. On request the operator will remove a
          person from a live board if you name the link; in that case the
          operator deletes the entire board, because individual contributions
          cannot be attributed to a person.
        </li>
      </ul>

      <p>
        <strong>Right to object (Art. 21 GDPR).</strong> Where data is processed
        on the basis of Art. 6(1)(f) GDPR (hosting, section 2.1; abuse brake,
        section 2.2; supplementary basis for running the board, section 3.6; GIF
        retrieval, section 5), you may object at any time on grounds relating to
        your particular situation: <OperatorEmail />. The practical consequence,
        described honestly: hosting and the abuse brake are building blocks
        without which the operator cannot run a board; objecting to them is
        technically equivalent to not using the service. You avoid GIF retrieval
        by not using the feature or by asking the facilitator to switch it off
        (section 5).
      </p>

      <p>
        Send requests to <OperatorEmail />.
      </p>

      <h2>9. Miscellaneous</h2>

      <p>
        <strong>Children.</strong> The service is aimed at teams in a work and
        project context and not at children under 16. No age information is
        collected.
      </p>

      <p>
        <strong>No obligation to provide data.</strong> You are neither legally
        nor contractually obliged to provide data. Without a display name,
        however, you cannot join a board; it may be a pseudonym.
      </p>

      <p>
        <strong>Further addresses.</strong> The same application is technically
        also reachable at a Cloudflare fallback address (
        <PlaceholderField value={WORKERS_DEV_HOST} />) and uses the same board
        store there. Development previews run at their own workers.dev addresses
        (retrobeam-preview…) with a separate board store that all previews share
        and that is not connected to the store of retrobeam.de. This notice
        applies to all of these addresses; processing, storage location and
        deletion periods are identical there. Your browser keeps the entries
        from section 4 separately per address.
      </p>

      <p>
        <strong>Changes.</strong> This notice will be updated when the
        application changes — in particular when a service provider is added or
        removed. The current version is always at{" "}
        <Link to="/datenschutz">https://retrobeam.de/datenschutz</Link>; the
        date at the top shows the version. Separate notification is not
        possible, as there are no accounts.
      </p>
    </>
  );
}
