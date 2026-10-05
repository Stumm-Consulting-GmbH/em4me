// 4T-000363 (Epic 3E-000067): Unit-Tests fuer die gemeinsame Block-Anker-Quelle
// (src/shared/block-anchors.js): Extraktion in Textreihenfolge, Ueberspringen von
// Frontmatter und Fenced-Code, Duplikat-Erkennung, ID-Validierung und die
// kollisionsfreie ID-Generierung.
import { describe, it, expect } from 'vitest';
import {
  BLOCK_ANCHOR_RE,
  isValidBlockAnchorId,
  extractBlockAnchors,
  blockAnchorForLine,
  rewriteAnchorReferences,
  generateBlockAnchorId,
  ankerZeileAllein,
  ankerZeileAlleinImZitat,
  namensAngabe,
  ankerZielFuerZeile,
} from '../../src/shared/block-anchors.js';
import { renderMarkdown } from '../../src/shared/markdown/markdown.js';
import { resolveTableInDocument } from '../../src/shared/markdown/perspective-chart-resolve.js';

describe('extractBlockAnchors (4T-000363)', () => {
  it('findet Anker am Zeilenende und auf eigener Zeile, in Reihenfolge', () => {
    const text = ['# Titel', '', 'Ein Absatz. ^a1b2c3', '', '^eigen', '', 'Noch was ^zweiter'].join(
      '\n',
    );
    const { order, lineById } = extractBlockAnchors(text);
    expect(order).toEqual(['a1b2c3', 'eigen', 'zweiter']);
    expect(lineById.get('a1b2c3')).toBe(3);
    expect(lineById.get('eigen')).toBe(5);
    expect(lineById.get('zweiter')).toBe(7);
  });

  it('meldet Duplikate; das erste Vorkommen zaehlt', () => {
    const text = ['Erst ^dup', 'Mitte', 'Nochmal ^dup'].join('\n');
    const { order, duplicates, lineById } = extractBlockAnchors(text);
    expect(order).toEqual(['dup']);
    expect([...duplicates]).toEqual(['dup']);
    expect(lineById.get('dup')).toBe(1);
  });

  it('ueberspringt Anker in Fenced-Code-Bloecken', () => {
    const text = ['Echt ^real', '```', 'Code ^fake', '```', 'Wieder ^real2'].join('\n');
    const { order } = extractBlockAnchors(text);
    expect(order).toEqual(['real', 'real2']);
  });

  it('ueberspringt Anker im YAML-Frontmatter', () => {
    const text = ['---', 'title: X ^nichtanker', '---', 'Body ^echt'].join('\n');
    const { order } = extractBlockAnchors(text);
    expect(order).toEqual(['echt']);
  });

  it('erlaubt Umlaute und Unicode in der ID', () => {
    const { order } = extractBlockAnchors('Zeile ^grün-2');
    expect(order).toEqual(['grün-2']);
  });

  it('leerer Text liefert keine Anker', () => {
    const { order, duplicates } = extractBlockAnchors('');
    expect(order).toEqual([]);
    expect(duplicates.size).toBe(0);
  });
});

// 4T-002048: Die Frage «besteht diese Zeile allein aus einem Anker?» hat ihre
// Heimat hier; Render-Weg, Live-Modus und Diagramm-Kern stellen sie über diese
// Funktion statt über eigene Vergleiche.
describe('ankerZeileAllein (4T-002048)', () => {
  it('liefert die Kennung einer Zeile, die allein aus dem Anker besteht', () => {
    expect(ankerZeileAllein('^umsatz')).toBe('umsatz');
    expect(ankerZeileAllein('   ^grün-2  ')).toBe('grün-2');
    expect(ankerZeileAllein('\t^a_b\r')).toBe('a_b');
  });

  it('liefert null für einen Anker hinter Text und für Zeilen ohne Anker', () => {
    expect(ankerZeileAllein('Text ^x')).toBeNull();
    expect(ankerZeileAllein('^a ^b')).toBeNull();
    expect(ankerZeileAllein('| ^x |')).toBeNull();
    expect(ankerZeileAllein('^')).toBeNull();
    expect(ankerZeileAllein('^mit.punkt')).toBeNull();
    expect(ankerZeileAllein('')).toBeNull();
    expect(ankerZeileAllein(null)).toBeNull();
  });

  // Nachbesserung F2: dieselbe Frage für eine Zeile mit Zitat-Präfixen.
  it('im Zitat: streift die Präfixe ab und zählt, was auch die Erkennung zählt', () => {
    expect(ankerZeileAlleinImZitat('> ^x')).toBe('x');
    expect(ankerZeileAlleinImZitat('> > ^x')).toBe('x');
    expect(ankerZeileAlleinImZitat('   >  > ^x  ')).toBe('x');
    expect(ankerZeileAlleinImZitat('^x')).toBe('x');
    expect(ankerZeileAlleinImZitat('>^x')).toBeNull();
    expect(ankerZeileAlleinImZitat('> | ^x |')).toBeNull();
    expect(ankerZeileAlleinImZitat('> Text ^x')).toBeNull();
  });

  it('sieht dieselbe Kennung wie die Anker-Erkennung des Dokuments', () => {
    for (const zeile of ['^a', '  ^ä1', '^x-y_z']) {
      expect(ankerZeileAllein(zeile)).toBe(extractBlockAnchors(zeile).order[0]);
    }
  });
});

