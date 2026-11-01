// 4T-002387 (Epic 3E-000265, Schritt 1, Entscheidung F3 A; Story 4S-001114
// AK1, AK5): Die Erkennung einer Karteikarte und ihre Kennung im
// prozess-neutralen Modul `karteikarte.js`, dazu die fünfte Datenbank-Marke
// `record` und der Hinweis `cardId`. Seit Schnitt C dazu die Werte einer
// Karteikarte (Schritt 3, S1; Task-AK5) und der Typ-Vergleich mit den
// Profil-Feldern (Schritt 4, F5 A; Task-AK6).
//
// **Eine eigene Prüfdatei**, weil das Modul neu ist und rein: Die Fälle
// brauchen weder Dateisystem noch Index. Die Befunde der Konsistenz-Prüfung,
// die auf der Erkennung aufsetzen, stehen in `db-kartei-form.test.js` neben den
// übrigen Befunden der Kartei-Form.
//
// 4T-002389 (Schnitt 1, Schritte 2 und 3): dazu das Schreiben des Dateikopfs
// einer Karteikarte (`karteikarte-schreiben.js`), zeilenweise und ohne
// Dateizugriff; den Weg durch die Schreib-Schnittstelle prüft
// `db-kartei-schreibweg.test.js`.
import { describe, it, expect } from 'vitest';

import {
  KARTEIKARTEN_ARTEN,
  karteikartenKennung,
  imOrdnerDerTabelle,
  karteikartenArt,
  istKarteikarteVon,
  zellTextAusDateikopf,
  karteikartenWerte,
  feldTextVon,
  profilTypAbweichungen,
} from '../../src/shared/database/karteikarte.js';
import { parseRecordBlock, zellenNachFeldern } from '../../src/shared/database/record-block.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import { DB_RECORD_KEY, datenbankMarken } from '../../src/shared/database/behaelter.js';
import { HINWEIS_META } from '../../src/shared/database/table-hinweise.js';
import {
  KARTEIKARTE_SCHREIBEN_CODES,
  wertSchreibweise,
  ersetzeDateikopfAngaben,
  schreibeKarteikarte,
} from '../../src/shared/database/karteikarte-schreiben.js';

const TABELLE = '/bereich/Autoren/Autoren.md';

function art(pfad, frontmatter, weiter = {}) {
  return karteikartenArt({ pfad, frontmatter, tabellenPfad: TABELLE, ...weiter });
}

// --- Marke und Hinweis ------------------------------------------------------------------------

describe('Karteikarte: Marke record und Hinweis cardId (4T-002387)', () => {
  it('kennzeichnet ein Dokument mit db-record, auch bei unbrauchbarem Wert', () => {
    expect(datenbankMarken({ 'db-record': 'r-00001' })).toEqual(['record']);
    expect(datenbankMarken({ 'db-record': 'abc' })).toEqual(['record']);
    expect(datenbankMarken({ 'db-record': null })).toEqual(['record']);
    expect(datenbankMarken({ name: 'Ada' })).toEqual([]);
  });

  it('lässt die vier bestehenden Marken unverändert und hängt record hinten an', () => {
    expect(datenbankMarken({ 'db-table': {}, 'db-record': 'r-00001' })).toEqual([
      'table',
      'record',
    ]);
  });

  it('führt den Hinweis am Schlüssel db-record', () => {
    expect(HINWEIS_META.cardId).toEqual({ key: DB_RECORD_KEY, expected: 'record-id' });
    expect(DB_RECORD_KEY).toBe('db-record');
  });
});

// --- Die Kennung ------------------------------------------------------------------------------

