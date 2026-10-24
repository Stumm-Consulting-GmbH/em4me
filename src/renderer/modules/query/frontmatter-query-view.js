'use strict';

// 4T-000355 (Epic 3E-000065): Renderer-seitige Anzeige der Frontmatter-Abfrage.
// Der perspective-query-Fence rendert (aus 4T-000354) als leerer Platzhalter
// <div class="perspective-query" data-fm-query="…">. Dieses Modul befüllt den
// Platzhalter asynchron über das Abfrage-IPC mit der klickbaren Datei-Liste,
// hält sie über die Index-Invalidierung aktuell und stellt die Idle-Barriere
// für den PDF-Export bereit.
//
// Modus-agnostisch: derselbe Resolver läuft in Render-Pane, Reading und im
// Live-Block-Widget; den Klick übernehmen die zentralen Klick-Handler
// (data-fm-path -> openInPane), nicht dieses Modul. Der Container merkt sich
// den Basis-Pfad in data-fm-base, damit die Index-Invalidierung ohne Pane-
// Kontext neu befüllen kann.

import { api } from '../app/api.js';
import { t, intlLocale, currentDictionary, getLanguage } from '../../i18n.js';
// 4T-002034 (Epic 3E-000260): Liste und Tabelle entstehen aus der Ergebnismenge
// im eigenen Darstellungs-Modul; dieses Modul bleibt der Einstieg der
// Befüllung und verteilt Zustände, Fehler und Leer-Fall. Seit 4T-002035 ebenso
// die Aufgaben-Liste. Bewusst keine Renderer-Module mit Preload-Bezug, damit
// der jsdom-Unit-Test der Bau-Funktionen ohne Preload-Brücke läuft.
import {
  buildListDom,
  buildGroupedListDom,
  buildTableDom,
  buildGroupedTableDom,
} from './display-list-table.js';
import { buildTaskListDom } from './display-tasks.js';
// 4T-002043 (Epic 3E-000258): Verzeichnis der Darstellungsformen (DISPLAY).
import { drawDisplayForm } from './display-forms.js';
import { areaFileCount } from '../../../shared/query/result-display.js';
// 4T-002173 (Epic 3E-000337): Kontext der Diagramm-Formen — Schalt-Zustand der
// Erweiterung, Angaben der Ansicht an den Zeichner und Anschluss an das
// Neu-Zeichnen bei Farbwechsel, Druck und PDF. Die Zeichen-Funktion selbst
// kommt über die Brücke (`api.buildChartFromInput`), nie als Import.
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { meldeWeitereDiagramme, zeichenAngabenDerAnsicht } from '../charts/chart-view.js';
import { QUERY_CHART_CLASS } from './display-chart.js';
// 4T-002249 (Epic 3E-000262, F2 A): Die Listen-Maske tritt in jeder befüllten
// Ansicht an die Stelle der Ergebnis-Tabelle. Ihr Modul importiert keine Module
// mit Preload-Bezug, der jsdom-Unit-Test der Bau-Funktion bleibt damit gültig.
import {
  zeichneListe,
  listenSeite,
  sperreBlaettern,
  LIST_LESEND_KLASSE,
} from '../database/listen-maske.js';
// 4T-002250 (Epic 3E-000262, F4 A): Zeilen ändern. Das Zeilen-Modul bekommt
// Kanäle, Statuszeile und Neu-Befüllen als Nähte; die Liste selbst bleibt ohne
// Preload-Bezug.
import { erzeugeZeilenBearbeitung, raeumeVerwaisteSperren } from '../database/listen-zeile.js';
import { localTimestamp } from '../time-format.js';

