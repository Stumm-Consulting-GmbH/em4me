// Schlanke i18n: lädt JSON pro Sprache, ersetzt data-i18n / data-i18n-title.
'use strict';

// 4T-000391 (Epic 3E-000129): Sprachliste und Rueckfall aus der einen Quelle.
// 4T-001594: dazu die Form-Kenntnis der eingespielten eigenen Sprachen
// (`custom:<code>`). Die Liste der eigenen Sprachen steht bewusst NICHT im
// Modul locales.js — sie entsteht zur Laufzeit aus dem Benutzerprofil und
// waere dort die Kopie, die 4T-000391 gerade abgeschafft hat.
import {
  isLocale,
  normalizeLocale as normalize,
  FALLBACK_LOCALE,
  isCustomLocale,
  customLocaleCode,
} from '../shared/locales.js';

let current = FALLBACK_LOCALE;
let dict = {};

// 4T-000299 (Epic 3E-000053): Übersetzungs-Beiträge externer Erweiterungen.
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
  return normalize(locale);
}

// 4T-001594 (Epic 3E-000129): Der Katalog einer mitgelieferten Sprache kommt
// weiter per fetch aus dem eigenen Bündel — der Weg funktioniert dort, und die
// Auslieferungs-Konfiguration `asarUnpack` trägt ihn (Plan-Freigabe des
// Product Owners vom 2026-09-10, Frage 1: Kanal daneben statt Vereinheitlichung).
async function ladeMitgeliefert(code) {
  const res = await fetch(`../i18n/${code}.json`);
  if (!res.ok) throw new Error(`i18n: ${code} nicht ladbar`);
  return await res.json();
}

// 4T-001595 (Epic 3E-000129): Der englische Katalog neben dem aktiven.
//
// Er trägt den Rückfall JE SCHLÜSSEL (eingestellte Sprache → Erweiterungs-
// Zusätze → Englisch → Schlüssel-Name). Gebraucht wird er, sobald ein Katalog
// unvollständig ist — und das ist bei einer eingespielten eigenen Sprache der
// Regelfall, beim ersten Einspielen wie nach jeder neuen Programmfassung.
//
// **Einmal geholt, nicht je Schlüssel.** `t()` ist synchron; ein Nachladen bei
// Bedarf gäbe es hier gar nicht. Der Katalog kommt deshalb beim Übernehmen
// einer anderen Sprache in einem Zug mit (rund dreitausend Einträge, ein
// `fetch` aus dem eigenen Bündel) und bleibt danach stehen: Die englische
// Fassung ändert sich zur Laufzeit nicht.
//
// Ist die aktive Sprache selbst Englisch, ist es dasselbe Objekt — der
// Rückfall greift dann nie, und ein zweiter Ladevorgang wäre Aufwand ohne
// Wirkung.
let englischerKatalog = null;

async function stelleEnglischenKatalogBereit() {
  if (current === FALLBACK_LOCALE) {
    englischerKatalog = dict;
    return;
  }
  if (englischerKatalog) return;
  try {
    englischerKatalog = await ladeMitgeliefert(FALLBACK_LOCALE);
  } catch {
    // Ohne englischen Katalog bleibt es beim Schlüssel-Namen — dieselbe Lage
    // wie vor 4T-001595. Der nächste Sprach-Wechsel versucht es erneut, weil
    // der Misserfolg nicht festgehalten wird.
  }
}

// Ein Katalog wird in einem Zug übernommen: Wörterbuch, aktive Kennung,
// Sprach-Attribut des Dokuments und die Erweiterungs-Zusätze, die der neuen
// Sprache folgen (4T-000299). Getrennte Zuweisungen an den drei Aufruf-Stellen
// waren der Weg, auf dem eine davon vergessen worden wäre.
//
// 4T-001595: Aus demselben Grund gehört auch der englische Rückfall-Katalog
// hierher und nicht an die Aufruf-Stellen — und weil er geholt werden muss,
// ist die Übernahme seither asynchron.
async function uebernimmKatalog(werte, kennung, sprachAttribut) {
  dict = werte;
  current = kennung;
  document.documentElement.lang = sprachAttribut;
  rebuildExtensionExtras();
  // Die Lücken-Sammlung gilt der eingestellten Sprache; mit ihr wechselt sie.
  fehlendeEigene.clear();
  await stelleEnglischenKatalogBereit();
}

