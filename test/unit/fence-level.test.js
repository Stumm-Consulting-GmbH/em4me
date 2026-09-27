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
