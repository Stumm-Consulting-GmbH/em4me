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
- `query/` — festgehaltene Vorlagen der Abfrage-Ausgabe für den Vergleichs-Prüffall
  `test/unit/renderer/ergebnismenge-vorher-nachher.test.js`; einmal mit dem
  bisherigen Bau-Weg aufgenommen und danach nur noch gelesen. Eine Änderung ist
  ein bewusster, gelesener Schritt wie bei den Render-Snapshots.

Konventionen siehe [test/README.md](../README.md). Abgrenzung: Der
Top-Level-Ordner `Tests/` (gitignored) enthält **manuelles** Test-Material
pro Task und ist kein Fixture-Ort für automatisierte Tests.
