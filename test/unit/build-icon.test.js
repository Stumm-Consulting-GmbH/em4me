// 4T-001204 (Epic 3E-000121): Unit-Test des ICNS-Containers aus
// scripts/build-icon.js — der Aufbau ist handgeschrieben (Typ + Laenge je
// Eintrag, PNG-Inhalt) und hier gegenstaendlich geprueft, weil kein Wächter
// sonst in die erzeugte Datei sieht.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { icnsFromPngs, ICNS_TYPES } = createRequire(import.meta.url)('../../scripts/build-icon.js');

// Minimaler PNG-artiger Inhalt je Eintrag; fuer den Container zaehlt nur die
// Byte-Laenge, nicht die Bild-Gueltigkeit.
function fakePng(len, fuellwert) {
  return Buffer.alloc(len, fuellwert);
}

describe('icnsFromPngs (4T-001204)', () => {
  it('schreibt Kopf-Kennung, Gesamtlaenge und je Eintrag Typ und Laenge', () => {
    const a = fakePng(10, 1);
    const b = fakePng(20, 2);
    const icns = icnsFromPngs([
      { type: 'icp4', png: a },
      { type: 'ic09', png: b },
    ]);

    expect(icns.toString('ascii', 0, 4)).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    expect(icns.length).toBe(8 + (8 + 10) + (8 + 20));

    expect(icns.toString('ascii', 8, 12)).toBe('icp4');
    expect(icns.readUInt32BE(12)).toBe(8 + 10);
    expect(icns.subarray(16, 26).equals(a)).toBe(true);

    expect(icns.toString('ascii', 26, 30)).toBe('ic09');
    expect(icns.readUInt32BE(30)).toBe(8 + 20);
    expect(icns.subarray(34, 54).equals(b)).toBe(true);
  });

  it('die Typ-Liste deckt 16 bis 1024 px mit gueltigen PNG-Typen', () => {
    expect(ICNS_TYPES.map(([, size]) => size)).toEqual([16, 32, 64, 128, 256, 512, 1024]);
    for (const [type] of ICNS_TYPES) expect(type).toMatch(/^(icp[456]|ic(07|08|09|10))$/);
  });
});
