// 4T-001790 (Epic 3E-000255, E10.3, E10.4, E3): Unit-Tests des Beleg-Formats —
// Aufbau und Notation eines Belegs (AK1 bis AK4), Werte mit Sonderzeichen und
// die Unterscheidung von leerem und fehlendem Wert (AK8), Lese-Reihenfolge und
// Verkettungs-Auskunft (AK7) sowie die beiden Wächter-Fälle über die
// Schnittstelle (AK9) und die Importe (AK12).
//
// Die tragende Zusage dieser Datei ist die **Zeichengleichheit mit dem Bauplan**:
// Das Beispiel F5 des Vorgangs ist als erwarteter Anfüge-Text hinterlegt, Zeichen
// für Zeichen. Ein Format, das nur zu sich selbst passt, ließe jede Verschiebung
// der Notation unbemerkt durch, solange Lesen und Schreiben dieselbe machen.
//
// Der Anfüge-Weg am echten Dateisystem steht in db-change-log.test.js; hier
// arbeitet alles auf Zeichenketten, weil der Gegenstand das Format ist.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ART_EXTERNAL,
  ATTR_REIHENFOLGE,
  BELEG_ARTEN,
  BELEG_CODES,
  anfuegeText,
  baueBeleg,
  belegeZuDatensatz,
  leseBelege,
  pruefeVerkettung,
  serialisiereBeleg,
  zeitpunktAus,
} from '../../src/shared/database/change-record.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Bestands-Lesung im Modulkopf, nicht im Prüffall (test/README, «Bestands-
// Lesungen gehören in den Modulkopf»).
const QUELLE = fs.readFileSync(
  path.join(ROOT, 'src', 'shared', 'database', 'change-record.js'),
  'utf8',
);

// Die Wächter-Fälle messen den CODE und nicht die Prosa darüber: Der
// Modul-Kopf nennt gerade das, was dort NICHT entstehen soll (den Zähler, den
// Datei-Zugriff), und ein Wächter, der darüber stolperte, verböte die
// Begründung statt der Sache.
function ohneKommentare(quelle) {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((zeile) => (zeile.trimStart().startsWith('//') ? '' : zeile))
    .join('\n');
}

const CODE = ohneKommentare(QUELLE);

// Das Beispiel aus dem Bauplan F5, zeichengleich: zwei Belege eines Datensatzes,
// je mit führender Leerzeile und abschließendem Zeilenende.
const BEISPIEL_F5 = `
|- id="r-00042" kind="create" at="2026-09-18T12:30:15Z" tx="117" n="2" noOld="1,2"
| Name
|
| Anna
| Ort
|
| Musterstadt
| anna
| SC-026

|- id="r-00042" kind="update" at="2026-09-18T12:41:02Z" tx="118" n="1"
| Ort
| Musterstadt
| Beispielhausen
| anna
| SC-026
`;

const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };

function beleg(abweichung) {
  return baueBeleg({
    art: 'update',
    id: 'r-00042',
    zeitpunkt: '2026-09-18T12:00:00Z',
    vorgang: '1',
    felder: [],
    herkunft: HERKUNFT,
    ...abweichung,
  });
}

// Schreiben und wieder lesen; das Ergebnis muss die Eingabe sein.
function rundlauf(...belege) {
  const text = belege.map(anfuegeText).join('');
  const gelesen = leseBelege(text);
  return { text, ...gelesen };
}

