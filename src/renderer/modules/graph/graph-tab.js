// 4T-000455 (Epic 3E-000084): Bereichs-Graph als read-only System-Seite —
// der Link-Graph des gesamten Bereichs in einem eigenen Tab (Muster
// Historien-Seite: eine Instanz pro Fenster, erneutes Öffnen aktiviert den
// bestehenden Tab). Steuerleiste mit Richtungs-Filter, Knoten-Zähler und
// Neu-Layout-Knopf; die Graph-Komponente kommt aus graph-view.js (4T-000454),
// Modell und Erreichbarkeits-Filter aus dem Graph-Kern (4T-000453).
//
// Richtungs-Filter des Bereichs-Graphen: „eingehend"/„ausgehend" wirken
// relativ zur Referenz-Datei — der beim Öffnen bzw. Aktualisieren aktiven
// Markdown-Datei des Fensters. Der Graph zeigt dann nur die von dort über
// Links der gewählten Richtung erreichbaren Knoten (volle Tiefe, im
// Unterschied zur Tiefen-Begrenzung des Datei-Panels). Ohne eine solche
// globale Bezugs-Datei ist ein Richtungs-Filter mathematisch wirkungslos
// (jede Kante ist zugleich aus- und eingehend); ohne Referenz zeigt der
// Graph deshalb alle Kanten plus lokalisierten Hinweis. Design-Entscheidung
// dieser Umsetzung, dokumentiert im Task-Lösungs-Kapitel; Prüf-Punkt der
// PO-Test-Iteration.
//
// 4T-001537 (Epic 3E-000173): Der Reiter traegt seit dieser Aenderung ZWEI
// Darstellungs-Formen derselben Daten — Netz und Baum (Entscheidung V1 des
// Product Owners vom 2026-09-06). Gemeinsam bleiben Titel, Datenquelle
// (graph:edges) und Bereichs-Grenze; getrennt sind Zeichner und Steuerleiste,
// weil Richtungs-Filter und Neu-Layout im Baum gegenstandslos sind und dort
// der Wurzel-Anzeige samt Auf- und Zuklappen weichen.
//
// Modul-Zyklen zu tabs/views sind Laufzeit-Zugriffe; Registrierung explizit
// über initGraphTab aus app-init (kein Modul-Seiteneffekt, Muster
// history-page.js).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { buildGraphModel, neighborhood, buildTreeModel } from '../../../shared/graph-core.js';
import { createGraphView } from './graph-view.js';
import { createTreeView } from './tree-view.js';
// 4T-001538 (Epic 3E-000173): Die Namens-Auswahl aus Mitglied 2 als
// Wurzel-Waehler — derselbe Namensraum, andere Wirkung.
import { zeigeWurzelWahl } from '../datei-oeffnen.js';
// 4T-000952 (Epic 3E-000198, Befund E-05): Meldung der Puffer-Overlay-Schicht.
import { INDEX_OVERLAY_EVENT } from '../editor/editor.js';
import { openOrJumpToPath } from '../bookmarks/bookmarks.js';
import {
  registerSystemPage,
  openSystemPage,
  findSystemTabAcrossPanes,
} from '../app/system-pages.js';
import { showStatusbarHint } from '../views/views.js';

export const GRAPH_PAGE_ID = 'graph';

// Seiten-Zustand: Graph-Instanz, Richtungs-Filter und die Referenz-Datei
// des Richtungs-Filters (beim Öffnen bzw. Refresh aktive Markdown-Datei).
const pageState = {
  container: null,
  view: null,
  direction: 'both',
  referencePath: null,
  countEl: null,
  hintEl: null,
  statusEl: null,
  canvasEl: null,
  // 4T-001537: Baum-Anteil. `form` ist 'netz' oder 'baum' und lebt im
  // Seiten-Zustand, NICHT in den Einstellungen: Der Reiter ist eine
  // System-Seite ohne Sitzungs-Persistenz, eine gespeicherte Form
  // widerspraeche dem. `rootPath` ist die Wurzel des Baums; null heisst
  // «noch nicht bestimmt» und loest die Vorgabe-Kette aus.
  form: 'netz',
  rootPath: null,
  treeView: null,
  treeEl: null,
  netGroupEl: null,
  treeGroupEl: null,
  rootLabelEl: null,
  footerEl: null,
  formEl: null,
};

