// 4T-002161 (Epic 3E-000149): Unit-Tests der Folien-Themes - Schluessel-Namen
// der Slots und Themes, Vollstaendigkeit der mitgelieferten Themes, Aufloesung
// der Kopf-Angabe `theme` als Name und als Block, Uebersteuerung, Befunde und
// die Pruefung der Slot-Werte; dazu die Geometrie- und Skalierungs-Regeln aus
// presentation-darstellung.js.
//
// Die Namen sind eine Zusicherung nach aussen (sie stehen in den Dateien der
// Anwender); der erste Block haelt sie deshalb im Wortlaut fest.
import { describe, it, expect } from 'vitest';
import {
  FOLIEN_SLOTS,
  FOLIEN_THEMES,
  FOLIEN_THEME_SYNTAX,
  THEME_NAMEN,
  THEME_VORGABE,
  slotVariablen,
  slotWertPruefen,
  themeAufloesen,
} from '../../src/shared/presentation/presentation-themes.js';
import {
  FOLIEN_GEOMETRIE,
  FOLIEN_RAND,
  folienGeometrie,
  folienSkalierung,
} from '../../src/shared/presentation/presentation-darstellung.js';
import { BASE_DEFAULTS } from '../../src/shared/color-schemes.js';

describe('Folien-Themes: Schluessel-Namen (4T-002161, AK1)', () => {
  it('die sieben Slots heissen wie entschieden, in fester Reihenfolge', () => {
    expect(FOLIEN_SLOTS).toEqual([
      'background',
      'text',
      'heading',
      'accent',
      'font',
      'header-footer',
      'page-number',
    ]);
  });

  it('die drei mitgelieferten Themes heissen light, dark und accent; Vorgabe ist light', () => {
    expect(THEME_NAMEN).toEqual(['light', 'dark', 'accent']);
    expect(THEME_VORGABE).toBe('light');
  });

  it('AK4: jedes Theme belegt jeden Slot mit einem unbedenklichen Wert', () => {
    for (const name of THEME_NAMEN) {
      expect(Object.keys(FOLIEN_THEMES[name]).sort()).toEqual([...FOLIEN_SLOTS].sort());
      for (const slot of FOLIEN_SLOTS) {
        expect(slotWertPruefen(FOLIEN_THEMES[name][slot]), `${name}.${slot}`).toBe(
          FOLIEN_THEMES[name][slot],
        );
      }
    }
  });

  it('die Themes sind unveraenderliche Daten', () => {
    expect(Object.isFrozen(FOLIEN_THEMES)).toBe(true);
    expect(Object.isFrozen(FOLIEN_THEMES.dark)).toBe(true);
  });

  it('light uebernimmt die Akzentfarbe des hellen Farbschemas, dark die des dunklen', () => {
    expect(FOLIEN_THEMES.light.accent).toBe(BASE_DEFAULTS.light.accent);
    expect(FOLIEN_THEMES.dark.accent).toBe(BASE_DEFAULTS.dark.accent);
    expect(FOLIEN_THEMES.light.background).toBe('#ffffff');
    expect(FOLIEN_THEMES.accent.background).toBe(BASE_DEFAULTS.light.accent);
    expect(FOLIEN_THEMES.accent.text).toBe('#ffffff');
  });
});

