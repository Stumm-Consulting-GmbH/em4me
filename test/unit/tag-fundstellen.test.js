// 4T-001530 (Epic 3E-000175): Der Fundstellen-Ermittler der Tag-Umbenennung.
//
// **Was hier auf dem Spiel steht.** Der Fundstellen-Begriff entscheidet
// zugleich, was ein Fehlgriff trifft: Was der Ermittler zu viel findet, wird
// im Text des Anwenders überschrieben; was er übersieht, bleibt unter dem alten
// Namen stehen und zerlegt die Ordnung, die der Tag stiften soll.
//
// **Warum die Fixture beide Notationen mischt.** Ein Tag steht im Frontmatter
// und im Fließtext, und beide haben verschiedene Schreibwege. Ein Prüffall über
// nur eine Notation ließe offen, ob der Ermittler die andere überhaupt kennt.
import { describe, it, expect } from 'vitest';
import { ermittleFundstellen } from '../../src/shared/tag-erkennung.js';

// Ein Dokument mit allem, was der Ermittler unterscheiden muss: beide
// Notationen, Schreibvarianten, Hierarchie, und die vier Stellen, an denen eine
// Raute KEIN Tag ist.
const DOKUMENT = [
  '---',
  'titel: Beispiel',
  'tags:',
  '  - projekt',
  '  - Projekt/alpha',
  '  - anderes',
  '---',
  '',
  '# Überschrift ohne Tag',
  '',
  'Fließtext mit #projekt und #projekt/beta sowie #PROJEKT in Großschreibung.',
  '',
  'Kein Treffer: #projektil ist ein anderer Tag.',
  '',
  'Kein Tag im Code: `#projekt`',
  '',
  '```',
  '#projekt im Fence',
  '```',
  '',
  'Kein Tag im Anker: [[Ziel#projekt]]',
  '',
  'Kein Tag in der Adresse: https://beispiel.de/#projekt',
  '',
  'Fremder Tag bleibt: #anderes',
].join('\n');

function fundstellen(text = DOKUMENT, alt = 'projekt', neu = 'arbeit') {
  return ermittleFundstellen(text, alt, neu);
}

describe('ermittleFundstellen — Fließtext (4T-001530)', () => {
  it('liefert Offset, Länge und Kontext je Fundstelle (AK1)', () => {
    const { fliesstext } = fundstellen();
    expect(fliesstext.length).toBeGreaterThan(0);
    for (const f of fliesstext) {
      // Der Offset zeigt auf den NAMEN, nicht auf die Raute: Genau dort steht
      // im Dokument der alte Name, und genau dort setzt die Ersetzen-Strecke
      // an.
      expect(DOKUMENT.slice(f.offset, f.offset + f.laenge)).toBe(f.alt);
      expect(DOKUMENT.charAt(f.offset - 1)).toBe('#');
      expect(f.kontext).toBeTruthy();
    }
  });

  it('findet alle Schreibweisen und schreibt einheitlich den neuen Namen (AK3)', () => {
    const { fliesstext } = fundstellen();
    const gefunden = fliesstext.map((f) => f.alt);
    expect(gefunden).toContain('projekt');
    expect(gefunden).toContain('PROJEKT');
    // Der neue Name ist einheitlich, gleich wie der alte geschrieben war.
    expect(fliesstext.find((f) => f.alt === 'PROJEKT').neu).toBe('arbeit');
  });

  it('nimmt den Teilbaum mit und behält den Rest-Namen (AK4)', () => {
    const { fliesstext } = fundstellen();
    const kind = fliesstext.find((f) => f.alt === 'projekt/beta');
    expect(kind).toBeTruthy();
    expect(kind.neu).toBe('arbeit/beta');
  });

  it('kennzeichnet mitwandernde Kinder als solche (AK5)', () => {
    // Die Vorschau soll die Reichweite zeigen, bevor der Anwender zustimmt —
    // dafür muss die Ausgabe Kind und Treffer unterscheiden.
    const { fliesstext, frontmatter } = fundstellen();
    expect(fliesstext.find((f) => f.alt === 'projekt/beta').kind).toBe(true);
    expect(fliesstext.find((f) => f.alt === 'projekt').kind).toBe(false);
    expect(frontmatter.find((f) => f.alt === 'Projekt/alpha').kind).toBe(true);
  });

  it('lässt Code, Fence, Anker, Adresse und Überschrift außen vor (AK7)', () => {
    const { fliesstext } = fundstellen();
    // Keine Fundstelle darf in einem der vier Ausschluss-Kontexte liegen. Statt
    // die Zahl zu zählen — die bei jeder Fixture-Änderung anders wäre — wird
    // die ZEILE jeder Fundstelle geprüft.
    for (const f of fliesstext) {
      expect(f.kontext).not.toContain('`');
      expect(f.kontext).not.toContain('[[');
      expect(f.kontext).not.toContain('https://');
      expect(f.kontext.startsWith('#')).toBe(false);
    }
    expect(fliesstext.some((f) => f.kontext.includes('im Fence'))).toBe(false);
  });

  it('trifft keinen Tag, der bloß mit demselben Wort beginnt', () => {
    // `#projektil` ist ein eigener Tag: Die Präfix-Regel verlangt den
    // Schrägstrich, sonst zöge eine Umbenennung fremde Tags mit.
    const { fliesstext } = fundstellen();
    expect(fliesstext.some((f) => f.alt === 'projektil')).toBe(false);
  });

  it('lässt fremde Tags unberührt', () => {
    const { fliesstext } = fundstellen();
    expect(fliesstext.some((f) => f.alt === 'anderes')).toBe(false);
  });
});

