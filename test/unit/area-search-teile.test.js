// 4T-001293 (Epic 3E-000224): Geteilte Dokumente in der Bereichs-Suche
// (src/main/area/area-search-teile.js). Abgedeckt ist AK1: Ein Treffer in
// einem hinteren Teil erscheint als Treffer des Gesamt-Dokuments, ohne
// Teil-Angabe im Namen.
import { describe, it, expect } from 'vitest';
import {
  kopfRelPfad,
  kopfAbsPfad,
  fasseTeileZusammen,
} from '../../src/main/area/area-search-teile.js';
import {
  writePartLine,
  isPartBasename,
  PART_SEP,
  PART_INFIX,
} from '../../src/shared/document-parts.js';
import { SUBPAGE_SEP } from '../../src/shared/subpages.js';

const teil = (grund, n) => `${grund}${PART_SEP}${PART_INFIX}${String(n).padStart(5, '0')}`;

// Baut einen Vorrat, wie ihn die Suche haelt.
function vorratAus(eintraege) {
  return {
    modus: 'vorrat',
    texte: new Map(eintraege.map(([rel, text]) => [rel, { text, mtimeMs: 1, size: text.length }])),
    reihenfolge: eintraege.map(([rel]) => rel),
    bytes: 0,
  };
}

describe('area-search-teile: Kopf-Pfad eines Teils', () => {
  it('fuehrt eine Teil-Datei auf ihr Dokument zurueck', () => {
    expect(kopfRelPfad(`Ordner/${teil('Notizen', 2)}.md`)).toBe('Ordner/Notizen.md');
    expect(kopfRelPfad(`${teil('Notizen', 12)}.md`)).toBe('Notizen.md');
  });

  it('laesst ein gewoehnliches Dokument unveraendert', () => {
    expect(kopfRelPfad('Ordner/Notizen.md')).toBe('Ordner/Notizen.md');
    expect(kopfRelPfad('Notizen.md')).toBe('Notizen.md');
  });

  it('behaelt die Ordner-Ebene und die Endung', () => {
    expect(kopfRelPfad(`a/b/c/${teil('Lang Name', 3)}.markdown`)).toBe('a/b/c/Lang Name.markdown');
  });

  it('arbeitet auch auf absoluten Pfaden', () => {
    const trenner = String.fromCharCode(92); // Backslash, plattformunabhängig
    const einheitlich = (s) => s.split(trenner).join('/');
    expect(einheitlich(kopfAbsPfad(`C:/x/${teil('Notizen', 2)}.md`))).toBe('C:/x/Notizen.md');
    expect(einheitlich(kopfAbsPfad('C:/x/Notizen.md'))).toBe('C:/x/Notizen.md');
  });
});

describe('Teil-Dateien in der Ordner-Liste des Bereichs (4T-001293)', () => {
  // Entscheidung des Product Owners vom 2026-08-31: Teile erscheinen nicht in
  // der Ordner-Liste. Geprueft wird die Filter-Bedingung, die der Handler
  // area:listDir anwendet — sie ist derselbe Namens-Test wie in der
  // Unterseiten-Anzeige, und beide muessen dieselbe Antwort geben.
  const filter = (namen) => namen.filter((n) => !isPartBasename(n.replace(/\.[^./]+$/, '')));

  it('haelt die Folgeteile heraus und laesst die Kopf-Datei stehen', () => {
    expect(
      filter([
        'Gewoehnliches Dokument.md',
        'Reisebericht.md',
        `${teil('Reisebericht', 2)}.md`,
        `${teil('Reisebericht', 3)}.md`,
      ]),
    ).toEqual(['Gewoehnliches Dokument.md', 'Reisebericht.md']);
  });

  it('laesst eine Datei stehen, die das Trennzeichen ohne gueltige Nummer traegt', () => {
    // Kein Teil, sondern ein gewoehnlicher Name mit einem Aufzaehlungszeichen.
    expect(filter([`Liste${PART_SEP}Punkte.md`])).toEqual([`Liste${PART_SEP}Punkte.md`]);
  });

  it('laesst eine geteilte Unterseite als Dokument stehen, ihren Teil aber nicht', () => {
    const unterseite = `Prozess${SUBPAGE_SEP}Entwurf`;
    expect(filter([`${unterseite}.md`, `${teil(unterseite, 2)}.md`])).toEqual([`${unterseite}.md`]);
  });
});

