// 4T-002642 (Epic 3E-000397): Unit-Tests des Kerns des Navigations-Verlaufs
// (src/shared/navigations-verlauf.js).
//
// **Was zugesichert wird.** Ein Besuch nach «Zurück» schneidet den Vorwärts-Teil
// ab; nahe Stellen desselben Dokuments (weniger als zehn Zeilen) werden
// zusammengefasst; «Zurück» und «Vor» halten an beiden Enden an; über hundert
// Einträgen fällt der älteste heraus, der Zeiger bleibt auf seinem Eintrag;
// Entfernen hält den Zeiger und legt entstehende Doppel zusammen; Umbenennen
// zieht Schlüssel und Pfad nach. Keine Funktion verändert ihre Eingaben.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  erzeugeNavigationsVerlauf,
  MAX_EINTRAEGE,
  NAH_ZEILEN,
} = require('../../src/shared/navigations-verlauf.js');

function ort(schluessel, zeileOben, pfad = `/b/${schluessel}.md`) {
  return {
    schluessel,
    pfad,
    stelle: zeileOben === null ? null : { zeileOben, schreibmarke: null },
  };
}

function schluessel(verlauf) {
  // Liest die Einträge über «Zurück» bis zum Anfang und stellt den Zeiger wieder her.
  const liste = [];
  let schritte = 0;
  while (verlauf.kannZurueck()) {
    verlauf.zurueck();
    schritte += 1;
  }
  liste.push(verlauf.aktueller().schluessel);
  while (verlauf.kannVor()) liste.push(verlauf.vor().schluessel);
  const ruecklauf = liste.length - 1 - schritte;
  for (let i = 0; i < ruecklauf; i += 1) verlauf.zurueck();
  return liste;
}

describe('Konstanten', () => {
  it('Vorgaben sind hundert Einträge und zehn Zeilen', () => {
    expect(MAX_EINTRAEGE).toBe(100);
    expect(NAH_ZEILEN).toBe(10);
  });
});

