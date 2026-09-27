// 4T-001930 (Epic 3E-000256, E22): Unit-Tests der Prüfregeln in der
// Tabellen-Definition — Feld-Regeln am Definitions-Eintrag (`check`) in allen
// drei Formen und als Liste, Datensatz-Regeln am Behälter (`checks`) mit
// geprüften Feld-Bezügen, die Meldung als Text und als Sprach-Zuordnung, jede
// Fehlerlage mit ihrem Code und der Unversehrtheit der übrigen Regeln, dazu die
// Anwender-Texte der neuen Codes in allen fünf Fragmenten. Seit 4T-001932 auch
// die Bearbeitbarkeits-Bedingung am Behälter (`editable`) mit ihren vier Codes.
//
// Geprüft wird überwiegend durch den Definitions-Parser hindurch, weil dort die
// Wirkung entsteht (Hinweis mit Stelle, Regel am Feld); die beiden Leser des
// Regel-Moduls sind zusätzlich einzeln belegt.
//
// Lese-Ort-Regel (4T-001632): Die Fragmente werden im Modulkopf gelesen, in den
// Prüffällen wird nur noch verglichen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DB_TABLE_KEY,
  DB_FIELDS_KEY,
  HINWEIS_META,
  parseTableDefinition,
} from '../../src/shared/database/table-definition.js';
import {
  DB_CHECK_KEY,
  DB_CHECKS_KEY,
  DB_EDITABLE_KEY,
  REGEL_NAMEN,
  leseFeldRegeln,
  leseDatensatzRegeln,
  leseBearbeitbarkeit,
} from '../../src/shared/database/table-checks.js';

// --- Bestands-Lesung, Modulkopf ------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAGMENTE = path.resolve(HERE, '..', '..', 'src', 'i18n', 'fragments');
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const DATENBANK_TEXTE = Object.fromEntries(
  SPRACHEN.map((sprache) => [
    sprache,
    JSON.parse(fs.readFileSync(path.join(FRAGMENTE, sprache, 'database.json'), 'utf8')),
  ]),
);

// Die Codes dieses Vorgangs. Die Liste steht hier ausdrücklich und nicht als
// Filter über den Katalog, damit ein vergessener Katalog-Eintrag auffällt.
const REGEL_CODES = [
  'check',
  'checkRegex',
  'checkExpr',
  'checkFieldRef',
  'checkUnknownRule',
  'checkMessage',
  'checksNotList',
  'checksEntry',
  'checksExpr',
  'checkUnknownField',
  'checksMessage',
];

// 4T-001932: die Codes der Bearbeitbarkeits-Bedingung, ebenso ausdrücklich.
const BEARBEITBAR_CODES = ['editable', 'editableExpr', 'editableUnknownField', 'editableMessage'];

// --- Helfer --------------------------------------------------------------------------

// Frontmatter-Objekt einer Tabelle mit Feldern und optionalen Datensatz-Regeln.
function tabelle(felder, checks) {
  const behaelter = { [DB_FIELDS_KEY]: felder };
  if (checks !== undefined) behaelter[DB_CHECKS_KEY] = checks;
  return { [DB_TABLE_KEY]: behaelter };
}

// Die Feld-Regeln eines einzelnen Feldes samt den Hinweisen der Definition.
function feldMit(check) {
  const { fields, hints } = parseTableDefinition(tabelle([{ name: 'wert', check }]));
  return { feld: fields[0], hints };
}

// Die Regel ohne ihre übersetzten Teile, für den Vergleich der Gestalt.
function gestalt(regel) {
  const { regex, ast, ...rest } = regel;
  return { ...rest, regex: regex ? String(regex) : undefined, hatAst: ast !== undefined };
}

