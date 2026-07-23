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
├── e2e/         Playwright: End-to-End-Tests gegen die echte App
│   ├── helpers/   gemeinsame Helpers (App-Start, Selektoren)
│   └── smoke/     Smoke-Suite über die Kernabläufe
└── fixtures/    statisches Test-Material (Markdown-Dateien)
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
| `npm test` | Vitest-Lauf (Unit/Snapshot). Pflicht vor jedem Commit, per pre-commit-Hook erzwungen. |
| `npm run test:watch` | Vitest-Watch-Modus; `.only` ist hier erlaubt (`--allowOnly`). |
| `npm run test:e2e` | Playwright-E2E-Lauf; baut vorher das Renderer-Bundle (`pretest:e2e`). Pflicht bei Renderer-/Main-Änderungen. |

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
   damit der pre-commit-Hook nie mit einer Teil-Suite grün wird.
6. **Ein Worker für E2E.** Electron-Instanzen werden nicht parallelisiert
   (`workers: 1`); `retries: 0` macht Flakiness sichtbar statt sie zu
   maskieren. Stabilitätskriterium: drei Läufe in Folge grün.
7. **Diagnose-Artefakte nur im Fehlerfall.** Screenshot und Trace landen
   unter `test-results/` (gitignored); im autonomen Umsetzungs-Modus sind
   sie das primäre Diagnose-Mittel.
8. **Zählungs-Specs bei neuen Einstellungs-Bereichen nachziehen.** Die
   E2E-Spec ES-05 (`test/e2e/funktionen/einstellungen-seite.spec.js`)
   zählt die Bereichsnavigation der Einstellungs-Seite, der Unit-Test
   der Bereichs-Registry (`test/unit/renderer/settings-page.test.js`)
   prüft die Reihenfolge der Bereichs-IDs. Jeder neue Bereich zieht
   beide Stellen im selben Commit nach (Zählwert, ID-Liste, Kommentar
   mit Task-ID) — sonst kippt die Voll-Suite erst im Release-Gate.
9. **Datums-Bezug injizieren.** Tests und Fixtures, die „heute" berühren
   (Überfälligkeit, Score, Datum-Komfort-Filter), arbeiten mit
   injiziertem Referenz-Datum bzw. stabilen Fixture-Daten (weit
   vergangen wie 2020, weit zukünftig wie 2099), nie mit dem
   Kalendertag des Laufs.

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

## pre-commit-Hook

Versionierter Hook unter `.githooks/pre-commit` führt nacheinander
`npm run format:check` (Prettier), `npm run lint` (ESLint) und `npm test`
aus und verweigert den Commit, sobald ein Schritt rot ist. Einmalige
Aktivierung pro Klon:

```bash
git config core.hooksPath .githooks
```

Die E2E-Suite bleibt bewusst außerhalb des Hooks (Laufzeit); sie ist
Pflicht-Lauf bei Renderer-/Main-Änderungen und in den Epic-Sammeltasks.

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
damit per pre-commit-Hook): ein neuer Katalog-Eintrag ohne Matrix-Pflege
bricht den Lauf. Die Vollständigkeit der Handbuch-Seiten selbst sichert
zusätzlich `test/unit/manual-pages.test.js` (alle fünf Sprachfassungen
pro Registry-Seite, Titel-Keys, keine verwaisten Dateien); den Text-Stil
sichert `test/unit/hilfetext-stil.test.js` (keine Fremdprodukt-Verweise
und keine Versions-Historie in Handbuch-Seiten und Katalog-Texten,
Stil-Regeln aus der CLAUDE.md-Konvention).

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
pre-commit-Hook. Die Parse-Logik teilt er sich mit
`scripts/verify-dashboard.js` über das Modul `scripts/pm-parse.js`. Bekannte
Altbestand-Funde sind in `scripts/pm-lint-baseline.json` grandfathered; neue
oder geänderte Dokumente, die eine Regel verletzen, stehen nicht in der Baseline
und lassen den Lauf fehlschlagen. Je Regelgruppe belegt eine Negativ-Probe im
Test, dass die Regel anschlägt.
