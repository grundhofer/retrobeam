# Was sebaro für RetroBeam fehlt (Lücken)

Stand 2026-10-24. Gehört zu [`docs/sebaro-umbau.md`](sebaro-umbau.md). Hier wird gesammelt, was sebaro fehlt oder wo eine Regel nicht passt. **Gebaut wird es nicht hier und nicht von der Umbau-Session**, sondern in sebaroDesign bzw. sebaro-guide durch deren eigene Sessions (D80, ICO-01). Abkürzungen wie im Plan (`SD`, `SB`, `ADO`, `RJ`, F- und L-Nummern).

## 1 Lieferungen, die vor einer Stufe da sein oder ausdrücklich verschoben sein müssen

Diese Arbeit macht **eine sebaroDesign-Session nach `SD/AGENTS.md`, nach S2**. Die Umbau-Session in RetroBeam meldet nur (D80, ICO-01, `ADO:437-439`: „waits or asks“).

| #   | Lieferung                                                                                                                                                                                                                                                                                 | Grund                                                                                                                                 | vor Stufe   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| L1  | D100 committen; Katalog auf ≥ D100; Kopf von `spec/11` nachführen                                                                                                                                                                                                                         | S5                                                                                                                                    | 0           |
| L2  | Icons: QR, GIF, Emoji, Auge-aus, Mikrofon, Mischen, Rad, Slots, Platz, Herz, Zoom ein/aus/einpassen, Griff, Ton, Vollbild                                                                                                                                                                 | 77 Icons vorhanden [D, Prüfung „decisions“], diese fehlen [S]                                                                         | 5           |
| L3  | Muster für Zeitbox (nach F25), Stimmeingabe mit Budget, blindes Aufdecken, freie Fläche, Live-Zeiger, allgemeinen Dialog ohne Hauptaktion (Einladen/QR, Rad), **Bestätigung nicht destruktiver, nicht umkehrbarer Schritte** (F5), **Einstellungsansicht für Web-Apps ohne Fenster** (F2) | `sb-dialog` ist nur der Löschdialog (`SB/spec/02:1097-1104` [B]); die Einstellungsansicht gibt es nur für Fenster (§4.24) und Telefon | 5a/5c/5g/5h |
| L4  | Farbanzahl-Prüfung für Produkte: `sb-colour-count.js` wird nicht exportiert (`ADO:137` [B]), TEC-03 verlangt sie aber                                                                                                                                                                     | G14                                                                                                                                   | 2c          |
| L5  | entfällt bei F28 = a; nur bei F28 = c ein PNG                                                                                                                                                                                                                                             | F28                                                                                                                                   | 6c          |
| L6  | ADOPTION nachführen: `:225` (Pfad), `:241-243` (Board-Art), `:253-255`, `:259`, `:347-350`, `:381`, `:404`, `:437-439`; `shared/facts/retrobeam.json:7`                                                                                                                                   | Rezept muss stimmen                                                                                                                   | 2b          |
| L7  | D100 im Web: Segmented → Select; kein seitliches Scrollen bei 200 %                                                                                                                                                                                                                       | ZUG-09                                                                                                                                | 4           |
| L8  | Das TXT8-Muster findet `jede:r` nicht                                                                                                                                                                                                                                                     | Text-Lint                                                                                                                             | 1           |
| L9  | `@custom-variant dark` für `[data-theme]` fehlt; RetroBeam verbietet `dark:` (G7), also nur melden                                                                                                                                                                                        | —                                                                                                                                     | —           |
| L10 | falls F6 = b: Palette für Teilnehmende                                                                                                                                                                                                                                                    | F6                                                                                                                                    | 4c          |
| L11 | **D-Zeile „Web-App ohne Fenster“:** Kopf, Wahl von Hell oder Dunkel, Farbton und Bewegung, Einstellungsansicht                                                                                                                                                                            | F2; NAV-06 gegen `SB/spec/07:175`, `SB/spec/09:355-356`, `SB/spec/03:682-684`                                                         | 5a          |
| L12 | `sb-board.js`: eine `teardown`-Funktion, falls sich in 5g zeigt, dass sie für das Aufräumen unter React fehlt. Heute gibt es nur `window.sbBoard = { setup, current }` (`SB/demo/assets/sb-board.js:140-143` [B]); der ResizeObserver wird nie getrennt [S]                               | 5g                                                                                                                                    | 5g          |