describe('Prüfregeln: Schlüssel und Katalog', () => {
  it('nennt die beiden Schlüssel der entschiedenen Schreibweise', () => {
    expect(DB_CHECK_KEY).toBe('check');
    expect(DB_CHECKS_KEY).toBe('checks');
  });

  it('der Katalog der Regel-Namen ist leer und nicht veränderbar', () => {
    expect(REGEL_NAMEN).toEqual([]);
    expect(Object.isFrozen(REGEL_NAMEN)).toBe(true);
  });

  it('der Hinweis-Katalog führt jeden Code mit dem Schlüssel seiner Reichweite', () => {
    for (const code of REGEL_CODES) expect(HINWEIS_META[code], code).toBeTruthy();
    const feld = ['check', 'checkRegex', 'checkExpr', 'checkFieldRef', 'checkUnknownRule'];
    for (const code of feld) expect(HINWEIS_META[code].key, code).toBe(DB_CHECK_KEY);
    for (const code of ['checksNotList', 'checksEntry', 'checksExpr', 'checkUnknownField'])
      expect(HINWEIS_META[code].key, code).toBe(DB_CHECKS_KEY);
    expect(HINWEIS_META.checkMessage.key).toBe('message');
    expect(HINWEIS_META.checksMessage.key).toBe('message');
    expect(HINWEIS_META.editableMessage.key).toBe('message');
  });
});

describe('Feld-Regeln: die drei Formen (AK1)', () => {
  it('liest einen regulären Ausdruck ohne Flags', () => {
    const { feld, hints } = feldMit('/^[^@\\s]+@[^@\\s]+$/');
    expect(hints).toEqual([]);
    expect(feld.checks).toHaveLength(1);
    const [regel] = feld.checks;
    expect(regel.art).toBe('regex');
    expect(regel.quelle).toBe('/^[^@\\s]+@[^@\\s]+$/');
    expect(regel.regex).toBeInstanceOf(RegExp);
    expect(regel.regex.flags).toBe('');
    expect(regel.regex.test('a@b.ch')).toBe(true);
    expect(regel.regex.test('kein at')).toBe(false);
    expect(regel.message).toBeNull();
    expect('ast' in regel).toBe(false);
    expect('name' in regel).toBe(false);
  });

  it('liest einen regulären Ausdruck mit Flags', () => {
    const { feld, hints } = feldMit('/^[a-z]+$/i');
    expect(hints).toEqual([]);
    expect(feld.checks[0].regex.flags).toBe('i');
    expect(feld.checks[0].regex.test('ABC')).toBe(true);
  });

  it('liest einen Schrägstrich im Muster ohne Maskierung und Umlaute im Muster', () => {
    const bruch = feldMit('/^\\d+/\\d+$/').feld.checks[0];
    expect(bruch.regex.source).toBe('^\\d+\\/\\d+$');
    expect(bruch.regex.test('3/4')).toBe(true);
    expect(bruch.regex.test('3-4')).toBe(false);

    const umlaut = feldMit('/^[a-zäöüß ]+$/i').feld.checks[0];
    expect(umlaut.regex.test('Größe Maß')).toBe(true);
    expect(umlaut.regex.test('Größe 5')).toBe(false);
  });

  it('liest einen Ausdruck über value', () => {
    const { feld, hints } = feldMit('value > 0');
    expect(hints).toEqual([]);
    const [regel] = feld.checks;
    expect(regel.art).toBe('expr');
    expect(regel.quelle).toBe('value > 0');
    expect(regel.ast).toMatchObject({ type: 'cmp', op: 'gt', left: { type: 'field' } });
    expect('regex' in regel).toBe(false);
  });

  it('liest Ausdrücke mit Klammern, AND, OR und NOT', () => {
    for (const quelle of [
      '(value > 0 AND value < 10) OR value = 99',
      'NOT value = 5',
      'length(value) >= 3 AND NOT contains(value, "x")',
      'Value > 0',
      'value',
    ]) {
      const { feld, hints } = feldMit(quelle);
      expect(hints, quelle).toEqual([]);
      expect(
        feld.checks.map((r) => r.art),
        quelle,
      ).toEqual(['expr']);
    }
  });

  it('deutet ein einzelnes Wort als Regel-Namen, value aber nie', () => {
    // Der Katalog ist leer: Jeder Name ist unbekannt und wird gemeldet, statt
    // als Bezug auf ein fremdes Feld missdeutet zu werden.
    for (const wort of ['email', 'iban-ch', 'Plz_CH', 'größe']) {
      const { feld, hints } = feldMit(wort);
      expect(
        hints.map((h) => h.code),
        wort,
      ).toEqual(['checkUnknownRule']);
      expect(feld.checks, wort).toBeUndefined();
    }
    for (const wort of ['value', 'VALUE']) {
      expect(feldMit(wort).feld.checks[0].art, wort).toBe('expr');
    }
  });

  it('liest die Objekt-Form mit Meldung als Text (AK2)', () => {
    const { feld, hints } = feldMit({ rule: 'value > 0', message: 'Die Menge muss positiv sein.' });
    expect(hints).toEqual([]);
    expect(gestalt(feld.checks[0])).toEqual({
      art: 'expr',
      quelle: 'value > 0',
      message: 'Die Menge muss positiv sein.',
      regex: undefined,
      hatAst: true,
    });
  });

  it('liest die Objekt-Form mit Meldung als Sprach-Zuordnung (AK2)', () => {
    const { feld, hints } = feldMit({
      rule: '/^\\d{4}$/',
      message: { DE: 'Vier Ziffern.', en: 'Four digits.' },
    });
    expect(hints).toEqual([]);
    expect(feld.checks[0].art).toBe('regex');
    expect(feld.checks[0].message).toEqual({ de: 'Vier Ziffern.', en: 'Four digits.' });
  });

  it('liest eine Liste aus mehreren Regeln in ihrer Reihenfolge', () => {
    const { feld, hints } = feldMit([
      '/^\\S+$/',
      'length(value) <= 20',
      { rule: 'value != "admin"', message: 'Reserviert.' },
    ]);
    expect(hints).toEqual([]);
    expect(feld.checks.map((r) => [r.art, r.quelle, r.message])).toEqual([
      ['regex', '/^\\S+$/', null],
      ['expr', 'length(value) <= 20', null],
      ['expr', 'value != "admin"', 'Reserviert.'],
    ]);
  });

  it('eine leere Meldung ist keine Meldung und kein Verstoß', () => {
    for (const message of [undefined, null, '', '   ']) {
      const { feld, hints } = feldMit({ rule: 'value > 0', message });
      expect(hints, String(message)).toEqual([]);
      expect(feld.checks[0].message, String(message)).toBeNull();
    }
  });

  it('weitere Schlüssel im Regel-Objekt bleiben hinweisfrei', () => {
    const { feld, hints } = feldMit({ rule: 'value > 0', severity: 'warn' });
    expect(hints).toEqual([]);
    expect(feld.checks).toHaveLength(1);
  });
});

