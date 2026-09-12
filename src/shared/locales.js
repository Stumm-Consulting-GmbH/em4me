// 4T-000391 (Epic 3E-000129): Prozess-neutrale Liste der Oberflaechen-Sprachen.
//
// Single Source of Truth fuer die Sprachen, in denen die Anwendung ihre
// Oberflaeche anzeigt. Vor diesem Modul stand dieselbe Fuenfer-Liste vierfach
// im Code — Renderer (i18n.js), Hauptprozess (menu/menu.js), Preload-Pfad
// (markdown/markdown.js) und Waechter (scripts/check-i18n.js) —, dazu als
// fuenf feste <option>-Elemente in index.html. Jede weitere Sprache haette
// alle Kopien treffen muessen, und eine vergessene Stelle waere erst zur
// Laufzeit aufgefallen; mit den eigenen Sprachdateien dieses Epics waere eine
// fuenfte Kopie hinzugekommen (Befund B4 der Konzept-Stufe 4T-001568).
//
// Reine Daten, CJS ohne DOM- und ohne Electron-Abhaengigkeit, damit alle drei
// Prozess-Seiten und die Skripte dieselbe Quelle lesen koennen (Muster
// src/shared/panel-access.js und src/shared/commands/commands.js).
//
// 4T-001594 (Epic 3E-000129): Dazu kennt das Modul seit dem 2026-09-10 die
// FORM der eingespielten eigenen Sprachen — die Kennung `custom:<code>` mit
// dem Code aus dem Metadaten-Feld `@@locale` der Datei. Bewusst nur die Form
// und nicht die Liste: LOCALES bleibt die Liste der MITGELIEFERTEN Sprachen.
// Eine zur Laufzeit veränderliche Liste müsste in jedem Prozess getrennt
// gefüllt werden und wäre genau die Kopie, die 4T-000391 abgeschafft hat; die
// Laufzeit-Liste der eigenen Sprachen liefert stattdessen der Kanal
// `locales:list` aus dem Benutzerprofil.
//
// NICHT hier beheimatet ist die Sprach-Liste der Produkt-Webseite
// (SPRACHEN in scripts/build-web-text.js): Sie beschreibt einen anderen
// Gegenstand — die ausgelieferten Webseiten-Fassungen mit Ordner, Kurzform
// und Gebietsschema —, und ihre Codes muessen den hiesigen nicht folgen.
// Damit die beiden Mengen dennoch nicht auseinanderlaufen, haelt der
// Waechter test/unit/locales.test.js sie gegeneinander.
'use strict';

// Felder pro Eintrag:
//   code   Locale-Code der Sprachdatei src/i18n/<code>.json; zugleich der
//          gespeicherte Wert der Einstellung `language` und der Wert des
//          <option>-Elements der Statusleisten-Auswahl.
//   label  Sprachname in der eigenen Sprache (Endonym). Er steht bewusst
//          nicht in den Sprachdateien: Die Auswahl zeigt jede Sprache in
//          ihrer eigenen Schreibweise, unabhaengig davon, welche gerade
//          eingestellt ist.
//
// AKTIVIERUNGS-REGEL, verbindlich (Epic-Entscheidung 3E-000074, uebernommen
// mit der Umhaengung nach 3E-000129): Ein neuer Code kommt erst in diese
// Liste, wenn seine Sprachdatei UND alle Handbuch-Fassungen vorliegen. Ein
// Eintrag ohne beides erzeugt eine Oberflaeche, die auf Schluessel-Namen
// zurueckfaellt oder ins Leere verweist. Die Liste ist damit die Zusage, dass
// eine angebotene Sprache vollstaendig da ist — nicht die Ankuendigung einer
// geplanten.
//
// Die Array-Reihenfolge ist die Anzeige-Reihenfolge der Sprach-Auswahl.
const LOCALES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
];

// Rueckfall-Sprache der Anwendung. Sie ist zugleich die Sprache, aus der die
// Sprach-Vorlage entsteht (4T-001592) und auf die der Rueckfall je fehlendem
// Schluessel geht (4T-001595), damit der Uebersetzer genau den Text vor sich
// hat, der bei einer Luecke stehen bliebe.
const FALLBACK_LOCALE = 'en';

const LOCALE_CODES = LOCALES.map((l) => l.code);

/** Ist der Code eine mitgelieferte Oberflaechen-Sprache? */
function isLocale(code) {
  return LOCALE_CODES.includes(code);
}

/**
 * Fuehrt eine beliebige Sprach-Angabe auf einen gelieferten Code zurueck:
 * Gross-/Kleinschreibung egal, Gebiets-Zusatz ('de-DE', 'de_DE') wird
 * abgeschnitten, alles Unbekannte faellt auf FALLBACK_LOCALE.
 */
function normalizeLocale(code) {
  if (!code) return FALLBACK_LOCALE;
  const lc = String(code).toLowerCase().split(/[-_]/)[0];
  return isLocale(lc) ? lc : FALLBACK_LOCALE;
}

/** Endonym eines Codes; unbekannte Codes liefern den Code selbst. */
function localeLabel(code) {
  return LOCALES.find((l) => l.code === code)?.label ?? String(code);
}

// --- Eigene, eingespielte Sprachen (4T-001594) ------------------------------
//
// Präfix der Kennung einer eingespielten Sprache. Er trennt sie eindeutig von
// jedem mitgelieferten Code: Ein Sprach-Code nach BCP 47 enthält keinen
// Doppelpunkt, ein Verwechseln ist damit ausgeschlossen. Die Kennung ist der
// Wert, der als Einstellung `language` gespeichert wird und den die drei
// Lade-Wege hereinbekommen; der Code dahinter ist der Datei-Name im
// Benutzerprofil.
const CUSTOM_PREFIX = 'custom:';

/** Ist die Angabe die Kennung einer eingespielten eigenen Sprache? */
function isCustomLocale(id) {
  return typeof id === 'string' && id.startsWith(CUSTOM_PREFIX) && id.length > CUSTOM_PREFIX.length;
}

/** Sprach-Code hinter dem Präfix; null, wenn die Angabe keine solche Kennung ist. */
function customLocaleCode(id) {
  return isCustomLocale(id) ? id.slice(CUSTOM_PREFIX.length) : null;
}

/** Kennung zu einem Sprach-Code — die Gegenrichtung von customLocaleCode. */
function customLocaleId(code) {
  return `${CUSTOM_PREFIX}${code}`;
}

module.exports = {
  LOCALES,
  LOCALE_CODES,
  FALLBACK_LOCALE,
  CUSTOM_PREFIX,
  isLocale,
  normalizeLocale,
  localeLabel,
  isCustomLocale,
  customLocaleCode,
  customLocaleId,
};
