// @vitest-environment jsdom
// 4T-002021 (Epic 3E-000192): Der Vorspann des Diagramm-Widgets im Live-Modus
// und sein Schlüssel (src/renderer/modules/live/live-chart-vorspann.js).
//
// Geprüft wird an einem echten Editor-Zustand mit dem Markdown-Syntax-Baum,
// denselben Bausteinen, die der Aufbau der Block-Widgets benutzt: Vorspann ist
// allein der Block, den das erste Vorkommen des Namens benennt, samt
// Namens-Zeile; die Brücke antwortet an ihm wie am ganzen Dokument (N1), und
// der Schlüssel ändert sich
// bei einer Änderung an der Tabelle und am Farbschema, nicht aber bei einer
// Änderung an einem anderen Block. Der Rückgängig-Fall geht über das
// Tastenkürzel-Verzeichnis der Historie, das der Editor der Anwendung trägt.
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { history, historyKeymap } from '@codemirror/commands';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildChartInput } from '../../../src/shared/markdown/perspective-chart.js';
// 4T-002021 (N1): Die Brücke selbst, damit der Vergleich genau das Ergebnis
// misst, das Lese-Ansicht und Live-Modus bekommen.
import { buildChart } from '../../../src/main/preload-diagramme.js';

const { chartOtherTarget, chartTableName, chartWidgetKey, diagrammVorspaenne, fenceBody } =
  await import('../../../src/renderer/modules/live/live-chart-vorspann.js');
const { mermaidHash } = await import('../../../src/renderer/modules/render-mermaid.js');
const { buildBlockWidgetValue, liveBasePathFacet } =
  await import('../../../src/renderer/modules/live/live-block-field.js');
const { merkeZiel, meldeZielGeaendert, meldeFehlendeNeu, zielStand } =
  await import('../../../src/renderer/modules/charts/chart-targets.js');
// 4T-002072: die Editor-Seite des Kopf-Namens (Sprung und Eigenschaften-Zeichen).
const { findBlockAnchorLine } =
  await import('../../../src/renderer/modules/views/anchor-navigation.js');
const { blockMetaField, refreshBlockMetaForPane } =
  await import('../../../src/renderer/modules/block-meta-indicator.js');

const TABELLE = [
  '```perspective-datatable',
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '```',
  '',
  '^umsatz',
].join('\n');

const DIAGRAMM = [
  '```perspective-chart',
  'table: ^umsatz',
  'type: bar',
  'labels: Monat',
  'values: Einnahmen, Ausgaben',
  '```',
].join('\n');

// 4T-002072: dieselbe Tabelle mit dem Namen in der Kopf-Angabe `table:`.
const TABELLE_KOPF = TABELLE.replace(
  '```perspective-datatable\n',
  '```perspective-datatable\ntable: umsatz\n',
).replace('\n\n^umsatz', '');

function zustand(doc, extensions = []) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [LezerTable] }), ...extensions],
  });
  let schutz = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && schutz++ < 400) {
    /* weiter */
  }
  return state;
}

// Sammelt Code-Blöcke und Diagramme so, wie der Aufbau der Widgets sie im
// selben Durchlauf sieht, und liefert Vorspann und Schlüssel je Diagramm.
function widgets(state, farben = 'light|') {
  const zaeune = [];
  const diagramme = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table' && node.name !== 'FencedCode') return undefined;
      const erste = state.doc.lineAt(node.from);
      const pos = node.to > erste.from ? node.to - 1 : node.to;
      if (node.name === 'FencedCode') {
        zaeune.push({
          from: node.from,
          toLine: state.doc.lineAt(Math.max(pos, erste.from)).number,
        });
      }
      if (
        node.name === 'FencedCode' &&
        state.doc.lineAt(node.from).text.includes('perspective-chart')
      ) {
        const body = fenceBody(state, node.node);
        diagramme.push({
          source: state.doc.sliceString(node.from, node.to),
          body,
          name: chartTableName(body),
        });
      }
      return false;
    },
  });
  const vorspaenne = diagrammVorspaenne(
    state,
    zaeune,
    diagramme.map((d) => d.name).filter(Boolean),
  );
  return diagramme.map((d) => {
    const vorspann = d.name ? vorspaenne.get(d.name) : '';
    return { ...d, vorspann, key: chartWidgetKey(mermaidHash, farben, vorspann, d.source) };
  });
}

