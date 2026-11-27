// 4T-002797 (Epic 3E-000449): Lücken aus den Prüfrunden 1 und 2, behoben über
// die Regel-Tafel der Sonder-Blöcke (Epic 3E-000447) und die Entfernung ohne
// Code-Regel.
//
//   - Z2: Eine Datentabelle in Zitat, Hinweis-Kasten oder Listen-Eintrag zeigt
//     die Anzeige ohne Kommentar; der portable Export behielt ihn.
//   - S2: Eine Datentabelle oder Canvas-Fläche ohne Schluss-Zaun am
//     Dokument-Ende behielt im portablen Export ihre Kommentare.
//   - S1: Druck, PDF und HTML-Export aus der Quelltext-Ansicht gaben Kommentare
//     in Zellen einer Datentabelle und auf Karten der Canvas-Fläche weiter, weil
//     die Entfernung den Inhalt eines Zauns als Code überspringt.
//   - Z9: Eine Beschriftung der Canvas-Fläche mit vier Leerzeichen Einzug oder
//     in Backticks behielt ihren Kommentar; sie ist reiner Text, die Code-Regel
//     der Markdown-Anzeige passt dort nicht.
//   - Prüfrunde 3, Befund 1 beider Prüfer: Eine geschlossene Fläche auf oberster
//     Ebene ersetzt der portable Export vor der Regel des Fließtexts durch
//     Markdown; Beschriftungen in Backticks oder mit Einzug wurden dort zu Code
//     und behielten ihren Kommentar.
//   - Prüfrunde 3, Befund 2 des Zweitblicks: Vorschau und Liste befreiten die
//     Kopfzeile einer Verweis- oder Bild-Karte nach der Regel des Fließtexts.
import { describe, it, expect, afterEach } from 'vitest';
import {
  convertMarkdownPortable,
  configureExtensions,
  quelltextOhneKommentare,
} from '../../../src/shared/markdown/markdown.js';
import {
  canvasBeschriftung,
  canvasFlaechenTitel,
  canvasKartenVorschau,
  canvasListe,
  parseCanvasFence,
} from '../../../src/shared/canvas/canvas-core.js';
import { quelltextFuerExport } from '../../../src/renderer/modules/views/quelltext-export.js';

const GEHEIM = 'GEHEIMVERMERK';
const K = `%%${GEHEIM}%%`;
const Z = '```';

afterEach(() => {
  configureExtensions([]);
  delete globalThis.window;
});

const TABELLE = ['columns: Name:text, Wert:number', `| Anna ${K} | 3 |`, '| Bernd | 4 |'];
const FLAECHE = [
  '!karte k1 x=0 y=0 b=200 h=100',
  `Titel ${K}`,
  '!form f1 x=300 y=0 b=100 h=50',
  `    Kasten ${K}`,
  '!form f2 x=300 y=100 b=100 h=50',
  `\`a ${K} b\``,
];
const vor = (praefix, zeilen) => zeilen.map((z) => praefix + z).join('\n');

describe('Z2: Datentabelle unterhalb der obersten Ebene im portablen Export', () => {
  it('in einem Zitat', () => {
    const aus = convertMarkdownPortable(vor('> ', [`${Z}perspective-datatable`, ...TABELLE, Z]));
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('Anna');
    expect(aus).toContain('| Bernd | 4 |');
  });

  it('in einem Hinweis-Kasten', () => {
    const aus = convertMarkdownPortable(
      vor('> ', ['[!note] Hinweis', `${Z}perspective-datatable`, ...TABELLE, Z]),
    );
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('Anna');
  });

  it('in einem Listen-Eintrag mit vier Leerzeichen Einzug', () => {
    const text = `- Punkt\n\n${vor('    ', [`${Z}perspective-datatable`, ...TABELLE, Z])}\n`;
    const aus = convertMarkdownPortable(text);
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('    | Bernd | 4 |');
  });
});

describe('S2: Block ohne Schluss-Zaun am Dokument-Ende im portablen Export', () => {
  it('Datentabelle', () => {
    const aus = convertMarkdownPortable(
      ['Vorher', `${Z}perspective-datatable`, ...TABELLE].join('\n'),
    );
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('Anna');
  });

  it('Canvas-Fläche', () => {
    const aus = convertMarkdownPortable(
      ['Vorher', `${Z}perspective-canvas`, ...FLAECHE].join('\n'),
    );
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('Titel');
    expect(aus).toContain('Kasten');
  });

  it('Canvas-Fläche in einem Zitat', () => {
    const aus = convertMarkdownPortable(vor('> ', [`${Z}perspective-canvas`, ...FLAECHE, Z]));
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('Titel');
  });
});

