// 4T-002020 (Epic 3E-000192): der gemeinsame Zeichner `drawChart` auf Apache
// ECharts — vier Arten, Titel, Vorlese-Angaben, Schrift und Farben je Aufruf,
// Laden der Bibliothek erst beim ersten Diagramm, und der Wächter der
// Text-Regel: Anwender-Text erscheint unverändert als Text und steht in keinem
// Attribut-Wert der Grafik.
//
// Geprüft wird an der erzeugten Grafik selbst, nicht an den Einstellungen der
// Bibliothek: Maßgeblich ist, was in der Ansicht ankommt. Der erzeugte Stand
// der Bibliothek entsteht im Vorlauf der Suite (scripts/build-echarts.js).
// Die Kriterien-Nummern AK1 bis AK11 sind die des Tasks.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  drawChart,
  CHART_DRAW_TYPES,
  LIGHT_CHART_COLORS,
  DEFAULT_CHART_FONT,
} from '../../src/shared/charts/chart-draw.js';

// Der Nachweis des späten Ladens arbeitet am Modul-Cache von Node und lädt den
// Zeichner dafür eigens frisch; alle übrigen Fälle nutzen den Import oben.
const require = createRequire(import.meta.url);
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHARTS = path.join(WURZEL, 'src', 'shared', 'charts');
const KERN = path.join(CHARTS, 'chart-draw.js');
const BUNDLE = path.join(CHARTS, 'echarts.bundle.js');

const FARBEN = {
  text: '#101010',
  muted: '#707070',
  background: '#fafafa',
  palette: ['#aa0000', '#00aa00', '#0000aa'],
};

const ZWEI_REIHEN = {
  type: 'bar',
  title: 'Umsatz',
  categories: ['Jan', 'Feb', 'Mär', 'Apr'],
  series: [
    { name: 'Einnahmen', values: [3, -1, null, 4] },
    { name: 'Ausgaben', values: [2, 2, 5, 1] },
  ],
};

// --- Lesen der Grafik ------------------------------------------------------

// Alle Tags samt ihrer Attribute. Die Grafik ist maschinell erzeugt und trägt
// Attribut-Werte stets in doppelten Anführungszeichen.
function tags(svg) {
  return [...svg.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>/g)].map((t) => ({
    name: t[1],
    attrs: Object.fromEntries(
      [...t[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] ?? '']),
    ),
  }));
}

const entschluesselt = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Die Text-Inhalte der sichtbaren Beschriftungen, entschlüsselt.
function texte(svg) {
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((t) => entschluesselt(t[1]));
}

function pfade(svg) {
  return tags(svg).filter((t) => t.name === 'path');
}

// Wohlgeformt als SVG: Ein unmaskierter Attribut-Wert zerbräche das Dokument.
function parse(svg) {
  const doc = new new JSDOM('').window.DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

// --- AK4, AK7: ohne DOM, Bibliothek erst beim ersten Diagramm ---------------

describe('Laden und Umgebung (AK4, AK7)', () => {
  it('lädt die Bibliothek erst beim ersten Aufruf, nicht beim Laden des Moduls', () => {
    for (const datei of [KERN, path.join(CHARTS, 'chart-draw-options.js'), BUNDLE])
      delete require.cache[datei];
    const frisch = require(KERN);
    expect(require.cache[BUNDLE]).toBeUndefined();
    frisch.drawChart(ZWEI_REIHEN);
    expect(require.cache[BUNDLE]).toBeDefined();
  });

  it('zeichnet synchron und ohne DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const svg = drawChart(ZWEI_REIHEN);
    expect(typeof svg).toBe('string');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 720 400"/);
    parse(svg);
  });

  it('keine Animation und keine Hervorhebung in der Grafik', () => {
    const svg = drawChart(ZWEI_REIHEN);
    expect(svg).not.toMatch(/@keyframes|<animate/);
    expect(svg).not.toMatch(/cursor:pointer/);
  });

  it('nimmt Ausmaße entgegen und hält die Vorgabe 720 × 400', () => {
    expect(drawChart(ZWEI_REIHEN, { width: 300, height: 200 })).toMatch(/viewBox="0 0 300 200"/);
  });

  it('wirft bei formal unbrauchbarer Eingabe einen TypeError', () => {
    expect(() => drawChart(null)).toThrow(TypeError);
    expect(() => drawChart({ ...ZWEI_REIHEN, type: 'area' })).toThrow(TypeError);
    expect(() => drawChart({ ...ZWEI_REIHEN, categories: 'Jan' })).toThrow(TypeError);
    expect(() => drawChart({ ...ZWEI_REIHEN, series: {} })).toThrow(TypeError);
    expect(() => drawChart({ ...ZWEI_REIHEN, series: [{ name: 'x', values: 'eins' }] })).toThrow(
      TypeError,
    );
    expect(() => drawChart({ ...ZWEI_REIHEN, series: [{ name: 'x', values: ['1'] }] })).toThrow(
      TypeError,
    );
  });

  it('wirft bei Angaben, die einen Attribut-Wert verlassen könnten', () => {
    expect(() => drawChart(ZWEI_REIHEN, { fontFamily: 'Arial"><script>' })).toThrow(TypeError);
    expect(() => drawChart(ZWEI_REIHEN, { fontFamily: 'Arial; color:red' })).toThrow(TypeError);
    expect(() => drawChart(ZWEI_REIHEN, { colors: { ...FARBEN, text: '#000"' } })).toThrow(
      TypeError,
    );
    expect(() => drawChart(ZWEI_REIHEN, { idPrefix: 'a b' })).toThrow(TypeError);
    // Eine halbe Farb-Angabe fällt nicht still auf die Vorgabe zurück.
    expect(() => drawChart(ZWEI_REIHEN, { colors: { text: '#000' } })).toThrow(TypeError);
  });

  it('ignoriert die Felder drawable und omitted der zeichenbaren Form', () => {
    const mit = drawChart({ ...ZWEI_REIHEN, drawable: true, omitted: 1 }, { idPrefix: 'g' });
    expect(mit).toBe(drawChart(ZWEI_REIHEN, { idPrefix: 'g' }));
  });
});

