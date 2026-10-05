// 4T-001423 (Epic 3E-000176): Der prüfbare Kern der Block-Anker-Dekoration im
// Live-Modus — welcher Teil einer Zeile durch den Indikator ersetzt wird.
//
// Der Weg im Ganzen (Anzeige, Aufklappen bei Schreibmarke, Klick, Nachbarschaft
// zum Metadaten-Indikator, Aus-Zustand der Erweiterung) braucht einen laufenden
// Editor und steht im E2E-Fall. Hier steht die eine Entscheidung, in der ein
// Irrtum still Text des Anwenders verschlucken würde: die Grenzen des ersetzten
// Bereichs.
import { describe, it, expect } from 'vitest';

import {
  blockAnkerInZeile,
  tabelleOhneAnkerZeilen,
} from '../../../src/renderer/modules/live/live-block-anker.js';
import { extractBlockAnchors } from '../../../src/shared/block-anchors.js';

describe('blockAnkerInZeile — Grenzen des ersetzten Bereichs', () => {
  it('ersetzt den Anker samt des Leerzeichens davor (AK1)', () => {
    const zeile = 'Ein Absatz ^abc123';
    const treffer = blockAnkerInZeile(zeile);
    expect(treffer).toEqual({ von: 10, bis: zeile.length, id: 'abc123' });
    // Was stehen bleibt, ist genau der Text ohne Anker und ohne Trenn-Leerzeichen.
    expect(zeile.slice(0, treffer.von)).toBe('Ein Absatz');
  });

  it('ersetzt einen allein stehenden Anker ab Zeilenanfang', () => {
    const treffer = blockAnkerInZeile('^nurAnker');
    expect(treffer).toEqual({ von: 0, bis: 9, id: 'nurAnker' });
  });

  it('nimmt abschließenden Leerraum mit, statt ihn stehen zu lassen', () => {
    const zeile = 'Text ^ende   ';
    const treffer = blockAnkerInZeile(zeile);
    expect(treffer.bis).toBe(zeile.length);
    expect(zeile.slice(treffer.von, treffer.bis)).toBe(' ^ende   ');
  });

  it('lässt Umlaute und Ziffern in der Kennung zu', () => {
    expect(blockAnkerInZeile('Absatz ^größe-2_b').id).toBe('größe-2_b');
  });

  it('greift nicht, wo kein Anker steht', () => {
    expect(blockAnkerInZeile('Ein Absatz ohne Anker')).toBeNull();
    expect(blockAnkerInZeile('')).toBeNull();
    expect(blockAnkerInZeile(null)).toBeNull();
  });

  it('greift nicht mitten in der Zeile — der Anker steht am Ende', () => {
    expect(blockAnkerInZeile('Text ^mittig und weiter')).toBeNull();
  });

  it('greift nicht bei unzulässigen Zeichen in der Kennung (AK: Schreibregeln)', () => {
    expect(blockAnkerInZeile('Text ^mit punkt.')).toBeNull();
    expect(blockAnkerInZeile('Text ^')).toBeNull();
  });

  it('erkennt einen hochgestellten Doppel-Marker nicht als Anker', () => {
    // `^^hoch^^` ist die Hochstellung; sie endet nicht auf einer nackten Kennung.
    expect(blockAnkerInZeile('Formel x^^2^^')).toBeNull();
  });
});

describe('blockAnkerInZeile — Gleichlauf mit der gemeinsamen Quelle (AK9)', () => {
  // Anzeige und Index müssen dieselben Anker sehen. Geprüft wird deshalb nicht
  // nur, dass der Kern etwas findet, sondern dass er genau das findet, was
  // extractBlockAnchors — die Quelle von Backlinks-Index und Block-Panel —
  // ebenfalls als Anker zählt.
  const zeilen = [
    'Ein Absatz ^eins',
    'Noch einer ^zwei',
    'Ohne Anker',
    '- Listen-Eintrag ^drei',
    'Text ^mit punkt.',
    '^allein',
  ];

  it('findet genau die Anker, die auch die gemeinsame Quelle zählt', () => {
    const ausKern = zeilen
      .map((z) => blockAnkerInZeile(z))
      .filter(Boolean)
      .map((t) => t.id);
    const { order } = extractBlockAnchors(zeilen.join('\n'));
    expect(ausKern).toEqual(order);
  });

  it('meldet dieselbe Zeile wie die gemeinsame Quelle', () => {
    const { lineById } = extractBlockAnchors(zeilen.join('\n'));
    for (const [id, zeilenNr] of lineById) {
      expect(blockAnkerInZeile(zeilen[zeilenNr - 1]).id).toBe(id);
    }
  });
});

// 4T-002048 (Epic 3E-000192): Unter einer gewöhnlichen Tabelle nimmt der
// Syntaxbaum eine alleinstehende Anker-Zeile als letzte Tabellenzeile auf.
// Das Tabellen-Widget endet vor ihr, damit sie wie jede andere Anker-Zeile das
// Anker-Zeichen bekommt und nicht als Tabellenzeile erscheint.
describe('tabelleOhneAnkerZeilen — Ende des Tabellen-Widgets (4T-002048)', () => {
  it('nimmt eine Anker-Zeile am Tabellenende heraus', () => {
    expect(tabelleOhneAnkerZeilen('| A |\n|---|\n| 1 |\n^tab')).toBe('| A |\n|---|\n| 1 |');
  });

  it('nimmt mehrere Anker-Zeilen und einen abschließenden Umbruch mit', () => {
    expect(tabelleOhneAnkerZeilen('| A |\n|---|\n| 1 |\n^a\n  ^b  \n')).toBe('| A |\n|---|\n| 1 |');
  });

  it('lässt eine Tabelle ohne Anker-Zeile unverändert', () => {
    const quelle = '| A |\n|---|\n| 1 |';
    expect(tabelleOhneAnkerZeilen(quelle)).toBe(quelle);
    expect(tabelleOhneAnkerZeilen(quelle + '\n')).toBe(quelle + '\n');
  });

  it('lässt eine Anker-Zeile mitten in der Tabelle und einen Anker hinter Text stehen', () => {
    expect(tabelleOhneAnkerZeilen('| A |\n|---|\n^mitte\n| 2 |')).toBe(
      '| A |\n|---|\n^mitte\n| 2 |',
    );
    expect(tabelleOhneAnkerZeilen('| A |\n|---|\n| 1 | ^x')).toBe('| A |\n|---|\n| 1 | ^x');
  });

  it('behält Kopf- und Trennzeile immer', () => {
    expect(tabelleOhneAnkerZeilen('| A |\n|---|\n^a')).toBe('| A |\n|---|');
  });
});

// Nachbesserung F2: In einem Zitat oder Hinweisblock tragen die Zeilen ab der
// zweiten die Zitat-Präfixe.
describe('tabelleOhneAnkerZeilen im Zitat und Hinweisblock (4T-002048)', () => {
  it('nimmt die Anker-Zeile mit Zitat-Präfix heraus', () => {
    expect(tabelleOhneAnkerZeilen('| a |\n> |---|\n> | 1 |\n> ^x')).toBe('| a |\n> |---|\n> | 1 |');
    expect(tabelleOhneAnkerZeilen('| a |\n> > |---|\n> > | 1 |\n> > ^x')).toBe(
      '| a |\n> > |---|\n> > | 1 |',
    );
  });
});
