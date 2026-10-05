import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 4T-002072 (Epic 3E-000192): Wächter gegen einen Fehlerkasten, der nur die
// Kennung statt des Textes zeigt. Die Texte setzt der Viewer im Renderer
// (src/renderer/modules/query/perspective-datatable-view.js) über seine
// Tabelle `ERROR_KEYS`; eine Kennung, die dort fehlt, bleibt als Code stehen.
// So geschehen mit `emptyTableName`, `invalidTableName`, `badColumnLabel` und
// `unknownTypesValue`, deren Texte es in allen fünf Sprachen gab. Gelesen wird
// am Quelltext: jede Kennung, die eine Datei der Modul-Familie
// `perspective-datatable*.js` als Struktur-Fehler (`code: '…'`, `code = …`)
// vergibt, gegen die Tabelle des Viewers und die Sprach-Fragmente.
describe('perspective-datatable — jeder Struktur-Fehler hat seinen Text (4T-002072)', () => {
  const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

  function fehlerKennungen() {
    const ordner = 'src/shared/markdown';
    const kennungen = new Set();
    for (const datei of fs.readdirSync(path.join(WURZEL, ordner))) {
      if (!/^perspective-datatable.*\.js$/.test(datei)) continue;
      const text = lies(`${ordner}/${datei}`);
      for (const m of text.matchAll(/\bcode:\s*'([A-Za-z]+)'/g)) kennungen.add(m[1]);
      for (const m of text.matchAll(/\bcode\s*=\s*([^;]+);/g)) {
        for (const w of m[1].matchAll(/'([A-Za-z]+)'/g)) kennungen.add(w[1]);
      }
    }
    return kennungen;
  }

  function errorKeys() {
    const quelle = lies('src/renderer/modules/query/perspective-datatable-view.js');
    const block = /const ERROR_KEYS = \{([\s\S]*?)\};/.exec(quelle);
    expect(block, 'Tabelle ERROR_KEYS im Viewer').not.toBeNull();
    return Object.fromEntries(
      [...block[1].matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
    );
  }

  it('jede Kennung des Parsers steht in ERROR_KEYS, und ihr Schlüssel hat in fünf Sprachen einen Text', () => {
    const kennungen = fehlerKennungen();
    // Nicht-Vakuität: der Scan sieht die Kennungen aller drei Dateien.
    for (const k of [
      'noColumns',
      'badFormat',
      'computedCycle',
      'emptyTableName',
      'badColumnLabel',
    ]) {
      expect(kennungen).toContain(k);
    }
    const tabelle = errorKeys();
    const fehlend = [...kennungen].filter((k) => !tabelle[k]);
    expect(fehlend, 'Kennungen ohne Eintrag in ERROR_KEYS').toEqual([]);
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const texte = JSON.parse(lies(`src/i18n/fragments/${sprache}/datatable.json`));
      const ohneText = [...kennungen].filter((k) => !texte[tabelle[k]]);
      expect(ohneText, `Schlüssel ohne Text (${sprache})`).toEqual([]);
    }
  });
});
