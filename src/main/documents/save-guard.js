// 4T-000945 (Story 4S-000786, Befund B-12): Stand-Pruefung vor dem Ueberschreiben.
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

// 4T-001261 (Epic 3E-000272): Derselbe Schutz fuer einen Schreibweg, der nicht
// den ganzen Text ersetzt, sondern einzelne Frontmatter-Felder.
//
// Die Ereignis-Aggregation schrieb bis hierher in eine nicht geoeffnete fremde
// Datei und erkannte eine Fremd-Aenderung am ZEITSTEMPEL — also mit genau dem
// Merkmal, das dieses Modul oben aus guten Gruenden verworfen hat. Zwei Stellen
// des Bestands schuetzten damit verschieden gegen dieselbe Gefahr, und die
// juengere hatte die aeltere fachlich widerlegt, ohne sie abzuloesen. Seit dem
// 2026-09-05 haben beide Wege ihre Heimat hier.
//
// Verglichen werden nur die GELESENEN Felder, nicht die ganze Datei: Ein
// Schreibweg, der ausschliesslich Frontmatter-Felder aendert, hat an einer
// Aenderung im Fliesstext kein Interesse — ein Voll-Text-Vergleich melde te dort
// genau die Fehlalarme, wegen derer der Zeitstempel gewichen ist. Dasselbe
// Muster traegt die Datenbank-Sperre mit dem Inhalt der gelesenen
// Datensatz-Zeile (E9.3).

/**
 * Vergleichsform eines Frontmatter-Werts.
 *
 * Ein Schnappschuss reist ueber die Prozess-Grenze und kommt in JSON zurueck;
 * ein Datum ist dort eine Zeichenkette, in der frisch geparsten Datei kann
 * derselbe Wert ein Date-Objekt sein. Ohne gemeinsame Form meldete jede Datei
 * mit Datums-Feld einen Dauer-Konflikt — dieselbe Falle, die
 * `normalizeForCompare` fuer BOM und Zeilenenden loest.
 *
 * Listen werden der Reihe nach verglichen, weil ihre Reihenfolge im Frontmatter
 * bedeutungstragend ist (etwa Vorgaenger und Nachfolger eines Ereignisses).
 */
function feldVergleichsForm(wert) {
  if (wert === null || wert === undefined) return '';
  if (wert instanceof Date) return wert.toISOString();
  if (Array.isArray(wert)) return JSON.stringify(wert.map((e) => feldVergleichsForm(e)));
  if (typeof wert === 'object') return JSON.stringify(wert);
  return String(wert);
}

/**
 * Weicht mindestens eines der gelesenen Felder vom aktuellen Stand ab?
 *
 * @param {object} jetzt     Frisch geparstes Frontmatter der Datei.
 * @param {*} erwartet       Die Felder, die der Aufrufer gelesen hat. Fehlt es,
 *                           wird nicht geprueft — dieselbe Zusage wie bei
 *                           `istKonflikt`, damit Aufrufer ohne Schnappschuss
 *                           entkoppelt bleiben.
 * @returns {boolean}
 */
function istFeldKonflikt(jetzt, erwartet) {
  if (!erwartet || typeof erwartet !== 'object') return false;
  const aktuell = jetzt && typeof jetzt === 'object' ? jetzt : {};
  for (const [key, wert] of Object.entries(erwartet)) {
    // Ein Feld, das seither hinzugekommen ist, ist kein Konflikt: Der
    // Schnappschuss hat es nicht gelesen, und die Operation fasst es nicht an.
    if (feldVergleichsForm(aktuell[key]) !== feldVergleichsForm(wert)) return true;
  }
  return false;
}

module.exports = {
  normalizeForCompare,
  istKonflikt,
  readDiskState,
  feldVergleichsForm,
  istFeldKonflikt,
};
