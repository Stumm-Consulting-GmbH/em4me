// 4T-002021 (Epic 3E-000192): Angaben, die jeder Aufrufer dem gemeinsamen
// Zeichner gleich mitgibt — die beiden Reihen-Paletten und die
// Vorlese-Beschreibung (src/shared/charts/chart-call-options.js).
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  DARK_CHART_PALETTE,
  LIGHT_CHART_PALETTE,
  chartDescription,
  chartDescriptionTexts,
} from '../../src/shared/charts/chart-call-options.js';
import {
  BASE_DEFAULTS,
  DEFAULT_DARK_ID,
  DEFAULT_LIGHT_ID,
  builtinById,
  resolveSchemeColors,
} from '../../src/shared/color-schemes.js';

// Kontrast nach WCAG 2 (relative Leuchtdichte), wie ihn die
// Oberflächen-Leitlinien für Farben ansetzen.
function leuchtdichte(hex) {
  const kanal = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(1) + 0.7152 * kanal(3) + 0.0722 * kanal(5);
}

function kontrast(a, b) {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
}

// sRGB -> CIE Lab (D65) und der Abstand ΔE*ab (CIE 1976).
function lab(hex) {
  const lin = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a, b) {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe('Reihen-Paletten je Modus (4T-002021, D6)', () => {
  it('zehn Farben je Palette, unveränderlich', () => {
    expect(LIGHT_CHART_PALETTE).toHaveLength(10);
    expect(DARK_CHART_PALETTE).toHaveLength(10);
    // 4T-002030: Die Wahl nach dem Modus ist entfallen; die Anzeige liest die
    // Reihen-Farben aus dem Farbschema, dessen Basis-Werte diese Paletten sind
    // (Gleichheit geprüft in test/unit/color-schemes.test.js).
    expect(Object.isFrozen(LIGHT_CHART_PALETTE)).toBe(true);
    expect(Object.isFrozen(DARK_CHART_PALETTE)).toBe(true);
  });

  it('jede Farbe beider Paletten erreicht 3:1 gegen ihre Standard-Hintergründe', () => {
    // Linien, Balken und Kreis-Stücke sind grafische Bedeutungsträger und
    // brauchen 3:1 gegen den Hintergrund. Geprüft gegen den Hintergrund des
    // Grund-Schemas, den des voreingestellten Schemas des Modus und für Hell
    // zusätzlich gegen Weiß (Entscheidung der steuernden Sitzung vom
    // 2026-09-29, 4T-002021).
    const hintergruende = {
      hell: [
        '#ffffff',
        BASE_DEFAULTS.light.bg,
        resolveSchemeColors(builtinById(DEFAULT_LIGHT_ID)).bg,
      ],
      dunkel: [BASE_DEFAULTS.dark.bg, resolveSchemeColors(builtinById(DEFAULT_DARK_ID)).bg],
    };
    const befunde = [];
    for (const [art, palette] of [
      ['hell', LIGHT_CHART_PALETTE],
      ['dunkel', DARK_CHART_PALETTE],
    ]) {
      for (const hintergrund of hintergruende[art]) {
        for (const farbe of palette) {
          const k = kontrast(farbe, hintergrund);
          if (k < 3) befunde.push(`${art} ${farbe} gegen ${hintergrund}: ${k.toFixed(2)}`);
        }
      }
    }
    expect(befunde).toEqual([]);
  });

  it('benachbarte Farben beider Paletten liegen mindestens 15 Lab-Einheiten auseinander', () => {
    // Farbabstand ΔE*ab (CIE 1976) im Lab-Raum, Weißpunkt D65. Mindestwert 15:
    // rund das Sechsfache der üblich angesetzten Wahrnehmungsschwelle von 2,3,
    // weil die Farben als schmale Linien und kleine Legenden-Marken
    // nebeneinander stehen und ohne Vergleichs-Fläche unterschieden werden
    // müssen. Gemessen am 2026-09-29: kleinster Abstand hell 16,5 (Braun zu
    // Grau-Braun), dunkel 21,9 (Violett zu Rosa).
    const befunde = [];
    for (const [art, palette] of [
      ['hell', LIGHT_CHART_PALETTE],
      ['dunkel', DARK_CHART_PALETTE],
    ]) {
      for (let i = 0; i + 1 < palette.length; i++) {
        const d = deltaE(palette[i], palette[i + 1]);
        if (d < 15) befunde.push(`${art} ${palette[i]} / ${palette[i + 1]}: ${d.toFixed(1)}`);
      }
    }
    expect(befunde).toEqual([]);
  });

  it('dieselbe Reihenfolge der Farbtöne in beiden Paletten', () => {
    // Farbton je Eintrag grob in Sechsteln des Farbkreises; Grau und Braun
    // haben kaum Sättigung und werden über ihren Platz verglichen.
    const farbton = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 0.08) return 'grau';
      let h;
      if (max === r) h = ((g - b) / (max - min) + 6) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      return Math.round(h * 60);
    };
    for (let i = 0; i < 10; i++) {
      const hell = farbton(LIGHT_CHART_PALETTE[i]);
      const dunkel = farbton(DARK_CHART_PALETTE[i]);
      if (hell === 'grau' || dunkel === 'grau') {
        expect(i, `Eintrag ${i}`).toBe(9);
        continue;
      }
      const abstand = Math.min(Math.abs(hell - dunkel), 360 - Math.abs(hell - dunkel));
      expect(
        abstand,
        `Eintrag ${i}: ${LIGHT_CHART_PALETTE[i]} / ${DARK_CHART_PALETTE[i]}`,
      ).toBeLessThan(25);
    }
  });
});

