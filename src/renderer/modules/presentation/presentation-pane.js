// 4T-002160 (Epic 3E-000149): Andock-Stelle und schlichte Fläche der
// Präsentations-Ansicht.
//
// **Was diese Stufe zeigt:** eine Folie als gerenderten Inhalt, darüber einen
// Zähler «3 / 12» und zwei Schaltflächen zum Blättern; dazu das Blättern per
// Tastatur bei Fokus auf der Fläche (Story 4S-001049, AK2, AK3, AK9). Feste
// Geometrie, Themes und Vorführung kommen mit 4T-002161 und 4T-002162 und
// hängen sich an diese Stelle.
//
// 4T-002161: Die Folie selbst (feste Geometrie, Skalierung, Theme-Slots,
// Hintergrund und Zweiteilung, Seitenzahl, Kopf- und Fusszeile, Ueberlauf)
// baut und zeichnet presentation-folie.js; diese Flaeche reicht ihr die Folie,
// den Kopf des Format-Kerns und die Render-Pipeline des Dokuments und zeigt
// die Befunde der Gestaltung als Hinweis-Zeile ueber der Folie.
//
// 4T-002162: Die Leiste traegt dazu die Schaltflaeche «Vorfuehrung starten»;
// die Vorfuehrung selbst (Vollbild, Ausblendung, Tasten) liegt in
// presentation-vorfuehrung.js und meldet ihren Start ueber
// `registriereVorfuehrungsStart` hier an, weil jenes Modul diese Flaeche
// importiert (Muster des Teilbaum-Schritt-Satzes). Die
// Tasten-Tabelle des Blaetterns (`richtungAusTaste`) steht allein hier und
// gilt fuer Flaeche und Vorfuehrung. Ebenso das Blaettern mit dem Mausrad
// (`richtungAusRad`, Ergaenzung aus der Abnahme vom 2026-10-10).
//
// **Warum der Zugang hereingereicht und nicht importiert wird** (Muster
// `kanban-pane.js`): Der Fenster-Zustand gehört `app-state.js`; ein Import von
// dort zöge diesen Ordner in den großen Datei-Zyklus des Renderers. `api` und
// `i18n` bilden keinen Kreis und bleiben gewöhnliche Importe.
//
// **Gelesen wird aus dem Puffer, nie von der Platte** (Regel der
// Puffer-Aktualität): Die Quelle ist `tab.content`, derselbe Stand, den der
// Editor zeigt. Zerlegt wird über den Format-Kern (4T-002159), erreicht über
// die schmale Brücke `api.lesePraesentation` im Preload; gerendert wird jede
// Folie mit der bestehenden Pipeline (`api.renderMarkdown`), es gibt keinen
// zweiten Markdown-Dialekt.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { eigeneThemes, themesStand } from './presentation-themes-stand.js';
import { PRESENTATION_VIEW_MODE, istPraesentationsModusVerfuegbar } from './presentation-modus.js';
import {
  ARTIKEL_KLASSE,
  baueFolie,
  beobachteBuehne,
  beschrifteUeberlauf,
  passeFolieEin,
  pruefeUeberlauf,
  zeichneFolie,
} from './presentation-folie.js';
import { blaetterZiel, zeigeAufdeckStand } from './presentation-aufdecken.js';

// Takt des verzögerten Nachzugs, gleich dem der Tafel.
const PRESENTATION_RENDER_DEBOUNCE_MS = 200;

// Erweiterung der `%%`-Kommentare: Ihr Schalt-Zustand entscheidet, ob der Kern
// einen Kommentar-Block als Notiz liest (vereinbarte Schnittstelle).
const KOMMENTAR_ERWEITERUNG = 'comments';

/** Klassen der Fläche; die Fläche vergibt nur Klassen, Maße stehen im Stilblatt. */
export const FLAECHE_KLASSE = 'praesentation-flaeche';
export const ZAEHLER_KLASSE = 'praesentation-zaehler';
export const FOLIE_KLASSE = ARTIKEL_KLASSE;
export const HINWEISE_KLASSE = 'praesentation-hinweise';
export const BUEHNE_KLASSE = 'praesentation-buehne';

