// 4T-002641 (Epic 3E-000397): Unit-Tests des Kerns der Lese-Stelle
// (src/shared/lese-stelle.js).
//
// **Was zugesichert wird.** Eine gemerkte Stelle wird streng geprüft (jede
// ungültige Angabe verwirft die ganze Stelle), auf das Dokument begrenzt
// (Schreibmarke hinter dem Ende: Ende der letzten Zeile, Story AK4) und in einer
// Tabelle je Pfad geführt: gleicher Vergleichs-Schlüssel ersetzt, der älteste
// Eintrag fällt über der Grenze heraus, Umbenennen führt die Stelle weiter.
// Keine Funktion verändert ihre Eingaben.
//
// Plattform und Kern werden über denselben require-Zwischenspeicher geladen,
// damit die eingesetzte Plattform im Kern wirkt (Muster book-core.test.js).
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { setPlatformForTests } = require('../../src/shared/platform.js');
const {
  MAX_ZEILE,
  MAX_EINTRAEGE,
  normalisiereStelle,
  stelleFuerDokument,
  findeStelle,
  vermerkeStelle,
  benenneUm,
} = require('../../src/shared/lese-stelle.js');

afterEach(() => {
  setPlatformForTests(undefined);
});

function eingefroren(tabelle) {
  for (const wert of Object.values(tabelle)) {
    Object.freeze(wert);
    if (wert.schreibmarke) Object.freeze(wert.schreibmarke);
  }
  return Object.freeze(tabelle);
}

describe('Konstanten', () => {
  it('nennt die Grenzen', () => {
    expect(MAX_ZEILE).toBe(10_000_000);
    expect(MAX_EINTRAEGE).toBe(500);
  });
});

describe('normalisiereStelle', () => {
  it('übernimmt eine gültige Stelle mit Schreibmarke', () => {
    expect(normalisiereStelle({ zeileOben: 12, schreibmarke: { zeile: 14, spalte: 3 } })).toEqual({
      zeileOben: 12,
      schreibmarke: { zeile: 14, spalte: 3 },
    });
  });

  it('setzt eine fehlende, undefinierte oder leere Schreibmarke auf null', () => {
    expect(normalisiereStelle({ zeileOben: 1 })).toEqual({ zeileOben: 1, schreibmarke: null });
    expect(normalisiereStelle({ zeileOben: 1, schreibmarke: undefined })).toEqual({
      zeileOben: 1,
      schreibmarke: null,
    });
    expect(normalisiereStelle({ zeileOben: 1, schreibmarke: null })).toEqual({
      zeileOben: 1,
      schreibmarke: null,
    });
  });

  it('nimmt die Grenzwerte an', () => {
    expect(
      normalisiereStelle({
        zeileOben: MAX_ZEILE,
        schreibmarke: { zeile: MAX_ZEILE, spalte: MAX_ZEILE },
      }),
    ).toEqual({ zeileOben: MAX_ZEILE, schreibmarke: { zeile: MAX_ZEILE, spalte: MAX_ZEILE } });
    expect(
      normalisiereStelle({ zeileOben: 1, schreibmarke: { zeile: 1, spalte: 0 } }),
    ).not.toBeNull();
  });

  it('lässt fremde Felder weg', () => {
    expect(
      normalisiereStelle({ zeileOben: 2, fremd: 1, schreibmarke: { zeile: 2, spalte: 1, x: 9 } }),
    ).toEqual({ zeileOben: 2, schreibmarke: { zeile: 2, spalte: 1 } });
  });

  it('lehnt Nicht-Objekte ab', () => {
    for (const roh of [null, undefined, 5, 'text', [], [1], true, new Date()]) {
      expect(normalisiereStelle(roh)).toBeNull();
    }
  });

  it('lehnt eine ungültige oberste Zeile ab', () => {
    for (const zeileOben of [0, -1, MAX_ZEILE + 1, 200.5, '200', NaN, Infinity, undefined, null]) {
      expect(normalisiereStelle({ zeileOben })).toBeNull();
    }
  });

  it('lehnt eine Schreibmarke ab, die kein Objekt ist', () => {
    for (const schreibmarke of [5, 'z', [], [1, 2], true]) {
      expect(normalisiereStelle({ zeileOben: 1, schreibmarke })).toBeNull();
    }
  });

  it('lehnt eine ungültige Zeile der Schreibmarke ab', () => {
    for (const zeile of [0, MAX_ZEILE + 1, 3.5, '3', NaN, Infinity, undefined]) {
      expect(normalisiereStelle({ zeileOben: 1, schreibmarke: { zeile, spalte: 0 } })).toBeNull();
    }
  });

  it('lehnt eine ungültige Spalte der Schreibmarke ab', () => {
    for (const spalte of [-1, MAX_ZEILE + 1, 0.5, '0', NaN, -Infinity, undefined]) {
      expect(normalisiereStelle({ zeileOben: 1, schreibmarke: { zeile: 1, spalte } })).toBeNull();
    }
  });

  it('lehnt eine nur teilweise angegebene Schreibmarke ab', () => {
    expect(normalisiereStelle({ zeileOben: 1, schreibmarke: { zeile: 1 } })).toBeNull();
    expect(normalisiereStelle({ zeileOben: 1, schreibmarke: { spalte: 1 } })).toBeNull();
    expect(normalisiereStelle({ zeileOben: 1, schreibmarke: {} })).toBeNull();
  });

  it('verändert die Eingabe nicht und gibt ein neues Objekt zurück', () => {
    const roh = Object.freeze({
      zeileOben: 3,
      schreibmarke: Object.freeze({ zeile: 3, spalte: 1 }),
    });
    const ergebnis = normalisiereStelle(roh);
    expect(ergebnis).not.toBe(roh);
    expect(ergebnis.schreibmarke).not.toBe(roh.schreibmarke);
  });
});