describe('Besuchen, Zurück und Vor', () => {
  it('ein leerer Verlauf kann weder zurück noch vor', () => {
    const v = erzeugeNavigationsVerlauf();
    expect(v.laenge()).toBe(0);
    expect(v.aktueller()).toBeNull();
    expect(v.kannZurueck()).toBe(false);
    expect(v.kannVor()).toBe(false);
    expect(v.zurueck()).toBeNull();
    expect(v.vor()).toBeNull();
  });

  it('Zurück und Vor bewegen den Zeiger und halten an beiden Enden an', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', 1));
    expect(v.kannZurueck()).toBe(false);
    v.besuche(ort('b', 1));
    v.besuche(ort('c', 1));
    expect(v.kannZurueck()).toBe(true);
    expect(v.kannVor()).toBe(false);
    expect(v.vor()).toBeNull();
    expect(v.aktueller().schluessel).toBe('c');
    expect(v.zurueck().schluessel).toBe('b');
    expect(v.zurueck().schluessel).toBe('a');
    expect(v.kannZurueck()).toBe(false);
    expect(v.zurueck()).toBeNull();
    expect(v.aktueller().schluessel).toBe('a');
    expect(v.kannVor()).toBe(true);
    expect(v.vor().schluessel).toBe('b');
    expect(v.vor().schluessel).toBe('c');
    expect(v.kannVor()).toBe(false);
  });

  it('ein Besuch nach Zurück schneidet den Vorwärts-Teil ab', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', 1));
    v.besuche(ort('b', 1));
    v.besuche(ort('c', 1));
    v.zurueck();
    v.zurueck();
    v.besuche(ort('d', 1));
    expect(v.kannVor()).toBe(false);
    expect(schluessel(v)).toEqual(['a', 'd']);
  });

  it('nahe Stellen desselben Dokuments werden zusammengefasst, die Grenze liegt bei zehn Zeilen', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', 100));
    v.besuche(ort('a', 109));
    expect(v.laenge()).toBe(1);
    expect(v.aktueller().stelle.zeileOben).toBe(109);
    v.besuche(ort('a', 100));
    expect(v.laenge()).toBe(1);
    v.besuche(ort('a', 110));
    expect(v.laenge()).toBe(2);
    v.besuche(ort('a', 100));
    expect(v.laenge()).toBe(3);
  });

  it('gleiche Stelle in einem anderen Dokument ist nicht nah', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', 5));
    v.besuche(ort('b', 5));
    expect(v.laenge()).toBe(2);
  });

  it('ohne Stelle ist nur nah, was auf beiden Seiten keine Stelle hat', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', null));
    v.besuche(ort('a', null));
    expect(v.laenge()).toBe(1);
    v.besuche(ort('a', 3));
    expect(v.laenge()).toBe(2);
    v.besuche(ort('a', null));
    expect(v.laenge()).toBe(3);
  });

  it('der Abstand nah ist wählbar', () => {
    const v = erzeugeNavigationsVerlauf({ nah: 3 });
    v.besuche(ort('a', 10));
    v.besuche(ort('a', 12));
    expect(v.laenge()).toBe(1);
    v.besuche(ort('a', 15));
    expect(v.laenge()).toBe(2);
  });

  it('aktualisiereAktuellen setzt die Stelle ohne Abschneiden', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', 1));
    v.besuche(ort('b', 1));
    v.zurueck();
    v.aktualisiereAktuellen({ zeileOben: 120, schreibmarke: { zeile: 121, spalte: 4 } });
    expect(v.aktueller()).toEqual({
      schluessel: 'a',
      pfad: '/b/a.md',
      stelle: { zeileOben: 120, schreibmarke: { zeile: 121, spalte: 4 } },
    });
    expect(v.kannVor()).toBe(true);
    expect(v.vor().schluessel).toBe('b');
  });

  it('aktualisiereAktuellen auf leerem Verlauf tut nichts', () => {
    const v = erzeugeNavigationsVerlauf();
    v.aktualisiereAktuellen({ zeileOben: 3 });
    expect(v.laenge()).toBe(0);
  });
});

describe('Verdrängung', () => {
  it('über hundert Einträgen fällt der älteste heraus', () => {
    const v = erzeugeNavigationsVerlauf();
    for (let i = 0; i < 105; i += 1) v.besuche(ort(`d${i}`, 1));
    expect(v.laenge()).toBe(100);
    expect(v.aktueller().schluessel).toBe('d104');
    let schritte = 0;
    while (v.zurueck()) schritte += 1;
    expect(schritte).toBe(99);
    expect(v.aktueller().schluessel).toBe('d5');
  });

  it('der Zeiger bleibt nach der Verdrängung auf demselben Eintrag', () => {
    const v = erzeugeNavigationsVerlauf({ max: 3 });
    v.besuche(ort('a', 1));
    v.besuche(ort('b', 1));
    v.besuche(ort('c', 1));
    v.besuche(ort('d', 1));
    expect(v.aktueller().schluessel).toBe('d');
    expect(schluessel(v)).toEqual(['b', 'c', 'd']);
    expect(v.aktueller().schluessel).toBe('d');
  });
});

