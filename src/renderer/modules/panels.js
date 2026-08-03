// Sidebar-Sektionen Outline, Backlinks und Outgoing-Links (Rendering, Sichtbarkeit, Splitter).
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { EditorView } from '@codemirror/view';

import { t } from '../i18n.js';

import { api } from './api.js';
// 4T-0294 (Epic 3E-0052): Outgoing-Links und Backlinks gehören zur
// Wiki-Link-Erweiterung — ihre Auswertung ist Wiki-Syntax-Auswertung.
// Deaktiviert verschwinden beide Panels; die Sichtbarkeits-Preference
// bleibt persistiert und greift beim Wiedereinschalten.
import { isExtensionActive } from './extension-lifecycle.js';
import { foldStructureField } from './folding.js';
import { getPaneEls, isSidebarCollapsed, state } from './app-state.js';
import {
  foldHeadingRegion,
  isHeadingRegionFolded,
  paneEditors,
  unfoldHeadingRegion,
} from './editor.js';
import { openOrJumpToPath } from './bookmarks.js';
import { openInPane, reportMenuStateNow } from './tabs.js';
// 4T-0337 (Epic 3E-0061): Unterseiten — relative Ziele expandieren und
// Index-Fallback im Outgoing-Klick (Paritaet zum Wiki-Link-Klick-Pfad).
// 4T-0341: Segment-Logik fuer die Unterseiten-Sektion.
import {
  expandRelativeTarget,
  isRelativeTarget,
  lastSegment,
  segmentsOf,
  toFileBasename,
} from '../../shared/subpages.js';
import { showAliasDialog } from './dialogs.js';
// 4T-0347 (Epic 3E-0062): bereichsrelative Ordner-Anzeige (gemeinsam mit der
// Tag-Datei-Liste), damit gleichnamige Dateien aus verschiedenen Ordnern des
// Bereichs eindeutig unterscheidbar sind.
import { relativeDirFromRoot } from './path-format.js';
// 4T-0471 (Epic 3E-0087): Gliederungs-Nummerierung in der Outline. Der Kern
// liefert die Nummern, der Renderer-Zustand den effektiven Dokument-Kontext.
import { computeHeadingNumbers } from '../../shared/heading-numbers.js';
import { resolveHeadingNumberingForDoc } from './heading-numbering.js';
import { extractFrontmatter } from '../../shared/markdown/frontmatter.js';
// 4T-0287/4T-0288 (Epic 3E-0051): Panel-Registry und Layout-Modell — die
// hier beheimateten Panels (Outline, Outgoing-Links, Backlinks) registrieren
// sich am Modul-Ende; das Slot-Mounting der dynamischen Sidebar
// (renderSidebarForPane) liest Registry und Layout.
import {
  SIDEBAR_SIDES,
  applySidebarLayout,
  clampPanelHeight,
  clampSidebarWidth,
  ensurePanelTabActive,
  findPanelInLayout,
  getGroupHeight,
  getIconHeadings,
  getPanelHeight,
  getPanelHeightMode,
  getSidebarLayout,
  getSidebarWidth,
  groupHeightKey,
  groupPanelWith,
  HEIGHT_MODE_GROUP,
  movePanelRelativeTo,
  movePanelToNewSlot,
  registerSidebarPanel,
  setActivePanel,
  setGroupHeight,
  setPanelHeight,
  setSidebarWidth,
  sidebarPanelById,
  sidebarPanels,
} from './sidebar-layout.js';
import {
  isAllEmpty,
  normalizedAnchorId,
  persistSetting,
  scrollToAnchorAfterOpen,
  showStatusbarHint,
  tryResolveByAlias,
} from './views.js';

// --- Outline-Sidebar (4T-0014) ---------------------------------------------
// Persistente Inhaltsverzeichnis-Sicht pro Pane. Quelle ist das foldStructure-
// Field aus 4T-0013 (gleicher syntaxTree wie das Code-Folding). Klick auf den
// Heading-Text springt im Editor zur Zeile oder scrollt im Render-Pane zum
// Anker; Klick auf den Falt-Indikator toggelt nur die Editor-Region. Aktive
// Sektion folgt der Cursor-Zeile (Edit/Geteilt) bzw. der Scroll-Position
// (Render).

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

// 4T-0014/4T-0015/4T-0288: Gemeinsame Sidebar-Sichtbarkeit. Seit 4T-0288
// (Epic 3E-0051) delegiert die Funktion an das Slot-Mounting der dynamischen
// Sidebar: beide Container der Pane werden gemäß Layout-Modell bestückt; ein
// Container (samt Splitter) ist nur sichtbar, wenn mindestens ein dort
// zugeordnetes Panel in dieser Pane sichtbar ist. Die effektive Sichtbarkeit
// je Panel (inklusive Empty-State-Overrides aus 4T-0075) liefert die
// Registry über getVisible.
export function applySidebarVisibility(paneIdx) {
  renderSidebarForPane(paneIdx);
}

// 4T-0288: Slot-Mounting — hängt die bestehenden Panel-DOM-Strukturen
// (.sidebar-section) gemäß Layout-Modell in die Container der richtigen
// Seite und Reihenfolge um. Die inneren Strukturen bleiben unverändert,
// Selektoren und Event-Bindungen der Panel-Module überleben das Umhängen.
// Reiter-Gruppen erhalten eine pro Durchlauf neu gebaute Reiterleiste;
// nur das aktive Panel des Slots ist eingeblendet (CSS-Klasse tab-hidden,
// getrennt vom hidden-Attribut der Panel-Sichtbarkeit).
export function renderSidebarForPane(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.sidebarLeft || !els.sidebarRight) return;
  const layout = getSidebarLayout();
  for (const side of SIDEBAR_SIDES) {
    renderSidebarSide(paneIdx, els, layout, side);
  }
}

// 4T-0697 (Epic 3E-0141): Alle Sidebars beider Panes neu rendern. renderAllPanes
// (views.js) rendert nur Reiterleiste und Pane-Inhalt, nicht die Sidebar-Slots;
// diese Wrapper-Funktion schließt genau diese Lücke für die Laufzeit-Hooks der
// Kollaps-Erweiterung und das Aufheben des Kollaps-Zustands.
export function renderAllSidebars() {
  for (let i = 0; i < state.panes.length; i++) renderSidebarForPane(i);
}

// Sektion-Element eines Panels in dieser Pane: bevorzugt die memoisierten
// getPaneEls-Referenzen (outlineSection, tagsSection, …); Fallback über die
// registrierte Klasse (künftige Erweiterungs-Panels, 3E-0052/3E-0053).
function sectionElFor(els, id, def) {
  const cached = els[id + 'Section'];
  if (cached) return cached;
  return def && def.sectionClass ? els.root.querySelector('.' + def.sectionClass) : null;
}

// === 4T-0639 (Epic 3E-0069): Panel-Überschriften als Icon ====================
// Das Symbol kommt aus dem zugehörigen Statusbar-Button. Bewusst keine
// zweite Icon-Quelle im Panel-Modell: der Paritäts-Wächter erzwingt bereits,
// dass jedes Panel einen Statusbar-Button führt, und alle vierzehn tragen
// ihr SVG inline. Eine eigene Kennung könnte gegen die Statusbar
// auseinanderlaufen; hier ist es konstruktionsbedingt dasselbe Symbol.
export function panelIconFor(def) {
  if (!def || !def.buttonId) return null;
  const btn = document.getElementById(def.buttonId);
  const svg = btn ? btn.querySelector('svg') : null;
  if (!svg) return null;
  const clone = svg.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  return clone;
}

// Kopf-Inhalt eines Panels: im Icon-Zustand das Symbol, sonst der Text. Der
// Name bleibt in beiden Zuständen als Tooltip und Screenreader-Label
// erhalten; die Überschrift-Semantik (h2 bzw. Reiter) ändert sich nicht.
// Ohne klonbares Symbol bleibt es beim Text — lieber eine Textzeile zu viel
// als ein leerer Kopf.
function applyPanelHeading(el, def, useIcon) {
  const label = t(def.titleKey);
  el.title = label;
  el.setAttribute('aria-label', label);
  const icon = useIcon ? panelIconFor(def) : null;
  el.textContent = '';
  el.classList.toggle('icon-heading', !!icon);
  if (icon) el.appendChild(icon);
  else el.textContent = label;
}

// 4T-0855 (Epic 3E-0164): Bezugsgröße der Höhe eines Blocks. Im Panel-Modus
// (Vorgabe) ist es das governing Panel, also der aktive Reiter einer Gruppe
// beziehungsweise das Einzel-Panel; im Gruppen-Modus ist es bei einer
// Reiter-Gruppe die Gruppe selbst. Ein Slot mit nur einem Panel verhält sich
// in beiden Modi gleich — ohne Reiter-Wechsel gibt es kein Springen, also
// auch nichts festzuhalten.
//
// Die Höhe wird in beiden Fällen auf die Sektion des governing Panels
// angewendet (nur sie ist sichtbar); verschieden ist allein, woher der Wert
// kommt und wohin er geschrieben wird.
function heightRefForSlot(slot, governingId) {
  if (getPanelHeightMode() === HEIGHT_MODE_GROUP && slot && slot.panels.length > 1) {
    return { group: true, key: groupHeightKey(slot) };
  }
  return { group: false, key: governingId };
}

