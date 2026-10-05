// 4T-002024 (Epic 3E-000192): Die Lage «Datentabelle angeklickt» bzw.
// «Diagramm ausgewählt» je Editor einer Spalte.
//
// **Warum ein eigener Zustand neben der Schreibmarke** (Entscheidungen des
// Product Owners vom 2026-09-30, «Auswählen», «Gitter bleibt», «Auch rechts»):
// Im Live-Modus klappt ein Block zum Quelltext auf, sobald die Schreibmarke in
// ihm steht. Ein Diagramm, das nach dem Anklicken gezeichnet bleiben soll, und
// eine Datentabelle, die als Gitter stehen bleibt, während in einer Zelle
// gearbeitet wird, lassen sich deshalb nicht über die Schreibmarke ausdrücken.
// Die Lage steht als `StateField` im Zustand des Editors: Die gerenderte Hälfte
// der geteilten Ansicht schreibt über dieselbe `EditorView`, und jede
// Transaktion führt die Lage mit.
//
// **Wert des Feldes:** `lage` = `{ art: 'datentabelle'|'diagramm', pos,
// modus: 'live'|'split' }` oder null, dazu `offen` = `{ pos }` oder null für
// einen offenen Dialog (Auflage des Schreib-Kerns, Durchsicht K4). `pos` ist
// immer der Anfang der Öffner-Zeile des Blocks.
//
// **Mitgeführt** wird `pos` über die Änderungen jeder Transaktion. Abgebildet
// wird mit `MapMode.TrackAfter` statt `TrackDel`: `TrackDel` meldet eine
// Löschung nur, wenn sie über die Stelle hinweg reicht; eine Löschung, die
// genau am Zeilen-Anfang beginnt (der ganze Block samt Öffner-Zeile), ließe die
// Stelle sonst auf den nachfolgenden Text rutschen. `TrackAfter` meldet jede
// Löschung, die das erste Zeichen der Öffner-Zeile trifft; ein Einfügen genau
// an der Stelle schiebt sie mit (`assoc` 1). Auch das Ersetzen des ganzen
// Dokuments beim Wechsel des geöffneten Dokuments trifft dieses Zeichen.
//
// **Gelöscht** wird die Lage durch eine Transaktion mit ausdrücklicher Auswahl,
// die von der bisherigen abweicht, durch den Effekt `loescheLage` (Klick
// daneben, Escape) und durch eine nicht mehr gelingende Abbildung. Eigene
// Schreib-Wege (Zell-Editor der Datentabelle, Schreiben des Diagramms) setzen
// keine Auswahl und lassen sie stehen. Eine Auswahl, die gleich bleibt, löscht
// sie nicht: Ein Klick in den Editor-Text trägt den Effekt ohnehin mit sich,
// und eine gleichbleibende Auswahl ist keine Handlung des Anwenders.
//
// **Ohne Änderbarkeit keine Klick-Lage** (Entscheidung der Nachbesserung vom
// 2026-09-30, F5): Solange der Editor schreibgeschützt ist, gilt eine Klick-Lage
// nicht und wird nicht hervorgehoben; wird Bearbeiten ausgeschaltet, während
// eine besteht, fällt sie.
//
// **Wo ein Block steht, wird je Dokument-Stand einmal erhoben** (V1): die
// Bereiche aller Datentabellen und Diagramm-Blöcke, nach denselben Regeln wie
// die Finder des Schreib-Kerns — die Datentabellen über dessen Fence-Suche
// selbst, die Diagramme über die Zaun-Regel und die Marke aus ihren Heimaten
// (`fence-level.js`, `perspective-chart-ref.js`, `link-scan.js`), in derselben
// Schleife wie `findChartBlockAtLine`. Eine Bewegung der Schreibmarke ändert
// den Stand nicht und kostet eine binäre Suche; eine Änderung, die keine
// Struktur-Zeile berührt (Zaun, Vorspann-Grenze, erste Zeile), verschiebt die
// Bereiche nur, statt sie neu zu erheben. Dass das Ergebnis mit den Findern des
// Kerns übereinstimmt, hält ein Eigenschafts-Fall mit Zufalls-Dokumenten fest
// (test/unit/renderer/diagramm-lage.test.js).
//
// Blatt: importiert nur `@codemirror/*` und prozess-neutrale Module aus
// `src/shared/`, damit der Grund-Satz des Editors es laden kann, ohne einen
// Zyklus zu bilden.
'use strict';

import { MapMode, StateEffect, StateField } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';

