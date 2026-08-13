// 4T-0759 (Epic 3E-0142): Suchergebnis-Panel — Trefferliste der Suche über
// Handbuch bzw. Einstellungen, gruppiert nach Seite bzw. Bereich.
//
// Entscheidung des Product Owners vom 2026-07-27 nach einer Mockup-Runde:
// Die Treffer erscheinen als Liste in einem Sidebar-Panel, nicht als
// Aufklappen unter der Suchleiste und nicht als reine Durchlauf-Suche.
// Tragender Grund: Beim Nachschlagen lautet die eigentliche Frage, WO ein
// Begriff steht (im Handbuch die Seite, in den Einstellungen der Bereich),
// und nur die gruppierte Liste beantwortet sie.
//
// Dieses Modul zeigt an und wählt aus; es sucht nicht und springt nicht.
// Den Trefferbestand reicht der Suchlauf über zeigeTreffer herein (4T-0760),
// den Sprung führt ein registrierter Handler aus. Der Schnitt hält das
// Panel frei von Wissen über die Herkunft der Treffer und ist die
// Voraussetzung dafür, dass später ein dritter Lieferant (bereichsweite
// Dokument-Suche) ohne zweites Bedienbild andocken kann.
'use strict';

import { t } from '../../i18n.js';
import { getPaneEls, state } from '../app/app-state.js';
import { applySidebarVisibility } from '../panels/panels.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { persistSetting } from '../views/views.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { api } from '../app/api.js';

// Laufender Trefferbestand. Bewusst Modul-Zustand und nicht in state: Er
// gehört zum laufenden Suchlauf, überlebt keinen Neustart und wird nie
// persistiert.
let bestand = {
  treffer: [],
  gruppen: [],
  abgeschnitten: false,
  // 'manual' | 'settings' | 'document' | null
  raum: null,
  auswahl: -1,
};

// Zugeklappte Gruppen (Gruppen-Kennung). Bleibt über einen neuen Suchlauf
// hinweg erhalten, damit eine bewusst zugeklappte Seite nicht bei jedem
// Tastendruck wieder aufspringt.
const zugeklappt = new Set();

let sprungHandler = null;

// Verdrahtungs-Punkt für den Suchlauf (4T-0760): Der Handler bekommt den
// Treffer und führt Öffnen und Anspringen aus.
export function setzeSprungHandler(fn) {
  sprungHandler = typeof fn === 'function' ? fn : null;
}

export function zeigeTreffer({ treffer, gruppen, abgeschnitten, raum, vorratModus }) {
  bestand = {
    treffer: Array.isArray(treffer) ? treffer : [],
    gruppen: Array.isArray(gruppen) ? gruppen : [],
    abgeschnitten: !!abgeschnitten,
    raum: raum || null,
    // 4T-0616: 'direkt' meldet einen Bereich oberhalb des Vorrats-Deckels.
    vorratModus: vorratModus || null,
    auswahl: Array.isArray(treffer) && treffer.length > 0 ? 0 : -1,
  };
  zeichneAllePanes();
}

export function leereTreffer(raum = null) {
  bestand = {
    treffer: [],
    gruppen: [],
    abgeschnitten: false,
    raum,
    vorratModus: null,
    auswahl: -1,
  };
  zeichneAllePanes();
}

// Auswahl-Index, damit der Suchlauf die Liste und den aktiven Treffer der
// Leiste synchron halten kann (F3 bewegt beide).
export function setzeAuswahl(index) {
  if (index < -1 || index >= bestand.treffer.length) return;
  bestand.auswahl = index;
  zeichneAllePanes();
}

export function aktuelleAuswahl() {
  return bestand.auswahl;
}

function zeichneAllePanes() {
  for (let p = 0; p < state.panes.length; p++) {
    if (state.searchResults.visibleByPane[p]) zeichne(p);
  }
}