function dok(...teile) {
  return teile.join('\n\n');
}

describe('Vorspann des Diagramm-Widgets (4T-002021, D5, AK9)', () => {
  it('allein die genannte Tabelle samt Namens-Zeile, auch hinter dem Diagramm', () => {
    const text = dok('# Titel', 'Ein Absatz.', DIAGRAMM, 'Noch ein Absatz.', TABELLE, 'Schluss.');
    const [w] = widgets(zustand(text));
    expect(w.vorspann).toBe(TABELLE);
    expect(w.vorspann).not.toContain('Absatz');
    // Im Vorspann löst der Format-Kern die Tabelle wie im ganzen Dokument auf.
    expect(buildChartInput(w.vorspann, w.body)).toMatchObject({ drawable: true, type: 'bar' });
    expect(buildChartInput(text, w.body)).toEqual(buildChartInput(w.vorspann, w.body));
  });

  it('Änderung an der Tabelle ändert Vorspann und Schlüssel', () => {
    const vorher = widgets(zustand(dok(TABELLE, DIAGRAMM)))[0];
    const nachher = widgets(zustand(dok(TABELLE.replace('| 100 |', '| 400 |'), DIAGRAMM)))[0];
    expect(nachher.vorspann).not.toBe(vorher.vorspann);
    expect(nachher.key).not.toBe(vorher.key);
  });

  it('Änderung an einem anderen Block lässt den Schlüssel stehen', () => {
    const vorher = widgets(zustand(dok('Absatz eins.', TABELLE, DIAGRAMM)))[0];
    const nachher = widgets(
      zustand(dok('Absatz zwei, länger.', TABELLE, DIAGRAMM, '| a | b |\n|---|---|\n| 1 | 2 |')),
    )[0];
    expect(nachher.key).toBe(vorher.key);
  });

  it('ein Wechsel des Farbschemas ändert den Schlüssel', () => {
    const state = zustand(dok(TABELLE, DIAGRAMM));
    const hell = widgets(state, 'light|')[0];
    const schema = widgets(state, 'light|--fg: #aa0000;')[0];
    const dunkel = widgets(state, 'dark|')[0];
    expect(new Set([hell.key, schema.key, dunkel.key]).size).toBe(3);
  });

  it('ein unbekannter Name ergibt einen leeren Vorspann, eine gewöhnliche Tabelle ihre Art', () => {
    const fehlt = widgets(zustand(dok(TABELLE, DIAGRAMM.replace('^umsatz', '^fehlt'))))[0];
    expect(fehlt.vorspann).toBe('');
    expect(buildChartInput(fehlt.vorspann, fehlt.body)).toMatchObject({ reason: 'table-missing' });

    const pipe = '| Monat | Wert |\n|---|---|\n| Jan | 1 |\n\n^umsatz';
    const text = dok(pipe, DIAGRAMM);
    const w = widgets(zustand(text))[0];
    // Dieselbe Antwort wie über das ganze Dokument: Tabelle anderer Art.
    expect(buildChartInput(w.vorspann, w.body)).toEqual(buildChartInput(text, w.body));
    expect(buildChartInput(w.vorspann, w.body)).toMatchObject({ reason: 'table-other-kind' });
  });

  it('ein Name an einem Absatz: dieselbe Antwort wie in der Lese-Ansicht', () => {
    const text = dok('Ein Absatz mit Namen ^umsatz', DIAGRAMM);
    const w = widgets(zustand(text))[0];
    expect(w.vorspann).toContain('^umsatz');
    expect(buildChartInput(w.vorspann, w.body)).toEqual(buildChartInput(text, w.body));
  });

  it('ein Diagramm auf ein anderes Dokument bekommt keinen Vorspann', () => {
    const w = widgets(zustand(dok(TABELLE, DIAGRAMM.replace('^umsatz', '[[Bericht#^umsatz]]'))))[0];
    expect(w.name).toBeNull();
    expect(w.vorspann).toBe('');
  });
});

