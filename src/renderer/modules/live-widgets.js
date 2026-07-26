// Live-Modus-Block-Widgets (Tabellen, Code, KaTeX, Mermaid, Bilder, Embeds) samt Decoration-Aufbau und Caches.
// 4T-0179 (Epic 3E-0039): aus renderer.js extrahiertes Modul (mechanischer
// Schnitt in Original-Reihenfolge; Verdrahtung ueber ESM-Live-Bindings).
'use strict';

import { CALLOUT_TYPES } from '../../shared/callouts.js';
// 4T-0512 (Epic 3E-0092): Stichtag fuer den Cache-Key der Ereignis-Widgets.
import { localTodayIso } from '../../shared/markdown/perspective-events.js';
import { StateField, StateEffect, Facet } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, hoverTooltip, WidgetType } from '@codemirror/view';
import { t, getLanguage, applyTranslations } from '../i18n.js';

import { syntaxTree } from '@codemirror/language';

import {
  CalloutDefaultTitleWidget,
  CalloutIconWidget,
  EmojiWidget,
  ImageWidget,
  LIVE_HR_LINE_RE,
  LIVE_MATH_INLINE_RE,
  LIVE_WIKI_EMBED_RE,
  MarkdownBlockWidget,
  MathBlockWidget,
  MathInlineWidget,
  WikiEmbedWidget,
  blockIsActive,
  computeCommentRanges,
  computeMathBlockRanges,
  detectFrontmatterLines,
  liveBlockquoteLineDeco,
  liveBoldDeco,
  liveCalloutHeaderLineDeco,
  liveCalloutLineDeco,
  liveCodeDeco,
  liveContainerLineDeco,
  liveCriticCommentDeco,
  liveCriticDelDeco,
  liveCriticInsDeco,
  liveCriticMarkDeco,
  liveHeadingLineDecos,
  liveHrLineDeco,
  liveInsDeco,
  liveItalicDeco,
  liveListBulletLineDeco,
  liveListNumberLineDeco,
  liveMarkerHiddenDeco,
  liveSetextUnderlineLineDeco,
  liveSpoilerDeco,
  liveStrikeDeco,
  liveSubDeco,
  liveSupDeco,
  liveTaskMarkerDecoAt,
  TaskMarkerBadgeWidget,
  CalendarValueBadgeWidget,
  InlineCalcWidget,
} from './live-deco.js';
// 4T-0498 (Epic 3E-0090): Task-Marker-Badges im Live-Modus — Spec und
// Konfiguration aus der Bundle-Instanz von plugins.js (dieselbe Quelle
// wie der Render-Pane), Zeilen-Parsing aus dem Marker-Kern.
import {
  getTaskMarkersConfig,
  taskMarkerBadgeSpec,
  taskStatusType,
  calendarValueBadgeSpec,
} from '../../shared/markdown/plugins.js';
import { parseTaskLine, isTaskLine } from '../../shared/task-markers.js';
// 4T-0546 (Epic 3E-0097): Kalender-Wert-Badges im Live-Modus — Erkennung
// aus dem Kalender-Kern, Konfiguration aus dem Renderer-Zustand
// (calendar-config.js; die Preload-Pipeline haelt ihren eigenen Stand).
import { findCalendarValues } from '../../shared/calendar-core.js';
import { getAreaCalendarConfig } from './calendar-config.js';
// 4T-0596 (Epic 3E-0111): Inline-Berechnungen im Live-Modus — Spannen-Scan
// und Anzeige-Spec aus dem geteilten Konstrukt-Modul (dieselbe Quelle wie
// der Render-Pane; bewusst markdown.js-frei und damit Bundle-tauglich).
import { findInlineCalcSpans, inlineCalcSpec } from '../../shared/markdown/inline-calc.js';
// 4T-0197 (Epic 3E-0017): Shortcode->Unicode-Map des full-Sets direkt aus
// dem markdown-it-emoji-Paket (keine eigene Duplikat-Tabelle; identische
// Treffer wie der Render-Pfad). esbuild bundlet die ESM-Daten-Datei.
import emojiDefs from 'markdown-it-emoji/lib/data/full.mjs';
import { api, getDocText } from './api.js';
// 4T-0283 (Epic 3E-0050): Schalter-Zustand der Frontmatter-Anzeige als
// Guard fuer das Frontmatter-Block-Widget (zyklenfrei: importiert nur api).
import { isFrontmatterDisplayEnabled } from './frontmatter-display.js';
// K-02 (4T-0186): Slug-Funktion direkt aus der geteilten Pipeline —
// esbuild bundlet das CommonJS-Modul; identische Slugs wie markdown-it-
// anchor im Render-Pfad.
import { githubLikeSlug } from '../../shared/markdown/slug.js';

// 4T-0204: aktives Task-Status-Set fuer Marker-Pattern, State-Decos und
// Toggle (task-states.js ist zyklenfrei: importiert nur api/i18n/shared).
import { activeTaskStateMap, getLiveTaskMarkerRe, performStatusToggle } from './task-states.js';
// 4T-0293 (Epic 3E-0052): Schalt-Zustand der Render-Erweiterungen — jeder
// Konstrukt-Pass steht unter der Guard seiner Erweiterung, damit der
// Live-Modus konsistent zum Render-Pane schaltet (zyklenfrei: das
// Lebenszyklus-Modul importiert nur api und die shared Registry).
import { isExtensionActive } from './extension-lifecycle.js';
// 4T-0471 (Epic 3E-0087): Gliederungs-Nummerierung im Live-Modus.
import { foldStructureField } from './folding.js';
import { computeHeadingNumbers } from '../../shared/heading-numbers.js';
import { resolveHeadingNumberingForDoc } from './heading-numbering.js';
import { extractFrontmatter } from '../../shared/markdown/frontmatter.js';
import {
  applyFrontmatterLine,
  cleanupMermaidLeftovers,
  currentMermaidTheme,
  ensureMermaidConfigured,
  loadMermaid,
  mermaidHash,
} from './render-mermaid.js';
import { state } from './app-state.js';
import { paneEditors } from './editor.js';
import { openInPane } from './tabs.js';
// 4T-0409 (Epic 3E-0077): scrollToAnchorAfterOpen/normalizedAnchorId fuer den
// Anker-Sprung der Block-Treffer der Perspective-Abfrage.
import {
  activateLink,
  scrollToAnchorAfterOpen,
  scrollToLineAfterOpen,
  normalizedAnchorId,
} from './views.js';
// 4T-0504 (Epic 3E-0096): Rueckschreib-Aktionen der Task-Abfrage-Treffer
// (Status-Toggle, Verschieben, Bearbeiten) — zentraler Klick-Dispatch.
import { handleTaskQueryAction } from './task-query-actions.js';

// 4T-0089 (Epic 3E-0014): Mermaid-Block-Widget. Unterscheidet sich von
// MarkdownBlockWidget durch:
// 1) Eigene Bibliothek (loadMermaid + mermaid.run aus dem Renderer, NICHT
//    api.renderMarkdown), weil Mermaid nicht in der preload-Pipeline laeuft.
// 2) Async-Render — toDOM gibt synchron einen Platzhalter zurueck und
//    ersetzt nach Mermaid-Fertigstellung den Container-Inhalt.
// 3) Theme im Cache-Key, damit Light-/Dark-Renders parallel cached sind
//    (Schluessel-Format mermaid:<theme>:<hash>).
// 4) Cancellation-Flag (_destroyed) verhindert DOM-Tausch nach Widget-
//    Destroy (z.B. Tab-Schliessen waehrend laufendem Render).
// 5) Render-Queue serialisiert Mermaid-Aufrufe — Mermaid v11 hat
//    globalen Counter-State, parallele mermaid.run-Aufrufe verwirren
//    den Render (beobachtet: Diagramme vermischten sich oder lieferten
//    "Syntax error" trotz korrekter Quelle).
// 6) KEIN body-weiter DOM-Cleanup in destroy() — das wuerde laufende
//    Renders anderer Widgets killen. Cleanup laeuft periodisch via
//    cleanupMermaidLeftovers (bestehende Render-Pane-Helper).

// Render-Queue: pro Widget einen Promise, der nach dem Vorgaenger
// startet. So sind gleichzeitige Mermaid-Aufrufe ausgeschlossen.
export let mermaidRenderQueue = Promise.resolve();

