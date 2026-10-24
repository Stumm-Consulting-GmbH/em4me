// 4T-002047 (Epic 3E-000345): Die Teil-Dateien eines geteilten Dokuments im
// Index des Hauptprozesses. Ein Thema: welche Datei zu welcher Kopf-Datei
// gehört und was daraus für die überlagerte Sicht folgt.
//
// Ein Dokument jenseits der Größen-Schwelle liegt in mehreren Teil-Dateien,
// die die Anwendung als **ein** Dokument führt (Namensform und Erkennung in
// `src/shared/document-parts.js`). Der Index erfasst jede Teil-Datei für sich;
// der Editor öffnet das Dokument dagegen zusammengesetzt unter dem Pfad der
// Kopf-Datei, und genau dort meldet er seinen ungespeicherten Stand an die
// Puffer-Schicht.
//
// **Warum ein eigenes Modul.** Beide Funktionen lagen bis 4T-002047 in
// `datensatz-erfassung.js`, weil der Fehler zuerst am Datensatz-Bestand
// auffiel (4T-002046). Sie gelten aber für jedes geteilte Dokument und jeden
// Bestand der Sicht; in der Datensatz-Fachlichkeit hätte die Puffer-Schicht für
// Aufgaben, Tags und Anker aus einem Datenbank-Modul lesen müssen. Die
// Datensatz-Erfassung, der Index-Aufbau und der Datensatz-Zugriff lesen
// `kopfDateiFuer` seither von hier.

'use strict';

const path = require('node:path');
const { PART_SEP, isPartBasename, baseBasenameOf } = require('../../shared/document-parts.js');
const { pathCompareKey } = require('../../shared/platform.js');

/**
 * Pfad der Kopf-Datei zu einem Folge-Segment, allein aus dem Dateinamen.
 *
 * Ohne Datei-Zugriff und ohne Frontmatter — das ist der Zweck des eigenen
 * Trennzeichens der Namensform. Liefert `null` für jede Datei, die kein
 * Folgeteil ist.
 */
function kopfDateiFuer(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  // Die Namensform kennt keine Endung (`parsePartBasename` prüft die fünf
  // Ziffern bis zum Namens-Ende); zerlegt wird deshalb wie in `rename.js`.
  const teile = path.parse(filePath);
  if (!isPartBasename(teile.name)) return null;
  return path.join(teile.dir, baseBasenameOf(teile.name) + teile.ext);
}

// Vergleichs-Schlüssel eines Pfades: Trenner vereinheitlicht, NFC wie die
// Datei-Schlüssel des Index, Schreibung nach dem Dateisystem.
function pfadSchluessel(p) {
  return pathCompareKey(path.normalize(String(p).normalize('NFC')));
}

/**
 * Ein Bestand der überlagerten Sicht ohne die verdeckten Folge-Dateien.
 *
 * 4T-002046 (Epic 3E-000258) für den Datensatz-Bestand, 4T-002047 für alle
 * acht Bestände der Sicht: Ein geöffnetes geteiltes Dokument liegt in der
 * Puffer-Schicht als **ein** zusammengesetzter Text unter dem Pfad der
 * Kopf-Datei; eine Folge-Datei hat nie einen eigenen Puffer. Dieser Text trägt
 * die Einträge aller Teile. Die Folge-Dateien der Platte stehen in der Sicht
 * trotzdem daneben, und ohne diese Hülle führte die Sicht jeden Eintrag eines
 * Folgeteils doppelt: Aufgaben, Tags, Treffer und Anker zweimal, ein im Puffer
 * gelöschter Eintrag über die Platte weiter sichtbar.
 *
 * Regel: Liegt für eine Kopf-Datei ein Puffer vor, ist er das ganze Dokument,
 * und ihre Folge-Dateien führen in der überlagerten Sicht keine Einträge. Der
 * Schlüssel bleibt stehen, nur sein Bestand ist leer; ein Schlüssel, den der
 * Bestand nicht führt, bleibt abwesend. Die Platten-Schicht selbst bleibt
 * unberührt. Gerechnet wird erst beim Zugriff, damit eine Sicht, deren Bestand
 * niemand liest, nichts kostet; ein Pfad ohne das Trennzeichen der Namensform
 * kostet dabei nur einen Zeichen-Vergleich.
 *
 * @param {object} bestand Map-artige Sicht eines Bestands (Platte mit Puffer).
 * @param {Iterable<string>} pufferPfade Pfade mit ungespeichertem Stand.
 * @param {() => *} [leer] Liefert den leeren Wert des Bestands, je Zugriff neu,
 *   damit kein Verbraucher einen geteilten Wert verändern kann; ohne Angabe die
 *   leere Liste.
 * @returns {object} Map-artige Sicht mit `get`, `has`, `size`, `keys` und Iterator.
 */
function ohneVerdeckteFolgeteile(bestand, pufferPfade, leer = () => []) {
  const koepfe = new Set();
  for (const p of pufferPfade || []) {
    if (typeof p === 'string' && p && !kopfDateiFuer(p)) koepfe.add(pfadSchluessel(p));
  }
  if (koepfe.size === 0) return bestand;
  const verdeckt = (p) => {
    if (typeof p !== 'string' || !p.includes(PART_SEP)) return false;
    const kopf = kopfDateiFuer(p);
    return kopf !== null && koepfe.has(pfadSchluessel(kopf));
  };
  return {
    get: (k) => (verdeckt(k) && bestand.has(k) ? leer() : bestand.get(k)),
    has: (k) => bestand.has(k),
    get size() {
      return bestand.size;
    },
    keys: () => bestand.keys(),
    *[Symbol.iterator]() {
      for (const [k, v] of bestand) yield [k, verdeckt(k) ? leer() : v];
    },
  };
}

module.exports = {
  kopfDateiFuer,
  ohneVerdeckteFolgeteile,
};
