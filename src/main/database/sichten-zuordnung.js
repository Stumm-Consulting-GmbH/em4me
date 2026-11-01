// 4T-002407 (Epic 3E-000266, F6 A): Die Sichten einer Tabelle, ihren
// Abfrage-Dateien zugeordnet.
//
// Die Tabellen-Definition nennt mit `views` Abfrage-Dateien beim Namen oder
// Pfad (`table-definition.js`, `leseSichten`); ob es eine Datei dieses Namens
// gibt und ob sie eine Abfrage-Datei ist, weiß allein der Katalog, der alle
// Dateien der Datenbank kennt. Hier geschieht die Zuordnung, als reine
// Funktion über das, was der Katalog ohnehin gelesen hat; das Katalog-Modul
// selbst wächst damit nur um den Aufruf.
//
// **Verglichen wird wie bei `form`** (`trifftMaskenAngabe` im Katalog): der
// Datei-Name ohne Endung, auch mit Ordnern davor, ohne Rücksicht auf die
// Schreibung. Die Vergleichs-Funktion wird hereingereicht, weil sie im Katalog
// steht und ein Import in diese Richtung einen Kreis schlösse.
//
// **Gemeldet, nie still ausgelassen** (E22 in der weichen Ausprägung): Eine
// Sicht ohne Datei trägt `viewDateiUnbekannt`, eine Sicht, deren Datei keine
// Abfrage-Datei ist, `viewKeineAbfrage`. Beide bleiben in der Liste, mit `path`
// null, damit die Einblendung an ihrer Stelle die Meldung zeigen kann.
//
// Electron-frei und ohne Dateizugriff.
'use strict';

const { baueHinweis } = require('../../shared/database/table-hinweise.js');

/**
 * Ordnet die Sichten einer Tabelle ihren Abfrage-Dateien zu.
 *
 * @param {object} p Parameter.
 * @param {string[]|undefined} p.views Die Angabe `views` der Definition.
 * @param {Array<{name: string, path: string}>} p.abfragen Die Abfrage-Dateien
 *   der Sicht (`abfrageDateien` im Katalog).
 * @param {Iterable<string>|null} [p.dateien] Alle Dateien der Index-Sicht; ohne
 *   sie ist «keine Abfrage-Datei» von «keine Datei» nicht zu unterscheiden, und
 *   es gilt das Zweite.
 * @param {(pfad: string, angabe: string) => boolean} p.trifft Vergleich eines
 *   Pfads mit einer Angabe.
 * @returns {{sichten: Array<{name: string, path: string|null}>, hints: object[]}}
 *   `name` ist die geschriebene Angabe, `path` der Pfad der Abfrage-Datei.
 */
function ordneSichtenZu({ views, abfragen, dateien = null, trifft }) {
  const sichten = [];
  const hints = [];
  if (!Array.isArray(views)) return { sichten, hints };
  // Einmal in eine Liste, weil ein Iterator nach der ersten Sicht erschöpft wäre.
  const alle = dateien ? [...dateien] : [];
  for (const angabe of views) {
    const abfrage = (abfragen || []).find((a) => trifft(a.path, angabe));
    if (abfrage) {
      sichten.push({ name: angabe, path: abfrage.path });
      continue;
    }
    sichten.push({ name: angabe, path: null });
    const andere = alle.some((pfad) => trifft(pfad, angabe));
    hints.push(baueHinweis(andere ? 'viewKeineAbfrage' : 'viewDateiUnbekannt', -1, angabe));
  }
  return { sichten, hints };
}

module.exports = { ordneSichtenZu };