// --- AK1, AK5: die vier Arten ------------------------------------------------

describe('Die vier Arten (AK1, AK5)', () => {
  it('kennt genau Linie, Balken, Kreis und Donut', () => {
    expect([...CHART_DRAW_TYPES]).toEqual(['line', 'bar', 'pie', 'donut']);
  });

  // Ein Balken ist ein Rechteck-Pfad «M x y l b 0 l 0 h l -b 0 Z»; die Legende
  // zeichnet ihr Zeichen mit Bögen und fällt dadurch heraus.
  const BALKEN = /^M(-?[\d.]+) (-?[\d.]+)l([\d.]+) 0l0 (-?[\d.]+)l-[\d.]+ 0Z$/;
  const balken = (svg, farbe) =>
    pfade(svg)
      .filter((p) => p.attrs.fill === farbe && BALKEN.test(p.attrs.d))
      .map((p) => {
        const [, x, y, b, h] = p.attrs.d.match(BALKEN);
        return { x: Number(x), y: Number(y), breite: Number(b), hoehe: Number(h) };
      });

  it('Balken: je Wert ein Balken, zwei Reihen nebeneinander, negativer Wert unter der Null', () => {
    const svg = drawChart(ZWEI_REIHEN, { colors: FARBEN });
    const erste = balken(svg, '#aa0000');
    const zweite = balken(svg, '#00aa00');
    // Die Lücke der ersten Reihe hat keinen Balken.
    expect(erste).toHaveLength(3);
    expect(zweite).toHaveLength(4);
    // Nebeneinander statt übereinander: gleiche Rubrik, verschiedene Lage.
    expect(zweite[0].x).toBeGreaterThan(erste[0].x);
    expect(zweite[0].x).toBeGreaterThanOrEqual(erste[0].x + erste[0].breite);
    // Alle Balken stehen auf derselben Null-Linie; der negative wächst nach
    // unten (positive Höhe im Bild), die positiven nach oben.
    const nulllinie = erste[0].y;
    for (const b of [...erste, ...zweite]) expect(b.y).toBeCloseTo(nulllinie, 0);
    expect(erste[0].hoehe).toBeLessThan(0);
    expect(erste[1].hoehe).toBeGreaterThan(0);
  });

  it('Linie: je Reihe ein Linien-Zug, bei einer Lücke unterbrochen', () => {
    const svg = drawChart({ ...ZWEI_REIHEN, type: 'line' }, { colors: FARBEN });
    const zug = (farbe) =>
      pfade(svg).filter(
        (p) =>
          p.attrs.stroke === farbe && p.attrs.fill === 'none' && p.attrs['stroke-width'] === '2',
      );
    const [erste] = zug('#aa0000');
    const [zweite] = zug('#00aa00');
    // Erste Reihe [3, -1, null, 4]: Nach der Lücke setzt der Zug neu an.
    expect(erste.attrs.d.match(/M/g)).toHaveLength(2);
    expect(zweite.attrs.d.match(/M/g)).toHaveLength(1);
    expect(zweite.attrs.d.match(/L/g)).toHaveLength(3);
  });

  it('Linie und Balken tragen eine Legende mit dem Namen jeder Reihe', () => {
    for (const type of ['line', 'bar']) {
      const t = texte(drawChart({ ...ZWEI_REIHEN, type }));
      expect(t).toContain('Einnahmen');
      expect(t).toContain('Ausgaben');
    }
  });

  const kreis = {
    type: 'pie',
    title: null,
    categories: ['Miete', 'Essen', 'Rest', 'Reise'],
    series: [{ name: 'Ausgaben', values: [50, 30, null, 20] }],
  };
  const stuecke = (svg) =>
    pfade(svg).filter((p) => FARBEN.palette.includes(p.attrs.fill) && /A/.test(p.attrs.d));

  it('Kreis: je Wert ein Stück mit einem Bogen, je Stück eine Beschriftung', () => {
    const svg = drawChart(kreis, { colors: FARBEN });
    const s = stuecke(svg);
    expect(s).toHaveLength(3);
    for (const p of s) expect(p.attrs.d.match(/A/g)).toHaveLength(1);
    expect(texte(svg)).toEqual(expect.arrayContaining(['Miete', 'Essen', 'Reise']));
    expect(texte(svg)).not.toContain('Rest');
  });

  it('Donut: je Wert ein Ring-Stück mit Außen- und Innenbogen, je Stück eine Beschriftung', () => {
    const svg = drawChart({ ...kreis, type: 'donut' }, { colors: FARBEN });
    const s = stuecke(svg);
    expect(s).toHaveLength(3);
    for (const p of s) expect(p.attrs.d.match(/A/g)).toHaveLength(2);
    expect(texte(svg)).toEqual(expect.arrayContaining(['Miete', 'Essen', 'Reise']));
  });

  it('Kreis und Donut beschriften je Stück mit dem Namen der Rubrik, Vorlagen-Zeichen bleiben', () => {
    // Die Vorlagen der Bibliothek ersetzten `{c}` durch den Wert und `{b}` durch
    // den Namen; die Beschriftung läuft deshalb über eine Funktion.
    for (const type of ['pie', 'donut']) {
      const svg = drawChart({
        type,
        title: null,
        categories: ['{c}', '{b} und {a}', 'Rest'],
        series: [{ name: 'Anteile', values: [10, 20, 30] }],
      });
      const t = texte(svg);
      expect(t).toEqual(expect.arrayContaining(['{c}', '{b} und {a}', 'Rest']));
      expect(t).not.toContain('10');
    }
  });

  it('dünnt viele Rubriken auf der Achse aus', () => {
    const viele = Array.from({ length: 200 }, (_, i) => `Rubrik ${i + 1}`);
    const svg = drawChart({
      type: 'line',
      title: null,
      categories: viele,
      series: [{ name: 'Reihe', values: viele.map((_, i) => i) }],
    });
    const gezeigt = texte(svg).filter((t) => t.startsWith('Rubrik '));
    expect(gezeigt.length).toBeGreaterThan(1);
    expect(gezeigt.length).toBeLessThan(viele.length / 4);
  });

  // 4T-002026 (Entscheidung vom 2026-09-30): Kreis und Donut zeichnen keine
  // Beschriftung, die eine andere überdecken würde; bei wenigen Stücken bleibt
  // jede stehen. Gemessen am erzeugten SVG ohne Browser.
  const kreisMit = (type, n) => {
    const namen = Array.from({ length: n }, (_, i) => `S${String(i + 1).padStart(4, '0')}`);
    return {
      namen,
      svg: drawChart(
        {
          type,
          title: null,
          categories: namen,
          series: [{ name: 'Anteil', values: namen.map((_, i) => 100 + ((i * 37) % 400)) }],
        },
        { description: `Kreis mit ${n} Stücken` },
      ),
    };
  };

  it('Kreis und Donut mit 5, 12 und 40 Stücken beschriften jedes Stück', () => {
    for (const type of ['pie', 'donut']) {
      for (const n of [5, 12, 40]) {
        const { namen, svg } = kreisMit(type, n);
        expect(
          texte(svg)
            .filter((t) => /^S\d{4}$/.test(t))
            .sort(),
          `${type} ${n}`,
        ).toEqual(namen);
      }
    }
  });

  it('Kreis und Donut mit 1000 Stücken zeichnen nur die Beschriftungen, die Platz haben', () => {
    for (const type of ['pie', 'donut']) {
      const { svg } = kreisMit(type, 1000);
      const gezeigt = texte(svg).filter((t) => /^S\d{4}$/.test(t));
      expect(gezeigt.length, type).toBeGreaterThan(10);
      expect(gezeigt.length, type).toBeLessThan(200);
      // Die Beschreibung für Hilfstechnik bleibt, wie der Aufrufer sie reicht.
      expect(parse(svg).querySelector('desc').textContent).toBe('Kreis mit 1000 Stücken');
    }
  });
});

