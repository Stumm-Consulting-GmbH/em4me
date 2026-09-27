// 4T-001931 (Epic 3E-000256, E22.2, E22.3): Unit-Tests des Auswerters der
// Prüfregeln — Kontext, Regex, Ausdruck je Typ, nicht gesetzter Wert, nicht
// auswertbare Regel und Datensatz-Regel.
//
// **Die Regeln entstehen über das echte Lesen der Definition**
// (`parseTableDefinition`), nicht als handgebaute Objekte: Der Auswerter
// arbeitet auf der normalisierten Gestalt aus `table-checks.js`, und ein
// Prüffall mit einer anderen Gestalt bewiese nur, dass er baut, was man ihm
// gibt. Handgebaut sind allein die Fälle, die das Lesen gar nicht durchließe
// (Regel-Name, werfender Syntaxbaum).
import { describe, it, expect } from 'vitest';

import {
  GRUENDE,
  baueRegelKontext,
  wertePruefregel,
  pruefeFeldRegeln,
  pruefeDatensatzRegeln,
} from '../../src/shared/database/record-check-eval.js';
import { parseTableDefinition } from '../../src/shared/database/table-definition.js';

// Die Definition einer Tabelle aus rohen Angaben, wie sie im Frontmatter stehen.
function definition(fields, checks) {
  const behaelter = { fields };
  if (checks !== undefined) behaelter.checks = checks;
  const gelesen = parseTableDefinition({ 'db-table': behaelter });
  // Eine Regel, die das Lesen verworfen hat, prüfte hier nichts; der Prüffall
  // wäre grün, ohne etwas zu zeigen.
  expect(gelesen.hints, JSON.stringify(gelesen.hints)).toEqual([]);
  return gelesen;
}

// Ein einzelnes Feld mit seiner Regel, geprüft gegen einen Zell-Text.
function feldPruefung(feldAngabe, text) {
  const { fields } = definition([feldAngabe]);
  const kontext = baueRegelKontext(fields, [text]);
  return pruefeFeldRegeln(fields[0], text, kontext);
}

function gruende(verletzungen) {
  return verletzungen.map((v) => v.grund);
}

// --- Der Kontext -------------------------------------------------------------------------

describe('Prüfregeln: der Kontext eines Datensatzes (4T-001931, AK6)', () => {
  it('führt jedes Feld kleingeschrieben mit seinem Wert nach dem Typ', () => {
    const { fields } = definition([
      { name: 'Name' },
      { name: 'Menge', type: 'number' },
      { name: 'Bezahlt', type: 'boolean' },
      { name: 'Datum', type: 'date' },
      { name: 'Zeit', type: 'time' },
    ]);
    expect(baueRegelKontext(fields, ['Anna', '12.5', 'x', '2026-09-24', '08:30'])).toEqual({
      name: 'Anna',
      menge: 12.5,
      bezahlt: true,
      datum: '2026-09-24',
      zeit: '08:30',
    });
  });

  it('setzt leeren Text und Typ-Fehler auf null und führt jedes Feld der Definition', () => {
    const { fields } = definition([
      { name: 'Name' },
      { name: 'Menge', type: 'number' },
      { name: 'Datum', type: 'date' },
      { name: 'Fehlt' },
    ]);
    // Die vierte Zelle fehlt ganz; sie steht trotzdem im Kontext.
    expect(baueRegelKontext(fields, ['  ', 'zwölf', '2026-02-31'])).toEqual({
      name: null,
      menge: null,
      datum: null,
      fehlt: null,
    });
  });

  it('liest die leere Zelle eines Wahrheitswerts als «nein» und nicht als nicht gesetzt', () => {
    // Die leere Zelle ist beim Wahrheitswert der geschriebene Wert «nein»
    // (Entscheidung des Product Owners vom 2026-09-20, `istNichtGesetzt`).
    const { fields } = definition([{ name: 'Bezahlt', type: 'boolean' }]);
    expect(baueRegelKontext(fields, [''])).toEqual({ bezahlt: false });
    expect(baueRegelKontext(fields, ['ja'])).toEqual({ bezahlt: null });
  });
});

// --- Feld-Regeln: regulärer Ausdruck --------------------------------------------------

