// 4T-0365 (Epic 3E-0067): Block-Metadaten-Indikator — dezenter Marker an Blöcken,
// deren Block-Anker (`^id`) Metadaten in der .mdd tragen (blockData-Sektion,
// Datenpfad aus 4T-0363). Sichtbarkeit-only-Umfang der Konzept-Entscheidung 4
// (4A2): Hover zeigt die Schlüssel-Wert-Liste (title), Klick öffnet das Panel
// „Block-Eigenschaften" mit dem Anker als Kontext. KEINE Abfrage-Syntax (vertagt
// auf das Query-Ausbau-Konzept I-12).
//
// Zwei Darstellungen aus einer Datenquelle:
//   - Render-Pane/Reading: Post-Prozessor `applyBlockMetaIndicators`, eingehängt
//     in applyRenderPipeline (render-mermaid.js). Block-Element über die vom
//     blockAnchorsPlugin gesetzte `id` (`[id="…"]`).
//   - Live-Modus: CodeMirror-StateField `blockMetaField` mit Zeilenende-Widget an
//     der Anker-Zeile (extractBlockAnchors); gespeist aus dem Cache über den
//     `blockMetaRefreshEffect`.
// Der Cache `metaByPath` hält pro Datei die Anker-IDs mit ihren Werten; gefüllt
// beim Render, beim Tab-/Datei-Wechsel (refreshBlockMetaForPane) und beim
// `blockData:changed`-Broadcast. Im PDF-Export blendet eine `.printing`-CSS-Regel
// den Marker aus; der Portable-Export nutzt eine eigene String-Pipeline ohne
// dieses DOM-Postprocessing und ist damit ohne Zutun frei von Indikatoren.
'use strict';

import { StateField, StateEffect } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { t } from '../i18n.js';
import { pathCompareKey } from '../../shared/platform.js';
import { api, getDocText } from './app/api.js';
import { state, getPaneEls } from './app/app-state.js';
import { paneEditors } from './editor/editor.js';
import { liveBasePathFacet } from './live/live-block-field.js';
import { openBlockPropsForAnchor } from './properties/block-props-panel.js';
import { extractBlockAnchors } from '../../shared/block-anchors.js';

// Cache: Datei-Pfad (lowercase) -> Map<ankerId, values>. Nur Anker mit
// nicht-leeren Werten. Speist Render-Pane und Live-Modus aus einer Quelle.
const metaByPath = new Map();

// 4T-1276 (Epic 3E-0232, Befund B1): Pfad-Identität über die zentrale Auskunft.
function pathKey(p) {
  return pathCompareKey(String(p || ''));
}

// Baut aus einer blockData-Map die Anker->values-Map (nur nicht-leere Werte).
function toMetaMap(blockData) {
  const map = new Map();
  for (const [id, entry] of Object.entries(blockData || {})) {
    if (entry && entry.values && Object.keys(entry.values).length > 0) {
      map.set(id, entry.values);
    }
  }
  return map;
}

// Hover-Text des Indikators: die Schlüssel-Wert-Liste des Ankers.
function indicatorTitle(values) {
  return Object.entries(values || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}

// Attributwert für einen `[id="…"]`-Selektor absichern (Anker-IDs sind
// \p{L}\p{N}_-, enthalten also normalerweise keine Sonderzeichen; defensiv).
function attrEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

// --- Render-Pane / Reading ---------------------------------------------------

function buildRenderIndicator(id, values) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'block-meta-indicator';
  btn.dataset.anchorId = id;
  btn.setAttribute('aria-label', t('blockProps.indicatorLabel'));
  btn.title = indicatorTitle(values);
  btn.textContent = '◆';
  return btn;
}