import { findPerspectiveDatatableFences } from '../../../shared/markdown/perspective-datatable-view.js';
import {
  koennteStrukturZeileSein,
  schliesstZaun,
  zaunOeffnung,
} from '../../../shared/markdown/fence-level.js';
import { istDiagrammFenceInfo } from '../../../shared/markdown/perspective-chart-ref.js';
import { frontmatterBodyStart } from '../../../shared/markdown/link-scan.js';

// --- Effekte -------------------------------------------------------------------

/** Setzt die Klick-Lage: `{ art, pos, modus }`, `pos` im neuen Dokument. */
export const setzeLage = StateEffect.define();
/** Löscht die Klick-Lage. */
export const loescheLage = StateEffect.define();
/** Merkt die Stelle des Blocks, zu dem ein Dialog offen ist: `{ pos }`. */
export const merkeOffen = StateEffect.define();
/** Vergisst die Stelle des offenen Dialogs. */
export const vergissOffen = StateEffect.define();

const LEER = Object.freeze({ lage: null, offen: null });

const ARTEN = ['datentabelle', 'diagramm'];

function bilde(pos, changes) {
  const neu = changes.mapPos(pos, 1, MapMode.TrackAfter);
  return neu == null ? null : neu;
}

const lageFeld = StateField.define({
  create: () => LEER,
  update(wert, tr) {
    let { lage, offen } = wert;
    if (tr.docChanged) {
      if (lage) {
        const pos = bilde(lage.pos, tr.changes);
        lage = pos == null ? null : pos === lage.pos ? lage : { ...lage, pos };
      }
      if (offen) {
        const pos = bilde(offen.pos, tr.changes);
        offen = pos == null ? null : pos === offen.pos ? offen : { pos };
      }
    }
    if (lage && tr.selection && !tr.selection.eq(tr.startState.selection.map(tr.changes))) {
      lage = null;
    }
    for (const e of tr.effects) {
      if (e.is(setzeLage)) {
        const v = e.value;
        lage =
          v && ARTEN.includes(v.art) && Number.isInteger(v.pos)
            ? { art: v.art, pos: v.pos, modus: v.modus === 'split' ? 'split' : 'live' }
            : null;
      } else if (e.is(loescheLage)) {
        lage = null;
      } else if (e.is(merkeOffen)) {
        offen = e.value && Number.isInteger(e.value.pos) ? { pos: e.value.pos } : null;
      } else if (e.is(vergissOffen)) {
        offen = null;
      }
    }
    return lage === wert.lage && offen === wert.offen ? wert : { lage, offen };
  },
});

function feld(state) {
  return (state && state.field(lageFeld, false)) || LEER;
}

/** Die gesetzte Klick-Lage des Zustands, ungeprüft, oder null. */
export function klickLage(state) {
  return feld(state).lage;
}

/** Die mitgeführte Stelle des offenen Dialogs oder null. */
export function offenFuer(view) {
  const offen = view ? feld(view.state).offen : null;
  return offen ? offen.pos : null;
}

// --- Lesen ---------------------------------------------------------------------

const KEINE = Object.freeze({
  inDatentabelle: false,
  diagrammGewaehlt: false,
  art: null,
  zeile: null,
  quelle: null,
});

// --- Block-Bereiche je Dokument-Stand (V1) ------------------------------------

// Die Bereiche aller Datentabellen und Diagramm-Blöcke eines Textes:
// `{ datentabelle: [{ open, close }], diagramm: [...] }`, Zeilen 1-basiert,
// `close` null bei einem nicht geschlossenen Zaun (er reicht bis zum Ende).
function erhebeBereiche(text) {
  const zeilen = text.split('\n');
  const n = zeilen.length;
  // Datentabellen: die Fence-Suche des Kerns selbst (Grundlage von
  // `findDatatableAtLine`); ein offener Zaun trägt dort `closeLine` n + 1.
  const datentabelle = findPerspectiveDatatableFences(text).map((f) => ({
    open: f.openLine,
    close: f.closeLine <= n ? f.closeLine : null,
  }));
  // Diagramme: dieselbe Schleife wie `findChartBlockAtLine` im Schreib-Kern,
  // hier über alle Zeilen statt bis zur gefragten.
  const diagramm = [];
  let offen = null;
  for (let i = frontmatterBodyStart(zeilen); i < n; i++) {
    if (offen) {
      if (!schliesstZaun(zeilen[i], offen.oeffnung)) continue;
      if (offen.chart) diagramm.push({ open: offen.open + 1, close: i + 1 });
      offen = null;
      continue;
    }
    const oeffnung = zaunOeffnung(zeilen[i]);
    if (oeffnung) offen = { open: i, oeffnung, chart: istDiagrammFenceInfo(oeffnung.sprache) };
  }
  if (offen && offen.chart) diagramm.push({ open: offen.open + 1, close: null });
  return { datentabelle, diagramm };
}