describe('isValidBlockAnchorId (4T-000363)', () => {
  it('akzeptiert erlaubte Zeichen', () => {
    expect(isValidBlockAnchorId('a1b2c3')).toBe(true);
    expect(isValidBlockAnchorId('grün_2-x')).toBe(true);
  });
  it('lehnt leere, Sonder- und Whitespace-haltige IDs ab', () => {
    expect(isValidBlockAnchorId('')).toBe(false);
    expect(isValidBlockAnchorId('mit raum')).toBe(false);
    expect(isValidBlockAnchorId('^caret')).toBe(false);
    expect(isValidBlockAnchorId('punkt.')).toBe(false);
    expect(isValidBlockAnchorId(null)).toBe(false);
  });
});

describe('generateBlockAnchorId (4T-000363)', () => {
  it('liefert eine gueltige, 6-stellige ID', () => {
    const id = generateBlockAnchorId(new Set());
    expect(id).toHaveLength(6);
    expect(isValidBlockAnchorId(id)).toBe(true);
    expect(BLOCK_ANCHOR_RE.test(' ^' + id)).toBe(true);
  });

  it('vermeidet Kollisionen mit bestehenden IDs', () => {
    // Jede neue ID wird sofort in `existing` aufgenommen; die Funktion muss
    // fortlaufend eine unbelegte ID liefern, ohne haengen zu bleiben.
    const existing = new Set();
    for (let i = 0; i < 500; i++) existing.add(generateBlockAnchorId(existing));
    expect(existing.size).toBe(500);
  });

  it('akzeptiert auch ein Array als existing', () => {
    const id = generateBlockAnchorId(['abc123', 'def456']);
    expect(['abc123', 'def456']).not.toContain(id);
  });
});

describe('blockAnchorForLine (4T-000364)', () => {
  const text = [
    'Absatz eins mit Anker. ^aaa', // 1
    '', // 2
    'Zweiter Absatz,', // 3
    'geht weiter bis Anker. ^bbb', // 4
    '', // 5
    'Absatz ohne Anker.', // 6
  ].join('\n');

  it('findet den Anker des Absatzes, in dem der Cursor steht', () => {
    expect(blockAnchorForLine(text, 1)).toBe('aaa');
    // Cursor in Zeile 3, Anker in Zeile 4 desselben Absatzes.
    expect(blockAnchorForLine(text, 3)).toBe('bbb');
    expect(blockAnchorForLine(text, 4)).toBe('bbb');
  });

  it('liefert null auf einer Leerzeile', () => {
    expect(blockAnchorForLine(text, 2)).toBeNull();
    expect(blockAnchorForLine(text, 5)).toBeNull();
  });

  it('liefert null für einen Absatz ohne Anker', () => {
    expect(blockAnchorForLine(text, 6)).toBeNull();
  });

  it('ignoriert Anker in Fenced-Code', () => {
    const t2 = ['```', 'code ^fake', '```'].join('\n');
    expect(blockAnchorForLine(t2, 2)).toBeNull();
  });
});

describe('rewriteAnchorReferences (4T-000364)', () => {
  it('schreibt Anker-Definition und eingehende Verweise um', () => {
    const text = [
      'Ein Absatz mit Daten. ^alt',
      '',
      'Verweis: [[#^alt]] und [[Datei#^alt]] und [[Datei#^alt|Text]].',
    ].join('\n');
    const out = rewriteAnchorReferences(text, 'alt', 'neu');
    expect(out).toContain('^neu');
    expect(out).not.toContain('^alt');
    expect(out).toContain('[[#^neu]]');
    expect(out).toContain('[[Datei#^neu]]');
    expect(out).toContain('[[Datei#^neu|Text]]');
  });

  it('lässt Fenced-Code und ungültige/gleiche IDs unberührt', () => {
    const fenced = ['```', 'code ^alt', '```'].join('\n');
    expect(rewriteAnchorReferences(fenced, 'alt', 'neu')).toBe(fenced);
    expect(rewriteAnchorReferences('X ^alt', 'alt', 'alt')).toBe('X ^alt');
    expect(rewriteAnchorReferences('X ^alt', 'alt', 'mit raum')).toBe('X ^alt');
  });
});

