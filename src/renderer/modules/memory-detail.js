// 4T-001601 (Epic 3E-000191, Story 4S-000906): Detail-Sicht je Gefäß-Art auf
// der Seite My Extended Memory.
//
// Die Zeile der Übersicht kürzt ab; die Detail-Sicht fächert auf, was das
// jeweilige Gefäß hergibt — vier Arten, vier festgelegte Sätze Kennzahlen.
// Drei Zusagen tragen den Aufbau:
//
// 1. KEINE NEUE ERHEBUNG. Gezeigt wird ausschließlich, was der Vertrag von
//    `memory:getViewData` ohnehin liefert: `stats.werte` aus dem
//    Beschleuniger (4T-001600), dazu `workspace` und `shelfOf`. Es entsteht
//    keine zweite Zähl-Grundlage (AK8).
// 2. NICHT VERFÜGBAR STATT NULL. Eine Kennzahl, die eine Quelle heute nicht
//    hergibt — Tags eines nicht geöffneten Bereichs etwa —, erscheint als
//    «nicht verfügbar». Eine Null behauptete eine gezählte Abwesenheit (AK7).
//    Die Zeile oberhalb lässt eine fehlende Kennzahl ganz weg, weil dort der
//    Platz knapp ist; hier ist die Abwesenheit selbst die Auskunft.
// 3. KEINE ZWEITE STATISTIK. Für den Bereich führt ein Weg zur ausführlichen
//    Bereichs-Statistik, statt sie hier nachzubauen (AK6). Die Auswahl hier
//    trägt den Vergleich zwischen Gefäßen, nicht die Einzel-Analyse.
//
// Eigener Zustand: allein der Merker des Sprungs (`wartetAufBereich`). Der
// Aufklapp-Zustand der Zeilen gehört der Seite und liegt in memory-page.js.
'use strict';

import { t } from '../i18n.js';
import { api } from './app/api.js';
import { state } from './app/app-state.js';
import { normalizeForCompare } from './area.js';
import { openAreaStatsPage } from './area-stats-page.js';
import { el, knopf, zahl, bytes, zeitpunkt } from './memory-bausteine.js';
import { showStatusbarHint } from './views/views.js';

// Platzhalter für einen Gegenstand, den dieses Gefäß gar nicht hat — ein
// Arbeitsbereich ohne gebundenes Buch etwa. Bewusst nicht
// `memory.notAvailable`: Dort fehlt eine Zahl, hier fehlt die Sache selbst
// (Muster task-dialog.js:54).
const OHNE = '—';

// Eine Kennzahl der Detail-Sicht. `null` und `undefined` heißen «nicht
// erhoben» und werden als solche benannt (AK7).
function kennzahl(wert, formatierer) {
  if (wert === null || wert === undefined) return t('memory.notAvailable');
  return formatierer(wert);
}

function werteVon(entry) {
  return entry.stats && entry.stats.werte ? entry.stats.werte : {};
}

// Je Art die festgelegte Auswahl (Punkt 1 des Lösungsansatzes). Sie folgt
// genau dem, was der Beschleuniger je Art führt (src/main/memory/
// memory-stats.js: `erhebeBereich`, `erhebeBuch`, `erhebeRegal`).
function detailZeilenBereich(entry) {
  const w = werteVon(entry);
  return [
    ['memory.detail.markdown', kennzahl(w.markdown, zahl)],
    ['memory.detail.nonMarkdown', kennzahl(w.nichtMarkdown, zahl)],
    ['memory.detail.folders', kennzahl(w.ordner, zahl)],
    ['memory.detail.bytes', kennzahl(w.bytes, bytes)],
    ['memory.detail.tags', kennzahl(w.tags, zahl)],
    ['memory.detail.tasks', kennzahl(w.aufgaben, zahl)],
    ['memory.detail.orphans', kennzahl(w.waisen, zahl)],
  ];
}

function detailZeilenBuch(entry) {
  const w = werteVon(entry);
  return [
    ['memory.detail.chapters', kennzahl(w.kapitel, zahl)],
    ['memory.detail.markdown', kennzahl(w.markdown, zahl)],
    ['memory.detail.bytes', kennzahl(w.bytes, bytes)],
    // Die Zugehörigkeit kommt aus den EINGETRAGENEN Regalen (`shelfOf` des
    // Vertrags). Ein Buch in einem nicht eingetragenen Regal gilt hier als
    // nicht zugeordnet — und genau das sagt der Text, statt eine Zuordnung zu
    // behaupten, die diese Seite nicht kennt.
    ['memory.detail.shelf', entry.shelfOf ? entry.shelfOf.name : t('memory.book.noShelf')],
  ];
}

function detailZeilenRegal(entry) {
  const w = werteVon(entry);
  return [
    ['memory.detail.books', kennzahl(w.buecher, zahl)],
    ['memory.detail.missing', kennzahl(w.fehlend, zahl)],
    ['memory.detail.markdown', kennzahl(w.markdown, zahl)],
    ['memory.detail.bytes', kennzahl(w.bytes, bytes)],
  ];
}

