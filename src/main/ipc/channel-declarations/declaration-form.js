// 4T-002648 (Epic 3E-000416): Schreib-Hilfen der Kanal-Erklärungen, die alle
// Teile unter diesem Ordner teilen. Sie liegen hier und nicht im Einstieg
// `src/main/ipc/channel-declarations.js`, weil der Einstieg die Teile lädt; ein
// Bezug der Teile auf den Einstieg wäre ein Import-Zyklus über die
// Ordner-Grenze (Wächter `scripts/lint-ordner-importe.js`).
//
// Electron-frei; eigener Zustand: keiner.
'use strict';

function paths(...params) {
  return { kind: 'paths', params };
}

// 4T-002650: Erklärung der Art `keys` (Kennung statt Pfad).
function keys(...params) {
  return { kind: 'keys', params };
}

// Ein Dokument des Anwenders: im Bereich oder als freigegebene einzelne Datei.
const DOC = ['area', 'file'];

module.exports = { paths, keys, DOC };
