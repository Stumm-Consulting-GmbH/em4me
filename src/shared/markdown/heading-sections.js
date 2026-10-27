// 4T-002347 (Epic 3E-000184): Die eine Abschnitts-Regel «Überschrift bis zur
// nächsten Überschrift gleichen oder höheren Rangs».
//
// **Warum sie hier steht.** Bis dahin lag die Regel allein im Hauptprozess, im
// Anker-Auszug der Einbettungen (`src/main/index/embed.js`, mit `HEADING_RE`
// aus `src/main/index/parse.js`). Die Quelle `from-section` der Workflows
// braucht dieselbe Regel im prozess-neutralen Format-Kern, und
// `![[Datei#Abschnitt]]` und `from-section "Abschnitt"` sollen denselben
// Abschnitt finden. Eine zweite Fassung im Kern wäre genau die Kopie, gegen die
// die Entwicklungsrichtlinien («Erkennungen haben eine Heimat») stehen; deshalb
// lesen Einbettung, Index und Kern die Regel von hier.
//
// **Verhaltensgleich ausgezogen:** Beide regulären Ausdrücke und beide
// Schleifen sind Zeichen für Zeichen die des Anker-Auszugs. Der Anfang eines
// Abschnitts ist eine Zeile nach `HEADING_RE`, sein Ende die nächste Zeile nach
// `HEADING_END_RE` mit gleichem oder höherem Rang; Code-Blöcke werden nach der
// Zaun-Regel (`fence-level.js`) übersprungen, weil eine Überschrift im Beispiel
// keine ist. Die Überschriften-Zeile gehört zum Bereich; wer nur den Rumpf
// will, beginnt eine Zeile später.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { schliesstZaun, zaunOeffnung } = require('./fence-level.js');
const { githubLikeSlug } = require('./slug.js');

// Eine ATX-Überschrift mit ihrem Text in Gruppe 1 (ohne schließende Rauten).
const HEADING_RE = /^#{1,6}\s+(.+?)(?:\s+#{1,6})?\s*$/;
// Die Ende-Prüfung des Anker-Auszugs: Rang in Gruppe 1, Text beliebig.
const HEADING_END_RE = /^(#{1,6})\s+/;
const HEADING_LEVEL_RE = /^(#{1,6})/;

function rangVon(zeile) {
  return (zeile.match(HEADING_LEVEL_RE) || ['', ''])[1].length;
}

// Index der Zeile, an der der Abschnitt ab `start` mit Rang `rang` endet
// (exklusiv), oder `lines.length`. Eine Überschrift in einem Code-Block beendet
// ihn nicht.
function abschnittsEnde(lines, start, rang) {
  let offen = null;
  for (let i = start + 1; i < lines.length; i++) {
    if (offen) {
      if (schliesstZaun(lines[i], offen)) offen = null;
      continue;
    }
    offen = zaunOeffnung(lines[i]);
    if (offen) continue;
    const m = lines[i].match(HEADING_END_RE);
    if (m && m[1].length <= rang) return i;
  }
  return lines.length;
}

/**
 * Alle Überschriften außerhalb von Code-Blöcken mit ihrem Abschnitt.
 *
 * @param {string[]} lines Zeilen des Textes (ohne Zeilenende-Zeichen).
 * @param {number} [from=0] erste zu betrachtende Zeile (etwa nach dem Dateikopf).
 * @returns {{text: string, slug: string, level: number, start: number, end: number}[]}
 *   `start` ist der Index der Überschriften-Zeile, `end` exklusiv.
 */
function headingSections(lines, from = 0) {
  const out = [];
  let offen = null;
  for (let i = from; i < lines.length; i++) {
    if (offen) {
      if (schliesstZaun(lines[i], offen)) offen = null;
      continue;
    }
    offen = zaunOeffnung(lines[i]);
    if (offen) continue;
    const m = lines[i].match(HEADING_RE);
    if (!m) continue;
    const level = rangVon(lines[i]);
    out.push({ text: m[1], slug: githubLikeSlug(m[1]), level, start: i, end: 0 });
  }
  for (const s of out) s.end = abschnittsEnde(lines, s.start, s.level);
  return out;
}

/**
 * Der erste Abschnitt, dessen Überschrift die gesuchte Kennung trägt.
 *
 * @param {string[]} lines Zeilen des Textes.
 * @param {string} wantedSlug Kennung nach `githubLikeSlug`.
 * @returns {{start: number, end: number, level: number}|null}
 */
function findHeadingSection(lines, wantedSlug) {
  let offen = null;
  for (let i = 0; i < lines.length; i++) {
    if (offen) {
      if (schliesstZaun(lines[i], offen)) offen = null;
      continue;
    }
    offen = zaunOeffnung(lines[i]);
    if (offen) continue;
    const m = lines[i].match(HEADING_RE);
    if (m && githubLikeSlug(m[1]) === wantedSlug) {
      const level = rangVon(lines[i]);
      return { start: i, end: abschnittsEnde(lines, i, level), level };
    }
  }
  return null;
}

module.exports = { HEADING_RE, headingSections, findHeadingSection };