describe('Folien-Themes: Aufloesung der Kopf-Angabe (AK4, AK5)', () => {
  it('Befund vom 2026-10-10: jedes Theme nennt seinen Farbsatz der Code-Bloecke', () => {
    expect(FOLIEN_THEME_SYNTAX).toEqual({ light: 'light', dark: 'dark', accent: 'dark' });
    expect(Object.isFrozen(FOLIEN_THEME_SYNTAX)).toBe(true);
    for (const name of THEME_NAMEN)
      expect(themeAufloesen(name).syntax).toBe(FOLIEN_THEME_SYNTAX[name]);
    // Rueckfall und Uebersteuerung behalten den Satz des Basis-Themes.
    expect(themeAufloesen(undefined).syntax).toBe('light');
    expect(themeAufloesen('gaia').syntax).toBe('light');
    expect(themeAufloesen(42).syntax).toBe('light');
    expect(themeAufloesen({ name: 'dark', background: '#ffffff' }).syntax).toBe('dark');
  });

  it('ohne Angabe gilt das Standard-Theme, ohne Befund', () => {
    for (const leer of [undefined, null]) {
      const r = themeAufloesen(leer);
      expect(r.name).toBe('light');
      expect(r.slots).toEqual(FOLIEN_THEMES.light);
      expect(r.befunde).toEqual([]);
    }
  });

  it('die Kurzform waehlt das Theme ueber den Namen', () => {
    for (const name of THEME_NAMEN) {
      const r = themeAufloesen(name);
      expect(r.name).toBe(name);
      expect(r.slots).toEqual(FOLIEN_THEMES[name]);
      expect(r.befunde).toEqual([]);
    }
    expect(themeAufloesen('  dark ').name).toBe('dark');
  });

  it('ein unbekannter Name faellt auf light zurueck und wird benannt', () => {
    const r = themeAufloesen('gaia');
    expect(r.name).toBe('light');
    expect(r.slots).toEqual(FOLIEN_THEMES.light);
    expect(r.befunde).toEqual([{ code: 'themeUnbekannt', detail: 'gaia' }]);
    // Gross-Klein-Schreibung zaehlt, wie bei Marp.
    expect(themeAufloesen('Dark').befunde[0].code).toBe('themeUnbekannt');
  });

  it('der Block uebersteuert einzelne Slots; nicht genannte behalten den Wert des Themes', () => {
    const r = themeAufloesen({ name: 'dark', accent: '#c0392b', font: 'Georgia' });
    expect(r.name).toBe('dark');
    expect(r.befunde).toEqual([]);
    expect(r.slots.accent).toBe('#c0392b');
    expect(r.slots.font).toBe('Georgia');
    for (const slot of ['background', 'text', 'heading', 'header-footer', 'page-number']) {
      expect(r.slots[slot]).toBe(FOLIEN_THEMES.dark[slot]);
    }
    // Das mitgelieferte Theme bleibt unberuehrt.
    expect(FOLIEN_THEMES.dark.accent).toBe(BASE_DEFAULTS.dark.accent);
  });

  it('ein Block ohne name baut auf light auf', () => {
    const r = themeAufloesen({ heading: 'rgb(200, 30, 30)' });
    expect(r.name).toBe('light');
    expect(r.slots.heading).toBe('rgb(200, 30, 30)');
    expect(r.befunde).toEqual([]);
  });

  it('ein Block mit unbekanntem name baut auf light auf und benennt den Namen', () => {
    const r = themeAufloesen({ name: 'uncover', accent: '#123456' });
    expect(r.name).toBe('light');
    expect(r.slots.accent).toBe('#123456');
    expect(r.befunde).toEqual([{ code: 'themeUnbekannt', detail: 'uncover' }]);
  });

  it('unbekannte Schluessel im Block werden benannt und nicht beachtet', () => {
    const r = themeAufloesen({ name: 'dark', farbe: 'red', style: 'x' });
    expect(r.slots).toEqual(FOLIEN_THEMES.dark);
    expect(r.befunde).toEqual([
      { code: 'slotUnbekannt', detail: 'farbe' },
      { code: 'slotUnbekannt', detail: 'style' },
    ]);
  });

  it('ein bedenklicher Slot-Wert faellt auf den Wert des Themes zurueck und wird benannt', () => {
    const r = themeAufloesen({
      name: 'dark',
      background: 'url(https://example.org/x.png)',
      accent: 'red; color: blue',
      text: '#fff',
    });
    expect(r.slots.background).toBe(FOLIEN_THEMES.dark.background);
    expect(r.slots.accent).toBe(FOLIEN_THEMES.dark.accent);
    expect(r.slots.text).toBe('#fff');
    expect(r.befunde).toEqual([
      { code: 'slotWertUngueltig', detail: 'background' },
      { code: 'slotWertUngueltig', detail: 'accent' },
    ]);
  });

  it('jede andere Form der Angabe ist ungueltig und faellt auf light zurueck', () => {
    for (const falsch of [42, true, ['dark']]) {
      const r = themeAufloesen(falsch);
      expect(r.name).toBe('light');
      expect(r.befunde[0].code).toBe('themeUngueltig');
    }
  });
});