function readHeightRef(ref) {
  if (!ref || ref.key == null) return null;
  return ref.group ? getGroupHeight(ref.key) : getPanelHeight(ref.key);
}

function writeHeightRef(ref, value, opts) {
  if (!ref || ref.key == null) return undefined;
  return ref.group ? setGroupHeight(ref.key, value, opts) : setPanelHeight(ref.key, value, opts);
}

function renderSidebarSide(paneIdx, els, layout, side) {
  const container = side === 'left' ? els.sidebarLeft : els.sidebarRight;
  const splitter = side === 'left' ? els.sidebarSplitterLeft : els.sidebarSplitterRight;
  if (!container) return;
  // Reiterleisten werden pro Durchlauf neu gebaut (kleine, seltene DOM-
  // Arbeit; nur bei Layout-/Sichtbarkeits-Änderungen, nie pro Tastendruck).
  container.querySelectorAll('.sidebar-slot-tabs').forEach((el) => el.remove());
  // 4T-0475 (Epic 3E-0088): Höhen-Griffe werden ebenfalls pro Durchlauf neu
  // gebaut (Listener hängen direkt am erzeugten Element) — alte zuerst weg.
  container.querySelectorAll('.sidebar-panel-resizer').forEach((el) => el.remove());
  // 4T-0698 (Epic 3E-0141): Kopf-Toggle und Strich-Button je Durchlauf neu
  // aufbauen (frische Tooltips bei Sprachwechsel; Muster Reiterleiste).
  container
    .querySelectorAll('.sidebar-collapse-toggle, .sidebar-collapse-strip')
    .forEach((el) => el.remove());
  let anyVisible = false;
  // 4T-0698 (Epic 3E-0141): Kopf des obersten sichtbaren Slots — dort zieht
  // das Toggle-Icon ein. Bei einer Reiter-Gruppe die Reiterleiste, sonst der
  // Sektions-Header. Wird beim ersten sichtbaren Slot einmalig gesetzt.
  let topHeadEl = null;
  // 4T-0475: governing Panel-ID des zuletzt gerenderten sichtbaren Blocks.
  // Sobald der nächste sichtbare Block folgt, entsteht dazwischen ein Griff,
  // der die Höhe des Blocks DARÜBER (= prevGoverningId) steuert. Der letzte
  // sichtbare Block der Seite bleibt ohne Griff (kein Folge-Block).
  let prevGoverningId = null;
  // 4T-0855 (Epic 3E-0164): Bezugsgröße des zuletzt gerenderten sichtbaren
  // Blocks. Der Griff darunter schreibt in diesen Speicher — im Gruppen-Modus
  // also in die Gruppen-Höhe statt in die des aktiven Reiters.
  let prevRef = null;
  // 4T-0682 (Epic 3E-0139): Sektion des zuletzt gerenderten sichtbaren
  // Blocks. Nach der Schleife ist das der letzte Block der Seite — der
  // einzige ohne Höhen-Griff (siehe Nachbehandlung unten).
  let lastGoverningSection = null;
  // 4T-0639: einmal je Seite lesen, für Köpfe und Reiter derselbe Zustand.
  const useIconHeadings = getIconHeadings();
  for (const slot of layout[side] || []) {
    const isGroup = slot.panels.length > 1;
    const entries = [];
    for (const id of slot.panels) {
      const def = sidebarPanelById(id);
      const sectionEl = def ? sectionElFor(els, id, def) : null;
      if (def && sectionEl) entries.push({ id, def, sectionEl });
    }
    if (entries.length === 0) continue;
    const visibleIds = entries.filter((e) => e.def.getVisible(paneIdx)).map((e) => e.id);
    const slotVisible = visibleIds.length > 0;
    const effectiveActive = visibleIds.includes(slot.active) ? slot.active : visibleIds[0] || null;
    // 4T-0475: governing Panel dieses Blocks — bei einer Reiter-Gruppe der
    // aktive Reiter, sonst die Einzel-Sektion. Dessen Höhe steuert der Griff.
    const governingId = effectiveActive;
    // 4T-0855: Bezugsgröße dieses Blocks (Panel oder Gruppe, je nach Modell).
    const heightRef = heightRefForSlot(slot, governingId);
    // 4T-0475: Vor jedem sichtbaren Block außer dem ersten einen Höhen-Griff
    // einschieben, der die Höhe des vorherigen sichtbaren Blocks steuert.
    if (slotVisible && prevGoverningId) {
      container.appendChild(buildPanelResizer(paneIdx, prevGoverningId, prevRef));
    }
    // 4T-0698: Referenz auf die Reiterleiste dieses Slots (Kopf einer Gruppe),
    // damit sie unten als oberster sichtbarer Kopf verfügbar ist.
    let slotTabbar = null;
    if (isGroup && slotVisible) {
      slotTabbar = buildSlotTabbar(entries, visibleIds, effectiveActive);
      // Trenner vor jedem sichtbaren Block außer dem ersten (ersetzt die
      // frühere panel-gebundene border-top von Outgoing/Backlinks/Bookmarks,
      // die bei freier Reihenfolge an falscher Stelle säße).
      slotTabbar.classList.toggle('sidebar-sep', anyVisible);
      container.appendChild(slotTabbar);
    }
    for (const e of entries) {
      // appendChild hängt um bzw. sortiert ein — die Iterations-Reihenfolge
      // (Slots, darin Panels) ergibt die endgültige DOM-Reihenfolge.
      container.appendChild(e.sectionEl);
      e.sectionEl.classList.toggle('in-tab-group', isGroup);
      e.sectionEl.classList.toggle('tab-hidden', isGroup && e.id !== effectiveActive);
      // 4T-0639: Kopf-Darstellung je Durchlauf nachziehen. In Gruppen ist
      // der Kopf ausgeblendet (die Reiterleiste ersetzt ihn), die Pflege
      // schadet dort aber nicht und hält den Zustand konsistent, falls das
      // Panel die Gruppe später verlässt.
      const titleEl = e.sectionEl.querySelector('.sidebar-section-title');
      if (titleEl) applyPanelHeading(titleEl, e.def, useIconHeadings);
      e.sectionEl.classList.toggle(
        'sidebar-sep',
        !isGroup && anyVisible && slotVisible && e.def.getVisible(paneIdx),
      );
      // 4T-0475: fixierte Höhe nur auf die governing-Sektion des sichtbaren
      // Blocks anwenden; alle übrigen Sektionen auf Automatik zurücksetzen
      // (idempotent bei jedem Render).
      // 4T-0855: Der Wert kommt aus der Bezugsgröße des Blocks; im
      // Gruppen-Modus ist das die Gruppen-Höhe, sodass der Reiter-Wechsel die
      // Blockhöhe nicht mehr verändert.
      const fixedH = slotVisible && e.id === governingId ? readHeightRef(heightRef) : null;
      if (fixedH != null) {
        e.sectionEl.style.height = fixedH + 'px';
        e.sectionEl.classList.add('has-fixed-height');
      } else {
        e.sectionEl.style.height = '';
        e.sectionEl.classList.remove('has-fixed-height');
      }
    }
    if (slotVisible) {
      // 4T-0698: oberster sichtbarer Kopf — Reiterleiste bei einer Gruppe,
      // sonst der Sektions-Header des sichtbaren Einzel-Panels. Nur beim
      // ersten sichtbaren Slot festhalten.
      if (!topHeadEl) {
        topHeadEl = slotTabbar
          ? slotTabbar
          : (entries
              .find((e) => visibleIds.includes(e.id))
              ?.sectionEl.querySelector('.sidebar-section-header') ?? null);
      }
      anyVisible = true;
      prevGoverningId = governingId;
      prevRef = heightRef;
      lastGoverningSection = entries.find((e) => e.id === governingId)?.sectionEl ?? null;
    }
  }
  // 4T-0682 (Epic 3E-0139): Der letzte sichtbare Block einer Seite läuft
  // immer auf Automatik und nimmt damit genau seine Inhaltshöhe. Grund: Ein
  // Griff steuert stets den Block DARÜBER, hinter dem letzten folgt keiner
  // mehr, also hat er keinen. Eine fixierte Höhe wäre dort eine Sackgasse —
  // freezeSidePanelHeights hat sie bis hierher auch ohne Zutun des Anwenders
  // angelegt, und danach gab es keine Bedienung mehr, um sie zu ändern. Ein
  // Panel stand so dauerhaft auf der Höhe, die es beim ersten Ziehen
  // zufällig hatte, und rollte, obwohl darunter beliebig viel Platz frei
  // war (Befund des Product Owners am Uhr-Panel). Der gespeicherte Wert
  // bleibt erhalten und greift wieder, sobald das Panel nicht mehr der
  // letzte Block ist; dann hat es auch wieder einen Griff.
  if (lastGoverningSection) {
    lastGoverningSection.style.height = '';
    lastGoverningSection.classList.remove('has-fixed-height');
  }
  container.hidden = !anyVisible;
  // 4T-0697 (Epic 3E-0141): Kollaps-Zustand der Spalte über eine eigene
  // Klasse, strikt getrennt vom Sichtbarkeits-hidden oben. Er greift nur bei
  // sichtbaren Panels (eine panel-leere Spalte kollabiert weiterhin über
  // container.hidden) und nur bei aktiver Erweiterung — im Aus-Zustand bleibt
  // die Spalte sichtbar (Muster Fokus-Modus-Laden).
  const extActive = isExtensionActive('sidebar-collapse');
  const collapsed = anyVisible && extActive && isSidebarCollapsed(paneIdx, side);
  container.classList.toggle('collapsed', collapsed);
  // 4T-0698 (Epic 3E-0141): Bedien-Ort in der Spalte. Kopf-Toggle in den
  // obersten sichtbaren Kopf einhängen (im Kollaps über die Klasse mit-
  // ausgeblendet, dort übernimmt der Strich-Button). Der Strich-Button lebt
  // als direkter Container-Kind unabhängig von den Slots und ist per CSS nur
  // im eingeklappten Zustand sichtbar. Beides nur bei aktiver Erweiterung und
  // nur bei sichtbaren Panels — eine panel-leere Spalte kollabiert weiterhin
  // vollständig über container.hidden, ohne Strich und ohne Icon.
  if (extActive && anyVisible) {
    if (topHeadEl) injectCollapseToggle(topHeadEl, paneIdx, side);
    container.appendChild(buildCollapseStrip(paneIdx, side));
  }
  if (splitter) splitter.hidden = !anyVisible || collapsed;
  if (anyVisible && !collapsed) {
    container.style.width = getSidebarWidth(side) + 'px';
  } else if (collapsed) {
    // 4T-0698: Die Laufzeit-Breite (Inline-style aus dem letzten ausgeklappten
    // Render) aktiv räumen, damit die schmale Strich-Breite aus der CSS-Klasse
    // .pane-sidebar.collapsed greift (Inline-width schlägt sonst die Klasse).
    container.style.width = '';
  }
}

