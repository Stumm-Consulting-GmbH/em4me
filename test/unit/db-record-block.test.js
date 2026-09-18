// 4T-001545 (Epic 3E-000251, E3): Unit-Tests des Ablage-Formats der Datensätze —
// Parser, Zuordnung gegen die Definition, Maskierung am Zeilenanfang,
// Serialisierer und Fence-Länge.
//
// Die tragende Zusage dieser Datei ist der **Rundlauf**: Was der Parser liest,
// schreibt der Serialisierer zeichengleich zurück. Ein Datenspeicher, der beim
// Lesen und Schreiben etwas verändert, ist keiner, und die drei Fälle, um
// derentwillen die eigene Fence überhaupt entsteht (mehrzeilige Zelle,
// zeilenführendes Marker-Zeichen, überzählige Zelle), werden deshalb einzeln
// UND im Rundlauf geprüft.
import { describe, it, expect } from 'vitest';
import {
  RECORD_FENCE,
  leseAngaben,
  schreibeAngaben,
  maskiereZeile,
  demaskiereZeile,
  parseRecordBlock,
  zellenNachFeldern,
  serializeRecordBlock,
  fenceLaengeFuer,
  baueRecordFence,
} from '../../src/shared/database/record-block.js';

// Drei Felder in fester Reihenfolge; die Reihenfolge IST der Vertrag (E3.3).
const FELDER = [{ name: 'name' }, { name: 'ort' }, { name: 'menge' }];

// Liest und schreibt in einem Zug; das Ergebnis muss die Eingabe sein.
function rundlauf(rumpf, fields) {
  const { records, vorspann } = parseRecordBlock(rumpf, fields);
  return serializeRecordBlock(records, vorspann);
}

describe('Datensatz-Block: Parser (4T-001545, E3)', () => {
  it('liest Datensätze und Zellen in ihrer Reihenfolge', () => {
    const { records, hints } = parseRecordBlock('|-\n| Anna\n| Basel\n| 3', FELDER);
    expect(records).toHaveLength(1);
    expect(records[0].cells.map((c) => c.text)).toEqual(['Anna', 'Basel', '3']);
    expect(hints).toEqual([]);
  });

  it('trennt Datensätze am Datensatz-Marker', () => {
    const { records } = parseRecordBlock('|-\n| Anna\n| Basel\n| 3\n|-\n| Bert\n| Bern\n| 5');
    expect(records).toHaveLength(2);
    expect(records[1].cells.map((c) => c.text)).toEqual(['Bert', 'Bern', '5']);
  });

  it('nimmt Folgezeilen in die laufende Zelle auf', () => {
    const { records } = parseRecordBlock('|-\n| Anna\n| Beispielweg 3\n4051 Basel\n| 3', FELDER);
    expect(records[0].cells[1].text).toBe('Beispielweg 3\n4051 Basel');
    expect(records[0].cells).toHaveLength(3);
  });

  it('hält eine nicht gedeutete Angabe hinter dem Marker unangetastet fest', () => {
    // 4T-001545 hat den ganzen Rohtext geparkt, 4T-001546 legt die Kennung
    // daraus aus; alles Übrige reist unverändert weiter.
    const { records } = parseRecordBlock('|- id="r-00042" v="7"\n| Anna', FELDER);
    expect(records[0].attrsRest).toBe('v="7"');
    expect(parseRecordBlock('|-\n| Anna').records[0].attrsRest).toBeNull();
  });

  it('zählt eine leere Zelle als Zelle und beschneidet einen Wert nicht', () => {
    const { records } = parseRecordBlock('|-\n|\n|  zwei Leerzeichen davor\n| 3', FELDER);
    expect(records[0].cells.map((c) => c.text)).toEqual(['', ' zwei Leerzeichen davor', '3']);
  });

  it('liest einen leeren Block als Tabelle ohne Datensätze', () => {
    const { records, hints } = parseRecordBlock('', FELDER);
    expect(records).toEqual([]);
    expect(hints).toEqual([]);
  });
});