// Post-Prozessor für applyRenderPipeline: lädt die Block-Metadaten der Datei und
// hängt an jeden Block mit Daten (Element trägt die Anker-`id`) einen Indikator.
// Idempotent: vorhandene Indikatoren werden vorab entfernt (erneuter Render-Lauf
// im selben Container). Der Klick läuft über die Delegation in handleRenderedClick.
export async function applyBlockMetaIndicators(container, basePath) {
  if (!container || !basePath) return;
  container.querySelectorAll('.block-meta-indicator').forEach((el) => el.remove());
  let result;
  try {
    result = await api.readBlockData(basePath);
  } catch {
    return;
  }
  if (!result || !result.ok) return;
  const map = toMetaMap(result.blockData);
  metaByPath.set(pathKey(basePath), map);
  for (const [id, values] of map) {
    const block = container.querySelector(`[id="${attrEscape(id)}"]`);
    if (!block) continue;
    if (block.querySelector(':scope > .block-meta-indicator')) continue;
    block.appendChild(buildRenderIndicator(id, values));
  }
}

// --- Live-Modus (CodeMirror) -------------------------------------------------

// Anstoß zum Neuaufbau der Live-Dekorationen (nach Cache-Aktualisierung).
export const blockMetaRefreshEffect = StateEffect.define();

class BlockMetaWidget extends WidgetType {
  constructor(id, values) {
    super();
    this.id = id;
    this.values = values;
  }
  eq(other) {
    return other.id === this.id && indicatorTitle(other.values) === indicatorTitle(this.values);
  }
  toDOM() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-block-meta-indicator';
    btn.dataset.anchorId = this.id;
    btn.setAttribute('aria-label', t('blockProps.indicatorLabel'));
    btn.title = indicatorTitle(this.values);
    btn.textContent = '◆';
    const id = this.id;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openBlockPropsForAnchor(state.activePaneIndex, id);
    });
    return btn;
  }
  ignoreEvent() {
    return false;
  }
}

function buildBlockMetaDecos(editorState) {
  const map = metaByPath.get(pathKey(editorState.facet(liveBasePathFacet)));
  if (!map || map.size === 0) return Decoration.none;
  const text = getDocText(editorState.doc);
  const { lineById } = extractBlockAnchors(text);
  const ranges = [];
  for (const [id, values] of map) {
    const lineNo = lineById.get(id);
    if (!lineNo || lineNo > editorState.doc.lines) continue;
    const line = editorState.doc.line(lineNo);
    ranges.push(
      Decoration.widget({ widget: new BlockMetaWidget(id, values), side: 1 }).range(line.to),
    );
  }
  return Decoration.set(ranges, true);
}

export const blockMetaField = StateField.define({
  create(editorState) {
    return buildBlockMetaDecos(editorState);
  },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(blockMetaRefreshEffect)) return buildBlockMetaDecos(tr.state);
    }
    if (tr.docChanged) return buildBlockMetaDecos(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// --- Cache-Pflege ------------------------------------------------------------

// Lädt die Block-Metadaten einer Datei und stößt den Live-Neuaufbau der Pane an.
// Beim Tab-/Datei-Wechsel aus dem Editor-Sync gerufen, damit der Live-Indikator
// unabhängig vom geöffneten Panel erscheint.
export async function refreshBlockMetaForPane(paneIdx, path) {
  if (!path) return;
  let result;
  try {
    result = await api.readBlockData(path);
  } catch {
    return;
  }
  if (!result || !result.ok) return;
  metaByPath.set(pathKey(path), toMetaMap(result.blockData));
  const view = paneEditors[paneIdx];
  if (view) view.dispatch({ effects: blockMetaRefreshEffect.of(null) });
}

// Broadcast-Handler: fremde (und eigene) Metadaten-Änderungen ziehen Cache,
// Live-Dekoration und Render-Indikatoren aller Panes mit dieser Datei nach.
function handleBlockDataChanged(payload) {
  if (!payload || typeof payload.path !== 'string') return;
  const key = pathKey(payload.path);
  metaByPath.set(key, toMetaMap(payload.blockData));
  for (let p = 0; p < state.panes.length; p++) {
    const pane = state.panes[p];
    const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    if (!tab || !tab.path || pathKey(tab.path) !== key) continue;
    const view = paneEditors[p];
    if (view) view.dispatch({ effects: blockMetaRefreshEffect.of(null) });
    const els = getPaneEls(p);
    if (els && els.renderedHtml) applyBlockMetaIndicators(els.renderedHtml, tab.path);
  }
}

export function initBlockMetaIndicators() {
  if (typeof api.onBlockDataChanged === 'function') {
    api.onBlockDataChanged(handleBlockDataChanged);
  }
}
