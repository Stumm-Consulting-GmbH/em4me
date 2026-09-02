// 4T-000599 (Epic 3E-000112): Unit-Matrix für den Listen-Struktur-Kern
// (src/shared/markdown/list-outline.js). Deckt Zeilen-Zerlegung, Block- und
// Teilbaum-Erkennung, Geschwister-Suche, Verschieben (Teilbaum und markierter
// Bereich), Ein-/Ausrücken sowie die Neu-Nummerierung samt Startnummern-
// Erhalt ab. Die Fälle bilden die Festlegungen des Product Owners vom
// 2026-07-21 ab (Leerzeile trennt, Einrücken ohne Vorgänger erlaubt,
// fortlaufende Nummern ab der Startnummer, Verschieben ändert nie die Ebene).
import { describe, it, expect } from 'vitest';
import {
  parseListLine,
  scanListBlock,
  subtreeRange,
  siblingRange,
  collectStartNumbers,
  renumberOrdered,
  moveSubtree,
  moveLineRange,
  indentSubtree,
  outdentSubtree,
  shiftLineRange,
} from '../../src/shared/markdown/list-outline.js';

// Beispiel aus der Task-Dokumentation: Punkt mit Unterpunkt zwischen zwei
// Geschwistern.
const BEISPIEL = ['1. A', '2. B', '  - B1', '3. C'];

describe('parseListLine', () => {
  it('zerlegt geordnete und ungeordnete Marker', () => {
    expect(parseListLine('- Text')).toMatchObject({ level: 0, ordered: false, content: 'Text' });
    expect(parseListLine('  12. Text')).toMatchObject({ level: 2, ordered: true, number: 12 });
    expect(parseListLine('* Stern')).toMatchObject({ ordered: false });
    expect(parseListLine('+ Plus')).toMatchObject({ ordered: false });
  });

  it('behandelt Aufgaben-Zeilen als ungeordnete Listenpunkte', () => {
    expect(parseListLine('- [ ] offen')).toMatchObject({ ordered: false, content: '[ ] offen' });
    expect(parseListLine('  - [x] erledigt')).toMatchObject({ level: 2, ordered: false });
  });

  it('liefert null für Nicht-Listen-Zeilen', () => {
    expect(parseListLine('Absatz')).toBeNull();
    expect(parseListLine('')).toBeNull();
    // Klammer-Variante ist bewusst nicht unterstützt (Bestand aus 4T-000016).
    expect(parseListLine('1) Text')).toBeNull();
    // Gliederungsnummern sind kein Listen-Marker (PO-Festlegung 6).
    expect(parseListLine('1.1. Text')).toBeNull();
  });

  it('merkt sich den Trenner hinter dem Marker', () => {
    expect(parseListLine('1.\tText').gap).toBe('\t');
    expect(parseListLine('1. Text').gap).toBe(' ');
  });
});

describe('scanListBlock', () => {
  it('umfasst den zusammenhängenden Listen-Block', () => {
    expect(scanListBlock(BEISPIEL, 1)).toEqual({ from: 0, to: 3 });
  });

  it('endet an der Leerzeile (PO-Festlegung 1)', () => {
    const lines = ['- A', '- B', '', '- C', '- D'];
    expect(scanListBlock(lines, 0)).toEqual({ from: 0, to: 1 });
    expect(scanListBlock(lines, 3)).toEqual({ from: 3, to: 4 });
  });

  it('nimmt einen vorangehenden Absatz nicht mit auf', () => {
    const lines = ['Absatz ohne Leerzeile', '- A', '- B'];
    expect(scanListBlock(lines, 1)).toEqual({ from: 1, to: 2 });
  });

  it('schließt eingerückte Fortsetzungszeilen ein', () => {
    const lines = ['- A', '  Fortsetzung von A', '- B'];
    expect(scanListBlock(lines, 0)).toEqual({ from: 0, to: 2 });
  });

  it('liefert null, wenn die Zeile kein Listenpunkt ist', () => {
    expect(scanListBlock(['Absatz'], 0)).toBeNull();
  });
});

describe('subtreeRange', () => {
  it('nimmt tiefer eingerückte Folgezeilen mit', () => {
    expect(subtreeRange(BEISPIEL, 1)).toEqual({ from: 1, to: 2 });
  });

  it('endet vor dem nächsten Punkt gleicher Ebene', () => {
    expect(subtreeRange(BEISPIEL, 0)).toEqual({ from: 0, to: 0 });
  });

  it('umfasst mehrere Ebenen und Fortsetzungszeilen', () => {
    const lines = ['- A', '  - A1', '    - A11', '    Text zu A11', '- B'];
    expect(subtreeRange(lines, 0)).toEqual({ from: 0, to: 3 });
    expect(subtreeRange(lines, 1)).toEqual({ from: 1, to: 3 });
  });
});

