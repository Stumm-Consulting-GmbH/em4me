// @vitest-environment jsdom
// 4T-002617 (Epic 3E-000391): Katalog und reine Funktionen der Mermaid-Bausteine
// (src/shared/mermaid-bausteine.js). Geprüft werden
// - der Nachweis am installierten Diagramm-Paket (AK5): jedes Gerüst allein und
//   jedes Gerüst mit jedem seiner Bausteine, in allen fünf Sprachen, mit den
//   echten Platzhalter-Texten aus den Fragmenten, über mermaid.parse;
// - die Kennungen (V2, V3), die Einrückung (V5, AK4) und die Einfüge-Änderung.
// Die Dokument-Nachbildung liefert die jsdom-Umgebung von Vitest; geprüft ist
// das Annehmen des Quelltexts, nicht das Zeichnen.
import { describe, it, expect, beforeAll } from 'vitest';
import { RECHEN_ZEITLIMIT } from '../zeitlimits.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATZHALTER,
  PLATZHALTER_PRAEFIX,
  KATALOG,
  ARTEN,
  platzhalterTexte,
  artAusKoerper,
  naechsteKennung,
  kennungenInReihenfolge,
  einrueckungFuer,
  geruestEinfuegen,
  bausteinEinfuegen,
} from '../../src/shared/mermaid-bausteine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const HEUTE = '2026-11-07';
const ERWARTETE_ART = {
  flowchart: 'flowchart-v2',
  sequenceDiagram: 'sequence',
  gantt: 'gantt',
  classDiagram: 'class',
};

function fragment(code) {
  const datei = path.join(ROOT, 'src', 'i18n', 'fragments', code, 'editor.json');
  return JSON.parse(readFileSync(datei, 'utf8'));
}

function texteFuer(code) {
  const j = fragment(code);
  return platzhalterTexte((key) => j[key]);
}

const DE = texteFuer('de');

