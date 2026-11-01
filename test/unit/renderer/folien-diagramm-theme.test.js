// @vitest-environment jsdom
// 4T-002323 (Entscheidung F2 des Product Owners, Weg 1): Diagramme auf Folien
// folgen dem Theme der Folie, nicht dem der Anwendung.
//
// Gegenstand ist die Übergabe von außen: Mermaid (render-mermaid.js) und die
// Diagramme zu Tabellen (charts/chart-view.js) nehmen eine Hell-Dunkel-Angabe
// an, der Zwischenspeicher trägt sie im Schlüssel, ein Theme-Wechsel der
// Anwendung färbt einen Block mit Theme von außen nicht um, und jede
// eingesetzte Kopie eines Diagramms bekommt eigene Kennungen (Teil 1 der
// Aufgabe: Pfeilspitzen der Folie zeigten auf den Marker der verborgenen
// Lese-Ansicht). Dass die Folien-Fläche die Angabe hereinreicht, prüft
// presentation-pane.test.js; die Wirkung an der gestarteten Anwendung der
// Ablauf-Fall PR-31 in test/e2e/funktionen/praesentation.spec.js.
//
// Mermaid selbst ist eine Attrappe: Sie zeichnet ein kleines SVG mit Marker
// und Pfad und schreibt das konfigurierte Theme in die Stil-Regel, damit das
// Ergebnis zeigt, unter welchem Theme gezeichnet wurde.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const mermaidAufrufe = { initialize: [], run: [] };
let laufNummer = 0;
const attrappe = {
  initialize(cfg) {
    mermaidAufrufe.initialize.push(cfg.theme);
    attrappe.theme = cfg.theme;
  },
  async run({ nodes }) {
    mermaidAufrufe.run.push({ theme: attrappe.theme, zahl: nodes.length });
    for (const knoten of nodes) {
      laufNummer += 1;
      const id = `mermaid-${laufNummer}`;
      knoten.innerHTML =
        `<svg id="${id}" aria-roledescription="flowchart-v2">` +
        `<style>#${id} .node{fill:${attrappe.theme}}</style>` +
        `<marker id="${id}_flowchart-v2-pointEnd"></marker>` +
        `<path marker-end="url(#${id}_flowchart-v2-pointEnd)"></path></svg>`;
    }
  },
};

const buildChartAufrufe = [];
window.api.buildChart = (text, body, optionen) => {
  buildChartAufrufe.push(optionen);
  return { status: 'drawn', svg: '<svg role="img"></svg>', omitted: 0 };
};

const rm = await import('../../../src/renderer/modules/render-mermaid.js');
rm.setzeMermaidFuerTests(attrappe);
const { applyPerspectiveChartsIfPresent, zeichenAngabenDerAnsicht } =
  await import('../../../src/renderer/modules/charts/chart-view.js');
const { BASE_DEFAULTS, defaultState } = await import('../../../src/shared/color-schemes.js');
const { setColorSchemeState } = await import('../../../src/renderer/modules/color-schemes.js');

const QUELLE = 'flowchart LR\n  A --> B';

function mermaidContainer(quelle = QUELLE) {
  const div = document.createElement('div');
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'language-mermaid';
  code.textContent = quelle;
  pre.appendChild(code);
  div.appendChild(pre);
  document.body.appendChild(div);
  return div;
}

