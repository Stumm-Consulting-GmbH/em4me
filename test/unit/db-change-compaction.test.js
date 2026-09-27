// 4T-001791 (Epic 3E-000255, E10.9 bis E10.11): Unit-Tests der Verdichtung als
// reine Funktion — Auswahl der Datensätze (AK1), Aufbau des verdichteten Belegs
// und die Verkettung nach ein- und zweimaligem Verdichten (AK2, AK3, AK10), die
// eine Stelle der Vorgabewerte und ihre Übersteuerung (AK4, AK5), die
// Spannen-Grenzen an `external` und am beschädigten Beleg (AK12) sowie die
// Wächter gegen Löschen, Auslagern und Takt (AK6, AK9).
//
// Die tragende Zusage dieser Datei ist die **Zeichengleichheit der neuen
// Fassung**: Ein Fall hält den vollständigen erwarteten Text Zeichen für
// Zeichen, weil die Verdichtung der einzige Vorgang ist, der die Beleg-Datei
// umschreibt. Ein Prüffall, der nur die Zahl der Belege zählt, wäre auch dann
// grün, wenn jeder unbeteiligte Beleg dabei neu serialisiert würde.
//
// Der Datei-Zugriff, die Naht der Sperre und das atomare Ersetzen stehen in
// db-change-verdichtung.test.js; hier arbeitet alles auf Zeichenketten.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEERE_AUSKUNFT,
  UNBEGRENZT,
  VORGABE_MAX_BYTES,
  VORGABE_MAX_JE_DATENSATZ,
  behalteAnzahl,
  istUeberGroesse,
  loeseGrenzen,
  verdichte,
} from '../../src/shared/database/change-compaction.js';
import {
  anfuegeText,
  baueBeleg,
  belegeZuDatensatz,
  leseBelege,
  pruefeVerkettung,
} from '../../src/shared/database/change-record.js';
import { ABLAGE_SCHWELLE } from '../../src/shared/document-split-punkte.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Bestands-Lesungen im Modulkopf, nicht im Prüffall (test/README,
// «Bestands-Lesungen gehören in den Modulkopf»).
const QUELLE_VERDICHTUNG = fs.readFileSync(
  path.join(ROOT, 'src', 'shared', 'database', 'change-compaction.js'),
  'utf8',
);

// Die Wächter messen den CODE und nicht die Prosa darüber: Die Kopf-Kommentare
// nennen gerade das, was NICHT entstehen soll (Löschen, Archiv-Datei, Takt),
// und ein Wächter, der darüber stolperte, verböte die Begründung statt der
// Sache.
function ohneKommentare(quelle) {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((zeile) => (zeile.trimStart().startsWith('//') ? '' : zeile))
    .join('\n');
}

const CODE_VERDICHTUNG = ohneKommentare(QUELLE_VERDICHTUNG);

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

// Sekunden-Zeitpunkt zur laufenden Nummer; die Reihenfolge der Datei ist
// maßgeblich, `at` ist Auskunft (F6).
function zeitpunkt(n) {
  const minute = String(Math.floor(n / 60)).padStart(2, '0');
  const sekunde = String(n % 60).padStart(2, '0');
  return `2026-09-18T12:${minute}:${sekunde}Z`;
}

// Eine Kette aus `anzahl` Belegen eines Datensatzes: der erste legt an, jeder
// folgende schreibt den nächsten Wert. Die Werte schließen lückenlos
// aneinander an, damit ein Verkettungs-Befund nach dem Verdichten die
// Verdichtung trifft und nicht die Vorlage.
function kette(id, anzahl, versatz = 0) {
  const belege = [];
  for (let i = 0; i < anzahl; i++)
    belege.push(
      beleg({
        id,
        art: i === 0 ? 'create' : 'update',
        zeitpunkt: zeitpunkt(versatz + i),
        vorgang: String(versatz + i + 1),
        felder: [{ name: 'Ort', alt: i === 0 ? null : `w${i - 1}`, neu: `w${i}` }],
      }),
    );
  return belege;
}

function alsText(...belege) {
  return belege.flat().map(anfuegeText).join('');
}

// Die Belege eines Datensatzes als serialisierte Zeilen-Blöcke; damit lässt
// sich «zeichengleich geblieben» je Beleg vergleichen.
function bloecke(text, id) {
  return belegeZuDatensatz(leseBelege(text).belege, id).map((b) => anfuegeText(b));
}

