// 4T-002630 (Epic 3E-000395, V2): Wächter über die Setz-Stellen der Vollansicht.
//
// Das Titelbild entsteht nur mit der Option `titelbild: true` an
// `api.renderMarkdown` (Opt-in, damit Einbettungen, Karten und Ausgaben ohne
// Titelbild bleiben). Die Vollansicht wird an mehreren Stellen gesetzt —
// Ansichts-Wechsel, Vorschau, Speichern und Vorschläge der Eigenschaften,
// Historie —, und nur ein Teil davon hat einen Ablauf-Fall. Fehlte die Option
// an einer Stelle, verschwände das Titelbild genau dort, ohne dass ein Fall rot
// würde. Dieser Wächter hält deshalb JEDE Stelle unter src/renderer/, die
// `renderedHtml.innerHTML` aus `api.renderMarkdown(` setzt, gegen die Option und
// ihre Zahl fest. Muster: test/unit/render-teilbaum-schritte.test.js (Bestand
// im Modulkopf gelesen, Regel «Bestands-Lesungen gehören in den Modulkopf»).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.resolve(HERE, '..', '..', 'src', 'renderer');

// Erwartete Setz-Stellen, je Datei die Zahl (Stand 2026-11-12).
const ERWARTET = {
  'modules/editor/editor-preview.js': 1,
  'modules/properties/properties-save.js': 1,
  'modules/properties/properties-suggest.js': 1,
  'modules/views/history-page.js': 1,
  'modules/views/history-status.js': 1,
  'modules/views/pane-render.js': 1,
};

const SETZ_STELLE = /renderedHtml\.innerHTML\s*=\s*api\.renderMarkdown\(([^;]*)\);/g;

// Alle Setz-Stellen mit ihren Argumenten, gelesen einmal beim Laden des Moduls.
function sammleSetzStellen() {
  const stellen = [];
  const gehe = (dir) => {
    for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
      const voll = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) {
        gehe(voll);
        continue;
      }
      if (!eintrag.name.endsWith('.js') || eintrag.name.endsWith('.bundle.js')) continue;
      const inhalt = fs.readFileSync(voll, 'utf8');
      const datei = path.relative(RENDERER, voll).split(path.sep).join('/');
      for (const m of inhalt.matchAll(SETZ_STELLE)) stellen.push({ datei, argumente: m[1] });
    }
  };
  gehe(RENDERER);
  return stellen;
}

const STELLEN = sammleSetzStellen();

describe('Titelbild: Option der Vollansicht an jeder Setz-Stelle (4T-002630)', () => {
  it('die Setz-Stellen sind genau die erwarteten', () => {
    const gezaehlt = {};
    for (const s of STELLEN) gezaehlt[s.datei] = (gezaehlt[s.datei] || 0) + 1;
    expect(
      gezaehlt,
      'Eine Setz-Stelle der Vollansicht ist hinzugekommen oder entfallen: Option ' +
        '`titelbild: true` setzen und die Liste ERWARTET in diesem Wächter nachziehen.',
    ).toEqual(ERWARTET);
    expect(STELLEN).toHaveLength(6);
  });

  it('jede Setz-Stelle übergibt die Option titelbild: true', () => {
    const ohne = STELLEN.filter((s) => !/\btitelbild:\s*true\b/.test(s.argumente)).map(
      (s) => s.datei,
    );
    expect(ohne, `Setz-Stelle(n) ohne titelbild: true: ${ohne.join(', ')}`).toEqual([]);
  });
});
