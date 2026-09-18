// 4T-001508 (Epic 3E-000250, E5.1 bis E5.3): Unit-Tests der Identität eines
// Datensatzes — Kennungs-Form, Hochwasserstand in der Definition, fachlicher
// Schlüssel und Anzeige-Form.
//
// Die Kennungs-Regeln laufen direkt gegen ihr Modul, die Angaben des Behälters
// durch den Definitions-Parser hindurch, weil dort ihre Wirkung entsteht.
import { describe, it, expect } from 'vitest';
import {
  RECORD_ID_PREFIX,
  RECORD_ID_MIN_DIGITS,
  kennungFuer,
  nummerAus,
  naechsteKennung,
  anzeigeSpalte,
} from '../../src/shared/database/record-identity.js';
import {
  DB_TABLE_KEY,
  DB_FIELDS_KEY,
  parseTableDefinition,
} from '../../src/shared/database/table-definition.js';

// Ein Tabellen-Frontmatter mit Angaben auf der oberen Ebene des Behälters.
function tabelle(behaelter) {
  return { [DB_TABLE_KEY]: behaelter };
}

// Die Felder der Beispiel-Tabelle: ein Text, ein Datensatz-Verweis, eine Zahl.
const FELDER = [
  { name: 'kuerzel', type: 'string' },
  { name: 'artikel', type: 'record', options: { table: 'Artikel' } },
  { name: 'menge', type: 'number' },
];

function lies(behaelter) {
  return parseTableDefinition(tabelle({ [DB_FIELDS_KEY]: FELDER, ...behaelter }));
}

describe('Datensatz-Kennung: die Form (AK2)', () => {
  it('trägt das für alle Tabellen gleiche Kennzeichen', () => {
    // Entscheidung des Product Owners vom 2026-09-06: ein einheitliches
    // Kennzeichen statt einer Ableitung aus dem Tabellen-Namen. Die Ableitung
    // bräche die Zusage aus E3, dass Umbenennen folgenlos bleibt.
    expect(RECORD_ID_PREFIX).toBe('r-');
    expect(kennungFuer(42)).toBe('r-00042');
  });

  it('hält die Mindest-Breite ein', () => {
    expect(RECORD_ID_MIN_DIGITS).toBe(5);
    expect(kennungFuer(1)).toBe('r-00001');
    expect(kennungFuer(99999)).toBe('r-99999');
  });

  it('überschreitet die Mindest-Breite ohne Formatbruch', () => {
    // Die Breite ist eine Mindest-Breite ohne Obergrenze: Die
    // hunderttausendste Zeile einer Tabelle darf keine Formatentscheidung
    // erzwingen.
    expect(kennungFuer(100000)).toBe('r-100000');
    expect(kennungFuer(1234567)).toBe('r-1234567');
    expect(nummerAus('r-1234567')).toBe(1234567);
  });

  it('liest beide Schreibweisen und erfindet keine Kennung', () => {
    expect(nummerAus('r-00042')).toBe(42);
    expect(nummerAus(' r-42 ')).toBe(42);
    expect(nummerAus('p-00042')).toBeNull();
    expect(nummerAus('r-')).toBeNull();
    expect(nummerAus('r-abc')).toBeNull();
    expect(nummerAus(42)).toBeNull();
    for (const ungueltig of [0, -1, 1.5, '7', null]) {
      expect(kennungFuer(ungueltig), String(ungueltig)).toBeNull();
    }
  });
});

describe('Datensatz-Kennung: der Hochwasserstand (AK1, AK3)', () => {
  it('steht in der Definition und wird ohne die Datensätze gelesen', () => {
    // Der Parser bekommt allein den Metadaten-Block; die Datensätze der Datei
    // sieht er nie. Genau das ist der Grund für E5.1: Wer die nächste Kennung
    // aus dem Bestand ableitet, muss alle Segmente lesen.
    const { lastId } = lies({ lastId: 42 });
    expect(lastId).toBe(42);
  });

  it('wird auch ohne Felder gelesen', () => {
    // Eine Tabelle, deren Definition noch keine Spalte kennt, kann bereits
    // Kennungen vergeben haben; ein übersehener Stand wäre die
    // Wiederverwendung, die E5.1 ausschließt.
    expect(parseTableDefinition(tabelle({ lastId: 7 })).lastId).toBe(7);
  });

  it('fehlt in einer frisch angelegten Tabelle und ist kein Fehler', () => {
    const { lastId, hints } = lies({});
    expect(lastId).toBeUndefined();
    expect(hints).toEqual([]);
  });

  it('ein unbrauchbarer Stand entfällt und wird benannt', () => {
    for (const roh of [-1, 2.5, '42', true]) {
      const { lastId, hints } = lies({ lastId: roh });
      expect(lastId, String(roh)).toBeUndefined();
      expect(hints, String(roh)).toEqual([
        {
          code: 'lastId',
          index: -1,
          name: null,
          key: 'lastId',
          expected: 'non-negative-integer',
        },
      ]);
    }
  });

  it('zieht die nächste Kennung und hebt den Stand', () => {
    expect(naechsteKennung(41)).toEqual({ kennung: 'r-00042', nummer: 42, hochwasserstand: 42 });
    expect(naechsteKennung(0)).toEqual({ kennung: 'r-00001', nummer: 1, hochwasserstand: 1 });
    expect(naechsteKennung(null)).toEqual({ kennung: 'r-00001', nummer: 1, hochwasserstand: 1 });
  });

  it('eine abgebrochene Neuanlage hinterlässt eine Lücke, keine Wiederverwendung', () => {
    // Gezogen wird beim ERÖFFNEN einer Neuanlage. Wird sie abgebrochen, bleibt
    // die Nummer vergeben — gewollt, und dasselbe Verhalten wie die Sequenzen
    // etablierter Datenbanksysteme.
    const ersteAnlage = naechsteKennung(41); // eröffnet r-00042
    const abgebrochen = ersteAnlage.hochwasserstand; // der Stand bleibt stehen
    const zweiteAnlage = naechsteKennung(abgebrochen);
    expect(zweiteAnlage.kennung).toBe('r-00043');
    expect(zweiteAnlage.kennung).not.toBe(ersteAnlage.kennung);
  });

  it('vergibt bei wiederholtem Ziehen nie zweimal dieselbe Kennung', () => {
    let stand = 0;
    const vergeben = [];
    for (let i = 0; i < 5; i += 1) {
      const gezogen = naechsteKennung(stand);
      vergeben.push(gezogen.kennung);
      stand = gezogen.hochwasserstand;
    }
    expect(vergeben).toEqual(['r-00001', 'r-00002', 'r-00003', 'r-00004', 'r-00005']);
    expect(new Set(vergeben).size).toBe(vergeben.length);
  });
});