// === 4T-0698 (Epic 3E-0141): Kopf-Toggle und Hover-Strich der Spalte ========
// Klassisches Sidebar-Symbol als Inline-SVG: Rechteck-Rahmen mit gefüllter
// linker Teilfläche (Trennlinie bei x=9), im Stil der Sektions-Header-Icons
// (viewBox 24, 14px, currentColor, stroke-width 2). Die rechte Spalte spiegelt
// es allein per CSS (transform: scaleX(-1)); die Grafik ist in beiden
// Zuständen identisch, nur der Tooltip wechselt (einklappen/ausklappen).
const SIDEBAR_TOGGLE_SVG_NS = 'http://www.w3.org/2000/svg';

function buildSidebarToggleIcon() {
  const svg = document.createElementNS(SIDEBAR_TOGGLE_SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const frame = document.createElementNS(SIDEBAR_TOGGLE_SVG_NS, 'rect');
  frame.setAttribute('x', '3');
  frame.setAttribute('y', '4');
  frame.setAttribute('width', '18');
  frame.setAttribute('height', '16');
  frame.setAttribute('rx', '2');
  svg.appendChild(frame);
  // Gefüllte linke Teilfläche mit gerundeten Außenecken (folgen dem Rahmen),
  // gerade Kante bei x=9 als Trennlinie zur (leeren) rechten Fläche.
  const fill = document.createElementNS(SIDEBAR_TOGGLE_SVG_NS, 'path');
  fill.setAttribute('d', 'M5 4h4v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z');
  fill.setAttribute('fill', 'currentColor');
  fill.setAttribute('stroke', 'none');
  svg.appendChild(fill);
  return svg;
}

// Klick-Guards, gemeinsam für Kopf-Toggle und Strich-Button: kein Panel-Drag
// aus dem Button heraus (der Sektions-Kopf ist Drag-Quelle) und kein
// Durchreichen an Reiter- oder Container-Klicks — der Klick toggelt
// ausschließlich den Kollaps der eigenen Spalte.
function bindCollapseToggleHandlers(btn, paneIdx, side) {
  btn.draggable = true;
  btn.addEventListener('dragstart', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleSidebarCollapse(paneIdx, side);
  });
}

// Kopf-Toggle (eingeblendeter Zustand): am inneren Rand des obersten
// sichtbaren Kopfs. Linke Spalte rechtsbündig (ans Ende, CSS margin-left:auto),
// rechte Spalte linksbündig vor dem ersten Element (als erstes Kind).
function injectCollapseToggle(headEl, paneIdx, side) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar-collapse-toggle';
  const label = t('sidebar.collapse.tooltip');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.appendChild(buildSidebarToggleIcon());
  bindCollapseToggleHandlers(btn, paneIdx, side);
  if (side === 'right') headEl.insertBefore(btn, headEl.firstChild);
  else headEl.appendChild(btn);
}

// Strich-Button (eingeklappter Zustand): direktes Container-Kind, per CSS nur
// bei .collapsed sichtbar und erst beim Überfahren des Strichs eingeblendet.
// Gleiche Grafik wie der Kopf-Toggle, Tooltip „ausklappen".
function buildCollapseStrip(paneIdx, side) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar-collapse-strip';
  const label = t('sidebar.expand.tooltip');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.appendChild(buildSidebarToggleIcon());
  bindCollapseToggleHandlers(btn, paneIdx, side);
  return btn;
}

// 4T-0475 (Epic 3E-0088): Sektions-Element eines Panels in einer bestimmten
// Pane (für die Höhen-Anwendung über beide Panes hinweg während eines Drags).
function panelSectionEl(paneIdx, panelId) {
  const paneEls = getPaneEls(paneIdx);
  const def = sidebarPanelById(panelId);
  if (!paneEls || !def) return null;
  return sectionElFor(paneEls, panelId, def);
}

// 4T-0634 (Epic 3E-0119): Alle sichtbaren Blöcke derselben Sidebar-Seite,
// die noch keine fixierte Höhe haben, auf ihrer aktuellen Ist-Höhe
// einfrieren (Messung in der Pane des Griffs, Anwendung in allen Panes).
// Erst alles messen, dann fixieren — das Fixieren löst Reflows aus, die
// spätere Messungen verfälschen würden. Damit ist während eines Drags jede
// Sektion der Seite höhenstabil und ausschließlich das gezogene Panel
// folgt der Maus; ohne das Einfrieren verteilte der Flex-Algorithmus das
// Höhen-Defizit auf die automatisch bemessenen Nachbar-Blöcke.
function freezeSidePanelHeights(paneIdx, dragPanelId) {
  const layout = getSidebarLayout();
  const pos = findPanelInLayout(layout, dragPanelId);
  if (!pos) return;
  // 4T-0855 (Epic 3E-0164): Eingefroren wird je Block seine Bezugsgröße —
  // im Gruppen-Modus also die Gruppen-Höhe und nicht die des aktiven Reiters.
  // Gemessen wird unverändert an der Sektion des governing Panels, weil nur
  // sie sichtbar ist.
  const bloecke = [];
  for (const slot of layout[pos.side] || []) {
    const visible = slot.panels.filter((id) => {
      const def = sidebarPanelById(id);
      return def && def.getVisible(paneIdx);
    });
    if (visible.length === 0) continue;
    const governingId = visible.includes(slot.active) ? slot.active : visible[0];
    bloecke.push({ governingId, ref: heightRefForSlot(slot, governingId) });
  }
  // 4T-0682 (Epic 3E-0139): Den letzten sichtbaren Block nicht einfrieren.
  // Er hat keinen eigenen Griff (der Griff steuert immer den Block darüber),
  // und ein Store-Eintrag für ihn liesse sich danach nie wieder ändern.
  // renderSidebarSide nimmt ihm die fixierte Höhe ohnehin wieder ab; ihn
  // hier auszulassen verhindert, dass der Eintrag überhaupt erst entsteht.
  bloecke.pop();
  const measured = [];
  for (const { governingId, ref } of bloecke) {
    if (readHeightRef(ref) != null) continue;
    const sec = panelSectionEl(paneIdx, governingId);
    if (!sec) continue;
    measured.push({ governingId, ref, height: sec.getBoundingClientRect().height });
  }
  for (const { governingId, ref, height } of measured) {
    const next = clampPanelHeight(height);
    if (next == null) continue;
    for (let i = 0; i < state.panes.length; i++) {
      const sec = panelSectionEl(i, governingId);
      if (sec) {
        sec.style.height = next + 'px';
        sec.classList.add('has-fixed-height');
      }
    }
    writeHeightRef(ref, next, { persist: false });
  }
}

