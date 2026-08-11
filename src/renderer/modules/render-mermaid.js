// Render-Pane-Nachverarbeitung (Copy-Buttons, Mermaid-Lazy-Load, Wiki-Embeds, Tabellen-Sortierung) und Word-Count.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { refreshSearchIfVisible } from './search.js';

import { applyTranslations, t } from '../i18n.js';

import { enqueueMermaidRun } from './live-widgets.js';
import { api } from './api.js';
// 4T-0293 (Epic 3E-0052): Mermaid ist eine schaltbare Render-Erweiterung —
// deaktiviert bleibt der ```mermaid-Block ein regulaerer Code-Block.
import { isExtensionActive } from './extension-lifecycle.js';
import { activeTab, state } from './app-state.js';
// 4T-0324 (Epic 3E-0058): Aussen-Link-Warnung der Bereichs-Apps als Teil
// der Render-Nachverarbeitung.
import { markOutsideAreaLinks } from './area.js';
import { paneEditors } from './editor.js';
// 4T-0790 (Epic 3E-0125): Anlagen-Embeds oeffnen ueber denselben Kanal wie
// verlinkte Anlagen und Bilder.
import { oeffneAnlage } from './views.js';
import { openInPane } from './tabs.js';
// 4T-0355 (Epic 3E-0065): Befüllung der perspective-query-Platzhalter mit der
// dynamischen Datei-Liste (Render-Pane und Reading über diese Pipeline).
import { applyFrontmatterQueriesIfPresent } from './frontmatter-query-view.js';
// 4T-0435 (Epic 3E-0081): Journal-Navigations-Block (perspective-journal-nav)
// mit Kontext aus dem Datei-Pfad befüllen, analog zur Abfrage-Befüllung.
import { applyJournalNavIfPresent } from './journal-nav-view.js';
// 4T-0412 (Epic 3E-0078): Skript-Blöcke (perspective-script) — Sandbox-
// Ausführung bzw. Quelltext-Rückfall, analog zur Abfrage-Befüllung.
import { applyPerspectiveScriptsIfPresent } from './perspective-script-view.js';
// 4T-0365 (Epic 3E-0067): Block-Metadaten-Indikator als Render-Nachverarbeitung.
import { applyBlockMetaIndicators } from './block-meta-indicator.js';
// 4T-0418 (Epic 3E-0079): Lokalisierung der Perspective-Datatable-Texte
// mit Platzhaltern (Struktur-Fehler, Zeilen-Limit).
import { applyPerspectiveDatatablesIfPresent } from './perspective-datatable-view.js';
// 4T-0512 (Epic 3E-0092): Ereignis-Fence — Lokalisierung/Differenz-Spalte
// und Editor-Bindung (delegierte Listener, idempotent pro Container).
import { applyPerspectiveEventsIfPresent } from './events-view.js';
import { bindPerspectiveEventsEditor, applyPerspectiveEventsViewStates } from './events-editor.js';
// 4T-0419 (Epic 3E-0079): Grid-Editor der Datatable (delegierte Listener,
// idempotent pro Container). 4T-0420: plus Wiederanwendung des Ansichts-
// Zustands (Sortierung/Filter) nach jedem Voll-Render.
import {
  bindPerspectiveDatatableEditor,
  applyPerspectiveDatatableViewStates,
} from './perspective-datatable-editor.js';

// --- Mermaid (4T-0021) ------------------------------------------------------
// Mermaid wird per dynamischem import() lazy geladen (siehe scripts/
// build-mermaid.js fuer den separaten Bundle), sodass Dokumente ohne
// Mermaid-Bloecke den ~3MB-Bundle gar nicht erst holen. Das Post-Render-Hook
// applyMermaidIfPresent ersetzt jedes <pre><code class="language-mermaid">…
// </code></pre> durch ein <div class="mermaid-block"> mit dem gerenderten SVG.
// Bei Theme-Wechsel rendert rerenderAllMermaidBlocks alle Diagramme neu.
export let mermaidPromise = null;
export function loadMermaid() {
  if (mermaidPromise) return mermaidPromise;
  const url = new URL('./mermaid.bundle.js', import.meta.url).href;
  // R1-04 (4T-0174): bei Import-Fehler den Cache zuruecksetzen, sonst
  // bleibt das rejected Promise fuer die Session haengen und Mermaid ist
  // dauerhaft tot, obwohl ein erneuter Versuch klappen koennte.
  mermaidPromise = import(url).then(
    (mod) => mod.default || mod,
    (err) => {
      mermaidPromise = null;
      throw err;
    },
  );
  return mermaidPromise;
}

export let mermaidConfiguredTheme = null;
// 4T-0179: Setter fuer Modul-Grenzen (ESM-Imports sind read-only; der
// Theme-Wechsel-Handler im Init-Modul setzt hierueber zurueck).
export function resetMermaidConfiguredTheme() {
  mermaidConfiguredTheme = null;
}
export function currentMermaidTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
}
export function ensureMermaidConfigured(mermaid, theme) {
  if (mermaidConfiguredTheme === theme) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
  mermaidConfiguredTheme = theme;
}

// Modul-Level-Cache (svgString je Quelltext+Theme). Verhindert wiederholten
// Mermaid-Parse beim Live-Tippen im Edit-Modus.
// R1-09/R2-05 (4T-0180): Insertion-Order-Eviction (Muster vom
// liveBlockRenderCache) deckelt das Wachstum; die Quelltext-Laenge im
// Schluessel dient als Kollisions-Gegenpruefung zum 32-bit-Hash.
export const MERMAID_CACHE_MAX_SIZE = 100;
export const mermaidRenderCache = new Map();

export function mermaidCacheKey(theme, source) {
  return `${theme}:${source.length}:${mermaidHash(source)}`;
}