describe('Folien-Themes: Pruefung der Slot-Werte', () => {
  it.each([
    ['#c0392b'],
    ['rgb(10, 20, 30)'],
    ['hsl(200 50% 40%)'],
    ['Georgia'],
    ["'Segoe UI', sans-serif"],
    ['linear-gradient(90deg, #000, #333)'],
    ['transparent'],
  ])('laesst %s durch', (wert) => {
    expect(slotWertPruefen(wert)).toBe(wert);
  });

  it.each([
    ['url(x.png)'],
    ['URL (x.png)'],
    ['expression(alert(1))'],
    ['image-set("x.png" 1x)'],
    ['cross-fade(a, b)'],
    ['red; background: blue'],
    ['red }'],
    ['{ red'],
    ['u\\72l(x)'],
    ['<b>'],
    ['red /* x */'],
    ['zeile\nzwei'],
    [''],
    ['   '],
    ['x'.repeat(201)],
  ])('weist %j ab', (wert) => {
    expect(slotWertPruefen(wert)).toBeNull();
  });

  it('nimmt Zahlen als Text an und weist andere Typen ab', () => {
    expect(slotWertPruefen(12)).toBe('12');
    expect(slotWertPruefen(true)).toBeNull();
    expect(slotWertPruefen({})).toBeNull();
    expect(slotWertPruefen(null)).toBeNull();
    expect(slotWertPruefen(Number.NaN)).toBeNull();
  });

  it('jeder Slot wird zur Variablen --slide-<slot>', () => {
    const vars = slotVariablen(FOLIEN_THEMES.accent);
    expect(Object.keys(vars)).toEqual(FOLIEN_SLOTS.map((s) => `--slide-${s}`));
    expect(vars['--slide-header-footer']).toBe(FOLIEN_THEMES.accent['header-footer']);
    expect(slotVariablen(null)).toEqual({});
  });
});

describe('Folien-Geometrie und Skalierung (AK2)', () => {
  it('16:9 ist 1280 x 720, 4:3 ist 960 x 720; unbekannt faellt auf 16:9', () => {
    expect(FOLIEN_GEOMETRIE['16:9']).toEqual({ breite: 1280, hoehe: 720 });
    expect(FOLIEN_GEOMETRIE['4:3']).toEqual({ breite: 960, hoehe: 720 });
    expect(folienGeometrie('4:3')).toEqual({ breite: 960, hoehe: 720, format: '4:3' });
    expect(folienGeometrie(undefined).format).toBe('16:9');
    expect(folienGeometrie('5:4').format).toBe('16:9');
  });

  it('skaliert gleichmaessig nach der knapperen Seite, mit Rand ringsum', () => {
    const g = folienGeometrie('16:9');
    // Breite knapp: (688 - 48) / 1280 = 0.5
    expect(folienSkalierung(688, 2000, g, FOLIEN_RAND)).toEqual({
      skala: 0.5,
      breite: 640,
      hoehe: 360,
    });
    // Hoehe knapp: (408 - 48) / 720 = 0.5
    expect(folienSkalierung(5000, 408, g).skala).toBe(0.5);
    // Seitenverhaeltnis bleibt in jedem Fall erhalten.
    const s = folienSkalierung(1000, 700, g);
    expect(s.breite / s.hoehe).toBeCloseTo(16 / 9, 10);
  });

  it('4:3 skaliert mit seiner eigenen Geometrie', () => {
    const s = folienSkalierung(1008, 1000, folienGeometrie('4:3'));
    expect(s.skala).toBe(1);
    expect(s.breite / s.hoehe).toBeCloseTo(4 / 3, 10);
  });

  it('eine zu kleine oder ungueltige Flaeche ergibt Skala 0, nie eine negative', () => {
    const g = folienGeometrie('16:9');
    expect(folienSkalierung(20, 20, g).skala).toBe(0);
    expect(folienSkalierung(Number.NaN, 400, g).skala).toBe(0);
  });
});