describe('stelleFuerDokument', () => {
  it('lässt eine Stelle innerhalb des Dokuments unverändert', () => {
    expect(stelleFuerDokument({ zeileOben: 5, schreibmarke: { zeile: 7, spalte: 2 } }, 10)).toEqual(
      {
        zeileOben: 5,
        schreibmarke: { zeile: 7, spalte: 2, amZeilenEnde: false },
      },
    );
  });

  it('begrenzt oberste Zeile und Schreibmarke und meldet das Zeilenende', () => {
    expect(
      stelleFuerDokument({ zeileOben: 50, schreibmarke: { zeile: 60, spalte: 4 } }, 20),
    ).toEqual({
      zeileOben: 20,
      schreibmarke: { zeile: 20, spalte: 4, amZeilenEnde: true },
    });
  });

  it('meldet kein Zeilenende, wenn die Schreibmarke genau in der letzten Zeile steht', () => {
    expect(
      stelleFuerDokument({ zeileOben: 30, schreibmarke: { zeile: 20, spalte: 1 } }, 20),
    ).toEqual({
      zeileOben: 20,
      schreibmarke: { zeile: 20, spalte: 1, amZeilenEnde: false },
    });
  });

  it('führt eine Stelle ohne Schreibmarke mit null weiter', () => {
    expect(stelleFuerDokument({ zeileOben: 9 }, 3)).toEqual({ zeileOben: 3, schreibmarke: null });
  });

  it('lehnt eine ungültige Stelle ab', () => {
    expect(stelleFuerDokument({ zeileOben: 0 }, 10)).toBeNull();
    expect(stelleFuerDokument(null, 10)).toBeNull();
  });

  it('lehnt eine ungültige Zeilenzahl ab', () => {
    for (const zahl of [0, -3, 2.5, '10', NaN, Infinity, undefined]) {
      expect(stelleFuerDokument({ zeileOben: 1 }, zahl)).toBeNull();
    }
  });
});

