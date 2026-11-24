// 4T-002829 (Epic 3E-000446): Lauf über den Baum einer Bereichs-Wurzel und die
// Pfad-Regeln der gemeinsamen Bereichs-Beobachtung (bereichs-beobachtung.js).
//
// Rein und Electron-frei: Alles hier urteilt am Pfad oder liest den Baum
// asynchron, ohne eine Überwachung einzurichten. Herausgeschnitten aus dem
// Beobachter nach Fachlichkeit, weil dessen Datei sonst das Budget der
// Datei-Größen überschritte.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const { isIgnoredDirName } = require('../index/scan.js');

// Die Pause nach einem Abgleich ist mindestens dieses Vielfache seiner Dauer
// (Auflage 1 der Plan-Freigabe vom 2026-11-23): Die Last eines Bereichs bleibt
// so unter rund zehn Prozent, gleich wie groß er ist und wie langsam das Netz.
const LAST_FAKTOR = 10;
// Höchstzahl gleichzeitiger Datei-Abfragen eines Laufs.
const PARALLEL = 4;

// Relativer Pfad als Teile; leer für die Wurzel, null außerhalb.
function teileVon(wurzel, p) {
  const rel = path.relative(wurzel, p);
  if (!rel) return [];
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(/[\\/]/);
}

/**
 * Liegt der Pfad unter der Wurzel in einem ausgeschlossenen Teil (ein
 * Pfad-Teil mit `isIgnoredDirName`)? Allein am Pfad, ohne Datei-Aufruf.
 *
 * @param {string} wurzel Wurzel.
 * @param {string} p Absoluter Pfad.
 * @returns {boolean} true, wenn ausgeschlossen.
 */
function istAusgeschlossen(wurzel, p) {
  const teile = teileVon(wurzel, p);
  return !!teile && teile.some((teil) => isIgnoredDirName(teil));
}

// Der oberste ausgeschlossene Pfad über `p` (z. B. `<wurzel>/.git`).
function ausgeschlossenerTeilbaum(wurzel, teile) {
  const i = teile.findIndex((teil) => isIgnoredDirName(teil));
  return path.join(wurzel, ...teile.slice(0, i + 1));
}

// Tiefe eines Pfades unter der Wurzel in der Zählung des Index-Laufs
// (src/main/index/scan.js): Einträge direkt in der Wurzel haben Tiefe 0.
function tiefeVon(wurzel, p) {
  const teile = teileVon(wurzel, p);
  return teile ? teile.length - 1 : -1;
}

/**
 * Abstand bis zum nächsten Abgleich: mindestens `mindestens`, mindestens das
 * LAST_FAKTOR-fache der Dauer des letzten Laufs (Auflage 1).
 *
 * @param {number} mindestens Kleinster Abstand in ms.
 * @param {number} dauerMs Dauer des letzten Laufs in ms.
 * @returns {number} Abstand in ms.
 */
function naechsterAbstand(mindestens, dauerMs) {
  return Math.max(mindestens, LAST_FAKTOR * Math.max(0, dauerMs || 0));
}

// Liest den Baum unter `start` in `abbild` und zählt jede Abfrage in
// `zaehler.abfragen`; nicht lesbare Unterordner kommen in `unlesbar`. Ausgeschlossene Namen und alles
// darunter fehlen, ebenso alles unter der Tiefen-Grenze; symbolischen
// Verknüpfungen wird nicht gefolgt. Ein nicht lesbarer Unterordner wird
// übergangen; ist `start` selbst nicht lesbar, wirft der Lauf.
// Fehler-Codes, nach denen ein Pfad als fehlend oder nicht mehr zugänglich
// gilt. Jeder andere Fehler (Netz unterbrochen, Zeitüberschreitung, belegt)
// macht ihn nur «unbekannt»: Seine Einträge bleiben stehen, bis eine spätere
// Abfrage Klarheit bringt (Sicherheits-Review und Zweitblick, Runde 2).
const FEHLT_CODES = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM']);

// Ergebnis einer Datei-Abfrage, deren Fehler nichts über den Pfad sagt.
const UNBEKANNT = Symbol('unbekannt');