describe('Karteikarte: Kennung aus db-record (4T-002387, AK1)', () => {
  it('liest die Kennung in der Schreibweise der Tabellen-Form', () => {
    expect(karteikartenKennung({ 'db-record': 'r-00042' })).toEqual({
      kennung: 'r-00042',
      hinweis: null,
    });
  });

  it('füllt eine kurze Kennung auf und übergeht umgebenden Leerraum', () => {
    expect(karteikartenKennung({ 'db-record': 'r-42' }).kennung).toBe('r-00042');
    expect(karteikartenKennung({ 'db-record': ' r-00007 ' }).kennung).toBe('r-00007');
    expect(karteikartenKennung({ 'db-record': 'r-100000' }).kennung).toBe('r-100000');
  });

  it('liefert ohne Angabe weder Kennung noch Hinweis', () => {
    expect(karteikartenKennung({ name: 'Ada' })).toEqual({ kennung: null, hinweis: null });
    expect(karteikartenKennung(null)).toEqual({ kennung: null, hinweis: null });
    expect(karteikartenKennung(['r-00001'])).toEqual({ kennung: null, hinweis: null });
  });

  it('meldet einen unbrauchbaren Wert mit dem Hinweis cardId und dem geschriebenen Wert', () => {
    for (const [roh, geschrieben] of [
      ['abc', 'abc'],
      ['r-0', 'r-0'],
      ['p-00001', 'p-00001'],
      [42, '42'],
      [null, null],
      [['r-00001'], null],
    ]) {
      const { kennung, hinweis } = karteikartenKennung({ 'db-record': roh });
      expect(kennung, String(roh)).toBeNull();
      expect(hinweis, String(roh)).toEqual({
        code: 'cardId',
        index: -1,
        name: geschrieben,
        key: 'db-record',
        expected: 'record-id',
      });
    }
  });
});

// --- Der Ordner -------------------------------------------------------------------------------

describe('Karteikarte: selber Ordner wie die Tabellen-Datei (4T-002387, AK2)', () => {
  it('nimmt den Ordner der Tabelle und nur ihn', () => {
    expect(imOrdnerDerTabelle('/bereich/Autoren/Ada.md', TABELLE)).toBe(true);
    expect(imOrdnerDerTabelle('/bereich/Autoren/Anhang/Ada.md', TABELLE)).toBe(false);
    expect(imOrdnerDerTabelle('/bereich/Ada.md', TABELLE)).toBe(false);
    expect(imOrdnerDerTabelle('/bereich/Autoren2/Ada.md', TABELLE)).toBe(false);
  });

  it('zählt die Tabellen-Datei selbst nicht', () => {
    expect(imOrdnerDerTabelle(TABELLE, TABELLE)).toBe(false);
  });

  it('behandelt beide Pfad-Trenner gleich', () => {
    expect(imOrdnerDerTabelle('\\bereich\\Autoren\\Ada.md', TABELLE)).toBe(true);
    expect(imOrdnerDerTabelle('C:\\b\\Autoren\\Ada.md', 'C:/b/Autoren/Autoren.md')).toBe(true);
  });
});

// --- Die drei Bedingungen ---------------------------------------------------------------------