// Bekannte Syntaxfehler-Codes des Parsers (src/shared/query/perspective-query.js) auf
// i18n-Keys abgebildet. Die deutschsprachige `message` des Parsers wird bewusst
// NICHT angezeigt (i18n-Regel); der Code bestimmt den lokalisierten Text, die
// Position füllt {pos} (bzw. {clause}/{name} für Klausel- und Funktions-Fehler).
// Unbekannte Codes fallen auf den generischen Text zurück.
// 4T-000401 (Epic 3E-000076): Codes der Klausel-Grammatik ergänzt; die bereits
// bestehenden Parser-Codes (expectedOperator, expectedValue, …) erhalten dabei
// eigene Texte statt des generischen Fallbacks.
const SYNTAX_ERROR_KEYS = {
  unexpectedChar: 'query.syntax.unexpectedChar',
  unterminatedString: 'query.syntax.unterminatedString',
  empty: 'query.syntax.empty',
  trailing: 'query.syntax.trailing',
  syntax: 'query.syntax.syntax',
  expectedOperator: 'query.syntax.expectedOperator',
  expectedValue: 'query.syntax.expectedValue',
  expectedParen: 'query.syntax.expectedParen',
  unexpectedEnd: 'query.syntax.unexpectedEnd',
  emptyList: 'query.syntax.emptyList',
  expectedIn: 'query.syntax.expectedIn',
  unexpectedToken: 'query.syntax.unexpectedToken',
  unterminatedLink: 'query.syntax.unterminatedLink',
  unknownClause: 'query.syntax.unknownClause',
  duplicateClause: 'query.syntax.duplicateClause',
  misplacedType: 'query.syntax.misplacedType',
  expectedField: 'query.syntax.expectedField',
  expectedColumn: 'query.syntax.expectedColumn',
  expectedAlias: 'query.syntax.expectedAlias',
  expectedId: 'query.syntax.expectedId',
  expectedNumber: 'query.syntax.expectedNumber',
  invalidLimit: 'query.syntax.invalidLimit',
  invalidColumns: 'query.syntax.invalidColumns',
  expectedSource: 'query.syntax.expectedSource',
  invalidDate: 'query.syntax.invalidDate',
  invalidDuration: 'query.syntax.invalidDuration',
  // 4T-000402 (Epic 3E-000076): Funktions-Validierung (seit 4T-000987 in
  // src/shared/query/query-functions.js) laeuft ueber denselben
  // queryError-Pfad wie die Parser-Codes.
  unknownFunction: 'query.syntax.unknownFunction',
  functionArity: 'query.syntax.functionArity',
  // 4T-000502 (Epic 3E-000096): TASKS-Scope bei deaktivierter Erweiterung
  // "Aufgaben" (Gate im Main-Query-Pfad, kein Parser-Fehler).
  tasksScopeDisabled: 'query.syntax.tasksScopeDisabled',
  // 4T-000503 (Epic 3E-000096): Gruppierung und Task-Layout (GROUP BY, HIDE/
  // SHOW/SHORT) — Parser-Codes plus Aktivierungs-Grenze des Main-Pfads. Die
  // Grenze der Gruppierung (`groupByTasksOnly`) ist mit 4T-002076 entfallen,
  // ihr Code entsteht nicht mehr; es bleibt die der Layout-Klauseln.
  expectedBy: 'query.syntax.expectedBy',
  expectedElement: 'query.syntax.expectedElement',
  unknownLayoutElement: 'query.syntax.unknownLayoutElement',
  layoutTasksOnly: 'query.syntax.layoutTasksOnly',
  // 4T-000505 (Epic 3E-000096): fehlerhafte globale Abfrage (Einstellungen) —
  // eigener Code, damit die Anzeige global von lokal unterscheidet.
  globalQueryInvalid: 'query.syntax.globalQueryInvalid',
  // 4T-002039 (Epic 3E-000258): Abfrage-Fehler der Datensatz-Ebene (Quelle ohne
  // Tabelle, unzulässige Quellen-Art mit {name}, Hervorhebung).
  recordsSourceMissing: 'query.syntax.recordsSourceMissing',
  recordsSourceInvalid: 'query.syntax.recordsSourceInvalid',
  recordsHighlight: 'query.syntax.recordsHighlight',
  // 4T-002042: Hüllen-Formen ancestors(…) und descendants(…) (Ziel, Feld, Ebene).
  hullTarget: 'query.syntax.hullTarget',
  hullField: 'query.syntax.hullField',
  recordHullScope: 'query.syntax.recordHullScope',
  // 4T-002043: unvollständige Angabe DISPLAY (ohne Form, BY ohne Feld).
  displayForm: 'query.syntax.displayForm',
  displayBy: 'query.syntax.displayBy',
  // 4T-002078 (Epic 3E-000259): Aggregat-Stellen der gruppierten Tabelle (Spalte
  // ohne Gruppen-Bezug, Aggregat im Aggregat, je mit {name}) und count() ohne
  // Feld an einer Zeilen-Stelle.
  groupedColumn: 'query.syntax.groupedColumn',
  aggregateNested: 'query.syntax.aggregateNested',
  countWithoutField: 'query.syntax.countWithoutField',
  // 4T-002079: HAVING ohne GROUP BY und ein Feld ohne Gruppen-Bezug in HAVING ({name}).
  havingWithoutGroupBy: 'query.syntax.havingWithoutGroupBy',
  havingUngrouped: 'query.syntax.havingUngrouped',
};