describe('Fachlicher Schlüssel (AK4, AK6)', () => {
  it('ist optional, und eine Tabelle ohne ihn ist zulässig', () => {
    // Eine Bewegungs- oder Messwert-Tabelle hat keinen sinnvollen
    // menschenlesbaren Schlüssel; ein erzwungener wäre eine Pflichtangabe ohne
    // Gegenwert. Die Folge ist benannt: Auf sie führt kein handgeschriebener
    // Verweis, die Anwendung verweist über die Kennung.
    const { key, hints } = lies({});
    expect(key).toBeUndefined();
    expect(hints).toEqual([]);
    expect(anzeigeSpalte({})).toBeNull();
  });

  it('nimmt den einteiligen Schlüssel auch ohne Liste', () => {
    expect(lies({ key: 'kuerzel' }).key).toEqual(['kuerzel']);
    expect(lies({ key: ['kuerzel'] }).key).toEqual(['kuerzel']);
  });

  it('nimmt den mehrteiligen Schlüssel', () => {
    const { key, hints } = lies({ key: ['artikel', 'menge'] });
    expect(hints).toEqual([]);
    expect(key).toEqual(['artikel', 'menge']);
  });

  it('ein Schlüssel-Teil darf ein Datensatz-Verweis sein', () => {
    // Prüfstein Medien-Ausleihe: Die Zwischentabelle hat einen Schlüssel aus
    // zwei Verweisen. Ein Schlüssel-Teil ist ein Feld-Name; welchen Typ das
    // Feld trägt, spielt keine Rolle.
    const { fields, key, hints } = lies({ key: 'artikel' });
    expect(hints).toEqual([]);
    expect(key).toEqual(['artikel']);
    expect(fields.find((f) => f.name === 'artikel').type).toBe('record');
  });

  it('ein Teil, den keine Definition kennt, setzt den ganzen Schlüssel aus', () => {
    // Ein halber Schlüssel ist kein Schlüssel, sondern eine falsche
    // Eindeutigkeits-Zusage.
    const { key, hints } = lies({ key: ['kuerzel', 'gibtEsNicht'] });
    expect(key).toBeUndefined();
    expect(hints).toEqual([
      {
        code: 'keyUnknown',
        index: -1,
        name: null,
        key: 'key',
        expected: ['kuerzel', 'artikel', 'menge'],
      },
    ]);
  });

  it('eine unbrauchbare Angabe nennt die erwartete Form, nicht die Feld-Namen', () => {
    const { key, hints } = lies({ key: [7] });
    expect(key).toBeUndefined();
    expect(hints[0]).toEqual({
      code: 'key',
      index: -1,
      name: null,
      key: 'key',
      expected: 'field-name-or-list',
    });
  });
});

describe('Anzeige-Form (AK5)', () => {
  it('ist angebbar und nennt ein Feld', () => {
    const { display, hints } = lies({ key: ['artikel', 'menge'], display: 'kuerzel' });
    expect(hints).toEqual([]);
    expect(display).toBe('kuerzel');
    expect(anzeigeSpalte({ key: ['artikel', 'menge'], display: 'kuerzel' })).toBe('kuerzel');
  });

  it('fällt bei einteiligem Schlüssel mit ihm zusammen', () => {
    // Eine eigene Angabe wäre dann Zeremonie ohne Gegenwert.
    const gelesen = lies({ key: 'kuerzel' });
    expect(gelesen.display).toBeUndefined();
    expect(anzeigeSpalte(gelesen)).toBe('kuerzel');
  });

  it('bleibt bei mehrteiligem Schlüssel ohne Angabe leer', () => {
    // Das Verhalten ist benannt: Die Anwendung benennt den Datensatz dann über
    // seine interne Kennung, statt eine leere Zeile zu zeigen.
    const gelesen = lies({ key: ['artikel', 'menge'] });
    expect(anzeigeSpalte(gelesen)).toBeNull();
  });

  it('die ausdrückliche Angabe geht dem einteiligen Schlüssel vor', () => {
    expect(anzeigeSpalte({ key: ['kuerzel'], display: 'menge' })).toBe('menge');
  });

  it('eine Anzeige-Form, die kein Feld nennt, entfällt und wird benannt', () => {
    const { display, hints } = lies({ display: 'gibtEsNicht' });
    expect(display).toBeUndefined();
    expect(hints).toEqual([
      {
        code: 'displayUnknown',
        index: -1,
        name: null,
        key: 'display',
        expected: ['kuerzel', 'artikel', 'menge'],
      },
    ]);
  });
});
