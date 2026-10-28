// @vitest-environment jsdom
// 4T-002342 (Epic 3E-000365, Story 4S-001098): Treffer der Dokument-Suche in
// den Zellen einer gezeichneten Pipe-Tabelle der Live-Ansicht.
//
// Geprüft wird ohne laufenden Editor, was ohne ihn prüfbar ist: die Zuordnung
// eines Treffers im Block-Text zu Zelle und Zeichen-Spanne über die
// Zellen-Grenzen des Tabellen-Lesers (mit den Rändern Treffer über eine
// Zellen-Grenze, Treffer im Trenner, leere Zelle, Ausrichtungs-Zeile), die
// Spanne im gezeigten Text einer ausgezeichneten Zelle, das Umhüllen im
// gerenderten Baum und, an einem echten Editor-Zustand, dass das Widget die
// Treffer aus dem Feld der Suche bekommt und das Feld genau dann neu baut, wenn
// sich die Treffer einer Tabelle ändern. Der Ablauf im Ganzen steht im
// Ablauf-Fall SD-07 (`test/e2e/funktionen/suche-dokument.spec.js`).
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

import { TabelleImZitat } from '../../../src/renderer/modules/editor/tabelle-im-zitat.js';

import {
  searchHighlightField,
  setSearchDecorations,
  clearSearchDecorations,
} from '../../../src/renderer/modules/live/live-marker-fields.js';
import {
  spannenImGezeigtenText,
  sucheGeaendert,
  trefferImBlock,
  trefferInZellen,
  trefferSchluessel,
  zeichneTabellenTreffer,
} from '../../../src/renderer/modules/live/live-table-treffer.js';

const { buildBlockWidgetValue, liveBlockWidgetsField } =
  await import('../../../src/renderer/modules/live/live-block-field.js');

// Stellen eines Teil-Textes im Block-Text: das `n`-te Vorkommen (ab 0).
function stelle(text, teil, n = 0) {
  let i = text.indexOf(teil);
  for (let k = 0; k < n; k++) i = text.indexOf(teil, i + 1);
  if (i < 0) throw new Error(`"${teil}" nicht gefunden`);
  return { von: i, bis: i + teil.length };
}

const TABELLE = ['| Kopf Quitte | B |', '| --- | --- |', '| Quitte und Quitte |  |', '| x | y |'];
const BLOCK = TABELLE.join('\n');

describe('trefferInZellen: Treffer im Block-Text → Zelle und Spanne', () => {
  it('Kopfzeile und zwei Treffer in einer Zelle, je für sich, mit Spanne im Zell-Inhalt', () => {
    const treffer = [
      { ...stelle(BLOCK, 'Quitte', 0), aktuell: false },
      { ...stelle(BLOCK, 'Quitte', 1), aktuell: true },
      { ...stelle(BLOCK, 'Quitte', 2), aktuell: false },
    ];
    expect(trefferInZellen(TABELLE, treffer)).toEqual([
      {
        pos: { rowKind: 'header', rowIndex: 0, col: 0 },
        von: 5,
        bis: 11,
        aktuell: false,
        zellText: 'Kopf Quitte',
      },
      {
        pos: { rowKind: 'body', rowIndex: 0, col: 0 },
        von: 0,
        bis: 6,
        aktuell: true,
        zellText: 'Quitte und Quitte',
      },
      {
        pos: { rowKind: 'body', rowIndex: 0, col: 0 },
        von: 11,
        bis: 17,
        aktuell: false,
        zellText: 'Quitte und Quitte',
      },
    ]);
  });

  it('ein Treffer über eine Zellen-Grenze zählt in jeder Zelle mit seinem Teil darin', () => {
    const zeilen = ['| A | B |', '| --- | --- |', '| links | rechts |'];
    const text = zeilen.join('\n');
    const treffer = [{ ...stelle(text, 'ks | re'), aktuell: true }];
    expect(trefferInZellen(zeilen, treffer)).toEqual([
      {
        pos: { rowKind: 'body', rowIndex: 0, col: 0 },
        von: 3,
        bis: 5,
        aktuell: true,
        zellText: 'links',
      },
      {
        pos: { rowKind: 'body', rowIndex: 0, col: 1 },
        von: 0,
        bis: 2,
        aktuell: true,
        zellText: 'rechts',
      },
    ]);
  });

  it('ein Treffer allein im Trenner oder im Polster liegt in keiner Zelle', () => {
    const text = BLOCK;
    const trenner = text.indexOf('| B |'); // das «|» vor «B»
    expect(trefferInZellen(TABELLE, [{ von: trenner, bis: trenner + 1 }])).toEqual([]);
    // « | » zwischen «Kopf Quitte» und «B»: Polster, Trenner, Polster
    const zwischen = text.indexOf(' | B');
    expect(trefferInZellen(TABELLE, [{ von: zwischen, bis: zwischen + 3 }])).toEqual([]);
  });

  it('die Ausrichtungs-Zeile ist keine Zelle', () => {
    const t = stelle(BLOCK, '---');
    expect(trefferInZellen(TABELLE, [t])).toEqual([]);
  });

  it('eine leere Zelle hat keinen Inhalt, den ein Treffer treffen könnte', () => {
    // Die zweite Zelle der ersten Datenzeile ist leer; ein Treffer auf ihren
    // Leerzeichen bleibt ohne Zelle.
    const zeile = BLOCK.indexOf('|  |');
    expect(trefferInZellen(TABELLE, [{ von: zeile + 1, bis: zeile + 3 }])).toEqual([]);
  });

  it('ohne Treffer oder ohne lesbare Tabelle: nichts', () => {
    expect(trefferInZellen(TABELLE, [])).toEqual([]);
    expect(trefferInZellen(['kein Tisch'], [{ von: 0, bis: 4 }])).toEqual([]);
  });
});