describe('Datensatz-Block: Kennung am Datensatz-Marker (4T-001546, E3.5, E5.1)', () => {
  it('liest die Kennung als Angabe am Marker', () => {
    const { records, hints } = parseRecordBlock('|- id="r-00042"\n| Anna', FELDER);
    expect(records[0].id).toBe('r-00042');
    expect(records[0].attrsRest).toBeNull();
    expect(hints.filter((h) => h.code === 'recordIdInvalid')).toEqual([]);
  });

  it('liest beide Schreibweisen und schreibt die aufgefüllte', () => {
    // E5.1: Eine von Hand geschriebene Datei darf die kürzere tragen; der
    // nächste Schreibvorgang füllt sie auf.
    const { records, vorspann } = parseRecordBlock('|- id="r-42"\n| Anna\n| Basel\n| 3', FELDER);
    expect(records[0].id).toBe('r-00042');
    expect(serializeRecordBlock(records, vorspann)).toBe('|- id="r-00042"\n| Anna\n| Basel\n| 3');
  });

  it('lässt einen Datensatz ohne Kennung zu und macht ihn als solchen erkennbar', () => {
    const { records, hints } = parseRecordBlock('|-\n| Anna\n| Basel\n| 3', FELDER);
    expect(records[0].id).toBeNull();
    expect(hints).toEqual([]);
  });

  it('meldet eine unbrauchbare Kennung und behält den Rohtext', () => {
    const rumpf = '|- id="xyz"\n| Anna\n| Basel\n| 3';
    const { records, hints } = parseRecordBlock(rumpf, FELDER);
    expect(records[0].id).toBeNull();
    expect(hints.map((h) => [h.code, h.record, h.key])).toEqual([['recordIdInvalid', 0, 'id']]);
    expect(rundlauf(rumpf, FELDER)).toBe(rumpf);
  });

  it('meldet die namenlose Kurzform, statt sie als kennungslos durchgehen zu lassen', () => {
    // `|- r-00042` ist die Schreibweise, die es nicht gibt: Die Kennung steht
    // als benannte Angabe. Ohne Meldung sähe der Datensatz aus wie einer ohne
    // Kennung, und die nächste Neuanlage vergäbe eine zweite.
    const rumpf = '|- r-00042\n| Anna\n| Basel\n| 3';
    const { records, hints } = parseRecordBlock(rumpf, FELDER);
    expect(records[0].id).toBeNull();
    expect(hints.map((h) => h.code)).toEqual(['recordIdInvalid']);
    expect(rundlauf(rumpf, FELDER)).toBe(rumpf);
  });

  it('verschiebt die positionsbasierte Zuordnung nicht', () => {
    // E3.5: Als führende ZELLE verschöbe die Kennung den Raum der fachlichen
    // Felder um eins, und jede Fehlzählung wäre still.
    const { records, hints } = parseRecordBlock('|- id="r-00042"\n| Anna\n| Basel\n| 3', FELDER);
    expect(zellenNachFeldern(records[0], FELDER).map((z) => z.text)).toEqual([
      'Anna',
      'Basel',
      '3',
    ]);
    expect(hints).toEqual([]);
  });

  it('hält die Kennung über den Rundlauf, auch neben unbekannten Angaben', () => {
    const rumpf = '|- id="r-00042" v="7"\n| Anna\n| Basel\n| 3';
    expect(rundlauf(rumpf, FELDER)).toBe(rumpf);
  });

  it('liest die Angaben auch einzeln, ohne den ganzen Block', () => {
    expect(leseAngaben('id="r-7"')).toEqual({ id: 'r-00007', rest: null, code: null });
    expect(leseAngaben('')).toEqual({ id: null, rest: null, code: null });
    expect(leseAngaben('v="7"')).toEqual({ id: null, rest: 'v="7"', code: null });
    expect(schreibeAngaben({ id: 'r-00042', attrsRest: 'v="7"' })).toBe('id="r-00042" v="7"');
    expect(schreibeAngaben({ id: null, attrsRest: null })).toBeNull();
  });
});