// Änderung anwenden (Änderungen absteigend, damit die Offsets stimmen).
function anwenden(text, r) {
  let out = text;
  for (const c of [...r.changes].sort((x, y) => y.from - x.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

// Körper des ersten Mermaid-Zauns als Offsets [von, bis].
function koerper(text) {
  const zeilen = text.split('\n');
  let off = 0;
  let von = -1;
  for (const z of zeilen) {
    const s = z.trim();
    if (von < 0 && s.startsWith('```mermaid')) von = off + z.length + 1;
    else if (von >= 0 && s === '```') return { koerperVon: von, koerperBis: off - 1 };
    off += z.length + 1;
  }
  return { koerperVon: von, koerperBis: text.length };
}

function geruestDoc(art, texte) {
  return anwenden('', geruestEinfuegen('', 0, art, { texte, heute: HEUTE }));
}

// Baustein am Ende der letzten Körper-Zeile einfügen.
function mitBaustein(doc, art, id, texte) {
  const k = koerper(doc);
  const r = bausteinEinfuegen(doc, k.koerperBis, art, id, { texte, heute: HEUTE, ...k });
  return anwenden(doc, r);
}

function quelltext(doc) {
  const k = koerper(doc);
  return doc.slice(k.koerperVon, k.koerperBis);
}

describe('Platzhalter-Texte der fünf Sprachen (V4)', () => {
  it('liegen in jedem Fragment ohne die in Mermaid bedeutsamen Zeichen vor', () => {
    for (const code of SPRACHEN) {
      const j = fragment(code);
      for (const name of PLATZHALTER) {
        const wert = j[PLATZHALTER_PRAEFIX + name];
        expect(typeof wert, `${code}/${name}`).toBe('string');
        expect(wert.trim().length, `${code}/${name}`).toBeGreaterThan(0);
        expect(wert, `${code}/${name}`).not.toMatch(/[[\]{}()|"'<>:;#]/);
      }
    }
  });
});

describe('Nachweis am Diagramm-Paket (AK5)', () => {
  let mermaid;
  beforeAll(async () => {
    mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  }, RECHEN_ZEITLIMIT);

  async function art(src) {
    const r = await mermaid.parse(src);
    return r && r.diagramType;
  }

  it('weist einen absichtlich kaputten Quelltext ab (Gegenprobe)', async () => {
    await expect(mermaid.parse('flowchart TD\n  N1[Start --> N2[Ende]')).rejects.toThrow();
  });

  for (const code of SPRACHEN) {
    it(
      `nimmt in «${code}» jedes Gerüst allein und mit jedem seiner Bausteine an`,
      async () => {
        const texte = texteFuer(code);
        const abgewiesen = [];
        let faelle = 0;
        for (const a of ARTEN) {
          const docs = [['geruest', geruestDoc(a, texte)]];
          for (const b of KATALOG[a].bausteine) {
            docs.push([b.id, mitBaustein(docs[0][1], a, b.id, texte)]);
          }
          for (const [name, doc] of docs) {
            faelle++;
            try {
              expect(await art(quelltext(doc))).toBe(ERWARTETE_ART[a]);
            } catch (e) {
              abgewiesen.push(`${a}/${name}: ${String(e.message).split('\n')[0]}`);
            }
          }
        }
        expect(abgewiesen).toEqual([]);
        expect(faelle).toBe(21);
      },
      RECHEN_ZEITLIMIT,
    );
  }

  it('nimmt den Handgriff der Story an: Gerüst, zwei Knoten, Verbindung', async () => {
    let doc = geruestDoc('flowchart', DE);
    doc = mitBaustein(doc, 'flowchart', 'knoten', DE);
    doc = mitBaustein(doc, 'flowchart', 'knoten', DE);
    doc = mitBaustein(doc, 'flowchart', 'verbindung', DE);
    expect(quelltext(doc)).toBe(
      'flowchart TD\n  N1[Start] --> N2[Ende]\n  N3[Schritt]\n  N4[Schritt]\n  N3 --> N4',
    );
    expect(await art(quelltext(doc))).toBe('flowchart-v2');
  });
});

describe('Diagramm-Art aus dem Körper (V6)', () => {
  it('überspringt Leerzeilen, Kommentare und Vorspann; graph gilt als flowchart', () => {
    expect(artAusKoerper(['', '%% Notiz', 'graph LR', 'A-->B'])).toEqual({
      art: 'flowchart',
      kopfIndex: 2,
    });
    expect(artAusKoerper(['---', 'title: X', '---', 'gantt'])).toEqual({
      art: 'gantt',
      kopfIndex: 3,
    });
    expect(artAusKoerper(['  pie', '  "A": 1'])).toEqual({ art: 'pie', kopfIndex: 0 });
    expect(artAusKoerper(['', '%% nur Kommentar'])).toBeNull();
  });
});

describe('Kennungen (V2, V3, AK4)', () => {
  it('beginnt im leeren Block bei 1', () => {
    expect(naechsteKennung('', 'N')).toBe(1);
    expect(naechsteKennung('flowchart TD\n', 'N')).toBe(1);
  });

  it('trifft nie eine eigene Kennung des Anwenders und zählt nur ganze Wörter', () => {
    const k = 'flowchart TD\n  start --> N1x\n  ZN7 --> N2\n  N2 --> ende';
    expect(naechsteKennung(k, 'N')).toBe(3);
  });

  it('nimmt bei Lücken die größte Zahl plus eins', () => {
    expect(naechsteKennung('N1\nN4\nN2', 'N')).toBe(5);
  });

  it('zählt Zahlen größer als 9 numerisch', () => {
    expect(naechsteKennung('N9\nN10\nN2', 'N')).toBe(11);
  });

  it('liefert die Kennungen in Reihenfolge des ersten Auftretens', () => {
    expect(kennungenInReihenfolge('N1 --> N2\nN3\nN1 --> N3', ['N'])).toEqual(['N1', 'N2', 'N3']);
    expect(kennungenInReihenfolge('A1, x\nM1, after A1\nA2, after M1', ['A', 'M'])).toEqual([
      'A1',
      'M1',
      'A2',
    ]);
  });

  it('legt fehlende Bezüge als neue Platzhalter an (Verbindung im leeren Block)', () => {
    const doc = '```mermaid\nflowchart TD\n\n```';
    const k = koerper(doc);
    const pos = doc.indexOf('\n\n') + 1;
    const r = bausteinEinfuegen(doc, pos, 'flowchart', 'verbindung', {
      texte: DE,
      heute: HEUTE,
      ...k,
    });
    expect(quelltext(anwenden(doc, r))).toBe(
      'flowchart TD\n  N1[Schritt]\n  N2[Schritt]\n  N1 --> N2',
    );
  });

  it('nimmt bei einer vorhandenen Kennung sie als <a> und legt <b> neu an', () => {
    const doc = '```mermaid\nsequenceDiagram\n  participant T5 as X\n```';
    const k = koerper(doc);
    const r = bausteinEinfuegen(doc, k.koerperBis, 'sequenceDiagram', 'nachricht', {
      texte: DE,
      heute: HEUTE,
      ...k,
    });
    expect(quelltext(anwenden(doc, r))).toBe(
      'sequenceDiagram\n  participant T5 as X\n  participant T6 as Teilnehmer 6\n  T5->>T6: Nachricht',
    );
  });

  it('setzt im Zeitplan ohne vorige Aufgabe das Tagesdatum statt after', () => {
    const doc = '```mermaid\ngantt\n  dateFormat YYYY-MM-DD\n```';
    const k = koerper(doc);
    const r = bausteinEinfuegen(doc, k.koerperBis, 'gantt', 'aufgabe', {
      texte: DE,
      heute: HEUTE,
      ...k,
    });
    expect(quelltext(anwenden(doc, r))).toBe(
      'gantt\n  dateFormat YYYY-MM-DD\n  Aufgabe :A1, 2026-11-07, 3d',
    );
    const doc2 = anwenden(doc, r);
    const k2 = koerper(doc2);
    const r2 = bausteinEinfuegen(doc2, k2.koerperBis, 'gantt', 'meilenstein', {
      texte: DE,
      heute: HEUTE,
      ...k2,
    });
    expect(quelltext(anwenden(doc2, r2))).toMatch(
      /\n {2}Meilenstein :milestone, M1, after A1, 0d$/,
    );
  });
});

describe('Einrückung (V5, AK4)', () => {
  function einfuegen(doc, pos, art, id) {
    const k = koerper(doc);
    return anwenden(doc, bausteinEinfuegen(doc, pos, art, id, { texte: DE, heute: HEUTE, ...k }));
  }

  it('übernimmt die Leerzeichen der Zeile der Schreibmarke', () => {
    const doc = '```mermaid\nflowchart TD\n    N1[A]\n```';
    const pos = doc.indexOf('N1[A]') + 2;
    expect(einfuegen(doc, pos, 'flowchart', 'knoten')).toBe(
      '```mermaid\nflowchart TD\n    N1[A]\n    N2[Schritt]\n```',
    );
  });

  it('übernimmt einen Tabulator der Zeile der Schreibmarke', () => {
    const doc = '```mermaid\nflowchart TD\n\tN1[A]\n```';
    const pos = doc.indexOf('N1[A]');
    expect(einfuegen(doc, pos, 'flowchart', 'knoten')).toBe(
      '```mermaid\nflowchart TD\n\tN1[A]\n\tN2[Schritt]\n```',
    );
  });

  it('ersetzt eine leere Zeile und nimmt die Einrückung der Körper-Zeile darüber', () => {
    const doc = '```mermaid\nflowchart TD\n   N1[A]\n\n```';
    const pos = doc.lastIndexOf('\n\n') + 1;
    expect(einfuegen(doc, pos, 'flowchart', 'knoten')).toBe(
      '```mermaid\nflowchart TD\n   N1[A]\n   N2[Schritt]\n```',
    );
  });

  it('rückt unter der Kopfzeile um zwei Leerzeichen tiefer ein', () => {
    const doc = '```mermaid\n flowchart TD\n\n```';
    const leer = doc.lastIndexOf('\n\n') + 1;
    expect(einfuegen(doc, leer, 'flowchart', 'knoten')).toBe(
      '```mermaid\n flowchart TD\n   N1[Schritt]\n```',
    );
    const aufKopf = doc.indexOf('flowchart');
    expect(einrueckungFuer(doc, aufKopf, koerper(doc).koerperVon, koerper(doc).koerperBis)).toBe(
      '   ',
    );
  });

  it('rückt die inneren Zeilen mehrzeiliger Bausteine zwei Leerzeichen tiefer ein', () => {
    const doc = geruestDoc('sequenceDiagram', DE);
    expect(quelltext(mitBaustein(doc, 'sequenceDiagram', 'schleife', DE))).toMatch(
      /\n {2}loop Bedingung\n {4}T1->>T2: Nachricht\n {2}end$/,
    );
  });

  it('rückt den Baustein in einem Block unter einem Listenpunkt ein', () => {
    const doc = '- Punkt\n\n  ```mermaid\n  flowchart TD\n    N1[A]\n  ```\n';
    const pos = doc.indexOf('N1[A]') + 5;
    expect(einfuegen(doc, pos, 'flowchart', 'knoten')).toBe(
      '- Punkt\n\n  ```mermaid\n  flowchart TD\n    N1[A]\n    N2[Schritt]\n  ```\n',
    );
  });
});

describe('Einfüge-Änderung (V5)', () => {
  it('fügt das Gerüst als Zaun mit Leerzeilen-Puffer ein und wählt den ersten Platzhalter', () => {
    const text = 'Absatz';
    const r = geruestEinfuegen(text, text.length, 'flowchart', { texte: DE, heute: HEUTE });
    const out = anwenden(text, r);
    expect(out).toBe('Absatz\n\n```mermaid\nflowchart TD\n  N1[Start] --> N2[Ende]\n```');
    expect(out.slice(r.selFrom, r.selTo)).toBe('Start');
  });

  it('setzt das Tagesdatum ins Zeitplan-Gerüst und wählt den Titel', () => {
    const r = geruestEinfuegen('', 0, 'gantt', { texte: DE, heute: HEUTE });
    const out = anwenden('', r);
    expect(out).toContain('  Aufgabe :A1, 2026-11-07, 3d\n```');
    expect(out.slice(r.selFrom, r.selTo)).toBe('Plan');
  });

  it('gibt dem ganzen Zaun die Einrückung einer Zeile unter einem Listenpunkt', () => {
    const text = '- Punkt\n  \n';
    const pos = text.indexOf('\n  ') + 3;
    const r = geruestEinfuegen(text, pos, 'classDiagram', { texte: DE, heute: HEUTE });
    const out = anwenden(text, r);
    expect(out).toContain(
      '\n  ```mermaid\n  classDiagram\n    class K1["Klasse 1"]\n    class K2["Klasse 2"]\n    K1 <|-- K2\n  ```\n',
    );
    expect(out.slice(r.selFrom, r.selTo)).toBe('Klasse');
  });

  it('wählt beim Baustein den ersten Platzhalter-Text und ist eine einzige Änderung', () => {
    const doc = geruestDoc('flowchart', DE);
    const k = koerper(doc);
    const r = bausteinEinfuegen(doc, k.koerperBis, 'flowchart', 'verzweigung', {
      texte: DE,
      heute: HEUTE,
      ...k,
    });
    expect(r.changes).toHaveLength(1);
    const out = anwenden(doc, r);
    expect(out.slice(r.selFrom, r.selTo)).toBe('Frage?');
    expect(quelltext(out)).toMatch(/\n {2}N3\{Frage\?\}$/);
  });

  it('setzt die Schreibmarke ans Ende, wenn der Baustein keinen Platzhalter-Text hat', () => {
    const doc = geruestDoc('flowchart', DE);
    const k = koerper(doc);
    const r = bausteinEinfuegen(doc, k.koerperBis, 'flowchart', 'verbindung', {
      texte: DE,
      heute: HEUTE,
      ...k,
    });
    const out = anwenden(doc, r);
    expect(r.selFrom).toBe(r.selTo);
    expect(out.slice(0, r.selFrom).endsWith('N1 --> N2')).toBe(true);
  });

  it('weist eine unbekannte Art und einen unbekannten Baustein ab', () => {
    expect(() => geruestEinfuegen('', 0, 'pie', { texte: DE, heute: HEUTE })).toThrow();
    expect(() =>
      bausteinEinfuegen('', 0, 'gantt', 'knoten', { texte: DE, koerperVon: 0, koerperBis: 0 }),
    ).toThrow();
  });

  it('weist geerbte Objekt-Schlüssel als Art mit der eigenen Meldung ab', () => {
    for (const art of ['constructor', 'toString', '__proto__']) {
      expect(() => geruestEinfuegen('', 0, art, { texte: DE, heute: HEUTE })).toThrow(
        `Unbekannte Diagramm-Art: ${art}`,
      );
      expect(() =>
        bausteinEinfuegen('', 0, art, 'knoten', { texte: DE, koerperVon: 0, koerperBis: 0 }),
      ).toThrow(`Unbekannter Baustein: ${art}/knoten`);
    }
  });
});
