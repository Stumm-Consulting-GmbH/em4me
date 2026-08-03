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
`Tests/` (manuelles Test-Material pro Task) bleibt unberührt; auf
case-insensitivem NTFS wäre `tests/` mit `Tests/` kollidiert.

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

**Die Kennzahl hängt an keinem Lauf.** Sie entsteht seit 4T-0831 aus der Auflistung beider Werkzeuge (`vitest list`, `playwright test --list`) und nicht mehr aus den Maschinen-Berichten eines Voll-Laufs. Damit ist gleichgültig, welcher Lauf zuletzt gefahren ist und mit welchem Reporter; die JSON-Berichte unter `test-berichte/` dürfen von jedem Teillauf überschrieben werden. Zuvor galt das Gegenteil, und daraus entstand ein Zielkonflikt mit der Wiederhol-Regel: Der isolierte Nachweis eines Flakes zerstörte den Bericht, aus dem die Kennzahl entstehen sollte.

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
14. **Neue Werkzeug-Tests brauchen zwei Zuordnungen.** Ein neuer Test
    eines privaten Werkzeugs unter `scripts/` gehört erstens in die
    `testAusnahmen` von `scripts/quellcode-export-liste.json`, weil
    `test/` als ganzer Ordner veröffentlicht wird und der Import eines
    nicht exportierten Skripts die öffentliche Suite erst beim nächsten
    Quellcode-Export rot machte (maschinell gewächtert in
    `quellcode-export.test.js`); zweitens in die Werkzeug-Ausnahme-Liste
    von `scripts/aenderungsklassen.json`, deren
    Vollständigkeits-Meta-Test sonst im Queue-Gate abbricht. Beide
    Einträge gehören in den Commit, der die Testdatei anlegt.

## E2E-Praxis

Wiederkehrende Stolperstellen der Playwright-Suite. Jede hat mindestens
eine Debug-Runde gekostet.

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

## Rote Läufe einordnen

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
| **Ä1 Dokumentation** | `Projektmanagement/**`, `docs/**`, `*.md` in der Wurzel außer `CHANGELOG.md`, `test/README.md` | PM-Wächter (`pm-dokumente`, `ueberblick-aggregate`, `roadmap-zuordnung`); kein Format, kein Lint | keine |
| **Ä2 Auslieferungs-Texte** | `CHANGELOG.md`, `docs/öffentlich/**`, `web/inhalte/versionen/**` | Ä1 plus `quellcode-export`, `web-inhalte` | keine |
| **Ä3 Sprachdateien und Katalog** | `src/i18n/**`, `test/abdeckungs-matrix.json` | Katalog-Gruppe: `i18n`, `abdeckungs-matrix`, `manual-pages`, `manual-generated`, `hilfetext-stil`, `rueckverweis-webseite`, `bildmarke`, `panel-access`, `command-placement`, `commands`, `color-schemes`, `web-handbuch`; Format wegen JSON | Smoke plus `regression/4t-0185.spec.js`; bei `src/i18n/help/**` zusätzlich `funktionen/handbuch.spec.js` |
| **Ä4 Renderer-Modul** | `src/renderer/**` ohne `index.html` | Import-Graph-Ausschnitt des geänderten Moduls plus `test/unit/renderer/**`; Format und Lint | Smoke plus die Funktions-Specs des berührten Bereichs |
| **Ä5 Main, Preload und Bau** | `src/main/**`, `scripts/build-*.js`, `package.json` (Feld `build`), `build/**` | Import-Graph-Ausschnitt plus `archive-build`, `build-version`; Format und Lint | Smoke plus EXE-Smoke-Test |
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
`scripts/merge-queue.js`, die Auswahl-Funktion `scripts/gate-auswahl.js`,
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
Release-Gate selbst bleibt unverändert Pflicht; seine einzige Ausnahme
(Änderungs-Umfang seit dem letzten Release ohne `src/`-Datei außer
`build-info.json`) steht in der [CLAUDE.md](../CLAUDE.md).

**Kein nachträglicher Voll-Lauf nach einem roten Ausschnitt.** Ein roter
Ausschnitt ist ein Befund und wird behoben; der darauf folgende Lauf ist
ohnehin fällig. Für den Wiederhol-Umfang nach einem punktuellen Fix gilt
die Wiederhol-Regel der [CLAUDE.md](../CLAUDE.md).

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
Stil-Regeln aus der CLAUDE.md-Konvention).

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

1. Neue `help.*`-Keys anlegen (CLAUDE.md-Konvention „Hilfe und Handbuch
   bei neuen Funktionen erweitern").
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
