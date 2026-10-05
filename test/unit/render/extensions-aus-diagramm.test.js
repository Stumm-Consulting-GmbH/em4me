// 4T-002019 (Epic 3E-000192): Aus-Zustand der Erweiterung «Diagramm zu einer
// Datentabelle» (perspective-chart). Der Fall stand bis zum Nachzug des Zuges
// 3E-000336 auf den Integrationsstand nach 1.145.0 in extensions-aus.test.js;
// beide Seiten zusammen hoben jene Datei über das Budget von 800 Code-Zeilen,
// und die Ausnahme-Liste der Datei-Größen darf nicht wachsen. Muster und
// Hilfsfunktion renderOff wie dort; afterEach stellt den Default (alles an) her.
import { describe, it, expect, afterEach } from 'vitest';
import { renderMarkdown, configureExtensions } from '../../../src/shared/markdown/markdown.js';

afterEach(() => {
  configureExtensions([]);
});

function renderOff(id, src) {
  configureExtensions([id]);
  return renderMarkdown(src, 'de');
}

describe('Render-Erweiterungen: Aus-Zustand des Diagramms (4T-002019)', () => {
  // 4T-002019 (Epic 3E-000192, 4S-001021 AK15): Diagramm zu einer Datentabelle.
  // An: Container mit dem Block im Attribut. Aus: gewöhnlicher Code-Block, das
  // Dokument bleibt unverändert; nach dem Wiedereinschalten wieder Container.
  // Die Abhängigkeit schaltet mit: Ist die Datentabelle aus, ist es auch das
  // Diagramm.
  it('perspective-chart: Fence bleibt Code-Block, Dokument unverändert (4T-002019)', () => {
    const src =
      '```perspective-datatable\ncolumns: M:text, N:number\n| a | 1 |\n```\n^t\n\n' +
      '```perspective-chart\ntable: ^t\ntype: bar\nlabels: M\nvalues: N\n```\n';
    const vorher = String(src);
    expect(renderMarkdown(src, 'de')).toContain('class="perspective-chart"');
    const off = renderOff('perspective-chart', src);
    expect(off).not.toContain('class="perspective-chart"');
    expect(off).toContain('language-perspective-chart');
    expect(off).toContain('table: ^t');
    // Die Datentabelle bleibt davon unberührt.
    expect(off).toContain('pdt-grid');
    expect(src).toBe(vorher);
    configureExtensions([]);
    expect(renderMarkdown(src, 'de')).toContain('class="perspective-chart"');
    const ohneQuelle = renderOff('perspective-datatable', src);
    expect(ohneQuelle).not.toContain('class="perspective-chart"');
    expect(ohneQuelle).toContain('language-perspective-chart');
  });
});