describe('area-search-teile: Vorrat zusammenfuehren (AK1)', () => {
  it('fuehrt die Teile unter der Kopf-Datei zusammen', () => {
    const kopf = writePartLine('# Eins\nInhalt eins\n', { index: 1, base: 'Notizen' }).text;
    const zwei = writePartLine('# Zwei\nInhalt zwei\n', { index: 2, base: 'Notizen' }).text;
    const drei = writePartLine('# Drei\nInhalt drei\n', { index: 3, base: 'Notizen' }).text;
    const v = fasseTeileZusammen(
      vorratAus([
        ['Notizen.md', kopf],
        [`${teil('Notizen', 2)}.md`, zwei],
        [`${teil('Notizen', 3)}.md`, drei],
      ]),
    );
    expect(v.reihenfolge).toEqual(['Notizen.md']);
    const text = v.texte.get('Notizen.md').text;
    expect(text).toContain('Inhalt eins');
    expect(text).toContain('Inhalt zwei');
    expect(text).toContain('Inhalt drei');
    // Genau eine Zuordnungs-Zeile: die technischen Koepfe der Folgeteile sind
    // draussen, wie beim Oeffnen.
    expect(text.match(/doc-part/g)).toHaveLength(1);
  });

  it('haelt die Reihenfolge der Teile ein, egal wie sie im Vorrat stehen', () => {
    const mach = (n, t) => writePartLine(`# ${t}\n`, { index: n, base: 'N' }).text;
    const v = fasseTeileZusammen(
      vorratAus([
        [`${teil('N', 3)}.md`, mach(3, 'Drei')],
        ['N.md', mach(1, 'Eins')],
        [`${teil('N', 2)}.md`, mach(2, 'Zwei')],
      ]),
    );
    const text = v.texte.get('N.md').text;
    expect(text.indexOf('Eins')).toBeLessThan(text.indexOf('Zwei'));
    expect(text.indexOf('Zwei')).toBeLessThan(text.indexOf('Drei'));
  });

  it('laesst einen Vorrat ohne geteilte Dokumente unveraendert (Regelfall kostet nichts)', () => {
    const v = vorratAus([
      ['A.md', '# A\n'],
      ['B.md', '# B\n'],
    ]);
    const nachher = fasseTeileZusammen(v);
    expect(nachher).toBe(v);
  });

  it('laesst einen Teil ohne seine Kopf-Datei stehen, statt Treffer zu verlieren', () => {
    // Die Kopf-Datei liegt ausserhalb des Bereichs. Den Teil zu unterschlagen
    // hiesse, seine Treffer verschwinden zu lassen.
    const v = fasseTeileZusammen(vorratAus([[`${teil('Fremd', 2)}.md`, '# Rest\nText\n']]));
    expect(v.reihenfolge).toEqual([`${teil('Fremd', 2)}.md`]);
  });

  it('trennt Dokumente mit gleichem Praefix in verschiedenen Ordnern', () => {
    const mach = (n, b, t) => writePartLine(`# ${t}\n`, { index: n, base: b }).text;
    const v = fasseTeileZusammen(
      vorratAus([
        ['a/N.md', mach(1, 'N', 'A eins')],
        [`a/${teil('N', 2)}.md`, mach(2, 'N', 'A zwei')],
        ['b/N.md', mach(1, 'N', 'B eins')],
        [`b/${teil('N', 2)}.md`, mach(2, 'N', 'B zwei')],
      ]),
    );
    expect(v.reihenfolge).toEqual(['a/N.md', 'b/N.md']);
    expect(v.texte.get('a/N.md').text).toContain('A zwei');
    expect(v.texte.get('a/N.md').text).not.toContain('B zwei');
    expect(v.texte.get('b/N.md').text).toContain('B zwei');
  });

  it('behaelt Aenderungszeit und Groesse der Kopf-Datei', () => {
    const v = fasseTeileZusammen(
      vorratAus([
        ['N.md', writePartLine('# A\n', { index: 1, base: 'N' }).text],
        [`${teil('N', 2)}.md`, writePartLine('# B\n', { index: 2, base: 'N' }).text],
      ]),
    );
    expect(v.texte.get('N.md').mtimeMs).toBe(1);
  });
});
