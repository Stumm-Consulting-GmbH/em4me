// 4T-001423 (Epic 3E-000176): Prüfbarer Kern der Block-Anker-Dekoration im
// Live-Modus. Die Entscheidung, WELCHER Teil einer Zeile durch den Indikator
// ersetzt wird, steht hier als reine Funktion auf Strings — der Pass daneben
// setzt sie nur noch in Decorations um.
//
// Die Anker-Erkennung selbst kommt aus src/shared/block-anchors.js und wird
// hier bewusst NICHT nachgebaut: Anzeige, Backlinks-Index und das Panel
// «Block-Eigenschaften» müssen dieselben Anker sehen, sonst zeigt der Editor
// einen Anker, den der Index nicht kennt (oder umgekehrt).
'use strict';

import { BLOCK_ANCHOR_RE } from '../../../shared/block-anchors.js';

// Ermittelt den zu ersetzenden Bereich des Block-Ankers einer Zeile.
//
// Rückgabe: { von, bis, id } mit Offsets relativ zum Zeilenanfang, oder null,
// wenn die Zeile keinen Anker trägt.
//
// `von` schließt den Leerraum VOR dem Dach-Zeichen mit ein, sofern einer da
// ist. Sonst stünde der Indikator einmal mit Quelltext-Leerzeichen plus
// CSS-Rand und einmal nur mit CSS-Rand — je nachdem, ob der Anker hinter Text
// oder allein in der Zeile steht. So ist der Abstand in beiden Fällen derselbe
// und wird an einer Stelle gepflegt, im CSS. `bis` ist das Zeilenende
// einschließlich des abschließenden Leerraums, den die Regex ohnehin zum
// Konstrukt zählt.
export function blockAnkerInZeile(zeilenText) {
  const text = String(zeilenText ?? '');
  const treffer = text.match(BLOCK_ANCHOR_RE);
  if (!treffer) return null;
  if (!treffer[0].includes('^')) return null;
  return { von: treffer.index, bis: text.length, id: treffer[1] };
}