describe('Gleiche Antwort am Vorspann wie am ganzen Dokument (4T-002021, N1)', () => {
  // Maßgeblich ist die Regel des Format-Kerns: Es zählt das erste Vorkommen
  // des Namens im Text; benennt es keine Datentabelle, ist das Diagramm nicht
  // zeichenbar mit dem Grund «Tabelle anderer Art». Die Brücke muss am Vorspann
  // des Live-Modus Zeichen für Zeichen dasselbe liefern wie am ganzen Dokument,
  // aus dem die Lese-Ansicht zeichnet.
  const ZWEITE = TABELLE.replace('| Januar  | 100 | 80 |', '| März    | 7   | 3  |');
  const PIPE = '| Monat | Einnahmen |\n|---|---|\n| Jan | 1 |\n\n^umsatz';
  const FALL = {
    'Name zuerst an einem Absatz, dann an der Tabelle': dok(
      'Ein Absatz ^umsatz',
      TABELLE,
      DIAGRAMM,
    ),
    'Name allein unter einem Absatz, dann an der Tabelle': dok(
      'Ein Absatz\n^umsatz',
      DIAGRAMM,
      TABELLE,
    ),
    'Name zweimal an Tabellen': dok(DIAGRAMM, ZWEITE, 'Dazwischen.', TABELLE),
    'Name nur an der Tabelle, hinter dem Diagramm': dok('# Titel', DIAGRAMM, 'Text.', TABELLE),
    'Name fehlt': dok(TABELLE.replace('^umsatz', '^anders'), DIAGRAMM),
    'Name an einer gewöhnlichen Tabelle': dok(PIPE, DIAGRAMM, TABELLE),
    'Name an einer Überschrift': dok('## Kapitel ^umsatz', DIAGRAMM, TABELLE),
    'Name unter einem anderen Code-Block': dok(
      '```js\nconst a = 1;\n```\n^umsatz',
      DIAGRAMM,
      TABELLE,
    ),
    'Name an einer Datentabelle mit Fehlern': dok(
      TABELLE.replace('columns: Monat:text,', 'columns: Monat:text, Monat:text,'),
      DIAGRAMM,
    ),
    'Name im Code-Block zählt nicht, danach an der Tabelle': dok(
      '```text\n^umsatz\n```',
      DIAGRAMM,
      TABELLE,
    ),
    // 4T-002072: der Name in der Kopf-Angabe `table:` der Datentabelle.
    'Kopf-Name, Diagramm mit Dach-Zeichen': dok('# Titel', DIAGRAMM, 'Text.', TABELLE_KOPF),
    'Kopf-Name, Diagramm ohne Dach-Zeichen': dok(
      DIAGRAMM.replace('^umsatz', 'umsatz'),
      TABELLE_KOPF,
      'Schluss.',
    ),
    'Kopf-Name in einem offenen Zaun am Dokument-Ende': dok(DIAGRAMM, TABELLE_KOPF.slice(0, -4)),
    'Name zuerst als Anker-Zeile an einer Tabelle, dann als Kopf-Name': dok(
      DIAGRAMM,
      TABELLE.replace('| 100 |', '| 7   |'),
      TABELLE_KOPF,
    ),
    'Kopf-Name mit Fehler in der Tabelle': dok(
      DIAGRAMM,
      TABELLE_KOPF.replace('columns: Monat:text,', 'columns: Monat:text, Monat:text,'),
    ),
  };

  for (const [titel, text] of Object.entries(FALL)) {
    it(titel, () => {
      const [w] = widgets(zustand(text));
      const optionen = { idPrefix: 'ch-probe-0' };
      const amVorspann = buildChart(w.vorspann, w.body, optionen);
      const amDokument = buildChart(text, w.body, optionen);
      expect(amVorspann).toEqual(amDokument);
      // Und der Vorspann ist nie das ganze Dokument.
      expect(w.vorspann.length).toBeLessThan(text.length);
    });
  }

  it('die Fälle decken die Antworten ab, die sich unterscheiden können', () => {
    // Gegenprobe gegen eine Fall-Liste, die still nur eine Antwort prüft.
    const antworten = new Set(
      Object.values(FALL).map((text) => {
        const erg = buildChart(text, widgets(zustand(text))[0].body);
        return erg.status === 'drawn' ? 'drawn' : `${erg.reason}:${erg.detail}`;
      }),
    );
    for (const erwartet of [
      'drawn',
      'table-other-kind:other',
      'table-other-kind:pipe-table',
      'table-other-kind:code-block',
      'table-missing:umsatz',
    ]) {
      expect(antworten).toContain(erwartet);
    }
    expect([...antworten].some((a) => a.startsWith('table-invalid:'))).toBe(true);
  });
});