// 4T-0475 (Epic 3E-0088): horizontaler Zieh-Griff zwischen zwei gestapelten
// Blöcken. Steuert die Höhe des Panels DARÜBER (panelId, in Gruppen der
// aktive Reiter). Drag-Muster wie bindSidebarSplitters: Starthöhe aus der
// Bounding-Box der EIGENEN Pane des Griffs (die Sichtbarkeit ist pro Pane —
// die aktive Pane könnte das Panel versteckt haben und Höhe 0 liefern),
// mousemove klemmt und wendet direkt auf die passende Sektion in BEIDEN
// Panes an (Höhe gilt global pro Panel-ID), einmaliges Persistieren am
// mouseup. Doppelklick setzt die Höhe auf Automatik zurück. 4T-0634:
// die erste Bewegung friert zusätzlich die übrigen sichtbaren Blöcke der
// Seite ein (ein reiner Klick ohne Bewegung ändert nichts); der eine
// Persist-Aufruf am mouseup schreibt das gesamte Höhen-Objekt inklusive
// der eingefrorenen Werte.
// 4T-0855 (Epic 3E-0164): `ref` bestimmt, WOHIN die gezogene Höhe geschrieben
// wird (Panel oder Gruppe); `panelId` bleibt das governing Panel und damit die
// Sektion, an der gemessen und auf die angewendet wird.
function buildPanelResizer(paneIdx, panelId, ref) {
  const handle = document.createElement('div');
  handle.className = 'sidebar-panel-resizer';
  handle.dataset.panelId = panelId;
  if (ref && ref.group) handle.dataset.groupKey = ref.key;
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const startSection = panelSectionEl(paneIdx, panelId);
    if (!startSection) return;
    const startY = ev.clientY;
    const startH = startSection.getBoundingClientRect().height;
    let frozen = false;
    function onMove(e) {
      if (!frozen) {
        frozen = true;
        freezeSidePanelHeights(paneIdx, panelId);
      }
      const dy = e.clientY - startY;
      const next = clampPanelHeight(startH + dy);
      if (next == null) return;
      for (let i = 0; i < state.panes.length; i++) {
        const sec = panelSectionEl(i, panelId);
        if (sec) {
          sec.style.height = next + 'px';
          sec.classList.add('has-fixed-height');
        }
      }
      writeHeightRef(ref, next, { persist: false });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Erst am Drag-Ende persistieren (ein Store-Schreibzugriff).
      writeHeightRef(ref, readHeightRef(ref));
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  handle.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    for (let i = 0; i < state.panes.length; i++) {
      const sec = panelSectionEl(i, panelId);
      if (sec) {
        sec.style.height = '';
        sec.classList.remove('has-fixed-height');
      }
    }
    // 4T-0855: Im Gruppen-Modus setzt der Doppelklick die ganze Gruppe auf
    // Automatik zurück, weil der Eintrag der Gruppe gilt und nicht dem
    // gerade sichtbaren Reiter.
    writeHeightRef(ref, null);
  });
  return handle;
}

// Reiterleiste eines Gruppen-Slots: ein Reiter je sichtbarem Panel,
// lokalisierter Panel-Titel, Klick aktiviert den Reiter im globalen
// Layout-Modell (alle Panes ziehen über das Änderungs-Event nach).
function buildSlotTabbar(entries, visibleIds, effectiveActive) {
  const bar = document.createElement('div');
  bar.className = 'sidebar-slot-tabs';
  bar.setAttribute('role', 'tablist');
  // 4T-0639: Reiter folgen demselben Zustand wie die Sektions-Köpfe — nie
  // gemischt Text und Icon.
  const useIcon = getIconHeadings();
  for (const e of entries) {
    if (!visibleIds.includes(e.id)) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-slot-tab';
    btn.dataset.panelId = e.id;
    applyPanelHeading(btn, e.def, useIcon);
    btn.setAttribute('role', 'tab');
    const active = e.id === effectiveActive;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.addEventListener('click', () => {
      applySidebarLayout(setActivePanel(getSidebarLayout(), e.id));
    });
    // 4T-0289: Reiter sind Drag-Quelle fuer gruppierte Panels (die
    // Sektions-Header sind in Gruppen ausgeblendet).
    btn.draggable = true;
    btn.addEventListener('dragstart', (ev) => handlePanelDragStart(ev, e.id));
    btn.addEventListener('dragend', cancelPanelDrag);
    bar.appendChild(btn);
  }
  // 4T-0289: Drop auf die Reiterleiste erweitert die Gruppe; das erste
  // Panel des Slots identifiziert die Gruppe stabil.
  const anchorId = entries[0].id;
  bar.addEventListener('dragover', (ev) => handlePanelDragOverTabbar(ev, anchorId, bar));
  bar.addEventListener('drop', handlePanelDrop);
  return bar;
}

// === 4T-0289: Drag-and-Drop der Panels ======================================
// HTML5-DnD nach dem Bookmarks-Muster (4T-0079), eigener MIME-Typ, damit
// Bookmark-Drags, Tab-Drags und Datei-Drops unberuehrt bleiben. Quellen:
// Sektions-Header (Einzel-Panels) und Gruppen-Reiter. Ziel-Zonen:
//   - Sektion oberes/unteres Drittel: davor/dahinter (eigener Slot),
//   - Sektion mittleres Drittel oder Reiterleiste: Gruppe bilden/erweitern,
//   - Container-Freiflaeche (auch leere Gegenseite): ans Ende der Seite.
// Waehrend des Drags zeigt body.panel-dragging leere (versteckte)
// Container als schmale Drop-Streifen. Aenderungen wirken auf das globale
// Layout; alle Panes und Fenster ziehen ueber Event bzw. Broadcast nach.

export const PANEL_DND_MIME = 'application/x-sidebar-panel';
// { panelId, targetPanelId, targetSide, zone } | null
let panelDrag = null;

const PANEL_DROP_CLASSES = [
  'is-panel-drop-before',
  'is-panel-drop-after',
  'is-panel-drop-into',
  'is-panel-drop-append',
];

function clearPanelDropIndicators() {
  document
    .querySelectorAll('.' + PANEL_DROP_CLASSES.join(', .'))
    .forEach((el) => el.classList.remove(...PANEL_DROP_CLASSES));
}

function handlePanelDragStart(ev, panelId) {
  if (ev.dataTransfer) {
    ev.dataTransfer.setData(PANEL_DND_MIME, panelId);
    ev.dataTransfer.effectAllowed = 'move';
  }
  panelDrag = { panelId, targetPanelId: null, targetSide: null, zone: null };
  document.body.classList.add('panel-dragging');
  ev.stopPropagation();
}

// 4T-0289: bricht einen laufenden Panel-Drag ab bzw. raeumt nach dessen
// Ende auf (dragend, Esc-Kaskade in app-init).
export function cancelPanelDrag() {
  panelDrag = null;
  document.body.classList.remove('panel-dragging');
  clearPanelDropIndicators();
}

function setPanelDropTarget(el, zone, targetPanelId, targetSide) {
  if (
    panelDrag.targetPanelId === (targetPanelId || null) &&
    panelDrag.targetSide === (targetSide || null) &&
    panelDrag.zone === zone
  ) {
    return;
  }
  clearPanelDropIndicators();
  el.classList.add('is-panel-drop-' + zone);
  panelDrag.targetPanelId = targetPanelId || null;
  panelDrag.targetSide = targetSide || null;
  panelDrag.zone = zone;
}