---

## 2 Meldungen an sebaroDesign

1. Board-Art und Lesart B: `ADO:241-243` („web app with a window (RetroBeam's board)“) gegen `SB/spec/02` §4.17 und NAV-06 („Web-Apps ohne Fenster“, `RJ:1904`). NAV-06 widerspricht `SB/spec/07:175` („websites only“), `SB/spec/09:355-356` und `SB/spec/03:682-684`. Wo wählen Web-Apps ohne Fenster Hell oder Dunkel, Farbton und Bewegung? Gibt es eine Einstellungsansicht? Gilt D84 (⌘K) auch ohne Fenster? (L11)
2. `ADO:225` Pfad `../RetroBeam/` statt `retrobeam/`.
3. `ADO:253-255` warme Palette noch „pending proposal“, ist als C4c gebaut.
4. `ADO:437-439` Fenster, Palette, Kategorie und Markierung „not built“, sind aber gebaut.
5. `ADO:347-350`, `PACKAGES.md:24` Version 1.7 statt 1.9 [D].
6. `ADO:259` novalis „Dev-Noir + petrol“ ist veraltet. Die Seitenleiste ist durch D100 (2) beantwortet.
7. `ADO:404` RetroBeam „AGPL with REUSE-style `*.license` files“ ist ungenau.
8. `ADO:381` `--csp dist/index.html`: RetroBeam hat keine CSP, und die Ausgabe liegt unter `apps/web/dist/client/`. `ADO:244` nennt die `_headers`-Policy schon richtig.
9. ADOPTION §4, Schritt 3 (`:236-238`): `site-root/*` enthält `head.snippet.html` und `manifest.snippet.json`, die beim Kopieren öffentlich würden. Die `cmp`-Schleife endet ohne `rc` mit dem Exit-Code des letzten `cmp`.
10. ADOPTION §4, Schritt 5 (`:241-243`) und §2.3: Wie `theme-init.js` in Vite ausgeliefert wird (Datei in `public/` plus `cmp`), fehlt. Ebenso fehlen `@source not`, ESLint/Prettier-Ignores (auch für `public/theme-init.js`), `@custom-variant dark`, die Auslieferung der OFL-Texte im Bundler-Build und `<meta name="color-scheme">` als Pflicht.
11. WEB-09 und `SB/spec/09` §18.1 gegen SPAs mit einer Hülle und Zugangsrecht-URLs: `render.mjs` trennt die Kopfzeilen schon (`<output>.head.html`), aber die Regel verlangt Bilder je Seite und `canonical`. RetroBeam rendert nur `/` (F28 a).
12. `sebaro.css` ist 230 KB roh / 49,7 KB gzip und nicht zerlegbar.
13. Farbanzahl-Werkzeug (TEC-03) wird nicht exportiert (`ADO:137`).
14. TXT8 findet `jede:r` nicht.
15. BEL-10 „immer“ gegen freiwillige Fakten: Sind Zeilen von Hand erlaubt?
16. WEB-03 sieht keine Pflichtlinks nach AGPL §13 vor.
17. TXT-01 gegen das Produktglossar („Board“, „Retro“, „Action Items“, „Kudos“).
18. `SYSTEM.md:174` „Spalten als Tabs“ ist durch B2b überholt.
19. `shared/facts/retrobeam.json:7` PL1-Notiz ist durch D90 überholt.
20. `runde-6-plan.md:8-11` nicht nachgeführt; Kopf von `spec/11` endet bei D93; der Katalog hat kein D100.
21. Kopf von `tokens.tailwind.css` (`:12`) nennt noch „[data-product] accents“ (D54).
22. Fehlende Icons (L2), fehlende Muster (L3), nur bei F28 = c ein OG-PNG.
23. novalis-seitig: `NV/CLAUDE.md:65` und `just tokens-sync` erwarten `--ds-*` [D]. Das widerspricht D67 (13) und D77.
24. Brückenreihenfolge ohne `tokens.tailwind.css` in den Stufen 2c–5h: vorübergehende Abweichung von `ADO:229-235`.
25. Lint in `SB/spec/09:455` trifft `text-text-subtle`, das `SB/spec/01:25`, `:47` erlauben.
26. HAL-05 (Countdowns) gegen funktionale Zeitboxen in Retro-Timern (F25).
27. Keine Form für die Bestätigung nicht destruktiver, nicht umkehrbarer Schritte (F5) und keine Einstellungsansicht für Web-Apps ohne Fenster (L3).
28. `sb-board.js`: `window.sbBoard` hat `setup`, aber kein `teardown`; der ResizeObserver wird nie getrennt (L12) [S].
29. `sb-language-switch` hat keine Form für Seiten ohne Sprach-URL, auf denen die Sprache eine gespeicherte Wahl ist (F18b).
30. Manifest `theme_color #F4F5F8` gibt installierten Apps auch im Dunkelmodus eine helle Titelleiste (F29).
31. Laufnummer der gescheiterten CI (40084216639) steht in keiner SD-Datei. `PACKAGES.md:189` nennt nur „billing block“.
32. **Fremde Namen im Export (F32, wie novalis ADR-0051 Frage 4):** `tokens.json` (Produktliste), `icons/icons.json` und `js/sb-facts.js` enthalten Namen anderer Produkte; RetroBeam ist öffentlich, und Exportdateien dürfen nicht geändert werden. Vorschlag: `--product` filtert auch Produktlisten, Icon-Stichwörter und Beispieltexte auf das eine Produkt; ein Export für öffentliche Repos enthält keine fremden Namen. Bis dahin kein Push des Exports (Stufe 2b).
33. **HAL-05 und Emoji (F24):** RetroBeam behält Emoji-Reaktionen als Inhalt der Teilnehmenden; nur Emoji in UI-Texten entfallen. Bitte bestätigen, dass HAL-05 Oberflächentext meint, nicht Inhalte der Nutzenden.
34. **Startkachel ohne Speicher (F15, D85):** RetroBeam zeigt die Startkachel ohne `sessionStorage["sb-started"]`, weil fraglich ist, ob § 25 Abs. 2 Nr. 2 TDDDG einen Eintrag für eine nicht verlangte Animation deckt. Folge: einmal je Seitenaufruf statt einmal je Tab. Vorschlag: `sb-start.js` bekommt eine Option ohne Speicher (z. B. `data-sb-start="nostore"`), damit die exportierte Datei unverändert bleibt.
35. **„Weiter: <Ziel>“ (F5):** AKT-04 erlaubt „Weiter: <Ziel>“ als Beschriftung, spec/02 §1.1 nur im Onboarding. RetroBeam nutzt es als Hauptaktion der Moderation für jeden Phasenwechsel. Bitte die beiden Stellen angleichen.
36. **Endgültige, nicht löschende Schritte (F5b):** „Retro beenden“ bekommt Gefahrtaste und Bestätigungsdialog wie beim Löschen, ohne Papierkorb-Icon. sebaro kennt dafür kein Muster (AKT-07/AKT-08 und der Dialog in spec/02 §4.6 sind nur fürs Löschen); Teil von L3.
37. **Board-Spalten am Handy:** `.sb-board__column` hat `min-inline-size: 240px`; bei 390 px und 200 % Schrift brechen Wörter mitten im Wort (Befund der Skizzenseite). Bitte mit D100 (5) abgleichen.