// Befunde, die die Flaeche als Hinweis benennt (4T-002161, AK5): die der
// Theme-Aufloesung und die Kopf-Befunde des Format-Kerns, die die Gestaltung
// betreffen. Je Code ein Katalog-Text; `{wert}` ist der beanstandete Wert.
const HINWEIS_TEXTE = {
  themeUnbekannt: 'presentation.hinweis.themeUnbekannt',
  themeUngueltig: 'presentation.hinweis.themeUngueltig',
  slotUnbekannt: 'presentation.hinweis.slotUnbekannt',
  slotWertUngueltig: 'presentation.hinweis.slotWertUngueltig',
  unbekannteGroesse: 'presentation.hinweis.unbekannteGroesse',
  // 4T-002277: Befunde der Angaben je Folie (nur auf ihrer Folie) und der
  // globale Befund zu `headingDivider` (auf jeder Folie).
  folieWertUngueltig: 'presentation.hinweis.folieWertUngueltig',
  folieThemeUnbekannt: 'presentation.hinweis.folieThemeUnbekannt',
  headingDividerUngueltig: 'presentation.hinweis.headingDividerUngueltig',
};
const FOLIEN_BEFUNDE = ['folieWertUngueltig', 'folieThemeUnbekannt'];

// Die Befunde des Kerns, die auf der gezeigten Folie als Hinweis erscheinen.
function befundeDerFolie(befunde, folie) {
  return (Array.isArray(befunde) ? befunde : []).filter((b) => {
    if (b.code === 'headingDividerUngueltig') return true;
    if (!FOLIEN_BEFUNDE.includes(b.code) || !folie) return false;
    return b.zeile >= folie.vonZeile && b.zeile <= folie.bisZeile;
  });
}
export const ZURUECK_KLASSE = 'praesentation-zurueck';
export const WEITER_KLASSE = 'praesentation-weiter';
export const VORFUEHREN_KLASSE = 'praesentation-vorfuehren';

let umgebung = null;
let teilbaumSchritte = null;
// 4T-002162: Start der Vorführung für die Schaltfläche der Leiste.
let vorfuehrungsStart = null;
// 4T-002279 (Epic 3E-000348): Meldung nach jedem Zeichnen der Spalte, für die
// Referenten-Ansicht (presentation-referent.js): (paneIdx, neu) => void.
let nachZeichnen = null;

// Zuletzt gemeldete Verfügbarkeit je Spalte; siehe pruefeVerfuegbarkeit.
const verfuegbar = [];
const timer = [];
// Stand der letzten Zeichnung je Spalte (Muster der Tafel): Ohne ihn liefe bei
// jedem Takt des Nachzugs ein voller Render-Aufruf, auch ohne Änderung.
const gezeichnet = [];
// Zuletzt gelesenes Modell je Spalte, an die Identität des Puffers gebunden.
const gelesen = [];
// Gezeigte Folie je geöffnetem Dokument. Am Dokument-Objekt und nicht am
// Zustand, damit ein Wechsel zwischen zwei Präsentationen in derselben Spalte
// jeder ihre Folie lässt; die WeakMap hält das Dokument nicht am Leben.
const folieJeDokument = new WeakMap();
// Container, deren Zuhörer bereits hängen.
const verdrahtet = new WeakSet();

/** Sperre nach einem Rad-Schritt: genau eine Folie je Rad-Bewegung. */
export const RAD_SPERRE_MS = 250;

/** Reicht den Schritt-Satz des erzeugten Teilbaums herein (Muster der Tafel). */
export function registrierePraesentationsTeilbaumSchritte(fn) {
  if (typeof fn === 'function') teilbaumSchritte = fn;
}

/** Reicht den Start der Vorführung herein (4T-002162): (paneIdx) => void. */
export function registriereVorfuehrungsStart(fn) {
  if (typeof fn === 'function') vorfuehrungsStart = fn;
}

/**
 * Reicht die Meldung nach dem Zeichnen herein (4T-002279): (paneIdx, neu) =>
 * void; `neu` ist true, wenn die Folie neu gezeichnet wurde, und false, wenn
 * der Stand unverändert war und nur eingepasst wurde.
 */
export function registriereNachZeichnen(fn) {
  nachZeichnen = typeof fn === 'function' ? fn : null;
}

