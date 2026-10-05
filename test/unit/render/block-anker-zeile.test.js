// 4T-002048 (Epic 3E-000192): Block-Anker in einer eigenen Zeile — die
// Kennung erscheint in der gerenderten Ausgabe nicht als Text und bleibt
// Sprungziel (Story 4S-000205, AK2 und AK4).
//
// Geprüft wird der Weg durch die Render-Pipeline, den Lese-Ansicht, geteilte
// Ansicht, Druck und PDF gemeinsam nehmen. Je Fall zweierlei: wo die `id`
// steht, und dass `^name` im sichtbaren Text fehlt. Die Snapshot-Fixture
// test/fixtures/render/block-anker-zeilen.md hält die vollständige Ausgabe
// fest; hier stehen die Regeln, die eine Snapshot-Zeile nicht als Regel
// ausweist.
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
// 4T-002072: die Heimat der Kennungen, gegen die der Render-Weg gleich laufen muss.
import { blockAnchorForLine, extractBlockAnchors } from '../../../src/shared/block-anchors.js';
// 4T-002072, Nachbesserung F2: der Ausschnitt einer Einbettung, durch die
// Render-Pipeline gegeben.
import { extractEmbedSnippet } from '../../../src/main/index/embed.js';

afterEach(() => {
  configureExtensions([]);
});

const Z = '`'.repeat(3);
const render = (text) => renderMarkdown(text, 'de');
// Der sichtbare Text: alle Tags samt ihren Attributen entfernt. Ein Diagramm
// trägt `table: ^name` im Attribut, das ist kein sichtbarer Text.
const sichtbar = (html) => html.replace(/<[^>]*>/g, '');

