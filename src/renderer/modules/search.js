// Such-/Ersetzen-Leiste: Suchleiste am unteren Fensterrand, Regex-Hilfe,
// Ersetzen im Quellcode-Scope.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul; 4T-0279
// (Epic 3E-0049): der zuvor mitliegende Einstellungs-Dialog ist in die
// Einstellungs-Seite (settings-page.js) migriert, das Modul traegt seither
// nur noch die Suche (Umbenennung settings-search.js -> search.js).
'use strict';

import { EditorView } from '@codemirror/view';
import { t } from '../i18n.js';

import { clearSearchDecorations, setSearchDecorations } from './live-deco.js';
import { api, $, getDocText } from './api.js';
import { activeTab, getPaneEls, state } from './app-state.js';
import { paneEditors } from './editor.js';
import { persistSetting, showStatusbarHint } from './views.js';
// 4T-0760 (Epic 3E-0142): Suchlauf ueber Handbuch und Einstellungen.
import {
  leereRaumBestand,
  naechsterRaumTreffer,
  raumIndex,
  raumTrefferAnzahl,
  sucheImRaum,
  vorherigerRaumTreffer,
} from './such-lauf.js';

// === Suche ==================================================================
// Globale Suchleiste am unteren Fensterrand, gilt fuer den aktiven Pane.
// Sucht im jeweils sichtbaren Inhalt (Quelltext oder Vorschau). Im Split-Modus
// wird in der Vorschau gesucht. Treffer werden mit <mark>-Elementen markiert.
export const MAX_MATCHES = 5000;
export const SEARCH_DEBOUNCE_MS = 150;

export const search = {
  visible: false,
  replaceMode: false,
  query: '',
  replacement: '',
  useRegex: false,
  caseSensitive: false,
  // Bei scope === 'rendered': Array von <mark>-Elementen (DOM-Order).
  // Bei scope === 'source': Array von { from, to } im CodeMirror-Doc.
  matches: [],
  currentIndex: -1,
  scope: 'rendered', // 'source' | 'rendered'
  debounceTimer: null,
};

export let searchEls = null;

export function getSearchEls() {
  if (!searchEls) {
    searchEls = {
      bar: $('#search-bar'),
      input: $('#search-input'),
      replaceInput: $('#search-replace'),
      btnReplace: $('#btn-search-replace'),
      btnReplaceAll: $('#btn-search-replace-all'),
      count: $('#search-count'),
      scope: $('#search-scope'),
      btnCase: $('#btn-search-case'),
      btnRegex: $('#btn-search-regex'),
      btnHelp: $('#btn-search-help'),
      btnPrev: $('#btn-search-prev'),
      btnNext: $('#btn-search-next'),
      btnClose: $('#btn-search-close'),
      helpPopover: $('#regex-help-popover'),
      helpList: $('#regex-help-list'),
    };
  }
  return searchEls;
}

// Regex-Cheatsheet: Pattern bleibt gleich, Erklaerung ueber i18n-Key.
export const REGEX_HELP_ITEMS = [
  { pattern: '.', key: 'search.regexHelp.any' },
  { pattern: '*', key: 'search.regexHelp.star' },
  { pattern: '+', key: 'search.regexHelp.plus' },
  { pattern: '?', key: 'search.regexHelp.optional' },
  { pattern: '^', key: 'search.regexHelp.lineStart' },
  { pattern: '$', key: 'search.regexHelp.lineEnd' },
  { pattern: '\\d', key: 'search.regexHelp.digit' },
  { pattern: '\\w', key: 'search.regexHelp.word' },
  { pattern: '\\s', key: 'search.regexHelp.space' },
  { pattern: '\\b', key: 'search.regexHelp.wordBoundary' },
  { pattern: '[abc]', key: 'search.regexHelp.charset' },
  { pattern: '[^abc]', key: 'search.regexHelp.notCharset' },
  { pattern: 'a|b', key: 'search.regexHelp.alternation' },
  { pattern: '\\.', key: 'search.regexHelp.escape' },
];

