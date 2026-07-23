// 4T-0333 (Epic 3E-0060): Historien-Ansicht als read-only System-Seite.
//
// Pro Fenster eine Instanz (Muster der Einstellungs-Seite); die Seite ist
// an ein Ziel-Dokument gebunden (Modul-Zustand), erneutes Öffnen für ein
// anderes Dokument bindet die bestehende Instanz um. Inhalt: Revisionsliste
// (Zeitstempel lokal angezeigt, gespeichert bleibt UTC; Auslöser;
// Umfangs-Angabe +x/−y Zeilen), Revision ansehen (read-only), Vergleich
// zweier Revisionen bzw. gegen den Ist-Stand (Zeilen-Diff mit Hunks) und
// Wiederherstellen (lädt den Stand in den Editor-Tab; das normale
// Speichern erzeugt die nächste Revision — MediaWiki-Semantik der
// Epic-Entscheidung, es wird nie Historie gelöscht).
//
// Modul-Zyklen zu tabs/views sind Laufzeit-Zugriffe (Muster 4T-0179).
'use strict';

import { t } from '../i18n.js';
import { api } from './api.js';
import { getPaneEls, state } from './app-state.js';
import { diffLines, buildDiffRows } from '../../shared/line-diff.js';
import { syncEditorForPane, updateWindowTitle } from './editor.js';
import { applyRenderPipeline } from './render-mermaid.js';
import { registerSystemPage, openSystemPage, findSystemTabAcrossPanes } from './system-pages.js';
import { activatePane, activateTab, findTabAcrossPanes, openInPane } from './tabs.js';
import { renderTabbar, showStatusbarHint } from './views.js';

export const HISTORY_PAGE_ID = 'history';

// Seiten-Zustand: Ziel-Dokument, geladene Liste, Auswahl der zwei
// Vergleichs-Stände ('current' = Ist-Stand) und der Detail-Bereich.
const pageState = {
  path: null,
  list: null, // { initial, revisions } | null
  error: null,
  selectA: -1, // Von-Auswahl (seq; -1 = Ausgangsstand)
  selectB: 'current', // Bis-Auswahl (seq oder 'current')
  container: null,
};

// Öffnet die Historien-Ansicht für das aktive Dokument (Menü, Statusbar).
export function openHistoryPageForActiveTab() {
  const pane = state.panes[state.activePaneIndex];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab || tab.systemPage || tab.manualPage || !tab.path) return;
  openHistoryPage(tab.path);
}

export function openHistoryPage(filePath) {
  const rebind = pageState.path !== filePath;
  pageState.path = filePath;
  if (rebind) {
    pageState.list = null;
    pageState.error = null;
    pageState.selectA = -1;
    pageState.selectB = 'current';
  }
  // 4T-0648 (Epic 3E-0130): Die Historie ist eine Folge-Ansicht ihres
  // Dokuments — ihr Reiter liegt unmittelbar rechts neben dem Reiter des
  // Dokuments, und beim Umbinden wandert er mit.
  openSystemPage(HISTORY_PAGE_ID, { nextToPath: filePath });
  // Bestehende Instanz auf das neue Ziel umbinden bzw. Daten laden.
  void loadAndRender();
}

async function loadAndRender() {
  if (!pageState.path) return;
  const res = await api.getHistoryList(pageState.path);
  if (!res || !res.ok) {
    pageState.list = null;
    pageState.error = (res && res.error) || 'unknown';
  } else {
    pageState.list = res;
    pageState.error = null;
    // Default-Auswahl: juengste Revision gegen den Ist-Stand.
    const n = res.revisions.length;
    pageState.selectA = n > 1 ? n - 2 : -1;
    pageState.selectB = 'current';
  }
  renderContent();
}

// --- Rendering ----------------------------------------------------------------