describe('Vorlese-Beschreibung (4T-002021, D8)', () => {
  const TEXTE = {
    bar: 'Balkendiagramm mit {series} und {categories}',
    seriesOne: '1 Datenreihe',
    seriesOther: '{n} Datenreihen',
    categoriesOne: '1 Rubrik',
    categoriesOther: '{n} Rubriken',
  };

  it('Mehrzahl und Einzahl je Zahl', () => {
    expect(chartDescription(TEXTE, 'bar', 2, 6)).toBe(
      'Balkendiagramm mit 2 Datenreihen und 6 Rubriken',
    );
    expect(chartDescription(TEXTE, 'bar', 1, 1)).toBe(
      'Balkendiagramm mit 1 Datenreihe und 1 Rubrik',
    );
  });

  it('ohne Vorlage der Art oder ohne Texte keine Beschreibung', () => {
    expect(chartDescription(TEXTE, 'line', 1, 2)).toBeNull();
    expect(chartDescription(null, 'bar', 1, 2)).toBeNull();
  });

  it('ein Dollar-Zeichen im Text ist kein Ersetzungs-Muster', () => {
    const texte = { ...TEXTE, bar: 'Balken $& {series} / {categories}' };
    expect(chartDescription(texte, 'bar', 2, 3)).toBe('Balken $& 2 Datenreihen / 3 Rubriken');
  });
});

describe('Texte der Vorlese-Beschreibung für jeden Aufrufer (4T-002025)', () => {
  it('liest die acht Schlüssel über die mitgegebene Übersetzungs-Funktion', () => {
    const gefragt = [];
    const texte = chartDescriptionTexts((key) => {
      gefragt.push(key);
      return `<${key}>`;
    });
    expect(texte).toEqual({
      line: '<chart.description.line>',
      bar: '<chart.description.bar>',
      pie: '<chart.description.pie>',
      donut: '<chart.description.donut>',
      seriesOne: '<chart.count.series.one>',
      seriesOther: '<chart.count.series.other>',
      categoriesOne: '<chart.count.categories.one>',
      categoriesOther: '<chart.count.categories.other>',
    });
    expect(gefragt).toHaveLength(8);
  });

  it('jeder Schlüssel steht im deutschen Fragment, und die Beschreibung entsteht daraus', () => {
    const katalog = JSON.parse(
      readFileSync(new URL('../../src/i18n/fragments/de/chart.json', import.meta.url), 'utf8'),
    );
    const texte = chartDescriptionTexts((key) => katalog[key]);
    for (const wert of Object.values(texte)) expect(typeof wert).toBe('string');
    expect(chartDescription(texte, 'bar', 2, 6)).toContain('2');
    expect(chartDescription(texte, 'bar', 2, 6)).toContain('6');
  });
});