function meldeGezeichnet(paneIdx, neu) {
  if (nachZeichnen) nachZeichnen(paneIdx, neu);
}

/**
 * Verdrahtet die Präsentations-Ansicht mit dem Fenster-Zustand.
 *
 * @param {object} zugang
 * @param {Function} zugang.getPaneEls (paneIdx) => Pane-Elemente.
 * @param {Function} zugang.aktivesDokument (paneIdx) => geöffnetes Dokument oder null.
 * @param {Function} [zugang.beiVerfuegbarkeitsWechsel] (paneIdx, jetzt) => void.
 * @param {Function} [zugang.beiRueckfall] (paneIdx) => void. Zeichnet die
 *   Spalte neu und meldet den Zustand, nachdem die Fläche das Dokument in die
 *   Lese-Ansicht zurückgesetzt hat — es hat sein Kennzeichen verloren, während
 *   es in dieser Ansicht stand (AK7).
 * @param {Function} [zugang.schreibmarkenZeile] (paneIdx) => number|null.
 *   Eins-basierte Zeile der Schreibmarke im Editor der Spalte, in derselben
 *   Zählung wie `vonZeile`/`bisZeile` des Format-Kerns.
 */
export function initPresentationPane(zugang) {
  umgebung = zugang || null;
  // Ein neuer Zugang ist ein neuer Fenster-Zustand: Gelesenes und Gezeichnetes
  // des alten gelten nicht weiter.
  gelesen.length = 0;
  gezeichnet.length = 0;
}

function rufeZugang(name, ...args) {
  if (!umgebung || typeof umgebung[name] !== 'function') return undefined;
  return umgebung[name](...args);
}

/**
 * Liest das Modell des Dokuments über die Brücke zum Format-Kern.
 *
 * Gebunden an die Identität des Puffers und den Schalt-Zustand der
 * Kommentare; ein Takt des Nachzugs ohne Änderung liest nicht neu.
 */
function leseModell(paneIdx, tab) {
  const kommentareAktiv = isExtensionActive(KOMMENTAR_ERWEITERUNG);
  const stand = gelesen[paneIdx];
  const themes = themesStand();
  if (
    stand &&
    stand.content === tab.content &&
    stand.kommentareAktiv === kommentareAktiv &&
    stand.themes === themes
  ) {
    return stand.modell;
  }
  const modell =
    typeof api.lesePraesentation === 'function'
      ? api.lesePraesentation(tab.content, { kommentareAktiv, eigeneThemes: eigeneThemes() })
      : null;
  gelesen[paneIdx] = { content: tab.content, kommentareAktiv, themes, modell };
  return modell;
}

function folienAus(modell) {
  return modell && Array.isArray(modell.folien) ? modell.folien : [];
}

/**
 * Index der Folie, in der eine Zeile steht.
 *
 * Gewählt wird die letzte Folie, die an oder vor der Zeile beginnt. Damit
 * landet eine Zeile im Kopf vor der ersten Folie auf der ersten und eine
 * Trennzeile zwischen zwei Folien auf der vorderen — und die Regel hängt nicht
 * daran, ob das Ende einer Folie die Trennzeile einschließt.
 *
 * @param {Array<{vonZeile:number}>} folien
 * @param {number|null|undefined} zeile eins-basiert, wie `vonZeile`.
 * @returns {number}
 */
export function folieAnZeile(folien, zeile) {
  if (!Array.isArray(folien) || folien.length === 0) return 0;
  if (typeof zeile !== 'number' || !Number.isFinite(zeile)) return 0;
  let treffer = 0;
  for (let i = 0; i < folien.length; i += 1) {
    const von = folien[i] && typeof folien[i].vonZeile === 'number' ? folien[i].vonZeile : 0;
    if (von <= zeile) treffer = i;
    else break;
  }
  return treffer;
}

/** Klemmt einen Index in die Folien-Spanne; ohne Folien 0. */
function klemme(index, anzahl) {
  if (anzahl <= 0) return 0;
  return Math.min(Math.max(0, index), anzahl - 1);
}