/**
 * Lädt den Übersetzungs-Katalog einer Sprache.
 *
 * Eine eingespielte eigene Sprache (`custom:<code>`) kommt über die
 * Preload-Brücke aus dem Benutzerprofil; der Anzeige-Prozess hat ohne
 * Node-Integration keinen Dateisystem-Zugriff, und `fetch` auf einen relativen
 * Pfad erreicht nur das eigene Bündel.
 *
 * **Die Brücke wird beim Aufruf gelesen, nicht importiert.** Ein Import von
 * `modules/app/api.js` zöge eine Kante von diesem Basis-Modul in den
 * Modul-Baum, der es selbst 148-fach importiert; und `export const api =
 * window.api` bände die Brücke beim Laden, während die jsdom-Prüffälle dieses
 * Moduls sie erst danach stellen.
 *
 * @param {string} lang Kennung: mitgelieferter Code oder `custom:<code>`.
 * @returns {Promise<{fallback: boolean, id?: string}>} `fallback: true` sagt,
 *   dass die eigene Sprache NICHT geladen werden konnte und statt ihrer die
 *   Rückfall-Sprache steht; `id` nennt die Kennung, die gemeint war. Der
 *   Aufrufer macht den Rückfall sichtbar (AK6) — ein Wurf über diese Grenze
 *   hinaus wäre kein sichtbarer, sondern ein abbrechender Start.
 */
export async function loadTranslations(lang) {
  if (isCustomLocale(lang)) {
    const ergebnis = await leseEigeneSprache(lang);
    if (ergebnis) {
      // Das Sprach-Attribut trägt den Code aus `@@locale`, nicht die Kennung:
      // `custom:nds` ist kein gültiges Sprach-Etikett, `nds` ist eines.
      await uebernimmKatalog(ergebnis.werte, lang, ergebnis.code || customLocaleCode(lang));
      return { fallback: false };
    }
    await uebernimmKatalog(
      await ladeMitgeliefert(FALLBACK_LOCALE),
      FALLBACK_LOCALE,
      FALLBACK_LOCALE,
    );
    return { fallback: true, id: lang };
  }
  // Eine wirklich unbekannte Kennung fällt weiterhin still auf die
  // Rückfall-Sprache: Sie ist kein Rückfall, sondern eine Fehl-Angabe, und der
  // sichtbare Hinweis gilt der eingespielten Sprache, deren Datei fehlt.
  const target = isLocale(lang) ? lang : FALLBACK_LOCALE;
  await uebernimmKatalog(await ladeMitgeliefert(target), target, target);
  return { fallback: false };
}

// Liefert `{werte, code}` oder null. Alles, was schiefgehen kann — fehlende
// Brücke, fehlende Datei, ungültiger Inhalt, abgewiesene Prüfung im
// Hauptprozess —, endet in derselben Antwort: null. Der Aufrufer unterscheidet
// die Gründe nicht, weil der Anwender dieselbe Handlung vor sich hat, nämlich
// die Datei erneut einzuspielen.
async function leseEigeneSprache(kennung) {
  const bruecke = typeof window !== 'undefined' ? window.api : null;
  if (!bruecke || typeof bruecke.localesRead !== 'function') return null;
  let antwort;
  try {
    antwort = await bruecke.localesRead(kennung);
  } catch {
    return null;
  }
  if (!antwort || !antwort.ok) return null;
  if (!antwort.werte || typeof antwort.werte !== 'object') return null;
  return { werte: antwort.werte, code: antwort.code };
}

// 4T-001594: Der aktive Katalog für den einen Konsumenten, der ihn als Ganzes
// braucht — der portable Export gibt die Beschriftungs-Gruppen an den dritten
// Leser weiter, der `<userData>` nicht kennt (src/shared hat kein Electron).
//
// Geliefert wird das Objekt selbst, keine Kopie: Der einzige Aufrufer reicht es
// über die contextBridge, die den Wert ohnehin klont, und eine Kopie von rund
// dreitausend Einträgen je Export wäre Aufwand ohne Wirkung. Geschrieben wird
// in das Wörterbuch an keiner Stelle — es wird in uebernimmKatalog ersetzt,
// nie verändert.
export function currentDictionary() {
  return dict;
}