// 4T-002023 (Epic 3E-000192, Story 4S-001023 AK12): Wird der Name einer
// Datentabelle umbenannt, zieht die Angabe `table: ^name` der Diagramme im
// selben Dokument nach — als einzige Stelle im Fenced-Code, die das Umbenennen
// anfasst.
describe('rewriteAnchorReferences: Angabe table: im Diagramm-Block (4S-001023 AK12)', () => {
  const TABELLE = [
    '```perspective-datatable',
    'columns: Monat:text, Wert:number',
    '| Januar | 1 |',
    '```',
    '^alt',
  ];
  const dok = (...diagramm) => [...TABELLE, '', ...diagramm, ''].join('\n');

  it('AK12: zieht table: ^alt im selben Dokument nach, der Rest bleibt byte-gleich', () => {
    const vorher = dok(
      '```perspective-chart',
      'type: bar',
      'table: ^alt',
      'values: Wert',
      'title: Mit ^alt im Titel',
      '```',
    );
    const out = rewriteAnchorReferences(vorher, 'alt', 'neu');
    // Genau zwei Stellen: die Anker-Zeile unter der Tabelle und der Name in der
    // Angabe. Der Titel trägt die Zeichenfolge auch, ist aber keine Angabe.
    expect(out).toBe(
      vorher.replace('```\n^alt', '```\n^neu').replace('table: ^alt', 'table: ^neu'),
    );
    expect(out).toContain('title: Mit ^alt im Titel');
  });

  it('AK12: erhält Schreibweise des Schlüssels, Leerraum und Einrückung', () => {
    const vorher = dok('~~~perspective-chart', '  Table :   ^alt', '~~~');
    expect(rewriteAnchorReferences(vorher, 'alt', 'neu')).toContain('\n  Table :   ^neu\n');
  });

  it('AK12: [[Datei#^alt]] im Diagramm-Block bleibt stehen, auch für die eigene Datei', () => {
    // Bekannte Folge (Umsetzungsplan, R7): Ob `Datei` das eigene Dokument ist,
    // weiß der Nachzug nicht; ein Bezug aus einem anderen Dokument zieht beim
    // Umbenennen des Namens ebenso nicht nach.
    for (const angabe of ['table: [[Andere#^alt]]', 'table: [[Eigene#^alt]]']) {
      const vorher = dok('```perspective-chart', angabe, '```');
      const out = rewriteAnchorReferences(vorher, 'alt', 'neu');
      expect(out).toContain(`\n${angabe}\n`);
      expect(out).toContain('```\n^neu');
    }
  });

  it('AK12: nur die erste Angabe der Fence zieht nach, auch wenn sie ungültig ist', () => {
    const zwei = dok('```perspective-chart', 'table: ^alt', 'table: ^alt', '```');
    expect(rewriteAnchorReferences(zwei, 'alt', 'neu')).toContain('\ntable: ^neu\ntable: ^alt\n');
    // Eine erste Angabe ohne gültige Schreibweise ist trotzdem die wirksame: Der
    // Kern liest die zweite nicht, der Nachzug fasst sie deshalb ebenso wenig an.
    const ungueltig = dok('```perspective-chart', 'table: umsatz', 'table: ^alt', '```');
    expect(rewriteAnchorReferences(ungueltig, 'alt', 'neu')).toContain(
      '\ntable: umsatz\ntable: ^alt\n',
    );
  });

  it('AK12: jede Diagramm-Fence für sich, ein anderer Name bleibt stehen', () => {
    const vorher = dok(
      '```perspective-chart',
      'table: ^alt',
      '```',
      '',
      '```perspective-chart',
      'table: ^alt',
      '```',
      '',
      '```perspective-chart',
      'table: ^alte',
      '```',
    );
    const out = rewriteAnchorReferences(vorher, 'alt', 'neu');
    expect(out.match(/table: \^neu/g)).toHaveLength(2);
    expect(out).toContain('table: ^alte');
  });

  it('AK12 (Rot-Probe): eine Fence anderer Art bleibt unberührt', () => {
    for (const info of ['perspective-datatable', 'js', '', 'perspective-chartx']) {
      const vorher = ['```' + info, 'table: ^alt', '```', 'Text ^alt'].join('\n');
      const out = rewriteAnchorReferences(vorher, 'alt', 'neu');
      expect(out, info).toBe(['```' + info, 'table: ^alt', '```', 'Text ^neu'].join('\n'));
    }
  });

  it('AK12: CRLF — Name nachgezogen, Zeilenenden werden wie bisher zu LF', () => {
    // Bestands-Verhalten (Erhebung 4T-002023, Zeile 6): Die Funktion setzt die
    // Zeilen mit LF zusammen. Festgehalten, nicht geändert.
    const lf = dok('```perspective-chart', 'table: ^alt', '```');
    const out = rewriteAnchorReferences(lf.replace(/\n/g, '\r\n'), 'alt', 'neu');
    expect(out).toBe(lf.replace('```\n^alt', '```\n^neu').replace('table: ^alt', 'table: ^neu'));
    expect(out).not.toContain('\r');
  });
});

