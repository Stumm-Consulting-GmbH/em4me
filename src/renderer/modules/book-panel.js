// 4T-0844 (Epic 3E-0147): Inhaltsverzeichnis-Panel des Buches (Story S-0753).
//
// Zeigt den Kapitel-Baum des aktiven Buches in der erklärten Reihenfolge,
// hebt das gerade gelesene Kapitel hervor und öffnet ein Kapitel per Klick.
// Unter dem Baum steht der Abschnitt „nicht eingehängt" mit den
// Markdown-Dateien des Buch-Ordners außerhalb des Baums; ein deklariertes
// Kapitel ohne Datei erscheint markiert. Im Kopf führen zwei Knöpfe eine
// Position vor bzw. zurück durch die Lese-Ordnung (die vollständige
// Leseführung über Kapitel-Grenzen trägt 4T-0846).
//
// 4T-0848 (Story S-0757) trägt die Reparatur eines solchen Eintrags: „neu
// zuordnen" mit vorbelegtem Wiederfinde-Vorschlag oder Datei-Wahl, daneben
// das Aushängen. Ausgeführt wird nie etwas von selbst.
//
// 4T-0845 (Story S-0754) trägt die Struktur-Pflege: Der Marker vor jedem
// Eintrag ist der Anfasser, an dem ein Kapitel samt Unterbaum gezogen wird;
// gleichwertig verschieben Alt und die Pfeiltasten am fokussierten Eintrag,
// und das Kontextmenü legt Kapitel an, hängt sie aus und wieder ein.
//
// Dieses Modul zeigt an und wählt aus; es liest und schreibt keine Datei.
// Der Buch-Zustand kommt ausschließlich über den Preload-Namensraum `books`
// herein (getState einmalig, onStateChanged laufend), das Öffnen eines
// Kapitels und jede Struktur-Änderung gehen denselben Weg zurück. Der Zugriff
// ist deshalb an genau einer Stelle gekapselt (booksApi): fehlt der
// Namensraum, bleibt das Panel beim Leer-Hinweis stehen, statt die Oberfläche
// mit Fehlern zu belasten. Insbesondere hält der Renderer KEINEN eigenen
// Kapitel-Baum: jede Operation geht als eine Meldung an den Main-Prozess, der
// schreibt und den neuen Zustand zurückmeldet.
'use strict';

import { t } from '../i18n.js';

import { api } from './api.js';
import { getPaneEls, state } from './app-state.js';
import { hideContextMenu, placeContextMenuAt } from './dialogs.js';
import { isExtensionActive } from './extension-lifecycle.js';
import { applySidebarVisibility } from './panels.js';
import { ensurePanelTabActive, registerSidebarPanel } from './sidebar-layout.js';
import { reportMenuStateNow } from './tabs.js';
import { persistSetting, showStatusbarHint } from './views.js';

// Einzige Zugriffsstelle auf den Preload-Namensraum des Buches. Liefert null,
// solange die Bridge fehlt (frühe Startphase, Unit-Kontext ohne Stub).
function booksApi() {
  const ns = api && api.books;
  return ns && typeof ns.getState === 'function' ? ns : null;
}

// Laufender Buch-Zustand des Fensters. Bewusst Modul-Zustand und nicht in
// `state`: Er gehört dem Main-Prozess, wird von dort gemeldet und nie hier
// persistiert (Muster des Trefferbestands in such-panel.js).
let bookState = { active: null };

// 4T-0845: Laufender Zug am Anfasser ({ path, fromUnlinked, blocked }); null,
// solange nichts gezogen wird. Während des Zuges wird NICHTS geschrieben,
// erst die Ablage löst genau eine Operation aus (Story S-0754).
let dragState = null;

// Kapitel, dessen Zeile nach dem nächsten Neuaufbau den Fokus zurückbekommt
// ({ paneIdx, path }); null, wenn keiner ansteht.
let pendingFocus = null;

// Eigener Datentyp des Zuges (Muster BOOKMARK_DND_MIME): Datei-Drops aus dem
// Explorer und Reiter-Züge tragen ihn nicht und werden so nie als
// Kapitel-Zug missdeutet.
export const BOOK_DND_MIME = 'application/x-book-chapter';

// --- Reine Helfer (ohne DOM, unit-testbar) ------------------------------------