/** Text des Zählers, etwa «3 / 12»; ohne Folien «0 / 0». */
export function zaehlerText(index, anzahl) {
  const aktuell = anzahl > 0 ? index + 1 : 0;
  return t('presentation.zaehler')
    .replace('{aktuell}', String(aktuell))
    .replace('{gesamt}', String(anzahl));
}

function baueFlaeche(container, paneIdx) {
  const flaeche = document.createElement('div');
  flaeche.className = FLAECHE_KLASSE;
  // Fokussierbar, damit die Tasten des Blätterns die Fläche erreichen (AK3).
  flaeche.tabIndex = 0;
  flaeche.setAttribute('role', 'region');
  flaeche.setAttribute('aria-label', t('presentation.flaeche'));

  const leiste = document.createElement('div');
  leiste.className = 'praesentation-leiste';
  const zurueck = document.createElement('button');
  zurueck.type = 'button';
  zurueck.className = `praesentation-knopf ${ZURUECK_KLASSE}`;
  const zaehler = document.createElement('span');
  zaehler.className = ZAEHLER_KLASSE;
  zaehler.setAttribute('aria-live', 'polite');
  const weiter = document.createElement('button');
  weiter.type = 'button';
  weiter.className = `praesentation-knopf ${WEITER_KLASSE}`;
  // 4T-002162: der Start der Vorführung neben dem Zähler.
  const vorfuehren = document.createElement('button');
  vorfuehren.type = 'button';
  vorfuehren.className = `praesentation-knopf ${VORFUEHREN_KLASSE}`;
  leiste.append(zurueck, zaehler, weiter, vorfuehren);

  const hinweise = document.createElement('div');
  hinweise.className = HINWEISE_KLASSE;
  hinweise.setAttribute('role', 'status');
  hinweise.hidden = true;

  const buehne = document.createElement('div');
  buehne.className = BUEHNE_KLASSE;
  buehne.append(baueFolie());

  flaeche.append(leiste, hinweise, buehne);
  container.replaceChildren(flaeche);
  beobachteBuehne(buehne);

  if (!verdrahtet.has(container)) {
    verdrahtet.add(container);
    container.addEventListener('click', (ereignis) => {
      const ziel = ereignis.target;
      if (!ziel || typeof ziel.closest !== 'function') return;
      if (ziel.closest(`.${ZURUECK_KLASSE}`)) blaettere(paneIdx, 'zurueck');
      else if (ziel.closest(`.${WEITER_KLASSE}`)) blaettere(paneIdx, 'weiter');
      else if (ziel.closest(`.${VORFUEHREN_KLASSE}`) && vorfuehrungsStart) {
        vorfuehrungsStart(paneIdx);
      }
    });
    container.addEventListener('keydown', (ereignis) => {
      const richtung = richtungAusTaste(ereignis);
      if (!richtung) return;
      ereignis.preventDefault();
      blaettere(paneIdx, richtung);
    });
    // Mausrad: eine Folie je Rad-Bewegung; nicht passiv, damit die Flaeche
    // nicht rollt. Die Sperre gehoert dem Container dieser Spalte.
    const radSperre = { bis: 0 };
    container.addEventListener(
      'wheel',
      (ereignis) => {
        const richtung = richtungAusRad(ereignis, radSperre);
        if (!richtung) return;
        ereignis.preventDefault();
        if (richtung !== 'gesperrt') blaettere(paneIdx, richtung);
      },
      { passive: false },
    );
  }
  return flaeche;
}

/**
 * Welche Blätter-Richtung trägt dieser Tastendruck?
 *
 * Dieselben Tasten wie in der Vorführung (Story 4S-001049, AK3). Mit Strg,
 * Alt oder Meta gedrückt gehört die Taste einem Kürzel und nicht der Fläche;
 * eine Taste in einem Eingabe-Element bleibt dort.
 *
 * @param {KeyboardEvent} ereignis
 * @returns {'weiter'|'zurueck'|'erste'|'letzte'|null}
 */
