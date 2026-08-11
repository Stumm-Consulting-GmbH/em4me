// Schlanke i18n: lädt JSON pro Sprache, ersetzt data-i18n / data-i18n-title.
'use strict';

const SUPPORTED = ['de', 'en', 'fr', 'es', 'it'];
let current = 'en';
let dict = {};

// 4T-0299 (Epic 3E-0053): Übersetzungs-Beiträge externer Erweiterungen.
// Jede Erweiterung bringt eigene Bundles ({ sprache: { key: text } }) mit
// einer Standard-Sprache als Fallback mit. Die Keys werden unter dem
// Präfix 'ext.<erweiterungs-id>.' in eine flache Zusatz-Tabelle gelegt,
// damit registry-getriebene Konsumenten (Panel-Titel, Kommando-Labels im
// Tastenkürzel-Editor) über das normale t() auflösen. Auflösungs-Kette:
// App-Wörterbuch → Erweiterungs-Zusätze (aktive Sprache über Standard-
// Sprache gelegt) → Key selbst.
const extensionBundles = new Map(); // extId -> { bundles, defaultLocale }
let extensionExtras = {};

function rebuildExtensionExtras() {
  const extras = {};
  for (const [extId, { bundles, defaultLocale }] of extensionBundles) {
    const base = (bundles && bundles[defaultLocale]) || {};
    const active = (bundles && bundles[current]) || {};
    for (const [key, value] of Object.entries({ ...base, ...active })) {
      if (typeof value === 'string') extras[`ext.${extId}.${key}`] = value;
    }
  }
  extensionExtras = extras;
}

export function registerExtensionTranslations(extId, bundles, defaultLocale) {
  if (typeof extId !== 'string' || !bundles || typeof bundles !== 'object') return;
  extensionBundles.set(extId, {
    bundles,
    defaultLocale: typeof defaultLocale === 'string' ? defaultLocale : 'en',
  });
  rebuildExtensionExtras();
}

export function unregisterExtensionTranslations(extId) {
  if (extensionBundles.delete(extId)) rebuildExtensionExtras();
}

// Erweiterungs-lokale Auflösung (ctx.t der Erweiterungs-API).
export function tExtension(extId, key) {
  return extensionExtras[`ext.${extId}.${key}`] ?? key;
}

export function normalizeLocale(locale) {
  if (!locale) return 'en';
  const lc = locale.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.includes(lc) ? lc : 'en';
}

export async function loadTranslations(lang) {
  const target = SUPPORTED.includes(lang) ? lang : 'en';
  const url = `../i18n/${target}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`i18n: ${target} nicht ladbar`);
  dict = await res.json();
  current = target;
  document.documentElement.lang = target;
  // 4T-0299: Erweiterungs-Zusätze folgen der neuen Sprache.
  rebuildExtensionExtras();
}

// S-08 (4T-0183): setLanguage entfernt — loadTranslations setzt `current`
// bereits selbst; der nachgelagerte Aufruf war redundant und haette bei
// abweichendem Fallback (nicht unterstuetzte Sprache) den Zustand sogar
// vom tatsaechlich geladenen Dictionary entkoppelt.

// 4T-0087 (Epic 3E-0014): Aktuelle Sprache fuer Konsumenten, die ihre
// Render-Reaktion an Sprach-Wechsel knuepfen muessen (z.B. CodeMirror-
// WidgetType.eq()).
export function getLanguage() {
  return current;
}

// 4T-0900 (Epic 3E-0016): Ein unbekannter Schluessel fiel bisher nicht auf.
// Der Rueckfall gibt ihn als Text zurueck, und was der Anwender sieht, ist je
// nach Stelle der rohe Bezeichner, ein leeres Auswahlfeld oder ein deutsches
// Wort in der fremdsprachigen Oberflaeche — kein Gate wurde davon rot. Der
// vorhandene i18n-Waechter kann das prinzipiell nicht sehen: Er vergleicht nur
// die fuenf Sprachdateien untereinander, nie den Code gegen sie.
//
// Diese eine Stelle traegt die ganze Fehlerklasse, auch die zusammengesetzten
// Schluessel (t(`events.category.${cat}`)), die eine statische Pruefung des
// Quelltexts nicht erfasst. Scharf wird die Meldung ueber den
// Konsolen-Fehler-Waechter der End-zu-End-Laeufe (4T-0901).
const gemeldeteLuecken = new Set();

function meldeFehlendenSchluessel(key) {
  // Vor dem Laden des Woerterbuchs ist jeder Schluessel unbekannt; das ist der
  // normale Startzustand und kein Befund.
  if (Object.keys(dict).length === 0) return;
  // Je Schluessel nur einmal: t() laeuft pro Neuaufbau der Oberflaeche erneut,
  // eine Dauer-Meldung wuerde die Konsole fluten und den Waechter entwerten.
  if (gemeldeteLuecken.has(key)) return;
  gemeldeteLuecken.add(key);
  console.error(`i18n: unbekannter Uebersetzungs-Schluessel '${key}'`);
}

export function t(key) {
  const wert = dict[key] ?? extensionExtras[key];
  if (wert !== undefined) return wert;
  meldeFehlendenSchluessel(key);
  return key;
}

// 4T-0299: Nachschlag inklusive der Erweiterungs-Zusätze — DOM-Elemente
// externer Panels tragen data-i18n mit 'ext.<id>.'-Keys und ziehen beim
// Sprachwechsel über applyTranslations mit.
function lookup(key) {
  return dict[key] ?? extensionExtras[key];
}

export function applyTranslations(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key && lookup(key) != null) el.textContent = lookup(key);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key && lookup(key) != null) el.title = lookup(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && lookup(key) != null) el.placeholder = lookup(key);
  });
  // 4T-0031: aria-label fuer Icon-only-Buttons (Statusbar). Ohne sichtbaren
  // Text-Inhalt liest ein Screen-Reader sonst nur den Tooltip vor; bei
  // expliziten aria-labels ist die Vorlesung konsistenter.
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key && lookup(key) != null) el.setAttribute('aria-label', lookup(key));
  });
}
