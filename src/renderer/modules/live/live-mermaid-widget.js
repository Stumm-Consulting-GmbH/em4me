// Mermaid-Render-Queue sowie die beiden Block-Widgets mit eigenem Render-Weg:
// Mermaid-Diagramm (asynchron, eigene Bibliothek) und Frontmatter-Block.
// 4T-0982 (Epic 3E-0196): aus live-widgets.js herausgelöst. Der Queue-Zustand
// bleibt modul-privat und ist ausschließlich über enqueueMermaidRun erreichbar;
// ein beschreibbares Export-Binding über Modul-Grenzen gibt es damit nicht.
'use strict';

import { EditorView, WidgetType } from '@codemirror/view';

import { t, applyTranslations } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  applyFrontmatterLine,
  cleanupMermaidLeftovers,
  ensureMermaidConfigured,
  loadMermaid,
  mermaidHash,
} from '../render-mermaid.js';
import { liveBlockCacheGet, liveBlockCacheSet } from './live-shared.js';

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
// 4T-0982: modul-privat statt exportiert; Zugriff nur über enqueueMermaidRun.
let mermaidRenderQueue = Promise.resolve();

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
// 4T-1310 (Epic 3E-0235): Leerraum-Textknoten auf oberster Ebene entfernen.
// Im Dokument-Fluss sind sie folgenlos; in einem Widget-Kasten bilden sie eine
// eigene Textzeile und schieben den Inhalt darunter auseinander.
function entferneLeerraumKnoten(container) {
  for (const knoten of [...container.childNodes]) {
    if (knoten.nodeType === Node.TEXT_NODE && !String(knoten.textContent || '').trim()) {
      knoten.remove();
    }
  }
}

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
        // 4T-1310 (Epic 3E-0235): Der gerenderte Ausschnitt endet mit einem
        // Zeilenumbruch. Als Textknoten im Widget erzeugt er eine leere
        // Textzeile und damit 24 px Leerraum unter der zusammengeklappten
        // Zeile (gemessen am 2026-08-30). Sichtbar wird er erst im Editor,
        // weil der Widget-Kasten dort eine eigene Zeile bildet.
        entferneLeerraumKnoten(container);
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