function statusText() {
  if (bestand.raum === 'document') return t('searchResults.documentScope');
  if (bestand.raum === null) return t('searchResults.noQuery');
  if (bestand.treffer.length === 0) return t('searchResults.empty');
  const anzahl = String(bestand.treffer.length);
  const gruppen = String(bestand.gruppen.length);
  // 4T-0616: Im Bereichs-Raum sind die Gruppen Dateien, in den uebrigen
  // Raeumen Seiten bzw. Bereiche. Ein eigener Schluessel statt eines
  // zusammengesetzten Satzes, damit jede Sprache ihre eigene Wendung waehlen
  // kann.
  const schluessel = bestand.raum === 'area' ? 'searchResults.countFiles' : 'searchResults.count';
  let text = t(schluessel).replace('{n}', anzahl).replace('{g}', gruppen);
  if (bestand.abgeschnitten) text += ` ${t('searchResults.truncated')}`;
  // Der Rueckfall-Modus des Vorrats ist kein Fehler, aber er erklaert, warum
  // die Suche in einem sehr grossen Bereich traeger reagiert.
  if (bestand.vorratModus === 'direkt') text += ` ${t('searchResults.directMode')}`;
  return text;
}

function baueGruppenKopf(gruppe, offen) {
  const kopf = document.createElement('button');
  kopf.type = 'button';
  kopf.className = 'search-results-group';
  kopf.dataset.gruppe = gruppe.gruppe;
  kopf.setAttribute('aria-expanded', offen ? 'true' : 'false');

  const caret = document.createElement('span');
  caret.className = 'search-results-caret';
  caret.textContent = offen ? '▾' : '▸';
  const titel = document.createElement('span');
  titel.className = 'search-results-group-title';
  titel.textContent = gruppe.titel || gruppe.gruppe;
  const anzahl = document.createElement('span');
  anzahl.className = 'search-results-group-count';
  anzahl.textContent = String(gruppe.anzahl);

  kopf.append(caret, titel, anzahl);
  kopf.addEventListener('click', () => {
    if (zugeklappt.has(gruppe.gruppe)) zugeklappt.delete(gruppe.gruppe);
    else zugeklappt.add(gruppe.gruppe);
    zeichneAllePanes();
  });
  return kopf;
}

// Ein Treffer als Zeile: Kontext-Ausschnitt mit hervorgehobenem Fund. Die
// Hervorhebung nutzt die Offsets, die der Kern mitliefert; hier wird nicht
// noch einmal gesucht.
function baueTrefferZeile(treffer, index) {
  const zeile = document.createElement('button');
  zeile.type = 'button';
  zeile.className = 'search-results-item';
  zeile.dataset.index = String(index);
  if (index === bestand.auswahl) zeile.classList.add('selected');

  const vor = treffer.ausschnitt.slice(0, treffer.von);
  const fund = treffer.ausschnitt.slice(treffer.von, treffer.bis);
  const nach = treffer.ausschnitt.slice(treffer.bis);
  zeile.append(document.createTextNode(vor));
  const mark = document.createElement('mark');
  mark.className = 'search-results-match';
  mark.textContent = fund;
  zeile.appendChild(mark);
  zeile.append(document.createTextNode(nach));

  zeile.addEventListener('click', () => {
    bestand.auswahl = index;
    zeichneAllePanes();
    if (sprungHandler) sprungHandler(treffer, index);
  });
  return zeile;
}

function zeichne(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.searchResultsList || !els.searchResultsStatus) return;

  els.searchResultsStatus.textContent = statusText();
  els.searchResultsStatus.classList.toggle(
    'empty',
    bestand.raum !== null && bestand.raum !== 'document' && bestand.treffer.length === 0,
  );

  const liste = els.searchResultsList;
  liste.innerHTML = '';
  if (bestand.treffer.length === 0) return;

  // Die Treffer liegen in Gruppen-Reihenfolge; ein einziger Durchlauf
  // genuegt, um sie den Gruppen zuzuordnen.
  let index = 0;
  for (const gruppe of bestand.gruppen) {
    const offen = !zugeklappt.has(gruppe.gruppe);
    liste.appendChild(baueGruppenKopf(gruppe, offen));
    for (let i = 0; i < gruppe.anzahl; i++) {
      const treffer = bestand.treffer[index];
      if (treffer && offen) liste.appendChild(baueTrefferZeile(treffer, index));
      index++;
    }
  }

  const gewaehlt = liste.querySelector('.search-results-item.selected');
  if (gewaehlt) gewaehlt.scrollIntoView({ block: 'nearest' });
}