function handlePanelDragOverSection(ev, targetPanelId, sectionEl) {
  if (!panelDrag) return;
  if (panelDrag.panelId === targetPanelId) {
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  const rect = sectionEl.getBoundingClientRect();
  const offset = ev.clientY - rect.top;
  const third = rect.height / 3;
  const zone = offset < third ? 'before' : offset > rect.height - third ? 'after' : 'into';
  setPanelDropTarget(sectionEl, zone, targetPanelId, null);
}

function handlePanelDragOverTabbar(ev, anchorPanelId, barEl) {
  if (!panelDrag) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  setPanelDropTarget(barEl, 'into', anchorPanelId, null);
}

function handlePanelDragOverContainer(ev, side, container) {
  if (!panelDrag) return;
  // Nur die Freiflaeche des Containers (Sektionen stoppen die Propagation
  // ihrer eigenen dragover-Events).
  if (ev.target !== container) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  setPanelDropTarget(container, 'append', null, side);
}

async function handlePanelDrop(ev) {
  if (!panelDrag || !panelDrag.panelId) return;
  ev.preventDefault();
  ev.stopPropagation();
  const { panelId, targetPanelId, targetSide, zone } = panelDrag;
  cancelPanelDrag();
  const layout = getSidebarLayout();
  let next = layout;
  if (zone === 'append' && targetSide) {
    next = movePanelToNewSlot(layout, panelId, targetSide, Number.MAX_SAFE_INTEGER);
  } else if (zone === 'into' && targetPanelId) {
    next = groupPanelWith(layout, panelId, targetPanelId);
  } else if ((zone === 'before' || zone === 'after') && targetPanelId) {
    next = movePanelRelativeTo(layout, panelId, targetPanelId, zone);
  }
  if (next !== layout) await applySidebarLayout(next);
}

// Bindet die DnD-Handler einer Pane. Sektionen und Container sind statisches
// DOM (einmalige Bindung aus bindPaneEvents); die dynamischen Reiterleisten
// binden ihre Handler beim Aufbau in buildSlotTabbar.
export function bindSidebarPanelDnd(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.sidebarLeft || !els.sidebarRight) return;
  for (const def of sidebarPanels()) {
    const sectionEl = sectionElFor(els, def.id, def);
    if (!sectionEl) continue;
    const header = sectionEl.querySelector('.sidebar-section-header');
    if (header) {
      header.draggable = true;
      header.addEventListener('dragstart', (ev) => handlePanelDragStart(ev, def.id));
      header.addEventListener('dragend', cancelPanelDrag);
    }
    sectionEl.addEventListener('dragover', (ev) =>
      handlePanelDragOverSection(ev, def.id, sectionEl),
    );
    sectionEl.addEventListener('drop', handlePanelDrop);
  }
  for (const side of SIDEBAR_SIDES) {
    const container = side === 'left' ? els.sidebarLeft : els.sidebarRight;
    container.addEventListener('dragover', (ev) =>
      handlePanelDragOverContainer(ev, side, container),
    );
    container.addEventListener('drop', handlePanelDrop);
    container.addEventListener('dragleave', (ev) => {
      if (!container.contains(ev.relatedTarget)) clearPanelDropIndicators();
    });
  }
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
  if (next) await ensurePanelTabActive('outline');
  applyOutlineVisibility(paneIdx);
  await persistOutlineSettings();
  // Menue-Haken synchron halten (gilt fuer aktive Spalte).
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

// === 4T-0697 (Epic 3E-0141): Kollaps-Zustand der Sidebar-Spalten ===========
// Setter/Toggle des Spalten-Kollaps je Editor-Spalte (Pane-Group) und Seite.
// Verhaltensmuster setFocusMode/toggleFocusMode: Zustand setzen, Rendern der
// betroffenen Spalte anstoßen, api.setSetting schreiben, Menü-Häkchen der
// aktiven Spalte nachziehen. Physisch hier statt in app-state.js, weil der
// Setter — wie der Bestands-Setter toggleOutlinePanel — eine pane-gebundene
// Sidebar neu rendern muss; app-state.js bleibt bewusst zyklusarm (kein
// Import von panels.js). Die Panel-Sichtbarkeiten bleiben unangetastet, das
// spätere Ausklappen stellt exakt den vorherigen Stand wieder her.
export function setSidebarCollapsed(paneIdx, side, on) {
  if (side !== 'left' && side !== 'right') return;
  const arr = state.sidebarCollapsed[side];
  if (!arr || paneIdx < 0 || paneIdx >= arr.length) return;
  const next = !!on;
  if (arr[paneIdx] === next) return;
  arr[paneIdx] = next;
  renderSidebarForPane(paneIdx);
  api.setSetting('sidebarCollapsed', state.sidebarCollapsed);
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export function toggleSidebarCollapse(paneIdx, side) {
  const arr = state.sidebarCollapsed[side];
  if (!arr || paneIdx < 0 || paneIdx >= arr.length) return;
  setSidebarCollapsed(paneIdx, side, !arr[paneIdx]);
}

// 4T-0697: Aus-Zustand der Erweiterung — gespeicherten Kollaps-Zustand
// vollständig aufheben, damit keine Spalte unbedienbar eingeklappt
// zurückbleibt (im Aus-Zustand gibt es weder Kommando noch Icon zum
// Ausklappen). No-op, wenn ohnehin alles ausgeklappt ist (kein überflüssiger
// Store-Write, kein Re-Render). Mit { render: false } unterdrückt der Aufrufer
// den eigenen Re-Render, weil er unmittelbar danach selbst alle Sidebars
// rendert (Deaktivierungs-Hook, siehe app-init.js) — so entsteht kein
// doppeltes Rendern, wenn eine Spalte eingeklappt war.
export function clearSidebarCollapsed({ render = true } = {}) {
  let any = false;
  for (const side of SIDEBAR_SIDES) {
    const arr = state.sidebarCollapsed[side];
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]) {
        arr[i] = false;
        any = true;
      }
    }
  }
  if (!any) return;
  if (render) renderAllSidebars();
  api.setSetting('sidebarCollapsed', state.sidebarCollapsed);
  reportMenuStateNow();
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

// Splitter-Logik der Sidebars (Drag horizontal). 4T-0288: verallgemeinert
// auf beide Seiten — jede Seite hat eine eigene, global persistierte Breite
// (sidebar.widthLeft/widthRight); der rechte Splitter arbeitet gespiegelt
// (Ziehen nach links vergrößert die rechte Sidebar).
export function bindSidebarSplitters(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els) return;
  for (const side of SIDEBAR_SIDES) {
    const splitter = side === 'left' ? els.sidebarSplitterLeft : els.sidebarSplitterRight;
    const container = side === 'left' ? els.sidebarLeft : els.sidebarRight;
    if (!splitter || !container) continue;
    splitter.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const startX = ev.clientX;
      const startW = container.getBoundingClientRect().width;
      function onMove(e) {
        const dx = e.clientX - startX;
        const next = clampSidebarWidth(side === 'left' ? startW + dx : startW - dx);
        setSidebarWidth(side, next, { persist: false });
        // Beide Panes an die gleiche Breite dieser Seite anpassen (die
        // Breite gilt pro Seite, nicht pro Pane).
        for (let i = 0; i < state.panes.length; i++) {
          const e2 = getPaneEls(i);
          const c2 = e2 && (side === 'left' ? e2.sidebarLeft : e2.sidebarRight);
          if (c2 && !c2.hidden) c2.style.width = next + 'px';
        }
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        // Erst am Drag-Ende persistieren (ein Store-Schreibzugriff statt
        // einem pro Mouse-Move).
        setSidebarWidth(side, getSidebarWidth(side));
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }
}

// --- Backlinks-Sidebar (4T-0015) -------------------------------------------
// Zweite Sektion der linken Sidebar. Zeigt eingehende Referenzen auf die
// aktive Datei aus dem Suchraum (Datei-Ordner + 2 Unterordner-Ebenen).
// Indexierung laeuft im Main-Prozess; der Renderer fragt pro Pane bei
// Tab-Wechsel die Backlinks an und gibt die alte Wurzel frei (paarweises
// request/release fuer Refcounting + 60-s-Soft-Timer).

export async function activateBacklinksFor(paneIdx, filePath) {
  // R3-02 (4T-0175): currentFileByPane SYNCHRON setzen und eine Request-
  // Generation ziehen, bevor irgendein await die Kontrolle abgibt. Parallele
  // Aufrufe (Tab-Wechsel + Invalidate) konnten sonst doppelt releasen und
  // ein veraltetes Ergebnis nach dem neuen rendern.
  const prev = state.backlinks.currentFileByPane[paneIdx];
  state.backlinks.currentFileByPane[paneIdx] = filePath || null;
  if (!state.backlinks.requestGenByPane) state.backlinks.requestGenByPane = [0, 0];
  const gen = ++state.backlinks.requestGenByPane[paneIdx];

  if (prev && prev !== filePath) {
    // B-01 (4T-0175): Release mit Owner-Kontext (Pane). Doppel-Release ist
    // im Owner-Modell idempotent.
    try {
      await api.releaseBacklinks(prev, paneIdx);
    } catch {
      /* ignore */
    }
  }
  if (!filePath) {
    state.backlinks.lastResultsByPane[paneIdx] = { status: 'unavailable' };
    renderBacklinks(paneIdx);
    return;
  }
  // Wir fragen direkt an. Status 'ready' kommt im Normalfall sync zurueck.
  let payload;
  try {
    payload = await api.requestBacklinks(filePath, paneIdx);
  } catch {
    payload = { status: 'unavailable' };
  }
  // Race-Sicherung: nur die juengste Anfrage dieser Pane darf rendern.
  if (state.backlinks.requestGenByPane[paneIdx] !== gen) return;
  if (state.backlinks.currentFileByPane[paneIdx] !== filePath) return;
  state.backlinks.lastResultsByPane[paneIdx] = payload;
  renderBacklinks(paneIdx);
}

export async function deactivateBacklinksFor(paneIdx) {
  const prev = state.backlinks.currentFileByPane[paneIdx];
  // R3-02: synchron leeren, bevor das await die Kontrolle abgibt.
  state.backlinks.currentFileByPane[paneIdx] = null;
  state.backlinks.lastResultsByPane[paneIdx] = null;
  if (state.backlinks.requestGenByPane) state.backlinks.requestGenByPane[paneIdx]++;
  if (prev) {
    try {
      await api.releaseBacklinks(prev, paneIdx);
    } catch {
      /* ignore */
    }
  }
}

