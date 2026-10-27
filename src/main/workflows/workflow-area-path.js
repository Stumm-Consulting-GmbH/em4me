// 4T-002348 (Epic 3E-000184): Die Grenze der Bereichs-Wurzel für jeden Pfad
// eines Workflow-Schritts im Hauptprozess (AK3, Sicherheits-Grenze 1f).
//
// **Zweite Prüfung an der Vertrauens-Grenze.** Der Format-Kern prüft den Text
// eines Pfads vor dem ersten Schritt und nach dem Füllen der Platzhalter
// (`checkAreaPath`). Der Kanal nimmt den Schritt dennoch nicht ungeprüft an:
// Er prüft den Text erneut, löst ihn gegen die Wurzel des Bereichs auf, prüft
// das Ergebnis mit der einen Innerhalb-Prüfung der Anwendung (`isInsideArea`)
// und danach den echten Ort auf der Platte. Eine Verknüpfung oder ein
// Verzeichnis-Knoten innerhalb des Bereichs, der nach außen zeigt, ist am
// Text nicht zu erkennen; Pfad-Kanonisierung vor der Prüfung ist die
// anerkannte Abwehr gegen Pfad-Ausbrüche.
//
// Gemessen wird der tiefste VORHANDENE Vorfahre, weil das Ziel eines Schritts
// (`create`, `mkdir`, `move`) oft noch nicht existiert.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea } = require('../area/area-path');
const { checkAreaPath } = require('../../shared/workflows/workflow-paths.js');

// Echter Ort des tiefsten vorhandenen Vorfahren von `abs` (sich selbst eingeschlossen).
async function echterVorfahre(abs) {
  let probe = abs;
  for (;;) {
    try {
      return await fs.realpath(probe);
    } catch (err) {
      if (!err || (err.code !== 'ENOENT' && err.code !== 'ENOTDIR')) throw err;
      const hoeher = path.dirname(probe);
      if (hoeher === probe) throw err;
      probe = hoeher;
    }
  }
}

/**
 * Löst einen Schritt-Pfad gegen die Wurzel des Bereichs auf und prüft die Grenze.
 *
 * @param {string|null} rootPath Wurzel des Bereichs des startenden Fensters.
 * @param {string} relPath Pfad aus dem gefüllten Schritt, relativ und mit `/`.
 * @returns {Promise<{ok: true, abs: string}|{ok: false, code: string, detail: object}>}
 *   Codes: `noArea`, `invalidStep` (leerer Pfad), `outsideArea`.
 */
async function resolveAreaPath(rootPath, relPath) {
  if (typeof rootPath !== 'string' || rootPath === '') {
    return { ok: false, code: 'noArea', detail: {} };
  }
  const text = typeof relPath === 'string' ? relPath : '';
  const befund = checkAreaPath(text);
  if (befund) {
    const code = befund.code === 'pathEmpty' ? 'invalidStep' : 'outsideArea';
    return { ok: false, code, detail: { path: text } };
  }
  const wurzel = path.resolve(rootPath);
  const abs = path.resolve(wurzel, text);
  if (!isInsideArea(wurzel, abs)) return { ok: false, code: 'outsideArea', detail: { path: text } };
  let echteWurzel;
  let echterOrt;
  try {
    echteWurzel = await fs.realpath(wurzel);
    echterOrt = await echterVorfahre(abs);
  } catch (err) {
    return {
      ok: false,
      code: 'outsideArea',
      detail: { path: text, fsCode: err && err.code ? err.code : null },
    };
  }
  if (!isInsideArea(echteWurzel, echterOrt)) {
    return { ok: false, code: 'outsideArea', detail: { path: text } };
  }
  return { ok: true, abs };
}

module.exports = { resolveAreaPath };
