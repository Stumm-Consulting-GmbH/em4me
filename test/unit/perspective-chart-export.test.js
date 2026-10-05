// 4T-002025 (Epic 3E-000192): Der prozess-neutrale Kern des Diagramms zu einer
// Datentabelle im portablen Export (src/shared/markdown/perspective-chart-export.js)
// — welche Stelle im Text ein Diagramm-Block ist, welcher Inhalt an den Zeichner
// geht und was an seine Stelle tritt.
//
// Das Zeichnen und die Wahl der Farben liegen im Anzeige-Prozess
// (test/unit/renderer/diagramm-export.test.js); dass das Bild in der
// exportierten Datei ankommt, weist test/e2e/funktionen/diagramme-export.spec.js
// nach. Hier stehen die Entscheidungen, in denen ein Irrtum still Text des
// Anwenders verschlucken oder ein Diagramm verlieren würde.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ersetzeDiagrammBloecke,
  findeDiagrammBloecke,
  kursiveZeile,
  markiereKartenDiagramme,
  sammleDiagrammQuellen,
  stelleKartenMarkenWiederHer,
} from '../../src/shared/markdown/perspective-chart-export.js';
import { convertMarkdownPortable, renderMarkdown } from '../../src/shared/markdown/markdown.js';
import { istTextKarte, parseCanvasFence } from '../../src/shared/canvas/canvas-core.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Bestands-Lesung im Modulkopf (test/README.md, «Bestands-Lesungen gehören in
// den Modulkopf»).
const KERN_TEXT = fs.readFileSync(
  path.join(WURZEL, 'src/shared/markdown/perspective-chart-export.js'),
  'utf8',
);

const Z = '`'.repeat(3);
const ZL = '`'.repeat(4);
const T = '~'.repeat(3);
const RUMPF = 'table: ^umsatz\ntype: bar\nvalues: Einnahmen\n';
const BLOCK = `${Z}perspective-chart\n${RUMPF}${Z}`;
const BILD = '<img alt="Diagramm" src="data:image/svg+xml;base64,AAAA">\n';

// Die Quellen, die der Render-Weg den Diagramm-Containern gibt, in
// Dokument-Reihenfolge (Attribut `data-chart-source`, entmaskiert).
function quellenDesRenderWegs(text) {
  const html = renderMarkdown(text, 'de');
  return [...html.matchAll(/data-chart-source="([^"]*)"/g)].map((m) =>
    m[1]
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'),
  );
}

