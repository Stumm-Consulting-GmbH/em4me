// Live-Modus-Widgets, die ihren Inhalt über die Render-Pipeline erzeugen:
// Bild, Inline- und Block-Mathematik, Wiki-Embed und das generische
// Block-Widget samt Nachverarbeitung.
// 4T-0982 (Epic 3E-0196): aus live-deco.js herausgelöst. Alle Aufrufe der
// Nachverarbeitungs-Module laufen zur Laufzeit in toDOM bzw. _enhance; der
// Import-Graph bleibt damit in eine Richtung gerichtet.
'use strict';

import { WidgetType } from '@codemirror/view';

import { applyTranslations } from '../../i18n.js';
import { api } from '../app/api.js';
// K-10/R1-15 (4T-0186): Render-Pane-Nachverarbeitung fuer Block-Widgets
// (Laufzeit-Aufrufe in toDOM, kein top-level Wert-Zugriff — zyklenfest).
import { applyCodeCopyButtons, enhancePerspectiveTableSorting } from '../render-mermaid.js';
import { applyWikiEmbedsIfPresent } from '../render-mermaid.js';
// 4T-0355 (Epic 3E-0065): perspective-query-Befüllung im Live-Block-Widget
// (Laufzeit-Aufruf in _enhance, zyklenfest — importiert nur api und i18n).
import { applyFrontmatterQueriesIfPresent } from '../query/frontmatter-query-view.js';
// 4T-0435 (Epic 3E-0081): Journal-Navigation im Live-Block-Widget
// (Laufzeit-Aufruf in _enhance, zyklenfest — Klick-Ziel per dynamic import).
import { applyJournalNavIfPresent } from '../calendar/journal-nav-view.js';
// 4T-0412 (Epic 3E-0078): Skript-Blöcke im Live-Modus (Widget-Nachverarbeitung).
import { applyPerspectiveScriptsIfPresent } from '../query/perspective-script-view.js';
// 4T-0418 (Epic 3E-0079): Perspective-Datatable-Lokalisierung im Live-
// Block-Widget (zyklenfest — importiert nur i18n).
import { applyPerspectiveDatatablesIfPresent } from '../query/perspective-datatable-view.js';
// 4T-0512 (Epic 3E-0092): Ereignis-Fence im Live-Widget (Lokalisierung,
// Differenz-Spalte, Editor-Bindung).
import { applyPerspectiveEventsIfPresent } from '../events/events-view.js';
import { bindPerspectiveEventsEditor } from '../events/events-editor.js';
import { applyPerspectiveEventsViewStates } from '../events/events-view-state.js';
// 4T-0419 (Epic 3E-0079): Grid-Editor auch im Live-Widget (Laufzeit-
// Zugriffe im Handler, zyklenfest). 4T-0420: plus Ansichts-Zustand.
import {
  bindPerspectiveDatatableEditor,
  applyPerspectiveDatatableViewStates,
} from '../query/perspective-datatable-editor.js';
import { liveBlockCacheGet, liveBlockCacheSet } from './live-shared.js';
import { bindFrontmatterQueryClicks } from './live-interaction.js';

