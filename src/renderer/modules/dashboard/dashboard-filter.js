'use strict';

// 4T-002516 (Epic 3E-000402): Die Auswahlfelder am Kopf eines Dashboards
// (Story 4S-001186, Konzept-Stufe 4T-002506, Abschnitte 1.3 und 3.3). Das Modul
// beantwortet eine Frage: wie aus den Filter-Angaben des Kopfes bedienbare
// Auswahlfelder werden, deren Wahl die betroffenen Kacheln nachzieht.
//
// **Wo es läuft:** in der Nachverarbeitung der gerenderten Ansicht unmittelbar
// nach dem Befüllungs-Schritt (`bereiteDashboardKachelnVor` in
// `dashboard-view.js`) und vor der Abfrage-Befüllung. Der Befüllungs-Schritt hat
// an jede Kachel die Vorbelegungen gesetzt; dieser Schritt ersetzt sie durch die
// gemerkte Auswahl des Blocks (`dashboard-zustand.js`), bevor die erste Abfrage
// läuft. Ein neu gerenderter Block fragt also einmal, mit der richtigen Auswahl.
//
// **Bedienelement** (Entscheidung der Sitzung vom 2026-11-03): je Filter ein
// natives Auswahlfeld mit sichtbarer Beschriftung, die das Feld umschließt und
// ihm so seinen Namen gibt. Der erste Eintrag ist immer «alle» (Wert `null`),
// danach die aufgezählten Werte in ihrer Reihenfolge oder die Werte aus dem
// Bestand über `dashboard:filterWerte`, alphabetisch nach der Oberflächen-
// Sprache. Alles aus dem Bestand kommt als Text in den Baum (`textContent`,
// `option.value`), nie als Markup.
//
// **Bündelung** (Entscheidung der Sitzung vom 2026-11-03): Mehrere Wechsel
// innerhalb von 150 ms lösen eine Neu-Befüllung aus, ein Zeitgeber je Block.
// Neu befüllt werden nur die Kacheln, deren Abfrage einen Platzhalter eines
// geänderten Filters trägt; die übrigen bleiben unberührt.
//
// **Werte beim Index-Nachzug** (Entscheidung der Sitzung vom 2026-11-03): über
// dieselben beiden Anstöße, mit denen die Abfrage-Container ihren Live-Nachzug
// bekommen, die Index-Invalidierung und die Änderung der Puffer-Schicht. Das
// Modul hört selbst, wie die beiden Graphen-Verbraucher (`graph/graph-tab.js`,
// `file-graph-panel.js`); es fragt nie im Takt. Die getroffene Auswahl bleibt.
//
// **Warum der Fenster-Zustand hereingereicht und nicht importiert wird** (Muster
// `initCanvasBlock`): Ein Import von `app-state.js` oder `editor.js` zöge diesen
// Ordner in den eingefrorenen Datei-Zyklus des Anzeige-Prozesses
// (`scripts/ordner-import-ausnahme.json`). Aus demselben Grund steht der Name des
// Puffer-Ereignisses hier als Wort; seine Quelle ist `INDEX_OVERLAY_EVENT` in
// `editor/editor.js`, und ein Prüffall hält beide gleich.

import { api } from '../app/api.js';
import { t, intlLocale } from '../../i18n.js';
import { befuelleAbfrageContainer } from '../query/frontmatter-query-view.js';
import { activeTabOfPane, renderedPaneIndex } from '../views/pane-lookup.js';
import {
  HOECHSTENS_FILTER,
  schluesselDes,
  signaturDer,
  gemerkteWerte,
  merkeWerte,
  anfangsWerte,
  optionenDes,
  paramsDer,
  istBetroffen,
} from './dashboard-zustand.js';

// Name des Puffer-Ereignisses, siehe Modul-Kopf.
export const PUFFER_EREIGNIS = 'scg:index-overlay-changed';

// Bündelung der Wechsel und des Nachzugs, je in Millisekunden.
export const BUENDEL_MS = 150;
const NACHZUG_MS = 150;

// Hereingereichter Fenster-Zustand (`state` aus app-state.js) oder null.
let fensterZustand = null;
let nachzugAngemeldet = false;
let nachzugZeitgeber = null;

// Block -> Eintrag mit Filtern, Werten, Zeitgeber und geöffnetem Dokument.
const BLOECKE = new WeakMap();

