// 4T-0630 (Epic 3E-0102): Unit-Tests für die Titelleisten-Färbung
// (src/main/app/caption-color.js). Geprüft werden die reinen Umrechnungs- und
// Auswahl-Funktionen (hexToColorref, captionColorsFor) sowie der
// Aufruf-Vertrag von applyCaptionColor gegen einen injizierten Fake-Kanal
// (setDwmCallForTests), inklusive Reset-Verhalten und dauerhafter
// Deaktivierung nach einem Fehler.
//
// ACHTUNG (Kanal-Semantik, siehe Modul-Kommentar): dwmCall === undefined ist
// der Lazy-Ausgangszustand; der nächste applyCaptionColor-Aufruf würde in
// diesem Zustand das echte koffi/dwmapi.dll laden. Deshalb injiziert JEDER
// Test, der applyCaptionColor aufruft, zuerst selbst einen Fake — auch die
// Fälle, die "kein Fake-Aufruf" erwarten (dort ein zählender Fake).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DWMWA_CAPTION_COLOR,
  DWMWA_TEXT_COLOR,
  DWMWA_COLOR_DEFAULT,
  hexToColorref,
  captionColorsFor,
  applyCaptionColor,
  setDwmCallForTests,
  setPlatformForTests,
} from '../../src/main/app/caption-color.js';
import {
  TAB_GROUP_COLOR_KEYS,
  TAB_GROUP_COLOR_VALUES,
  TAB_GROUP_COLOR_VALUES_DARK,
  TAB_GROUP_COLOR_TEXT_VALUES,
  TAB_GROUP_COLOR_TEXT_VALUES_DARK,
} from '../../src/shared/tab-group-colors.js';

// 8-Byte-Handle-Buffer (x64) mit einem positiven, in signed-64-Bit passenden
// Wert; der erwartete HWND ergibt sich per readBigInt64LE aus demselben Buffer.
function handle8() {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(0x0000123456789abcn, 0);
  return buf;
}

afterEach(() => {
  // Konsolen-Spies zurücknehmen.
  vi.restoreAllMocks();
  // Kanal auf den Lazy-Ausgangszustand zurücksetzen (siehe Kopf-Kommentar):
  // ungefährlich, solange kein Test ohne eigenen Fake applyCaptionColor ruft.
  setDwmCallForTests(undefined);
  // Plattform-Gate auf die reale Plattform zurücksetzen (4T-1202).
  setPlatformForTests(undefined);
});

describe('hexToColorref (4T-0630)', () => {
  it('rechnet #rrggbb in das little-endian COLORREF 0x00BBGGRR um', () => {
    expect(hexToColorref('#1a73e8')).toBe(0x00e8731a);
    expect(hexToColorref('#ffffff')).toBe(0x00ffffff);
    expect(hexToColorref('#202124')).toBe(0x00242120);
  });

  it('akzeptiert Großbuchstaben als gleichwertig', () => {
    expect(hexToColorref('#1A73E8')).toBe(0x00e8731a);
  });

  it('liefert null bei ungültigem Input', () => {
    expect(hexToColorref(null)).toBeNull();
    expect(hexToColorref('')).toBeNull();
    expect(hexToColorref('fff')).toBeNull();
    expect(hexToColorref('#12345')).toBeNull();
    expect(hexToColorref('#gggggg')).toBeNull();
  });
});

describe('captionColorsFor (4T-0630)', () => {
  it('blue light: Werte aus VALUES/TEXT_VALUES', () => {
    expect(captionColorsFor('blue', false)).toEqual({
      caption: hexToColorref(TAB_GROUP_COLOR_VALUES.blue),
      text: hexToColorref(TAB_GROUP_COLOR_TEXT_VALUES.blue),
    });
  });

  it('blue dark: Werte aus VALUES_DARK/TEXT_VALUES_DARK', () => {
    expect(captionColorsFor('blue', true)).toEqual({
      caption: hexToColorref(TAB_GROUP_COLOR_VALUES_DARK.blue),
      text: hexToColorref(TAB_GROUP_COLOR_TEXT_VALUES_DARK.blue),
    });
  });

  it('yellow light: heller Grund, dunkler Text (#202124)', () => {
    const colors = captionColorsFor('yellow', false);
    expect(colors.caption).toBe(hexToColorref(TAB_GROUP_COLOR_VALUES.yellow));
    // Gelb ist die Ausnahme mit dunklem Text im Light-Theme.
    expect(colors.text).toBe(hexToColorref('#202124'));
  });

  it('liefert null bei unbekanntem Key', () => {
    expect(captionColorsFor('neon', false)).toBeNull();
    expect(captionColorsFor('neon', true)).toBeNull();
  });
});