// 4T-002023 (Epic 3E-000192): Der Schlüssel eines Diagramm-Widgets auf eine
// Tabelle in einem anderen Dokument trägt den Stand dieses Dokuments. Ohne ihn
// bliebe das Widget bei einer Änderung des anderen Dokuments gleich (`eq()`),
// weil sich weder Quelltext noch Vorspann noch Darstellung ändern.
describe('Schlüssel und Stand des anderen Dokuments (4T-002023)', () => {
  const ANDERES = DIAGRAMM.replace('^umsatz', '[[Bericht#^umsatz]]');

  function schluessel(basePath, source, file) {
    return chartWidgetKey(mermaidHash, 'light|', '', source, zielStand(basePath, file));
  }

  it('der geschriebene Name des anderen Dokuments, null im selben Dokument', () => {
    const [anderes] = widgets(zustand(dok(TABELLE, ANDERES)));
    expect(chartOtherTarget(anderes.body)).toBe('Bericht');
    const [eigenes] = widgets(zustand(dok(TABELLE, DIAGRAMM)));
    expect(chartOtherTarget(eigenes.body)).toBeNull();
    expect(chartOtherTarget('type: bar')).toBeNull();
  });

  it('ohne Stand bleibt der Schlüssel eines Diagramms im selben Dokument, wie er war', () => {
    const [w] = widgets(zustand(dok(TABELLE, DIAGRAMM)));
    expect(chartWidgetKey(mermaidHash, 'light|', w.vorspann, w.source)).toBe(w.key);
    expect(chartWidgetKey(mermaidHash, 'light|', w.vorspann, w.source, '')).toBe(w.key);
  });

  it('eine Meldung über das Ziel ändert allein den Schlüssel der Diagramme dieses Ziels', () => {
    merkeZiel('/x/B.md', 'Bericht', '/x/Bericht.md', false);
    merkeZiel('/x/B.md', 'Anderes', '/x/Anderes.md', false);
    const anderesQuelle = ANDERES.replace('Bericht', 'Anderes');
    const vorher = schluessel('/x/B.md', ANDERES, 'Bericht');
    const unbeteiligt = schluessel('/x/B.md', anderesQuelle, 'Anderes');
    // Lesen allein ändert den Stand nicht, sonst baute jedes Widget einmal ohne Anlass neu.
    merkeZiel('/x/B.md', 'Bericht', '/x/Bericht.md', false);
    expect(schluessel('/x/B.md', ANDERES, 'Bericht')).toBe(vorher);
    expect(meldeZielGeaendert('X:/nicht/da.md')).toBe(0);
    expect(meldeZielGeaendert('\\x\\BERICHT.md')).toBe(1);
    expect(schluessel('/x/B.md', ANDERES, 'Bericht')).not.toBe(vorher);
    expect(schluessel('/x/B.md', anderesQuelle, 'Anderes')).toBe(unbeteiligt);
  });

  it('das Verzeichnis ist bereit: allein fehlende Ziele bekommen einen neuen Stand', () => {
    merkeZiel('/y/B.md', 'Fehlt', '/y/Fehlt.md', true);
    merkeZiel('/y/B.md', 'Da', '/y/Da.md', false);
    const fehlt = zielStand('/y/B.md', 'Fehlt');
    const da = zielStand('/y/B.md', 'Da');
    meldeFehlendeNeu();
    expect(zielStand('/y/B.md', 'Fehlt')).not.toBe(fehlt);
    expect(zielStand('/y/B.md', 'Da')).toBe(da);
  });

  it('der Aufbau der Widgets gibt den Stand in den Schlüssel (buildBlockWidgetValue)', () => {
    // Der echte Aufbau der Block-Widgets an einem Editor-Zustand: Die Schreibmarke
    // steht in der Überschrift, außerhalb des Diagramm-Blocks.
    const text = dok('# Übersicht', ANDERES, DIAGRAMM, TABELLE);
    const schluessel = () => {
      const state = zustand(text, [liveBasePathFacet.of('/k/B.md')]);
      const keys = [];
      buildBlockWidgetValue(state).deco.between(0, state.doc.length, (_von, _bis, deko) => {
        const w = deko.spec.widget;
        if (w && String(w.cacheKey).startsWith('perspective-chart:')) keys.push(w.cacheKey);
      });
      return keys;
    };
    const [fremdVorher, eigenVorher] = schluessel();
    expect(fremdVorher).toMatch(/:0$/);
    merkeZiel('/k/B.md', 'Bericht', '/k/Bericht.md', false);
    meldeZielGeaendert('/k/Bericht.md');
    const [fremdNachher, eigenNachher] = schluessel();
    expect(fremdNachher).not.toBe(fremdVorher);
    expect(fremdNachher).toMatch(/:1$/);
    // Das Diagramm im selben Dokument behält seinen Schlüssel.
    expect(eigenNachher).toBe(eigenVorher);
  });
});