// 4T-000405 (Epic 3E-000076): Hinweis-Codes des Zustands (seit 4T-002034 aus
// resultSet.state.hint) auf i18n-Keys abgebildet — Linter-artige Hinweise,
// keine Fehler.
const HINT_KEYS = {
  columnsIgnored: 'query.hint.columnsIgnored',
  // 4T-002039 (Epic 3E-000258, F4 Option A): Datensatz-Ebene bei ausgeschalteter
  // Datenbank; die Menge ist leer, der Hinweis sagt warum.
  databaseOff: 'query.hint.databaseOff',
  // 4T-002041: Ein Verweis passt auf mehrere Datensätze und bleibt leer.
  recordRefAmbiguous: 'query.hint.recordRefAmbiguous',
  // 4T-002042: Die Verweise einer Hülle bilden einen Kreis.
  recordHullCycle: 'query.hint.recordHullCycle',
  // 4T-002043: Die gewählte Darstellungsform ist unbekannt oder passt nicht; die
  // Codes nennt der Verteiler (display-forms.js), nicht der Zustand. {name} ist
  // das Wort nach DISPLAY.
  displayFormUnknown: 'query.hint.displayFormUnknown',
  displayFormUnsuitable: 'query.hint.displayFormUnsuitable',
  // 4T-002173 (Epic 3E-000337, S3): Die Form hängt an einer ausgeschalteten
  // Erweiterung; heute tun das allein die Diagramme.
  displayFormOff: 'query.hint.displayFormOff',
};

// 4T-002173 (F5 Option A): Grund-Codes einer unpassenden Form (heute die der
// Diagramm-Datenregel, src/shared/query/result-chart.js) auf eigene Hinweise,
// die den Grund nennen. Ein Code ohne Eintrag zeigt den allgemeinen Hinweis
// «passt nicht»; `empty` erreicht den Verteiler nicht, weil der Leer-Fall davor
// seinen eigenen Text zeigt.
const UNSUITABLE_REASON_KEYS = {
  'not-table': 'query.hint.displayFormChartNotTable',
  'single-column': 'query.hint.displayFormChartSingleColumn',
  'no-numbers': 'query.hint.displayFormChartNoNumbers',
};

function syntaxErrorText(err, translate) {
  const tr = typeof translate === 'function' ? translate : t;
  const code = (err && err.code) || 'syntax';
  const key = SYNTAX_ERROR_KEYS[code] || SYNTAX_ERROR_KEYS.syntax;
  const pos = err && typeof err.pos === 'number' ? err.pos : -1;
  return tr(key)
    .replace('{pos}', String(pos))
    .replace('{clause}', String((err && err.clause) || ''))
    .replace('{name}', String((err && err.name) || ''));
}

