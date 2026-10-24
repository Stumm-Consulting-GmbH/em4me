// 4T-002253 (Epic 3E-000262, F5 A, S6; Vorab-Festlegung 1): Die Bedingung
// entlang der Beziehung als Text-Ergänzung einer Abfrage (`query-bedingung.js`).
//
// Geprüft wird jede Form, in der eine Abfrage-Datei ihre Abfrage schreiben kann:
// ohne `WHERE`, mit `WHERE`, mit Klauseln dahinter, mit einem Schlüsselwort in
// einem Text-Wert und in der Alt-Form; dazu, dass jedes Ergebnis den Parser
// besteht und die Bedingung als `AND` an der obersten Ebene wirkt.
import { describe, it, expect } from 'vitest';

import { ergaenzeBedingung } from '../../src/shared/query/query-bedingung.js';
import { parseQuery } from '../../src/shared/query/perspective-query.js';

const B = 'book = "r-00001"';

describe('ergaenzeBedingung (4T-002253)', () => {
  it('ohne WHERE: die Bedingung kommt ans Ende', () => {
    const q = 'TABLE RECORDS borrower, lent FROM "Loans"';
    expect(ergaenzeBedingung(q, 'book', 'r-00001')).toBe(`${q} WHERE ${B}`);
  });

  it('ohne WHERE mit SORT und LIMIT: die Bedingung kommt davor', () => {
    const q = 'TABLE RECORDS borrower FROM "Loans" SORT lent DESC LIMIT 5';
    expect(ergaenzeBedingung(q, 'book', 'r-00001')).toBe(
      `TABLE RECORDS borrower FROM "Loans" WHERE ${B} SORT lent DESC LIMIT 5`,
    );
  });

  it('mit WHERE: die vorhandene Bedingung wird geklammert und mit AND ergänzt', () => {
    const q = 'TABLE RECORDS borrower FROM "Loans" WHERE borrower = "Clara" OR lent > 1';
    const ergebnis = ergaenzeBedingung(q, 'book', 'r-00001');
    expect(ergebnis).toBe(
      `TABLE RECORDS borrower FROM "Loans" WHERE (borrower = "Clara" OR lent > 1) AND ${B}`,
    );
    const where = parseQuery(ergebnis).ast.where;
    expect(where.type).toBe('and');
  });

  it('mit WHERE und Klauseln dahinter, auch klein geschrieben', () => {
    const q = 'table records borrower from "Loans" where lent > 1 sort lent limit 3';
    expect(ergaenzeBedingung(q, 'book', 'r-00002')).toBe(
      'table records borrower from "Loans" where (lent > 1) AND book = "r-00002" sort lent limit 3',
    );
  });

  it('ein Schlüsselwort in Anführungszeichen oder Klammern ist keine Grenze', () => {
    const q =
      'TABLE RECORDS borrower FROM "Loans" WHERE borrower = "x SORT y" AND (lent > 1) SORT lent';
    expect(ergaenzeBedingung(q, 'book', 'r-00001')).toBe(
      `TABLE RECORDS borrower FROM "Loans" WHERE (borrower = "x SORT y" AND (lent > 1)) AND ${B} SORT lent`,
    );
  });

  it('die Alt-Form wird als Ganzes geklammert', () => {
    expect(ergaenzeBedingung('status = "offen"', 'book', 'r-00001')).toBe(
      `(status = "offen") AND ${B}`,
    );
  });

  it('jedes Ergebnis besteht den Parser; Unbrauchbares ergibt null', () => {
    for (const q of [
      'TABLE RECORDS a FROM "Loans"',
      'TABLE RECORDS a FROM "Loans" WHERE a = 1 DISPLAY tree BY a',
      'LIST RECORDS FROM "Loans" GROUP BY a',
    ]) {
      const ergebnis = ergaenzeBedingung(q, 'book', 'r-00001');
      expect(ergebnis, q).not.toBeNull();
      expect(parseQuery(ergebnis).ok, ergebnis).toBe(true);
    }
    expect(ergaenzeBedingung('TABLE RECORDS a FROM "Loans" WHERE (', 'book', 'r-1')).toBeNull();
    expect(ergaenzeBedingung('TABLE RECORDS a FROM "Loans"', 'bo ok', 'r-1')).toBeNull();
    expect(ergaenzeBedingung('TABLE RECORDS a FROM "Loans"', 'book', 'r"1')).toBeNull();
    expect(ergaenzeBedingung('', 'book', 'r-1')).toBeNull();
  });
});