export function renderRegexHelp() {
  const els = getSearchEls();
  els.helpList.innerHTML = '';
  for (const item of REGEX_HELP_ITEMS) {
    const dt = document.createElement('dt');
    dt.textContent = item.pattern;
    const dd = document.createElement('dd');
    dd.textContent = t(item.key);
    els.helpList.appendChild(dt);
    els.helpList.appendChild(dd);
  }
  // Titel-Text aktualisieren (von applyTranslations gesetzt, hier nicht noetig — wird via data-i18n erfasst).
}

export function positionRegexHelp() {
  const els = getSearchEls();
  const btnRect = els.btnHelp.getBoundingClientRect();
  // Erst sichtbar machen, um die echte Groesse zu kennen.
  els.helpPopover.style.left = '0px';
  els.helpPopover.style.top = '0px';
  els.helpPopover.hidden = false;
  const popRect = els.helpPopover.getBoundingClientRect();
  // Mittig ueber dem Button platzieren, 8 px Abstand.
  let left = btnRect.left + btnRect.width / 2 - popRect.width / 2;
  let top = btnRect.top - popRect.height - 8;
  // In den Viewport zwingen.
  if (left < 8) left = 8;
  if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
  if (top < 8) top = btnRect.bottom + 8;
  els.helpPopover.style.left = `${left}px`;
  els.helpPopover.style.top = `${top}px`;
}

export function isRegexHelpOpen() {
  return !getSearchEls().helpPopover.hidden;
}

export function openRegexHelp() {
  const els = getSearchEls();
  renderRegexHelp();
  positionRegexHelp();
  els.btnHelp.classList.add('active');
}

export function closeRegexHelp() {
  const els = getSearchEls();
  els.helpPopover.hidden = true;
  els.btnHelp.classList.remove('active');
}

export function toggleRegexHelp() {
  if (isRegexHelpOpen()) closeRegexHelp();
  else openRegexHelp();
}

export function determineSearchScope() {
  const tab = activeTab();
  if (!tab) return 'rendered';
  // 4T-0760 (Epic 3E-0142): Der Suchraum folgt dem aktiven Reiter, und zwar
  // exklusiv (PO-Entscheidung 2026-07-27). Die Einstellungs-Seite hat kein
  // Dokument-Verhalten, deshalb steht sie vor der Modus-Abfrage.
  if (tab.systemPage === 'settings') return 'settings';
  // Ein Handbuch-Reiter durchsucht das GANZE Handbuch — aber nur in der
  // Lese-Ansicht. Wer die Quelle vor sich hat, sucht plausibel nach
  // Markdown-Syntax in genau dieser Seite; das kann der Handbuch-Raum
  // nicht bedienen, und diese Absicht wiegt schwerer.
  if (tab.manualPage && tab.viewMode === 'rendered') return 'manual';
  // Im Split-Modus den Quelltext durchsuchen: dort steht die Markdown-Syntax
  // (z.B. `###`), die in der gerenderten Vorschau gar nicht mehr vorkommt.
  if (tab.viewMode === 'source' || tab.viewMode === 'split' || tab.viewMode === 'live')
    return 'source';
  return 'rendered';
}

// 4T-0760: Die beiden Raum-Scopes verhalten sich grundlegend anders als die
// zwei Dokument-Scopes (Trefferliste statt Inline-Markierung, asynchrone
// Lieferanten, Sprung über Seiten-/Bereichsgrenzen). Diese Abfrage macht die
// Verzweigungen unten lesbar.
export function isRaumScope(scope) {
  return scope === 'manual' || scope === 'settings';
}