describe('sammleDiagrammQuellen — was als Diagramm-Block gilt (AK4, AK14)', () => {
  it('liefert den Inhalt eines Blocks', () => {
    expect(sammleDiagrammQuellen(`Text\n\n${BLOCK}\n\nmehr`)).toEqual([RUMPF]);
  });

  it('liefert mehrere Blöcke in Textreihenfolge und behält Doppelte (AK14)', () => {
    const zweiter = `${Z}perspective-chart\ntable: ^kosten\ntype: pie\n${Z}`;
    const text = [BLOCK, zweiter, BLOCK].join('\n\n');
    expect(sammleDiagrammQuellen(text)).toEqual([RUMPF, 'table: ^kosten\ntype: pie\n', RUMPF]);
  });

  it('erkennt einen Tilden-Zaun und einen längeren Zaun', () => {
    const tilde = `${T}perspective-chart\n${RUMPF}${T}`;
    const lang = `${ZL}perspective-chart\n${RUMPF}${ZL}`;
    expect(sammleDiagrammQuellen(`${tilde}\n\n${lang}`)).toEqual([RUMPF, RUMPF]);
  });

  // Durchsicht vom 2026-09-30 (D3): Bis dahin nahm der Kern nur geschlossene
  // Blöcke; die Ansicht zeichnet einen offenen aber, weil markdown-it ihn am
  // Textende schließt. Der Fall hielt das alte Verhalten fest und ist berichtigt.
  it('nimmt auch einen bis zum Textende offenen Block, mit dem Rest als Inhalt', () => {
    expect(sammleDiagrammQuellen(`Text\n\n${Z}perspective-chart\n${RUMPF}`)).toEqual([RUMPF]);
    // Ein kürzerer Zaun schließt nicht: Der Block bleibt bis zum Ende offen.
    expect(sammleDiagrammQuellen(`${ZL}perspective-chart\n${RUMPF}${Z}\n`)).toEqual([
      `${RUMPF}${Z}\n`,
    ]);
    const [offen] = findeDiagrammBloecke(`a\n${Z}perspective-chart\n${RUMPF}`);
    expect(offen).toMatchObject({
      geschlossen: false,
      ende: `a\n${Z}perspective-chart\n${RUMPF}`.length,
    });
  });

  it('nimmt nur Blöcke der obersten Ebene (in einem längeren Zaun, in Liste, in Zitat)', () => {
    const zitiert = `${ZL}markdown\n${BLOCK}\n${ZL}`;
    const liste = `- ${Z}perspective-chart\n  ${RUMPF.split('\n').join('\n  ')}${Z}`;
    const zitat = `> ${Z}perspective-chart\n> table: ^umsatz\n> ${Z}`;
    expect(sammleDiagrammQuellen(zitiert)).toEqual([]);
    expect(sammleDiagrammQuellen(liste)).toEqual([]);
    expect(sammleDiagrammQuellen(zitat)).toEqual([]);
    // Gegenprobe: Derselbe Block hinter dem äußeren Zaun wird erkannt.
    expect(sammleDiagrammQuellen(`${zitiert}\n\n${BLOCK}`)).toEqual([RUMPF]);
  });

  it('lässt andere Blöcke aus, auch mit ähnlichem Namen', () => {
    const text = [
      `${Z}perspective-datatable\n| a |\n${Z}`,
      `${Z}perspective-charts\n${RUMPF}${Z}`,
      `${Z}mermaid\ngraph TD;\n${Z}`,
    ].join('\n\n');
    expect(sammleDiagrammQuellen(text)).toEqual([]);
  });

  it('liefert Zeilenenden als LF, auch in einer Datei mit CRLF', () => {
    const crlf = `Kopf\r\n\r\n${BLOCK.split('\n').join('\r\n')}\r\n`;
    expect(sammleDiagrammQuellen(crlf)).toEqual([RUMPF]);
  });
});

describe('Der gelieferte Inhalt ist die Quelle des Render-Wegs', () => {
  // Weicht er ab, zeichnet der Export ein anderes Diagramm als die Ansicht.
  const faelle = {
    einfach: `Text\n\n${BLOCK}\n`,
    eingerueckt: `  ${Z}perspective-chart\n  table: ^umsatz\n    type: bar\n values: X\n  ${Z}\n`,
    crlf: `${BLOCK.split('\n').join('\r\n')}\r\n`,
    tilde: `${T}perspective-chart title\n${RUMPF}${T}\n`,
    leer: `${Z}perspective-chart\n${Z}\n`,
    zwei: `${BLOCK}\n\n${ZL}perspective-chart\ntable: ^b\n${Z}\n${ZL}\n`,
    // Durchsicht vom 2026-09-30 (D3): offen bis zum Textende.
    'offen ohne Schluss-Umbruch': `Text\n\n${Z}perspective-chart\ntable: ^umsatz\ntype: bar`,
    'offen mit Schluss-Umbruch': `${Z}perspective-chart\n${RUMPF}`,
    'offen mit Leerzeilen am Ende': `${Z}perspective-chart\n${RUMPF}\n\n`,
    'offen mit CRLF': `${Z}perspective-chart\r\ntable: ^umsatz\r\ntype: bar\r\n`,
    'offen, eingerückt': `  ${Z}perspective-chart\n  table: ^umsatz\n    type: bar\n`,
    'offen hinter kürzerem Zaun': `${BLOCK}\n\n${ZL}perspective-chart\n${RUMPF}${Z}\n`,
    // Durchsicht vom 2026-09-30 (D4): eingerückt unter einem Listenpunkt.
    'unter einem Listenpunkt': `- Punkt\n\n  ${Z}perspective-chart\n  ${RUMPF.split('\n').join('\n  ')}${Z}\n`,
  };
  for (const [name, text] of Object.entries(faelle)) {
    it(`Fall «${name}»`, () => {
      const erwartet = quellenDesRenderWegs(text);
      expect(erwartet.length).toBeGreaterThan(0);
      expect(sammleDiagrammQuellen(text)).toEqual(erwartet);
    });
  }
});

