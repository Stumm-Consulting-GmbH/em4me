// @vitest-environment jsdom
// 4T-002281 (Epic 3E-000348): Unit-Tests des Katalogs eigener Folien-Themes im
// Fenster — Start aus dem Einstellungs-Speicher, Wechsel über die
// Einstellungs-Verteilung samt Neu-Zeichnen (AK5) und die Auflösung eines
// eigenen Themes an der Folie (AK3).
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { FOLIEN_THEMES } from '../../../src/shared/presentation/presentation-themes.js';

vi.mock('../../../src/renderer/i18n.js', () => ({ t: (key) => key }));

const FIRMA = { id: 't1', name: 'Firma', basis: 'dark', slots: { accent: '#c0392b' } };

// Der Stand ist Modul-Zustand; jeder Fall lädt ihn frisch.
async function frisch() {
  vi.resetModules();
  const stand =
    await import('../../../src/renderer/modules/presentation/presentation-themes-stand.js');
  const folie = await import('../../../src/renderer/modules/presentation/presentation-folie.js');
  return { ...stand, ...folie };
}

// Attrappe der Brücke: hält den Hörer fest und liefert den gespeicherten Stand.
function bruecke(gespeichert) {
  const b = { hoerer: null, gefragt: [] };
  b.api = {
    getSetting: async (schluessel) => {
      b.gefragt.push(schluessel);
      return gespeichert;
    },
    onPresentationThemesChanged: (fn) => {
      b.hoerer = fn;
    },
  };
  return b;
}

describe('Katalog eigener Themes im Fenster (AK5)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('ist ohne Start leer', async () => {
    const { eigeneThemes, themesStand } = await frisch();
    expect(eigeneThemes()).toEqual([]);
    expect(themesStand()).toBe(0);
  });

  it('übernimmt beim Start den gespeicherten Stand, normalisiert', async () => {
    const { starteThemesStand, eigeneThemes, themesStand } = await frisch();
    const b = bruecke({ custom: [FIRMA, { id: 'x', name: 'light', basis: 'dark' }] });
    const neuZeichnen = vi.fn();
    await starteThemesStand(b.api, { neuZeichnen });
    expect(b.gefragt).toEqual(['presentationThemes']);
    expect(eigeneThemes()).toEqual([FIRMA]);
    expect(themesStand()).toBe(1);
    expect(neuZeichnen).toHaveBeenCalledTimes(1);
  });

  it('meldet den Hörer vor der Abfrage an und zeichnet bei jedem echten Wechsel neu', async () => {
    const { starteThemesStand, eigeneThemes, themesStand } = await frisch();
    const b = bruecke(undefined);
    const neuZeichnen = vi.fn();
    const start = starteThemesStand(b.api, { neuZeichnen });
    expect(typeof b.hoerer).toBe('function');
    await start;
    // Ein leerer Stand ist kein Wechsel.
    expect(neuZeichnen).not.toHaveBeenCalled();
    b.hoerer({ custom: [FIRMA] });
    expect(eigeneThemes()).toEqual([FIRMA]);
    expect(neuZeichnen).toHaveBeenCalledTimes(1);
    // Derselbe Katalog noch einmal: kein Neu-Zeichnen.
    b.hoerer({ custom: [{ ...FIRMA }] });
    expect(neuZeichnen).toHaveBeenCalledTimes(1);
    expect(themesStand()).toBe(1);
  });

  it('benachrichtigt angemeldete Hörer; ein fehlerhafter hält die übrigen nicht auf', async () => {
    const { setzeEigeneThemes, beimThemesWechsel } = await frisch();
    const zweiter = vi.fn();
    beimThemesWechsel(() => {
      throw new Error('kaputt');
    });
    const ab = beimThemesWechsel(zweiter);
    expect(setzeEigeneThemes({ custom: [FIRMA] })).toBe(true);
    expect(zweiter).toHaveBeenCalledWith([FIRMA]);
    ab();
    setzeEigeneThemes({ custom: [] });
    expect(zweiter).toHaveBeenCalledTimes(1);
  });

  it('übersteht eine fehlende Brücke und einen Fehler beim Lesen', async () => {
    const { starteThemesStand, eigeneThemes } = await frisch();
    await starteThemesStand(null);
    await starteThemesStand({
      getSetting: async () => {
        throw new Error('nicht lesbar');
      },
    });
    expect(eigeneThemes()).toEqual([]);
  });
});

describe('Folie mit eigenem Theme (AK3)', () => {
  it('setzeGestaltung löst die Kopf-Angabe mit dem Katalog des Fensters auf', async () => {
    const { setzeEigeneThemes, setzeGestaltung } = await frisch();
    const slide = document.createElement('section');
    const ohne = setzeGestaltung(slide, { theme: 'Firma' });
    expect(ohne.name).toBe('light');
    expect(ohne.befunde.map((b) => b.code)).toEqual(['themeUnbekannt']);

    setzeEigeneThemes({ custom: [FIRMA] });
    const mit = setzeGestaltung(slide, { theme: 'Firma' });
    expect(mit).toEqual({ name: 'Firma', befunde: [] });
    expect(slide.style.getPropertyValue('--slide-accent')).toBe('#c0392b');
    expect(slide.style.getPropertyValue('--slide-background')).toBe(FOLIEN_THEMES.dark.background);
    expect(slide.dataset.theme).toBe('dark');
  });
});