describe('spannenImGezeigtenText: Spanne im gezeigten Text der Zelle', () => {
  it('gleicher Text: die Stellen gelten unverändert', () => {
    expect(
      spannenImGezeigtenText('a Quitte', 'a Quitte', [{ von: 2, bis: 8, aktuell: true }]),
    ).toEqual([{ von: 2, bis: 8, aktuell: true }]);
  });

  it('ausgezeichnete Zelle: das gleiche Vorkommen im gezeigten Text', () => {
    const quelle = '**Quitte** und Quitte';
    const eintraege = [
      { von: 2, bis: 8, aktuell: false },
      { von: 15, bis: 21, aktuell: true },
    ];
    expect(spannenImGezeigtenText('Quitte und Quitte', quelle, eintraege)).toEqual([
      { von: 0, bis: 6, aktuell: false },
      { von: 11, bis: 17, aktuell: true },
    ]);
  });

  it('ein Treffer auf der Auszeichnung selbst bleibt ohne Spanne', () => {
    expect(spannenImGezeigtenText('fett', '**fett**', [{ von: 0, bis: 2 }])).toEqual([]);
  });
});

describe('zeichneTabellenTreffer: Umhüllen im gerenderten Baum', () => {
  function container(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }
  const HTML =
    '<table><thead><tr><th>Kopf Quitte</th><th>B</th></tr></thead>' +
    '<tbody><tr><td>Quitte und Quitte</td><td></td></tr><tr><td>x</td><td>y</td></tr></tbody></table>';

  it('setzt Element und Klassen des Fließtexts, der aktuelle Treffer zusätzlich die eigene', () => {
    const c = container(HTML);
    zeichneTabellenTreffer(c, BLOCK, [
      { ...stelle(BLOCK, 'Quitte', 0), aktuell: false },
      { ...stelle(BLOCK, 'Quitte', 1), aktuell: false },
      { ...stelle(BLOCK, 'Quitte', 2), aktuell: true },
    ]);
    const spans = [...c.querySelectorAll('.cm-search-match')];
    expect(spans.map((s) => [s.tagName, s.className, s.closest('th, td').textContent])).toEqual([
      ['SPAN', 'cm-search-match', 'Kopf Quitte'],
      ['SPAN', 'cm-search-match', 'Quitte und Quitte'],
      ['SPAN', 'cm-search-match cm-search-match-current', 'Quitte und Quitte'],
    ]);
    // Der Text der Zellen bleibt, wie er war.
    expect([...c.querySelectorAll('th, td')].map((z) => z.textContent)).toEqual([
      'Kopf Quitte',
      'B',
      'Quitte und Quitte',
      '',
      'x',
      'y',
    ]);
  });

  it('umhüllt über Textknoten hinweg, auch innerhalb von Auszeichnung', () => {
    const c = container(
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><strong>Quitte</strong> und Quitte</td></tr></tbody></table>',
    );
    const zeilen = ['| A |', '| --- |', '| **Quitte** und Quitte |'];
    const text = zeilen.join('\n');
    zeichneTabellenTreffer(c, text, [
      { ...stelle(text, 'Quitte', 0), aktuell: true },
      { ...stelle(text, 'Quitte', 1), aktuell: false },
    ]);
    const spans = [...c.querySelectorAll('td .cm-search-match')];
    expect(spans.map((s) => [s.textContent, s.parentElement.tagName, s.className])).toEqual([
      ['Quitte', 'STRONG', 'cm-search-match cm-search-match-current'],
      ['Quitte', 'TD', 'cm-search-match'],
    ]);
  });

  it('ohne Treffer bleibt der Baum unverändert', () => {
    const c = container(HTML);
    zeichneTabellenTreffer(c, BLOCK, []);
    expect(c.innerHTML).toBe(HTML);
  });
});

// --- Am echten Editor-Zustand -----------------------------------------------

const DOC = ['Vor der Tabelle: Quitte.', '', ...TABELLE, '', 'Nach der Tabelle: Quitte.', ''].join(
  '\n',
);

function zustand(doc) {
  let state = EditorState.create({
    doc,
    extensions: [
      markdown({ extensions: [LezerTable, TabelleImZitat] }),
      searchHighlightField,
      liveBlockWidgetsField,
    ],
  });
  let schutz = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && schutz++ < 400) {
    /* weiter */
  }
  // Schreibmarke am Textende, außerhalb der Tabelle.
  state = state.update({ selection: { anchor: state.doc.length } }).state;
  return state;
}

