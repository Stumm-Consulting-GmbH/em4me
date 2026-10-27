// 4T-002351 (Epic 3E-000184): Die Kopfzeile über dem `workflow`-Block der
// Live-Ansicht mit dem Ergebnis der Prüfung vor dem Laufen.
//
// **Was sie zeigt** (Story 4S-001107; Entscheidungen der Sitzung vom
// 2026-10-23, E2 bis E5): grün «bereit» oder rot den ersten Befund mit Zeile im
// Dokument und Grund, bei weiteren mit «(+N weitere)» und der vollständigen
// Liste beim Darüberfahren; bei zwei oder mehr Blöcken über jedem den Hinweis.
// In der Live-Ansicht über dieses Feld (es hängt in `livePreviewExtensions`),
// in der gerenderten Ansicht und der Vorschau der geteilten Ansicht über
// `workflow-kopf-gerendert.js` (Entscheidung des Product Owners vom
// 2026-10-23), beide aus dem Baustein `workflow-kopfzeile.js`; allein in einer
// Datei mit Kennzeichen `workflow: true`.
//
// **Woher:** `pruefeWorkflow` aus `workflow-pruefung.js`, dieselbe Funktion wie
// beim Start. Die Lage der Kopfzeilen sind die Zaun-Zeilen, die der Kern
// liefert (`blockLines`); ein eigener Zaun-Durchlauf entsteht nicht. Gelesen
// wird der Stand des Puffers, kein Index.
//
// **Wann:** beim Anlegen des Felds sofort, nach einer Text-Änderung im Takt von
// 300 ms (derselbe Takt wie `LINT_DEBOUNCE_MS` des Linters) und beim Effekt
// `liveRebuildEffect` sofort (Erweiterung umgeschaltet, Sprache gewechselt).
// Dazwischen folgt die Kopfzeile dem Text über `map`. Sieht das Feld beim
// Anlegen einen anderen Text als den aktuellen (Laden des Dokuments zusammen
// mit dem Wechsel in die Live-Ansicht), holt das Plugin die Rechnung ohne
// Takt nach.
//
// **Platzierung:** ein Block-Widget am Anfang der Zaun-Zeile (`block: true`,
// `side: -1`), aus einem StateField, wie CodeMirror es für Block-Widgets
// verlangt. Gemessen am gebauten Programm vor der Umsetzung (Lösungs-Kapitel
// des Tasks): Es steht neben dem ersetzenden Widget des zugeklappten Blocks.
//
// **Schnittstelle für den Knopf «Starten» (4T-002349):** `registriereKopfAktion`,
// seit dem Nachzug vom 2026-10-24 im gemeinsamen Baustein
// `workflow-kopfzeile.js`, den auch die gerenderte Ansicht nutzt
// (`workflow-kopf-gerendert.js`); hier weitergereicht. Vorprüfung, Markup und
// Aufruf der Aktionen kommen von dort, dieses Modul trägt allein die
// Platzierung im Editor. Das Widget fängt alle Ereignisse ab (`ignoreEvent`),
// damit ein Klick weder die Schreibmarke setzt noch den Block aufklappt.
'use strict';

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { getLanguage } from '../../i18n.js';
import { getDocText } from '../app/api.js';
import { liveRebuildEffect } from '../live/live-shared.js';
import { baueKopfzeile, kopfAnalyse } from './workflow-kopfzeile.js';
import { kopfAussage } from './workflow-pruefung.js';

export { kopfAktionenZuruecksetzen, registriereKopfAktion } from './workflow-kopfzeile.js';

/** Takt der Prüfung nach einer Text-Änderung, wie der Linter. */
export const PRUEF_TAKT_MS = 300;

// Vorprüfung und Analyse aus dem gemeinsamen Baustein, am Stand des Puffers.
function analysiere(state, pfadFacet) {
  const fileName = pfadFacet ? state.facet(pfadFacet) : '';
  return kopfAnalyse(state.doc.line(1).text, () => getDocText(state.doc), fileName);
}

