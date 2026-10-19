// 4T-002295 (Epic 3E-000349): Die Kanäle des Bilder-Exports des Foliensatzes
// (Story 4S-001085). Schwester-Gruppe von presentation-export-pptx.js: Der
// Inhalt entsteht auch hier erst im Hauptprozess, über das Render-Fenster der
// Folien-Bilder (slide-images.js, 4T-002292), mit Abbruch beim Schließen des
// Absenders; geschrieben wird aber keine Datei, sondern ein Ordner mit einem
// PNG je Folie, nach der Ordner-Regel des HTML-Exports.
//
//   presentationImages:chooseFolder  Ordner-Wahl nach dem Muster von
//                             presentationHtml:chooseFolder (Vorgabe der
//                             Ordner des Dokuments, sonst das Home-
//                             Verzeichnis), mit eigenem Dialog-Titel.
//   presentationImages:export ein Auftrag mit gewähltem Ordner, vorgeschlagenem
//                             Unterordner und je Folie dem eigenständigen
//                             Dokument aus `baueFolienDokument`; der
//                             Hauptprozess erzeugt die Bilder und schreibt sie
//                             als `folie-001.png` … `folie-NNN.png`.
//
// **Ziel-Ordner** (Regel des HTML-Exports, presentation-export.js): Ist der
// gewählte Ordner leer, neu oder trägt er schon einen Bilder-Export
// (`folie-001.png`), entstehen die Bilder darin; sonst im Unterordner
// `<Name>-Folien`. Erkannt wird der frühere Export wie beim HTML-Export an
// seiner Kenn-Datei, nicht an der Ausschließlichkeit des Inhalts: Windows legt
// in Bilder-Ordnern auf Netz-Freigaben `Thumbs.db` und gelegentlich
// `desktop.ini` an, und ein zweiter Export liefe sonst in einen Unterordner.
//
// **Liegengebliebene Bilder:** Hat ein früherer Export in denselben Ordner mehr
// Folien geschrieben, bleiben dessen höher nummerierte Bilder liegen — wie die
// Seiten beim HTML-Export (Offener Punkt des Tasks, Frage des Produkt-
// Verhaltens an den Product Owner, falls sie sich in der Abnahme stellt).
//
// **Rückgabe:** `{ ok: true, ordner, bilder }` oder
// `{ ok: false, fehler: { folie, grund } }` — ohne Stacktrace und ohne
// Fehlertext des Systems, weil die Seite daraus eine Meldung in der Sprache
// des Anwenders baut. Die Gründe teilen ihre Texte mit dem PowerPoint-Export
// (`presentation.export.pptxGrund.<grund>`).
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { FOLIE_MAX_ZEICHEN } = require('../praesentation-fenster');
const { sichererOrdnerName } = require('./presentation-export');

/**
 * Gründe eines Fehlschlags; die ersten sechs stammen aus dem Render-Fenster,
 * die übrigen aus diesem Kanal. Ein Größen-Grund wie beim PowerPoint-Export
 * entfällt, weil kein Container entsteht.
 */
const BILDER_GRUENDE = Object.freeze([
  'zeitbudget',
  'abbruch',
  'laden',
  'aufnahme',
  'masse',
  'prozess',
  'eingabe',
  'schreiben',
  'unbekannt',
]);

/** Obergrenze der Folien je Auftrag, wie beim PowerPoint-Export. */
const MAX_FOLIEN = 2000;

/** Die Namen, die der Kanal schreibt (Muster der HTML-Seiten `folie-\d{3,}`). */
const BILD_NAME = /^folie-\d{3,}\.png$/;

/** Kenn-Datei eines früheren Bilder-Exports. */
const KENN_DATEI = 'folie-001.png';

/** Der Datei-Name des Bildes einer Folie (0-basiert): `folie-001.png` … */
function bildName(index) {
  return `folie-${String(index + 1).padStart(3, '0')}.png`;
}

function istPositiveGanzzahl(wert) {
  return Number.isInteger(wert) && wert > 0;
}

/**
 * Prüft den Auftrag der Seite.
 *
 * @param {unknown} auftrag
 * @returns {{zielOrdner: string, unterordner: string,
 *   folien: Array<{html: string, breite: number, hoehe: number}>}|null}
 */
function pruefeAuftrag(auftrag) {
  if (!auftrag || typeof auftrag !== 'object') return null;
  const { zielOrdner, unterordner, folien } = auftrag;
  if (typeof zielOrdner !== 'string' || !path.isAbsolute(zielOrdner)) return null;
  if (unterordner != null && typeof unterordner !== 'string') return null;
  if (!Array.isArray(folien) || folien.length === 0 || folien.length > MAX_FOLIEN) return null;
  const geprueft = [];
  for (const folie of folien) {
    if (!folie || typeof folie !== 'object') return null;
    const { html, breite, hoehe } = folie;
    if (typeof html !== 'string' || !html || html.length > FOLIE_MAX_ZEICHEN) return null;
    if (!istPositiveGanzzahl(breite) || !istPositiveGanzzahl(hoehe)) return null;
    geprueft.push({ html, breite, hoehe });
  }
  return { zielOrdner: path.resolve(zielOrdner), unterordner: unterordner || '', folien: geprueft };
}

