// @vitest-environment jsdom
// 4T-002023 (Epic 3E-000192): Die Angabe `table: [[Datei#^name]]` eines
// Diagramm-Blocks als Verweis — geteilte Erkennung, Verweis-Parser des
// Bereichs-Index und ausgehende Verweise der offenen Datei (Story 4S-001023,
// AK13: «Der Bezug eines Diagramms auf ein anderes Dokument erscheint in den
// Rückverweisen und im Verweis-Graph als Verweis auf dieses Dokument, wie eine
// Einbettung»).
//
// Geprüft wird hier die geteilte Erkennung (src/shared/markdown/perspective-chart-ref.js),
// der Verweis-Parser (src/main/index/parse.js, über parseContent ohne
// Datei-Zugriff) und die ausgehenden Verweise
// (src/renderer/modules/panels/panel-outgoing.js). Der Umbenennungs-Nachzug
// steht in link-rewrite.test.js, der Nachzug des Tabellen-Namens in
// block-anchors.test.js. Vorbild ist canvas-verweis-scan.test.js.
//
// **Der Maßstab ist die Einbettung desselben Ziels.** Die Parität wird deshalb
// nicht behauptet, sondern je Schreibform gegen den Treffer von
// `![[Ziel#^name]]` im Fließtext gehalten (Stabilitätsregel 26: die Fall-Liste
// gehört an den Wert). Die Negativ-Fälle sind die Rot-Proben: Ein zu viel
// gefundener Treffer erzeugt eine Kante, die niemand erklären kann.
import { describe, it, expect } from 'vitest';
import './renderer/api-stub.js';

import { parseContent } from '../../src/main/index/parse.js';
import {
  istDiagrammFenceInfo,
  scanneTabellenAngabe,
} from '../../src/shared/markdown/perspective-chart-ref.js';
import { parseChartSpec, parseTableRef } from '../../src/shared/markdown/perspective-chart.js';
import { SUBPAGE_SEP } from '../../src/shared/subpages.js';

const { extractOutgoingLinks } =
  await import('../../src/renderer/modules/panels/panel-outgoing.js');

const QUELLE = 'C:/bereich/Quelle.md';

// Ein Dokument mit genau einem Diagramm-Block; die Angabe steht in Zeile 5.
function diagramm(...zeilen) {
  return ['# Bericht', '', '```perspective-chart', 'type: bar', ...zeilen, '```', ''].join('\n');
}

// Die Treffer, die ein Dokument im Bereichs-Index erzeugt.
function treffer(text, pfad = QUELLE) {
  return parseContent(pfad, text).hits;
}

// Der Treffer ohne die Felder, die an der Stelle hängen (Zeile, Ausschnitt).
function ohneStelle(hit) {
  const { zeile: _z, snippet: _s, ...rest } = hit;
  return rest;
}

// --- Geteilte Erkennung -------------------------------------------------------