// Lokale Zeitstempel-Anzeige (gespeichert bleibt UTC). PO-Befund der
// Test-Iteration 0.40.0: feste Stellenzahl statt Locale-Default — Tag,
// Monat, Stunde, Minute und Sekunde immer zweistellig, Jahr vierstellig;
// Reihenfolge und Trennzeichen weiterhin gemaess UI-Sprache.
function localTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString(state.language || undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function baseName(p) {
  const s = String(p || '');
  const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return idx >= 0 ? s.slice(idx + 1) : s;
}

function renderContent() {
  const container = pageState.container;
  if (!container || !container.isConnected) return;
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'history-page';

  const heading = document.createElement('h3');
  heading.className = 'history-heading';
  heading.textContent = `${t('history.pageTitle')} — ${baseName(pageState.path)}`;
  root.appendChild(heading);

  if (pageState.error) {
    const err = document.createElement('p');
    err.className = 'history-empty';
    err.textContent = t('history.page.loadError');
    root.appendChild(err);
    container.appendChild(root);
    return;
  }
  const list = pageState.list;
  if (!list || (!list.initial && list.revisions.length === 0)) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = t('history.page.empty');
    root.appendChild(empty);
    container.appendChild(root);
    return;
  }

  // Revisionsliste: neueste zuerst; darüber der Ist-Stand als Vergleichsziel.
  const table = document.createElement('table');
  table.className = 'history-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const key of [
    'history.page.colFrom',
    'history.page.colTo',
    'history.page.colTime',
    'history.page.colTrigger',
    'history.page.colChanges',
    null,
  ]) {
    const th = document.createElement('th');
    if (key) th.textContent = t(key);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  const addRow = ({ seq, label, trigger, changes, canRestore }) => {
    const tr = document.createElement('tr');
    const tdA = document.createElement('td');
    const tdB = document.createElement('td');
    // Ist-Stand ist kein Von-Kandidat (Vergleich laeuft immer aeltere ->
    // neuere Richtung); alles andere ist in beiden Gruppen waehlbar.
    if (seq !== 'current') {
      const radioA = document.createElement('input');
      radioA.type = 'radio';
      radioA.name = 'history-from';
      radioA.checked = pageState.selectA === seq;
      radioA.addEventListener('change', () => {
        pageState.selectA = seq;
      });
      tdA.appendChild(radioA);
    }
    const radioB = document.createElement('input');
    radioB.type = 'radio';
    radioB.name = 'history-to';
    radioB.checked = pageState.selectB === seq;
    radioB.addEventListener('change', () => {
      pageState.selectB = seq;
    });
    tdB.appendChild(radioB);
    tr.appendChild(tdA);
    tr.appendChild(tdB);
    const tdTime = document.createElement('td');
    tdTime.textContent = label;
    tr.appendChild(tdTime);
    const tdTrigger = document.createElement('td');
    tdTrigger.textContent = trigger;
    tr.appendChild(tdTrigger);
    const tdChanges = document.createElement('td');
    tdChanges.className = 'history-changes';
    tdChanges.textContent = changes;
    tr.appendChild(tdChanges);
    const tdActions = document.createElement('td');
    tdActions.className = 'history-actions';
    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.textContent = t('history.page.view');
    viewBtn.addEventListener('click', () => void showRevision(seq));
    tdActions.appendChild(viewBtn);
    if (canRestore) {
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.textContent = t('history.page.restore');
      restoreBtn.addEventListener('click', () => void restoreRevision(seq));
      tdActions.appendChild(restoreBtn);
    }
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  };

  addRow({
    seq: 'current',
    label: t('history.page.current'),
    trigger: '',
    changes: '',
    canRestore: false,
  });
  for (let i = list.revisions.length - 1; i >= 0; i--) {
    const rev = list.revisions[i];
    addRow({
      seq: rev.seq,
      label: localTimestamp(rev.tsEnd || rev.ts),
      trigger: t(rev.trigger === 'external' ? 'history.trigger.external' : 'history.trigger.edit'),
      changes: `+${rev.added} −${rev.removed}`,
      canRestore: true,
    });
  }
  if (list.initial) {
    addRow({
      seq: -1,
      label: `${t('history.page.initial')} (${localTimestamp(list.initial.ts)})`,
      trigger: '',
      changes: '',
      canRestore: true,
    });
  }
  table.appendChild(tbody);
  root.appendChild(table);

  const compareBtn = document.createElement('button');
  compareBtn.type = 'button';
  compareBtn.className = 'history-compare-btn';
  compareBtn.textContent = t('history.page.compare');
  compareBtn.addEventListener('click', () => void showComparison());
  root.appendChild(compareBtn);

  const view = document.createElement('div');
  view.className = 'history-view';
  root.appendChild(view);

  container.appendChild(root);
}