describe('siblingRange', () => {
  it('findet Geschwister in beide Richtungen', () => {
    expect(siblingRange(BEISPIEL, 1, -1)).toEqual({ from: 0, to: 0 });
    expect(siblingRange(BEISPIEL, 1, +1)).toEqual({ from: 3, to: 3 });
  });

  it('überspringt den Teilbaum des Geschwisters', () => {
    const lines = ['- A', '  - A1', '  - A2', '- B'];
    expect(siblingRange(lines, 3, -1)).toEqual({ from: 0, to: 2 });
  });

  it('liefert null am Rand der Geschwister-Kette', () => {
    expect(siblingRange(BEISPIEL, 0, -1)).toBeNull();
    expect(siblingRange(BEISPIEL, 3, +1)).toBeNull();
  });

  it('liefert null für das letzte Kind einer Untergliederung', () => {
    // Ebenen-Wechsel gehört zu Tab, nicht zum Verschieben (PO-Festlegung 5).
    const lines = ['- A', '  - A1', '  - A2', '- B', '  - B1'];
    expect(siblingRange(lines, 2, +1)).toBeNull();
  });

  it('endet an der Leerzeile', () => {
    const lines = ['- A', '', '- B'];
    expect(siblingRange(lines, 2, -1)).toBeNull();
  });
});

describe('moveSubtree', () => {
  it('verschiebt den Punkt samt Unterpunkten nach unten und nummeriert neu', () => {
    const result = moveSubtree(BEISPIEL, 1, +1);
    expect(result.lines).toEqual(['1. A', '2. C', '3. B', '  - B1']);
    expect(result.cursorLine).toBe(2);
  });

  it('verschiebt nach oben und macht die Nummerierung nicht zur Startnummer', () => {
    const lines = ['1. A', '  - A1', '2. B'];
    const result = moveSubtree(lines, 2, -1);
    expect(result.lines).toEqual(['1. B', '2. A', '  - A1']);
    expect(result.cursorLine).toBe(0);
  });

  it('erhält die Startnummer der Liste', () => {
    const lines = ['3. A', '4. B', '5. C'];
    expect(moveSubtree(lines, 1, -1).lines).toEqual(['3. B', '4. A', '5. C']);
  });

  it('springt über den kompletten Nachbar-Ast', () => {
    const lines = ['- A', '  - A1', '  - A2', '- B'];
    expect(moveSubtree(lines, 3, -1).lines).toEqual(['- B', '- A', '  - A1', '  - A2']);
  });

  it('ist ohne Geschwister in der Richtung wirkungslos', () => {
    expect(moveSubtree(BEISPIEL, 0, -1)).toBeNull();
    expect(moveSubtree(BEISPIEL, 3, +1)).toBeNull();
    expect(moveSubtree(['- A', '  - A1', '- B'], 1, +1)).toBeNull();
  });

  it('ändert die Ebene nicht', () => {
    const lines = ['- A', '  - A1', '  - A2', '- B'];
    const result = moveSubtree(lines, 2, -1);
    expect(result.lines).toEqual(['- A', '  - A2', '  - A1', '- B']);
  });

  it('bewegt Aufgaben-Zeilen wie gewöhnliche Listenzeilen', () => {
    const lines = ['- [ ] eins', '- [x] zwei'];
    expect(moveSubtree(lines, 1, -1).lines).toEqual(['- [x] zwei', '- [ ] eins']);
  });
});

describe('moveLineRange', () => {
  it('verschiebt den markierten Bereich um genau eine Zeile', () => {
    const lines = ['1. A', '2. B', '3. C', '4. D'];
    const result = moveLineRange(lines, 2, 3, -1);
    expect(result.lines).toEqual(['1. A', '2. C', '3. D', '4. B']);
    expect(result).toMatchObject({ from: 1, to: 2 });
  });

  it('erweitert den Bereich nicht um nicht markierte Unterpunkte', () => {
    const lines = ['- A', '- B', '  - B1'];
    expect(moveLineRange(lines, 1, 1, -1).lines).toEqual(['- B', '- A', '  - B1']);
  });

  it('ist an den Dokument-Rändern wirkungslos', () => {
    const lines = ['- A', '- B'];
    expect(moveLineRange(lines, 0, 0, -1)).toBeNull();
    expect(moveLineRange(lines, 1, 1, +1)).toBeNull();
  });
});