describe('Karteikarte: die drei Bedingungen (4T-002387, AK1, AK2)', () => {
  it('erkennt ein Dokument im Ordner mit Kennung als Karteikarte', () => {
    expect(
      art('/bereich/Autoren/Ada Lovelace.md', { 'db-record': 'r-00001', name: 'Ada' }),
    ).toEqual({ art: KARTEIKARTEN_ARTEN.karteikarte, kennung: 'r-00001', hinweis: null });
  });

  it('bleibt nach dem Umbenennen der Tabellen-Datei dieselbe Karteikarte', () => {
    const fm = { 'db-record': 'r-00001' };
    const pfad = '/bereich/Autoren/Ada.md';
    const umbenannt = { tabellenPfad: '/bereich/Autoren/Personen.md' };
    expect(art(pfad, fm, umbenannt)).toEqual(art(pfad, fm));
    expect(art(pfad, fm, umbenannt).kennung).toBe('r-00001');
  });

  it('nennt ein Dokument ohne Kennung im Ordner ein Dokument ohne Kennung', () => {
    expect(art('/bereich/Autoren/Notiz.md', { name: 'Notiz' })).toEqual({
      art: KARTEIKARTEN_ARTEN.ohneKennung,
      kennung: null,
      hinweis: null,
    });
    expect(art('/bereich/Autoren/Leer.md', null).art).toBe(KARTEIKARTEN_ARTEN.ohneKennung);
  });

  it('gibt einem Dokument mit unbrauchbarer Kennung den Hinweis mit', () => {
    const ergebnis = art('/bereich/Autoren/Notiz.md', { 'db-record': 'abc' });
    expect(ergebnis.art).toBe(KARTEIKARTEN_ARTEN.ohneKennung);
    expect(ergebnis.hinweis).toMatchObject({ code: 'cardId', name: 'abc' });
  });

  it('übergeht ein Dokument im Unterordner, auch mit Kennung', () => {
    expect(art('/bereich/Autoren/Anhang/Ada.md', { 'db-record': 'r-00001' }).art).toBe(
      KARTEIKARTEN_ARTEN.keine,
    );
    expect(art('/bereich/Autoren/Anhang/Notiz.md', {}).art).toBe(KARTEIKARTEN_ARTEN.keine);
  });

  it('übergeht jede andere Datenbank-Datei, auch mit Kennung', () => {
    for (const schluessel of ['db-table', 'db-database', 'db-form', 'db-query']) {
      const fm = { [schluessel]: { table: 'Autoren' }, 'db-record': 'r-00001' };
      expect(art('/bereich/Autoren/Andere.md', fm).art, schluessel).toBe(KARTEIKARTEN_ARTEN.keine);
      expect(art('/bereich/Autoren/Andere.md', { [schluessel]: null }).art, schluessel).toBe(
        KARTEIKARTEN_ARTEN.keine,
      );
    }
  });

  it('übergeht eine Vorlage nach dem hereingereichten Prädikat', () => {
    const fm = { 'db-record': 'r-00001' };
    const pfad = '/bereich/Autoren/Ada.md';
    const gefragt = [];
    const istVorlage = (p) => {
      gefragt.push(p);
      return true;
    };
    expect(art(pfad, fm, { istVorlage }).art).toBe(KARTEIKARTEN_ARTEN.keine);
    expect(art(pfad, {}, { istVorlage }).art).toBe(KARTEIKARTEN_ARTEN.keine);
    expect(gefragt).toEqual([pfad, pfad]);
    expect(art(pfad, fm, { istVorlage: () => false }).art).toBe(KARTEIKARTEN_ARTEN.karteikarte);
    expect(art(pfad, fm, { istVorlage: null }).art).toBe(KARTEIKARTEN_ARTEN.karteikarte);
  });

  it('übergeht den Folgeteil eines geteilten Dokuments', () => {
    expect(art('/bereich/Autoren/Ada•part-00002.md', {}).art).toBe(KARTEIKARTEN_ARTEN.keine);
    expect(art('/bereich/Autoren/Ada•part-00001.md', {}).art).toBe(KARTEIKARTEN_ARTEN.ohneKennung);
  });

  it('übergeht die Tabellen-Datei selbst', () => {
    expect(art(TABELLE, { 'db-table': {} }).art).toBe(KARTEIKARTEN_ARTEN.keine);
  });

  it('beantwortet die Kurzform wie die Langform', () => {
    const p = { pfad: '/bereich/Autoren/Ada.md', tabellenPfad: TABELLE };
    expect(istKarteikarteVon({ ...p, frontmatter: { 'db-record': 'r-00001' } })).toBe(true);
    expect(istKarteikarteVon({ ...p, frontmatter: {} })).toBe(false);
  });
});

// --- Werte einer Karteikarte (Schnitt C, Task-AK5) --------------------------------------------

// Eine Definition mit je einem Feld der Typen, die eine Auslegung haben.
const FELDER = [
  { name: 'Name', type: 'string' },
  { name: 'Geboren', type: 'date' },
  { name: 'Werke', type: 'number' },
  { name: 'Aktiv', type: 'boolean' },
  { name: 'Beginn', type: 'time' },
  { name: 'Lehrer', type: 'record' },
  { name: 'Profil', type: 'link' },
];
const DEFINITION = { fields: FELDER };

// Der Dateikopf, wie die Anwendung ihn liest (JSON-Schema).
function dateikopf(zeilen) {
  return extractFrontmatter(['---', ...zeilen, '---', ''].join('\n')).data;
}

// Dieselben Werte als Datensatz der Tabellen-Form, eine Zelle je Feld.
function zellen(texte) {
  const block = ['|- id="r-00001"', ...texte.map((t) => `| ${t}`)].join('\n');
  const { records } = parseRecordBlock(block, FELDER);
  return zellenNachFeldern(records[0], FELDER);
}

const nurWerte = (liste) => liste.map(({ name, value, error }) => ({ name, value, error }));