describe('Änderungsbeleg: Aufbau und Notation (4T-001790, AK1 bis AK4)', () => {
  it('trägt Felder mit altem und neuem Wert, Benutzer, Rechner, Zeitpunkt, Art, Kennung und Vorgang', () => {
    const b = beleg({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }] });
    const { belege, befunde } = rundlauf(b);
    expect(befunde).toEqual([]);
    expect(belege[0].art).toBe('update');
    expect(belege[0].id).toBe('r-00042');
    expect(belege[0].zeitpunkt).toBe('2026-09-18T12:00:00Z');
    expect(belege[0].vorgang).toBe('1');
    expect(belege[0].felder).toEqual([{ name: 'Ort', alt: 'Basel', neu: 'Bern' }]);
    expect(belege[0].benutzer).toBe('anna');
    expect(belege[0].rechner).toBe('SC-026');
  });

  it('schreibt die Angaben am Marker in der festgelegten Reihenfolge', () => {
    const b = beleg({
      art: 'create',
      felder: [
        { name: 'Name', neu: 'Anna' },
        { name: 'Ort', neu: 'Bern' },
      ],
    });
    const markerZeile = serialisiereBeleg(b).split('\n')[0];
    const namen = [...markerZeile.matchAll(/(\w+)="/g)].map((t) => t[1]);
    expect(namen).toEqual(['id', 'kind', 'at', 'tx', 'n', 'noOld']);
    // Die Reihenfolge der geschriebenen Angaben ist ein Ausschnitt der
    // festgelegten, in derselben Ordnung.
    expect(ATTR_REIHENFOLGE.filter((a) => namen.includes(a))).toEqual(namen);
  });

  it('nimmt den Zeitpunkt als UTC in ISO-8601-Form sekundengenau und weist alles andere ab (AK2)', () => {
    expect(beleg({ zeitpunkt: '2026-09-18T12:00:00Z' }).zeitpunkt).toBe('2026-09-18T12:00:00Z');
    expect(zeitpunktAus(new Date(Date.UTC(2026, 8, 18, 12, 30, 15, 987)))).toBe(
      '2026-09-18T12:30:15Z',
    );
    for (const roh of ['2026-09-18T12:00:00.500Z', '2026-09-18 12:00:00Z', '2026-09-18T12:00Z'])
      expect(() => beleg({ zeitpunkt: roh })).toThrow(/YYYY-MM-DDTHH:MM:SSZ/);
  });

  it('benennt ein Feld über seinen Namen, ohne Feld-Kennung und ohne Versions-Nummer (AK3)', () => {
    const text = serialisiereBeleg(beleg({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }] }));
    expect(text).toContain('| Ort');
    const angaben = [...text.split('\n')[0].matchAll(/(\w+)="/g)].map((t) => t[1]);
    expect(angaben).not.toContain('v');
    expect(angaben).not.toContain('version');
    expect(angaben).not.toContain('field');
  });

  it('baut den Anfüge-Text des Beispiels F5 zeichengleich (AK4)', () => {
    const erster = baueBeleg({
      art: 'create',
      id: 'r-00042',
      zeitpunkt: '2026-09-18T12:30:15Z',
      vorgang: '117',
      felder: [
        { name: 'Name', neu: 'Anna' },
        { name: 'Ort', neu: 'Musterstadt' },
      ],
      herkunft: HERKUNFT,
    });
    const zweiter = baueBeleg({
      art: 'update',
      id: 'r-00042',
      zeitpunkt: '2026-09-18T12:41:02Z',
      vorgang: '118',
      felder: [{ name: 'Ort', alt: 'Musterstadt', neu: 'Beispielhausen' }],
      herkunft: HERKUNFT,
    });
    expect(anfuegeText(erster) + anfuegeText(zweiter)).toBe(BEISPIEL_F5);
  });

  it('beginnt jeden Anfüge-Text mit einer Leerzeile und endet mit einem Zeilenende (F4)', () => {
    const text = anfuegeText(beleg({ felder: [{ name: 'Ort', alt: 'a', neu: 'b' }] }));
    expect(text.startsWith('\n|- ')).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  // 4T-001791 (Epic 3E-000255, E10.10): Die Liste ist um die sechste Art
  // gewachsen. Die fünf Anlässe stehen unverändert voran; `merged` ist kein
  // Anlass, sondern die Marke des verdichteten Belegs.
  it('kennt genau die sechs Arten und weist jede andere ab', () => {
    expect(BELEG_ARTEN).toEqual(['create', 'update', 'delete', 'definition', 'external', 'merged']);
    expect(() => beleg({ art: 'insert' })).toThrow(/unbekannte Art/);
  });

  it('lässt die Kennung nur beim Definitions-Beleg fehlen und den Vorgang nur bei external', () => {
    expect(beleg({ art: 'definition', id: null }).id).toBeNull();
    expect(() => beleg({ art: 'definition' })).toThrow(/keine interne Kennung/);
    expect(() => beleg({ art: 'update', id: null })).toThrow(/keine interne Kennung eines/);
    expect(beleg({ art: ART_EXTERNAL, vorgang: null }).vorgang).toBeNull();
    expect(() => beleg({ art: 'update', vorgang: null })).toThrow(/Vorgangs-Kennung fehlt/);
  });

  it('weist leeren Feld-Namen und Anführungszeichen in einem Marker-Wert ab', () => {
    expect(() => beleg({ felder: [{ name: '  ', neu: 'x' }] })).toThrow(/keinen Namen/);
    expect(() => beleg({ vorgang: 'a"b' })).toThrow(/Anführungszeichen/);
  });

  it('nimmt beide Schreibweisen der Kennung an und schreibt die aufgefüllte', () => {
    expect(beleg({ id: 'r-42' }).id).toBe('r-00042');
    expect(serialisiereBeleg(beleg({ id: 'r-42' }))).toContain('id="r-00042"');
  });

  it('hält eine unbekannte Angabe am Marker über den Rundlauf fest', () => {
    const text = anfuegeText(beleg({ felder: [{ name: 'Ort', alt: 'a', neu: 'b' }] })).replace(
      'n="1"',
      'n="1" spaeter="7"',
    );
    const { belege, befunde } = leseBelege(text);
    expect(befunde).toEqual([]);
    expect(belege[0].attrsRest).toBe('spaeter="7"');
    expect(anfuegeText(belege[0])).toBe(text);
  });
});

describe('Änderungsbeleg: Werte und ihre Ablage (4T-001790, AK8)', () => {
  it('legt einen mehrzeiligen Wert mit Marker-Zeichen und Rückstrich unverfälscht ab', () => {
    const wert = 'erste\n| zweite\n|- dritte\n! vierte\n\\| fünfte\n\\frac{1}{2}';
    const { belege, befunde } = rundlauf(
      beleg({ felder: [{ name: 'Adresse', alt: wert, neu: 'x' }] }),
    );
    expect(befunde).toEqual([]);
    expect(belege[0].felder[0].alt).toBe(wert);
  });

  it('unterscheidet den leeren vom fehlenden Wert (tragender Fall)', () => {
    const b = beleg({
      felder: [
        { name: 'a', alt: null, neu: '' },
        { name: 'b', alt: '', neu: null },
      ],
    });
    const text = anfuegeText(b);
    expect(text).toContain('noOld="1"');
    expect(text).toContain('noNew="2"');
    const { belege, befunde } = leseBelege(text);
    expect(befunde).toEqual([]);
    expect(belege[0].felder).toEqual([
      { name: 'a', alt: null, neu: '' },
      { name: 'b', alt: '', neu: null },
    ]);
  });

  it('nennt beim Anlegen alle Felder in noOld und beim Löschen alle in noNew', () => {
    const felder = [
      { name: 'a', neu: '1' },
      { name: 'b', neu: '2' },
      { name: 'c', neu: '3' },
    ];
    expect(anfuegeText(beleg({ art: 'create', felder }))).toContain('noOld="1,2,3"');
    const geloescht = felder.map((f) => ({ name: f.name, alt: f.neu }));
    expect(anfuegeText(beleg({ art: 'delete', felder: geloescht }))).toContain('noNew="1,2,3"');
  });

  it('hält führende Leerzeichen, abschließende Leerzeilen und Anführungszeichen eines Wertes', () => {
    const felder = [
      { name: 'davor', alt: '   drei Leerzeichen davor', neu: '' },
      { name: 'danach', alt: 'Text\n\n', neu: 'x' },
      { name: 'zitat', alt: 'er sagte "hallo"', neu: 'y' },
    ];
    const { belege, befunde } = rundlauf(beleg({ felder }));
    expect(befunde).toEqual([]);
    expect(belege[0].felder.map((f) => f.alt)).toEqual([
      '   drei Leerzeichen davor',
      'Text\n\n',
      'er sagte "hallo"',
    ]);
  });

  it('beschneidet Benutzer und Rechner, damit die Leerzeile des Anfügens nie in einen Wert gerät', () => {
    // Zwei Belege hintereinander: Die führende Leerzeile des zweiten schließt
    // die letzte Zelle des ersten ab.
    const { belege } = rundlauf(
      beleg({ felder: [{ name: 'Ort', alt: 'Basel\n', neu: 'Bern' }] }),
      beleg({ felder: [{ name: 'Ort', alt: 'Bern', neu: 'Chur' }] }),
    );
    expect(belege[0].felder[0].alt).toBe('Basel\n');
    expect(belege[0].rechner).toBe('SC-026');
  });

  it('trägt eine nicht ermittelbare Herkunft als leere Zelle', () => {
    const { belege, befunde } = rundlauf(beleg({ herkunft: {} }));
    expect(befunde).toEqual([]);
    expect(belege[0].benutzer).toBeNull();
    expect(belege[0].rechner).toBeNull();
  });
});

describe('Änderungsbeleg: Lese-Reihenfolge und Verkettung (4T-001790, AK7)', () => {
  const kette = [
    beleg({ art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }] }),
    beleg({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }] }),
    beleg({ felder: [{ name: 'Ort', alt: 'Bern', neu: 'Chur' }] }),
  ];

  it('liefert die Belege eines Datensatzes in Datei-Reihenfolge, nicht nach Zeitpunkt', () => {
    // Die Zeitpunkte laufen absichtlich rückwärts: Zwei Rechner-Uhren dürfen
    // auseinanderlaufen, maßgeblich ist die Reihenfolge des Anfügens (F6).
    const { belege } = rundlauf(
      beleg({ zeitpunkt: '2026-09-18T12:00:02Z', felder: [{ name: 'Ort', alt: 'a', neu: 'b' }] }),
      beleg({ zeitpunkt: '2026-09-18T12:00:01Z', felder: [{ name: 'Ort', alt: 'b', neu: 'c' }] }),
    );
    expect(belege.map((b) => b.zeitpunkt)).toEqual([
      '2026-09-18T12:00:02Z',
      '2026-09-18T12:00:01Z',
    ]);
  });

  it('greift die Belege eines Datensatzes heraus, in beiden Schreibweisen der Kennung', () => {
    const { belege } = rundlauf(
      beleg({ id: 'r-00042', felder: [{ name: 'Ort', alt: 'a', neu: 'b' }] }),
      beleg({ id: 'r-00043', felder: [{ name: 'Ort', alt: 'x', neu: 'y' }] }),
      beleg({ id: 'r-00042', felder: [{ name: 'Ort', alt: 'b', neu: 'c' }] }),
    );
    expect(belegeZuDatensatz(belege, 'r-00042')).toHaveLength(2);
    expect(belegeZuDatensatz(belege, 'r-42')).toHaveLength(2);
    expect(belegeZuDatensatz(belege, 'r-00043')).toHaveLength(1);
    expect(belegeZuDatensatz(belege, 'unsinn')).toEqual([]);
  });

  it('meldet eine lückenlose Kette als lückenlos', () => {
    const { belege } = rundlauf(...kette);
    expect(pruefeVerkettung(belege)).toEqual({ lueckenlos: true, luecken: [] });
  });

  it('meldet die Lücke mit Feld und Position des Belegs (tragender Fall)', () => {
    const { belege } = rundlauf(
      kette[0],
      kette[1],
      beleg({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Chur' }] }),
    );
    expect(pruefeVerkettung(belege)).toEqual({
      lueckenlos: false,
      luecken: [{ grund: 'wert', feld: 'Ort', position: 2 }],
    });
  });

  it('wertet «fehlt» und «leer» als verschiedene Werte (tragender Fall)', () => {
    const { belege } = rundlauf(
      beleg({ art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }] }),
      beleg({ felder: [{ name: 'Ort', alt: 'Basel', neu: null }] }),
      beleg({ felder: [{ name: 'Ort', alt: '', neu: 'Bern' }] }),
    );
    expect(belege[1].felder[0].neu).toBeNull();
    expect(belege[2].felder[0].alt).toBe('');
    expect(pruefeVerkettung(belege)).toEqual({
      lueckenlos: false,
      luecken: [{ grund: 'wert', feld: 'Ort', position: 2 }],
    });
  });

  it('lässt einen Beleg der Art external definitionsgemäß anschließen', () => {
    const { belege } = rundlauf(
      kette[0],
      beleg({
        art: ART_EXTERNAL,
        vorgang: null,
        felder: [{ name: 'Ort', alt: 'von Hand', neu: 'Bern' }],
      }),
      beleg({ felder: [{ name: 'Ort', alt: 'Bern', neu: 'Chur' }] }),
    );
    expect(pruefeVerkettung(belege)).toEqual({ lueckenlos: true, luecken: [] });
  });

  it('meldet einen beschädigten Beleg als eine Unterbrechung und setzt danach neu an', () => {
    // Der mittlere Beleg ist abgerissen: Was er geändert hat, ist unbekannt. Die
    // Kette ist dort unterbrochen, mit benanntem Grund. Der dritte Beleg wird
    // danach nicht gegen den Stand VOR dem Schaden verglichen; eine zweite,
    // unechte Wert-Lücke an Position 2 wäre eine Behauptung.
    const abgerissen = anfuegeText(
      beleg({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }] }),
    ).replace(/\| Bern\n[\s\S]*$/, '| Be');
    const text =
      anfuegeText(beleg({ art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }] })) +
      abgerissen +
      anfuegeText(beleg({ felder: [{ name: 'Ort', alt: 'Bern', neu: 'Chur' }] }));
    const { belege, befunde } = leseBelege(text);

    expect(belege.map((b) => b.beschaedigt)).toEqual([false, true, false]);
    expect(befunde).toHaveLength(1);
    expect(pruefeVerkettung(belege)).toEqual({
      lueckenlos: false,
      luecken: [{ grund: 'beschaedigt', feld: null, position: 1 }],
    });
  });

  it('hält verschiedene Felder auseinander', () => {
    const { belege } = rundlauf(
      beleg({ art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }] }),
      beleg({ art: 'create', felder: [{ name: 'Name', neu: 'Anna' }] }),
      beleg({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }] }),
    );
    expect(pruefeVerkettung(belege).lueckenlos).toBe(true);
  });
});