describe('applyCaptionColor: Färbung (4T-0630)', () => {
  it('setzt Attribut 35 (Caption) und 36 (Text) mit dem HWND aus dem Handle', () => {
    const calls = [];
    setDwmCallForTests((hwnd, attr, value) => {
      calls.push({ hwnd, attr, value });
      return 0;
    });
    const buf = handle8();
    const expectedHwnd = buf.readBigInt64LE(0);
    const expected = captionColorsFor('blue', false);

    expect(applyCaptionColor(buf, 'blue', false)).toBe(true);
    expect(calls).toEqual([
      { hwnd: expectedHwnd, attr: DWMWA_CAPTION_COLOR, value: expected.caption },
      { hwnd: expectedHwnd, attr: DWMWA_TEXT_COLOR, value: expected.text },
    ]);
  });

  it('nutzt die Dark-Werte, wenn dark gesetzt ist', () => {
    const calls = [];
    setDwmCallForTests((hwnd, attr, value) => {
      calls.push({ attr, value });
      return 0;
    });
    const expected = captionColorsFor('blue', true);

    expect(applyCaptionColor(handle8(), 'blue', true)).toBe(true);
    expect(calls).toEqual([
      { attr: DWMWA_CAPTION_COLOR, value: expected.caption },
      { attr: DWMWA_TEXT_COLOR, value: expected.text },
    ]);
  });

  it('colorKey null setzt beide Attribute auf DWMWA_COLOR_DEFAULT zurück', () => {
    const calls = [];
    setDwmCallForTests((hwnd, attr, value) => {
      calls.push({ attr, value });
      return 0;
    });

    expect(applyCaptionColor(handle8(), null, false)).toBe(true);
    expect(calls).toEqual([
      { attr: DWMWA_CAPTION_COLOR, value: DWMWA_COLOR_DEFAULT },
      { attr: DWMWA_TEXT_COLOR, value: DWMWA_COLOR_DEFAULT },
    ]);
  });

  it('unbekannter colorKey verhält sich wie ein Reset', () => {
    const calls = [];
    setDwmCallForTests((hwnd, attr, value) => {
      calls.push({ attr, value });
      return 0;
    });

    expect(applyCaptionColor(handle8(), 'neon', true)).toBe(true);
    expect(calls).toEqual([
      { attr: DWMWA_CAPTION_COLOR, value: DWMWA_COLOR_DEFAULT },
      { attr: DWMWA_TEXT_COLOR, value: DWMWA_COLOR_DEFAULT },
    ]);
  });
});

// 4T-1202 (Epic 3E-0121): Ausdrückliches Plattform-Gate — auf Nicht-Windows-
// Plattformen findet kein Färbungs-Versuch statt (kein Kanal-Aufruf, kein
// Log), die Funktion entfällt dort ersatzlos (PO-Entscheidung vom 2026-08-25).
describe('applyCaptionColor: Plattform-Gate (4T-1202)', () => {
  for (const p of ['linux', 'darwin']) {
    it(`${p}: false ohne Kanal-Aufruf und ohne Log`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let count = 0;
      setDwmCallForTests(() => {
        count++;
        return 0;
      });
      setPlatformForTests(p);

      expect(applyCaptionColor(handle8(), 'blue', false)).toBe(false);
      expect(count).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    });
  }

  it('win32: Färbung läuft unverändert (Gate greift nicht)', () => {
    const calls = [];
    setDwmCallForTests((hwnd, attr, value) => {
      calls.push({ attr, value });
      return 0;
    });
    setPlatformForTests('win32');

    expect(applyCaptionColor(handle8(), 'blue', false)).toBe(true);
    expect(calls).toHaveLength(2);
  });
});

describe('applyCaptionColor: unbrauchbares Handle (4T-0630)', () => {
  it('liefert false ohne Fake-Aufruf bei Nicht-Buffer oder zu kurzem Buffer', () => {
    let count = 0;
    setDwmCallForTests(() => {
      count++;
      return 0;
    });

    expect(applyCaptionColor(null, 'blue', false)).toBe(false);
    expect(applyCaptionColor(Buffer.alloc(4), 'blue', false)).toBe(false);
    expect(count).toBe(0);
  });
});

describe('applyCaptionColor: Fehler-Fallback deaktiviert den Kanal (4T-0630)', () => {
  it('Fehl-HRESULT beim ersten Aufruf: false, kein zweiter Attribut-Aufruf, ein Log', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let count = 0;
    setDwmCallForTests(() => {
      count++;
      return 1; // HRESULT ungleich 0
    });
    const buf = handle8();

    expect(applyCaptionColor(buf, 'blue', false)).toBe(false);
    // Nur der erste Attribut-Aufruf (Caption) lief; der Text-Aufruf entfällt.
    expect(count).toBe(1);

    // Zweiter Färbungs-Versuch löst keinen weiteren Fake-Aufruf aus.
    expect(applyCaptionColor(buf, 'blue', false)).toBe(false);
    expect(count).toBe(1);

    // Genau ein Log pro Deaktivierung.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('werfender Aufruf: false, kein Folge-Aufruf, ein Log', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let count = 0;
    setDwmCallForTests(() => {
      count++;
      throw new Error('DWM boom');
    });
    const buf = handle8();

    expect(applyCaptionColor(buf, 'blue', false)).toBe(false);
    expect(count).toBe(1);

    expect(applyCaptionColor(buf, 'blue', false)).toBe(false);
    expect(count).toBe(1);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

// Palette-Erweiterung für die Titelleisten-Färbung: die drei in 4T-0630
// hinzugekommenen Wert-Objekte plus das Bestands-Objekt tragen exakt die acht
// Paletten-Keys und ausschließlich #rrggbb-Werte (Basis der DWM-Umrechnung).
describe('tab-group-colors: Paletten-Vollständigkeit (4T-0630)', () => {
  const objects = {
    TAB_GROUP_COLOR_VALUES,
    TAB_GROUP_COLOR_VALUES_DARK,
    TAB_GROUP_COLOR_TEXT_VALUES,
    TAB_GROUP_COLOR_TEXT_VALUES_DARK,
  };

  for (const [name, values] of Object.entries(objects)) {
    it(`${name} trägt genau die acht Paletten-Keys mit #rrggbb-Werten`, () => {
      expect(Object.keys(values).sort()).toEqual([...TAB_GROUP_COLOR_KEYS].sort());
      for (const key of TAB_GROUP_COLOR_KEYS) {
        expect(values[key]).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  }
});