describe('Karteikarte: Werte nach dem Typ der Spalte (4T-002387, AK5)', () => {
  it('ergibt für Datum, Zahl, Wahrheitswert, Uhrzeit und Verweis dieselben Werte wie die Zellen', () => {
    const karte = karteikartenWerte(
      dateikopf([
        'db-record: r-00001',
        'Name: Ada Lovelace',
        'Geboren: 1815-12-10',
        'Werke: 42',
        'Aktiv: true',
        'Beginn: "09:30"',
        'Lehrer: "[[Mary Somerville]]"',
        'Profil: "[[Ada]]"',
      ]),
      DEFINITION,
    );
    const tabelle = zellen([
      'Ada Lovelace',
      '1815-12-10',
      '42',
      'x',
      '09:30',
      '[[Mary Somerville]]',
      '[[Ada]]',
    ]);
    expect(nurWerte(karte)).toEqual(nurWerte(tabelle));
    expect(karte.find((w) => w.name === 'Werke').value).toBe(42);
    expect(karte.find((w) => w.name === 'Aktiv').value).toBe(true);
    expect(karte.find((w) => w.name === 'Lehrer').value).toBe('[[Mary Somerville]]');
  });

  it('liest eine Zahl mit Nachkommastellen und einen Wahrheitswert nein wie die Zelle', () => {
    const karte = karteikartenWerte(dateikopf(['Werke: 3.50', 'Aktiv: false']), DEFINITION);
    expect(karte.find((w) => w.name === 'Werke')).toMatchObject({ text: '3.5', value: 3.5 });
    expect(karte.find((w) => w.name === 'Aktiv')).toMatchObject({ text: '', value: false });
    const tabelle = zellen(['', '', '3.50', '']);
    expect(nurWerte(karte).slice(2, 4)).toEqual(nurWerte(tabelle).slice(2, 4));
  });

  it('meldet einen unpassenden Wert mit demselben Fehler wie die Zelle', () => {
    const karte = karteikartenWerte(
      dateikopf(['Geboren: 1815-02-31', 'Werke: viele', 'Aktiv: ja']),
      DEFINITION,
    );
    const tabelle = zellen(['', '1815-02-31', 'viele', 'ja']);
    for (const name of ['Geboren', 'Werke', 'Aktiv']) {
      const k = karte.find((w) => w.name === name);
      const z = tabelle.find((w) => w.name === name);
      expect({ value: k.value, error: k.error }).toEqual({ value: z.value, error: z.error });
      expect(k.error).not.toBe(null);
    }
  });

  it('liest ein fehlendes Feld leer wie eine fehlende Zelle', () => {
    const karte = karteikartenWerte(dateikopf(['Name: Ada']), DEFINITION);
    const fehlend = karte.filter((w) => w.fehlt).map((w) => w.name);
    expect(fehlend).toEqual(['Geboren', 'Werke', 'Aktiv', 'Beginn', 'Lehrer', 'Profil']);
    const block = parseRecordBlock('|- id="r-00001"\n| Ada', FELDER).records[0];
    expect(nurWerte(karte)).toEqual(nurWerte(zellenNachFeldern(block, FELDER)));
  });

  it('vergleicht Feld-Namen ohne Rücksicht auf die Schreibung', () => {
    const karte = karteikartenWerte(dateikopf(['NAME: Ada', 'werke: 7']), DEFINITION);
    expect(feldTextVon(karte, 'name')).toBe('Ada');
    expect(karte.find((w) => w.name === 'Werke').value).toBe(7);
    // Zwei Schreibungen desselben Namens: die spätere gilt, wie im Index.
    const doppelt = karteikartenWerte(dateikopf(['name: a', 'Name: b']), DEFINITION);
    expect(feldTextVon(doppelt, 'Name')).toBe('b');
  });

  it('hält einen Text zeichengenau, auch mit Leerraum und anderer Schreibung', () => {
    const karte = karteikartenWerte(dateikopf(['Name: "  Ada "']), DEFINITION);
    expect(karte[0]).toMatchObject({ text: '  Ada ', value: '  Ada ' });
    const gross = karteikartenWerte(dateikopf(['Name: ADA']), DEFINITION);
    expect(gross[0].value).toBe('ADA');
  });

  it('macht aus einer Liste einen Text mit Komma, ohne verschachtelte Einträge', () => {
    expect(zellTextAusDateikopf('string', ['Ada', 1815, true, ['x'], { a: 1 }])).toBe(
      'Ada, 1815, true',
    );
    const karte = karteikartenWerte(dateikopf(['Name: [Ada, Lovelace]']), DEFINITION);
    expect(karte[0].value).toBe('Ada, Lovelace');
  });

  it('liest Objekt und null als leeren Text und einen Wahrheitswert im Text-Feld als Text', () => {
    expect(zellTextAusDateikopf('string', { a: 1 })).toBe('');
    expect(zellTextAusDateikopf('number', null)).toBe('');
    expect(zellTextAusDateikopf('string', true)).toBe('true');
    expect(zellTextAusDateikopf('boolean', true)).toBe('x');
  });

  it('liefert ohne Definition keine Werte und nimmt auch die Werte des Index an', () => {
    expect(karteikartenWerte({ name: 'Ada' }, null)).toEqual([]);
    const index = karteikartenWerte({ name: 'Ada', werke: '42' }, DEFINITION);
    expect(feldTextVon(index, 'Name')).toBe('Ada');
    expect(index.find((w) => w.name === 'Werke').value).toBe(42);
    expect(feldTextVon(index, 'Unbekannt')).toBe('');
  });
});

