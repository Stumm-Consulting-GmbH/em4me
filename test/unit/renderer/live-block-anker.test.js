// 4T-001423 (Epic 3E-000176): Der prüfbare Kern der Block-Anker-Dekoration im
// Live-Modus — welcher Teil einer Zeile durch den Indikator ersetzt wird.
//
// Der Weg im Ganzen (Anzeige, Aufklappen bei Schreibmarke, Klick, Nachbarschaft
// zum Metadaten-Indikator, Aus-Zustand der Erweiterung) braucht einen laufenden
// Editor und steht im E2E-Fall. Hier steht die eine Entscheidung, in der ein
// Irrtum still Text des Anwenders verschlucken würde: die Grenzen des ersetzten
// Bereichs.
import { describe, it, expect } from 'vitest';

import { blockAnkerInZeile } from '../../../src/renderer/modules/live/live-block-anker.js';
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
