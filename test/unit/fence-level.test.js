// 4T-001833 (Epic 3E-000254): Unit-Tests der Zaun-Regel in
// src/shared/markdown/fence-level.js — der einen, abhängigkeitsfreien Heimat
// der CommonMark-Regel, wann eine Zeile einen Code-Block öffnet und wann sie
// ihn schließt.
//
// **Warum eine eigene Prüfdatei.** Bis 4T-001833 stand die Regel allein in der
// Zeilen-Logik von `fenceOeffnerOffsets`, geprüft nur mittelbar über den
// portablen Export. Seither ist sie als `zaunOeffnung` und `schliesstZaun`
// ausgewiesen und wird von allen Lesern des Datensatz-Blocks benutzt; eine
// Abweichung träfe damit Maskierung, Lesen, Teilen, Suche und Export zugleich.
import { describe, it, expect } from 'vitest';
import {
  zaunOeffnung,
  schliesstZaun,
  fenceOeffnerOffsets,
  koennteStrukturZeileSein,
} from '../../src/shared/markdown/fence-level.js';

describe('fence-level: Öffnung einer Zaun-Zeile (4T-001833)', () => {
  // 4T-001833: Backticks und Tilden, mit Länge und Sprache.
  it('liest Zeichen, Länge und Sprache bei Backticks und Tilden', () => {
    expect(zaunOeffnung('```')).toEqual({ zeichen: '`', laenge: 3, sprache: '' });
    expect(zaunOeffnung('````perspective-records')).toEqual({
      zeichen: '`',
      laenge: 4,
      sprache: 'perspective-records',
    });
    expect(zaunOeffnung('~~~~~')).toEqual({ zeichen: '~', laenge: 5, sprache: '' });
    expect(zaunOeffnung('~~~ js weiteres')).toEqual({ zeichen: '~', laenge: 3, sprache: 'js' });
  });

  // 4T-001833: Einrückung bis drei Leerzeichen, nicht vier, kein Tabulator.
  it('erkennt bis zu drei Leerzeichen Einrückung, aber nicht vier und keinen Tabulator', () => {
    expect(zaunOeffnung('  ```')).toEqual({ zeichen: '`', laenge: 3, sprache: '' });
    expect(zaunOeffnung('   ~~~')).toEqual({ zeichen: '~', laenge: 3, sprache: '' });
    expect(zaunOeffnung('    ```')).toBeNull();
    expect(zaunOeffnung('\t```')).toBeNull();
  });

  // 4T-001833: Ein Backtick-Zaun mit Backtick im Infostring ist keiner.
  it('verwirft einen Backtick-Zaun mit Backtick im Infostring, nicht aber bei Tilden', () => {
    expect(zaunOeffnung('```a`b')).toBeNull();
    expect(zaunOeffnung('``` `')).toBeNull();
    expect(zaunOeffnung('~~~a`b')).toEqual({ zeichen: '~', laenge: 3, sprache: 'a`b' });
  });

  // 4T-001833: kurze Sequenzen, Text und Windows-Zeilenende.
  it('verwirft kurze Sequenzen und Text und übersieht ein Wagenrücklauf-Zeichen', () => {
    expect(zaunOeffnung('``')).toBeNull();
    expect(zaunOeffnung('~~')).toBeNull();
    expect(zaunOeffnung('Text ```')).toBeNull();
    expect(zaunOeffnung('\\```')).toBeNull();
    expect(zaunOeffnung('')).toBeNull();
    expect(zaunOeffnung(null)).toBeNull();
    expect(zaunOeffnung('```js\r')).toEqual({ zeichen: '`', laenge: 3, sprache: 'js' });
  });
});

describe('fence-level: Schluss einer Zaun-Zeile (4T-001833)', () => {
  const vier = { zeichen: '`', laenge: 4, sprache: 'md' };

  // 4T-001833: gleiches Zeichen kürzer, gleich und länger.
  it('schließt mit demselben Zeichen erst ab derselben Länge', () => {
    expect(schliesstZaun('```', vier)).toBe(false);
    expect(schliesstZaun('````', vier)).toBe(true);
    expect(schliesstZaun('``````', vier)).toBe(true);
    expect(schliesstZaun('   ````  ', vier)).toBe(true);
    expect(schliesstZaun('````\r', vier)).toBe(true);
  });

  // 4T-001833: anderes Zeichen, Sprach-Angabe, keine Zaun-Zeile, keine Öffnung.
  it('schließt nicht mit anderem Zeichen, mit Sprach-Angabe oder ohne Öffnung', () => {
    expect(schliesstZaun('~~~~~', vier)).toBe(false);
    expect(schliesstZaun('````js', vier)).toBe(false);
    expect(schliesstZaun('    ````', vier)).toBe(false);
    expect(schliesstZaun('Text', vier)).toBe(false);
    expect(schliesstZaun('````', null)).toBe(false);
    expect(schliesstZaun('~~~', { zeichen: '~', laenge: 3, sprache: '' })).toBe(true);
  });
});

