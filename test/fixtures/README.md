# Test-Fixtures

Statisches Test-Material für Unit- und E2E-Tests. Struktur:

- `smoke/` — Markdown-Dateien der E2E-Smoke-Suite.
- `render/` — Markdown-Fixtures der Render-Pipeline-Snapshot-Tests.
- `funktionen/` — Material der E2E-Funktions-Specs.
- `regression/` — Material der E2E-Regressions-Specs.
- `perf/` — Material der Laufzeit-Messungen.
- `extensions/` — Erweiterungs-Pakete für die Tests der externen Erweiterungen.

Konventionen siehe [test/README.md](../README.md). Abgrenzung: Der
Top-Level-Ordner `Tests/` (gitignored) enthält **manuelles** Test-Material
pro Task und ist kein Fixture-Ort für automatisierte Tests.
