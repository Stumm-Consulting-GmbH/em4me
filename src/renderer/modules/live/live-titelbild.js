// 4T-002630 (Epic 3E-000395, V7): Das Titelbild der Live-Ansicht.
//
// **Was es zeigt.** Denselben Kopf-Bereich wie die gerenderte Ansicht, aus
// derselben Quelle: Der Kopf des Dokuments (Zeile 1 bis zur Schluss-Zeile) geht
// mit der Option `titelbild` durch `api.renderMarkdown`, also durch den Kern
// `src/shared/markdown/titelbild.js` und die Bild-Auflösung des Vorlade-Skripts.
// Bei der Wiki-Form löst `applyWikiEmbedsIfPresent` den Platzhalter mit
// Namens-Suche und Grenze auf, wie in den übrigen Widgets der Live-Ansicht.
//
// **Wo und wie lange.** Ein Block-Widget am Anfang des Dokuments (`block: true`,
// `side: -1`) aus einem eigenen StateField, wie CodeMirror es für Block-Widgets
// verlangt (Muster `workflows/workflow-kopf.js`). Es steht über der
// Frontmatter-Zeile und bleibt stehen, während die Schreibmarke im Kopf steht,
// unabhängig von der Einstellung der Frontmatter-Anzeige; `live-block-field.js`
// bleibt unberührt. Ein Klick setzt die Schreibmarke nicht (`ignoreEvent`).
//
// **Wann neu.** Beim Anlegen, bei jeder Änderung, deren Bereich den Kopf berührt,
// beim Wechsel der Konfiguration (Pfad des Dokuments über `liveBasePathFacet`)
// und beim Effekt `liveRebuildEffect` (Erweiterung umgeschaltet, Sprache
// gewechselt). Änderungen unterhalb des Kopfs bilden die Dekoration nur ab.
// `eq` vergleicht Angaben, Pfad und Sprache, damit nicht jeder Tastendruck im
// Kopf das Bild neu liest.
//
// **Klasse im Teilbaum-Wächter:** Widget-Extraktion (test/unit/render-teilbaum-
// schritte.test.js): Ein einzelnes Konstrukt im Editor, ohne Schritt-Satz; der
// Kopf-Bereich braucht allein Übersetzung und Einbettung, die er selbst zieht.
//
// **Facet und Einbettung kommen hereingereicht** (`liveTitelbild`), wie bei
// `workflowKopf(liveBasePathFacet)`: Ein Import von `live-block-field.js` oder
// `render-mermaid.js` zöge dieses Modul in den eingefrorenen Datei-Zyklus des
// Renderers (test/unit/ordner-import-zyklen.test.js); `live-widgets.js` steht
// schon darin und reicht beides.
'use strict';

import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { extractFrontmatter } from '../../../shared/markdown/frontmatter.js';
import { titelbildAngaben } from '../../../shared/markdown/titelbild.js';
import { applyTranslations, getLanguage } from '../../i18n.js';
import { api } from '../app/api.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { detectFrontmatterLines } from './live-marker-fields.js';
import { liveRebuildEffect } from './live-shared.js';
import { beobachteWidgetHoehe, loeseWidgetHoehenBeobachtung } from './live-widget-hoehe.js';

/** Kennung der Erweiterung in der Registry (src/shared/extensions/extensions.js). */
export const TITELBILD_ERWEITERUNG = 'cover-image';

// Abstand unter dem Kopf-Bereich (0.7em der Frontmatter-Zeile), für die Schätzung.
const ABSTAND_UNTEN = 12;

