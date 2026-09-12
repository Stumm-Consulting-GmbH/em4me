// Sprachwechsel des Fensters: gemeinsamer Pfad fuer den lokalen Wechsel am
// Dropdown und fuer den Multi-Window-Broadcast.
//
// Auszug aus app-init.js, 4T-001001 (Epic 3E-000196).
'use strict';

import {
  loadTranslations,
  applyTranslations,
  t,
  getLanguage,
  fehlendeEintraegeGegenEnglisch,
} from '../../i18n.js';
// 4T-000391 (Epic 3E-000129): Sprachliste aus der einen Quelle.
// 4T-001594: dazu Rueckfall-Sprache und Zerlegung eigener Kennungen.
// 4T-001596: dazu die Frage, ob ueberhaupt eine eigene Sprache eingestellt ist.
import {
  LOCALES,
  FALLBACK_LOCALE,
  customLocaleCode,
  isCustomLocale,
} from '../../../shared/locales.js';
import { api } from './api.js';
// 4T-001594: Der sichtbare Rueckfall (AK6) meldet sich in der Statusleiste.
// Reiner Laufzeit-Aufruf, deshalb ist die Zyklus-Frage hier ohne Belang
// (Muster 4T-000989, save-export <-> views).
import { showStatusbarHint } from '../views/views.js';
import { updateWordCountStatusbar } from '../render-mermaid.js';
import { langSelect, renderZoomIndicator, state } from './app-state.js';
import { updateWindowTitle } from '../editor/editor.js';
import { renderOutgoingLinks } from '../panels/panel-outgoing.js';
import { refreshTaskStateLabels } from '../task-states.js';
import { refreshTaskMarkerLabels } from '../tasks.js';
import { updateBookmarksToggleButton } from '../bookmarks/bookmarks.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { renderAllPanes } from '../views/pane-render.js';
import { refreshOpenManualTabs } from '../manual.js';
import {
  isRegexHelpOpen,
  renderRegexHelp,
  search,
  updateSearchCounter,
  updateSearchScopeLabel,
} from '../search/search.js';

// 4T-001594: Zuletzt gesehene Liste der eingespielten Sprachen. Sie traegt nur
// den Anzeige-Namen fuer die Rueckfall-Meldung; die Wahrheit steht im
// Benutzerprofil und wird bei jedem Aufbau der Auswahl frisch geholt.
let eigeneSprachen = [];

// 4T-000391 (Epic 3E-000129): Die Sprach-Auswahl der Statusleiste entsteht aus
// LOCALES statt aus fuenf festen <option>-Elementen in index.html. Sie war die
// fuenfte Kopie der Sprachliste und die einzige, die ein Anwender sieht.
// Der Aufruf gehoert vor das Setzen des Wertes, weil ein <select> ohne
// passende Option den zugewiesenen Wert stillschweigend verwirft.
// 4T-001594 haengt hier die eingespielten eigenen Sprachen an.
//
// Sie stehen in einer eigenen <optgroup> unterhalb der mitgelieferten
// (Plan-Freigabe des Product Owners vom 2026-09-10, Frage 2): Gleichrangig
// bleibt die Sprache in allem, was zaehlt — Waehlbarkeit, Wirkung,
// Speicherung —, und die Gruppe sagt dem Anwender, woher sie kommt.
// <optgroup> ist die HTML-eigene Form dafuer und selbst nicht waehlbar.
//
// @param {Array<{id: string, code: string, name: string}>} eigene Liste aus
//   `api.localesList()`; leer, wenn keine Sprache eingespielt ist.
export function fuelleSprachAuswahl(eigene = []) {
  if (!langSelect) return;
  langSelect.replaceChildren();
  for (const { code, label } of LOCALES) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = label;
    langSelect.append(option);
  }
  eigeneSprachen = Array.isArray(eigene) ? eigene.filter((s) => s && s.id) : [];
  if (eigeneSprachen.length === 0) return;
  const gruppe = document.createElement('optgroup');
  gruppe.label = t('locales.select.customGroup');
  for (const sprache of eigeneSprachen) {
    const option = document.createElement('option');
    option.value = sprache.id;
    // Der Anzeige-Name stammt aus `@@name` der Datei (Entscheidung 2 in
    // 4T-001593); fehlt er wider Erwarten, ist der Code besser als nichts.
    option.textContent = sprache.name || sprache.code || sprache.id;
    gruppe.append(option);
  }
  langSelect.append(gruppe);
}

/**
 * Holt die eingespielten Sprachen aus dem Benutzerprofil.
 *
 * Ein Fehlschlag ist kein Grund, den Start anzuhalten: Ohne Liste zeigt die
 * Auswahl die fuenf mitgelieferten Sprachen, und das ist der Zustand vor
 * diesem Epic.
 *
 * @returns {Promise<Array<{id: string, code: string, name: string}>>}
 */
export async function holeEigeneSprachen() {
  if (!api || typeof api.localesList !== 'function') return [];
  try {
    const ergebnis = await api.localesList();
    return ergebnis && ergebnis.ok && Array.isArray(ergebnis.sprachen) ? ergebnis.sprachen : [];
  } catch {
    return [];
  }
}

