// 4T-001594 (Epic 3E-000129): Katalog-Lader des Hauptprozesses. Ausgezogen aus
// menu.js, weil der Lade-Weg für eigene Sprachen die Menü-Fabrik über ihr
// Datei-Budget hob und fachlich kein Menü-Inhalt ist: Der Menü-Baum ist eine
// Deklaration, das Lesen und Zwischenspeichern der Sprach-Kataloge eine eigene
// Fachlichkeit daneben (Muster menu-icons.js, menu-recent.js).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
// 4T-001594 (Epic 3E-000129): `app` für den Sprach-Ordner im Benutzerprofil —
// gebraucht ausschließlich im Zweig der eigenen Sprachen (loadCustomDict).
const { app } = require('electron');

// 4T-000391 (Epic 3E-000129): Sprachliste und Rueckfall aus der einen Quelle.
const {
  LOCALE_CODES: SUPPORTED_LOCALES,
  FALLBACK_LOCALE,
  isCustomLocale,
} = require('../../shared/locales');
// 4T-001594 (Epic 3E-000129): Lesen einer eingespielten eigenen Sprache aus dem
// Benutzerprofil. Das Modul ist electron-frei; die Wurzel kommt von hier.
const { leseEigeneSprache } = require('../app/custom-locales');

const dictCache = new Map();

// 4T-001594: `eigeneWurzel` ist die Injektions-Naht für den Sprach-Ordner im
// Benutzerprofil. Ohne Angabe holt sich der Zweig ihn selbst aus `app`; das ist
// der Weg im Betrieb, und alle Aufrufer der Anwendung gehen ihn. Der Wächter
// gibt den Ordner mit, weil `require('electron')` im Testlauf nicht die
// Electron-API liefert, sondern den Pfad der ausführbaren Datei — der
// Hauptprozess-Lade-Weg wäre sonst gar nicht prüfbar (Muster
// `src/main/checks/reminder-check.js` mit `deps.taskLines`).
function loadDict(locale, eigeneWurzel) {
  // 4T-001594: Eine eingespielte eigene Sprache trägt die Kennung
  // `custom:<code>` und liegt im Benutzerprofil statt im Bündel. Sie steht vor
  // der Liste der mitgelieferten Codes, weil `SUPPORTED_LOCALES.includes` sie
  // sonst still auf Englisch umbögen — genau der stumme Rückfall, den dieser
  // Task beseitigt.
  if (isCustomLocale(locale)) return loadCustomDict(locale, eigeneWurzel);
  const target = SUPPORTED_LOCALES.includes(locale) ? locale : FALLBACK_LOCALE;
  if (dictCache.has(target)) return dictCache.get(target);
  try {
    const file = path.join(__dirname, '..', '..', 'i18n', `${target}.json`);
    const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
    dictCache.set(target, dict);
    return dict;
  } catch {
    if (target !== FALLBACK_LOCALE) return loadDict(FALLBACK_LOCALE);
    return {};
  }
}

// 4T-001594: Katalog einer eingespielten eigenen Sprache. Zwischengespeichert
// wird unter der KENNUNG, damit ein eigener Katalog nie einen mitgelieferten
// verdrängt; verworfen wird der Eintrag beim Einspielen und beim Entfernen
// (clearDictCache, gerufen aus ipc/locales.js).
//
// Jeder Misserfolg — Datei entfernt, Datei nachträglich unbrauchbar gemacht,
// Kennung ohne Sprache — fällt auf die Rückfall-Sprache zurück und wird NICHT
// zwischengespeichert: Wird die Datei später wieder eingespielt, greift die
// Sprache beim nächsten Menü-Aufbau von selbst.
function loadCustomDict(id, eigeneWurzel) {
  if (dictCache.has(id)) return dictCache.get(id);
  const rueckfall = loadDict(FALLBACK_LOCALE);
  const wurzel = eigeneWurzel || path.join(app.getPath('userData'), 'locales');
  const gelesen = leseEigeneSprache(wurzel, id, rueckfall, SUPPORTED_LOCALES);
  if (!gelesen.ok) return rueckfall;
  dictCache.set(id, gelesen.werte);
  return gelesen.werte;
}

// 4T-001594: Verwirft den Zwischenspeicher — mit Kennung genau diesen Eintrag,
// ohne Kennung alles.
//
// Die Funktion war mit M-18 (4T-000183) als toter Code entfernt worden: Der
// Cache blieb über die App-Laufzeit warm, weil sich die mitgelieferten
// Fassungen zur Laufzeit nicht ändern. Für eine eigene Sprache gilt das nicht —
// sie wird eingespielt, ersetzt und entfernt, während die Anwendung läuft, und
// ohne Verwerfen zeigten Menüs und Betriebssystem-Dialoge bis zum Neustart den
// alten Stand (AK4).
function clearDictCache(id) {
  if (id === undefined || id === null) dictCache.clear();
  else dictCache.delete(id);
}

// Liefert einen lokalisierten String aus dem Dictionary einer Sprache. Wird
// von main.js fuer Dialog-Texte (Recent-Liste loeschen, Datei nicht gefunden)
// genutzt, die unabhaengig vom Fenster-Menue gerendert werden.
//
// 4T-001595 (Epic 3E-000129): Rückfall JE SCHLÜSSEL auf Englisch statt auf den
// rohen Schlüssel-Namen. Kette: eingestellte Sprache → `FALLBACK_LOCALE` →
// Schlüssel-Name. Gebraucht wird sie bei einer eingespielten eigenen Sprache,
// deren Katalog unvollständig ist; bei den fünf mitgelieferten, schlüssel-
// gleichen Fassungen bleibt sie wirkungslos. Ein zusätzlicher Lade-Vorgang
// entsteht nicht: `loadDict` hält die mitgelieferten Kataloge ohnehin im
// Zwischenspeicher, und der englische liegt dort spätestens seit dem ersten
// eigenen Katalog (loadCustomDict holt ihn als Rückfall).
function tForLocale(locale, key) {
  const dict = loadDict(locale);
  if (dict[key] != null) return dict[key];
  const englisch = loadDict(FALLBACK_LOCALE);
  return englisch[key] != null ? englisch[key] : key;
}

module.exports = { loadDict, clearDictCache, tForLocale };