describe('Feld-Regeln: Fehlerlagen (AK3)', () => {
  // Je Fehlerlage eine unbrauchbare Regel zwischen zwei gültigen: Der Hinweis
  // nennt die Stelle, die beiden gültigen Regeln und das Feld bleiben.
  const FAELLE = [
    ['checkRegex', '/[a-/'],
    ['checkRegex', '/abc/q'],
    ['checkRegex', '/abc/g'],
    ['checkRegex', '/abc/y'],
    ['checkRegex', '/abc'],
    ['checkRegex', '//'],
    ['checkExpr', 'value >'],
    ['checkExpr', 'gibtsnicht(value)'],
    ['checkExpr', 'value = = 1'],
    ['checkFieldRef', 'value > menge'],
    ['checkFieldRef', 'file.name = "x"'],
    ['checkFieldRef', 'this.status = "offen"'],
    ['checkFieldRef', 'value = true'],
    ['checkUnknownRule', 'email'],
    ['check', 42],
    ['check', true],
    ['check', ['value > 0']],
    ['check', { message: 'ohne Regel' }],
    ['check', { rule: 5 }],
    ['check', { rule: '   ' }],
  ];

  for (const [code, roh] of FAELLE) {
    it(`${code}: ${JSON.stringify(roh)} entfällt einzeln`, () => {
      const { fields, hints } = parseTableDefinition(
        tabelle([
          { name: 'vorher' },
          { name: 'menge', type: 'number', check: ['value >= 0', roh, '/^\\d+$/'] },
        ]),
      );
      expect(hints).toHaveLength(1);
      expect(hints[0]).toMatchObject({
        code,
        index: 1,
        name: 'menge',
        key: HINWEIS_META[code].key,
      });
      expect(fields.map((f) => f.name)).toEqual(['vorher', 'menge']);
      expect(fields[1].type).toBe('number');
      expect(fields[1].checks.map((r) => r.quelle)).toEqual(['value >= 0', '/^\\d+$/']);
    });
  }

  it('checkUnknownRule nennt den Katalog als Erwartung', () => {
    const { hints } = feldMit('email');
    expect(hints[0].expected).toEqual([]);
    expect(hints[0].expected).not.toBe(REGEL_NAMEN);
  });

  it('ein einzelner Wert außerhalb der Formen meldet check', () => {
    for (const roh of [42, false, { rule: null }]) {
      const { feld, hints } = feldMit(roh);
      expect(
        hints.map((h) => h.code),
        JSON.stringify(roh),
      ).toEqual(['check']);
      expect(feld.checks).toBeUndefined();
    }
  });

  it('eine unbrauchbare Meldung entfällt, die Regel bleibt (checkMessage)', () => {
    for (const message of [5, ['a'], { de: '' }, { de: 5 }]) {
      const { feld, hints } = feldMit({ rule: 'value > 0', message });
      expect(
        hints.map((h) => [h.code, h.index, h.name]),
        JSON.stringify(message),
      ).toEqual([['checkMessage', 0, 'wert']]);
      expect(feld.checks, JSON.stringify(message)).toHaveLength(1);
      expect(feld.checks[0].message).toBeNull();
    }
  });

  it('ein Feld mit ausschließlich unbrauchbaren Regeln bleibt ohne checks lesbar', () => {
    const { fields, hints } = parseTableDefinition(
      tabelle([{ name: 'plz', check: ['/[/', 'plz > 0'] }, { name: 'ort' }]),
    );
    expect(hints.map((h) => h.code)).toEqual(['checkRegex', 'checkFieldRef']);
    expect(fields).toEqual([
      { name: 'plz', type: 'string' },
      { name: 'ort', type: 'string' },
    ]);
  });

  it('eine leere Liste und null sind keine Regeln und kein Verstoß', () => {
    for (const check of [[], null]) {
      const { feld, hints } = feldMit(check);
      expect(hints).toEqual([]);
      expect(feld).toEqual({ name: 'wert', type: 'string' });
    }
  });
});

