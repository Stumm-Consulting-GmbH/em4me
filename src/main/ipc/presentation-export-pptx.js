// 4T-002294 (Epic 3E-000349): Der Kanal der PowerPoint-Datei des Foliensatzes
// (Story 4S-001084). Er verbindet die beiden Bausteine der Stufe 3: das
// Render-Fenster der Folien-Bilder (slide-images.js, 4T-002292) und den
// Container ohne Abhängigkeit (shared/presentation/pptx-writer.js, 4T-002293).
//
//   presentationPptx:export   ein Auftrag mit Zielpfad, Titel, Format und je
//                             Folie dem eigenständigen Dokument aus
//                             `baueFolienDokument` samt ihren Notizen; der
//                             Hauptprozess erzeugt die Bilder, baut die Datei
//                             und schreibt sie ganz oder gar nicht.
//
// Der Speichern-Dialog davor ist `pptx:chooseTarget` in dialogs.js (Muster
// pdf:chooseTarget). Die Seite bleibt ohne Dateizugriff.
//
// **Warum eine eigene Kanal-Gruppe und nicht presentation-export.js:** Die
// Zuständigkeit ist eine andere — dort druckt der Kanal das Fenster des
// Absenders oder schreibt fertigen Text; hier entsteht der Inhalt erst im
// Hauptprozess, über ein eigenes Fenster und mit Abbruch beim Schließen des
// Absenders.
//
// **Rückgabe:** `{ ok: true, path, folien, notizen }` oder
// `{ ok: false, fehler: { folie, grund } }` — ohne Stacktrace und ohne
// Fehlertext des Systems, weil die Seite daraus eine Meldung in der Sprache
// des Anwenders baut. `folie` ist 1-basiert oder null, `grund` einer aus
// PPTX_GRUENDE; das Protokoll trägt die Einzelheiten.
'use strict';

const path = require('node:path');
const zlib = require('node:zlib');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { FOLIE_MAX_ZEICHEN } = require('../praesentation-fenster');
const { erstellePptx, FOLIEN_FORMATE } = require('../../shared/presentation/pptx-writer');

/**
 * Gründe eines Fehlschlags, je einer mit eigenem Text
 * (`presentation.export.pptxGrund.<grund>`). Die ersten sechs stammen aus dem
 * Render-Fenster, die übrigen aus diesem Kanal.
 */
const PPTX_GRUENDE = Object.freeze([
  'zeitbudget',
  'abbruch',
  'laden',
  'aufnahme',
  'masse',
  'prozess',
  'eingabe',
  'groesse',
  'schreiben',
  'unbekannt',
]);

/** Obergrenze der Folien je Auftrag; darüber würde die Datei unhandlich. */
const MAX_FOLIEN = 2000;

/** Obergrenze einer Notiz in Zeichen (Klartext). */
const MAX_NOTIZ_ZEICHEN = 1024 * 1024;

function istPositiveGanzzahl(wert) {
  return Number.isInteger(wert) && wert > 0;
}

/**
 * Prüft den Auftrag der Seite.
 *
 * @param {unknown} auftrag
 * @returns {{zielPfad: string, format: string, titel: string,
 *   folien: Array<{html: string, breite: number, hoehe: number, notizen: string[]}>}|null}
 */