// --- Einstieg: Verteiler auf die Darstellung ---------------------------------
// Erzeugt aus der Antwort des Abfrage-Kanals (bzw. einem Zustand, den die
// Anzeige selbst setzt) das DOM des Blocks. Prozess-nah, aber nur von
// `document` und dem injizierten `tFn` abhängig, damit im jsdom-Unit-Test
// deterministisch prüfbar (t als Stub). Gibt ein DocumentFragment zurück, das
// der Aufrufer in den Container hängt.
//
// 4T-002034 (Epic 3E-000260): Zustand, Abfrage-Fehler, Leer-Fall, Hinweis,
// Liste und Tabelle lesen allein die Ergebnismenge (`payload.resultSet`); die
// Liste und die Tabelle baut display-list-table.js. Ohne Menge kommen nur noch
// die Zustände, die die Anzeige selbst setzt (Laden, pfadloser Reiter,
// Kanal-Fehler). Seit 4T-002035 baut display-tasks.js die Aufgaben-Liste
// ebenso allein aus der Menge; die Antwort des Kanals trägt keine anderen
// Felder mehr.
//
// 4T-002173: `kontext` ergänzt den Kontext der Darstellungsformen um die
// Zeichen-Funktion der Diagramme (`drawChart`) und den Schalt-Zustand
// (`isExtensionActive`). Ohne Angabe gelten die des Fensters; der Prüffall
// reicht eigene, damit er ohne Brücke läuft.
//
// 4T-002249: `kontext.listenSeite` ist die Seite einer Listen-Maske, die der
// Block vor dem Neu-Befüllen zeigte; ohne Angabe die erste.
// 4T-002250: `kontext.zeile` ist die Zeilen-Bearbeitung des Blocks
// (`listen-zeile.js`); ohne sie bleibt die Liste lesend.
export function buildQueryListDom(payload, tFn, kontext) {
  const translate = typeof tFn === 'function' ? tFn : t;
  const frag = document.createDocumentFragment();
  const rs = resultSetOf(payload);
  const status = rs ? rs.state.status : payload && payload.status;

  // Status ohne Treffer-Liste: je ein lokalisierter Hinweis.
  if (status === 'loading') return append(frag, statusNode('query.loading', translate));
  if (status === 'unavailable') return append(frag, statusNode('query.unavailable', translate));
  if (status === 'indexing') return append(frag, statusNode('query.indexing', translate));
  if (status === 'error') return append(frag, statusNode('query.error', translate));
  if (status === 'oversized') {
    const node = statusNode('query.oversized', translate, {
      '{files}': String(areaFileCount(rs && rs.state)),
    });
    return append(frag, node);
  }

  // ready: zuerst der Abfrage-Fehler (leere Zeilen-Liste), dann Leer-Fall,
  // Hinweis und Ausgabe (4T-000404).
  const queryError = rs ? rs.state.queryError : null;
  if (queryError) {
    const node = statusNode(null, translate);
    node.classList.add('perspective-query-error');
    node.textContent = syntaxErrorText(queryError, translate);
    return append(frag, node);
  }
  // 4T-002249 (Epic 3E-000262, F2 A, S2): Eine Listen-Maske zeichnet nach dem
  // Hinweis des Zustands ihr Gitter, auch bei leerer Menge mit eigener
  // Zähl-Zeile. Bleibt sie lesend, steht ihr Hinweis über der Ausgabe wie
  // bisher, und alles darunter läuft unverändert.
  const liste = listeOf(payload);
  if (rs && liste) {
    const seite = kontext && Number.isInteger(kontext.listenSeite) ? kontext.listenSeite : 0;
    const zeile = kontext && kontext.zeile ? kontext.zeile : null;
    const node = zeichneListe(rs, liste, translate, seite, zeile);
    if (!node.classList.contains(LIST_LESEND_KLASSE)) {
      appendHint(frag, rs, translate);
      return append(frag, node);
    }
    frag.appendChild(node);
  }
  if (!rs || rs.rows.length === 0) {
    // 4T-002039 (Epic 3E-000258): Auf der Datensatz-Ebene erklärt ein Hinweis die
    // leere Menge (Aus-Zustand), deshalb steht er dort vor «keine Treffer». Die
    // drei bestehenden Ebenen zeigen im Leer-Fall wie bisher keinen Hinweis.
    if (rs && rs.scope === 'records') appendHint(frag, rs, translate);
    // 4T-002040: Die Datensatz-Ebene hat einen eigenen Leer-Text; die drei
    // bestehenden Ebenen behalten «Keine Datei entspricht dieser Abfrage».
    const emptyKey = rs && rs.scope === 'records' ? 'query.emptyRecords' : 'query.empty';
    return append(frag, statusNode(emptyKey, translate));
  }

  // 4T-002043 (Epic 3E-000258): Verteiler auf die gewählte Darstellungsform
  // (DISPLAY). Ohne Angabe entsteht nichts, und alles darunter bleibt wie
  // bisher. Eine gezeichnete Form trägt den Hinweis des Zustands über sich; eine
  // unbekannte oder unpassende fällt auf die Ausgabe ohne Angabe zurück und sagt
  // das im Hinweis, der hinter denen des Zustands kommt.
  const display = drawDisplayForm(rs, formKontext(translate, kontext));
  if (display.node) {
    appendHint(frag, rs, translate);
    return append(frag, display.node);
  }

  // 4T-000502/4T-000503 (Epic 3E-000096): Aufgaben-Liste (LIST TASKS) mit
  // Gruppen, Layout und Treffer-Zähler; ein Hinweis entsteht dort nur beim
  // Rückfall einer gewählten Form (4T-002043).
  if (rs.scope === 'tasks' && rs.type === 'list') {
    if (display.hint) appendHint(frag, rs, translate, display);
    return append(frag, buildTaskListDom(rs, translate));
  }

  // 4T-000405 (Epic 3E-000076): Linter-artiger Hinweis oberhalb des Ergebnisses
  // (aktuell: COLUMNS bei TABLE ignoriert). Kein Fehler, Ergebnis folgt darunter.
  appendHint(frag, rs, translate, display);

  // 4T-000404 (Epic 3E-000076): TABLE-Ausgabe aller drei Ebenen, sonst die Liste.
  // 4T-002078 (Epic 3E-000259): Trägt die Menge Gruppen, die gruppierte Tabelle
  // mit einer Zeile je Gruppe.
  if (rs.type === 'table' && Array.isArray(rs.groups)) {
    return append(frag, buildGroupedTableDom(rs, translate));
  }
  if (rs.type === 'table') return append(frag, buildTableDom(rs, translate));
  // 4T-002077 (Epic 3E-000259): Trägt die Menge Gruppen, die gruppierte Liste.
  if (Array.isArray(rs.groups)) return append(frag, buildGroupedListDom(rs, translate));
  return append(frag, buildListDom(rs));
}

