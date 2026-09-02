// 4T-000844 (Epic 3E-000147): Inhaltsverzeichnis-Panel des Buches (Story 4S-000753).
//
// Zeigt den Kapitel-Baum des aktiven Buches in der erklärten Reihenfolge,
// hebt das gerade gelesene Kapitel hervor und öffnet ein Kapitel per Klick.
// Unter dem Baum steht der Abschnitt „nicht eingehängt" mit den
// Markdown-Dateien des Buch-Ordners außerhalb des Baums; ein deklariertes
// Kapitel ohne Datei erscheint markiert. Im Kopf führen zwei Knöpfe eine
// Position vor bzw. zurück durch die Lese-Ordnung (die vollständige
// Leseführung über Kapitel-Grenzen trägt 4T-000846).
//
// Dieses Modul zeigt an und wählt aus; es liest und schreibt keine Datei.
// Der Buch-Zustand kommt ausschließlich über den Preload-Namensraum `books`
// herein (getState einmalig, onStateChanged laufend), das Öffnen eines
// Kapitels und jede Struktur-Änderung gehen denselben Weg zurück. Der Zugriff
// ist deshalb an genau einer Stelle gekapselt (booksApi in book-state.js):
// fehlt der Namensraum, bleibt das Panel beim Leer-Hinweis stehen, statt die
// Oberfläche mit Fehlern zu belasten. Insbesondere hält der Renderer KEINEN
// eigenen Kapitel-Baum: jede Operation geht als eine Meldung an den
// Main-Prozess, der schreibt und den neuen Zustand zurückmeldet.
//
// 4T-000980 (Epic 3E-000196): Der Kern ist auf Anzeige, Leseführung, Sichtbarkeit
// und Verdrahtung zurückgeschnitten. Die Struktur-Pflege (4T-000845) liegt in
// book-structure.js, das Verschieben und die Reparatur (4T-000847, 4T-000848) in
// book-repair.js, die reinen Helfer in book-helpers.js und der geteilte
// Zustand in book-state.js.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { applySidebarVisibility } from '../panels/panels.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { persistSetting, showStatusbarHint } from '../views/views.js';

import { chapterLabel, pathKey, readingTarget } from './book-helpers.js';
import {
  activeBook,
  activeChapter,
  applyBookState,
  booksApi,
  missingKeys,
  openChapter,
  suggestionsFor,
  takePendingFocus,
} from './book-state.js';
import {
  clearDropIndicators,
  endEntryDrag,
  entryDragOver,
  entryDrop,
  handleEntryKey,
  showEntryContextMenu,
  showPanelContextMenu,
  startEntryDrag,
  treeDragOver,
  treeDrop,
} from './book-structure.js';

// --- Rendering ----------------------------------------------------------------