export function renderBacklinks(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.backlinksResults || !els.backlinksStatus) return;
  const payload = state.backlinks.lastResultsByPane[paneIdx];
  els.backlinksResults.innerHTML = '';
  els.backlinksStatus.hidden = true;
  els.backlinksStatus.textContent = '';
  if (!payload) {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.indexing');
    return;
  }
  if (payload.status === 'unavailable') {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.unavailable');
    return;
  }
  if (payload.status === 'oversized') {
    els.backlinksStatus.hidden = false;
    const meta = payload.meta || {};
    const files = meta.fileCount || 0;
    const mb = meta.byteSize ? Math.round(meta.byteSize / (1024 * 1024)) : 0;
    els.backlinksStatus.textContent = t('backlinks.oversized')
      .replace('{files}', String(files))
      .replace('{mb}', String(mb));
    return;
  }
  if (payload.status === 'indexing') {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.indexing');
    return;
  }
  // B-21 (4T-0187): Watcher-Fehler sichtbar machen statt leerem Panel.
  if (payload.status === 'error') {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.watchError');
    return;
  }
  // ready
  const groups = Array.isArray(payload.results) ? payload.results : [];
  // 4T-0347 (Epic 3E-0062): Index-Wurzel fuer die relative Ordner-Anzeige der
  // Quelldateien (im Bereich der Bereichs-Wurzelordner, sonst die Ordner-Wurzel).
  const wurzel = payload.meta && payload.meta.wurzel;
  // B-22 (4T-0187): Hinweis auf beim Scan uebersprungene (unlesbare) Ordner.
  const skipped = payload.meta && payload.meta.skippedDirs ? payload.meta.skippedDirs : 0;
  if (skipped > 0) {
    els.backlinksStatus.hidden = false;
    els.backlinksStatus.textContent = t('backlinks.skippedDirs').replace('{n}', String(skipped));
  }
  if (groups.length === 0) {
    if (skipped === 0) {
      els.backlinksStatus.hidden = false;
      els.backlinksStatus.textContent = t('backlinks.empty');
    }
    return;
  }
  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = 'backlinks-group';

    const header = document.createElement('div');
    header.className = 'backlinks-group-header';
    // 4T-0347 (Epic 3E-0062): zweizeilig — Basename prominent, darunter der
    // Ordner relativ zur Index-Wurzel. Datei direkt in der Wurzel -> nur der
    // Basename (kein Ordner-Zusatz). Voller Pfad bleibt im Tooltip.
    const nameEl = document.createElement('div');
    nameEl.className = 'backlinks-group-name';
    nameEl.textContent = api.basename(group.quelldatei);
    header.appendChild(nameEl);
    const relDir = relativeDirFromRoot(wurzel, group.quelldatei);
    if (relDir) {
      const dirEl = document.createElement('div');
      dirEl.className = 'backlinks-group-dir';
      dirEl.textContent = relDir;
      header.appendChild(dirEl);
    }
    header.title = group.quelldatei;
    const firstHit = group.hits[0];
    header.addEventListener('click', () => {
      openOrJumpToPath(group.quelldatei, firstHit ? firstHit.zeile : 1);
    });
    groupEl.appendChild(header);

    for (const hit of group.hits) {
      const hitEl = document.createElement('div');
      hitEl.className = 'backlinks-hit';
      const meta = document.createElement('span');
      meta.className = 'backlinks-hit-meta';
      // R3-09 (4T-0185): Zeilen-Label lokalisiert (Muster vom Outgoing-
      // Panel); der Anker-Teil ('#<anker>') ist sprachneutrale Markdown-
      // Notation und bleibt unuebersetzt.
      let metaText = t('backlinks.line').replace('{line}', String(hit.zeile));
      if (hit.anker) metaText += ', #' + hit.anker;
      metaText += '  ';
      meta.textContent = metaText;
      hitEl.appendChild(meta);
      const snip = document.createElement('span');
      snip.className = 'backlinks-hit-snippet';
      snip.textContent = hit.snippet || '';
      hitEl.appendChild(snip);
      // 4T-0050 (Epic 3E-0010): Wenn der Backlink ueber einen Alias der
      // aktiven Datei zustande kommt, wird ein dezentes 'via <alias>'-Tag
      // angehaengt. Macht transparent, dass die Quelldatei nicht den
      // Datei-Namen verwendet hat, sondern einen Alias.
      if (hit.viaAlias) {
        const aliasTag = document.createElement('span');
        aliasTag.className = 'backlink-via-alias';
        aliasTag.textContent = t('backlinks.viaAlias').replace('{alias}', hit.viaAlias);
        hitEl.appendChild(aliasTag);
      }
      hitEl.title = hit.snippet || '';
      hitEl.addEventListener('click', () => {
        openOrJumpToPath(group.quelldatei, hit.zeile);
      });
      groupEl.appendChild(hitEl);
    }
    els.backlinksResults.appendChild(groupEl);
  }
  // Tooltip im Info-Symbol auf die konkrete Wurzel setzen.
  if (els.backlinksInfo) {
    const wurzel = payload.meta && payload.meta.wurzel;
    if (wurzel) {
      els.backlinksInfo.title = t('backlinks.scopeTooltip').replace('{root}', wurzel);
    }
  }
}

export function applyBacklinksVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.backlinksSection) return;
  // 4T-0075: Backlinks im Empty-State zwangsweise unsichtbar.
  // 4T-0294: bei deaktivierter Wiki-Link-Erweiterung ebenso — der
  // else-Zweig gibt zugleich die Index-Wurzel frei (keine Index-Last).
  const visible =
    !isAllEmpty() && isExtensionActive('wiki-links') && !!state.backlinks.visibleByPane[paneIdx];
  els.backlinksSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    // Bei Aktivierung aktuelle Datei abfragen.
    const pane = state.panes[paneIdx];
    const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    activateBacklinksFor(paneIdx, tab && tab.path ? tab.path : null);
  } else {
    deactivateBacklinksFor(paneIdx);
  }
  updateBacklinksToggleButton();
}

export function updateBacklinksToggleButton() {
  const btn = document.getElementById('btn-backlinks');
  if (!btn) return;
  const visible = !!state.backlinks.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleBacklinksPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.backlinks.visibleByPane[paneIdx];
  state.backlinks.visibleByPane[paneIdx] = next;
  // 4T-0288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('backlinks');
  applyBacklinksVisibility(paneIdx);
  await persistBacklinksSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistBacklinksSettings() {
  await persistSetting('backlinks.visibleColumn0', !!state.backlinks.visibleByPane[0]);
  await persistSetting('backlinks.visibleColumn1', !!state.backlinks.visibleByPane[1]);
}

export async function loadBacklinksSettings() {
  const v0 = await api.getSetting('backlinks.visibleColumn0');
  const v1 = await api.getSetting('backlinks.visibleColumn1');
  state.backlinks.visibleByPane[0] = !!v0;
  state.backlinks.visibleByPane[1] = !!v1;
}

// === 4T-0073 (Epic 3E-0013): Outgoing-Links-Panel ===========================
// Extrahiert Wiki-Links, Wiki-Embeds und interne Markdown-Links der aktiven
// Datei. Pro Re-Render Token-Walk ueber den Text — kein globaler Index. Die
// Reihenfolge im Panel folgt der Dokument-Reihenfolge.
//
// Erkennung (R3-14/4T-0183: Kommentar an die implementierte Regex
// angeglichen — die Nur-Anker-Form [[#Heading]] wird nicht erfasst):
//   - Wiki-Link        [[Ziel]] / [[Ziel|Label]] / [[Ziel#Heading]]
//   - Wiki-Embed       ![[Ziel]] (Bild, PDF, Markdown, Other) plus Label/Anchor-Form
//   - Markdown-Link    [Text](pfad.md), nur intern (kein http/https/mailto/tel/ftp)
//
// Bereinigung: Fenced-Code-Bloecke (``` und ~~~) werden uebersprungen, ebenso
// Inline-Code (`...`-Bereiche pro Zeile maskiert), damit ein `[[foo]]` im
// Code-Beispiel keinen Eintrag erzeugt. Markdown-Image-Syntax (`![alt](...)`)
// wird ausgenommen, weil sie Asset-Einbettung ist und nicht in den Vernetzungs-
// Blick gehoert; Wiki-Bild-Embeds werden hingegen mitgelistet.
export function extractOutgoingLinks(text) {
  const links = [];
  if (!text) return links;
  const lines = text.split(/\r?\n/);
  // R3-14 (4T-0183): oeffnenden Fence-Marker merken und nur mit dem
  // passenden Typ schliessen — vorher toggelte jeder ```- ODER ~~~-
  // Zeilenstart den Zustand, sodass z.B. eine ```-Zeile innerhalb eines
  // ~~~-Fences den Block faelschlich beendete.
  let inFence = false;
  let fenceChar = '';
  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    // Fenced-Code-Wechsel erkennen (am Anfang der Zeile, optional eingerueckt).
    const fenceMatch = original.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      continue;
    }
    if (inFence) continue;
    // Inline-Code pro Zeile maskieren, damit `[[foo]]` in `...` nicht matcht.
    const line = original.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));

    // Wiki-Link / Wiki-Embed
    //   group 1: optionales '!' fuer Embed
    //   group 2: Ziel-Datei (vor # und vor |)
    //   group 3: optionaler Anker (Heading oder ^block-id)
    //   group 4: optionales Label/Width (nach |)
    const wikiRe = /(!)?\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g;
    let m;
    while ((m = wikiRe.exec(line)) !== null) {
      const isEmbed = m[1] === '!';
      const target = m[2].trim();
      const anchor = m[3] ? m[3].trim() : '';
      links.push({
        type: isEmbed ? 'embed' : 'wikiLink',
        target,
        anchor,
        line: i + 1,
        snippet: snippetAroundIndex(original, m.index),
      });
    }

    // Markdown-Link. Image-Syntax `![alt](url)` ausnehmen: wenn das Zeichen
    // direkt vor '[' ein '!' ist, ueberspringen wir den Treffer.
    const mdRe = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
    while ((m = mdRe.exec(line)) !== null) {
      if (m.index > 0 && line[m.index - 1] === '!') continue;
      const label = m[1].trim();
      const url = m[2].trim();
      // Externe URLs und Schema-Pseudo-URLs ausnehmen.
      if (/^(?:https?:|mailto:|tel:|ftp:|file:|#)/i.test(url)) continue;
      // In-Page-Anker `[Text](#anker)` werden oben durch `^#` schon ausgesperrt.
      // Anker aus dem Pfad extrahieren.
      let pureUrl = url;
      let anchor = '';
      const hashIdx = url.indexOf('#');
      if (hashIdx >= 0) {
        pureUrl = url.substring(0, hashIdx);
        anchor = url.substring(hashIdx + 1);
      }
      if (!pureUrl) continue;
      links.push({
        type: 'markdownLink',
        target: pureUrl,
        anchor,
        label,
        line: i + 1,
        snippet: snippetAroundIndex(original, m.index),
      });
    }
  }
  return links;
}