// --- Typ-Vergleich mit den Profil-Feldern (Schnitt C, Task-AK6) -------------------------------

describe('Karteikarte: abweichender Typ eines Profil-Feldes (4T-002387, AK6)', () => {
  const profilFeld = (name, type, weiter = {}) => ({ name, type, profile: 'Person', ...weiter });

  it('bleibt bei gleichem Typ still, auch bei anderer Schreibung des Namens', () => {
    const felder = [
      profilFeld('name', 'string'),
      profilFeld('GEBOREN', 'date'),
      profilFeld('Profil', 'link'),
    ];
    expect(profilTypAbweichungen(DEFINITION, felder)).toEqual([]);
  });

  it('meldet einen anderen Typ mit Feld, Profil und beiden Typen', () => {
    const felder = [profilFeld('werke', 'string'), profilFeld('Aktiv', 'boolean')];
    expect(profilTypAbweichungen(DEFINITION, felder)).toEqual([
      { feld: 'Werke', profil: 'Person', typTabelle: 'number', typProfil: 'string' },
    ]);
  });

  it('meldet Profil-Typen ohne Spalte und ein mehrwertiges Feld als abweichend', () => {
    const felder = [
      profilFeld('Name', 'multistring'),
      profilFeld('Werke', 'number', { multiple: true }),
      profilFeld('Lehrer', 'link'),
    ];
    expect(profilTypAbweichungen(DEFINITION, felder).map((a) => a.typProfil)).toEqual([
      'multistring',
      'number (multiple)',
      'link',
    ]);
  });

  it('übergeht Profil-Felder ohne gleichnamiges Feld der Tabelle', () => {
    expect(profilTypAbweichungen(DEFINITION, [profilFeld('Status', 'number')])).toEqual([]);
    expect(profilTypAbweichungen(DEFINITION, null)).toEqual([]);
  });

  it('nimmt für Felder ohne Typ den Vorgabe-Typ string an', () => {
    const ohneTyp = { fields: [{ name: 'Notiz' }] };
    expect(profilTypAbweichungen(ohneTyp, [{ name: 'notiz', profile: 'P' }])).toEqual([]);
    expect(profilTypAbweichungen(ohneTyp, [profilFeld('notiz', 'date')])).toEqual([
      { feld: 'Notiz', profil: 'Person', typTabelle: 'string', typProfil: 'date' },
    ]);
  });
});

// --- Schreiben des Dateikopfs (4T-002389, Schritte 2 und 3) -----------------------------------

