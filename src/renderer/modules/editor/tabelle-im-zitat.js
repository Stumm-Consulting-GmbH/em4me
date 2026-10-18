// 4T-002055 (Epic 3E-000360): Eine Pipe-Tabelle direkt unter einer Textzeile in
// einem Zitat oder einer Hinweis-Box ist im Syntax-Baum des Editors eine
// Tabelle, wie in der gerenderten Ansicht.
//
// **Warum eine Ergänzung der Tabellen-Erweiterung.** Die Tabellen-Erweiterung
// des Markdown-Parsers (`Table` aus `@lezer/markdown`) beendet einen Absatz,
// wenn die nächste Zeile eine Trennzeile ist; sie liest diese nächste Zeile
// aber samt ihrem Zitat-Präfix (`> |---|---|`), und die Trennzeilen-Regel
// erkennt sie dann nicht. Gemessen am 2026-10-11: In `> [!note] Hinweis`,
// gefolgt von `> | Posten | Wert |` und `> |---|---|`, entsteht kein
// Tabellen-Knoten, und der Live-Modus zeigt den Quelltext, während die
// gerenderte Ansicht (markdown-it) eine Tabelle zeigt. Steht eine Leerzeile
// `>` dazwischen, entsteht der Knoten. Diese Ergänzung stellt dieselbe Frage
// an der Zeile ohne ihr Präfix (Zitat-Präfix-Regel aus
// src/shared/block-anchors.js) und gilt nur in einem Zitat; außerhalb
// entscheidet die Tabellen-Erweiterung allein, wie bisher.
//
// Beendet sie den Absatz, liest die Tabellen-Erweiterung die Tabelle ab dieser
// Zeile selbst; die Zeilen danach tragen ihr Präfix dort nicht mehr im Text.
'use strict';

import {
  findUnescapedPipes,
  isSeparatorLine,
  parseTableCells,
} from '../../../shared/markdown/table-edit.js';
import { zitatPraefixWie, zitatTiefe } from '../../../shared/block-anchors.js';

// Beendet die Zeile `line` den Absatz `leaf`, weil mit ihr eine Tabelle in
// einem Zitat beginnt? Kopfzeile mit Strich, darunter die Trennzeile mit
// derselben Zahl an Zellen. Hat schon die erste Zeile des Absatzes einen
// Strich, liest die Tabellen-Erweiterung ihn selbst als Tabelle.
function beginntTabelleImZitat(cx, line, leaf) {
  const vorlage = line.text.slice(0, line.basePos);
  if (zitatTiefe(vorlage) === 0) return false;
  if (findUnescapedPipes(String(leaf.content).split('\n')[0]).length > 0) return false;
  const kopf = line.text.slice(line.basePos);
  if (findUnescapedPipes(kopf).length === 0) return false;
  const naechste = cx.peekLine();
  const trenn = naechste.slice(zitatPraefixWie(naechste, vorlage).length);
  if (!isSeparatorLine(trenn)) return false;
  const kopfZellen = parseTableCells(kopf);
  const trennZellen = parseTableCells(trenn);
  return !!kopfZellen && !!trennZellen && kopfZellen.length === trennZellen.length;
}

export const TabelleImZitat = {
  parseBlock: [
    {
      name: 'TabelleImZitat',
      endLeaf: beginntTabelleImZitat,
      before: 'SetextHeading',
    },
  ],
};