export function snippetAroundIndex(line, idx) {
  // R3-12 (4T-0183): Fenster um den Treffer-Index zentrieren. Vorher
  // zeigten lange Zeilen unabhaengig von der Treffer-Position die ersten
  // 80 Zeichen — der Link selbst war dann nicht im Snippet sichtbar.
  const raw = String(line || '');
  const trimmed = raw.trim();
  if (trimmed.length <= 80) return trimmed;
  const center = Math.max(0, Math.min(raw.length, idx | 0));
  let start = Math.max(0, center - 30);
  const end = Math.min(raw.length, start + 80);
  if (end - start < 80) start = Math.max(0, end - 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < raw.length ? '…' : '';
  return prefix + raw.substring(start, end).trim() + suffix;
}

export function scheduleOutgoingRender(paneIdx) {
  if (!state.outgoing) return;
  const timers = state.outgoing.updateTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    renderOutgoingLinks(paneIdx);
  }, 150);
}

export function renderOutgoingLinks(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.outgoingResults || !els.outgoingStatus) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  els.outgoingResults.innerHTML = '';
  els.outgoingStatus.hidden = true;
  els.outgoingStatus.textContent = '';
  if (!tab) {
    els.outgoingStatus.hidden = false;
    els.outgoingStatus.textContent = t('outgoing.empty');
    return;
  }
  const links = extractOutgoingLinks(tab.content || '');
  if (links.length === 0) {
    els.outgoingStatus.hidden = false;
    els.outgoingStatus.textContent = t('outgoing.empty');
    return;
  }
  for (const link of links) {
    const entry = document.createElement('div');
    entry.className = 'outgoing-entry';

    const meta = document.createElement('span');
    meta.className = 'outgoing-meta';
    meta.textContent = t('outgoing.line').replace('{line}', String(link.line));
    entry.appendChild(meta);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'outgoing-type-badge outgoing-type-' + link.type;
    const typeKey =
      link.type === 'embed'
        ? 'outgoing.type.embed'
        : link.type === 'markdownLink'
          ? 'outgoing.type.markdownLink'
          : 'outgoing.type.wikiLink';
    const typeShort = link.type === 'embed' ? 'E' : link.type === 'markdownLink' ? 'M' : 'W';
    typeBadge.textContent = typeShort;
    typeBadge.title = t(typeKey);
    entry.appendChild(typeBadge);

    const targetEl = document.createElement('span');
    targetEl.className = 'outgoing-target';
    targetEl.textContent = link.target + (link.anchor ? '#' + link.anchor : '');
    entry.appendChild(targetEl);

    if (link.snippet) {
      const snip = document.createElement('div');
      snip.className = 'outgoing-snippet';
      snip.textContent = link.snippet;
      entry.appendChild(snip);
    }

    entry.title = link.snippet || '';
    entry.addEventListener('click', () => {
      openOutgoingTarget(paneIdx, link, tab.path);
    });
    els.outgoingResults.appendChild(entry);
  }
}

export async function openOutgoingTarget(paneIdx, link, sourcePath) {
  if (!link || !sourcePath) return;
  try {
    // resolveLink resolvt nur den Dateipfad gegen das Quelldatei-Verzeichnis;
    // die `.md`-Ergaenzung fuer Wiki-Links/Embeds ohne Extension liegt sonst
    // im wikiLinksPlugin (src/shared/markdown/plugins.js). Hier muessen wir die gleiche Logik
    // anwenden, sonst zeigt resolveLink auf `<dir>/ziel` und fileExists
    // schlaegt fehl. Markdown-Links tragen die Extension bereits im Quelltext.
    let resolveTarget = link.target;
    if (link.type === 'wikiLink' || link.type === 'embed') {
      // 4T-0337 (Epic 3E-0061): relative Unterseiten-Ziele ('/Name', '..')
      // gegen die Quell-Datei expandieren (U+2215-Form).
      if (isRelativeTarget(resolveTarget)) {
        const ownBase = api.basename(sourcePath).replace(/\.(md|markdown|mdown|mkd)$/i, '');
        const expanded = expandRelativeTarget(ownBase, resolveTarget);
        if (!expanded) {
          showStatusbarHint('outgoing.notOpenable', { duration: 2500, error: true });
          return;
        }
        resolveTarget = expanded;
      }
      const hasExtension = /\.[a-z0-9]{1,8}$/i.test(resolveTarget);
      if (!hasExtension) resolveTarget += '.md';
    }
    const resolved = await api.resolveLink(sourcePath, resolveTarget);
    if (!resolved) return;
    const exists = await api.fileExists(resolved);
    if (!exists) {
      // Alias-Fallback nur fuer Wiki-Links und Embeds (Markdown-Links sind
      // explizite Pfade, dort gibt es keine Aliases).
      if (link.type === 'wikiLink' || link.type === 'embed') {
        // 4T-0337: deterministischer Same-Dir-Versuch ('/' -> U+2215) vor
        // dem Index-Fallback, wie im Wiki-Link-Klick-Pfad.
        if (/[/\\]/.test(resolveTarget)) {
          const translated = toFileBasename(resolveTarget.replace(/\\/g, '/'));
          const cand = await api.resolveLink(sourcePath, translated);
          if (cand && (await api.fileExists(cand))) {
            const realPane = await openInPane(paneIdx, [cand]);
            if (link.anchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(link.anchor));
            return;
          }
        }
        // 4T-0337: Index-Fallback wie im Wiki-Link-Klick-Pfad (B-13 plus
        // Unterseiten-Form), damit Panel-Klicks dieselben Ziele erreichen.
        const logical = resolveTarget
          .replace(/\.(md|markdown|mdown|mkd)$/i, '')
          .replace(/\\/g, '/')
          .replace(/^(\.\.?\/)+/, '');
        try {
          const idx = await api.resolveWikiTargetInIndex(sourcePath, logical);
          if (idx && idx.status === 'ready' && idx.candidates.length > 0) {
            const target =
              idx.candidates.length === 1
                ? idx.candidates[0]
                : await showAliasDialog(logical, idx.candidates);
            if (target) {
              const realPane = await openInPane(paneIdx, [target]);
              if (link.anchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(link.anchor));
            }
            return;
          }
        } catch {
          /* Index nicht verfuegbar — weiter zum Alias-Fallback */
        }
        const aliasTarget = await tryResolveByAlias(sourcePath, resolved);
        if (aliasTarget) {
          // R3-06/R4-09 (4T-0186): Anker normalisieren (Slug bzw. ^-Strip)
          // und der tatsaechlichen Ziel-Pane folgen.
          const realPane = await openInPane(paneIdx, [aliasTarget]);
          if (link.anchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(link.anchor));
          return;
        }
      }
      // W-16 (4T-0309): kein stiller No-op — Ziel existiert nicht (und kein
      // Alias-Treffer). Rueckmeldung wie bei Backlinks/Bookmarks.
      showStatusbarHint('outgoing.notOpenable', { duration: 2500, error: true });
      return;
    }
    const isMd = await api.isMarkdownPath(resolved);
    if (!isMd) {
      // W-16 (4T-0309): Nicht-Markdown-Ziel — Klick blieb sonst reaktionslos.
      showStatusbarHint('outgoing.notOpenable', { duration: 2500, error: true });
      return;
    }
    const realPane = await openInPane(paneIdx, [resolved]);
    if (link.anchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(link.anchor));
  } catch (err) {
    console.warn('[4T-0073] Outgoing-Link konnte nicht geoeffnet werden', err);
  }
}