// Durchsicht vom 2026-09-30 (4T-002024, K2): Die Anker-Erkennung schaltete bei
// jeder Zeile um, die mit drei Backticks beginnt. Hinter einer Zeile wie
// ```inline``` im Fließtext oder einem längeren Zaun um einen kürzeren sah sie
// keinen Anker mehr. Seither gilt die Zaun-Regel aus fence-level.js, geprüft im
// Gleichlauf mit dem Render-Weg: Ein Anker, den die Anzeige als Kennung eines
// Blocks setzt, ist ein Anker; einer im Code-Block nicht.
describe('extractBlockAnchors folgt der Zaun-Regel (Durchsicht vom 2026-09-30)', () => {
  const Z = '`'.repeat(3);
  const ZL = '`'.repeat(4);
  const T = '~'.repeat(3);

  // Die Kennungen, die der Render-Weg Blöcken gibt (die Prüf-Texte tragen
  // keine Überschrift, deren Kennung mitzählte).
  function ankerDesRenderWegs(text) {
    return [...renderMarkdown(text, 'de').matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  }

  const GLEICHLAUF = {
    'Zeile mit Backticks im Fließtext': `Absatz ^a\n\n${Z}inline${Z} am Zeilenanfang\n\nText ^b\n`,
    'längerer Zaun um einen kürzeren': `${ZL}markdown\n${Z}\n^innen\n${Z}\n${ZL}\n\nNach ^aussen\n`,
    'Tilden-Zaun, darin Backticks': `${T}\n^t1\n${Z}\n^t2\n${T}\n\nX ^t3\n`,
    'offener Zaun am Ende': `A ^a\n\n${Z}js\n^b\n`,
    'Zaun mit drei Leerzeichen Einrückung': `   ${Z}\n^x\n   ${Z}\n\nY ^y\n`,
    'vier Leerzeichen: kein Zaun': `Absatz\n    ${Z}\nText ^x\n\nY ^y\n`,
    'Zaun in einer Liste, eingerückt': `- Punkt\n\n  ${Z}\n  ^x\n  ${Z}\n\nY ^y\n`,
    'kürzerer Schluss schließt nicht': `${ZL}\n^x\n${Z}\n^z\n`,
    CRLF: `Absatz ^a\r\n\r\n${Z}\r\n^b\r\n${Z}\r\n\r\nC ^c\r\n`,
    // 4T-002048: Anker in eigener Zeile — die Anzeige setzt sie jetzt auch.
    'Anker-Zeile unter einem Code-Block': `${Z}js\nx\n${Z}\n^code\n\nText ^t\n`,
    'Anker-Zeilen unter einer Datentabelle': `${Z}perspective-datatable\ncolumns: A:text\n| x |\n${Z}\n^n1\n^n2\n`,
    'Anker-Zeile unter einer gewöhnlichen Tabelle': '| A |\n|---|\n| 1 |\n^tab\n\nY ^y\n',
    'Anker-Zeile am Anfang und nach einer Liste': '^anfang\n\n- a\n- b\n\n^liste\n',
    'Anker-Zeile im Zitat': '> Zitat\n> ^zq\n',
    // Nachbesserung F1: zwei Anker in einem Block, beide Kennungen sind Ziel.
    'Absatz mit zwei Anker-Zeilen': 'Ein Absatz\n^a1\n^a2\n',
    'Liste mit zwei Anker-Zeilen': '- zwei\n^a1\n^a2\n',
    'Zitat mit zwei Anker-Zeilen': '> Zitat\n> ^a1\n> ^a2\n',
    'zwei Anker am Zeilenende': 'Zeile eins ^a1\nZeile zwei ^a2\n',
  };
  for (const [name, text] of Object.entries(GLEICHLAUF)) {
    it(`im Gleichlauf mit dem Render-Weg: ${name}`, () => {
      expect(extractBlockAnchors(text).order).toEqual(ankerDesRenderWegs(text));
    });
  }

  it('die Rot-Probe der beiden gemeldeten Fälle: der Anker dahinter wird gefunden', () => {
    expect(extractBlockAnchors(GLEICHLAUF['Zeile mit Backticks im Fließtext']).order).toEqual([
      'a',
      'b',
    ]);
    const { order, lineById } = extractBlockAnchors(GLEICHLAUF['längerer Zaun um einen kürzeren']);
    expect(order).toEqual(['aussen']);
    expect(lineById.get('aussen')).toBe(7);
  });

  // Bewusste Abweichung: Die Zaun-Regel der Anwendung kennt nur Zäune der
  // obersten Ebene, bis drei Leerzeichen eingerückt. Ein Zaun hinter einem
  // Listen- oder Zitat-Marker ist für sie keiner; die Anzeige sieht dort einen
  // Code-Block. Festgehalten, damit eine Änderung auffällt.
  it('Abweichung vom Render-Weg: Zaun hinter einem Listen- oder Zitat-Marker', () => {
    const zitat = `> ${Z}\n> ^x\n> ${Z}\n\nY ^y\n`;
    expect(extractBlockAnchors(zitat).order).toEqual(['x', 'y']);
    expect(ankerDesRenderWegs(zitat)).toEqual(['y']);
    const liste = `- ${Z}\n  ^x\n  ${Z}\n\nY ^y\n`;
    expect(extractBlockAnchors(liste).order).toEqual(['x']);
    expect(ankerDesRenderWegs(liste)).toEqual(['y']);
  });

  it('blockAnchorForLine sieht den Anker hinter einer Zeile mit Backticks', () => {
    const text = `${Z}inline${Z} Zeile\n\nAbsatz ^hinten\n`;
    expect(blockAnchorForLine(text, 3)).toBe('hinten');
  });
});

// 4T-002048: Die Anzeige und der Diagramm-Kern lesen die Namens-Zeile einer
// Datentabelle aus derselben Heimat. Geprüft an denselben Texten: Die Tabelle,
// die der Kern unter einem Namen findet, ist das Element, das die Anzeige mit
// diesem Namen kennzeichnet — und in keiner Blockart bleibt eine Anker-Zeile
// sichtbar.
describe('Anker in eigener Zeile: Anzeige und Heimat im Gleichlauf (4T-002048)', () => {
  const Z = '`'.repeat(3);
  const tabelle = (zeile) => `${Z}perspective-datatable\ncolumns: A:text\n| ${zeile} |\n${Z}`;

  const MIT_NAMEN = {
    'direkt darunter': `${tabelle('x')}\n^umsatz\n`,
    'nach einer Leerzeile': `Text\n\n${tabelle('x')}\n\n^umsatz\n`,
    'zwei Tabellen, zwei Namen': `${tabelle('a')}\n^erste\n\n${tabelle('b')}\n^zweite\n`,
    'nach einem Frontmatter': `---\ntitel: X\n---\n${tabelle('x')}\n^umsatz\n`,
  };
  for (const [name, text] of Object.entries(MIT_NAMEN)) {
    it(`der Kern findet die Tabelle, die die Anzeige mit dem Namen kennzeichnet: ${name}`, () => {
      const html = renderMarkdown(text, 'de');
      for (const anker of extractBlockAnchors(text).order) {
        const res = resolveTableInDocument(text, anker);
        expect(res.status, anker).toBe('found');
        const el = html.match(new RegExp(`<div id="${anker}" [^>]*data-dt-line-start="(\\d+)"`));
        expect(el, anker).not.toBeNull();
        expect(Number(el[1])).toBe(res.openLine);
      }
    });
  }

  const BLOECKE = {
    Absatz: 'Ein Absatz',
    'Code-Block': `${Z}js\nx\n${Z}`,
    Datentabelle: tabelle('x'),
    Mermaid: `${Z}mermaid\ngraph TD; A-->B\n${Z}`,
    Diagramm: `${Z}perspective-chart\ntable: ^t\n${Z}`,
    'gewöhnliche Tabelle': '| A |\n|---|\n| 1 |',
    Liste: '- eins\n- zwei',
    Aufgabe: '- [ ] Aufgabe',
    Zitat: '> Zitat',
  };
  const ABSTAND = { direkt: '\n', 'nach Leerzeile': '\n\n' };
  const ANKER = { 'ein Anker': '^a1\n', 'zwei Anker': '^a1\n^a2\n' };
  for (const [block, text] of Object.entries(BLOECKE)) {
    for (const [abstand, trenner] of Object.entries(ABSTAND)) {
      for (const [anzahl, zeilen] of Object.entries(ANKER)) {
        it(`unsichtbar und Sprungziel: ${block}, ${abstand}, ${anzahl}`, () => {
          const html = renderMarkdown(text + trenner + zeilen, 'de');
          expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/\^a[12]/);
          // Nachbesserung F1: jede Kennung ist eine id im HTML.
          for (const id of extractBlockAnchors(zeilen).order) expect(html).toContain(` id="${id}"`);
        });
      }
    }
  }
});