// Die Filter-Angaben des Kopfes, wie das Markup sie trägt (dashboard-block.js).
function filterAusKopf(block) {
  const kopf = Array.from(block.children).find((k) => k.classList.contains('dashboard-kopf'));
  if (!kopf) return [];
  const filter = [];
  for (const el of kopf.querySelectorAll('.dashboard-filter[data-filter-name]')) {
    if (filter.length >= HOECHSTENS_FILTER) break;
    let werte = null;
    if (el.dataset.filterWerte !== undefined) {
      try {
        const liste = JSON.parse(el.dataset.filterWerte);
        werte = Array.isArray(liste) ? liste.filter((w) => typeof w === 'string') : [];
      } catch {
        werte = [];
      }
    }
    filter.push({
      el,
      name: el.dataset.filterName,
      titel: el.dataset.filterTitel || el.dataset.filterName,
      werte,
      eigenschaft: werte ? null : el.dataset.filterEigenschaft || el.dataset.filterName,
      vorbelegung:
        typeof el.dataset.filterVorbelegung === 'string' ? el.dataset.filterVorbelegung : null,
      bestand: null,
      ladeFolge: 0,
      select: null,
    });
  }
  return filter;
}

// Die Daten-Kacheln des Blocks selbst, ohne die eines inneren Dashboards.
function kachelnDes(block) {
  return Array.from(
    block.querySelectorAll(
      '.dashboard-kachel-inhalt[data-db-query], .dashboard-kachel-inhalt[data-dashboard-abfrage]',
    ),
  ).filter((el) => el.closest('.perspective-dashboard') === block);
}

// Ein Block in einer Einbettung unterhalb des Containers gehört zu deren
// eigenem Durchgang, der ihn mit dem Pfad der eingebetteten Datei nimmt.
function gehoertZu(block, container) {
  const einbettung = block.closest('.wiki-embed-md-body');
  return !einbettung || einbettung === container || !container.contains(einbettung);
}

function vergleich() {
  const collator = new Intl.Collator(intlLocale() || undefined);
  return (a, b) => collator.compare(a, b);
}

function setzeParams(eintrag) {
  const params = paramsDer(eintrag.filter, eintrag.werte);
  for (const el of kachelnDes(eintrag.block)) el.dataset.fmParams = params;
}

function fuelleOptionen(eintrag, index) {
  const f = eintrag.filter[index];
  if (!f.select) return;
  const gewaehlt = eintrag.werte[index];
  const select = f.select;
  select.textContent = '';
  const alle = document.createElement('option');
  alle.value = '';
  alle.textContent = t('dashboard.hint.filterAlle');
  select.appendChild(alle);
  for (const wert of optionenDes(f, f.bestand, gewaehlt, vergleich())) {
    const option = document.createElement('option');
    option.value = wert;
    option.textContent = wert;
    select.appendChild(option);
  }
  select.value = gewaehlt === null ? '' : gewaehlt;
}

function wendeAn(eintrag) {
  eintrag.zeitgeber = null;
  const geaendert = Array.from(eintrag.geaendert);
  eintrag.geaendert.clear();
  for (const el of kachelnDes(eintrag.block)) {
    if (!el.classList.contains('perspective-query')) continue;
    if (!istBetroffen(el.dataset.fmQuery, geaendert)) continue;
    befuelleAbfrageContainer(el, el.dataset.fmBase || eintrag.basePath);
  }
}

function waehle(eintrag, index, wert) {
  if (eintrag.werte[index] === wert) return;
  eintrag.werte[index] = wert;
  merkeWerte(eintrag.dokument, eintrag.schluessel, eintrag.signatur, eintrag.werte);
  setzeParams(eintrag);
  // Ein verschwundener Wert verlässt die Auswahl erst mit einer neuen Wahl.
  fuelleOptionen(eintrag, index);
  eintrag.geaendert.add(eintrag.filter[index].name);
  if (eintrag.zeitgeber) clearTimeout(eintrag.zeitgeber);
  eintrag.zeitgeber = setTimeout(() => wendeAn(eintrag), BUENDEL_MS);
}

function baueFeld(eintrag, index) {
  const f = eintrag.filter[index];
  // Nur ein früheres Feld weicht (etwa im Klon eines Live-Widgets); die
  // Befunde des Filters, die das Markup an seinen Platz setzt
  // (dashboard-block.js), bleiben unter dem Feld stehen.
  for (const alt of f.el.querySelectorAll(':scope > .dashboard-filter-feld')) alt.remove();
  const label = document.createElement('label');
  label.className = 'dashboard-filter-feld';
  const titel = document.createElement('span');
  titel.className = 'dashboard-filter-titel';
  titel.textContent = f.titel;
  const select = document.createElement('select');
  select.className = 'dashboard-filter-auswahl';
  select.dataset.filterName = f.name;
  label.append(titel, select);
  f.el.insertBefore(label, f.el.firstChild);
  f.select = select;
  select.addEventListener('change', () => {
    waehle(eintrag, index, select.value === '' ? null : select.value);
  });
  fuelleOptionen(eintrag, index);
}