describe('Datensatz-Regeln (AK1, AK3)', () => {
  const FELDER = [
    { name: 'start', type: 'date' },
    { name: 'Ende', type: 'date' },
    { name: 'aktiv', type: 'boolean' },
  ];

  it('liest Ausdrücke über die Feld-Namen der Tabelle, auch ohne Rücksicht auf die Schreibung', () => {
    const { checks, hints } = parseTableDefinition(
      tabelle(FELDER, [
        'ende >= start',
        { rule: 'aktiv OR Ende >= start', message: { de: 'Offen nur mit Ende.', it: 'Aperto.' } },
        'aktiv',
      ]),
    );
    expect(hints).toEqual([]);
    expect(checks.map((r) => [r.art, r.quelle])).toEqual([
      ['expr', 'ende >= start'],
      ['expr', 'aktiv OR Ende >= start'],
      ['expr', 'aktiv'],
    ]);
    expect(checks[1].message).toEqual({ de: 'Offen nur mit Ende.', it: 'Aperto.' });
    expect(checks[0].ast).toMatchObject({ type: 'cmp', op: 'ge' });
  });

  it('weist ein unbekanntes Feld ab und nennt die vorhandenen (checkUnknownField)', () => {
    const { checks, hints } = parseTableDefinition(
      tabelle(FELDER, ['ende >= start', 'ende >= beginn', 'value > 0', 'file.name = "x"']),
    );
    expect(hints).toEqual(
      ['ende >= beginn', 'value > 0', 'file.name = "x"'].map((quelle) => ({
        code: 'checkUnknownField',
        index: -1,
        name: quelle,
        key: 'checks',
        expected: ['start', 'Ende', 'aktiv'],
      })),
    );
    expect(checks.map((r) => r.quelle)).toEqual(['ende >= start']);
  });

  it('ein regulärer Ausdruck oder ein ungültiger Ausdruck ist keine Datensatz-Regel (checksExpr)', () => {
    const { checks, hints } = parseTableDefinition(
      tabelle(FELDER, ['/^a/', 'start >', 'gibtsnicht(start)', 'aktiv']),
    );
    expect(hints.map((h) => [h.code, h.index, h.name])).toEqual([
      ['checksExpr', -1, '/^a/'],
      ['checksExpr', -1, 'start >'],
      ['checksExpr', -1, 'gibtsnicht(start)'],
    ]);
    expect(checks.map((r) => r.quelle)).toEqual(['aktiv']);
  });

  it('ein Eintrag außerhalb der Formen entfällt einzeln (checksEntry)', () => {
    const { checks, hints } = parseTableDefinition(
      tabelle(FELDER, [5, { message: 'ohne Regel' }, ['aktiv'], 'aktiv']),
    );
    expect(hints.map((h) => [h.code, h.index, h.key])).toEqual([
      ['checksEntry', -1, 'checks'],
      ['checksEntry', -1, 'checks'],
      ['checksEntry', -1, 'checks'],
    ]);
    expect(checks).toHaveLength(1);
  });

  it('checks, das keine Liste ist, meldet checksNotList und liefert keine Regeln', () => {
    for (const roh of ['aktiv', { rule: 'aktiv' }, 5]) {
      const ergebnis = parseTableDefinition(tabelle(FELDER, roh));
      expect(
        ergebnis.hints.map((h) => [h.code, h.index]),
        JSON.stringify(roh),
      ).toEqual([['checksNotList', -1]]);
      expect('checks' in ergebnis).toBe(false);
      expect(ergebnis.fields).toHaveLength(3);
    }
  });

  it('eine unbrauchbare Meldung entfällt, die Regel bleibt (checksMessage)', () => {
    const { checks, hints } = parseTableDefinition(
      tabelle(FELDER, [{ rule: 'ende >= start', message: 42 }]),
    );
    expect(hints.map((h) => [h.code, h.name])).toEqual([['checksMessage', 'ende >= start']]);
    expect(checks).toHaveLength(1);
    expect(checks[0].message).toBeNull();
  });

  it('prüft gegen die gültigen Felder: ein entfallenes Feld trägt keine Regel', () => {
    const { checks, hints } = parseTableDefinition(
      tabelle([{ name: 'start' }, { name: 'kaputt', type: 'object' }], ['kaputt = start']),
    );
    expect(hints.map((h) => h.code)).toEqual(['typeStructured', 'checkUnknownField']);
    expect(checks).toBeUndefined();
  });

  it('eine Tabelle ohne Felder bleibt mit Datensatz-Regeln lesbar', () => {
    const ohneFelder = parseTableDefinition({ [DB_TABLE_KEY]: { checks: ['a > b', '5 > 3'] } });
    expect(ohneFelder.istTabelle).toBe(true);
    expect(ohneFelder.fields).toEqual([]);
    expect(ohneFelder.hints.map((h) => [h.code, h.expected])).toEqual([['checkUnknownField', []]]);
    // Ein Ausdruck ohne Feld-Bezug nennt kein unbekanntes Feld und bleibt.
    expect(ohneFelder.checks.map((r) => r.quelle)).toEqual(['5 > 3']);
  });

  it('eine Tabelle mit ausschließlich unbrauchbarer Regel bleibt lesbar', () => {
    const ergebnis = parseTableDefinition(tabelle(FELDER, ['ende >']));
    expect(ergebnis.istTabelle).toBe(true);
    expect(ergebnis.fields).toHaveLength(3);
    expect(ergebnis.hints.map((h) => h.code)).toEqual(['checksExpr']);
    expect('checks' in ergebnis).toBe(false);
  });
});