/**
 * Der Ordner, in den die Bilder geschrieben werden.
 *
 * @param {string} gewaehlt Der gewählte Ordner.
 * @param {string} unterordner Der bereinigte Name für den Unterordner.
 * @param {{readdir: Function}} [dateisystem] für Tests.
 * @returns {Promise<string>}
 */
async function zielOrdnerBilder(gewaehlt, unterordner, dateisystem = fs) {
  let eintraege;
  try {
    eintraege = await dateisystem.readdir(gewaehlt);
  } catch (err) {
    if (err && err.code === 'ENOENT') return gewaehlt;
    throw err;
  }
  if (eintraege.length === 0) return gewaehlt;
  if (eintraege.includes(KENN_DATEI)) return gewaehlt;
  return path.join(gewaehlt, unterordner);
}

/**
 * Wandelt einen Fehler in die Angabe der Rückgabe.
 *
 * @param {unknown} fehler
 * @param {string} rueckfall Grund, wenn der Fehler keinen bekannten trägt.
 * @returns {{folie: number|null, grund: string}}
 */
function fehlerAngabe(fehler, rueckfall) {
  const roh = fehler && typeof fehler.grund === 'string' ? fehler.grund : null;
  const grund = BILDER_GRUENDE.includes(roh) ? roh : rueckfall;
  const folie = fehler && istPositiveGanzzahl(fehler.folie) ? fehler.folie : null;
  return { folie, grund };
}

/**
 * Registriert die Kanäle des Bilder-Exports.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {object} deps.app Electron-App-Objekt (Home-Verzeichnis).
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object, key: string) => string} deps.tForWindow Übersetzung im Fenster-Kontext.
 * @param {() => {erzeugeFolienBilder: Function}} deps.getFolienBilder Erzeuger der Bilder.
 * @param {object} [deps.logger] Vorgabe console.
 */
function registerPresentationBilderIpc(handle, deps) {
  const { app, dialog, senderWindow, tForWindow, getFolienBilder, logger = console } = deps;

  // Ordner-Wahl wie beim HTML-Export, mit eigenem Titel.
  handle('presentationImages:chooseFolder', async (event, params) => {
    const owner = senderWindow(event);
    const vorgabe =
      params && typeof params.suggestedDir === 'string' && params.suggestedDir
        ? params.suggestedDir
        : app.getPath('home');
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'presentation.export.bilderDialogTitel'),
      defaultPath: vorgabe,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: path.resolve(result.filePaths[0]) };
  });

  handle('presentationImages:export', async (event, auftrag) => {
    const geprueft = pruefeAuftrag(auftrag);
    if (!geprueft) {
      logger.warn('Bilder-Export: ungültiger Auftrag abgewiesen');
      return { ok: false, fehler: { folie: null, grund: 'eingabe' } };
    }
    const owner = senderWindow(event);
    if (!owner || owner.isDestroyed()) {
      return { ok: false, fehler: { folie: null, grund: 'abbruch' } };
    }
    // Schließt der Anwender das Fenster, aus dem der Export kam, endet der
    // Auftrag; das Render-Fenster räumt sich in jedem Ausgang selbst ab.
    const abbruch = new AbortController();
    const beiZu = () => abbruch.abort();
    owner.once('closed', beiZu);
    let bilder;
    try {
      bilder = await getFolienBilder().erzeugeFolienBilder({
        folien: geprueft.folien,
        abbruch: abbruch.signal,
      });
    } catch (fehler) {
      // Das Render-Fenster protokolliert seinen Fehler selbst.
      return { ok: false, fehler: fehlerAngabe(fehler, 'unbekannt') };
    } finally {
      owner.removeListener('closed', beiZu);
    }
    if (abbruch.signal.aborted) return { ok: false, fehler: { folie: null, grund: 'abbruch' } };
    // Erst nach den Bildern entsteht der Ordner: Ein Fehlschlag davor
    // hinterlässt keinen leeren Unterordner.
    let ziel = geprueft.zielOrdner;
    try {
      const name = sichererOrdnerName(
        geprueft.unterordner,
        tForWindow(owner, 'presentation.export.ordnerOhneName'),
      );
      ziel = await zielOrdnerBilder(geprueft.zielOrdner, name);
      await fs.mkdir(ziel, { recursive: true });
      for (let i = 0; i < bilder.length; i += 1) {
        await ersetzeDateiOderWirf(path.join(ziel, bildName(i)), bilder[i]);
      }
    } catch (fehler) {
      logger.error('Bilder-Export: Bilder nicht geschrieben:', ziel, fehler);
      return { ok: false, fehler: fehlerAngabe(fehler, 'schreiben') };
    }
    // Die Info-Zeile des Exports schreibt das Render-Fenster (Kapitel 4 der
    // Entwicklungsrichtlinien: eine Zeile je Export, nicht zwei).
    return { ok: true, ordner: ziel, bilder: bilder.length };
  });
}

module.exports = {
  registerPresentationBilderIpc,
  pruefeAuftrag,
  zielOrdnerBilder,
  fehlerAngabe,
  bildName,
  BILD_NAME,
  BILDER_GRUENDE,
};