async function ladeWerte(eintrag, index) {
  const f = eintrag.filter[index];
  if (!f.eigenschaft || !eintrag.basePath) return;
  if (!api || typeof api.dashboardFilterWerte !== 'function') return;
  const folge = ++f.ladeFolge;
  let antwort;
  try {
    antwort = await api.dashboardFilterWerte(eintrag.basePath, f.eigenschaft);
  } catch {
    return;
  }
  // Eine spätere Anfrage überholt eine frühere; eine unfertige Antwort (Index im
  // Aufbau, abgewiesen) lässt die bisherigen Werte stehen.
  if (folge !== f.ladeFolge) return;
  if (!antwort || antwort.status !== 'ready' || !Array.isArray(antwort.values)) return;
  f.bestand = antwort.values.filter((w) => typeof w === 'string');
  fuelleOptionen(eintrag, index);
}

function ladeAlleWerte(eintrag) {
  eintrag.filter.forEach((f, i) => {
    if (f.eigenschaft) void ladeWerte(eintrag, i);
  });
}

/**
 * Frischt die Werte aus dem Bestand aller sichtbaren Auswahlfelder auf, ohne
 * die getroffene Auswahl zu ändern.
 * @param {ParentNode} [wurzel]
 * @returns {number} Zahl der aufgefrischten Blöcke
 */
export function frischeDashboardFilterAuf(wurzel = document) {
  let anzahl = 0;
  for (const block of wurzel.querySelectorAll('.perspective-dashboard')) {
    const eintrag = BLOECKE.get(block);
    if (!eintrag || !block.isConnected) continue;
    ladeAlleWerte(eintrag);
    anzahl += 1;
  }
  return anzahl;
}

function planeNachzug() {
  if (nachzugZeitgeber) return;
  nachzugZeitgeber = setTimeout(() => {
    nachzugZeitgeber = null;
    frischeDashboardFilterAuf(document);
  }, NACHZUG_MS);
}

function meldeNachzugAn() {
  if (nachzugAngemeldet) return;
  nachzugAngemeldet = true;
  if (api && typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(() => planeNachzug());
  }
  document.addEventListener(PUFFER_EREIGNIS, () => planeNachzug());
}

/**
 * Baut die Auswahlfelder aller Dashboards unter `container` und setzt an ihre
 * Kacheln die Werte der gemerkten Auswahl.
 *
 * Läuft bei jedem Einhängen; ein schon eingerichteter Block wird übergangen, ein
 * geklonter (der Klon eines Live-Widgets verliert seine Zuhörer) neu eingerichtet.
 *
 * @param {ParentNode} container
 * @param {string} basePath Pfad des Dokuments, das die Blöcke trägt; in einer
 *   Einbettung der Pfad der eingebetteten Datei.
 * @param {{panes: Array}} [zustand] Fenster-Zustand für das geöffnete Dokument
 *   der Spalte; ohne ihn bleibt die Auswahl allein im gezeichneten Block.
 * @returns {number} Zahl der eingerichteten Blöcke
 */
export function richteDashboardFilterEin(container, basePath, zustand) {
  if (!container || typeof container.querySelectorAll !== 'function') return 0;
  if (zustand && typeof zustand === 'object') fensterZustand = zustand;
  let anzahl = 0;
  for (const block of container.querySelectorAll('.perspective-dashboard')) {
    if (BLOECKE.has(block) || !gehoertZu(block, container)) continue;
    const filter = filterAusKopf(block);
    if (filter.length === 0) continue;
    const spalte = renderedPaneIndex(block);
    const dokument = fensterZustand ? activeTabOfPane(fensterZustand.panes, spalte) : null;
    const ordnungszahl = parseInt(block.dataset.dashboardIndex, 10) || 0;
    const eintrag = {
      block,
      basePath: basePath || '',
      filter,
      dokument,
      schluessel: schluesselDes(spalte, basePath, ordnungszahl),
      signatur: signaturDer(filter.map((f) => f.name)),
      werte: [],
      geaendert: new Set(),
      zeitgeber: null,
    };
    eintrag.werte = anfangsWerte(
      filter,
      gemerkteWerte(dokument, eintrag.schluessel, eintrag.signatur),
    );
    BLOECKE.set(block, eintrag);
    setzeParams(eintrag);
    filter.forEach((f, i) => baueFeld(eintrag, i));
    ladeAlleWerte(eintrag);
    meldeNachzugAn();
    anzahl += 1;
  }
  return anzahl;
}