// Aktive Markdown-Datei des Fensters (Pfad-Tabs zählen, System-/Handbuch-
// Tabs nicht): zuerst die aktive Spalte, dann die andere.
function activeFilePath() {
  const order = [state.activePaneIndex, state.activePaneIndex === 0 ? 1 : 0];
  for (const paneIdx of order) {
    const pane = state.panes[paneIdx];
    const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    if (tab && tab.path && !tab.manualPage && !tab.systemPage) return tab.path;
  }
  return null;
}

// Öffnet den Bereichs-Graph (Menü, Kontextmenü des Bereichs-Panels).
// Ohne Bereich lokalisierter Hinweis statt Seite (der Menü-Eintrag ist
// zusätzlich deaktiviert; der Guard deckt Kontextmenü- und Kürzel-Pfad ab).
export function openAreaGraphTab() {
  if (!state.areaPath) {
    showStatusbarHint('graph.noArea', { duration: 3000, error: true });
    return;
  }
  pageState.referencePath = activeFilePath();
  openSystemPage(GRAPH_PAGE_ID);
  void loadAndRender();
}

// 4T-001537: Vorgabe-Wurzel des Baums nach Kriterium (a) des Product Owners:
// die Start-Seite des Bereichs, ersatzweise die aktive Datei. Eine
// Festlegung, die ins Leere zeigt (`missing`), gilt als nicht gesetzt — sie
// steht ohnehin in keinem Index. null heisst «keine Wurzel bestimmbar» und
// fuehrt zum Hinweis statt zu einem leeren Baum.
async function vorgabeWurzel() {
  try {
    const treffer = await api.getAreaStartPage();
    if (treffer && treffer.path && !treffer.missing) return treffer.path;
  } catch {
    // Keine Start-Seite ermittelbar: die aktive Datei traegt weiter.
  }
  // pageState.referencePath ZUERST: Sobald dieser Reiter offen ist, ist ER
  // der aktive Tab, und activeFilePath() ueberspringt System-Seiten — es
  // liefert dann null, obwohl der Anwender sehr wohl eine Datei offen hat.
  // referencePath haelt die beim Oeffnen aktive Markdown-Datei; genau darauf
  // bezieht sich auch der Richtungs-Filter des Netzes.
  return pageState.referencePath || activeFilePath();
}

// 4T-001538: Wurzel setzen und den Baum zeigen. EIN Einstieg fuer beide
// Wege — die Wurzel-Anzeige der Steuerleiste und den Kontextmenue-Eintrag des
// Bereichs-Panels. Der Reiter wird geoeffnet und die Form auf Baum gestellt,
// falls noetig: Ein Eintrag, der still eine Wurzel setzt, ohne dass sich
// sichtbar etwas aendert, waere fuer den Anwender wirkungslos.
export function setzeBaumWurzel(absPath) {
  if (!absPath) return;
  if (!pageState.container || !findSystemTabAcrossPanes(GRAPH_PAGE_ID)) openAreaGraphTab();
  // Form und Wurzel NACH dem Oeffnen setzen: onOpen stellt beide auf ihre
  // Vorgaben zurueck (Netz, keine Wurzel), und diese Handlung ist gerade die
  // Abweichung davon. Vorher gesetzt waeren sie stillschweigend verworfen.
  pageState.rootPath = absPath;
  pageState.form = 'baum';
  if (pageState.formEl) pageState.formEl.value = 'baum';
  wendeFormAn();
  void loadAndRender();
}

// --- Daten laden und rendern -----------------------------------------------------

let reloadTimer = null;