export function richtungAusTaste(ereignis) {
  if (!ereignis || ereignis.ctrlKey || ereignis.altKey || ereignis.metaKey) return null;
  const ziel = ereignis.target;
  if (ziel && typeof ziel.closest === 'function' && ziel.closest('input, textarea, select')) {
    return null;
  }
  switch (ereignis.key) {
    case 'ArrowRight':
    case 'PageDown':
      return 'weiter';
    case ' ':
    case 'Spacebar':
      return ereignis.shiftKey ? 'zurueck' : 'weiter';
    case 'ArrowLeft':
    case 'PageUp':
      return 'zurueck';
    case 'Home':
      return 'erste';
    case 'End':
      return 'letzte';
    default:
      return null;
  }
}

/**
 * Welche Blätter-Richtung trägt diese Rad-Bewegung?
 *
 * Rad nach unten blättert eine Folie weiter, nach oben eine zurück
 * (Anforderung des Product Owners vom 2026-10-10). Nach einem Schritt sperrt
 * `sperrZustand` für RAD_SPERRE_MS weitere Schritte, damit ein Rad-Schub mit
 * mehreren Ereignissen nicht mehrere Folien überspringt; ein Ereignis in der
 * Sperre meldet 'gesperrt' (abfangen, aber nicht blättern). Mit Strg gehört
 * das Rad der Zoom-Geste des Systems, horizontales Rollen bleibt unberührt.
 *
 * @param {WheelEvent} ereignis
 * @param {{bis: number}} sperrZustand veränderlich, je Ort der Nutzung einer.
 * @returns {'weiter'|'zurueck'|'gesperrt'|null}
 */
export function richtungAusRad(ereignis, sperrZustand) {
  if (!ereignis || ereignis.ctrlKey) return null;
  const dy = Number(ereignis.deltaY) || 0;
  if (dy === 0) return null;
  const jetzt = Date.now();
  if (sperrZustand && jetzt < sperrZustand.bis) return 'gesperrt';
  if (sperrZustand) sperrZustand.bis = jetzt + RAD_SPERRE_MS;
  return dy > 0 ? 'weiter' : 'zurueck';
}

/**
 * Blättert in der Spalte. An der ersten und der letzten Folie bleibt das
 * Blättern ohne Fehler stehen (AK3, AK9).
 *
 * @param {number} paneIdx
 * @param {'weiter'|'zurueck'|'erste'|'letzte'} richtung
 * @returns {number|null} neuer Index oder null ohne gezeigte Präsentation.
 */
export function blaettere(paneIdx, richtung) {
  const tab = rufeZugang('aktivesDokument', paneIdx);
  if (!tab || tab.viewMode !== PRESENTATION_VIEW_MODE) return null;
  const folien = folienAus(leseModell(paneIdx, tab));
  const jetzt = klemme(folieJeDokument.get(tab) || 0, folien.length);
  // 4T-002280: Aufdecken in der Vorführung und Sprung aus der Übersicht
  // (eine Zahl als Richtung) regelt presentation-aufdecken.js.
  const ziel = blaetterZiel({ paneIdx, tab, folien, jetzt, richtung });
  folieJeDokument.set(tab, ziel.index);
  if (ziel.geaendert) renderPresentation(paneIdx);
  return ziel.index;
}

/**
 * Zeichnet die Präsentations-Ansicht der Spalte.
 *
 * @param {number} paneIdx
 * @param {object} [optionen]
 * @param {boolean} [optionen.anSchreibmarke] Beim Eintritt in die Ansicht: die
 *   Folie wählen, in der die Schreibmarke des Editors steht.
 * @returns {Element|null} Container der Ansicht dieser Spalte.
 */