// Ob eine Zeile die Bereiche verschieben kann (Zaun, Grenze des Vorspanns),
// sagt `koennteStrukturZeileSein` bei der Zaun-Regel in fence-level.js, bewusst
// als Obermenge der Regeln.
// Größere Änderungen werden nicht Zeile für Zeile geprüft, sondern neu erhoben.
const MAX_GEPRUEFTE_ZEILEN = 200;

function beruehrtStruktur(doc, von, bis) {
  const a = doc.lineAt(von).number;
  const b = doc.lineAt(bis).number;
  // Ob ein Vorspann beginnt, entscheidet eine erste Zeile `---`; sie ist selbst
  // eine Struktur-Zeile, eine eigene Regel für die erste Zeile braucht es nicht.
  if (b - a > MAX_GEPRUEFTE_ZEILEN) return true;
  for (let z = a; z <= b; z++) if (koennteStrukturZeileSein(doc.line(z).text)) return true;
  return false;
}

// Verschiebt die Bereiche durch eine Transaktion, die keine Struktur-Zeile
// berührt; sonst null (neu erheben, wenn wieder gefragt wird).
function bildeBereiche(alt, tr) {
  let strukturell = false;
  tr.changes.iterChanges((fromA, toA, fromB, toB) => {
    if (strukturell) return;
    strukturell =
      beruehrtStruktur(tr.startState.doc, fromA, toA) || beruehrtStruktur(tr.newDoc, fromB, toB);
  });
  if (strukturell) return null;
  const zeile = (z) =>
    tr.newDoc.lineAt(tr.changes.mapPos(tr.startState.doc.line(z).from, -1)).number;
  const bilde = (liste) =>
    liste.map((b) => ({ open: zeile(b.open), close: b.close === null ? null : zeile(b.close) }));
  return { datentabelle: bilde(alt.datentabelle), diagramm: bilde(alt.diagramm) };
}

// Bereiche je Dokument (unveränderlicher Text von CodeMirror).
const bereicheJeDoc = new WeakMap();

// Trägt die Bereiche über Änderungen des Dokuments hinweg; null, solange nicht
// gefragt oder nach einer strukturellen Änderung.
const bereichFeld = StateField.define({
  create: () => null,
  update(wert, tr) {
    if (!tr.docChanged) return wert;
    const alt = wert || bereicheJeDoc.get(tr.startState.doc);
    return alt ? bildeBereiche(alt, tr) : null;
  },
});

function bereicheVon(state) {
  let bereiche = bereicheJeDoc.get(state.doc);
  if (!bereiche) {
    bereiche = state.field(bereichFeld, false) || erhebeBereiche(state.doc.toString());
    bereicheJeDoc.set(state.doc, bereiche);
  }
  return bereiche;
}

// Der Block dieser Art, in dessen Bereich `zeile` liegt (`{ open, close }`),
// oder null. Die Bereiche einer Art überlappen nicht und stehen in
// Dokument-Reihenfolge.
function bereichBei(state, art, zeile) {
  const liste = bereicheVon(state)[art];
  let lo = 0;
  let hi = liste.length - 1;
  let treffer = -1;
  while (lo <= hi) {
    const mitte = (lo + hi) >> 1;
    if (liste[mitte].open <= zeile) {
      treffer = mitte;
      lo = mitte + 1;
    } else {
      hi = mitte - 1;
    }
  }
  if (treffer < 0) return null;
  const b = liste[treffer];
  const ende = b.close === null ? state.doc.lines : b.close;
  return zeile <= ende ? b : null;
}

function oeffnerBei(state, art, zeile) {
  const b = bereichBei(state, art, zeile);
  return b ? b.open : null;
}

/**
 * Die Datentabelle bzw. der Diagramm-Block an einer Zeile, wie ihn
 * `findDatatableAtLine` bzw. `findChartBlockAtLine` des Schreib-Kerns finden,
 * aus den Bereichen des Dokument-Stands: Öffner- und Schluss-Zeile, `close`
 * null bei einem nicht geschlossenen Zaun.
 *
 * @param {EditorState} state
 * @param {'datentabelle'|'diagramm'} art
 * @param {number} zeile 1-basiert.
 * @returns {{open: number, close: (number|null)}|null}
 */
export function blockBei(state, art, zeile) {
  return bereichBei(state, art, zeile);
}

