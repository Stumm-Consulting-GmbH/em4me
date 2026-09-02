// 4T-001048 (Epic 3E-000151): Unit-Tests der Options-Auflösung — Voreinstellung,
// Übersteuerung je Dokument, stiller Rückfall bei unzulässigen Angaben und
// die Grenzen der Zahl-Optionen.
import { describe, it, expect } from 'vitest';
import {
  MINDMAP_VORGABEN,
  MINDMAP_LAYOUTS,
  MINDMAP_LINIENFUEHRUNGEN,
  normalisiereMindmapOptionen,
  resolveMindmapOptionen,
} from '../../src/shared/mindmap-optionen.js';

describe('Mindmap-Optionen: Auflösung (4T-001048)', () => {
  it('AK3: ohne jede Angabe gilt die Voreinstellung', () => {
    expect(resolveMindmapOptionen(null, null)).toEqual(MINDMAP_VORGABEN);
  });

  it('AK1: die anwendungsweite Voreinstellung übersteuert das Werk', () => {
    const eff = resolveMindmapOptionen({ layout: 'mitte' }, null);
    expect(eff.layout).toBe('mitte');
    // Die übrigen Werte bleiben unberührt.
    expect(eff.linienfuehrung).toBe(MINDMAP_VORGABEN.linienfuehrung);
  });

  it('AK2: die Angabe im Dokument übersteuert die Voreinstellung', () => {
    const eff = resolveMindmapOptionen(
      { layout: 'links', linienfuehrung: 'gerade' },
      { mindmap: { layout: 'unten' } },
    );
    expect(eff.layout).toBe('unten');
    // Nicht gesetzte Felder bleiben bei der Voreinstellung, nicht am Werk.
    expect(eff.linienfuehrung).toBe('gerade');
  });

  it('AK4: ein unzulässiger Wert im Dokument fällt still zurück', () => {
    const eff = resolveMindmapOptionen({ layout: 'mitte' }, { mindmap: { layout: 'spirale' } });
    expect(eff.layout).toBe('mitte');
  });

  it('AK4: eine unbekannte Angabe wird ignoriert', () => {
    const eff = resolveMindmapOptionen(null, { mindmap: { farbe: 'rot', layout: 'rechts' } });
    expect(eff.layout).toBe('rechts');
    expect(eff.farbe).toBeUndefined();
  });

  it('AK8: ein Kopfbereich, dessen mindmap-Angabe kein Objekt ist, wird ignoriert', () => {
    for (const unsinn of ['ja', 42, true, ['a'], null]) {
      expect(resolveMindmapOptionen(null, { mindmap: unsinn })).toEqual(MINDMAP_VORGABEN);
    }
  });

  it('AK7: ein Dokument ohne Kopfbereich verhält sich wie eines ohne Angaben', () => {
    expect(resolveMindmapOptionen(null, undefined)).toEqual(MINDMAP_VORGABEN);
    expect(resolveMindmapOptionen(null, {})).toEqual(MINDMAP_VORGABEN);
  });
});

describe('Mindmap-Optionen: Grenzen der Zahl-Werte (4T-001048)', () => {
  it('nimmt Ganzzahlen innerhalb der Grenzen an', () => {
    const eff = resolveMindmapOptionen(null, {
      mindmap: { farbEinfrierEbene: 3, anfangsTiefe: 2, hoechstBreite: 400 },
    });
    expect(eff.farbEinfrierEbene).toBe(3);
    expect(eff.anfangsTiefe).toBe(2);
    expect(eff.hoechstBreite).toBe(400);
  });

  it('verwirft Werte außerhalb der Grenzen', () => {
    const eff = resolveMindmapOptionen(null, {
      mindmap: { farbEinfrierEbene: 99, anfangsTiefe: -5, hoechstBreite: 5 },
    });
    expect(eff.farbEinfrierEbene).toBe(MINDMAP_VORGABEN.farbEinfrierEbene);
    expect(eff.anfangsTiefe).toBe(MINDMAP_VORGABEN.anfangsTiefe);
    expect(eff.hoechstBreite).toBe(MINDMAP_VORGABEN.hoechstBreite);
  });

  it('verwirft Kommazahlen und Zahlen als Zeichenkette', () => {
    const eff = resolveMindmapOptionen(null, {
      mindmap: { farbEinfrierEbene: 1.5, hoechstBreite: '400' },
    });
    expect(eff.farbEinfrierEbene).toBe(MINDMAP_VORGABEN.farbEinfrierEbene);
    expect(eff.hoechstBreite).toBe(MINDMAP_VORGABEN.hoechstBreite);
  });

  it('lässt die Ränder der Bereiche zu', () => {
    const eff = resolveMindmapOptionen(null, {
      mindmap: { farbEinfrierEbene: 0, anfangsTiefe: -1, hoechstBreite: 80 },
    });
    expect(eff.farbEinfrierEbene).toBe(0);
    expect(eff.anfangsTiefe).toBe(-1);
    expect(eff.hoechstBreite).toBe(80);
  });
});

describe('Mindmap-Optionen: Normalisierung (4T-001048)', () => {
  it('liefert für unbrauchbare Eingänge eine leere Menge', () => {
    for (const unsinn of [null, undefined, 'text', 7, [], true]) {
      expect(normalisiereMindmapOptionen(unsinn)).toEqual({});
    }
  });

  it('gibt genau die gültigen Schlüssel zurück, keine weiteren', () => {
    const aus = normalisiereMindmapOptionen({ layout: 'oben', unbekannt: 1 });
    expect(Object.keys(aus)).toEqual(['layout']);
  });

  it('kennt genau die dokumentierten Aufzählungs-Werte', () => {
    // 4T-001049: fünf Wurzel-Lagen statt der beiden Layout-Namen der ersten
    // Fassung; die Reihenfolge ist die des Einstellungs-Menüs.
    expect(MINDMAP_LAYOUTS).toEqual(['links', 'mitte', 'rechts', 'oben', 'unten']);
    expect(MINDMAP_LINIENFUEHRUNGEN).toEqual(['geschwungen', 'gerade']);
    // Die Voreinstellung muss selbst gültig sein, sonst zeigte die Ansicht
    // ab Werk etwas, das die Auflösung verwirft.
    expect(MINDMAP_LAYOUTS).toContain(MINDMAP_VORGABEN.layout);
    expect(MINDMAP_LINIENFUEHRUNGEN).toContain(MINDMAP_VORGABEN.linienfuehrung);
  });
});