describe('Erkennung der Angabe table: (perspective-chart-ref.js, 4T-002023)', () => {
  it('erkennt die Info-Zeichenfolge des Diagramm-Blocks am ersten Wort', () => {
    expect(istDiagrammFenceInfo('perspective-chart')).toBe(true);
    expect(istDiagrammFenceInfo('  perspective-chart  titel')).toBe(true);
    expect(istDiagrammFenceInfo('perspective-chartx')).toBe(false);
    expect(istDiagrammFenceInfo('perspective-canvas')).toBe(false);
    expect(istDiagrammFenceInfo('')).toBe(false);
    expect(istDiagrammFenceInfo(null)).toBe(false);
  });

  it('liest die Form im selben Dokument samt Namens-Spanne', () => {
    const zeile = 'table: ^umsatz';
    const a = scanneTabellenAngabe(zeile);
    expect(a).toMatchObject({ form: 'same', datei: null, name: 'umsatz' });
    expect(zeile.slice(a.nameStart, a.nameStart + a.nameLen)).toBe('umsatz');
  });

  it('liest die Form im anderen Dokument samt Datei- und Namens-Spanne', () => {
    const zeile = '  Table :  [[ Ordner/Bericht.md #^umsatz]]  ';
    const a = scanneTabellenAngabe(zeile);
    expect(a).toMatchObject({ form: 'other', datei: 'Ordner/Bericht.md', name: 'umsatz' });
    expect(zeile.slice(a.dateiStart, a.dateiStart + a.dateiLen)).toBe('Ordner/Bericht.md');
    expect(zeile.slice(a.nameStart, a.nameStart + a.nameLen)).toBe('umsatz');
  });

  it('zählt die Spannen ohne ein abschließendes CR', () => {
    const lf = scanneTabellenAngabe('table: [[Bericht#^umsatz]]');
    expect(scanneTabellenAngabe('table: [[Bericht#^umsatz]]\r')).toEqual(lf);
  });

  // 4T-002072: Der Name ohne Dach-Zeichen ist die Form «selbes Dokument»; ob er
  // eine gültige Kennung ist, prüfen die Aufrufer.
  it('liest die Form ohne Dach-Zeichen samt Namens-Spanne (4T-002072)', () => {
    for (const zeile of ['table: Umsatz', '  TABLE :  Umsatz  ', 'table:Umsatz\r']) {
      const a = scanneTabellenAngabe(zeile);
      expect(a, zeile).toMatchObject({ form: 'same', datei: null, name: 'Umsatz' });
      expect(zeile.slice(a.nameStart, a.nameStart + a.nameLen), zeile).toBe('Umsatz');
    }
    expect(scanneTabellenAngabe('table: Umsatz 2026')).toMatchObject({
      form: 'same',
      name: 'Umsatz 2026',
    });
  });

  it('meldet eine Angabe ohne gültige Schreibweise mit form null', () => {
    // Auch sie ist die wirksame Angabe: Der Kern liest danach kein weiteres
    // `table:`, und die Aufrufer brauchen den Unterschied zu «keine Angabe».
    for (const wert of ['[[Bericht#^a|Bezeichnung]]', '[[#^umsatz]]', '', '[[Bericht]]']) {
      expect(scanneTabellenAngabe(`table: ${wert}`), wert).toMatchObject({ form: null });
    }
  });

  it('liefert null für jede Zeile, die keine Angabe table: ist', () => {
    for (const zeile of ['type: bar', 'tables: ^umsatz', 'table ^umsatz', '', '# table: ^x']) {
      expect(scanneTabellenAngabe(zeile), zeile).toBeNull();
    }
  });

  it('nimmt die Verknüpfungs-Form als Datei; ausgeschlossen wird sie bei den Aufrufern', () => {
    expect(scanneTabellenAngabe('table: [[@kz:Bericht#^umsatz]]')).toMatchObject({
      form: 'other',
      datei: '@kz:Bericht',
    });
  });

  it('liest dieselbe Angabe wie der Diagramm-Kern (Gleichlauf-Wächter)', () => {
    // Die Zusage «eine Heimat» ist diese Prüfung: Was der Kern über
    // parseChartSpec und parseTableRef als Bezug liest, liefert die Erkennung
    // ebenso — und wo der Kern keinen Bezug sieht, hat sie keinen gültigen.
    const zeilen = [
      'table: ^umsatz',
      'TABLE:^umsatz',
      'table: [[Bericht#^umsatz]]',
      '  Table :  [[ Bericht.md #^b-00042]]',
      'table: [[Ordner/Bericht#^umsatz]]',
      'table: [[/Unterseite#^umsatz]]',
      'table: [[..#^umsatz]]',
      'table: [[@kz:Bericht#^umsatz]]',
      'table: [[Bericht#^mit raum]]',
      'table: [[Bericht#^a|L]]',
      'table: umsatz',
      'table: Umsatz',
      'table: Umsatz 2026',
      'table:',
    ];
    for (const zeile of zeilen) {
      const kern = parseTableRef(parseChartSpec(zeile).table);
      const a = scanneTabellenAngabe(zeile);
      const gelesen =
        a && a.form && (a.form === 'same' || a.datei) && /^[\p{L}\p{N}_-]+$/u.test(a.name)
          ? a.form === 'same'
            ? { kind: 'same', name: a.name }
            : { kind: 'other', file: a.datei, name: a.name }
          : null;
      expect(gelesen, zeile).toEqual(kern);
    }
  });
});

// --- Verweis-Parser des Bereichs-Index -----------------------------------------

