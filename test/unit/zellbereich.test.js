// 4T-002554 (Epic 3E-000389): Zellbereich aus einer Tabellenkalkulation als
// Pipe-Tabelle (src/shared/markdown/zellbereich.js) — Zerlegung, Schwelle der
// Erkennung (Entscheidung T3), Bau der Tabelle (T4, T7) und Einsetzen als Block.
//
// Die Excel-Fälle sind die am 2026-11-05 im Einfüge-Ereignis gemessenen Texte
// (Microsoft Excel, Electron 33); sie stehen wörtlich hier, damit die Zerlegung
// gegen die reale Ablage geprüft wird und nicht gegen eine angenommene.
import { describe, it, expect } from 'vitest';
import {
  zerlegeZellbereich,
  hatTabellenForm,
  waehleTrennzeichen,
  zellbereichAus,
  istZellbereich,
  alsPipeTabelle,
  alsBlockEinsetzen,
} from '../../src/shared/markdown/zellbereich.js';
import { parsePipeTable } from '../../src/shared/markdown/table-edit.js';

const EXCEL_PLAIN =
  'Name\tWert\tNotiz\r\nAlpha\t12.5\t"zwei\nZeilen"\r\nBe|ta\t7\t\r\nGamma "G"\ta;b\tEnde\r\n';
const EXCEL_PLAIN_2 = '"Zitat" vorn\tB\r\nx\t"mit\tTab"\r\n\tz\r\n';
const EXCEL_HTML =
  '<html><body><table border=0>\r\n<!--StartFragment-->\r\n<tr><td>Name</td></tr></table></body></html>';

