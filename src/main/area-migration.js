// 4T-0352 (Epic 3E-0064): Stille Einmal-Migration der Bereichsdatei von der
// Alt-Endung .mddb auf .mdda ("Markdown Data Area"). Die IO-Operationen
// (Lesen, Umbenennen) kommen als injizierte deps herein, damit die vier Fälle
// (mdda vorhanden, nur mddb, beide, Umbenennen-Fehlschlag) unit-testbar
// bleiben; main.js reicht die echten fs-Funktionen und markSelfWriting hinein.
'use strict';

// Liest den rohen Inhalt der Bereichsdatei und migriert dabei einmalig eine
// vorhandene Alt-Datei:
//   1. Existiert .mdda, wird ihr Inhalt zurückgegeben (kein Eingriff).
//   2. Sonst wird .mddb gesucht; fehlt auch sie, ist das Ergebnis undefined.
//   3. Existiert nur .mddb, wird sie auf .mdda umbenannt (markSelfWriting
//      schützt die neue Datei vor dem eigenen Watcher-Event) und ihr Inhalt
//      zurückgegeben. Schlägt das Umbenennen fehl (Sperre), wird der Inhalt
//      trotzdem zurückgegeben und beim nächsten Öffnen erneut migriert.
// Existieren beide, gewinnt .mdda und die .mddb bleibt unangetastet liegen
// (kein Lösch-Automatismus an Nutzer-Dateien).
async function readAreaSettingsRaw({ mddaPath, mddbPath, readFile, rename, markSelfWriting, log }) {
  const out = log || console;
  try {
    return await readFile(mddaPath);
  } catch {
    // .mdda fehlt: Migration aus der Alt-Datei versuchen.
  }
  let legacyRaw;
  try {
    legacyRaw = await readFile(mddbPath);
  } catch {
    return undefined; // weder .mdda noch .mddb vorhanden
  }
  try {
    if (typeof markSelfWriting === 'function') markSelfWriting(mddaPath, legacyRaw);
    await rename(mddbPath, mddaPath);
    out.log(`[3E-0064] Bereichsdatei migriert: ${mddbPath} -> ${mddaPath}`);
  } catch (err) {
    out.warn(
      `[3E-0064] Migration der Bereichsdatei fehlgeschlagen (${
        err && err.message ? err.message : err
      }); lese .mddb weiter.`,
    );
  }
  return legacyRaw;
}

module.exports = { readAreaSettingsRaw };
