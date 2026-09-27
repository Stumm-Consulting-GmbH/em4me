// 4T-001928 (Epic 3E-000256, E5.2, E5.4): Das Blatt der Verweis-Zelle — was
// eine Zelle vom Typ `record` trägt und wie sie ausgelegt wird.
//
// Reine Funktion ohne Dateizugriff; geprüft wird unmittelbar am Ergebnis.
import { describe, it, expect } from 'vitest';

import { VERWEIS_ARTEN, legeVerweisZelleAus } from '../../src/shared/database/record-verweis.js';

describe('Verweis-Zelle: Auslegung nach der einen Ordnung (4T-001928, E5.4)', () => {
  it('legt eine leere Zelle und eine Zelle aus Leerraum als leer aus', () => {
    expect(legeVerweisZelleAus('')).toEqual({ art: VERWEIS_ARTEN.leer, wert: '' });
    expect(legeVerweisZelleAus('   ')).toEqual({ art: VERWEIS_ARTEN.leer, wert: '' });
    expect(legeVerweisZelleAus('\t\n')).toEqual({ art: VERWEIS_ARTEN.leer, wert: '' });
  });

  it('liest die aufgefüllte Kennung und liefert sie unverändert', () => {
    expect(legeVerweisZelleAus('r-00042')).toEqual({
      art: VERWEIS_ARTEN.kennung,
      wert: 'r-00042',
    });
  });

  it('liest die Kurzform der Kennung und liefert sie aufgefüllt', () => {
    expect(legeVerweisZelleAus('r-42')).toEqual({ art: VERWEIS_ARTEN.kennung, wert: 'r-00042' });
    expect(legeVerweisZelleAus('r-123456')).toEqual({
      art: VERWEIS_ARTEN.kennung,
      wert: 'r-123456',
    });
    // Leerraum um eine Kennung ist Hand-Schreibung; gelesen wird sie wie überall.
    expect(legeVerweisZelleAus(' r-7 ')).toEqual({ art: VERWEIS_ARTEN.kennung, wert: 'r-00007' });
  });

  it('nimmt jeden anderen Text als Schlüssel-Wert, wie er dasteht', () => {
    expect(legeVerweisZelleAus('M-17')).toEqual({ art: VERWEIS_ARTEN.schluessel, wert: 'M-17' });
    // Keine gültige Kennung: Nummer null und falsches Kennzeichen.
    expect(legeVerweisZelleAus('r-0')).toEqual({ art: VERWEIS_ARTEN.schluessel, wert: 'r-0' });
    expect(legeVerweisZelleAus('p-42')).toEqual({ art: VERWEIS_ARTEN.schluessel, wert: 'p-42' });
  });

  it('packt einen Wiki-Link nicht aus, er bleibt ein Schlüssel-Wert', () => {
    expect(legeVerweisZelleAus('[[Personen#^r-00042]]')).toEqual({
      art: VERWEIS_ARTEN.schluessel,
      wert: '[[Personen#^r-00042]]',
    });
    expect(legeVerweisZelleAus('[[Anna]]')).toEqual({
      art: VERWEIS_ARTEN.schluessel,
      wert: '[[Anna]]',
    });
  });

  it('trimmt einen Schlüssel-Wert mit führendem Leerraum nicht', () => {
    expect(legeVerweisZelleAus('  Anna')).toEqual({
      art: VERWEIS_ARTEN.schluessel,
      wert: '  Anna',
    });
    expect(legeVerweisZelleAus('Anna ')).toEqual({ art: VERWEIS_ARTEN.schluessel, wert: 'Anna ' });
  });

  it('bricht laut bei einem Zell-Text, der keine Zeichenkette ist', () => {
    expect(() => legeVerweisZelleAus(null)).toThrow(TypeError);
    expect(() => legeVerweisZelleAus(undefined)).toThrow(TypeError);
    expect(() => legeVerweisZelleAus(42)).toThrow(TypeError);
  });
});