// --- Tastatur ---------------------------------------------------------------
// Pfeiltasten bewegen die Auswahl, Enter löst den Sprung aus. Nur wirksam,
// wenn der Fokus im Panel liegt; die Suchleiste behält sonst ihre eigene
// Tastatur-Führung (dort ist Enter der Sprung zum nächsten Treffer).
function bewege(schritt) {
  if (bestand.treffer.length === 0) return;
  const naechster = Math.min(Math.max(bestand.auswahl + schritt, 0), bestand.treffer.length - 1);
  setzeAuswahl(naechster);
}

function onKeydown(ev) {
  const imPanel = ev.target && ev.target.closest && ev.target.closest('.sidebar-searchresults');
  if (!imPanel) return;
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    bewege(1);
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    bewege(-1);
  } else if (ev.key === 'Enter') {
    const treffer = bestand.treffer[bestand.auswahl];
    if (treffer && sprungHandler) {
      ev.preventDefault();
      sprungHandler(treffer, bestand.auswahl);
    }
  }
}

// --- Sichtbarkeit und Registrierung -----------------------------------------

// Bewusst ohne Empty-State-Kopplung (Muster der Lesezeichen aus 4T-0330):
// Das Panel gehört nicht zum Dokument, sondern zum Handbuch und zu den
// Einstellungen. Beide lassen sich ohne offene Datei benutzen, und ein
// Panel, das der Schalter nicht einblenden kann, wäre eine Sackgasse.
export function applySearchResultsVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.searchResultsSection) return;
  const visible = !!state.searchResults.visibleByPane[paneIdx];
  els.searchResultsSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) zeichne(paneIdx);
  updateSearchResultsToggleButton();
}

export function updateSearchResultsToggleButton() {
  const btn = document.getElementById('btn-search-results');
  if (!btn) return;
  const visible = !!state.searchResults.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleSearchResultsPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.searchResults.visibleByPane[paneIdx];
  state.searchResults.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('searchresults', paneIdx);
  applySearchResultsVisibility(paneIdx);
  await persistSearchResultsSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

// Öffnet das Panel, ohne zu schalten: Der Suchlauf zeigt Treffer an, und ein
// unsichtbares Panel wäre eine Sackgasse (4T-0760 nutzt das).
export async function zeigeSuchPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  if (state.searchResults.visibleByPane[paneIdx]) return;
  await toggleSearchResultsPanel(paneIdx);
}

export async function persistSearchResultsSettings() {
  await persistSetting('searchResults.visibleColumn0', !!state.searchResults.visibleByPane[0]);
  await persistSetting('searchResults.visibleColumn1', !!state.searchResults.visibleByPane[1]);
}

export async function loadSearchResultsSettings() {
  const v0 = await api.getSetting('searchResults.visibleColumn0');
  const v1 = await api.getSetting('searchResults.visibleColumn1');
  state.searchResults.visibleByPane[0] = !!v0;
  state.searchResults.visibleByPane[1] = !!v1;
}

export function initSearchResultsPanel() {
  document.addEventListener('keydown', onKeydown);
}

registerSidebarPanel({
  id: 'searchresults',
  titleKey: 'searchResults.title',
  buttonId: 'btn-search-results',
  sectionClass: 'sidebar-searchresults',
  getVisible: (paneIdx) => !!(state.searchResults && state.searchResults.visibleByPane[paneIdx]),
  applyVisibility: applySearchResultsVisibility,
  toggle: toggleSearchResultsPanel,
});