describe('Datensatz-Block: Marker nur in Spalte 0 (E3.4)', () => {
  it('behandelt eine eingerückte Marker-Zeile als Inhalt', () => {
    const { records } = parseRecordBlock('|-\n| Anna\n  | keine neue Zelle\n| Basel', FELDER);
    expect(records[0].cells).toHaveLength(2);
    expect(records[0].cells[0].text).toBe('Anna\n  | keine neue Zelle');
  });

  it('gibt einer maskierten Zeile den Marker zurück, ohne eine Zelle zu öffnen', () => {
    const { records } = parseRecordBlock('|-\n| Anna\n\\| beginnt mit Marker\n| Basel', FELDER);
    expect(records[0].cells).toHaveLength(2);
    expect(records[0].cells[0].text).toBe('Anna\n| beginnt mit Marker');
  });

  it('maskiert auch das zweite Marker-Zeichen des Satzes', () => {
    const { records } = parseRecordBlock('|-\n| Anna\n\\! auch das', FELDER);
    expect(records[0].cells[0].text).toBe('Anna\n! auch das');
  });

  it('entfernt genau einen Rückstrich, damit auch `\\|` schreibbar bleibt', () => {
    const { records } = parseRecordBlock('|-\n| Anna\n\\\\| zwei Striche', FELDER);
    expect(records[0].cells[0].text).toBe('Anna\n\\| zwei Striche');
  });

  it('lässt einen Rückstrich vor irgendetwas anderem unangetastet', () => {
    // Ohne diese Einschränkung verlöre eine Zeile wie \frac{1}{2} ihren Strich.
    const { records } = parseRecordBlock('|-\n| Anna\n\\frac{1}{2}', FELDER);
    expect(records[0].cells[0].text).toBe('Anna\n\\frac{1}{2}');
    expect(demaskiereZeile('\\frac')).toBe('\\frac');
    expect(maskiereZeile('\\frac')).toBe('\\frac');
  });

  it('kennt keine Ausnahme für Code-Zäune in einer Zelle', () => {
    // Bewusste Abweichung vom Vorbild Perspective Table: Spalte 0 gewinnt
    // immer, der Rückstrich ist der eine Weg daran vorbei (E3.4, «ohne
    // Ausnahme»). Die Marker-Zeile im Code-Block öffnet deshalb eine Zelle.
    const { records } = parseRecordBlock('|-\n| ```\n| im Code-Block\n```', FELDER);
    expect(records[0].cells).toHaveLength(2);
  });
});

describe('Datensatz-Block: Zuordnung gegen die Definition (E3.3, E3.7)', () => {
  it('ordnet positionsbasiert zu, ohne Kopfzeile', () => {
    const { records } = parseRecordBlock('|-\n| Anna\n| Basel\n| 3', FELDER);
    expect(zellenNachFeldern(records[0], FELDER)).toEqual([
      { name: 'name', text: 'Anna', value: 'Anna', error: null, fehlt: false },
      { name: 'ort', text: 'Basel', value: 'Basel', error: null, fehlt: false },
      { name: 'menge', text: '3', value: '3', error: null, fehlt: false },
    ]);
  });

  it('meldet fehlende Zellen und liefert sie als leere Werte', () => {
    const { records, hints } = parseRecordBlock('|-\n| Anna', FELDER);
    expect(hints).toEqual([
      { code: 'recordCellsMissing', index: -1, name: null, key: null, expected: 3, record: 0 },
    ]);
    expect(zellenNachFeldern(records[0], FELDER)).toEqual([
      { name: 'name', text: 'Anna', value: 'Anna', error: null, fehlt: false },
      { name: 'ort', text: '', value: '', error: null, fehlt: true },
      { name: 'menge', text: '', value: '', error: null, fehlt: true },
    ]);
  });

  it('meldet überzählige Zellen und lässt sie unangetastet stehen', () => {
    const rumpf = '|-\n| Anna\n| Basel\n| 3\n| aus einer entfernten Spalte';
    const { records, hints } = parseRecordBlock(rumpf, FELDER);
    expect(hints).toEqual([
      { code: 'recordCellsExtra', index: -1, name: null, key: null, expected: 3, record: 0 },
    ]);
    expect(records[0].cells).toHaveLength(4);
    // E3.7: Der Datenverlust durch stilles Wegschreiben ist der eine Fehler,
    // den ein Datenspeicher nicht machen darf.
    expect(rundlauf(rumpf, FELDER)).toBe(rumpf);
  });

  it('nennt die Position des Datensatzes, nicht nur die Tatsache', () => {
    const { hints } = parseRecordBlock('|-\n| Anna\n| Basel\n| 3\n|-\n| Bert', FELDER);
    expect(hints.map((h) => h.record)).toEqual([1]);
  });

  it('meldet Datensätze ohne Definition, ohne sie zu verwerfen', () => {
    const { records, hints } = parseRecordBlock('|-\n| Anna', []);
    expect(records).toHaveLength(1);
    expect(hints.map((h) => h.code)).toEqual(['recordNoDefinition']);
  });

  it('meldet Text außerhalb jeder Zelle und behält ihn', () => {
    const vorne = parseRecordBlock('lose Zeile\n|-\n| Anna\n| Basel\n| 3', FELDER);
    expect(vorne.hints.map((h) => [h.code, h.record])).toEqual([['recordStrayContent', null]]);
    expect(vorne.vorspann).toEqual(['lose Zeile']);

    const drin = parseRecordBlock('|-\nlose Zeile\n| Anna\n| Basel\n| 3', FELDER);
    expect(drin.hints.map((h) => [h.code, h.record])).toEqual([['recordStrayContent', 0]]);
    expect(drin.records[0].vorspann).toEqual(['lose Zeile']);
  });
});

