# Testkonventionen

Zentrales Konventionen-Dokument für die automatisierten Tests.
Die projekt-lokale `CLAUDE.md` führt nur die Pflicht-Gates und verweist
für alle Details hierher; die übergreifenden
Entwicklungsrichtlinien
führen die Teststrategie ebenfalls nur als Kernsätze mit Verweis auf
dieses Dokument.

## Ordnerstruktur

```
test/
├── unit/        Vitest: Unit- und Snapshot-Tests (Node, Electron-frei)
│   ├── markdown/  Tests der Markdown-Verarbeitung
│   ├── render/    Tests und Snapshots der Render-Pipeline
│   └── renderer/  Tests der Renderer-Module
├── e2e/         Playwright: End-to-End-Tests gegen die echte App
│   ├── helpers/     gemeinsame Helpers (App-Start, Selektoren, Datei-Warten)
│   ├── smoke/       Smoke-Suite über die Kernabläufe
│   ├── funktionen/  Funktions-Specs je Bereich
│   ├── regression/  Regressions-Specs zu behobenen Fehlern
│   └── perf/        Laufzeit-Messungen
└── fixtures/    statisches Test-Material (Unterordner siehe fixtures/README.md)
```

Bewusst `test/` (Singular, klein): der gitignorierte Top-Level-Ordner
`Tests/` (manuelles Test-Material pro Task, eigener Abschnitt unten)
bleibt unberührt; auf case-insensitivem NTFS wäre `tests/` mit `Tests/`
kollidiert.

## Manuelles Test-Material im Ordner `Tests/`

Alle manuell verwendeten Test-Markdown-Dateien liegen im Top-Level-Ordner
`Tests/`. Er ist per `.gitignore` ausgeschlossen, das Material gehört
nicht ins Repositorium und ist clone-lokal. Zur Abgrenzung gegen die
übrigen Top-Level-Ordner ausserhalb der Versionskontrolle: `dist/` und
`releases/` gehören zum Bau und tragen ihre Regeln in der
Release-Strecke,
Kapitel 4; die Regeln der übrigen ignorierten Ordner stehen im
PM-README.
Der Ordner für abgelöstes Material ist hier bewusst nicht namentlich genannt:
Diese Datei geht in den öffentlichen Quellcode-Export, und die Namen der
privaten Arbeitsablagen gehören nicht hinein (Wächter-Befund der Auslieferung
1.108.0).

**Namens-Konvention pro Task:**

- **Eine Test-Datei:** `Tests/test-4t-<id>.md`. Beispiel:
  `Tests/test-4t-0061.md`.
- **Mehrere Test-Dateien:** Unterordner `Tests/test-4t-<id>/` mit den
  zusammengehörigen Dateien. Beispiele im Bestand: `Tests/test-4t-0050/`,
  `Tests/test-4t-0054/`, `Tests/test-4t-0055/`, `Tests/test-4t-0056/`.
- Pro Code-Task entsteht die Datei oder der Unterordner **vor** der
  Test-Aufforderung an den Product Owner. Inhalt: Markdown-Beispiele, die
  die Akzeptanz-Smoke-Tests aus dem Plan abdecken.

**Material für Sicht-Prüfungen muss deutlich sichtbar sein.**
Test-Material ist Teil der Prüf-Schnittstelle. Ein technisch korrektes,
aber praktisch unsichtbares Artefakt (etwa ein 1×1-Pixel-Bild) erzeugt
einen Falsch-Befund und kostet eine Iterationsrunde. Bilder, Farben und
Layout-Beispiele deshalb kräftig und groß genug anlegen, bei Delegation
an Subagenten die Sichtbarkeit ausdrücklich vorgeben. Bei einer Meldung
„wird nicht angezeigt" zuerst automatisiert klären, ob das Produkt oder
das Material die Ursache ist.

## Namenskonventionen

- `*.test.js` — Vitest (Unit-/Snapshot-Tests) unter `test/unit/`.
  **ESM-Syntax** (`import`), weil Vitest 4 ESM-only ist; Vitest
  transformiert die Testdateien unabhängig vom CommonJS-Modultyp des
  Projekts. CJS-Module der App lassen sich per Named-Import laden.
- `*.spec.js` — Playwright (E2E) unter `test/e2e/`. CommonJS-Syntax
  (`require`), konsistent mit der App; Playwright lädt CJS nativ.
- Dateiname nennt das Testobjekt bzw. Szenario: `callouts.test.js`,
  `smoke/modi.spec.js`.
- E2E-Szenarien tragen stabile IDs (`SM-01` …) im `describe`-Titel;
  die Abdeckungs-Matrix referenziert diese IDs.

## Kommandos

