// Anker-Verwaltung des Block-Eigenschaften-Panels: Dropdown, Sprung, Anlegen,
// Umbenennen und der Verwaisten-Abschnitt.
// 4T-0979 (Epic 3E-0196): Auszug aus block-props-panel.js.
'use strict';

// 4T-0484 (Epic 3E-0088): Undo-Isolation der Ganz-Dokument-Ersetzung beim
// Anker-Umbenennen (Muster handleLinkUpdateApplied in views.js).
import { isolateHistory } from '@codemirror/commands';
import { t } from '../../i18n.js';
import { api, getDocText } from '../app/api.js';
import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import {
  extractBlockAnchors,
  rewriteAnchorReferences,
  generateBlockAnchorId,
  isValidBlockAnchorId,
} from '../../../shared/block-anchors.js';
import {
  activePathForPane,
  cursorLineForPane,
  docTextForPane,
  isReadOnlyForPane,
} from './block-props-context.js';
import { flushPendingSave } from './block-props-save.js';

// 4T-0979 (Epic 3E-0196): Rückweg in den Panel-Kern. Jede Anker-Aktion stößt
// den Neuaufbau der Ansicht an; der Kern reicht die beiden Funktionen beim
// Laden herein, statt dass dieses Modul ihn importiert. Das hält den
// Import-Graph gerichtet (Kern nach Anker) und kommt ohne beschreibbares
// Export-Binding aus (Muster der Deps-Injektion aus 4T-0977).
let viewHooks = {
  syncActive: () => {},
  refreshView: () => {},
};

export function setBlockPropsViewHooks(hooks) {
  viewHooks = { ...viewHooks, ...(hooks || {}) };
}

// --- Anker-Dropdown und Sprung ----------------------------------------------

