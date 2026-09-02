// 4T-000585 (Epic 3E-000108): Titelzeile („Zeile 0") im Renderer.
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
// 4T-000586: Direkt-Umbenennen über die Titelzeile. Klick (oder Enter/F2 auf
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
// 4T-000646 (Epic 3E-000128): Bei einer Unterseite ist nur noch das eigene
// Namens-Segment editierbar. Die Zeile besteht dafür aus zwei Teilen: dem
// Eltern-Anteil (`.title-line-prefix`, dauerhaft gedämpft, nie editierbar)
// und dem eigenen Segment (`.title-line-segment`, contenteditable während
// der Bearbeitung). Die Zerlegung liefert splitDisplayTitle aus dem
// geteilten subpages-Modul, damit Titelzeile und Umbenennen-Dialog dieselbe
// Grenze ziehen. Folge: Eine Unterseite kann über die Titelzeile ihren Ast
// nicht mehr verlassen — der Schrägstrich ist im Segment abgelehnt, während
// er an einer Top-Level-Seite weiter erlaubt bleibt und sie wie bisher zur
// Unterseite macht. Wer den vollständigen Namen einer Unterseite ändern
// will, nimmt den Umbenennen-Dialog mit seinem Vollname-Schalter.
//
// Modul-Zyklus: die Imports aus views.js (saveTab/saveTabAs) und tabs.js
// (activatePane) werden ausschließlich zur Laufzeit genutzt — der Zyklus
// über views.js ist damit unkritisch (Muster format-toolbar.js).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state, getPaneEls } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  basenameValidationError,
  segmentValidationError,
  splitDisplayTitle,
  toFileBasename,
} from '../../../shared/subpages.js';
import { activatePane } from '../tabs/tabs.js';
import { saveTab, saveTabAs } from './save-export.js';

const TITLE_LINE_EXTENSION_ID = 'title-line';

// Laufende Bearbeitung (höchstens eine zugleich; ein Klick in eine andere
// Titelzeile löst über den Blur-Commit die vorige auf).
let editState = null;

// Auto-Hide-Timer der Hinweis-Flächen pro Titelzeilen-Element.
const hintTimers = new WeakMap();

// 4T-000646: Anzeige-Teile der Titelzeile für einen Tab. `prefix` ist der
// Eltern-Anteil einer Unterseite samt abschließendem Schrägstrich (bei
// Top-Level-Seiten und Unbenannt-Tabs leer), `segment` der editierbare
// Rest. Unbenannt-Tabs zeigen den Platzhalter; null für Handbuch-/System-
// Seiten und leere Panes (dort erscheint keine Titelzeile).
export function titleLinePartsForTab(tab) {
  if (!tab || tab.manualPage || tab.systemPage) return null;
  if (!tab.path) {
    const label = `${t('save.untitled')}${tab.untitledIndex ? ' ' + tab.untitledIndex : ''}`;
    return { prefix: '', segment: label };
  }
  return splitDisplayTitle(api.basename(tab.path));
}

// Die beiden Teil-Elemente einer Titelzeilen-Instanz. Fremde Text-Knoten
// direkt im h1 (Einrückung des HTML) werden entfernt, damit der angezeigte
// Titel exakt aus Präfix und Segment besteht.
function titleLineParts(textEl) {
  for (const node of Array.from(textEl.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  }
  return {
    prefixEl: textEl.querySelector('.title-line-prefix'),
    segmentEl: textEl.querySelector('.title-line-segment'),
  };
}

// Sichtbarkeit und Text beider Titelzeilen-Instanzen einer Pane nachziehen.
// Läuft über syncEditorForPane bei jedem Tab-/Modus-/Edit-/Erweiterungs-
// Wechsel sowie nach Umbenennen und Speichern unter (views.js).
export function updateTitleLineForPane(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !Array.isArray(els.titleLines) || els.titleLines.length === 0) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const parts = titleLinePartsForTab(tab);
  const active = isExtensionActive(TITLE_LINE_EXTENSION_ID);
  const mode = tab ? tab.viewMode || 'rendered' : 'rendered';
  for (const el of els.titleLines) {
    wireTitleLine(el);
    const modeOk =
      el.dataset.host === 'rendered'
        ? mode === 'rendered'
        : mode === 'source' || mode === 'split' || mode === 'live';
    const visible = active && parts !== null && modeOk;
    el.hidden = !visible;
    if (!visible) {
      hideTitleLineHint(el);
      continue;
    }
    const textEl = el.querySelector('.title-line-text');
    if (!textEl) continue;
    textEl.title = t(tab.path ? 'titleLine.tooltip' : 'titleLine.tooltipUntitled');
    const { prefixEl, segmentEl } = titleLineParts(textEl);
    if (!prefixEl || !segmentEl) continue;
    // Während einer laufenden Titel-Bearbeitung (4T-000586) den Editier-Stand
    // nicht überschreiben.
    if (segmentEl.isContentEditable) continue;
    if (prefixEl.textContent !== parts.prefix) prefixEl.textContent = parts.prefix;
    prefixEl.hidden = parts.prefix === '';
    if (segmentEl.textContent !== parts.segment) {
      segmentEl.textContent = parts.segment;
      hideTitleLineHint(el);
    }
  }
}