describe('Anker-Zeile unter einem Code-Block: Kennung am Block (4T-002048)', () => {
  const FAELLE = {
    'Datentabelle (Namens-Zeile)': {
      text: `${Z}perspective-datatable\ncolumns: A:text\n| x |\n${Z}\n^umsatz\n`,
      id: 'umsatz',
      tag: '<div id="umsatz" class="perspective-datatable"',
    },
    'Code-Block': { text: `${Z}js\nlet a;\n${Z}\n^code\n`, id: 'code', tag: '<pre id="code">' },
    'Code-Block, Leerzeile dazwischen': {
      text: `${Z}js\nlet a;\n${Z}\n\n^code\n`,
      id: 'code',
      tag: '<pre id="code">',
    },
    Mermaid: {
      text: `${Z}mermaid\ngraph TD; A-->B\n${Z}\n^fluss\n`,
      id: 'fluss',
      tag: '<pre id="fluss"><code class="hljs language-mermaid">',
    },
    Diagramm: {
      text: `${Z}perspective-chart\ntable: ^t\ntype: bar\n${Z}\n^bild\n`,
      id: 'bild',
      tag: '<div id="bild" class="perspective-chart"',
    },
    Canvas: {
      text: `${Z}perspective-canvas\n!karte k1 x=0 y=0 b=200 h=100\nText\n${Z}\n^flaeche\n`,
      id: 'flaeche',
      tag: ' id="flaeche"',
    },
  };
  for (const [name, fall] of Object.entries(FAELLE)) {
    it(name, () => {
      const html = render(fall.text);
      expect(html).toContain(fall.tag);
      expect(html.match(/ id="/g)).toHaveLength(1);
      expect(sichtbar(html)).not.toContain('^' + fall.id);
    });
  }

  it('zwei Anker-Zeilen: die erste am Block, die zweite am Träger ihrer Zeile', () => {
    const html = render(`${Z}js\nx\n${Z}\n^a\n^b\n`);
    expect(html).toContain('<pre id="a">');
    expect(html).toContain('<p data-source-line="5" id="b"></p>');
    expect(sichtbar(html)).not.toMatch(/\^[ab]/);
  });

  it('ausgeschaltete Hervorhebung: genau eine id, am <pre>', () => {
    configureExtensions(['code-highlight']);
    const html = render(`${Z}js\nx\n${Z}\n^ohne\n`);
    expect(html).toContain('<pre id="ohne"><code class="language-js">');
    expect(html.match(/ id="/g)).toHaveLength(1);
  });
});

describe('Anker-Zeile ohne Code-Block davor: leerer Träger an ihrer Stelle (4T-002048)', () => {
  it('unter einer gewöhnlichen Tabelle: keine Tabellenzeile, Träger direkt darunter (AK8)', () => {
    const html = render('| A | B |\n|---|---|\n| 1 | 2 |\n^tab\n');
    expect(html).not.toContain('<td>^tab</td>');
    expect(html.match(/<tr/g)).toHaveLength(2);
    expect(html).toContain('</table>\n<p data-source-line="4" id="tab"></p>');
    expect(sichtbar(html)).not.toContain('^tab');
  });

  it('unter einer gewöhnlichen Tabelle ohne weitere Zeile: der leere Rumpf entfällt', () => {
    const html = render('| A |\n|---|\n^a\n^b\n');
    expect(html).not.toContain('<tbody');
    // Nachbesserung F1: eine Kennung am Träger, jede weitere als Sprungziel darin.
    expect(html).toContain('<p data-source-line="3" id="a"><span id="b"></span></p>');
  });

  it('eine Anker-Zeile mitten in der Tabelle bleibt eine Tabellenzeile', () => {
    const html = render('| A |\n|---|\n^mitte\n| 2 |\n');
    expect(html).toContain('<td>^mitte</td>');
  });

  it('unter einer gewöhnlichen Tabelle nach einer Leerzeile', () => {
    const html = render('| A |\n|---|\n| 1 |\n\n^tab\n');
    expect(html).toContain('<p data-source-line="5" id="tab"></p>');
    expect(sichtbar(html)).not.toContain('^tab');
  });

  it('unter einer Liste nach einer Leerzeile', () => {
    const html = render('- eins\n- zwei\n\n^li\n');
    expect(html).toContain('</ul>\n<p data-source-line="4" id="li"></p>');
    expect(sichtbar(html)).not.toContain('^li');
  });

  it('am Dokument-Anfang', () => {
    const html = render('^anfang\n\nText\n');
    expect(html).toContain('<p data-source-line="1" id="anfang"></p>');
    expect(sichtbar(html)).not.toContain('^anfang');
  });

  it('die Zeilen-Zuordnung bleibt aufsteigend (Bildlauf der geteilten Ansicht)', () => {
    const html = render(`Absatz\n\n${Z}js\nx\n${Z}\n^a\n^b\n\n| A |\n|---|\n^c\n\nEnde\n`);
    const zeilen = [...html.matchAll(/data-source-line="(\d+)"/g)].map((m) => Number(m[1]));
    expect(zeilen).toEqual([...zeilen].sort((x, y) => x - y));
  });
});

describe('Anker-Zeile innerhalb eines Blocks: Kennung am Block (4T-002048)', () => {
  it('unter einer Liste ohne Leerzeile: am letzten Listen-Eintrag', () => {
    const html = render('- eins\n- zwei\n^li\n');
    expect(html).toContain('<li data-source-line="2" id="li">zwei</li>');
  });

  it('in einem Zitat', () => {
    const html = render('> Zitat\n> ^zq\n');
    expect(html).toContain('<p data-source-line="1" id="zq">Zitat</p>');
    expect(sichtbar(html)).not.toContain('^zq');
  });

  it('mitten im Absatz (W3): die Zeile entfällt, die Kennung am Absatz', () => {
    const html = render('Zeile eins\n^mitte\nZeile drei\n');
    expect(html).toContain('<p data-source-line="1" id="mitte">Zeile eins\nZeile drei</p>');
  });

  it('Aufgaben-Zeile (W4): am Eintrag, der Text ohne Anker', () => {
    const html = render('- [ ] Aufgabe ^task\n');
    expect(html).toContain('id="task"');
    expect(html).toContain('type="checkbox"> Aufgabe</label>');
    expect(sichtbar(html)).not.toContain('^task');
  });

  it('Aufgaben-Eintrag mit Anker-Zeile darunter', () => {
    const html = render('- [ ] Aufgabe\n  ^zweite\n');
    expect(html).toContain('id="zweite"');
    expect(html).toContain('type="checkbox"> Aufgabe</label>');
    expect(sichtbar(html)).not.toContain('^zweite');
  });

  it('enge Liste mit Anker am Zeilenende: die Kennung geht nicht mehr verloren', () => {
    const html = render('- eins ^li1\n- zwei\n');
    expect(html).toContain('<li data-source-line="1" id="li1">eins</li>');
  });
});

// Nachbesserung nach der unabhängigen Durchsicht vom 2026-09-30.
describe('Nachbesserung: jede Kennung bleibt Sprungziel (F1)', () => {
  const ids = (html) => [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const FAELLE = {
    'zwei Anker am Zeilenende': [
      'Zeile eins ^a1\nZeile zwei ^a2\n',
      '<p data-source-line="1" id="a1">Zeile eins\nZeile zwei<span id="a2"></span></p>',
    ],
    'Absatz mit zwei Anker-Zeilen': [
      'Ein Absatz\n^a1\n^a2\n',
      '<p data-source-line="1" id="a1">Ein Absatz<span id="a2"></span></p>',
    ],
    'Liste mit zwei Anker-Zeilen': [
      '- zwei\n^a1\n^a2\n',
      '<li data-source-line="1" id="a1">zwei<span id="a2"></span></li>',
    ],
    'Zitat mit zwei Anker-Zeilen': [
      '> Zitat\n> ^a1\n> ^a2\n',
      '<p data-source-line="1" id="a1">Zitat<span id="a2"></span></p>',
    ],
    'Überschrift mit Anker': [
      '# Titel ^h1\n',
      '<h1 id="titel-h1" data-source-line="1">Titel<span id="h1"></span></h1>',
    ],
  };
  for (const [name, [text, erwartet]] of Object.entries(FAELLE)) {
    it(name, () => {
      const html = render(text);
      expect(html).toContain(erwartet);
      expect(sichtbar(html)).not.toMatch(/\^(a1|a2|h1)/);
    });
  }

  it('jede Kennung der Anker-Erkennung ist ein Ziel im HTML', () => {
    const text = 'Zeile eins ^a1\nZeile zwei ^a2\n\n- x\n^b1\n^b2\n\n> Z\n> ^c1\n> ^c2\n';
    expect(ids(render(text))).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'c2']);
  });
});

describe('Nachbesserung: Tabelle im Zitat und im Hinweisblock (F2)', () => {
  it('Zitat: keine Tabellenzeile mit der Kennung, Träger unter der Tabelle', () => {
    const html = render('> | a |\n> |---|\n> | 1 |\n> ^x\n');
    expect(html).not.toContain('^x');
    expect(html).toContain('</table>\n<p data-source-line="4" id="x"></p>');
  });

  it('Hinweisblock: ebenso, der Träger mit seiner Quellzeile', () => {
    const html = render('> [!note] Titel\n> | a |\n> |---|\n> | 1 |\n> ^x\n');
    expect(html).not.toContain('^x');
    expect(html).toContain('</table>\n<p data-source-line="5" id="x"></p>');
  });

  it('Zitat in zwei Ebenen', () => {
    const html = render('> > | a |\n> > |---|\n> > | 1 |\n> > ^x\n');
    expect(html).not.toContain('^x');
    expect(html).toContain('<p data-source-line="4" id="x"></p>');
  });
});

describe('Nachbesserung: maskierter Anker bleibt Text (F4)', () => {
  it('in eigener Zeile und am Zeilenende, wie in der Anker-Erkennung', () => {
    const html = render('\\^x\n\nText &#94;y\n\nText \\^z\n\nAbsatz\n\\^m\n');
    expect(html).not.toMatch(/ id="/);
    expect(sichtbar(html)).toContain('^x');
    expect(sichtbar(html)).toContain('Text ^y');
    expect(sichtbar(html)).toContain('Text ^z');
    expect(sichtbar(html)).toContain('^m');
  });
});

describe('Nachbesserung: Quellzeile des Trägers im Hinweisblock (Verbesserung a)', () => {
  it('der Träger trägt die Zeile seiner Anker-Zeile, nicht die der Titel-Zeile', () => {
    const html = render('> [!note] Titel\n> ^h\n');
    expect(html).toContain('<p data-source-line="2" id="h"></p>');
  });
});

describe('Unverändert (AK4)', () => {
  it('Anker am Ende eines Absatzes', () => {
    expect(render('Ein Absatz ^ende\n')).toContain(
      '<p data-source-line="1" id="ende">Ein Absatz</p>',
    );
  });

  it('ein Anker direkt hinter einem Verweis ist kein Anker', () => {
    const html = render('[[Ziel]]^x\n');
    expect(html).toContain('</a>^x</p>');
    expect(html).not.toContain('id="x"');
  });

  it('ausgeschaltete Wiki-Verweise: die Anker-Zeile bleibt Klartext', () => {
    configureExtensions(['wiki-links']);
    const html = render(`${Z}js\nx\n${Z}\n^aus\n`);
    expect(html).toContain('<p data-source-line="4">^aus</p>');
    expect(html).not.toContain('id="aus"');
  });
});

describe('Datei mit Portable-Marker und portabler Export', () => {
  it('der Render-Weg der portablen Datei setzt die Kennungen ohne Zeilen-Zuordnung', () => {
    const html = render(
      `<!-- perspective-portable -->\n\n${Z}js\nx\n${Z}\n^p\n\n| A |\n|---|\n| 1 |\n^q\n`,
    );
    expect(html).toContain('<pre id="p">');
    expect(html).toContain('</table>\n<p id="q"></p>');
    expect(sichtbar(html)).not.toMatch(/\^[pq]/);
  });

  it('der portable Export trägt den Anker weiter im Text (AK5)', () => {
    const quelle = `${Z}js\nx\n${Z}\n^code\n\n| A |\n|---|\n| 1 |\n^tab\n`;
    const out = convertMarkdownPortable(quelle);
    expect(out).toContain('\n^code\n');
    expect(out).toContain('\n^tab\n');
  });
});

// 4T-002072 (Epic 3E-000192): Der Name einer Datentabelle in ihrer Kopf-Angabe
// `table: Name` ist eine Block-Kennung. Die Anzeige setzt ihn als `id` an den
// Container, und zwar genau dort, wo die Heimat der Kennungen ihn zählt
// (Gleichlauf mit `extractBlockAnchors`, Grenzfälle 4, 5, 6 des Plans).
describe('Kopf-Name einer Datentabelle: Kennung am Container (4T-002072)', () => {
  const ids = (html) => [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const dt = (kopf, zaun = Z) =>
    `${zaun}perspective-datatable\n${kopf}columns: A:text\n| x |\n${zaun}\n`;

  it('table: Umsatz — die id am Container, die Angabe ist kein sichtbarer Text', () => {
    const html = render(dt('table: Umsatz\n'));
    expect(html).toContain('<div id="Umsatz" class="perspective-datatable"');
    expect(ids(html)).toEqual(['Umsatz']);
    expect(sichtbar(html)).not.toContain('table:');
  });

  it('beide Formen: Kopf-Name am Container, die Anker-Zeile am leeren Träger', () => {
    const html = render(`${dt('table: Umsatz\n')}^alt\n`);
    expect(html).toContain('<div id="Umsatz" class="perspective-datatable"');
    expect(html).toContain('<p data-source-line="6" id="alt"></p>');
    expect(sichtbar(html)).not.toContain('^alt');
  });

  // Nachbesserung F5: Kopf `table: A` und darunter `^A` sind dieselbe Kennung.
  // Die Zeile bleibt unsichtbar, und die id steht genau einmal — am Container,
  // direkt darunter, nach einer Leerzeile und vor einer Textzeile.
  it('dieselbe Kennung als Kopf-Name und als Anker-Zeile: nur der Container (F5)', () => {
    for (const [fall, darunter] of Object.entries({
      direkt: '^Umsatz\n',
      'nach einer Leerzeile': '\n^Umsatz\n',
      'vor einer Textzeile': '^Umsatz\nText danach\n',
    })) {
      const text = `${dt('table: Umsatz\n')}${darunter}`;
      const html = render(text);
      expect(html.match(/ id="Umsatz"/g), fall).toHaveLength(1);
      expect(html, fall).toContain('<div id="Umsatz" class="perspective-datatable"');
      expect(sichtbar(html), fall).not.toContain('^Umsatz');
      expect(extractBlockAnchors(text).duplicates.size, fall).toBe(0);
    }
    expect(render(`${dt('table: Umsatz\n')}^Umsatz\nText danach\n`)).toContain('>Text danach</p>');
  });

  it('eine zweite Anker-Zeile darunter bleibt ihr eigener Träger (F5)', () => {
    const text = `${dt('table: Umsatz\n')}^Umsatz\n^weiter\n`;
    expect(ids(render(text))).toEqual(['Umsatz', 'weiter']);
    expect(extractBlockAnchors(text).order).toEqual(['Umsatz', 'weiter']);
  });

  // Nachbesserung F7: Der Render-Weg übergibt den Körper ohne Frontmatter. Beginnt
  // er mit einer Linie `---` und folgt später eine zweite, hielt die Heimat den
  // Abschnitt dazwischen für Frontmatter, und die Tabelle verlor ihre id.
  it('Frontmatter und eine Linie --- am Anfang des Körpers: die Tabelle behält ihre id (F7)', () => {
    const text = `---\ntitel: X\n---\n---\n\n${dt('table: Umsatz\n')}\n---\n`;
    expect(ids(render(text))).toEqual(['Umsatz']);
    expect(extractBlockAnchors(text).order).toEqual(['Umsatz']);
  });

  // Gleichlauf: Jede Kennung, die die Heimat zählt, ist genau einmal ein Ziel,
  // und eine Datentabelle, deren Kopf-Name dort nicht zählt, trägt keine id.
  const GLEICHLAUF = {
    'Kopf-Name nach einer Leerzeile im Kopf': [dt('\ntable: Umsatz\n'), ['Umsatz']],
    'Tilde-Zaun': [dt('table: Umsatz\n', '~~~'), ['Umsatz']],
    'drei Leerzeichen Einrückung': [
      '   ```perspective-datatable\n   table: Umsatz\n   columns: A:text\n   | x |\n   ```\n',
      ['Umsatz'],
    ],
    'gleicher Name an zwei Tabellen: nur die erste (Grenzfall 5)': [
      `${dt('table: Umsatz\n')}\n${dt('table: Umsatz\n')}`,
      ['Umsatz'],
    ],
    'Name zuerst an einem Absatz: die Tabelle bleibt ohne id': [
      `Ein Absatz ^Umsatz\n\n${dt('table: Umsatz\n')}`,
      ['Umsatz'],
    ],
    'Zitat: kein Name (Grenzfall 6)': [
      '> ```perspective-datatable\n> table: Umsatz\n> columns: A:text\n> | x |\n> ```\n',
      [],
    ],
    'ungültiger Name, zweite Angabe, Angabe nach der Datenzeile': [
      `${dt('table: a b\n')}\n${dt('table: eins\ntable: zwei\n')}\n${Z}perspective-datatable\ncolumns: A:text\n| x |\ntable: spaet\n${Z}\n`,
      ['eins'],
    ],
    'Zaun einer anderen Sprache': [`${Z}js\ntable: Umsatz\n${Z}\n`, []],
  };
  for (const [name, [text, erwartet]] of Object.entries(GLEICHLAUF)) {
    it(`Gleichlauf mit der Heimat: ${name}`, () => {
      const html = render(text);
      expect(extractBlockAnchors(text).order).toEqual(erwartet);
      expect(ids(html)).toEqual(erwartet);
    });
  }

  it('die zweite Tabelle gleichen Namens rendert ohne id, die erste mit', () => {
    const html = render(`${dt('table: Umsatz\n')}\n${dt('table: Umsatz\n')}`);
    expect(html.match(/class="perspective-datatable"/g)).toHaveLength(2);
    expect(html.match(/<div id="Umsatz" class="perspective-datatable"/g)).toHaveLength(1);
  });
});

// 4T-002072, Nachbesserung F3: Für eine Zeile in einem Code-Block zählt allein die
// Anker-Zeile unter dem Zaun — im Panel (blockAnchorForLine) wie in der Anzeige.
// Ein Absatz mit Anker direkt unter dem Zaun ist ein eigener Block.
describe('Code-Block und Absatz darunter: Panel und Anzeige im Gleichlauf (F3)', () => {
  // Je Fall: Text, Kennung im Panel für Zeile 2 (im Zaun), Element mit der id.
  const FAELLE = {
    'Code-Block, Absatz mit Anker darunter': [
      `${Z}js\nlet a;\n${Z}\nText ^p\n`,
      null,
      '<p data-source-line="4" id="p">Text</p>',
    ],
    'Datentabelle ohne Namen, Absatz mit Anker darunter': [
      `${Z}perspective-datatable\ncolumns: A:text\n| x |\n${Z}\nText ^p\n`,
      null,
      '<p data-source-line="5" id="p">Text</p>',
    ],
    'Code-Block, Anker-Zeile darunter': [`${Z}js\nlet a;\n${Z}\n^c\n`, 'c', '<pre id="c">'],
    'Datentabelle ohne Namen, Anker-Zeile nach einer Leerzeile': [
      `${Z}perspective-datatable\ncolumns: A:text\n| x |\n${Z}\n\n^d\n`,
      'd',
      '<div id="d" class="perspective-datatable"',
    ],
  };
  for (const [name, [text, imPanel, element]] of Object.entries(FAELLE)) {
    it(name, () => {
      expect(blockAnchorForLine(text, 2)).toBe(imPanel);
      expect(render(text)).toContain(element);
    });
  }
});

// 4T-002072, Nachbesserung F2: Der Ausschnitt einer Einbettung auf den Kopf-Namen
// trägt die Zeile `table:` nicht mehr; durch die Render-Pipeline gegeben, hat die
// eingebettete Tabelle deshalb keine id, die ein Sprung treffen könnte.
describe('Einbettung einer benannten Datentabelle: keine id in der Kopie (F2)', () => {
  it('der Ausschnitt rendert ohne id, die Tabelle selbst mit', () => {
    const quelle = `Davor.\n\n${Z}perspective-datatable\ntable: Umsatz\ncolumns: A:text\n| x |\n${Z}\n`;
    const ausschnitt = extractEmbedSnippet(quelle, '^Umsatz');
    const html = render(ausschnitt);
    expect(html).toContain('class="perspective-datatable"');
    expect(html).not.toContain(' id="');
    expect(render(quelle)).toContain('<div id="Umsatz" class="perspective-datatable"');
  });
});