describe('rewriteAnchorReferences folgt derselben Zaun-Regel (Durchsicht vom 2026-09-30)', () => {
  const Z = '`'.repeat(3);
  const ZL = '`'.repeat(4);

  it('schreibt hinter einer Zeile mit Backticks um und lässt einen inneren Zaun Code', () => {
    const vorher = [
      `${Z}inline${Z} Zeile`,
      '',
      'Absatz ^alt',
      '',
      `${ZL}markdown`,
      Z,
      'Beispiel ^alt und [[#^alt]]',
      Z,
      ZL,
      '',
      'Verweis [[#^alt]]',
    ].join('\n');
    const out = rewriteAnchorReferences(vorher, 'alt', 'neu');
    expect(out.split('\n')).toEqual([
      `${Z}inline${Z} Zeile`,
      '',
      'Absatz ^neu',
      '',
      `${ZL}markdown`,
      Z,
      'Beispiel ^alt und [[#^alt]]',
      Z,
      ZL,
      '',
      'Verweis [[#^neu]]',
    ]);
  });

  it('die Angabe table: eines Diagramm-Blocks mit längerem Zaun zieht nach', () => {
    const vorher = [`${ZL}perspective-chart`, 'table: ^alt', Z, ZL, 'Text ^alt'].join('\n');
    expect(rewriteAnchorReferences(vorher, 'alt', 'neu')).toBe(
      [`${ZL}perspective-chart`, 'table: ^neu', Z, ZL, 'Text ^neu'].join('\n'),
    );
  });
});

