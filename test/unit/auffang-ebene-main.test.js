// 4T-000971 (Epic 3E-000207): Unit-Tests der letzten Auffang-Ebene des
// Haupt-Prozesses (src/main/app/auffang-ebene.js).
//
// Geprüft wird der freigegebene Weg M2 (protokollieren, Sitzung sichern,
// definiert beenden) samt der beiden Zusätze der Freigabe: gekapselte Schritte
// und Begrenzung auf den ersten Vorfall. Alle Abhängigkeiten sind injiziert;
// der Fall läuft ohne Electron und beendet nichts.
import { describe, it, expect, vi } from 'vitest';
import { erstelleAuffangEbene, baueMeldung } from '../../src/main/app/auffang-ebene.js';

function baueEbene(zusatz = {}) {
  const zeilen = [];
  const sichereSitzung = zusatz.sichereSitzung || vi.fn();
  const beende = zusatz.beende || vi.fn();
  const ebene = erstelleAuffangEbene({
    log: (text) => zeilen.push(text),
    sichereSitzung,
    beende,
  });
  return { ebene, zeilen, sichereSitzung, beende };
}

describe('Protokoll mit Kontext (AK1)', () => {
  it('nennt Prozess-Seite, Ereignis-Art, Meldung und Aufruf-Spur', () => {
    const { ebene, zeilen } = baueEbene();
    ebene.behandle('ausnahme', new Error('Kaputt'));
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toContain('[main]');
    expect(zeilen[0]).toContain('unbehandelte Ausnahme');
    expect(zeilen[0]).toContain('Kaputt');
    // Die Aufruf-Spur steht als eigene Zeile darunter.
    expect(zeilen[0].split('\n').length).toBeGreaterThan(1);
  });

  it('benennt die Ablehnung als eigene Ereignis-Art', () => {
    const { ebene, zeilen } = baueEbene();
    ebene.behandle('ablehnung', new Error('Abgelehnt'));
    expect(zeilen[0]).toContain('unbehandelte Promise-Ablehnung');
  });

  it('kommt auch ohne Fehler-Objekt zu einer lesbaren Meldung', () => {
    // Eine Ablehnung trägt beliebige Werte, nicht zwingend einen Error.
    expect(baueMeldung('ablehnung', 'nur Text')).toContain('nur Text');
    expect(baueMeldung('ablehnung', undefined)).toContain('undefined');
    expect(baueMeldung('ablehnung', { message: 'aus Objekt' })).toContain('aus Objekt');
  });
});

describe('Weg M2: sichern, dann beenden (AK3)', () => {
  it('sichert die Sitzung und beendet danach definiert', () => {
    const reihenfolge = [];
    const { ebene } = baueEbene({
      sichereSitzung: vi.fn(() => reihenfolge.push('sichern')),
      beende: vi.fn(() => reihenfolge.push('beenden')),
    });
    const erg = ebene.behandle('ausnahme', new Error('x'));
    expect(erg).toEqual({ erneut: false, gesichert: true, beendet: true });
    // Die Reihenfolge ist die Zusicherung: Erst sichern, dann beenden. Umgekehrt
    // wäre die Sicherung wertlos.
    expect(reihenfolge).toEqual(['sichern', 'beenden']);
  });
});

describe('Zusatz 1 der Freigabe: ein Fehler im Behandler reisst nichts mit (AK5)', () => {
  it('beendet auch dann, wenn die Sicherung wirft, und meldet den Fehlschlag', () => {
    const beende = vi.fn();
    const { ebene, zeilen } = baueEbene({
      sichereSitzung: vi.fn(() => {
        throw new Error('Persistenz kaputt');
      }),
      beende,
    });
    const erg = ebene.behandle('ausnahme', new Error('x'));
    expect(erg.gesichert).toBe(false);
    expect(erg.beendet).toBe(true);
    expect(beende).toHaveBeenCalledTimes(1);
    expect(zeilen.join('\n')).toContain('Sicherung nach dem Auffangen fehlgeschlagen');
  });

  it('bleibt stehen, wenn auch das Beenden wirft', () => {
    const { ebene, zeilen } = baueEbene({
      beende: vi.fn(() => {
        throw new Error('Quit kaputt');
      }),
    });
    const erg = ebene.behandle('ausnahme', new Error('x'));
    expect(erg.gesichert).toBe(true);
    expect(erg.beendet).toBe(false);
    expect(zeilen.join('\n')).toContain('Definiertes Beenden fehlgeschlagen');
  });

  it('behandelt weiter, wenn schon das Protokollieren scheitert', () => {
    // Ohne diese Kapselung bliebe von der Behandlung nichts übrig, sobald die
    // Konsole selbst nicht mehr trägt.
    const sichereSitzung = vi.fn();
    const beende = vi.fn();
    const ebene = erstelleAuffangEbene({
      log: () => {
        throw new Error('Konsole kaputt');
      },
      sichereSitzung,
      beende,
    });
    expect(() => ebene.behandle('ausnahme', new Error('x'))).not.toThrow();
    expect(sichereSitzung).toHaveBeenCalledTimes(1);
    expect(beende).toHaveBeenCalledTimes(1);
  });
});

describe('Zusatz 2 der Freigabe: keine Kaskade (AK5)', () => {
  it('behandelt nur den ersten Vorfall voll und protokolliert danach nur noch', () => {
    const { ebene, zeilen, sichereSitzung, beende } = baueEbene();
    ebene.behandle('ausnahme', new Error('erster'));
    const zweiter = ebene.behandle('ausnahme', new Error('zweiter'));
    expect(zweiter.erneut).toBe(true);
    expect(sichereSitzung).toHaveBeenCalledTimes(1);
    expect(beende).toHaveBeenCalledTimes(1);
    // Protokolliert wird trotzdem jeder Vorfall: Der zweite ist die Spur, an
    // der eine Kaskade überhaupt erkennbar wird.
    expect(zeilen.join('\n')).toContain('zweiter');
  });
});

describe('Registrierung an beiden Ereignis-Arten (AK1)', () => {
  it('hängt sich an uncaughtException und unhandledRejection', () => {
    const haken = new Map();
    const prozessAttrappe = {
      on: (name, fn) => haken.set(name, fn),
    };
    const { ebene, zeilen, sichereSitzung } = baueEbene();
    ebene.registriere(prozessAttrappe);
    expect([...haken.keys()].sort()).toEqual(['uncaughtException', 'unhandledRejection']);

    haken.get('unhandledRejection')(new Error('aus der Ablehnung'));
    expect(zeilen[0]).toContain('unbehandelte Promise-Ablehnung');
    expect(zeilen[0]).toContain('aus der Ablehnung');
    expect(sichereSitzung).toHaveBeenCalledTimes(1);
  });
});