// Die Ergebnismenge einer Antwort, soweit sie die Form trägt, die die
// Darstellung liest; sonst null. Die Format-Version wird bewusst nicht
// verglichen: Zuwachs ist additiv, Unbekanntes wird übergangen (E8.5).
function resultSetOf(payload) {
  const rs = payload && payload.resultSet;
  if (!rs || typeof rs !== 'object' || !rs.state || typeof rs.state !== 'object') return null;
  return Array.isArray(rs.rows) && Array.isArray(rs.columns) ? rs : null;
}

// 4T-002249: Die Auskunft des Kanals `database:liste` an der Antwort, sofern
// sie eine Listen-Maske meldet; sonst null.
function listeOf(payload) {
  const liste = payload && payload.liste;
  return liste && typeof liste === 'object' && liste.istListe === true ? liste : null;
}

// Der Hinweis des Zustands als eigene Zeile, sofern sein Code bekannt ist.
// 4T-002043: Ohne ihn der Hinweis des Rückfalls einer Darstellungsform (Ergebnis
// von drawDisplayForm); es erscheint höchstens einer, und der des Zustands geht vor
// (Rangfolge in der Architektur, Abschnitt «Ergebnismenge zwischen Auswertung
// und Anzeige»).
function appendHint(frag, rs, translate, display) {
  const stateCode = rs.state.hint && HINT_KEYS[rs.state.hint] ? rs.state.hint : null;
  const hintCode = stateCode || (display && display.hint);
  if (!hintCode || !HINT_KEYS[hintCode]) return;
  const hint = document.createElement('div');
  hint.className = 'perspective-query-hint';
  // 4T-002173: «passt nicht» mit bekanntem Grund nennt den Grund.
  const reasonKey =
    !stateCode && hintCode === 'displayFormUnsuitable' && display.reason
      ? UNSUITABLE_REASON_KEYS[display.reason]
      : null;
  const text = translate(reasonKey || HINT_KEYS[hintCode]);
  hint.textContent = stateCode ? text : text.replace('{name}', String(display.name || ''));
  frag.appendChild(hint);
}

function append(frag, node) {
  frag.appendChild(node);
  return frag;
}

// --- Kontext der Diagramm-Formen (4T-002173) ----------------------------------
// Fortlaufende Nummer für eindeutige Kennungen in den Grafiken eines Fensters.
let diagrammFolge = 0;

/**
 * Zeichen-Funktion eines Diagramms über die Brücke, mit den Angaben der Ansicht
 * am Ort `element` (Farben, Schrift, Vorlese-Texte). Gelesen wird beim Zeichnen,
 * damit Farbwechsel, Druck und PDF die gerade gesetzten Farben treffen.
 * @param {Element} [element]
 * @returns {(input: object) => object}
 */
