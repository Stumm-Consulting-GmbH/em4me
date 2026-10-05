// 4T-002021 (Epic 3E-000192): Diagramm zu einer Datentabelle in den Ansichten —
// der Schritt der Befüllung, der die Container der Zaun-Regel auflöst und
// zeichnet.
//
// **Wo aufgelöst und gezeichnet wird: im Nachlauf, nicht in der Pipeline.** Die
// Zaun-Regel setzt allein den Container (`.perspective-chart` mit dem
// Block-Inhalt in `data-chart-source`); dieser Schritt läuft in der gemeinsamen
// Folge der Nachverarbeitung (render-mermaid.js, `wendeSchritteAn`) in
// Vollansicht und erzeugtem Teilbaum und im Bau-Schritt der Live-Widgets. Drei
// Gründe: Ein Diagramm zu einer Tabelle in einem anderen Dokument braucht
// einen asynchronen Lese-Weg, den die synchrone Zaun-Regel nicht hat, und so
// gibt es einen Weg für beide Fälle; Farben und Schrift sind Wissen der
// Ansicht, und ein Wechsel des Farbschemas zeichnet neu, ohne das Dokument neu
// zu rendern; die Ausgabe der Pipeline bleibt frei von der Version der
// Zeichen-Bibliothek.
//
// **Gezeichnet wird über die Brücke** (`api.buildChart`, src/main/
// preload-diagramme.js). Der Zeichner wird hier nie importiert: Er zöge die
// Zeichen-Bibliothek in das Bündel dieses Prozesses. Ein Wächter-Prüffall hält
// das fest (test/unit/renderer/diagramm-ansicht.test.js).
//
// **Der Dokument-Text** ist der geschriebene Stand, nie der gespeicherte. Die
// Vollansicht reicht eine Funktion, die den Editor-Puffer des geöffneten
// Dokuments liest; ein Teilbaum reicht den Text, aus dem er gerendert wurde,
// eine Einbettung eines Ausschnitts den ganzen Text der eingebetteten Datei;
// ein Live-Widget allein die genannte Tabelle samt Namens-Zeile.
//
// **Zustand am Container** (Kennungen, nie Anwender-Text als HTML):
//   data-chart-state     drawn | undrawable | pending | error
//   data-chart-omitted   Zahl ausgelassener Werte (drawn), bei mehr als null
//                        dazu die Auslass-Zeile unter der Grafik
//   data-chart-reason    Kennung des Grundes (undrawable), dazu die Klasse
//   data-chart-detail    perspective-chart--undrawable und der Hinweis mit
//                        dem Grund an der Stelle der Grafik (chart-hint.js)
//   data-chart-pending   other-document (Tabelle in einem anderen Dokument)
//   data-chart-ref-file  geschriebener Name des anderen Dokuments (4T-002023)
//   data-chart-target    aufgelöster Pfad des anderen Dokuments, bei einem
//                        fehlenden der Ort, an dem es gesucht wurde
//   data-chart-wartet    index — gesucht, bevor das Verzeichnis bereit war
//   data-chart-ausgabe   not-read-in-time — für Druck und PDF bis zur
//                        Zeit-Grenze nicht gelesen, an der Stelle der Grafik
//                        der Hinweis (4T-002025); das nächste Ergebnis
//                        löscht es
//
// **Tabelle in einem anderen Dokument (4T-002023).** Die Brücke antwortet
// zunächst mit `pending` und dem Ziel. Der Schritt liest dann den Text des
// anderen Dokuments über den Lese-Kanal (Puffer vor Platte) und fragt die
// Brücke ein zweites Mal, mit der Antwort als viertem Wert. Bis dahin bleibt
// das alte Bild stehen, damit ein Auffrischen nicht flackert; ein zweites
// Zeichnen desselben Blocks verwirft das Ergebnis eines älteren, und gleiche
// laufende Lesungen werden zusammengelegt. Aufgefrischt wird über
// `frischeDiagrammeAuf`, gemeinsam mit den Einbettungen desselben Ziels
// (render-mermaid.js, `refreshEmbedsOfTarget`).
//
// **Farb- und Sprachwechsel.** Das Modul beobachtet das Wurzel-Element selbst
// (Modus `data-theme` und die Farb-Variablen im `style`) und hört auf den
// Sprachwechsel (`i18n-language-changed`); danach zeichnet es jedes Diagramm
// der Ansichten neu, sodass Grafik, Hinweis und Auslass-Zeile Farben und
// Sprache folgen. Live-Widgets baut es nicht selbst um: Ihr Schlüssel trägt
// Farben und Sprache (`chartColorKey`, live-block-field.js), und ein
// Neu-Aufbau des Editors genügt; beim Wechsel Hell/Dunkel und beim
// Sprachwechsel stößt ihn bereits die App an, beim Wechsel des Farbschemas
// dieses Modul.
'use strict';

