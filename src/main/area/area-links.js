// 4T-001450 (Epic 3E-000190): Verknuepfungs-Modell der Bereiche — Normalisierung
// und Nachschlagen der Sektion `areaLinks` der Bereichsdatei.
//
// Eine Verknuepfung benennt einen anderen Bereich ueber seinen Ablage-Ort und
// vergibt ihm ein Kuerzel, das im Link vor dem Ziel steht (`[[@kuerzel:Ziel]]`,
// Entscheidung E1 der Konzept-Stufe 4T-001368). Je Richtung wird ein eigenes
// Kuerzel gefuehrt: Die Eintraege dieser Datei sagen, wie DIESER Bereich die
// anderen anspricht; wie umgekehrt er selbst angesprochen wird, steht in deren
// Bereichsdatei und darf anders lauten.
//
// Electron-frei und rein (unit-testbar, Vorbild area-path.js und
// documents/templates.js); das Lesen und Schreiben der Datei uebernimmt
// area-config.js.
//
// Tolerant nach dem Fehler-Isolations-Muster der Bereichsdatei: Ein defekter
// Eintrag entfaellt, er wirft nie und reisst die uebrigen nicht mit. Grund:
// Die Datei gehoert dem Anwender und ist von Hand editierbar; ein einzelner
// Tippfehler darf nicht alle Verknuepfungen eines Bereichs entwerten.
'use strict';

const path = require('node:path');
const { isSamePath } = require('./area-path');
// 4T-001451: die eine Form-Regel des Kuerzels; siehe Kommentar unten.
const { isValidAreaPrefix, normalizeAreaPrefix } = require('../../shared/area-link-syntax');

// Die Kuerzel-Form selbst steht NICHT hier, sondern in
// src/shared/area-link-syntax.js: Sie wird ausser vom Modell auch von den vier
// Parse-Stellen des Wiki-Links gebraucht, und zwei davon liegen im Renderer.
// Die Regel gehoert deshalb dorthin, wo beide Prozess-Seiten sie erreichen;
// dieses Modul reicht sie weiter, damit es nur EINE Form-Regel gibt
// (4T-001451).

/**
 * Prueft ein Kuerzel auf die zulaessige Form. Weiterreichung aus
 * src/shared/area-link-syntax.js.
 *
 * @param {*} value Zu pruefender Wert.
 * @returns {boolean} true, wenn der Wert ein zulaessiges Kuerzel ist.
 */
function isValidPrefix(value) {
  return isValidAreaPrefix(value);
}

/**
 * Vergleichs-Form eines Kuerzels. Weiterreichung aus
 * src/shared/area-link-syntax.js.
 *
 * @param {*} value Kuerzel.
 * @returns {string} Vergleichs-Form (kleingeschrieben) oder ''.
 */
function normalizePrefixForCompare(value) {
  return normalizeAreaPrefix(value);
}
/**
 * Normalisiert die Sektion `areaLinks` auf eine Liste gueltiger Eintraege.
 *
 * Ein Eintrag traegt drei Angaben: `prefix` das Kuerzel dieser Richtung,
 * `path` den Ablage-Ort des verknuepften Bereichs als ABSOLUTEN Pfad
 * (Entscheidung E2; wurzel-relativ waere unmoeglich, weil das Ziel per
 * Definition ausserhalb der eigenen Wurzel liegt) und `templates` das Opt-in,
 * ob der Vorlagen-Ordner des verknuepften Bereichs in die Vorlagen-Kette
 * dieses Bereichs aufgenommen wird (Architekturentscheidung 4 des Epics).
 *
 * Verworfen werden: Nicht-Objekte, Eintraege ohne gueltiges Kuerzel, Eintraege
 * ohne absoluten Pfad, das zweite Vorkommen eines Kuerzels (der erste Eintrag
 * gewinnt) und — sofern `selfRoot` angegeben ist — die Verknuepfung eines
 * Bereichs mit sich selbst.
 *
 * @param {*} value Rohwert der Sektion aus der Bereichsdatei.
 * @param {object} [options] Zusaetzliche Angaben.
 * @param {string} [options.selfRoot] Wurzel des eigenen Bereichs; ein Eintrag,
 *   der darauf zeigt, entfaellt.
 * @returns {Array<{prefix: string, path: string, templates: boolean}>} Gueltige
 *   Eintraege in ihrer Reihenfolge; leer, wenn nichts gueltig ist.
 */
function normalizeAreaLinks(value, options) {
  if (!Array.isArray(value)) return [];
  const selfRoot = options && typeof options.selfRoot === 'string' ? options.selfRoot : null;
  const eintraege = [];
  const gesehen = new Set();
  for (const roh of value) {
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) continue;
    const prefix = typeof roh.prefix === 'string' ? roh.prefix.trim() : '';
    if (!isValidPrefix(prefix)) continue;
    const schluessel = normalizePrefixForCompare(prefix);
    if (gesehen.has(schluessel)) continue;
    const ziel = typeof roh.path === 'string' ? roh.path.trim() : '';
    // Relative Angaben entfallen statt aufgeloest zu werden: Es gibt keine
    // sinnvolle Basis dafuer, und eine geratene waere schlimmer als keine.
    if (ziel === '' || !path.isAbsolute(ziel)) continue;
    const normalisiert = path.normalize(ziel);
    if (selfRoot && isSamePath(selfRoot, normalisiert)) continue;
    gesehen.add(schluessel);
    // Das Opt-in ist streng boolesch und faellt sonst auf 'aus': Eine
    // bestehende Verknuepfung darf den wirksamen Vorlagen-Satz nie von selbst
    // aendern (Architekturentscheidung 4).
    eintraege.push({ prefix, path: normalisiert, templates: roh.templates === true });
  }
  return eintraege;
}

/**
 * Sucht die Verknuepfung zu einem Kuerzel, ohne Ruecksicht auf Gross- und
 * Kleinschreibung.
 *
 * @param {Array} links Normalisierte Eintraege aus normalizeAreaLinks.
 * @param {*} prefix Gesuchtes Kuerzel.
 * @returns {object|null} Der Eintrag oder null.
 */
function findAreaLink(links, prefix) {
  const gesucht = normalizePrefixForCompare(prefix);
  if (gesucht === '') return null;
  for (const eintrag of links || []) {
    if (eintrag && normalizePrefixForCompare(eintrag.prefix) === gesucht) return eintrag;
  }
  return null;
}

module.exports = {
  isValidPrefix,
  normalizePrefixForCompare,
  normalizeAreaLinks,
  findAreaLink,
};