// --- AK2, AK8: Titel und Vorlese-Angaben -------------------------------------

describe('Titel und Vorlese-Angaben (AK2, AK8)', () => {
  it('ein angegebener Titel erscheint am Diagramm und als Vorlese-Titel', () => {
    const svg = drawChart(ZWEI_REIHEN, { idPrefix: 'd1', description: 'Balken-Diagramm' });
    expect(texte(svg)).toContain('Umsatz');
    const doc = parse(svg);
    const wurzel = doc.documentElement;
    expect(wurzel.getAttribute('role')).toBe('img');
    expect(wurzel.getAttribute('aria-labelledby')).toBe('d1-title');
    expect(wurzel.getAttribute('aria-describedby')).toBe('d1-desc');
    expect(doc.getElementById('d1-title').textContent).toBe('Umsatz');
    expect(doc.getElementById('d1-desc').textContent).toBe('Balken-Diagramm');
  });

  it('ohne Titel erscheint kein Titel; der Vorlese-Titel trägt die Beschreibung', () => {
    const ohne = { ...ZWEI_REIHEN, title: null };
    const svg = drawChart(ohne, { idPrefix: 'd2', description: 'Zwei Reihen' });
    expect(texte(svg)).not.toContain('Umsatz');
    expect(svg).not.toMatch(/font-weight:bold/);
    const doc = parse(svg);
    expect(doc.getElementById('d2-title').textContent).toBe('Zwei Reihen');
    expect(doc.getElementById('d2-desc').textContent).toBe('Zwei Reihen');
  });

  it('ohne Titel und Beschreibung entfallen Vorlese-Titel und Verweise, die Rolle bleibt', () => {
    const svg = drawChart({ ...ZWEI_REIHEN, title: null }, { idPrefix: 'd3' });
    const doc = parse(svg);
    expect(doc.documentElement.getAttribute('role')).toBe('img');
    expect(doc.documentElement.hasAttribute('aria-labelledby')).toBe(false);
    expect(doc.documentElement.hasAttribute('aria-describedby')).toBe(false);
    expect(doc.getElementsByTagName('title')).toHaveLength(0);
    expect(doc.getElementsByTagName('desc')).toHaveLength(0);
  });

  it('Kennungen der Grafik tragen das Präfix des Aufrufers; gleiche Eingabe, gleiche Grafik', () => {
    const a = drawChart({ ...ZWEI_REIHEN, type: 'line' }, { idPrefix: 'dia-7' });
    // Ein anderer Aufruf dazwischen darf die Ausgabe nicht verändern: Die
    // Grafik hängt nicht vom Aufruf-Verlauf ab (fortlaufende Zähler der
    // Bibliothek).
    drawChart({ ...ZWEI_REIHEN, type: 'donut' }, { idPrefix: 'anders' });
    const b = drawChart({ ...ZWEI_REIHEN, type: 'line' }, { idPrefix: 'dia-7' });
    expect(a).toBe(b);
    expect(a).not.toMatch(/\bzr\d+-/);
    expect(a).not.toMatch(/ecmeta_/);
    for (const t of tags(a)) {
      if (t.attrs.id) expect(t.attrs.id.startsWith('dia-7-')).toBe(true);
    }
  });

  it('Stil-Block und Klassen der Bibliothek entfallen', () => {
    const svg = drawChart(ZWEI_REIHEN, { idPrefix: 's' });
    expect(svg).not.toMatch(/<style/);
    expect(svg).not.toMatch(/CDATA/);
    for (const t of tags(svg)) expect(t.attrs.class).toBeUndefined();
  });
});