export function applyOutgoingVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.outgoingSection) return;
  // 4T-0075: Outgoing-Links im Empty-State zwangsweise unsichtbar.
  // 4T-0294: bei deaktivierter Wiki-Link-Erweiterung ebenso.
  const visible =
    !isAllEmpty() && isExtensionActive('wiki-links') && !!state.outgoing.visibleByPane[paneIdx];
  els.outgoingSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    renderOutgoingLinks(paneIdx);
  }
  updateOutgoingToggleButton();
}

export function updateOutgoingToggleButton() {
  const btn = document.getElementById('btn-outgoing-links');
  if (!btn) return;
  const visible = !!state.outgoing.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleOutgoingPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.outgoing.visibleByPane[paneIdx];
  state.outgoing.visibleByPane[paneIdx] = next;
  // 4T-0288: Einblenden aktiviert den Reiter in einer Gruppe.
  if (next) await ensurePanelTabActive('outgoing');
  applyOutgoingVisibility(paneIdx);
  await persistOutgoingSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistOutgoingSettings() {
  await persistSetting('outgoing.visibleColumn0', !!state.outgoing.visibleByPane[0]);
  await persistSetting('outgoing.visibleColumn1', !!state.outgoing.visibleByPane[1]);
}

export async function loadOutgoingSettings() {
  const v0 = await api.getSetting('outgoing.visibleColumn0');
  const v1 = await api.getSetting('outgoing.visibleColumn1');
  state.outgoing.visibleByPane[0] = !!v0;
  state.outgoing.visibleByPane[1] = !!v1;
}

// --- Unterseiten-Sektion (4T-0341, Epic 3E-0061) ------------------------------
// Listet die direkten Unterseiten der aktiven Datei (Basename-Praefix mit
// U+2215, Quelle ist der Nachfahren-Scan des Main — deterministisch ohne
// Index-Aufwaermung). Klick oeffnet die Datei in der Pane. Aktualisierung
// bei Tab-Wechsel (syncEditorForPane), nach Anlage/Umbenennen und ueber
// den backlinks:invalidated-Broadcast (externe Datei-Aenderungen).

export const SUBPAGES_RENDER_DEBOUNCE_MS = 150;

export function scheduleSubpagesRender(paneIdx) {
  if (!state.subpages) return;
  const timers = state.subpages.updateTimers;
  if (timers[paneIdx]) clearTimeout(timers[paneIdx]);
  timers[paneIdx] = setTimeout(() => {
    timers[paneIdx] = null;
    renderSubpages(paneIdx);
  }, SUBPAGES_RENDER_DEBOUNCE_MS);
}

export async function renderSubpages(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.subpagesList || !els.subpagesStatus) return;
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const token = ++state.subpages.renderTokens[paneIdx];
  const showEmpty = (key) => {
    els.subpagesList.innerHTML = '';
    els.subpagesStatus.hidden = false;
    els.subpagesStatus.textContent = t(key);
  };
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) {
    showEmpty('subpages.empty');
    return;
  }
  let scan;
  try {
    scan = await api.subpageDescendants(tab.path);
  } catch {
    scan = null;
  }
  // Async-Race: Tab koennte inzwischen gewechselt haben.
  if (token !== state.subpages.renderTokens[paneIdx]) return;
  if (!scan || !scan.ok || !Array.isArray(scan.files)) {
    showEmpty('subpages.empty');
    return;
  }
  // Nur DIREKTE Unterseiten (genau ein Segment tiefer als die aktive Datei).
  const ownDepth = segmentsOf(
    api.basename(tab.path).replace(/\.(md|markdown|mdown|mkd)$/i, ''),
  ).length;
  const children = scan.files
    .map((f) => ({
      path: f,
      base: api.basename(f).replace(/\.(md|markdown|mdown|mkd)$/i, ''),
    }))
    .filter((c) => segmentsOf(c.base).length === ownDepth + 1)
    .sort((a, b) => lastSegment(a.base).localeCompare(lastSegment(b.base)));
  if (children.length === 0) {
    showEmpty('subpages.empty');
    return;
  }
  els.subpagesStatus.hidden = true;
  els.subpagesStatus.textContent = '';
  els.subpagesList.innerHTML = '';
  for (const child of children) {
    const row = document.createElement('div');
    row.className = 'subpages-entry';
    row.textContent = lastSegment(child.base);
    row.title = child.path;
    row.addEventListener('click', () => {
      openInPane(paneIdx, [child.path]);
    });
    els.subpagesList.appendChild(row);
  }
}

export function applySubpagesVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.subpagesSection) return;
  // Muster Outgoing: im Empty-State und bei deaktivierter Wiki-Link-
  // Erweiterung unsichtbar (Unterseiten sind Vernetzungs-Funktionalitaet).
  const visible =
    !isAllEmpty() && isExtensionActive('wiki-links') && !!state.subpages.visibleByPane[paneIdx];
  els.subpagesSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) {
    renderSubpages(paneIdx);
  }
  updateSubpagesToggleButton();
}

// 4T-0567 (Epic 3E-0104): Active-State des neuen Statusbar-Buttons
// (Muster updateOutgoingToggleButton).
export function updateSubpagesToggleButton() {
  const btn = document.getElementById('btn-subpages');
  if (!btn) return;
  const visible = !!state.subpages.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleSubpagesPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.subpages.visibleByPane[paneIdx];
  state.subpages.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('subpages');
  applySubpagesVisibility(paneIdx);
  await persistSubpagesSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

export async function persistSubpagesSettings() {
  await persistSetting('subpages.visibleColumn0', !!state.subpages.visibleByPane[0]);
  await persistSetting('subpages.visibleColumn1', !!state.subpages.visibleByPane[1]);
}

export async function loadSubpagesSettings() {
  const v0 = await api.getSetting('subpages.visibleColumn0');
  const v1 = await api.getSetting('subpages.visibleColumn1');
  state.subpages.visibleByPane[0] = !!v0;
  state.subpages.visibleByPane[1] = !!v1;
}

// === 4T-0287 (Epic 3E-0051): Panel-Registrierung =============================
// Die drei hier beheimateten Panels registrieren sich in der Panel-Registry
// (sidebar-layout.js). getVisible spiegelt die effektive Sichtbarkeits-Logik
// aus applySidebarVisibility inklusive Empty-State-Override (4T-0075).

registerSidebarPanel({
  id: 'outline',
  titleKey: 'outline.title',
  buttonId: 'btn-outline',
  sectionClass: 'sidebar-outline',
  getVisible: (paneIdx) => !isAllEmpty() && !!state.outline.visibleByPane[paneIdx],
  applyVisibility: applyOutlineVisibility,
  toggle: toggleOutlinePanel,
});

registerSidebarPanel({
  id: 'outgoing',
  titleKey: 'outgoing.title',
  buttonId: 'btn-outgoing-links',
  sectionClass: 'sidebar-outgoing',
  getVisible: (paneIdx) =>
    !isAllEmpty() &&
    isExtensionActive('wiki-links') &&
    !!(state.outgoing && state.outgoing.visibleByPane[paneIdx]),
  applyVisibility: applyOutgoingVisibility,
  toggle: toggleOutgoingPanel,
});

// 4T-0341 (Epic 3E-0061): Unterseiten-Sektion. Statusbar-Button seit
// 4T-0567 (Epic 3E-0104, Zugangs-Symmetrie).
registerSidebarPanel({
  id: 'subpages',
  titleKey: 'subpages.title',
  buttonId: 'btn-subpages',
  sectionClass: 'sidebar-subpages',
  getVisible: (paneIdx) =>
    !isAllEmpty() &&
    isExtensionActive('wiki-links') &&
    !!(state.subpages && state.subpages.visibleByPane[paneIdx]),
  applyVisibility: applySubpagesVisibility,
  toggle: toggleSubpagesPanel,
});

registerSidebarPanel({
  id: 'backlinks',
  titleKey: 'backlinks.title',
  buttonId: 'btn-backlinks',
  sectionClass: 'sidebar-backlinks',
  getVisible: (paneIdx) =>
    !isAllEmpty() && isExtensionActive('wiki-links') && !!state.backlinks.visibleByPane[paneIdx],
  applyVisibility: applyBacklinksVisibility,
  toggle: toggleBacklinksPanel,
});