export function mermaidCacheSet(key, svgHtml) {
  if (mermaidRenderCache.size >= MERMAID_CACHE_MAX_SIZE) {
    const oldest = mermaidRenderCache.keys().next().value;
    if (oldest !== undefined) mermaidRenderCache.delete(oldest);
  }
  mermaidRenderCache.set(key, svgHtml);
}
export function mermaidHash(str) {
  // FNV-1a 32-bit, kompakt und kollisionsarm fuer normale Diagramm-Groessen.
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
// 4T-0046 (Epic 3E-0009): Sortierbare Perspective-Tabellen. Nach jedem renderMarkdown
// werden alle <table class="perspective-table sortable"> im Render-DOM mit Klick-
// Handlern auf den Header-Zellen versehen. Drei Zustaende zyklisch:
// neutral -> aufsteigend -> absteigend -> neutral (reset). Bei reset wird die
// urspruengliche Reihenfolge wiederhergestellt. Sort-Heuristik: numerisch
// wenn moeglich, sonst lexikographisch mit Locale (localeCompare, numeric
// option). Bei mehrzeiligen Zellen wird nach der ersten Zeile sortiert.
export const PERSPECTIVE_SORT_ICON_SVG = {
  neutral:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 15 12 20 17 15"/><polyline points="7 9 12 4 17 9"/></svg>',
  asc: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>',
  desc: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
};

export function enhancePerspectiveTableSorting(container) {
  if (!container) return;
  const tables = container.querySelectorAll('table.perspective-table.sortable');
  for (const table of tables) {
    setupPerspectiveTableSort(table);
  }
}

export function setupPerspectiveTableSort(table) {
  if (table.dataset.perspectiveSortReady === '1') return;
  const thead = table.querySelector(':scope > thead');
  if (!thead) return;
  const headerRow = thead.querySelector(':scope > tr');
  if (!headerRow) return;
  const headers = Array.from(headerRow.querySelectorAll(':scope > th'));
  const tbody = table.querySelector(':scope > tbody');
  if (!tbody || headers.length === 0) return;

  // Original-Reihenfolge sichern fuer Reset.
  const originalRows = Array.from(tbody.querySelectorAll(':scope > tr'));

  headers.forEach((th, colIdx) => {
    // Bestehenden Inhalt in einen Wrapper packen, damit das Icon getrennt
    // rechts daneben sitzt.
    const wrapper = document.createElement('span');
    wrapper.className = 'perspective-th-content';
    while (th.firstChild) wrapper.appendChild(th.firstChild);
    th.appendChild(wrapper);

    const icon = document.createElement('span');
    icon.className = 'perspective-sort-icon';
    icon.innerHTML = PERSPECTIVE_SORT_ICON_SVG.neutral;
    th.appendChild(icon);

    th.classList.add('perspective-th-sortable');
    th.dataset.perspectiveSortState = 'none';

    th.addEventListener('click', () => {
      const currentState = th.dataset.perspectiveSortState || 'none';
      const nextState = currentState === 'none' ? 'asc' : currentState === 'asc' ? 'desc' : 'none';

      // Alle anderen Header zuruecksetzen.
      headers.forEach((other) => {
        if (other !== th) {
          other.dataset.perspectiveSortState = 'none';
          const otherIcon = other.querySelector(':scope > .perspective-sort-icon');
          if (otherIcon) otherIcon.innerHTML = PERSPECTIVE_SORT_ICON_SVG.neutral;
        }
      });

      th.dataset.perspectiveSortState = nextState;
      // Dataset 'none' mappt auf das neutral-Icon (Konsistenz: CSS-Selektor
      // bleibt data-perspective-sort-state="none", Icon-Key ist 'neutral').
      icon.innerHTML = PERSPECTIVE_SORT_ICON_SVG[nextState === 'none' ? 'neutral' : nextState];

      if (nextState === 'none') {
        // Reset.
        originalRows.forEach((row) => tbody.appendChild(row));
      } else {
        const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
        rows.sort((a, b) => compareScgSortCells(a.cells[colIdx], b.cells[colIdx]));
        if (nextState === 'desc') rows.reverse();
        rows.forEach((row) => tbody.appendChild(row));
      }
    });
  });

  table.dataset.perspectiveSortReady = '1';
}

export function compareScgSortCells(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const aText = (a.textContent || '').split('\n')[0].trim();
  const bText = (b.textContent || '').split('\n')[0].trim();
  if (aText === bText) return 0;
  const aNum = Number(aText);
  const bNum = Number(bText);
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aText !== '' && bText !== '') {
    return aNum - bNum;
  }
  return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
}

