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

function ergebnis(name, slots, befunde) {
  return { name, slots, syntax: FOLIEN_THEME_SYNTAX[name], befunde };
}

/**
 * Loest die Kopf-Angabe `theme` zu einem vollstaendigen Slot-Satz auf. Wirft nie.
 *
 * - null/undefined: das Standard-Theme.
 * - String: Name eines mitgelieferten Themes; unbekannt -> Standard-Theme und
 *   Befund `themeUnbekannt`.
 * - Objekt: `name` als Basis (ohne Angabe das Standard-Theme, unbekannt wie
 *   oben), dazu die uebersteuerten Slots. Unbekannte Schluessel ergeben den
 *   Befund `slotUnbekannt` und werden nicht beachtet; ein unbedenklicher Wert
 *   ersetzt den des Themes, ein bedenklicher ergibt `slotWertUngueltig` und
 *   laesst den Wert des Themes stehen.
 * - alles andere: Standard-Theme und Befund `themeUngueltig`.
 *
 * @param {unknown} kopfTheme
 * @returns {{name: string, slots: Object<string,string>, syntax: string,
 *   befunde: Array<{code: string, detail: string}>}}
 */
function themeAufloesen(kopfTheme) {
  const befunde = [];
  const basis = (roh) => {
    if (roh === undefined || roh === null || roh === '') return THEME_VORGABE;
    const name = typeof roh === 'string' ? roh.trim() : String(roh);
    if (Object.prototype.hasOwnProperty.call(FOLIEN_THEMES, name)) return name;
    befunde.push({ code: 'themeUnbekannt', detail: name });
    return THEME_VORGABE;
  };

  if (kopfTheme === undefined || kopfTheme === null) {
    return ergebnis(THEME_VORGABE, basisSlots(THEME_VORGABE), befunde);
  }
  if (typeof kopfTheme === 'string') {
    const name = basis(kopfTheme);
    return ergebnis(name, basisSlots(name), befunde);
  }
  if (typeof kopfTheme !== 'object' || Array.isArray(kopfTheme)) {
    befunde.push({ code: 'themeUngueltig', detail: String(kopfTheme) });
    return ergebnis(THEME_VORGABE, basisSlots(THEME_VORGABE), befunde);
  }

  const name = basis(kopfTheme.name);
  const slots = basisSlots(name);
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
  return ergebnis(name, slots, befunde);
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
