// 4T-0585 (Epic 3E-0108): Titelzeile („Zeile 0") im Renderer.
//
// Zeigt pro Pane den Dateinamen ohne Endung in kompakter Überschrift-1-Optik
// scroll-fest über dem Dokument, ohne Zeilennummer und ohne Bestandteil des
// CodeMirror-Dokuments zu sein (Architekturentscheidung des Epics: eigenes
// DOM-Element, H1-Optik ist reines CSS). Zwei Instanzen pro Pane mit
// data-host 'source'/'rendered' (Muster Subpage-Breadcrumb): die
// Source-Instanz trägt Quelltext-, Geteilt- und Live-Ansicht, die
// Render-Instanz die Reading-Ansicht — in jedem Ansichts-Modus ist damit
// genau eine Instanz sichtbar, im Geteilt-Modus gibt es keine doppelte
// Titelzeile. Sichtbarkeit schaltet updateTitleLineForPane über das
// hidden-Attribut; eingehängt in syncEditorForPane (Muster Format-Toolbar),
// womit Tab-, Modus-, Edit- und Erweiterungs-Wechsel automatisch nachziehen.
// Handbuch- und System-Tabs bleiben ohne Titelzeile; Unbenannt-Tabs zeigen
// den Unbenannt-Platzhalter. Erweiterung 'title-line': im Aus-Zustand
// verschwindet die Zeile vollständig (heutiges Bild ohne Titelzeile).
//
// 4T-0586: Direkt-Umbenennen über die Titelzeile. Klick (oder Enter/F2 auf
// der fokussierten Zeile) macht den Titel contenteditable; Enter oder
// Fokusverlust bestätigt, Escape verwirft, unveränderter Text beendet
// still. Validierung (leer, unzulässige Zeichen) läuft vor dem Aufruf über
// die geteilten subpages-Validatoren; Kollisionen meldet der Main. Fehler
// erscheinen als Hinweis direkt an der Titelzeile (kein Modal), der
// Alt-Name bleibt erhalten. Bestätigte Änderungen rufen den bestehenden
// gehärteten Umbenennen-Pfad api.renameFile auf (Link-Update gemäß der
// renameUpdateLinks-Einstellung, ohne Vorschau-Dialog); der Erfolgs-
// Nachlauf läuft zentral über den file:renamed-Broadcast. Unbenannt-Tabs
// stoßen „Speichern unter" mit vorbelegtem Dateinamen an. Umbenennen ist
// eine Datei-Operation: die Titelzeile ist unabhängig vom Edit-Modus des
// Tabs editierbar, der Dirty-Zustand bleibt unberührt (dirty Tabs werden
// wie im Dialog-Fluss zuerst gespeichert).
//
// Modul-Zyklus: die Imports aus views.js (saveTab/saveTabAs) und tabs.js
// (activatePane) werden ausschließlich zur Laufzeit genutzt — der Zyklus
// über views.js ist damit unkritisch (Muster format-toolbar.js).
'use strict';

import { t } from '../i18n.js';
import { api } from './api.js';
import { state, getPaneEls } from './app-state.js';
import { isExtensionActive } from './extension-lifecycle.js';
import {
  basenameValidationError,
  displayTitleFromBasename,
  toFileBasename,
} from '../../shared/subpages.js';
import { activatePane } from './tabs.js';
import { saveTab, saveTabAs } from './views.js';

const TITLE_LINE_EXTENSION_ID = 'title-line';

// Laufende Bearbeitung (höchstens eine zugleich; ein Klick in eine andere
// Titelzeile löst über den Blur-Commit die vorige auf).
let editState = null;

// Auto-Hide-Timer der Hinweis-Flächen pro Titelzeilen-Element.
const hintTimers = new WeakMap();

