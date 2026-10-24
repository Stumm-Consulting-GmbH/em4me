// 4T-002248 (Epic 3E-000262, F1 A, S1; AK1, AK2): Unit-Tests der Angaben der
// Listen-Maske im Behälter der Abfrage-Datei — `editable`, `form` und `allow`,
// der Standard «allein update», die gewöhnliche Abfrage-Datei ohne Angabe und
// je ein Fall für jede unbrauchbare Angabe.
//
// Die Fälle laufen einzeln durch (weiche Linie nach E22: eine unbrauchbare
// Angabe entfällt mit Hinweis und benannter Folge, die Datei bleibt lesbar).
import { describe, it, expect } from 'vitest';
import {
  LIST_ANGABEN,
  LIST_HANDGRIFFE,
  LIST_STANDARD_HANDGRIFFE,
  parseListAngaben,
} from '../../src/shared/database/list-angaben.js';
import { DB_QUERY_KEY } from '../../src/shared/database/behaelter.js';
import { HINWEIS_META } from '../../src/shared/database/table-hinweise.js';

// Frontmatter-Objekt einer Abfrage-Datei mit dem übergebenen Behälter-Wert.
function abfrage(behaelter) {
  return { title: 'Ausleihen', [DB_QUERY_KEY]: behaelter };
}

// Die Hinweise in kurzer Form: Code, Schlüssel und benannter Gegenstand.
function kurz(ergebnis) {
  return ergebnis.hints.map((h) => [h.code, h.key, h.name]);
}

const GEWOEHNLICH = { istListe: false, editable: false, form: null, allow: [], hints: [] };

describe('Angaben der Listen-Maske: Wörter und Katalog (4T-002248)', () => {
  it('trägt die Wörter der Anweisungs-Arten und den Standard «allein update»', () => {
    expect(LIST_HANDGRIFFE).toEqual(['create', 'update', 'delete']);
    expect(LIST_STANDARD_HANDGRIFFE).toEqual(['update']);
    expect(LIST_ANGABEN).toEqual(['editable', 'form', 'allow']);
  });

  it('führt jeden Code im Hinweis-Katalog mit dem Schlüssel seiner Angabe', () => {
    expect(HINWEIS_META.listEditable).toEqual({ key: 'editable', expected: 'boolean' });
    expect(HINWEIS_META.listForm).toEqual({ key: 'form', expected: 'form-file-name' });
    expect(HINWEIS_META.listAllow).toEqual({ key: 'allow', expected: 'list-of-operations' });
    expect(HINWEIS_META.listAllowUnbekannt).toMatchObject({ key: 'allow' });
    expect(HINWEIS_META.listOhneEditable).toMatchObject({ key: 'editable' });
    expect(HINWEIS_META.listAngabeUnbekannt).toBeDefined();
    expect(HINWEIS_META.listFormDateiUnbekannt).toMatchObject({ key: 'form' });
  });
});

describe('Angaben der Listen-Maske: gewöhnliche Abfrage-Datei (4T-002248, AK1)', () => {
  it('liefert ohne Frontmatter-Objekt eine gewöhnliche Datei', () => {
    expect(parseListAngaben(null)).toEqual(GEWOEHNLICH);
    expect(parseListAngaben(['db-query'])).toEqual(GEWOEHNLICH);
  });

  it('liefert ohne Behälter db-query eine gewöhnliche Datei', () => {
    expect(parseListAngaben({ title: 'Notiz' })).toEqual(GEWOEHNLICH);
  });

  it('nimmt den Behälter ohne Wert als gültige Marke ohne Hinweis', () => {
    expect(parseListAngaben(abfrage(null))).toEqual(GEWOEHNLICH);
    expect(parseListAngaben(abfrage('Text'))).toEqual(GEWOEHNLICH);
    expect(parseListAngaben(abfrage(3))).toEqual(GEWOEHNLICH);
    expect(parseListAngaben(abfrage({}))).toEqual(GEWOEHNLICH);
  });

  it('bleibt mit editable: false eine gewöhnliche Datei', () => {
    expect(parseListAngaben(abfrage({ editable: false }))).toEqual(GEWOEHNLICH);
  });
});