// R5-16 (4T-0183): Die Helpers werden ausschliesslich vom Render-Pane-
// Suchpfad erreicht (der source-Scope biegt vorher in performSourceSearch
// ab und arbeitet ueber CodeMirror-Decorations) — der tote source-Zweig
// samt veraltetem 4T-0007-Vorschau-Kommentar ist entfernt. Der scope-
// Parameter bleibt fuer Lesbarkeit an den Aufrufstellen erhalten.
export function getSearchContainer(_scope) {
  const els = getPaneEls(state.activePaneIndex);
  return els.renderedHtml;
}

export function getSearchScrollContainer(_scope) {
  const els = getPaneEls(state.activePaneIndex);
  return els.renderedEl;
}

// 4T-0760: Der Sprung zu einem Raum-Treffer (Seite oeffnen bzw. Bereich
// wechseln, Fundstelle hervorheben) lebt in such-sprung.js und wird beim
// Start registriert. Ueber den Registrierungs-Punkt statt eines Imports,
// weil die Sprung-Logik ihrerseits highlightInContainer aus diesem Modul
// braucht und ein Modul-Zyklus hier vermeidbar ist.
let raumSprungHandler = null;
// Stellt nach einem Raum-Suchlauf die Inline-Markierung der offenen Seite
// wieder her (clearSearchHighlights zu Beginn jedes Laufs raeumt sie weg).
let raumMarkierHandler = null;

export function setzeRaumSprungHandler(fn) {
  raumSprungHandler = typeof fn === 'function' ? fn : null;
}

export function setzeRaumMarkierHandler(fn) {
  raumMarkierHandler = typeof fn === 'function' ? fn : null;
}

export function springeZuRaumTreffer(treffer) {
  if (raumSprungHandler && treffer) void raumSprungHandler(treffer);
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRegex(query, useRegex, caseSensitive) {
  const pattern = useRegex ? query : escapeRegex(query);
  const flags = 'gm' + (caseSensitive ? '' : 'i');
  return new RegExp(pattern, flags);
}

export function clearSearchHighlights() {
  // Render-Pane: alte <mark>-Elemente entfernen und Textknoten zusammenfuehren.
  const marks = document.querySelectorAll('.mdv-match');
  const parents = new Set();
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parents.add(parent);
  });
  parents.forEach((p) => p.normalize());
  // Source-Pane: CodeMirror-Decorations in allen EditorViews loeschen.
  for (const view of paneEditors) {
    if (view) view.dispatch({ effects: clearSearchDecorations.of(null) });
  }
  search.matches = [];
  search.currentIndex = -1;
}

export function highlightInContainer(container, regex) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      // Treffer in Mark-Elementen vermeiden (kommt nach clearSearchHighlights nicht vor, doppelt sicher).
      if (
        node.parentNode &&
        node.parentNode.classList &&
        node.parentNode.classList.contains('mdv-match')
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      // R5-05/R5-06 (4T-0171): KaTeX-MathML ist per CSS auf 1 px geclippt
      // (unsichtbare Doppel-Treffer, Zaehler zu hoch, F3 springt ins Leere);
      // in SVG-<text> (Mermaid-Labels) wird ein HTML-<mark> nicht gerendert
      // und der Label-Text verschwindet. Beide Bereiche ueberspringen.
      const el = node.parentElement;
      if (el && el.closest('.katex-mathml, svg')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  const marks = [];
  let total = 0;
  for (const textNode of textNodes) {
    if (total >= MAX_MATCHES) break;
    const text = textNode.nodeValue;
    regex.lastIndex = 0;
    const ranges = [];
    let m;
    while ((m = regex.exec(text))) {
      if (m[0].length === 0) {
        // Bei Nullbreiten-Treffern (z.B. ^/$) Endlosschleife verhindern.
        regex.lastIndex += 1;
        continue;
      }
      ranges.push({ start: m.index, end: m.index + m[0].length });
      if (total + ranges.length >= MAX_MATCHES) break;
    }
    if (ranges.length === 0) continue;

    const parent = textNode.parentNode;
    if (!parent) continue;
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const r of ranges) {
      if (r.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, r.start)));
      const mark = document.createElement('mark');
      mark.className = 'mdv-match';
      mark.textContent = text.slice(r.start, r.end);
      frag.appendChild(mark);
      marks.push(mark);
      cursor = r.end;
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    parent.replaceChild(frag, textNode);
    total += ranges.length;
  }
  return marks;
}