export function updateAllTitleLines() {
  for (let i = 0; i < state.panes.length; i++) updateTitleLineForPane(i);
}

// --- Hinweis-Fläche (4T-000586) ----------------------------------------------------

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

// --- Edit-Fluss (4T-000586) --------------------------------------------------------

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
  // 4T-000646: Editiert wird ausschließlich das Segment-Element; Klick und
  // Tastatur-Zugang liegen weiterhin auf der ganzen Zeile, damit auch ein
  // Klick auf den Eltern-Anteil die Bearbeitung des Segments startet.
  const { segmentEl } = titleLineParts(textEl);
  if (!segmentEl) return;
  textEl.addEventListener('click', () => {
    if (!segmentEl.isContentEditable) startEdit(el, textEl, segmentEl);
  });
  textEl.addEventListener('keydown', (ev) => {
    if (!segmentEl.isContentEditable) {
      // Tastatur-Zugang auf der fokussierten (tabindex-)Zeile.
      if (ev.key === 'Enter' || ev.key === 'F2') {
        ev.preventDefault();
        startEdit(el, textEl, segmentEl);
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
  segmentEl.addEventListener('blur', () => {
    if (editState && editState.segmentEl === segmentEl) commitEdit();
  });
}

function startEdit(el, textEl, segmentEl) {
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
    segmentEl,
    paneIdx,
    tabIdx: pane.activeIndex,
    original: segmentEl.textContent,
  };
  el.classList.add('editing');
  segmentEl.contentEditable = 'plaintext-only';
  segmentEl.focus();
  const range = document.createRange();
  range.selectNodeContents(segmentEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Bearbeitung optisch beenden und die angezeigten Teile setzen. `prefix`
// bleibt unverändert, solange nichts übergeben wird — er ändert sich nur,
// wenn eine Top-Level-Seite über die Schrägstrich-Eingabe zur Unterseite
// geworden ist.
function finishEdit(s, segmentText, prefix) {
  s.el.classList.remove('editing');
  s.segmentEl.contentEditable = 'false';
  s.segmentEl.textContent = segmentText;
  if (typeof prefix === 'string') {
    const { prefixEl } = titleLineParts(s.textEl);
    if (prefixEl) {
      prefixEl.textContent = prefix;
      prefixEl.hidden = prefix === '';
    }
  }
  s.segmentEl.blur();
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
  const raw = String(s.segmentEl.textContent || '')
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
  // 4T-000646: Validierung nach Lage der Seite. Bei einer Unterseite trägt die
  // Eingabe nur das eigene Segment; der Schrägstrich ist dort abgelehnt, weil
  // die Seite sonst still ihren Ast verlassen würde. Bei einer Top-Level-Seite
  // (und bei Unbenannt-Tabs) bleibt es beim bisherigen Verhalten: Die Eingabe
  // wird als logische Unterseiten-Schreibweise gelesen (U+2215-Übersetzung),
  // ein Schrägstrich macht die Seite damit zur Unterseite.
  const parts = titleLinePartsForTab(tab) || { prefix: '', segment: '' };
  const isSub = !!tab.path && parts.prefix !== '';
  let fileBase;
  if (isSub) {
    const vErr = segmentValidationError(raw);
    if (vErr) {
      // Das Trennzeichen ist im Segment nicht erlaubt — der Fehlertext der
      // Unterseiten-Anlage passt dort exakt (Muster Umbenennen-Dialog).
      const key = vErr === 'separator' ? 'subpage.create.error.separator' : `rename.error.${vErr}`;
      showTitleLineHint(s.el, t(key), true);
      finishEdit(s, s.original);
      return;
    }
    fileBase = toFileBasename(parts.prefix + raw);
  } else {
    fileBase = toFileBasename(raw);
    const vErr = basenameValidationError(fileBase);
    if (vErr) {
      showTitleLineHint(s.el, t(`rename.error.${vErr}`), true);
      finishEdit(s, s.original);
      return;
    }
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
  // Lesezeichen und Index zieht der file:renamed-Broadcast nach. Der Präfix
  // wird mitgesetzt, weil eine Top-Level-Seite über die Schrägstrich-Eingabe
  // zur Unterseite geworden sein kann.
  const newParts = splitDisplayTitle(api.basename(result.path));
  finishEdit(s, newParts.segment, newParts.prefix);
}
