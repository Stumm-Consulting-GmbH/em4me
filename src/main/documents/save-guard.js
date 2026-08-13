// 4T-0945 (Story S-0786, Befund B-12): Stand-Pruefung vor dem Ueberschreiben.
//
// Der einzige Konflikt-Schutz hing bis hierher an der Datei-Beobachtung. Die
// ist ein bestes Bemuehen und keine Zusage: Auf Netz-Freigaben schweigt sie
// ganz, und auch lokal kann sie Ereignisse verlieren. Der Schaden entsteht
// aber immer an derselben Stelle, naemlich beim Schreiben — dort sitzt diese
// Pruefung.
//
// Verglichen wird der INHALT, nicht Aenderungszeit und Groesse: Synchronisations-
// und Sicherungs-Werkzeuge schreiben Dateien auf geteilten Ablagen inhaltlich
// unveraendert neu, und ein Konflikt-Dialog ohne Konflikt wird binnen weniger
// Tage weggeklickt. Umgekehrt verpasst die Aenderungszeit echte Abweichungen,
// wenn die Uhr der Gegenstelle abweicht oder ihre Aufloesung grob ist.
'use strict';

const fs = require('node:fs/promises');

// Datei-Stand mit unterscheidbarem Fehler: {ok:true,text} | {ok:false,code,error}.
// Die Unterscheidung traegt die Entscheidung des Aufrufers — eine fehlende
// Datei ist eine Neuanlage und kein Konflikt, ein anderer Lesefehler dagegen
// heisst, dass der Stand nicht geprueft werden kann.
//
// Normalisiert wie der Lese-Weg der Anwendung (BOM, CRLF), damit der Vergleich
// unten beide Seiten in derselben Form sieht.
async function readDiskState(absolute) {
  try {
    const raw = await fs.readFile(absolute, 'utf8');
    return { ok: true, text: normalizeForCompare(raw) };
  } catch (err) {
    return {
      ok: false,
      code: err && err.code,
      error: err && err.message ? err.message : String(err),
    };
  }
}

// Beide Vergleichsseiten muessen gleich normalisiert sein: Der Reiter haelt
// einen Stand, den file:read bereits um BOM und CRLF bereinigt hat. Ohne
// dieselbe Behandlung des Platten-Texts meldete jede Datei mit Windows-
// Zeilenenden einen Dauer-Konflikt, und die Funktion waere sofort unbrauchbar.
function normalizeForCompare(text) {
  if (typeof text !== 'string') return null;
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

/**
 * Weicht der Platten-Stand vom erwarteten ab?
 *
 * @param {string|null} diskText  Datei-Inhalt vor dem Schreiben; null, wenn es
 *                                die Datei nicht gibt (Neuanlage, kein Konflikt).
 * @param {*} expected            Zuletzt gelesener bzw. geschriebener Stand des
 *                                Aufrufers. Fehlt er, wird nicht geprueft — das
 *                                haelt Aufrufer entkoppelt, die keinen fuehren.
 * @returns {boolean}
 */
function istKonflikt(diskText, expected) {
  const erwartet = normalizeForCompare(expected);
  if (erwartet === null) return false;
  if (diskText === null || diskText === undefined) return false;
  return normalizeForCompare(diskText) !== erwartet;
}

module.exports = { normalizeForCompare, istKonflikt, readDiskState };