// 4T-001044 (Epic 3E-000208): Ist das Woerterbuch schon da? Vor dem ersten
// erfolgreichen loadTranslations liefert t() jeden Schluessel unveraendert
// zurueck UND meldet ihn als Fehler auf der Konsole. Wer vor diesem Zeitpunkt
// uebersetzten Text in eine dauerhaft sichtbare Flaeche schreibt, zeigt dort
// den rohen Schluessel; der Fenstertitel war genau so ein Fall. Aufrufer, die
// frueh laufen koennen, fragen deshalb hier nach, statt t() blind zu rufen.
export function hatUebersetzungen() {
  return Object.keys(dict).length > 0;
}

// S-08 (4T-000183): setLanguage entfernt — loadTranslations setzt `current`
// bereits selbst; der nachgelagerte Aufruf war redundant und haette bei
// abweichendem Fallback (nicht unterstuetzte Sprache) den Zustand sogar
// vom tatsaechlich geladenen Dictionary entkoppelt.

// 4T-000087 (Epic 3E-000014): Aktuelle Sprache fuer Konsumenten, die ihre
// Render-Reaktion an Sprach-Wechsel knuepfen muessen (z.B. CodeMirror-
// WidgetType.eq()).
export function getLanguage() {
  return current;
}

// 4T-001594 (Epic 3E-000129): Zweiter Zugang zur aktiven Sprache — dieselbe
// Sprache, andere Form.
//
// `getLanguage()` liefert die KENNUNG: der Wert der Einstellung `language`, der
// Schluessel des Katalogs und der Wert der Sprach-Auswahl. Bei einer
// eingespielten eigenen Sprache ist das `custom:<code>`.
//
// `intlLocale()` liefert die BCP-47-FORM: den Sprach-Code selbst, also den
// Inhalt des Feldes `@@locale` der Sprachdatei. Sie gehoert ueberall dorthin,
// wo die Laufzeit-Umgebung einen Sprach-Tag erwartet — `Intl.*`,
// `localeCompare`, `toLocaleString`/`toLocaleDateString` und das
// `locale:`-Feld des Vorlagen-Kontexts.
//
// Getrennt sind die beiden, weil `custom:<code>` dort kein gueltiger Tag ist:
// `new Intl.DateTimeFormat('custom:nds')` wirft einen RangeError, `'nds'` ist
// gueltig (am Knoten gemessen). Eine Stelle, die die Kennung an Intl
// weiterreicht, faellt bei einer mitgelieferten Sprache nie auf und bricht bei
// der ersten eigenen — teils sichtbar als Ausnahme, teils still im try/catch
// als unformatierte Ausgabe.
//
// Bei einer mitgelieferten Sprache sind beide gleich; die Unterscheidung
// kostet dort nichts.
export function intlLocale() {
  return isCustomLocale(current) ? customLocaleCode(current) : current;
}

// 4T-000900 (Epic 3E-000016): Ein unbekannter Schluessel fiel bisher nicht auf.
// Der Rueckfall gibt ihn als Text zurueck, und was der Anwender sieht, ist je
// nach Stelle der rohe Bezeichner, ein leeres Auswahlfeld oder ein deutsches
// Wort in der fremdsprachigen Oberflaeche — kein Gate wurde davon rot. Der
// vorhandene i18n-Waechter kann das prinzipiell nicht sehen: Er vergleicht nur
// die fuenf Sprachdateien untereinander, nie den Code gegen sie.
//
// Diese eine Stelle traegt die ganze Fehlerklasse, auch die zusammengesetzten
// Schluessel (t(`events.category.${cat}`)), die eine statische Pruefung des
// Quelltexts nicht erfasst. Scharf wird die Meldung ueber den
// Konsolen-Fehler-Waechter der End-zu-End-Laeufe (4T-000901).
//
// 4T-001595 (Epic 3E-000129): Die Lage hat sich seither GETEILT, und mit ihr
// die Meldung. Bei den fünf mitgelieferten Fassungen bleibt eine Lücke, was sie
// war — ein Programmfehler, den der Konsolen-Wächter der Ablauf-Läufe scharf
// hält; sie sind schlüsselgleich, und der Wächter `check-i18n.js` hält sie so.
// Bei einer eingespielten EIGENEN Sprache ist die Lücke dagegen der Regelfall:
// Der Übersetzer ist noch nicht fertig, oder eine neue Programmfassung hat
// Schlüssel hinzugefügt. Dort wird der Schlüssel deshalb still in einer Menge
// gesammelt und über `fehlendeSchluesselDerEigenenSprache()` bereitgestellt
// (Leser: 4T-001596). Ein Konsolen-Fehler machte dort jeden Ablauf-Fall mit
// einer unfertigen Übersetzung rot, und der Anwender sucht in der Konsole
// nichts.
const gemeldeteLuecken = new Set();
const fehlendeEigene = new Set();