function bridgeDrawChart(element) {
  return (input) => {
    diagrammFolge += 1;
    const angaben = zeichenAngabenDerAnsicht(element, `qc-${diagrammFolge}`);
    return api.buildChartFromInput(input, angaben);
  };
}

function formKontext(translate, kontext) {
  const k = kontext && typeof kontext === 'object' ? kontext : {};
  return {
    translate,
    isExtensionActive:
      typeof k.isExtensionActive === 'function' ? k.isExtensionActive : isExtensionActive,
    drawChart: typeof k.drawChart === 'function' ? k.drawChart : bridgeDrawChart(null),
  };
}

function statusNode(key, translate, replacements) {
  const div = document.createElement('div');
  div.className = 'perspective-query-status';
  if (key) {
    let text = translate(key);
    if (replacements) {
      for (const [ph, val] of Object.entries(replacements)) text = text.replace(ph, val);
    }
    div.textContent = text;
  }
  return div;
}

// --- Idle-Barriere für den PDF-Export ---------------------------------------
// Zählt laufende Befüllungen; der PDF-Export wartet über
// waitForFrontmatterQueriesIdle(), bis alle sichtbaren Container ihre Liste
// haben (analog waitForMermaidIdle). Ohne die Barriere druckt der Export den
// leeren Platzhalter statt der Liste.
let pendingFills = 0;
let idleResolvers = [];

function fillStarted() {
  pendingFills += 1;
}