describe('Prüfregeln: die beiden Leser einzeln', () => {
  it('leseFeldRegeln liefert Regeln und Hinweise ohne Ortsbezug', () => {
    const { checks, hints } = leseFeldRegeln(['value > 0', '/[/']);
    expect(checks.map((r) => r.art)).toEqual(['expr']);
    expect(hints).toEqual([{ code: 'checkRegex' }]);
    expect(leseFeldRegeln(undefined)).toEqual({ checks: [], hints: [] });
  });

  it('leseDatensatzRegeln hält die Bezüge gegen die übergebenen Felder', () => {
    const { checks, hints } = leseDatensatzRegeln(
      ['A > b', 'c > 0'],
      [{ name: 'a' }, { name: 'B' }],
    );
    expect(checks.map((r) => r.quelle)).toEqual(['A > b']);
    expect(hints).toEqual([{ code: 'checkUnknownField', name: 'c > 0', expected: ['a', 'B'] }]);
    expect(leseDatensatzRegeln(null, [])).toEqual({ checks: [], hints: [] });
  });
});

describe('Prüfregeln: Anwender-Texte (AK4)', () => {
  it('jeder neue Code hat in allen fünf Fragmenten einen Satz', () => {
    const fehlend = [];
    for (const sprache of SPRACHEN) {
      for (const code of REGEL_CODES) {
        const text = DATENBANK_TEXTE[sprache][`database.hint.${code}`];
        if (typeof text !== 'string' || text.trim() === '') fehlend.push(`${sprache}: ${code}`);
      }
    }
    expect(fehlend).toEqual([]);
  });

  it('die Sätze nutzen den Ort genau dort, wo der Hinweis einen hat', () => {
    // Eine Feld-Regel hängt an ihrem Definitions-Eintrag und nennt ihn über
    // {ort}; eine Datensatz-Regel hängt am Behälter, und ein {ort} liefe dort
    // ins Leere («Feld 0»).
    const mitOrt = ['check', 'checkRegex', 'checkExpr', 'checkFieldRef', 'checkUnknownRule'];
    for (const sprache of SPRACHEN) {
      for (const code of REGEL_CODES) {
        const text = DATENBANK_TEXTE[sprache][`database.hint.${code}`];
        const erwartet = mitOrt.includes(code) || code === 'checkMessage';
        expect(text.includes('{ort}'), `${sprache}: ${code}`).toBe(erwartet);
      }
    }
  });
});