describe('findeStelle', () => {
  const tabelle = eingefroren({
    'C:/a/eins.md': { zeileOben: 4, schreibmarke: null, zuletzt: 100 },
  });

  it('findet den Eintrag bei gleicher Schreibweise', () => {
    expect(findeStelle(tabelle, 'C:/a/eins.md')).toEqual({ zeileOben: 4, schreibmarke: null });
  });

  it('findet unter Windows auch bei anderer Groß-Kleinschreibung', () => {
    setPlatformForTests('win32');
    expect(findeStelle(tabelle, 'c:/A/EINS.md')).toEqual({ zeileOben: 4, schreibmarke: null });
  });

  it('unterscheidet unter Linux die Groß-Kleinschreibung', () => {
    setPlatformForTests('linux');
    expect(findeStelle(tabelle, 'c:/A/EINS.md')).toBeNull();
  });

  it('liefert null ohne Eintrag oder bei ungültigen Eingaben', () => {
    expect(findeStelle(tabelle, 'C:/a/zwei.md')).toBeNull();
    expect(findeStelle(tabelle, '')).toBeNull();
    expect(findeStelle(tabelle, 5)).toBeNull();
    expect(findeStelle(null, 'C:/a/eins.md')).toBeNull();
    expect(findeStelle([], 'C:/a/eins.md')).toBeNull();
  });
});

describe('vermerkeStelle', () => {
  it('legt einen neuen Eintrag mit Zeitpunkt an', () => {
    const neu = vermerkeStelle(
      {},
      'C:/a.md',
      { zeileOben: 2, schreibmarke: { zeile: 3, spalte: 0 } },
      77,
    );
    expect(neu).toEqual({
      'C:/a.md': { zeileOben: 2, schreibmarke: { zeile: 3, spalte: 0 }, zuletzt: 77 },
    });
  });

  it('ersetzt unter Windows den Eintrag mit gleichem Vergleichs-Schlüssel', () => {
    setPlatformForTests('win32');
    const alt = eingefroren({
      'C:/Ordner/Datei.md': { zeileOben: 1, schreibmarke: null, zuletzt: 1 },
    });
    const neu = vermerkeStelle(alt, 'c:/ordner/datei.MD', { zeileOben: 9 }, 2);
    expect(neu).toEqual({ 'c:/ordner/datei.MD': { zeileOben: 9, schreibmarke: null, zuletzt: 2 } });
    expect(alt).toEqual({ 'C:/Ordner/Datei.md': { zeileOben: 1, schreibmarke: null, zuletzt: 1 } });
  });

  it('führt unter Linux andere Groß-Kleinschreibung als eigenen Eintrag', () => {
    setPlatformForTests('linux');
    const alt = eingefroren({
      '/ordner/Datei.md': { zeileOben: 1, schreibmarke: null, zuletzt: 1 },
    });
    const neu = vermerkeStelle(alt, '/ordner/datei.md', { zeileOben: 9 }, 2);
    expect(Object.keys(neu).sort()).toEqual(['/ordner/Datei.md', '/ordner/datei.md']);
  });

  it('verdrängt beim 501. Eintrag den ältesten', () => {
    let tabelle = {};
    for (let i = 0; i < MAX_EINTRAEGE; i++) {
      // Zeitpunkte bewusst nicht in Einfüge-Reihenfolge: der älteste ist Nummer 250.
      const zeit = i === 250 ? 1 : 1000 + i;
      tabelle = vermerkeStelle(tabelle, `/d/${i}.md`, { zeileOben: 1 }, zeit);
    }
    expect(Object.keys(tabelle)).toHaveLength(MAX_EINTRAEGE);
    const neu = vermerkeStelle(eingefroren(tabelle), '/d/neu.md', { zeileOben: 1 }, 5000);
    expect(Object.keys(neu)).toHaveLength(MAX_EINTRAEGE);
    expect(neu['/d/250.md']).toBeUndefined();
    expect(neu['/d/neu.md']).toEqual({ zeileOben: 1, schreibmarke: null, zuletzt: 5000 });
    expect(tabelle['/d/250.md']).toBeDefined();
  });

  it('behält den soeben vermerkten, auch wenn er den ältesten Zeitpunkt trägt', () => {
    const alt = eingefroren({
      '/a.md': { zeileOben: 1, schreibmarke: null, zuletzt: 10 },
      '/b.md': { zeileOben: 1, schreibmarke: null, zuletzt: 20 },
    });
    const neu = vermerkeStelle(alt, '/c.md', { zeileOben: 1 }, 1, 2);
    expect(Object.keys(neu).sort()).toEqual(['/b.md', '/c.md']);
  });

  it('gibt die Tabelle bei ungültigen Werten unverändert zurück', () => {
    const alt = eingefroren({ '/a.md': { zeileOben: 1, schreibmarke: null, zuletzt: 1 } });
    expect(vermerkeStelle(alt, '/b.md', { zeileOben: 0 }, 1)).toBe(alt);
    expect(vermerkeStelle(alt, '', { zeileOben: 1 }, 1)).toBe(alt);
    expect(vermerkeStelle(alt, 7, { zeileOben: 1 }, 1)).toBe(alt);
    expect(vermerkeStelle(alt, '/b.md', { zeileOben: 1 }, NaN)).toBe(alt);
    expect(vermerkeStelle(alt, '/b.md', { zeileOben: 1 }, '5')).toBe(alt);
    expect(vermerkeStelle(alt, '/b.md', { zeileOben: 1 }, Infinity)).toBe(alt);
  });

  it('nimmt den Prototyp-Schlüssel nicht als Pfad an', () => {
    const alt = eingefroren({ '/a.md': { zeileOben: 1, schreibmarke: null, zuletzt: 1 } });
    expect(vermerkeStelle(alt, '__proto__', { zeileOben: 1 }, 1)).toBe(alt);
    expect(benenneUm(alt, '/a.md', '__proto__')).toBe(alt);
    expect(findeStelle(alt, '__proto__')).toBeNull();
  });
});

