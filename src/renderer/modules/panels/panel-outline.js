// --- Outline-Sidebar (4T-0014) ---------------------------------------------
// 4T-0990 (Epic 3E-0196): aus panels.js in den Ordner panels/ ausgezogen,
// samt eigener Panel-Registrierung am Modul-Ende.
// Persistente Inhaltsverzeichnis-Sicht pro Pane. Quelle ist das foldStructure-
// Field aus 4T-0013 (gleicher syntaxTree wie das Code-Folding). Klick auf den
// Heading-Text springt im Editor zur Zeile oder scrollt im Render-Pane zum
// Anker; Klick auf den Falt-Indikator toggelt nur die Editor-Region. Aktive
// Sektion folgt der Cursor-Zeile (Edit/Geteilt) bzw. der Scroll-Position
// (Render).
'use strict';

import { EditorView } from '@codemirror/view';

import { api } from '../app/api.js';
import { getPaneEls, state } from '../app/app-state.js';
import {
  foldHeadingRegion,
  isHeadingRegionFolded,
  paneEditors,
  unfoldHeadingRegion,
} from '../editor/editor.js';
// 4T-0471 (Epic 3E-0087): Gliederungs-Nummerierung in der Outline. Der Kern
// liefert die Nummern, der Renderer-Zustand den effektiven Dokument-Kontext.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { foldStructureField } from '../editor/folding.js';
import { resolveHeadingNumberingForDoc } from '../heading-numbering.js';
import { ensurePanelTabActive, registerSidebarPanel } from '../sidebar-layout.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { isAllEmpty, persistSetting } from '../views/views.js';
import { computeHeadingNumbers } from '../../../shared/heading-numbers.js';
import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';

import { applySidebarVisibility } from './panels.js';

export const OUTLINE_RENDER_DEBOUNCE_MS = 200;
export const OUTLINE_ACTIVE_DEBOUNCE_MS = 100;
// 4T-0183 (Knip-Zusatzfund): OUTLINE_DEFAULT_WIDTH entfernt — ungenutzt,
// die initiale Sidebar-Breite kommt aus CSS bzw. den Settings.
// 4T-0288: OUTLINE_MIN/MAX_WIDTH entfernt — Breiten-Grenzen leben jetzt
// seitengetrennt in sidebar-layout.js (SIDEBAR_MIN/MAX_WIDTH).
export const OUTLINE_INDENT_PX = 12;

export const outlineRenderTimers = []; // paneIdx -> timeout id
export const outlineActiveTimers = []; // paneIdx -> timeout id

export function getOutlineHeadings(paneIdx) {
  const view = paneEditors[paneIdx];
  if (!view) return [];
  const struct = view.state.field(foldStructureField, false);
  return struct && Array.isArray(struct.headings) ? struct.headings : [];
}

export function scheduleOutlineRender(paneIdx) {
  if (outlineRenderTimers[paneIdx]) clearTimeout(outlineRenderTimers[paneIdx]);
  outlineRenderTimers[paneIdx] = setTimeout(() => {
    outlineRenderTimers[paneIdx] = null;
    renderOutline(paneIdx);
  }, OUTLINE_RENDER_DEBOUNCE_MS);
}

export function renderOutline(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.outlineTree) return;
  const headings = getOutlineHeadings(paneIdx);
  els.outlineTree.innerHTML = '';
  if (headings.length === 0) {
    if (els.outlineEmpty) els.outlineEmpty.hidden = false;
    return;
  }
  if (els.outlineEmpty) els.outlineEmpty.hidden = true;
  const view = paneEditors[paneIdx];
  const doc = view ? view.state.doc : null;
  // 4T-0471 (Epic 3E-0087): Nummern aus dem Kern, wenn die Erweiterung aktiv
  // ist. Die Marker-Erkennung braucht den Roh-Titel (mit {-}/{+}); der
  // angezeigte Titel bleibt der bereinigte extractHeadingText.
  let numberByLine = null;
  if (doc && isExtensionActive('heading-numbering')) {
    const fm = readDocFrontmatter(doc);
    const ctx = resolveHeadingNumberingForDoc(fm.data);
    const real = headings.filter((h) => h.fromLine > fm.endLine);
    const nums = computeHeadingNumbers(
      real.map((h) => ({ level: h.level, rawTitle: extractRawHeadingTitle(doc, h.fromLine) })),
      ctx,
    );
    numberByLine = new Map();
    real.forEach((h, i) => {
      if (nums[i] && nums[i].number) numberByLine.set(h.fromLine, nums[i].number);
    });
  }
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const li = document.createElement('li');
    li.className = 'outline-entry';
    li.style.paddingLeft = (h.level - 1) * OUTLINE_INDENT_PX + 'px';
    li.dataset.line = String(h.fromLine);
    li.dataset.level = String(h.level);

    const fold = document.createElement('span');
    fold.className = 'outline-fold';
    fold.dataset.action = 'fold';
    const folded = view ? isHeadingRegionFolded(view, h.fromLine) : false;
    fold.textContent = folded ? '›' : '⌄';
    li.appendChild(fold);

    const label = document.createElement('span');
    label.className = 'outline-label';
    label.dataset.action = 'jump';
    const text = doc ? extractHeadingText(doc, h.fromLine) : `Heading ${h.fromLine}`;
    const num = numberByLine ? numberByLine.get(h.fromLine) : null;
    if (num) {
      const numSpan = document.createElement('span');
      numSpan.className = 'outline-number';
      numSpan.textContent = num + ' ';
      label.appendChild(numSpan);
      label.appendChild(document.createTextNode(text));
      label.title = num + ' ' + text;
    } else {
      label.textContent = text;
      label.title = text;
    }
    li.appendChild(label);

    els.outlineTree.appendChild(li);
  }
  applyOutlineActiveHighlight(paneIdx);
}