describe('indentSubtree', () => {
  // 4T-000660: Die Ziel-Einrückung ist die Inhalts-Spalte des Vorgängers, nicht
  // eine feste Schrittweite. Unter `1. ` sind das drei Zeichen — mit zweien
  // bliebe die Liste in der Anzeige flach.
  it('rückt auf die Inhalts-Spalte des Vorgängers ein', () => {
    const result = indentSubtree(BEISPIEL, 1);
    expect(result.lines).toEqual(['1. A', '   1. B', '     - B1', '2. C']);
    expect(result.cursorLine).toBe(1);
  });

  it('richtet sich nach der Breite des Eltern-Markers', () => {
    // Aufzählung: zwei Zeichen.
    expect(indentSubtree(['- A', '- B'], 1).lines).toEqual(['- A', '  - B']);
    // Zweistellige Nummer: vier Zeichen.
    expect(indentSubtree(['10. A', '11. B'], 1).lines).toEqual(['10. A', '    1. B']);
  });

  // 4T-000661: Ohne Vorgänger-Geschwister gibt es keinen Punkt, unter den der
  // eigene rutschen könnte. Eine Verschiebung wäre reine Optik und fiele bei
  // mehrfachem Einrücken aus dem gültigen Fenster — die Zeile gälte dann als
  // Fortsetzungstext. Die frühere Festlegung „Einrücken ohne Vorgänger
  // erlaubt" wurde deshalb vom Product Owner zurückgenommen.
  it('ist ohne vorhergehendes Geschwister wirkungslos', () => {
    expect(indentSubtree(['- A', '  - A1'], 0)).toBeNull();
    expect(indentSubtree(['1. A', '   1. A1'], 1)).toBeNull();
  });

  it('bleibt im gueltigen Fenster, auch bei mehrfachem Einruecken', () => {
    // Zweimal einruecken: erst unter Alpha (Spalte 4), dann unter Elf.
    const einmal = indentSubtree(['10. Zehn', '11. Elf', '12. Zwoelf'], 1).lines;
    expect(einmal).toEqual(['10. Zehn', '    1. Elf', '11. Zwoelf']);
    // Elf hat auf seiner neuen Ebene keinen Vorgaenger -> kein weiteres
    // Einruecken.
    expect(indentSubtree(einmal, 1)).toBeNull();
    // Zwoelf dagegen kann unter Elf rutschen.
    expect(indentSubtree(einmal, 2).lines).toEqual(['10. Zehn', '    1. Elf', '    2. Zwoelf']);
  });

  it('zählt auf der neuen Ebene weiter, wenn dort schon ein Punkt steht', () => {
    const lines = ['1. A', '   3. A1', '2. B'];
    expect(indentSubtree(lines, 2).lines).toEqual(['1. A', '   3. A1', '   4. B']);
  });

  it('meldet die Verschiebung der Cursor-Spalte', () => {
    // `10. B` (Präfix 4) wird zu `   1. B` (Präfix 6).
    expect(indentSubtree(['1. A', '10. B'], 1).cursorShift).toBe(2);
  });
});

describe('outdentSubtree', () => {
  it('rückt den Punkt samt Teilbaum aus und nummeriert beide Ebenen neu', () => {
    const lines = ['1. A', '  1. A1', '  2. A2'];
    expect(outdentSubtree(lines, 1).lines).toEqual(['1. A', '2. A1', '  1. A2']);
  });

  it('macht nachfolgende Geschwister zu Unterpunkten', () => {
    const lines = ['  - A', '  - B'];
    expect(outdentSubtree(lines, 0).lines).toEqual(['- A', '  - B']);
  });

  it('ist auf Ebene 0 wirkungslos', () => {
    expect(outdentSubtree(BEISPIEL, 0)).toBeNull();
  });

  // 4T-000661 (Befund des Product Owners): Beim Ausruecken bleiben die
  // ehemaligen Geschwister als eigene Teilliste direkt unter dem verschobenen
  // Punkt zurueck. Sie muss bei 1 beginnen, sonst zieht der Renderer die
  // Zeile als Fortsetzungstext in den Punkt darueber (einzeilige Darstellung).
  it('laesst die zurueckbleibende Teilliste bei 1 beginnen', () => {
    const lines = ['1. Alpha', '   1. Bravo', '   2. Charlie', '   3. Delta'];
    expect(outdentSubtree(lines, 2).lines).toEqual([
      '1. Alpha',
      '   1. Bravo',
      '2. Charlie',
      '   1. Delta',
    ]);
  });
});