describe('Rückgängig am Tastendruck (4T-002021, AK6)', () => {
  it('Strg+Z erreicht die Historie, und der Schlüssel kehrt zum vorigen Stand zurück', () => {
    const start = zustand(dok(TABELLE, DIAGRAMM), [history()]);
    const vorher = widgets(start)[0].key;
    // Eine Zeile der Tabelle kommt hinzu.
    const einfuegen = start.doc.toString().indexOf('```\n\n^umsatz');
    let state = start.update({
      changes: { from: einfuegen, insert: '| März    | 120 | 70 |\n' },
    }).state;
    const geaendert = widgets(state)[0].key;
    expect(geaendert).not.toBe(vorher);

    // Die Taste Strg+Z läuft über das Tastenkürzel-Verzeichnis der Historie,
    // das der Editor der Anwendung einbindet (editor/editor.js).
    const bindung = historyKeymap.find((k) => k.key === 'Mod-z');
    expect(bindung).toBeDefined();
    const ansicht = {
      get state() {
        return state;
      },
      dispatch(tr) {
        state = tr.state;
      },
    };
    expect(bindung.run(ansicht)).toBe(true);
    // Neuer Syntax-Baum für den zurückgenommenen Stand.
    let schutz = 0;
    while (!ensureSyntaxTree(state, state.doc.length, 50) && schutz++ < 400) {
      /* weiter */
    }
    expect(state.doc.toString()).toBe(start.doc.toString());
    // Gleicher Schlüssel: Das Widget ist wieder das des vorigen Standes, und der
    // Aufbau baut es neu, weil der Schlüssel des geänderten ein anderer war.
    expect(widgets(state)[0].key).toBe(vorher);
  });

  it('der Editor der Anwendung bindet das Tastenkürzel-Verzeichnis der Historie ein', () => {
    const editor = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        'src',
        'renderer',
        'modules',
        'editor',
        'editor.js',
      ),
      'utf8',
    );
    expect(editor).toMatch(/\.\.\.historyKeymap/);
  });
});