// Anzeige-Text der Titelzeile für einen Tab: Dateiname ohne Endung in der
// logischen Schreibweise (Unterseiten mit Slash), Unbenannt-Platzhalter für
// pfadlose Tabs; null für Handbuch-/System-Seiten und leere Panes (dort
// erscheint keine Titelzeile).
export function titleLineTextForTab(tab) {
  if (!tab || tab.manualPage || tab.systemPage) return null;
  if (!tab.path) {
    return `${t('save.untitled')}${tab.untitledIndex ? ' ' + tab.untitledIndex : ''}`;
  }
  return displayTitleFromBasename(api.basename(tab.path));
}

// Sichtbarkeit und Text beider Titelzeilen-Instanzen einer Pane nachziehen.
// Läuft über syncEditorForPane bei jedem Tab-/Modus-/Edit-/Erweiterungs-
// Wechsel sowie nach Umbenennen und Speichern unter (views.js).
export function updateTitleLineForPane(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !Array.isArray(els.titleLines) || els.titleLines.length === 0) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const text = titleLineTextForTab(tab);
  const active = isExtensionActive(TITLE_LINE_EXTENSION_ID);
  const mode = tab ? tab.viewMode || 'rendered' : 'rendered';
  for (const el of els.titleLines) {
    wireTitleLine(el);
    const modeOk =
      el.dataset.host === 'rendered'
        ? mode === 'rendered'
        : mode === 'source' || mode === 'split' || mode === 'live';
    const visible = active && text !== null && modeOk;
    el.hidden = !visible;
    if (!visible) {
      hideTitleLineHint(el);
      continue;
    }
    const textEl = el.querySelector('.title-line-text');
    if (!textEl) continue;
    textEl.title = t(tab.path ? 'titleLine.tooltip' : 'titleLine.tooltipUntitled');
    // Während einer laufenden Titel-Bearbeitung (4T-0586) den Editier-Stand
    // nicht überschreiben.
    if (!textEl.isContentEditable && textEl.textContent !== text) {
      textEl.textContent = text;
      hideTitleLineHint(el);
    }
  }
}

export function updateAllTitleLines() {
  for (let i = 0; i < state.panes.length; i++) updateTitleLineForPane(i);
}

// --- Hinweis-Fläche (4T-0586) ----------------------------------------------------

function showTitleLineHint(el, text, isError) {
  const hint = el.querySelector('.title-line-hint');
  if (!hint) return;
  hint.textContent = text;
  hint.classList.toggle('is-error', !!isError);
  hint.hidden = false;
  const prev = hintTimers.get(el);
  if (prev) clearTimeout(prev);
  hintTimers.set(
    el,
    setTimeout(() => (hint.hidden = true), 5000),
  );
}

function hideTitleLineHint(el) {
  const hint = el.querySelector('.title-line-hint');
  if (!hint) return;
  const prev = hintTimers.get(el);
  if (prev) clearTimeout(prev);
  hint.hidden = true;
}

// --- Edit-Fluss (4T-0586) --------------------------------------------------------

function paneIndexFor(el) {
  const group = el.closest('.pane-group');
  return group && group.dataset.pane === '1' ? 1 : 0;
}

// Einmalige Verdrahtung pro Instanz (lazy beim ersten Sichtbarkeits-Update;
// kein eigener Init-Schritt in app-init nötig).
function wireTitleLine(el) {
  if (el.dataset.editWired) return;
  el.dataset.editWired = '1';
  const textEl = el.querySelector('.title-line-text');
  if (!textEl) return;
  textEl.addEventListener('click', () => {
    if (!textEl.isContentEditable) startEdit(el, textEl);
  });
  textEl.addEventListener('keydown', (ev) => {
    if (!textEl.isContentEditable) {
      // Tastatur-Zugang auf der fokussierten (tabindex-)Zeile.
      if (ev.key === 'Enter' || ev.key === 'F2') {
        ev.preventDefault();
        startEdit(el, textEl);
      }
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      commitEdit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      cancelEdit();
    }
  });
  textEl.addEventListener('blur', () => {
    if (editState && editState.textEl === textEl) commitEdit();
  });
}