function viewContainer() {
  const container = pageState.container;
  return container ? container.querySelector('.history-view') : null;
}

async function showRevision(seq) {
  const res = await api.getHistoryRevision(pageState.path, seq);
  const view = viewContainer();
  if (!view) return;
  view.innerHTML = '';
  if (!res || !res.ok) {
    view.textContent = t('history.page.loadError');
    return;
  }
  const pre = document.createElement('pre');
  pre.className = 'history-text';
  pre.textContent = res.text;
  view.appendChild(pre);
}

async function showComparison() {
  const view = viewContainer();
  if (!view) return;
  const [a, b] = await Promise.all([
    api.getHistoryRevision(pageState.path, pageState.selectA),
    api.getHistoryRevision(pageState.path, pageState.selectB),
  ]);
  view.innerHTML = '';
  if (!a || !a.ok || !b || !b.ok) {
    view.textContent = t('history.page.loadError');
    return;
  }
  const ops = diffLines(a.text, b.text);
  if (ops.length === 0) {
    view.textContent = t('history.page.diffEmpty');
    return;
  }
  const rows = buildDiffRows(a.text, ops);
  const diffEl = document.createElement('div');
  diffEl.className = 'history-diff';
  for (const row of rows) {
    const line = document.createElement('div');
    if (row.type === 'gap') {
      line.className = 'history-diff-gap';
      line.textContent = '⋯';
    } else {
      line.className = `history-diff-line history-diff-${row.type}`;
      const marker = row.type === 'ins' ? '+' : row.type === 'del' ? '−' : ' ';
      line.textContent = `${marker} ${row.text}`;
    }
    diffEl.appendChild(line);
  }
  view.appendChild(diffEl);
}

// Wiederherstellen = neuer Edit: Stand in den Editor-Tab des Dokuments
// laden (Tab wird dirty), das normale Speichern erzeugt das naechste Paket.
async function restoreRevision(seq) {
  const res = await api.getHistoryRevision(pageState.path, seq);
  if (!res || !res.ok) {
    showStatusbarHint('history.page.loadError', { duration: 4000, error: true });
    return;
  }
  let found = findTabAcrossPanes(pageState.path);
  if (!found) {
    await openInPane(state.activePaneIndex, [pageState.path]);
    found = findTabAcrossPanes(pageState.path);
  }
  if (!found) return;
  const tab = state.panes[found.paneIdx].tabs[found.tabIdx];
  activatePane(found.paneIdx);
  activateTab(found.paneIdx, found.tabIdx);
  if (tab.content !== res.text) {
    tab.content = res.text;
    tab.dirty = tab.content !== tab.originalContent;
    syncEditorForPane(found.paneIdx);
    const els = getPaneEls(found.paneIdx);
    if (els && els.renderedHtml) {
      els.renderedHtml.innerHTML = api.renderMarkdown(tab.content, tab.path);
      applyRenderPipeline(els.renderedHtml, tab.path);
    }
    renderTabbar(found.paneIdx);
    updateWindowTitle();
  }
  showStatusbarHint('history.restoredHint', { duration: 4000 });
}

// --- Registrierung -------------------------------------------------------------

// Bewusst KEIN Modul-Seiteneffekt (anders als die Einstellungs-Seite):
// dieses Modul liegt im Import-Zyklus tabs -> history-status -> history-page
// -> system-pages -> tabs. Eine Registrierung zur Modul-Ladezeit liefe,
// waehrend die Registry-Konstante von system-pages noch nicht initialisiert
// ist (TDZ). app-init ruft die Registrierung nach dem Laden aller Module.
export function initHistoryPage() {
  registerSystemPage({
    id: HISTORY_PAGE_ID,
    titleKey: 'history.pageTitle',
    mount(container) {
      pageState.container = container;
      renderContent();
      // Erst-Mount ohne geladene Daten: nachladen.
      if (pageState.path && !pageState.list && !pageState.error) void loadAndRender();
    },
    onClose() {
      pageState.container = null;
    },
  });
}

// Fuer Aufrufer, die pruefen wollen, ob die Seite offen ist (Tests/Debug).
export function historyPageOpen() {
  return !!findSystemTabAcrossPanes(HISTORY_PAGE_ID);
}