// Extrahiert den Text einer Heading-Zeile aus dem Doc, mit ATX- bzw. Setext-
// Bereinigung. Trailing '#' bei ATX werden mit entfernt.
export function extractHeadingText(doc, lineNumber) {
  if (lineNumber < 1 || lineNumber > doc.lines) return '';
  const lineObj = doc.line(lineNumber);
  let raw = lineObj.text;
  // 4T-0202: trailing Attribut-Block ({#id}/{.klasse}, markdown-it-attrs)
  // gehoert nicht in den Outline-Titel — der Render strippt ihn ebenso.
  raw = raw.replace(/\{[^\s{}][^{}]*\}[ \t]*$/, '');
  const atx = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
  if (atx) return atx[1].trim();
  return raw.trim();
}

// 4T-0471 (Epic 3E-0087): Roh-Titel einer Heading-Zeile OHNE Attribut-/
// Marker-Strip — die Marker-Erkennung des Nummerierungs-Kerns braucht das
// unveraenderte Zeilenende (`{-}`/`{+}`). Nur der `#`-Praefix wird entfernt.
function extractRawHeadingTitle(doc, lineNumber) {
  if (lineNumber < 1 || lineNumber > doc.lines) return '';
  const raw = doc.line(lineNumber).text;
  const atx = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
  if (atx) return atx[1];
  return raw.trim();
}

// 4T-0471 (Epic 3E-0087): Frontmatter-Daten und Block-Endzeile des Dokuments.
// Nur die ersten Zeilen lesen (Frontmatter steht am Datei-Anfang); das haelt
// den Outline-Aufbau billig. endLine dient dem Ausschluss der Pseudo-
// Ueberschriften, die Lezer aus `schluessel: wert` + `---` (Setext) bildet.
function readDocFrontmatter(doc) {
  const maxLines = Math.min(doc.lines, 60);
  const head = doc.sliceString(0, doc.line(maxLines).to);
  const fm = extractFrontmatter(head);
  return { data: fm.data, endLine: fm.raw ? (fm.raw.match(/\n/g) || []).length : 0 };
}

// Setzt die is-active-Klasse auf dem Outline-Eintrag, der die aktuell aktive
// Heading-Zeile traegt. Aktive Zeile wird ueber state.outline.activeLineByPane
// gehalten; aufruf nach Cursor-/Scroll-Sync oder Outline-Rerender.
export function applyOutlineActiveHighlight(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.outlineTree) return;
  const activeLine = state.outline.activeLineByPane[paneIdx] || 0;
  const entries = els.outlineTree.querySelectorAll('.outline-entry');
  let activeEntry = null;
  entries.forEach((entry) => {
    const ln = parseInt(entry.dataset.line, 10);
    entry.classList.remove('is-active');
    if (ln === activeLine) activeEntry = entry;
  });
  if (activeEntry) {
    activeEntry.classList.add('is-active');
    if (typeof activeEntry.scrollIntoView === 'function') {
      const rect = activeEntry.getBoundingClientRect();
      const body = activeEntry.closest('.sidebar-section-body');
      if (body) {
        const bodyRect = body.getBoundingClientRect();
        if (rect.top < bodyRect.top || rect.bottom > bodyRect.bottom) {
          activeEntry.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }
}

export function scheduleOutlineActiveUpdate(paneIdx) {
  if (outlineActiveTimers[paneIdx]) clearTimeout(outlineActiveTimers[paneIdx]);
  outlineActiveTimers[paneIdx] = setTimeout(() => {
    outlineActiveTimers[paneIdx] = null;
    computeOutlineActiveLine(paneIdx);
    applyOutlineActiveHighlight(paneIdx);
  }, OUTLINE_ACTIVE_DEBOUNCE_MS);
}

// Ermittelt die aktive Heading-Zeile fuer eine Pane. Im Edit-/Geteilt-Modus
// das zuletzt durchschrittene Heading (fromLine <= Cursor-Zeile), im Render-
// Modus das oberste vollstaendig sichtbare Heading.
export function computeOutlineActiveLine(paneIdx) {
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) {
    state.outline.activeLineByPane[paneIdx] = 0;
    return;
  }
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) {
    state.outline.activeLineByPane[paneIdx] = 0;
    return;
  }
  const headings = getOutlineHeadings(paneIdx);
  if (headings.length === 0) {
    state.outline.activeLineByPane[paneIdx] = 0;
    return;
  }
  if (tab.viewMode === 'rendered') {
    state.outline.activeLineByPane[paneIdx] = computeActiveLineFromRender(paneIdx, headings);
  } else {
    state.outline.activeLineByPane[paneIdx] = computeActiveLineFromCursor(paneIdx, headings);
  }
}