export function renderPresentation(paneIdx, { anSchreibmarke = false } = {}) {
  if (!umgebung) return null;
  const tab = rufeZugang('aktivesDokument', paneIdx);
  if (!tab || tab.viewMode !== PRESENTATION_VIEW_MODE) return null;
  // Verliert das Dokument sein Kennzeichen oder wird die Erweiterung
  // abgeschaltet, während es in dieser Ansicht steht, fällt es in die
  // Lese-Ansicht (AK7) — statt eine Fläche ohne Folien stehen zu lassen.
  // Geschrieben wird dabei nichts: Der Modus ist eine Eigenschaft des
  // geöffneten Dokuments, nicht der Datei.
  if (!istPraesentationsModusVerfuegbar(tab)) {
    tab.viewMode = 'rendered';
    rufeZugang('beiRueckfall', paneIdx);
    return null;
  }
  const els = rufeZugang('getPaneEls', paneIdx);
  const container = (els && els.presentationEl) || null;
  if (!container) return null;

  const folien = folienAus(leseModell(paneIdx, tab));
  const anzahl = folien.length;
  let index;
  if (anSchreibmarke || !folieJeDokument.has(tab)) {
    index = folieAnZeile(folien, rufeZugang('schreibmarkenZeile', paneIdx));
  } else {
    index = folieJeDokument.get(tab);
  }
  index = klemme(index, anzahl);
  folieJeDokument.set(tab, index);

  let flaeche = container.firstElementChild;
  if (!flaeche || !flaeche.classList.contains(FLAECHE_KLASSE)) {
    flaeche = baueFlaeche(container, paneIdx);
    gezeichnet[paneIdx] = null;
  }

  // Zähler und Schaltflächen sind billig und werden bei jedem Aufruf gesetzt;
  // damit ziehen sie auch beim Sprachwechsel nach.
  const zaehler = flaeche.querySelector(`.${ZAEHLER_KLASSE}`);
  if (zaehler) zaehler.textContent = zaehlerText(index, anzahl);
  const zurueck = flaeche.querySelector(`.${ZURUECK_KLASSE}`);
  const weiter = flaeche.querySelector(`.${WEITER_KLASSE}`);
  if (zurueck) {
    zurueck.textContent = t('presentation.zurueck');
    zurueck.title = t('presentation.zurueck');
    zurueck.disabled = index <= 0;
  }
  if (weiter) {
    weiter.textContent = t('presentation.weiter');
    weiter.title = t('presentation.weiter');
    weiter.disabled = index >= anzahl - 1;
  }
  const vorfuehren = flaeche.querySelector(`.${VORFUEHREN_KLASSE}`);
  if (vorfuehren) {
    vorfuehren.textContent = t('menu.view.presentationStart');
    vorfuehren.title = t('menu.view.presentationStart');
    vorfuehren.disabled = anzahl === 0;
  }
  flaeche.setAttribute('aria-label', t('presentation.flaeche'));

  const buehne = flaeche.querySelector(`.${BUEHNE_KLASSE}`);
  const folieEl = flaeche.querySelector(`.${FOLIE_KLASSE}`);
  if (!folieEl || !buehne) return container;
  const huelle = buehne.firstElementChild;
  beschrifteUeberlauf(huelle);
  const folie = folien[index] || null;
  const quelltext = folie && typeof folie.quelltext === 'string' ? folie.quelltext : '';
  const pfad = tab.path || '';
  const sprache = document.documentElement.lang || '';
  const stand = gezeichnet[paneIdx];
  if (
    stand &&
    stand.quelltext === quelltext &&
    stand.index === index &&
    stand.pfad === pfad &&
    stand.sprache === sprache &&
    stand.themes === themesStand() &&
    stand.content === tab.content
  ) {
    passeFolieEin(buehne);
    zeigeAufdeckStand(paneIdx, tab, index, folie, folieEl);
    meldeGezeichnet(paneIdx, false);
    return container;
  }
  const modell = leseModell(paneIdx, tab);
  const kopf = (modell && modell.kopf) || {};
  const gestaltung = zeichneFolie(huelle, {
    folie,
    index,
    kopf,
    render: (markdown) => api.renderMarkdown(markdown, tab.path, { frontmatterBlock: false }),
  });
  // Die Folie ist ein erzeugter Teilbaum: Darstellung und Befüllung ohne
  // Bearbeitbarkeit (Wächter 4T-001130). Das Dokument ihrer Diagramme ist das
  // ganze Dokument, weil eine Folie auf eine Tabelle einer anderen zeigen darf.
  if (teilbaumSchritte) teilbaumSchritte(folieEl, tab.path, { dokumentText: tab.content });
  const kopfBefunde = (modell && Array.isArray(modell.befunde) ? modell.befunde : [])
    .filter((b) => b.code === 'themeUngueltig' || b.code === 'unbekannteGroesse')
    .map((b) => ({ code: b.code, detail: kopfWert(kopf, b.code) }));
  const folienBefunde = befundeDerFolie(modell && modell.befunde, folie);
  setzeHinweise(flaeche, [...kopfBefunde, ...gestaltung.befunde, ...folienBefunde]);
  passeFolieEin(buehne);
  pruefeUeberlauf(huelle);
  zeigeAufdeckStand(paneIdx, tab, index, folie, folieEl);
  gezeichnet[paneIdx] = {
    quelltext,
    index,
    pfad,
    sprache,
    content: tab.content,
    themes: themesStand(),
  };
  meldeGezeichnet(paneIdx, true);
  return container;
}