// Eine Eintrags-Zeile: Marker als Anfasser, Beschriftung, voller Pfad als
// Tooltip. Ein fehlendes Kapitel ist markiert und nicht anklickbar — es gibt
// keine Datei zu öffnen, die Reparatur läuft über das Kontextmenü.
//
// 4T-000845: Die Zeile ist fokussierbar (tabindex, Muster der Baum-Zeilen im
// Verschiebe-Dialog der Lesezeichen) und trägt damit die Tastatur-Gesten;
// gezogen wird ausschließlich am Marker, nicht an der ganzen Zeile, weil ein
// Klick auf die Zeile das Kapitel öffnet.
//
// 4T-000848: Gibt es zu einem fehlenden Kapitel einen namensgleichen Fund, trägt
// die Zeile ein zweites, dezentes Zeichen mit Tooltip. Der Vorschlag ist damit
// sichtbar, ohne das Kontextmenü zu öffnen — ausgeführt wird er nie von selbst
// (AK3).
function buildEntryRow(
  relPath,
  depth,
  { missing, active, unlinked = false, paneIdx = 0, suggested = false },
) {
  const row = document.createElement('div');
  row.className = 'book-entry-row';
  row.style.paddingLeft = `${6 + depth * 14}px`;
  row.dataset.pfad = relPath;
  row.tabIndex = 0;
  if (active) row.classList.add('active');
  if (missing) row.classList.add('missing');
  if (unlinked) row.classList.add('unlinked');

  const handle = document.createElement('span');
  handle.className = 'book-entry-handle';
  handle.textContent = '⠿';
  handle.draggable = true;
  handle.title = t('bookPanel.handleTitle');
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('dragstart', (ev) => startEntryDrag(ev, relPath, unlinked));
  handle.addEventListener('dragend', endEntryDrag);
  row.appendChild(handle);

  const label = document.createElement('span');
  label.className = 'book-entry-name';
  label.textContent = chapterLabel(relPath);
  row.appendChild(label);

  if (missing) {
    row.title = `${relPath} (${t('bookPanel.missing')})`;
    const mark = document.createElement('span');
    mark.className = 'book-entry-missing-mark';
    mark.textContent = '!';
    mark.setAttribute('aria-hidden', 'true');
    row.appendChild(mark);
    if (suggested) {
      const hint = document.createElement('span');
      hint.className = 'book-entry-suggest-mark';
      hint.textContent = '⌕';
      hint.title = t('bookPanel.reassignSuggestion');
      row.appendChild(hint);
    }
  } else {
    row.title = relPath;
    row.addEventListener('click', () => openChapter(relPath));
  }

  // Ablage-Ziel ist nur der Baum: der Abschnitt „nicht eingehängt" hat keine
  // Ordnung, in die etwas eingereiht werden könnte (das Aushängen läuft über
  // das Kontextmenü).
  if (!unlinked) {
    row.addEventListener('dragover', (ev) => entryDragOver(ev, row, relPath));
    row.addEventListener('drop', (ev) => entryDrop(ev, row, relPath));
  }
  row.addEventListener('contextmenu', (ev) => showEntryContextMenu(ev, relPath, unlinked, paneIdx));
  row.addEventListener('keydown', (ev) => handleEntryKey(ev, relPath, { unlinked, missing }));
  return row;
}

// Kapitel-Baum in Lese-Reihenfolge: ein Kapitel steht vor seinen
// Unterkapiteln (Muster flattenChapters in src/shared/books/book-core.js).
function buildTreeInto(container, nodes, depth, ctx) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const relPath = node && typeof node.path === 'string' ? node.path : '';
    if (relPath === '') continue;
    const key = pathKey(relPath);
    const missing = ctx.missing.has(key);
    container.appendChild(
      buildEntryRow(relPath, depth, {
        missing,
        active: ctx.active !== null && ctx.active === key,
        paneIdx: ctx.paneIdx,
        suggested: missing && suggestionsFor(ctx.book, relPath).length > 0,
      }),
    );
    buildTreeInto(container, node.children, depth + 1, ctx);
  }
}

export function renderBookPanel(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookSection) return;
  const book = activeBook();
  if (els.bookEmpty) els.bookEmpty.hidden = !!book;
  if (els.bookMain) els.bookMain.hidden = !book;
  updateBookNavButtons(paneIdx);
  if (!book) return;

  const activeKey = pathKey(activeChapter(paneIdx));
  const ctx = {
    missing: missingKeys(book),
    active: activeKey === '' ? null : activeKey,
    paneIdx,
    book,
  };

  if (els.bookTree) {
    const frag = document.createDocumentFragment();
    buildTreeInto(frag, book.tree, 0, ctx);
    els.bookTree.innerHTML = '';
    if (frag.firstChild) {
      els.bookTree.appendChild(frag);
    } else {
      // Ein Buch ohne eingehängtes Kapitel ist ein gültiger Zustand (frisch
      // angelegt); der Hinweis unterscheidet ihn vom fehlenden Buch.
      const hint = document.createElement('div');
      hint.className = 'book-chapters-empty';
      hint.textContent = t('bookPanel.chaptersEmpty');
      els.bookTree.appendChild(hint);
    }
  }

  const unlinked = (Array.isArray(book.unlinked) ? book.unlinked : []).filter(
    (entry) => typeof entry === 'string' && entry !== '',
  );
  if (els.bookUnlinked) els.bookUnlinked.hidden = unlinked.length === 0;
  if (els.bookUnlinkedList) {
    els.bookUnlinkedList.innerHTML = '';
    for (const relPath of unlinked) {
      els.bookUnlinkedList.appendChild(
        buildEntryRow(relPath, 0, {
          missing: false,
          active: ctx.active !== null && ctx.active === pathKey(relPath),
          unlinked: true,
          paneIdx,
        }),
      );
    }
  }

  restorePendingFocus(paneIdx, els);
}