describe('Änderungsbeleg: beschädigte Belege (4T-001790, AK11)', () => {
  it('meldet einen Beleg mit falscher Zell-Zahl als beschädigt (tragender Fall)', () => {
    const text = anfuegeText(beleg({ felder: [{ name: 'Ort', alt: 'a', neu: 'b' }] }));
    const ohneZelle = text.replace('| b\n', '');
    const { belege, befunde } = leseBelege(ohneZelle);
    expect(belege).toHaveLength(1);
    expect(belege[0].beschaedigt).toBe(true);
    expect(befunde).toEqual([{ code: BELEG_CODES.zellen, position: 0 }]);
    // Nie verworfen: Die rohen Zellen stehen weiter am Beleg.
    // Die letzte Zelle trägt das Zeilenende der Datei; beschnitten wird erst
    // am vollständigen Beleg.
    expect(belege[0].zellen).toEqual(['Ort', 'a', 'anna', 'SC-026\n']);
  });

  it('meldet fehlende Pflicht-Angaben statt sie zu ergänzen', () => {
    const basis = anfuegeText(beleg({ felder: [{ name: 'Ort', alt: 'a', neu: 'b' }] }));
    const faelle = [
      [basis.replace('kind="update" ', ''), BELEG_CODES.art],
      [basis.replace('at="2026-09-18T12:00:00Z"', 'at="gestern"'), BELEG_CODES.zeitpunkt],
      [basis.replace('id="r-00042" ', ''), BELEG_CODES.kennung],
      [basis.replace('tx="1" ', ''), BELEG_CODES.vorgang],
      [basis.replace('n="1"', 'n="viele"'), BELEG_CODES.anzahl],
      [basis.replace('n="1"', 'n="1" noOld="4"'), BELEG_CODES.fehlstellen],
    ];
    for (const [text, code] of faelle) {
      const { belege, befunde } = leseBelege(text);
      expect(belege[0].beschaedigt, code).toBe(true);
      expect(befunde, code).toEqual([{ code, position: 0 }]);
    }
  });

  it('deutet die Werte eines beschädigten Belegs nicht und meldet allein die Unterbrechung', () => {
    // Die Werte des beschädigten Belegs («unsinn») fließen nicht in die Kette
    // ein; gemeldet wird die Unterbrechung an seiner Position und sonst nichts.
    const gesund = anfuegeText(beleg({ art: 'create', felder: [{ name: 'Ort', neu: 'Basel' }] }));
    const kaputt = anfuegeText(
      beleg({ felder: [{ name: 'Ort', alt: 'unsinn', neu: 'x' }] }),
    ).replace('n="1"', 'n="2"');
    const spaeter = anfuegeText(beleg({ felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }] }));
    const { belege, befunde } = leseBelege(gesund + kaputt + spaeter);
    expect(befunde).toHaveLength(1);
    expect(pruefeVerkettung(belege)).toEqual({
      lueckenlos: false,
      luecken: [{ grund: 'beschaedigt', feld: null, position: 1 }],
    });
  });

  it('liest eine leere Datei als «keine Belege» und wirft nie', () => {
    expect(leseBelege('')).toEqual({ belege: [], befunde: [] });
    expect(() => leseBelege('völlig anderer Text\nohne Marker')).not.toThrow();
  });
});

