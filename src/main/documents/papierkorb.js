// 4T-002389 (Epic 3E-000265, Schritt 4, F6 B): Eine Datei samt ihren
// Pflicht-Begleit-Dateien in den Papierkorb.
//
// **Ein Weg für zwei Aufrufer.** Das Bereichs-Panel (`area:trashFile` in
// `src/main/ipc/areas.js`) und das Löschen einer Karteikarte über die Datenbank
// (Klammer des Absichts-Protokolls und Wiederanlauf) verschieben dieselbe Art
// von Datei auf dieselbe Weise. Eine zweite Fassung der Reihenfolge wäre die
// Stelle, an der eine Beleg-Datei auf dem einen Weg mitginge und auf dem
// anderen liegen bliebe.
//
// **Reihenfolge:** zuerst die Datei, danach die Begleit-Dateien der Pflicht-Arten
// (`pflichtBegleitPfade`). Scheitert die Datei, wird nichts weiter angefasst;
// scheitert eine Begleit-Datei, ist die Datei bereits fort, und gemeldet wird
// beides über `companionLeft`. **Kein stiller Rückfall auf Löschen:** Wer keinen
// Papierkorb hat, bekommt den Fehler, nicht ein endgültiges Entfernen.
//
// **Electron-frei.** Der Aufruf des Papierkorbs (`shell.trashItem`) kommt als
// Naht herein, damit Prüfstand und Schreib-Schnittstelle ohne Electron laufen.
'use strict';

const path = require('node:path');

const { pflichtBegleitPfade } = require('./companion-files.js');

function fehlerText(err) {
  return err && err.message ? String(err.message) : String(err);
}

/**
 * Verschiebt eine Datei und ihre Pflicht-Begleit-Dateien in den Papierkorb.
 *
 * @param {string} dateiPfad Pfad der Datei.
 * @param {{trashItem: (pfad: string) => Promise<void>, warnen?: Function}} deps
 *   `trashItem` ist Pflicht (`shell.trashItem` im Betrieb); `warnen` erhält je
 *   liegen gebliebener Begleit-Datei Pfad und Grund.
 * @returns {Promise<{ok: true, path: string, companionLeft?: string[]}
 *   |{ok: false, error: string}>}
 */
async function verschiebeInPapierkorb(dateiPfad, deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  if (typeof d.trashItem !== 'function') return { ok: false, error: 'no trash' };
  const absolut = path.resolve(dateiPfad);
  try {
    await d.trashItem(absolut);
  } catch (err) {
    return { ok: false, error: fehlerText(err) };
  }
  const liegenGeblieben = [];
  for (const begleit of await pflichtBegleitPfade(absolut)) {
    try {
      await d.trashItem(begleit);
    } catch (err) {
      // Abgefederte Degradation und kein Fehlschlag des Ganzen: Die Datei ist
      // weg, die Begleit-Datei nicht. Gemeldet wird beides, an den Aufrufer
      // über den Rückgabewert und, wenn er es wünscht, ins Protokoll.
      if (typeof d.warnen === 'function') d.warnen(begleit, fehlerText(err));
      liegenGeblieben.push(begleit);
    }
  }
  if (liegenGeblieben.length > 0)
    return { ok: true, path: dateiPfad, companionLeft: liegenGeblieben };
  return { ok: true, path: dateiPfad };
}

module.exports = { verschiebeInPapierkorb };