export function findFirstVisibleMatchIndex() {
  if (search.matches.length === 0) return -1;
  const scrollContainer = getSearchScrollContainer(search.scope);
  const cRect = scrollContainer.getBoundingClientRect();
  for (let i = 0; i < search.matches.length; i++) {
    const r = search.matches[i].getBoundingClientRect();
    if (r.bottom >= cRect.top) return i;
  }
  return 0;
}

export function setCurrentMatch(idx, scroll = true) {
  if (search.scope === 'source') {
    // Source-Pane: Decoration-Set aktualisieren, der aktive Treffer bekommt
    // die zusaetzliche cm-search-match-current-Klasse.
    search.currentIndex = idx;
    const view = paneEditors[state.activePaneIndex];
    if (view) {
      view.dispatch({
        effects: setSearchDecorations.of({
          matches: search.matches,
          currentIndex: idx,
        }),
      });
      if (scroll && idx >= 0 && search.matches[idx]) {
        // R5-13 (4T-0186): Selektion auf den Treffer setzen — im Live-
        // Modus klappt das den umgebenden Block (Tabelle, Code, Math) zur
        // Quelle auf, sonst bleibt der angesprungene Treffer unsichtbar
        // hinter dem Widget. Die Suchleiste behaelt den Tastatur-Fokus.
        view.dispatch({
          selection: { anchor: search.matches[idx].from },
          effects: EditorView.scrollIntoView(search.matches[idx].from, { y: 'center' }),
        });
      }
    }
    updateSearchCounter();
    return;
  }
  // Render-Pane: DOM-<mark>-Pfad wie bisher.
  if (search.currentIndex >= 0 && search.matches[search.currentIndex]) {
    search.matches[search.currentIndex].classList.remove('mdv-match-current');
  }
  search.currentIndex = idx;
  if (idx >= 0 && search.matches[idx]) {
    const m = search.matches[idx];
    m.classList.add('mdv-match-current');
    if (scroll) m.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }
  updateSearchCounter();
}

export function updateSearchCounter() {
  const els = getSearchEls();
  // 4T-0760: Im Raum-Scope zaehlt der Bestand des Suchlaufs ueber alle
  // Seiten bzw. Bereiche, nicht die (leere) Treffer-Liste der Pane.
  const total = isRaumScope(search.scope) ? raumTrefferAnzahl() : search.matches.length;
  const current = isRaumScope(search.scope) ? raumIndex() : search.currentIndex;
  if (!search.query) {
    els.count.textContent = '';
    els.count.classList.remove('empty');
    return;
  }
  if (total === 0) {
    els.count.textContent = t('search.noResults');
    els.count.classList.add('empty');
    return;
  }
  els.count.classList.remove('empty');
  els.count.textContent = `${current + 1} / ${total}`;
}

const SCOPE_LABEL_KEYS = {
  source: 'search.scopeSource',
  rendered: 'search.scopeRendered',
  // 4T-0760 (Epic 3E-0142)
  manual: 'search.scopeManual',
  settings: 'search.scopeSettings',
};

export function updateSearchScopeLabel() {
  const els = getSearchEls();
  els.scope.textContent = t(SCOPE_LABEL_KEYS[search.scope] || 'search.scopeRendered');
}

export function setInvalidRegex(invalid) {
  const els = getSearchEls();
  els.input.classList.toggle('invalid', !!invalid);
  if (invalid) {
    els.count.textContent = t('search.invalidRegex');
    els.count.classList.add('empty');
  }
}