describe('Änderungsbeleg: Wächter über Schnittstelle und Importe (4T-001790, AK9, AK12)', () => {
  it('nimmt die Vorgangs-Kennung als Wert entgegen und führt keinen Zähler (AK9)', () => {
    // Der Erzeuger der Kennung gehört zur Schreib-Schnittstelle und zu ihrem
    // Epic; hier entsteht weder ein Zähler noch ein Hochwasserstand.
    expect(beleg({ vorgang: 4711 }).vorgang).toBe('4711');
    expect(beleg({ vorgang: 'A-7' }).vorgang).toBe('A-7');
    for (const wort of ['hochwasserstand', 'naechsteKennung', 'lastId'])
      expect(CODE.toLowerCase().includes(wort.toLowerCase()), wort).toBe(false);
  });

  it('bezieht Parser und Serialisierer aus record-block.js (AK12)', () => {
    expect(CODE).toMatch(/require\('\.\/record-block\.js'\)/);
    expect(CODE).toMatch(/parseRecordBlock/);
    expect(CODE).toMatch(/serializeRecordBlock/);
  });

  it('führt keine eigene Maskierung und keinen zweiten Parser (AK12)', () => {
    for (const wort of ['MASKIERBAR', 'maskiereZeile', 'demaskiere', 'RECORD_MARKER'])
      expect(CODE.includes(wort), wort).toBe(false);
    // Die Gegenprobe an der Sache: Ein Wert, dessen Folgezeile in Spalte 0 wie
    // ein Marker aussieht, läuft unverfälscht rund — geleistet allein von der
    // Maskierung des Datensatz-Blocks.
    const wert = 'kopf\n|- sieht aus wie ein Datensatz';
    const { belege } = rundlauf(beleg({ felder: [{ name: 'Text', alt: wert, neu: 'x' }] }));
    expect(belege).toHaveLength(1);
    expect(belege[0].felder[0].alt).toBe(wert);
  });

  it('greift weder auf das Dateisystem noch auf Electron zu', () => {
    for (const wort of ['node:fs', 'node:path', 'electron'])
      expect(CODE.includes(wort), wort).toBe(false);
  });
});
