// 4T-0971 (Epic 3E-0207): Unit-Tests der letzten Auffang-Ebene des Renderers
// (src/renderer/modules/app/auffang-ebene.js).
//
// Geprüft wird der freigegebene Weg R2 (protokollieren, Entwürfe sichern,
// weiterlaufen) samt der beiden Zusätze der Freigabe. Das Modul registriert
// beim Laden nur, wenn ein Fenster da ist; in dieser Umgebung gibt es keines,
// weshalb der Import ohne Seiteneffekt bleibt und die Fälle gegen frisch
// gebaute Ebenen laufen.
import { describe, it, expect, vi } from 'vitest';
import {
  erstelleAuffangEbene,
  baueMeldung,
} from '../../../src/renderer/modules/app/auffang-ebene.js';

function baueEbene(sichereEntwuerfe = vi.fn(async () => 0)) {
  const zeilen = [];
  const ebene = erstelleAuffangEbene({
    log: (text) => zeilen.push(text),
    sichereEntwuerfe,
  });
  return { ebene, zeilen, sichereEntwuerfe };
}

describe('Protokoll mit Kontext (AK2)', () => {
  it('nennt Prozess-Seite, Ereignis-Art, Meldung und Aufruf-Spur', async () => {
    const { ebene, zeilen } = baueEbene();
    await ebene.behandle('fehler', new Error('Kaputt'));
    expect(zeilen[0]).toContain('[renderer]');
    expect(zeilen[0]).toContain('unbehandelter Fehler');
    expect(zeilen[0]).toContain('Kaputt');
    expect(zeilen[0].split('\n').length).toBeGreaterThan(1);
  });

  it('trägt die Ablehnung als eigene Ereignis-Art', () => {
    expect(baueMeldung('ablehnung', 'nur Text')).toContain('unbehandelte Promise-Ablehnung');
  });
});

describe('Weg R2: sichern und weiterlaufen (AK3)', () => {
  it('ruft die Entwurfs-Sicherung und meldet die Anzahl', async () => {
    const sichere = vi.fn(async () => 3);
    const { ebene } = baueEbene(sichere);
    const erg = await ebene.behandle('fehler', new Error('x'));
    expect(sichere).toHaveBeenCalledTimes(1);
    expect(erg).toEqual({ erneut: false, gesichert: 3 });
  });

  it('kennt kein Beenden: die Ebene gibt zurück und lässt das Fenster stehen', async () => {
    // Gegenprobe zur Main-Seite. Der Unterschied ist die Entscheidung R2 gegen
    // M2, nicht ein Versehen: Der Renderer bleibt nach einem gefangenen Fehler
    // bedienbar, und der Nutzer behält seine Sitzung.
    const { ebene } = baueEbene();
    await expect(ebene.behandle('fehler', new Error('x'))).resolves.toBeTruthy();
  });
});

describe('Zusatz 1 der Freigabe: die Sicherung reisst nichts mit (AK5)', () => {
  it('meldet einen Fehlschlag der Sicherung, ohne zu werfen', async () => {
    const sichere = vi.fn(async () => {
      throw new Error('IPC weg');
    });
    const { ebene, zeilen } = baueEbene(sichere);
    const erg = await ebene.behandle('fehler', new Error('x'));
    expect(erg.gesichert).toBe(0);
    expect(zeilen.join('\n')).toContain('Entwurfs-Sicherung nach dem Auffangen fehlgeschlagen');
  });
});

describe('Zusatz 2 der Freigabe: keine Kaskade (AK5)', () => {
  it('sichert nur beim ersten Vorfall, protokolliert aber jeden', async () => {
    const { ebene, zeilen, sichereEntwuerfe } = baueEbene();
    await ebene.behandle('fehler', new Error('erster'));
    const zweiter = await ebene.behandle('ablehnung', new Error('zweiter'));
    expect(zweiter.erneut).toBe(true);
    expect(sichereEntwuerfe).toHaveBeenCalledTimes(1);
    expect(zeilen.join('\n')).toContain('zweiter');
  });
});

describe('Registrierung an beiden Ereignis-Arten (AK2)', () => {
  it('hängt sich an error und unhandledrejection eines Ziels', async () => {
    const haken = new Map();
    const ziel = { addEventListener: (name, fn) => haken.set(name, fn) };
    const { ebene, zeilen, sichereEntwuerfe } = baueEbene();
    expect(ebene.registriere(ziel)).toBe(true);
    expect([...haken.keys()].sort()).toEqual(['error', 'unhandledrejection']);

    // Das Fehler-Ereignis trägt sein Error-Objekt im Feld `error`, die
    // Ablehnung ihren Grund in `reason`; beide Wege werden nachgestellt.
    haken.get('error')({ error: new Error('aus dem Ereignis') });
    await Promise.resolve();
    expect(zeilen[0]).toContain('aus dem Ereignis');
    expect(sichereEntwuerfe).toHaveBeenCalledTimes(1);
  });

  it('bleibt ohne taugliches Ziel still, statt zu werfen', () => {
    const { ebene } = baueEbene();
    expect(ebene.registriere(null)).toBe(false);
    expect(ebene.registriere({})).toBe(false);
  });
});