// --- Zahlen der Wert-Achse -----------------------------------------------------

describe('Zahlen der Wert-Achse in der Schreibweise der Datentabelle', () => {
  const zahlen = (svg) => texte(svg).filter((t) => /^-?[\d.,]+$/.test(t));

  it('Punkt-Dezimal ohne Tausender-Gruppierung', () => {
    const svg = drawChart({
      type: 'bar',
      title: null,
      categories: ['a', 'b', 'c'],
      series: [{ name: 'x', values: [1000, 2500, 3000] }],
    });
    const z = zahlen(svg);
    expect(z.length).toBeGreaterThan(2);
    for (const t of z) expect(t).not.toContain(',');
    expect(z).toContain('1000');
  });

  it('ohne Gleitkomma-Reste der Achsen-Teilung', () => {
    const svg = drawChart({
      type: 'line',
      title: null,
      categories: ['a', 'b', 'c'],
      series: [{ name: 'x', values: [0.1, 0.2, 0.3] }],
    });
    const z = zahlen(svg);
    expect(z.length).toBeGreaterThan(2);
    for (const t of z) expect(t).toMatch(/^-?\d+(\.\d{1,6})?$/);
    expect(z).toContain('0.3');
  });
});

// --- AK10, AK11: Schrift und Farben -------------------------------------------