describe('Verweis-Parser: Angabe table: im Diagramm-Block (4S-001023 AK13)', () => {
  it('AK13: erzeugt einen Treffer wie eine Einbettung, mit Anker', () => {
    const hits = treffer(diagramm('table: [[Bericht#^umsatz]]'));
    expect(hits).toEqual([
      {
        zeile: 5,
        linkTyp: 'wiki',
        zielBasename: 'Bericht',
        zielAbsolut: null,
        anker: '^umsatz',
        snippet: 'table: [[Bericht#^umsatz]]',
      },
    ]);
  });

  it('AK13: Ziel und Anker gleichen der Einbettung desselben Ziels, je Schreibform', () => {
    const formen = [
      ['Bericht#^umsatz', QUELLE],
      ['Bericht.md#^umsatz', QUELLE],
      ['Ordner/Bericht#^umsatz', QUELLE],
      ['/Unterseite#^umsatz', QUELLE],
      ['..#^umsatz', `C:/bereich/Eltern${SUBPAGE_SEP}Kind.md`],
    ];
    for (const [ziel, pfad] of formen) {
      const ausDiagramm = treffer(diagramm(`table: [[${ziel}]]`), pfad);
      const ausEinbettung = treffer(`![[${ziel}]]\n`, pfad);
      expect(ausDiagramm, ziel).toHaveLength(1);
      expect(ausEinbettung, ziel).toHaveLength(1);
      expect(ohneStelle(ausDiagramm[0]), ziel).toEqual(ohneStelle(ausEinbettung[0]));
    }
  });

  it('AK13: nimmt jede Diagramm-Fence für sich, auch mit Tilden', () => {
    const text = [
      '```perspective-chart',
      'table: [[Eins#^a]]',
      '```',
      '',
      '~~~perspective-chart',
      'table: [[Zwei#^b]]',
      '~~~',
      '',
    ].join('\n');
    expect(treffer(text).map((h) => [h.zielBasename, h.anker])).toEqual([
      ['Eins', '^a'],
      ['Zwei', '^b'],
    ]);
  });

  it('AK13 (Rot-Probe): table: ^name im selben Dokument erzeugt keinen Treffer', () => {
    expect(treffer(diagramm('table: ^umsatz'))).toEqual([]);
  });

  it('AK13 (Rot-Probe): ein Ziel @kürzel: erzeugt keinen Treffer', () => {
    expect(treffer(diagramm('table: [[@kz:Bericht#^umsatz]]'))).toEqual([]);
  });

  it('AK13 (Rot-Probe): nur die erste Angabe zählt, auch wenn sie keinen Treffer trägt', () => {
    expect(
      treffer(diagramm('table: [[Erst#^a]]', 'table: [[Zweit#^b]]')).map((h) => h.zielBasename),
    ).toEqual(['Erst']);
    expect(treffer(diagramm('table: ^a', 'table: [[Zweit#^b]]'))).toEqual([]);
    expect(treffer(diagramm('table: umsatz', 'table: [[Zweit#^b]]'))).toEqual([]);
  });

  it('AK13 (Rot-Probe): ein Name, den der Kern nicht liest, erzeugt keinen Treffer', () => {
    expect(treffer(diagramm('table: [[Bericht#^mit raum]]'))).toEqual([]);
    expect(treffer(diagramm('table: [[Bericht#^a|Bezeichnung]]'))).toEqual([]);
  });

  it('AK13 (Rot-Probe): alles Übrige des Diagramm-Blocks bleibt übersprungen', () => {
    const hits = treffer(diagramm('table: [[Bericht#^umsatz]]', 'title: Siehe [[Anderes]]'));
    expect(hits.map((h) => h.zielBasename)).toEqual(['Bericht']);
  });

  it('AK13 (Rot-Probe): eine Fence anderer Art bleibt unberührt', () => {
    for (const info of ['', 'js', 'perspective-datatable', 'perspective-chartx']) {
      const text = ['```' + info, 'table: [[Bericht#^umsatz]]', '```', ''].join('\n');
      expect(treffer(text), info).toEqual([]);
    }
  });

  it('AK13: die Rückgabe-Form von parseContent bleibt unverändert', () => {
    const ohne = parseContent(QUELLE, '# Titel\n\n![[Normal]]\n');
    const mit = parseContent(QUELLE, diagramm('table: [[Bericht#^umsatz]]'));
    expect(Object.keys(mit).sort()).toEqual(Object.keys(ohne).sort());
  });
});

// --- Ausgehende Verweise der offenen Datei --------------------------------------

describe('Ausgehende Verweise: Angabe table: im Diagramm-Block (4S-001023 AK13)', () => {
  // Der Eintrag ohne die Felder, die an der Stelle hängen.
  const kern = (l) => ({ type: l.type, target: l.target, anchor: l.anchor });

  it('AK13: erscheint als Einbettung desselben Ziels', () => {
    const links = extractOutgoingLinks(diagramm('table: [[Bericht#^umsatz]]'));
    expect(links).toEqual([
      {
        type: 'embed',
        target: 'Bericht',
        anchor: '^umsatz',
        line: 5,
        snippet: 'table: [[Bericht#^umsatz]]',
      },
    ]);
    expect(links.map(kern)).toEqual(extractOutgoingLinks('![[Bericht#^umsatz]]').map(kern));
  });

  it('AK13: Ziel und Anker gleichen der Einbettung, je Schreibform', () => {
    for (const ziel of [
      'Bericht.md#^umsatz',
      'Ordner/Bericht#^umsatz',
      '/Unterseite#^umsatz',
      '..#^umsatz',
      ' Bericht #^umsatz',
      // Die Einbettung nennt ein Verknüpfungs-Ziel hier ebenso; ob es sich
      // öffnen lässt, entscheidet der Klick-Weg für beide gleich.
      '@kz:Bericht#^umsatz',
    ]) {
      expect(extractOutgoingLinks(diagramm(`table: [[${ziel}]]`)).map(kern), ziel).toEqual(
        extractOutgoingLinks(`![[${ziel}]]`).map(kern),
      );
    }
  });

  it('AK13 (Rot-Probe): table: ^name, eine spätere Angabe und eine andere Fence fehlen', () => {
    expect(extractOutgoingLinks(diagramm('table: ^umsatz'))).toEqual([]);
    expect(
      extractOutgoingLinks(diagramm('table: [[Erst#^a]]', 'table: [[Zweit#^b]]')).map(
        (l) => l.target,
      ),
    ).toEqual(['Erst']);
    expect(extractOutgoingLinks(diagramm('table: [[Bericht#^mit raum]]'))).toEqual([]);
    const fremd = ['```js', 'table: [[Bericht#^umsatz]]', '```', ''].join('\n');
    expect(extractOutgoingLinks(fremd)).toEqual([]);
  });
});