function alleTreffer(doc) {
  const liste = [];
  let i = doc.indexOf('Quitte');
  while (i >= 0) {
    liste.push({ from: i, to: i + 6 });
    i = doc.indexOf('Quitte', i + 1);
  }
  return liste;
}

function tabellenWidget(value) {
  let widget = null;
  value.deco.between(0, 1e9, (von, bis, deko) => {
    const w = deko.spec.widget;
    if (w && String(w.cacheKey).startsWith('table:')) widget = w;
  });
  return widget;
}

describe('Widget und Feld am echten Editor-Zustand', () => {
  it('das Tabellen-Widget bekommt die Treffer seines Bereichs aus dem Feld der Suche', () => {
    const treffer = alleTreffer(DOC);
    expect(treffer).toHaveLength(5);
    const state = zustand(DOC).update({
      effects: setSearchDecorations.of({ matches: treffer, currentIndex: 2 }),
    }).state;
    const w = tabellenWidget(buildBlockWidgetValue(state));
    expect(w.treffer).toEqual([
      { ...stelle(BLOCK, 'Quitte', 0), aktuell: false },
      { ...stelle(BLOCK, 'Quitte', 1), aktuell: true },
      { ...stelle(BLOCK, 'Quitte', 2), aktuell: false },
    ]);
  });

  it('das Feld baut neu, wenn sich die Treffer einer Tabelle ändern, und sonst nicht', () => {
    const treffer = alleTreffer(DOC);
    let state = zustand(DOC);
    const ohne = state.field(liveBlockWidgetsField);
    expect(tabellenWidget(ohne).treffer).toEqual([]);

    // Aktueller Treffer vor der Tabelle: die Tabelle bekommt ihre drei Treffer.
    state = state.update({
      effects: setSearchDecorations.of({ matches: treffer, currentIndex: 0 }),
    }).state;
    const erster = state.field(liveBlockWidgetsField);
    expect(erster).not.toBe(ohne);
    expect(trefferSchluessel(tabellenWidget(erster).treffer)).toBe(
      trefferSchluessel([
        stelle(BLOCK, 'Quitte', 0),
        stelle(BLOCK, 'Quitte', 1),
        stelle(BLOCK, 'Quitte', 2),
      ]),
    );

    // Aktueller Treffer hinter der Tabelle: Für die Tabelle ändert sich nichts,
    // das Feld bleibt, wie es ist.
    state = state.update({
      effects: setSearchDecorations.of({ matches: treffer, currentIndex: 4 }),
    }).state;
    expect(state.field(liveBlockWidgetsField)).toBe(erster);

    // Aktueller Treffer in der Zelle: neu gebaut, genau einer aktuell.
    state = state.update({
      effects: setSearchDecorations.of({ matches: treffer, currentIndex: 3 }),
    }).state;
    const inZelle = state.field(liveBlockWidgetsField);
    expect(inZelle).not.toBe(erster);
    expect(tabellenWidget(inZelle).treffer.filter((t) => t.aktuell)).toEqual([
      { ...stelle(BLOCK, 'Quitte', 2), aktuell: true },
    ]);

    // Suche geschlossen: keine Treffer mehr im Widget.
    state = state.update({ effects: clearSearchDecorations.of(null) }).state;
    expect(tabellenWidget(state.field(liveBlockWidgetsField)).treffer).toEqual([]);
  });

  it('Treffer in einer Tabelle im Zitat rechnen über die Zitat-Präfixe in den Block-Text', () => {
    const doc = [
      '> Zitat',
      '>',
      '> | A | B |',
      '> | --- | --- |',
      '> | Quitte | x |',
      '',
      'Ende',
    ].join('\n');
    let state = zustand(doc);
    const t = doc.indexOf('Quitte');
    state = state.update({
      effects: setSearchDecorations.of({ matches: [{ from: t, to: t + 6 }], currentIndex: 0 }),
    }).state;
    const w = tabellenWidget(buildBlockWidgetValue(state));
    expect(w.source.split('\n')).toEqual(['| A | B |', '| --- | --- |', '| Quitte | x |']);
    expect(w.treffer).toHaveLength(1);
    expect(w.source.slice(w.treffer[0].von, w.treffer[0].bis)).toBe('Quitte');
  });

  it('sucheGeaendert erkennt beide Wirkungen der Suche und sonst keine', () => {
    const state = zustand(DOC);
    expect(sucheGeaendert(state.update({ effects: clearSearchDecorations.of(null) }))).toBe(true);
    expect(
      sucheGeaendert(
        state.update({ effects: setSearchDecorations.of({ matches: [], currentIndex: -1 }) }),
      ),
    ).toBe(true);
    expect(sucheGeaendert(state.update({ selection: { anchor: 0 } }))).toBe(false);
  });

  it('trefferImBlock ohne Feld der Suche im Zustand: keine Treffer', () => {
    const state = EditorState.create({ doc: DOC });
    expect(trefferImBlock(state, 0, DOC.length, null)).toEqual([]);
  });
});