function pruefeAuftrag(auftrag) {
  if (!auftrag || typeof auftrag !== 'object') return null;
  const { zielPfad, format, titel, folien } = auftrag;
  if (typeof zielPfad !== 'string' || !path.isAbsolute(zielPfad)) return null;
  if (path.extname(zielPfad).toLowerCase() !== '.pptx') return null;
  if (!Object.prototype.hasOwnProperty.call(FOLIEN_FORMATE, format)) return null;
  if (titel != null && typeof titel !== 'string') return null;
  if (!Array.isArray(folien) || folien.length === 0 || folien.length > MAX_FOLIEN) return null;
  const geprueft = [];
  for (const folie of folien) {
    if (!folie || typeof folie !== 'object') return null;
    const { html, breite, hoehe, notizen } = folie;
    if (typeof html !== 'string' || !html || html.length > FOLIE_MAX_ZEICHEN) return null;
    if (!istPositiveGanzzahl(breite) || !istPositiveGanzzahl(hoehe)) return null;
    if (!Array.isArray(notizen)) return null;
    if (!notizen.every((n) => typeof n === 'string' && n.length <= MAX_NOTIZ_ZEICHEN)) return null;
    geprueft.push({ html, breite, hoehe, notizen: notizen.slice() });
  }
  return { zielPfad: path.resolve(zielPfad), format, titel: titel || '', folien: geprueft };
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
  // Die Grenzen des ZIP-Schreibers (Zahl der Einträge, 4 GiB) sind für den
  // Anwender derselbe Fall: Der Foliensatz ist zu groß für die Datei.
  const grund =
    roh === 'eintraege' || roh === 'groesse'
      ? 'groesse'
      : PPTX_GRUENDE.includes(roh)
        ? roh
        : fehler instanceof TypeError
          ? 'eingabe'
          : rueckfall;
  const folie = fehler && istPositiveGanzzahl(fehler.folie) ? fehler.folie : null;
  return { folie, grund };
}

/**
 * Registriert den Kanal der PowerPoint-Datei.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {object} deps.app Electron-App-Objekt (Version für die Metadaten).
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object, key: string) => string} deps.tForWindow Übersetzung im Fenster-Kontext.
 * @param {() => {erzeugeFolienBilder: Function}} deps.getFolienBilder Erzeuger der Bilder.
 * @param {object} [extras] Nur für Prüfungen; kein Teil des Deps-Vertrags der Verdrahtung.
 * @param {object} [extras.logger] Vorgabe console.
 * @param {() => Date} [extras.jetzt] Uhr für die Erstellzeit.
 */
function registerPresentationPptxIpc(handle, deps, extras = {}) {
  const { app, senderWindow, tForWindow, getFolienBilder } = deps;
  const { logger = console, jetzt = () => new Date() } = extras;

  handle('presentationPptx:export', async (event, auftrag) => {
    const geprueft = pruefeAuftrag(auftrag);
    if (!geprueft) {
      logger.warn('PowerPoint-Export: ungültiger Auftrag abgewiesen');
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
        folien: geprueft.folien.map(({ html, breite, hoehe }) => ({ html, breite, hoehe })),
        abbruch: abbruch.signal,
      });
    } catch (fehler) {
      // Das Render-Fenster protokolliert seinen Fehler selbst.
      return { ok: false, fehler: fehlerAngabe(fehler, 'unbekannt') };
    } finally {
      owner.removeListener('closed', beiZu);
    }
    if (abbruch.signal.aborted) return { ok: false, fehler: { folie: null, grund: 'abbruch' } };
    try {
      const bytes = erstellePptx({
        folien: bilder.map((bild, i) => ({ bild, notizen: geprueft.folien[i].notizen })),
        format: geprueft.format,
        titel: geprueft.titel,
        erzeuger: `EM4me ${app.getVersion()}`,
        erstellt: jetzt(),
        deflate: zlib.deflateRawSync,
        bildName: tForWindow(owner, 'presentation.export.pptxBildName'),
      });
      await ersetzeDateiOderWirf(
        geprueft.zielPfad,
        Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      );
    } catch (fehler) {
      logger.error('PowerPoint-Export: Datei nicht geschrieben:', geprueft.zielPfad, fehler);
      return { ok: false, fehler: fehlerAngabe(fehler, 'schreiben') };
    }
    const notizen = geprueft.folien.reduce(
      (summe, folie) => summe + folie.notizen.filter((n) => n.trim()).length,
      0,
    );
    // Die Info-Zeile des Exports schreibt das Render-Fenster (Kapitel 4 der
    // Entwicklungsrichtlinien: eine Zeile je Export, nicht zwei).
    return { ok: true, path: geprueft.zielPfad, folien: bilder.length, notizen };
  });
}

module.exports = { registerPresentationPptxIpc, pruefeAuftrag, fehlerAngabe, PPTX_GRUENDE };