export function performSearch(opts = {}) {
  // R5-04 (4T-0171): nie nach geschlossener Leiste suchen (nachlaufende
  // Timer, programmatische Aufrufe).
  if (!search.visible) return;
  const { keepCurrent = false } = opts;
  const prevIdx = keepCurrent ? search.currentIndex : -1;
  clearSearchHighlights();
  const vorherigerScope = search.scope;
  search.scope = determineSearchScope();
  updateSearchScopeLabel();
  // R5-09 (4T-0171): Replace-Bedienbarkeit an Scope/Edit-Modus koppeln.
  updateReplaceUiState();
  // 4T-0760: Beim Verlassen eines Raums seinen Trefferbestand verwerfen —
  // die Treffer gehoerten zu einem anderen Suchraum und waeren im neuen
  // schlicht falsch (die Raeume schliessen einander aus).
  if (isRaumScope(vorherigerScope) && vorherigerScope !== search.scope) {
    leereRaumBestand(isRaumScope(search.scope) ? search.scope : 'document');
  }

  if (!search.query) {
    setInvalidRegex(false);
    if (isRaumScope(search.scope)) leereRaumBestand(search.scope);
    updateSearchCounter();
    return;
  }

  let regex;
  try {
    regex = buildRegex(search.query, search.useRegex, search.caseSensitive);
  } catch {
    setInvalidRegex(true);
    return;
  }
  setInvalidRegex(false);

  // 4T-0760: Raum-Suche. Der Lieferant arbeitet asynchron (Handbuch-Seiten
  // kommen per IPC), deshalb laeuft der Zaehler dem Tastendruck hinterher;
  // ueberholte Laeufe verwirft sucheImRaum selbst ueber seine Generation.
  if (isRaumScope(search.scope)) {
    void sucheImRaum(search.scope, regex, { behalteIndex: keepCurrent }).then((angezeigt) => {
      if (!angezeigt) return;
      updateSearchCounter();
      if (raumMarkierHandler) raumMarkierHandler();
    });
    return;
  }

  if (search.scope === 'source') {
    performSourceSearch(regex, prevIdx);
    return;
  }

  // Render-Pane: bisheriger DOM-Pfad.
  const container = getSearchContainer(search.scope);
  if (!container) {
    updateSearchCounter();
    return;
  }
  search.matches = highlightInContainer(container, regex);

  if (search.matches.length === 0) {
    search.currentIndex = -1;
    updateSearchCounter();
    return;
  }

  const startIdx =
    prevIdx >= 0 && prevIdx < search.matches.length ? prevIdx : findFirstVisibleMatchIndex();
  setCurrentMatch(startIdx);
}

// Source-Pane-Suche ueber CodeMirror-State. Treffer werden als Decorations
// in der EditorView gerendert, ueberleben CM-Re-Renders. Aktiver Treffer
// bekommt eine zusaetzliche orange Klasse.
export function performSourceSearch(regex, prevIdx) {
  const view = paneEditors[state.activePaneIndex];
  if (!view) {
    search.matches = [];
    search.currentIndex = -1;
    updateSearchCounter();
    return;
  }
  // W-19 (4T-0310): geteilter Voll-Text-Cache statt eigener Serialisierung
  // pro Such-Refresh (Entwicklungsrichtlinien §5).
  const doc = getDocText(view.state.doc);
  const matches = [];
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(doc)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    matches.push({ from: m.index, to: m.index + m[0].length });
    if (matches.length >= MAX_MATCHES) break;
  }
  search.matches = matches;

  if (matches.length === 0) {
    search.currentIndex = -1;
    view.dispatch({ effects: clearSearchDecorations.of(null) });
    updateSearchCounter();
    return;
  }

  // Aktiven Index bestimmen: zuvor genutzter falls noch gueltig, sonst erster
  // sichtbarer Treffer (ab aktueller Scroll-Position).
  let startIdx = 0;
  if (prevIdx >= 0 && prevIdx < matches.length) {
    startIdx = prevIdx;
  } else {
    const top = view.scrollDOM.scrollTop;
    for (let i = 0; i < matches.length; i++) {
      const block = view.lineBlockAt(matches[i].from);
      if (block && block.bottom >= top) {
        startIdx = i;
        break;
      }
    }
  }
  setCurrentMatch(startIdx);
}