describe('ersetzeDiagrammBloecke — was an die Stelle tritt (AK4, AK8)', () => {
  it('ersetzt den ganzen Block durch den gelieferten Ersatz, der Rest bleibt byte-gleich', () => {
    const vor = '# Kopf\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n';
    const nach = '\n\nSchluss  \n';
    expect(ersetzeDiagrammBloecke(vor + BLOCK + nach, () => BILD)).toBe(vor + BILD + nach);
  });

  it('lässt den Block byte-gleich stehen, wenn der Bauer nichts liefert (AK8)', () => {
    const text = `a\n\n${BLOCK}\n\nb\n`;
    expect(ersetzeDiagrammBloecke(text, () => null)).toBe(text);
    expect(ersetzeDiagrammBloecke(text, () => undefined)).toBe(text);
  });

  it('ersetzt jeden Block für sich, auch wenn nur einer ein Bild bekommt (AK14)', () => {
    const zweiter = `${Z}perspective-chart\ntable: ^kosten\n${Z}`;
    const text = `${BLOCK}\n\nZwischen\n\n${zweiter}\n`;
    const neu = ersetzeDiagrammBloecke(text, (body) => (body === RUMPF ? BILD : null));
    expect(neu).toBe(`${BILD}\n\nZwischen\n\n${zweiter}\n`);
  });

  it('gibt dem Bauer den Inhalt des Render-Wegs und ersetzt gleiche Blöcke gleich', () => {
    const gesehen = [];
    const neu = ersetzeDiagrammBloecke(`${BLOCK}\n\n${BLOCK}\n`, (body) => {
      gesehen.push(body);
      return BILD;
    });
    expect(gesehen).toEqual([RUMPF, RUMPF]);
    expect(neu).toBe(`${BILD}\n\n${BILD}\n`);
  });

  it('übernimmt Sonderzeichen im Ersatz wörtlich (Fehlerklasse L7)', () => {
    // In einem Ersetzungs-Text von String.replace wären das Sonderzeichen:
    // `$&` der ganze Treffer, `$1` die erste Gruppe, `$$` ein Dollar.
    const ersatz = '<img alt="$& $1 $$ $` $\'" src="data:image/svg+xml;base64,$&$1$$">\n';
    const text = `vor\n\n${BLOCK}\n\nnach`;
    expect(ersetzeDiagrammBloecke(text, () => ersatz)).toBe(`vor\n\n${ersatz}\n\nnach`);
  });

  it('lässt die Zeilenenden einer CRLF-Datei außerhalb des Blocks unberührt', () => {
    const crlf = `Kopf\r\n\r\n${BLOCK.split('\n').join('\r\n')}\r\n\r\nFuß\r\n`;
    expect(ersetzeDiagrammBloecke(crlf, () => BILD)).toBe(`Kopf\r\n\r\n${BILD}\r\n\r\nFuß\r\n`);
  });

  it('ersetzt einen Tilden-Zaun und lässt fremde Blöcke unverändert', () => {
    const fremd = `${Z}mermaid\ngraph TD;\n${Z}`;
    const text = `${fremd}\n\n${T}perspective-chart\n${RUMPF}${T}\n`;
    expect(ersetzeDiagrammBloecke(text, () => BILD)).toBe(`${fremd}\n\n${BILD}\n`);
  });

  // Durchsicht vom 2026-09-30 (D3): Bis dahin ließ der Kern auch den offenen
  // Block stehen; dieser Teil des Falls ist in den nächsten gewandert.
  it('lässt zitierte Blöcke stehen und ruft den Bauer für sie nicht', () => {
    const text = `${ZL}markdown\n${BLOCK}\n${ZL}\n\nnach`;
    let gerufen = 0;
    expect(
      ersetzeDiagrammBloecke(text, () => {
        gerufen += 1;
        return BILD;
      }),
    ).toBe(text);
    expect(gerufen).toBe(0);
  });

  it('ersetzt einen offenen Block der obersten Ebene bis zum Textende, wenn er zeichenbar ist (D3)', () => {
    const vor = `${ZL}markdown\n${BLOCK}\n${ZL}\n\nText\n\n`;
    for (const rest of [RUMPF, RUMPF.slice(0, -1), `${RUMPF}\n\n`]) {
      const text = `${vor}${Z}perspective-chart\n${rest}`;
      const gesehen = [];
      const neu = ersetzeDiagrammBloecke(text, (body) => {
        gesehen.push(body);
        return BILD;
      });
      expect(neu).toBe(vor + BILD);
      // Der Bauer bekommt die Quelle, mit der die Ansicht den Block zeichnet.
      expect(gesehen).toEqual(quellenDesRenderWegs(text));
      // Nicht zeichenbar: der Block bleibt byte-gleich.
      expect(ersetzeDiagrammBloecke(text, () => null)).toBe(text);
    }
  });

  it('behält die Einrückung eines Zauns unter einem Listenpunkt; das Bild bleibt im Listenpunkt (D4)', () => {
    const eingerueckt = RUMPF.split('\n').join('\n  ');
    for (const vor of ['- Punkt\n\n', '- Punkt\n', '1. Punkt\n\n ']) {
      const text = `${vor}  ${Z}perspective-chart\n  ${eingerueckt}${Z}\n- Zwei\n`;
      const neu = ersetzeDiagrammBloecke(text, () => BILD);
      expect(neu).toBe(`${vor}  ${BILD}\n- Zwei\n`);
    }
    // Dass das Bild am Lese-Ende im Listenpunkt steht, prüft
    // test/unit/renderer/diagramm-export.test.js: Der Sanitizer braucht ein DOM.
    // Ein mehrzeiliger Ersatz bekommt die Einrückung auf jeder Zeile.
    const text = `- Punkt\n\n  ${Z}perspective-chart\n  ${eingerueckt}${Z}\n`;
    expect(ersetzeDiagrammBloecke(text, () => `${BILD}Zeile\n`)).toBe(
      `- Punkt\n\n  ${BILD}  Zeile\n\n`,
    );
  });

  it('meldet Anfang und Ende eines Blocks an den Zeilen-Grenzen', () => {
    const text = `ab\n${BLOCK}\r\nc`;
    const [b] = findeDiagrammBloecke(text);
    expect(text.slice(b.start, b.ende)).toBe(BLOCK);
  });
});

