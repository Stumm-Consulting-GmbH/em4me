// 4T-002161 (Epic 3E-000149): Folien-Slots und mitgelieferte Folien-Themes der
// Praesentation als Daten, dazu die Aufloesung der Kopf-Angabe `theme`.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron, kein
// DOM; Muster src/shared/color-schemes.js und color-schemes-vorlagen.js). Die
// Anwendung auf das Element der Folie (style.setProperty) lebt im Renderer
// (modules/presentation/presentation-folie.js); hier steht nur, welche Werte
// gelten und welche Variablen daraus werden.
//
// **Slots** (Entscheidung 3a des Product Owners vom 2026-10-07, Namen nach der
// Entscheidung der Sitzung vom 2026-10-07 im gesetzten Rahmen): die stabile
// Schnittstelle der Gestaltung, zugleich Form der mitgelieferten Themes, der
// Uebersteuerung im Kopf und spaeter des Theme-Editors (Stufe 2). Kein freies
// CSS: Ein Slot-Wert speist genau eine CSS-Variable `--slide-<slot>` an der
// Folie, und nur das Stilblatt der Folie entscheidet, wo sie wirkt.
//
// **Unabhaengig vom Farbschema der Anwendung:** Die Werte der Themes sind feste
// Daten und lesen keine Variable der Oberflaeche; `light` uebernimmt die
// Akzentfarbe des hellen Farbschemas nur als Wert (BASE_DEFAULTS.light.accent).
//
// **Eigene Themes** (4T-002281, Epic 3E-000348): `themeAufloesen` nimmt den
// Katalog eigener Themes als Option `eigene`; Speicherform, Normalisierung und
// Namens-Regel stehen in der Schwester-Datei presentation-eigene-themes.js.
//
// **Kopf-Angabe** (Paket 2, Punkt 3a): `theme: <Name>` oder ein Block mit
// `name:` fuer das Basis-Theme und einzelnen Slot-Werten. Fehler werfen nie,
// sie werden Befunde (Codes, keine Prosa) und fallen auf die Vorgabe zurueck.
'use strict';

const { BASE_DEFAULTS } = require('../color-schemes.js');

/** Die Folien-Slots in fester Reihenfolge. */
const FOLIEN_SLOTS = Object.freeze([
  'background',
  'text',
  'heading',
  'accent',
  'font',
  'header-footer',
  'page-number',
]);

/** Name des Standard-Themes (ohne Angabe und als Rueckfall). */
const THEME_VORGABE = 'light';

// Die Oberflaechen-Schrift der Anwendung (styles.css, `--font-ui`), als Wert.
const SCHRIFT_OBERFLAECHE = "'Segoe UI', 'Helvetica Neue', 'DejaVu Sans', system-ui, sans-serif";

/**
 * Die drei mitgelieferten Themes. Unveraenderlich; jedes belegt alle Slots.
 * Kontraste (WCAG, Text auf Hintergrund): light 16.5:1, dark 13.4:1,
 * accent 5.7:1 (weiss auf #0a66c2).
 */
const FOLIEN_THEMES = Object.freeze({
  light: Object.freeze({
    background: '#ffffff',
    text: '#1f1f1f',
    heading: '#1f1f1f',
    accent: BASE_DEFAULTS.light.accent,
    font: SCHRIFT_OBERFLAECHE,
    'header-footer': '#6a6a6a',
    'page-number': '#6a6a6a',
  }),
  dark: Object.freeze({
    background: '#1e1e1e',
    text: '#e6e6e6',
    heading: '#ffffff',
    accent: BASE_DEFAULTS.dark.accent,
    font: SCHRIFT_OBERFLAECHE,
    'header-footer': '#9d9d9d',
    'page-number': '#9d9d9d',
  }),
  accent: Object.freeze({
    background: BASE_DEFAULTS.light.accent,
    text: '#ffffff',
    heading: '#ffffff',
    accent: '#ffd166',
    font: SCHRIFT_OBERFLAECHE,
    'header-footer': '#d6e6f7',
    'page-number': '#d6e6f7',
  }),
});

const THEME_NAMEN = Object.freeze(Object.keys(FOLIEN_THEMES));

/**
 * Befund der Abnahme vom 2026-10-10: der Farbsatz der Syntax-Hervorhebung
 * (und der Markierung `==Text==`) je Theme, `light` oder `dark`. Kein Slot:
 * Er speist keine Variable, sondern waehlt an der Folie die Klasse
 * `presentation-slide--syntax-<satz>`, und das Stilblatt der Folie legt damit
 * die Farben der Code-Bloecke fest, unabhaengig vom Farbschema der Anwendung
 * und vom Ausgabe-Weg. Eine Uebersteuerung im Kopf behaelt den Satz ihres
 * Basis-Themes.
 */