export function debouncedSearch() {
  if (search.debounceTimer) clearTimeout(search.debounceTimer);
  search.debounceTimer = setTimeout(() => {
    search.debounceTimer = null;
    performSearch();
  }, SEARCH_DEBOUNCE_MS);
}

// R5-01 (4T-0171): Debounced Re-Search nach Doc-Aenderungen, vom
// updateListener aufgerufen. Eigener Timer, damit das Tipp-Debounce der
// Suchleiste (debouncedSearch) unabhaengig bleibt.
export let searchRefreshTimer = null;
export function scheduleSearchRefresh() {
  if (searchRefreshTimer) clearTimeout(searchRefreshTimer);
  searchRefreshTimer = setTimeout(() => {
    searchRefreshTimer = null;
    refreshSearchIfVisible();
  }, SEARCH_DEBOUNCE_MS);
}

export function nextMatch() {
  // 4T-0760: Im Raum-Scope laeuft F3 ueber die Seiten- bzw. Bereichsgrenze
  // hinweg; der Sprung selbst haengt am Sprung-Handler des Panels.
  if (isRaumScope(search.scope)) {
    const treffer = naechsterRaumTreffer();
    if (treffer) springeZuRaumTreffer(treffer);
    updateSearchCounter();
    return;
  }
  if (search.matches.length === 0) return;
  const n = (search.currentIndex + 1) % search.matches.length;
  setCurrentMatch(n);
}

export function prevMatch() {
  if (isRaumScope(search.scope)) {
    const treffer = vorherigerRaumTreffer();
    if (treffer) springeZuRaumTreffer(treffer);
    updateSearchCounter();
    return;
  }
  if (search.matches.length === 0) return;
  const n = (search.currentIndex - 1 + search.matches.length) % search.matches.length;
  setCurrentMatch(n);
}

export function openSearchBar(opts = {}) {
  const { replaceMode = false } = opts;
  const els = getSearchEls();
  search.visible = true;
  search.replaceMode = !!replaceMode;
  els.bar.classList.toggle('replace-mode', !!replaceMode);
  els.bar.hidden = false;
  els.input.focus();
  els.input.select();
  // Suche aktuellen Inhalt, falls Begriff schon vorhanden.
  if (search.query) {
    performSearch();
  } else {
    // R5-09 (4T-0171): Scope und Replace-Bedienbarkeit auch ohne Query
    // aktuell halten (performSearch laeuft hier nicht).
    search.scope = determineSearchScope();
    updateSearchScopeLabel();
    updateReplaceUiState();
  }
}

export function closeSearchBar() {
  const els = getSearchEls();
  search.visible = false;
  search.replaceMode = false;
  // R5-04 (4T-0171): laufende Debounce-Timer stoppen, sonst laeuft
  // performSearch nach dem Schliessen weiter (Highlights + Scroll).
  if (search.debounceTimer) {
    clearTimeout(search.debounceTimer);
    search.debounceTimer = null;
  }
  if (searchRefreshTimer) {
    clearTimeout(searchRefreshTimer);
    searchRefreshTimer = null;
  }
  els.bar.classList.remove('replace-mode');
  els.bar.hidden = true;
  closeRegexHelp();
  clearSearchHighlights();
  // 4T-0760: Auch den Raum-Bestand samt Trefferliste raeumen; das Panel
  // bleibt offen, zeigt aber seinen Leerzustand statt veralteter Treffer.
  leereRaumBestand(null);
  setInvalidRegex(false);
  updateSearchCounter();
}