function fillFinished() {
  pendingFills = Math.max(0, pendingFills - 1);
  if (pendingFills === 0 && idleResolvers.length) {
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}

export function waitForFrontmatterQueriesIdle() {
  if (pendingFills === 0) return Promise.resolve();
  return new Promise((resolve) => idleResolvers.push(resolve));
}

// --- Befüllung ---------------------------------------------------------------
// Pro Container ein Generations-Token: trifft während eines laufenden IPC ein
// Refresh ein, verwirft die veraltete Antwort ihren DOM-Tausch (Muster der
// subpageBreadcrumbTokens). WeakMap, damit entfernte Container automatisch aus
// der Buchführung fallen.
const fillTokens = new WeakMap();

// 4T-002173 (Epic 3E-000337, Entscheidung S4): Container mit gezeichnetem
// Diagramm -> die Antwort, aus der es entstand. Farbwechsel, Druck und PDF
// zeichnen aus ihr neu (`zeichneAbfrageDiagrammeNeu`), ohne die Abfrage neu zu
// stellen: synchron, mit denselben Daten und den gerade gesetzten Farben.
const DIAGRAMM_ANTWORTEN = new WeakMap();

// 4T-002250 (Epic 3E-000262, F4 A, S5): Die Zeilen-Bearbeitung je Block. Sie
// überdauert das Neu-Befüllen, weil der Block derselbe bleibt. Während eine
// Zeile bearbeitet wird, befüllt die Index-Aktualisierung den Block nicht neu,
// sonst verschwänden Eingaben und Zeile mit gehaltener Sperre; sie merkt sich
// das und holt es nach, sobald die Bearbeitung endet. 4T-002325: Ebenso,
// solange unter einer lesenden Zeile ein Block steht (Befund eines abgewiesenen
// Löschens, Konflikt einer fremden Sperre); die Naht `blaetternSperren(false)`
// meldet auch dessen Ende.
const ZEILEN_BEARBEITUNG = new WeakMap();

function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

// Der Hinweis in der Statuszeile über einen Laufzeit-Import (Muster
// `canvas/canvas-pane.js`): Ein statischer Bezug auf `views.js` bildete einen
// Ordner-übergreifenden Zyklus. Ein Fehlschlag bleibt folgenlos, der Hinweis
// ist Beiwerk.
function zeigeHinweis(key) {
  import('../views/views.js')
    .then((modul) => modul.showStatusbarHint(key, { duration: 3000 }))
    .catch(() => {});
}

function zeilenBearbeitungFuer(el) {
  let zeile = ZEILEN_BEARBEITUNG.get(el);
  if (zeile) return zeile;
  zeile = erzeugeZeilenBearbeitung({
    sperre: (params) => api.databaseSperre(params),
    datensatz: (params) => api.databaseDatensatz(params),
    auftrag: (params) => api.databaseAuftrag(params),
    datensaetze: (params) => api.databaseDatensaetze(params),
    // 4T-002251: die Kennung einer Neuanlage.
    neuanlage: (params) => api.databaseNeuanlage(params),
    t,
    hat: hatSchluessel,
    sprache: () => getLanguage() || null,
    zeitpunkt: localTimestamp,
    hinweis: zeigeHinweis,
    beiGeschrieben: () => fillOneQueryContainer(el, el.dataset.fmBase, false),
    blaetternSperren: (aktiv) => {
      sperreBlaettern(el.querySelector('.db-list'), aktiv);
      if (aktiv || el.dataset.dbListNachholen !== '1') return;
      delete el.dataset.dbListNachholen;
      fillOneQueryContainer(el, el.dataset.fmBase, false);
    },
  });
  ZEILEN_BEARBEITUNG.set(el, zeile);
  return zeile;
}

/**
 * 4T-002251 (Epic 3E-000262, Festlegung 5): Gibt die Sperren der Listen-Zeilen
 * frei, deren Element den Baum verlassen hat, weil ihr Reiter geschlossen, die
 * Ansicht gewechselt oder die Spalte neu gezeichnet wurde. Angestoßen bei jedem
 * Neuzeichnen einer Spalte (`views/pane-render.js`, nach dem Vorbild von
 * `raeumePraesentationAuf`).
 */
export function raeumeListenAuf() {
  raeumeVerwaisteSperren();
}

// Ist im Block eine Zeile in Bearbeitung oder steht unter einer Zeile ein Block
// (4T-002325)? Dann wird das Neu-Befüllen vermerkt.
function bearbeitungHaeltAn(el) {
  const zeile = ZEILEN_BEARBEITUNG.get(el);
  if (!zeile || !(zeile.inBearbeitung() || zeile.zeigtBlock())) return false;
  el.dataset.dbListNachholen = '1';
  return true;
}

function renderPayload(el, payload) {
  // 4T-002249: Die Seite einer Listen-Maske überdauert das Neu-Befüllen des Blocks.
  const vorher = el.querySelector('.db-list');
  const seite = vorher ? listenSeite(vorher) : 0;
  const zeile = payload && payload.liste ? zeilenBearbeitungFuer(el) : null;
  el.textContent = '';
  el.appendChild(
    buildQueryListDom(payload, t, { drawChart: bridgeDrawChart(el), listenSeite: seite, zeile }),
  );
  if (el.querySelector(`.${QUERY_CHART_CLASS}`)) {
    DIAGRAMM_ANTWORTEN.set(el, payload);
    meldeWeitereDiagramme(zeichneAbfrageDiagrammeNeu);
  } else {
    DIAGRAMM_ANTWORTEN.delete(el);
  }
}

/**
 * Zeichnet die Abfrage-Diagramme unter `wurzel` aus ihrer letzten Antwort neu.
 * Angemeldet beim Neu-Zeichnen der Diagramme (chart-view.js), das Farbwechsel,
 * Sprachwechsel sowie Druck und PDF auslösen. Auch Container in einem
 * Live-Widget werden an Ort und Stelle neu gezeichnet, wie es jede Befüllung
 * einer Abfrage dort tut.
 * @param {ParentNode} wurzel
 * @returns {number} Zahl der neu gezeichneten Container
 */
export function zeichneAbfrageDiagrammeNeu(wurzel) {
  if (!wurzel || typeof wurzel.querySelectorAll !== 'function') return 0;
  let anzahl = 0;
  for (const el of wurzel.querySelectorAll('.perspective-query[data-fm-query]')) {
    const payload = DIAGRAMM_ANTWORTEN.get(el);
    if (!payload) continue;
    renderPayload(el, payload);
    anzahl += 1;
  }
  return anzahl;
}

// Befüllt einen einzelnen perspective-query-Container. showLoading zeigt beim
// Erstaufbau (leerer Platzhalter) einen Ladehinweis; beim Invalidierungs-
// Refresh bleibt die bestehende Liste bis zur neuen Antwort stehen (kein
// Flackern). Nicht async, damit fillStarted() synchron vor dem ersten await
// läuft und die Idle-Barriere den Aufruf sicher erfasst.
function fillOneQueryContainer(el, basePath, showLoading) {
  const token = (fillTokens.get(el) || 0) + 1;
  fillTokens.set(el, token);
  if (basePath) el.dataset.fmBase = basePath;

  if (!basePath) {
    // Pfadloser Tab (Unbenannt, Handbuch): keine durchsuchbare Basis.
    renderPayload(el, { status: 'unavailable' });
    return;
  }
  const query = el.dataset.fmQuery || '';
  // 4T-002250: Eine Zeile in Bearbeitung hält die Aktualisierung an.
  if (!showLoading && bearbeitungHaeltAn(el)) return;
  if (showLoading) renderPayload(el, { status: 'loading' });
  fillStarted();
  const aktuell = () => fillTokens.get(el) === token;
  api
    // 4T-001072 (Epic 3E-000211): eingestellte Programmsprache mitgeben — die
    // Formatierer der Abfrage folgen ihr statt der Betriebssystem-Sprache.
    // 4T-001594: als BCP-47-Form, weil der Wert im Hauptprozess als ctx.locale
    // in Intl.DateTimeFormat und Intl.NumberFormat landet (query-format.js).
    .runFrontmatterQuery(basePath, query, intlLocale())
    // 4T-002249: Auskunft über eine Listen-Maske, nur solange die Antwort noch gilt.
    .then((payload) => (aktuell() ? mitListe(payload, basePath, query) : payload))
    .then((payload) => {
      if (fillTokens.get(el) !== token || bearbeitungHaeltAn(el)) return;
      renderPayload(el, payload || { status: 'error' });
    })
    .catch(() => {
      if (fillTokens.get(el) === token) renderPayload(el, { status: 'error' });
    })
    .finally(fillFinished);
}

// 4T-002249 (Epic 3E-000262, F2 A, S1): Ist die Antwort eine Menge der
// Datensatz-Ebene und die Erweiterung «Datenbank» an, fragt die Befüllung den
// Haupt-Prozess, ob die Datei eine Listen-Maske ist, und hängt die Auskunft als
// `liste` an. Die Kopf-Datei der Zeilen geht mit, wenn alle Zeilen aus derselben
// stammen; sonst bestimmt der Haupt-Prozess die Tabelle aus der Abfrage. Ein
// Fehler oder «keine Liste» lässt die Antwort, wie sie ist.
async function mitListe(payload, basePath, query) {
  const rs = resultSetOf(payload);
  if (!rs || rs.scope !== 'records' || rs.state.status !== 'ready' || rs.state.queryError) {
    return payload;
  }
  if (!isExtensionActive('database') || typeof api.databaseListe !== 'function') return payload;
  try {
    const liste = await api.databaseListe({
      pfad: basePath,
      query,
      spalten: rs.columns.map((c) => c.source),
      tabelle: gemeinsameKopfDatei(rs.rows),
      // 4T-002250 (S3): die Kennungen der Zeilen für die Änderbarkeit je Zeile.
      kennungen: kennungenDer(rs.rows),
    });
    return liste && liste.istListe === true ? { ...payload, liste } : payload;
  } catch {
    return payload;
  }
}

function kennungenDer(rows) {
  const ids = rows.map((row) => row && row.origin && row.origin.id);
  return [...new Set(ids.filter((id) => typeof id === 'string' && id !== ''))];
}

function gemeinsameKopfDatei(rows) {
  const pfade = new Set(rows.map((row) => row && row.origin && row.origin.path));
  const [pfad] = pfade;
  return pfade.size === 1 && typeof pfad === 'string' && pfad ? pfad : null;
}

// Findet alle perspective-query-Platzhalter im Container und befüllt sie.
// Aufgerufen aus der Render-Pipeline (Render-Pane/Reading) und aus dem
// Live-Block-Widget. basePath kann leer sein (pfadloser Tab).
export function applyFrontmatterQueriesIfPresent(container, basePath) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const els = container.querySelectorAll('.perspective-query[data-fm-query]');
  for (const el of els) fillOneQueryContainer(el, basePath, true);
}

// --- Live-Aktualisierung über die Index-Invalidierung ------------------------
// Debounced: mehrere Broadcasts in Folge (Massen-Umbenennung) lösen nur eine
// Neubefüllung aus. Modus-agnostisch über die im DOM mit data-fm-base
// markierten Container; kein eigener Watcher.
let refreshTimer = null;

export function refreshVisibleFrontmatterQueries() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const els = document.querySelectorAll('.perspective-query[data-fm-base]');
    for (const el of els) fillOneQueryContainer(el, el.dataset.fmBase, false);
  }, 150);
}