// --- Bedingte Bearbeitbarkeit (4T-001932) ----------------------------------------------

describe('Bearbeitbarkeit: die Angabe lesen (4T-001932, AK1)', () => {
  const FELDER = [{ name: 'nummer' }, { name: 'Status' }, { name: 'betrag', type: 'number' }];

  // Frontmatter-Objekt einer Tabelle mit den Feldern oben und der Angabe.
  function mitBedingung(editable) {
    return { [DB_TABLE_KEY]: { [DB_FIELDS_KEY]: FELDER, [DB_EDITABLE_KEY]: editable } };
  }

  it('nennt den Schlüssel der entschiedenen Schreibweise', () => {
    expect(DB_EDITABLE_KEY).toBe('editable');
  });

  it('liest die Kurzform als Ausdruck über die Feld-Namen, ohne Rücksicht auf die Schreibung', () => {
    const ergebnis = parseTableDefinition(mitBedingung('status != "gebucht"'));
    expect(ergebnis.hints).toEqual([]);
    expect(gestalt(ergebnis.editable)).toEqual({
      art: 'expr',
      quelle: 'status != "gebucht"',
      message: null,
      regex: undefined,
      hatAst: true,
    });
    expect(ergebnis.editable.ast).toMatchObject({ type: 'cmp', op: 'neq' });
  });

  it('liest die Objekt-Form mit Meldung als Text und als Sprach-Zuordnung', () => {
    const alsText = parseTableDefinition(
      mitBedingung({ rule: 'status = "offen" OR betrag = 0', message: 'Gebucht.' }),
    );
    expect(alsText.hints).toEqual([]);
    expect(alsText.editable.quelle).toBe('status = "offen" OR betrag = 0');
    expect(alsText.editable.message).toBe('Gebucht.');

    const alsZuordnung = parseTableDefinition(
      mitBedingung({ rule: 'status != "gebucht"', message: { DE: 'Gebucht.', en: 'Posted.' } }),
    );
    expect(alsZuordnung.hints).toEqual([]);
    expect(alsZuordnung.editable.message).toEqual({ de: 'Gebucht.', en: 'Posted.' });
  });

  it('ohne Angabe ist editable nicht gesetzt, weder als null noch als Liste', () => {
    for (const roh of [undefined, null]) {
      const ergebnis = parseTableDefinition(mitBedingung(roh));
      expect(ergebnis.hints, String(roh)).toEqual([]);
      expect('editable' in ergebnis, String(roh)).toBe(false);
    }
    const ohne = parseTableDefinition({ [DB_TABLE_KEY]: { [DB_FIELDS_KEY]: FELDER } });
    expect('editable' in ohne).toBe(false);
  });

  it('eine leere Meldung ist keine Meldung und kein Verstoß', () => {
    for (const message of [undefined, null, '', '   ']) {
      const ergebnis = parseTableDefinition(mitBedingung({ rule: 'betrag > 0', message }));
      expect(ergebnis.hints, String(message)).toEqual([]);
      expect(ergebnis.editable.message, String(message)).toBeNull();
    }
  });
});