// Die Kennungen eines eingesetzten Diagramms und ob jeder marker-end-Verweis
// im Dokument den Marker DIESES Diagramms trifft.
function verweiseTreffenEigenenMarker(block) {
  const svg = block.querySelector('svg');
  return Array.from(svg.querySelectorAll('path[marker-end]')).every((p) => {
    const id = /url\(#([^)]+)\)/.exec(p.getAttribute('marker-end'))[1];
    const ziel = document.getElementById(id);
    return !!ziel && svg.contains(ziel);
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.setAttribute('data-theme', 'light');
  rm.mermaidRenderCache.clear();
  rm.resetMermaidConfiguredTheme();
  mermaidAufrufe.initialize.length = 0;
  mermaidAufrufe.run.length = 0;
  buildChartAufrufe.length = 0;
});

describe('Mermaid mit Theme von außen (4T-002323)', () => {
  it('mermaidThemeAus: light → default, dark → dark, sonst null', () => {
    expect(rm.mermaidThemeAus('light')).toBe('default');
    expect(rm.mermaidThemeAus('dark')).toBe('dark');
    expect(rm.mermaidThemeAus(null)).toBeNull();
    expect(rm.mermaidThemeAus('accent')).toBeNull();
  });

  it('dunkle Folie in heller Anwendung: gezeichnet unter dark, Schlüssel mit dark', async () => {
    const div = mermaidContainer();
    await rm.applyMermaidIfPresent(div, { theme: 'dark' });
    await rm.waitForMermaidIdle();
    const block = div.querySelector('.mermaid-block');
    expect(block.dataset.mermaidTheme).toBe('dark');
    expect(mermaidAufrufe.run).toEqual([{ theme: 'dark', zahl: 1 }]);
    expect(block.querySelector('style').textContent).toContain('fill:dark');
    expect(rm.mermaidRenderCache.has(rm.mermaidCacheKey('dark', QUELLE))).toBe(true);
    expect(rm.mermaidRenderCache.has(rm.mermaidCacheKey('default', QUELLE))).toBe(false);
  });

  it('helle Folie in dunkler Anwendung: gezeichnet unter default', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const div = mermaidContainer();
    await rm.applyMermaidIfPresent(div, { theme: 'light' });
    await rm.waitForMermaidIdle();
    const block = div.querySelector('.mermaid-block');
    expect(block.dataset.mermaidTheme).toBe('default');
    expect(mermaidAufrufe.run).toEqual([{ theme: 'default', zahl: 1 }]);
    expect(rm.mermaidRenderCache.has(rm.mermaidCacheKey('default', QUELLE))).toBe(true);
  });

  it('ohne Angabe bleibt alles beim Theme der Anwendung, ohne Merkmal am Block', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const div = mermaidContainer();
    await rm.applyMermaidIfPresent(div);
    await rm.waitForMermaidIdle();
    const block = div.querySelector('.mermaid-block');
    expect(block.dataset.mermaidTheme).toBeUndefined();
    expect(mermaidAufrufe.run).toEqual([{ theme: 'dark', zahl: 1 }]);
  });

  it('der Zwischenspeicher liefert der Folie nie das Bild im Theme der Anwendung', async () => {
    // Die Lese-Ansicht (hell) füllt den Speicher; die dunkle Folie derselben
    // Quelle zeichnet trotzdem neu und unter ihrem Theme.
    const lese = mermaidContainer();
    await rm.applyMermaidIfPresent(lese);
    await rm.waitForMermaidIdle();
    const folie = mermaidContainer();
    await rm.applyMermaidIfPresent(folie, { theme: 'dark' });
    await rm.waitForMermaidIdle();
    expect(mermaidAufrufe.run.map((r) => r.theme)).toEqual(['default', 'dark']);
    expect(folie.querySelector('style').textContent).toContain('fill:dark');
  });

  it('Theme-Wechsel der Anwendung färbt den Block der Folie nicht um', async () => {
    const lese = mermaidContainer();
    await rm.applyMermaidIfPresent(lese);
    const folie = mermaidContainer();
    await rm.applyMermaidIfPresent(folie, { theme: 'light' });
    await rm.waitForMermaidIdle();
    rm.mermaidRenderCache.clear();
    mermaidAufrufe.run.length = 0;
    document.documentElement.setAttribute('data-theme', 'dark');
    await rm.rerenderAllMermaidBlocks();
    expect(lese.querySelector('style').textContent).toContain('fill:dark');
    expect(folie.querySelector('style').textContent).toContain('fill:default');
    expect(mermaidAufrufe.run.map((r) => r.theme).sort()).toEqual(['dark', 'default']);
  });

  it('zwei Kopien desselben Diagramms aus dem Speicher: jede Pfeilspitze trifft ihren eigenen Marker', async () => {
    const lese = mermaidContainer();
    await rm.applyMermaidIfPresent(lese);
    await rm.waitForMermaidIdle();
    const folie = mermaidContainer();
    await rm.applyMermaidIfPresent(folie);
    await rm.waitForMermaidIdle();
    // Ein Lauf: die Folie kam aus dem Zwischenspeicher.
    expect(mermaidAufrufe.run).toHaveLength(1);
    const a = lese.querySelector('svg').id;
    const b = folie.querySelector('svg').id;
    expect(a).not.toBe(b);
    expect(verweiseTreffenEigenenMarker(lese.querySelector('.mermaid-block'))).toBe(true);
    expect(verweiseTreffenEigenenMarker(folie.querySelector('.mermaid-block'))).toBe(true);
    // Die Stil-Regel folgt der neuen Kennung.
    expect(folie.querySelector('style').textContent).toContain(`#${b} `);
  });

  it('eigeneSvgKennungen lässt ein Bild ohne Kennung unverändert', () => {
    expect(rm.eigeneSvgKennungen('<svg><path/></svg>')).toBe('<svg><path/></svg>');
  });
});