describe('Karteikarte: Dateikopf zeilenweise schreiben (4T-002389)', () => {
  const FREMD = [
    '---',
    'tags: [a, b]',
    'Name: Ada',
    'notiz: |',
    '  erste Zeile',
    '',
    '  zweite Zeile',
    'liste:',
    '- eins',
    '- zwei',
    '# Kommentar',
    'ort: London',
    '---',
    '',
    'Freier Text. ![[bild.png]]',
    '',
  ].join('\n');

  it('ersetzt allein die Zeile der Angabe; Fluss-Liste, mehrzeiliger Wert und Text bleiben zeichengleich', () => {
    const neu = ersetzeDateikopfAngaben(FREMD, [{ name: 'ort', schreibweise: 'Ockham' }]);
    expect(neu).toEqual({ ok: true, text: FREMD.replace('ort: London', 'ort: Ockham') });
  });

  it('sucht den Schlüssel ohne Rücksicht auf die Schreibung und behält dessen Schreibung', () => {
    const neu = ersetzeDateikopfAngaben(FREMD, [{ name: 'name', schreibweise: 'Augusta' }]);
    expect(neu.text).toBe(FREMD.replace('Name: Ada', 'Name: Augusta'));
  });

  it('ersetzt eine Angabe auf mehreren Zeilen vollständig, samt Leerzeile darin', () => {
    const notiz = ersetzeDateikopfAngaben(FREMD, [{ name: 'notiz', schreibweise: 'kurz' }]);
    expect(notiz.text).toBe(
      FREMD.replace('notiz: |\n  erste Zeile\n\n  zweite Zeile', 'notiz: kurz'),
    );
    const liste = ersetzeDateikopfAngaben(FREMD, [{ name: 'liste', schreibweise: '[drei]' }]);
    expect(liste.text).toBe(FREMD.replace('liste:\n- eins\n- zwei', 'liste: [drei]'));
  });

  it('fügt eine fehlende Angabe vor dem schließenden Zaun an und hält CRLF', () => {
    const crlf = '---\r\nname: Ada\r\n---\r\nText\r\n';
    expect(ersetzeDateikopfAngaben(crlf, [{ name: 'ort', schreibweise: 'Rom' }]).text).toBe(
      '---\r\nname: Ada\r\nort: Rom\r\n---\r\nText\r\n',
    );
    expect(ersetzeDateikopfAngaben('---\n---\nText', [{ name: 'a', schreibweise: '1' }]).text).toBe(
      '---\na: 1\n---\nText',
    );
    expect(ersetzeDateikopfAngaben('Nur Text', [{ name: 'a', schreibweise: '1' }]).text).toBe(
      '---\na: 1\n---\nNur Text',
    );
  });

  it('weist einen unlesbaren Dateikopf ab, statt ihn zu überschreiben', () => {
    expect(ersetzeDateikopfAngaben('---\na: [\n---\n', [{ name: 'a', schreibweise: '1' }])).toEqual(
      { ok: false, code: KARTEIKARTE_SCHREIBEN_CODES.dateikopfUnlesbar },
    );
  });

  it('schreibt Werte so, dass sie sich als derselbe Zell-Text lesen', () => {
    for (const [type, text] of [
      ['string', 'Grace Hopper'],
      ['string', 'a: b'],
      ['string', '#x'],
      ['string', 'true'],
      ['string', ' Rand '],
      ['string', 'zwei\nZeilen'],
      ['number', '42'],
      ['date', '2026-10-25'],
      ['boolean', 'x'],
      ['boolean', ''],
    ]) {
      const schreibweise = wertSchreibweise(type, text);
      const zeile = schreibweise === '' ? 'k:' : `k: ${schreibweise}`;
      const gelesen = extractFrontmatter(`---\n${zeile}\n---\n`).data.k;
      expect(zellTextAusDateikopf(type, gelesen), `${type} ${text}`).toBe(text);
    }
    expect(wertSchreibweise('string', 'Grace Hopper')).toBe('Grace Hopper');
    expect(wertSchreibweise('string', 'a: b')).toBe('"a: b"');
    expect(wertSchreibweise('boolean', 'X')).toBe('true');
  });

  it('legt eine neue Karteikarte mit Kennung und allen Feldern an und nimmt ein Dokument auf', () => {
    const felder = [{ name: 'name' }, { name: 'ort' }, { name: 'aktiv', type: 'boolean' }];
    const neu = schreibeKarteikarte({ text: null }, felder, [
      { art: 'create', id: 'r-00003', zellen: ['Grace Hopper'] },
    ]);
    expect(neu.text).toBe('---\ndb-record: r-00003\nname: Grace Hopper\nort:\naktiv:\n---\n');
    const dokument = '---\nname: Notiz\ntags: [x]\n---\nText\n';
    const aufgenommen = schreibeKarteikarte({ text: dokument }, felder, [
      { art: 'create', id: 'r-00004', zellen: ['Notiz'] },
    ]);
    expect(aufgenommen.text).toBe('---\nname: Notiz\ntags: [x]\ndb-record: r-00004\n---\nText\n');
    expect(
      schreibeKarteikarte({ text: dokument }, felder, [{ art: 'delete', id: 'r-1', zellen: [] }]),
    ).toEqual({ ok: false, code: KARTEIKARTE_SCHREIBEN_CODES.operationUnbekannt });
  });
});
