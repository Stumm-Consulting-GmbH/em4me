# Test-Fixtures

Statisches Test-Material für Unit- und E2E-Tests. Struktur:

- `smoke/` — Markdown-Dateien der E2E-Smoke-Suite.
- `render/` — Markdown-Fixtures der Render-Pipeline-Snapshot-Tests.
- `funktionen/` — Material der E2E-Funktions-Specs.
- `regression/` — Material der E2E-Regressions-Specs.
- `perf/` — Material der Laufzeit-Messungen.
- `extensions/` — Erweiterungs-Pakete für die Tests der externen Erweiterungen.
- `presentation/` — Beispiel-Dateien des Präsentations-Format-Kerns
  (`test/unit/presentation-format.test.js`): drei Nachbauten im Format von Marp
  (`marp-beispiel.md`, dazu `marp-vortrag.md` und `marp-hintergruende.md` nach
  öffentlichen Marp-Beispielen, die auch der Ablauf-Fall `PR-02` in
  `test/e2e/funktionen/praesentation.spec.js` öffnet), die Grenzfälle der
  Trenn-Regel und ein Dokument ohne Kennzeichen; Inhalte erfunden. Die Bilder,
  die die Marp-Nachbauten nennen, legt der Ablauf-Fall selbst an.
  Seit der zweiten Ausbaustufe dazu `marp-angaben-je-folie.md` (Angaben je
  Folie in allen drei Geltungen, `headingDivider`, Aufdeck-Listen und `fit`;
  Kern-Prüfung in `test/unit/presentation-folien-schluessel.test.js`, Ablauf-Fall
  `PR-18` in `test/e2e/funktionen/praesentation-uebersicht.spec.js`).
- `query/` — festgehaltene Vorlagen der Abfrage-Ausgabe für den Vergleichs-Prüffall
  `test/unit/renderer/ergebnismenge-vorher-nachher.test.js`; einmal mit dem
  bisherigen Bau-Weg aufgenommen und danach nur noch gelesen. Eine Änderung ist
  ein bewusster, gelesener Schritt wie bei den Render-Snapshots.
- `kalender-jahres-struktur/` — Probe-Regel und Probe-Tafel des Kalender-Bausteins
  «Jahres-Struktur je Jahr» (`test/unit/kalender-jahres-struktur.test.js`):
  Schaltmonat, wechselnde Monatslängen, verschobener Jahresbeginn und Ränder.
  Sie werden über den Prüf-Zugang `setYearlySourcesForTests` eingehängt; die
  Liste der Regeln und Tafeln des Programms nennt sie nicht. Inhalte erfunden.
- `kalender-persisch/` — Vergleichswerte des Nachweises der persischen
  Kalender-Vorlage (`test/unit/kalender-vorlage-persisch.test.js`): Schaltmarken
  der Jahre 1279 bis 1479 und zwei Anker-Tage aus Veröffentlichungen des
  Kalender-Zentrums der Universität Teheran, mit Quellenangabe in `QUELLE.md`.
  Einmalig beschafft und nur gelesen; kein Prüflauf ruft die Quelle auf.
- `kalender-chinesisch/` — amtliche Stichprobe des Nachweises der chinesischen
  Kalender-Vorlage (`test/unit/kalender-vorlage-chinesisch.test.js`): die sechs
  Dateien 2023 bis 2028 des Hong Kong Observatory aus dem Datenportal der
  Regierung Hongkongs, byte-gleich zum Original unter `portal/`, mit
  Quellenangabe und Prüfsummen in `QUELLE.md`. Einmalig beschafft und nur
  gelesen; kein Prüflauf ruft das Portal auf.
- `kalender-umm-al-qura/` — Vergleichswerte des Nachweises der islamischen
  Kalender-Vorlage nach Umm al-Qura (`test/unit/kalender-vorlage-umm-al-qura.test.js`):
  Prüfsumme und Kennzahlen der 2 196 Monatsanfänge 1318 bis 1500 AH aus dem
  amtlichen Portal der KACST, ohne die Monatsanfänge selbst, mit Quellenangabe
  und Begründung in `QUELLE.md`. Einmalig beschafft und nur gelesen; kein
  Prüflauf ruft das Portal auf.

Konventionen siehe [test/README.md](../README.md). Abgrenzung: Der
Top-Level-Ordner `Tests/` (gitignored) enthält **manuelles** Test-Material
pro Task und ist kein Fixture-Ort für automatisierte Tests.