// 4T-001595: Die Lücken der eingestellten eigenen Sprache, so wie sie beim
// Aufbau der Oberfläche aufgefallen sind. Die Menge wächst mit jedem Schlüssel,
// der nur auf Englisch aufzulösen war, und wird beim Sprach-Wechsel geleert.
export function fehlendeSchluesselDerEigenenSprache() {
  return [...fehlendeEigene];
}

/**
 * 4T-001596 (Epic 3E-000129): Die VOLLSTÄNDIGE Lücke der eingestellten eigenen
 * Sprache — jeder Schlüssel der englischen Fassung, den der aktive Katalog
 * nicht kennt.
 *
 * **Nicht dieselbe Menge wie `fehlendeSchluesselDerEigenenSprache()`.** Jene
 * sammelt zur Laufzeit, was tatsächlich aufzulösen war; sie wächst mit jedem
 * Aufbau der Oberfläche und kennt einen Schlüssel erst, wenn ihn jemand
 * angefragt hat. Der Alterungs-Hinweis nennt dagegen den UMFANG der Lücke, und
 * der muss vollständig sein: Er entsteht deshalb als Mengen-Vergleich der
 * beiden Kataloge, einmal beim Übernehmen, nicht als Beobachtung je Auflösung.
 *
 * Ohne eigene Sprache gibt es nichts zu vergleichen: Die fünf mitgelieferten
 * Fassungen hält der Wächter `check-i18n.js` schlüsselgleich. Ohne englischen
 * Katalog — sein Laden ist fehlgeschlagen — fehlt die Bezugsgröße; eine Lücke
 * von null wäre dort eine Behauptung und keine Messung.
 *
 * @returns {string[]} Sortierte Schlüssel-Namen, sonst eine leere Liste.
 */
export function fehlendeEintraegeGegenEnglisch() {
  if (!isCustomLocale(current) || !englischerKatalog) return [];
  return Object.keys(englischerKatalog)
    .filter((key) => !(key in dict))
    .sort();
}

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

// 4T-001595 (Epic 3E-000129): Die Auflösungs-Kette, an EINER Stelle.
//
// Kette: eingestellte Sprache → Erweiterungs-Zusätze (4T-000299) → Englisch →
// nichts. Die letzte Stufe — der Schlüssel-Name — liegt bei den beiden
// Aufrufern, weil `t()` ihn als Text zurückgibt, `lookup()` das Element dagegen
// unangetastet lässt.
//
// Platzhalter ersetzen die Aufrufer NACH `t()` (Muster
// `t('window.title.app').replace('{n}', …)`); ein zurückgefallener englischer
// Text durchläuft dieselbe Ersetzung, ohne dass hier etwas zu tun wäre.
function aufloesen(key) {
  const wert = dict[key] ?? extensionExtras[key];
  if (wert !== undefined) return wert;
  const englisch = englischerKatalog ? englischerKatalog[key] : undefined;
  if (englisch !== undefined) {
    if (isCustomLocale(current)) fehlendeEigene.add(key);
    else meldeFehlendenSchluessel(key);
    return englisch;
  }
  // Auch Englisch kennt den Schlüssel nicht: Das ist ein Programmfehler und
  // keine Anwender-Lage, unabhängig von der eingestellten Sprache.
  meldeFehlendenSchluessel(key);
  return undefined;
}

export function t(key) {
  const wert = aufloesen(key);
  return wert !== undefined ? wert : key;
}

// 4T-000299: Nachschlag inklusive der Erweiterungs-Zusätze — DOM-Elemente
// externer Panels tragen data-i18n mit 'ext.<id>.'-Keys und ziehen beim
// Sprachwechsel über applyTranslations mit.
function lookup(key) {
  return aufloesen(key);
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
  // 4T-000031: aria-label fuer Icon-only-Buttons (Statusbar). Ohne sichtbaren
  // Text-Inhalt liest ein Screen-Reader sonst nur den Tooltip vor; bei
  // expliziten aria-labels ist die Vorlesung konsistenter.
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key && lookup(key) != null) el.setAttribute('aria-label', lookup(key));
  });
}