function fehltWirklich(err) {
  return !!err && FEHLT_CODES.has(err.code);
}

/**
 * Baut eine Grenze für gleichzeitige Aufgaben. Ein frei werdender Platz geht
 * unmittelbar an den nächsten Wartenden über, statt erst frei zu werden:
 * Ein neu Ankommender kann sich so nicht dazwischen schieben, und die Zahl
 * gleichzeitiger Aufgaben überschreitet `hoechst` nie (Zweitblick, Runde 2).
 *
 * @param {number} hoechst Höchstzahl gleichzeitiger Aufgaben.
 * @returns {(aufgabe: () => Promise<any>) => Promise<any>} Ausführer.
 */
function neueGrenze(hoechst) {
  let laufend = 0;
  const warten = [];
  return async (aufgabe) => {
    if (laufend >= hoechst) await new Promise((weiter) => warten.push(weiter));
    else laufend++;
    try {
      return await aufgabe();
    } finally {
      const naechste = warten.shift();
      if (naechste) naechste();
      else laufend--;
    }
  };
}

async function leseBaum({
  wurzel,
  start,
  abbild,
  maxTiefe,
  zaehler,
  beiOrdner,
  abgebrochen,
  unlesbar,
  grenze,
}) {
  // Eine Grenze für alle Abfragen des Laufs, Ordner wie Dateien; ohne
  // Vorgabe des Aufrufers höchstens PARALLEL zugleich.
  const ausfuehren = grenze || neueGrenze(PARALLEL);
  let ebene = [start];
  while (ebene.length > 0 && !abgebrochen()) {
    const naechste = [];
    await Promise.all(
      ebene.map(async (dir) => {
        let eintraege;
        try {
          eintraege = await ausfuehren(() => {
            zaehler.abfragen++;
            return fsp.readdir(dir, { withFileTypes: true });
          });
        } catch (err) {
          if (dir === start) throw err;
          // Ein vorübergehend nicht lesbarer Unterordner ist «unbekannt»,
          // nicht «leer»: Wer `unlesbar` mitgibt (der vollständige Abgleich),
          // lässt die bisherigen Einträge darunter stehen. Fehlt er oder ist
          // er nicht mehr zugänglich, gilt er als entfernt.
          if (unlesbar && !fehltWirklich(err)) unlesbar.add(dir);
          return;
        }
        const dateien = [];
        for (const e of eintraege) {
          if (isIgnoredDirName(e.name)) continue;
          const voll = path.join(dir, e.name);
          const tiefe = tiefeVon(wurzel, voll);
          if (tiefe > maxTiefe) continue;
          if (e.isDirectory()) {
            abbild.set(voll, { ordner: true, groesse: 0, mtimeMs: 0 });
            if (beiOrdner) beiOrdner(voll);
            if (tiefe < maxTiefe) naechste.push(voll);
          } else {
            dateien.push(voll);
          }
        }
        await Promise.all(
          dateien.map((datei) =>
            ausfuehren(async () => {
              zaehler.abfragen++;
              try {
                const st = await fsp.lstat(datei);
                abbild.set(datei, { ordner: false, groesse: st.size, mtimeMs: st.mtimeMs });
              } catch (err) {
                // Verschwunden: fehlt im Abbild. Vorübergehend nicht abfragbar:
                // unbekannt, wie ein nicht lesbarer Ordner.
                if (unlesbar && !fehltWirklich(err)) unlesbar.add(datei);
              }
            }),
          ),
        );
      }),
    );
    ebene = naechste;
  }
}

function schliesseStill(w) {
  if (!w) return;
  try {
    w.close();
  } catch {
    /* bereits geschlossen */
  }
}

module.exports = {
  teileVon,
  istAusgeschlossen,
  ausgeschlossenerTeilbaum,
  tiefeVon,
  naechsterAbstand,
  leseBaum,
  neueGrenze,
  fehltWirklich,
  UNBEKANNT,
  schliesseStill,
  LAST_FAKTOR,
  PARALLEL,
};