export class TitelbildWidget extends WidgetType {
  constructor(angaben, kopfQuelle, basePath, sprache, einbetten = null) {
    super();
    this.angaben = angaben;
    this.kopfQuelle = kopfQuelle;
    this.basePath = basePath || '';
    this.sprache = sprache || '';
    this.einbetten = einbetten;
  }
  eq(other) {
    return (
      other instanceof TitelbildWidget &&
      other.angaben.quelle === this.angaben.quelle &&
      other.angaben.form === this.angaben.form &&
      other.angaben.hoehe === this.angaben.hoehe &&
      other.angaben.lage === this.angaben.lage &&
      other.basePath === this.basePath &&
      other.sprache === this.sprache
    );
  }
  get estimatedHeight() {
    return this.angaben.hoehe + ABSTAND_UNTEN;
  }
  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-live-titelbild markdown-body';
    try {
      container.innerHTML = api.renderMarkdown(this.kopfQuelle, this.basePath, {
        titelbild: true,
        frontmatterBlock: false,
      });
      // Leerraum-Knoten der obersten Ebene bildeten im Widget-Kasten eine eigene
      // Textzeile (Muster FrontmatterBlockWidget).
      for (const knoten of [...container.childNodes]) {
        if (knoten.nodeType === Node.TEXT_NODE && !String(knoten.textContent || '').trim()) {
          knoten.remove();
        }
      }
      applyTranslations(container);
      // Das Bild lädt nach dem Einhängen; die Höhe meldet der Beobachter.
      beobachteWidgetHoehe(container);
      if (this.angaben.form === 'wiki' && this.basePath && this.einbetten) {
        Promise.resolve(this.einbetten(container, this.basePath)).catch((err) => {
          console.warn('TitelbildWidget Einbettungs-Fehler:', err);
        });
      }
    } catch (err) {
      console.warn('TitelbildWidget Render-Fehler:', err);
    }
    return container;
  }
  destroy(dom) {
    loeseWidgetHoehenBeobachtung(dom);
  }
  ignoreEvent() {
    return true;
  }
}

// Ende des Kopfs als Offset, oder die Grenze, bis zu der eine Änderung einen
// Kopf entstehen lassen kann: ohne Kopf die erste Zeile, bei offenem Kopf
// (Zeile 1 ist `---`, aber ohne Schluss-Zeile) das ganze Dokument.
function kopfGrenze(doc, kopf) {
  if (kopf) return doc.line(kopf.toLine).to;
  const erste = doc.line(1);
  return erste.text.trimEnd() === '---' ? doc.length : erste.to;
}

function baue(state, pfadFacet, einbetten) {
  const kopf = detectFrontmatterLines(state.doc);
  const grenze = kopfGrenze(state.doc, kopf);
  if (!kopf || !isExtensionActive(TITELBILD_ERWEITERUNG)) return { deko: Decoration.none, grenze };
  const kopfQuelle = state.doc.sliceString(0, state.doc.line(kopf.toLine).to);
  const fm = extractFrontmatter(kopfQuelle);
  const angaben = titelbildAngaben(fm.parseError ? null : fm.data);
  if (!angaben || !angaben.form) return { deko: Decoration.none, grenze };
  const pfad = pfadFacet ? state.facet(pfadFacet) : '';
  const widget = new TitelbildWidget(angaben, kopfQuelle, pfad, getLanguage(), einbetten);
  return {
    deko: Decoration.set([Decoration.widget({ widget, block: true, side: -1 }).range(0)]),
    grenze,
  };
}

function beruehrtKopf(tr, grenze) {
  let beruehrt = false;
  tr.changes.iterChangedRanges((vonA) => {
    if (vonA <= grenze) beruehrt = true;
  });
  return beruehrt;
}

/**
 * Das Titelbild der Live-Ansicht als StateField; eingehängt in
 * `livePreviewExtensions`.
 *
 * @param {object} [opts]
 * @param {import('@codemirror/state').Facet} [opts.pfadFacet] Facet mit dem Pfad
 *   des Dokuments (`liveBasePathFacet`).
 * @param {(container: HTMLElement, basePath: string) => Promise<void>} [opts.einbetten]
 *   Auflösung der Wiki-Form (`applyWikiEmbedsIfPresent`).
 * @returns {import('@codemirror/state').StateField}
 */
export function liveTitelbild({ pfadFacet = null, einbetten = null } = {}) {
  const pfadVon = (state) => (pfadFacet ? state.facet(pfadFacet) : '');
  return StateField.define({
    create(state) {
      return baue(state, pfadFacet, einbetten);
    },
    update(wert, tr) {
      if (tr.effects.some((e) => e.is(liveRebuildEffect)))
        return baue(tr.state, pfadFacet, einbetten);
      if (tr.reconfigured && pfadVon(tr.startState) !== pfadVon(tr.state)) {
        return baue(tr.state, pfadFacet, einbetten);
      }
      if (!tr.docChanged) return wert;
      if (beruehrtKopf(tr, wert.grenze)) return baue(tr.state, pfadFacet, einbetten);
      return { deko: wert.deko.map(tr.changes), grenze: tr.changes.mapPos(wert.grenze) };
    },
    provide: (f) => EditorView.decorations.from(f, (wert) => wert.deko),
  });
}
