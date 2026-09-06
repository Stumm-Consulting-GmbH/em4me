// 4T-001439 (Story 4S-000869, Epic 3E-000231): Herkunft eines Aenderungspakets
// als Format-Regel.
//
// Eigenes Modul und nicht Teil von mdd-store.js, aus zwei Gruenden. Erstens ist
// die Herkunft eine abgeschlossene Fachlichkeit mit eigenen Regeln, waehrend
// mdd-store das Container-Format traegt. Zweitens ist die Dokument-Historie nur
// der ERSTE Nutzer: Der Aenderungsbeleg der Datenbank braucht dieselben Regeln
// (Baustein T12), und eine Fassung, die in mdd-store steckte, muesste er
// spaeter herausloesen — genau die Ueberlegung, die schon die Ermittlung in
// src/main/herkunft.js eigenstaendig gemacht hat.
//
// Electron-frei und ohne Datei-Zugriff, wie mdd-store selbst: Die Angaben
// kommen als Werte herein, ermittelt werden sie anderswo.
'use strict';

/**
 * Die beiden Felder, wie sie in ein Paket geschrieben werden.
 *
 * GETRENNT statt zusammengesetzt: «alle Aenderungen dieses Rechners» und «alle
 * Aenderungen dieser Person» sind zwei verschiedene Fragen, und aus einer
 * zusammengesetzten Angabe liessen sie sich nur mit einer Trennregel
 * zurueckgewinnen, die an einem Namen mit Trennzeichen scheiterte.
 *
 * Ein nicht ermittelbarer Wert wird WEGGELASSEN statt als null geschrieben.
 * Damit sieht ein Paket ohne Auskunft genauso aus wie eines aus der Zeit vor
 * diesem Epic, und der Leser braucht einen Fall statt zweier.
 *
 * Die Felder kommen ADDITIV ohne Erhoehung der Schema-Version hinzu: Der Leser
 * in mdd-store weist eine Begleitdatei mit abweichender `schemaVersion`
 * vollstaendig ab, eine Erhoehung liesse also jede aeltere Programmfassung die
 * GANZE Historie verwerfen statt nur die beiden neuen Felder.
 *
 * @param {{benutzer?: string|null, rechner?: string|null}|null|undefined} herkunft
 * @returns {{benutzer?: string, rechner?: string}}
 */
function herkunftsFelder(herkunft) {
  const felder = {};
  if (!herkunft || typeof herkunft !== 'object') return felder;
  if (typeof herkunft.benutzer === 'string' && herkunft.benutzer !== '') {
    felder.benutzer = herkunft.benutzer;
  }
  if (typeof herkunft.rechner === 'string' && herkunft.rechner !== '') {
    felder.rechner = herkunft.rechner;
  }
  return felder;
}

/**
 * Traegt das Paket dieselbe Herkunft wie die uebergebenen Felder?
 *
 * Entscheidet, ob in ein offenes Paket weitergeschrieben werden darf. Zwei
 * fehlende Angaben gelten als gleich.
 *
 * @param {object} paket
 * @param {{benutzer?: string, rechner?: string}} felder
 * @returns {boolean}
 */
function gleicheHerkunft(paket, felder) {
  return (
    (paket.benutzer || null) === (felder.benutzer || null) &&
    (paket.rechner || null) === (felder.rechner || null)
  );
}

module.exports = { herkunftsFelder, gleicheHerkunft };
