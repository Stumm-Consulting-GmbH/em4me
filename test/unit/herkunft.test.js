// 4T-001438 (Story 4S-000869, Epic 3E-000231): Herkunft einer Änderung.
//
// Geprüft wird vor allem die Grenze: Was passiert, wenn das Betriebssystem
// keine Auskunft gibt? Ein erfundener Ersatzwert wäre eine falsche
// Feststellung, und die Angabe wird später in eine Datei geschrieben, die mit
// dem Dokument reist — dort ist «unbekannt» als Name schlimmer als gar nichts.
import { describe, it, expect, afterEach, vi } from 'vitest';
import os from 'node:os';

import { benutzerName, rechnerName, ermittleHerkunft } from '../../src/main/herkunft.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('herkunft: die beiden Angaben', () => {
  // AK1
  it('liefert Benutzer und Rechner als zwei getrennte Angaben', () => {
    const h = ermittleHerkunft();
    expect(Object.keys(h).sort()).toEqual(['benutzer', 'rechner']);
    // Getrennt heißt: keine zusammengesetzte Zeichenkette, aus der jemand
    // später mit einer Trennregel zurückrechnen müsste.
    expect(typeof h.benutzer === 'string' || h.benutzer === null).toBe(true);
    expect(typeof h.rechner === 'string' || h.rechner === null).toBe(true);
  });

  // AK2: `os` ist plattformneutral; der Fall wird auf jeder freigegebenen
  // Plattform mit der Suite gefahren und liest dort denselben Weg.
  it('ermittelt auf dieser Plattform beide Angaben', () => {
    expect(benutzerName()).toBeTruthy();
    expect(rechnerName()).toBeTruthy();
  });

  it('stimmt mit der Auskunft des Betriebssystems überein', () => {
    expect(benutzerName()).toBe(os.userInfo().username.trim());
    expect(rechnerName()).toBe(os.hostname().trim());
  });
});

// AK3 — die eigentliche Prüfung dieses Tasks.
describe('herkunft: nicht ermittelbare Angaben bleiben leer', () => {
  it('liefert null, wenn die Benutzer-Auskunft wirft', () => {
    vi.spyOn(os, 'userInfo').mockImplementation(() => {
      throw new Error('kein Eintrag in der Benutzer-Datenbank');
    });
    expect(benutzerName()).toBeNull();
    expect(ermittleHerkunft().benutzer).toBeNull();
  });

  it('liefert null, wenn die Rechner-Auskunft wirft', () => {
    vi.spyOn(os, 'hostname').mockImplementation(() => {
      throw new Error('kein Rechnername');
    });
    expect(rechnerName()).toBeNull();
  });

  it('macht aus einem leeren Namen null statt einer leeren Zeichenkette', () => {
    vi.spyOn(os, 'hostname').mockReturnValue('   ');
    expect(rechnerName()).toBeNull();
  });

  it('macht aus einem Nicht-Text null', () => {
    vi.spyOn(os, 'hostname').mockReturnValue(undefined);
    expect(rechnerName()).toBeNull();
  });

  it('erfindet keinen Ersatzwert', () => {
    vi.spyOn(os, 'userInfo').mockImplementation(() => {
      throw new Error('keine Auskunft');
    });
    vi.spyOn(os, 'hostname').mockImplementation(() => {
      throw new Error('keine Auskunft');
    });
    const h = ermittleHerkunft();
    expect(h).toEqual({ benutzer: null, rechner: null });
    // Kein "unbekannt", kein "n/a", kein Rückfall auf eine Umgebungs-Variable.
    expect(JSON.stringify(h)).not.toMatch(/unbekannt|unknown|n\/a/i);
  });

  it('schneidet umgebende Leerzeichen ab', () => {
    vi.spyOn(os, 'hostname').mockReturnValue('  RECHNER-7  ');
    expect(rechnerName()).toBe('RECHNER-7');
  });
});

// AK4: Die Angaben werden ausschließlich abgelesen. Ein Zwischenspeicher wäre
// nicht nur überflüssig, sondern falsch, sobald sich der angemeldete Benutzer
// während der Laufzeit ändert.
describe('herkunft: abgelesen, nicht verwaltet', () => {
  it('fragt bei jedem Aufruf erneut, statt zu puffern', () => {
    const hostname = vi.spyOn(os, 'hostname').mockReturnValue('ERSTER');
    expect(rechnerName()).toBe('ERSTER');
    hostname.mockReturnValue('ZWEITER');
    expect(rechnerName()).toBe('ZWEITER');
    expect(hostname).toHaveBeenCalledTimes(2);
  });

  it('legt nichts an und gibt bei gleichbleibender Auskunft gleiche Werte', () => {
    const a = ermittleHerkunft();
    const b = ermittleHerkunft();
    expect(a).toEqual(b);
    // Zwei Aufrufe liefern gleiche Werte, aber nicht dasselbe Objekt: Es gibt
    // keinen gehaltenen Zustand, den ein Aufrufer versehentlich ändern könnte.
    expect(a).not.toBe(b);
  });
});