const FOLIEN_THEME_SYNTAX = Object.freeze({
  light: 'light',
  dark: 'dark',
  accent: 'dark',
});

// Hoechstlaenge eines Slot-Werts; eine Farbe oder eine Schriftliste ist kurz.
const WERT_MAX_LAENGE = 200;

// Was ein Slot-Wert nie enthalten darf: Deklarations- und Block-Grenzen,
// Escapes (sie wuerden die Wort-Pruefung darunter umgehen), spitze Klammern,
// Steuerzeichen und Kommentare.
// eslint-disable-next-line no-control-regex -- Steuerzeichen sind genau das Ziel der Pruefung.
const VERBOTENE_ZEICHEN = /[;{}\\<>\u0000-\u001f\u007f]|\/\*/;
// CSS-Funktionen, die eine Ressource laden oder Code ausfuehren koennten: Ein
// Slot speist eine Variable, die etwa als `background` wirkt; ein Bild darf
// nur ueber den Bild-Aufloeser der Pipeline kommen (3E-000344), nie ueber eine
// freie Adresse im Stil.
const VERBOTENE_FUNKTIONEN = /(url|expression|image|image-set|cross-fade|element|src|paint)\s*\(/i;

/**
 * Ist ein Wert als CSS-Wert eines Slots unbedenklich?
 *
 * @param {unknown} wert
 * @returns {string|null} der bereinigte Wert (getrimmt) oder null.
 */
function slotWertPruefen(wert) {
  let s;
  if (typeof wert === 'string') s = wert.trim();
  else if (typeof wert === 'number' && Number.isFinite(wert)) s = String(wert);
  else return null;
  if (s === '' || s.length > WERT_MAX_LAENGE) return null;
  if (VERBOTENE_ZEICHEN.test(s) || VERBOTENE_FUNKTIONEN.test(s)) return null;
  return s;
}

function basisSlots(name) {
  return { ...FOLIEN_THEMES[name] };
}

const hatEigenen = (obj, schluessel) => Object.prototype.hasOwnProperty.call(obj, schluessel);

// 4T-002281: Die Liste eigener Themes aus der Option `eigene`, als Liste oder
// als Zustand `{ custom: [...] }` (Form des Schlüssels `presentationThemes`).
function katalogListe(eigene) {
  if (Array.isArray(eigene)) return eigene;
  if (eigene && typeof eigene === 'object' && Array.isArray(eigene.custom)) return eigene.custom;
  return [];
}

// 4T-002281: Das eigene Theme zu einem Namen, oder null. Der Name gilt nach
// Trimmen ohne Rücksicht auf Groß- und Kleinschreibung, weil die Namens-Regel
// Eindeutigkeit genau so misst (Ausführungs-Entscheidung der Sitzung, 2026-10-15). Der Katalog kommt
// normalisiert herein (presentation-eigene-themes.js); hier wird nur noch
// abgewiesen, was sich nicht auflösen ließe (keine bekannte Basis).
function eigenesThemeSuchen(eigene, name) {
  for (const eintrag of katalogListe(eigene)) {
    if (!eintrag || typeof eintrag !== 'object' || typeof eintrag.name !== 'string') continue;
    if (eintrag.name.trim().toLowerCase() !== String(name).trim().toLowerCase()) continue;
    if (typeof eintrag.basis === 'string' && hatEigenen(FOLIEN_THEMES, eintrag.basis))
      return eintrag;
  }
  return null;
}

// Grundlage einer Auflösung: Name, Basis, voller Slot-Satz und Farbsatz.
function mitgeliefert(name) {
  return { name, basis: name, slots: basisSlots(name), syntax: FOLIEN_THEME_SYNTAX[name] };
}

// 4T-002281 (d): Ein eigenes Theme ergibt die Slots seiner Basis, überschrieben
// von seinen Abweichungen; jeder Wert läuft erneut durch slotWertPruefen.
function ausEigenem(eintrag) {
  const slots = basisSlots(eintrag.basis);
  const abweichungen = eintrag.slots && typeof eintrag.slots === 'object' ? eintrag.slots : {};
  for (const slot of FOLIEN_SLOTS) {
    const wert = hatEigenen(abweichungen, slot) ? slotWertPruefen(abweichungen[slot]) : null;
    if (wert !== null) slots[slot] = wert;
  }
  return {
    name: eintrag.name.trim(),
    basis: eintrag.basis,
    slots,
    syntax: FOLIEN_THEME_SYNTAX[eintrag.basis],
  };
}

function ergebnis(grund, slots, befunde) {
  return { name: grund.name, basis: grund.basis, slots, syntax: grund.syntax, befunde };
}

/**
 * Löst die Kopf-Angabe `theme` zu einem vollständigen Slot-Satz auf. Wirft nie.
 *
 * - null/undefined: das Standard-Theme.
 * - String: Name eines mitgelieferten Themes, sonst eines eigenen Themes aus
 *   `optionen.eigene` (4T-002281); unbekannt -> Standard-Theme und Befund
 *   `themeUnbekannt`.
 * - Objekt: `name` als Basis (ohne Angabe das Standard-Theme, sonst wie oben,
 *   also auch ein eigenes Theme), dazu die übersteuerten Slots. Unbekannte
 *   Schlüssel ergeben den Befund `slotUnbekannt` und werden nicht beachtet;
 *   ein unbedenklicher Wert ersetzt den des Themes, ein bedenklicher ergibt
 *   `slotWertUngueltig` und lässt den Wert des Themes stehen.
 * - alles andere: Standard-Theme und Befund `themeUngueltig`.
 *
 * Reihenfolge der Namens-Auflösung (4T-002281, Punkt (d)): mitgeliefertes
 * Theme, dann eigenes Theme, sonst Rückfall auf `light`. Die Kette eines
 * eigenen Themes: Slots der Basis, darüber seine Abweichungen, darüber der
 * Block im Kopf; die Angaben je Folie legt der Format-Kern darüber
 * (presentation-folien-schluessel.js).
 *
 * @param {unknown} kopfTheme
 * @param {{eigene?: Array<object>|{custom: Array<object>}}} [optionen]
 *   `eigene`: der Katalog eigener Themes (`{ id, name, basis, slots }`), als
 *   Liste oder als Zustand des Schlüssels `presentationThemes`. Ohne ihn
 *   gelten nur die mitgelieferten Themes.
 * @returns {{name: string, basis: string, slots: Object<string,string>,
 *   syntax: string, befunde: Array<{code: string, detail: string}>}}
 *   `basis` ist das mitgelieferte Theme, auf dem die Gestaltung aufbaut.
 */
function themeAufloesen(kopfTheme, optionen) {
  const eigene = optionen && typeof optionen === 'object' ? optionen.eigene : null;
  const befunde = [];
  const grund = (roh) => {
    if (roh === undefined || roh === null || roh === '') return mitgeliefert(THEME_VORGABE);
    const name = typeof roh === 'string' ? roh.trim() : String(roh);
    if (hatEigenen(FOLIEN_THEMES, name)) return mitgeliefert(name);
    const eigen = eigenesThemeSuchen(eigene, name);
    if (eigen) return ausEigenem(eigen);
    befunde.push({ code: 'themeUnbekannt', detail: name });
    return mitgeliefert(THEME_VORGABE);
  };

  if (kopfTheme === undefined || kopfTheme === null) {
    const g = grund(null);
    return ergebnis(g, g.slots, befunde);
  }
  if (typeof kopfTheme === 'string') {
    const g = grund(kopfTheme);
    return ergebnis(g, g.slots, befunde);
  }
  if (typeof kopfTheme !== 'object' || Array.isArray(kopfTheme)) {
    befunde.push({ code: 'themeUngueltig', detail: String(kopfTheme) });
    const g = grund(null);
    return ergebnis(g, g.slots, befunde);
  }

  const g = grund(kopfTheme.name);
  const slots = { ...g.slots };
  for (const schluessel of Object.keys(kopfTheme)) {
    if (schluessel === 'name') continue;
    if (!FOLIEN_SLOTS.includes(schluessel)) {
      befunde.push({ code: 'slotUnbekannt', detail: schluessel });
      continue;
    }
    const wert = slotWertPruefen(kopfTheme[schluessel]);
    if (wert === null) befunde.push({ code: 'slotWertUngueltig', detail: schluessel });
    else slots[schluessel] = wert;
  }
  return ergebnis(g, slots, befunde);
}

/**
 * Die CSS-Variablen eines Slot-Satzes: `--slide-<slot>` je Slot.
 *
 * @param {Object<string,string>} slots
 * @returns {Object<string,string>}
 */
function slotVariablen(slots) {
  const vars = {};
  for (const slot of FOLIEN_SLOTS) {
    if (slots && typeof slots[slot] === 'string') vars[`--slide-${slot}`] = slots[slot];
  }
  return vars;
}

module.exports = {
  FOLIEN_SLOTS,
  FOLIEN_THEMES,
  FOLIEN_THEME_SYNTAX,
  THEME_NAMEN,
  THEME_VORGABE,
  slotWertPruefen,
  themeAufloesen,
  slotVariablen,
};