| Kommando | Zweck |
|---|---|
| `npm test` | Vitest-Lauf (Unit/Snapshot). Pflicht-Gate zentral in der Merge-Queue vor jeder Integration nach `main`, im Umfang der Änderungsklasse; lokal vor dem Abliefern eines Branches gute Praxis. |
| `npm run test:watch` | Vitest-Watch-Modus; `.only` ist hier erlaubt (`--allowOnly`). |
| `npm run test:e2e` | Playwright-E2E-Lauf; baut vorher das Renderer-Bundle (`pretest:e2e`). Umfang pro Task nach Änderungsklasse (Abschnitt „Änderungsklassen und Prüf-Ausschnitt"), Voll-Suite im Release-Sammeltask. |
| `npm run build:renderer` | Baut das Renderer-Bundle. Vorbedingung jedes direkten Playwright-Aufrufs und eigenes Gate für Renderer-Importe (Abschnitt „E2E-Praxis"). |
| `node scripts/test-kennzahlen.js` | Schreibt die Zahl der Prüffälle beider Suiten nach `test/lauf-kennzahlen.json`, ermittelt aus deren Auflistung ohne Ausführung (rund eine Minute). Läuft als letzter Schritt der Release-Vorbereitung mit; von Hand jederzeit möglich, weil kein Test-Lauf vorausgehen muss. |

**Die Kennzahl hängt an keinem Lauf.** Sie entsteht seit 4T-0831 aus der Auflistung beider Werkzeuge (`vitest list`, `playwright test --list`) und nicht mehr aus den Maschinen-Berichten eines Voll-Laufs. Damit ist gleichgültig, welcher Lauf zuletzt gefahren ist und mit welchem Reporter; die JSON-Berichte unter `test-berichte/` dürfen von jedem Teillauf überschrieben werden. Zuvor galt das Gegenteil, und daraus entstand ein Zielkonflikt mit der Wiederhol-Regel: Der isolierte Nachweis eines Flakes zerstörte den Bericht, aus dem die Kennzahl entstehen sollte. **Davon unberührt ist der Beleg eines roten Laufs** (4T-0934): Er hat einen anderen Zweck als die Kennzahl, nämlich die Diagnose eines Fehlschlags, und liegt deshalb als eigene Kopie unter `test-berichte/rot/` statt die Überschreib-Freiheit des Normalfalls einzuschränken (siehe „Belege roter Gate-Läufe" im Abschnitt „Rote Läufe einordnen").

### Drei Regeln zum Umgang mit Läufen in der Release-Strecke

Sie hängen zusammen und sind aus einem Vorfall entstanden, bei dem die E2E-Voll-Suite in einer Release-Strecke zweimal lief, ohne dass der zweite Lauf einen zusätzlichen Nachweis brachte.

1. **Die E2E-Voll-Suite läuft pro Release genau einmal**, als Pflicht-Gate vor Build und Tag (Festlegung des Product Owners vom 2026-07-29). Sie kostet rund eine halbe Stunde; ein zweiter Lauf ohne Erkenntnisgewinn verstößt gegen den Effizienz-Maßstab des Projekts. Ein Lauf allein für die Kennzahl kommt nicht in Betracht und ist seit 4T-0831 auch nicht mehr denkbar: Die Kennzahl entsteht ohne Lauf.
2. **Der Fortschritt eines Laufs im Hintergrund ist an seiner Ausgabe nicht ablesbar.** Wird die Ausgabe in eine Datei geleitet statt auf ein Terminal, puffert Node sie blockweise; bei der Größenordnung einer Voll-Suite bleibt die Datei bis zum Ende leer. Das gilt unabhängig vom Reporter, gemessen an je einem Lauf mit `line` und mit der Konfigurations-Voreinstellung. Wer währenddessen wissen muss, wie es steht, zählt die Unterordner in `test-results/`: Sie entstehen je fehlgeschlagenem Fall. Der Rückschluss auf die Zahl der bereits gelaufenen Fälle ist damit nicht möglich, wohl aber die Antwort auf die Frage, die in der Praxis zählt — ob der Lauf gerade reihenweise scheitert.
3. **Ein laufender Suite-Lauf wird nicht per Prozess-Abbruch gestoppt.** Er läuft durch, oder der Abbruch wird verifiziert, bevor er als erledigt gemeldet wird. Ein halber Abbruch ist der schlechteste Zustand: Die volle Laufzeit fällt trotzdem an, und das Beenden der Prozesse mitten im Lauf erzeugt rote Fälle, die es ohne den Eingriff nicht gäbe. Sie sind von echten Befunden nicht zu unterscheiden und kosten die nächste Diagnose-Runde.

## Stabilitätsregeln

1. **Tests sind unabhängig und deterministisch.** Kein Test hängt von
   Reihenfolge oder Hinterlassenschaften anderer Tests ab.
2. **Keine harten Sleeps.** Playwright-Auto-Waiting bzw. `expect`-Polling
   verwenden; bei debounce-abhängigen Abläufen auf das sichtbare Ergebnis
   warten, nicht auf Timer.
3. **Nie das echte Nutzer-Profil anfassen.** E2E-Läufe starten die App
   immer über den Helper `test/e2e/helpers/app.js`, der ein frisches
   Temp-Profil setzt (`SCG_TEST_USER_DATA`, Hook in `src/main/main.js`).
   Der Hook wirkt vor dem Single-Instance-Lock, damit Test-Instanzen
   nicht mit einer laufenden echten App kollidieren.
4. **Keine Produktivdaten.** Fixtures liegen unter `test/fixtures/`,
   veränderliche Arbeitskopien in Temp-Verzeichnissen.
5. **`.only`-Schutz.** `allowOnly: false` (Vitest) und `forbidOnly: true`
   (Playwright) lassen Läufe mit vergessenen Fokus-Markern fehlschlagen,
   damit kein Gate-Lauf mit einer Teil-Suite grün wird.
6. **Ein Worker für E2E.** Electron-Instanzen werden nicht parallelisiert
   (`workers: 1`); `retries: 0` macht Flakiness sichtbar statt sie zu
   maskieren. Stabilitätskriterium: drei Läufe in Folge grün.
7. **Diagnose-Artefakte nur im Fehlerfall.** Screenshot und Trace landen
   unter `test-results/` (gitignored); im autonomen Umsetzungs-Modus sind
   sie das primäre Diagnose-Mittel.
8. **Zählende und listende Specs bei neuen Bereichen, Sektionen und
   Panels nachziehen.** Mehrere Specs prüfen den vollständigen Bestand
   und werden rot, bis sie mitgewachsen sind. Alle betroffenen Stellen
   gehören in den Umsetzungs-Commit (Zählwert, ID-Liste, Kommentar mit
   Task-ID), sonst kippt die Voll-Suite erst im Release-Gate:
   - **Neuer Einstellungs-Bereich:** ES-05
     (`test/e2e/funktionen/einstellungen-seite.spec.js`, Bereichs-
     navigation) und der Unit-Test der Bereichs-Registry
     (`test/unit/renderer/settings-page.test.js`, Reihenfolge der
     Bereichs-IDs).
   - **Neue bereichsgebundene Sektion** (`group: 'area'`, siehe
     Oberflächen-Leitlinien der Entwicklungsrichtlinien): ES-13 zählt
     die Sektionen der Navigations-Gruppe „Aktueller Bereich".
   - **Neues Sidebar-Panel:** SL-01
     (`test/e2e/funktionen/sidebar-layout.spec.js`, Default-Reihenfolge;
     neue Panels landen als eigener Slot am Ende) und ES-10 (Anzahl der
     Panel-Zeilen im Einstellungs-Bereich Sidebar), zusätzlich zum
     Paritäts-Wächter `test/unit/panel-access.test.js`. Zwei
     Anlage-Fallen dazu: Die Section-Klasse des Panels muss exakt
     `sidebar-<Panel-ID>` heißen, weil SL-01 die Panel-ID aus ihr
     ableitet; und ein Panel ohne Dokument-Bezug darf nicht an
     `isAllEmpty()` hängen, sonst ist es im Empty-State nicht
     einblendbar.
9. **Datums-Bezug injizieren.** Tests und Fixtures, die „heute" berühren
   (Überfälligkeit, Score, Datum-Komfort-Filter), arbeiten mit
   injiziertem Referenz-Datum bzw. stabilen Fixture-Daten (weit
   vergangen wie 2020, weit zukünftig wie 2099), nie mit dem
   Kalendertag des Laufs.
10. **Tests, die einen vollständigen Bau auslösen, tragen ein eigenes,
    großzügiges Zeitlimit.** Wer die Webseite, das Handbuch oder ein
    vergleichbares Erzeugnis komplett baut, sprengt das voreingestellte
    Zeitlimit von 5 Sekunden konstruktionsbedingt, sobald die Maschine
    unter Last steht; ein grüner Lauf auf einer ruhigen Maschine ist
    dann Zufall und kein Nachweis. Solche Tests bekommen das Zeitlimit
    als drittes Argument von `it(...)`, die zugehörigen Aufräum-Hooks
    als zweites Argument von `afterAll(...)`, gespeist aus einer
    dateilokalen Konstante mit erklärendem Kommentar. Vorbild ist
    `BAU_ZEITLIMIT` in `web-inhalte.test.js` und `web-handbuch.test.js`.
    Das globale Zeitlimit der Suite (`vitest.config.mjs`) bleibt
    bewusst niedrig, damit ein echter Hänger nicht in einem pauschal
    hohen Wert untergeht.
11. **Automatik-Verhalten am realen minimalen Nutzungspfad prüfen.**
    Soll etwas „automatisch beim X" geschehen, löst der Test genau X
    aus und nichts weiter. Stellt er zusätzlich den internen Auslöser
    her (ein Panel öffnen, das den Index ohnehin anfordert), grünt er,
    obwohl das Auto-Verhalten fehlt. Die Lücke findet dann erst der
    manuelle Test. Interne Trigger kommen nur dazu, wenn sie selbst
    Teil des geprüften Pfads sind, und dann in einem eigenen Schritt.
12. **Wer nach dem Warten liest, wartet auf den Inhalt.** Eine Datei
    entsteht vor ihrem Inhalt. Eine Warte-Bedingung auf `fs.existsSync`
    endet im Moment der Anlage; das folgende Lesen fällt unter Last in
    die Lücke und liefert einen leeren oder halben Stand. Bei Text ist
    das ein Vergleichs-Fehler, bei JSON ein Parse-Abbruch, und beides
    tritt nur lastabhängig auf, also als Flake im Voll-Lauf. Die
    Warte-Bedingung liefert deshalb den Inhalt selbst; die Helfer
    `warteAufText` und `warteAufJson` in
    [e2e/helpers/dateien.js](e2e/helpers/dateien.js) kapseln das
    einschließlich der null-Rückgabe für die Poll-Bedingung. Eine
    Existenz-Prüfung allein bleibt richtig, wenn der Test die Datei
    danach nicht liest oder gerade ihre Unverändertheit prüft.

    **Eine Rückmeldung der Oberfläche belegt nicht den Abschluss einer
    Kaskade** (4T-0874). Wirkt eine Aktion auf mehrere Dateien, meldet
    der Main jede einzeln (`file:renamed`), und die Oberfläche zieht
    schon beim ersten Ereignis nach: Der Reiter-Titel steht, während die
    Nachfahren noch wandern. Wer danach mit `expect(fs.existsSync(…))`
    liest statt mit `expect.poll`, prüft einen Zwischenstand. Das
    Zeitfenster ist klein und der Fehler damit latent — er kippte erst,
    als 4T-0847 die Umbenennen-Strecke um den Kapitel-Baum-Nachzug
    erweiterte und jede Einzel-Umbenennung dadurch länger brauchte.
    **Merkregel:** Warte auf das, was die Aktion bewirken soll, nicht
    auf das erste Zeichen, dass sie begonnen hat.
13. **Ein Tastendruck wird wiederholt, bis seine Wirkung eintritt.** Ein
    einzelner `keyboard.press` kann ins Leere gehen, weil das Fenster
    den Fokus noch nicht hat oder der Renderer seinen Listener erst
    anhängt. Wer danach nur auf die Wirkung wartet, läuft in die
    Zeitgrenze und meldet einen roten Fall, der isoliert verlässlich
    grün ist — die teuerste Sorte Flake, weil sie erst im Voll-Lauf vor
    einem Release auffällt und dort einen isolierten Nachlauf samt
    Einzelfall-Bewertung erzwingt. Die Helfer `pressUntil` und
    `pressUntilVisible` in [e2e/helpers/eingabe.js](e2e/helpers/eingabe.js)
    drücken, bis die Bedingung erfüllt ist. Zeigt sich die Wirkung als
    Klasse statt als neues Element, wird sie in den Locator gezogen
    (`page.locator('#btn.is-marked')`). **Voraussetzung ist ein
    idempotentes Kommando**: Ein zweiter Druck darf den ersten nicht
    zurücknehmen und nichts doppeln; das ist am Kommando zu prüfen,
    bevor der Helfer dort eingesetzt wird. Für einen Umschalter gilt die
    Regel nicht — dort bleibt der einzelne Druck richtig, und die
    Stabilität muss anders hergestellt werden.
14. **Der Prüffall eines privaten Werkzeugs braucht zwei Zuordnungen.**
    Maßgeblich ist nicht, wo das Werkzeug liegt, sondern ob seine
    Dateien veröffentlicht werden: Sobald ein Test eine Datei **lädt
    oder liest**, die die Positivliste des Exports nicht freigibt,
    gehört er erstens in die `testAusnahmen` von
    `scripts/quellcode-export-liste.json`, weil `test/` als ganzer
    Ordner veröffentlicht wird und der Prüffall im Ziel ohne seine
    Datei ankäme — die öffentliche Suite würde erst beim nächsten
    Quellcode-Export rot. Zweitens gehört er in den Prüf-Ausschnitt
    seiner Änderungsklasse in `scripts/aenderungsklassen.json` oder,
    wenn ihm keine zuzuordnen ist, in deren Ausnahme-Liste; der
    Vollständigkeits-Meta-Test bricht sonst im Queue-Gate ab. Beide
    Einträge gehören in den Commit, der die Testdatei anlegt.

    Zwei belegte Fälle: ein Werkzeug unter `scripts/`, das der Test
    als Modul lädt (der Regelfall, aus dem die Regel entstand), und der
    Wächter über die Dashboard-Sicht, der `Projektmanagement/dashboard.html`
    liest — ein privates Werkzeug außerhalb von `scripts/`, dauerhaft
    über die Sperrliste von der Veröffentlichung ausgenommen. Beide
    findet die Prüfung in `quellcode-export.test.js`; sie erkennt
    geladene Module und genannte Pfade des Bestands, nicht aber einen
    Pfad, der erst zur Laufzeit entsteht. Wer so einen baut, trägt die
    Zuordnung selbst nach.
15. **Ab zwei Fenstern wird das Ziel-Fenster benannt, nicht abgezählt.**
    `BrowserWindow.getAllWindows()` liefert **nicht** die
    Erzeugungsreihenfolge, sondern die Z-Order: Im Diagnose-Lauf zu
    4T-0873 stand das zuletzt geöffnete Fenster an Position 0. Der
    verbreitete Helfer `getAllWindows()[0]` trifft damit ab zwei
    Fenstern das falsche Ziel (dort unkritisch, solange eine Spec nur
    ein Fenster öffnet). Wer in einer Mehr-Fenster-Spec etwas an ein
    bestimmtes Fenster schickt, wählt es über ein Merkmal aus — etwa
    `getAllWindows().find((w) => w.getTitle().includes(teil))`, siehe
    `sendeAnFenster` in `funktionen/regal.spec.js`.
16. **Der Ansichts-Modus ist Teil des Szenarios, nicht seine Kulisse.**
    Betrifft ein gemeldeter Befund eine Funktion, die es in mehreren
    Ansichts-Modi gibt (Quelltext, Geteilt, Live, Gerendert), fährt der
    Regressionstest **alle** einschlägigen Modi und nicht den einen, den
    die Session zufällig gewählt hat. Anlass ist B-10 (4T-0904): Ein
    Fix schloss den Weg über den verzögerten Such-Neuaufbau, während
    dieselbe Doc-Änderung im geteilten Modus zusätzlich über die
    Render-Pipeline der Vorschau lief. Der Test prüfte nur den
    Quelltext-Modus, war grün, und der Product Owner sah den Fehler in
    der Test-Iteration unverändert. Nennt die Meldung den Modus nicht,
    ist das kein Freibrief für eine stille Wahl: dann gilt die
    Vollständigkeit, oder der Modus wird erfragt.

17. **Ein Selektor ohne Spalten-Qualifizierung misst die erste Spalte.**
    In Zwei-Spalten-Szenarien immer über `SEL.pane(idx)` qualifizieren;
    ein unqualifizierter Treffer sieht die zweite Spalte nie und misst
    still die falsche. Im Probelauf zu 4T-0899 kostete das beinahe eine
    PO-Entscheidungsrunde über ein Verhalten, das es nicht gibt: Der
    vermeintliche Befund war ein Spalten-Verwechsler des Tests. Gilt
    auch für Panel-Sichtbarkeit, die an Schlüsseln **je Spalte** hängt
    (`visibleColumn0`/`visibleColumn1`).

18. **Eine eigene `settings`-Vorbelegung in `launchApp` ersetzt die
    Standard-Vorbelegung vollständig.** Die Sprach-Festlegung aus
    4T-0751 gehört dann mit hinein, sonst startet die App englisch und
    sprachabhängige Erwartungen brechen (Fund aus 4T-0899, Stufe A).

19. **Brückenfunktionen am Modulkopf brauchen die gemeinsame
    Attrappe.** Wer einen Preload-Zugriff aus einer Funktion an den
    Modulkopf zieht, ergänzt `test/unit/renderer/api-stub.js`; sonst
    brechen Unit-Dateien schon am Import statt an einer Erwartung
    (Fund aus 4T-0635: drei Test-Dateien auf einmal).

20. **Positions-Regeln von Tab-Gruppen an Gruppen mit mindestens zwei
    Mitgliedern prüfen.** `insertTabNextTo`/`moveTabNextTo`
    (`tab-groups.js`) setzen `tab.groupId` immer aus dem
    Herkunfts-Reiter; wer eine Positions-Regel testet, stellt die
    Herkunft bewusst **vor** ein weiteres Gruppen-Mitglied (Muster
    TG-13), weil Ein-Element-Gruppen Positions-Fehler maskieren
    (aus 3E-0130/v0.87.0).

21. **Was eine Zusicherung abschaltet, um ihren Fall herzustellen, gehört
    als eigener Fall wieder herein.** Schaltet ein Test eine
    Umgebungs-Eigenschaft ab, damit die geprüfte Lage überhaupt
    entsteht, deckt er genau den Zustand nicht ab, in dem diese
    Eigenschaft wirkt — und das ist im Alltag oft der häufigere. Anlass
    ist 4T-0945: Alle Fälle des Konflikt-Schutzes schalteten die
    Datei-Beobachtung stumm, weil sie sonst den Nachlade-Dialog
    ausgelöst hätte und der Speicher-Weg nie erreicht worden wäre. Der
    Product Owner testete den lokalen Fall mit meldender Beobachtung,
    also den Weg, über den die Zusage der Story im Alltag meistens
    läuft, und traf dort auf eine Lücke, die keine Zusicherung berührte.
    Die Regel gilt für jeden Schalter dieser Art: Beobachtung,
    Netzwerk-Erreichbarkeit, Erweiterungs-Zustand, Berechtigungen.

18. **Eine Zusicherung geht den Weg des Anwenders, nicht den der
    Schicht.** Wo eine Funktion über mehrere Stationen läuft (Datenquelle
    → Auslöser → Anzeige), prüft ein Fall, der eine Station unmittelbar
    aufruft, genau die Strecken nicht, auf denen der Fehler meistens
    sitzt. Zweimal am 2026-08-10 belegt: Bei 4T-0945 wies ein Fall nach,
    dass die Sicherung **entsteht**, nicht dass der Anwender an sie
    **herankommt**; bei 4T-0950 rief ein Fall die Tag-Schicht unmittelbar
    auf und war grün, während das Panel beim Product Owner leer blieb,
    weil niemand es neu zeichnen ließ. In beiden Fällen war die
    Datenquelle bereits richtig und die Zusicherung trotzdem wertlos.
    Praktisch heißt das: Panel-Inhalt statt Rückgabewert, sichtbarer
    Dialog statt Handler-Aufruf, geöffnete Seite statt erzeugtem Text.
    Ein Fall auf Schicht-Ebene ist als **Ergänzung** nützlich, nie als
    Ersatz.

## E2E-Praxis

Wiederkehrende Stolperstellen der Playwright-Suite. Jede hat mindestens
eine Debug-Runde gekostet.

- **Ein Aufruf, der sein eigenes Fenster schließt, wird nicht erwartet.**
  `await page.evaluate(() => window.api.…close())` scheitert mit «Target
  page, context or browser has been closed», weil die Seite verschwindet,
  bevor sie antworten kann; der Fehlschlag sieht aus wie ein Produktfehler
  und ist doch nur die Mechanik. Der Aufruf wird deshalb aus dem evaluate
  heraus verzögert ausgelöst (`setTimeout(() => …, 0)`), und das Ergebnis
  wird am Fenster-Bestand gemessen statt am Rückgabewert. Anlass ist der
  Regressionsfall zum Regal-Zustand (RG-10); dieselbe Stelle trifft jeden
  Weg, der eine Applikation von innen beendet.
- **Bundle-Bezug.** Die Specs starten die App gegen das gebaute
  `src/renderer/renderer.bundle.js`, nicht gegen die ESM-Quellmodule.
  `npm run test:e2e` baut es über den `pretest:e2e`-Hook mit; ein
  direkter `npx playwright test <spec>` überspringt den Hook (npm führt
  `pre*`-Hooks nur bei `npm run <script>` aus) und misst ein veraltetes
  Bundle. Vor direkten Playwright-Aufrufen deshalb
  `npm run build:renderer`. Symptom: der Main-Anteil einer Änderung
  greift, die Renderer-Anzeige fehlt (neue CSS-Klasse oder DOM-Struktur
  wird nicht gefunden).
- **Der Renderer-Bau ist ein eigenes Gate.** Vitest löst fehlende
  Named-Exports lax zu `undefined` auf, esbuild bricht hart ab („No
  matching export"). Ein falsch gezogener Import läuft deshalb durch
  `npm test` grün und fällt erst beim Bundle-Bau. Nach neuen
  Renderer-Modulen und Import-Umbauten `npm run build:renderer` laufen
  lassen und die Ausgabe **ungekürzt** lesen; Import-Quellen vorab am
  Export prüfen statt aus dem Gedächtnis schreiben.
- **Editor-Selektoren mit `.pane-source` qualifizieren.** Das
  Notiz-Panel legt immer eine zweite, unsichtbare CodeMirror-Instanz an,
  im DOM **vor** dem Haupt-Editor. Generische `.cm-*`-Selektoren treffen
  dann die Notiz-Instanz (scrollt nie, `scrollTop` bleibt 0) oder
  brechen im Playwright-Strict-Mode an zwei Treffern. Muster:
  `SEL.editorContent0`. Der App-Code ist nicht betroffen, er arbeitet
  auf der konkreten EditorView.
- **Menü-Inspektion über einen setMenu-Interceptor.**
  `Menu.getApplicationMenu()` ist leer, weil Menüs pro Fenster über
  `win.setMenu(...)` gesetzt werden (Muster in
  `test/e2e/funktionen/arbeitsbereiche.spec.js`). Dazu: IPC-Aufrufe, die
  das eigene Fenster schließen, fire-and-forget testen, weil das Fenster
  vor der Antwort schließt und ein `await` hängt; `menu:*`-Ereignisse an
  frisch erzeugte Fenster gepollt senden, weil die Listener sich erst am
  Ende des asynchronen Renderer-`init()` registrieren.
- **Nach dem Anwenden von Einstellungen auf den Dirty-Reset warten.**
  Der Klick auf `#btn-settings-apply` startet eine asynchrone Kette
  (Apply-Hooks, Persistenz, Events), auf die Playwright nicht wartet.
  Oberflächen, die ihren Datenstand einmalig beim Öffnen bauen (etwa die
  Kommando-Palette), zeigen bei sofortigem Öffnen den alten Stand; der
  Fehler ist zeitabhängig und isoliert schwer reproduzierbar.
  Warte-Anker:
  `await expect(page.locator('#btn-settings-apply')).toBeDisabled()`.
- **Specs mit Ansicht-Toggles schließen erzwungen.** Die
  Editor-Ansicht-Toggles (Gliederung, Zeilennummern, Zeilenumbruch)
  schreiben beim Umschalten ins Frontmatter der aktiven Datei und machen
  sie änderungsbedürftig. Specs, die sie auch indirekt auslösen (über
  platzierte Kommando-Buttons oder Makros), beenden mit
  `closeApp(app, userData, { force: true })`, sonst hängt der Lauf am
  Speichern-Dialog.
- **Neuer Reiter startet im Bearbeiten-Modus.** Eine geöffnete Datei
  steht im Lese-Modus, ein frisch angelegter Reiter dagegen bereits im
  Bearbeiten-Modus. Ein reflexhafter Klick auf den Modus-Umschalter
  macht den neuen Reiter read-only, und die folgenden Tipp-Schritte
  laufen ins Leere.
- **`expect.poll` braucht einen async-Callback, sobald er liest.** Wer
  im Callback eine Eigenschaft des Ergebnisses einer async-Funktion
  liest, muss `await`en: `(f()).length` auf einem Promise ist
  `undefined`, die Bedingung wird nie wahr, und der Fall läuft
  kommentarlos in den Timeout.

## Konsolen-Fehler scheitern lassen

Jeder Konsolen-Eintrag vom Typ `error` und jede unbehandelte Ausnahme des Renderers (`pageerror`) lässt den betroffenen End-zu-End-Fall scheitern. Die Beobachtung sitzt zentral in [helpers/app.js](e2e/helpers/app.js) und braucht in der einzelnen Spec **kein Zutun**: `launchApp` hängt den Zuhörer an das `window`-Ereignis der Anwendung, `closeApp` wertet aus.

Drei Eigenschaften, die beim Ändern zu erhalten sind:

- **Der Zuhörer steht vor `firstWindow()`.** Wird er erst danach registriert, entgehen ihm sämtliche Meldungen der Start-Phase — also der Phase, in der Initialisierungs-Fehler entstehen. Genau das war der Zustand bis 4T-0901: Ein während des Starts gemeldeter Fehler ließ den damaligen Smoke-Fall grün.
- **Warnungen bleiben außen vor.** Nur `error`. Das Rauschen der Warnungen würde den Wächter entwerten.
- **Die Auswertung verdeckt keinen echten Fehlschlag.** Ist der Fall bereits aus eigenem Grund rot, wird die Konsolen-Meldung nur als Anmerkung angehängt statt geworfen; ein Wurf aus dem `finally`-Block hätte sonst die ursprüngliche Diagnose überschrieben.

**Geduldete Meldungen** stehen in [konsolen-ausnahmen.json](konsolen-ausnahmen.json), je Eintrag mit Teilstring, Grund und Datum. Ein Eintrag entsteht nur, wenn der Fall die Meldung **absichtlich** erzeugt (etwa ein Sicherheits-Fall, der einen Pfad bewusst nicht auflöst) oder sie von außen kommt; ein echter Fehler der Anwendung wird behoben, nicht geduldet. Das Feld `spec` bindet den Eintrag an eine Datei und ist der Regelfall: Ohne diese Bindung gölte eine Ausnahme wie `ERR_FILE_NOT_FOUND` projektweit und verdeckte gleichartige Meldungen anderswo.

## Rote Läufe einordnen

**Teststufen, E2E-Budget und Defekt-Klassen** (Kurzfassung; kanonisch im Konzept Test-Strategie und Qualitätssicherung): Die Prüfung folgt vier Stufen — Funktionstest je Task, Integrationstest je Task (Ä-Ausschnitt plus benannte Wechselwirkungen), Epic-Abschluss-Test als kumulierter Ausschnitt, Release-Abnahme; Eintritts-Kriterium jeder Stufe ist die grüne darunter. Der E2E-Voll-Lauf ist ausschließlich die Release-Abnahme und läuft **genau einmal je Release**; eine Wiederholung braucht die dokumentierte Freigabe des Product Owners, und beim zweiten unerwarteten Befund am Abnahme-Gate gilt Halt und Entscheidungsvorlage statt eines weiteren Laufs. Ein roter Fall ist zunächst ein unklassifizierter Befund: erst die Diagnose-Leiter unten, dann die Einstufung als **Produktfehler** (blockiert die Abnahme; Fix plus Regressionstest, Nachweis über gezielte Specs plus Smoke), **Testfehler** (Test-Fix als Vorgang im Test-Pflege-Gefäß) oder **Flake** (isoliert grün; Eintrag in die Quarantäne-Liste [flake-quarantäne.json](flake-quarantäne.json), blockiert keine Abnahme und löst keinen Voll-Lauf aus). Die Quarantäne-Liste wird je Release gesichtet: wiederholt Auffälliges wird zum Testfehler-Vorgang befördert, lange Unauffälliges gestrichen.

- **Den Beleg sichern, bevor wiederholt wird** (4T-0934, Vorfall vom
  2026-08-08). Die Ausgabe eines Gate-Laufs wird **ungefiltert** gelesen; wo
  eine Filterung bequem ist, wird die volle Ausgabe zusätzlich in eine Datei
  geleitet (`… > lauf.log 2>&1`, danach hineinsehen). Nach einem roten Lauf
  wird der Beleg gesichert, **bevor** ein Wiederholungslauf startet: Jeder
  Folgelauf überschreibt den Maschinen-Bericht unter `test-berichte/`, und
  danach ist weder der betroffene Fall noch sein Fehlerbild feststellbar. Ein
  roter Lauf ohne Beleg ist **kein Flake**, sondern ein verlorener Befund; er
  wird als solcher benannt statt stillschweigend als Flake behandelt, denn ein
  Quarantäne-Eintrag ohne benennbaren Fall ist wertlos. Anlass war genau
  dieser Ablauf: gefilterte Ausgabe, blinder Wiederholungslauf, überschriebener
  Bericht, Ursache endgültig weg. Für die Merge-Queue nimmt
  `scripts/gate-lauf.js` diese Sorgfalt ab (siehe „Belege roter Gate-Läufe"
  unten); außerhalb der Queue trägt sie die Sitzung.

- **Belege roter Gate-Läufe** (4T-0934). Bricht ein Gate der Merge-Queue ab,
  legt `scripts/gate-lauf.js` den Beleg selbsttätig unter
  `test-berichte/rot/<Zeitstempel>-<branch>-<gate>.*` ab und die
  Fehlermeldung nennt den Pfad: die **volle** Konsolen-Ausgabe als `.log`
  (die Meldung selbst bleibt auf die letzten 25 Zeilen gekürzt) und beim
  Testsuite-Gate zusätzlich die Kopie von `test-berichte/unit.json`. Ein
  grüner Lauf sichert nichts, die jüngsten zehn Belege bleiben liegen, und
  ein Fehlschlag der Sicherung verdrängt nie die Meldung des eigentlichen
  Fehlschlags. Die Queue fährt keine E2E-Gates, deshalb gibt es dort keinen
  E2E-Bericht zu sichern.

- **Null fehlgeschlagene Tests, trotzdem rot: zuerst den Rechner ansehen.**
  Meldet ein Lauf eine rote Suite, während der Bericht `numFailedTests: 0`
  ausweist, ist kein Test gefallen, sondern ein Hook ins Zeitlimit gelaufen,
  fast immer ein `afterAll`, das Wegwerf-Verzeichnisse löscht. Dafür gibt es
  genau zwei Ursachen, und sie sehen gleich aus:
  1. **Fremdlast auf dem Rechner.** Ein zweiter Suite- oder Bau-Lauf, auch aus
     einem anderen Clone. Prüfen mit
     `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'vitest|playwright' }`;
     die Ausgabe nennt über `CommandLine` auch den Clone. Ist ein fremder Lauf
     aktiv: **warten, nicht wiederholen.** Ein zweiter Lauf unter derselben Last
     scheitert genauso und kostet die Zeit ein zweites Mal. Die Regel dazu steht
     in den Entwicklungsrichtlinien,
     Abschnitt 11.
  2. **Gewachsene eigene Aufräum-Last.** Die Test-Datei hat Fälle bekommen, die
     je eine eigene Wegwerf-Umgebung bauen; dann reicht das voreingestellte
     Zeitlimit nicht mehr, und der Hook braucht ein eigenes (Muster
     `AUFRAEUM_ZEITLIMIT` in `merge-queue.test.js`, `BAU_ZEITLIMIT` in
     `web-inhalte.test.js`). Erkennbar daran, dass der Fehlschlag auch ohne
     Fremdlast auftritt.

  In **keinem** der beiden Fälle gehört der Lauf in die Flake-Quarantäne: Kein
  Test flackert, sondern eine Rahmenbedingung fehlt. Belegt am 2026-08-07 mit
  beiden Ursachen am selben Tag.

- **Erst isoliert nachprüfen, dann bewerten.** Einzelne Fehlschläge der
  E2E-Voll-Suite sind häufig Last-Flakiness der parallelen Ausführung.
  Diagnose-Leiter: (a) die ganze Spec-Datei erneut fahren, (b) den
  Einzeltest über `<spec>:<zeile>`. Isoliert grün heißt Flakiness und
  kein Befund; manche Specs sind auf Datei-Ebene flaky und als
  Einzeltest stabil grün.
- **Isoliert rot heißt nicht automatisch Regression.** Bestands-Tests,
  die das alte, schwächere Verhalten prüfen, brechen nach einer
  Verschärfung legitim; dann wird der Test auf das neue Verhalten
  gehoben. Ob ein Fehlschlag vorbestehend ist, klärt die Gegenprobe
  gegen den Vorgänger-Stand: die eigenen geänderten Quellen per
  `git checkout <baseline> -- <dateien>` zurücksetzen,
  `npm run build:renderer`, den Einzeltest erneut fahren, danach
  `git checkout HEAD -- <dateien>` und neu bauen. Ein Worktree als
  Baseline scheitert unter Windows an der Modul-Auflösung des Bundlers;
  der In-Place-Revert ist der zuverlässige Weg.
- **Die Datei-Parallelität der Unit-Suite nicht hochsetzen.**
  `vitest.config.mjs` begrenzt sie bewusst (`maxWorkers: 4`,
  `minWorkers: 1`). Ohne Limit startet Vitest CPU-viele Fork-Worker; die
  entstehende CPU- und I/O-Last ließ den I/O-intensiven
  Backlinks-Cap-Test sein Zeitbudget reißen und schwere jsdom-Dateien am
  Worker-Start scheitern, bei zugleich längerer Gesamtlaufzeit. Bei
  Flakiness eher niedriger prüfen. Diagnose: einzelne Dateien mit
  `npx vitest run <datei>`, die Suite seriell mit
  `npx vitest run --no-file-parallelism`.
- **Den Rückgabewert eines Gate-Laufs nicht durch eine Pipe schicken.**
  Begründung und Vorgehen stehen in den
  Entwicklungsrichtlinien,
  Abschnitt „Arbeits-Umgebung: bekannte Fallen".

## Setup-/Teardown-Vorlage für Temp-Verzeichnis-Tests

Windows-robust: Datei-Handles können kurz nach dem Schließen noch
gesperrt sein, deshalb Aufräumen mit Retries und try/catch.

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { beforeEach, afterEach } = require('vitest');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-test-'));
});

afterEach(() => {
  // Erst Modul-Ressourcen schließen (Watcher etc.), dann aufräumen.
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
  }
});
```

## Gates: pre-commit-Hook und Merge-Queue

Die Prüfungen sind auf zwei Ebenen verteilt: schnelle Gates lokal pro
Commit, die Suite einmal zentral vor der Integration. **Wie viel davon
läuft, hängt am geänderten Datei-Bestand** und nicht an der Absicht des
Vorgangs (Abschnitt „Änderungsklassen und Prüf-Ausschnitt").

**Lokal, pro Commit.** Der versionierte Hook unter `.githooks/pre-commit`
führt nacheinander `npm run format:check` (Prettier), `npm run lint`
(ESLint) und den PM-Linter aus und verweigert den Commit, sobald ein
Schritt rot ist. Einmalige Aktivierung pro Klon:

```bash
git config core.hooksPath .githooks
```

Format-Check und Lint messen den **gesamten Arbeitsbaum**: unfertige,
noch nicht gestagte Arbeit eines Folge-Tasks blockiert damit auch den
Commit eines fertigen Tasks. Der PM-Linter misst dagegen den
**Git-Index** (`PM_LINT_SOURCE=index`), also den Commit-Stand; jeder
einzelne Commit muss deshalb für sich regelkonform sein.

**Zentral, pro Integration.** Das Testsuite-Gate der Merge-Queue läuft am
Integrationsstand, zusammen mit Format-Check und Lint; erst bei Grün
erreicht ein Branch `main`. Sein Umfang folgt der Änderungsklasse, sobald
die Auswahl scharfgeschaltet ist (Absatz „Stand der Umsetzung"). Ein
lokaler Lauf vor dem Abliefern eines Branches bleibt gute Praxis, das
Pflicht-Gate ist der Queue-Lauf. Bewusst ist die Suite nicht mehr Teil
des Hooks: Sie kostet pro Commit zu viel Zeit, und am Integrationsstand
ist ihre Aussage stärker als am Arbeitsbaum einer einzelnen Sitzung.

**Produkt-Code-Wächter der Queue** (4T-0860, Release-Isolation): Vor der
Gate-Strecke, unmittelbar nach dem Rebase, weist die Queue jeden Branch
ab, dessen Diff gegen den Integrationsstand `src/**`, `package.json` oder
`package-lock.json` berührt und der nicht mit `--release` integriert;
ein nicht ermittelbarer Diff wird abgewiesen statt durchgelassen (fail
closed). Produkt-Code erreicht `main` damit ausschließlich über die
Release-Strecke (Epic-Zweig, Konzept „Verteiltes Arbeitsmodell"). Das
zweite Netz ist der **Vollständigkeits-Abgleich** der Release-Vorbereitung
(4T-0861): Vor ihrem ersten Schritt müssen die Vorgangs-Kennungen jedes
Commits mit Produkt-Code-Anteil seit dem letzten Release-Tag im
Änderungsprotokoll-Block der Ziel-Version stehen (Ausnahmen: der
Release-Commit selbst und Commits, deren Produkt-Anteil allein
`src/shared/build-info.json` ist). Beide Wächter sind unit-getestet
(`test/unit/merge-queue.test.js`, `test/unit/release-vorbereitung.test.js`),
jeweils samt nachgestelltem 0.103.0-Fall.

Die E2E-Suite bleibt außerhalb beider Gates (Laufzeit); welche Specs pro
Task laufen, bestimmt ebenfalls die Änderungsklasse, im Release-Sammeltask
die Voll-Suite.

**Größenordnung der Stufen** (gemessen am 2026-07-25 auf dem
Arbeitsplatz-Rechner, 32 logische Kerne, unter leichter Fremdlast; die
Streuung liegt lastbedingt bei rund 15 Prozent): pre-commit-Hook rund
15 s, davon rund 14,6 s auf Format und Lint und 0,6 s auf den PM-Linter;
Queue-Gates rund 87 s, davon rund 73 s Testsuite; Renderer-Bau rund 3 s;
E2E-Smoke-Suite rund 24 s; E2E-Voll-Suite rund 28 min bei 480 Fällen. Die
Zahlen ordnen die Hebel: Vier Testdateien (Merge-Queue, Web-Inhalte,
Quellcode-Export, Web-Handbuch) tragen 84 Prozent der Rechenzeit der
Unit-Suite, weil sie Wegwerf-Repositorien anlegen bzw. die Webseite
vollständig bauen; der gesamte Anwendungs-Code samt Render-Snapshots
kostet zusammen weniger als drei Sekunden. Eine Abstufung zahlt sich in
der Unit-Suite deshalb genau dann aus, wenn die Klasse diese vier
Werkzeug-Wächter auslässt.

### Änderungsklassen und Prüf-Ausschnitt

Die Klassen sind ausschließlich am geänderten Datei-Bestand definiert.
Sie sind unabhängig von den Aufgaben-Klassen K1 bis K4 der
[CLAUDE.md](../CLAUDE.md), die die Bearbeitungstiefe eines Vorgangs
steuern: Ein mechanischer Vorgang kann Ä7 auslösen (Umbenennung in einem
`src/shared`-Modul nach vorliegender Tabelle), ein Grundsatz-Vorgang Ä1
(Entscheidungsvorlage, die nur eine Markdown-Datei ändert).

| Klasse | Datei-Muster | Ausschnitt der Unit-Suite | E2E |
|---|---|---|---|
| **Ä1 Dokumentation** | `Projektmanagement/**`, `docs/**`, `*.md` in der Wurzel außer `CHANGELOG.md`, `test/README.md` | PM-Wächter (`pm-dokumente`, `ueberblick-aggregate`, `roadmap-zuordnung`, `dashboard-sicht`) plus `quellcode-export`; kein Format, kein Lint | keine |
| **Ä2 Auslieferungs-Texte** | `CHANGELOG.md`, `docs/öffentlich/**`, `web/inhalte/versionen/**` | Ä1 plus `web-inhalte` | keine |
| **Ä3 Sprachdateien und Katalog** | `src/i18n/**`, `test/abdeckungs-matrix.json` | Katalog-Gruppe: `i18n`, `abdeckungs-matrix`, `manual-pages`, `manual-generated`, `hilfetext-stil`, `rueckverweis-webseite`, `bildmarke`, `panel-access`, `command-placement`, `commands`, `color-schemes`, `web-handbuch`, `web-handbuch-funktionen`, `web-mermaid`; Format wegen JSON | Smoke plus `regression/4t-0185.spec.js`; bei `src/i18n/help/**` zusätzlich `funktionen/handbuch.spec.js` |
| **Ä4 Renderer-Modul** | `src/renderer/**` ohne `index.html` | Import-Graph-Ausschnitt des geänderten Moduls plus `test/unit/renderer/**`; Format und Lint | Smoke plus die Funktions-Specs des berührten Bereichs |
| **Ä5 Main, Preload und Bau** | `src/main/**`, `scripts/build-*.js`, `package.json` (Feld `build`), `build/**` | Import-Graph-Ausschnitt plus `archive-build`, `build-version`, `auffang-ebene-main`; Format und Lint | Smoke plus EXE-Smoke-Test |
| **Ä6 Werkzeuge und Webseite** | `scripts/**` außer `build-*`, `web/**` außer `roadmap-zuordnung.json` und `inhalte/versionen/**` | Werkzeug- und Web-Wächter der berührten Familie plus `quellcode-export` (Positivliste); Format und Lint | keine |
| **Ä7 Geteilte Kern-Module** | `src/shared/**`, `src/renderer/index.html`, `src/demo/**` | **Voll-Suite unverändert** | Smoke plus alle Specs der berührten Funktionsbereiche |

**Warum die Auslassungen tragen.** Für Ä1 folgt es aus den
Ignore-Dateien: `.prettierignore` schließt `*.md` und
`Projektmanagement/` aus, `eslint.config.js` ignoriert
`Projektmanagement/` und prüft ohnehin kein Markdown; kein Werkzeug- und
kein Modul-Test liest eine PM-Datei. Für Ä4 und Ä5 gilt die Gegenrichtung:
`scripts/build-web.js` bindet aus der Anwendung nur `src/shared`-Module
ein, weshalb die teuren Web- und Release-Wächter von einer reinen
Renderer- oder Main-Änderung nicht kippen können. Ä7 lässt nichts aus, und
genau das ist die Abgrenzung: Über `build-web.js` schlägt eine Änderung an
`markdown.js`, `manual-pages.js`, `manual-generated.js` oder `commands.js`
bis in die Web-Wächter durch, `index.html` ist die Grundlage der
Paritäts-Wächter und `src/demo/**` die des Manifest-Wächters. Bei Ä3 ist
die Auslassung auf E2E-Seite bewusst unvollständig: Einzelne Specs prüfen
auf lokalisierte Texte, deshalb bleibt dort eine E2E-Pflicht.

**Struktur-Schnitte nehmen die Regression- und Perf-Specs des berührten
Reviers mit** (Erkenntnis der Release-Abnahme vom 2026-08-13). Verschiebt
ein Vorgang Code, statt ihn zu ändern — Datei-Schnitt, Modul-Umzug,
Umbenennung —, dann gehören zum Prüf-Ausschnitt seiner Klasse zusätzlich
die Specs unter `test/e2e/regression/` und `test/e2e/perf/`, die das
berührte Revier betreffen. Die E2E-Spalte der Tabelle nennt Smoke- und
Funktions-Specs, weil die den geänderten Fall prüfen; ein Struktur-Schnitt
ändert aber gerade keinen Fall, sondern dessen Umgebung, und die beiden
Ordner halten als einzige fest, was in dieser Umgebung schon einmal
schiefgegangen ist. Anlass: Beim Konsolidierungs-Release umfassten die
Task-Ausschnitte durchgängig Smoke- und Funktions-Specs, die beiden Ordner
aber nie; zwei echte Befunde wurden dadurch erst am E2E-Voll-Lauf der
Abnahme sichtbar, beide in Revieren, die geschnitten worden waren.

Die Regel steht bewusst nur hier und nicht in der Klassen-Karte: Ob ein
Vorgang ein Struktur-Schnitt ist, ist eine Eigenschaft des Vorgangs und
nicht seines Datei-Bestands, und die Karte kennt allein Muster. Sie steuert
damit die Läufe, die eine Sitzung selbst startet, sowie den Zuschnitt, den
ein Epic seinen Tasks vorgibt.

**Diese Prüfungen laufen unabhängig vom Änderungs-Umfang**, jede aus
eigenem Grund:

1. **PM-Linter** (0,6 s). Billiger als die Buchführung über sein
   Auslassen; seine Eingabe ist faktisch in jedem Vorgang berührt, weil
   die Commit-Disziplin Status-Wechsel und Eltern-Listen in denselben
   Commit legt; und er prüft bestandsweite Invarianten, die eine einzelne
   geänderte Datei kippen kann.
2. **Überblick-Aggregate** (`ueberblick-aggregate.test.js`). Die
   Merge-Queue erzeugt die Aggregate am Integrationsstand selbst neu; der
   geprüfte Stand entsteht erst dort und ist im abgelieferten Branch gar
   nicht enthalten.
3. **Roadmap-Zuordnung** (`roadmap-zuordnung.test.js`). Eine Anlage ohne
   festgehaltene Antwort ist ein belegter, wiederkehrender Fehlerfall.

**Rückfall auf die vollen Gates**, sobald eines davon zutrifft: Der
Änderungs-Umfang lässt sich nicht ermitteln; mindestens eine geänderte
Datei passt auf kein Muster; die Klassen-Karte selbst,
`scripts/merge-queue.js`, die Gate-Definition `scripts/gate-lauf.js`, die
Auswahl-Funktion `scripts/gate-auswahl.js`,
eine Test-Konfiguration oder eine Ignore-Datei ist geändert; der Lauf ist
eine Release-Integration (`--release`). Ergänzend gilt fail-closed: eine
Ausnahme in der Auswahl, eine unlesbare Karte und ein leeres
Auswahl-Ergebnis führen ebenfalls auf die vollen Gates, nie auf weniger.
Eine Änderung ausschließlich unter `test/` trifft auf kein Muster und
fällt damit ebenfalls zurück; das ist teuer, aber selten, weil eine
Test-Änderung in der Praxis eine Code-Änderung begleitet und dann deren
Klasse gilt.

Ebenso zurück fällt eine Änderung unter `addon_examples/`. Die
Beispiel-Erweiterung geht nicht in die Anwendung ein, ist aber zugleich
Eingabe des Paket-Scan-Tests, des Render-Plugin-Tests und der E2E-Spec der
externen Erweiterungen sowie Gegenstand der Export-Positivliste. Eine
eigene Klasse hätte für einen selten geänderten Pfad drei Ausschnitte zu
pflegen; der benannte Rückfall ist hier das günstigere Mittel und macht
sichtbar, was sonst still geschähe.

**Mehrere Klassen: die Vereinigung der Ausschnitte** (Entscheidung des
Product Owners vom 2026-07-25). Berührt ein Änderungs-Umfang mehrere
Klassen, läuft die Summe ihrer Prüf-Ausschnitte, weder der Ausschnitt
einer einzelnen Klasse noch pauschal die vollen Gates. Zwei Gründe: Die
Ausschnitte sind nicht ineinander enthalten, weshalb eine „strengste
Klasse" eine geforderte Prüfung fallen ließe. Ein Branch mit
`CHANGELOG.md` (Ä2) und einem Renderer-Modul (Ä4) verlöre nach einer
Rangfolge den Wächter `web-inhalte`, obwohl dieser `CHANGELOG.md` liest.
Und weil die Commit-Disziplin den Status-Wechsel in denselben Commit legt
wie die Umsetzung und die Merge-Queue ihren Aggregat-Commit hinzufügt,
trägt fast jeder Code-Branch zusätzlich Ä1; die Lesart „bei mehreren
Klassen immer volle Gates" beschränkte den Gewinn damit auf reine
Dokumentations-Branches. Ist Ä7 beteiligt, läuft die Voll-Suite, weil das
der Ausschnitt dieser Klasse ist. Gegen die klassenübergreifende
Wechselwirkung, gegen die eine Vereinigung nichts ausrichtet, stehen die
benannten Rückfall-Fälle oben und der turnusmäßige Voll-Lauf.

**Turnusmäßiger Voll-Lauf**, unabhängig von der Klasse: vor jedem Release,
das ohnehin die strengste Stufe fährt, und beim ersten Integrationslauf
eines Arbeitstages. Der zweite Punkt kostet höchstens 87 s je Tag und
fängt die Fälle, in denen die Klassen-Zuordnung still veraltet ist. Das
Release-Gate selbst bleibt unverändert Pflicht: vor Build und Tag ist die
vollständige Suite (Unit, Snapshot und E2E-Voll-Suite) grün. **Seine
einzige Ausnahme:** Berührt der Änderungs-Umfang seit dem vorangegangenen
Release-Tag keine Datei unter `src/` außer `src/shared/build-info.json`,
genügen Smoke-Suite und EXE-Smoke-Test, weil die E2E-Voll-Suite gegen
unveränderte Anwendungs-Dateien läuft und kein anderes Ergebnis liefern
kann als beim vorangegangenen Release.

**Kein nachträglicher Voll-Lauf nach einem roten Ausschnitt.** Ein roter
Ausschnitt ist ein Befund und wird behoben; der darauf folgende Lauf ist
ohnehin fällig. Für den Wiederhol-Umfang nach einem punktuellen Fix gilt
die Wiederhol-Regel des Konzepts Test-Strategie und
Qualitätssicherung,
Kapitel 2.

**Lokale Läufe.** `npx vitest related <geänderte Dateien>` gibt schnelle
Rückmeldung (je nach Modul 8 bis 27 s statt rund 73 s), taugt aber **nicht
als Nachweis**: Die Auswahl folgt dem Modul-Graphen, und die
Daten-Kopplungen stehen dort nicht drin. Belegt an zwei Proben —
`vitest related src/i18n/de.json` und `vitest related <PM-Datei>` wählen
**null** Testdateien aus, obwohl mehr als ein Dutzend Wächter genau diese
Dateien lesen. Auch `vitest related src/shared/markdown/markdown.js`
findet die drei Web-Wächter nicht, die das Modul über `build-web.js`
laden. Der Nachweis bleibt der Queue-Lauf.

**Stand der Umsetzung: Schattenbetrieb.** Die maschinelle Auswahl ist
gebaut, aber noch nicht scharf. Die Karte aus Pfad-Mustern liegt als
`scripts/aenderungsklassen.json` und ist die maschinenlesbare Fassung der
Tabelle oben; `scripts/gate-auswahl.js` wertet sie als reine Funktion aus,
ohne Git- und ohne Dateisystem-Zugriff; der Meta-Test
`test/unit/aenderungsklassen.test.js` hält die Karte in beide Richtungen
gegen den realen Bestand, also jede Testdatei einem Ausschnitt zugeordnet
oder mit Begründung ausgenommen und jeder versionierte Pfad auf mindestens
einem Muster. In der Merge-Queue läuft die Auswahl im **Schattenbetrieb**:
Sie protokolliert die erkannten Klassen und den Ausschnitt, der gelaufen
wäre, und die Queue fährt unverändert Format, Lint und die volle Suite.
Ausstehend ist die Scharfschaltung samt Not-Aus-Schalter; sie folgt erst,
wenn das Protokoll über eine mit dem Product Owner vereinbarte Zahl von
Integrationen gegen den realen Änderungs-Umfang trägt. Bis dahin steuern
die Klassen unverändert die Läufe, die eine Session selbst startet, allen
voran die E2E-Wahl. Der Modul-Graph darf innerhalb einer Klasse weiter
eingrenzen, nie aber alleinige Grundlage sein.

## Snapshots der Render-Pipeline

Die Markdown-Fixtures unter `test/fixtures/render/` werden in
`test/unit/render/snapshots.test.js` durch `renderMarkdown` geschickt
und als Vitest-Snapshots eingefroren
(`test/unit/render/__snapshots__/`). Regeln:

- **Eine Fixture pro Konstrukt-Familie**; neue Markdown-Konstrukte
  bekommen eine eigene Fixture im selben Ordner —
  der Spec nimmt alle `.md`-Dateien automatisch auf.
- **Snapshot-Updates sind ein bewusster Schritt**: nie blind
  `vitest -u` laufen lassen; zuerst den Diff des Snapshots lesen und
  prüfen, ob die Änderung gewollt ist (eigene Code-Änderung oder
  legitimes Library-Update) — sonst ist es eine Regression.
- **Maschinenunabhängigkeit**: `renderMarkdown` arbeitet ohne
  Pfad-Auflösung (Bild-Einbettung liegt im Preload), die Snapshots
  dürfen keine absoluten Pfade enthalten.
- **DOM-abhängige Pfade** (P-02-Block-Sanitizer mit DOMParser) testet
  `sanitizer-dom.test.js` mit `@vitest-environment jsdom`; in purem
  Node fällt der Sanitizer auf Voll-Escaping zurück, weshalb die
  Node-Snapshots der Portable-Fixtures escaptes Tabellen-HTML zeigen —
  das ist erwartet und stabil.
- **Mermaid** wird nur als Container gesnapshottet (`language-mermaid`-
  Code-Block); das SVG entsteht erst im Renderer und schwankt
  versionsabhängig.

## Abdeckungs-Matrix

`test/abdeckungs-matrix.json` ordnet jedem Eintrag des Funktions-Katalogs
(`help.feature.*` und `help.shortcut.*` aus `src/i18n/de.json` — seit
0.29.0 die Quelle der generierten Handbuch-Funktions-Seite) eine Testart
und Testdateien zu. Der Meta-Test
`test/unit/abdeckungs-matrix.test.js` erzwingt das in `npm test` (und
damit im Testsuite-Gate): ein neuer Katalog-Eintrag ohne Matrix-Pflege
bricht den Lauf. Die Vollständigkeit der Handbuch-Seiten selbst sichert
zusätzlich `test/unit/manual-pages.test.js` (alle fünf Sprachfassungen
pro Registry-Seite, Titel-Keys, keine verwaisten Dateien); den Text-Stil
sichert `test/unit/hilfetext-stil.test.js` (keine Fremdprodukt-Verweise
und keine Versions-Historie in Handbuch-Seiten und Katalog-Texten,
Stil-Regeln aus den Entwicklungsrichtlinien,
Kapitel 13).

**Regressionstest-Pflicht pro Bugfix:** Jeder behobene Fehler erhält einen Regressionstest auf der passenden Ebene (Unit, Snapshot oder E2E), nach Möglichkeit zuerst als fehlschlagender Test, dann der Fix; die Befund- bzw. Task-ID steht als Kommentar am Test. **Szenario-Treue bei gemeldeten Befunden** (Retrospektive vom 2026-08-05): Der Regressionstest eines vom Product Owner oder aus dem Feld gemeldeten Befunds stellt den **gemeldeten Ablauf** nach (Fenster-, Sitzungs- und Daten-Lage der Meldung), nicht das Minimal-Szenario der diagnostizierten Ursache; die Diagnose bestimmt den Fix, die Meldung bestimmt den Test. Gegenüber dem Product Owner heißt ein gemeldeter Befund erst «behoben», wenn sein Ablauf nachgestellt grün ist; davor lautet die Rückmeldung «Fix umgesetzt, Nachweis im nachgestellten Szenario». Anlass: Ein Restore-Fix bestand das Minimal-Szenario (eine App, kleines Profil) und fiel am realen Mehr-Fenster-Profil durch.

**Test-Pflege-Schritt pro Epic:** Jedes Epic mit Code-Änderungen erweitert die Suite um seine neuen Funktionen (Feature-Tests plus Snapshot-Fixtures); ein Feature gilt erst mit Test als fertig. Technisch abgesichert durch den Vollständigkeits-Meta-Test: neue `help.feature.*`-/`help.shortcut.*`-Keys ohne Eintrag in `test/abdeckungs-matrix.json` lassen `npm test` fehlschlagen.

**Falle des Stil-Wächters:** Sein Muster für Versions-Historie trifft
jede dreistufige Nummer der Form `\d.\d+.\d{1,3}`, und es prüft
zeilenweise ohne Ausnahme für Code-Blöcke. Nummern-Beispiele in
Handbuch- und Katalog-Texten (Gliederungs-Nummerierung, Listen-Tiefe)
bleiben deshalb **zweistufig** (`1`, `1.1`, `1.2`); tiefere Strukturen
werden verbal beschrieben. Ein Beispiel wie `(1, 1.1, 2.3.1)` lässt die
Suite fehlschlagen, auch innerhalb eines Code-Blocks.

**Der Eintrag gehört in den Commit seines Schlüssels.** Der Meta-Test
misst den **gesamten** Bestand, und der pre-commit-Hook prüft **jeden
Commit einzeln** gegen den Index. Ein Commit, der einen neuen
`help.feature.*`- oder `help.shortcut.*`-Schlüssel einführt, ohne den
Matrix-Eintrag mitzubringen, ist deshalb für sich rot — auch wenn der
Bestand zwei Commits später wieder stimmt. Das trifft besonders den
üblichen Zuschnitt, bei dem das Kommando in einem Umsetzungs-Task
entsteht und der Funktions-Katalog erst im Hilfe- und Handbuch-Task
folgt: Der Schlüssel bringt seinen Matrix-Eintrag mit, unabhängig
davon, welcher Task ihn fachlich verantwortet. Aufgefallen ist das an
einem Kommando-Schlüssel, dessen Eintrag für den nachfolgenden
Hilfe-Task vorgemerkt war.

**Pflege bei neuen Funktionen**:

1. Neue `help.*`-Keys anlegen (Konvention in den
   Entwicklungsrichtlinien,
   Kapitel 13).
2. Tests schreiben (E2E in `test/e2e/funktionen/`, Unit/Snapshot nach
   Lage) und in der Matrix eintragen: `key`, fortlaufende `id`
   (`F-…`/`S-…`), `testart` (`e2e`/`unit`/`snapshot`), `tests`
   (Pfade relativ zum Repo-Root), optional `hinweis`.
3. Nur wenn ein Kürzel ein reiner Menü-Accelerator ist (Playwright
   erreicht das native Menü nicht): `testart: "ipc"` mit dem getesteten
   IPC-Kanal in der `begruendung`. Nur wenn etwas prinzipiell nicht
   automatisierbar ist (OS-Dialoge, native Menüleiste, OS-Fenster-
   Geometrie): `testart: "manuell"` mit substanzieller `begruendung` —
   solche Punkte gehören in die Gesamtabnahme-Checkliste.

Die E2E-Funktions-Suite liegt unter `test/e2e/funktionen/` (eine Spec
pro Funktionsgruppe); `describe`-Titel tragen die Matrix-IDs.

## PM-Dokument-Linter

`scripts/lint-pm-dokumente.js` prüft die Projektmanagement-Dokumente gegen die
PM-Konventionen (Dateiname und Identität, Frontmatter, Metadaten-Schema,
Body-Kapitel, Hierarchie und Bidirektionalität, Überblick-Konsistenz, Notation
der Eltern-Listen, Verweis-Disziplin). Eingebunden über
`test/unit/pm-dokumente.test.js`, läuft er in `npm test` und damit im
Testsuite-Gate der Merge-Queue; zusätzlich fährt ihn der pre-commit-Hook
direkt gegen den Git-Index. Die Parse-Logik teilt er sich mit
`scripts/verify-dashboard.js` über das Modul `scripts/pm-parse.js`. Bekannte
Altbestand-Funde sind in `scripts/pm-lint-baseline.json` grandfathered; neue
oder geänderte Dokumente, die eine Regel verletzen, stehen nicht in der Baseline
und lassen den Lauf fehlschlagen. Je Regelgruppe belegt eine Negativ-Probe im
Test, dass die Regel anschlägt.