// 4T-0072: Word Count in Statusbar.
// Berechnet Woerter, Zeichen und Lesezeit fuer die aktive Datei bzw. fuer die
// aktive Editor-Selektion. Bereinigung: Frontmatter, Fenced-Code-Bloecke
// (auch ~~~), Inline-Code, Display-Math `$$...$$` und KaTeX-Inline `$...$`
// werden entfernt, weil Formel- und Code-Quelltext keine Lese-Woerter sind.
// Lesezeit: 200 Woerter pro Minute, mindestens 1 Minute solange Text vorhanden.
export function cleanForWordCount(text) {
  if (!text) return '';
  let cleaned = text;
  // 1. YAML-Frontmatter abschneiden (--- am Datei-Anfang bis --- oder ...).
  cleaned = cleaned.replace(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*\r?\n?/, '');
  // 2. Fenced-Code-Bloecke entfernen (schliesst Mermaid- und Highlight-Bloecke automatisch mit ein).
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/~~~[\s\S]*?~~~/g, '');
  // 3. Display-Math `$$...$$`.
  cleaned = cleaned.replace(/\$\$[\s\S]*?\$\$/g, '');
  // 4. Inline-Code `...`.
  cleaned = cleaned.replace(/`[^`\n]+`/g, '');
  // 5. KaTeX-Inline `$...$` (eine Zeile, nicht greedy, kein Escape-Handling).
  cleaned = cleaned.replace(/\$[^$\n]+?\$/g, '');
  return cleaned;
}

export function computeWordCountStats(text) {
  const cleaned = cleanForWordCount(text);
  const trimmed = cleaned.trim();
  const wordMatches = trimmed.length > 0 ? trimmed.match(/\S+/g) : null;
  const words = wordMatches ? wordMatches.length : 0;
  const charsWithSpaces = Array.from(cleaned).length;
  const charsWithoutSpaces = Array.from(cleaned.replace(/\s+/g, '')).length;
  const readingMinutes = words > 0 ? Math.max(1, Math.ceil(words / 200)) : 0;
  const paragraphs =
    trimmed.length > 0
      ? trimmed.split(/\r?\n\s*\r?\n/).filter((p) => p.trim().length > 0).length
      : 0;
  const sentenceMatches = trimmed.length > 0 ? trimmed.match(/[^.!?]+[.!?]+/g) : null;
  const sentences = sentenceMatches ? sentenceMatches.length : words > 0 ? 1 : 0;
  const headings = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0, total: 0 };
  const headingRegex = /^(#{1,6})\s/gm;
  let m;
  while ((m = headingRegex.exec(cleaned)) !== null) {
    const level = m[1].length;
    headings['h' + level]++;
    headings.total++;
  }
  return {
    words,
    charsWithSpaces,
    charsWithoutSpaces,
    readingMinutes,
    paragraphs,
    sentences,
    headings,
  };
}

export function formatWordCountNumber(n) {
  const lang = state && state.language ? state.language : 'de';
  try {
    return new Intl.NumberFormat(lang).format(n);
  } catch (_) {
    return String(n);
  }
}

export let wordCountTimer = null;
export const wordCountState = { fileStats: null, selectionStats: null };
// R2-10 (4T-0180): merkt sich, fuer welchen tab.content-String die
// fileStats berechnet wurden. Bei reiner Cursor-/Selektionsbewegung ist
// die Referenz identisch (O(1)-Vergleich) und nur die Selektions-Stats
// werden neu berechnet; beim Tippen ersetzt der UpdateListener
// tab.content durch eine neue String-Instanz.
let wordCountStatsForContent = null;

export function scheduleWordCountUpdate() {
  if (wordCountTimer) clearTimeout(wordCountTimer);
  wordCountTimer = setTimeout(() => {
    wordCountTimer = null;
    updateWordCountStatusbar();
  }, 150);
}

export function updateWordCountStatusbar() {
  const el = document.getElementById('statusbar-wordcount');
  if (!el) return;
  const tab = activeTab();
  // 4T-0277: System-Seiten (Einstellungen) haben keinen Dokument-Inhalt —
  // ein "0 Woerter"-Zaehler waere irrefuehrend, Anzeige ausblenden.
  // 4T-0294: deaktivierte Wort-Statistik-Erweiterung blendet ebenso aus
  // (der Guard sitzt hier, weil jeder Update-Pfad el.hidden neu setzt).
  if (!tab || tab.systemPage || !isExtensionActive('word-count')) {
    el.hidden = true;
    wordCountState.fileStats = null;
    wordCountState.selectionStats = null;
    return;
  }
  el.hidden = false;

  // Selektions-Erkennung: nur wenn der Editor der aktiven Pane existiert
  // und from !== to. Bei reinem Rendered-Mode kann es Selektion im Editor
  // geben (Editor existiert weiter), die wir trotzdem zeigen.
  const pIdx = state.activePaneIndex;
  const view = paneEditors[pIdx];
  let selectionStats = null;
  if (view) {
    const sel = view.state.selection.main;
    if (sel.from !== sel.to) {
      const selText = view.state.doc.sliceString(sel.from, sel.to);
      selectionStats = computeWordCountStats(selText);
    }
  }
  // R2-10 (4T-0180): Vollberechnung nur bei geaendertem Datei-Inhalt.
  const content = tab.content || '';
  let fileStats = wordCountState.fileStats;
  if (!fileStats || wordCountStatsForContent !== content) {
    fileStats = computeWordCountStats(content);
    wordCountStatsForContent = content;
  }
  wordCountState.fileStats = fileStats;
  wordCountState.selectionStats = selectionStats;

  const labelEl = el.querySelector('.statusbar-wordcount-label');
  if (!labelEl) return;
  if (selectionStats) {
    labelEl.textContent = t('statusbar.wordCount.selection')
      .replace('{words}', formatWordCountNumber(selectionStats.words))
      .replace('{chars}', formatWordCountNumber(selectionStats.charsWithSpaces));
  } else {
    labelEl.textContent = t('statusbar.wordCount.short')
      .replace('{words}', formatWordCountNumber(fileStats.words))
      .replace('{chars}', formatWordCountNumber(fileStats.charsWithSpaces))
      .replace('{minutes}', String(fileStats.readingMinutes))
      .replace('{minutesUnit}', t('statusbar.wordCount.minutesShort'));
  }
}

export function openWordCountDialog() {
  const tab = activeTab();
  if (!tab) return;
  // Aktuelle Werte neu berechnen, damit der Dialog nichts veraltetes zeigt.
  updateWordCountStatusbar();
  const stats = wordCountState.selectionStats || wordCountState.fileStats;
  if (!stats) return;
  const tbody = document.getElementById('wordcount-table-body');
  if (!tbody) return;
  const minUnit = t('statusbar.wordCount.minutesShort');
  const rows = [
    ['wordCount.dialog.words', formatWordCountNumber(stats.words)],
    ['wordCount.dialog.charsWithSpaces', formatWordCountNumber(stats.charsWithSpaces)],
    ['wordCount.dialog.charsWithoutSpaces', formatWordCountNumber(stats.charsWithoutSpaces)],
    [
      'wordCount.dialog.readingTime',
      stats.readingMinutes > 0 ? `${stats.readingMinutes} ${minUnit}` : '—',
    ],
    ['wordCount.dialog.paragraphs', formatWordCountNumber(stats.paragraphs)],
    ['wordCount.dialog.sentences', formatWordCountNumber(stats.sentences)],
    ['wordCount.dialog.headings', formatWordCountNumber(stats.headings.total)],
    [
      'wordCount.dialog.headingsByLevel',
      t('wordCount.dialog.headingsByLevelValue')
        .replace('{h1}', String(stats.headings.h1))
        .replace('{h2}', String(stats.headings.h2))
        .replace('{h3}', String(stats.headings.h3))
        .replace('{h4}', String(stats.headings.h4))
        .replace('{h5}', String(stats.headings.h5))
        .replace('{h6}', String(stats.headings.h6)),
    ],
  ];
  tbody.innerHTML = '';
  for (const [labelKey, value] of rows) {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.className = 'wordcount-label';
    tdLabel.setAttribute('data-i18n', labelKey);
    tdLabel.textContent = t(labelKey);
    const tdValue = document.createElement('td');
    tdValue.className = 'wordcount-value';
    tdValue.textContent = value;
    tr.appendChild(tdLabel);
    tr.appendChild(tdValue);
    tbody.appendChild(tr);
  }
  const modal = document.getElementById('wordcount-modal');
  if (modal) {
    modal.hidden = false;
    const btn = document.getElementById('btn-wordcount-close');
    if (btn) btn.focus();
  }
}

export function closeWordCountDialog() {
  const modal = document.getElementById('wordcount-modal');
  if (modal) modal.hidden = true;
}

// 4T-0071: Code-Block Copy-Button. Wickelt jeden <pre>-Block im Render-Pane
// in einen <div class="code-block-wrapper"> und setzt einen Button rechts oben,
// der den Code-Inhalt in die Zwischenablage kopiert. Mermaid-Bloecke werden
// uebersprungen, weil applyMermaidIfPresent das <pre> spaeter zu einem SVG
// umwandelt. Wirkt fuer Fenced-Code-Bloecke ohne Sprache, mit Sprach-Tag
// (highlight.js), fuer perspective-table-Quelltexte und fuer Code-Bloecke innerhalb
// von Wiki-Embeds (rekursiv, weil der Hook an allen Render-Stellen laeuft).
// Button-Labels werden ueber data-i18n-Spans aufgeloest, was den Sprachwechsel
// zur Laufzeit automatisch mitnimmt (applyTranslations laeuft danach).
export const CODE_COPY_ICON_CLIPBOARD =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
export const CODE_COPY_ICON_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

export function applyCodeCopyButtons(container) {
  if (!container) return;
  // 4T-0294: Code-Copy-Button ist eine schaltbare Werkzeug-Erweiterung.
  if (!isExtensionActive('code-copy')) return;
  const preEls = container.querySelectorAll('pre');
  for (const pre of preEls) {
    // Idempotenz: schon gewrapt.
    if (pre.parentElement && pre.parentElement.classList.contains('code-block-wrapper')) continue;
    // 4T-0282: das Klartext-YAML der Frontmatter-Zeile ist reine Anzeige
    // mit eigener Aufklapp-Mechanik — kein Copy-Button-Wrapper.
    if (pre.classList.contains('frontmatter-yaml')) continue;
    // Mermaid uebernimmt der Mermaid-Renderer und ersetzt das <pre> durch
    // ein SVG. 4T-0293: nur bei aktiver Mermaid-Erweiterung — deaktiviert
    // bleibt der Block ein Code-Block und bekommt regulaer den Copy-Button.
    const codeEl = pre.querySelector(':scope > code');
    if (codeEl && codeEl.classList.contains('language-mermaid') && isExtensionActive('mermaid')) {
      continue;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy-button';
    button.innerHTML =
      `<span class="code-copy-icon code-copy-icon-default" aria-hidden="true">${CODE_COPY_ICON_CLIPBOARD}</span>` +
      `<span class="code-copy-icon code-copy-icon-done" aria-hidden="true">${CODE_COPY_ICON_CHECK}</span>` +
      `<span class="code-copy-label code-copy-label-default" data-i18n="codeBlock.copy.button"></span>` +
      `<span class="code-copy-label code-copy-label-done" data-i18n="codeBlock.copy.copied"></span>`;
    button.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const code = codeEl ? codeEl.textContent : pre.textContent;
      try {
        await navigator.clipboard.writeText(code || '');
        button.classList.add('is-copied');
        setTimeout(() => button.classList.remove('is-copied'), 1500);
      } catch (err) {
        console.warn('[4T-0071] Code-Copy fehlgeschlagen', err);
      }
    });
    wrapper.appendChild(button);
  }
}

export async function applyMermaidIfPresent(container) {
  if (!container) return;
  // 4T-0293: deaktivierte Mermaid-Erweiterung — Bloecke bleiben Code.
  if (!isExtensionActive('mermaid')) return;
  const codeBlocks = container.querySelectorAll('pre > code.language-mermaid');
  if (codeBlocks.length === 0) return;
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (err) {
    console.warn('Mermaid konnte nicht geladen werden:', err);
    return;
  }
  const theme = currentMermaidTheme();
  ensureMermaidConfigured(mermaid, theme);

  // Mermaid v11: <pre><code class="language-mermaid"> wird zunaechst durch
  // unseren Wrapper-Container ersetzt, der entweder den Cache-Treffer enthaelt
  // oder einen <div class="mermaid"> mit dem Quelltext. mermaid.run() rendert
  // dann in-place; das ist der API-empfohlene Pfad in v11 und stabiler als
  // mermaid.render(), das in v11 zum Legacy-Pfad gehoert.
  const pending = [];
  for (const codeEl of codeBlocks) {
    const source = codeEl.textContent;
    const preEl = codeEl.parentElement;
    if (!preEl) continue;
    const block = document.createElement('div');
    block.className = 'mermaid-block';
    block.dataset.source = source;
    const cacheKey = mermaidCacheKey(theme, source);
    const cached = mermaidRenderCache.get(cacheKey);
    if (cached) {
      block.innerHTML = cached;
      preEl.replaceWith(block);
      continue;
    }
    const inner = document.createElement('div');
    inner.className = 'mermaid';
    inner.textContent = source;
    block.appendChild(inner);
    preEl.replaceWith(block);
    pending.push({ block, inner, source, cacheKey });
  }
  if (pending.length === 0) return;
  // R1-03/R2-04 (4T-0174): ueber die gemeinsame Queue serialisieren. Auch
  // die Nachbearbeitung (Cache-Fuellung, Leftover-Cleanup) laeuft im
  // Queue-Glied, damit kein paralleler Lauf die Arbeits-DOM-Knoten
  // wegraeumt oder defekte SVGs in den Cache hebt.
  await enqueueMermaidRun(async () => {
    try {
      await mermaid.run({ nodes: pending.map((p) => p.inner), suppressErrors: true });
    } catch (err) {
      console.warn('mermaid.run() schlug fehl:', err);
    }
    // Nachbearbeitung: Bomb-SVG durch eigene Fehlerdarstellung ersetzen, sonst
    // SVG aus dem inneren <div class="mermaid"> auf den Wrapper-Block heben und
    // den Cache fuellen.
    for (const item of pending) {
      const svgHtml = item.inner.innerHTML;
      const isError = !svgHtml || /aria-roledescription="error"/.test(svgHtml);
      if (isError) {
        renderMermaidErrorBlock(item.block, item.source, t('mermaid.syntaxError'));
      } else {
        item.block.innerHTML = svgHtml;
        item.block.classList.remove('mermaid-error');
        mermaidCacheSet(item.cacheKey, svgHtml);
      }
    }
    cleanupMermaidLeftovers();
  });
}

export function renderMermaidErrorBlock(block, source, message) {
  block.classList.add('mermaid-error');
  block.innerHTML = '';
  const pre = document.createElement('pre');
  pre.className = 'mermaid-error-source';
  pre.textContent = source;
  const msg = document.createElement('div');
  msg.className = 'mermaid-error-msg';
  msg.textContent = message;
  block.appendChild(pre);
  block.appendChild(msg);
}

// Mermaid haengt bei (Render-)Fehlern temporaere DOM-Knoten an document.body
// an (id-Praefix "dmermaid-") und raeumt sie nicht zuverlaessig auf. Damit
// landen sichtbare "Syntax error in text"-Bomb-SVGs ausserhalb unseres
// Render-Pane. Wir saeubern den Body deshalb nach jedem Mermaid-Aufruf.
export function cleanupMermaidLeftovers() {
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement)) continue;
    const id = el.id || '';
    if (id.startsWith('dmermaid-')) {
      el.remove();
    }
  }
}

// 4T-0055 (Epic 3E-0011): Wiki-Embeds expandieren.
// Scannt den Container nach <span class="wiki-embed-*">-Platzhaltern aus
// dem markdown-it-Renderer und baut das echte DOM-Element pro Embed-Typ:
//   pdf  -> <embed type="application/pdf" src="file://...">
//   md   -> Header (Datei-Name als Klick-Link) plus rekursiver Render
//   other -> Klick-Link mit Datei-Pfad
// Bilder werden bereits im preload direkt als <img> ausgegeben (mit
// data-URI dank resolveImagesForBase) und brauchen hier keine Expansion.
// Recursion-Limit fuer Markdown-Embeds: 2 Ebenen tief; tiefer kommt ein
// dezenter Hinweis-Block.
export const WIKI_EMBED_MAX_DEPTH = 2;

export async function applyWikiEmbedsIfPresent(container, basePath, depth = 0) {
  if (!container || !basePath) return;
  // 'wiki-embed-image' ueberspringen: schon als <img> im preload erzeugt.
  // 'wiki-embed-processed' markiert bereits verarbeitete Platzhalter,
  // damit ein erneuter Aufruf nicht doppelt expandiert (z.B. nach Re-
  // Render im selben Pane).
  const embeds = container.querySelectorAll(
    '.wiki-embed:not(.wiki-embed-image):not(.wiki-embed-processed)',
  );
  if (embeds.length === 0) return;
  for (const span of embeds) {
    span.classList.add('wiki-embed-processed');
    const kind = span.dataset.embedKind || 'other';
    const embedPath = span.dataset.embedPath || '';
    const anchor = span.dataset.embedAnchor || '';
    const widthAttr = span.dataset.embedWidth || '';
    if (kind === 'pdf') {
      await renderPdfEmbed(span, basePath, embedPath, widthAttr);
    } else if (kind === 'md') {
      await renderMarkdownEmbed(span, basePath, embedPath, anchor, depth);
    } else {
      await renderOtherEmbed(span, basePath, embedPath);
    }
  }
}

// 4T-0948 (Befund E-01): Einbettungen einer bestimmten Ziel-Datei erneut
// aufloesen, ohne das ganze Dokument neu zu zeichnen. Gebraucht wird das,
// wenn sich der GESCHRIEBENE Stand der eingebetteten Datei geaendert hat:
// Text und Pfad der Huelle bleiben dabei gleich, also greift weder der
// Render-Zwischenspeicher der Spalte noch die eq()-Pruefung des
// Live-Widgets, und beide behielten ihr altes DOM.
//
// Der gezielte Weg ist bewusst derselbe fuer beide Anzeige-Modi: Gerenderte
// Ansicht und Live-Modus bauen dieselben Embed-Knoten, nur an verschiedenen
// Stellen im DOM. Ein Voll-Render der Spalte traefe den Live-Modus gar nicht
// und kostete in der gerenderten Ansicht bei jedem Tipp-Takt den vollen
// Aufbau samt Scroll-Wiederherstellung.
//
// Erkennungs-Merkmal ist 'data-embed-base' am Embed-Koerper; es traegt den
// aufgeloesten Ziel-Pfad. Ueber die uebergeordneten Embed-Koerper ergeben
// sich Basis-Pfad und Tiefe der Verschachtelung, die renderMarkdownEmbed
// braucht.
export async function refreshEmbedsOfTarget(wurzel, zielPfad, dokumentPfad) {
  if (!wurzel || !zielPfad) return 0;
  const ziel = String(zielPfad).toLowerCase();
  const treffer = [];
  for (const body of wurzel.querySelectorAll('.wiki-embed-md-body[data-embed-base]')) {
    if (String(body.dataset.embedBase || '').toLowerCase() !== ziel) continue;
    const span = body.closest('.wiki-embed');
    if (span) treffer.push(span);
  }
  for (const span of treffer) {
    // Umschliessende Embed-Koerper von innen nach aussen: ihre Zahl ist die
    // Tiefe, der aeusserste von ihnen liefert den Basis-Pfad. Ohne solchen
    // Vorfahren sitzt die Einbettung unmittelbar im Dokument.
    const eltern = [];
    for (let p = span.parentElement; p; p = p.parentElement) {
      if (p.classList && p.classList.contains('wiki-embed-md-body')) eltern.push(p);
    }
    const basis = eltern.length > 0 ? eltern[0].dataset.embedBase || '' : dokumentPfad || '';
    if (!basis) continue;
    await renderMarkdownEmbed(
      span,
      basis,
      span.dataset.embedPath || '',
      span.dataset.embedAnchor || '',
      eltern.length,
    );
  }
  return treffer.length;
}

// R2-07 (4T-0174): file:///-URL aus einem Windows-Pfad bauen. '#', '?', '%'
// und Leerzeichen im Dateinamen wuerden die URL sonst zerlegen; das
// Laufwerks-':' und die Slashes bleiben unangetastet.
export function fileUrlFor(absolutePath) {
  return (
    'file:///' +
    absolutePath
      .replace(/\\/g, '/')
      .replace(/%/g, '%25')
      .replace(/#/g, '%23')
      .replace(/\?/g, '%3F')
      .replace(/ /g, '%20')
  );
}

export async function renderPdfEmbed(span, basePath, embedPath, widthAttr) {
  let resolved;
  try {
    resolved = await api.resolveLink(basePath, embedPath);
  } catch {
    resolved = null;
  }
  if (!resolved) {
    renderBrokenEmbed(span, embedPath, null);
    return;
  }
  // W-18 (4T-0309): fileExists kapseln (Muster renderOtherEmbed R2-18); eine
  // Rejection lief sonst als unbehandelte Promise-Rejection, der Embed blieb
  // ohne Broken-Darstellung stehen.
  let exists = false;
  try {
    exists = await api.fileExists(resolved);
  } catch {
    // bei Fehler bleibt exists = false (Broken-Darstellung folgt).
  }
  if (!exists) {
    renderBrokenEmbed(span, embedPath, null);
    return;
  }
  span.innerHTML = '';
  const widthCss = widthAttr ? `${widthAttr}px` : '100%';
  const obj = document.createElement('embed');
  obj.type = 'application/pdf';
  // file://-URL mit Path-Conversion fuer Windows (R2-07: Sonderzeichen-fest).
  obj.src = fileUrlFor(resolved);
  obj.style.width = widthCss;
  obj.style.height = '600px';
  obj.style.border = '1px solid var(--border)';
  obj.style.borderRadius = '4px';
  span.appendChild(obj);
}

export async function renderMarkdownEmbed(span, basePath, embedPath, anchor, depth) {
  if (depth >= WIKI_EMBED_MAX_DEPTH) {
    span.classList.add('wiki-embed-depth-exceeded');
    span.textContent = t('embed.depthExceeded') + ': ' + embedPath;
    return;
  }
  let result;
  try {
    result = await api.readEmbedFile(basePath, embedPath, anchor || null);
  } catch (err) {
    result = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  if (!result || !result.ok) {
    renderBrokenEmbed(span, embedPath, result && result.error);
    return;
  }
  span.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'wiki-embed-md-header';
  const link = document.createElement('a');
  link.className = 'wiki-embed-md-header-link';
  link.href = '#';
  link.textContent = result.displayPath || embedPath;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    // R2-16 (4T-0183): sonst laeuft der Klick zusaetzlich durch den
    // delegierten handleRenderedClick/activateLink-Pfad (redundante
    // IPC-Roundtrips); Muster vom Copy-Button.
    e.stopPropagation();
    // Datei in der aktuellen Pane oeffnen. 4T-0631 (Epic 3E-0102): der
    // Embed-Kopf-Link liegt im Dokument-Inhalt — Gruppe erben.
    openInPane(state.activePaneIndex, [result.path], { inheritGroup: true });
  });
  header.appendChild(link);
  if (anchor) {
    const anchorTag = document.createElement('span');
    anchorTag.className = 'wiki-embed-md-anchor';
    anchorTag.textContent = '#' + anchor;
    header.appendChild(anchorTag);
  }
  span.appendChild(header);
  const body = document.createElement('div');
  body.className = 'wiki-embed-md-body markdown-body';
  // R2-02 (4T-0174): Resolve-Basis fuer Links IM Embed ist die Embed-Datei,
  // nicht der Pane-Tab. handleRenderedClick liest das Attribut per closest().
  body.dataset.embedBase = result.path || '';
  // 4T-0282: Embeds zeigen nur den Inhalt — die Frontmatter-Zeile der
  // eingebetteten Datei bleibt unterdrueckt (wie der fruehere Voll-Strip).
  body.innerHTML = api.renderMarkdown(result.content || '', result.path, {
    frontmatterBlock: false,
  });
  // 4T-0071: Copy-Button-Wrapper VOR applyTranslations, damit die Button-Spans
  // mit data-i18n vom selben Lauf mit-uebersetzt werden.
  applyCodeCopyButtons(body);
  // 4T-0061: Callout-Default-Titel aus data-i18n-Attributen aufloesen.
  applyTranslations(body);
  span.appendChild(body);
  // Rekursive Verarbeitung: Mermaid, perspective-table-Sortierung und weitere
  // Wiki-Embeds im eingebetteten Inhalt. Tiefenzaehler wird inkrementiert.
  applyMermaidIfPresent(body);
  enhancePerspectiveTableSorting(body);
  await applyWikiEmbedsIfPresent(body, result.path, depth + 1);
}

export async function renderOtherEmbed(span, basePath, embedPath) {
  let resolved;
  try {
    resolved = await api.resolveLink(basePath, embedPath);
  } catch {
    resolved = null;
  }
  // R2-18 (4T-0187): Existenz pruefen wie bei PDF-/Markdown-Embeds —
  // vorher zeigte ein Other-Embed auf eine fehlende Datei einen
  // funktionslosen Link statt der Broken-Darstellung.
  if (resolved) {
    let exists = false;
    try {
      exists = await api.fileExists(resolved);
    } catch {
      /* ignore */
    }
    if (!exists) resolved = null;
  }
  if (!resolved) {
    renderBrokenEmbed(span, embedPath, null);
    return;
  }
  span.innerHTML = '';
  const link = document.createElement('a');
  link.className = 'wiki-embed-other-link';
  link.href = embedPath;
  link.textContent = embedPath;
  if (resolved) {
    link.title = resolved;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // R2-16 (4T-0183): Doppel-Verarbeitung durch den delegierten
      // Klick-Pfad unterbinden (s.o.).
      e.stopPropagation();
      // 4T-0790 (Epic 3E-0125): Umgestellt von openExternal auf den Anlagen-
      // Kanal. Der bisherige Aufruf war WIRKUNGSLOS: openExternal laesst
      // ausschliesslich http/https durch und verwirft eine file://-URL still,
      // der Klick tat also nichts. Der neue Kanal oeffnet ueber shell.openPath
      // und unterliegt denselben zwei Grenzen wie jede andere Anlage (Wurzel,
      // Rueckfrage bei ausfuehrbaren Endungen).
      const paneEl = span.closest('.pane-group');
      const paneIdx = paneEl ? Number(paneEl.dataset.pane) || 0 : state.activePaneIndex;
      void oeffneAnlage(paneIdx, resolved);
    });
  }
  span.appendChild(link);
}

export function renderBrokenEmbed(span, embedPath, errorMsg) {
  span.classList.add('wiki-embed-broken');
  span.innerHTML = '';
  const tmpl = t('embed.notFound');
  const text = tmpl.replace('{path}', embedPath);
  span.textContent = errorMsg ? `${text} (${errorMsg})` : text;
}

// 4T-0303 (Epic 3E-0054): Barriere auf der gemeinsamen Mermaid-Queue.
// Loest auf, sobald alle zuvor eingereihten Mermaid-Laeufe (Erst-Render
// aus applyRenderPipeline, Live-Widgets) abgeschlossen sind — der
// PDF-Export wartet darauf, bevor er die Bloecke im Light-Theme neu
// rendert (Nachfolger des lastApplyMermaidPromise-Syncs aus 4T-0024).
export function waitForMermaidIdle() {
  return enqueueMermaidRun(async () => {});
}

export async function rerenderAllMermaidBlocks() {
  const blocks = document.querySelectorAll('.mermaid-block');
  if (blocks.length === 0) return;
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (err) {
    // W-17 (4T-0309): Fehler nicht kommentarlos verschlucken (Muster
    // applyMermaidIfPresent). Diagramme bleiben beim Theme-Wechsel dann im
    // alten Theme; der Log macht die Ursache sichtbar.
    console.warn('rerenderAllMermaidBlocks: Mermaid-Laden fehlgeschlagen:', err);
    return;
  }
  const theme = currentMermaidTheme();
  // Bei Theme-Wechsel muss mermaid mit dem neuen Theme neu initialisiert
  // werden, damit nachfolgende Renderings die neue Palette nutzen.
  mermaidConfiguredTheme = null;
  ensureMermaidConfigured(mermaid, theme);

  const pending = [];
  for (const block of blocks) {
    const source = block.dataset.source || '';
    if (!source) continue;
    const cacheKey = mermaidCacheKey(theme, source);
    const cached = mermaidRenderCache.get(cacheKey);
    if (cached) {
      block.innerHTML = cached;
      block.classList.remove('mermaid-error');
      continue;
    }
    // Wrapper-Block zuruecksetzen und einen frischen <div class="mermaid">
    // mit dem Quelltext einsetzen, den mermaid.run() ersetzt.
    block.innerHTML = '';
    block.classList.remove('mermaid-error');
    const inner = document.createElement('div');
    inner.className = 'mermaid';
    inner.textContent = source;
    block.appendChild(inner);
    pending.push({ block, inner, source, cacheKey });
  }
  if (pending.length === 0) return;
  // R1-03 (4T-0174): ebenfalls ueber die gemeinsame Queue serialisieren.
  await enqueueMermaidRun(async () => {
    try {
      await mermaid.run({ nodes: pending.map((p) => p.inner), suppressErrors: true });
    } catch (err) {
      console.warn('mermaid.run() schlug bei Theme-Wechsel fehl:', err);
    }
    for (const item of pending) {
      const svgHtml = item.inner.innerHTML;
      const isError = !svgHtml || /aria-roledescription="error"/.test(svgHtml);
      if (isError) {
        renderMermaidErrorBlock(item.block, item.source, t('mermaid.syntaxError'));
      } else {
        item.block.innerHTML = svgHtml;
        mermaidCacheSet(item.cacheKey, svgHtml);
      }
    }
    cleanupMermaidLeftovers();
  });
}

// R2-13/R5-07 (4T-0179): EINE Render-Nachverarbeitung fuer alle drei
// Voll-Render-Stellen (Tab-Render, Split-Preview, Properties-Refresh).
// Vorher existierte die Hook-Kette dreifach und war bereits divergiert;
// der Search-Refresh am Ende ist der dabei vereinheitlichte, gewollte
// Fix (Treffer-Markierungen ueberleben jetzt jeden Voll-Render).
// K-11 (4T-0186): Task-Checkboxen im Viewer aktivierbar machen. Das
// markdown-it-Plugin liefert sie disabled (Modul-globale Optionen, der
// Portable-Export braucht disabled); der Klick-Toggle laeuft ueber
// toggleTaskFromRendered in handleRenderedClick. Bewusst NUR im
// Haupt-Render-Pfad — Checkboxen in Markdown-Embeds bleiben passiv.
export function enableTaskCheckboxes(container) {
  if (!container) return;
  for (const cb of container.querySelectorAll('input.task-list-item-checkbox[disabled]')) {
    if (cb.closest('.wiki-embed-md-body')) continue;
    cb.removeAttribute('disabled');
  }
}

// 4T-0282 (Epic 3E-0050): Interaktion der Frontmatter-Zeile. Das Markup
// kommt aus der Pipeline (renderFrontmatterBlockHtml in markdown.js); hier
// werden pro Block einmalig (data-fm-bound) der Klick-Pin gebunden und die
// lokalisierte Feldanzahl gesetzt. Aufklappen/Zuklappen laeuft rein ueber
// CSS (:hover mit Schliess-Verzoegerung gegen Hover-Flattern, .is-pinned
// haelt offen). Enter/Leertaste bedienen den Pin ueber den nativen
// <button>-Klick; aria-expanded spiegelt den Pin-Zustand.
export function applyFrontmatterLine(container) {
  if (!container) return;
  for (const header of container.querySelectorAll('.frontmatter-header')) {
    if (header.dataset.fmBound) continue;
    header.dataset.fmBound = '1';
    const countEl = header.querySelector('.frontmatter-count');
    if (countEl) {
      const n = parseInt(countEl.dataset.fmCount, 10);
      if (Number.isFinite(n)) {
        const key = n === 1 ? 'frontmatter.line.fieldCountOne' : 'frontmatter.line.fieldCount';
        countEl.textContent = t(key).replace('{count}', String(n));
      }
    }
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const block = header.closest('.frontmatter-block');
      if (!block) return;
      const pinned = block.classList.toggle('is-pinned');
      header.setAttribute('aria-expanded', pinned ? 'true' : 'false');
    });
  }
}

export function applyRenderPipeline(container, basePath) {
  applyCodeCopyButtons(container);
  applyFrontmatterLine(container);
  applyTranslations(container);
  applyMermaidIfPresent(container);
  enhancePerspectiveTableSorting(container);
  enableTaskCheckboxes(container);
  // 4T-0355: perspective-query-Listen asynchron befüllen (No-op ohne solchen
  // Container). basePath auch leer möglich — der Resolver zeigt dann den
  // 'unavailable'-Hinweis (pfadloser Tab).
  applyFrontmatterQueriesIfPresent(container, basePath);
  // 4T-0435 (Epic 3E-0081): Journal-Navigations-Block befüllen (No-op ohne
  // solchen Container; ohne basePath erscheint der Hinweis).
  applyJournalNavIfPresent(container, basePath);
  // 4T-0412 (Epic 3E-0078): Skript-Blöcke ausführen bzw. als Quelltext
  // zeigen (No-op ohne solchen Container).
  applyPerspectiveScriptsIfPresent(container, basePath);
  // 4T-0418: Platzhalter-Texte der Perspective Datatable lokalisieren
  // (No-op ohne solchen Container).
  applyPerspectiveDatatablesIfPresent(container);
  // 4T-0419: Grid-Editor-Listener binden (einmalig pro Container; die
  // Editierbarkeit prüfen die Handler zur Laufzeit über den View-Modus).
  bindPerspectiveDatatableEditor(container);
  // 4T-0420: Ansichts-Zustand (Sortierung/Filter) auf das frische DOM
  // wiederanwenden (No-op ohne Zustand).
  applyPerspectiveDatatableViewStates(container);
  // 4T-0512 (Epic 3E-0092): Ereignis-Fence lokalisieren und Differenz-
  // Spalte rechnen (No-op ohne solchen Container); Editor-Listener binden.
  applyPerspectiveEventsIfPresent(container);
  bindPerspectiveEventsEditor(container);
  // 4T-0513: Ansichts-Zustand (Sortierung/Filter) samt Filter-Leiste auf
  // das frische DOM wiederanwenden (Default-Sortierung Zeitpunkt absteigend).
  applyPerspectiveEventsViewStates(container);
  if (basePath) applyWikiEmbedsIfPresent(container, basePath);
  // 4T-0324 (Epic 3E-0058): Aussen-Link-Warnung (No-op ohne aktiven Bereich).
  if (basePath) markOutsideAreaLinks(container, basePath);
  // 4T-0365 (Epic 3E-0067): Block-Metadaten-Indikator an Blöcken mit Daten
  // (asynchron; lädt die .mdd-blockData der Datei und markiert die Anker-Blöcke).
  if (basePath) applyBlockMetaIndicators(container, basePath);
  refreshSearchIfVisible();
}