// Der beanstandete Wert eines Kopf-Befunds, wie er im Kopf steht.
function kopfWert(kopf, code) {
  const roh = (kopf && kopf.roh) || {};
  if (code === 'unbekannteGroesse') return roh.size == null ? '' : String(roh.size);
  return '';
}

/**
 * Zeigt die Befunde der Gestaltung als Hinweis-Zeile ueber der Folie; ohne
 * Befund ist die Zeile verborgen (4T-002161, AK5).
 *
 * @param {Element} flaeche
 * @param {Array<{code: string, detail: string}>} befunde
 */
function setzeHinweise(flaeche, befunde) {
  const zeile = flaeche.querySelector(`.${HINWEISE_KLASSE}`);
  if (!zeile) return;
  const texte = (befunde || [])
    .filter((b) => HINWEIS_TEXTE[b.code])
    .map((b) => t(HINWEIS_TEXTE[b.code]).replace('{wert}', String(b.detail || '')));
  zeile.textContent = texte.join(' · ');
  zeile.hidden = texte.length === 0;
}

/**
 * Stand der gezeigten Folie der Spalte: Index und Zahl der Folien (4T-002278:
 * das Publikums-Fenster bekommt beides mit der gezeichneten Folie).
 *
 * @param {number} paneIdx
 * @returns {{index: number, anzahl: number}|null} null ohne gezeigte Präsentation.
 */
export function folienStand(paneIdx) {
  const tab = gezeigtePraesentation(paneIdx);
  if (!tab) return null;
  const anzahl = folienAus(leseModell(paneIdx, tab)).length;
  return { index: klemme(folieJeDokument.get(tab) || 0, anzahl), anzahl };
}

/**
 * Die Folien der gezeigten Präsentation der Spalte (4T-002279: Notizen und
 * nächste Folie der Referenten-Ansicht); ohne gezeigte Präsentation leer.
 *
 * @param {number} paneIdx
 * @returns {Array<object>}
 */
export function folienDerSpalte(paneIdx) {
  const tab = gezeigtePraesentation(paneIdx);
  return tab ? folienAus(leseModell(paneIdx, tab)) : [];
}

/**
 * Rendert Markdown der gezeigten Präsentation in ein Element, über dieselbe
 * Pipeline und denselben Teilbaum-Schritt-Satz wie die Folie (4T-002279: die
 * Notizen der Referenten-Ansicht). Kein Roh-HTML: Die Pipeline des Viewers
 * rendert ohne HTML-Durchlass.
 *
 * @param {number} paneIdx
 * @param {Element} ziel
 * @param {string} markdown
 * @returns {boolean} false ohne gezeigte Präsentation.
 */
export function rendereInElement(paneIdx, ziel, markdown) {
  const tab = gezeigtePraesentation(paneIdx);
  if (!tab || !ziel) return false;
  const text = typeof markdown === 'string' ? markdown : '';
  ziel.innerHTML = text.trim()
    ? api.renderMarkdown(text, tab.path, { frontmatterBlock: false })
    : '';
  if (teilbaumSchritte) teilbaumSchritte(ziel, tab.path, { dokumentText: tab.content });
  return true;
}

/**
 * Zeichnet eine weitere Folie der gezeigten Präsentation in ein eigenes
 * Gerüst (4T-002279: die nächste Folie der Referenten-Ansicht), mit Kopf,
 * Pipeline und Teilbaum-Schritten wie die gezeigte Folie.
 *
 * @param {number} paneIdx
 * @param {HTMLElement} huelle Ergebnis von baueFolie.
 * @param {number} index Null-basiert.
 * @returns {boolean} false ohne gezeigte Präsentation oder ohne diese Folie.
 */
