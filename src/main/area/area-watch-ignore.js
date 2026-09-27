// 4T-001787 (Epic 3E-000255, E9): Die Ignorier-Regel des Bereichs-Watchers,
// soweit sie den Sperr-Ordner betrifft — und der Nachzug seines Namens.
//
// **Warum der Watcher den Ordner ausschließen muss.** Er meldet
// Struktur-Ereignisse des Bereichs-Baums an das Bereichs-Panel. Jedes Nehmen und
// jedes Freigeben einer Sperre legt eine Datei an oder entfernt sie; ohne diesen
// Ausschluss ließe damit **jede** Sperre die Oberfläche neu aufbauen. Das ist
// kein Feinschliff, sondern Pflicht.
//
// **Warum nach dem Namen und nicht nach der Form.** Ein Ausschluss aller
// Punkt-Ordner nähme auch die übrigen Punkt-Ordner der Bereichs-Wurzel aus der
// Beobachtung, die das Bereichs-Panel heute zeigt, und änderte damit ein
// Verhalten, das nicht Gegenstand dieses Vorgangs ist.
//
// **Warum der Name am Eintrag hängt.** Der Watcher kann je
// Dateisystem-Ereignis keine Datei lesen. Er hält den wirksamen Namen deshalb an
// seinem Eintrag: beim Start mit dem Vorgabe-Namen belegt, sofort aus der
// Bereichs-Konfiguration nachgezogen und danach neu bezogen, sobald jemand die
// Datenbank-Konfiguration schreibt. Das kurze Fenster zwischen Start und
// Nachziehen ist unschädlich — ein Ereignis darin löst höchstens ein
// überflüssiges Neu-Lesen der Listen aus.
//
// Electron-frei und rein (unit-testbar), wie area-path.js daneben: Die Regel
// muss ohne laufenden Watcher prüfbar sein, sonst prüfte ein Testfall die
// Attrappe des Watchers statt der Regel.
'use strict';

const path = require('node:path');
const { pathCompareKey } = require('../../shared/platform.js');
const { isSamePath } = require('./area-path.js');

// Vergleichs-Schluessel eines Pfades: absolut aufgeloest, ohne
// Trailing-Separatoren, Schreibung nach Dateisystem-Eigenschaft. Dieselbe
// Behandlung wie in area-path.js, damit Watcher-Ausschluss und Bereichs-Grenze
// nicht nach verschiedenen Massstaeben entscheiden.
function vergleichsSchluessel(p) {
  const aufgeloest = path.resolve(p);
  const beschnitten = aufgeloest.replace(/[\\/]+$/, '');
  return pathCompareKey(beschnitten === '' ? aufgeloest : beschnitten);
}

/**
 * Liegt der Pfad im Sperr-Ordner der Bereichs-Wurzel oder ist er dieser Ordner?
 *
 * Geprüft wird **allein die oberste Ebene**: Ein gleichnamiger Ordner tiefer im
 * Baum ist ein Ordner des Anwenders und bleibt beobachtet.
 *
 * @param {string} rootPath Wurzelpfad des Bereichs.
 * @param {string} ordnerName Wirksamer Name des Sperr-Ordners.
 * @param {string} pfad Zu prüfender Pfad.
 * @returns {boolean} true, wenn der Pfad zum Sperr-Ordner gehört.
 */
function istImSperrOrdner(rootPath, ordnerName, pfad) {
  if (typeof rootPath !== 'string' || rootPath === '') return false;
  if (typeof ordnerName !== 'string' || ordnerName === '') return false;
  if (typeof pfad !== 'string' || pfad === '') return false;
  const ordner = vergleichsSchluessel(path.join(rootPath, ordnerName));
  const ziel = vergleichsSchluessel(pfad);
  return ziel === ordner || ziel.startsWith(ordner + path.sep);
}

/**
 * Baut die Ignorier-Regel eines Watcher-Eintrags.
 *
 * Der Name wird **bei jedem Ereignis** aus dem Eintrag gelesen und nicht in die
 * Funktion eingebacken; ein Namenswechsel wirkt damit ohne Neustart des
 * Watchers.
 *
 * @param {{rootPath: string, sperrOrdner: string}} eintrag Watcher-Eintrag.
 * @param {(p: string) => boolean} isMddPath Erkennung der Markdown-Data-Dateien.
 * @returns {(p: string) => boolean} Die Ignorier-Regel.
 */
function baueIgnorierRegel(eintrag, isMddPath) {
  if (typeof isMddPath !== 'function') {
    throw new TypeError('baueIgnorierRegel erwartet isMddPath als Funktion');
  }
  return (p) => isMddPath(p) || istImSperrOrdner(eintrag.rootPath, eintrag.sperrOrdner, p);
}

/**
 * Bezieht den wirksamen Namen des Sperr-Ordners für Watcher-Einträge neu.
 *
 * Ohne `rootPath` gilt der Nachzug für alle Einträge; mit ihm für die Einträge
 * genau dieses Bereichs. Ein Fehlschlag lässt den bisherigen Namen stehen: Eine
 * defekte oder unlesbare Bereichsdatei wirkt wie «nicht gesetzt», und der
 * Watcher weiterzubeobachten ist allemal besser, als ihn auf einen Namen
 * umzustellen, den niemand geliefert hat.
 *
 * @param {Iterable<{rootPath: string, sperrOrdner: string}>} eintraege Watcher-Einträge.
 * @param {(rootPath: string) => Promise<string>} leseWirksamenNamen Leser des wirksamen Namens.
 * @param {string} [rootPath] Beschränkung auf einen Bereich.
 * @returns {Promise<void>}
 */
async function beziehSperrOrdnerNeu(eintraege, leseWirksamenNamen, rootPath) {
  for (const eintrag of eintraege) {
    if (!eintrag || typeof eintrag.rootPath !== 'string') continue;
    if (rootPath && !isSamePath(eintrag.rootPath, rootPath)) continue;
    try {
      const name = await leseWirksamenNamen(eintrag.rootPath);
      if (typeof name === 'string' && name !== '') eintrag.sperrOrdner = name;
    } catch (err) {
      console.warn(
        '[area-watch] Name des Sperr-Ordners nicht bezogen:',
        eintrag.rootPath,
        err && err.message ? err.message : err,
      );
    }
  }
}

module.exports = { istImSperrOrdner, baueIgnorierRegel, beziehSperrOrdnerNeu };