describe('Bearbeitbarkeit: unbrauchbare Angaben (4T-001932, AK4)', () => {
  const FELDER = [{ name: 'nummer' }, { name: 'status' }];

  // Die Tabelle mit einer Datensatz-Regel daneben: Sie und die Felder müssen
  // von einer unbrauchbaren Bedingung unberührt bleiben.
  function lies(editable) {
    return parseTableDefinition({
      [DB_TABLE_KEY]: {
        [DB_FIELDS_KEY]: FELDER,
        [DB_CHECKS_KEY]: ['nummer != ""'],
        [DB_EDITABLE_KEY]: editable,
      },
    });
  }

  const FAELLE = [
    ['editable', ['status != "gebucht"']],
    ['editable', []],
    ['editable', 5],
    ['editable', true],
    ['editable', '   '],
    ['editable', { message: 'ohne Regel' }],
    ['editable', { rule: 5 }],
    ['editableExpr', 'status !='],
    ['editableExpr', '/^offen$/'],
    ['editableExpr', 'gibtsnicht(status)'],
    ['editableUnknownField', 'stauts != "gebucht"'],
    ['editableUnknownField', 'value = "x"'],
    ['editableUnknownField', 'file.name = "x"'],
  ];

  for (const [code, roh] of FAELLE) {
    it(`${code}: ${JSON.stringify(roh)} entfällt, die Tabelle bleibt sonst unverändert`, () => {
      const ergebnis = lies(roh);
      expect(ergebnis.hints).toHaveLength(1);
      expect(ergebnis.hints[0]).toMatchObject({ code, index: -1, key: 'editable' });
      expect('editable' in ergebnis).toBe(false);
      expect(ergebnis.fields).toEqual([
        { name: 'nummer', type: 'string' },
        { name: 'status', type: 'string' },
      ]);
      expect(ergebnis.checks.map((r) => r.quelle)).toEqual(['nummer != ""']);
    });
  }

  it('Ausdruck und unbekanntes Feld nennen den Text der Bedingung, das Feld die vorhandenen', () => {
    expect(lies('status !=').hints).toEqual([
      {
        code: 'editableExpr',
        index: -1,
        name: 'status !=',
        key: 'editable',
        expected: 'expression',
      },
    ]);
    expect(lies('stauts != "x"').hints).toEqual([
      {
        code: 'editableUnknownField',
        index: -1,
        name: 'stauts != "x"',
        key: 'editable',
        expected: ['nummer', 'status'],
      },
    ]);
  });

  it('eine unbrauchbare Meldung entfällt, die Bedingung bleibt (editableMessage)', () => {
    for (const message of [5, ['a'], { de: '' }, { de: 5 }]) {
      const ergebnis = lies({ rule: 'status != "gebucht"', message });
      expect(
        ergebnis.hints.map((h) => [h.code, h.index, h.name]),
        JSON.stringify(message),
      ).toEqual([['editableMessage', -1, 'status != "gebucht"']]);
      expect(ergebnis.editable.quelle).toBe('status != "gebucht"');
      expect(ergebnis.editable.message).toBeNull();
    }
  });

  it('prüft gegen die gültigen Felder: ein entfallenes Feld trägt keine Bedingung', () => {
    const ergebnis = parseTableDefinition({
      [DB_TABLE_KEY]: {
        [DB_FIELDS_KEY]: [{ name: 'status', type: 'object' }],
        [DB_EDITABLE_KEY]: 'status != "gebucht"',
      },
    });
    expect(ergebnis.hints.map((h) => h.code)).toEqual(['typeStructured', 'editableUnknownField']);
    expect('editable' in ergebnis).toBe(false);
  });
});

