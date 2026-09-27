// 4T-001964 (Epic 3E-000254): Lesen am Zwischenspeicher des Netzwerk-Clients vorbei.
//
// Befund aus dem Zwei-Rechner-Lauf vom 2026-09-27 und dem Diagnose-Experiment
// desselben Tages (Protokoll im Vorgang): Ersetzt ein Rechner eine Datei auf
// einer Netz-Freigabe durch Umbenennen, liefert `fs.readFile` auf einem
// anderen Rechner, der die Datei kurz zuvor selbst geschrieben oder gelesen
// hat, noch den alten Inhalt, gemessen über mehr als fünfzehn Sekunden. Weder
// das vorherige Lesen der Metadaten noch das des Verzeichnisses hilft. Der
// Client beantwortet ein Öffnen nur zum Lesen aus seinem zwischengespeicherten
// Griff; ein Öffnen MIT Schreibrecht kann er daraus nicht bedienen und fragt
// die Gegenstelle. Genau diese Variante lieferte in sechzehn von sechzehn
// Durchgängen den frischen Stand.
//
// Wer unter einer Sperre liest, um danach zu schreiben, liest deshalb hier.
// Gelesen, nicht geschrieben: Der Griff wird mit `r+` geöffnet, aber nie
// beschrieben, und Inhalt, Zeitstempel und Größe der Datei bleiben unberührt.
//
// Rückfall auf das gewöhnliche Lesen, wo das Schreibrecht fehlt oder die Datei
// von einem anderen Programm gesperrt ist: Eine schreibgeschützte Datei ließe
// sich ohnehin nicht ersetzen, und ihr Lesen soll dieselbe Meldung ergeben wie
// bisher, statt an einer neuen Stelle zu scheitern. Eine fehlende Datei meldet
// sich unverändert mit `ENOENT`.
//
// 4T-001964, Nachtrag nach dem Diagnose-Lauf d4 vom 2026-09-27: Das frische
// Lesen genügt allein NICHT, wenn derselbe Rechner die Datei vorher schon mit
// Schreibrecht gelesen hat, wie es die Anwendung bei jedem Speichern tut. Dann
// hält sein Client auch diesen Griff samt Lease zurück und lieferte nach dem
// Ersetzen durch einen anderen Rechner in sieben von acht Durchgängen den alten
// Stand. Tragend ist deshalb das Öffnen der Zieldatei durch den Schreiber vor
// dem Umbenennen (`benenneUmMitWiederholung` in atomic-write.js), das die Lease
// entzieht. Das frische Lesen bleibt als Rückfall für Schreiber außerhalb der
// Anwendung, etwa eine Änderung von Hand oder ein anderes Werkzeug.
'use strict';

const fsPromises = require('node:fs/promises');

// Fehler beim Öffnen mit Schreibrecht, die nichts über die Lesbarkeit sagen.
const RUECKFALL = new Set(['EACCES', 'EPERM', 'EBUSY', 'EROFS', 'EISDIR']);

/**
 * Liest eine Datei so, dass der Zwischenspeicher des Netzwerk-Clients nicht
 * antworten kann.
 *
 * @param {string} pfad Pfad der Datei.
 * @param {string|object} [optionen] Wie bei `fs.promises.readFile`.
 * @param {object} [deps]
 * @param {object} [deps.fsp] Dateizugriff (`open`, `readFile`); für Prüffälle.
 * @returns {Promise<string|Buffer>}
 */
async function liesFrisch(pfad, optionen, deps = {}) {
  const fsp = deps.fsp || fsPromises;
  let griff;
  try {
    griff = await fsp.open(pfad, 'r+');
  } catch (err) {
    if (err && RUECKFALL.has(err.code)) return fsp.readFile(pfad, optionen);
    throw err;
  }
  try {
    return await griff.readFile(optionen);
  } finally {
    await griff.close();
  }
}

/**
 * Der Dateizugriff von `fs.promises`, dessen `readFile` frisch liest. Vorgabe
 * der Module, die unter einer Sperre lesen und danach schreiben.
 */
const frischerDateizugriff = Object.freeze({
  ...fsPromises,
  readFile: (pfad, optionen) => liesFrisch(pfad, optionen),
});

module.exports = { liesFrisch, frischerDateizugriff, RUECKFALL };