describe('Datensatz-Block: Serialisierer und Rundlauf (E3.6)', () => {
  it('schreibt einen gelesenen Block zeichengleich zurück', () => {
    const rumpf = ['|- r-00042', '| Anna', '| Beispielweg 3', '4051 Basel', '| 3'].join('\n');
    expect(rundlauf(rumpf, FELDER)).toBe(rumpf);
  });

  it('hält die Maskierung über den Rundlauf', () => {
    const rumpf = '|- r-00042\n| Anna\n\\| beginnt mit Marker\n\\\\| zwei Striche\n| Basel\n| 3';
    expect(rundlauf(rumpf, FELDER)).toBe(rumpf);
  });

  it('hält losen Text an seinem Platz statt ihn zu verschieben', () => {
    const rumpf = 'vor allem\n|-\nnach dem Marker\n| Anna\n| Basel\n| 3';
    expect(rundlauf(rumpf, FELDER)).toBe(rumpf);
  });

  it('ist idempotent: der zweite Lauf ändert nichts mehr', () => {
    // Ein von Hand ohne trennendes Leerzeichen geschriebener Block wird beim
    // ersten Schreiben normalisiert; danach steht er fest. Dasselbe Muster,
    // mit dem E3.6 die Fence-Länge behandelt.
    const handschrift = '|-\n|Anna\n|Basel\n|3';
    const einmal = rundlauf(handschrift, FELDER);
    expect(einmal).toBe('|-\n| Anna\n| Basel\n| 3');
    expect(rundlauf(einmal, FELDER)).toBe(einmal);
  });

  it('schreibt eine leere Zelle als nackten Marker', () => {
    const { records, vorspann } = parseRecordBlock('|-\n|\n| Basel\n| 3', FELDER);
    expect(serializeRecordBlock(records, vorspann)).toBe('|-\n|\n| Basel\n| 3');
  });
});

describe('Datensatz-Block: Fence-Länge (E3.6)', () => {
  it('nimmt drei Backticks, solange keine Zelle einen Zaun trägt', () => {
    expect(fenceLaengeFuer('|-\n| Anna')).toBe(3);
  });

  it('nimmt die längste innere Sequenz plus eins', () => {
    expect(fenceLaengeFuer('|-\n| ```\ncode\n```')).toBe(4);
    expect(fenceLaengeFuer('|-\n| ````\ncode\n````')).toBe(5);
  });

  it('zählt nur Sequenzen am Zeilenanfang, nicht Inline-Code', () => {
    expect(fenceLaengeFuer('|-\n| ein `Wort` in Code')).toBe(3);
  });

  it('baut den vollständigen Block mit passendem Zaun', () => {
    const records = [{ attrs: 'r-00042', vorspann: [], cells: [{ text: '```\ncode\n```' }] }];
    const block = baueRecordFence(records, []);
    expect(block.startsWith('````' + RECORD_FENCE + '\n')).toBe(true);
    expect(block.endsWith('\n````')).toBe(true);
  });

  it('heißt perspective-records', () => {
    // E3.1, mit E18.3 bestätigt. Nicht `perspective-dbtable`, weil es sich von
    // `perspective-datatable` um einen einzigen Buchstaben unterschiede.
    expect(RECORD_FENCE).toBe('perspective-records');
  });
});
