// 4T-001986 (Epic 3E-000332): Wo beginnt ein Datensatz im Text einer Tabelle?
//
// Ein Verweis `[[Tabelle#^r-00042]]` gilt, sobald die Tabelle die Kennung
// führt (`anchorExistsInFile` in `src/main/index/resolve.js`). Der Sprung nach
// dem Öffnen braucht dazu die Zeile, und in der Live- und der Quellcode-Ansicht
// ist das die Zeile `|- id="r-00042"` im Datensatz-Block. Die Suche nach
// Überschrift und Block-Anker findet sie nicht, weil die Kennung dort als
// Angabe am Marker steht und nicht als `^r-00042` am Zeilenende.
//
// **Warum ein eigenes Modul und keine Suche im Anzeige-Prozess.** Die Zeile ist
// eine Datensatz-Zeile genau dann, wenn der Leser des Blocks sie so liest. Eine
// Kopie des Marker-Ausdrucks im Anzeige-Prozess wäre eine zweite Grammatik, die
// beim nächsten Ausbau der Angaben still auseinanderliefe. Dieses Modul nimmt
// deshalb Marker, Angaben-Grammatik, Zaun-Name und Zaun-Regel aus
// `record-block.js` und die Auskunft «dies ist eine Tabellen-Datei» aus
// `document-split-punkte.js`, der einen Quelle dieser Auskunft (4T-001550).
//
// **Der Text ist der Editor-Text des geöffneten Dokuments.** Eine geteilte
// Tabelle ist darin bereits aus allen Teilen zusammengesetzt
// (`assembleParts` in `src/shared/document-assembly.js`): Die Kopf-Datei öffnet
// den Zaun, die Folge-Teile tragen nur Datensatz-Zeilen, der letzte schließt
// ihn. Im zusammengesetzten Text ist das EIN Zaun, und die Datensätze der
// Folge-Dateien werden ohne eigene Regel gefunden.
//
// Prozess-neutral (kein Electron, kein DOM), wie die Nachbarn in diesem Ordner.
'use strict';

const {
  RECORD_FENCE,
  RECORD_MARKER,
  leseAngaben,
  zaunOeffnung,
  schliesstZaun,
} = require('./record-block.js');
const { istTabellenDatei } = require('../document-split-punkte.js');

/**
 * Die 1-basierte Nummer der Zeile, mit der der Datensatz `kennung` beginnt.
 *
 * Drei Bedingungen, alle aus der Gültigkeit des Verweises übernommen, damit
 * Sprung und Gültigkeit nie auseinanderlaufen:
 *
 *   1. Nur in einer Tabellen-Datei. Eine Datensatz-Zeile im Code-Beispiel eines
 *      gewöhnlichen Dokuments ist kein Anker und damit kein Sprung-Ziel.
 *   2. Nur im ERSTEN Zaun `perspective-records`, wie der Leser des Bestands
 *      (`kopfRumpf` in `record-segment.js`) ihn liest: Das Ablage-Format sieht
 *      je Tabelle genau einen Datensatz-Block vor, und die Kennung eines zweiten,
 *      von Hand erzeugten Blocks gilt auch für die Gültigkeit nicht. Ein nicht
 *      geschlossener Zaun reicht bis zum Textende.
 *   3. Die Kennung wird so verglichen, wie sie im Verweis steht, mit der
 *      aufgefüllten aus `leseAngaben` (derselbe Vergleich wie `kennungInTabelle`
 *      in `src/main/index/datensatz-zugriff.js`). Eine maskierte Zeile beginnt
 *      mit einem Rückstrich und ist damit von selbst keine Datensatz-Zeile.
 *
 * @param {string} text Der Text des Dokuments.
 * @param {string} kennung Die Kennung ohne das `^` des Ankers.
 * @returns {number} Zeilen-Nummer ab 1, oder 0, wenn es die Zeile nicht gibt.
 */
function findeDatensatzZeile(text, kennung) {
  const s = typeof text === 'string' ? text : '';
  const gesucht = String(kennung == null ? '' : kennung).trim();
  // Billige Vorprüfung zuerst: Der Regelfall ist ein Anker, der keine
  // Datensatz-Kennung ist, in einer Datei ohne Datensatz-Block.
  if (!s || !gesucht || !s.includes(RECORD_FENCE)) return 0;
  if (!istTabellenDatei(s)) return 0;

  const zeilen = s.split('\n');
  let offen = null;
  let imBlock = false;
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    if (offen === null) {
      offen = zaunOeffnung(zeile);
      imBlock = offen !== null && offen.sprache === RECORD_FENCE;
      continue;
    }
    if (schliesstZaun(zeile, offen)) {
      // Der erste Datensatz-Block ist zu Ende; ein weiterer zählt nicht.
      if (imBlock) return 0;
      offen = null;
      continue;
    }
    if (!imBlock || !zeile.startsWith(RECORD_MARKER)) continue;
    if (leseAngaben(zeile.slice(RECORD_MARKER.length)).id === gesucht) return i + 1;
  }
  return 0;
}

module.exports = { findeDatensatzZeile };