// 4T-000845: Jede Struktur-Änderung baut die Zeilen neu auf, und der Fokus läge
// danach beim Dokument. Ohne Rückgabe an das bewegte Kapitel risse die
// Tastatur-Bedienung nach dem ERSTEN Schritt ab (Muster
// selectBookmarkMoveTarget im Verschiebe-Dialog der Lesezeichen).
function restorePendingFocus(paneIdx, els) {
  const vorgemerkt = takePendingFocus();
  if (vorgemerkt === null || vorgemerkt.paneIdx !== paneIdx) return;
  const key = pathKey(vorgemerkt.path);
  if (!els.bookMain || key === '') return;
  const row = [...els.bookMain.querySelectorAll('.book-entry-row')].find(
    (candidate) => pathKey(candidate.dataset.pfad) === key,
  );
  if (row && typeof row.focus === 'function') row.focus();
}

// --- Leseführung im Panel-Kopf ------------------------------------------------

function navTarget(paneIdx, direction) {
  const book = activeBook();
  if (!book) return null;
  return readingTarget(book.readingOrder, activeChapter(paneIdx), direction);
}

function updateBookNavButtons(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els) return;
  if (els.bookPrevBtn) els.bookPrevBtn.disabled = navTarget(paneIdx, -1) === null;
  if (els.bookNextBtn) els.bookNextBtn.disabled = navTarget(paneIdx, 1) === null;
}

// 4T-000846 (Story 4S-000755): Ein Schritt durch die Lese-Ordnung des aktiven
// Buches. Am Anfang und am Ende gibt es KEINEN Umlauf, sondern eine
// Rückmeldung in der Hinweis-Zeile (AK3) — ein stiller Nicht-Sprung ließe den
// Anwender im Unklaren, ob das Kommando überhaupt ankam. Die Knöpfe im
// Panel-Kopf sind an der Grenze deaktiviert und erreichen den Zweig nicht;
// über Kommando und Tastenkürzel ist er der Regelfall.
export function stepReading(paneIdx, direction) {
  if (!activeBook()) {
    showStatusbarHint('bookPanel.readingNoBook', { duration: 2500, error: true });
    return;
  }
  const target = navTarget(paneIdx, direction);
  if (target === null) {
    showStatusbarHint(direction < 0 ? 'bookPanel.readingAtStart' : 'bookPanel.readingAtEnd', {
      duration: 2000,
    });
    return;
  }
  openChapter(target);
}

// --- Zustands-Meldung des Main-Prozesses --------------------------------------

// Übernimmt einen gemeldeten Buch-Zustand und zeichnet die sichtbaren Panels
// neu. Ein unbrauchbarer Wert fällt auf „kein Buch" zurück, damit ein defekter
// Push das Panel nicht in einem Zwischenstand stehen lässt.
export function setBookState(next) {
  applyBookState(next);
  for (let i = 0; i < state.panes.length; i++) {
    if (getBookPanelVisible(i)) renderBookPanel(i);
  }
}

export async function loadBookState() {
  const ns = booksApi();
  if (!ns) return;
  try {
    setBookState(await ns.getState());
  } catch (err) {
    console.warn('Buch-Zustand laden fehlgeschlagen:', err);
  }
}

// --- Sichtbarkeit, Toggle, Persistenz (Muster Suchergebnis-Panel) -------------