describe('shiftLineRange (4T-000661)', () => {
  it('rueckt den markierten Bereich auf die Inhalts-Spalte des Vorgaengers ein', () => {
    const lines = ['1. Alpha', '2. Bravo', '3. Charlie'];
    expect(shiftLineRange(lines, 1, 2, +1).lines).toEqual([
      '1. Alpha',
      '   1. Bravo',
      '   2. Charlie',
    ]);
  });

  it('haelt die relative Struktur der Auswahl', () => {
    const lines = ['- A', '- B', '  - B1'];
    expect(shiftLineRange(lines, 1, 2, +1).lines).toEqual(['- A', '  - B', '    - B1']);
  });

  it('richtet sich nach der Breite des Eltern-Markers', () => {
    expect(shiftLineRange(['10. A', '11. B'], 1, 1, +1).lines).toEqual(['10. A', '    1. B']);
  });

  it('rueckt wieder auf die Ebene des Elternpunkts aus', () => {
    const lines = ['1. A', '   1. A1', '   2. A2'];
    expect(shiftLineRange(lines, 1, 2, -1).lines).toEqual(['1. A', '2. A1', '3. A2']);
  });

  it('ist ohne Listenzeile und auf Ebene 0 wirkungslos', () => {
    expect(shiftLineRange(['Text', 'Noch Text'], 0, 1, +1)).toBeNull();
    expect(shiftLineRange(['- A', '- B'], 0, 1, -1)).toBeNull();
  });
});

describe('renumberOrdered', () => {
  it('zählt je Ebene getrennt fortlaufend', () => {
    const lines = ['1. A', '  5. A1', '  9. A2', '7. B'];
    expect(renumberOrdered(lines, 0, 3)).toEqual(['1. A', '  5. A1', '  6. A2', '2. B']);
  });

  it('setzt an der Leerzeile zurück', () => {
    const lines = ['1. A', '2. B', '', '5. C', '9. D'];
    expect(renumberOrdered(lines, 0, 4)).toEqual(['1. A', '2. B', '', '5. C', '6. D']);
  });

  it('lässt ungeordnete Marker unangetastet', () => {
    const lines = ['- A', '- B', '- C'];
    expect(renumberOrdered(lines, 0, 2)).toEqual(lines);
  });

  it('beginnt nach einem Typwechsel auf derselben Ebene neu', () => {
    const lines = ['1. A', '- Zwischenpunkt', '4. B', '9. C'];
    expect(renumberOrdered(lines, 0, 3)).toEqual(['1. A', '- Zwischenpunkt', '4. B', '5. C']);
  });

  it('übernimmt vorgegebene Startnummern nur für die erste Teilliste je Ebene', () => {
    const lines = ['9. A', '10. B'];
    const starts = collectStartNumbers(['3. A', '4. B'], 0, 1);
    expect(renumberOrdered(lines, 0, 1, { startNumbers: starts })).toEqual(['3. A', '4. B']);
  });

  it('erhält den Trenner hinter dem Marker', () => {
    expect(renumberOrdered(['1.\tA', '9.\tB'], 0, 1)).toEqual(['1.\tA', '2.\tB']);
  });
});

describe('Code-Zeilen (opts.isCode)', () => {
  // Zeilen in einem Code-Block dürfen nicht als Listenpunkte gelten, auch
  // nicht nach einer Umordnung — die Maske wandert deshalb mit.
  const lines = ['- A', '  ```', '  - kein Punkt', '  ```', '- B'];
  const opts = { isCode: (i) => i >= 1 && i <= 3 };

  it('schließt Code-Zeilen aus der Struktur aus', () => {
    expect(subtreeRange(lines, 0, opts)).toEqual({ from: 0, to: 3 });
    expect(siblingRange(lines, 0, +1, opts)).toEqual({ from: 4, to: 4 });
  });

  it('nummeriert Code-Inhalte auch nach dem Verschieben nicht um', () => {
    const src = ['1. A', '  ```', '  3. kein Punkt', '  ```', '2. B'];
    const result = moveSubtree(src, 0, +1, opts);
    expect(result.lines).toEqual(['1. B', '2. A', '  ```', '  3. kein Punkt', '  ```']);
  });
});
