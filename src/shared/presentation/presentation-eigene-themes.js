// 4T-002281 (Epic 3E-000348): Die eigenen Folien-Themes der Präsentations-
// Ansicht als Zustand — Speicherform, Normalisierung und Namens-Regel.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron, kein
// DOM; Muster `normalizeState` und `sanitizeScheme` in src/shared/color-schemes.js).
// Der Hauptprozess, die Einstellungs-Verteilung, der Renderer und die
// Prüffälle laden es ohne Umgebung.
//
// **Ablage** (Entscheidung des Product Owners vom 2026-10-14, Frage C1,
// Option (a)): `config.json`, Schlüssel `presentationThemes`, Ebene
// Anwendung; der Durchlauf der Ablage-Regel steht in der Architektur,
// Abschnitt «Ablage-Regel für Daten der Anwendung».
//
// **Speicherform** `{ custom: [ { id, name, basis, slots } ] }`: `basis` ist
// ein mitgeliefertes Theme (`light`, `dark`, `accent`), `slots` trägt nur die
// Abweichungen von ihr (Muster `schemeDeviations` der Farbschemas). Damit
// erreicht eine spätere Änderung eines mitgelieferten Themes auch die eigenen
// Themes, die auf ihm aufbauen.
//
// **Namens-Regel** (Punkt (c), Marp-Namen nach der Entscheidung des Product
// Owners vom 2026-10-14, Frage D2, Option (a)): nicht leer, nach Trimmen
// eindeutig ohne Rücksicht auf Groß- und Kleinschreibung, nicht der Name
// eines mitgelieferten Themes. `default`, `gaia` und `uncover` sind erlaubt.
//
// Fehler werfen nie: Ein ungültiger Wert fällt beim Normalisieren weg, ein
// Eintrag ohne Kennung, ohne gültigen Namen oder mit unbekannter Basis ebenso.
'use strict';

const {
  FOLIEN_SLOTS,
  FOLIEN_THEMES,
  THEME_NAMEN,
  slotWertPruefen,
} = require('./presentation-themes.js');

/** Schlüssel des Zustands im Einstellungs-Speicher (`config.json`). */
const PRESENTATION_THEMES_KEY = 'presentationThemes';

/** Codes der Namens-Prüfung; der Theme-Editor (4T-002282) beschriftet sie. */
const NAMENS_BEFUNDE = Object.freeze({
  leer: 'nameLeer',
  mitgeliefert: 'nameMitgeliefert',
  vergeben: 'nameVergeben',
});

const hat = (obj, schluessel) => Object.prototype.hasOwnProperty.call(obj, schluessel);

/** Der leere Zustand. */
function leererThemesZustand() {
  return { custom: [] };
}

/**
 * Vergleichs-Form eines Namens: getrimmt und ohne Rücksicht auf Groß- und
 * Kleinschreibung. Grundlage der Eindeutigkeit und der Umbenennung in der
 * Austausch-Datei.
 *
 * @param {unknown} name
 * @returns {string}
 */
function themeNameVergleich(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

const MITGELIEFERT_VERGLEICH = new Set(THEME_NAMEN.map((n) => themeNameVergleich(n)));

/**
 * Prüft einen Namen gegen die Namens-Regel.
 *
 * @param {unknown} name der vorgeschlagene Name.
 * @param {Array<{id: string, name: string}>} [liste] die vorhandenen eigenen
 *   Themes.
 * @param {string} [ausserId] die Kennung des Themes, das umbenannt wird; sein
 *   eigener Name zählt nicht als vergeben.
 * @returns {string|null} null bei gültigem Namen, sonst ein Code aus
 *   NAMENS_BEFUNDE.
 */
function themeNamePruefen(name, liste, ausserId) {
  const vergleich = themeNameVergleich(name);
  if (vergleich === '') return NAMENS_BEFUNDE.leer;
  if (MITGELIEFERT_VERGLEICH.has(vergleich)) return NAMENS_BEFUNDE.mitgeliefert;
  for (const eintrag of Array.isArray(liste) ? liste : []) {
    if (!eintrag || (ausserId !== undefined && eintrag.id === ausserId)) continue;
    if (themeNameVergleich(eintrag.name) === vergleich) return NAMENS_BEFUNDE.vergeben;
  }
  return null;
}

/**
 * Die Abweichungen eines Slot-Satzes von seiner Basis: nur gültige Werte
 * bekannter Slots, die sich vom Wert der Basis unterscheiden.
 *
 * @param {string} basis ein mitgeliefertes Theme.
 * @param {unknown} slots Slot-Werte (vollständig oder teilweise).
 * @returns {Object<string,string>}
 */
function themeAbweichungen(basis, slots) {
  const aus = {};
  if (!hat(FOLIEN_THEMES, basis) || !slots || typeof slots !== 'object') return aus;
  for (const slot of FOLIEN_SLOTS) {
    if (!hat(slots, slot)) continue;
    const wert = slotWertPruefen(slots[slot]);
    if (wert !== null && wert !== FOLIEN_THEMES[basis][slot]) aus[slot] = wert;
  }
  return aus;
}

/**
 * Ein rohes Theme in die kanonische Form bringen, ohne Blick auf die übrigen
 * Einträge (Eindeutigkeit prüft `normalisiereThemesZustand`).
 *
 * @param {unknown} roh
 * @returns {{id: string, name: string, basis: string, slots: Object<string,string>}|null}
 */
function themeEintragBereinigen(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null;
  const id = typeof roh.id === 'string' ? roh.id.trim() : '';
  if (!id) return null;
  const name = typeof roh.name === 'string' ? roh.name.trim() : '';
  if (themeNamePruefen(name) !== null) return null;
  const basis = typeof roh.basis === 'string' ? roh.basis : '';
  if (!hat(FOLIEN_THEMES, basis)) return null;
  return { id, name, basis, slots: themeAbweichungen(basis, roh.slots) };
}

/**
 * Den gespeicherten Zustand normalisieren: Einträge säubern, doppelte
 * Kennungen und Namen (ohne Rücksicht auf Groß- und Kleinschreibung) verwerfen;
 * es bleibt jeweils der erste. Wirft nie.
 *
 * @param {unknown} roh Wert des Schlüssels `presentationThemes`.
 * @returns {{custom: Array<{id: string, name: string, basis: string,
 *   slots: Object<string,string>}>}}
 */
function normalisiereThemesZustand(roh) {
  const zustand = leererThemesZustand();
  if (!roh || typeof roh !== 'object' || !Array.isArray(roh.custom)) return zustand;
  const ids = new Set();
  for (const eintrag of roh.custom) {
    const theme = themeEintragBereinigen(eintrag);
    if (!theme || ids.has(theme.id)) continue;
    if (themeNamePruefen(theme.name, zustand.custom) !== null) continue;
    ids.add(theme.id);
    zustand.custom.push(theme);
  }
  return zustand;
}

module.exports = {
  PRESENTATION_THEMES_KEY,
  NAMENS_BEFUNDE,
  leererThemesZustand,
  themeNameVergleich,
  themeNamePruefen,
  themeAbweichungen,
  themeEintragBereinigen,
  normalisiereThemesZustand,
};