// Beginnt an Zeile `zeile` ein Block dieser Art?
function beginntHier(state, art, zeile) {
  return oeffnerBei(state, art, zeile) === zeile;
}

function ergebnis(art, zeile, quelle) {
  return Object.freeze({
    inDatentabelle: art === 'datentabelle',
    diagrammGewaehlt: art === 'diagramm',
    art,
    zeile,
    quelle,
  });
}

// Cache je Zustand und Ansicht: Palette, Menü und Kontextmenü lesen dieselbe
// Lage mehrfach je Stand.
const cache = new WeakMap();

/**
 * Die Lage im Editor einer Spalte.
 *
 * Gilt die Klick-Lage (gesetzt in derselben Ansicht, an ihrer Zeile beginnt
 * ein Block ihrer Art), gewinnt sie; sonst zählt die Schreibmarke, wenn sie in
 * einer Datentabelle oder einem Diagramm-Block steht.
 *
 * @param {EditorView} view Editor der Spalte.
 * @param {{viewMode: string}|null} tab geöffnetes Dokument der Spalte.
 * @returns {{inDatentabelle: boolean, diagrammGewaehlt: boolean,
 *   art: ('datentabelle'|'diagramm'|null), zeile: (number|null),
 *   quelle: ('klick'|'marke'|null)}} `zeile` ist die Öffner-Zeile (1-basiert).
 */
export function lageFuer(view, tab) {
  const state = view && view.state;
  if (!state) return KEINE;
  const modus = tab ? tab.viewMode : null;
  let jeModus = cache.get(state);
  if (!jeModus) {
    jeModus = new Map();
    cache.set(state, jeModus);
  }
  if (jeModus.has(modus)) return jeModus.get(modus);
  let erg = KEINE;
  const { lage } = feld(state);
  if (lage && !state.readOnly && lage.modus === modus && lage.pos <= state.doc.length) {
    const zeile = state.doc.lineAt(lage.pos).number;
    if (beginntHier(state, lage.art, zeile)) erg = ergebnis(lage.art, zeile, 'klick');
  }
  if (erg === KEINE) {
    const zeile = state.doc.lineAt(state.selection.main.head).number;
    for (const art of ARTEN) {
      const open = oeffnerBei(state, art, zeile);
      if (open !== null) {
        erg = ergebnis(art, open, 'marke');
        break;
      }
    }
  }
  jeModus.set(modus, erg);
  return erg;
}

// --- Hervorhebung im Live-Modus ------------------------------------------------

/** Klasse des ausgewählten Diagramms im Live-Modus. */
export const KLASSE_GEWAEHLT = 'diagramm-gewaehlt';

// Hüllen, deren Diagramme ein anderes Dokument zeigen (dieselbe Regel wie
// `istAktiverOrt` in database/datensatz-zeilen-zugang.js; hier zusätzlich zur
// Zuordnung über die Stelle, die allein schon eindeutig ist).
const PASSIV = '.wiki-embed-md-body, .perspective-script-md';

// Das Diagramm-Element des Live-Widgets an der Stelle der Lage, oder null.
function gewaehltesElement(view) {
  const { lage } = feld(view.state);
  if (!lage || lage.art !== 'diagramm' || lage.modus !== 'live' || view.state.readOnly) {
    return null;
  }
  for (const el of view.contentDOM.querySelectorAll('.perspective-chart')) {
    if (el.closest(PASSIV)) continue;
    let pos;
    try {
      pos = view.posAtDOM(el);
    } catch {
      continue;
    }
    if (typeof pos === 'number' && view.state.doc.lineAt(pos).from === lage.pos) return el;
  }
  return null;
}

// Setzt die Klasse nach dem Aufbau des DOM: `update` eines Plugins läuft vor
// dem DOM-Abgleich, das Widget eines neu gebauten Blocks steht erst danach.
// Umriss statt Rahmen im Stilblatt: Die Höhe des Widgets ändert sich nicht.
const hervorhebung = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.aktiv = false;
      this.plane();
    }
    update(update) {
      // Bearbeiten ausgeschaltet, während eine Lage besteht: Sie fällt (F5).
      // Gelöscht wird nach dem Update, weil ein Plugin darin nicht schreiben darf.
      if (update.state.readOnly && !update.startState.readOnly && feld(update.state).lage) {
        const view = this.view;
        queueMicrotask(() => {
          if (view.state.readOnly && feld(view.state).lage) {
            view.dispatch({ effects: loescheLage.of(null) });
          }
        });
      }
      if (this.aktiv || feld(this.view.state).lage) this.plane();
    }
    plane() {
      this.view.requestMeasure({
        key: this,
        read: (view) => gewaehltesElement(view),
        write: (ziel, view) => {
          for (const el of view.contentDOM.querySelectorAll(`.${KLASSE_GEWAEHLT}`)) {
            if (el !== ziel) el.classList.remove(KLASSE_GEWAEHLT);
          }
          if (ziel) ziel.classList.add(KLASSE_GEWAEHLT);
          this.aktiv = !!ziel;
        },
      });
    }
    destroy() {
      for (const el of this.view.contentDOM.querySelectorAll(`.${KLASSE_GEWAEHLT}`)) {
        el.classList.remove(KLASSE_GEWAEHLT);
      }
    }
  },
);

