// 4T-002502 (Epic 3E-000403): Wiki-Verweise im Kopf-Block (Frontmatter) im
// Verweis-Parser des Bereichs-Index (src/main/index/parse.js, über parseContent
// ohne Datei-Zugriff).
//
// Zugesagt ist: Ein Wiki-Verweis als Zeichenketten-Wert der obersten Ebene oder
// als Zeichenketten-Eintrag einer Liste der obersten Ebene zählt wie ein
// Verweis im Dokument-Körper — derselbe Treffer-Typ, dieselben Regeln für
// Anzeige-Text, Anker und Ziel, als Fundstelle die Zeile im Kopf-Block.
// Verschachtelte Strukturen bleiben draußen, Dateien ohne Kopf-Block sind
// unverändert. Die Wirkung auf Rückverweise und Abfrage steht gegen den
// echten Index in perspective-query-index.test.js.
//
// **Die Negativ-Fälle sind keine Beigabe.** Sie fangen eine Erfassung, die zu
// weit greift (verschachtelte Werte, nackte YAML-Listen), und wären vor der
// Änderung ebenso grün gewesen — ihre Rot-Probe ist eine zu breite Umsetzung,
// nicht das Fehlen der Umsetzung.
import { describe, it, expect } from 'vitest';

import { parseContent } from '../../src/main/index/parse.js';

const QUELLE = 'C:/bereich/Quelle.md';

// Die Wiki-Treffer eines Dokuments, ohne den Ausschnitt.
function wikiTreffer(text) {
  return parseContent(QUELLE, text)
    .hits.filter((h) => h.linkTyp === 'wiki')
    .map(({ zeile, zielBasename, anker }) => ({ zeile, zielBasename, anker }));
}