// 4T-002072 (Epic 3E-000192): Der Name aus der Kopf-Angabe `table:` einer
// Datentabelle ist eine Block-Kennung aus dieser Heimat. Geprüft werden Erkennung
// und Träger, die gemeinsame Dubletten-Regel, die Cursor-Folge im Zaun, der
// Nachzug beim Umbenennen und der Schreibort einer neuen Kennung.
describe('Name in der Kopf-Angabe table: einer Datentabelle (4T-002072)', () => {
  const Z = '`'.repeat(3);
  const DT = `${Z}perspective-datatable`;

  it('namensAngabe: Wert, Spanne und gültiger Name', () => {
    const zeile = '  Table :  Umsatz ';
    const a = namensAngabe(zeile);
    expect(a).toMatchObject({ name: 'Umsatz', wert: 'Umsatz' });
    expect(zeile.slice(a.wertStart, a.wertStart + a.wertLen)).toBe('Umsatz');
    expect(namensAngabe('table: a b')).toMatchObject({ name: null, wert: 'a b' });
    expect(namensAngabe('table: ^x')).toMatchObject({ name: null, wert: '^x' });
    expect(namensAngabe('table:')).toMatchObject({ name: null, wert: '', wertLen: 0 });
    expect(namensAngabe('columns: A:text')).toBeNull();
  });

  it('Kopf-Name: Kennung, Zeile, Träger', () => {
    const text = ['# T', '', DT, 'table: Umsatz', 'columns: A:text', '| x |', Z, '', 'Text ^p'];
    const r = extractBlockAnchors(text.join('\n'));
    expect(r.order).toEqual(['Umsatz', 'p']);
    expect(r.lineById.get('Umsatz')).toBe(4);
    expect(r.traegerById.get('Umsatz')).toEqual({ art: 'datentabelle', zaunVon: 3, zaunBis: 7 });
    expect(r.traegerById.get('p')).toEqual({ art: 'zeile' });
    expect(r.datentabellen).toEqual([
      { zaunVon: 3, zaunBis: 7, name: 'Umsatz', nameZeile: 4, ankerZeile: null },
    ]);
    // Tilde, Leerzeile und andere Kopf-Angabe davor, drei Leerzeichen Einrückung.
    const weitere = {
      Tilde: ['~~~perspective-datatable', 'table: T', '| x |', '~~~'],
      'Leerzeile und columns davor': [DT, '', 'columns: A:text', 'table: T', '| x |', Z],
      'drei Leerzeichen': [`   ${DT}`, '   table: T', '   | x |', `   ${Z}`],
    };
    for (const [fall, zeilen] of Object.entries(weitere)) {
      expect(extractBlockAnchors(zeilen.join('\n')).order, fall).toEqual(['T']);
    }
    // Offener Zaun: der Träger reicht bis zum Textende.
    const offen = extractBlockAnchors([DT, 'table: T', '| x |'].join('\n'));
    expect(offen.traegerById.get('T')).toEqual({ art: 'datentabelle', zaunVon: 1, zaunBis: null });
  });

  it('kein Name: Zitat, vier Leerzeichen, Zaun anderer Sprache, ungültig, zweite table:', () => {
    const faelle = {
      Zitat: [`> ${DT}`, '> table: X', '> | x |', `> ${Z}`],
      'vier Leerzeichen': [`    ${DT}`, '    table: X', `    ${Z}`],
      'Zaun anderer Sprache': [`${Z}js`, 'table: X', Z],
      'umschließender Zaun': ['````markdown', DT, 'table: X', Z, '````'],
      ungültig: [DT, 'table: X Y', '| x |', Z],
      'Dach-Zeichen': [DT, 'table: ^X', '| x |', Z],
      'nach der ersten Datenzeile': [DT, '| x |', 'table: X', Z],
      'zweite table:': [DT, 'table: erste', 'table: X', '| x |', Z],
    };
    for (const [fall, zeilen] of Object.entries(faelle)) {
      expect(extractBlockAnchors(zeilen.join('\n')).order, fall).not.toContain('X');
    }
    const ungueltig = extractBlockAnchors(faelle.ungültig.join('\n'));
    expect(ungueltig.datentabellen).toEqual([
      { zaunVon: 1, zaunBis: 4, name: null, nameZeile: 2, ankerZeile: null },
    ]);
    expect(extractBlockAnchors(faelle['zweite table:'].join('\n')).order).toEqual(['erste']);
  });

  it('erstes Vorkommen gilt gleich aus welcher Form', () => {
    const zeileZuerst = extractBlockAnchors(
      ['Absatz ^x', '', DT, 'table: x', '| 1 |', Z].join('\n'),
    );
    expect(zeileZuerst.order).toEqual(['x']);
    expect(zeileZuerst.lineById.get('x')).toBe(1);
    expect(zeileZuerst.traegerById.get('x')).toEqual({ art: 'zeile' });
    expect([...zeileZuerst.duplicates]).toEqual(['x']);
    const kopfZuerst = extractBlockAnchors([DT, 'table: x', '| 1 |', Z, '', 'Text ^x'].join('\n'));
    expect(kopfZuerst.lineById.get('x')).toBe(2);
    expect(kopfZuerst.traegerById.get('x').art).toBe('datentabelle');
    expect([...kopfZuerst.duplicates]).toEqual(['x']);
    // Derselbe Name an zwei Tabellen: Träger bleibt die erste.
    const zwei = [DT, 'table: x', '| 1 |', Z, '', DT, 'table: x', '| 2 |', Z].join('\n');
    const r = extractBlockAnchors(zwei);
    expect(r.traegerById.get('x').zaunVon).toBe(1);
    expect(r.datentabellen.map((t) => t.name)).toEqual(['x', 'x']);
    expect([...r.duplicates]).toEqual(['x']);
  });

  it('blockAnchorForLine im Zaun', () => {
    const text = ['Absatz direkt darüber', DT, 'table: Umsatz', 'columns: A:text', '| x |', Z];
    const t = text.join('\n');
    for (let z = 2; z <= 6; z++) expect(blockAnchorForLine(t, z), `Zeile ${z}`).toBe('Umsatz');
    // Der Absatz direkt über dem Zaun bekommt den Namen der Tabelle nicht.
    expect(blockAnchorForLine(t, 1)).toBeNull();
    // Leerzeile im Kopf: jede Zeile des Zauns, auch die Leerzeile selbst.
    const leer = [DT, '', 'table: Umsatz', '| x |', Z].join('\n');
    for (let z = 1; z <= 5; z++) expect(blockAnchorForLine(leer, z), `Zeile ${z}`).toBe('Umsatz');
    // Beide Formen: im Zaun der Kopf-Name, auf der Anker-Zeile ihr Name.
    const beide = [DT, 'table: Neu', '| x |', Z, '^alt'].join('\n');
    expect(blockAnchorForLine(beide, 3)).toBe('Neu');
    expect(blockAnchorForLine(beide, 5)).toBe('alt');
    // Fall b: ohne Kopf-Namen die alte Zeile, auch nach einer Leerzeile.
    const alt = [DT, 'columns: A:text', '| x |', Z, '', '^alt'].join('\n');
    expect(blockAnchorForLine(alt, 3)).toBe('alt');
    // Ein Kopf-Name, der als Doppel nicht zählt, ist nicht der Name der Tabelle.
    const doppel = ['Text ^x', '', DT, 'table: x', '| x |', Z].join('\n');
    expect(blockAnchorForLine(doppel, 5)).toBeNull();
  });

  it('rewriteAnchorReferences Kopf-Angabe', () => {
    const vorher = [
      DT,
      '  TABLE :  alt',
      'columns: A:text',
      '| alt |',
      Z,
      '',
      `${Z}perspective-chart`,
      'table: alt',
      Z,
      '',
      `${Z}perspective-chart`,
      'table: ^alt',
      Z,
    ].join('\n');
    const out = rewriteAnchorReferences(vorher, 'alt', 'neu');
    expect(out).toBe(
      vorher
        .replace('TABLE :  alt', 'TABLE :  neu')
        .replace('table: alt', 'table: neu')
        .replace('table: ^alt', 'table: ^neu'),
    );
    // Nur die erste Angabe im Kopf; nach der ersten Datenzeile nichts.
    for (const zeilen of [
      [DT, 'table: x', 'table: alt', '| 1 |', Z],
      [DT, '| 1 |', 'table: alt', Z],
    ]) {
      const t = zeilen.join('\n');
      expect(rewriteAnchorReferences(t, 'alt', 'neu')).toBe(t);
    }
  });

  it('rewriteAnchorReferences (Rot-Probe): eine Datentabelle in einer Fence anderer Sprache bleibt', () => {
    for (const zeilen of [
      ['````markdown', DT, 'table: alt', '| 1 |', Z, '````'],
      [`${Z}js`, 'table: alt', Z],
    ]) {
      const t = zeilen.join('\n');
      expect(rewriteAnchorReferences(t, 'alt', 'neu')).toBe(t);
    }
  });

  it('ankerZielFuerZeile', () => {
    const ohne = [`  ${DT}`, '  columns: A:text', '  | x |', `  ${Z}`].join('\n');
    expect(ankerZielFuerZeile(ohne, 3)).toEqual({
      art: 'kopf-neu',
      nachZeile: 1,
      einrueckung: '  ',
    });
    const ungueltig = [DT, 'table: a b', '| x |', Z].join('\n');
    const w = ankerZielFuerZeile(ungueltig, 4);
    expect(w).toEqual({ art: 'kopf-wert', zeile: 2, von: 7, bis: 10 });
    expect('table: a b'.slice(w.von, w.bis)).toBe('a b');
    expect(ankerZielFuerZeile([DT, 'table:', '| x |', Z].join('\n'), 3)).toEqual({
      art: 'kopf-wert',
      zeile: 2,
      von: 6,
      bis: 6,
    });
    // Offener Zaun: auch die letzte Zeile gehört zur Tabelle.
    expect(ankerZielFuerZeile([DT, '| x |'].join('\n'), 2).art).toBe('kopf-neu');
    const absatz = ['Erste Zeile', 'zweite Zeile', '', 'Danach'].join('\n');
    expect(ankerZielFuerZeile(absatz, 1)).toEqual({ art: 'zeilenende', zeile: 2 });
    expect(ankerZielFuerZeile(absatz, 3)).toBeNull();
    expect(ankerZielFuerZeile(absatz, 9)).toBeNull();
  });
});