describe('Prüfregeln: regulärer Ausdruck gegen den Zell-Text (4T-001931, AK1)', () => {
  const ORT = {
    name: 'Ort',
    check: '/^[A-ZÄÖÜ][a-zäöüß]+( [A-ZÄÖÜ][a-zäöüß]+)*$/u',
  };

  it('nimmt Umlaute und Leerraum im Muster ernst', () => {
    expect(feldPruefung(ORT, 'Zürich')).toEqual([]);
    expect(feldPruefung(ORT, 'Bad Säckingen')).toEqual([]);
    expect(gruende(feldPruefung(ORT, 'zürich'))).toEqual([GRUENDE.regex]);
    expect(gruende(feldPruefung(ORT, 'Bad  Säckingen'))).toEqual([GRUENDE.regex]);
  });

  it('prüft den Text unverändert, ohne ihn zu beschneiden', () => {
    // Ein Datenspeicher, der einen Wert vor der Prüfung beschneidet, prüft einen
    // anderen Wert als den, den er schreibt.
    const verletzungen = feldPruefung(ORT, ' Zürich');
    expect(verletzungen).toEqual([
      { feld: 'Ort', wert: ' Zürich', quelle: ORT.check, message: null, grund: GRUENDE.regex },
    ]);
  });

  it('setzt einen zustandsbehafteten Ausdruck vor jedem Test zurück', () => {
    // Das Lesen weist die Flags g und y ab; der Auswerter hängt trotzdem nicht
    // an einem Stand, den eine frühere Prüfung hinterlassen hat.
    const regel = { art: 'regex', quelle: '/a/g', regex: /a/g, message: null };
    regel.regex.lastIndex = 5;
    expect(wertePruefregel(regel, { kontext: {}, text: 'a', wert: 'a' }).erfuellt).toBe(true);
    expect(wertePruefregel(regel, { kontext: {}, text: 'a', wert: 'a' }).erfuellt).toBe(true);
  });
});

// --- Feld-Regeln: Ausdruck je Typ -----------------------------------------------------------

describe('Prüfregeln: Ausdruck über den eigenen Wert (4T-001931, AK6)', () => {
  it('rechnet mit einer Zahl als Zahl', () => {
    const MENGE = { name: 'Menge', type: 'number', check: 'value > 0 AND value <= 100' };
    expect(feldPruefung(MENGE, '50')).toEqual([]);
    expect(feldPruefung(MENGE, '100.0')).toEqual([]);
    expect(gruende(feldPruefung(MENGE, '0'))).toEqual([GRUENDE.ausdruck]);
    // Als Text verglichen läge «150» vor «50»; als Zahl liegt es darüber.
    expect(gruende(feldPruefung(MENGE, '150'))).toEqual([GRUENDE.ausdruck]);
  });

  it('vergleicht ein Datum chronologisch gegen ein Datums-Literal', () => {
    const BEGINN = { name: 'Beginn', type: 'date', check: 'value >= date(2026-01-01)' };
    expect(feldPruefung(BEGINN, '2026-01-01')).toEqual([]);
    expect(feldPruefung(BEGINN, '2026-09-24')).toEqual([]);
    expect(gruende(feldPruefung(BEGINN, '2025-12-31'))).toEqual([GRUENDE.ausdruck]);
  });

  it('vergleicht eine Uhrzeit in ihrer kanonischen Form', () => {
    const ZEIT = { name: 'Zeit', type: 'time', check: 'value >= "08:00" AND value <= "17:30"' };
    expect(feldPruefung(ZEIT, '08:00')).toEqual([]);
    expect(feldPruefung(ZEIT, '12:15:30')).toEqual([]);
    expect(gruende(feldPruefung(ZEIT, '07:59'))).toEqual([GRUENDE.ausdruck]);
    expect(gruende(feldPruefung(ZEIT, '17:30:01'))).toEqual([GRUENDE.ausdruck]);
  });

  it('nimmt einen Wahrheitswert als Wahrheitswert, allein und verneint', () => {
    const PFLICHT_HAKEN = { name: 'Einwilligung', type: 'boolean', check: 'value' };
    const KEIN_HAKEN = { name: 'Gesperrt', type: 'boolean', check: 'NOT value' };
    expect(feldPruefung(PFLICHT_HAKEN, 'x')).toEqual([]);
    expect(gruende(feldPruefung(PFLICHT_HAKEN, ''))).toEqual([GRUENDE.ausdruck]);
    expect(feldPruefung(KEIN_HAKEN, '')).toEqual([]);
    expect(gruende(feldPruefung(KEIN_HAKEN, 'X'))).toEqual([GRUENDE.ausdruck]);
  });

  it('vergleicht Text wie jede Abfrage, ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    const NAME = { name: 'Name', check: 'value != "unbekannt"' };
    expect(feldPruefung(NAME, 'Anna')).toEqual([]);
    expect(gruende(feldPruefung(NAME, 'Unbekannt'))).toEqual([GRUENDE.ausdruck]);
  });

  it('meldet alle verletzten Regeln eines Feldes in ihrer Reihenfolge', () => {
    const MENGE = {
      name: 'Menge',
      type: 'number',
      check: ['value > 0', { rule: 'value < -5', message: 'zu groß' }, 'value != 3'],
    };
    expect(feldPruefung(MENGE, '3').map((v) => [v.quelle, v.message])).toEqual([
      ['value < -5', 'zu groß'],
      ['value != 3', null],
    ]);
  });
});

