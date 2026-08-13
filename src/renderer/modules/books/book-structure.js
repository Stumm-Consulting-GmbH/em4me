// Struktur-Pflege des Kapitel-Baums (4T-0845, Story S-0754): Melden der einen
// Baum-Operation, Ziehen am Anfasser, Tastatur-Gesten, Kontextmenüs und die
// Anlage eines Kapitels.
// 4T-0980 (Epic 3E-0196): aus modules/books/book-panel.js ausgezogen (reiner
// Struktur-Schnitt, Funktions-Ruempfe unveraendert).
//
// Der Renderer hält KEINEN eigenen Kapitel-Baum: Jede Operation geht als eine
// Meldung an den Main-Prozess, der schreibt und den neuen Zustand zurückmeldet.
// Hier wird deshalb nichts vorweggenommen.
'use strict';

import { t } from '../../i18n.js';

import { getPaneEls, state } from '../app/app-state.js';
import { hideContextMenu, placeContextMenuAt } from '../dialogs/context-menu-utils.js';
import { showStatusbarHint } from '../views/views.js';

import { BOOK_DND_MIME, dropTreeOp, dropZone, pathKey, subtreeKeys } from './book-helpers.js';
import { activeBook, booksApi, missingKeys, openChapter, setPendingFocus } from './book-state.js';
import { moveChapterFile, startReassign } from './book-repair.js';

// 4T-0845: Laufender Zug am Anfasser ({ path, fromUnlinked, blocked }); null,
// solange nichts gezogen wird. Während des Zuges wird NICHTS geschrieben,
// erst die Ablage löst genau eine Operation aus (Story S-0754).
let dragState = null;

// --- Struktur-Pflege: Meldung der Operation (4T-0845) -------------------------

// Fehler-Kennungen des Kern-Moduls, die eine eigene Erklärung verdienen; alles
// Übrige fällt auf den allgemeinen Hinweis zurück. Übersetzt wird erst hier,
// die Kennungen selbst bleiben maschinenlesbar.
const OP_ERROR_KEYS = {
  cycle: 'bookPanel.opCycle',
  'duplicate-path': 'bookPanel.opDuplicate',
};

// Rand einer Ebene: am ersten Geschwister gibt es nichts zum Einrücken, auf
// oberster Ebene nichts zum Ausrücken. Beides ist kein Fehler, sondern das
// Ende des Weges — eine Meldung wäre bei gehaltener Taste nur Lärm.
const OP_ERRORS_SILENT = new Set(['no-previous-sibling', 'at-root']);

const CREATE_ERROR_KEYS = {
  exists: 'bookPanel.newChapterExists',
  'duplicate-path': 'bookPanel.newChapterExists',
  'invalid-name': 'bookPanel.newChapterInvalid',
  'invalid-path': 'bookPanel.newChapterInvalid',
};

function reportOpError(error) {
  if (OP_ERRORS_SILENT.has(error)) return;
  showStatusbarHint(OP_ERROR_KEYS[error] || 'bookPanel.opFailed', {
    duration: 2500,
    error: true,
  });
}

// Meldet genau EINE Baum-Operation an den Main-Prozess. Der neue Zustand kommt
// über den Zustands-Push zurück und baut die Zeilen neu auf; hier wird nichts
// vorweggenommen, damit Anzeige und Begleitdatei nie auseinanderlaufen.
export async function runTreeOp(op, focus) {
  const ns = booksApi();
  if (!ns || typeof ns.applyTreeOp !== 'function') return false;
  setPendingFocus(focus);
  let result;
  try {
    result = await ns.applyTreeOp(op);
  } catch (err) {
    console.warn('Struktur-Änderung fehlgeschlagen:', op, err);
    result = null;
  }
  if (!result || !result.ok) {
    setPendingFocus(null);
    reportOpError(result ? result.error : undefined);
    return false;
  }
  return true;
}

// --- Struktur-Pflege: Ziehen am Anfasser (4T-0845) ----------------------------

export function clearDropIndicators() {
  document
    .querySelectorAll('.book-entry-row.is-drop-before, .book-entry-row.is-drop-after')
    .forEach((el) => el.classList.remove('is-drop-before', 'is-drop-after'));
  document
    .querySelectorAll('.book-entry-row.is-drop-into')
    .forEach((el) => el.classList.remove('is-drop-into'));
  document
    .querySelectorAll('.book-tree.is-drop-root')
    .forEach((el) => el.classList.remove('is-drop-root'));
}

export function startEntryDrag(ev, relPath, fromUnlinked) {
  const book = activeBook();
  if (!book) return;
  dragState = {
    path: relPath,
    fromUnlinked: !!fromUnlinked,
    // Der eigene Unterbaum ist als Ziel gesperrt; ein aus „nicht eingehängt"
    // gezogener Eintrag hängt noch nirgends und sperrt deshalb nichts.
    blocked: fromUnlinked ? new Set() : subtreeKeys(book.tree, relPath),
  };
  if (ev.dataTransfer) {
    ev.dataTransfer.setData(BOOK_DND_MIME, relPath);
    ev.dataTransfer.effectAllowed = 'move';
  }
  ev.stopPropagation();
}