/**
 * Baut die Sprach-Auswahl neu auf und stellt die Wahl wieder her.
 *
 * Gerufen wird sie, wenn sich der Bestand der eingespielten Sprachen aendert
 * (Ereignis `locales:changed`). Die zuvor gewaehlte Kennung gewinnt; steht sie
 * nicht mehr zur Verfuegung — die Sprache wurde gerade entfernt —, folgt die
 * gespeicherte Sprache des Fensters und zuletzt die Rueckfall-Sprache.
 *
 * @returns {Promise<Array<object>>} die neue Liste der eigenen Sprachen.
 */
export async function aktualisiereSprachAuswahl() {
  const liste = await holeEigeneSprachen();
  if (!langSelect) {
    eigeneSprachen = liste;
    return liste;
  }
  const vorher = langSelect.value;
  fuelleSprachAuswahl(liste);
  for (const kandidat of [vorher, state.language, FALLBACK_LOCALE]) {
    if (!kandidat) continue;
    // Ein <select> verwirft einen Wert ohne passende Option stillschweigend;
    // der Rueck-Vergleich ist deshalb die Probe, ob der Kandidat existiert.
    langSelect.value = kandidat;
    if (langSelect.value === kandidat) break;
  }
  return liste;
}

/**
 * Macht den Rueckfall auf die Rueckfall-Sprache sichtbar (AK6).
 *
 * Eine eingestellte eigene Sprache, deren Datei fehlt oder die Pruefung nicht
 * mehr besteht, verschwand vorher lautlos: Die Oberflaeche stand auf Englisch,
 * und niemand sagte warum. Die Einstellung bleibt dabei bewusst stehen, damit
 * die Sprache nach erneutem Einspielen wieder greift.
 *
 * @param {string} kennung die eigene Kennung, die gemeint war.
 */
export function zeigeSprachRueckfall(kennung) {
  const eintrag = eigeneSprachen.find((s) => s.id === kennung);
  const name = (eintrag && eintrag.name) || customLocaleCode(kennung) || kennung;
  showStatusbarHint('locales.fallback.missing', {
    duration: 6000,
    // Der Rueckfall ist kein Vollzug, sondern eine Stoerung: Die Sprache, die
    // der Anwender eingestellt hat, steht gerade nicht zur Verfuegung.
    error: true,
    text: t('locales.fallback.missing').replace('{name}', name),
  });
}

/**
 * 4T-001596 (Epic 3E-000129): Alterungs-Hinweis nach dem Laden einer eigenen
 * Sprache.
 *
 * **Gefragt wird nach der TATSAECHLICH geladenen Sprache** (`getLanguage()`)
 * und nicht nach der gemeinten Kennung: Ist die Datei fehlend oder unbrauchbar,
 * steht die Rueckfall-Sprache, und dann gilt der Rueckfall-Hinweis und nicht
 * dieser. Bei einer mitgelieferten Fassung entsteht der Hinweis nie — der
 * Waechter `check-i18n.js` haelt die fuenf schluesselgleich (AK5).
 *
 * **Gefragt wird auch bei einer Luecke von null**, weil genau das den Merker
 * loescht: Wer nachuebersetzt und erneut einspielt, soll beim naechsten Wachsen
 * der Luecke wieder gewarnt werden.
 *
 * Gemeinsamer Helfer der beiden Lade-Wege — Start (app-init.js) und Wechsel
 * (unten). Zwei getrennte Faelle waeren zwei Gelegenheiten, den Hinweis an
 * einer Stelle zu vergessen.
 *
 * @returns {Promise<boolean>} true, wenn ein Hinweis gezeigt wurde.
 */
export async function pruefeSprachLuecken() {
  const kennung = getLanguage();
  if (!isCustomLocale(kennung)) return false;
  if (!api || typeof api.localesGapNotice !== 'function') return false;
  const fehlend = fehlendeEintraegeGegenEnglisch();
  let antwort;
  try {
    antwort = await api.localesGapNotice(kennung, fehlend.length);
  } catch {
    // Der Hinweis ist eine Zugabe; ein Fehlschlag der Bruecke haelt weder den
    // Start noch den Sprachwechsel auf.
    return false;
  }
  if (!antwort || !antwort.ok || !antwort.faellig) return false;
  const eintrag = eigeneSprachen.find((s) => s.id === kennung);
  const name = (eintrag && eintrag.name) || customLocaleCode(kennung) || kennung;
  showStatusbarHint('locales.gap.hint', {
    // Laenger als die uebrigen Hinweise: Er nennt einen Bedien-Weg, und den
    // muss der Anwender lesen koennen, ohne ihn zu suchen (AK4).
    duration: 8000,
    text: t('locales.gap.hint').replace('{name}', name).replace('{n}', String(fehlend.length)),
  });
  return true;
}