// --- Ersetzen (4T-0007) -----------------------------------------------------
// Ersetzt den aktiven Treffer durch search.replacement. Bei Regex-Modus werden
// Backreferences ($1, $2 …) im Ersetzungstext ausgewertet. Voraussetzung:
// scope === 'source' und aktiver Tab im Edit-Modus (Source ist editierbar).
// R5-01 (4T-0171): Verifiziert, dass der Doc-Text an [from, to) noch ein
// vollstaendiger Treffer des aktuellen Suchmusters ist. Schutz gegen
// veraltete Offsets in einem Restfenster (z.B. Aenderung zwischen
// Invalidierung und Klick); bei Mismatch wird re-searcht statt ersetzt.
export function isStillFullMatch(matchText) {
  let regex;
  try {
    regex = buildRegex(search.query, search.useRegex, search.caseSensitive);
  } catch {
    return false;
  }
  regex.lastIndex = 0;
  const m = regex.exec(matchText);
  return !!m && m.index === 0 && m[0].length === matchText.length;
}

export function replaceCurrentMatch() {
  if (search.scope !== 'source') return;
  if (search.currentIndex < 0 || search.currentIndex >= search.matches.length) return;
  const tab = activeTab();
  if (!tab || !tab.editMode) return;
  const view = paneEditors[state.activePaneIndex];
  if (!view) return;
  const m = search.matches[search.currentIndex];
  const matchText = view.state.doc.sliceString(m.from, m.to);
  // R5-01: niemals blind alte Offsets dispatchen.
  if (!isStillFullMatch(matchText)) {
    performSearch();
    return;
  }
  const replaceText = computeReplacement(matchText);
  // 4T-0484 (Epic 3E-0088): userEvent-Annotation — der Ersetzen-Klick kommt
  // aus der Such-Leiste (kein Tipp-Ereignis im Editor); ohne Annotation
  // verschmilzt die Transaktion mit dem vorherigen Historien-Ereignis.
  // 'input.replace' ist der CodeMirror-Standard-Wert fuer Ersetzungen.
  view.dispatch({
    changes: { from: m.from, to: m.to, insert: replaceText },
    userEvent: 'input.replace',
  });
  // Doc geaendert -> der updateListener invalidiert search.matches (R5-01);
  // performSearch baut die Treffer neu auf und waehlt den ersten sichtbaren.
  performSearch();
}

// Alle Treffer in einer einzigen CodeMirror-Transaktion ersetzen (Strg+Z macht
// die Operation als Ganzes rueckgaengig). Iteriert in Reverse-Order, damit die
// Indizes konsistent bleiben.
export function replaceAllMatches() {
  if (search.scope !== 'source') return;
  const tab = activeTab();
  if (!tab || !tab.editMode) return;
  const view = paneEditors[state.activePaneIndex];
  if (!view || search.matches.length === 0) return;
  // R5-01 (4T-0171): jeden Treffer gegen den aktuellen Doc-Stand
  // verifizieren; bei einem einzigen Mismatch Re-Search statt Replace.
  for (const m of search.matches) {
    if (!isStillFullMatch(view.state.doc.sliceString(m.from, m.to))) {
      performSearch();
      return;
    }
  }
  const changes = search.matches
    .slice()
    .reverse()
    .map((m) => {
      const matchText = view.state.doc.sliceString(m.from, m.to);
      return { from: m.from, to: m.to, insert: computeReplacement(matchText) };
    });
  const count = changes.length;
  // 4T-0484 (Epic 3E-0088): siehe replaceCurrentMatch — eigener Historien-
  // Eintrag; 'input.replace.all' ist der CodeMirror-Standard-Wert.
  view.dispatch({ changes, userEvent: 'input.replace.all' });
  // Counter im Statusbar-Hinweis (1.5 s)
  const text =
    count === 1
      ? t('search.replaceCountOne')
      : t('search.replaceCountMany').replace('{n}', String(count));
  showStatusbarHint('', { text, duration: 1500 });
  performSearch();
}

export function computeReplacement(matchText) {
  if (!search.useRegex) return search.replacement;
  try {
    const regex = buildRegex(search.query, true, search.caseSensitive);
    return matchText.replace(regex, search.replacement);
  } catch {
    return search.replacement;
  }
}

