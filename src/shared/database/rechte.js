// 4T-002308 (Epic 3E-000263, S1, S3): Die Auflösung der eigenen Rolle, vom
// Anmeldenamen zur Erlaubnis-Menge je Tabelle.
//
// **Eine reine Funktion an einer Stelle** (S1): Prüfung an der
// Schreib-Schnittstelle und Masken brauchen dieselbe Erlaubnis-Menge. Wer sie
// je Verwender selbst bildete, bekäme zwei Antworten auf dieselbe Frage.
//
// **Die Regel** (E12.5, S3), in dieser Reihenfolge:
//
//   1. Ohne Rollen ist alles erlaubt, wie bisher (`quelle` 'alles').
//   2. Steht der Anmeldename in `users`, gilt seine Rolle ('zuordnung').
//   3. Sonst gilt die Vorgabe-Rolle `defaultRole` ('vorgabe').
//   4. Ohne Vorgabe-Rolle ist alles erlaubt ('alles').
//
// **Der Anmeldename wird exakt verglichen**, Zeichen für Zeichen, wie er im
// Änderungsbeleg steht: keine Umwandlung der Schreibung, kein Abschneiden eines
// Domänen-Präfixes. `MStumm` und `mstumm` sind zwei Namen; die Übersicht zeigt
// den eigenen Namen deshalb wörtlich an.
//
// **Je Tabelle die vier Operationen** aus `ROLLEN_OPERATIONEN`: Eine Rolle mit
// `all` darf alles; sonst gilt die Vereinigung der Operationen an «alle
// Tabellen» und an der Tabelle selbst. Den Tabellen-Namen einer Rolle sucht die
// Auflösung ohne Rücksicht auf die Schreibung, wie der Abgleich gegen die
// Tabellen ihn prüft (`pruefeRollenGegenTabellen`); was der Abgleich besteht,
// muss hier auch treffen. Eine Tabelle, die die Rolle nicht nennt, bekommt
// keine Operation.
//
// Die Rollen, Vorgabe-Rolle und Zuordnung kommen geprüft herein
// (`pruefeSteckbriefRollen`). Nennt eine Zuordnung oder die Vorgabe-Rolle
// dennoch eine Rolle, die es nicht gibt, gilt die Stufe als nicht gesetzt, und
// die Auflösung geht zur nächsten, statt auf einer erfundenen Rolle zu enden.
//
// Prozess-neutral (kein Electron, kein DOM); lädt allein `rollen-angaben.js`.
'use strict';

const { ROLLEN_OPERATIONEN } = require('./rollen-angaben.js');

function hat(objekt, name) {
  return Object.prototype.hasOwnProperty.call(objekt || {}, name);
}

// Eine Eigenschaft als eigene setzen, auch bei einem Namen wie `__proto__`:
// Tabellen-Namen sind Dateinamen des Anwenders.
function setze(ziel, name, wert) {
  Object.defineProperty(ziel, name, {
    value: wert,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function satz(erlaubt) {
  const ergebnis = {};
  for (const op of ROLLEN_OPERATIONEN) ergebnis[op] = erlaubt(op);
  return ergebnis;
}

// Die Erlaubnisse einer Rolle an einer Tabelle.
function rechteDerRolle(rolle, tabelle) {
  if (rolle.alle === true) return satz(() => true);
  const erlaubt = new Set(Array.isArray(rolle.alleTabellen) ? rolle.alleTabellen : []);
  const klein = String(tabelle).toLowerCase();
  for (const [name, ops] of Object.entries(rolle.operationen || {}))
    if (name.toLowerCase() === klein && Array.isArray(ops)) ops.forEach((op) => erlaubt.add(op));
  return satz((op) => erlaubt.has(op));
}

// Welche Rolle gilt, und woher? Liefert { rolle, quelle }.
function welcheRolle({ rollen, defaultRole, users, anmeldename }) {
  if (Object.keys(rollen).length === 0) return { rolle: null, quelle: 'alles' };
  if (typeof anmeldename === 'string' && hat(users, anmeldename) && hat(rollen, users[anmeldename]))
    return { rolle: users[anmeldename], quelle: 'zuordnung' };
  if (typeof defaultRole === 'string' && hat(rollen, defaultRole))
    return { rolle: defaultRole, quelle: 'vorgabe' };
  return { rolle: null, quelle: 'alles' };
}

/**
 * Löst die eigene Rolle und ihre Erlaubnis-Menge je Tabelle auf.
 *
 * @param {object} p Parameter.
 * @param {object} [p.rollen] Die geprüften Rollen (`pruefeSteckbriefRollen`).
 * @param {string|null} [p.defaultRole] Die geprüfte Vorgabe-Rolle.
 * @param {Object<string, string>} [p.users] Die geprüfte Zuordnung.
 * @param {string|null} [p.anmeldename] Der Anmeldename aus der Herkunft.
 * @param {string[]} [p.tabellenNamen] Die Namen der Tabellen der Datenbank.
 * @returns {{rolle: string|null, quelle: 'zuordnung'|'vorgabe'|'alles',
 *   rechte: Object<string, {create: boolean, update: boolean, delete: boolean,
 *   define: boolean}>}}
 */
function loeseRechte({
  rollen = {},
  defaultRole = null,
  users = {},
  anmeldename = null,
  tabellenNamen = [],
} = {}) {
  const quelle = rollen && typeof rollen === 'object' ? rollen : {};
  const gewaehlt = welcheRolle({ rollen: quelle, defaultRole, users, anmeldename });
  const rechte = {};
  for (const name of Array.isArray(tabellenNamen) ? tabellenNamen : []) {
    const werte =
      gewaehlt.rolle === null ? satz(() => true) : rechteDerRolle(quelle[gewaehlt.rolle], name);
    setze(rechte, String(name), werte);
  }
  return { rolle: gewaehlt.rolle, quelle: gewaehlt.quelle, rechte };
}

module.exports = { loeseRechte };
