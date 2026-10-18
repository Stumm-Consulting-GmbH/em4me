// @vitest-environment jsdom
// 4T-002054 (Story 4S-000163, AK10): Druck und PDF geben alle Zeilen einer
// Datentabelle aus; die Zeilen-Grenze gilt allein dem Gitter in der Anwendung.
//
// Geprueft wird der Schritt, den die Druck-Vorbereitung vor dem Endpunkt ruft
// (zeichneGekuerzteDatentabellenVoll), an der echten Pipeline: Die Anzeige
// kuerzt eine Tabelle ueber der Grenze, der Schritt zeichnet sie mit allen
// Zeilen neu, und seine Ruecknahme bringt genau die alten Knoten zurueck.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const { renderMarkdown } = await import('../../../src/shared/markdown/markdown.js');
const { MAX_RENDER_ROWS } =
  await import('../../../src/shared/markdown/perspective-datatable-html.js');

const renderAufrufe = [];
window.api.renderMarkdown = (text, basePath, opts) => {
  renderAufrufe.push({ basePath, opts });
  return renderMarkdown(text, 'de', opts);
};

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { zeichneGekuerzteDatentabellenVoll } =
  await import('../../../src/renderer/modules/query/perspective-datatable-view.js');

function tabelle(zeilen) {
  const rows = Array.from({ length: zeilen }, (_, i) => `| ${i + 1} | Zeile ${i + 1} |`);
  return [
    '```perspective-datatable',
    'columns: Nr:number, Name:text',
    'aggregate: Nr:count',
    ...rows,
    '```',
  ].join('\n');
}

function anzeige(quelle) {
  const wurzel = document.createElement('div');
  wurzel.innerHTML = renderMarkdown(quelle, 'de');
  document.body.appendChild(wurzel);
  return wurzel;
}

function datenzeilen(behaelter) {
  return behaelter.querySelectorAll('tbody tr[data-dt-row]').length;
}

beforeEach(() => {
  renderAufrufe.length = 0;
  document.body.innerHTML = '';
});

describe('Ausgabe der Datentabelle mit allen Zeilen (4T-002054)', () => {
  it('zeichnet eine gekuerzte Tabelle mit allen 2000 Zeilen und stellt die alten Knoten zurueck', () => {
    const wurzel = anzeige(`# Titel\n\n${tabelle(2000)}\n`);
    const behaelter = wurzel.querySelector('.perspective-datatable');
    const hinweis = behaelter.querySelector('.pdt-limit');
    expect(hinweis).not.toBeNull();
    expect(datenzeilen(behaelter)).toBe(0);
    const angaben = { ...behaelter.dataset };

    const zurueck = zeichneGekuerzteDatentabellenVoll(wurzel, 'C:\\A\\B.md');

    expect(datenzeilen(behaelter)).toBe(2000);
    expect(behaelter.textContent).toContain('Zeile 2000');
    expect(behaelter.querySelector('.pdt-limit')).toBeNull();
    expect(behaelter.querySelector('tfoot .pdt-agg-value').textContent).toBe('2000');
    // Die Beschriftung der Aggregat-Zeile ist uebersetzt wie in der Anzeige.
    expect(behaelter.querySelector('tfoot .pdt-agg-label').textContent).toBe(
      de['datatable.aggregate.count'],
    );
    // Der Behaelter selbst bleibt mit allen seinen Angaben stehen.
    expect(wurzel.querySelector('.perspective-datatable')).toBe(behaelter);
    expect({ ...behaelter.dataset }).toEqual(angaben);
    expect(renderAufrufe).toHaveLength(1);
    expect(renderAufrufe[0].basePath).toBe('C:\\A\\B.md');
    expect(renderAufrufe[0].opts).toMatchObject({ datatableAlleZeilen: true });

    zurueck();
    expect(datenzeilen(behaelter)).toBe(0);
    expect(behaelter.querySelector('.pdt-limit')).toBe(hinweis);
  });

  it('laesst eine Tabelle bis zur Grenze unberuehrt', () => {
    const wurzel = anzeige(`${tabelle(MAX_RENDER_ROWS)}\n`);
    const behaelter = wurzel.querySelector('.perspective-datatable');
    const ersteZeile = behaelter.querySelector('tbody tr');
    expect(datenzeilen(behaelter)).toBe(MAX_RENDER_ROWS);

    const zurueck = zeichneGekuerzteDatentabellenVoll(wurzel, 'C:\\A\\B.md');
    expect(renderAufrufe).toHaveLength(0);
    expect(behaelter.querySelector('tbody tr')).toBe(ersteZeile);
    zurueck();
    expect(behaelter.querySelector('tbody tr')).toBe(ersteZeile);
  });

  it('nimmt jede gekuerzte Tabelle der Spalte, auch mit Backticks im Inhalt', () => {
    const mitBackticks = tabelle(1500).replace('| 7 | Zeile 7 |', '| 7 | ```x``` |');
    const wurzel = anzeige(`${tabelle(1200)}\n\n${mitBackticks}\n`);
    const behaelter = wurzel.querySelectorAll('.perspective-datatable');
    expect(behaelter).toHaveLength(2);

    const zurueck = zeichneGekuerzteDatentabellenVoll(wurzel, '');
    expect(datenzeilen(behaelter[0])).toBe(1200);
    expect(datenzeilen(behaelter[1])).toBe(1500);
    zurueck();
    expect(datenzeilen(behaelter[0])).toBe(0);
    expect(datenzeilen(behaelter[1])).toBe(0);
  });
});