export function endEntryDrag() {
  dragState = null;
  clearDropIndicators();
}

// Zone der aktuellen Zeiger-Position über einer Zeile.
function zoneAt(ev, rowEl) {
  const rect = rowEl.getBoundingClientRect();
  return dropZone(ev.clientY - rect.top, rect.height);
}

export function entryDragOver(ev, rowEl, relPath) {
  if (!dragState) return;
  if (dragState.blocked.has(pathKey(relPath))) {
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
    return;
  }
  // preventDefault meldet die Zeile als gültiges Ziel; ohne ihn lehnt der
  // Browser die Ablage ab.
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  clearDropIndicators();
  rowEl.classList.add(`is-drop-${zoneAt(ev, rowEl)}`);
}

export async function entryDrop(ev, rowEl, relPath) {
  if (!dragState) return;
  ev.preventDefault();
  ev.stopPropagation();
  const drag = dragState;
  const zone = zoneAt(ev, rowEl);
  endEntryDrag();
  const book = activeBook();
  if (!book) return;
  const op = dropTreeOp(book.tree, drag.path, { path: relPath, zone }, drag.fromUnlinked);
  if (!op) return;
  const paneEl = rowEl.closest ? rowEl.closest('.pane-group') : null;
  const paneIdx = paneEl ? Number(paneEl.dataset.pane) || 0 : state.activePaneIndex;
  await runTreeOp(op, { paneIdx, path: drag.path });
}

// Freie Fläche des Baums: die Ablage hängt ans Ende der obersten Ebene. Ein
// Buch ohne Kapitel hat gar keine Zeile, und ohne diesen Weg gäbe es dort
// nichts, worauf sich ein Eintrag ziehen ließe.
export function treeDragOver(ev, container) {
  if (!dragState) return;
  if (ev.target.closest && ev.target.closest('.book-entry-row')) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  clearDropIndicators();
  container.classList.add('is-drop-root');
}

export async function treeDrop(ev, paneIdx) {
  if (!dragState) return;
  if (ev.target.closest && ev.target.closest('.book-entry-row')) return;
  ev.preventDefault();
  const drag = dragState;
  endEntryDrag();
  const book = activeBook();
  if (!book) return;
  const op = dropTreeOp(book.tree, drag.path, null, drag.fromUnlinked);
  if (!op) return;
  await runTreeOp(op, { paneIdx, path: drag.path });
}

// --- Struktur-Pflege: Tastatur (4T-0845) --------------------------------------

// Bewusst fest verdrahtete Panel-Tasten und keine Registry-Kommandos: Sie
// wirken allein auf den fokussierten Eintrag dieses Panels und hätten außerhalb
// davon kein Ziel (PO-Klärung zum Umsetzungs-Start; der Funktions-Katalog
// führt sie als feste Eingabe).
const KEY_TREE_OPS = {
  ArrowUp: (path) => ({ type: 'moveWithinLevel', path, direction: 'up' }),
  ArrowDown: (path) => ({ type: 'moveWithinLevel', path, direction: 'down' }),
  ArrowRight: (path) => ({ type: 'indent', path }),
  ArrowLeft: (path) => ({ type: 'outdent', path }),
};

export function handleEntryKey(ev, relPath, { unlinked, missing }) {
  const paneEl = ev.currentTarget.closest ? ev.currentTarget.closest('.pane-group') : null;
  const paneIdx = paneEl ? Number(paneEl.dataset.pane) || 0 : state.activePaneIndex;
  const build = KEY_TREE_OPS[ev.key];
  if (build && ev.altKey && !ev.ctrlKey && !ev.shiftKey && !ev.metaKey) {
    // Ein Eintrag aus „nicht eingehängt" hängt nirgends und lässt sich nicht
    // verschieben; er wird über das Kontextmenü eingehängt.
    if (unlinked) return;
    ev.preventDefault();
    ev.stopPropagation();
    runTreeOp(build(relPath), { paneIdx, path: relPath });
    return;
  }
  if ((ev.key === 'Enter' || ev.key === ' ') && !missing) {
    ev.preventDefault();
    openChapter(relPath);
  }
}

// --- Struktur-Pflege: Kontextmenü und Kapitel-Anlage (4T-0845) ----------------

function addMenuItem(menu, labelKey, menuId, run) {
  const item = document.createElement('div');
  item.className = 'context-menu-item';
  // Stabiler Anker für die E2E-Prüfung (Muster area-file-bookmark).
  item.dataset.menuId = menuId;
  item.textContent = t(labelKey);
  item.addEventListener('click', () => {
    hideContextMenu();
    run();
  });
  menu.appendChild(item);
}