async function loadAndRender() {
  const container = pageState.container;
  if (!container || !container.isConnected || !pageState.view) return;
  let result;
  try {
    result = await api.getGraphEdges(null);
  } catch {
    result = null;
  }
  if (!pageState.container || !pageState.container.isConnected) return;
  const status = result && result.status;
  if (status !== 'ready') {
    const key = status === 'indexing' ? 'graph.indexing' : 'graph.loadError';
    setStatusText(t(key));
    return;
  }
  setStatusText(null);

  const model0 = buildGraphModel(result.nodes, result.edges);
  if (pageState.form === 'baum') {
    await zeichneBaum(model0);
    return;
  }
  let model = model0;
  const reference = pageState.referencePath;
  const hasReference = !!reference && model.nodes.some((n) => n.id === reference);
  let missingReference = false;
  if (pageState.direction !== 'both') {
    if (hasReference) {
      model = neighborhood(model, reference, {
        depth: Infinity,
        direction: pageState.direction,
      });
    } else {
      missingReference = true;
    }
  }
  pageState.view.setData(model, { activeId: hasReference ? reference : null });
  if (pageState.hintEl) pageState.hintEl.hidden = !missingReference;
  updateCount();
}

// 4T-001537: Baum-Form. Ohne bestimmbare Wurzel bleibt die Flaeche leer und
// der Hinweis steht an der Stelle, an der sonst der Baum stuende — dasselbe
// Muster wie die fehlende Bezugs-Datei des Netzes.
async function zeichneBaum(model) {
  if (!pageState.rootPath) pageState.rootPath = await vorgabeWurzel();
  if (!pageState.container || !pageState.container.isConnected) return;
  const tree = buildTreeModel(model, pageState.rootPath);
  if (!tree.root) {
    if (pageState.treeView) pageState.treeView.setData(null);
    setStatusText(t('graph.tree.noRoot'));
    if (pageState.rootLabelEl) {
      pageState.rootLabelEl.textContent = '—';
      pageState.rootLabelEl.title = t('graph.tree.chooseRoot');
    }
    if (pageState.footerEl) pageState.footerEl.hidden = true;
    if (pageState.countEl) pageState.countEl.textContent = '';
    return;
  }
  setStatusText(null);
  if (pageState.treeView) pageState.treeView.setData(tree);
  const wurzelName = tree.nodes.find((n) => n.id === tree.root).name;
  if (pageState.rootLabelEl) {
    pageState.rootLabelEl.textContent = wurzelName;
    pageState.rootLabelEl.title = `${t('graph.tree.chooseRoot')} (${tree.root})`;
  }
  if (pageState.countEl) {
    pageState.countEl.textContent = t('graph.nodeCount').replace(
      '{count}',
      String(tree.nodes.length),
    );
  }
  if (pageState.footerEl) {
    pageState.footerEl.hidden = tree.unreachable === 0;
    pageState.footerEl.textContent = t('graph.tree.unreachable').replace(
      '{count}',
      String(tree.unreachable),
    );
  }
}

// 4T-001537: Sichtbarkeit der beiden Steuerleisten-Gruppen und der beiden
// Zeichen-Flaechen. Eine Stelle, damit Form-Wechsel und Erst-Aufbau nicht
// auseinanderlaufen koennen.
function wendeFormAn() {
  const baum = pageState.form === 'baum';
  if (pageState.netGroupEl) pageState.netGroupEl.hidden = baum;
  if (pageState.treeGroupEl) pageState.treeGroupEl.hidden = !baum;
  if (pageState.canvasEl) pageState.canvasEl.hidden = baum;
  if (pageState.treeEl) pageState.treeEl.hidden = !baum;
  if (pageState.footerEl && !baum) pageState.footerEl.hidden = true;
}

function setStatusText(text) {
  if (!pageState.statusEl || !pageState.canvasEl) return;
  pageState.statusEl.hidden = !text;
  pageState.statusEl.textContent = text || '';
  pageState.canvasEl.classList.toggle('graph-canvas-hidden', !!text);
}

function updateCount() {
  if (!pageState.countEl || !pageState.view) return;
  const { nodeCount } = pageState.view.getStats();
  pageState.countEl.textContent = t('graph.nodeCount').replace('{count}', String(nodeCount));
}

// --- Seiten-DOM -------------------------------------------------------------------