export function computeActiveLineFromCursor(paneIdx, headings) {
  const view = paneEditors[paneIdx];
  if (!view) return headings[0].fromLine;
  const cursorPos = view.state.selection.main.head;
  const cursorLine = view.state.doc.lineAt(cursorPos).number;
  let active = headings[0].fromLine;
  for (const h of headings) {
    if (h.fromLine <= cursorLine) active = h.fromLine;
    else break;
  }
  return active;
}

export function computeActiveLineFromRender(paneIdx, headings) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.renderedHtml) return headings[0].fromLine;
  const scrollEl = els.renderedEl;
  if (!scrollEl) return headings[0].fromLine;
  const scrollRect = scrollEl.getBoundingClientRect();
  // R3-04 (4T-0174): Headings aus Markdown-Embeds ausschliessen — sie
  // kommen im Quelltext nicht vor und verschieben sonst das indexbasierte
  // Mapping (Outline-Highlight verrutscht).
  const hElements = Array.from(els.renderedHtml.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
    (h) => !h.closest('.wiki-embed-md-body'),
  );
  if (hElements.length === 0) return headings[0].fromLine;
  // Mapping der DOM-Headings auf die foldStructureField-Headings in Reihenfolge.
  // Beide Listen folgen der Dokument-Reihenfolge, daher Index-basiertes Mapping.
  let activeIdx = 0;
  for (let i = 0; i < hElements.length && i < headings.length; i++) {
    const rect = hElements[i].getBoundingClientRect();
    if (rect.top < scrollRect.top + 8) activeIdx = i;
    else break;
  }
  return headings[activeIdx].fromLine;
}

// 4T-0183 (Knip-Zusatzfund): applyOutlineFoldIndicator entfernt — ohne
// Aufrufer; Einzel-Indikator-Updates laufen seit jeher ueber den
// Voll-Refresh (refreshAllOutlineFoldIndicators bzw. renderOutline).

export function refreshAllOutlineFoldIndicators(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.outlineTree) return;
  const view = paneEditors[paneIdx];
  if (!view) return;
  els.outlineTree.querySelectorAll('.outline-entry').forEach((entry) => {
    const ln = parseInt(entry.dataset.line, 10);
    const fold = entry.querySelector('.outline-fold');
    if (fold && Number.isFinite(ln)) {
      fold.textContent = isHeadingRegionFolded(view, ln) ? '›' : '⌄';
    }
  });
}

// Sprung-Klick: setzt Cursor auf Heading-Zeile, entfaltet Region falls noetig,
// und scrollt im Render-Pane zum entsprechenden Anker.
export function jumpToHeading(paneIdx, lineNumber) {
  const view = paneEditors[paneIdx];
  if (view) {
    if (isHeadingRegionFolded(view, lineNumber)) {
      unfoldHeadingRegion(view, lineNumber);
    }
    const doc = view.state.doc;
    if (lineNumber >= 1 && lineNumber <= doc.lines) {
      const lineObj = doc.line(lineNumber);
      view.dispatch({
        selection: { anchor: lineObj.from },
        effects: EditorView.scrollIntoView(lineObj.from, { y: 'start' }),
      });
      view.focus();
    }
  }
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (tab && (tab.viewMode === 'rendered' || tab.viewMode === 'split')) {
    const els = getPaneEls(paneIdx);
    if (els && els.renderedHtml && view) {
      const text = extractHeadingText(view.state.doc, lineNumber);
      const slug =
        typeof api.slugifyHeading === 'function'
          ? api.slugifyHeading(text)
          : text.toLowerCase().replace(/\s+/g, '-');
      // R3-05 (4T-0186): markdown-it-anchor dedupliziert gleichnamige
      // Headings (slug, slug-1, slug-2 …). Zaehlen, das wievielte
      // Vorkommen dieses Slugs die Ziel-Zeile ist, und die tatsaechliche
      // DOM-id ansteuern — vorher landete der Klick immer beim ersten.
      let occurrence = 0;
      const struct = view.state.field(foldStructureField, false);
      const headings = struct && Array.isArray(struct.headings) ? struct.headings : [];
      for (const h of headings) {
        if (h.fromLine >= lineNumber) break;
        const hText = extractHeadingText(view.state.doc, h.fromLine);
        const hSlug =
          typeof api.slugifyHeading === 'function'
            ? api.slugifyHeading(hText)
            : hText.toLowerCase().replace(/\s+/g, '-');
        if (hSlug === slug) occurrence++;
      }
      const domId = occurrence === 0 ? slug : `${slug}-${occurrence}`;
      const anchor = els.renderedHtml.querySelector(`[id="${CSS.escape(domId)}"]`);
      if (anchor) anchor.scrollIntoView({ block: 'start' });
    }
  }
}