describe('entferneWo', () => {
  function verlaufAus(liste, zurueckSchritte = 0) {
    const v = erzeugeNavigationsVerlauf();
    for (const s of liste) v.besuche(ort(s, 1));
    for (let i = 0; i < zurueckSchritte; i += 1) v.zurueck();
    return v;
  }

  it('der Zeiger bleibt auf seinem Eintrag, wenn ein anderer entfernt wird', () => {
    const v = verlaufAus(['a', 'b', 'c', 'd'], 1);
    expect(v.entferneWo((e) => e.schluessel === 'b')).toBe(1);
    expect(v.aktueller().schluessel).toBe('c');
    expect(schluessel(v)).toEqual(['a', 'c', 'd']);
  });

  it('wird der aktuelle Eintrag entfernt, gilt der nächstfrühere', () => {
    const v = verlaufAus(['a', 'b', 'c', 'd'], 1);
    expect(v.entferneWo((e) => e.schluessel === 'c')).toBe(1);
    expect(v.aktueller().schluessel).toBe('b');
    expect(v.kannVor()).toBe(true);
  });

  it('ohne früheren verbliebenen Eintrag gilt der erste', () => {
    const v = verlaufAus(['a', 'b', 'c'], 2);
    expect(v.entferneWo((e) => e.schluessel === 'a')).toBe(1);
    expect(v.aktueller().schluessel).toBe('b');
    expect(v.kannZurueck()).toBe(false);
  });

  it('der letzte Eintrag als aktueller wird entfernt', () => {
    const v = verlaufAus(['a', 'b', 'c']);
    v.entferneWo((e) => e.schluessel === 'c');
    expect(v.aktueller().schluessel).toBe('b');
    expect(v.kannVor()).toBe(false);
  });

  it('alles entfernt hinterlässt einen leeren Verlauf', () => {
    const v = verlaufAus(['a', 'b']);
    expect(v.entferneWo(() => true)).toBe(2);
    expect(v.laenge()).toBe(0);
    expect(v.aktueller()).toBeNull();
    expect(v.kannZurueck()).toBe(false);
    expect(v.kannVor()).toBe(false);
  });

  it('nichts entfernt lässt alles unverändert', () => {
    const v = verlaufAus(['a', 'b', 'c'], 1);
    expect(v.entferneWo(() => false)).toBe(0);
    expect(v.aktueller().schluessel).toBe('b');
    expect(schluessel(v)).toEqual(['a', 'b', 'c']);
  });

  it('entstehende Doppel werden zusammengelegt und mitgezählt', () => {
    const v = verlaufAus(['a', 'x', 'a', 'b']);
    expect(v.entferneWo((e) => e.schluessel === 'x')).toBe(2);
    expect(schluessel(v)).toEqual(['a', 'b']);
    expect(v.aktueller().schluessel).toBe('b');
  });

  it('nach dem Zusammenlegen folgt der Zeiger seinem Eintrag', () => {
    const v = verlaufAus(['a', 'x', 'a', 'b'], 1);
    expect(v.aktueller().schluessel).toBe('a');
    v.entferneWo((e) => e.schluessel === 'x');
    expect(v.aktueller().schluessel).toBe('a');
    expect(v.kannZurueck()).toBe(false);
    expect(v.vor().schluessel).toBe('b');
  });

  it('ein Prädikat, das keine Funktion ist, entfernt nichts', () => {
    const v = verlaufAus(['a', 'b']);
    expect(v.entferneWo(null)).toBe(0);
    expect(v.laenge()).toBe(2);
  });

  it('das Prädikat bekommt eine Kopie', () => {
    const v = verlaufAus(['a', 'b']);
    v.entferneWo((e) => {
      e.schluessel = 'verändert';
      return false;
    });
    expect(schluessel(v)).toEqual(['a', 'b']);
  });
});

describe('benenneUm', () => {
  it('zieht Schlüssel und Pfad aller Einträge des Dokuments nach', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', 1));
    v.besuche(ort('b', 1));
    v.besuche(ort('a', 50));
    v.benenneUm('a', 'n', '/b/neu.md');
    expect(schluessel(v)).toEqual(['n', 'b', 'n']);
    expect(v.aktueller()).toEqual({
      schluessel: 'n',
      pfad: '/b/neu.md',
      stelle: { zeileOben: 50, schreibmarke: null },
    });
  });

  it('ungültige Schlüssel ändern nichts', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', 1));
    v.benenneUm('', 'n', '/x.md');
    v.benenneUm('a', '', '/x.md');
    expect(v.aktueller().schluessel).toBe('a');
  });
});