// R1-03/R2-04 (4T-0174): ALLE mermaid.run-Pfade (Live-Widgets, Render-Pane,
// Theme-Re-Render) laufen ueber dieselbe Queue. Mermaid v11 haelt globalen
// Counter-State; parallele Laeufe vermischten Diagramme, warfen Phantom-
// Syntax-Fehler und konnten defekte SVGs in den Cache heben.
export function enqueueMermaidRun(fn) {
  const run = mermaidRenderQueue.then(fn, fn);
  // Queue-Kette selbst nie rejecten lassen, sonst blockiert ein Fehler
  // keine Folge-Renders, faerbt aber jede neue Verkettung rot.
  mermaidRenderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export class MermaidBlockWidget extends WidgetType {
  constructor(source, theme) {
    super();
    this.source = source;
    this.theme = theme || 'default';
    this._destroyed = false;
  }
  eq(other) {
    return (
      other instanceof MermaidBlockWidget &&
      other.source === this.source &&
      other.theme === this.theme
    );
  }
  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-live-mermaid';
    const cacheKey = `mermaid:${this.theme}:${mermaidHash(this.source)}`;
    const cached = liveBlockCacheGet(cacheKey);
    if (cached) {
      wrapper.appendChild(cached.cloneNode(true));
      return wrapper;
    }
    const placeholder = document.createElement('div');
    placeholder.className = 'cm-live-mermaid-loading';
    // R1-10 (4T-0185): lokalisiert (war hartkodiert deutsch).
    placeholder.textContent = t('live.mermaid.loading');
    wrapper.appendChild(placeholder);
    // Render-Queue: pro Widget hinten anhaengen, damit Mermaid serialisiert
    // laeuft (gemeinsamer Helper mit dem Render-Pane-Pfad, R1-03).
    enqueueMermaidRun(() => this._renderAsync(wrapper, placeholder, cacheKey));
    return wrapper;
  }
  async _renderAsync(wrapper, placeholder, cacheKey) {
    if (this._destroyed) return;
    let mermaid;
    try {
      mermaid = await loadMermaid();
    } catch (err) {
      if (this._destroyed) return;
      console.warn('MermaidBlockWidget loadMermaid-Fehler:', err);
      this._renderError(wrapper, placeholder, err);
      return;
    }
    if (this._destroyed) return;
    ensureMermaidConfigured(mermaid, this.theme);
    const inner = document.createElement('div');
    inner.className = 'mermaid';
    inner.textContent = this.source;
    try {
      wrapper.replaceChild(inner, placeholder);
    } catch (_) {
      return; // Wrapper schon abgehaengt
    }
    // suppressErrors:false zwingt mermaid bei Syntax-Fehlern zum throw —
    // sonst rendert mermaid sein eigenes Bomb-SVG in den Container, das
    // landet faelschlich im Cache und der `translate(undefined,NaN)`-Bug
    // aus dem Bomb-Render-Pfad floodet die Console.
    try {
      await mermaid.run({ nodes: [inner], suppressErrors: false });
    } catch (err) {
      if (this._destroyed) return;
      this._renderError(wrapper, inner, err);
      cleanupMermaidLeftovers();
      return;
    }
    cleanupMermaidLeftovers();
    if (this._destroyed) return;
    const svg = inner.querySelector('svg');
    if (svg) {
      liveBlockCacheSet(cacheKey, svg);
    } else {
      // Theoretisch unerreichbar mit suppressErrors:false, aber als
      // Sicherheitsnetz behalten. R1-10 (4T-0185): lokalisiert.
      this._renderError(wrapper, inner, new Error(t('live.mermaid.noSvg')));
    }
  }
  _renderError(wrapper, replaceTarget, err) {
    const box = document.createElement('div');
    box.className = 'cm-live-mermaid-error';
    const msg = document.createElement('div');
    msg.className = 'cm-live-mermaid-error-msg';
    msg.textContent = err && err.message ? err.message : String(err);
    const src = document.createElement('pre');
    src.className = 'cm-live-mermaid-error-source';
    src.textContent = this.source;
    box.appendChild(msg);
    box.appendChild(src);
    try {
      wrapper.replaceChild(box, replaceTarget);
    } catch (_) {
      // replaceTarget schon weg — Wrapper komplett leeren und Box anhaengen.
      wrapper.textContent = '';
      wrapper.appendChild(box);
    }
  }
  destroy() {
    this._destroyed = true;
    // KEIN body-weiter Cleanup hier — wuerde laufende Renders anderer
    // Widgets killen. cleanupMermaidLeftovers laeuft nach jedem
    // mermaid.run-Aufruf in _renderAsync und nach Render-Pane-Renders
    // (bestehender Code), das reicht.
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0283 (Epic 3E-0050): Frontmatter-Block-Widget. Ersetzt die
// Frontmatter-Zeilen (Erkennung: detectFrontmatterLines, dieselbe Quelle
// wie die Zeilen-Dekoration) durch die zusammengeklappte Zeile aus
// 4T-0282, solange Cursor und Selektion ausserhalb liegen (blockIsActive-
// Muster der KaTeX-/Mermaid-Block-Widgets). Der Inhalt kommt aus
// api.renderMarkdown mit dem reinen Frontmatter-Quelltext — der Body ist
// leer, der Output ist exakt der Frontmatter-Block des Render-Pane
// (Paritaet aus einer Quelle, keine doppelte Markup-Erzeugung).
//
// Interaktion: Hover/Pin/Tastatur bindet applyFrontmatterLine wie im
// Render-Pane (Klick auf die Kopfzeile pinnt statt zu demaskieren).
// Klick ins aufgeklappte YAML demaskiert per eigenem Handler: Cursor auf
// das erste YAML-Zeichen setzen (posAtDOM plus Offset) statt CodeMirrors
// Klick-Mapping zu ueberlassen — das mappt ueber mehrzeiligen Replace-
// Widgets je nach Klick-Hoehe auf Position 0, die als unberuehrte
// Initial-Selektion gerade NICHT demaskiert (siehe buildBlockWidgetValue).
// eq() vergleicht Quelltext und Sprache (Sprachwechsel erneuert das
// lokalisierte Label via liveRebuildEffect-Rebuild).
export class FrontmatterBlockWidget extends WidgetType {
  constructor(source, lang) {
    super();
    this.source = source;
    this.lang = lang || '';
  }
  eq(other) {
    return (
      other instanceof FrontmatterBlockWidget &&
      other.source === this.source &&
      other.lang === this.lang
    );
  }
  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-live-frontmatter markdown-body';
    try {
      const html = api.renderMarkdown(this.source, '');
      if (html && html.includes('frontmatter-block')) {
        container.innerHTML = html;
        applyFrontmatterLine(container);
        applyTranslations(container);
        container.addEventListener('mousedown', (e) => {
          // Kopfzeile behaelt die Pin-Interaktion; alles andere (das
          // aufgeklappte YAML) demaskiert zum editierbaren Quelltext.
          if (e.target && e.target.closest && e.target.closest('.frontmatter-header')) return;
          e.preventDefault();
          const editorEl = container.closest('.cm-editor');
          const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
          if (!view) return;
          const base = view.posAtDOM(container);
          const yamlStart = this.source.indexOf('\n') + 1; // Zeile 2
          view.dispatch({
            selection: { anchor: base + (yamlStart > 0 ? yamlStart : 0) },
            scrollIntoView: true,
          });
          view.focus();
        });
        return container;
      }
    } catch (err) {
      console.warn('FrontmatterBlockWidget Render-Fehler:', err);
    }
    // Fallback (Pipeline-Schalter aus oder Render-Fehler): Quelltext.
    container.textContent = this.source;
    return container;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0084: Helper zum Auflesen des basePath fuer einen EditorView ueber
// den paneEditors-Index. Liefert tab.path des aktuell aktiven Tabs der
// passenden Pane, oder leerer String wenn nicht ermittelbar. Wird im
// Decoration-Build pro Widget-Konstruktor uebergeben (Entscheidung B.1
// aus der Tabelle vom 2026-05-24: Widget enthaelt alles, was es zum
// Rendern braucht; eq() reagiert auf Datei-Wechsel).
export function basePathForView(view) {
  const paneIdx = paneEditors.indexOf(view);
  if (paneIdx < 0) return '';
  const pane = state.panes && state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return '';
  const tab = pane.tabs && pane.tabs[pane.activeIndex];
  return tab && tab.path ? tab.path : '';
}

// 4T-0082: Factory fuer Link-Decorations. Pro Match wird eine neue
// Decoration mit URL/Wiki-Target im data-Attribut erzeugt, weil
// Decoration.mark immutable an die attributes gebunden ist.
export function liveLinkMarkDeco(href, isWikilink) {
  return Decoration.mark({
    class: isWikilink ? 'cm-live-wikilink' : 'cm-live-link',
    attributes: {
      'data-live-link-href': href,
      'data-live-link-wikilink': isWikilink ? 'true' : 'false',
    },
  });
}

// K-09 (4T-0186): Factory fuer klickbare Tag-Decorations. Haengt den
// '#tag:'-href als data-Attribut an, damit der gemeinsame Live-Klick-
// Handler (data-live-link-href) den Tag in der Sidebar filtert —
// identisches Verhalten wie der Tag-Link im Render-Pane.
export function liveTagMarkDeco(tagName) {
  return Decoration.mark({
    class: 'cm-live-tag',
    attributes: { 'data-live-link-href': '#tag:' + encodeURIComponent(tagName) },
  });
}

// 4T-0082: Factory fuer Footnote-Ref-Decorations. Hochgestelltes Display
// kommt aus dem CSS (cm-live-footnote-ref); data-Attribut traegt die id
// fuer Klick-Scroll und Hover-Tooltip.
export function liveFootnoteRefMarkDeco(id) {
  return Decoration.mark({
    class: 'cm-live-footnote-ref',
    attributes: { 'data-live-footnote-id': id },
  });
}

// 4T-0081: Code-Kontext-Erkennung. Markdown-Marker innerhalb von Code
// (Inline-Code, Fenced-Code, Code-Block) duerfen nicht als Markup
// interpretiert werden, sonst zerlegt der Live-Modus Code-Beispiele wie
// `**nicht fett**`. Zwei Varianten: nodeInsideCode prueft per Lezer-Eltern-
// kette (fuer Knoten aus syntaxTree.iterate); positionInsideCode prueft per
// resolveInner(pos) (fuer Regex-Treffer ohne Knoten-Referenz).
export const LIVE_CODE_PARENT_NAMES = new Set(['InlineCode', 'FencedCode', 'CodeBlock']);

export function nodeInsideCode(node) {
  let n = node.node.parent;
  while (n) {
    if (LIVE_CODE_PARENT_NAMES.has(n.name)) return true;
    n = n.parent;
  }
  return false;
}

export function positionInsideCode(state, pos) {
  let n = syntaxTree(state).resolveInner(pos, 1);
  while (n) {
    if (LIVE_CODE_PARENT_NAMES.has(n.name)) return true;
    n = n.parent;
  }
  return false;
}

// 4T-0476 (Epic 3E-0088): CommonMark-Destination in spitzen Klammern
// (<Mein Ziel.md>) — der Lezer-URL-Knoten umfasst die Klammern selbst.
// Klick-Pfad (file:resolveLink) und Bild-Auflösung erwarten den rohen
// Zielwert, deshalb werden umschließende Klammern hier abgestreift.
export function stripAngleDestination(url) {
  const s = String(url || '');
  return s.startsWith('<') && s.endsWith('>') ? s.slice(1, -1) : s;
}

export function activeLineSet(state) {
  const set = new Set();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let n = fromLine; n <= toLine; n++) set.add(n);
  }
  return set;
}

// 4T-0081: Highlight (`==Text==`). Identisches Pattern wie EDITOR_MARK_RE
// im markMarkerField (live-deco.js); im Live-Plugin als Regex-Pass
// parallel zur Lezer-Iteration, weil kein Standard-Lezer-Knoten existiert.
// Die existierende cm-mark-marker-Klasse aus markMarkerField bleibt fuer
// die gelbe Hinterlegung des Inhalts aktiv.
export const LIVE_HIGHLIGHT_RE = /(?<!\\)==([^=\n][^\n]*?)(?<!\\)==/g;

// 4T-0081: Tag-Erkennung. Spiegelt die Regeln aus tagsPlugin (src/shared/markdown/plugins.js)
// (`#` am Zeilenanfang oder nach Nicht-Wortzeichen, Tag-Zeichen
// [\p{L}\p{N}_/-]+, kein Slash am Rand, mindestens ein Buchstabe, kein
// Hex-Farbcode). Lookbehind sorgt dafuer, dass m.index die `#`-Position
// ist; ohne Lookbehind muesste die Vorgaenger-Char-Position rausgerechnet
// werden.
export const LIVE_TAG_RE = /(?<![\p{L}\p{N}_#])#([\p{L}\p{N}_/-]+)/gu;
export const LIVE_TAG_HEX_COLOR = /^[0-9a-f]{3,8}$/i;
export const LIVE_TAG_HAS_LETTER = /[\p{L}]/u;

// 4T-0082: Wiki-Link-Erkennung. Pattern matched `[[Inhalt]]`, Inhalt darf
// keine Klammern und keinen Zeilenumbruch enthalten. Inhalt kann
// `Datei`, `Datei#Anker`, `Datei^block-id`, `Datei|Alias`,
// `Datei#Anker|Alias` sein; Aufloesung im Klick-Handler ueber activateLink.
export const LIVE_WIKILINK_RE = /\[\[([^[\]\n]+?)\]\]/g;

// 4T-0082: Footnote-Verweis-Erkennung. Lookahead `(?!:)` schliesst
// Definitionen (`[^id]:`) aus, sodass nur die Verweis-Variante als
// hochgestellt gerendert wird. id-Pattern wie in EDITOR_FOOTNOTE_RE
// (live-deco.js).
export const LIVE_FOOTNOTE_REF_RE = /\[\^([\w-]+)\](?!:)/g;

// 4T-0197: Emoji-Shortcode-Kandidaten. Zeichenklasse deckt die Keys des
// full-Sets ab (lowercase, Ziffern, `_`, `+`, `-`). Ob ein Kandidat
// wirklich ein Shortcode ist, entscheidet der Lookup in emojiDefs —
// bei Nicht-Treffern wird ab dem schliessenden `:` weitergesucht
// (es koennte das oeffnende des naechsten Kandidaten sein), identisch
// zur Plugin-Scan-Semantik im Render-Pfad.
export const LIVE_EMOJI_RE = /:([a-z0-9_+-]+):/g;

// 4T-0197: Abbreviation-Definitionen scannen (`*[KUERZEL]: Langtext`).
// WeakMap-Cache pro Doc-Version (Muster computeCalloutScan). defLines
// traegt die Zeilen-Nummern der Definitionszeilen — dort wird kein
// Vorkommen dekoriert (die Zeile bleibt im Live-Modus sichtbar, analog
// zu Footnote-Definitionen; dokumentierte Einschraenkung).
const abbrScanCache = new WeakMap();

export function computeAbbrScan(doc) {
  const cached = abbrScanCache.get(doc);
  if (cached) return cached;
  const defs = new Map();
  const defLines = new Set();
  const ABBR_DEF_RE = /^\*\[(.+?)\]:\s*(.+?)\s*$/;
  const docLines = getDocText(doc).split('\n');
  for (let i = 0; i < docLines.length; i++) {
    const m = docLines[i].match(ABBR_DEF_RE);
    if (!m) continue;
    defs.set(m[1], m[2]);
    defLines.add(i + 1);
  }
  // K-04 (4T-0310): Vorkommen-Regex pro Kuerzel einmal pro Doc-Version
  // kompilieren (statt bei jedem Build-Durchlauf neu). matchAll klont die
  // Regex intern, ein geteiltes globales Objekt ist damit gefahrlos.
  const regexes = new Map();
  for (const abbrWord of defs.keys()) {
    const escaped = abbrWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regexes.set(abbrWord, new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu'));
  }
  const result = { defs, defLines, regexes };
  abbrScanCache.set(doc, result);
  return result;
}

// 4T-0197: Factory fuer Abbr-Vorkommen-Decorations. Langtext als data-
// Attribut fuer den Hover-Tooltip (Mechanik wie liveFootnoteHoverTooltip).
export function liveAbbrMarkDeco(title) {
  return Decoration.mark({
    class: 'cm-live-abbr',
    attributes: { 'data-live-abbr-title': title },
  });
}

// 4T-0198: Bild mit Groessen-Suffix `![alt](url =WxH)`. Lezer parst das
// Suffix nicht als Image-Bestandteil (der Image-Knoten endet nach
// `![alt]`, kein URL-Child), deshalb eigener Regex-Pass. Mindestens eine
// Ziffer Pflicht (`=100x200`, `=100x`, `=x200`); andere Suffixe bleiben
// dem Render-Pfad ueberlassen.
export const LIVE_IMG_SIZE_RE = /!\[([^[\]\n]*)\]\(([^()\n]*?)\s+=(?:\d+x\d*|\d*x\d+)\)/g;

// 4T-0201: Sub-/Sup-/Ins-Erkennung, gegen das jeweilige Plugin-Verhalten
// kalibriert (Fixture-Paare Render vs. Live):
// - Sub: Single-Tilde, KEIN Whitespace im Inhalt (markdown-it-sub-
//   Regel); Lookarounds schliessen `~~`-Strikethrough und Escapes aus.
// - Sup: Doppel-Caret (eigenes Plugin); kein Whitespace direkt innen.
// - Ins: Doppel-Plus; oeffnender Marker nur vor Buchstabe/Ziffer — das
//   spiegelt die Flanking-Regel, die `C++-Code … C++-Stil` im Render
//   NICHT matchen laesst (empirisch verifiziert); `+` im Inhalt bleibt
//   konservativ ausgeschlossen.
export const LIVE_SUB_RE = /(?<![~\\])~([^~\s]+)~(?!~)/g;
export const LIVE_SUP_RE = /(?<![\^\\])\^\^(?=[^\s^])([^^\n]*?)(?<![\s\\])\^\^(?!\^)/g;
export const LIVE_INS_RE = /(?<![+\\])\+\+(?=[\p{L}\p{N}])([^+\n]*?)(?<![\s+\\])\+\+(?!\+)/gu;

// 4T-0203: Spoiler `||Text||` (kalibriert an der scanDelims-Mechanik:
// kein Whitespace direkt innen) und Critic Markup (fuenf Formen; das
// Mapping open->close prueft der Pass, der Regex sammelt nur
// Kandidaten). Critic-Spannen werden VOR den Sub/Sup/Ins-Paessen
// gesammelt, damit `{++x++}` nicht zusaetzlich als `++x++` dekoriert
// wird (im Render-Pfad konsumiert die frueher registrierte Critic-Rule
// die Spanne ebenfalls zuerst).
export const LIVE_SPOILER_RE = /(?<![\\|])\|\|(?=[^\s|])([^|\n]*?)(?<![\s\\])\|\|(?!\|)/g;
export const LIVE_CRITIC_RE = /\{(\+\+|--|~~|==|>>)([^\n{}]*?)(\+\+|--|~~|==|<<)\}/g;
export const LIVE_CRITIC_CLOSE_FOR = { '++': '++', '--': '--', '~~': '~~', '==': '==', '>>': '<<' };

// 4T-0202: Bracketed Spans `[Text]{...}`. Marker (`[` und `]{...}`)
// werden versteckt, der Inhalt bleibt ohne Klassen-Anwendung sichtbar
// (nutzerdefinierte Klassen haben im Editor-Kontext kein CSS;
// dokumentierte Einschraenkung — die volle Wirkung zeigt das Render-
// Pane). Kein Match nach `!`/`[` (Wiki-Konstrukte) und nicht fuer
// Footnote-Referenzen (`[^...]`).
export const LIVE_SPAN_ATTRS_RE = /(?<![![\\])\[([^[\]\n^][^[\]\n]*)\]\{([^{}\n]*)\}/g;

// 4T-0202: trailing Attribut-Block an Heading-Zeilen (`# H {#id}`).
// markdown-it-attrs konsumiert den Block am Heading-Ende auch bei
// verworfenen Attributen; non-space nach `{` haelt geschweifte
// Fliesstext-Klammern (`{ so }`) heraus.
export const LIVE_HEADING_ATTRS_RE = /\{[^\s{}][^{}\n]*\}[ \t]*$/;
// 4T-0471 (Epic 3E-0087): echter (nicht escapter) Zeilenende-Marker {-}/{+}
// der Nummerierung. Wird auf inaktiven Heading-Zeilen versteckt.
export const LIVE_HEADING_MARKER_RE = /(?<!\\)\{[-+]\}[ \t]*$/;

// 4T-0198: Steht das Bild allein im Absatz? Zeilenbasierte Naeherung an
// die implicit-figures-Absatz-Definition: Zeile == Bild-Quelltext und
// beide Nachbar-Zeilen leer bzw. Doc-Grenze. Einzeiligkeit des Images ist
// durch R1-01 ohnehin Voraussetzung der Live-Ersetzung.
export function imageIsStandalone(state, line, matchText) {
  if (line.text.trim() !== matchText.trim()) return false;
  if (line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '') return false;
  if (line.number < state.doc.lines && state.doc.line(line.number + 1).text.trim() !== '')
    return false;
  return true;
}

// 4T-0199: Pre-Pass fuer Definition Lists und Pandoc Line Blocks
// (WeakMap-Cache pro Doc, Muster computeCalloutScan). Beide Konstrukte
// kennt der Lezer nicht, deshalb zeilenbasierte Erkennung; die Bloecke
// werden in buildBlockWidgetValue als MarkdownBlockWidget ersetzt.
//
// Deflist-Heuristik (markdown-it-deflist empirisch gespiegelt,
// konservativ): Def-Zeile = 0-2 Spaces + ':' oder '~' + Whitespace;
// Term-Zeile = nicht-leere Zeile ohne Block-Marker-Anfang, auf die
// direkt oder nach genau einer Leerzeile eine Def-Zeile folgt. Ueber
// Leerzeilen getrennte Term-Gruppen verschmelzen zu EINEM Block, wenn
// die naechste nicht-leere Zeile eine Def-Zeile oder ein neues
// Term/Def-Paar ist (das Plugin zieht sie in dasselbe <dl>).
//
// Line-Block-Heuristik: zusammenhaengende `| `-Zeilen (bis 3 Spaces
// Einrueckung wie der Block-Ruler); `|` ohne folgendes Leerzeichen
// gehoert nicht dazu. Lezer-Table-Kontext wird beim Einbau gefiltert.
const deflistLineBlockScanCache = new WeakMap();

const DEFLIST_DEF_RE = /^ {0,2}[:~]\s/;
const LINE_BLOCK_LIVE_RE = /^ {0,3}\| /;
// Block-Marker, die eine Zeile als Deflist-TERM disqualifizieren (die
// markdown-it-Block-Regeln konsumieren sie vor der deflist-Rule):
// Heading, Blockquote, Liste, Fence, Tabelle/Line-Block, HR.
const DEFLIST_TERM_BLOCKED_RE =
  /^ {0,3}(#{1,6}\s|>|[-*+]\s|\d{1,9}[.)]\s|```|~~~|\||(?:[-*_]\s*){3,}$)/;

export function computeDeflistLineBlockScan(doc) {
  const cached = deflistLineBlockScanCache.get(doc);
  if (cached) return cached;
  const docLines = getDocText(doc).split('\n');
  const total = docLines.length;
  const isBlank = (s) => s.trim() === '';
  const isDef = (s) => DEFLIST_DEF_RE.test(s);
  const isTerm = (s) => !isBlank(s) && !isDef(s) && !DEFLIST_TERM_BLOCKED_RE.test(s);
  // Index der zugehoerigen Def-Zeile fuer einen Term bei i, -1 wenn
  // keine folgt (eine Leerzeile zwischen Term und Def ist erlaubt).
  const defIdxFor = (i) => {
    if (i + 1 < total && isDef(docLines[i + 1])) return i + 1;
    if (i + 1 < total && isBlank(docLines[i + 1]) && i + 2 < total && isDef(docLines[i + 2]))
      return i + 2;
    return -1;
  };

  const lineBlocks = [];
  const deflists = [];
  let i = 0;
  while (i < total) {
    // Line Blocks zuerst (eindeutiges Praefix-Muster).
    if (LINE_BLOCK_LIVE_RE.test(docLines[i])) {
      const fromLine = i + 1;
      while (i < total && LINE_BLOCK_LIVE_RE.test(docLines[i])) i++;
      lineBlocks.push({ fromLine, toLine: i });
      continue;
    }
    if (isTerm(docLines[i]) && defIdxFor(i) >= 0) {
      const fromLine = i + 1;
      let end = defIdxFor(i);
      let j = end + 1;
      while (j < total) {
        if (!isBlank(docLines[j])) {
          end = j;
          j++;
          continue;
        }
        // Leerzeile: gehoert nur dazu, wenn danach eine Def-Zeile oder
        // ein neues Term/Def-Paar folgt (Plugin haengt sie ans selbe dl).
        let n = j;
        while (n < total && isBlank(docLines[n])) n++;
        if (n >= total) break;
        if (isDef(docLines[n]) || (isTerm(docLines[n]) && defIdxFor(n) >= 0)) {
          j = n;
          continue;
        }
        break;
      }
      deflists.push({ fromLine, toLine: end + 1 });
      i = end + 1;
      continue;
    }
    i++;
  }
  const result = { deflists, lineBlocks };
  deflistLineBlockScanCache.set(doc, result);
  return result;
}

// 4T-0199: liegt die Position in einem Lezer-Table-Knoten? (Guard fuer
// Line Blocks — GFM-Tabellen-Zeilen matchen ebenfalls `| `.)
export function positionInsideTable(state, pos) {
  let n = syntaxTree(state).resolveInner(pos, 1);
  while (n) {
    if (n.name === 'Table') return true;
    n = n.parent;
  }
  return false;
}

// 4T-0200: Custom-Container-Scan (WeakMap-Cache pro Doc). Erkennt Top-
// Level-Bloecke `::: name [Titel]` bis zur schliessenden Marker-Zeile
// gleicher oder groesserer Laenge; ohne Schluss-Marker laeuft der Block
// bis zum Doc-Ende (markdown-it-container-Verhalten, empirisch
// verifiziert). Innere Container (laengere Marker aussen) werden
// uebersprungen — nur Top-Level wird gestylt (dokumentierte
// Einschraenkung, analog Callout-Nesting). Marker-Einrueckung bis drei
// Spaces wie im Plugin.
const containerScanCache = new WeakMap();

const CONTAINER_LIVE_HEADER_RE = /^ {0,3}(:{3,})\s*([a-z][a-z0-9-]*)([ \t]+(.*?))?[ \t]*$/;

export function computeContainerScan(doc) {
  const cached = containerScanCache.get(doc);
  if (cached) return cached;
  const containerInfos = [];
  const docLines = getDocText(doc).split('\n');
  let i = 0;
  while (i < docLines.length) {
    const m = docLines[i].match(CONTAINER_LIVE_HEADER_RE);
    if (!m) {
      i++;
      continue;
    }
    const markerLen = m[1].length;
    let closeIdx = -1;
    for (let j = i + 1; j < docLines.length; j++) {
      const cm = docLines[j].match(/^ {0,3}(:{3,})[ \t]*$/);
      if (cm && cm[1].length >= markerLen) {
        closeIdx = j;
        break;
      }
    }
    const endIdx = closeIdx >= 0 ? closeIdx : docLines.length - 1;
    containerInfos.push({
      type: m[2],
      overrideTitle: (m[4] || '').trim(),
      isCallout: !!CALLOUT_TYPES[m[2]],
      headerLineNo: i + 1,
      endLineNo: endIdx + 1,
      hasClose: closeIdx >= 0,
    });
    i = endIdx + 1;
  }
  const result = { containerInfos };
  containerScanCache.set(doc, result);
  return result;
}

// 4T-0082: Footnote-Definition im Doc suchen. Liefert den Definitions-Text
// der ersten Zeile (alles nach `[^id]:`). Mehrzeilige Definitionen werden
// vereinfacht zur ersten Zeile gekuerzt — Tooltip soll kompakt bleiben.
export function findFootnoteDefinitionText(doc, id) {
  if (!id) return null;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^\\[\\^' + escaped + '\\]:\\s*(.+?)\\s*$', 'm');
  const m = getDocText(doc).match(re);
  return m ? m[1] : null;
}

// 4T-0082: Footnote-Definition-Range im Doc suchen. Liefert {from, to} des
// `[^id]:`-Markers (nicht des kompletten Definitions-Texts), reicht zum
// Hinscrollen.
export function findFootnoteDefinitionRange(doc, id) {
  if (!id) return null;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^\\[\\^' + escaped + '\\]:', 'm');
  const text = getDocText(doc);
  const m = text.match(re);
  if (!m) return null;
  return { from: m.index, to: m.index + m[0].length };
}

export function buildLivePreviewDecorations(view) {
  try {
    return buildLivePreviewDecorationsImpl(view);
  } catch (err) {
    console.error('[Live] buildLivePreviewDecorations crashed:', err);
    return Decoration.none;
  }
}

// R1-05 (4T-0180): Callout-Zeilen-Scan pro Doc-Version cachen. Der Scan
// (Voll-Text-Split plus Zeilen-Regexes) lief zuvor bei jeder Cursor-
// Bewegung und jedem Viewport-Scroll komplett neu, haengt aber nur vom
// Doc-Inhalt ab. CALLOUT_TYPES ist statisch.
const calloutScanCache = new WeakMap();

export function computeCalloutScan(doc) {
  const cached = calloutScanCache.get(doc);
  if (cached) return cached;
  const calloutLines = new Set();
  const calloutInfos = [];
  const docLines = getDocText(doc).split('\n');
  // R1-13 (4T-0186): Header-Muster an markdown-it angeglichen —
  // (a) `>` ohne Pflicht-Leerzeichen vor `[!type]` (CommonMark erlaubt
  //     den Blockquote-Marker ohne folgendes Space),
  // (b) Einrueckung maximal drei Spaces (ab vier Spaces parst markdown-it
  //     einen Code-Block, kein Callout; flache Listen-Callouts mit zwei
  //     bis drei Spaces bleiben abgedeckt, tiefere Listen-Ebenen verlieren
  //     nur das Live-Styling — der Render-Pfad zeigt sie weiterhin korrekt),
  // (c) Override-Titel auch ohne Leerzeichen nach `[!type][+-]`.
  // Bewusst NICHT nachgebaut: Lazy-Continuation (Body-Zeilen ohne `>`) —
  // zeilenbasiert nicht zuverlaessig erkennbar, Fehlertoleranz waere
  // schlechter als die heutige Einschraenkung (dokumentierte Rest-Differenz).
  const CALLOUT_LIVE_HEADER_RE = /^ {0,3}>[ \t]*\[!([a-z]+)\]([+-]?)[ \t]*(.*?)[ \t]*$/;
  for (let i = 0; i < docLines.length; i++) {
    const headerMatch = docLines[i].match(CALLOUT_LIVE_HEADER_RE);
    if (!headerMatch || !CALLOUT_TYPES[headerMatch[1]]) continue;
    const headerLineNo = i + 1;
    calloutLines.add(headerLineNo);
    let lastLineNo = headerLineNo;
    for (let j = i + 1; j < docLines.length; j++) {
      if (/^ {0,3}>/.test(docLines[j])) {
        calloutLines.add(j + 1);
        lastLineNo = j + 1;
      } else break;
    }
    calloutInfos.push({
      type: headerMatch[1],
      foldChar: headerMatch[2] || '',
      overrideTitle: (headerMatch[3] || '').trim(),
      headerLineNo,
      lastLineNo,
    });
  }
  const result = { calloutLines, calloutInfos };
  calloutScanCache.set(doc, result);
  return result;
}

// 4T-0471 (Epic 3E-0087): Nummern-Praefix einer Ueberschrift im Live-Modus
// (Inline-Widget vor der Zeile; Vorbild CalloutIconWidget). Reines Text-
// Widget, das keine Editor-Events schluckt.
class HeadingNumberWidget extends WidgetType {
  constructor(number) {
    super();
    this.number = number;
  }
  eq(other) {
    return other instanceof HeadingNumberWidget && other.number === this.number;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-heading-number';
    span.textContent = this.number + ' ';
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0471: Roh-Titel einer Heading-Zeile OHNE Marker-/Attribut-Strip fuer die
// Marker-Erkennung des Kerns (nur der #-Praefix wird entfernt).
function liveRawHeadingTitle(doc, lineNumber) {
  if (lineNumber < 1 || lineNumber > doc.lines) return '';
  const raw = doc.line(lineNumber).text;
  const atx = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
  if (atx) return atx[1];
  return raw.trim();
}

// 4T-0471: Nummern-Map (fromLine -> Nummer) fuer den aktuellen Zustand. Nutzt
// die volle Heading-Liste aus der foldStructure (die Zaehlung muss auch
// ausserhalb des Viewports stimmen). null, wenn die Erweiterung aus ist oder
// es keine Ueberschriften gibt.
function computeLiveHeadingNumbers(state, frontmatterEndLine) {
  if (!isExtensionActive('heading-numbering')) return null;
  const struct = state.field(foldStructureField, false);
  const all = struct && Array.isArray(struct.headings) ? struct.headings : [];
  // Pseudo-Ueberschriften im Frontmatter-Block ausschliessen: Lezer parst
  // `schluessel: wert` + `---` als Setext-Heading. Der Render-Pfad trennt die
  // Frontmatter ab; hier filtern wir sie analog aus der Zaehlung.
  const hs = all.filter((h) => h.fromLine > frontmatterEndLine);
  if (hs.length === 0) return null;
  const fmData =
    frontmatterEndLine > 0
      ? extractFrontmatter(state.doc.sliceString(0, state.doc.line(frontmatterEndLine).to)).data
      : null;
  const ctx = resolveHeadingNumberingForDoc(fmData);
  const nums = computeHeadingNumbers(
    hs.map((h) => ({ level: h.level, rawTitle: liveRawHeadingTitle(state.doc, h.fromLine) })),
    ctx,
  );
  const map = new Map();
  hs.forEach((h, i) => {
    if (nums[i] && nums[i].number) map.set(h.fromLine, nums[i].number);
  });
  return map;
}

export function buildLivePreviewDecorationsImpl(view) {
  const ranges = [];
  const state = view.state;
  const activeLines = activeLineSet(state);
  // 4T-0084: basePath des aktuellen Tabs fuer Pfad-Aufloesung in Image-,
  // Embed- und sonstigen Widget-Renderings, die ueber api.renderMarkdown
  // laufen. Pro Build einmal ermittelt; Widgets bekommen ihn im Konstruktor
  // (Entscheidung B.1).
  const basePath = basePathForView(view);
  // 4T-0081: Tags im YAML-Frontmatter werden nicht als Live-Decoration
  // gerendert, analog zum markdown-it-Pfad, der den Frontmatter-Block
  // separat verarbeitet.
  const frontmatter = detectFrontmatterLines(state.doc);
  const frontmatterEndLine = frontmatter ? frontmatter.toLine : 0;

  // 4T-0083 / 4T-0087: Pre-Pass fuer Callout-Erkennung. Lezer-Markdown
  // splittet einen Callout-Block (`> [!type]` Header + `> Body`-Zeilen)
  // gelegentlich in mehrere Blockquote-Knoten — der Test auf die erste
  // Zeile eines einzelnen Knotens reicht deshalb nicht aus. Wir scannen
  // die Doc einmal zeilenweise:
  // - calloutLines (4T-0083): Set der Zeilen-Nummern, die zu einem
  //   gueltigen Callout gehoeren. Blockquote-Branch ueberspringt diese.
  // - calloutInfos (4T-0087): Array pro Callout-Block mit Type, Fold-
  //   Char, Override-Titel, Header- und letzte Zeile. Wird vom Callout-
  //   Decoration-Pass weiter unten konsumiert.
  // Unbekannte Typen (`> [!quatsch]`) werden NICHT als Callout markiert
  // und fallen damit auf die normale Blockquote-Decoration zurueck.
  // 4T-0293: bei deaktivierter Callout-Erweiterung ist der Scan leer —
  // Callout-Bloecke werden zu normalen Blockquotes (Paritaet zum Render).
  const { calloutLines, calloutInfos } = isExtensionActive('callouts')
    ? computeCalloutScan(state.doc)
    : { calloutLines: new Set(), calloutInfos: [] };
  // 4T-0084: KaTeX-Block-Ranges nur fuer den Konflikt-Check im Inline-
  // Math-Pass. Die eigentliche Block-Decoration kommt aus dem separaten
  // liveMathBlockField (StateField), weil ViewPlugins keine block:true-
  // Decorations liefern duerfen.
  const mathBlockRanges = computeMathBlockRanges(state);
  // 4T-0479 (Epic 3E-0089): %%-Kommentar-Bereiche einmal pro Build aus dem
  // geteilten Scanner (Voll-Doc, pro Doc-Version gecacht) — der Pass unten
  // blendet sie auf inaktiven Zeilen aus.
  const commentRanges = isExtensionActive('comments') ? computeCommentRanges(state.doc) : [];
  // 4T-0471 (Epic 3E-0087): Nummern-Map der Ueberschriften (volle Liste, damit
  // die Zaehlung viewport-unabhaengig stimmt).
  const headingNumberByLine = computeLiveHeadingNumbers(state, frontmatterEndLine);

  for (const { from, to } of view.visibleRanges) {
    // === Lezer-Pass: StrongEmphasis, Emphasis, Strikethrough, InlineCode ===
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        // W-12 (4T-0309): Fehler-Isolation pro Knoten. Wirft die Verarbeitung
        // eines einzelnen Konstrukts (komplexes Kind-Walking), soll nur dieser
        // Knoten uebersprungen werden — nicht der gesamte Live-Decoration-Build
        // scheitern (sonst faellt der Live-Modus fuer das ganze Update auf
        // Roh-Quelltext zurueck).
        try {
          const name = node.name;
          if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
            if (nodeInsideCode(node)) return;
            const lineNo = state.doc.lineAt(node.from).number;
            // R1-11 (4T-0186): Frontmatter-Zeilen nicht dekorieren (Parity
            // zum markdown-it-Pfad, der den Block separat verarbeitet).
            if (lineNo <= frontmatterEndLine) return;
            if (activeLines.has(lineNo)) return;
            const styleDeco =
              name === 'StrongEmphasis'
                ? liveBoldDeco
                : name === 'Emphasis'
                  ? liveItalicDeco
                  : liveStrikeDeco;
            const markerName = name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark';
            const markers = [];
            let inner = node.node.firstChild;
            while (inner) {
              if (inner.name === markerName) markers.push({ from: inner.from, to: inner.to });
              inner = inner.nextSibling;
            }
            if (markers.length !== 2) return;
            const contentFrom = markers[0].to;
            const contentTo = markers[1].from;
            if (contentTo <= contentFrom) return;
            ranges.push(liveMarkerHiddenDeco.range(markers[0].from, markers[0].to));
            ranges.push(styleDeco.range(contentFrom, contentTo));
            ranges.push(liveMarkerHiddenDeco.range(markers[1].from, markers[1].to));
            return;
          }
          if (name === 'InlineCode') {
            if (nodeInsideCode(node)) return;
            const lineNo = state.doc.lineAt(node.from).number;
            // R1-11 (4T-0186): Frontmatter ausklammern.
            if (lineNo <= frontmatterEndLine) return;
            if (activeLines.has(lineNo)) return;
            const markers = [];
            let inner = node.node.firstChild;
            while (inner) {
              if (inner.name === 'CodeMark') markers.push({ from: inner.from, to: inner.to });
              inner = inner.nextSibling;
            }
            if (markers.length !== 2) return;
            const contentFrom = markers[0].to;
            const contentTo = markers[1].from;
            if (contentTo <= contentFrom) return;
            ranges.push(liveMarkerHiddenDeco.range(markers[0].from, markers[0].to));
            ranges.push(liveCodeDeco.range(contentFrom, contentTo));
            ranges.push(liveMarkerHiddenDeco.range(markers[1].from, markers[1].to));
            return;
          }
          if (name === 'Link') {
            // 4T-0082: Markdown-Link `[Text](url)`. Knoten-Kinder sind in
            // Reihenfolge LinkMark `[`, Label-Inhalt, LinkMark `]`,
            // LinkMark `(`, URL, ggf. LinkTitle, LinkMark `)`. Wir
            // verstecken die vier LinkMarks und den (...)-Bereich, der
            // Inhalt zwischen `[` und `]` bekommt cm-live-link-Klasse.
            if (nodeInsideCode(node)) return;
            const lineNo = state.doc.lineAt(node.from).number;
            // R1-11 (4T-0186): Frontmatter ausklammern.
            if (lineNo <= frontmatterEndLine) return;
            if (activeLines.has(lineNo)) return;
            const linkMarks = [];
            let urlFrom = -1;
            let urlTo = -1;
            let inner = node.node.firstChild;
            while (inner) {
              if (inner.name === 'LinkMark') {
                linkMarks.push({ from: inner.from, to: inner.to });
              } else if (inner.name === 'URL') {
                urlFrom = inner.from;
                urlTo = inner.to;
              }
              inner = inner.nextSibling;
            }
            if (linkMarks.length < 4 || urlFrom < 0) return;
            const contentFrom = linkMarks[0].to;
            const contentTo = linkMarks[1].from;
            if (contentTo <= contentFrom) return;
            const url = stripAngleDestination(state.doc.sliceString(urlFrom, urlTo));
            ranges.push(liveMarkerHiddenDeco.range(linkMarks[0].from, linkMarks[0].to));
            ranges.push(liveLinkMarkDeco(url, false).range(contentFrom, contentTo));
            ranges.push(liveMarkerHiddenDeco.range(linkMarks[1].from, linkMarks[1].to));
            // `(url)` als zusammenhaengender Block versteckt: von der
            // oeffnenden `(`-LinkMark bis zur schliessenden `)`-LinkMark.
            ranges.push(
              liveMarkerHiddenDeco.range(linkMarks[2].from, linkMarks[linkMarks.length - 1].to),
            );
            return;
          }
          // 4T-0083: ATX-Headings (`# ... ` bis `###### ...`). Lezer-Knoten
          // heisst ATXHeading1..ATXHeading6, Level steckt im Namen. Wir setzen
          // Decoration.line auf die Heading-Zeile (Font-Groesse via CSS) und
          // verstecken in Nicht-Cursor-Zeile den HeaderMark (`#`-Folge) plus
          // das folgende Whitespace — sonst rueckt der gerenderte Text um ein
          // Spatium ein.
          const atxMatch = name.match(/^ATXHeading([1-6])$/);
          if (atxMatch) {
            const level = parseInt(atxMatch[1], 10);
            const headingLine = state.doc.lineAt(node.from);
            if (headingLine.number <= frontmatterEndLine) return;
            ranges.push(liveHeadingLineDecos[level - 1].range(headingLine.from));
            if (activeLines.has(headingLine.number)) return;
            // 4T-0471 (Epic 3E-0087): berechnete Nummer als Inline-Widget vor
            // der Zeile (Vorbild CalloutIconWidget); nur auf inaktiven Zeilen.
            const headingNum = headingNumberByLine
              ? headingNumberByLine.get(headingLine.number)
              : null;
            if (headingNum) {
              ranges.push(
                Decoration.widget({
                  widget: new HeadingNumberWidget(headingNum),
                  side: -1,
                }).range(headingLine.from),
              );
            }
            let headerMarkEnd = -1;
            let inner = node.node.firstChild;
            while (inner) {
              if (inner.name === 'HeaderMark') {
                headerMarkEnd = inner.to;
                break;
              }
              inner = inner.nextSibling;
            }
            if (headerMarkEnd < 0) return;
            const tail = state.doc.sliceString(headerMarkEnd, headingLine.to);
            const wsMatch = tail.match(/^[ \t]+/);
            const hideTo = headerMarkEnd + (wsMatch ? wsMatch[0].length : 0);
            ranges.push(liveMarkerHiddenDeco.range(node.from, hideTo));
            // 4T-0202: trailing {#id}/{.klasse}-Attribut-Block ausblenden
            // (der Render strippt ihn aus dem Heading-Text). 4T-0293: nur
            // bei aktiver attributes-Erweiterung.
            const headingText = state.doc.sliceString(headingLine.from, headingLine.to);
            // 4T-0471 (Epic 3E-0087): echten {-}/{+}-Marker verstecken (wenn
            // die Nummerierung aktiv ist); sonst wie bisher den Attribut-Block.
            // Bei beidem gewinnt der Marker am Zeilenende (Rand-Fall {#id} {-}).
            const markerMatch = isExtensionActive('heading-numbering')
              ? headingText.match(LIVE_HEADING_MARKER_RE)
              : null;
            const attrsMatch = isExtensionActive('attributes')
              ? headingText.match(LIVE_HEADING_ATTRS_RE)
              : null;
            const hideMatch = markerMatch || attrsMatch;
            if (hideMatch) {
              ranges.push(
                liveMarkerHiddenDeco.range(headingLine.from + hideMatch.index, headingLine.to),
              );
            }
            return;
          }
          // 4T-0083: Setext-Headings (`Titel\n===` oder `Titel\n---`). Knoten
          // umfasst Titel-Zeile und Unterstreichungs-Zeile; HeaderMark-Child
          // markiert die Unterstreichung. Titel-Zeile bekommt cm-live-h1/h2,
          // Unterstreichungs-Zeile bekommt cm-live-setext-underline und wird
          // in Nicht-Cursor-Position als Marker versteckt.
          const setextMatch = name.match(/^SetextHeading([12])$/);
          if (setextMatch) {
            const level = parseInt(setextMatch[1], 10);
            const titleLine = state.doc.lineAt(node.from);
            if (titleLine.number <= frontmatterEndLine) return;
            ranges.push(liveHeadingLineDecos[level - 1].range(titleLine.from));
            // 4T-0471 (Epic 3E-0087): Nummer-Widget vor der Titel-Zeile (nur inaktiv).
            if (!activeLines.has(titleLine.number)) {
              const setextNum = headingNumberByLine
                ? headingNumberByLine.get(titleLine.number)
                : null;
              if (setextNum) {
                ranges.push(
                  Decoration.widget({
                    widget: new HeadingNumberWidget(setextNum),
                    side: -1,
                  }).range(titleLine.from),
                );
              }
            }
            let underlineFrom = -1;
            let underlineTo = -1;
            let inner = node.node.firstChild;
            while (inner) {
              if (inner.name === 'HeaderMark') {
                underlineFrom = inner.from;
                underlineTo = inner.to;
              }
              inner = inner.nextSibling;
            }
            if (underlineFrom < 0) return;
            const underlineLine = state.doc.lineAt(underlineFrom);
            ranges.push(liveSetextUnderlineLineDeco.range(underlineLine.from));
            if (!activeLines.has(underlineLine.number)) {
              ranges.push(liveMarkerHiddenDeco.range(underlineFrom, underlineTo));
            }
            // 4T-0202: trailing Attribut-Block der Titel-Zeile ausblenden
            // (4T-0293: nur bei aktiver attributes-Erweiterung).
            if (!activeLines.has(titleLine.number)) {
              const titleText = state.doc.sliceString(titleLine.from, titleLine.to);
              const markerMatch = isExtensionActive('heading-numbering')
                ? titleText.match(LIVE_HEADING_MARKER_RE)
                : null;
              const attrsMatch = isExtensionActive('attributes')
                ? titleText.match(LIVE_HEADING_ATTRS_RE)
                : null;
              const hideMatch = markerMatch || attrsMatch;
              if (hideMatch) {
                ranges.push(
                  liveMarkerHiddenDeco.range(titleLine.from + hideMatch.index, titleLine.to),
                );
              }
            }
            return;
          }
          // 4T-0083: Blockquote. Callout-Blockquotes werden ueber das im
          // Pre-Pass aufgebaute calloutLines-Set uebersprungen — der Lezer
          // splittet Callout-Blocks gelegentlich in mehrere Blockquote-
          // Knoten, ein Test nur auf die erste Knoten-Zeile reicht nicht.
          // Pro Quote-Zeile: Decoration.line cm-live-blockquote, in Nicht-
          // Cursor-Zeile per Pattern-Match auch verschachtelte `> > `-
          // Marker-Folgen verstecken. Pattern-Variante ist robuster als
          // direkte QuoteMark-Child-Iteration, weil der Lezer-AST die
          // QuoteMarks teils tief verschachtelt liefert.
          if (name === 'Blockquote') {
            if (nodeInsideCode(node)) return;
            const firstLine = state.doc.lineAt(node.from);
            if (firstLine.number <= frontmatterEndLine) return;
            if (calloutLines.has(firstLine.number)) return;
            const lastLine = state.doc.lineAt(node.to);
            for (let lineNo = firstLine.number; lineNo <= lastLine.number; lineNo++) {
              const line = state.doc.line(lineNo);
              ranges.push(liveBlockquoteLineDeco.range(line.from));
              if (activeLines.has(lineNo)) continue;
              const lineText = state.doc.sliceString(line.from, line.to);
              const quoteMatch = lineText.match(/^[ \t]*(?:>[ \t]*)+/);
              if (quoteMatch && quoteMatch[0].length > 0) {
                ranges.push(
                  liveMarkerHiddenDeco.range(line.from, line.from + quoteMatch[0].length),
                );
              }
            }
            return;
          }
          // 4T-0083: Listen-Items. BulletList und OrderedList enthalten
          // ListItem-Children. Pro ListItem wird die erste Zeile mit
          // cm-live-list-bullet bzw. cm-live-list-number versehen; Marker
          // bleibt sichtbar wie im Source-Modus (Entscheidung Punkt 4 der
          // Tabelle vom 2026-05-24). Task-Listen werden per Pattern erkannt
          // (Lezer-Markdown in der aktuellen lang-markdown-Konfiguration
          // liefert keine Task/TaskMarker-Knoten); `[ ]`/`[x]` wird per
          // Mark-Decoration ausgeblendet und per CSS-::before als Checkbox-
          // Symbol gerendert. Mousedown-Handler toggelt den Marker im Doc.
          if (name === 'ListItem') {
            if (nodeInsideCode(node)) return;
            const itemLine = state.doc.lineAt(node.from);
            if (itemLine.number <= frontmatterEndLine) return;
            const parent = node.node.parent;
            const isOrdered = parent && parent.name === 'OrderedList';
            ranges.push(
              (isOrdered ? liveListNumberLineDeco : liveListBulletLineDeco).range(itemLine.from),
            );
            const itemText = state.doc.sliceString(itemLine.from, itemLine.to);
            // 4T-0204: Pattern enthaelt zusaetzlich die aktivierten
            // Status-Zeichen (Settings-gesteuert, Regex wird bei jeder
            // Aenderung in task-states.js neu gebaut).
            const taskMatch = itemText.match(getLiveTaskMarkerRe());
            if (taskMatch) {
              const markerFrom = itemLine.from + taskMatch[1].length;
              const markerTo = markerFrom + 3;
              const markerChar = taskMatch[2][1];
              const checked = markerChar === 'x' || markerChar === 'X';
              // 4T-0293: erweiterte Status-Zeichen nur bei aktiver
              // task-states-Erweiterung als Box rendern; deaktiviert
              // bleibt `[/]` roher Text (Basis `[ ]`/`[x]` ist Kern).
              if (markerChar !== ' ' && !checked && !isExtensionActive('task-states')) return;
              if (!activeLines.has(itemLine.number)) {
                const stateDef =
                  markerChar !== ' ' && !checked ? activeTaskStateMap().get(markerChar) : null;
                ranges.push(
                  liveTaskMarkerDecoAt(
                    markerFrom,
                    checked,
                    stateDef
                      ? {
                          state: { char: markerChar, color: stateDef.color, label: stateDef.label },
                        }
                      : undefined,
                  ).range(markerFrom, markerTo),
                );
                // 4T-0498 (Epic 3E-0090): Task-Marker-Badges am Zeilenende
                // (Paritaet zum Render-Pane: gleiche Spec-Quelle, gleiche
                // Guards — Erweiterung aktiv, kein NON_TASK-Status, Global
                // Filter). Cursor auf der Zeile zeigt den Roh-Text
                // (activeLines-Guard dieser umgebenden Verzweigung).
                if (isExtensionActive('tasks')) {
                  const stateType =
                    markerChar !== ' ' && !checked ? taskStatusType(markerChar) : null;
                  const cfg = getTaskMarkersConfig();
                  const isTask =
                    stateType !== 'NON_TASK' &&
                    (cfg.globalFilter === '' || isTaskLine(itemText, cfg.globalFilter));
                  const model = isTask ? parseTaskLine(itemText) : null;
                  if (model && model.segments.length > 0) {
                    const totalLen = model.segments.reduce((n, s) => n + s.raw.length, 0);
                    const segStartOffset = itemText.length - model.trailing.length - totalLen;
                    let segFrom = itemLine.from + segStartOffset;
                    for (const seg of model.segments) {
                      const segTo = segFrom + seg.raw.length;
                      const spec = taskMarkerBadgeSpec(seg, cfg.labels);
                      // 4T-0528 (Epic 3E-0095): das ⏰-Badge ist klickbar —
                      // clickRange traegt den Doc-Bereich des Werts, der
                      // dateValuePlugin-Handler oeffnet den vorbelegten
                      // Picker (Ersetzen an Ort und Stelle).
                      let clickRange = null;
                      if (
                        seg.kind === 'reminder' &&
                        seg.value &&
                        !seg.value.invalid &&
                        isExtensionActive('reminders') &&
                        isExtensionActive('date-picker')
                      ) {
                        const vm = seg.raw.match(/(\d{4}-\d{2}-\d{2}(?:[ \t]+\d{2}:\d{2})?)$/);
                        if (vm) clickRange = { from: segTo - vm[1].length, to: segTo };
                      }
                      ranges.push(
                        Decoration.replace({
                          widget: new TaskMarkerBadgeWidget(
                            spec.cls,
                            spec.title,
                            spec.text,
                            clickRange,
                          ),
                        }).range(segFrom, segTo),
                      );
                      segFrom = segTo;
                    }
                    // Ausblende-Option: erstes Klartext-Vorkommen des
                    // Filter-Strings im Beschreibungs-Bereich verbergen
                    // (samt einem angrenzenden Leerzeichen, Semantik von
                    // stripGlobalFilter).
                    if (cfg.hideGlobalFilter && cfg.globalFilter !== '') {
                      const idx = itemText.indexOf(cfg.globalFilter);
                      if (idx >= 0 && idx + cfg.globalFilter.length <= segStartOffset) {
                        let hideFrom = idx;
                        let hideTo = idx + cfg.globalFilter.length;
                        if (itemText[hideTo] === ' ') hideTo++;
                        else if (hideFrom > 0 && itemText[hideFrom - 1] === ' ') hideFrom--;
                        ranges.push(
                          Decoration.replace({}).range(
                            itemLine.from + hideFrom,
                            itemLine.from + hideTo,
                          ),
                        );
                      }
                    }
                  } else if (model && cfg.hideGlobalFilter && cfg.globalFilter !== '') {
                    // Task-Zeile ohne Marker: die Ausblende-Option gilt
                    // trotzdem.
                    const idx = itemText.indexOf(cfg.globalFilter);
                    if (idx >= 0) {
                      let hideFrom = idx;
                      let hideTo = idx + cfg.globalFilter.length;
                      if (itemText[hideTo] === ' ') hideTo++;
                      else if (hideFrom > 0 && itemText[hideFrom - 1] === ' ') hideFrom--;
                      ranges.push(
                        Decoration.replace({}).range(
                          itemLine.from + hideFrom,
                          itemLine.from + hideTo,
                        ),
                      );
                    }
                  }
                }
              }
            }
            return;
          }
          // 4T-0084: Bilder. Lezer-Knoten Image umfasst `![alt](url)` und
          // hat URL als Kind. alt-Text extrahieren wir aus dem Roh-Text
          // zwischen `[` und `]` (Markdown-Inline-Markup im Alt wird im
          // Render-Pane sowieso plain ausgegeben). Inline-Replace ohne
          // block-Mode; bei Cursor in der Zeile entfaellt die Decoration
          // und die Quelle ist editierbar.
          if (name === 'Image') {
            if (nodeInsideCode(node)) return;
            const imgLine = state.doc.lineAt(node.from);
            if (imgLine.number <= frontmatterEndLine) return;
            if (activeLines.has(imgLine.number)) return;
            // R1-01 (4T-0174): Mehrzeilige Images (legales CommonMark, z.B.
            // Zeilenumbruch im alt-Text) NICHT inline ersetzen — ein Inline-
            // Replace ueber Zeilengrenzen laesst CM6 beim DocView-Emit
            // ausserhalb unseres try/catch werfen, bei jedem Update erneut
            // (Live-Modus dauerhaft unbenutzbar). Sie bleiben Roh-Text.
            if (state.doc.lineAt(node.to).number !== imgLine.number) return;
            let urlFrom = -1,
              urlTo = -1;
            let inner = node.node.firstChild;
            while (inner) {
              if (inner.name === 'URL') {
                urlFrom = inner.from;
                urlTo = inner.to;
                break;
              }
              inner = inner.nextSibling;
            }
            if (urlFrom < 0) return;
            const url = stripAngleDestination(state.doc.sliceString(urlFrom, urlTo));
            const fullText = state.doc.sliceString(node.from, node.to);
            const altMatch = fullText.match(/^!\[([^\]]*)\]/);
            const alt = altMatch ? altMatch[1] : '';
            // 4T-0198: allein stehende Bilder rendern im Render-Pane als
            // <figure> (implicit-figures) — das Widget zieht dann die
            // komplette Figure inkl. Caption nach.
            const standalone = imageIsStandalone(state, imgLine, fullText);
            ranges.push(
              Decoration.replace({
                widget: new ImageWidget(alt, url, basePath, { standalone }),
              }).range(node.from, node.to),
            );
            return;
          }
        } catch (err) {
          console.warn('[Live] Knoten uebersprungen:', node && node.name, err);
        }
      },
    });

    // === Regex-Pass: Highlight (==Text==) ===
    // 4T-0293: Marker nur bei aktiver Highlight-Erweiterung verstecken
    // (die gelbe Hinterlegung schaltet markMarkerField in live-deco.js).
    const text = state.doc.sliceString(from, to);
    if (isExtensionActive('highlight')) {
      for (const m of text.matchAll(LIVE_HIGHLIGHT_RE)) {
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        // R1-11 (4T-0186): Frontmatter ausklammern.
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        const innerStart = docPos + 2;
        const innerEnd = docPos + m[0].length - 2;
        if (innerEnd <= innerStart) continue;
        ranges.push(liveMarkerHiddenDeco.range(docPos, innerStart));
        ranges.push(liveMarkerHiddenDeco.range(innerEnd, docPos + m[0].length));
        // Inhalt-Highlight kommt aus markMarkerField (cm-mark-marker, gelbe
        // Hinterlegung); hier wird nur das `==`-Marker-Paar versteckt.
      }
    }

    // 4T-0487 (Epic 3E-0091): Die Dekoration klickbarer Datums-/Uhrzeit-
    // Werte liegt seit dem PO-Befund der ersten Test-Runde als Basis-
    // Extension der EditorView (dateValuePlugin in date-picker.js) und
    // wirkt damit in Quelltext- UND Live-Modus — hier kein eigener Pass.

    // === Pass: %%-Kommentare (4T-0479, Epic 3E-0089) ===
    // Auf inaktiven Zeilen wird der komplette Kommentar inklusive Marker
    // ausgeblendet; auf aktiven Zeilen bleibt die Quelle stehen und
    // commentMarkerField (live-deco.js) faerbt dezent. Segment-weise pro
    // Zeile, weil Mark-Decorations aus dem ViewPlugin keine Zeilenumbrueche
    // ersetzen duerfen — die Zeilen-Struktur mehrzeiliger Kommentare bleibt
    // als Leerzeilen sichtbar (bewusste Festlegung, Quelltext-Treue des
    // Live-Modus). Code-Schutz und Escapes stecken bereits im Scanner.
    for (const r of commentRanges) {
      const clipFrom = Math.max(r.from, from);
      const clipTo = Math.min(r.to, to);
      if (clipTo <= clipFrom) continue;
      let pos = clipFrom;
      while (pos < clipTo) {
        const line = state.doc.lineAt(pos);
        const segEnd = Math.min(line.to, clipTo);
        if (line.number > frontmatterEndLine && !activeLines.has(line.number) && segEnd > pos) {
          ranges.push(liveMarkerHiddenDeco.range(pos, segEnd));
        }
        pos = line.to + 1;
      }
    }

    // === Regex-Pass: Tag (#tag) ===
    // B-08-Paritaet (K-09/4T-0186): `#…` innerhalb einer [[…]]-Spanne ist
    // ein Wiki-Anker, kein Tag — der markdown-it-Pfad erkennt dort seit
    // B-08 ebenfalls keinen Tag. Ohne den Ausschluss wuerde die Tag-
    // Decoration (jetzt klickbar) den Wiki-Link-Klick kapern.
    const wikiSpans = [];
    for (const wm of text.matchAll(LIVE_WIKILINK_RE)) {
      wikiSpans.push([wm.index, wm.index + wm[0].length]);
    }
    const insideWikiSpan = (idx) => wikiSpans.some(([a, b]) => idx >= a && idx < b);
    // 4T-0202: '#id' in {...}-Attribut-Bloecken ist kein Tag (Paritaet
    // zum insideAttrBlock-Guard im tagsPlugin und zum Index-Scan).
    const attrSpans = [];
    for (const am of text.matchAll(/\{[^{}\n]*\}/g)) {
      attrSpans.push([am.index, am.index + am[0].length]);
    }
    const insideAttrSpan = (idx) => attrSpans.some(([a, b]) => idx >= a && idx < b);
    if (isExtensionActive('tags')) {
      for (const m of text.matchAll(LIVE_TAG_RE)) {
        const tagText = m[1];
        if (tagText.startsWith('/') || tagText.endsWith('/')) continue;
        if (!LIVE_TAG_HAS_LETTER.test(tagText)) continue;
        if (LIVE_TAG_HEX_COLOR.test(tagText)) continue;
        if (insideWikiSpan(m.index)) continue;
        if (insideAttrSpan(m.index)) continue;
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        if (activeLines.has(lineNo)) continue;
        if (lineNo <= frontmatterEndLine) continue;
        const tagEnd = docPos + 1 + tagText.length;
        // K-09 (4T-0186): Tags im Live-Modus klickbar wie im Render-Pane —
        // das data-Attribut bedient den bestehenden Klick-Handler, der
        // '#tag:'-hrefs an die Tag-Sidebar weiterreicht.
        ranges.push(liveTagMarkDeco(tagText).range(docPos, tagEnd));
      }
    }

    // === Regex-Pass: Wiki-Link ([[Datei]] / [[Datei#Anker]] / [[Datei|Alias]]) ===
    if (isExtensionActive('wiki-links'))
      for (const m of text.matchAll(LIVE_WIKILINK_RE)) {
        const docPos = from + m.index;
        // 4T-0084: `![[…]]` ist ein Wiki-Embed und wird vom Embed-Pass
        // unten behandelt — hier ueberspringen, sonst kollidieren die
        // beiden Replace-Decorations.
        if (docPos > 0 && state.doc.sliceString(docPos - 1, docPos) === '!') continue;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        // R1-11 (4T-0186): Frontmatter ausklammern.
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        const inner = m[1];
        const pipeIdx = inner.indexOf('|');
        const targetRaw = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner)
          .replace(/\\$/, '')
          .trim();
        if (!targetRaw) continue;
        // 4T-0082: href so konstruieren wie wikiLinksPlugin im shared-
        // Plugin (Pfad und Anker trennen, .md anhaengen wenn keine Endung).
        // K-02 (4T-0186): Anker wie dort normalisieren — Block-Anker
        // '^id' wird zu '#id' (nur bei gueltiger ID), Heading-Anker zum
        // githubLikeSlug; vorher stand der rohe Text im href und
        // Heading-Sprünge liefen ins Leere.
        const hashIdx = targetRaw.indexOf('#');
        const pathPart = hashIdx >= 0 ? targetRaw.slice(0, hashIdx) : targetRaw;
        const anchorRaw = hashIdx >= 0 ? targetRaw.slice(hashIdx + 1).trim() : '';
        let anchorPart = '';
        if (anchorRaw) {
          if (anchorRaw.startsWith('^')) {
            const id = anchorRaw.slice(1).trim();
            if (/^[\p{L}\p{N}_-]+$/u.test(id)) anchorPart = '#' + id;
          } else {
            const slug = githubLikeSlug(anchorRaw);
            if (slug) anchorPart = '#' + slug;
          }
        }
        let href;
        if (pathPart === '..' || pathPart === '../') {
          // 4T-0336 (Epic 3E-0061): Eltern-Link — Konstruktion wie im
          // wikiLinksPlugin (kein '.md', Klick-Pfad expandiert).
          href = '..' + anchorPart;
        } else if (pathPart) {
          const hasExtension = /\.[a-z0-9]{1,8}$/i.test(pathPart);
          href = (hasExtension ? pathPart : pathPart + '.md') + anchorPart;
        } else if (anchorPart) {
          href = anchorPart;
        } else {
          continue;
        }
        const fullStart = docPos;
        const fullEnd = docPos + m[0].length;
        const innerStart = docPos + 2; // nach `[[`
        const innerEnd = fullEnd - 2; // vor `]]`
        // Bei Alias: `[[` + `Datei|` verstecken, nur `Alias` sichtbar.
        // Ohne Alias: `[[` versteckt, Inhalt komplett sichtbar.
        const textStart = pipeIdx >= 0 ? innerStart + pipeIdx + 1 : innerStart;
        const textEnd = innerEnd;
        if (textEnd <= textStart) continue;
        ranges.push(liveMarkerHiddenDeco.range(fullStart, textStart));
        ranges.push(liveLinkMarkDeco(href, true).range(textStart, textEnd));
        ranges.push(liveMarkerHiddenDeco.range(textEnd, fullEnd));
      }

    // === 4T-0083: Regex-Pass HR (---, ***, ___) ===
    // Pattern-basiert statt Lezer-AST, weil HorizontalRule-Knoten in der
    // aktuellen lang-markdown-Konfiguration nicht zuverlaessig geliefert
    // wird. Pro Zeile pruefen, ob die Zeile ausschliesslich aus drei oder
    // mehr gleichen Markern (-/*/_) plus optionalem Whitespace besteht.
    // Frontmatter und Code-Kontext werden ausgeklammert.
    {
      const fromLine = state.doc.lineAt(from).number;
      const toLine = state.doc.lineAt(to).number;
      for (let lineNo = fromLine; lineNo <= toLine; lineNo++) {
        if (lineNo <= frontmatterEndLine) continue;
        const line = state.doc.line(lineNo);
        const lineText = state.doc.sliceString(line.from, line.to);
        if (!LIVE_HR_LINE_RE.test(lineText)) continue;
        if (positionInsideCode(state, line.from)) continue;
        ranges.push(liveHrLineDeco.range(line.from));
        if (!activeLines.has(lineNo)) {
          ranges.push(liveMarkerHiddenDeco.range(line.from, line.to));
        }
      }
    }

    // === 4T-0087: Callout-Decoration-Pass ===
    // Pro Callout-Info aus dem Pre-Pass: Line-Decorations auf alle Block-
    // Zeilen, Hide-Range fuer den Header-Marker `> [!type][+-]?`, Hide-
    // Range fuer `> ` pro Body-Zeile (cursor-bewusst), Inline-Widget mit
    // dem Typ-Icon, optional Inline-Widget mit dem lokalisierten Default-
    // Titel. Viewport-Filter, damit Callouts ausserhalb des sichtbaren
    // Bereichs keine Decorations erzeugen.
    {
      const vpFromLine = state.doc.lineAt(from).number;
      const vpToLine = state.doc.lineAt(to).number;
      const language = getLanguage();
      for (const info of calloutInfos) {
        if (info.lastLineNo < vpFromLine || info.headerLineNo > vpToLine) continue;
        const headerLine = state.doc.line(info.headerLineNo);
        for (let lineNo = info.headerLineNo; lineNo <= info.lastLineNo; lineNo++) {
          const line = state.doc.line(lineNo);
          ranges.push(liveCalloutLineDeco(info.type).range(line.from));
        }
        ranges.push(liveCalloutHeaderLineDeco.range(headerLine.from));
        // Marker-Range in der Header-Zeile: optionale Einrueckung +
        // `> [!type][+-]?` plus folgendes Whitespace bis zum
        // (optionalen) Override-Titel.
        const headerText = state.doc.sliceString(headerLine.from, headerLine.to);
        // R1-13 (4T-0186): Muster synchron zur Pre-Pass-Erkennung halten.
        const markerMatch = headerText.match(/^( {0,3}>[ \t]*\[!([a-z]+)\][+-]?)([ \t]*)/);
        if (!markerMatch) continue;
        const markerEnd = headerLine.from + markerMatch[1].length;
        const markerEndWithWs = markerEnd + markerMatch[3].length;
        const headerActive = activeLines.has(info.headerLineNo);
        // Icon-Widget vor dem Header-Anfang (Box-Border ist links, Icon
        // rueckt direkt dahinter ein). Immer sichtbar — auch in Cursor-
        // Zeile, weil die Quelle im Cursor-Zustand zusaetzlich sichtbar
        // wird, das Icon stoert dabei nicht.
        ranges.push(
          Decoration.widget({
            widget: new CalloutIconWidget(info.type),
            side: -1,
          }).range(headerLine.from),
        );
        if (!headerActive) {
          ranges.push(liveMarkerHiddenDeco.range(headerLine.from, markerEndWithWs));
          if (!info.overrideTitle) {
            ranges.push(
              Decoration.widget({
                widget: new CalloutDefaultTitleWidget(info.type, language),
                side: 1,
              }).range(markerEndWithWs),
            );
          }
        }
        // Body-Zeilen: `> ` (auch verschachtelt `> > `) pro Zeile
        // verstecken, in Cursor-Zeile sichtbar lassen.
        for (let lineNo = info.headerLineNo + 1; lineNo <= info.lastLineNo; lineNo++) {
          if (activeLines.has(lineNo)) continue;
          const line = state.doc.line(lineNo);
          const lineText = state.doc.sliceString(line.from, line.to);
          const quoteMatch = lineText.match(/^[ \t]*(?:>[ \t]*)+/);
          if (quoteMatch && quoteMatch[0].length > 0) {
            ranges.push(liveMarkerHiddenDeco.range(line.from, line.from + quoteMatch[0].length));
          }
        }
      }
    }

    // === 4T-0200: Custom-Container-Decoration-Pass ===
    // Bekannte Callout-Typen nutzen die 4T-0087-Bausteine (Line-Decos,
    // Icon- und Default-Titel-Widget) unveraendert; unbekannte Namen
    // bekommen die neutrale cm-live-container-Line-Deco. Marker-Zeilen
    // werden in Nicht-Cursor-Zeilen versteckt; bei Containern ohne
    // Override-Titel die komplette Header-Zeile (der Render verwirft
    // einen Titel-Rest bei unbekannten Namen ebenfalls).
    if (isExtensionActive('custom-containers')) {
      const vpFromLine = state.doc.lineAt(from).number;
      const vpToLine = state.doc.lineAt(to).number;
      const language = getLanguage();
      const { containerInfos } = computeContainerScan(state.doc);
      for (const info of containerInfos) {
        if (info.endLineNo < vpFromLine || info.headerLineNo > vpToLine) continue;
        if (info.headerLineNo <= frontmatterEndLine) continue;
        const headerLine = state.doc.line(info.headerLineNo);
        if (positionInsideCode(state, headerLine.from)) continue;
        for (let lineNo = info.headerLineNo; lineNo <= info.endLineNo; lineNo++) {
          const line = state.doc.line(lineNo);
          ranges.push(
            (info.isCallout ? liveCalloutLineDeco(info.type) : liveContainerLineDeco).range(
              line.from,
            ),
          );
        }
        if (info.isCallout) {
          ranges.push(liveCalloutHeaderLineDeco.range(headerLine.from));
          ranges.push(
            Decoration.widget({
              widget: new CalloutIconWidget(info.type),
              side: -1,
            }).range(headerLine.from),
          );
        }
        if (!activeLines.has(info.headerLineNo)) {
          if (info.isCallout && info.overrideTitle) {
            // Nur `::: name ` verstecken, Override-Titel bleibt sichtbar.
            const headerText = state.doc.sliceString(headerLine.from, headerLine.to);
            const hm = headerText.match(/^ {0,3}:{3,}\s*[a-z][a-z0-9-]*[ \t]*/);
            if (hm) {
              ranges.push(
                liveMarkerHiddenDeco.range(headerLine.from, headerLine.from + hm[0].length),
              );
            }
          } else {
            ranges.push(liveMarkerHiddenDeco.range(headerLine.from, headerLine.to));
            if (info.isCallout) {
              ranges.push(
                Decoration.widget({
                  widget: new CalloutDefaultTitleWidget(info.type, language),
                  side: 1,
                }).range(headerLine.to),
              );
            }
          }
        }
        if (
          info.hasClose &&
          info.endLineNo !== info.headerLineNo &&
          !activeLines.has(info.endLineNo)
        ) {
          const endLine = state.doc.line(info.endLineNo);
          ranges.push(liveMarkerHiddenDeco.range(endLine.from, endLine.to));
        }
      }
    }

    // === 4T-0084: Regex-Pass Inline-Math ($x$) ===
    // Wird vor dem Footnote-Pass platziert, weil Math-Inhalt potenziell
    // `[^id]`-aehnliche Sequenzen enthalten koennte; mit Inline-Math als
    // Replace-Decoration ist der Bereich danach nicht mehr fuer den
    // Footnote-Pass aktiv (Decoration.replace nimmt den Range raus).
    if (isExtensionActive('katex')) {
      for (const m of text.matchAll(LIVE_MATH_INLINE_RE)) {
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        if (activeLines.has(lineNo)) continue;
        if (lineNo <= frontmatterEndLine) continue;
        const fullEnd = docPos + m[0].length;
        // Innerhalb eines KaTeX-Blocks? Skip — Block-Pass laeuft separat.
        let insideBlock = false;
        for (const block of mathBlockRanges) {
          if (docPos >= block.from && fullEnd <= block.to) {
            insideBlock = true;
            break;
          }
        }
        if (insideBlock) continue;
        ranges.push(
          Decoration.replace({
            widget: new MathInlineWidget(m[0], basePath),
          }).range(docPos, fullEnd),
        );
      }
    }

    // === 4T-0084: Regex-Pass Wiki-Embeds (![[…]]) ===
    if (isExtensionActive('wiki-embeds')) {
      for (const m of text.matchAll(LIVE_WIKI_EMBED_RE)) {
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        if (activeLines.has(lineNo)) continue;
        if (lineNo <= frontmatterEndLine) continue;
        const fullEnd = docPos + m[0].length;
        ranges.push(
          Decoration.replace({
            widget: new WikiEmbedWidget(m[0], basePath),
          }).range(docPos, fullEnd),
        );
      }
    }

    // === Regex-Pass: Footnote-Verweis ([^id]) ===
    if (isExtensionActive('footnotes')) {
      for (const m of text.matchAll(LIVE_FOOTNOTE_REF_RE)) {
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        // R1-11 (4T-0186): Frontmatter ausklammern.
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        const id = m[1];
        const fullEnd = docPos + m[0].length;
        const idStart = docPos + 2; // nach `[^`
        const idEnd = fullEnd - 1; // vor `]`
        if (idEnd <= idStart) continue;
        ranges.push(liveMarkerHiddenDeco.range(docPos, idStart));
        ranges.push(liveFootnoteRefMarkDeco(id).range(idStart, idEnd));
        ranges.push(liveMarkerHiddenDeco.range(idEnd, fullEnd));
      }
    }

    // === 4T-0197: Regex-Pass Emoji-Shortcodes (:smile:) ===
    // exec-Loop statt matchAll, weil bei Nicht-Shortcode-Kandidaten der
    // lastIndex auf das schliessende `:` zurueckgesetzt werden muss —
    // sonst verschluckt z.B. `a:x:smile:` den Start von `:smile:`.
    if (isExtensionActive('emoji')) {
      LIVE_EMOJI_RE.lastIndex = 0;
      let m;
      while ((m = LIVE_EMOJI_RE.exec(text)) !== null) {
        const char = emojiDefs[m[1]];
        if (!char) {
          LIVE_EMOJI_RE.lastIndex = m.index + m[0].length - 1;
          continue;
        }
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        ranges.push(
          Decoration.replace({
            widget: new EmojiWidget(char),
          }).range(docPos, docPos + m[0].length),
        );
      }
    }

    // === 4T-0546 (Epic 3E-0097): Regex-Pass Kalender-Werte (@{Name: Wert}) ===
    // Inline-Replace durch die Badge-Darstellung (Spec-Quelle wie der
    // Render-Pane); der Klick-Bereich spricht den mousedown-Handler des
    // calendarValuePlugin an (calendar-picker.js). Cursor auf der Zeile
    // zeigt den Roh-Text (activeLines-Guard).
    if (isExtensionActive('custom-calendars')) {
      for (const v of findCalendarValues(text)) {
        const docPos = from + v.from;
        if (positionInsideCode(state, docPos)) continue;
        const line = state.doc.lineAt(docPos);
        if (line.number <= frontmatterEndLine) continue;
        if (activeLines.has(line.number)) continue;
        if (docPos + v.raw.length > line.to) continue;
        const spec = calendarValueBadgeSpec(v.name, v.value, getAreaCalendarConfig(), t);
        ranges.push(
          Decoration.replace({
            widget: new CalendarValueBadgeWidget(spec.cls, spec.title, spec.text, {
              from: docPos,
              to: docPos + v.raw.length,
            }),
          }).range(docPos, docPos + v.raw.length),
        );
      }
    }

    // === 4T-0596 (Epic 3E-0111): Regex-Pass Inline-Berechnungen ({= … =}) ===
    // Inline-Replace durch das Ergebnis-Widget (Spec-Quelle wie der Render-
    // Pane, Fehler als ⚠︎ mit lokalisiertem Tooltip). Cursor auf der Zeile
    // zeigt den Roh-Ausdruck (activeLines-Guard); ein Klick aufs Widget setzt
    // den Cursor ins Konstrukt (Widget-eigener Handler).
    if (isExtensionActive('inline-calc')) {
      for (const s of findInlineCalcSpans(text)) {
        const docPos = from + s.from;
        if (positionInsideCode(state, docPos)) continue;
        const line = state.doc.lineAt(docPos);
        if (line.number <= frontmatterEndLine) continue;
        if (activeLines.has(line.number)) continue;
        if (docPos + (s.to - s.from) > line.to) continue;
        const spec = inlineCalcSpec(s.expr);
        const cls = spec.ok ? 'cm-inline-calc' : 'cm-inline-calc cm-inline-calc-error';
        const title = spec.ok ? spec.title : t('inlineCalc.error.' + spec.errorCode);
        ranges.push(
          Decoration.replace({
            widget: new InlineCalcWidget(cls, title, spec.text),
          }).range(docPos, docPos + (s.to - s.from)),
        );
      }
    }

    // === 4T-0197: Regex-Pass Abbreviation-Vorkommen ===
    // Pro definiertem Kuerzel werden Wort-Vorkommen im sichtbaren Bereich
    // mit dotted-underline-Mark plus Tooltip-Attribut versehen. Wort-
    // Grenzen Unicode-bewusst (markdown-it-abbr ersetzt nur ganze
    // Woerter). Definitionszeilen selbst bleiben roh sichtbar.
    if (isExtensionActive('abbreviations')) {
      const {
        defs: abbrDefs,
        defLines: abbrDefLines,
        regexes: abbrRegexes,
      } = computeAbbrScan(state.doc);
      for (const [abbrWord, longText] of abbrDefs) {
        const re = abbrRegexes.get(abbrWord);
        for (const m of text.matchAll(re)) {
          const docPos = from + m.index;
          const lineNo = state.doc.lineAt(docPos).number;
          if (abbrDefLines.has(lineNo)) continue;
          if (lineNo <= frontmatterEndLine) continue;
          if (activeLines.has(lineNo)) continue;
          if (positionInsideCode(state, docPos)) continue;
          ranges.push(liveAbbrMarkDeco(longText).range(docPos, docPos + m[0].length));
        }
      }
    }

    // === 4T-0198: Regex-Pass Image-Size (![alt](url =WxH)) ===
    // Der Lezer-Image-Branch oben greift hier nicht (kein URL-Child im
    // abgebrochenen Image-Knoten) — kein Doppel-Replace moeglich.
    // 4T-0293: gehoert zur figures-Erweiterung; deaktiviert bleibt das
    // Groessen-Suffix Roh-Text (Paritaet: der Render zeigt es dann auch roh).
    if (isExtensionActive('figures')) {
      for (const m of text.matchAll(LIVE_IMG_SIZE_RE)) {
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const line = state.doc.lineAt(docPos);
        if (line.number <= frontmatterEndLine) continue;
        if (activeLines.has(line.number)) continue;
        const standalone = imageIsStandalone(state, line, m[0]);
        ranges.push(
          Decoration.replace({
            widget: new ImageWidget(m[1], m[2], basePath, { sourceText: m[0], standalone }),
          }).range(docPos, docPos + m[0].length),
        );
      }
    }

    // === 4T-0203: Regex-Pass Critic Markup ===
    // Laeuft VOR den Sub/Sup/Ins-Paessen und sammelt seine Spannen —
    // `{++x++}` darf dort nicht erneut als `++x++` matchen (im Render-
    // Pfad konsumiert die frueher registrierte Critic-Rule zuerst).
    // 4T-0293: bei deaktivierter Critic-Erweiterung bleibt criticSpans
    // leer — die Typografie-Paesse duerfen dann in `{++x++}` matchen
    // (Paritaet: ohne Critic-Rule konsumiert auch der Render die Spanne
    // nicht zuerst).
    const criticSpans = [];
    if (isExtensionActive('critic-markup')) {
      const decoFor = {
        '++': liveCriticInsDeco,
        '--': liveCriticDelDeco,
        '==': liveCriticMarkDeco,
        '>>': liveCriticCommentDeco,
      };
      for (const m of text.matchAll(LIVE_CRITIC_RE)) {
        if (LIVE_CRITIC_CLOSE_FOR[m[1]] !== m[3]) continue;
        if (m[1] === '~~' && m[2].indexOf('~>') < 0) continue;
        criticSpans.push([m.index, m.index + m[0].length]);
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        const fullEnd = docPos + m[0].length;
        const innerStart = docPos + 3; // nach `{++`
        const innerEnd = fullEnd - 3; // vor `++}`
        if (innerEnd <= innerStart) continue;
        ranges.push(liveMarkerHiddenDeco.range(docPos, innerStart));
        if (m[1] === '~~') {
          // Substitution: alt als del, `~>` versteckt, neu als ins.
          const sepIdx = m[2].indexOf('~>');
          const sepStart = innerStart + sepIdx;
          if (sepIdx > 0) ranges.push(liveCriticDelDeco.range(innerStart, sepStart));
          ranges.push(liveMarkerHiddenDeco.range(sepStart, sepStart + 2));
          if (sepStart + 2 < innerEnd) ranges.push(liveCriticInsDeco.range(sepStart + 2, innerEnd));
        } else {
          ranges.push(decoFor[m[1]].range(innerStart, innerEnd));
        }
        ranges.push(liveMarkerHiddenDeco.range(innerEnd, fullEnd));
      }
    }
    const insideCriticSpan = (idx) => criticSpans.some(([a, b]) => idx >= a && idx < b);

    // === 4T-0201: Regex-Paesse Sub (~x~), Sup (^^x^^), Ins (++x++) ===
    // Muster = Highlight-Pass: Marker-Paar in Nicht-Cursor-Zeilen
    // verstecken, Inhalt mit Style-Mark versehen. Der Sub-Pass laeuft
    // nach dem Lezer-Strikethrough-Pass; die Lookarounds schliessen
    // `~~`-Bereiche aus.
    if (isExtensionActive('typography')) {
      const passes = [
        { re: LIVE_SUB_RE, markerLen: 1, deco: liveSubDeco },
        { re: LIVE_SUP_RE, markerLen: 2, deco: liveSupDeco },
        { re: LIVE_INS_RE, markerLen: 2, deco: liveInsDeco },
      ];
      for (const pass of passes) {
        for (const m of text.matchAll(pass.re)) {
          if (insideCriticSpan(m.index)) continue;
          const docPos = from + m.index;
          if (positionInsideCode(state, docPos)) continue;
          const lineNo = state.doc.lineAt(docPos).number;
          if (lineNo <= frontmatterEndLine) continue;
          if (activeLines.has(lineNo)) continue;
          const fullEnd = docPos + m[0].length;
          const innerStart = docPos + pass.markerLen;
          const innerEnd = fullEnd - pass.markerLen;
          if (innerEnd <= innerStart) continue;
          ranges.push(liveMarkerHiddenDeco.range(docPos, innerStart));
          ranges.push(pass.deco.range(innerStart, innerEnd));
          ranges.push(liveMarkerHiddenDeco.range(innerEnd, fullEnd));
        }
      }
    }

    // === 4T-0203: Regex-Pass Spoiler (||Text||) ===
    // Zeilen in Lezer-Table-Knoten ueberspringen — dort gewinnt die
    // Zellen-Trennung (Verhalten konsistent zum Render-Pfad, wo der
    // Block-Tabellen-Parser die Zeile vor den Inline-Rules zerschneidet).
    if (isExtensionActive('spoiler')) {
      for (const m of text.matchAll(LIVE_SPOILER_RE)) {
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        if (positionInsideTable(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        const fullEnd = docPos + m[0].length;
        const innerStart = docPos + 2;
        const innerEnd = fullEnd - 2;
        if (innerEnd <= innerStart) continue;
        ranges.push(liveMarkerHiddenDeco.range(docPos, innerStart));
        ranges.push(liveSpoilerDeco.range(innerStart, innerEnd));
        ranges.push(liveMarkerHiddenDeco.range(innerEnd, fullEnd));
      }
    }

    // === 4T-0202: Regex-Pass Bracketed Spans ([Text]{...}) ===
    // `[` und `]{...}` verstecken, Inhalt sichtbar lassen. Lezer-Link-
    // Guard: liegt der Treffer in einem Link-/Image-Knoten (z.B. eine
    // definierte Shortcut-Referenz `[ref]` mit folgendem Block), bleibt
    // die Quelle sichtbar — der Link-Pfad gehoert dem Lezer-Pass.
    if (isExtensionActive('attributes')) {
      for (const m of text.matchAll(LIVE_SPAN_ATTRS_RE)) {
        const docPos = from + m.index;
        if (positionInsideCode(state, docPos)) continue;
        const lineNo = state.doc.lineAt(docPos).number;
        if (lineNo <= frontmatterEndLine) continue;
        if (activeLines.has(lineNo)) continue;
        let insideLink = false;
        for (let n = syntaxTree(state).resolveInner(docPos + 1, 1); n; n = n.parent) {
          if (n.name === 'Link' || n.name === 'Image') {
            insideLink = true;
            break;
          }
        }
        if (insideLink) continue;
        const fullEnd = docPos + m[0].length;
        const contentStart = docPos + 1;
        const contentEnd = contentStart + m[1].length;
        ranges.push(liveMarkerHiddenDeco.range(docPos, contentStart));
        ranges.push(liveMarkerHiddenDeco.range(contentEnd, fullEnd));
      }
    }
  }
  // KaTeX-Block-Decorations werden separat ueber liveMathBlockField
  // bereitgestellt. CodeMirror 6 verbietet im ViewPlugin sowohl
  // block:true-Decorations als auch jeden Replace, dessen Range einen
  // Zeilenumbruch ueberspannt ("Decorations that replace line breaks may
  // not be specified via plugins"). Beides geht nur ueber StateField.
  return Decoration.set(ranges, true);
}

// 4T-0087: StateEffect, der einen Plugin-Re-Compute erzwingt — wird vom
// Sprach-Refresh-Hook nach Sprach-Wechsel dispatched, damit Callout-
// Default-Titel-Widgets neu gebaut werden (eq()-Mismatch zwischen alter
// und neuer Sprache).
export const liveRebuildEffect = StateEffect.define();

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildLivePreviewDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildLivePreviewDecorations(update.view);
        return;
      }
      // R1-02 (4T-0174): Lezer parst grosse Dateien asynchron nach; der
      // fertige Baum kommt OHNE docChanged/selection an. Tree-Identitaets-
      // vergleich wie beim foldStructureField, sonst fehlen Dekorationen
      // in spaeten Dokument-Teilen bis zur naechsten Eingabe.
      if (syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = buildLivePreviewDecorations(update.view);
        return;
      }
      // 4T-0087: Explizite Re-Build-Trigger (z.B. nach Sprach-Wechsel).
      for (const tr of update.transactions) {
        for (const e of tr.effects) {
          if (e.is(liveRebuildEffect)) {
            this.decorations = buildLivePreviewDecorations(update.view);
            return;
          }
        }
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// 4T-0084 / 4T-0088: StateField fuer Block-Widget-Decorations im Live-
// Modus. ViewPlugins duerfen keine Replace-Decorations liefern, deren
// Range einen Zeilenumbruch ueberspannt (CM6-Einschraenkung). Wir nutzen
// Inline-Replace OHNE block:true — block:true hat in der 4T-0084-Spike-
// Version die vertikale Cursor-Navigation zerschossen (Pfeil oben/unten
// sprang 20-30 Zeilen weg). Multi-line Inline-Replace zieht den Quell-
// Range visuell zu einer Zeile zusammen, in der das Widget sitzt; CSS
// macht es als Block-Layout sichtbar.
//
// 4T-0088: Field umbenannt von liveMathBlockField; deckt seitdem auch
// Tabellen und Fenced-Code-Bloecke ab. basePath wird via liveBasePathFacet
// aus dem State gelesen (Compartment-Reconfigure bei Tab-Wechsel).

// 4T-0088: Facet fuer den basePath des aktiven Tabs einer Pane. Block-
// Widgets (StateField) brauchen den Pfad fuer relative Image-/Embed-
// Aufloesung in Tabellen, koennen aber keine View-Referenz lesen.
// Pro Pane-View wird das Facet ueber editorCompartments.basePath
// initialisiert und bei Tab-Wechsel via Compartment-Reconfigure
// aktualisiert. combine nimmt den ersten Wert (es gibt genau einen
// pro State).
export const liveBasePathFacet = Facet.define({
  combine: (values) => (values.length ? values[0] : ''),
});

// 4T-0088: Widget-Render-Cache (Map mit Insertion-Order, aelteste raus
// bei Ueberlauf). Schluessel-Format `<type>:<hash>` bzw. `fence:<lang>:
// <hash>` verhindert Typ-Kollisionen. mermaidHash (FNV-1a 32-bit, in
// render-mermaid.js) wird als generischer String-Hash wiederverwendet.
export const LIVE_BLOCK_CACHE_MAX_SIZE = 200;
export const liveBlockRenderCache = new Map();
export function liveBlockCacheGet(key) {
  return liveBlockRenderCache.get(key) || null;
}
export function liveBlockCacheSet(key, dom) {
  if (liveBlockRenderCache.size >= LIVE_BLOCK_CACHE_MAX_SIZE) {
    const oldest = liveBlockRenderCache.keys().next().value;
    if (oldest !== undefined) liveBlockRenderCache.delete(oldest);
  }
  liveBlockRenderCache.set(key, dom);
}

// 4T-0293: beim Erweiterungs-Umschalten sind gecachte Block-Renderings
// ungueltig (sie entstanden mit dem alten Plugin-Satz der Pipeline) —
// der Umschalt-Pfad in app-init.js leert den Cache vor dem Neuaufbau.
export function clearLiveBlockRenderCache() {
  liveBlockRenderCache.clear();
}

// R1-05 (4T-0180): Signatur der blockrelevanten Aktiv-Zeilen. Nur aktive
// Zeilen, die in einem Widget-Kandidaten-Block liegen, beeinflussen das
// Decoration-Ergebnis — eine Cursor-Bewegung ausserhalb aller Bloecke
// (haeufigster Fall) liefert dieselbe Signatur und kann den teuren
// Rebuild (Tree-Walk + Widget-Konstruktion) ueberspringen.
export function blockActiveSignature(activeLines, spans) {
  if (!spans || spans.length === 0) return '';
  const parts = [];
  for (const l of activeLines) {
    for (const s of spans) {
      if (l >= s.fromLine && l <= s.toLine) {
        parts.push(l);
        break;
      }
    }
  }
  return parts.sort((a, b) => a - b).join(',');
}

// 4T-0283: unberuehrte Initial-Selektion (leerer Cursor auf Position 0).
// Fliesst in die Aktiv-Signatur ein, weil das Frontmatter-Widget in
// diesem Zustand trotz aktiver Zeile 1 maskiert bleibt — der Uebergang
// Position 0 <-> 1 aendert die Zeilen-Menge nicht, muss aber rebuilden.
export function isInitialCursorOnly(state) {
  const main = state.selection.main;
  return state.selection.ranges.length === 1 && main.empty && main.from === 0;
}

export function blockWidgetSignature(state, spans) {
  return (
    blockActiveSignature(activeLineSet(state), spans) + (isInitialCursorOnly(state) ? '|fm0' : '')
  );
}

export function buildBlockWidgetValue(state) {
  const ranges = [];
  // spans: Zeilen-Bereiche ALLER Kandidaten-Bloecke (vor dem Aktiv-Skip),
  // Grundlage fuer die Selektions-Signatur im Field-Update.
  const spans = [];
  const activeLines = activeLineSet(state);
  const basePath = state.facet(liveBasePathFacet);
  // 4T-0479 (Epic 3E-0089): Bloecke, die einen %%-Kommentar schneiden,
  // werden NICHT durch Widgets ersetzt (eine kommentierte Tabelle darf im
  // Live-Modus nicht gerendert erscheinen; der Quelltext bleibt stehen und
  // der Kommentar-Pass blendet ihn auf inaktiven Zeilen aus).
  const commentRanges = isExtensionActive('comments') ? computeCommentRanges(state.doc) : [];
  const intersectsComment = (fromPos, toPos) =>
    commentRanges.some((r) => r.from < toPos && r.to > fromPos);
  // KaTeX-Block (4T-0084); 4T-0293: deaktiviert bleibt `$$…$$` Roh-Text.
  if (isExtensionActive('katex')) {
    for (const block of computeMathBlockRanges(state)) {
      if (intersectsComment(block.from, block.to)) continue;
      spans.push({ fromLine: block.fromLine, toLine: block.toLine });
      if (blockIsActive(activeLines, block.fromLine, block.toLine)) continue;
      ranges.push(
        Decoration.replace({
          widget: new MathBlockWidget(block.source, basePath),
        }).range(block.from, block.to),
      );
    }
  }
  // 4T-0088: Tabellen und Fenced-Code via Lezer-AST. Pre-Pass-Filter:
  // Block muss Zeilen-aligned sein (Voraussetzung fuer sauberen Replace),
  // darf nicht im Frontmatter liegen, Cursor in irgendeiner Block-Zeile
  // klappt zur Quelle auf. Mermaid (lang === 'mermaid') wird hier
  // ausgelassen und in 4T-0089 separat behandelt.
  const frontmatter = detectFrontmatterLines(state.doc);
  const frontmatterEndLine = frontmatter ? frontmatter.toLine : 0;
  // 4T-0283 (Epic 3E-0050): Frontmatter-Block-Widget (zusammengeklappte
  // Zeile aus 4T-0282) bei aktivem Schalter. Cursor- oder Selektions-
  // Eintritt demaskiert zum Quelltext mit der bestehenden
  // cm-frontmatter-line-Dekoration (frontmatterField bleibt aktiv).
  // Ausnahme: der unberuehrte Initial-Cursor (leere Selektion auf
  // Position 0, Zustand jedes frisch geoeffneten Tabs) demaskiert NICHT —
  // sonst zeigte jeder Datei-Start im Live-Modus rohes YAML statt der
  // zusammengeklappten Zeile. Tastatur-Eintritt (Pfeiltasten ab Position
  // 0) und der Klick ins aufgeklappte YAML setzen Positionen > 0 und
  // demaskieren regulaer.
  if (frontmatter && isFrontmatterDisplayEnabled()) {
    spans.push({ fromLine: frontmatter.fromLine, toLine: frontmatter.toLine });
    if (
      isInitialCursorOnly(state) ||
      !blockIsActive(activeLines, frontmatter.fromLine, frontmatter.toLine)
    ) {
      const fmFrom = state.doc.line(frontmatter.fromLine).from;
      const fmTo = state.doc.line(frontmatter.toLine).to;
      ranges.push(
        Decoration.replace({
          widget: new FrontmatterBlockWidget(state.doc.sliceString(fmFrom, fmTo), getLanguage()),
        }).range(fmFrom, fmTo),
      );
    }
  }
  // 4T-0199: Definition Lists und Line Blocks als Block-Widgets (Quell-
  // Block wird durch den Pipeline-Render ersetzt; Cursor im Block klappt
  // zur Quelle auf). Guards: Frontmatter, Lezer-Code-Kontext, fuer Line
  // Blocks zusaetzlich Lezer-Table (GFM-Tabellen matchen `| ` ebenfalls).
  {
    const { deflists, lineBlocks } = computeDeflistLineBlockScan(state.doc);
    const pushScanBlock = (block, kind) => {
      if (block.fromLine <= frontmatterEndLine) return;
      const fromPos = state.doc.line(block.fromLine).from;
      const toPos = state.doc.line(block.toLine).to;
      if (positionInsideCode(state, fromPos)) return;
      if (kind === 'lineblock' && positionInsideTable(state, fromPos)) return;
      // 4T-0479: kommentierte Bloecke nicht als Widget rendern.
      if (intersectsComment(fromPos, toPos)) return;
      spans.push({ fromLine: block.fromLine, toLine: block.toLine });
      if (blockIsActive(activeLines, block.fromLine, block.toLine)) return;
      const source = state.doc.sliceString(fromPos, toPos);
      ranges.push(
        Decoration.replace({
          widget: new MarkdownBlockWidget(source, basePath, `${kind}:${mermaidHash(source)}`),
        }).range(fromPos, toPos),
      );
    };
    // 4T-0293: pro Konstrukt nur bei aktiver Erweiterung ersetzen —
    // deaktiviert bleibt der Quelltext stehen (Paritaet zum Render, der
    // die Zeilen dann als Absatz bzw. Roh-Text ausgibt).
    if (isExtensionActive('definition-lists')) {
      for (const block of deflists) pushScanBlock(block, 'deflist');
    }
    if (isExtensionActive('line-blocks')) {
      for (const block of lineBlocks) pushScanBlock(block, 'lineblock');
    }
  }
  syntaxTree(state).iterate({
    from: 0,
    to: state.doc.length,
    enter(node) {
      const name = node.name;
      if (name !== 'Table' && name !== 'FencedCode') return;
      const fromLine = state.doc.lineAt(node.from);
      // toLine pragmatisch: wenn node.to direkt nach einem \n liegt (Lezer
      // schliesst trailing newline manchmal ein), ist lineAt(node.to)
      // bereits die Folge-Zeile — wir korrigieren auf die letzte Block-
      // Zeile mit max(node.to - 1, fromLine.from).
      const toPos = node.to > fromLine.from ? node.to - 1 : node.to;
      const toLine = state.doc.lineAt(Math.max(toPos, fromLine.from));
      if (fromLine.number <= frontmatterEndLine) return;
      // 4T-0479: kommentierte Bloecke nicht als Widget rendern.
      if (intersectsComment(node.from, node.to)) return;
      spans.push({ fromLine: fromLine.number, toLine: toLine.number });
      // Validation gelockert: kein strikter Linien-Match wie bei block:true,
      // weil Inline-Replace robust mit Range-Variationen umgeht.
      if (blockIsActive(activeLines, fromLine.number, toLine.number)) return;
      const source = state.doc.sliceString(node.from, node.to);
      let cacheKey;
      if (name === 'Table') {
        cacheKey = `table:${mermaidHash(source)}`;
      } else {
        // FencedCode: Info-String extrahieren (Sprache oder perspective-table).
        let lang = '';
        let inner = node.node.firstChild;
        while (inner) {
          if (inner.name === 'CodeInfo') {
            lang = state.doc.sliceString(inner.from, inner.to).trim();
            break;
          }
          inner = inner.nextSibling;
        }
        // 4T-0293: bei deaktivierter Mermaid-Erweiterung faellt der Block
        // auf das generische MarkdownBlockWidget durch (Code-Block).
        if (lang === 'mermaid' && isExtensionActive('mermaid')) {
          // 4T-0089: eigene Widget-Klasse mit Async-Render und Theme-Cache.
          // Mermaid bekommt NUR den CodeText-Inhalt (ohne ```-Marker und
          // Info-String), sonst meldet es "Syntax error in text". Im
          // Render-Pane extrahiert markdown-it das automatisch; hier
          // muessen wir es aus dem Lezer-AST holen.
          let mermaidSource = '';
          let codeTextChild = node.node.firstChild;
          while (codeTextChild) {
            if (codeTextChild.name === 'CodeText') {
              mermaidSource = state.doc.sliceString(codeTextChild.from, codeTextChild.to);
              break;
            }
            codeTextChild = codeTextChild.nextSibling;
          }
          if (!mermaidSource) return;
          const theme = currentMermaidTheme();
          ranges.push(
            Decoration.replace({
              widget: new MermaidBlockWidget(mermaidSource, theme),
            }).range(node.from, node.to),
          );
          return;
        }
        if (lang === 'perspective-table') {
          cacheKey = `perspective-table:${mermaidHash(source)}`;
        } else if (lang === 'perspective-events') {
          // 4T-0512 (Epic 3E-0092): Stichtag im Cache-Key — die Differenz-
          // Spalte rechnet gegen "heute"; ohne Datums-Anteil zeigte ein
          // ueber Mitternacht gecachtes Widget veraltete Tages-Zaehler.
          cacheKey = `perspective-events:${localTodayIso()}:${mermaidHash(source)}`;
        } else {
          cacheKey = `fence:${lang}:${mermaidHash(source)}`;
        }
      }
      ranges.push(
        Decoration.replace({
          widget: new MarkdownBlockWidget(source, basePath, cacheKey),
        }).range(node.from, node.to),
      );
    },
  });
  return {
    deco: Decoration.set(ranges, true),
    spans,
    sig: blockWidgetSignature(state, spans),
  };
}

export const liveBlockWidgetsField = StateField.define({
  create(state) {
    try {
      return buildBlockWidgetValue(state);
    } catch (err) {
      console.error('[Live] buildBlockWidgetValue (create) crashed:', err);
      return { deco: Decoration.none, spans: [], sig: '' };
    }
  },
  update(value, tr) {
    // R1-14 (4T-0186): expliziter Rebuild-Trigger (Theme-/Sprachwechsel).
    // Der liveRebuildEffect erreichte zuvor nur das Inline-ViewPlugin;
    // Mermaid-BLOCK-Widgets behielten beim Theme-Wechsel die alte Palette,
    // bis die naechste Eingabe den Field-Rebuild ausloeste.
    for (const e of tr.effects) {
      if (e.is(liveRebuildEffect)) {
        try {
          return buildBlockWidgetValue(tr.state);
        } catch (err) {
          console.error('[Live] buildBlockWidgetValue (rebuild) crashed:', err);
          return value;
        }
      }
    }
    // R1-02 (4T-0174): auch beim asynchronen Lezer-Nachlauf rebuilden
    // (Tree-Identitaetsvergleich, Muster vom foldStructureField) — sonst
    // fehlen Block-Widgets in spaeten Teilen grosser Dateien.
    if (!tr.docChanged && syntaxTree(tr.state) === syntaxTree(tr.startState)) {
      if (!tr.selection) return value;
      // R1-05 (4T-0180): reine Selektionsaenderung — Rebuild nur, wenn
      // sich die blockrelevante Aktiv-Zeilen-Menge tatsaechlich aendert
      // (Cursor betritt oder verlaesst einen Kandidaten-Block; inkl.
      // Initial-Cursor-Flanke des Frontmatter-Widgets, 4T-0283).
      const sig = blockWidgetSignature(tr.state, value.spans);
      if (sig === value.sig) return value;
    }
    try {
      return buildBlockWidgetValue(tr.state);
    } catch (err) {
      console.error('[Live] buildBlockWidgetValue (update) crashed:', err);
      return value;
    }
  },
  provide: (f) => EditorView.decorations.from(f, (value) => value.deco),
});

// 4T-0087: i18n-Refresh-Hook. Wenn die App-Sprache zur Laufzeit umgeschaltet
// wird, dispatcht der Sprach-Wechsel-Handler ein 'i18n-language-changed'-
// Event auf document. Wir loesen dann fuer jeden offenen Editor einen
// Live-Plugin-Re-Build aus, damit Callout-Default-Titel-Widgets mit dem
// neuen Sprach-Stand gebaut werden. Listener wird auf Modul-Ebene einmalig
// registriert; paneEditors wird zur Event-Zeit ausgelesen.
document.addEventListener('i18n-language-changed', () => {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
});

// 4T-0204: Task-Status-Aenderungen (Settings-Apply oder Multi-Window-
// Broadcast) bauen die Live-Decorations ebenfalls neu — Marker-Pattern
// und State-Decos haengen am aktiven Set.
document.addEventListener('scg:taskstates-changed', () => {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
});

// 4T-0498 (Epic 3E-0090): Aufgaben-Konfigurations-Aenderungen (Global
// Filter, Ausblende-Option, Labels) bauen die Live-Decorations ebenfalls
// neu — Badges und Filter-Ausblendung haengen daran (Muster taskStates).
document.addEventListener('scg:tasks-changed', () => {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
});

// 4T-0471 (Epic 3E-0087): Nummerierungs-Aenderungen (Settings-Apply oder
// Multi-Window-Broadcast) bauen die Live-Decorations neu — Nummer-Widgets und
// Marker-Ausblendung haengen am aktiven Zustand (Muster taskStates).
document.addEventListener('scg:heading-numbering-changed', () => {
  for (const view of paneEditors) {
    if (!view) continue;
    view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
});

// 4T-0409 (Epic 3E-0077): Klick-Pfad der Abfrage-Treffer INNERHALB der Live-
// Block-Widgets. MarkdownBlockWidget.ignoreEvent() laesst CodeMirror alle
// Events aus dem Widget ignorieren — der fm-Zweig des livePreviewClickHandler
// unten feuert dort nie (eventBelongsToEditor prueft widget.ignoreEvent).
// Wie beim FrontmatterBlockWidget und beim Datatable-Editor bindet daher das
// Widget selbst den Listener auf seinem Container (Aufruf in
// MarkdownBlockWidget._enhance, live-deco.js). Block-Treffer tragen
// data-fm-anchor ('^id'); nach dem Oeffnen springt die bestehende Anker-
// Mechanik zum Block.
export function bindFrontmatterQueryClicks(container) {
  container.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const tgt = event.target;
    if (!(tgt instanceof Element)) return;
    // 4T-0504 (Epic 3E-0096): Rueckschreib-Aktionen der Task-Treffer laufen
    // auch im Widget ueber den zentralen Dispatch (vor dem Treffer-Link).
    if (handleTaskQueryAction(tgt)) {
      event.preventDefault();
      return;
    }
    const fmItem = tgt.closest('[data-fm-path]');
    if (!fmItem || !fmItem.dataset.fmPath) return;
    const editorEl = container.closest('.cm-editor');
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    const paneIdx = view ? paneEditors.indexOf(view) : -1;
    if (paneIdx < 0) return;
    event.preventDefault();
    const fmAnchor = fmItem.dataset.fmAnchor || '';
    // 4T-0502 (Epic 3E-0096): Task-Treffer springen zur Quell-Zeile.
    const fmLine = parseInt(fmItem.dataset.fmLine || '', 10);
    // 4T-0631 (Epic 3E-0102): Abfrage-Treffer-Klick im Dokument erbt die Gruppe.
    Promise.resolve(openInPane(paneIdx, [fmItem.dataset.fmPath], { inheritGroup: true })).then(
      (realPane) => {
        if (fmAnchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(fmAnchor));
        else if (Number.isFinite(fmLine)) scrollToLineAfterOpen(realPane, fmLine);
      },
    );
  });
}

// 4T-0082: Klick-Handler fuer Live-Modus-Links und Footnote-Verweise.
// Aktiv nur wenn das Live-Compartment den Plugin-Stack enthaelt; wird mit
// dem Plugin zusammen ein-/ausgeschaltet.
//
// **Wichtig: mousedown statt click.** CodeMirror setzt die Cursor-Position
// bereits beim mousedown-Event; ein click-Handler waere zu spaet (der
// Cursor sitzt dann schon im Link-Text statt am Klick-Ziel). Wir filtern
// auf Linksklick (event.button === 0), damit Rechts- und Mittelklick fuer
// Kontextmenue bzw. Browser-Default reserviert bleiben.
export const livePreviewClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;
    const tgt = event.target;
    if (!(tgt instanceof Element)) return false;
    // 4T-0409 (Epic 3E-0077): Der fruehere [data-fm-path]-Zweig (4T-0355) ist
    // hierher nie durchgedrungen — Abfrage-Treffer liegen im Live-Modus stets
    // in einem Block-Widget mit ignoreEvent() -> true, dessen Events CodeMirror
    // gar nicht erst an diese Handler gibt. Der Klick-Pfad laeuft jetzt ueber
    // bindFrontmatterQueryClicks (oben) direkt am Widget-Container.
    const linkEl = tgt.closest('[data-live-link-href]');
    if (linkEl) {
      const href = linkEl.getAttribute('data-live-link-href');
      const isWiki = linkEl.getAttribute('data-live-link-wikilink') === 'true';
      const paneIdx = paneEditors.indexOf(view);
      if (paneIdx < 0) return false;
      event.preventDefault();
      // activateLink ist async, wir warten nicht — Handler darf synchron
      // true zurueckgeben, damit CodeMirror den Default-mousedown ueberspringt.
      activateLink(paneIdx, href, isWiki);
      return true;
    }
    const refEl = tgt.closest('[data-live-footnote-id]');
    if (refEl) {
      const id = refEl.getAttribute('data-live-footnote-id');
      const range = findFootnoteDefinitionRange(view.state.doc, id);
      if (!range) return false;
      event.preventDefault();
      view.dispatch({
        effects: EditorView.scrollIntoView(range.from, { y: 'center' }),
        selection: { anchor: range.from },
      });
      return true;
    }
    // 4T-0487 (Epic 3E-0091): Der Klick-Pfad der Datums-/Uhrzeit-Werte
    // haengt am dateValuePlugin (date-picker.js, Basis-Extension) und
    // gilt damit auch im Quelltext-Modus.
    // 4T-0083: Task-Box-Toggle im Live-Modus. Klick auf das gerenderte
    // Checkbox-Symbol (Mark-Decoration mit data-live-task-from) toggelt
    // den Marker `[ ]` <-> `[x]` im Doc. Aktive Cursor-Zeile zeigt die
    // rohe Quelle ohne Marker-Decoration — dort kein Toggle-Klick, normale
    // Cursor-Setzung greift.
    const taskEl = tgt.closest('[data-live-task-from]');
    if (taskEl) {
      // 4T-0213 (Epic 3E-0042): im read-only Handbuch-Tab bleibt der
      // Task-Klick inert — der dispatch unten wuerde das Doc trotz
      // EditorState.readOnly aendern (programmatische Dispatches sind
      // davon nicht blockiert).
      const guardPaneIdx = paneEditors.indexOf(view);
      const guardPane = guardPaneIdx >= 0 ? state.panes[guardPaneIdx] : null;
      const guardTab =
        guardPane && guardPane.activeIndex >= 0 ? guardPane.tabs[guardPane.activeIndex] : null;
      if (guardTab && guardTab.manualPage) return false;
      const fromStr = taskEl.getAttribute('data-live-task-from');
      const from = parseInt(fromStr, 10);
      if (Number.isNaN(from) || from < 0 || from > view.state.doc.length) return false;
      // 4T-0497: der Klick folgt der konfigurierten Toggling-Kette —
      // gemeinsame Funktion mit dem Render-Toggle (views.js), inklusive
      // der Undo-Haertung aus 4T-0484 (userEvent-Annotation). Die Zeile
      // wird frisch gelesen; eine veraltete Decoration toggelt damit den
      // aktuellen Zeilen-Stand oder gar nichts.
      const toggled = performStatusToggle(view, view.state.doc.lineAt(from).number);
      if (!toggled) return false;
      event.preventDefault();
      return true;
    }
    return false;
  },
});