export function toggleHeadingFoldFromOutline(paneIdx, lineNumber) {
  const view = paneEditors[paneIdx];
  if (!view) return;
  if (isHeadingRegionFolded(view, lineNumber)) {
    unfoldHeadingRegion(view, lineNumber);
  } else {
    foldHeadingRegion(view, lineNumber);
  }
}

export function bindOutlineEvents(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.outlineTree) return;
  els.outlineTree.addEventListener('click', (ev) => {
    const target = ev.target instanceof Element ? ev.target : null;
    if (!target) return;
    const entry = target.closest('.outline-entry');
    if (!entry) return;
    const action = target.dataset.action;
    const lineNumber = parseInt(entry.dataset.line, 10);
    if (!Number.isFinite(lineNumber)) return;
    if (action === 'fold') {
      toggleHeadingFoldFromOutline(paneIdx, lineNumber);
    } else {
      jumpToHeading(paneIdx, lineNumber);
    }
  });
}

export function applyOutlineVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.sidebarLeft) return;
  // 4T-0075: Outline ergibt im Empty-State keinen Sinn (keine Headings ohne
  // aktive Datei). Zwangsweise unsichtbar, persistierte Preference bleibt
  // unveraendert und greift wieder, sobald ein Tab offen ist.
  const outlineVisible = !isAllEmpty() && !!state.outline.visibleByPane[paneIdx];
  if (els.outlineSection) els.outlineSection.hidden = !outlineVisible;
  applySidebarVisibility(paneIdx);
  if (outlineVisible) {
    renderOutline(paneIdx);
    computeOutlineActiveLine(paneIdx);
    applyOutlineActiveHighlight(paneIdx);
  }
  updateOutlineToggleButton();
}

export function updateOutlineToggleButton() {
  const btn = document.getElementById('btn-outline');
  if (!btn) return;
  const visible = !!state.outline.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleOutlinePanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.outline.visibleByPane[paneIdx];
  state.outline.visibleByPane[paneIdx] = next;
  // 4T-0288: das Einblenden eines gruppierten Panels aktiviert dessen Reiter.
  if (next) await ensurePanelTabActive('outline', paneIdx);
  applyOutlineVisibility(paneIdx);
  await persistOutlineSettings();
  // Menue-Haken synchron halten (gilt fuer aktive Spalte).
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistOutlineSettings() {
  await persistSetting('outline.visibleColumn0', !!state.outline.visibleByPane[0]);
  await persistSetting('outline.visibleColumn1', !!state.outline.visibleByPane[1]);
  // 4T-0288: outline.width wird nicht mehr geschrieben — die Breite lebt
  // seitengetrennt in sidebar-layout.js (der Legacy-Key bleibt als
  // Migrations-Quelle unangetastet).
}

export async function loadOutlineSettings() {
  const v0 = await api.getSetting('outline.visibleColumn0');
  const v1 = await api.getSetting('outline.visibleColumn1');
  state.outline.visibleByPane[0] = !!v0;
  state.outline.visibleByPane[1] = !!v1;
}

// === 4T-0287 (Epic 3E-0051): Panel-Registrierung =============================
// Import-Seiteneffekt: getVisible spiegelt die effektive Sichtbarkeits-Logik
// aus applyOutlineVisibility inklusive Empty-State-Override (4T-0075).
registerSidebarPanel({
  id: 'outline',
  titleKey: 'outline.title',
  buttonId: 'btn-outline',
  sectionClass: 'sidebar-outline',
  getVisible: (paneIdx) => !isAllEmpty() && !!state.outline.visibleByPane[paneIdx],
  applyVisibility: applyOutlineVisibility,
  toggle: toggleOutlinePanel,
});