import { EditorView } from '@codemirror/view';

import { getLanguage, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { liveRebuildEffect } from '../live/live-shared.js';
import { BASE_DEFAULTS, COLOR_SLOTS } from '../../../shared/color-schemes.js';
import { chartDescriptionTexts } from '../../../shared/charts/chart-call-options.js';
import { baueAuslassZeile, baueHinweis, baueHinweisNichtRechtzeitig } from './chart-hint.js';
// 4T-002048: das Zeichen der Block-Eigenschaften überdauert das Neu-Zeichnen.
import { setzeInhalt } from '../block-meta-zeichen.js';
import {
  letztesBild,
  meldeFehlendeNeu,
  meldeZielGeaendert,
  meldungsStand,
  merkeBild,
  merkeZiel,
  zielPfadListe,
  zielPruefer,
} from './chart-targets.js';

// Container -> { text: () => string, kennung, basePath, art }. Die Angaben des
// ersten Zeichnens, damit ein Farbwechsel denselben Container mit demselben
// Dokument neu zeichnen kann.
const LAEUFE = new WeakMap();
let folge = 0;

// 4T-002023: Container -> Nummer seines jüngsten Zeichnens. Eine Antwort des
// Lese-Kanals, die nach einem neueren Zeichnen eintrifft, wird verworfen.
const NUMMERN = new WeakMap();
// `${basePath}\0${file}` -> laufende Lesung (Promise der Kanal-Antwort).
const LESUNGEN = new Map();
const DOKUMENT_FEHLT = 'document-missing';

const ZUSTAND_KEYS = [
  'chartState',
  'chartOmitted',
  'chartReason',
  'chartDetail',
  'chartPending',
  'chartAusgabe',
];
const UNDRAWABLE_CLASS = 'perspective-chart--undrawable';

function textQuelle(dokumentText) {
  if (typeof dokumentText === 'function') {
    return () => {
      const v = dokumentText();
      return typeof v === 'string' ? v : '';
    };
  }
  const text = typeof dokumentText === 'string' ? dokumentText : '';
  return () => text;
}

// 4T-002030: Die zehn Farb-Plätze der Datenreihen im Farbschema, in der
// Reihenfolge der Reihen, je mit ihrer Variable (`--chart-1` …).
const REIHEN_PLAETZE = COLOR_SLOTS.filter((s) => s.group === 'charts');

function modus() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function variable(stil, name) {
  return String(stil.getPropertyValue(name) || '').trim();
}

// Die wirksame Schrift der gerenderten Ansicht. Eine Variable, die auf eine
// andere verweist, wird aufgelöst; doppelte Anführungszeichen werden zu
// einfachen, weil der Zeichner den Wert in ein Attribut setzt. Was danach
// nicht taugt, fällt auf die Vorgabe des Zeichners.
function wirksameSchrift(stil) {
  let wert = variable(stil, '--render-font-family');
  for (let i = 0; i < 3; i++) {
    const verweis = /^var\(\s*(--[\w-]+)\s*\)$/.exec(wert);
    if (!verweis) break;
    wert = variable(stil, verweis[1]);
  }
  wert = wert.replace(/"/g, "'");
  if (wert === '' || /var\(|[<>&;{}\\]/.test(wert)) return undefined;
  return wert;
}

// Angaben der Ansicht an den Zeichner. Gelesen wird am Container, solange er
// im Dokument hängt; ein Live-Widget wird vor dem Einhängen gezeichnet und
// liest deshalb am Wurzel-Element, wo die Farb-Variablen stehen.
//
// 4T-002030: Auch die Reihen-Farben sind wirksame Werte des Farbschemas, die
// zehn Variablen `--chart-1` bis `--chart-10`; das Farbschema ist ihre
// einzige Quelle. Die Grundpalette des Modus dient nur als Rückfall je Platz,
// wie bei Text- und Achsen-Farbe.
function angabenDerAnsicht(block, kennung) {
  const basis = BASE_DEFAULTS[modus()];
  const stil = getComputedStyle(block.isConnected ? block : document.documentElement);
  return {
    colors: {
      text: variable(stil, '--fg') || basis.text,
      muted: variable(stil, '--fg-muted') || basis.textMuted,
      background: 'transparent',
      palette: REIHEN_PLAETZE.map((slot) => variable(stil, slot.vars[0]) || basis[slot.id]),
    },
    fontFamily: wirksameSchrift(stil),
    idPrefix: `ch-${kennung}-${Number(block.dataset.chartIndex) || 0}`,
    descriptionTexts: chartDescriptionTexts(t),
  };
}

// 4T-002048: Trägt der Block die Kennung einer Anker-Zeile darunter, hängt an
// ihm das Zeichen der Block-Eigenschaften; es überdauert das Neu-Zeichnen.
function setzeZurueck(block) {
  block.classList.remove(UNDRAWABLE_CLASS);
  for (const key of ZUSTAND_KEYS) delete block.dataset[key];
  setzeInhalt(block, '');
}

// Rückfall bei einem Fehler der Brücke (Programmfehler, kein Grund der
// Anforderung): der Block-Inhalt als gewöhnlicher Code-Block, derselbe wie im
// Aus-Zustand der Erweiterung, damit keine leere Fläche steht.
function zeigeQuelltext(block, body) {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'language-perspective-chart';
  code.textContent = body;
  pre.appendChild(code);
  block.appendChild(pre);
}

function frageBruecke(block, lauf, body, tabellenDokument) {
  try {
    return api.buildChart(
      lauf.text(),
      body,
      angabenDerAnsicht(block, lauf.kennung),
      tabellenDokument,
    );
  } catch (err) {
    // Ein Fehler in einem Diagramm darf die Ansicht nicht abbrechen.
    console.warn('perspective-chart: Zeichnen fehlgeschlagen:', err);
    return null;
  }
}

// 4T-002023: Ein Diagramm wird gezeichnet; nennt es eine Tabelle in einem
// anderen Dokument, beginnt die Lesung, und die Rückgabe ist ihr Promise.
function zeichne(block, lauf) {
  const body = block.dataset.chartSource || '';
  const nummer = (NUMMERN.get(block) || 0) + 1;
  NUMMERN.set(block, nummer);
  const erg = frageBruecke(block, lauf, body);
  if (erg && erg.status === 'pending' && erg.target) {
    zeigeWartend(block, lauf, body, erg.target);
    return liesFremdeTabelle(block, lauf, body, erg.target, nummer).catch((err) => {
      console.warn('perspective-chart: Zeichnen nach dem Lesen fehlgeschlagen:', err);
    });
  }
  zeigeErgebnis(block, lauf, erg, body);
  return null;
}

// Kennzeichen eines Live-Blocks für seinen Platzhalter: dieselbe Darstellung
// (Farben und Sprache, wie im Schlüssel des Widgets), dasselbe Dokument,
// derselbe Inhalt. Nach einem Farb- oder Sprachwechsel gibt es deshalb kein
// Bild in alten Farben. Die Lese-Ansicht braucht keinen, ihr Container bleibt.
function bildSchluessel(lauf, body) {
  return `${chartColorKey()}|${getLanguage()}\0${lauf.basePath}\0${body}`;
}

// Bis die Antwort da ist, bleibt stehen, was im Container steht; ein neuer
// Live-Container bekommt das zuletzt an dieser Stelle gezeichnete Bild.
function zeigeWartend(block, lauf, body, ziel) {
  block.dataset.chartState = 'pending';
  block.dataset.chartPending = 'other-document';
  block.dataset.chartRefFile = String(ziel.file || '');
  if (block.childNodes.length > 0 || lauf.art !== 'live') return;
  const bild = letztesBild(bildSchluessel(lauf, body));
  if (!bild) return;
  block.innerHTML = bild.html;
  block.classList.toggle(UNDRAWABLE_CLASS, bild.undrawable);
}

// Zusammenlegen gleicher laufender Lesungen: Mehrere Diagramme auf dieselbe
// Tabelle fragen einmal. Eine Meldung über eine Änderung des Ziels leert die
// Liste, damit kein neues Zeichnen an eine Lesung vom alten Stand anschließt.
function leseZiel(basePath, file) {
  const schluessel = `${basePath}\0${file}`;
  let lesung = LESUNGEN.get(schluessel);
  if (lesung) return lesung;
  lesung = (async () => {
    try {
      return await api.readChartTableDocument(basePath, file);
    } catch (err) {
      console.warn('perspective-chart: anderes Dokument nicht lesbar:', err);
      return { ok: false, error: 'unreadable' };
    }
  })();
  LESUNGEN.set(schluessel, lesung);
  const raeume = () => {
    if (LESUNGEN.get(schluessel) === lesung) LESUNGEN.delete(schluessel);
  };
  lesung.then(raeume, raeume);
  return lesung;
}

// Kommt während der Lesung eine Meldung über ein geändertes Ziel, kann die
// Antwort den alten Stand tragen. Bei einer ersten Lesung ist der Pfad noch
// unbekannt, die Meldung zählt also keinen Stand hoch und stößt im Live-Modus
// keinen Neu-Aufbau an; gelesen wird deshalb erneut, höchstens zweimal.
const MAX_NEU_LESUNGEN = 2;

async function liesFremdeTabelle(block, lauf, body, ziel, nummer) {
  lesungBeginnt();
  try {
    let antwort;
    for (let versuch = 0; ; versuch += 1) {
      const stand = meldungsStand();
      antwort = (await leseZiel(lauf.basePath, ziel.file)) || { ok: false };
      if (NUMMERN.get(block) !== nummer) return;
      if (meldungsStand() === stand || versuch >= MAX_NEU_LESUNGEN) break;
    }
    const pfad = typeof antwort.path === 'string' ? antwort.path : '';
    block.dataset.chartTarget = pfad;
    if (antwort.ok !== true && antwort.indexBereit === false) block.dataset.chartWartet = 'index';
    else delete block.dataset.chartWartet;
    merkeZiel(lauf.basePath, ziel.file, pfad, antwort.ok !== true);
    zeigeErgebnis(block, lauf, frageBruecke(block, lauf, body, antwort), body);
  } finally {
    lesungEndet();
  }
}

function zeigeErgebnis(block, lauf, erg, body) {
  setzeZurueck(block);
  const status = erg && typeof erg === 'object' ? erg.status : null;
  if (status === 'drawn') {
    // Die Grafik stammt aus dem eigenen Zeichner, der jeden Anwender-Text als
    // Text-Inhalt maskiert und die Angaben für Attribute prüft.
    setzeInhalt(block, erg.svg);
    block.dataset.chartState = 'drawn';
    block.dataset.chartOmitted = String(Number(erg.omitted) || 0);
    const zeile = baueAuslassZeile(erg.omitted, t);
    if (zeile) block.appendChild(zeile);
  } else if (status === 'pending') {
    block.dataset.chartState = 'pending';
    block.dataset.chartPending = 'other-document';
  } else if (status === 'undrawable') {
    // Nie eine leere Fläche: An der Stelle der Grafik steht der Hinweis.
    block.classList.add(UNDRAWABLE_CLASS);
    block.dataset.chartState = 'undrawable';
    block.dataset.chartReason = String(erg.reason || '');
    block.dataset.chartDetail = erg.detail == null ? '' : String(erg.detail);
    block.appendChild(baueHinweis(erg, t));
  } else {
    if (erg) console.warn('perspective-chart: unbekanntes Ergebnis der Brücke:', erg);
    block.dataset.chartState = 'error';
    zeigeQuelltext(block, body);
  }
  if (lauf.art === 'live' && block.dataset.chartRefFile) {
    merkeBild(
      bildSchluessel(lauf, body),
      block.innerHTML,
      block.classList.contains(UNDRAWABLE_CLASS),
    );
  }
}

/**
 * Der Schritt der Befüllung: löst jedes noch nicht gezeichnete Diagramm im
 * Container auf und zeichnet es.
 *
 * @param {Element} container Gerenderte Ansicht, Teilbaum oder Live-Widget.
 * @param {string} basePath Bezugs-Pfad des Inhalts (für die Auflösung eines
 *   anderen Dokuments).
 * @param {object} [kontext]
 * @param {string|function(): string} [kontext.dokumentText] Text des
 *   Dokuments, das die Blöcke trägt, oder eine Funktion, die ihn liest.
 * @param {string} [kontext.kennung] Kennzeichen der Ansicht für eindeutige
 *   Kennungen in der Grafik (Vollansicht: Spalte); ohne Angabe fortlaufend.
 * @param {string} [kontext.art] 'live' für ein Live-Widget.
 */
export function applyPerspectiveChartsIfPresent(container, basePath, kontext = {}) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  // Ein Diagramm, das ein innerer Teilbaum schon mit seinem eigenen Dokument
  // gezeichnet hat, bleibt unberührt.
  const bloecke = container.querySelectorAll('.perspective-chart:not([data-chart-state])');
  if (bloecke.length === 0) return;
  richteBeobachterEin();
  folge += 1;
  const lauf = {
    text: textQuelle(kontext.dokumentText),
    kennung: kontext.kennung || `${kontext.art === 'live' ? 'l' : 't'}${folge}`,
    basePath: basePath || '',
    art: kontext.art === 'live' ? 'live' : 'ansicht',
  };
  for (const block of bloecke) {
    LAEUFE.set(block, lauf);
    zeichne(block, lauf);
  }
}

/**
 * Kennung der wirksamen Farben für den Schlüssel der Live-Widgets: Modus und
 * die Farb-Variablen am Wurzel-Element, an dem das Farbschema sie setzt.
 * Darin stehen auch die zehn Reihen-Farben (`--chart-N`, 4T-002030): Weicht
 * eine vom Stilblatt ab, setzt das Farbschema sie in `style`; sonst gilt der
 * Wert des Stilblatts, den `data-theme` bestimmt.
 *
 * @returns {string}
 */
export function chartColorKey() {
  const wurzel = document.documentElement;
  return `${wurzel.getAttribute('data-theme') || ''}|${wurzel.getAttribute('style') || ''}`;
}

// --- Barriere der Lesungen (4T-002023) ----------------------------------------
//
// Die Barriere über alle laufenden Lesungen des Fensters, Muster und
// Zeit-Grenze wie `waitForWikiEmbedsIdle` (render-mermaid.js): Ein hängendes
// Ziel darf verzögern, aber nicht verhindern. Das Auffrischen zählt mit. Druck
// und PDF warten seit der Durchsicht vom 2026-09-30 nicht mehr hier, sondern
// allein auf die Lesungen der gedruckten Spalte (`warteAufDiagrammeDerAusgabe`,
// unten); die Zeit-Grenze teilen beide.

export const CHART_IDLE_TIMEOUT_MS = 5000;
let laufendeLesungen = 0;
const idleWarter = [];

function lesungBeginnt() {
  laufendeLesungen += 1;
}

function lesungEndet() {
  laufendeLesungen = Math.max(0, laufendeLesungen - 1);
  if (laufendeLesungen === 0) {
    while (idleWarter.length > 0) idleWarter.shift()();
  }
}

// Nur für Tests und Diagnose.
export function laufendeDiagrammLesungenCount() {
  return laufendeLesungen;
}

export function waitForChartsIdle(timeoutMs = CHART_IDLE_TIMEOUT_MS) {
  if (laufendeLesungen === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let erledigt = false;
    const fertig = () => {
      if (erledigt) return;
      erledigt = true;
      resolve();
    };
    idleWarter.push(fertig);
    setTimeout(fertig, timeoutMs);
  });
}

// --- Auffrischen nach einer Änderung des Ziels (4T-002023) ---------------------

/**
 * Meldet eine Änderung des Ziels, bevor die Ansichten aufgefrischt werden:
 * Der Stand des Ziels im Schlüssel der Live-Widgets zählt hoch, und laufende
 * Lesungen werden nicht mehr geteilt. Einmal je Meldung, nicht je Spalte.
 *
 * @param {string|Iterable<string>|null} ziel Geänderte Datei oder Menge von
 *   Dateien; null, wenn ein fehlendes Ziel jetzt gefunden werden kann
 *   (Verzeichnis bereit, Datei angelegt).
 */
export function meldeDiagrammZielAenderung(ziel) {
  LESUNGEN.clear();
  if (ziel == null) meldeFehlendeNeu();
  else meldeZielGeaendert(ziel);
}

// Trifft die Meldung diesen Block? Ein Block, dessen erste Lesung noch läuft,
// trägt noch kein Ziel und ist immer betroffen: Seine Lesung kann vor der
// Änderung begonnen haben. `trifft` ist null für die fehlenden Ziele.
function betroffen(block, trifft) {
  if (!('chartTarget' in block.dataset)) return true;
  if (trifft === null) return block.dataset.chartReason === DOKUMENT_FEHLT;
  return trifft(block.dataset.chartTarget);
}

// Ein Container eines Live-Widgets baut der Editor neu; jeder andere, auch einer
// im Editor (ein Diagramm in einer Einbettung im Live-Modus, deren Widget nur
// Quelltext und Pfad vergleicht), wird an Ort und Stelle neu gezeichnet.
function istLiveWidget(lauf) {
  return !!lauf && lauf.art === 'live';
}

/**
 * Zeichnet die Diagramme unter `wurzel` neu, deren Tabelle in einer geänderten
 * Datei liegt, ohne die Ansicht neu zu rendern. Der Weg der Einbettungen ruft
 * ihn mit (`refreshEmbedsOfTarget`), damit beide demselben Ziel gleich folgen.
 *
 * Ein Live-Widget wird nicht an Ort und Stelle umgezeichnet; der Editor baut
 * es neu, weil der Stand des Ziels in seinem Schlüssel steht
 * (`meldeDiagrammZielAenderung` vorher).
 *
 * @param {Element} wurzel Spalte samt gerenderter Ansicht und Editor.
 * @param {string|Iterable<string>|null} ziel Geänderte Datei oder Menge von
 *   Dateien, in einem Durchlauf; null für die fehlenden Ziele.
 * @returns {Promise<number>} Zahl der betroffenen Diagramme, nach dem Zeichnen.
 */
export async function frischeDiagrammeAuf(wurzel, ziel) {
  if (!wurzel || typeof wurzel.querySelectorAll !== 'function') return 0;
  const trifft = ziel == null ? null : zielPruefer(zielPfadListe(ziel));
  lesungBeginnt();
  try {
    const lesungen = [];
    const editoren = new Set();
    let anzahl = 0;
    for (const block of wurzel.querySelectorAll('.perspective-chart[data-chart-ref-file]')) {
      if (!betroffen(block, trifft)) continue;
      anzahl += 1;
      const lauf = LAEUFE.get(block);
      const editor = istLiveWidget(lauf) ? block.closest('.cm-editor') : null;
      if (editor) editoren.add(editor);
      else if (lauf) lesungen.push(zeichne(block, lauf));
    }
    for (const el of editoren) {
      const view = EditorView.findFromDOM(el);
      if (view) view.dispatch({ effects: liveRebuildEffect.of(null) });
    }
    await Promise.all(lesungen);
    return anzahl;
  } finally {
    lesungEndet();
  }
}

// --- Neu zeichnen beim Farbwechsel --------------------------------------------

const ENTPRELLUNG_MS = 50;
let beobachter = null;
let geplant = null;
let nurStil = true;

// Zeichnet die Diagramme unter `wurzel` neu und liefert die Lesungen, die
// dabei beginnen.
function zeichneNeu(wurzel) {
  const lesungen = [];
  for (const block of wurzel.querySelectorAll('.perspective-chart[data-chart-state]')) {
    // Live-Widgets zeichnet ihr Neu-Aufbau; ein Umzeichnen an Ort und Stelle
    // änderte ein eingehängtes Widget hinter dem Rücken des Editors. 4T-002023:
    // Maßgeblich ist die Art des Laufs, nicht der Ort — ein Diagramm in einer
    // Einbettung im Live-Modus hängt im Editor, baut aber nicht mit ihm neu.
    const lauf = LAEUFE.get(block);
    if (!lauf || istLiveWidget(lauf)) continue;
    const lesung = zeichne(block, lauf);
    if (lesung) lesungen.push(lesung);
  }
  return lesungen;
}

function zeichneAlleNeu() {
  zeichneNeu(document);
}

function baueLiveWidgetsNeu() {
  for (const el of document.querySelectorAll('.cm-editor')) {
    if (!el.querySelector('.perspective-chart')) continue;
    const view = EditorView.findFromDOM(el);
    if (view) view.dispatch({ effects: liveRebuildEffect.of(null) });
  }
}

/**
 * Zeichnet die Diagramme der gedruckten Spalte sofort mit den gerade gesetzten
 * Farb-Variablen neu (4T-002025): Druck und PDF setzen das helle Farbschema
 * und rufen dies danach, statt auf das entprellte Neu-Zeichnen des
 * Beobachters zu warten, das sonst erst nach der Ausgabe laufen könnte. Ein
 * schon geplantes Neu-Zeichnen wird verworfen, samt der noch nicht
 * zugestellten Einträge, weil dieser Durchgang es ersetzt. Die Rückkehr ins
 * aktive Farbschema nach der Ausgabe läuft über den Beobachter; er zeichnet
 * dann alle Spalten, auch die hier nicht gezeichneten.
 *
 * Diagramme auf eine Tabelle in einem anderen Dokument lesen dabei neu; die
 * Ausgabe wartet danach mit `warteAufDiagrammeDerAusgabe` auf genau diese
 * Lesungen.
 *
 * @param {ParentNode} [wurzel] Die gedruckte Spalte; ohne Angabe das Fenster.
 * @returns {Promise<void>} Erfüllt, wenn die dabei begonnenen Lesungen beendet
 *   sind; verwirft nie.
 */
export function zeichneDiagrammeFuerAusgabe(wurzel = document) {
  if (beobachter) beobachter.takeRecords();
  if (geplant) {
    clearTimeout(geplant);
    geplant = null;
  }
  nurStil = true;
  return Promise.all(zeichneNeu(wurzel)).then(() => undefined);
}

/**
 * Die Barriere von Druck und PDF (Durchsicht vom 2026-09-30): wartet auf die
 * Lesungen, die `zeichneDiagrammeFuerAusgabe` für die gedruckte Spalte
 * begonnen hat, höchstens bis zur Zeit-Grenze. Lesungen anderer Spalten
 * zählen nicht; sie werden nicht gedruckt.
 *
 * Wartet danach noch ein Diagramm der Spalte auf seine Lesung, steht an der
 * Stelle der Grafik der Hinweis «Die Tabelle konnte nicht rechtzeitig gelesen
 * werden» statt des alten oder eines leeren Bilds, und die Konsole nennt es.
 * Das ist ein Zustand der Ausgabe, kein Grund des Format-Kerns. Antwortet die
 * Lesung später, zeichnet sie das Diagramm wie jede andere Antwort.
 *
 * @param {ParentNode} wurzel Die gedruckte Spalte.
 * @param {Promise<void>} gezeichnet Rückgabe von `zeichneDiagrammeFuerAusgabe`.
 * @param {number} [timeoutMs]
 * @returns {Promise<number>} Zahl der Diagramme mit dem Hinweis.
 */
export async function warteAufDiagrammeDerAusgabe(
  wurzel,
  gezeichnet,
  timeoutMs = CHART_IDLE_TIMEOUT_MS,
) {
  let zeitGeber = null;
  await Promise.race([
    Promise.resolve(gezeichnet),
    new Promise((resolve) => {
      zeitGeber = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(zeitGeber);
  if (!wurzel || typeof wurzel.querySelectorAll !== 'function') return 0;
  let anzahl = 0;
  for (const block of wurzel.querySelectorAll('.perspective-chart[data-chart-state="pending"]')) {
    if (istLiveWidget(LAEUFE.get(block))) continue;
    anzahl += 1;
    block.textContent = '';
    block.classList.add(UNDRAWABLE_CLASS);
    block.dataset.chartAusgabe = 'not-read-in-time';
    block.appendChild(baueHinweisNichtRechtzeitig(t));
    console.warn(
      'perspective-chart: Tabelle für die Ausgabe nicht rechtzeitig gelesen:',
      block.dataset.chartRefFile || '',
    );
  }
  return anzahl;
}

// Einmal je Fenster, beim ersten Diagramm. Der Wechsel Hell/Dunkel setzt
// `data-theme` und wendet das Farbschema neu an; der Wechsel des Farbschemas
// setzt allein die Variablen im `style`. Beide zeichnen die Ansichten neu; die
// Live-Widgets baut der Wechsel Hell/Dunkel schon selbst um.
//
// Der Sprachwechsel zeichnet ebenso neu, damit Hinweis, Auslass-Zeile und
// Vorlese-Beschreibung auch in einem Teilbaum (Notiz, Canvas, Tafel) die neue
// Sprache tragen, der nicht von selbst neu gerendert wird. Die Live-Widgets
// bekommen über die Sprache in ihrem Schlüssel einen neuen Aufbau; der
// Anstoß hier erreicht auch Editoren außerhalb der Spalten.
function richteBeobachterEin() {
  if (beobachter || typeof MutationObserver !== 'function') return;
  document.addEventListener('i18n-language-changed', () => {
    zeichneAlleNeu();
    baueLiveWidgetsNeu();
  });
  beobachter = new MutationObserver((eintraege) => {
    for (const e of eintraege) if (e.attributeName !== 'style') nurStil = false;
    if (geplant) return;
    geplant = setTimeout(() => {
      const auchLive = nurStil;
      geplant = null;
      nurStil = true;
      zeichneAlleNeu();
      if (auchLive) baueLiveWidgetsNeu();
    }, ENTPRELLUNG_MS);
  });
  beobachter.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'style'],
  });
}