describe('zerlegeZellbereich: Zeilen und Felder', () => {
  it('Excel-Ablage: CRLF trennt Zeilen, LF in Anführungszeichen bleibt in der Zelle', () => {
    expect(zerlegeZellbereich(EXCEL_PLAIN)).toEqual([
      ['Name', 'Wert', 'Notiz'],
      ['Alpha', '12.5', 'zwei\nZeilen'],
      ['Be|ta', '7', ''],
      ['Gamma "G"', 'a;b', 'Ende'],
    ]);
  });

  it('Excel-Ablage: Anführungszeichen am Wertanfang ohne Einfassung, Tabulator in Einfassung, leere erste Zelle', () => {
    expect(zerlegeZellbereich(EXCEL_PLAIN_2)).toEqual([
      ['"Zitat" vorn', 'B'],
      ['x', 'mit\tTab'],
      ['', 'z'],
    ]);
  });

  it('verdoppeltes Anführungszeichen steht für eines', () => {
    expect(zerlegeZellbereich('"sagt ""ja"""\tb\n')).toEqual([['sagt "ja"', 'b']]);
  });

  it('Semikolon als Trennzeichen, Semikolon in Einfassung bleibt im Wert', () => {
    expect(zerlegeZellbereich('a;"b;c"\n1;2', ';')).toEqual([
      ['a', 'b;c'],
      ['1', '2'],
    ]);
  });

  it('LF und CR als Zeilenende, abschließende Leerzeilen verworfen', () => {
    expect(zerlegeZellbereich('a\tb\n1\t2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(zerlegeZellbereich('a\tb\r1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(zerlegeZellbereich('')).toEqual([]);
  });

  it('nicht geschlossene Einfassung ist gewöhnlicher Text', () => {
    expect(zerlegeZellbereich('"offen\tb\n1\t2')).toEqual([
      ['"offen', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('Schwelle der Erkennung (T3, AK2)', () => {
  it('Excel-Ablage mit Tabellen-Form ist ein Zellbereich', () => {
    expect(istZellbereich({ text: EXCEL_PLAIN, html: EXCEL_HTML })).toBe(true);
    expect(istZellbereich({ text: EXCEL_PLAIN_2, html: EXCEL_HTML })).toBe(true);
  });

  it('ohne Tabellen-Form wandelt Strg+V nicht um, auch bei sauberem Tabulator-Text', () => {
    expect(istZellbereich({ text: 'a\tb\n1\t2', html: '' })).toBe(false);
    expect(istZellbereich({ text: 'a\tb\n1\t2' })).toBe(false);
  });

  it('HTML ohne Tabelle (Text einer Webseite) wandelt nicht um', () => {
    expect(hatTabellenForm('<p>a\tb</p><div>table</div>')).toBe(false);
    expect(istZellbereich({ text: 'a\tb\n1\t2', html: '<p>a b</p>' })).toBe(false);
    expect(hatTabellenForm('<TABLE class=x>')).toBe(true);
    expect(hatTabellenForm('<tablet>')).toBe(false);
  });

  it('eine Zeile, eine Spalte oder ungleiche Feldzahl ist kein Zellbereich', () => {
    expect(zellbereichAus({ text: 'a\tb\tc', html: EXCEL_HTML })).toBeNull();
    expect(zellbereichAus({ text: 'a\nb\nc', html: EXCEL_HTML })).toBeNull();
    expect(zellbereichAus({ text: 'a\tb\n1\t2\t3', html: EXCEL_HTML })).toBeNull();
  });

  it('gewöhnlicher Text mit Tabulatoren bleibt Text (AK2)', () => {
    const code = 'function f() {\n\treturn 1;\n}\n';
    expect(zellbereichAus({ text: code, html: EXCEL_HTML })).toBeNull();
    expect(zellbereichAus({ text: code }, { tabellenForm: false })).toBeNull();
    const prosa = 'Erster Satz\tmit Tab.\nZweiter Satz ohne.';
    expect(zellbereichAus({ text: prosa }, { tabellenForm: false })).toBeNull();
  });

  it('ohne Tabellen-Form: Zeile mit führendem Trennzeichen (Tabulator-Einzug) bleibt Text', () => {
    expect(zellbereichAus({ text: '\ta\tb\n\t1\t2' }, { tabellenForm: false })).toBeNull();
    expect(zellbereichAus({ text: 'a\tb\n1\t2' }, { tabellenForm: false })).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('Trennzeichen-Wahl: das häufigere, bei Gleichstand der Tabulator', () => {
    expect(waehleTrennzeichen('a;b;c\n1;2;3')).toBe(';');
    expect(waehleTrennzeichen('a\tb;c\n1\t2')).toBe('\t');
    expect(waehleTrennzeichen('a;"x\ty\tz"\n1;2')).toBe(';');
    expect(waehleTrennzeichen('')).toBe('\t');
  });
});

describe('alsPipeTabelle: Bau der Tabelle (T4, T7, AK4)', () => {
  it('Excel-Ablage ergibt eine gültige Tabelle mit Kopfzeile', () => {
    const zeilen = alsPipeTabelle(zellbereichAus({ text: EXCEL_PLAIN, html: EXCEL_HTML }));
    expect(zeilen).toEqual([
      '| Name      | Wert | Notiz       |',
      '| --------- | ---- | ----------- |',
      '| Alpha     | 12.5 | zwei Zeilen |',
      '| Be\\|ta    | 7    |             |',
      '| Gamma "G" | a;b  | Ende        |',
    ]);
  });

  it('Rücklesen mit parsePipeTable ergibt dieselben Werte (AK4)', () => {
    const modell = parsePipeTable(alsPipeTabelle(zerlegeZellbereich(EXCEL_PLAIN)));
    expect(modell.hasSeparator).toBe(true);
    expect(modell.columnCount).toBe(3);
    expect(modell.header).toEqual(['Name', 'Wert', 'Notiz']);
    expect(modell.rows).toEqual([
      ['Alpha', '12.5', 'zwei Zeilen'],
      ['Be\\|ta', '7', ''],
      ['Gamma "G"', 'a;b', 'Ende'],
    ]);
  });

  it('Umbruch wird zu einem Leerzeichen (T4), Leerraum um den Umbruch entfällt', () => {
    expect(
      alsPipeTabelle([
        ['a', 'b'],
        [' eins \r\n  zwei ', 'x'],
      ])[2],
    ).toBe('| eins zwei | x   |');
  });

  it('nur der senkrechte Strich wird geschützt (T7), ein schon geschützter bleibt', () => {
    const z = alsPipeTabelle([
      ['a|b', '**fett**'],
      ['c\\|d', 'e\\\\|f'],
    ]);
    expect(z[0]).toContain('a\\|b');
    expect(z[0]).toContain('**fett**');
    expect(z[2]).toContain('c\\|d');
    // Zwei Rückstriche schützen den Strich nicht, deshalb kommt einer hinzu.
    expect(z[2]).toContain('e\\\\\\|f');
    expect(parsePipeTable(z).columnCount).toBe(2);
  });

  it('kurze Zeilen werden mit leeren Zellen aufgefüllt', () => {
    const modell = parsePipeTable(alsPipeTabelle([['a', 'b', 'c'], ['1']]));
    expect(modell.rows).toEqual([['1', '', '']]);
  });
});

describe('alsBlockEinsetzen: Tabelle als eigener Block', () => {
  const tabelle = ['| a   | b   |', '| --- | --- |', '| 1   | 2   |'];
  const rein = 'a\tb\n1\t2';

  function anwenden(doc, von) {
    const mitText = doc.slice(0, von) + rein + doc.slice(von);
    const r = alsBlockEinsetzen(mitText, von, von + rein.length, tabelle);
    return { text: mitText.slice(0, r.from) + r.insert + mitText.slice(r.to), r };
  }

  it('leere Zeile zwischen Absätzen: Leerzeilen davor und danach', () => {
    const { text } = anwenden('Davor\n\nDanach', 6);
    expect(text).toBe('Davor\n\n' + tabelle.join('\n') + '\n\nDanach');
  });

  it('Schreibmarke mitten in der Zeile: Tabelle auf eigenen Zeilen', () => {
    const { text, r } = anwenden('Text davor', 5);
    expect(text).toBe('Text\n\n' + tabelle.join('\n') + '\n\ndavor');
    expect(text.slice(0, r.cursor).endsWith('| 1   | 2   |')).toBe(true);
  });

  it('am Dokument-Ende ohne Folgezeile kommt keine Leerzeile dazu', () => {
    const { text } = anwenden('Absatz\n', 7);
    expect(text).toBe('Absatz\n\n' + tabelle.join('\n'));
  });

  it('im Zitat trägt jede Zeile das Präfix der Ziel-Zeile', () => {
    const { text } = anwenden('> Text davor\n> weiter', 7);
    expect(text).toBe(
      [
        '> Text',
        '>',
        '> | a   | b   |',
        '> | --- | --- |',
        '> | 1   | 2   |',
        '>',
        '> davor',
        '> weiter',
      ].join('\n'),
    );
  });

  it('in der Hinweis-Box auf einer leeren Zitat-Zeile', () => {
    const { text } = anwenden('> [!note] Titel\n> \n> Ende', 18);
    expect(text).toBe(
      [
        '> [!note] Titel',
        '>',
        '> | a   | b   |',
        '> | --- | --- |',
        '> | 1   | 2   |',
        '>',
        '> Ende',
      ].join('\n'),
    );
  });
});