describe('Diagramme zu Tabellen mit Theme von außen (4T-002323)', () => {
  function chartContainer() {
    const wurzel = document.createElement('div');
    wurzel.className = 'markdown-body';
    const block = document.createElement('div');
    block.className = 'perspective-chart';
    block.dataset.chartIndex = '0';
    block.dataset.chartSource = 'table: T\ntype: bar';
    wurzel.appendChild(block);
    document.body.appendChild(wurzel);
    return wurzel;
  }
  const palette = (modus) =>
    Array.from({ length: 10 }, (_, i) => BASE_DEFAULTS[modus][`chart${i + 1}`]);

  it('dunkle Folie in heller Anwendung: Reihen-Farben des dunklen Schemas (Vorgabe)', () => {
    const angaben = zeichenAngabenDerAnsicht(document.body, 'p', 'dark');
    expect(angaben.colors.palette).toEqual(palette('dark'));
  });

  it('helle Folie in dunkler Anwendung: Farb-Variablen der Anwendung gelten nicht', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.setProperty('--chart-1', '#123456');
    try {
      const angaben = zeichenAngabenDerAnsicht(document.body, 'p', 'light');
      expect(angaben.colors.palette).toEqual(palette('light'));
    } finally {
      document.documentElement.style.removeProperty('--chart-1');
    }
  });

  it('helle Folie in dunkler Anwendung: Reihen-Farben aus dem aktiven hellen Farbschema', () => {
    setColorSchemeState({
      custom: [{ id: 'c1', name: 'C', base: 'light', colors: { chart1: '#123456' } }],
      activeLight: 'c1',
      activeDark: 'standard-dark',
    });
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      const angaben = zeichenAngabenDerAnsicht(document.body, 'p', 'light');
      expect(angaben.colors.palette[0]).toBe('#123456');
      expect(angaben.colors.palette[1]).toBe(BASE_DEFAULTS.light.chart2);
    } finally {
      setColorSchemeState(defaultState());
    }
  });

  it('ohne Angabe gilt weiter das Farbschema der Anwendung', () => {
    document.documentElement.style.setProperty('--chart-1', '#123456');
    try {
      const angaben = zeichenAngabenDerAnsicht(document.body, 'p');
      expect(angaben.colors.palette[0]).toBe('#123456');
    } finally {
      document.documentElement.style.removeProperty('--chart-1');
    }
  });

  it('der Schritt der Befüllung reicht das Theme der Folie an die Brücke', () => {
    applyPerspectiveChartsIfPresent(chartContainer(), 'C:/A/V.md', {
      dokumentText: '',
      theme: 'dark',
    });
    expect(buildChartAufrufe).toHaveLength(1);
    expect(buildChartAufrufe[0].colors.palette).toEqual(palette('dark'));
  });
});