describe('S1: Quelltext für Druck, PDF und HTML-Export aus der Quelltext-Ansicht', () => {
  const DOKUMENT = [
    '# Kopf',
    `Fließtext ${K} weiter`,
    `${Z}perspective-datatable`,
    ...TABELLE,
    Z,
    '',
    `${Z}perspective-canvas`,
    ...FLAECHE,
    Z,
    '',
    `${Z}js`,
    `const a = '${K}';`,
    Z,
  ].join('\n');

  it('die Entfernung im Kern erfasst Zellen, Karten und Beschriftungen, Code bleibt', () => {
    const aus = quelltextOhneKommentare(DOKUMENT);
    // Nur der Code-Block behält den Kommentar, wie in der Anzeige.
    expect(aus.split(GEHEIM).length - 1).toBe(1);
    expect(aus).toContain(`const a = '${K}';`);
    expect(aus).toContain('| Anna | 3 |');
    expect(aus).toContain('| Bernd | 4 |');
    expect(aus).toContain('Titel ');
    expect(aus).toContain('    Kasten ');
    // Zeilentreu: Der Quelltext behält seine Zeilen-Nummern.
    expect(aus.split('\n').length).toBe(DOKUMENT.split('\n').length);
  });

  it('ist die Erweiterung «Kommentare» aus, bleibt der Text unverändert', () => {
    configureExtensions(['comments']);
    expect(quelltextOhneKommentare(DOKUMENT)).toBe(DOKUMENT);
  });

  it('ist die Erweiterung des Blocks aus, bleibt sein Rumpf wie in der Anzeige stehen', () => {
    configureExtensions(['perspective-datatable']);
    const aus = quelltextOhneKommentare(DOKUMENT);
    expect(aus).toContain(`| Anna ${K} | 3 |`);
    expect(aus).not.toContain(`Titel ${K}`);
  });

  it('der Anzeige-Prozess nimmt die Entfernung über die Brücke, das Frontmatter bleibt', () => {
    globalThis.window = { api: { quelltextOhneKommentare } };
    const mitKopf = `---\ntitel: "a %% b"\n---\n${DOKUMENT}`;
    const aus = quelltextFuerExport(mitKopf, true);
    expect(aus.startsWith('---\ntitel: "a %% b"\n---\n')).toBe(true);
    expect(aus.split(GEHEIM).length - 1).toBe(1);
    expect(aus).toContain('| Anna | 3 |');
  });

  it('eine Antwort der Brücke, die keine Zeichenkette ist, fällt auf die Regel des Fließtexts zurück', () => {
    globalThis.window = { api: { quelltextOhneKommentare: () => null } };
    const aus = quelltextFuerExport(`Text ${K} da`, true);
    expect(aus).toBe('Text  da');
  });
});

describe('Z9: Beschriftung der Canvas-Fläche ist reiner Text', () => {
  const OHNE = { ohneKommentare: true };
  const elemente = parseCanvasFence(FLAECHE.join('\n')).elemente;

  it('mit vier Leerzeichen Einzug', () => {
    const form = elemente.find((el) => el.id === 'f1');
    expect(canvasBeschriftung(form, OHNE)).not.toContain(GEHEIM);
    expect(canvasBeschriftung(form, OHNE)).toContain('Kasten');
  });

  it('in Backticks', () => {
    const form = elemente.find((el) => el.id === 'f2');
    expect(canvasBeschriftung(form, OHNE)).toBe('`a  b`');
  });

  it('ein maskierter Marker erscheint als zwei Prozentzeichen', () => {
    expect(canvasBeschriftung({ inhalt: 'a \\%% b' }, OHNE)).toBe('a %% b');
  });

  it('die Liste der Fläche nennt Formen und Verbindungen ohne Kommentar', () => {
    const modell = parseCanvasFence(
      [
        ...FLAECHE,
        '!karte k2 x=0 y=300 b=200 h=100',
        'Zweite',
        '!linie l1 k1 -> k2',
        `    Weg ${K}`,
      ].join('\n'),
    );
    const liste = canvasListe(modell, OHNE);
    expect(JSON.stringify(liste)).not.toContain(GEHEIM);
    expect(liste.find((e) => e.id === 'f1').text).toBe('Kasten');
    const karte = liste.find((e) => e.id === 'k1');
    expect(karte.verbindungen[0].text).toBe('Weg');
  });

  it('der Text einer Text-Karte bleibt Markdown: Code behält seinen Kommentar', () => {
    const modell = parseCanvasFence(['!karte k1 x=0 y=0 b=200 h=100', `\`a ${K}\``].join('\n'));
    expect(canvasFlaechenTitel(modell, OHNE)).toContain(GEHEIM);
  });

  it('ohne die Option bleibt die Beschriftung roh', () => {
    const form = elemente.find((el) => el.id === 'f2');
    expect(canvasBeschriftung(form)).toContain(GEHEIM);
  });
});