describe('Angaben der Listen-Maske: Listen-Maske (4T-002248, AK1)', () => {
  it('macht die Datei mit editable: true zur Listen-Maske mit dem Standard update', () => {
    expect(parseListAngaben(abfrage({ editable: true }))).toEqual({
      istListe: true,
      editable: true,
      form: null,
      allow: ['update'],
      hints: [],
    });
  });

  it('liest form und allow wie im Beispiel des Plans', () => {
    const ergebnis = parseListAngaben(
      abfrage({ editable: true, form: ' Loans Form ', allow: ['create', 'update'] }),
    );
    expect(ergebnis).toEqual({
      istListe: true,
      editable: true,
      form: 'Loans Form',
      allow: ['create', 'update'],
      hints: [],
    });
  });

  it('trimmt und verkleinert die Handgriffe und lässt Dubletten entfallen', () => {
    const ergebnis = parseListAngaben(
      abfrage({ editable: true, allow: [' Delete', 'UPDATE', 'delete', 'update '] }),
    );
    expect(ergebnis.allow).toEqual(['delete', 'update']);
    expect(ergebnis.hints).toEqual([]);
  });

  it('nimmt einen einzelnen Text als Liste mit einem Eintrag', () => {
    expect(parseListAngaben(abfrage({ editable: true, allow: 'create' })).allow).toEqual([
      'create',
    ]);
  });

  it('lässt eine leere Liste leer: bearbeitbar, aber ohne Handgriff', () => {
    const ergebnis = parseListAngaben(abfrage({ editable: true, allow: [] }));
    expect(ergebnis.istListe).toBe(true);
    expect(ergebnis.allow).toEqual([]);
    expect(ergebnis.hints).toEqual([]);
  });
});

describe('Angaben der Listen-Maske: unbrauchbare Angaben (4T-002248, AK2)', () => {
  it('meldet editable anderen Typs und lässt false gelten', () => {
    const ergebnis = parseListAngaben(abfrage({ editable: 'ja' }));
    expect(ergebnis.istListe).toBe(false);
    expect(ergebnis.editable).toBe(false);
    expect(ergebnis.allow).toEqual([]);
    expect(ergebnis.hints).toEqual([
      { code: 'listEditable', index: -1, name: null, key: 'editable', expected: 'boolean' },
    ]);
  });

  it('meldet form anderen Typs oder leer und lässt die Standard-Maske gelten', () => {
    for (const roh of [3, '  ', null, ['Loans Form']]) {
      const ergebnis = parseListAngaben(abfrage({ editable: true, form: roh }));
      expect(ergebnis.form, String(roh)).toBeNull();
      expect(ergebnis.istListe).toBe(true);
      expect(kurz(ergebnis), String(roh)).toEqual([['listForm', 'form', null]]);
    }
  });

  it('meldet allow anderen Typs und lässt den Standard gelten', () => {
    const ergebnis = parseListAngaben(abfrage({ editable: true, allow: { create: true } }));
    expect(ergebnis.allow).toEqual(['update']);
    expect(ergebnis.hints).toEqual([
      { code: 'listAllow', index: -1, name: null, key: 'allow', expected: 'list-of-operations' },
    ]);
  });

  it('meldet einen unbekannten Handgriff, der entfällt, während die übrigen gelten', () => {
    const ergebnis = parseListAngaben(abfrage({ editable: true, allow: ['update', ' Archive '] }));
    expect(ergebnis.allow).toEqual(['update']);
    expect(ergebnis.hints).toEqual([
      {
        code: 'listAllowUnbekannt',
        index: -1,
        name: 'Archive',
        key: 'allow',
        expected: ['create', 'update', 'delete'],
      },
    ]);
  });

  it('meldet form und allow ohne editable: true, die dann entfallen', () => {
    const ohne = parseListAngaben(abfrage({ form: 'Loans Form', allow: ['create'] }));
    expect(ohne).toEqual({ ...GEWOEHNLICH, hints: ohne.hints });
    expect(kurz(ohne)).toEqual([['listOhneEditable', 'editable', null]]);
    const falsch = parseListAngaben(abfrage({ editable: false, allow: ['create'] }));
    expect(kurz(falsch)).toEqual([['listOhneEditable', 'editable', null]]);
    // Ein unbrauchbares editable meldet sich selbst; ein zweiter Hinweis entfällt.
    const defekt = parseListAngaben(abfrage({ editable: 'ja', form: 'Loans Form' }));
    expect(kurz(defekt)).toEqual([['listEditable', 'editable', null]]);
  });

  it('meldet eine unbekannte Angabe mit ihrem Schlüssel und übergeht sie', () => {
    const ergebnis = parseListAngaben(abfrage({ editable: true, table: 'Loans' }));
    expect(ergebnis.istListe).toBe(true);
    expect(ergebnis.allow).toEqual(['update']);
    expect(ergebnis.hints).toEqual([
      {
        code: 'listAngabeUnbekannt',
        index: -1,
        name: 'table',
        key: 'table',
        expected: ['editable', 'form', 'allow'],
      },
    ]);
  });
});