describe('Heimat der Erkennung', () => {
  it('der Kern nimmt die Zaun-Regel aus fence-level.js und keinen eigenen Ausdruck', () => {
    expect(KERN_TEXT).toContain("require('./fence-level.js')");
    expect(KERN_TEXT).toContain("require('./perspective-chart-ref.js')");
    // Der Kern ersetzt nie über einen Ersetzungs-Text (Fehlerklasse L7).
    expect(KERN_TEXT).not.toMatch(/\.replace\(/);
  });

  it('der Kern lädt weder DOM noch Electron noch Datei-Zugriff', () => {
    const importe = [...KERN_TEXT.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
    expect(importe).toEqual([
      './fence-level.js',
      './perspective-chart-ref.js',
      '../canvas/canvas-core.js',
    ]);
    expect(KERN_TEXT).not.toMatch(/\b(document|window)\./);
  });

  it('welche Karte eine Text-Karte ist, entscheidet der Kern der Canvas, keine Kopie hier', () => {
    expect(KERN_TEXT).not.toMatch(/function istTextKarte/);
    const els = parseCanvasFence(
      [
        '!karte t x=0 y=0 b=10 h=10',
        'Text',
        '!karte d x=0 y=0 b=10 h=10 doc="Anderes"',
        '!karte b x=0 y=0 b=10 h=10 bild="bild.png"',
        '!karte u x=0 y=0 b=10 h=10 bild="bild.txt"',
        '!gruppe g x=0 y=0 b=10 h=10',
        '',
      ].join('\n'),
    ).elemente;
    // Text-Karte ja; Verweis, gültiges und ungültiges Bild, Gruppe nein.
    expect(els.map((el) => istTextKarte(el))).toEqual([true, false, false, false, false]);
    expect(istTextKarte(null)).toBe(false);
  });
});

// --- Diagramme in Karten einer Canvas-Fläche (Entscheidung vom 2026-09-30) ----

const TAB_KARTE = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number',
  '| Januar | 7 |',
  Z,
  '^karte',
].join('\n');
const KARTEN_RUMPF = 'table: ^karte\ntype: bar\nlabels: Monat\nvalues: Einnahmen\n';
const FLAECHE = [
  `${ZL}perspective-canvas`,
  // Die erste Karte beginnt mit dem Diagramm: Ihre erste Zeile ist damit die
  // Beschriftung der Fläche im Export.
  '!karte k1 x=0 y=0 b=300 h=200',
  BLOCK,
  '!karte k2 x=400 y=0 b=300 h=300',
  'Karte mit eigener Tabelle',
  '',
  TAB_KARTE,
  '',
  `${Z}perspective-chart\n${KARTEN_RUMPF}${Z}`,
  '!karte k3 x=0 y=400 b=300 h=100 doc="Anderes"',
  `${Z}perspective-chart\n${RUMPF}${Z}`,
  '!gruppe g1 x=-10 y=-10 b=800 h=700',
  `${Z}perspective-chart\n${RUMPF}${Z}`,
  // Ein Befund hinter den Diagrammen: Seine Zeilen-Angabe darf sich nicht
  // verschieben.
  '!karte k1 x=0 y=0 b=10 h=10',
  ZL,
].join('\n');
const MIT_FLAECHE = ['# Dokument', BLOCK, FLAECHE, 'Schluss.', ''].join('\n\n');
const festerZufall = () => 0.5;

describe('markiereKartenDiagramme — Diagramme in Karten (Canvas-Fläche)', () => {
  it('markiert jeden Block einer Karte, keinen Block des Dokuments, bei gleicher Zeilen-Zahl', () => {
    const { text, karten } = markiereKartenDiagramme(MIT_FLAECHE, { zufall: festerZufall });
    expect(karten).toHaveLength(4);
    expect(text.split('\n')).toHaveLength(MIT_FLAECHE.split('\n').length);
    // Der Block des Dokuments bleibt unmarkiert und bleibt der einzige.
    expect(sammleDiagrammQuellen(text)).toEqual([RUMPF]);
    // Vor der Umwandlung stehen die Karten-Blöcke im Zaun der Fläche.
    for (const k of karten) expect(text.split(k.marke)).toHaveLength(2);
  });

  it('zeichnet nur Blöcke von Text-Karten, aufgelöst gegen den eigenen Karten-Text', () => {
    const { karten } = markiereKartenDiagramme(MIT_FLAECHE, { zufall: festerZufall });
    expect(karten.map((k) => k.zeichnen)).toEqual([true, true, false, false]);
    expect(karten[0].kartenText).toBe(BLOCK);
    expect(karten[0].body).toBe(RUMPF);
    expect(karten[1].kartenText).toContain('^karte');
    expect(karten[1].kartenText).not.toContain('Karte mit Diagramm');
    expect(karten[1].body).toBe(KARTEN_RUMPF);
  });

  it('der Inhalt eines Karten-Blocks ist die Quelle des Render-Wegs der Karte', () => {
    const { karten } = markiereKartenDiagramme(MIT_FLAECHE, { zufall: festerZufall });
    for (const k of karten.filter((x) => x.zeichnen)) {
      expect(quellenDesRenderWegs(k.kartenText)).toContain(k.body);
    }
  });

  it('das Zurücksetzen der Marken gibt den Text byte-gleich zurück, auch mit CRLF', () => {
    for (const text of [MIT_FLAECHE, MIT_FLAECHE.split('\n').join('\r\n')]) {
      const m = markiereKartenDiagramme(text, { zufall: festerZufall });
      expect(m.text).not.toBe(text);
      expect(stelleKartenMarkenWiederHer(m.text, m.karten)).toBe(text);
    }
  });

  it('nach der Umwandlung steht jeder Karten-Block mit Marke auf der obersten Ebene', () => {
    const m = markiereKartenDiagramme(MIT_FLAECHE, { zufall: festerZufall });
    const portabel = convertMarkdownPortable(m.text);
    // Der Schritt der obersten Ebene sieht allein den Block des Dokuments.
    expect(sammleDiagrammQuellen(portabel)).toEqual([RUMPF]);
    expect(findeDiagrammBloecke(portabel, m.karten[1].marke)[0].body).toBe(KARTEN_RUMPF);
  });

  it('Umwandlung mit Marke und Zurücksetzen ergibt denselben Export wie ohne Marke', () => {
    // Beschriftung der Fläche aus der ersten Karten-Zeile, Befund-Zeilen,
    // Gruppen-Zeile: überall steht nach dem Zurücksetzen der Name.
    const m = markiereKartenDiagramme(MIT_FLAECHE, { zufall: festerZufall });
    const ohne = convertMarkdownPortable(MIT_FLAECHE);
    expect(stelleKartenMarkenWiederHer(convertMarkdownPortable(m.text), m.karten)).toBe(ohne);
    expect(ohne).toContain('perspective-chart');
  });

  it('eine nicht umgewandelte Fläche (Tilden-Zaun) bekommt ihren Text zurück', () => {
    const tilde = MIT_FLAECHE.split(ZL).join('~~~~');
    const m = markiereKartenDiagramme(tilde, { zufall: festerZufall });
    expect(m.karten.length).toBeGreaterThan(0);
    const ohne = convertMarkdownPortable(tilde);
    expect(stelleKartenMarkenWiederHer(convertMarkdownPortable(m.text), m.karten)).toBe(ohne);
  });

  it('ein offener Block in einer Karte wird markiert, aber nicht gezeichnet', () => {
    const offen = [`${ZL}perspective-canvas`, '!karte k1', `${Z}perspective-chart`, RUMPF, ZL].join(
      '\n',
    );
    const { karten } = markiereKartenDiagramme(offen, { zufall: festerZufall });
    expect(karten).toHaveLength(1);
    expect(karten[0].zeichnen).toBe(false);
  });

  it('ohne Fläche und ohne Diagramm bleibt der Text unverändert', () => {
    expect(markiereKartenDiagramme(`${BLOCK}\n`).karten).toEqual([]);
    expect(markiereKartenDiagramme('nur Text').text).toBe('nur Text');
  });

  it('eine Marke kommt im Text nicht schon vor und trifft beim Zurücksetzen keine längere', () => {
    let n = 0;
    const zufall = () => [0.25, 0.25, 0.75][n++];
    const vorhanden = markiereKartenDiagramme(MIT_FLAECHE, { zufall: () => 0.25 }).karten[0].marke;
    const text = `${vorhanden}\n\n${MIT_FLAECHE}`;
    const m = markiereKartenDiagramme(text, { zufall });
    expect(m.karten[0].marke.startsWith(vorhanden.slice(0, -1))).toBe(false);
    expect(stelleKartenMarkenWiederHer(m.text, m.karten)).toBe(text);
    const viele = m.karten.map((k, i) => ({ marke: `${k.marke.slice(0, -1)}${i === 0 ? 1 : 10}` }));
    expect(stelleKartenMarkenWiederHer(`${viele[1].marke} ${viele[0].marke}`, viele)).toBe(
      'perspective-chart perspective-chart',
    );
  });
});

// --- Zeile der ausgelassenen Werte (Entscheidung vom 2026-09-30) -------------

// Der Text der gerenderten Zeile: Inhalt des <em> ohne Maskierung.
function gerenderteZeile(zeile) {
  const html = renderMarkdown(`<!-- perspective-portable -->\n\n${zeile}\n`, 'de');
  const m = /<p><em>([\s\S]*)<\/em><\/p>/.exec(html);
  if (!m) return { html, text: null };
  const text = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return { html, text };
}

const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const AUSLASS_SAETZE = SPRACHEN.flatMap((code) => {
  const fragment = JSON.parse(
    fs.readFileSync(path.join(WURZEL, 'src/i18n/fragments', code, 'chart.json'), 'utf8'),
  );
  return [
    [code, 'one', fragment['chart.omitted.one']],
    [code, 'other', fragment['chart.omitted.other'].split('{n}').join('12')],
  ];
});

describe('kursiveZeile — der Satz als eigener Absatz ohne Nebenwirkung', () => {
  it('liest die Sätze aller fünf Sprachen (Plausibilität)', () => {
    expect(AUSLASS_SAETZE).toHaveLength(10);
    for (const [, , satz] of AUSLASS_SAETZE) expect(typeof satz).toBe('string');
  });

  for (const [code, zahl, satz] of AUSLASS_SAETZE) {
    it(`${code}, ${zahl}: gerendert steht genau der Satz kursiv, nichts sonst`, () => {
      const zeile = kursiveZeile(satz);
      expect(zeile.startsWith('*') && zeile.endsWith('*')).toBe(true);
      expect(zeile).not.toContain('\n');
      const { html, text } = gerenderteZeile(zeile);
      expect(text, html).toBe(satz);
      expect(html).not.toMatch(/<(a|strong|code|span|del|mark|sup|sub)\b/);
    });
  }

  it('ein Satz voller Markdown-Zeichen bleibt wörtlich (eigene Sprache)', () => {
    const satz =
      '1. **fett** _x_ `c` [a](b) [[Seite]] #tag ^anker ==m== ~~d~~ %%k%% {=1+2} <b>h</b> ' +
      'www.example.com "q" -- (c) \\ $1 $& ...';
    const { html, text } = gerenderteZeile(kursiveZeile(satz));
    expect(text, html).toBe(satz);
    expect(html).not.toMatch(/<(a|strong|code|span|del|mark|b|ol|li)\b/);
  });

  it('fasst Zeilenumbrüche zu Leerzeichen und liefert bei leerem Satz nichts', () => {
    expect(kursiveZeile('a\n  b')).toBe('*a b*');
    expect(kursiveZeile('')).toBe('');
    expect(kursiveZeile('  ')).toBe('');
    expect(kursiveZeile(null)).toBe('');
  });

  it('lässt Komma und Semikolon unmaskiert, jedes andere ASCII-Satzzeichen nicht', () => {
    expect(kursiveZeile('a, b; c.')).toBe('*a, b; c\\.*');
    expect(kursiveZeile('ä « » é')).toBe('*ä « » é*');
  });
});