// 4T-002072 (Epic 3E-000192): Der Name einer Datentabelle in ihrer Kopf-Angabe
// `table:`. Vorspann ist ihr ganzer Zaun; der Sprung im Editor trifft die
// Zeile der Angabe; das Eigenschaften-Zeichen des Live-Modus steht am Ende der
// Schluss-Zeile, weil die Zeile der Angabe im Block-Widget läge.
describe('Kopf-Name der Datentabelle im Editor (4T-002072)', () => {
  it('Vorspann ist der ganze Zaun, bei offenem Zaun bis zum Dokument-Ende', () => {
    const [w] = widgets(zustand(dok('# Titel', DIAGRAMM, 'Text.', TABELLE_KOPF, 'Schluss.')));
    expect(w.vorspann).toBe(TABELLE_KOPF);
    expect(buildChartInput(w.vorspann, w.body)).toMatchObject({ drawable: true, type: 'bar' });
    const offen = TABELLE_KOPF.slice(0, -4);
    const [o] = widgets(zustand(dok(DIAGRAMM, offen)));
    expect(o.vorspann).toBe(offen);
  });

  it('der Name zuerst als Anker-Zeile: Vorspann nach dem bisherigen Weg', () => {
    const [w] = widgets(zustand(dok(DIAGRAMM, TABELLE, TABELLE_KOPF)));
    expect(w.vorspann).toBe(TABELLE);
  });

  it('Sprung im Editor: Zeile der Angabe, Code-Beispiele zählen nicht', () => {
    const text = dok('# Titel', '```text\n^umsatz\ntable: umsatz\n```', TABELLE_KOPF, 'Absatz ^b');
    const ansicht = { state: zustand(text) };
    const zeilen = text.split('\n');
    expect(findBlockAnchorLine(ansicht, 'umsatz')).toBe(zeilen.indexOf('table: umsatz', 6) + 1);
    expect(zeilen[findBlockAnchorLine(ansicht, 'umsatz') - 2]).toBe('```perspective-datatable');
    expect(findBlockAnchorLine(ansicht, 'b')).toBe(zeilen.length);
    expect(findBlockAnchorLine(ansicht, 'fehlt')).toBe(0);
  });

  it('Eigenschaften-Zeichen im Live-Modus: am Ende der Schluss-Zeile, bei Anker-Zeile an ihr', async () => {
    window.api.readBlockData = async () => ({
      ok: true,
      blockData: { umsatz: { values: { Status: 'offen' } }, alt: { values: { Status: 'x' } } },
    });
    await refreshBlockMetaForPane(0, '/k/Zeichen.md');
    const text = dok(TABELLE_KOPF, TABELLE.replace('^umsatz', '^alt'));
    const state = zustand(text, [liveBasePathFacet.of('/k/Zeichen.md'), blockMetaField]);
    const lagen = [];
    state.field(blockMetaField).between(0, state.doc.length, (von, _bis, deko) => {
      lagen.push([deko.spec.widget.id, von, deko.spec.side]);
    });
    const schluss = state.doc.line(TABELLE_KOPF.split('\n').length).to;
    expect(state.doc.lineAt(schluss).text).toBe('```');
    expect(lagen).toEqual([
      ['umsatz', schluss, 1],
      ['alt', state.doc.length, 1],
    ]);
  });
});