function addMenuSeparator(menu) {
  const sep = document.createElement('div');
  sep.className = 'context-menu-separator';
  menu.appendChild(sep);
}

// Kontextmenü einer Eintrags-Zeile. Im Baum: neues Kapitel unter diesem
// Eintrag und Aushängen (die Datei bleibt, der Eintrag wandert in den
// Abschnitt „nicht eingehängt"). Im Abschnitt „nicht eingehängt": Einhängen
// ans Ende der obersten Ebene.
//
// 4T-0847 (Story S-0756): Beide Seiten tragen zusätzlich das physische
// Verschieben der Datei — auf Kapitel-Zeilen wie auf nicht eingehängten
// Zeilen, weil die Ordner-Gliederung von der Deklaration unabhängig ist. Ein
// deklariertes Kapitel ohne Datei bekommt den Eintrag nicht: es gibt nichts
// zu bewegen.
//
// 4T-0848 (Story S-0757): Genau dieses Kapitel bekommt stattdessen „neu
// zuordnen"; „Aushängen" steht ihm wie jeder Kapitel-Zeile ohnehin zur
// Verfügung (AK2). Die beiden Reparatur-Wege stehen damit unmittelbar am
// betroffenen Eintrag.
export function showEntryContextMenu(ev, relPath, unlinked, paneIdx) {
  const menu = document.getElementById('context-menu');
  const book = activeBook();
  if (!menu || !book) return;
  ev.preventDefault();
  ev.stopPropagation();
  menu.innerHTML = '';
  const missing = !unlinked && missingKeys(book).has(pathKey(relPath));
  if (unlinked) {
    addMenuItem(menu, 'bookPanel.attach', 'book-attach', () =>
      runTreeOp(
        { type: 'insert', path: relPath, parentPath: null, index: null },
        {
          paneIdx,
          path: relPath,
        },
      ),
    );
  } else {
    addMenuItem(menu, 'bookPanel.newChapter', 'book-new-chapter', () =>
      showNewChapterInput(paneIdx, relPath),
    );
    addMenuSeparator(menu);
    if (missing) {
      addMenuItem(menu, 'bookPanel.reassign', 'book-reassign', () => {
        void startReassign(paneIdx, relPath);
      });
    }
    addMenuItem(menu, 'bookPanel.detach', 'book-detach', () =>
      runTreeOp({ type: 'remove', path: relPath }, null),
    );
  }
  if (!missing) {
    addMenuSeparator(menu);
    addMenuItem(menu, 'bookPanel.moveFile', 'book-move-file', () => {
      void moveChapterFile(relPath);
    });
  }
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}

// Kontextmenü der freien Panel-Fläche: neues Kapitel auf oberster Ebene.
export function showPanelContextMenu(ev, paneIdx) {
  if (ev.target.closest && ev.target.closest('.book-entry-row')) return;
  const menu = document.getElementById('context-menu');
  if (!menu || !activeBook()) return;
  ev.preventDefault();
  menu.innerHTML = '';
  addMenuItem(menu, 'bookPanel.newChapter', 'book-new-chapter-root', () =>
    showNewChapterInput(paneIdx, null),
  );
  placeContextMenuAt(menu, ev.clientX, ev.clientY);
}

// Inline-Eingabe des Kapitel-Namens am Kopf des Baums (Muster „Neue Datei in
// diesem Ordner" im Bereichs-Panel): Enter legt an, Escape bricht ab. Die
// Datei entsteht im Ordner der Eltern-Kapitel-Datei, auf oberster Ebene im
// Buch-Ordner; das Einhängen erledigt derselbe Aufruf.
function showNewChapterInput(paneIdx, parentPath) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookTree || !activeBook()) return;
  const offen = els.bookTree.querySelector('.book-new-chapter-input');
  if (offen) {
    offen.focus();
    return;
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'book-new-chapter-input';
  input.placeholder = t('bookPanel.newChapterPlaceholder');
  input.addEventListener('keydown', async (ev) => {
    if (ev.key === 'Escape') {
      input.remove();
      return;
    }
    if (ev.key !== 'Enter') return;
    const name = input.value.trim();
    if (name === '') return;
    const ns = booksApi();
    if (!ns || typeof ns.createChapter !== 'function') return;
    let result;
    try {
      result = await ns.createChapter(parentPath, name);
    } catch (err) {
      console.warn('Kapitel anlegen fehlgeschlagen:', name, err);
      result = null;
    }
    if (result && result.ok) {
      // Der Zustands-Push baut den Baum ohnehin neu auf; das Entfernen hier
      // hält die Eingabe auch dann nicht stehen, wenn er ausbleibt.
      input.remove();
      return;
    }
    const key = CREATE_ERROR_KEYS[result ? result.error : ''] || 'bookPanel.newChapterFailed';
    showStatusbarHint(key, { duration: 2500, error: true });
  });
  els.bookTree.prepend(input);
  input.focus();
}
