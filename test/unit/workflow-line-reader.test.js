// 4T-002347 (Epic 3E-000184): Der Zeilen-Leser der Workflow-Blöcke (G2 bis G4).
//
// Geprüft wird die Zerlegung einer Zeile in Schlüsselwort und Bausteine samt
// Lage, die Kommentar- und Leerzeilen, die Escape-Regel nach G3 (allein `\"`,
// Entscheidung der Sitzung vom 2026-10-22, O7) und jeder Fehler-Code des
// Lesers. Was ein Baustein bedeutet, prüft `workflow-check.test.js`.
import { describe, it, expect } from 'vitest';
import { readBlock, readLine } from '../../src/shared/workflows/workflow-line-reader.js';

const werte = (r) => r.statement.tokens.map((t) => [t.type, t.value]);

describe('readLine — Bausteine', () => {
  it('liest Schlüsselwort, Text, Wort und Option', () => {
    const r = readLine('create "Journal/Tag.md" from-template "Vorlagen/Tag.md"');
    expect(r.ok).toBe(true);
    expect(r.statement.keyword).toBe('create');
    expect(werte(r)).toEqual([
      ['string', 'Journal/Tag.md'],
      ['word', 'from-template'],
      ['string', 'Vorlagen/Tag.md'],
    ]);
  });

  it('liefert die Lage jedes Bausteins als Offsets', () => {
    const r = readLine('wait 2');
    expect(r.statement).toMatchObject({ keyword: 'wait', from: 0, to: 4 });
    expect(r.statement.tokens[0]).toMatchObject({ from: 5, to: 6 });
    const t = readLine('notify "Hallo"').statement.tokens[0];
    expect([t.from, t.to]).toEqual([7, 14]);
  });

  it('liest Zahlen und Kommando-Kennungen ohne Anführungszeichen', () => {
    expect(werte(readLine('command view.modeSplit'))).toEqual([['word', 'view.modeSplit']]);
    expect(werte(readLine('wait 2.5'))).toEqual([['word', '2.5']]);
  });

  it('liest ein Feld-Wert-Paar (G4)', () => {
    const t = readLine('db-create "Personen" name="Müller" status="aktiv"').statement.tokens;
    expect(t[1]).toMatchObject({ type: 'pair', key: 'name', value: 'Müller' });
    expect(t[2]).toMatchObject({ type: 'pair', key: 'status', value: 'aktiv' });
  });

  it('macht aus \\" ein Anführungszeichen und lässt jeden anderen Rückstrich stehen', () => {
    expect(werte(readLine('notify "Er sagte \\"Hallo\\""'))).toEqual([
      ['string', 'Er sagte "Hallo"'],
    ]);
    expect(werte(readLine('notify "C:\\Temp und \\n"'))).toEqual([['string', 'C:\\Temp und \\n']]);
    expect(werte(readLine('notify "Syntax: \\{{date}}"'))).toEqual([
      ['string', 'Syntax: \\{{date}}'],
    ]);
  });

  it('hält Umlaute, Leerzeichen und Tabulatoren im Text zusammen', () => {
    expect(werte(readLine('notify "Größe  über\tAlles ß"'))).toEqual([
      ['string', 'Größe  über\tAlles ß'],
    ]);
  });

  it('trennt an mehreren Leerzeichen und Tabulatoren, Einrückung ist erlaubt', () => {
    const r = readLine('\t  move   "a.md"\t\t"Archiv"  ');
    expect(r.statement.keyword).toBe('move');
    expect(werte(r)).toEqual([
      ['string', 'a.md'],
      ['string', 'Archiv'],
    ]);
  });

  it('entfernt ein \\r am Zeilenende (CRLF)', () => {
    expect(werte(readLine('notify "x"\r'))).toEqual([['string', 'x']]);
    expect(readLine('wait 2\r').statement.tokens[0].value).toBe('2');
  });

  it('nimmt einen leeren Text als Baustein', () => {
    expect(werte(readLine('notify ""'))).toEqual([['string', '']]);
  });

  it('nimmt ein geschütztes Leerzeichen als Teil eines Worts', () => {
    expect(readLine('wait\u00A02').statement.keyword).toBe('wait\u00A02');
  });
});

describe('readLine — Kommentare und Leerzeilen (G2)', () => {
  it('übergeht leere Zeilen, Leerraum und Kommentar-Zeilen, auch eingerückt', () => {
    for (const zeile of ['', '   ', '\t', '# Kommentar', '   # eingerückt', '#', '#create "x"']) {
      expect(readLine(zeile), JSON.stringify(zeile)).toEqual({ ok: true, statement: null });
    }
  });

  it('kennt keinen Kommentar hinter einem Befehl', () => {
    const r = readLine('wait 2 # Pause');
    expect(werte(r)).toEqual([
      ['word', '2'],
      ['word', '#'],
      ['word', 'Pause'],
    ]);
  });
});

describe('readLine — Fehler', () => {
  it('meldet ein nicht geschlossenes Anführungszeichen mit Spalte', () => {
    expect(readLine('notify "offen')).toEqual({
      ok: false,
      error: { code: 'unclosedQuote', column: 8 },
    });
    expect(readLine('notify "endet mit Rückstrich\\"').error.code).toBe('unclosedQuote');
  });

  it('meldet ein Anführungszeichen mitten im Wort', () => {
    expect(readLine('create a"b"').error).toEqual({ code: 'unexpectedQuote', column: 9 });
    expect(readLine('create ="x"').error.code).toBe('unexpectedQuote');
    expect(readLine('create a=b="x"').error.code).toBe('unexpectedQuote');
  });

  it('meldet typografische Anführungszeichen', () => {
    for (const z of ['\u201E', '\u201C', '\u201D', '\u00AB', '\u00BB']) {
      expect(readLine(`notify ${z}Hallo${z}`).error, z).toEqual({
        code: 'typographicQuote',
        column: 8,
      });
    }
  });

  it('meldet einen fehlenden Trenner hinter einem Text', () => {
    expect(readLine('move "a.md""b"').error).toEqual({ code: 'separatorExpected', column: 12 });
    expect(readLine('notify "a"b').error.code).toBe('separatorExpected');
  });

  it('verlangt ein Wort als Schlüsselwort', () => {
    expect(readLine('"create" "x.md"').error).toEqual({ code: 'keywordExpected', column: 1 });
    expect(readLine('a="b"').error.code).toBe('keywordExpected');
  });
});

describe('readBlock', () => {
  it('nummeriert im Dokument und im Block und sammelt Befunde je Zeile', () => {
    const r = readBlock(['# Kopf', 'wait 1', '', 'notify "offen', 'stop "Ende"'], 10);
    expect(r.statements.map((s) => [s.line, s.blockLine, s.keyword])).toEqual([
      [11, 2, 'wait'],
      [14, 5, 'stop'],
    ]);
    expect(r.findings).toEqual([
      { code: 'unclosedQuote', line: 13, blockLine: 4, column: 8, detail: {} },
    ]);
  });

  it('liefert für einen leeren Block nichts', () => {
    expect(readBlock([], 3)).toEqual({ statements: [], findings: [] });
  });
});
