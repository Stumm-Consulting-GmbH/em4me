// 4T-001438 (Story 4S-000869, Epic 3E-000231): Wer hat geaendert, und auf
// welchem Rechner?
//
// Die Anwendung las bis hierher ueberhaupt keine Betriebssystem-Identitaet:
// weder `os.userInfo`, noch `process.env.USERNAME` beziehungsweise `USER`, noch
// `hostname()` kamen im Produkt-Code vor, und es gab keine persistierte Nutzer-,
// Geraete- oder Installations-Kennung (Erhebung vom 2026-08-27).
//
// Die Fähigkeit entsteht eigenstaendig und nicht eingebaut in ihren ersten
// Nutzer: Gebraucht wird sie zuerst von der Dokument-Historie und danach vom
// Aenderungsbeleg der Datenbank, und eine Ermittlung, die in der Historie
// steckte, muesste die Datenbank spaeter herausloesen.
//
// ZWEI EIGENSCHAFTEN, DIE DEN ZUSCHNITT TRAGEN:
//
// 1. **Feststellung, kein Schluessel.** Die Angabe sagt, wer zum Zeitpunkt der
//    Aenderung am Rechner angemeldet war — nicht, wer jemand *ist*. Ein
//    Anmeldename kann umbenannt werden, und dieselbe Person hat auf zwei
//    Rechnern womoeglich zwei Namen. Das ist unschaedlich, solange niemand
//    Rechte darauf gruendet; ein verwalteter Benutzer-Begriff mit Anlegen,
//    Aendern und Rechtevergabe ist ausdruecklich NICHT Gegenstand (Abgrenzung
//    des Epics).
//
// 2. **Abgelesen, nicht verwaltet.** Kein Verzeichnis, keine Zuordnung, kein
//    Zwischenspeicher. Jeder Aufruf fragt das Betriebssystem erneut; das kostet
//    nichts Nennenswertes und haelt die Angabe aktuell, wenn sich der
//    angemeldete Benutzer waehrend der Laufzeit aendert.
'use strict';

const os = require('node:os');

// Leer heisst null, nicht "" und nicht "unbekannt": Ein erfundener Ersatzwert
// waere eine falsche Feststellung, und eine falsche Feststellung ist schlimmer
// als eine fehlende. Wer die Angabe spaeter anzeigt, unterscheidet damit
// «niemand ermittelbar» von «jemand heisst so».
function normalisiere(wert) {
  if (typeof wert !== 'string') return null;
  const getrimmt = wert.trim();
  return getrimmt === '' ? null : getrimmt;
}

/**
 * Anmeldename des angemeldeten Benutzers.
 *
 * `os.userInfo()` wirft, wenn kein Eintrag in der Benutzer-Datenbank des
 * Systems vorliegt — auf manchen Container- und Dienst-Konten der Fall. Dann
 * bleibt die Angabe leer.
 *
 * @returns {string|null}
 */
function benutzerName() {
  try {
    return normalisiere(os.userInfo().username);
  } catch (err) {
    void err;
    return null;
  }
}

/**
 * Name des Rechners.
 *
 * @returns {string|null}
 */
function rechnerName() {
  try {
    return normalisiere(os.hostname());
  } catch (err) {
    void err;
    return null;
  }
}

/**
 * Beide Angaben, getrennt.
 *
 * Getrennt und nicht zusammengesetzt, damit sie getrennt auswertbar bleiben
 * (Ausgangs-Material der Festlegung vom 2026-08-27): «alle Aenderungen dieses
 * Rechners» und «alle Aenderungen dieser Person» sind zwei verschiedene Fragen,
 * und aus einer zusammengesetzten Angabe liessen sie sich nur mit einer
 * Trennregel zurueckgewinnen, die an einem Namen mit Trennzeichen scheiterte.
 *
 * @returns {{benutzer: string|null, rechner: string|null}}
 */
function ermittleHerkunft() {
  return { benutzer: benutzerName(), rechner: rechnerName() };
}

module.exports = { benutzerName, rechnerName, ermittleHerkunft };