// --- Nicht gesetzt, nicht auswertbar (AK3) ---------------------------------------------------

describe('Prüfregeln: nicht gesetzter Wert und nicht auswertbare Regel (4T-001931, AK3)', () => {
  it('wendet keine Regel auf einen leeren Wert an', () => {
    expect(feldPruefung({ name: 'Menge', type: 'number', check: 'value > 0' }, '')).toEqual([]);
    expect(feldPruefung({ name: 'Name', check: 'value != ""' }, '   ')).toEqual([]);
    expect(feldPruefung({ name: 'Plz', check: '/^\\d{4}$/' }, '')).toEqual([]);
  });

  it('wendet keine Regel auf einen Typ-Fehler an; ihn meldet die Typ-Prüfung', () => {
    expect(feldPruefung({ name: 'Menge', type: 'number', check: 'value > 0' }, 'zwölf')).toEqual(
      [],
    );
    expect(
      feldPruefung(
        { name: 'Beginn', type: 'date', check: 'value >= date(2026-01-01)' },
        '2026-02-31',
      ),
    ).toEqual([]);
  });

  it('lässt einen Ausdruck ohne Ergebnis nicht durch und nennt den Grund', () => {
    // Division durch null und Rechnen mit einem Text ergeben in der
    // Abfrage-Sprache keinen Wert (`null`); still durchgelassen bräche das die
    // Zusicherung der Regel.
    const TEILER = { name: 'Menge', type: 'number', check: ['value / 0', 'value * "abc"'] };
    expect(feldPruefung(TEILER, '4')).toMatchObject([
      { quelle: 'value / 0', grund: GRUENDE.nichtAuswertbar },
      { quelle: 'value * "abc"', grund: GRUENDE.nichtAuswertbar },
    ]);
  });

  it('lässt einen nicht vergleichbaren Vergleich nicht durch', () => {
    // Die Abfrage-Sprache wertet einen Vergleich unvergleichbarer Typen zu
    // `false` aus und nicht zu `null` (`evaluateExpression`, Knoten `cmp`); der
    // Auswerter sieht deshalb eine nicht erfüllte Regel. Verletzt ist sie so
    // oder so, still durchgelassen wird sie nicht.
    const VERGLEICH = { name: 'Menge', type: 'number', check: 'value > "abc"' };
    expect(gruende(feldPruefung(VERGLEICH, '4'))).toEqual([GRUENDE.ausdruck]);
  });

  it('wertet einen werfenden Ausdruck als nicht auswertbar', () => {
    const werfend = {
      art: 'expr',
      quelle: 'kaputt',
      ast: {
        get type() {
          throw new Error('kaputt');
        },
      },
      message: null,
    };
    expect(wertePruefregel(werfend, { kontext: {}, text: '1', wert: 1 })).toEqual({
      erfuellt: false,
      grund: GRUENDE.nichtAuswertbar,
      quelle: 'kaputt',
      message: null,
    });
  });

  it('wertet einen Regel-Namen ohne Prüfung im Katalog als nicht auswertbar', () => {
    // Das Lesen verwirft einen unbekannten Namen; der Zweig steht trotzdem laut.
    const name = { art: 'name', quelle: 'iban', name: 'iban', message: null };
    expect(wertePruefregel(name, { kontext: {}, text: 'CH00', wert: 'CH00' })).toMatchObject({
      erfuellt: false,
      grund: GRUENDE.nichtAuswertbar,
    });
  });

  it('bricht laut, wenn der Kontext das Feld nicht kennt', () => {
    const { fields } = definition([{ name: 'Menge', type: 'number', check: 'value > 0' }]);
    expect(() => pruefeFeldRegeln(fields[0], '4', {})).toThrow(TypeError);
  });
});