export function getBookPanelVisible(paneIdx) {
  // 4T-000849 (Story 4S-000758): Panel-Sichtbarkeit folgt dem Schalt-Zustand der
  // Buecher-Erweiterung (Muster Uhr-Panel).
  return (
    isExtensionActive('books') && !!(state.bookPanel && state.bookPanel.visibleByPane[paneIdx])
  );
}

export function applyBookPanelVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookSection) return;
  const visible = getBookPanelVisible(paneIdx);
  els.bookSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) renderBookPanel(paneIdx);
  updateBookToggleButton();
}

export function updateBookToggleButton() {
  const btn = document.getElementById('btn-book');
  if (!btn) return;
  const visible = getBookPanelVisible(state.activePaneIndex);
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleBookPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !getBookPanelVisible(paneIdx);
  state.bookPanel.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('book', paneIdx);
  applyBookPanelVisibility(paneIdx);
  await persistBookPanelSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistBookPanelSettings() {
  await persistSetting('bookPanel.visibleColumn0', !!state.bookPanel.visibleByPane[0]);
  await persistSetting('bookPanel.visibleColumn1', !!state.bookPanel.visibleByPane[1]);
}

export async function loadBookPanelSettings() {
  const v0 = await api.getSetting('bookPanel.visibleColumn0');
  const v1 = await api.getSetting('bookPanel.visibleColumn1');
  state.bookPanel.visibleByPane[0] = !!v0;
  state.bookPanel.visibleByPane[1] = !!v1;
}

// --- Verdrahtung ---------------------------------------------------------------

// Einmaliges Wiring beider Spalten plus das Abholen des ersten Buch-Zustands.
// Läuft aus bindUi() (Muster initSearchResultsPanel), nachdem das statische
// Markup steht.
export function initBookPanel() {
  // Bewusst ueber BEIDE statischen Spalten und nicht ueber state.panes.length:
  // Das Markup der zweiten Spalte steht von Anfang an, die zweite Pane entsteht
  // aber erst beim Teilen — eine spaeter gebundene Spalte gaebe es nicht
  // (Muster der "+"-Knoepfe in area-panel.js).
  for (let i = 0; i < 2; i++) {
    const els = getPaneEls(i);
    if (!els) continue;
    if (els.bookPrevBtn) els.bookPrevBtn.addEventListener('click', () => stepReading(i, -1));
    if (els.bookNextBtn) els.bookNextBtn.addEventListener('click', () => stepReading(i, 1));
    // 4T-000845: Der Baum-Container ist beständig (nur seine Zeilen entstehen
    // neu) und trägt deshalb die Ablage auf freier Fläche.
    if (els.bookTree) {
      els.bookTree.addEventListener('dragover', (ev) => treeDragOver(ev, els.bookTree));
      els.bookTree.addEventListener('drop', (ev) => treeDrop(ev, i));
      els.bookTree.addEventListener('dragleave', (ev) => {
        if (!els.bookTree.contains(ev.relatedTarget)) clearDropIndicators();
      });
    }
    // Kontextmenü der freien Panel-Fläche (Muster der Bereichs-Sektion);
    // Rechtsklicks auf Zeilen fängt showEntryContextMenu vorher ab.
    if (els.bookSection) {
      els.bookSection.addEventListener('contextmenu', (ev) => showPanelContextMenu(ev, i));
    }
  }
  const ns = booksApi();
  if (ns && typeof ns.onStateChanged === 'function') {
    ns.onStateChanged((next) => setBookState(next));
  }
  loadBookState();
}

// --- Registry-Anbindung ---------------------------------------------------------

registerSidebarPanel({
  id: 'book',
  titleKey: 'bookPanel.title',
  buttonId: 'btn-book',
  sectionClass: 'sidebar-book',
  getVisible: (paneIdx) => getBookPanelVisible(paneIdx),
  applyVisibility: applyBookPanelVisibility,
  toggle: toggleBookPanel,
});