// M-08 (4T-000185): Gemeinsamer Sprachwechsel-Pfad fuer den lokalen
// Dropdown-Wechsel (persist: true) und den Multi-Window-Broadcast
// (persist: false; der Ausloeser hat den Store bereits geschrieben).
/**
 * Wendet einen Sprachwechsel auf das Fenster an.
 *
 * @param {string} newLang Ziel-Sprache: mitgelieferter Locale-Code oder eine
 *   eingespielte Kennung `custom:<code>` (4T-001594).
 * @param {{persist: boolean}} optionen persist:false beim Broadcast-Empfang,
 *   weil das ausloesende Fenster den Store bereits geschrieben hat.
 */
export async function applyLanguageChange(newLang, { persist }) {
  state.language = newLang;
  if (persist) await api.setSetting('language', newLang);
  const ergebnis = await loadTranslations(newLang);
  // 4T-001594: Das Auswahl-Element zeigt, was tatsaechlich geladen ist. Beim
  // Rueckfall wegen fehlender Datei ist das die Rueckfall-Sprache, waehrend
  // `state.language` und die gespeicherte Einstellung die eigene Kennung
  // behalten — sonst waere die Sprache nach erneutem Einspielen verloren.
  // Zuweisung in beiden Zweigen: Im persist-Zweig kam der Wechsel zwar vom
  // Auswahl-Element selbst, aber genau dort muss der Rueckfall sichtbar
  // werden. Eine Zuweisung des schon stehenden Wertes loest kein Ereignis aus.
  if (langSelect) langSelect.value = ergebnis && ergebnis.fallback ? FALLBACK_LOCALE : newLang;
  applyTranslations(document);
  // Der Hinweis steht NACH applyTranslations: Sein Text kommt aus dem gerade
  // geladenen Katalog.
  if (ergebnis && ergebnis.fallback) zeigeSprachRueckfall(ergebnis.id);
  // 4T-001596: Und wenn die Sprache steht, aber Eintraege fehlen, sagt der
  // Hinweis das. Er kommt NACH dem Rueckfall-Hinweis und schliesst ihn aus:
  // Nach einem Rueckfall ist die geladene Sprache eine mitgelieferte.
  await pruefeSprachLuecken();
  // 4T-000204: Default-Status-Labels in der neuen Sprache aufloesen und
  // beide Pipelines neu konfigurieren (rendert ueber das eigene Event
  // auch die Panes; das folgende renderAllPanes ist dadurch idempotent).
  refreshTaskStateLabels();
  // 4T-000498: Badge-Labels der Task-Marker in der neuen Sprache aufloesen
  // (Muster refreshTaskStateLabels).
  refreshTaskMarkerLabels();
  // 4T-000087: Live-Plugin-Re-Build fuer alle offenen Editor-Views ausloesen,
  // damit Callout-Default-Titel-Widgets mit dem neuen Sprach-Stand neu
  // gebaut werden. Listener sitzt direkt am livePreviewPlugin.
  document.dispatchEvent(new CustomEvent('i18n-language-changed'));
  // 4T-000213: offene Handbuch-Tabs in der neuen Sprache neu laden bzw.
  // generieren — VOR renderAllPanes, damit der folgende Render den neuen
  // Inhalt zeichnet; Tab-Titel ziehen ueber renderTabbar/tabDisplayName.
  await refreshOpenManualTabs();
  reportMenuStateNow();
  renderAllPanes();
  // 4T-000017: Zoom-Indikator-Text ist nicht ueber data-i18n abgedeckt
  // (enthaelt Platzhalter); explizit neu rendern.
  renderZoomIndicator();
  // 4T-000072: Word-Count-Statusbar-Text ist nicht ueber data-i18n abgedeckt
  // (Template mit Platzhaltern und Intl.NumberFormat); neu rendern.
  updateWordCountStatusbar();
  // 4T-000073: Outgoing-Links-Eintraege enthalten i18n-Strings (Type-Badge-
  // Title, Zeilen-Label); sichtbare Sektionen neu rendern.
  for (let p = 0; p < state.panes.length; p++) {
    if (state.outgoing && state.outgoing.visibleByPane[p]) renderOutgoingLinks(p);
  }
  // 4T-000075: Bookmarks-Sektion enthaelt nicht-i18n-Texte (Datei-Namen), aber
  // die Kontext-Menue-Strings und der Empty-Hinweis sind data-i18n abgedeckt.
  // Aktiv-Stern aktualisieren, weil Tooltip lokalisiert ist.
  updateBookmarksToggleButton();
  // Such-Labels (Scope, Counter) sind nicht ueber data-i18n abgedeckt.
  if (search.visible) {
    updateSearchScopeLabel();
    updateSearchCounter();
  }
  // Regex-Hilfe wird dynamisch befuellt; bei offener Anzeige neu rendern.
  if (isRegexHelpOpen()) renderRegexHelp();
  // 4T-000330 (Epic 3E-000057): der Klammer-Suffix des Fenstertitels ist
  // lokalisiert (App/Bereich/Fenster) und zieht beim Sprachwechsel mit.
  updateWindowTitle();
  // 4T-000279: eine offene Einstellungs-Seite braucht keinen Sonderpfad —
  // renderAllPanes oben re-montiert sie ueber renderSystemPane in der
  // neuen Sprache (der Entwurf lebt im Modul-Zustand und bleibt erhalten).
}