// 4T-0082: Hover-Tooltip fuer Footnote-Verweise. Zeigt die Definition aus
// dem Doc-Body als kleinen Tooltip; nutzt CodeMirrors hoverTooltip-API
// (gleiche Infrastruktur wie der Linter-Tooltip aus 4T-0020).
export const liveFootnoteHoverTooltip = hoverTooltip((view, pos) => {
  const domAt = view.domAtPos(pos);
  let el = domAt && domAt.node;
  if (el && el.nodeType === 3) el = el.parentElement;
  if (!(el instanceof Element)) return null;
  const refEl = el.closest('[data-live-footnote-id]');
  if (!refEl) return null;
  const id = refEl.getAttribute('data-live-footnote-id');
  const defText = findFootnoteDefinitionText(view.state.doc, id);
  if (!defText) return null;
  return {
    pos,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-live-footnote-tooltip';
      dom.textContent = defText;
      return { dom };
    },
  };
});

// 4T-0197: Hover-Tooltip fuer Abbreviation-Vorkommen. Zeigt den Langtext
// aus der Definitionszeile; gleiche Infrastruktur wie der Footnote-
// Tooltip (data-Attribut der Mark-Decoration traegt den Text bereits).
export const liveAbbrHoverTooltip = hoverTooltip((view, pos) => {
  const domAt = view.domAtPos(pos);
  let el = domAt && domAt.node;
  if (el && el.nodeType === 3) el = el.parentElement;
  if (!(el instanceof Element)) return null;
  const abbrEl = el.closest('[data-live-abbr-title]');
  if (!abbrEl) return null;
  const title = abbrEl.getAttribute('data-live-abbr-title');
  if (!title) return null;
  return {
    pos,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-live-footnote-tooltip';
      dom.textContent = title;
      return { dom };
    },
  };
});

// 4T-0082: Extension-Bundle fuer den Live-Modus. Plugin (Decorations) +
// Klick-Handler + Hover-Tooltip werden im selben Compartment ein-/
// ausgeschaltet.
export const livePreviewExtensions = [
  livePreviewPlugin,
  livePreviewClickHandler,
  liveFootnoteHoverTooltip,
  liveAbbrHoverTooltip,
  liveBlockWidgetsField,
];