// --- Datensatz-Regeln ----------------------------------------------------------------------

describe('Prüfregeln: Datensatz-Regel über mehrere Felder (4T-001931, AK2, AK6)', () => {
  const FELDER = [
    { name: 'Beginn', type: 'date' },
    { name: 'Ende', type: 'date' },
    { name: 'Bezahlt', type: 'boolean' },
    { name: 'Betrag', type: 'number' },
  ];
  const REGELN = [
    { rule: 'Ende >= Beginn', message: 'Das Ende liegt vor dem Beginn.' },
    'NOT Bezahlt OR Betrag > 0',
  ];

  function datensatzPruefung(texte) {
    const { fields, checks } = definition(FELDER, REGELN);
    return pruefeDatensatzRegeln(checks, baueRegelKontext(fields, texte), fields);
  }

  it('vergleicht Feld gegen Feld chronologisch', () => {
    expect(datensatzPruefung(['2026-09-01', '2026-09-24', '', ''])).toEqual([]);
    expect(datensatzPruefung(['2026-09-24', '2026-09-01', '', ''])).toEqual([
      {
        felder: ['Beginn', 'Ende'],
        quelle: 'Ende >= Beginn',
        message: 'Das Ende liegt vor dem Beginn.',
        grund: GRUENDE.ausdruck,
      },
    ]);
  });

  it('nennt die beteiligten Felder in der Schreibweise der Definition', () => {
    const verletzungen = datensatzPruefung(['2026-09-01', '2026-09-24', 'x', '0']);
    expect(verletzungen).toEqual([
      {
        felder: ['Bezahlt', 'Betrag'],
        quelle: 'NOT Bezahlt OR Betrag > 0',
        message: null,
        grund: GRUENDE.ausdruck,
      },
    ]);
  });

  it('läuft auch bei leeren Feldern; Leere prüft der Autor im Ausdruck', () => {
    // Das leere Ende ist nicht vergleichbar, die Regel damit nicht erfüllt.
    expect(datensatzPruefung(['2026-09-01', '', '', '']).map((v) => v.quelle)).toEqual([
      'Ende >= Beginn',
    ]);
    // Der leere Wahrheitswert ist «nein»: Die zweite Regel ist erfüllt.
    expect(datensatzPruefung(['2026-09-01', '2026-09-01', '', ''])).toEqual([]);
  });

  it('sieht kein value, auch wenn ein Feld-Wert im Kontext stünde', () => {
    const { fields, checks } = definition([{ name: 'Menge', type: 'number' }], ['Menge > 0']);
    const kontext = baueRegelKontext(fields, ['4']);
    expect(pruefeDatensatzRegeln(checks, kontext, fields)).toEqual([]);
    expect(wertePruefregel(checks[0], { kontext }).erfuellt).toBe(true);
  });
});

// --- Meldung (AK1, AK6) -------------------------------------------------------------------

describe('Prüfregeln: der Meldungstext der Definition (4T-001931)', () => {
  it('reicht einen Meldungstext unverändert durch', () => {
    const PLZ = { name: 'Plz', check: { rule: '/^\\d{4}$/', message: 'Vier Ziffern, bitte.' } };
    expect(feldPruefung(PLZ, '40510')[0].message).toBe('Vier Ziffern, bitte.');
  });

  it('reicht eine Sprach-Zuordnung unübersetzt durch', () => {
    const PLZ = {
      name: 'Plz',
      check: { rule: '/^\\d{4}$/', message: { de: 'Vier Ziffern.', en: 'Four digits.' } },
    };
    expect(feldPruefung(PLZ, 'abc')[0].message).toEqual({
      de: 'Vier Ziffern.',
      en: 'Four digits.',
    });
  });
});
