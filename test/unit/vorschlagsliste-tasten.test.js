// 4T-001714 (Epic 3E-000300): Die Tasten der Vorschlagsliste — gehalten gegen
// die Belegung der Vervollständigungs-Bibliothek, an drei Stellen.
//
// Anlass (Fehlerklassen-Register, 2026-09-24): Funktions-Katalog, Handbuch-Seite
// «Vernetzung» und README sagten in allen Sprachfassungen, Enter ODER Tab
// übernehme einen Vorschlag. Die Bibliothek belegt den Tabulator aber nicht
// (gemessen: Tab bei offener Liste rückt die Zeile ein), und die Aussage war
// nie gegen die Belegung geprüft worden. Dieselbe Belegung bildet seit
// 4T-001713 die Liste in der Tabellenzelle nach (`live-table-suggestions.js`).
//
// Die Prüfung liest deshalb die Belegung aus der Bibliothek selbst und hält
// drei Dinge daran fest: die Menge der Tasten, die Tasten der Zell-Liste und
// die Abwesenheit der Aussage «Enter oder Tab» in den Texten. Ändert die
// Bibliothek ihre Belegung, schlägt der erste Fall an, und Texte wie Zell-Liste
// sind nachzuziehen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { completionKeymap } from '@codemirror/autocomplete';

const ROOT = path.resolve(__dirname, '..', '..');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];
const lies = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// «Enter oder Tab», «Enter/Tab» und ihre Fassungen in den fünf Sprachen.
const ENTER_ODER_TAB = /(Enter|Entrée|Intro|Invio)\s*(\/|oder|or|ou|o)\s*Tab\b/;

// Tasten der Bibliothek ohne die Mac-Sonderbelegungen.
const bibliothek = completionKeymap
  .filter((b) => b.key)
  .map((b) => b.key)
  .sort();

describe('Vorschlagsliste: Tasten der Bibliothek (4T-001714)', () => {
  it('die Bibliothek belegt genau diese Tasten, den Tabulator nicht', () => {
    expect(bibliothek).toEqual(
      ['ArrowDown', 'ArrowUp', 'Ctrl-Space', 'Enter', 'Escape', 'PageDown', 'PageUp'].sort(),
    );
  });

  it('die Liste in der Tabellenzelle bildet dieselben Tasten nach (4T-001713)', () => {
    const quelle = lies('src/renderer/modules/live/live-table-suggestions.js');
    const block = quelle.match(/const wirkung = \{([\s\S]*?)\}\[event\.key\]/);
    expect(block, 'Tasten-Tafel der Zell-Liste nicht gefunden').not.toBeNull();
    const tasten = [...block[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    // Strg+Leertaste steht als eigener Zweig vor der Tafel.
    expect(quelle).toMatch(/event\.key === ' ' && event\.ctrlKey/);
    expect([...tasten, 'Ctrl-Space'].sort()).toEqual(bibliothek);
  });

  it('kein Text behauptet, der Tabulator übernehme einen Vorschlag', () => {
    const befunde = [];
    for (const l of LANGS) {
      const katalog = JSON.parse(lies(`src/i18n/fragments/${l}/help-feature.json`));
      if (ENTER_ODER_TAB.test(katalog['help.feature.autocomplete'])) {
        befunde.push(`${l}: help.feature.autocomplete`);
      }
      if (ENTER_ODER_TAB.test(lies(`src/i18n/help/linking.${l}.md`))) {
        befunde.push(`src/i18n/help/linking.${l}.md`);
      }
    }
    if (ENTER_ODER_TAB.test(lies('README.md'))) befunde.push('README.md');
    expect(befunde).toEqual([]);
  });

  it('die Erkennung trifft die frühere Aussage in allen fünf Fassungen', () => {
    for (const satz of [
      'Enter/Tab wählt',
      'Enter oder Tab wählt aus',
      'Enter or Tab selects',
      'Entrée ou Tab sélectionne',
      'Intro o Tab selecciona',
      'Invio o Tab seleziona',
    ]) {
      expect(ENTER_ODER_TAB.test(satz), satz).toBe(true);
    }
  });
});