describe('Prüfrunde 3: Fläche mit Schluss-Zaun auf oberster Ebene im portablen Export', () => {
  const VERWEIS = [
    '!karte k0 x=0 y=-200 b=200 h=100 doc="Ziel.md"',
    `\`Kopf ${K}\``,
    '!karte k3 x=0 y=400 b=200 h=100 bild="bild.png"',
    `    Bild ${K}`,
  ];
  const DOKUMENT = [
    'Vorher',
    `${Z}perspective-canvas`,
    ...VERWEIS,
    ...FLAECHE,
    '!gruppe g1 x=-50 y=-50 b=600 h=300',
    `\`Gruppe ${K}\``,
    '!karte k2 x=0 y=300 b=200 h=100',
    'Zweite',
    '!linie l1 k1 -> k2',
    `\`Weg ${K}\``,
    '!linie l2 k0 -> k3',
    Z,
    'Nachher',
  ].join('\n');

  it('keine Beschriftung behält ihren Kommentar, der Text bleibt stehen', () => {
    const aus = convertMarkdownPortable(DOKUMENT);
    expect(aus).not.toContain(GEHEIM);
    for (const wort of ['Kopf', 'Bild', 'Kasten', '`a b`', 'Gruppe', 'Weg', 'Titel', 'Nachher']) {
      expect(aus).toContain(wort);
    }
  });

  it('der Name der Fläche aus einer Verweis-Karte trägt keinen Kommentar', () => {
    const aus = convertMarkdownPortable(DOKUMENT);
    const kopf = aus.split('\n').find((z) => z.includes('Kopf'));
    expect(kopf).toBeDefined();
    expect(kopf).not.toContain(GEHEIM);
  });

  it('ein maskierter Marker in einer Beschriftung bleibt maskiert und verschluckt nichts', () => {
    const aus = convertMarkdownPortable(
      [
        `${Z}perspective-canvas`,
        '!form f1 x=0 y=0 b=100 h=50',
        'Rabatt 50 \\%% ab heute',
        '!form f2 x=0 y=100 b=100 h=50',
        'Zweite Form',
        Z,
        'Nachher',
      ].join('\n'),
    );
    expect(aus).toContain('Rabatt 50 \\%% ab heute');
    expect(aus).toContain('Zweite Form');
    expect(aus).toContain('Nachher');
  });

  it('bei ausgeschalteter Erweiterung «Kommentare» bleibt die Beschriftung roh', () => {
    configureExtensions(['comments']);
    const aus = convertMarkdownPortable(DOKUMENT);
    expect(aus).toContain(GEHEIM);
  });
});

describe('Prüfrunde 3: Vorschau und Liste einer Verweis- oder Bild-Karte', () => {
  const OHNE = { ohneKommentare: true };
  const modell = parseCanvasFence(
    [
      '!karte k0 x=0 y=0 b=200 h=100 doc="Ziel.md"',
      `\`Kopf ${K}\``,
      '!karte k3 x=0 y=200 b=200 h=100 bild="bild.png"',
      `    Bild ${K}`,
    ].join('\n'),
  );

  it('Vorschau ohne Kommentar, in Backticks und mit Einzug', () => {
    for (const el of modell.elemente) {
      expect(JSON.stringify(canvasKartenVorschau(el, OHNE))).not.toContain(GEHEIM);
    }
    expect(canvasKartenVorschau(modell.elemente[1], OHNE).titel).toBe('Bild');
  });

  it('Liste ohne Kommentar', () => {
    expect(JSON.stringify(canvasListe(modell, OHNE))).not.toContain(GEHEIM);
  });

  it('ohne die Option bleibt die Kopfzeile roh', () => {
    expect(canvasKartenVorschau(modell.elemente[0]).titel).toContain(GEHEIM);
  });
});