// --- Meldung an das Menü der Anwendung ------------------------------------------

/** Ruhe-Zeit, nach der eine Änderung von Auswahl oder Dokument gemeldet wird. */
export const MELDE_RUHE_MS = 150;

let melde = null;
let tabFuerView = null;

/**
 * Trägt die Meldung an das Menü der Anwendung ein.
 *
 * @param {Function} fn wird ohne Argument gerufen, wenn sich im Editor der
 *   aktiven Spalte das Paar `inDatentabelle`/`diagrammGewaehlt` geändert hat.
 * @param {Function} [tabFuer] (view) => geöffnetes Dokument, wenn `view` der
 *   Editor der aktiven Spalte ist, sonst null. Ohne sie wird nie gemeldet, weil
 *   dieses Modul die Spalten nicht kennt.
 */
export function registriereLageMeldung(fn, tabFuer) {
  melde = typeof fn === 'function' ? fn : null;
  tabFuerView = typeof tabFuer === 'function' ? tabFuer : null;
}

// Das zuletzt tatsächlich an das Menü gesendete Paar (F2). Es wird an der
// einen Stelle gemerkt, die den Zustand baut und sendet (`reportMenuStateNow`
// in tabs/tabs.js ruft `merkeGemeldeteLage`), und jede Flanke vergleicht
// gegen dieses Paar. Ein eigenes Gedächtnis der Lausch-Stelle ginge falsch,
// sobald eine Meldung auf einem anderen Weg entsteht, etwa beim Aktivieren
// einer Spalte: Dann verglich sie gegen einen Stand, den das Menü nicht hat.
let gesendet = 'false|false';

/**
 * Merkt das Paar, das eben an das Menü der Anwendung gesendet wurde.
 *
 * @param {{inDatentabelle: boolean, diagrammGewaehlt: boolean}} lage
 */
export function merkeGemeldeteLage(lage) {
  gesendet = `${!!(lage && lage.inDatentabelle)}|${!!(lage && lage.diagrammGewaehlt)}`;
}

// Je Editor: laufender Zeitgeber der Ruhe-Zeit.
const zeitgeber = new WeakMap();

function paar(view) {
  const tab = tabFuerView ? tabFuerView(view) : null;
  if (!tab) return null;
  const erg = lageFuer(view, tab);
  return `${erg.inDatentabelle}|${erg.diagrammGewaehlt}`;
}

function pruefeUndMelde(view) {
  const timer = zeitgeber.get(view);
  if (timer) {
    clearTimeout(timer);
    zeitgeber.delete(view);
  }
  if (!melde) return;
  const jetzt = paar(view);
  if (jetzt === null || jetzt === gesendet) return;
  try {
    melde();
  } catch (err) {
    console.warn('chart-lage: Meldung an das Menü fehlgeschlagen:', err);
  }
}

function klickGeaendert(update) {
  return update.transactions.some((tr) =>
    tr.effects.some((e) => e.is(setzeLage) || e.is(loescheLage)),
  );
}

const flanke = EditorView.updateListener.of((update) => {
  if (!melde) return;
  const view = update.view;
  if (klickGeaendert(update)) {
    queueMicrotask(() => pruefeUndMelde(view));
    return;
  }
  if (!update.docChanged && !update.selectionSet) return;
  const timer = zeitgeber.get(view);
  if (timer) clearTimeout(timer);
  zeitgeber.set(
    view,
    setTimeout(() => pruefeUndMelde(view), MELDE_RUHE_MS),
  );
});

/**
 * Die Erweiterung für den Grund-Satz des Editors: Zustands-Feld,
 * Hervorhebungs-Plugin und Lausch-Stelle für die Meldung an das Menü.
 */
export const lageErweiterung = [lageFeld, bereichFeld, hervorhebung, flanke];