describe('Verweise im Kopf-Block (4T-002502)', () => {
  it('Einzel-Verweis als Wert: Treffer mit der Kopf-Block-Zeile als Fundstelle', () => {
    const text = ['---', 'titel: Notiz', 'projekt: "[[Vorhaben A]]"', '---', '# Notiz', ''].join(
      '\n',
    );
    const res = parseContent(QUELLE, text);
    expect(res.hits).toEqual([
      {
        zeile: 3,
        linkTyp: 'wiki',
        zielBasename: 'Vorhaben A',
        zielAbsolut: null,
        anker: null,
        snippet: 'projekt: "[[Vorhaben A]]"',
      },
    ]);
    // Die Eigenschaft bleibt als Wert abfragbar wie bisher.
    expect(res.properties.projekt).toBe('[[Vorhaben A]]');
  });

  it('Liste mit zwei Verweisen: je Verweis ein Eintrag, Anzeige-Text ist nicht das Ziel', () => {
    const text = [
      '---',
      'bezug:',
      '  - "[[Ziel Eins]]"',
      '  - "[[Ziel Zwei|Anzeige]]"',
      '---',
      'Text.',
    ].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 3, zielBasename: 'Ziel Eins', anker: null },
      { zeile: 4, zielBasename: 'Ziel Zwei', anker: null },
    ]);
  });

  it('Flow-Liste in einer Zeile und Anker: beide Treffer in derselben Zeile', () => {
    const text = ['---', 'bezug: ["[[Eins#Kapitel]]", "[[Zwei]]"]', '---', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 2, zielBasename: 'Eins', anker: 'Kapitel' },
      { zeile: 2, zielBasename: 'Zwei', anker: null },
    ]);
  });

  it('derselbe Verweis unter zwei Schlüsseln bekommt je seine eigene Zeile', () => {
    const text = [
      '---',
      'oben: "[[Gleich]]"',
      'liste:',
      '  - "[[Anders]]"',
      '  - "[[Gleich]]"',
      '---',
      '',
    ].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 2, zielBasename: 'Gleich', anker: null },
      { zeile: 4, zielBasename: 'Anders', anker: null },
      { zeile: 5, zielBasename: 'Gleich', anker: null },
    ]);
  });

  it('Verweis ohne vorhandenes Ziel: geführt wie ein offener Verweis im Körper', () => {
    // Der Parser kennt keine Existenz; die Zusage ist die gleiche Form. Derselbe
    // Verweis im Körper und im Kopf-Block ergibt denselben Treffer bis auf
    // Fundstelle und Ausschnitt.
    const kopf = parseContent(QUELLE, ['---', 'ziel: "[[Gibt es nicht]]"', '---', ''].join('\n'));
    const koerper = parseContent(QUELLE, ['Siehe [[Gibt es nicht]].', ''].join('\n'));
    const ohneOrt = ({ zeile: _z, snippet: _s, ...rest }) => rest;
    expect(kopf.hits).toHaveLength(1);
    expect(kopf.hits.map(ohneOrt)).toEqual(koerper.hits.map(ohneOrt));
    expect(kopf.hits[0].zeile).toBe(2);
  });

  it('Verweis im Kopf-Block und im Körper: beide gezählt, in Zeilen-Reihenfolge', () => {
    const text = ['---', 'projekt: "[[Kopf]]"', '---', 'Siehe [[Körper]].', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 2, zielBasename: 'Kopf', anker: null },
      { zeile: 4, zielBasename: 'Körper', anker: null },
    ]);
  });

  it('dieselben Ziel-Regeln wie im Körper: reiner Anker und Verknüpfungs-Ziel zählen nicht', () => {
    const text = ['---', 'a: "[[#Nur Anker]]"', 'b: "[[@kuerzel:Fremd]]"', '---', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([]);
  });

  it('verschachtelte Struktur mit Verweis: nicht erfasst', () => {
    const text = [
      '---',
      'gruppe:',
      '  kind: "[[Verschachtelt]]"',
      'liste:',
      '  - name: "[[In Objekt]]"',
      '  - ["[[In Unterliste]]"]',
      '---',
      '',
    ].join('\n');
    const res = parseContent(QUELLE, text);
    expect(res.hits).toEqual([]);
  });

  it('Datei ohne Kopf-Block: unverändert, nur die Körper-Verweise', () => {
    const text = ['# Titel', 'projekt: "[[Im Körper]]"', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([{ zeile: 2, zielBasename: 'Im Körper', anker: null }]);
  });

  it('Trennlinie ohne Schluss-Zeile: kein Kopf-Block, die Zeile zählt als Körper', () => {
    // 4T-002503 (Befund B5 des Reviews): Ein öffnendes `---` ohne Schluss ist
    // eine Trennlinie, kein Kopf-Block; der Verweis darunter zählt einmal, als
    // Körper-Verweis.
    const text = ['---', 'projekt: "[[Im Körper]]"', '', 'Text.', ''].join('\n');
    const res = parseContent(QUELLE, text);
    expect(res.properties).toEqual({});
    expect(wikiTreffer(text)).toEqual([{ zeile: 2, zielBasename: 'Im Körper', anker: null }]);
  });

  it('nackter `[[`-Wert ohne Anführungszeichen: kein Absturz, wie yaml.load ihn liefert', () => {
    // `projekt: [[Ziel]]` ist in YAML eine Liste in einer Liste — kein
    // Zeichenketten-Wert, also kein Verweis. Der übrige Kopf-Block und der
    // Körper bleiben lesbar.
    const text = ['---', 'projekt: [[Ziel]]', 'tags: [a]', '---', 'Siehe [[Körper]].', ''].join(
      '\n',
    );
    let res;
    expect(() => {
      res = parseContent(QUELLE, text);
    }).not.toThrow();
    expect(res.tags).toEqual(['a']);
    expect(res.hits.map((h) => h.zielBasename)).toEqual(['Körper']);
  });

  it('Kopf-Block mit YAML-Fehler: kein Absturz, Körper wie bisher', () => {
    const text = ['---', 'projekt: "[[Ziel]]', 'x: : :', '---', 'Siehe [[Körper]].', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([{ zeile: 5, zielBasename: 'Körper', anker: null }]);
  });
});

// 4T-002503 (Befund B1 des Reviews): Die Fundstelle ist die Zeile des Werts, aus
// der Struktur bestimmt — nie ein Kommentar, ein auskommentierter oder ein
// verschachtelter Eintrag, der denselben Verweis-Text vor dem Wert trägt.
describe('Fundstelle der Kopf-Block-Verweise aus der Struktur (4T-002503, B1)', () => {
  it('Kommentar hinter dem Schlüssel vor dem Listen-Eintrag: Fundstelle ist der Eintrag', () => {
    const text = ['---', 'bezug: # vorher [[Alt]]', '  - "[[Alt]]"', '---', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([{ zeile: 3, zielBasename: 'Alt', anker: null }]);
  });

  it('auskommentierter Eintrag vor dem echten: Fundstelle ist der echte Eintrag', () => {
    const text = ['---', 'personen:', '  # - "[[Anna]]"', '  - "[[Anna]]"', '---', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([{ zeile: 4, zielBasename: 'Anna', anker: null }]);
  });

  it('gemischte Liste: der verschachtelte Eintrag zählt nicht, der Zeichenketten-Eintrag schon', () => {
    const text = ['---', 'liste:', '  - ziel: "[[Alt]]"', '  - "[[Alt]]"', '---', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([{ zeile: 4, zielBasename: 'Alt', anker: null }]);
  });

  // Schutz gegen eine falsche Umsetzung: Ohne die Struktur-Regel bleibt der Fall
  // grün, weil schon die frühere Suche zuerst den Wert fand. Er fängt eine
  // Umsetzung, die den Kommentar am Zeilen-Ende als zweiten Verweis mitzählt.
  it('Kommentar hinter dem Wert auf derselben Zeile zählt nicht als zweite Fundstelle', () => {
    const text = ['---', 'projekt: "[[Alt]]" # [[Alt]]', '---', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([{ zeile: 2, zielBasename: 'Alt', anker: null }]);
  });

  it('Wert auf der Folgezeile und Block-Skalar: Fundstelle ist die Wert-Zeile', () => {
    const text = [
      '---',
      'projekt:',
      '  # Hinweis [[Alt]]',
      '  "[[Alt]]"',
      'notiz: |',
      '  Erst [[Eins]],',
      '  dann [[Zwei]].',
      '---',
      '',
    ].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 4, zielBasename: 'Alt', anker: null },
      { zeile: 6, zielBasename: 'Eins', anker: null },
      { zeile: 7, zielBasename: 'Zwei', anker: null },
    ]);
  });
});

// 4T-002503 (Befunde C1 und C2 des Reviews): Formen, die die Struktur-Regel
// allein nicht trifft, findet der Rückfall im Zeilen-Bereich des Schlüssels —
// mit der Zeile des Werts als Fundstelle; Anführungszeichen mitten in einem
// Wert ohne Anführungszeichen sind Text.
describe('Rückfall und Anführungszeichen im Kopf-Block (4T-002503, C1 und C2)', () => {
  it('C1 a: Flow-Liste über mehrere Zeilen, `[` auf der Schlüssel-Zeile', () => {
    const text = [
      '---',
      'bezug: [',
      '  "[[Eins]]", # Kommentar [[Kommentar]]',
      "  '[[Zwei]]'",
      ']',
      '---',
      '',
    ].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 3, zielBasename: 'Eins', anker: null },
      { zeile: 4, zielBasename: 'Zwei', anker: null },
    ]);
  });

  it('C1 a: Flow-Liste, `[` erst auf der Folgezeile', () => {
    const text = ['---', 'bezug:', '  ["[[Eins]]",', '   "[[Zwei]]"]', '---', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 3, zielBasename: 'Eins', anker: null },
      { zeile: 4, zielBasename: 'Zwei', anker: null },
    ]);
  });

  it('C1 b: Block-Skalar als Listen-Eintrag (`- |`) hinter einem verschachtelten Eintrag', () => {
    const text = [
      '---',
      'notizen:',
      '  - ziel: "[[Alt]]"',
      '  - |',
      '    Siehe [[Alt]] dazu.',
      '  - "[[Eins]]"',
      '---',
      '',
    ].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 5, zielBasename: 'Alt', anker: null },
      { zeile: 6, zielBasename: 'Eins', anker: null },
    ]);
  });

  // Schutz gegen eine falsche Umsetzung: Am Index bleibt der Fall ohne die
  // Behebung grün (die Zeile stimmte, falsch war nur die Anführungszeichen-Art,
  // die erst der Umschreiber nutzt; dessen Fall in link-rewrite-kopf.test.js ist der
  // Beleg). Er fängt eine Umsetzung, die den Verweis hinter `'` verliert.
  it("C2: ein `'` mitten im Wert ohne Anführungszeichen ist Text, der Verweis zählt", () => {
    const text = [
      '---',
      "projekt: Peter's [[Alt]]",
      'liste:',
      "  - Peter's [[Eins]]",
      '---',
      '',
    ].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 2, zielBasename: 'Alt', anker: null },
      { zeile: 4, zielBasename: 'Eins', anker: null },
    ]);
  });

  // 4T-002503 (Befund D1 des Reviews): Der Rückfall lässt einen verschachtelten
  // Eintrag samt seinen Folgezeilen aus, auch einen Listen-Eintrag, der selbst
  // eine Flow-Liste ist.
  it('D1: Block-Skalar in einem verschachtelten Eintrag vor dem echten `- |`', () => {
    const text = [
      '---',
      'notizen:',
      '  - meta: |',
      '      [[X]]',
      '  - |',
      '    [[X]]',
      '---',
      '',
    ].join('\n');
    expect(wikiTreffer(text)).toEqual([{ zeile: 6, zielBasename: 'X', anker: null }]);
  });

  it('D1: verschachtelte Flow-Liste als Listen-Eintrag vor dem echten Eintrag', () => {
    const text = [
      '---',
      'liste:',
      '  - ["[[X]]",',
      '     "[[X]]"]',
      '  - "[[Y]]"',
      '  - |',
      '    [[X]]',
      '---',
      '',
    ].join('\n');
    expect(wikiTreffer(text)).toEqual([
      { zeile: 5, zielBasename: 'Y', anker: null },
      { zeile: 7, zielBasename: 'X', anker: null },
    ]);
  });

  it('D1: einzeilige verschachtelte Flow-Liste `- ["[[X]]"]` vor `- "[[X]]"`', () => {
    const text = ['---', 'liste:', '  - ["[[X]]"]', '  - "[[X]]"', '---', ''].join('\n');
    expect(wikiTreffer(text)).toEqual([{ zeile: 4, zielBasename: 'X', anker: null }]);
  });
});
