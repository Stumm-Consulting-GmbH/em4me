// 4T-002343 (Epic 3E-000365, Story 4S-001099): Zaun-Zustände der
// Listen-Bearbeitung.
//
// Ein eingerückter Code-Block unter einem Listenpunkt reicht von seiner
// öffnenden bis zu seiner schließenden Zaun-Zeile. Eine Leerzeile darin ist
// Inhalt des Blocks und keine Grenze der Liste, und eine Zeile darin, die wie
// ein Listenpunkt aussieht, ist keiner. Der Listen-Rechenkern (list-outline.js,
// Teilbaum-Mitnahme und Neu-Nummerierung) und die selbsttätige Nummerierung
// des Editors (editor-list-tools.js) lesen diese Grenze von hier, damit beide
// dieselbe ziehen. Bis dahin endete die Liste für beide an jeder Leerzeile,
// auch im Code-Block.
//
// **Die Regeln** stammen aus der Code-Block-Mitnahme ohne Erweiterung
// (carryFencedBody in editor-keymaps.js, 4T-002326), die sie seit 4T-002343
// ebenfalls von hier liest:
// - Öffnend ist eine eingerückte Zeile (mindestens ein Leerraum-Zeichen), deren
//   Text hinter der Einrückung nach der Zaun-Regel aus fence-level.js einen
//   Zaun öffnet. Ein Zaun ohne Einrückung gehört zu keinem Listenpunkt; er
//   beendet die Liste ohnehin, und eine Leerzeile in ihm trennt wie bisher.
// - Schließend ist die erste spätere Zeile, die den Zaun nach derselben Regel
//   schließt. Die Suche überspringt Leerzeilen und endet an einer Zeile ohne
//   Einrückung und an einem Listenpunkt links der öffnenden Zaun-Zeile, weil
//   beide den Listenpunkt und damit den Block beenden.
// - Ohne schließende Zaun-Zeile gilt die Rand-Entscheidung aus 4T-002326: Der
//   Block endet an der nächsten Leerzeile, Zeile ohne Einrückung oder Zeile mit
//   Listenpunkt, die Leerzeile trennt wie bisher, und nichts wird markiert.
//
// Markiert wird ein geschlossener Block von der öffnenden bis zur
// schließenden Zaun-Zeile. Die Erkennung eines Listenpunkts reicht der
// Aufrufer als Prädikat herein (`istPunkt`), weil sie in list-outline.js
// wohnt und dieses Modul von dort eingebunden wird; sonst hinge es nur an
// fence-level.js.
'use strict';

const { zaunOeffnung, schliesstZaun } = require('./fence-level.js');

function einzug(text) {
  return /^[ \t]*/.exec(text)[0].length;
}

function leer(text) {
  return text.trim() === '';
}

// Öffnende Zaun-Zeile eines Listenpunkts samt ihrer Einrückung, sonst null.
function oeffnenderZaun(text) {
  const breite = einzug(text);
  if (breite === 0) return null;
  const oeffnung = zaunOeffnung(text.slice(breite));
  return oeffnung ? { oeffnung, breite } : null;
}

// Ende des Blocks, den die Zaun-Zeile `start` öffnet, gesucht bis `ende`:
// `schluss` ist die schließende Zaun-Zeile oder -1, `weiter` die erste Zeile
// hinter dem Block, an der die Suche nach dem nächsten Zaun weiterläuft.
function blockEnde(textAt, start, ende, zaun, istPunkt) {
  let rand = -1;
  for (let i = start + 1; i <= ende; i++) {
    const text = textAt(i);
    const breite = einzug(text);
    if (schliesstZaun(text.slice(breite), zaun.oeffnung)) return { schluss: i, weiter: i + 1 };
    if (leer(text)) {
      if (rand < 0) rand = i;
      continue;
    }
    const punkt = !!istPunkt(text);
    if (rand < 0 && (breite === 0 || punkt)) rand = i;
    if (breite === 0 || (punkt && breite < zaun.breite)) break;
  }
  return { schluss: -1, weiter: rand < 0 ? ende + 1 : rand };
}

// Setzt `maske[i - basis]` für jede Zeile eines geschlossenen Blocks in
// [von, bis].
function markiere(textAt, von, bis, istPunkt, maske, basis) {
  let i = von;
  while (i <= bis) {
    const zaun = oeffnenderZaun(textAt(i));
    if (!zaun) {
      i++;
      continue;
    }
    const { schluss, weiter } = blockEnde(textAt, i, bis, zaun, istPunkt);
    for (let j = i; j <= schluss; j++) maske[j - basis] = true;
    i = weiter;
  }
}

// Maske über `anzahl` Zeilen ab Index 0: true für jede Zeile eines
// geschlossenen Blocks. `textAt(i)` liefert den Text der Zeile i.
function zaunMaske(anzahl, textAt, istPunkt) {
  const maske = new Array(Math.max(0, anzahl)).fill(false);
  markiere(textAt, 0, anzahl - 1, istPunkt, maske, 0);
  return maske;
}

// Abfrage «liegt Zeile n in einem geschlossenen Block?» über einen großen
// Bestand (das Dokument im Editor), ohne ihn ganz zu lesen. Gelesen wird das
// Fenster um n zwischen den nächsten Zeilen ohne Einrückung, die nicht leer
// sind: Kein Block reicht über eine solche Zeile hinweg (sie beendet die
// Suche nach dem Schluss), also beginnt an ihr kein Block mitten im Fenster.
// Das zuletzt gelesene Fenster wird für die nächste Abfrage behalten.
function zaunAbfrage(textAt, erste, letzte, istPunkt) {
  const anker = (n) => {
    const text = textAt(n);
    return !leer(text) && einzug(text) === 0;
  };
  let fenster = null;
  return (n) => {
    if (n < erste || n > letzte) return false;
    if (!fenster || n < fenster.von || n > fenster.bis) {
      let von = n;
      while (von > erste && !anker(von)) von--;
      let bis = n;
      while (bis < letzte && !anker(bis + 1)) bis++;
      if (bis < letzte) bis++;
      const maske = new Array(bis - von + 1).fill(false);
      markiere(textAt, von, bis, istPunkt, maske, von);
      fenster = { von, bis, maske };
    }
    return fenster.maske[n - fenster.von];
  };
}

// `oeffnenderZaun` und `blockEnde` liest zusätzlich die Code-Block-Mitnahme
// ohne Erweiterung (carryFencedBody in editor-keymaps.js), damit die
// Rand-Regeln nur hier stehen.
module.exports = { zaunMaske, zaunAbfrage, oeffnenderZaun, blockEnde };