export function refreshSearchIfVisible() {
  if (!search.visible) return;
  // Nach DOM-Wechsel (Tab-/View-Wechsel, Reload) sind alte Mark-Refs detached.
  // currentIndex bleibt erhalten und wird in performSearch als prevIdx genutzt;
  // matches wird per clearSearchHighlights zurueckgesetzt.
  performSearch({ keepCurrent: true });
}

// R5-09 (4T-0171): Ersetzen ist nur im Quellcode-Scope mit aktivem
// Edit-Modus wirksam (replaceCurrentMatch/replaceAllMatches returnen sonst).
// Statt still funktionsloser Buttons: deaktivieren und Grund als Tooltip.
// 4T-0760: In den Raum-Scopes bleibt Ersetzen abgeschaltet — Handbuch und
// Einstellungen sind schreibgeschuetzt (Abgrenzung des Epics 3E-0142). Der
// vorhandene Weg traegt das ohne Erweiterung: Er verlangt bereits den
// Quellcode-Scope, den kein Raum-Scope erfuellt.
export function updateReplaceUiState() {
  const els = getSearchEls();
  const tab = activeTab();
  const enabled = search.scope === 'source' && !!(tab && tab.editMode);
  els.btnReplace.disabled = !enabled;
  els.btnReplaceAll.disabled = !enabled;
  els.replaceInput.disabled = !enabled;
  const hint = enabled ? '' : t('search.replaceDisabledHint');
  els.btnReplace.title = enabled ? t('search.btnReplaceTitle') : hint;
  els.btnReplaceAll.title = enabled ? t('search.btnReplaceAllTitle') : hint;
  els.replaceInput.title = hint;
}

export function bindSearchUi() {
  const els = getSearchEls();

  els.input.addEventListener('input', (e) => {
    search.query = e.target.value;
    debouncedSearch();
  });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prevMatch();
      else nextMatch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (isRegexHelpOpen()) closeRegexHelp();
      else closeSearchBar();
    }
  });

  els.btnPrev.addEventListener('click', () => {
    prevMatch();
    els.input.focus();
  });
  els.btnNext.addEventListener('click', () => {
    nextMatch();
    els.input.focus();
  });
  els.btnClose.addEventListener('click', () => closeSearchBar());
  els.btnHelp.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRegexHelp();
  });

  els.btnCase.addEventListener('click', async () => {
    search.caseSensitive = !search.caseSensitive;
    els.btnCase.classList.toggle('active', search.caseSensitive);
    await persistSetting('searchCaseSensitive', search.caseSensitive);
    performSearch({ keepCurrent: true });
    els.input.focus();
  });
  els.btnRegex.addEventListener('click', async () => {
    search.useRegex = !search.useRegex;
    els.btnRegex.classList.toggle('active', search.useRegex);
    await persistSetting('searchUseRegex', search.useRegex);
    performSearch({ keepCurrent: true });
    els.input.focus();
  });

  // Ersetzen-Block: Eingabe + Enter + Buttons.
  els.replaceInput.addEventListener('input', (e) => {
    search.replacement = e.target.value;
  });
  els.replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey || e.altKey) replaceAllMatches();
      else replaceCurrentMatch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchBar();
    }
  });
  els.btnReplace.addEventListener('click', () => {
    replaceCurrentMatch();
    els.input.focus();
  });
  els.btnReplaceAll.addEventListener('click', () => {
    replaceAllMatches();
    els.input.focus();
  });
}

export async function initSearchFromSettings() {
  const els = getSearchEls();
  const useRegex = await api.getSetting('searchUseRegex');
  const caseSensitive = await api.getSetting('searchCaseSensitive');
  search.useRegex = !!useRegex;
  search.caseSensitive = !!caseSensitive;
  els.btnRegex.classList.toggle('active', search.useRegex);
  els.btnCase.classList.toggle('active', search.caseSensitive);
}