// Vergleichs-Schlüssel für Pfade: Vorwärts-Schrägstriche, ohne Schluss-Trenner,
// Kleinschreibung. Das Windows-Dateisystem unterscheidet Groß- und
// Kleinschreibung nicht (Muster fileKey in src/shared/book-core.js).
export function pathKey(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

// Buch-relativer Pfad einer geöffneten Datei; null, wenn sie außerhalb des
// Buch-Ordners liegt. Die Schreibweise des Ergebnisses stammt aus dem
// Datei-Pfad, verglichen wird über den Schlüssel.
export function chapterPathFromFile(bookDir, filePath) {
  const rootRaw = String(bookDir || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  const fileRaw = String(filePath || '').replace(/\\/g, '/');
  if (rootRaw === '' || fileRaw === '') return null;
  if (!fileRaw.toLowerCase().startsWith(rootRaw.toLowerCase() + '/')) return null;
  const rel = fileRaw.slice(rootRaw.length + 1);
  return rel === '' ? null : rel;
}

// Ziel der Leseführung: `direction` -1 zurück, +1 vor. Ohne gelesenes Kapitel
// führt „vor" an den Anfang des Buches — beim Öffnen steht der Reiter auf der
// Buch-Datei, und das erste Kapitel ist der natürliche Einstieg; „zurück"
// hat dann kein Ziel. null = kein Ziel (Rand der Lese-Ordnung).
export function readingTarget(readingOrder, currentChapter, direction) {
  const list = (Array.isArray(readingOrder) ? readingOrder : []).filter(
    (entry) => typeof entry === 'string' && entry !== '',
  );
  if (list.length === 0) return null;
  const key = pathKey(currentChapter);
  const at = key === '' ? -1 : list.findIndex((entry) => pathKey(entry) === key);
  if (direction < 0) return at > 0 ? list[at - 1] : null;
  return at + 1 < list.length ? list[at + 1] : null;
}

// Beschriftung eines Eintrags: Dateiname ohne Ordner und ohne Endung. Den
// vollen buch-relativen Pfad trägt der Tooltip der Zeile.
export function chapterLabel(relPath) {
  const name = String(relPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  return name.replace(/\.md$/i, '') || name;
}

// --- Struktur-Pflege: reine Ziel-Berechnung (4T-0845) -------------------------

// Umgebung eines Kapitels im gemeldeten Baum: Eltern-Pfad (null auf oberster
// Ebene), Index in seiner Geschwister-Liste und der Knoten selbst. null =
// nicht im Baum. Gegenstück zu locateChapter in src/shared/book-core.js; hier
// nötig, weil der Renderer aus dem angezeigten Baum die eine Operation
// ableitet, die er anschließend melden wird.
function locateEntry(nodes, key, parentPath = null) {
  for (let i = 0; i < (Array.isArray(nodes) ? nodes.length : 0); i++) {
    const node = nodes[i];
    if (!node || typeof node.path !== 'string') continue;
    if (pathKey(node.path) === key) return { node, index: i, parentPath };
    const found = locateEntry(node.children, key, node.path);
    if (found) return found;
  }
  return null;
}

// Alle Vergleichs-Schlüssel des Unterbaums eines Kapitels, den Knoten selbst
// eingeschlossen. Sie sind während eines Zuges als Ziel gesperrt: ein Kapitel
// kann nicht unter sich selbst wandern (Fehler 'cycle' des Kern-Moduls, hier
// schon vor dem Ablegen sichtbar gemacht).
export function subtreeKeys(tree, relPath) {
  const keys = new Set();
  const found = locateEntry(tree, pathKey(relPath));
  if (!found) return keys;
  const walk = (node) => {
    keys.add(pathKey(node.path));
    for (const child of Array.isArray(node.children) ? node.children : []) walk(child);
  };
  walk(found.node);
  return keys;
}

// Zone einer Ablage über einem Eintrag: das obere Drittel ordnet davor, das
// untere dahinter, die Mitte hängt als Unterkapitel ein. Dieselbe Drittelung
// wie im Lesezeichen-Baum, damit Ziehen überall gleich reagiert.
export function dropZone(offsetY, height) {
  const h = Number(height) || 0;
  if (h <= 0) return 'into';
  const third = h / 3;
  if (offsetY < third) return 'before';
  if (offsetY > h - third) return 'after';
  return 'into';
}

// Die EINE Baum-Operation, die aus einer Ablage folgt; null = nichts zu tun
// (Ablage auf sich selbst, Position unverändert, gesperrtes Ziel).
//
// `target` ist { path, zone } für die Ablage über einem Eintrag und null für
// die freie Fläche des Panels (Ende der obersten Ebene). `fromUnlinked` sagt,
// ob das gezogene Kapitel aus dem Abschnitt „nicht eingehängt" stammt: dann
// hängt es neu ein ('insert'), sonst hängt es um ('move').
//
// Der Index zählt in der Ziel-Liste NACH dem Aushängen, weil das Umhängen im
// Kern-Modul aus Aushängen und Einhängen besteht; innerhalb derselben Ebene
// rückt ein Ziel unterhalb der eigenen Position deshalb um eins vor.
export function dropTreeOp(tree, sourcePath, target, fromUnlinked = false) {
  const type = fromUnlinked ? 'insert' : 'move';
  const source = String(sourcePath || '');
  if (source === '') return null;
  const blocked = fromUnlinked ? new Set() : subtreeKeys(tree, source);
  if (!target || typeof target.path !== 'string' || target.path === '') {
    return { type, path: source, parentPath: null, index: null };
  }
  const found = locateEntry(tree, pathKey(target.path));
  if (!found) return null;
  if (target.zone === 'into') {
    if (blocked.has(pathKey(target.path))) return null;
    return { type, path: source, parentPath: target.path, index: null };
  }
  const parentPath = found.parentPath;
  // Vor oder hinter einem Kapitel des eigenen Unterbaums abzulegen hieße,
  // unter den eigenen Nachfahren zu landen.
  if (parentPath !== null && blocked.has(pathKey(parentPath))) return null;
  let index = target.zone === 'before' ? found.index : found.index + 1;
  if (!fromUnlinked) {
    const src = locateEntry(tree, pathKey(source));
    if (src && pathKey(src.parentPath || '') === pathKey(parentPath || '')) {
      if (src.index < index) index -= 1;
      if (src.index === index) return null;
    }
  }
  return { type, path: source, parentPath, index };
}

// --- Zugriff auf den gemeldeten Zustand ---------------------------------------

function activeBook() {
  return bookState && bookState.active ? bookState.active : null;
}

// Buch-relativer Pfad des Kapitels, das in dieser Spalte gerade gelesen wird
// (aktiver Reiter im Buch-Ordner); null sonst.
function activeChapter(paneIdx) {
  const book = activeBook();
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!book || !tab || !tab.path) return null;
  return chapterPathFromFile(book.bookDir, tab.path);
}

function missingKeys(book) {
  const list = Array.isArray(book && book.missing) ? book.missing : [];
  return new Set(list.map(pathKey));
}

// 4T-0848 (Story S-0757): Wiederfinde-Vorschläge eines fehlenden Kapitels aus
// dem gemeldeten Zustand — namensgleiche Dateien an anderer Stelle des
// Buch-Ordners. Der Main-Prozess legt sie dem Zustands-Paket bei (er hat den
// Datei-Bestand für den Abgleich ohnehin gelesen); Kapitel ohne Fund fehlen in
// der Abbildung. Der Vergleich läuft über den Pfad-Schlüssel, weil die
// Schreibweise aus zwei Quellen stammt (Deklaration und Dateisystem).
function suggestionsFor(book, relPath) {
  const map = book && book.missingSuggestions;
  if (!map || typeof map !== 'object') return [];
  const key = pathKey(relPath);
  for (const [candidate, list] of Object.entries(map)) {
    if (pathKey(candidate) === key) {
      return (Array.isArray(list) ? list : []).filter(
        (entry) => typeof entry === 'string' && entry !== '',
      );
    }
  }
  return [];
}

// --- Rendering ----------------------------------------------------------------

async function openChapter(relPath) {
  const ns = booksApi();
  if (!ns || typeof ns.openChapter !== 'function') return;
  try {
    await ns.openChapter(relPath);
  } catch (err) {
    console.warn('Kapitel öffnen fehlgeschlagen:', relPath, err);
  }
}

// Eine Eintrags-Zeile: Marker als Anfasser, Beschriftung, voller Pfad als
// Tooltip. Ein fehlendes Kapitel ist markiert und nicht anklickbar — es gibt
// keine Datei zu öffnen, die Reparatur läuft über das Kontextmenü.
//
// 4T-0845: Die Zeile ist fokussierbar (tabindex, Muster der Baum-Zeilen im
// Verschiebe-Dialog der Lesezeichen) und trägt damit die Tastatur-Gesten;
// gezogen wird ausschließlich am Marker, nicht an der ganzen Zeile, weil ein
// Klick auf die Zeile das Kapitel öffnet.
//
// 4T-0848: Gibt es zu einem fehlenden Kapitel einen namensgleichen Fund, trägt
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
// Unterkapiteln (Muster flattenChapters in src/shared/book-core.js).
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

// 4T-0845: Jede Struktur-Änderung baut die Zeilen neu auf, und der Fokus läge
// danach beim Dokument. Ohne Rückgabe an das bewegte Kapitel risse die
// Tastatur-Bedienung nach dem ERSTEN Schritt ab (Muster
// selectBookmarkMoveTarget im Verschiebe-Dialog der Lesezeichen).
function restorePendingFocus(paneIdx, els) {
  if (pendingFocus === null || pendingFocus.paneIdx !== paneIdx) return;
  const key = pathKey(pendingFocus.path);
  pendingFocus = null;
  if (!els.bookMain || key === '') return;
  const row = [...els.bookMain.querySelectorAll('.book-entry-row')].find(
    (candidate) => pathKey(candidate.dataset.pfad) === key,
  );
  if (row && typeof row.focus === 'function') row.focus();
}

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
async function runTreeOp(op, focus) {
  const ns = booksApi();
  if (!ns || typeof ns.applyTreeOp !== 'function') return false;
  pendingFocus = focus && focus.path ? { paneIdx: focus.paneIdx || 0, path: focus.path } : null;
  let result;
  try {
    result = await ns.applyTreeOp(op);
  } catch (err) {
    console.warn('Struktur-Änderung fehlgeschlagen:', op, err);
    result = null;
  }
  if (!result || !result.ok) {
    pendingFocus = null;
    reportOpError(result ? result.error : undefined);
    return false;
  }
  return true;
}

// --- Struktur-Pflege: Ziehen am Anfasser (4T-0845) ----------------------------

function clearDropIndicators() {
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

function startEntryDrag(ev, relPath, fromUnlinked) {
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

function endEntryDrag() {
  dragState = null;
  clearDropIndicators();
}

// Zone der aktuellen Zeiger-Position über einer Zeile.
function zoneAt(ev, rowEl) {
  const rect = rowEl.getBoundingClientRect();
  return dropZone(ev.clientY - rect.top, rect.height);
}

function entryDragOver(ev, rowEl, relPath) {
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

async function entryDrop(ev, rowEl, relPath) {
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
function treeDragOver(ev, container) {
  if (!dragState) return;
  if (ev.target.closest && ev.target.closest('.book-entry-row')) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  clearDropIndicators();
  container.classList.add('is-drop-root');
}

async function treeDrop(ev, paneIdx) {
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

function handleEntryKey(ev, relPath, { unlinked, missing }) {
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
function showEntryContextMenu(ev, relPath, unlinked, paneIdx) {
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
function showPanelContextMenu(ev, paneIdx) {
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

// 4T-0846 (Story S-0755): Ein Schritt durch die Lese-Ordnung des aktiven
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

// --- Kapitel-Datei verschieben (4T-0847, Story S-0756) ------------------------

// Fehler-Kennungen des Verschiebe-Weges, die eine eigene Erklärung verdienen;
// alles Übrige fällt auf den allgemeinen Hinweis zurück. Übersetzt wird erst
// hier, die Kennungen aus dem Main bleiben maschinenlesbar.
const MOVE_ERROR_KEYS = {
  'outside-book': 'bookPanel.moveOutsideBook',
  exists: 'bookPanel.moveExists',
  'book-file': 'bookPanel.moveBookFile',
};

// Abgebrochener Ordner-Dialog und ein Ziel, das der aktuelle Ordner ist: kein
// Fehler, sondern eine folgenlose Bedienung — eine Meldung wäre nur Lärm.
const MOVE_ERRORS_SILENT = new Set(['unchanged']);

// Verschiebt die Datei eines Eintrags; der Ziel-Ordner kommt aus dem
// Ordner-Dialog des Main-Prozesses. Der neue Zustand kommt über den
// Zustands-Push zurück, hier wird nichts vorweggenommen.
export async function moveChapterFile(relPath) {
  const ns = booksApi();
  if (!ns || typeof ns.moveChapterFile !== 'function') return false;
  let result;
  try {
    result = await ns.moveChapterFile(relPath);
  } catch (err) {
    console.warn('Kapitel-Datei verschieben fehlgeschlagen:', relPath, err);
    result = null;
  }
  if (result && result.ok) return true;
  if (result && result.canceled) return false;
  const error = result ? result.error : undefined;
  if (MOVE_ERRORS_SILENT.has(error)) return false;
  showStatusbarHint(MOVE_ERROR_KEYS[error] || 'bookPanel.moveFailed', {
    duration: 3000,
    error: true,
  });
  return false;
}

// Kommando-Weg: wirkt auf die gerade gelesene Datei der Spalte, sofern sie im
// Buch-Ordner des aktiven Buches liegt. Sonst gibt es kein Ziel und damit
// einen Hinweis statt einer stillen Wirkungslosigkeit.
export function moveActiveChapterFile(paneIdx) {
  const relPath = activeBook() ? activeChapter(paneIdx) : null;
  if (relPath === null) {
    showStatusbarHint('bookPanel.moveNoChapter', { duration: 2500, error: true });
    return;
  }
  void moveChapterFile(relPath);
}

// --- Reparatur fehlender Kapitel (4T-0848, Story S-0757) ----------------------
//
// Ein Baum-Eintrag ohne Datei ist markiert (AK1) und trägt am Kontextmenü zwei
// Wege: „neu zuordnen" und „aushängen" (AK2). Nichts davon geschieht von
// selbst — auch ein einzelner namensgleicher Fund ist nur ein vorbelegter
// Vorschlag und braucht den Klick (AK3, Epic-Entscheidung 6). Repariert wird
// ausschließlich die Deklaration; die Zeile verliert ihre Fehl-Markierung über
// den Zustands-Push des Main-Prozesses (AK4), nicht durch eine Vorwegnahme
// hier.

// Fehler-Kennungen der Zuordnung, die eine eigene Erklärung verdienen; alles
// Übrige fällt auf den allgemeinen Hinweis zurück.
const REASSIGN_ERROR_KEYS = {
  'outside-book': 'bookPanel.reassignOutsideBook',
  'unknown-file': 'bookPanel.reassignUnknownFile',
  'duplicate-path': 'bookPanel.reassignDuplicate',
  'book-file': 'bookPanel.reassignBookFile',
};

// Die Wahl derselben Datei ist keine Fehlbedienung, sondern folgenlos.
const REASSIGN_ERRORS_SILENT = new Set(['unchanged']);

// Gemeinsamer Abschluss beider Wege (angenommener Vorschlag und Datei-Dialog).
function finishReassign(result) {
  if (result && result.ok) {
    // Der Zustands-Push baut die Zeilen ohnehin neu auf; das Schließen hier
    // lässt die Auswahl auch dann nicht stehen, wenn er ausbleibt.
    closeReassignChooser();
    return true;
  }
  if (result && result.canceled) return false;
  const error = result ? result.error : undefined;
  if (REASSIGN_ERRORS_SILENT.has(error)) return false;
  showStatusbarHint(REASSIGN_ERROR_KEYS[error] || 'bookPanel.reassignFailed', {
    duration: 3000,
    error: true,
  });
  return false;
}

// Zuordnung eines angenommenen Vorschlags (buch-relativer Pfad).
async function runReassign(missingPath, newPath) {
  const ns = booksApi();
  if (!ns || typeof ns.reassignChapter !== 'function') return false;
  let result;
  try {
    result = await ns.reassignChapter(missingPath, newPath);
  } catch (err) {
    console.warn('Kapitel neu zuordnen fehlgeschlagen:', missingPath, err);
    result = null;
  }
  return finishReassign(result);
}

// Zuordnung über den Datei-Dialog des Main-Prozesses. Die Grenze auf den
// Buch-Ordner prüft der Main-Prozess; der Dialog selbst ließe ein Ziel
// außerhalb zu.
async function reassignFromDialog(missingPath) {
  const ns = booksApi();
  if (!ns || typeof ns.reassignChapterDialog !== 'function') return false;
  let result;
  try {
    result = await ns.reassignChapterDialog(missingPath);
  } catch (err) {
    console.warn('Datei-Wahl für die Zuordnung fehlgeschlagen:', missingPath, err);
    result = null;
  }
  return finishReassign(result);
}

function closeReassignChooser() {
  document.querySelectorAll('.book-reassign').forEach((el) => el.remove());
}

// Auswahl-Block unter der fehlenden Zeile (Muster der Inline-Eingabe für
// „Neues Kapitel": kein Modal, weil die Wahl am Eintrag hängt). Genau ein
// namensgleicher Fund ist DER Vorschlag und wird vorbelegt — hervorgehoben und
// fokussiert, aber unausgeführt; bei mehreren Funden bleibt die Wahl offen.
function showReassignChooser(paneIdx, missingPath, suggestions) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.bookTree) return;
  closeReassignChooser();

  const box = document.createElement('div');
  box.className = 'book-reassign';
  box.dataset.pfad = missingPath;
  box.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    closeReassignChooser();
  });

  const title = document.createElement('div');
  title.className = 'book-reassign-title';
  title.textContent = t('bookPanel.reassignTitle');
  box.appendChild(title);

  const subject = document.createElement('div');
  subject.className = 'book-reassign-subject';
  subject.textContent = missingPath;
  box.appendChild(subject);

  const single = suggestions.length === 1;
  for (const candidate of suggestions) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'book-reassign-option';
    if (single) option.classList.add('suggested');
    option.dataset.pfad = candidate;
    option.textContent = candidate;
    option.title = candidate;
    option.addEventListener('click', () => {
      void runReassign(missingPath, candidate);
    });
    box.appendChild(option);
  }

  const actions = document.createElement('div');
  actions.className = 'book-reassign-actions';
  const browse = document.createElement('button');
  browse.type = 'button';
  browse.className = 'book-reassign-browse';
  browse.textContent = t('bookPanel.reassignChoose');
  browse.addEventListener('click', () => {
    closeReassignChooser();
    void reassignFromDialog(missingPath);
  });
  actions.appendChild(browse);
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'book-reassign-cancel';
  cancel.textContent = t('dialog.cancel');
  cancel.addEventListener('click', () => closeReassignChooser());
  actions.appendChild(cancel);
  box.appendChild(actions);

  const row = [...els.bookTree.querySelectorAll('.book-entry-row')].find(
    (candidate) => pathKey(candidate.dataset.pfad) === pathKey(missingPath),
  );
  if (row) row.insertAdjacentElement('afterend', box);
  else els.bookTree.appendChild(box);
  const first = box.querySelector('.book-reassign-option');
  if (first && typeof first.focus === 'function') first.focus();
}

// Einstieg des Kontextmenüs: erst die Funde holen, dann die Auswahl zeigen.
// Ohne namensgleichen Fund gibt es nichts vorzuschlagen — dann führt der
// Datei-Dialog unmittelbar zur Wahl, statt eine leere Liste anzubieten.
async function startReassign(paneIdx, missingPath) {
  const ns = booksApi();
  if (!ns || typeof ns.suggestMissing !== 'function') return;
  let result;
  try {
    result = await ns.suggestMissing(missingPath);
  } catch (err) {
    console.warn('Vorschläge für ein fehlendes Kapitel nicht ermittelbar:', missingPath, err);
    result = null;
  }
  const suggestions =
    result && result.ok && Array.isArray(result.suggestions)
      ? result.suggestions.filter((entry) => typeof entry === 'string' && entry !== '')
      : [];
  if (suggestions.length === 0) {
    await reassignFromDialog(missingPath);
    return;
  }
  showReassignChooser(paneIdx, missingPath, suggestions);
}

// --- Zustands-Meldung des Main-Prozesses --------------------------------------

// Übernimmt einen gemeldeten Buch-Zustand und zeichnet die sichtbaren Panels
// neu. Ein unbrauchbarer Wert fällt auf „kein Buch" zurück, damit ein defekter
// Push das Panel nicht in einem Zwischenstand stehen lässt.
export function setBookState(next) {
  bookState = next && typeof next === 'object' ? next : { active: null };
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
  // 4T-0849 (Story S-0758): Panel-Sichtbarkeit folgt dem Schalt-Zustand der
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
  if (next) await ensurePanelTabActive('book');
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
    // 4T-0845: Der Baum-Container ist beständig (nur seine Zeilen entstehen
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