describe('ermittleFundstellen — Frontmatter (4T-001530)', () => {
  it('liefert den Listen-Eintrag statt eines Textmusters (AK2)', () => {
    const { frontmatter } = fundstellen();
    expect(frontmatter.map((f) => [f.index, f.alt, f.neu])).toEqual([
      [0, 'projekt', 'arbeit'],
      [1, 'Projekt/alpha', 'arbeit/alpha'],
    ]);
    for (const f of frontmatter) {
      expect(f.feld).toBe('tags');
      expect(f.istListe).toBe(true);
    }
  });

  it('spaltet eine Komma-Kette ohne Listen-Notation nicht auf (AK6)', () => {
    // Der Index liest sie ebenso als EINEN Eintrag; ein Aufspalten erfände
    // eine Struktur, die der Anwender nicht geschrieben hat.
    const text = ['---', 'tags: projekt, anderes', '---', '', 'Text'].join('\n');
    const { frontmatter } = ermittleFundstellen(text, 'projekt', 'arbeit');
    expect(frontmatter).toEqual([]);
  });

  it('erfasst den Ein-String-Fall, wenn er genau der Tag ist', () => {
    const text = ['---', 'tags: projekt', '---', '', 'Text'].join('\n');
    const { frontmatter } = ermittleFundstellen(text, 'projekt', 'arbeit');
    // 4T-001531: Dazu gekommen sind Offset und Länge. Sie schreiben nichts —
    // der Frontmatter-Weg geht über das Feld —, sondern tragen die Fundstelle
    // in die Vorschau, die jede Stelle mit ihrem Kontext zeigt (E5).
    expect(frontmatter).toEqual([
      {
        feld: 'tags',
        index: 0,
        istListe: false,
        alt: 'projekt',
        neu: 'arbeit',
        kind: false,
        offset: text.indexOf('projekt'),
        laenge: 'projekt'.length,
      },
    ]);
  });

  it('zeigt mit Offset und Länge auf den Wert im Block (4T-001531)', () => {
    // Die Probe gilt für jede der drei Notationen: Der Ausschnitt an der
    // gemeldeten Stelle IST der alte Name. Eine Position daneben zeigte in der
    // Vorschau die falsche Zeile und spränge beim Anklicken ins Leere.
    const faelle = [
      ['---', 'tags:', '  - projekt', '  - projekt/alpha', '---', '', 'Text'].join('\n'),
      ['---', 'tags: [anderes, projekt, projekt/alpha]', '---', '', 'Text'].join('\n'),
      ['---', 'tags:', '  - "projekt"', '---', '', 'Text'].join('\n'),
    ];
    for (const text of faelle) {
      const { frontmatter } = ermittleFundstellen(text, 'projekt', 'arbeit');
      expect(frontmatter.length).toBeGreaterThan(0);
      for (const f of frontmatter) {
        expect(text.slice(f.offset, f.offset + f.laenge)).toBe(f.alt);
      }
    }
  });

  it('zählt den Frontmatter-Block nicht als Fließtext', () => {
    // Sonst stünde derselbe Tag zweimal in der Vorschau, einmal je Notation,
    // und der Anwender sähe eine Reichweite, die es nicht gibt.
    const { fliesstext } = fundstellen();
    for (const f of fliesstext) expect(f.offset).toBeGreaterThan(DOKUMENT.indexOf('\n---\n') + 4);
  });
});

describe('ermittleFundstellen — Randlagen', () => {
  it('bleibt bei fehlenden Angaben stumm', () => {
    expect(ermittleFundstellen(null, 'a', 'b')).toEqual({ fliesstext: [], frontmatter: [] });
    expect(ermittleFundstellen('Text', '', 'b')).toEqual({ fliesstext: [], frontmatter: [] });
    expect(ermittleFundstellen('Text', 'a', '')).toEqual({ fliesstext: [], frontmatter: [] });
  });

  it('kommt ohne Frontmatter aus', () => {
    const { fliesstext, frontmatter } = ermittleFundstellen(
      'Nur #projekt hier.',
      'projekt',
      'arbeit',
    );
    expect(frontmatter).toEqual([]);
    expect(fliesstext).toHaveLength(1);
    expect(fliesstext[0].neu).toBe('arbeit');
  });
});