describe('Bearbeitbarkeit: der Leser einzeln und die Anwender-Texte (4T-001932)', () => {
  it('leseBearbeitbarkeit liefert die Regel und Hinweise ohne Ortsbezug', () => {
    const felder = [{ name: 'A' }];
    expect(leseBearbeitbarkeit(undefined, felder)).toEqual({ editable: null, hints: [] });
    expect(leseBearbeitbarkeit(['a'], felder)).toEqual({
      editable: null,
      hints: [{ code: 'editable' }],
    });
    expect(leseBearbeitbarkeit('b > 0', felder)).toEqual({
      editable: null,
      hints: [{ code: 'editableUnknownField', name: 'b > 0', expected: ['A'] }],
    });
    const gelesen = leseBearbeitbarkeit({ rule: 'a > 0', message: 'Nein.' }, felder);
    expect(gelesen.hints).toEqual([]);
    expect(gelesen.editable).toMatchObject({ art: 'expr', quelle: 'a > 0', message: 'Nein.' });
  });

  it('der Hinweis-Katalog führt jeden Code mit dem Schlüssel der Angabe', () => {
    // Die Meldung hängt wie bei check und checks am Schlüssel message.
    for (const code of BEARBEITBAR_CODES) {
      expect(HINWEIS_META[code], code).toBeTruthy();
      const erwartet = code === 'editableMessage' ? 'message' : DB_EDITABLE_KEY;
      expect(HINWEIS_META[code].key, code).toBe(erwartet);
    }
  });

  it('jeder Code hat in allen fünf Fragmenten einen Satz ohne Ort, die Bedingung benannt', () => {
    // Die Bedingung hängt am Behälter; ein {ort} liefe dort ins Leere. Die drei
    // Codes mit dem Text der Bedingung nennen ihn über {name}.
    const fehlend = [];
    for (const sprache of SPRACHEN) {
      for (const code of BEARBEITBAR_CODES) {
        const text = DATENBANK_TEXTE[sprache][`database.hint.${code}`];
        if (typeof text !== 'string' || text.trim() === '') {
          fehlend.push(`${sprache}: ${code}`);
          continue;
        }
        expect(text.includes('{ort}'), `${sprache}: ${code}`).toBe(false);
        expect(text.includes('{name}'), `${sprache}: ${code}`).toBe(code !== 'editable');
      }
      const unbekannt = DATENBANK_TEXTE[sprache]['database.hint.editableUnknownField'];
      expect(unbekannt, sprache).toContain('{expected}');
    }
    expect(fehlend).toEqual([]);
  });
});