function buildPage(container) {
  container.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'graph-page';

  const toolbar = document.createElement('div');
  toolbar.className = 'graph-toolbar';

  // 4T-001537: Der Form-Umschalter steht VOR beiden Gruppen und bleibt in
  // jeder Form sichtbar — er ist das eine Bedienelement, das beide teilen.
  const formLabel = document.createElement('label');
  formLabel.className = 'graph-form-label';
  formLabel.textContent = t('graph.form.label');
  const formSelect = document.createElement('select');
  formSelect.className = 'graph-form';
  for (const [value, key] of [
    ['netz', 'graph.form.net'],
    ['baum', 'graph.form.tree'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    formSelect.appendChild(option);
  }
  formSelect.value = pageState.form;
  formSelect.addEventListener('change', () => {
    pageState.form = formSelect.value;
    wendeFormAn();
    void loadAndRender();
  });
  formLabel.appendChild(formSelect);
  toolbar.appendChild(formLabel);

  const netGroup = document.createElement('span');
  netGroup.className = 'graph-toolbar-group';

  const label = document.createElement('label');
  label.className = 'graph-direction-label';
  label.textContent = t('graph.directionLabel');
  const select = document.createElement('select');
  select.className = 'graph-direction';
  for (const [value, key] of [
    ['both', 'graph.direction.both'],
    ['in', 'graph.direction.in'],
    ['out', 'graph.direction.out'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    select.appendChild(option);
  }
  select.value = pageState.direction;
  select.addEventListener('change', () => {
    pageState.direction = select.value;
    // Referenz beim Umschalten frisch bestimmen — die zuletzt aktive
    // Markdown-Datei kann seit dem Öffnen gewechselt haben.
    pageState.referencePath = activeFilePath() || pageState.referencePath;
    void loadAndRender();
  });
  label.appendChild(select);
  netGroup.appendChild(label);

  const hint = document.createElement('span');
  hint.className = 'graph-reference-hint';
  hint.hidden = true;
  hint.textContent = t('graph.noReference');
  netGroup.appendChild(hint);

  const relayout = document.createElement('button');
  relayout.type = 'button';
  relayout.className = 'graph-relayout';
  relayout.textContent = t('graph.relayout');
  relayout.addEventListener('click', () => {
    if (!pageState.view) return;
    pageState.view.relayout();
    updateCount();
  });
  netGroup.appendChild(relayout);
  toolbar.appendChild(netGroup);

  // 4T-001537: Die Baum-Gruppe.
  const treeGroup = document.createElement('span');
  treeGroup.className = 'graph-toolbar-group';
  treeGroup.hidden = true;

  const rootLabel = document.createElement('span');
  rootLabel.className = 'graph-tree-root-label';
  rootLabel.textContent = t('graph.tree.rootLabel');
  // 4T-001538: Die Wurzel-Anzeige IST der Knopf zur Namens-Auswahl. Ein
  // <button> und kein Klick-Handler auf einem <span>: Fokussierbarkeit und
  // Eingabe-Auslösung bringt das Element von sich aus mit.
  const rootName = document.createElement('button');
  rootName.type = 'button';
  rootName.className = 'graph-tree-root';
  rootName.addEventListener('click', () => {
    void zeigeWurzelWahl(async (pfad) => setzeBaumWurzel(pfad));
  });
  rootLabel.appendChild(rootName);
  treeGroup.appendChild(rootLabel);

  for (const [key, klasse, wirkung] of [
    ['graph.tree.expandAll', 'graph-tree-expand-all', 'alleAuf'],
    ['graph.tree.collapseAll', 'graph-tree-collapse-all', 'alleZu'],
  ]) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = klasse;
    knopf.textContent = t(key);
    knopf.addEventListener('click', () => {
      if (!pageState.treeView) return;
      pageState.treeView[wirkung]();
    });
    treeGroup.appendChild(knopf);
  }
  toolbar.appendChild(treeGroup);

  // Der Zaehler steht ausserhalb beider Gruppen: Er zaehlt in beiden Formen,
  // im Netz die Knoten und im Baum die Zeilen des Baums.
  const count = document.createElement('span');
  count.className = 'graph-node-count';
  toolbar.appendChild(count);

  page.appendChild(toolbar);

  const canvas = document.createElement('div');
  canvas.className = 'graph-canvas';
  page.appendChild(canvas);

  const treeWrap = document.createElement('div');
  treeWrap.className = 'graph-tree-wrap';
  treeWrap.hidden = true;
  page.appendChild(treeWrap);

  // 4T-001537: Fusszeile mit der Zahl der von der Wurzel nicht erreichbaren
  // Dateien (Entscheidung V5). Bei null bleibt sie verborgen — eine Null
  // an dieser Stelle waere eine Meldung ueber ein Nicht-Ereignis.
  const footer = document.createElement('div');
  footer.className = 'graph-tree-footer';
  footer.hidden = true;
  page.appendChild(footer);

  const statusEl = document.createElement('div');
  statusEl.className = 'graph-status';
  statusEl.hidden = true;
  page.appendChild(statusEl);

  container.appendChild(page);

  pageState.countEl = count;
  pageState.hintEl = hint;
  pageState.statusEl = statusEl;
  pageState.canvasEl = canvas;
  pageState.netGroupEl = netGroup;
  pageState.treeGroupEl = treeGroup;
  pageState.rootLabelEl = rootName;
  pageState.formEl = formSelect;
  pageState.treeEl = treeWrap;
  pageState.footerEl = footer;
  pageState.view = createGraphView(canvas, {
    t,
    onOpenFile: (id) => void openOrJumpToPath(id),
  });
  pageState.treeView = createTreeView(treeWrap, {
    t,
    onOpenFile: (id) => void openOrJumpToPath(id),
  });
  wendeFormAn();
}

// --- Registrierung -----------------------------------------------------------------

export function initGraphTab() {
  registerSystemPage({
    id: GRAPH_PAGE_ID,
    titleKey: 'graph.pageTitle',
    // Dynamischer Tab-Titel „Graph: <Bereichs-Name>" (Task-Vorgabe); der
    // titleKey bleibt Fallback ohne Bereichs-Namen.
    title() {
      return state.areaName ? `${t('graph.pageTitle')}: ${state.areaName}` : t('graph.pageTitle');
    },
    onOpen() {
      // Frischer Seiten-Zustand pro Neu-Öffnen (Muster Einstellungs-Seite):
      // Richtung zurück auf den Default; Positionen entstehen ohnehin neu.
      // 4T-001537: Form und Wurzel gehören dazu — die Wurzel auf null, damit
      // die Vorgabe-Kette beim nächsten Zeichnen erneut greift.
      pageState.direction = 'both';
      pageState.form = 'netz';
      pageState.rootPath = null;
    },
    mount(container) {
      // Re-Mount (Erst-Anzeige, Sprachwechsel, Pane-Wechsel) baut die Seite
      // samt Graph-Instanz neu; Knoten-Positionen entstehen dann frisch —
      // bewusste Vereinfachung, innerhalb einer Anzeige hält der
      // Mount-Guard von system-pages das DOM samt Positionen stabil.
      if (pageState.view) pageState.view.destroy();
      if (pageState.treeView) pageState.treeView.destroy();
      pageState.container = container;
      buildPage(container);
      void loadAndRender();
    },
    onClose() {
      if (pageState.view) pageState.view.destroy();
      if (pageState.treeView) pageState.treeView.destroy();
      pageState.view = null;
      pageState.treeView = null;
      pageState.container = null;
    },
  });

  // Index-Invalidierung (Watcher, Initial-Aufbau fertig) lädt debounced
  // nach; das inkrementelle Layout erhält bestehende Positionen (4T-000453).
  if (typeof api.onBacklinksInvalidated === 'function') {
    api.onBacklinksInvalidated(() => planeNachladen());
  }
  // 4T-000952 (Epic 3E-000198, Befund E-05): Derselbe Weg fuer den Puffer-
  // Overlay. Der Graph liest ihn seit diesem Vorgang, und ohne den Anstoss
  // bliebe die Umstellung wirkungslos — die Platte meldet beim Tippen nichts,
  // also zeichnete der Reiter erst beim naechsten Speichern neu.
  document.addEventListener(INDEX_OVERLAY_EVENT, () => planeNachladen());
}

// Gemeinsamer Nachlade-Takt beider Anstoesse (4T-000952). Die Vorpruefung
// bleibt vor dem Timer: Ohne offenen Graph-Reiter wird gar nichts geplant.
function planeNachladen() {
  if (!pageState.container || !findSystemTabAcrossPanes(GRAPH_PAGE_ID)) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    void loadAndRender();
  }, 250);
}