describe('Schrift und Farben (AK10, AK11)', () => {
  it('jede Beschriftung trägt die übergebene Schrift', () => {
    const schrift = "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
    const svg = drawChart(ZWEI_REIHEN, { fontFamily: schrift });
    const textTags = tags(svg).filter((t) => t.name === 'text');
    expect(textTags.length).toBeGreaterThan(5);
    for (const t of textTags) expect(t.attrs.style).toContain(`font-family:${schrift};`);
  });

  it('ohne Angabe gilt die Vorgabe aus generischen Schrift-Familien, nie die der Bibliothek', () => {
    expect(DEFAULT_CHART_FONT).toBe('system-ui, sans-serif');
    const svg = drawChart(ZWEI_REIHEN);
    for (const t of tags(svg).filter((x) => x.name === 'text'))
      expect(t.attrs.style).toContain(`font-family:${DEFAULT_CHART_FONT};`);
  });

  it('übergebene Farbwerte: Text, Achsen, Hintergrund und Reihen', () => {
    const svg = drawChart(ZWEI_REIHEN, { colors: FARBEN });
    const alle = tags(svg);
    const titel = alle.find((t) => t.name === 'text' && /font-weight:bold/.test(t.attrs.style));
    expect(titel.attrs.fill).toBe('#101010');
    expect(alle.some((t) => t.name === 'text' && t.attrs.fill === '#707070')).toBe(true);
    expect(alle.find((t) => t.name === 'rect').attrs.fill).toBe('#fafafa');
    expect(alle.some((t) => t.attrs.fill === '#aa0000')).toBe(true);
    expect(alle.some((t) => t.attrs.fill === '#00aa00')).toBe(true);
  });

  it('die helle Vorgabe liegt vor und gilt ohne Farb-Angabe', () => {
    expect(LIGHT_CHART_COLORS).toMatchObject({
      text: expect.stringMatching(/^#/),
      muted: expect.stringMatching(/^#/),
      background: 'transparent',
    });
    expect(LIGHT_CHART_COLORS.palette.length).toBeGreaterThanOrEqual(8);
    const svg = drawChart(ZWEI_REIHEN);
    expect(tags(svg).some((t) => t.attrs.fill === LIGHT_CHART_COLORS.palette[0])).toBe(true);
    expect(tags(svg).some((t) => t.attrs.fill === LIGHT_CHART_COLORS.text)).toBe(true);
  });

  // 4T-002030 (Epic 3E-000192, Story 4S-001027 AK3 und AK12): Die erste Reihe
  // trägt die erste Farbe des Farbschemas, die zweite die zweite; bei Kreis und
  // Donut je Stück. Nach der zehnten beginnt die elfte wieder mit der ersten.
  const ZEHN = Array.from({ length: 10 }, (_, i) => `#0000${(0xa0 + i).toString(16)}`);
  const ZWOELF = Array.from({ length: 12 }, (_, i) => `K${i + 1}`);
  const MIT_ZEHN = { colors: { ...FARBEN, palette: ZEHN } };
  const ERWARTET = [...ZEHN, ZEHN[0], ZEHN[1]];

  it('Kreis und Donut mit zwölf Stücken: Farben der Reihe nach, das elfte wieder mit der ersten', () => {
    for (const type of ['pie', 'donut']) {
      const svg = drawChart(
        {
          type,
          title: null,
          categories: ZWOELF,
          series: [{ name: 'S', values: ZWOELF.map((_, i) => i + 1) }],
        },
        MIT_ZEHN,
      );
      const stuecke = pfade(svg).filter((p) => ZEHN.includes(p.attrs.fill) && /A/.test(p.attrs.d));
      expect(
        stuecke.map((p) => p.attrs.fill),
        type,
      ).toEqual(ERWARTET);
    }
  });

  it('Balken und Linie mit zwölf Reihen: Farben der Reihe nach, die elfte wieder mit der ersten', () => {
    const daten = {
      type: 'bar',
      title: null,
      categories: ['A'],
      series: ZWOELF.map((name, i) => ({ name, values: [i + 1] })),
    };
    // Je Reihe ein Balken, danach je Reihe ein Zeichen der Legende.
    const balken = pfade(drawChart(daten, MIT_ZEHN))
      .map((p) => p.attrs.fill)
      .filter((f) => ZEHN.includes(f));
    expect(balken).toEqual([...ERWARTET, ...ERWARTET]);
    const linie = tags(drawChart({ ...daten, type: 'line', categories: ['A', 'B'] }, MIT_ZEHN))
      .filter((t) => t.name === 'path' && ZEHN.includes(t.attrs.stroke))
      .map((t) => t.attrs.stroke);
    expect([...new Set(linie)]).toEqual(ZEHN);
    expect(linie.filter((f) => f === ZEHN[0]).length).toBe(
      2 * linie.filter((f) => f === ZEHN[2]).length,
    );
  });
});

// --- AK3, AK9: Wächter der Text-Regel ----------------------------------------

describe('Wächter: Anwender-Text als Text, in keinem Attribut-Wert (AK3, AK9)', () => {
  // Die Sonderzeichen-Fälle der Technik-Probe, dazu Muster, die eine Vorlage
  // oder Stil-Auszeichnung der Bibliothek auslösen würden.
  const TITEL = 'Umsatz <b> & "Kosten" \'netto\' äöüß';
  const RUBRIKEN = ['A<&>', '"zitiert"', "'einfach'", 'Größe {b}', '{a|fett}'];
  const REIHEN = ['Reihe "1" <x> & {c}', "Plan 'B' äöü"];
  const EINGABE = (type) => ({
    type,
    title: TITEL,
    categories: RUBRIKEN,
    series: (type === 'pie' || type === 'donut' ? REIHEN.slice(0, 1) : REIHEN).map((name, i) => ({
      name,
      values: [1 + i, 2, 3, 4, 5],
    })),
  });
  const ANWENDER_TEXT = [TITEL, ...RUBRIKEN, ...REIHEN];
  // Kennzeichnende Bruchstücke, die in keinem Attribut-Wert stehen dürfen —
  // weder roh noch maskiert.
  const BRUCHSTUECKE = ['Umsatz', 'Kosten', 'zitiert', 'einfach', 'Größe', 'fett', 'Reihe', 'Plan'];

  for (const type of ['line', 'bar', 'pie', 'donut']) {
    it(`${type}: jeder Text erscheint unverändert als Text-Inhalt`, () => {
      const svg = drawChart(EINGABE(type), { description: 'Beschreibung', idPrefix: 'w' });
      const doc = parse(svg);
      const inhalte = [...doc.getElementsByTagName('text')].map((t) => t.textContent);
      expect(inhalte).toContain(TITEL);
      for (const r of RUBRIKEN) expect(inhalte).toContain(r);
      if (type === 'line' || type === 'bar') for (const r of REIHEN) expect(inhalte).toContain(r);
      expect(doc.getElementById('w-title').textContent).toBe(TITEL);
    });

    it(`${type}: kein Attribut-Wert trägt Text des Anwenders`, () => {
      const svg = drawChart(EINGABE(type), { description: 'Beschreibung', idPrefix: 'w' });
      const werte = tags(svg).flatMap((t) => Object.values(t.attrs));
      expect(werte.length).toBeGreaterThan(20);
      for (const wert of werte) {
        const klar = entschluesselt(wert);
        for (const text of ANWENDER_TEXT) expect(klar).not.toContain(text);
        for (const stueck of BRUCHSTUECKE) expect(klar).not.toContain(stueck);
      }
      // Gegenprobe über das geparste Dokument: kein Attribut irgendeines
      // Elements trägt ein Bruchstück.
      const doc = parse(svg);
      for (const el of doc.getElementsByTagName('*'))
        for (const attr of el.attributes)
          for (const stueck of BRUCHSTUECKE) expect(attr.value).not.toContain(stueck);
    });
  }
});