describe('Verdichtung: Auswahl der Datensätze (4T-001791, AK1)', () => {
  it('verdichtet genau die Datensätze über der Zahl-Schwelle (tragender Fall)', () => {
    const text = alsText(kette('r-00001', 10), kette('r-00002', 3, 100));
    const { veraendert, text: neu, auskunft } = verdichte(text, { maxPerRecord: 4 });

    expect(veraendert).toBe(true);
    // Der Verursacher zahlt, der Nachbar nicht: Von zehn Belegen bleiben die
    // jüngsten zwei einzeln stehen, die acht älteren werden zu einem.
    expect(auskunft).toEqual({
      datensaetze: [{ id: 'r-00001', spannen: 1, ersetzt: 8 }],
      spannen: 1,
      ersetzt: 8,
    });
    expect(bloecke(neu, 'r-00001')).toHaveLength(3);
    expect(bloecke(neu, 'r-00002')).toEqual(bloecke(text, 'r-00002'));
  });

  it('lässt alles stehen, wenn kein Datensatz über der Zahl-Schwelle liegt', () => {
    const text = alsText(kette('r-00001', 4), kette('r-00002', 3, 100));
    const ergebnis = verdichte(text, { maxPerRecord: 4 });
    expect(ergebnis.veraendert).toBe(false);
    expect(ergebnis.text).toBe(text);
    expect(ergebnis.auskunft).toBe(LEERE_AUSKUNFT);
  });

  it('zählt in Belegen der Datei, nicht in Änderungen', () => {
    // Ein verdichteter Beleg zählt als einer: Nach der ersten Verdichtung
    // liegen drei Belege vor, und drei liegen nicht über vier.
    const erste = verdichte(alsText(kette('r-00001', 10)), { maxPerRecord: 4 });
    expect(verdichte(erste.text, { maxPerRecord: 4 }).veraendert).toBe(false);
  });

  it('lässt Belege der Art definition und fremde Datensätze an ihrer Stelle', () => {
    const text = alsText(
      kette('r-00042', 2),
      beleg({
        id: 'r-00099',
        zeitpunkt: zeitpunkt(2),
        felder: [{ name: 'Ort', alt: 'x', neu: 'y' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(3),
        vorgang: '4',
        felder: [{ name: 'Ort', alt: 'w1', neu: 'w3' }],
      }),
      beleg({
        art: 'definition',
        id: null,
        zeitpunkt: zeitpunkt(4),
        vorgang: '5',
        felder: [{ name: 'Ort', alt: 'text', neu: 'number' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(5),
        vorgang: '6',
        felder: [{ name: 'Ort', alt: 'w3', neu: 'w5' }],
      }),
    );
    const { text: neu } = verdichte(text, { maxPerRecord: 2 });
    const definition = (t) => leseBelege(t).belege.filter((b) => b.art === 'definition');

    expect(bloecke(neu, 'r-00099')).toEqual(bloecke(text, 'r-00099'));
    expect(definition(neu).map(anfuegeText)).toEqual(definition(text).map(anfuegeText));
  });

  it('baut die neue Fassung zeichengleich, mit dem verdichteten Beleg an der Stelle des jüngsten', () => {
    // Der vollständige erwartete Text: Der Beleg des fremden Datensatzes und
    // der Definitions-Beleg behalten Stelle und Wortlaut, der verdichtete steht
    // an der Stelle des jüngsten Belegs seiner Spanne, und die trennenden
    // Leerzeilen bleiben, wie sie waren.
    const text = alsText(
      beleg({
        art: 'create',
        zeitpunkt: zeitpunkt(1),
        vorgang: '1',
        felder: [{ name: 'Ort', neu: 'Basel' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(2),
        vorgang: '2',
        felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }],
      }),
      beleg({
        id: 'r-00099',
        zeitpunkt: zeitpunkt(3),
        vorgang: '3',
        felder: [{ name: 'Ort', alt: 'x', neu: 'y' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(4),
        vorgang: '4',
        felder: [{ name: 'Ort', alt: 'Bern', neu: 'Chur' }],
      }),
      beleg({
        art: 'definition',
        id: null,
        zeitpunkt: zeitpunkt(5),
        vorgang: '5',
        felder: [{ name: 'Ort', alt: 'text', neu: 'number' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(6),
        vorgang: '6',
        felder: [{ name: 'Ort', alt: 'Chur', neu: 'Genf' }],
      }),
    );

    expect(verdichte(text, { maxPerRecord: 2 }).text).toBe(`
|- id="r-00099" kind="update" at="2026-09-18T12:00:03Z" tx="3" n="1"
| Ort
| x
| y
| anna
| SC-026

|- id="r-00042" kind="merged" at="2026-09-18T12:00:04Z" n="1" noOld="1" since="2026-09-18T12:00:01Z" count="3" kinds="create,update"
| Ort
|
| Chur
|
|

|- kind="definition" at="2026-09-18T12:00:05Z" tx="5" n="1"
| Ort
| text
| number
| anna
| SC-026

|- id="r-00042" kind="update" at="2026-09-18T12:00:06Z" tx="6" n="1"
| Ort
| Chur
| Genf
| anna
| SC-026
`);
  });

  it('hält jeden nicht verdichteten Beleg zeichengleich, auch den mehrzeiligen', () => {
    const mehrzeilig = beleg({
      id: 'r-00099',
      zeitpunkt: zeitpunkt(50),
      vorgang: '50',
      felder: [{ name: 'Adresse', alt: 'Weg 1\n| 4051 Basel\n', neu: 'Weg 2\n\n4052 Basel' }],
    });
    const text = alsText(kette('r-00001', 8), mehrzeilig);
    const { text: neu } = verdichte(text, { maxPerRecord: 3 });

    expect(Buffer.from(bloecke(neu, 'r-00099').join(''))).toEqual(
      Buffer.from(bloecke(text, 'r-00099').join('')),
    );
    // Die jüngsten Belege des verdichteten Datensatzes bleiben ebenso
    // zeichengleich; verändert wird allein die Spanne.
    expect(bloecke(neu, 'r-00001').slice(1)).toEqual(bloecke(text, 'r-00001').slice(-1));
  });
});

describe('Verdichtung: der verdichtete Beleg und die Kette (4T-001791, AK2, AK3, AK10)', () => {
  it('trägt Zustand am Anfang und am Ende der Spanne, die Zahl und die Marke (AK2)', () => {
    const { text } = verdichte(alsText(kette('r-00042', 10)), { maxPerRecord: 4 });
    const verdichteter = leseBelege(text).belege[0];

    expect(verdichteter.art).toBe('merged');
    expect(verdichteter.felder).toEqual([{ name: 'Ort', alt: null, neu: 'w7' }]);
    expect(verdichteter.verdichtung).toEqual({
      anzahl: 8,
      seit: zeitpunkt(0),
      arten: ['create', 'update'],
    });
    expect(verdichteter.zeitpunkt).toBe(zeitpunkt(7));
    // Der Preis der Verdichtung, unbeschönigt: kein Vorgang, kein Urheber.
    expect(verdichteter.vorgang).toBeNull();
    expect(verdichteter.benutzer).toBeNull();
    expect(verdichteter.rechner).toBeNull();
  });

  it('schließt an beide Nachbarn lückenlos an (AK3, tragender Fall)', () => {
    const { text } = verdichte(alsText(kette('r-00042', 10), kette('r-00099', 9, 200)), {
      maxPerRecord: 4,
    });
    const { belege, befunde } = leseBelege(text);
    expect(befunde).toEqual([]);
    for (const id of ['r-00042', 'r-00099'])
      expect(pruefeVerkettung(belegeZuDatensatz(belege, id)), id).toEqual({
        lueckenlos: true,
        luecken: [],
      });
  });

  it('behält bei zweimaligem Verdichten die Zahl und das älteste since (AK10)', () => {
    const erste = verdichte(alsText(kette('r-00042', 10)), { maxPerRecord: 4 });
    const gewachsen = erste.text + alsText(kette('r-00042', 10, 10).slice(1));
    const zweite = verdichte(gewachsen, { maxPerRecord: 4 });

    expect(zweite.veraendert).toBe(true);
    const belege = leseBelege(zweite.text).belege;
    const verdichteter = belege[0];
    // Acht Änderungen der ersten Spanne plus die neun, die jetzt dazukommen:
    // Die Zahl summiert sich, statt auf zwei zurückzufallen.
    expect(verdichteter.verdichtung.anzahl).toBe(17);
    expect(verdichteter.verdichtung.seit).toBe(zeitpunkt(0));
    expect(verdichteter.verdichtung.arten).toEqual(['create', 'update']);
    expect(pruefeVerkettung(belege)).toEqual({ lueckenlos: true, luecken: [] });
  });

  it('behält den fehlenden alten Wert, wenn die Spanne mit dem Anlegen beginnt', () => {
    const { text } = verdichte(alsText(kette('r-00042', 6)), { maxPerRecord: 2 });
    expect(text).toContain('noOld="1"');
    expect(leseBelege(text).belege[0].felder[0].alt).toBeNull();
  });

  it('nennt die ersetzten Arten in der Reihenfolge ihres ersten Auftretens', () => {
    const text = alsText(
      beleg({
        art: 'create',
        zeitpunkt: zeitpunkt(1),
        vorgang: '1',
        felder: [{ name: 'Ort', neu: 'Basel' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(2),
        vorgang: '2',
        felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }],
      }),
      beleg({
        art: 'delete',
        zeitpunkt: zeitpunkt(3),
        vorgang: '3',
        felder: [{ name: 'Ort', alt: 'Bern', neu: null }],
      }),
      beleg({
        art: 'create',
        zeitpunkt: zeitpunkt(4),
        vorgang: '4',
        felder: [{ name: 'Ort', alt: null, neu: 'Chur' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(5),
        vorgang: '5',
        felder: [{ name: 'Ort', alt: 'Chur', neu: 'Genf' }],
      }),
    );
    const { text: neu } = verdichte(text, { maxPerRecord: 2 });
    expect(leseBelege(neu).belege[0].verdichtung.arten).toEqual(['create', 'update', 'delete']);
  });

  it('nimmt je Feld den ersten alten und den letzten neuen Wert', () => {
    const text = alsText(
      beleg({
        art: 'create',
        zeitpunkt: zeitpunkt(1),
        vorgang: '1',
        felder: [
          { name: 'Ort', neu: 'Basel' },
          { name: 'Name', neu: 'Anna' },
        ],
      }),
      beleg({
        zeitpunkt: zeitpunkt(2),
        vorgang: '2',
        felder: [{ name: 'Ort', alt: 'Basel', neu: 'Bern' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(3),
        vorgang: '3',
        felder: [{ name: 'Ort', alt: 'Bern', neu: 'Chur' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(4),
        vorgang: '4',
        felder: [{ name: 'Name', alt: 'Anna', neu: 'Bert' }],
      }),
    );
    const { text: neu } = verdichte(text, { maxPerRecord: 2 });
    expect(leseBelege(neu).belege[0].felder).toEqual([
      { name: 'Ort', alt: null, neu: 'Chur' },
      { name: 'Name', alt: null, neu: 'Anna' },
    ]);
  });
});

describe('Verdichtung: Vorgabewerte und Übersteuerung (4T-001791, AK4, AK5)', () => {
  it('führt die beiden Vorgabewerte an genau einer Stelle (AK4)', () => {
    expect(VORGABE_MAX_BYTES).toBe(ABLAGE_SCHWELLE);
    expect(VORGABE_MAX_BYTES).toBe(734003);
    expect(VORGABE_MAX_JE_DATENSATZ).toBe(200);
    // Die Größe ist KEINE zweite Zahl: Sie kommt aus der Dokument-Teilung, und
    // im Verdichtungs-Modul steht dazu keine eigene Rechnung.
    expect(CODE_VERDICHTUNG).toMatch(/require\('\.\.\/document-split-punkte\.js'\)/);
    for (const zweiteZahl of ['0.7', '734003', '1024'])
      expect(CODE_VERDICHTUNG.includes(zweiteZahl), zweiteZahl).toBe(false);
    // Und die Beleg-Zahl steht ebenso genau einmal im Code.
    expect((CODE_VERDICHTUNG.match(/\b200\b/g) || []).length).toBe(1);
  });

  it('lässt die jüngsten Belege in halber Zahl-Schwelle einzeln stehen', () => {
    expect(behalteAnzahl(200)).toBe(100);
    expect(behalteAnzahl(3)).toBe(1);
    expect(behalteAnzahl(1)).toBe(1);
    expect(behalteAnzahl(UNBEGRENZT)).toBe(Infinity);
  });

  it('nimmt die Übersteuerung je Schwelle an und fällt bei Unbrauchbarem auf die Vorgabe (AK5)', () => {
    expect(loeseGrenzen({ maxBytes: 4096, maxPerRecord: 7 })).toEqual({
      maxBytes: 4096,
      maxPerRecord: 7,
    });
    expect(loeseGrenzen()).toEqual({
      maxBytes: VORGABE_MAX_BYTES,
      maxPerRecord: VORGABE_MAX_JE_DATENSATZ,
    });
    for (const unbrauchbar of [0, -1, 1.5, 'viele', {}, true])
      expect(loeseGrenzen({ maxBytes: unbrauchbar, maxPerRecord: unbrauchbar })).toEqual({
        maxBytes: VORGABE_MAX_BYTES,
        maxPerRecord: VORGABE_MAX_JE_DATENSATZ,
      });
    // Idempotent: Ein aufgelöstes Ergebnis kommt unverändert zurück.
    expect(loeseGrenzen(loeseGrenzen({ maxPerRecord: UNBEGRENZT }))).toEqual({
      maxBytes: VORGABE_MAX_BYTES,
      maxPerRecord: UNBEGRENZT,
    });
  });

  it('macht «unbegrenzt» je Schwelle wirksam (AK5, tragender Fall)', () => {
    // Bei der Größe geschieht gar nichts mehr, und zwar unabhängig davon, wie
    // schwer die Datei ist.
    expect(istUeberGroesse(VORGABE_MAX_BYTES + 1)).toBe(true);
    expect(istUeberGroesse(VORGABE_MAX_BYTES)).toBe(false);
    expect(istUeberGroesse(10 * VORGABE_MAX_BYTES, { maxBytes: UNBEGRENZT })).toBe(false);
    expect(istUeberGroesse(5000, { maxBytes: 4096 })).toBe(true);

    // Bei der Zahl liegt kein Datensatz je über seiner Schwelle.
    const text = alsText(kette('r-00042', 400));
    expect(verdichte(text, { maxPerRecord: UNBEGRENZT }).veraendert).toBe(false);
    expect(verdichte(text).veraendert).toBe(true);
  });

  it('greift mit den echten Vorgabewerten und lässt 200 Belege ungekürzt', () => {
    expect(verdichte(alsText(kette('r-00042', 200))).veraendert).toBe(false);
    const ueber = verdichte(alsText(kette('r-00042', 201)));
    expect(ueber.veraendert).toBe(true);
    // 201 Belege, 100 bleiben einzeln, 101 werden zu einem.
    expect(ueber.auskunft).toEqual({
      datensaetze: [{ id: 'r-00042', spannen: 1, ersetzt: 101 }],
      spannen: 1,
      ersetzt: 101,
    });
    expect(belegeZuDatensatz(leseBelege(ueber.text).belege, 'r-00042')).toHaveLength(101);
  });
});

describe('Verdichtung: Grenzen einer Spanne (4T-001791, AK12)', () => {
  it('überschreitet keinen Beleg der Art external (tragender Fall)', () => {
    const vorne = kette('r-00042', 4);
    const fremd = beleg({
      art: 'external',
      vorgang: null,
      zeitpunkt: zeitpunkt(4),
      felder: [{ name: 'Ort', alt: 'w3', neu: 'von Hand' }],
    });
    const hinten = [
      beleg({
        zeitpunkt: zeitpunkt(5),
        vorgang: '6',
        felder: [{ name: 'Ort', alt: 'von Hand', neu: 'w5' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(6),
        vorgang: '7',
        felder: [{ name: 'Ort', alt: 'w5', neu: 'w6' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(7),
        vorgang: '8',
        felder: [{ name: 'Ort', alt: 'w6', neu: 'w7' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(8),
        vorgang: '9',
        felder: [{ name: 'Ort', alt: 'w7', neu: 'w8' }],
      }),
    ];
    const text = alsText(vorne, fremd, hinten);
    const { veraendert, text: neu, auskunft } = verdichte(text, { maxPerRecord: 4 });

    expect(veraendert).toBe(true);
    // Zwei Spannen, davor und danach: Die Änderung von Hand ließe eine
    // Verdichtung über sie hinweg verschwinden.
    expect(auskunft.spannen).toBe(2);
    const belege = leseBelege(neu).belege;
    // Von neun Belegen bleiben die jüngsten zwei einzeln; die sieben älteren
    // zerfallen an der Naht in eine Spanne aus vier und eine aus zwei.
    expect(belege.map((b) => b.art)).toEqual(['merged', 'external', 'merged', 'update', 'update']);
    expect(anfuegeText(belege[1])).toBe(anfuegeText(fremd));
    expect(pruefeVerkettung(belege)).toEqual({ lueckenlos: true, luecken: [] });
  });

  it('überschreitet keinen beschädigten Beleg (tragender Fall)', () => {
    const vorne = kette('r-00042', 4);
    // Ein Beleg, dem eine Zelle fehlt: Was er geändert hat, ist unbekannt.
    const kaputt = anfuegeText(
      beleg({
        zeitpunkt: zeitpunkt(4),
        vorgang: '5',
        felder: [{ name: 'Ort', alt: 'w3', neu: 'w4' }],
      }),
    ).replace('| w4\n', '');
    const hinten = [];
    for (let i = 5; i <= 8; i++)
      hinten.push(
        beleg({
          zeitpunkt: zeitpunkt(i),
          vorgang: String(i + 1),
          felder: [{ name: 'Ort', alt: `w${i - 1}`, neu: `w${i}` }],
        }),
      );
    const text = alsText(vorne) + kaputt + alsText(hinten);
    const { text: neu, auskunft } = verdichte(text, { maxPerRecord: 4 });

    expect(auskunft.spannen).toBe(2);
    const belege = leseBelege(neu).belege;
    expect(belege.map((b) => b.art)).toEqual(['merged', 'update', 'merged', 'update', 'update']);
    expect(belege[1].beschaedigt).toBe(true);
    // Zeichengleich stehen geblieben: Die Verdichtung repariert nichts und
    // verwirft nichts.
    expect(neu).toContain(kaputt.trimStart());
    expect(pruefeVerkettung(belege).luecken).toEqual([
      { grund: 'beschaedigt', feld: null, position: 1 },
    ]);
  });

  it('lässt eine Spanne aus einem einzigen Beleg, wie sie ist', () => {
    // Zwischen zwei Nähten liegt genau ein Beleg: Zusammenzufassen ist dort
    // nichts, und ein verdichteter Beleg mit der Zahl eins wäre keine Auskunft.
    const fremd = (n, alt, neu) =>
      beleg({
        art: 'external',
        vorgang: null,
        zeitpunkt: zeitpunkt(n),
        felder: [{ name: 'Ort', alt, neu }],
      });
    const text = alsText(
      beleg({
        art: 'create',
        zeitpunkt: zeitpunkt(0),
        vorgang: '1',
        felder: [{ name: 'Ort', neu: 'w0' }],
      }),
      fremd(1, 'w0', 'w1'),
      beleg({
        zeitpunkt: zeitpunkt(2),
        vorgang: '3',
        felder: [{ name: 'Ort', alt: 'w1', neu: 'w2' }],
      }),
      fremd(3, 'w2', 'w3'),
      beleg({
        zeitpunkt: zeitpunkt(4),
        vorgang: '5',
        felder: [{ name: 'Ort', alt: 'w3', neu: 'w4' }],
      }),
      beleg({
        zeitpunkt: zeitpunkt(5),
        vorgang: '6',
        felder: [{ name: 'Ort', alt: 'w4', neu: 'w5' }],
      }),
    );
    const ergebnis = verdichte(text, { maxPerRecord: 4 });
    expect(ergebnis.veraendert).toBe(false);
    expect(ergebnis.text).toBe(text);
  });
});

describe('Verdichtung: Wächter über Löschen, Auslagern und Takt (4T-001791, AK6, AK9)', () => {
  // Hier die reine Funktion; ihr Einstieg mit Datei-Zugriff trägt denselben
  // Wächter in db-change-verdichtung.test.js, weil er dort wohnt. Getrennt,
  // damit jede Prüfdatei ihr eigenes Modul liest und ihre Änderungsklasse
  // eindeutig bleibt.
  it('löscht keinen Beleg und lagert keinen in eine Archiv-Datei aus (AK6)', () => {
    for (const muster of [/unlink/, /\brmSync\b/, /\brmdir/, /fs\.rm\b/, /archiv/i, /archive/i])
      expect(muster.test(CODE_VERDICHTUNG), String(muster)).toBe(false);
  });

  it('führt keinen Takt im Hintergrund (AK9)', () => {
    for (const muster of [/setInterval/, /setTimeout/, /setImmediate/])
      expect(muster.test(CODE_VERDICHTUNG), String(muster)).toBe(false);
  });

  it('greift prozess-neutral weder auf das Dateisystem noch auf Electron zu', () => {
    for (const wort of ['node:fs', 'node:path', 'electron'])
      expect(CODE_VERDICHTUNG.includes(wort), wort).toBe(false);
  });

  it('nimmt Parser und Serialisierer über das Beleg-Format und nicht selbst', () => {
    expect(CODE_VERDICHTUNG).toMatch(/require\('\.\/change-record\.js'\)/);
    for (const wort of ['parseRecordBlock', 'serializeRecordBlock', 'maskiere'])
      expect(CODE_VERDICHTUNG.includes(wort), wort).toBe(false);
  });
});