describe('fence-level: Öffner der obersten Ebene über dieselbe Regel (4T-001833)', () => {
  // 4T-001833: `fenceOeffnerOffsets` benutzt die beiden Bausteine; das
  // Verhalten ist das bisherige.
  it('nennt nur Öffner der obersten Ebene, nach Länge, Zeichen und Infostring', () => {
    const text = [
      '````md', // 0: Öffner
      '```js', // innen, kürzer
      '````', // schließt
      '~~~', // Öffner
      '```', // anderes Zeichen, innen
      '~~~', // schließt
      '```a`b', // kein Zaun
      '\t```', // kein Zaun
      '```', // Öffner, bleibt offen
    ].join('\r\n');
    const zeilenAnfang = [];
    let pos = 0;
    for (const zeile of text.split('\n')) {
      zeilenAnfang.push(pos);
      pos += zeile.length + 1;
    }
    expect([...fenceOeffnerOffsets(text)]).toEqual([
      zeilenAnfang[0],
      zeilenAnfang[3],
      zeilenAnfang[8],
    ]);
  });
});

// 4T-002024 (Epic 3E-000192): der Vorfilter für Zwischenspeicher der
// Block-Bereiche. Er darf keine Zeile übersehen, die einen Zaun öffnet oder
// schließt oder den Vorspann begrenzt; gewöhnlicher Text fällt nicht darunter.
describe('fence-level: Vorfilter «könnte eine Struktur-Zeile sein» (4T-002024)', () => {
  // Zufalls-Generator mit festem Startwert (mulberry32).
  function zufall(startwert) {
    let a = startwert >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ZEICHEN = [
    ' ',
    ' ',
    '\t',
    '`',
    '`',
    '`',
    '~',
    '~',
    '-',
    '-',
    '.',
    '.',
    'a',
    'js',
    '>',
    '|',
  ];
  // Vorspann-Grenzen nach der Regel von `frontmatterBodyStart` (link-scan.js):
  // Beginn `---`, Ende `---` oder `...` mit Leerraum dahinter.
  const istVorspannGrenze = (z) => /^(---|\.\.\.)\s*$/.test(z) || z.trimEnd() === '---';

  it('wahr für jede Zeile, die einen Zaun öffnet oder schließt oder den Vorspann begrenzt', () => {
    const rnd = zufall(20260930);
    const verfehlt = [];
    let geprueft = 0;
    for (let i = 0; i < 20000; i++) {
      let zeile = '';
      const laenge = Math.floor(rnd() * 9);
      for (let j = 0; j < laenge; j++) zeile += ZEICHEN[Math.floor(rnd() * ZEICHEN.length)];
      const strukturell =
        zaunOeffnung(zeile) !== null ||
        schliesstZaun(zeile, { zeichen: '`', laenge: 3 }) ||
        schliesstZaun(zeile, { zeichen: '~', laenge: 3 }) ||
        istVorspannGrenze(zeile);
      if (!strukturell) continue;
      geprueft += 1;
      if (!koennteStrukturZeileSein(zeile) && verfehlt.length < 5) verfehlt.push(zeile);
    }
    expect(verfehlt).toEqual([]);
    expect(geprueft).toBeGreaterThan(100);
  });

  it('einzelne Formen: Zäune mit Einrückung und Infostring, Vorspann-Grenzen', () => {
    for (const zeile of ['```', '````md', '~~~', '   ```js', '\t```', '---', '...', '--- ']) {
      expect(koennteStrukturZeileSein(zeile), zeile).toBe(true);
    }
  });

  it('falsch für gewöhnliche Text-Zeilen', () => {
    for (const zeile of [
      '',
      'Text',
      '| a | 1 |',
      '- Punkt',
      '> Zitat',
      '^umsatz',
      'table: ^umsatz',
      '``inline``',
      'a ``` b',
      '--',
      '..',
    ]) {
      expect(koennteStrukturZeileSein(zeile), zeile).toBe(false);
    }
    expect(koennteStrukturZeileSein(null)).toBe(false);
  });
});