describe('benenneUm', () => {
  it('führt den Eintrag unter dem neuen Pfad weiter', () => {
    const alt = eingefroren({
      '/alt.md': { zeileOben: 5, schreibmarke: { zeile: 6, spalte: 1 }, zuletzt: 3 },
    });
    expect(benenneUm(alt, '/alt.md', '/neu.md')).toEqual({
      '/neu.md': { zeileOben: 5, schreibmarke: { zeile: 6, spalte: 1 }, zuletzt: 3 },
    });
    expect(Object.keys(alt)).toEqual(['/alt.md']);
  });

  it('ersetzt einen schon vorhandenen Eintrag unter dem neuen Pfad', () => {
    const alt = eingefroren({
      '/alt.md': { zeileOben: 5, schreibmarke: null, zuletzt: 3 },
      '/neu.md': { zeileOben: 99, schreibmarke: null, zuletzt: 9 },
    });
    expect(benenneUm(alt, '/alt.md', '/neu.md')).toEqual({
      '/neu.md': { zeileOben: 5, schreibmarke: null, zuletzt: 3 },
    });
  });

  it('gibt die Tabelle ohne Eintrag für den alten Pfad unverändert zurück', () => {
    const alt = eingefroren({ '/x.md': { zeileOben: 1, schreibmarke: null, zuletzt: 1 } });
    expect(benenneUm(alt, '/fehlt.md', '/neu.md')).toBe(alt);
  });

  it('findet den alten Pfad unter Windows auch bei anderer Groß-Kleinschreibung', () => {
    setPlatformForTests('win32');
    const alt = eingefroren({ 'C:/Alt.md': { zeileOben: 2, schreibmarke: null, zuletzt: 1 } });
    expect(benenneUm(alt, 'c:/alt.md', 'C:/Neu.md')).toEqual({
      'C:/Neu.md': { zeileOben: 2, schreibmarke: null, zuletzt: 1 },
    });
  });
});