export class WorkflowKopfWidget extends WidgetType {
  constructor(zaunZeile, aussage, analyse, pfadFacet = null) {
    super();
    this.zaunZeile = zaunZeile;
    this.aussage = aussage;
    this.analyse = analyse;
    this.pfadFacet = pfadFacet;
    this.sprache = getLanguage();
  }
  eq(other) {
    return (
      other instanceof WorkflowKopfWidget &&
      other.zaunZeile === this.zaunZeile &&
      other.sprache === this.sprache &&
      other.aussage.ok === this.aussage.ok &&
      other.aussage.text === this.aussage.text &&
      other.aussage.liste.join('\n') === this.aussage.liste.join('\n')
    );
  }
  get estimatedHeight() {
    return 24;
  }
  toDOM(view) {
    const pfadFacet = this.pfadFacet;
    return baueKopfzeile({
      zaunZeile: this.zaunZeile,
      aussage: this.aussage,
      analyse: this.analyse,
      view,
      dokument: () => ({
        path: pfadFacet ? view.state.facet(pfadFacet) : '',
        text: view.state.doc.toString(),
      }),
    });
  }
  ignoreEvent() {
    return true;
  }
}

function baueKoepfe(state, analyse, pfadFacet) {
  if (!analyse.isWorkflow) return Decoration.none;
  const koepfe = [];
  for (const zeile of analyse.blockLines) {
    if (zeile < 1 || zeile > state.doc.lines) continue;
    const aussage = kopfAussage(analyse, zeile);
    const widget = new WorkflowKopfWidget(zeile, aussage, analyse, pfadFacet);
    koepfe.push(
      Decoration.widget({ widget, block: true, side: -1 }).range(state.doc.line(zeile).from),
    );
  }
  return Decoration.set(koepfe, true);
}

/**
 * Die Erweiterung der Kopfzeile.
 *
 * @param {import('@codemirror/state').Facet} [pfadFacet] Facet mit dem Pfad des
 *   Dokuments (in der Live-Ansicht `liveBasePathFacet`); er dient dem Kern als
 *   Rückfall für den Namen des Workflows.
 * @returns {import('@codemirror/state').Extension}
 */
export function workflowKopf(pfadFacet) {
  const setzeAnalyse = StateEffect.define();
  const feld = StateField.define({
    create(state) {
      const analyse = analysiere(state, pfadFacet);
      return { analyse, koepfe: baueKoepfe(state, analyse, pfadFacet), doc: state.doc };
    },
    update(wert, tr) {
      for (const e of tr.effects) {
        if (e.is(setzeAnalyse)) {
          return {
            analyse: e.value,
            koepfe: baueKoepfe(tr.state, e.value, pfadFacet),
            doc: tr.state.doc,
          };
        }
        if (e.is(liveRebuildEffect)) {
          const analyse = analysiere(tr.state, pfadFacet);
          return { analyse, koepfe: baueKoepfe(tr.state, analyse, pfadFacet), doc: tr.state.doc };
        }
      }
      if (!tr.docChanged) return wert;
      return { ...wert, koepfe: wert.koepfe.map(tr.changes) };
    },
    provide: (f) => EditorView.decorations.from(f, (wert) => wert.koepfe),
  });
  const takt = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.timer = null;
        this.nachholen();
      }
      // Gemessen am laufenden Programm: Kommt das Feld mit einer Umkonfiguration
      // in den Zustand, rechnet `create` am leeren Dokument, und das geladene
      // Dokument erreicht das Plugin ohne `docChanged`. Weicht der gerechnete
      // Stand vom aktuellen ab, wird deshalb ohne Takt nachgeholt.
      nachholen() {
        if (this.timer === null && this.view.state.field(feld).doc !== this.view.state.doc) {
          this.planen(0);
        }
      }
      planen(ms) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          const analyse = analysiere(this.view.state, pfadFacet);
          this.view.dispatch({ effects: setzeAnalyse.of(analyse) });
        }, ms);
      }
      update(update) {
        if (update.docChanged) this.planen(PRUEF_TAKT_MS);
        else this.nachholen();
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
  );
  return [feld, takt];
}
