// 4T-002064 (Epic 3E-000156): Konfiguration ausschliesslich fuer den Lauf des
// Wanduhr-Waechters (Gate `test:uhr`, scripts/gate-uhr.js).
//
// **Warum eine zweite Konfiguration.** Der Waechter-Lauf soll seinen
// Maschinen-Bericht nach test-berichte/unit-uhr.json schreiben und den Bericht
// der unverschobenen Suite stehen lassen. Auf der Kommandozeile geht das nicht:
// `--reporter=json --outputFile.json=…` behaelt die Angabe `outputFile` am
// json-Reporter der Haupt-Konfiguration und schreibt doch nach unit.json
// (gemessen am 2026-10-02). Diese Datei erbt deshalb alles aus der
// Haupt-Konfiguration und ersetzt allein die Reporter-Liste; Muster
// test/vitest.messung.config.mjs.
//
// **Die Wurzel wird ausdruecklich gesetzt**, aus demselben Grund wie dort: Vitest
// leitet `root` sonst aus dem Ort dieser Datei ab, und alle relativen Pfade der
// geerbten Konfiguration zeigten ins Leere.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import basis from '../vitest.config.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default {
  ...basis,
  test: {
    ...basis.test,
    root: WURZEL,
    reporters: ['default', ['json', { outputFile: 'test-berichte/unit-uhr.json' }]],
  },
};