// Der Arbeitsbereich bekommt keinen Beschleuniger-Eintrag; seine Angaben
// stehen live im `workspace`-Teil des Vertrags.
function detailZeilenArbeitsbereich(entry) {
  const ws = entry.workspace || {};
  return [
    ['memory.detail.area', ws.area || OHNE],
    ['memory.detail.book', ws.book || OHNE],
    ['memory.detail.shelf', ws.shelf || OHNE],
    ['memory.detail.windows', kennzahl(ws.windows, zahl)],
    ['memory.detail.lastOpened', ws.lastOpenedAt ? zeitpunkt(ws.lastOpenedAt) : OHNE],
  ];
}

const DETAIL_ZEILEN = {
  workspace: detailZeilenArbeitsbereich,
  area: detailZeilenBereich,
  book: detailZeilenBuch,
  shelf: detailZeilenRegal,
};

// Kennzahlen-Tabelle nach dem Vorbild `kennzahlen()` in area-stats-page.js:155-169
// (Paare aus Bezeichnung und Wert), knapper als dort — keine Anteils-Zeilen und
// keine Sprung-Knöpfe, weil es hier keine Auffälligkeits-Listen gibt.
function detailTabelle(zeilen) {
  const table = el('table', 'memory-detail-figures');
  const tbody = document.createElement('tbody');
  for (const [bezeichnungKey, wert] of zeilen) {
    const tr = el('tr', 'memory-detail-row');
    tr.appendChild(el('td', 'memory-detail-name', t(bezeichnungKey)));
    tr.appendChild(el('td', 'memory-detail-value', wert));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// Merker des Sprungs in die ausführliche Bereichs-Statistik. Der Renderer
// erfährt vom gewechselten Bereich nicht aus der Antwort von `area:openPath`,
// sondern aus der Display-Info-Meldung: app-broadcasts.js:163-171 setzt
// `state.areaPath` dort. Deshalb wird der Sprung gemerkt und vom Ereignis
// ausgelöst statt von der Antwort.
let wartetAufBereich = null;

function istGleicherPfad(a, b) {
  return !!a && !!b && normalizeForCompare(a) === normalizeForCompare(b);
}

/**
 * Loest einen gemerkten Sprung aus, sobald der gewuenschte Bereich der
 * geoeffnete ist. Haengt in memory-page.js am Display-Info-Empfaenger.
 */
export function loeseSprungAus() {
  if (wartetAufBereich === null) return;
  if (!istGleicherPfad(state.areaPath, wartetAufBereich)) return;
  wartetAufBereich = null;
  openAreaStatsPage();
}

// Weg zur ausführlichen Bereichs-Statistik (AK6). Sie ist auf den Bereich
// DIESES Fensters festgelegt: `openAreaStatsPage()` (area-stats-page.js:63-70)
// nimmt keinen Pfad entgegen, sondern liest `state.areaPath`. Der Bereich muss
// also zuerst der geöffnete sein.
//
// `area:openPath` kennt drei Ausgänge (area-apps.js:329-367): Eine laufende
// Bereichs-App wird in den Vordergrund geholt (`focusedExisting`), eine leere
// App übernimmt den Bereich (`boundExisting`), sonst entsteht ein neues Fenster
// (`createdNew`). Nur im mittleren Fall ist der Bereich danach der dieses
// Fensters; in den beiden anderen führt der Weg in ein anderes Fenster, und
// ein Sprung hier zeigte die Zahlen eines fremden Bereichs. Deshalb die
// Meldung statt der Seite.
async function oeffneBereichsStatistik(entry) {
  if (istGleicherPfad(state.areaPath, entry.path)) {
    openAreaStatsPage();
    return;
  }
  wartetAufBereich = entry.path;
  let ergebnis;
  try {
    ergebnis = await api.openAreaPath(entry.path);
  } catch {
    ergebnis = null;
  }
  if (ergebnis && ergebnis.ok && ergebnis.boundExisting) {
    // Die Meldung kann schon vor der Antwort eingetroffen sein; dann hat sie
    // den Sprung ausgelöst und den Merker geleert, und der Aufruf hier tut
    // nichts mehr.
    loeseSprungAus();
    return;
  }
  wartetAufBereich = null;
  showStatusbarHint(
    ergebnis && ergebnis.ok ? 'memory.areaStats.otherWindow' : 'memory.areaStats.failed',
    { error: !(ergebnis && ergebnis.ok), duration: 4000 },
  );
}

/**
 * Inhalt des Andockpunkts einer aufgeklappten Zeile.
 *
 * Einen eigenen Oeffnen-Knopf bekommt er nicht: Der Knopf der Zeile steht
 * unmittelbar darueber und oeffnet dasselbe Gefaess beziehungsweise wechselt
 * in denselben Arbeitsbereich (AK5).
 *
 * @param {object} entry Eintrag aus `memory:getViewData`.
 * @returns {HTMLElement} Block mit Kennzahlen-Tabelle und ggf. dem Weg zur
 *   ausfuehrlichen Bereichs-Statistik.
 */
export function detailBlock(entry) {
  const block = el('div', 'memory-detail');
  block.appendChild(detailTabelle((DETAIL_ZEILEN[entry.kind] || detailZeilenBereich)(entry)));
  if (entry.kind !== 'area') return block;
  const aktionen = el('div', 'memory-detail-actions');
  aktionen.appendChild(
    knopf(
      'memory-action memory-action-area-stats',
      t('memory.action.areaStats'),
      () => void oeffneBereichsStatistik(entry),
      { disabled: entry.reachable === false },
    ),
  );
  block.appendChild(aktionen);
  return block;
}