function startEdit(el, textEl) {
  const paneIdx = paneIndexFor(el);
  // Klick in die Titelzeile einer nicht-aktiven Pane aktiviert diese zuerst
  // (Muster Format-Toolbar) — das Umbenennen betrifft den aktiven Tab
  // genau dieser Pane.
  if (state.activePaneIndex !== paneIdx) activatePane(paneIdx);
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab || tab.manualPage || tab.systemPage) return;
  hideTitleLineHint(el);
  editState = {
    el,
    textEl,
    paneIdx,
    tabIdx: pane.activeIndex,
    original: textEl.textContent,
  };
  el.classList.add('editing');
  textEl.contentEditable = 'plaintext-only';
  textEl.focus();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Bearbeitung optisch beenden und den angezeigten Text setzen.
function finishEdit(s, text) {
  s.el.classList.remove('editing');
  s.textEl.contentEditable = 'false';
  s.textEl.textContent = text;
  s.textEl.blur();
}

function cancelEdit() {
  const s = editState;
  if (!s) return;
  editState = null;
  finishEdit(s, s.original);
}

// Bestätigen (Enter oder Fokusverlust): Validierung vor dem Aufruf, Fehler
// als Hinweis an der Titelzeile, der Alt-Name bleibt erhalten. Unveränderter
// Text beendet still.
async function commitEdit() {
  const s = editState;
  if (!s) return;
  editState = null;
  const raw = String(s.textEl.textContent || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  const pane = state.panes[s.paneIdx];
  const tab = pane ? pane.tabs[s.tabIdx] : null;
  // Tab geschlossen oder gewechselt: still verwerfen.
  if (!tab || pane.activeIndex !== s.tabIdx) {
    finishEdit(s, s.original);
    return;
  }
  if (raw === s.original.trim()) {
    finishEdit(s, s.original);
    return;
  }
  // Validierung vor dem Aufruf: Slash-Eingaben werden als logische
  // Unterseiten-Schreibweise gelesen (U+2215-Übersetzung), danach gelten
  // die Segment-Regeln des Umbenennen-Dialogs.
  const fileBase = toFileBasename(raw);
  const vErr = basenameValidationError(fileBase);
  if (vErr) {
    showTitleLineHint(s.el, t(`rename.error.${vErr}`), true);
    finishEdit(s, s.original);
    return;
  }
  if (!tab.path) {
    // Unbenannt-Tab: „Speichern unter" mit vorbelegtem Dateinamen; der
    // Erfolgs-Nachlauf (Tab-Pfad, Titelzeile) läuft in saveTabAs.
    finishEdit(s, s.original);
    await saveTabAs(s.paneIdx, s.tabIdx, { suggestedName: `${fileBase}.md` });
    return;
  }
  // Ungespeicherte Änderungen zuerst sichern (identische Semantik zum
  // Dialog-Fluss renameFileForTab): der Pfad wechselt, ein Dirty-Stand darf
  // nicht am alten Namen hängen bleiben. Abbruch/Fehler beendet still.
  if (tab.dirty) {
    const saved = await saveTab(s.paneIdx, s.tabIdx);
    if (!saved) {
      finishEdit(s, s.original);
      return;
    }
  }
  const updateLinks = (await api.getSetting('renameUpdateLinks')) !== false;
  let result;
  try {
    result = await api.renameFile(tab.path, fileBase, updateLinks);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    let text;
    if (result && result.code === 'partial') {
      text = t('rename.partial')
        .replace('{done}', String(result.renamedCount || 0))
        .replace('{total}', String(result.totalCount || 0));
    } else if (result && result.code === 'exists') {
      text = t('rename.exists');
    } else if (result && result.code && result.error === 'invalid name') {
      text = t(`rename.error.${result.code}`);
    } else {
      text = t('rename.failed');
    }
    showTitleLineHint(s.el, text, true);
    finishEdit(s, s.original);
    return;
  }
  // Erfolg: Anzeige sofort auf den neuen Namen; Tab-/Fenster-Titel,
  // Lesezeichen und Index zieht der file:renamed-Broadcast nach.
  finishEdit(s, displayTitleFromBasename(api.basename(result.path)));
}