export function buildAnchorSelect(els, ctx, active) {
  const sel = els.blockPropsAnchorSelect;
  sel.innerHTML = '';
  const ids = [...ctx.anchorsInText];
  // Aktiven verwaisten Anker (via Dropdown/Broadcast gewaehlt) sichtbar halten.
  if (active && !ids.includes(active)) ids.unshift(active);
  if (ids.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('blockProps.noAnchorsInFile');
    opt.disabled = true;
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  for (const id of ids) {
    const opt = document.createElement('option');
    opt.value = id;
    const hasData = ctx.data[id] && Object.keys(ctx.data[id].values || {}).length > 0;
    opt.textContent = hasData ? `^${id} •` : `^${id}`;
    sel.appendChild(opt);
  }
  sel.value = active || '';
}

// Springt zum gewaehlten Anker: setzt den Cursor auf die Anker-Zeile (loest die
// Cursor-Folge aus). In Lese-Ansichten ohne Cursor wird der aktive Anker direkt
// gesetzt.
export function jumpToAnchor(paneIdx, anchorId) {
  if (!anchorId) return;
  const view = paneEditors[paneIdx];
  const text = docTextForPane(paneIdx);
  const { lineById } = extractBlockAnchors(text);
  const line = lineById.get(anchorId);
  if (view && line && !isReadOnlyForPane(paneIdx)) {
    const pos = view.state.doc.line(line).to;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
    // Die Cursor-Folge (updateListener) zieht den aktiven Anker nach.
  } else {
    state.blockProps.activeAnchorByPane[paneIdx] = anchorId;
    viewHooks.syncActive(paneIdx, { reloadFields: true });
  }
}

// --- Anker anlegen / umbenennen ---------------------------------------------

// Legt fuer den Block unter dem Cursor einen Anker an (kurze Zufalls-ID) und
// schreibt ihn als `^id` an das Ende der letzten nicht-leeren Zeile des Blocks.
export function createAnchorForCursor(paneIdx) {
  if (isReadOnlyForPane(paneIdx)) return;
  const view = paneEditors[paneIdx];
  if (!view) return;
  const text = docTextForPane(paneIdx);
  const lines = text.split(/\r?\n/);
  const cursorLine = cursorLineForPane(paneIdx);
  const idx = cursorLine - 1;
  if (idx < 0 || idx >= lines.length || lines[idx].trim() === '') return;
  // Letzte nicht-leere Zeile des Blocks bestimmen (der Anker sitzt am Blockende).
  let end = idx;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;
  const { order } = extractBlockAnchors(text);
  const id = generateBlockAnchorId(new Set(order));
  const targetLine = view.state.doc.line(end + 1);
  // Anker ans Blockende anhaengen; der Cursor landet am Ende des eingefuegten
  // Textes (weiter in derselben Zeile), damit die Cursor-Folge den neuen Anker
  // erkennt.
  const insert = ` ^${id}`;
  view.dispatch({
    changes: { from: targetLine.to, insert },
    selection: { anchor: targetLine.to + insert.length },
    scrollIntoView: true,
    // 4T-0484 (Epic 3E-0088): Klick-/Kommando-Pfad ohne Tipp-Ereignis —
    // Annotation verhindert das Verschmelzen mit dem vorherigen Historien-
    // Ereignis (Muster views.js toggleTaskFromRendered).
    userEvent: 'input',
  });
  view.focus();
  state.blockProps.activeAnchorByPane[paneIdx] = id;
  viewHooks.syncActive(paneIdx, { reloadFields: true });
}

// Startet das Umbenennen des aktiven Ankers: ersetzt die Anker-Leiste durch ein
// Eingabefeld. Bestaetigen schreibt Text-Anker und .mdd-Schluessel synchron um
// (inklusive der eingehenden Verweise im selben Dokument, Entscheidung 3).
export function startRename(paneIdx, els) {
  if (isReadOnlyForPane(paneIdx)) return;
  const oldId = state.blockProps.activeAnchorByPane[paneIdx];
  if (!oldId) return;
  const bar = els.blockPropsAnchorbar;
  const sel = els.blockPropsAnchorSelect;
  const renameBtn = els.blockPropsRenameBtn;
  // Select und Umbenennen-Knopf nur ausblenden (nicht aus dem DOM loesen — die
  // getPaneEls-Referenzen sind memoisiert), temporaeres Eingabefeld anhaengen.
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'block-props-rename-input';
  input.value = oldId;
  input.spellcheck = false;
  sel.hidden = true;
  renameBtn.hidden = true;
  bar.appendChild(input);
  let done = false;
  const cleanup = () => {
    input.remove();
    sel.hidden = false;
  };
  const finish = (proceed) => {
    if (done) return;
    done = true;
    const newId = input.value.trim();
    cleanup();
    if (proceed && newId && newId !== oldId && isValidBlockAnchorId(newId)) {
      applyRename(paneIdx, oldId, newId);
    } else {
      viewHooks.refreshView(paneIdx, { rebuildFields: true });
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  setTimeout(() => input.focus(), 0);
}

async function applyRename(paneIdx, oldId, newId) {
  const view = paneEditors[paneIdx];
  const path = activePathForPane(paneIdx);
  // Kollision: das Ziel existiert bereits im Text.
  const { order } = extractBlockAnchors(docTextForPane(paneIdx));
  if (order.includes(newId)) {
    viewHooks.refreshView(paneIdx, { rebuildFields: true });
    return;
  }
  flushPendingSave(paneIdx);
  if (view) {
    const oldText = getDocText(view.state.doc);
    const newText = rewriteAnchorReferences(oldText, oldId, newId);
    if (newText !== oldText) {
      // 4T-0484 (Epic 3E-0088): Ganz-Dokument-Ersetzung aus dem Panel-Pfad als
      // eigene Undo-Einheit isolieren (Muster handleLinkUpdateApplied,
      // views.js) — sonst verschmilzt sie mit dem vorherigen Historien-
      // Ereignis und ein Undo nimmt zu viel zurück.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newText },
        annotations: isolateHistory.of('full'),
      });
    }
  }
  if (path) {
    try {
      await api.renameBlockAnchor(path, oldId, newId);
    } catch {
      /* transienter Fehler */
    }
  }
  const store = state.blockProps.dataByPane[paneIdx];
  if (store && store[oldId]) {
    store[newId] = store[oldId];
    delete store[oldId];
  }
  state.blockProps.activeAnchorByPane[paneIdx] = newId;
  viewHooks.syncActive(paneIdx, { reloadFields: true });
}

// --- Verwaisten-Abschnitt ----------------------------------------------------

export function buildOrphans(paneIdx, els, orphans, ctx, readOnly) {
  const listEl = els.blockPropsOrphansList;
  listEl.innerHTML = '';
  if (!orphans || orphans.length === 0) {
    els.blockPropsOrphans.hidden = true;
    return;
  }
  els.blockPropsOrphans.hidden = false;
  // Anker im Text ohne Daten sind moegliche Zuordnungs-Ziele.
  const freeAnchors = ctx.anchorsInText.filter(
    (id) => !(ctx.data[id] && Object.keys(ctx.data[id].values || {}).length > 0),
  );
  for (const orphanId of orphans) {
    const row = document.createElement('div');
    row.className = 'block-props-orphan';
    const label = document.createElement('span');
    label.className = 'block-props-orphan-id';
    label.textContent = `^${orphanId}`;
    row.appendChild(label);
    if (!readOnly) {
      const assignSel = document.createElement('select');
      assignSel.className = 'block-props-orphan-assign';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = t('blockProps.assignTo');
      assignSel.appendChild(placeholder);
      for (const target of freeAnchors) {
        const opt = document.createElement('option');
        opt.value = target;
        opt.textContent = `^${target}`;
        assignSel.appendChild(opt);
      }
      assignSel.addEventListener('change', () => {
        if (assignSel.value) assignOrphan(paneIdx, orphanId, assignSel.value);
      });
      row.appendChild(assignSel);
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'block-props-orphan-delete';
      delBtn.textContent = t('blockProps.orphanDelete');
      delBtn.addEventListener('click', () => deleteOrphan(paneIdx, orphanId));
      row.appendChild(delBtn);
    }
    listEl.appendChild(row);
  }
}

async function assignOrphan(paneIdx, orphanId, targetId) {
  const path = activePathForPane(paneIdx);
  if (!path || !isValidBlockAnchorId(targetId)) return;
  const store = state.blockProps.dataByPane[paneIdx];
  if (store && store[orphanId]) {
    store[targetId] = store[orphanId];
    delete store[orphanId];
  }
  try {
    await api.renameBlockAnchor(path, orphanId, targetId);
  } catch {
    /* transienter Fehler */
  }
  viewHooks.syncActive(paneIdx, { reloadFields: true });
}

async function deleteOrphan(paneIdx, orphanId) {
  const path = activePathForPane(paneIdx);
  if (!path) return;
  const store = state.blockProps.dataByPane[paneIdx];
  if (store) delete store[orphanId];
  try {
    await api.writeBlockData(path, orphanId, {});
  } catch {
    /* transienter Fehler */
  }
  viewHooks.syncActive(paneIdx, { reloadFields: true });
}