export function zeichneWeitereFolie(paneIdx, huelle, index) {
  const tab = gezeigtePraesentation(paneIdx);
  if (!tab || !huelle) return false;
  const modell = leseModell(paneIdx, tab);
  const folie = folienAus(modell)[index];
  if (!folie) return false;
  zeichneFolie(huelle, {
    folie,
    index,
    kopf: (modell && modell.kopf) || {},
    render: (markdown) => api.renderMarkdown(markdown, tab.path, { frontmatterBlock: false }),
  });
  const artikel = huelle.querySelector(`.${FOLIE_KLASSE}`);
  if (teilbaumSchritte && artikel) {
    teilbaumSchritte(artikel, tab.path, { dokumentText: tab.content });
  }
  return true;
}

/** Container der Präsentations-Ansicht der Spalte oder null. */
export function praesentationsContainer(paneIdx) {
  const els = rufeZugang('getPaneEls', paneIdx);
  return (els && els.presentationEl) || null;
}

/**
 * Das Dokument, das die Spalte gerade als Präsentation zeigt, oder null
 * (4T-002162: Start und Fortbestand der Vorführung hängen daran).
 *
 * @param {number} paneIdx
 * @returns {object|null}
 */
export function gezeigtePraesentation(paneIdx) {
  const tab = rufeZugang('aktivesDokument', paneIdx);
  if (!tab || tab.viewMode !== PRESENTATION_VIEW_MODE) return null;
  return istPraesentationsModusVerfuegbar(tab) ? tab : null;
}

/**
 * Leert die Fläche der Spalte, wenn sie keine Präsentation mehr zeigt: Die
 * Spalte hat kein Dokument mehr, oder das aktive Dokument steht in einer
 * anderen Ansicht (Befund der zweiten Abnahme vom 2026-10-10: Nach dem
 * Schließen aller Dokumente blieb die letzte Folie samt Zähler und Leiste
 * unter der Leer-Anzeige stehen). Gerufen beim Zeichnen jeder Spalte
 * (pane-render.js) und beim Wechsel der Ansicht (views.js); beim nächsten
 * Eintritt baut renderPresentation die Fläche neu auf.
 *
 * @param {number} paneIdx
 * @returns {boolean} true, wenn geleert wurde.
 */
export function raeumePraesentationAuf(paneIdx) {
  if (gezeigtePraesentation(paneIdx)) return false;
  const container = praesentationsContainer(paneIdx);
  if (!container || !container.firstChild) return false;
  container.replaceChildren();
  gezeichnet[paneIdx] = null;
  return true;
}

/** Gibt der Fläche der Spalte den Tastatur-Fokus (AK3). */
export function fokussierePraesentation(paneIdx) {
  const container = praesentationsContainer(paneIdx);
  const flaeche = container ? container.querySelector(`.${FLAECHE_KLASSE}`) : null;
  if (flaeche && typeof flaeche.focus === 'function') flaeche.focus();
}

/**
 * Meldet den Wechsel der Verfügbarkeit — und nur ihn (Muster der Tafel).
 * Aus einem Dokument wird während des Schreibens eine Präsentation und
 * umgekehrt; Schaltfläche und Menü-Eintrag müssen nachziehen.
 */
function pruefeVerfuegbarkeit(paneIdx) {
  if (!umgebung) return;
  const tab = rufeZugang('aktivesDokument', paneIdx);
  const jetzt = istPraesentationsModusVerfuegbar(tab);
  if (verfuegbar[paneIdx] === jetzt) return;
  verfuegbar[paneIdx] = jetzt;
  rufeZugang('beiVerfuegbarkeitsWechsel', paneIdx, jetzt);
}

/** Verzögerte Aktualisierung nach einer Dokument-Änderung. */
export function schedulePresentationRender(paneIdx) {
  if (timer[paneIdx]) clearTimeout(timer[paneIdx]);
  timer[paneIdx] = setTimeout(() => {
    timer[paneIdx] = null;
    pruefeVerfuegbarkeit(paneIdx);
    renderPresentation(paneIdx);
  }, PRESENTATION_RENDER_DEBOUNCE_MS);
}