// 4T-0084 (Epic 3E-0014): Bilder-Widget. Inline-Replace eines
// `![alt](url)`-Ranges durch ein `<img>`-Element. Pfad-Aufloesung
// laeuft ueber api.renderMarkdown (das resolveImagesForBase im preload
// aufruft) — konsistent mit der Render-Pane, keine doppelte Pfad-Logik
// im Renderer. eq() vergleicht alt, url und basePath.
//
// 4T-0198 (Epic 3E-0017): erweitert um opts {sourceText, standalone}.
// sourceText rendert den Original-Quelltext (noetig fuer das `=WxH`-
// Groessen-Suffix, das Lezer nicht als Image-Bestandteil parst);
// standalone steuert die Figure-Uebernahme: nur wenn das Bild im Doc
// allein im Absatz steht, wird das <figure> (inkl. <figcaption>) aus dem
// Render-Output uebernommen — der isoliert gerenderte Markdown-String
// stuende sonst IMMER allein und implicit-figures wuerde Fliesstext-
// Bilder im Live-Modus faelschlich zur Figure machen.
export class ImageWidget extends WidgetType {
  constructor(alt, url, basePath, opts) {
    super();
    this.alt = alt || '';
    this.url = url || '';
    this.basePath = basePath || '';
    this.sourceText = (opts && opts.sourceText) || '';
    this.standalone = !!(opts && opts.standalone);
  }
  eq(other) {
    return (
      other instanceof ImageWidget &&
      other.alt === this.alt &&
      other.url === this.url &&
      other.basePath === this.basePath &&
      other.sourceText === this.sourceText &&
      other.standalone === this.standalone
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-image';
    // Bracket-Escape im Alt-Text waere bei direkter Wiedereinsetzung als
    // Markdown gefaehrlich. Da wir nur die Visualisierung brauchen,
    // strippen wir potentiell brechende Zeichen statt zu escapen.
    const safeAlt = this.alt.replace(/[\]\\]/g, '');
    const md = this.sourceText || `![${safeAlt}](${this.url})`;
    try {
      const html = api.renderMarkdown(md, this.basePath);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      if (this.standalone) {
        const fig = tmp.querySelector('figure');
        if (fig) {
          span.appendChild(fig);
          return span;
        }
      }
      const img = tmp.querySelector('img');
      if (img) {
        span.appendChild(img);
        return span;
      }
    } catch (err) {
      console.warn('ImageWidget Render-Fehler:', err);
    }
    span.textContent = md;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0084: Inline-Math-Widget. Ein `$x$`-Range wird inline durch das
// KaTeX-gerenderte `<span class="katex">`-Element ersetzt. Rendering
// laeuft ueber api.renderMarkdown — markdown-it-katex hat seine eigene
// Dollar-Heuristik (4T-0022) und die Heuristik im Pre-Pass-Pattern hier
// ist die schnelle Vorab-Filterung. Wenn markdown-it-katex den Treffer
// am Ende nicht akzeptiert (kein .katex-Knoten im Output), faellt
// toDOM auf die Quelle zurueck — der Live-Modus sieht in diesem Edge-
// Fall optisch genauso aus wie der Source-Modus.
export class MathInlineWidget extends WidgetType {
  constructor(source, basePath) {
    super();
    this.source = source;
    this.basePath = basePath || '';
  }
  eq(other) {
    return (
      other instanceof MathInlineWidget &&
      other.source === this.source &&
      other.basePath === this.basePath
    );
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-math-inline';
    try {
      const html = api.renderMarkdown(this.source, this.basePath);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const katex = tmp.querySelector('.katex');
      if (katex) {
        span.appendChild(katex);
        return span;
      }
    } catch (err) {
      console.warn('MathInlineWidget Render-Fehler:', err);
    }
    span.textContent = this.source;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0084: KaTeX-Block-Widget. Mehrzeiliger `$$…$$`-Block wird durch ein
// `<div class="katex-display">` ersetzt. block: true im Decoration.replace
// macht das Widget zu einem eigenen Block-Element, das mehrere Zeilen
// ersetzt. Cursor in irgendeiner Block-Zeile klappt die Quelle auf
// (siehe blockIsActive-Logik in buildLivePreviewDecorations).
//
// lineBreaks/estimatedHeight bewusst NICHT ueberschrieben — CM6 misst
// die echte Hoehe nach Mount, der Default lineBreaks=0 entspricht der
// visuellen Hoehe eines einzelnen KaTeX-Display-Elements.
export class MathBlockWidget extends WidgetType {
  constructor(source, basePath) {
    super();
    this.source = source;
    this.basePath = basePath || '';
  }
  eq(other) {
    return (
      other instanceof MathBlockWidget &&
      other.source === this.source &&
      other.basePath === this.basePath
    );
  }
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-live-math-block';
    try {
      const html = api.renderMarkdown(this.source, this.basePath);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const display = tmp.querySelector('.katex-display') || tmp.querySelector('.katex');
      if (display) {
        div.appendChild(display);
        return div;
      }
    } catch (err) {
      console.warn('MathBlockWidget Render-Fehler:', err);
    }
    div.textContent = this.source;
    return div;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0084: Wiki-Embed-Widget. toDOM() schickt den `![[...]]`-Quelltext
// durch api.renderMarkdown — der Output enthaelt entweder ein direktes
// `<img class="wiki-embed">` (Bilder) oder ein Platzhalter-`<span
// class="wiki-embed" data-...>`, das vom bestaehenden Async-Resolver
// applyWikiEmbedsIfPresent zu einem konkreten Embed-Inhalt aufgeloest
// wird (Markdown-Inline, PDF, Other). Konsistent zur Render-Pane.
export class WikiEmbedWidget extends WidgetType {
  constructor(source, basePath) {
    super();
    this.source = source;
    this.basePath = basePath || '';
  }
  eq(other) {
    return (
      other instanceof WikiEmbedWidget &&
      other.source === this.source &&
      other.basePath === this.basePath
    );
  }
  toDOM() {
    const container = document.createElement('span');
    container.className = 'cm-live-embed';
    try {
      const html = api.renderMarkdown(this.source, this.basePath);
      container.innerHTML = html;
      // Falls markdown-it einen Wrapping-Paragraph eingesetzt hat, dessen
      // Inhalt nach oben heben (sauberere Inline-Darstellung).
      const onlyChild = container.children.length === 1 ? container.children[0] : null;
      if (onlyChild && onlyChild.tagName === 'P') {
        const inner = onlyChild.innerHTML;
        container.innerHTML = inner;
      }
      // Async-Resolver fuer Platzhalter-Spans (Markdown-/PDF-/Other-Embeds).
      // applyWikiEmbedsIfPresent traversiert .wiki-embed-Spans im Container
      // und ersetzt sie durch konkrete Embed-Inhalte.
      if (this.basePath && typeof applyWikiEmbedsIfPresent === 'function') {
        applyWikiEmbedsIfPresent(container, this.basePath).catch((err) => {
          console.warn('WikiEmbedWidget Async-Resolver-Fehler:', err);
        });
      }
    } catch (err) {
      console.warn('WikiEmbedWidget Render-Fehler:', err);
      container.textContent = this.source;
    }
    return container;
  }
  ignoreEvent() {
    return true;
  }
}

// 4T-0088 (Epic 3E-0014): Generisches Block-Widget fuer Markdown-Inhalt,
// der durch die preload-Pipeline gerendert wird. Deckt Pipe-Tabellen,
// Perspective-Tabellen (via Fenced-Code mit Info-Tag) und Fenced-Code mit Syntax-
// Highlighting ab. KaTeX-Block hat eine eigene Klasse (MathBlockWidget),
// weil dort spezifisch der .katex-display-Knoten aus dem HTML-Output
// extrahiert wird.
//
// Cache-Integration: pro Widget-Instanz wird der vom Pre-Pass berechnete
// cacheKey im toDOM() geprueft. Cache-Hit → DOM clonen und zurueckgeben;
// Cache-Miss → api.renderMarkdown aufrufen, Output speichern und klonen.
// Bei reinem Tippen ausserhalb des Blocks aendert sich der Quelltext
// nicht, eq() bleibt gleich, Widget-Re-Build entfaellt; bei Block-
// Aenderungen springt der cacheKey, neuer Cache-Eintrag.
export class MarkdownBlockWidget extends WidgetType {
  constructor(source, basePath, cacheKey) {
    super();
    this.source = source;
    this.basePath = basePath || '';
    this.cacheKey = cacheKey;
  }
  eq(other) {
    return (
      other instanceof MarkdownBlockWidget &&
      other.source === this.source &&
      other.basePath === this.basePath &&
      other.cacheKey === this.cacheKey
    );
  }
  toDOM() {
    const container = document.createElement('div');
    // 'markdown-body' bringt Tabellen-, Code- und allgemeine Render-Pane-
    // Styles in den Editor-Kontext, damit Tabellen und Fenced-Code im
    // Live-Modus optisch identisch zur Render-Pane wirken.
    container.className = 'cm-live-block markdown-body';
    const cached = liveBlockCacheGet(this.cacheKey);
    if (cached) {
      container.appendChild(cached.cloneNode(true));
      this._enhance(container);
      return container;
    }
    try {
      const html = api.renderMarkdown(this.source, this.basePath);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      // markdown-it wickelt Inhalte ggf. in <p>. Bei Tabellen liegt das
      // <table> direkt im Output (kein <p>); bei Fenced-Code direkt
      // <pre><code>. Wir nehmen den ersten relevanten Knoten und cachen
      // dessen Clone.
      // 4T-0418: .perspective-datatable VOR table — der Wrapper (mit den
      // data-dt-Attributen fuer den Grid-Editor) liegt in Dokument-
      // Reihenfolge vor seiner inneren Tabelle und gewinnt damit.
      // 4T-0512 (Epic 3E-0092): .perspective-events ebenso VOR table —
      // ohne den Wrapper verlöre das Live-Widget data-ev-Attribute
      // (Fence-Zuordnung, Stichtag), Formularzeile und Differenz-Spalte
      // (PO-Befund C1 vom 2026-07-15).
      const child =
        tmp.querySelector(
          '.perspective-events, .perspective-datatable, table, pre, .katex-display, .katex',
        ) || tmp.firstElementChild;
      if (child) {
        liveBlockCacheSet(this.cacheKey, child);
        container.appendChild(child.cloneNode(true));
        this._enhance(container);
        return container;
      }
    } catch (err) {
      console.warn('MarkdownBlockWidget Render-Fehler:', err);
    }
    container.textContent = this.source;
    return container;
  }
  // K-10/R1-15 (4T-0186): Nachverarbeitung wie im Render-Pane (Copy-
  // Buttons, Callout-Default-Titel-Uebersetzung, Tabellen-Sortierung). Laeuft
  // nach JEDEM Einhaengen — auch beim Cache-Klon, weil cloneNode die
  // Event-Listener verliert; der Cache selbst bleibt unbehandelt.
  _enhance(container) {
    try {
      applyCodeCopyButtons(container);
      applyTranslations(container);
      enhancePerspectiveTableSorting(container);
      // 4T-0355: perspective-query-Platzhalter im Live-Modus befüllen. Läuft
      // bei jedem Einhängen (auch Cache-Klon), sodass die Liste aktuell ist;
      // No-op bei anderen Block-Widgets. basePath aus dem Widget.
      applyFrontmatterQueriesIfPresent(container, this.basePath);
      // 4T-0435 (Epic 3E-0081): Journal-Navigation im Live-Widget befüllen
      // (Listener pro Mount frisch; ignoreEvent hält die CM-Handler fern).
      applyJournalNavIfPresent(container, this.basePath);
      // 4T-0412 (Epic 3E-0078): Skript-Blöcke im Live-Widget ausführen bzw.
      // als Quelltext zeigen (No-op bei anderen Block-Widgets).
      applyPerspectiveScriptsIfPresent(container, this.basePath);
      // 4T-0409 (Epic 3E-0077): Klick-Pfad der Treffer direkt am Container —
      // ignoreEvent() dieses Widgets hält die zentralen CM-Handler fern.
      bindFrontmatterQueryClicks(container);
      // 4T-0418: Datatable-Fehler-/Limit-Texte lokalisieren (No-op sonst).
      applyPerspectiveDatatablesIfPresent(container);
      // 4T-0419: Grid-Editor im Live-Widget (Container ist pro Mount neu).
      bindPerspectiveDatatableEditor(container);
      // 4T-0420: Ansichts-Zustand nach jedem Widget-Mount wiederanwenden.
      applyPerspectiveDatatableViewStates(container);
      // 4T-0512 (Epic 3E-0092): Ereignis-Fence im Live-Widget lokalisieren
      // und Editor binden (No-op bei anderen Block-Widgets).
      applyPerspectiveEventsIfPresent(container);
      bindPerspectiveEventsEditor(container);
      // 4T-0513: Ansichts-Zustand nach jedem Widget-Mount wiederanwenden.
      applyPerspectiveEventsViewStates(container);
    } catch (err) {
      console.warn('MarkdownBlockWidget Nachverarbeitung fehlgeschlagen:', err);
    }
  }
  ignoreEvent() {
    return true;
  }
}