// 4T-002072, Nachbesserung nach der Durchsicht vom 2026-10-03 (Befunde F1, F3,
// F5, F6, F7). Je Befund die Regel, die sein Fehlerbild ausschließt.
describe('Nachbesserung 4T-002072: Schreibort, Cursor-Folge, gleiche Kennung, Zitat, Frontmatter', () => {
  const Z = '`'.repeat(3);
  const DT = `${Z}perspective-datatable`;
  // Der Schreibweg des Panels für die Art `zeile-neu`, auf Zeichenketten.
  const schreibe = (text, ziel, id) => {
    const zeilen = text.split('\n');
    const neu = [`${ziel.praefix}^${id}`, ...(ziel.leerzeile ? [ziel.praefix.trimEnd()] : [])];
    zeilen.splice(ziel.nachZeile, 0, ...neu);
    return zeilen.join('\n');
  };

  it('F1: ein Absatz direkt über einem Zaun endet vor ihm, an eine Zaun-Zeile wird nie angehängt', () => {
    for (const block of [
      [`${Z}js`, 'code', Z],
      [DT, 'columns: A:text', '| x |', Z],
    ]) {
      const text = ['Absatz', 'zweite Zeile', ...block, 'Danach'].join('\n');
      expect(ankerZielFuerZeile(text, 1)).toEqual({ art: 'zeilenende', zeile: 2 });
    }
  });

  it('F1: Schreibmarke in einem Code-Block oder Diagramm — eigene Zeile unter dem Zaun', () => {
    const code = [`${Z}js`, 'code', '', 'mehr', Z].join('\n');
    for (let z = 1; z <= 5; z++) {
      expect(ankerZielFuerZeile(code, z), `Zeile ${z}`).toEqual({
        art: 'zeile-neu',
        nachZeile: 5,
        praefix: '',
        leerzeile: false,
      });
    }
    const diagramm = [`${Z}perspective-chart`, 'table: t', Z, 'Text danach'].join('\n');
    expect(ankerZielFuerZeile(diagramm, 2)).toMatchObject({ nachZeile: 3, leerzeile: true });
    // Die neue Zeile ist die Kennung des Blocks; der Zaun schließt weiter.
    const neu = schreibe(code, ankerZielFuerZeile(code, 2), 'abc');
    expect(neu.split('\n').slice(4, 6)).toEqual([Z, '^abc']);
    expect(blockAnchorForLine(neu, 2)).toBe('abc');
    expect(renderMarkdown(neu, 'de')).toContain('<pre id="abc">');
    const mitText = schreibe(diagramm, ankerZielFuerZeile(diagramm, 2), 'abc');
    expect(mitText.split('\n').slice(2)).toEqual([Z, '^abc', '', 'Text danach']);
    // Offener Zaun: kein Anlegen.
    expect(ankerZielFuerZeile([`${Z}js`, 'code'].join('\n'), 2)).toBeNull();
  });

  it('F1: Zaun im Zitat oder tief eingerückt — die Zeile im selben Container', () => {
    const zitat = [`> ${DT}`, '> columns: A:text', '> | x |', `> ${Z}`, '> weiter'].join('\n');
    const z = ankerZielFuerZeile(zitat, 2);
    expect(z).toEqual({ art: 'zeile-neu', nachZeile: 4, praefix: '> ', leerzeile: true });
    expect(schreibe(zitat, z, 'q').split('\n').slice(3)).toEqual([
      `> ${Z}`,
      '> ^q',
      '>',
      '> weiter',
    ]);
    expect(renderMarkdown(schreibe(zitat, z, 'q'), 'de')).toContain(
      '<div id="q" class="perspective-datatable"',
    );
    const liste = ['- Punkt', '', `    ${Z}js`, '    code', `    ${Z}`].join('\n');
    const l = ankerZielFuerZeile(liste, 4);
    expect(l).toEqual({ art: 'zeile-neu', nachZeile: 5, praefix: '    ', leerzeile: false });
    expect(renderMarkdown(schreibe(liste, l, 'li'), 'de')).toContain('<pre id="li">');
    // Ein tief eingerückter Öffner ohne Schluss-Zeile ist kein Zaun (Absatz-Text).
    const absatz = ['Absatz', `    ${Z}`, 'Text'].join('\n');
    expect(ankerZielFuerZeile(absatz, 3)).toEqual({ art: 'zeilenende', zeile: 3 });
  });

  it('F3: im Zaun zählt allein die Anker-Zeile darunter, kein Absatz-Anker', () => {
    const faelle = {
      'Datentabelle ohne Namen': [DT, 'columns: A:text', '| x |', Z, 'Text ^p'],
      'Code-Block': [`${Z}js`, 'code', Z, 'Text ^p'],
      'Diagramm, Absatz nach Leerzeile': [`${Z}perspective-chart`, 'table: t', Z, '', 'Text ^p'],
    };
    for (const [fall, zeilen] of Object.entries(faelle)) {
      expect(blockAnchorForLine(zeilen.join('\n'), 2), fall).toBeNull();
      expect(blockAnchorForLine(zeilen.join('\n'), zeilen.length), fall).toBe('p');
    }
    // Der Absatz über einem Zaun reicht nicht in ihn hinein.
    expect(blockAnchorForLine(['Absatz', `${Z}js`, 'x', Z, '^c'].join('\n'), 1)).toBeNull();
    // Im Zitat: die Anker-Zeile derselben Tiefe unter dem Zaun.
    const zitat = [`> ${Z}js`, '> x', `> ${Z}`, '> ^q'].join('\n');
    expect(blockAnchorForLine(zitat, 2)).toBe('q');
  });

  it('F5: Kopf table: A und darunter ^A sind dieselbe Kennung, kein Doppel', () => {
    for (const darunter of [['^A'], ['', '^A'], ['  ^A  ']]) {
      const text = [DT, 'table: A', '| x |', Z, ...darunter].join('\n');
      const r = extractBlockAnchors(text);
      expect(r.order).toEqual(['A']);
      expect([...r.duplicates]).toEqual([]);
      expect(r.lineById.get('A')).toBe(2);
      expect(r.traegerById.get('A')).toMatchObject({ art: 'datentabelle', zaunVon: 1 });
      expect(r.datentabellen[0].ankerZeile).toBe(4 + darunter.length);
    }
    // Ein anderer Name darunter bleibt eigene Kennung; ein zweites ^A weiter unten ein Doppel.
    const anders = extractBlockAnchors([DT, 'table: A', '| x |', Z, '^B'].join('\n'));
    expect(anders.order).toEqual(['A', 'B']);
    expect(anders.datentabellen[0].ankerZeile).toBeNull();
    const spaeter = extractBlockAnchors([DT, 'table: A', Z, '^A', '', 'Text ^A'].join('\n'));
    expect([...spaeter.duplicates]).toEqual(['A']);
    // Zählt der Kopf-Name als Doppel nicht, ist auch die Zeile darunter ein Doppel.
    const doppel = extractBlockAnchors(['Text ^A', '', DT, 'table: A', Z, '^A'].join('\n'));
    expect(doppel.lineById.get('A')).toBe(1);
    expect(doppel.datentabellen[0].ankerZeile).toBeNull();
  });

  it('F6: Umbenennen zieht table: im Diagramm in einem Zitat nach, mit und ohne Dach-Zeichen', () => {
    const vorher = [
      DT,
      'table: alt',
      '| 1 |',
      Z,
      '',
      `> ${Z}perspective-chart`,
      '> table: alt',
      `> ${Z}`,
      '',
      `> > ${Z}perspective-chart`,
      '> > table: ^alt',
      `> > ${Z}`,
      '',
      '- Punkt',
      '',
      `    ${Z}perspective-chart`,
      '    table: alt',
      '    table: alt',
      `    ${Z}`,
      '',
      `> ${Z}perspective-chart`,
      '> table: anders',
      `> ${Z}`,
    ];
    const nachher = [...vorher];
    nachher[1] = 'table: neu';
    nachher[6] = '> table: neu';
    nachher[10] = '> > table: ^neu';
    nachher[16] = '    table: neu';
    expect(rewriteAnchorReferences(vorher.join('\n'), 'alt', 'neu')).toBe(nachher.join('\n'));
    // Rot-Probe der Grenze: ein gewöhnlicher Code-Block im Zitat bleibt.
    const code = [`> ${Z}js`, '> table: alt', `> ${Z}`].join('\n');
    expect(rewriteAnchorReferences(code, 'alt', 'neu')).toBe(code);
  });

  // Nachtrag: Die Schreibmarke im Frontmatter steht in keinem Block. Vorher hängte
  // die Absatz-Regel die Kennung an die Schluss-Zeile `---`, und die Cursor-Folge
  // nahm den Anker eines Absatzes direkt darunter.
  it('Frontmatter: kein Schreibort und kein Anker des Absatzes darunter', () => {
    const text = ['---', 'titel: X', '---', 'Text ^a', '', 'Mehr'].join('\n');
    for (let z = 1; z <= 3; z++) {
      expect(ankerZielFuerZeile(text, z), `Zeile ${z}`).toBeNull();
      expect(blockAnchorForLine(text, z), `Zeile ${z}`).toBeNull();
    }
    expect(blockAnchorForLine(text, 4)).toBe('a');
    expect(ankerZielFuerZeile(text, 6)).toEqual({ art: 'zeilenende', zeile: 6 });
  });

  it('F7: ein Text ohne Frontmatter darf mit einer Linie --- beginnen', () => {
    const koerper = ['---', '', DT, 'table: A', '| x |', Z, '', '---', ''].join('\n');
    expect(extractBlockAnchors(koerper).order).toEqual([]);
    expect(extractBlockAnchors(koerper, { frontmatter: false }).order).toEqual(['A']);
    expect(extractBlockAnchors(koerper, {}).order).toEqual([]);
  });
});