describe('Ungültige Eingaben und Einträge ohne Pfad', () => {
  it('ein Eintrag ohne gültigen Schlüssel wird nicht besucht', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(null);
    v.besuche({ pfad: '/a.md', stelle: null });
    v.besuche({ schluessel: '', pfad: '/a.md', stelle: null });
    v.besuche({ schluessel: 7, pfad: '/a.md', stelle: null });
    expect(v.laenge()).toBe(0);
  });

  it('ein Besuch mit ungültigem Schlüssel schneidet den Vorwärts-Teil nicht ab', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche(ort('a', 1));
    v.besuche(ort('b', 1));
    v.zurueck();
    v.besuche({ schluessel: '' });
    expect(v.kannVor()).toBe(true);
  });

  it('eine ungültige Stelle wird null, der Eintrag gilt trotzdem', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche({ schluessel: 'a', pfad: '/a.md', stelle: { zeileOben: 0 } });
    expect(v.aktueller()).toEqual({ schluessel: 'a', pfad: '/a.md', stelle: null });
  });

  it('ein Eintrag ohne Pfad gilt mit pfad null', () => {
    const v = erzeugeNavigationsVerlauf();
    v.besuche({ schluessel: 'seite:hilfe', stelle: { zeileOben: 4 } });
    v.besuche({ schluessel: 'seite:start', pfad: 42, stelle: null });
    expect(v.aktueller()).toEqual({ schluessel: 'seite:start', pfad: null, stelle: null });
    expect(v.zurueck()).toEqual({
      schluessel: 'seite:hilfe',
      pfad: null,
      stelle: { zeileOben: 4, schreibmarke: null },
    });
  });

  it('ungültige Optionen fallen auf die Vorgaben zurück', () => {
    const v = erzeugeNavigationsVerlauf({ max: 0, nah: -1 });
    for (let i = 0; i < 101; i += 1) v.besuche(ort(`d${i}`, 1));
    expect(v.laenge()).toBe(100);
  });

  // Review 3E-000397: ohne Verdrängung über die Höchstzahl, damit ein
  // zusätzlicher Eintrag sichtbar wird. Mit `nah: -1` ungeprüft würde kein
  // Besuch je zusammengefasst; mit der Vorgabe zehn fasst der zweite zusammen.
  it('ein ungültiges nah fällt auf zehn Zeilen zurück', () => {
    for (const nah of [-1, 1.5, 'drei', null]) {
      const v = erzeugeNavigationsVerlauf({ nah });
      v.besuche(ort('d', 1));
      v.besuche(ort('d', 5));
      expect(v.laenge()).toBe(1);
      expect(v.aktueller().stelle.zeileOben).toBe(5);
      v.besuche(ort('d', 15));
      expect(v.laenge()).toBe(2);
    }
  });
});

describe('Keine Veränderung der Eingaben, Kopien nach außen', () => {
  it('besuche und aktualisiereAktuellen verändern ihre Eingaben nicht', () => {
    const eintrag = Object.freeze({
      schluessel: 'a',
      pfad: '/a.md',
      stelle: Object.freeze({ zeileOben: 3, schreibmarke: Object.freeze({ zeile: 4, spalte: 1 }) }),
    });
    const v = erzeugeNavigationsVerlauf();
    expect(() => v.besuche(eintrag)).not.toThrow();
    const stelle = Object.freeze({ zeileOben: 9, schreibmarke: null });
    expect(() => v.aktualisiereAktuellen(stelle)).not.toThrow();
    expect(eintrag.stelle.zeileOben).toBe(3);
  });

  it('Änderungen an einer gelieferten Kopie wirken nicht auf den Verlauf', () => {
    const v = erzeugeNavigationsVerlauf();
    const roh = {
      schluessel: 'a',
      pfad: '/a.md',
      stelle: { zeileOben: 3, schreibmarke: { zeile: 3, spalte: 0 } },
    };
    v.besuche(roh);
    roh.stelle.zeileOben = 99;
    const kopie = v.aktueller();
    kopie.stelle.schreibmarke.zeile = 77;
    kopie.schluessel = 'x';
    expect(v.aktueller()).toEqual({
      schluessel: 'a',
      pfad: '/a.md',
      stelle: { zeileOben: 3, schreibmarke: { zeile: 3, spalte: 0 } },
    });
  });
});
