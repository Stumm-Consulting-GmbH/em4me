// --- Lese-Position einer Spalte messen, setzen und merken -----------------------
// 4T-002641 (Epic 3E-000397, V1, V2, V7, V8): Die Lese-Stelle eines Dokuments
// ist seine oberste sichtbare Zeile samt Schreibmarke, gezählt in Zeilen des
// Quelltexts statt in Bildpunkten. Nur so wandert sie von einer Ansicht in die
// andere und überlebt das Schließen; Prüfung und Begrenzung der Werte liegen im
// Kern `src/shared/lese-stelle.js`, die Ablage im Hauptprozess.
//
// **Messen** (`messeStelle`): in der Ansicht «Gerendert» über die Zeilen-
// Kennungen der Lese-Fläche, in den Editor-Ansichten (Quellcode, Geteilt, Live)
// über die oberste sichtbare Zeile des Editors und seine Schreibmarke; Ansichten
// ohne Zeilen-Bezug (Mindmap, Canvas, Tafel, Folien, System-Seiten) liefern
// `null`.
//
// **Setzen** (`stelleOffeneHer`): im ersten Bildschirm-Takt, vor dem ersten
// Zeichnen, im Editor ohne auf dessen Mess-Durchlauf zu warten; in der
// Lese-Fläche ein zweites Mal, sobald nachladende Inhalte (Diagramme, Bilder)
// ihre Höhe ändern, solange der Anwender nicht selbst eingreift; höchstens
// zwei Sekunden lang.
//
// **Verlassen** (`verlasseAnzeige`): Vor einem Wechsel des Reiters oder der
// Ansicht zeigt die Spalte noch den alten Stand. Dort wird gemessen, die
// Schreibmarke am Reiter vermerkt, die Stelle dauerhaft gemerkt und bei einem
// Ansichts-Wechsel im selben Reiter als offene Stelle ohne Schreibmarke in die
// neue Ansicht mitgenommen.
//
// **Öffnen** (`leseOffeneStelle`, `stelleOffeneHer`): Ein neuer Reiter trägt
// die gelesene Stelle im Feld `stelleOffen`, bis er das erste Mal dargestellt
// wird; dann wird sie im ersten Bildschirm-Takt hergestellt, vor dem ersten
// Zeichnen. Die Schreibmarke geht dabei auch in den verborgenen Editor, damit
// sie beim ersten Wechsel in eine Editor-Ansicht gilt. Ein Sprung an ein Ziel
// (`verwirfStelle`) geht vor: Er verwirft die offene Stelle der Spalte und
// beendet das Nachladen.
//
// Reine Rechen-Anteile stehen als eigene Funktionen ohne DOM vorn und sind in
// `test/unit/renderer/lese-position.test.js` geprüft.
'use strict';

import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { normalisiereStelle, stelleFuerDokument } from '../../../shared/lese-stelle.js';
import { api } from '../app/api.js';

/** Ruhe im Bildlauf, nach der die Stelle dauerhaft gemerkt wird. */
export const RUHE_MS = 2000;
/** Längste Dauer, in der nachladende Inhalte die Stelle erneut setzen lassen. */
export const NACHLADEN_MS = 2000;

// --- Reine Rechen-Anteile ------------------------------------------------------

/**
 * Art der Ansicht eines Ansichts-Modus: `'gerendert'`, `'editor'`,
 * `'geteilt'` (Editor und Lese-Fläche) oder `null` ohne Zeilen-Bezug.
 */
export function ansichtsArt(viewMode) {
  if (viewMode === 'rendered') return 'gerendert';
  if (viewMode === 'source' || viewMode === 'live') return 'editor';
  if (viewMode === 'split') return 'geteilt';
  return null;
}

/** Zeigt der Modus den Editor? */
export function zeigtEditor(viewMode) {
  const art = ansichtsArt(viewMode);
  return art === 'editor' || art === 'geteilt';
}

/** Zeigt der Modus die Lese-Fläche? */
export function zeigtGerendert(viewMode) {
  const art = ansichtsArt(viewMode);
  return art === 'gerendert' || art === 'geteilt';
}

/**
 * Zeile der obersten sichtbaren Kennung. `eintraege` liefert in Dokument-
 * Reihenfolge `{ zeile, oben, unten }`; maßgeblich ist das innerste Element,
 * das die Oberkante schneidet, sonst das erste, das darunter beginnt. Ein
 * Element, das nur bis zur Oberkante (plus `toleranz`) reicht, liegt darüber.
 * Die Liste wird nur so weit gelesen wie nötig.
 * @param {Iterable<{zeile:number, oben:number, unten:number}>} eintraege
 * @returns {number|null}
 */
export function obersteSichtbareZeile(eintraege, oberkante, toleranz = 1) {
  let schneidend = null;
  for (const e of eintraege) {
    if (!e || !Number.isFinite(e.zeile) || e.zeile < 1) continue;
    if (e.unten <= oberkante + toleranz) continue;
    if (e.oben <= oberkante + toleranz) {
      schneidend = e.zeile;
      continue;
    }
    return schneidend !== null ? schneidend : e.zeile;
  }
  return schneidend;
}

/**
 * Dokument-Position einer Schreibmarke. `zeilen` beschreibt das Dokument
 * (`anzahl` und `zeile(n)` mit `{ from, to }`, wie ein CodeMirror-Dokument);
 * bei `amZeilenEnde` und für eine Spalte hinter dem Zeilenende gilt das Ende
 * der Zeile.
 * @returns {number|null}
 */
export function positionDerMarke(marke, zeilen) {
  if (!marke || !zeilen || !Number.isInteger(zeilen.anzahl) || zeilen.anzahl < 1) return null;
  if (!Number.isInteger(marke.zeile) || !Number.isInteger(marke.spalte)) return null;
  const nr = Math.max(1, Math.min(zeilen.anzahl, marke.zeile));
  const zeile = zeilen.zeile(nr);
  if (marke.amZeilenEnde) return zeile.to;
  return Math.min(zeile.from + Math.max(0, marke.spalte), zeile.to);
}

/**
 * Ziel-Position einer vermerkten Schreibmarke, oder `null`, wenn sie nicht
 * gesetzt wird. `istEingebettet(pos)` sagt, ob die Position in einem
 * eingebetteten Bedienelement des Live-Modus liegt (Tabellen-Zelle): Dort stand
 * die Marke nur, weil der Anwender im Bedienelement statt im Text arbeitete,
 * und ein Setzen öffnete das Bedienelement erneut.
 * @returns {number|null}
 */
export function zielDerMarke(marke, zeilen, istEingebettet) {
  const pos = positionDerMarke(marke, zeilen);
  if (pos === null) return null;
  return typeof istEingebettet === 'function' && istEingebettet(pos) ? null : pos;
}

/** Schreibmarke `{ zeile (ab 1), spalte (ab 0) }` aus Zeilen-Nummer und -Anfang. */
export function markeAusPosition(pos, zeilenNummer, zeilenAnfang) {
  if (!Number.isInteger(pos) || !Number.isInteger(zeilenNummer) || zeilenNummer < 1) return null;
  return { zeile: zeilenNummer, spalte: Math.max(0, pos - zeilenAnfang) };
}

// --- Zugang zum Fenster-Zustand ------------------------------------------------
// Fenster-Zustand, Editoren und Zeilen-Kennungen bekommt das Modul gereicht
// statt importiert: Ihre Module importieren dieses, und ein Import zurück
// schlösse einen Kreis über Ordner-Grenzen (scripts/lint-ordner-importe.js).
// Der Aufbau des Fensters (renderer.js) verdrahtet einmal vor dem Start.

let zugang = null;

/**
 * Reicht den Zugang zum Fenster-Zustand; einmal beim Aufbau des Fensters, vor
 * dem ersten Darstellen eines Reiters. Ein unvollständiger Zugang hebt die
 * Verdrahtung auf. Ohne Verdrahtung messen, setzen und merken die Funktionen
 * nichts und werfen nicht. `eingebettet(view, pos)` ist freiwillig: Liegt die
 * Position in einem eingebetteten Bedienelement des Live-Modus, wird dort keine
 * Schreibmarke gesetzt; ohne die Auskunft gilt jede Position als Text.
 * @param {{spalten: () => object[], elemente: (paneIdx:number) => object|null,
 *   editor: (paneIdx:number) => object|null,
 *   kennungen: (renderEl:Element) => Iterable<{line:number, el:Element}>,
 *   elementFuerZeile: (renderEl:Element, zeile:number) => Element|null,
 *   eingebettet?: (view:object, pos:number) => boolean}|null} z
 */
export function verdrahteLesePosition(z) {
  const vollstaendig =
    !!z &&
    ['spalten', 'elemente', 'editor', 'kennungen', 'elementFuerZeile'].every(
      (name) => typeof z[name] === 'function',
    );
  zugang = vollstaendig ? z : null;
}

function spalten() {
  const liste = zugang ? zugang.spalten() : null;
  return Array.isArray(liste) ? liste : [];
}

function elementeDer(paneIdx) {
  return zugang ? zugang.elemente(paneIdx) || null : null;
}

function editorDer(paneIdx) {
  return zugang ? zugang.editor(paneIdx) || null : null;
}

function kennungenDer(renderEl) {
  return zugang ? zugang.kennungen(renderEl) || [] : [];
}

function elementFuerZeile(renderEl, zeile) {
  return zugang ? zugang.elementFuerZeile(renderEl, zeile) || null : null;
}

// Prüfung für `zielDerMarke`; ein Fehler der Auskunft zählt als Text.
function eingebettetIn(view) {
  return (pos) => {
    if (!zugang || typeof zugang.eingebettet !== 'function') return false;
    try {
      return !!zugang.eingebettet(view, pos);
    } catch (err) {
      console.warn('Lese-Position: Bedienelement nicht prüfbar:', err);
      return false;
    }
  };
}

function zeilenDes(doc) {
  return { anzahl: doc.lines, zeile: (n) => doc.line(n) };
}

// --- Zugriff auf die Spalte ----------------------------------------------------

function aktiverReiter(paneIdx) {
  const pane = spalten()[paneIdx];
  return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] || null : null;
}

function hatZeilenBezug(tab) {
  return !!tab && !tab.systemPage && ansichtsArt(tab.viewMode) !== null;
}

function* kennungenMitLage(renderEl) {
  for (const { line, el } of kennungenDer(renderEl)) {
    if (!el.isConnected) continue;
    const r = el.getBoundingClientRect();
    yield { zeile: line, oben: r.top, unten: r.bottom };
  }
}

function zeileObenGerendert(paneIdx) {
  const els = elementeDer(paneIdx);
  if (!els || !els.renderedEl) return null;
  const oberkante = els.renderedEl.getBoundingClientRect().top;
  return obersteSichtbareZeile(kennungenMitLage(els.renderedEl), oberkante);
}

function zeileObenEditor(view) {
  const oberkante = view.scrollDOM.getBoundingClientRect().top;
  const block = view.lineBlockAtHeight(Math.max(0, oberkante + 1 - view.documentTop));
  return view.state.doc.lineAt(block.from).number;
}

function schreibmarkeDes(view) {
  const head = view.state.selection.main.head;
  const zeile = view.state.doc.lineAt(head);
  return markeAusPosition(head, zeile.number, zeile.from);
}

// Misst in einer bestimmten Ansicht; die Spalte muss sie gerade zeigen.
function messeIn(paneIdx, viewMode) {
  const art = ansichtsArt(viewMode);
  if (!art) return null;
  const view = editorDer(paneIdx);
  let roh = null;
  if (art === 'gerendert') {
    roh = { zeileOben: zeileObenGerendert(paneIdx), schreibmarke: null };
  } else if (view) {
    roh = { zeileOben: zeileObenEditor(view), schreibmarke: schreibmarkeDes(view) };
  }
  return normalisiereStelle(roh);
}

/**
 * Lese-Stelle der Spalte in ihrer gerade gezeigten Ansicht.
 * @returns {{zeileOben:number, schreibmarke:null|{zeile:number, spalte:number}}|null}
 */
export function messeStelle(paneIdx) {
  const tab = aktiverReiter(paneIdx);
  if (!hatZeilenBezug(tab)) return null;
  try {
    return messeIn(paneIdx, tab.viewMode);
  } catch (err) {
    console.warn('Lese-Position nicht messbar:', err);
    return null;
  }
}

// --- Setzen --------------------------------------------------------------------

// 4T-002783 (Epic 3E-000392, Befund der Abnahme 3E-000392/001): Die Titelzeile
// der Ansicht «Gerendert» klebt am oberen Rand der Lese-Fläche. Ein Sprung mit
// `block: 'start'` legte das Ziel genau darunter, sichtbar war erst die
// Folge-Zeile. Vor jedem Sprung trägt die Lese-Fläche deshalb die Höhe der
// sichtbaren Titelzeile als oberen Bildlauf-Innenabstand; der Browser legt das
// Ziel dann unter die Titelzeile statt hinter sie, auch mit Hinweis unter dem
// Titel. Ausgeblendete Titelzeile (Erweiterung aus, Fokus-Modus): Höhe 0, kein
// Abstand. Genutzt von Anker- und Zeilen-Sprung und vom Gliederungs-Klick.
export function rolleLeseZielInSicht(els, ziel, verhalten = 'smooth') {
  const flaeche = els && els.renderedEl;
  if (flaeche && flaeche.style) {
    const kopf = flaeche.querySelector(':scope > .title-line');
    const hoehe = kopf && !kopf.hidden ? kopf.getBoundingClientRect().height : 0;
    flaeche.style.scrollPaddingTop = hoehe > 0 ? `${Math.ceil(hoehe)}px` : '';
  }
  ziel.scrollIntoView({ behavior: verhalten, block: 'start' });
}

function setzeGerendert(paneIdx, zeile) {
  const els = elementeDer(paneIdx);
  if (!els || !els.renderedEl) return;
  // Die erste Zeile heißt Dokument-Anfang, wie beim Editor.
  if (zeile <= 1) {
    els.renderedEl.scrollTop = 0;
    return;
  }
  const ziel = elementFuerZeile(els.renderedEl, zeile);
  if (!ziel || !ziel.isConnected) return;
  const oben = els.renderedEl.getBoundingClientRect().top;
  els.renderedEl.scrollTop += ziel.getBoundingClientRect().top - oben;
}

/**
 * Bildlauf-Lage, bei der ein Block mit der Oberkante `blockOben` (gemessen ab
 * dem Dokument-Anfang) oben steht. `dokumentOben` und `kante` sind Bildschirm-
 * Koordinaten des Dokument-Anfangs und der Fläche, `lage` ihr Bildlauf.
 */
export function lageFuerBlock(blockOben, dokumentOben, kante, lage) {
  return Math.max(0, Math.round(blockOben + dokumentOben - kante + lage));
}

function setzeEditor(view, stelle, mitMarke) {
  const doc = view.state.doc;
  const pos = doc.line(stelle.zeileOben).from;
  const markePos = mitMarke
    ? zielDerMarke(stelle.schreibmarke, zeilenDes(doc), eingebettetIn(view))
    : null;
  const auswahl = markePos === null ? {} : { selection: EditorSelection.cursor(markePos) };
  const sc = view.scrollDOM;
  // Die erste Zeile heißt Dokument-Anfang: Lage 0 samt Innenabstand oben, wie
  // ein frisch geöffneter Editor.
  if (stelle.zeileOben <= 1) {
    if (markePos !== null) view.dispatch(auswahl);
    sc.scrollTop = 0;
    return;
  }
  // Ohne Fokus-Raub: dispatch ändert die Auswahl, nicht den Fokus; ohne
  // Text-Änderung bleibt der Reiter ungeändert.
  view.dispatch({
    ...auswahl,
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 }),
  });
  // Der Effekt wirkt erst im nächsten Mess-Durchlauf des Editors, ein Bild
  // später. Die Transaktion hat die Zeilen um das Ziel schon dargestellt; die
  // Lage wird deshalb sofort gesetzt, und der Effekt korrigiert nur nach.
  sc.scrollTop = lageFuerBlock(
    view.lineBlockAt(pos).top,
    view.documentTop,
    sc.getBoundingClientRect().top,
    sc.scrollTop,
  );
}

function zeilenZahl(paneIdx, tab) {
  const view = editorDer(paneIdx);
  return view ? view.state.doc.lines : String(tab.content || '').split('\n').length;
}

// Setzt nur die Schreibmarke, ohne Bildlauf und ohne Fokus; die Marke ist auf
// das Dokument begrenzt. In einem eingebetteten Bedienelement des Live-Modus
// (Tabellen-Zelle) bleibt sie, wo sie ist (`zielDerMarke`).
function setzeMarke(view, marke) {
  const pos = zielDerMarke(marke, zeilenDes(view.state.doc), eingebettetIn(view));
  if (pos !== null) view.dispatch({ selection: EditorSelection.cursor(pos) });
}

function setzeJetzt(paneIdx, stelle, mitMarke) {
  const tab = aktiverReiter(paneIdx);
  if (!hatZeilenBezug(tab)) return;
  const view = editorDer(paneIdx);
  if (zeigtEditor(tab.viewMode) && view) setzeEditor(view, stelle, mitMarke);
  if (zeigtGerendert(tab.viewMode)) setzeGerendert(paneIdx, stelle.zeileOben);
}

// Nachladende Inhalte: Ändert die Lese-Fläche ihre Höhe, wird die Stelle
// erneut gesetzt; jede Eingabe des Anwenders (Rad, Taste, Ziehen, Berühren) und
// der Ablauf der Frist beenden das. Den Editor-Inhalt beobachtet er nicht: Dessen
// Höhen misst der Editor selbst laufend nach, und ein Setzen dort verschöbe die
// Zeilen unter der Hand des Anwenders.
const nachladen = [null, null];

function beendeNachladen(paneIdx) {
  const lauf = nachladen[paneIdx];
  if (lauf) lauf();
  nachladen[paneIdx] = null;
}

const EINGABEN = ['wheel', 'keydown', 'pointerdown', 'touchstart'];

function beobachteNachladen(paneIdx, tab, stelle) {
  beendeNachladen(paneIdx);
  if (typeof ResizeObserver !== 'function') return;
  const els = elementeDer(paneIdx);
  if (!zeigtGerendert(tab.viewMode) || !els || !els.renderedHtml) return;
  // Gesetzt wird im nächsten Bildschirm-Takt, nicht im Rückruf selbst; im
  // geteilten Modus folgt dabei auch der Editor, der dort danebensteht.
  let takt = 0;
  const beobachter = new ResizeObserver(() => {
    if (takt) return;
    takt = requestAnimationFrame(() => {
      takt = 0;
      if (aktiverReiter(paneIdx) !== tab) return beendeNachladen(paneIdx);
      setzeJetzt(paneIdx, stelle, false);
    });
  });
  const ende = () => beendeNachladen(paneIdx);
  const frist = setTimeout(ende, NACHLADEN_MS);
  nachladen[paneIdx] = () => {
    beobachter.disconnect();
    cancelAnimationFrame(takt);
    clearTimeout(frist);
    for (const art of EINGABEN) window.removeEventListener(art, ende, true);
  };
  for (const art of EINGABEN) window.addEventListener(art, ende, true);
  beobachter.observe(els.renderedHtml);
}

// --- Merken --------------------------------------------------------------------

function merkbar(tab) {
  return (
    !!tab && typeof tab.path === 'string' && tab.path !== '' && !tab.systemPage && !tab.manualPage
  );
}

/**
 * Meldet die Stelle eines Reiters an die Ablage. Ohne Stelle bleibt die früher
 * gemerkte stehen; eine Ansicht ohne Schreibmarke (Gerendert) behält die am
 * Reiter vermerkte. Ein Fehler der Brücke bleibt still und wird protokolliert.
 * @returns {Promise<void>}
 */
export function merkeDauerhaft(tab, stelle) {
  if (!merkbar(tab) || !stelle || typeof api.lesePositionMerken !== 'function') {
    return Promise.resolve();
  }
  const gemeldet = {
    zeileOben: stelle.zeileOben,
    schreibmarke: stelle.schreibmarke || tab.schreibmarke || null,
  };
  try {
    return Promise.resolve(api.lesePositionMerken(tab.path, gemeldet)).then(
      () => undefined,
      (err) => console.warn('Lese-Position nicht gemerkt:', tab.path, err),
    );
  } catch (err) {
    console.warn('Lese-Position nicht gemerkt:', tab.path, err);
    return Promise.resolve();
  }
}

/** Merkt die Stelle des aktiven Reiters einer Spalte dauerhaft. */
export function merkeAktiveStelle(paneIdx) {
  return merkeDauerhaft(aktiverReiter(paneIdx), messeStelle(paneIdx));
}

/** Merkt die Stellen der aktiven Reiter aller Spalten (Schließen des Fensters). */
export function merkeAlleSpalten() {
  const laeufe = [];
  for (let i = 0; i < spalten().length; i++) laeufe.push(merkeAktiveStelle(i));
  return Promise.all(laeufe);
}

const ruhe = [null, null];

/** Stellt den Ruhe-Timer der Spalte neu; nach `RUHE_MS` ohne Bildlauf wird gemerkt. */
export function planeMerkenNachRuhe(paneIdx) {
  clearTimeout(ruhe[paneIdx]);
  ruhe[paneIdx] = setTimeout(() => {
    ruhe[paneIdx] = null;
    void merkeAktiveStelle(paneIdx);
  }, RUHE_MS);
}

// --- Verlassen und Ankommen ----------------------------------------------------

// Was die Spalte zuletzt fertig dargestellt hat: `{ tab, viewMode }`.
const anzeige = [null, null];

/** Vermerkt den dargestellten Stand der Spalte (nach dem Darstellen). */
export function notiereAnzeige(paneIdx) {
  const tab = aktiverReiter(paneIdx);
  anzeige[paneIdx] = tab ? { tab, viewMode: tab.viewMode } : null;
}

/**
 * Vor einem Wechsel von Reiter oder Ansicht aufzurufen, solange die Spalte
 * noch den alten Stand zeigt. Ohne Wechsel ohne Wirkung; mehrfacher Aufruf
 * für denselben Wechsel misst nur einmal.
 */
export function verlasseAnzeige(paneIdx) {
  const vorher = anzeige[paneIdx];
  const tab = aktiverReiter(paneIdx);
  if (!vorher || (vorher.tab === tab && tab && tab.viewMode === vorher.viewMode)) return;
  anzeige[paneIdx] = null;
  beendeNachladen(paneIdx);
  let stelle = null;
  try {
    stelle = vorher.tab.systemPage ? null : messeIn(paneIdx, vorher.viewMode);
  } catch (err) {
    console.warn('Lese-Position nicht messbar:', err);
  }
  if (stelle && stelle.schreibmarke) vorher.tab.schreibmarke = stelle.schreibmarke;
  void merkeDauerhaft(vorher.tab, stelle);
  // Ansichts-Wechsel im selben Reiter: Die Stelle wandert als offene Stelle
  // ohne Schreibmarke mit und wird im ersten Bildschirm-Takt hergestellt, vor
  // dem ersten Zeichnen der neuen Ansicht. Läuft dabei `renderPaneContent`,
  // stellt es sie ebenso her; wer zuerst kommt, leert das Feld. Ohne Stelle
  // (Ansicht ohne Zeilen-Bezug) bleibt das bisherige Verhalten.
  if (tab && vorher.tab === tab) {
    const mitgenommen = stelle && hatZeilenBezug(tab) ? { ...stelle, schreibmarke: null } : null;
    if (mitgenommen) tab.stelleOffen = mitgenommen;
    requestAnimationFrame(() => {
      if (aktiverReiter(paneIdx) === tab) stelleOffeneHer(paneIdx);
      else if (mitgenommen && tab.stelleOffen === mitgenommen) tab.stelleOffen = null;
    });
  }
  requestAnimationFrame(() => requestAnimationFrame(() => notiereAnzeige(paneIdx)));
}

/**
 * Vor dem Ersetzen des Inhalts eines Reiters (`tab-ersetzen.js`), solange er
 * noch die alte Datei zeigt und ihren Pfad trägt: Zeigt die Spalte ihn, wird
 * seine Stelle gemessen und unter dem alten Pfad gemerkt. Danach löst sich der
 * Reiter von der alten Datei: Schreibmarke, offene Stelle und der vermerkte
 * dargestellte Stand fallen weg, damit nichts davon unter den neuen Pfad
 * gelangt und die neue Datei ihre Schreibmarke im Editor wieder bekommt.
 */
export function loeseReiterVonDatei(paneIdx, tab) {
  if (!tab) return;
  if (aktiverReiter(paneIdx) === tab) {
    beendeNachladen(paneIdx);
    let stelle = null;
    try {
      stelle = tab.systemPage ? null : messeIn(paneIdx, tab.viewMode);
    } catch (err) {
      console.warn('Lese-Position nicht messbar:', err);
    }
    void merkeDauerhaft(tab, stelle);
  }
  tab.schreibmarke = null;
  tab.stelleOffen = null;
  for (let i = 0; i < anzeige.length; i++) {
    if (anzeige[i] && anzeige[i].tab === tab) anzeige[i] = null;
    if (imEditor[i] === tab) imEditor[i] = null;
  }
}

// Zuletzt in den Editor der Spalte geladener Reiter.
const imEditor = [null, null];

/**
 * Nach dem Text-Tausch in `syncEditorForPane`: Kommt ein Reiter in den Editor
 * zurück, bekommt er seine Schreibmarke wieder, ohne Bildlauf und ohne Fokus.
 */
export function wendeSchreibmarkeAn(paneIdx, view, tab) {
  if (imEditor[paneIdx] === tab) return;
  imEditor[paneIdx] = tab;
  const marke = tab && tab.schreibmarke;
  if (!view || !marke) return;
  const begrenzt = stelleFuerDokument({ zeileOben: 1, schreibmarke: marke }, view.state.doc.lines);
  if (begrenzt) setzeMarke(view, begrenzt.schreibmarke);
}

// --- Öffnen: die offene Stelle -------------------------------------------------

/**
 * Liest die gemerkte Stelle eines Pfads für einen neuen Reiter. Scheitert nie:
 * ohne Brücke, ohne Eintrag oder bei einem Fehler `null` (der Reiter beginnt
 * dann oben).
 * @returns {Promise<{zeileOben:number, schreibmarke:object|null}|null>}
 */
export async function leseOffeneStelle(pfad) {
  if (typeof pfad !== 'string' || pfad === '' || typeof api.lesePositionLesen !== 'function') {
    return null;
  }
  try {
    return normalisiereStelle(await api.lesePositionLesen(pfad));
  } catch (err) {
    console.warn('Lese-Position nicht lesbar:', pfad, err);
    return null;
  }
}

/**
 * Im ersten Bildschirm-Takt nach dem Darstellen aufzurufen, nachdem die
 * Bildpunkt-Werte des Reiters gesetzt sind: Trägt der aktive Reiter eine offene
 * Stelle, wird sie sofort hergestellt und das Feld geleert. Die erreichte Lage
 * wird als Bildpunkt-Wert des Reiters eingetragen, damit ein weiterer
 * Darstellungs-Lauf desselben Takts sie nicht auf 0 zurücksetzt. Eine Ansicht
 * ohne Zeilen-Bezug lässt die Stelle bis zur nächsten Ansicht mit Zeilen-Bezug
 * stehen.
 */
export function stelleOffeneHer(paneIdx) {
  const tab = aktiverReiter(paneIdx);
  if (!tab || !tab.stelleOffen || !hatZeilenBezug(tab)) return;
  const stelle = tab.stelleOffen;
  tab.stelleOffen = null;
  try {
    const view = editorDer(paneIdx);
    const begrenzt = stelleFuerDokument(stelle, zeilenZahl(paneIdx, tab));
    if (!begrenzt) return;
    if (begrenzt.schreibmarke) {
      tab.schreibmarke = {
        zeile: begrenzt.schreibmarke.zeile,
        spalte: begrenzt.schreibmarke.spalte,
      };
      // Verborgener Editor mit dem Text dieses Reiters: Die Marke gilt beim
      // ersten Wechsel in eine Editor-Ansicht, ein gewöhnlicher Ansichts-Wechsel
      // setzt danach keine Marke mehr.
      if (view && !zeigtEditor(tab.viewMode) && imEditor[paneIdx] === tab) {
        setzeMarke(view, begrenzt.schreibmarke);
      }
    }
    setzeJetzt(paneIdx, begrenzt, true);
    const els = elementeDer(paneIdx);
    if (zeigtGerendert(tab.viewMode) && els && els.renderedEl) {
      tab.scrollRen = els.renderedEl.scrollTop;
    }
    if (zeigtEditor(tab.viewMode) && view) tab.scrollSrc = view.scrollDOM.scrollTop;
    beobachteNachladen(paneIdx, tab, begrenzt);
  } catch (err) {
    console.warn('Lese-Position nicht herstellbar:', err);
  }
}

/**
 * 4T-002642 (Epic 3E-000397): Stellt eine Stelle aus dem Verlauf («Zurück»,
 * «Vor») samt Schreibmarke am aktiven Reiter der Spalte her, im ersten
 * Bildschirm-Takt und vor dem ersten Zeichnen. Wirkt auch bei einem schon
 * dargestellten Reiter: Läuft dabei ein Darstellungs-Lauf, stellt dessen Takt
 * die offene Stelle her; sonst tut es der eigene Takt. Bewusst nicht über die
 * Sprung-Funktionen, die die offene Stelle verwerfen.
 */
export function stelleHer(paneIdx, stelle) {
  const tab = aktiverReiter(paneIdx);
  const geprueft = normalisiereStelle(stelle);
  if (!tab || !geprueft) return;
  beendeNachladen(paneIdx);
  tab.stelleOffen = geprueft;
  requestAnimationFrame(() => {
    if (aktiverReiter(paneIdx) === tab) stelleOffeneHer(paneIdx);
  });
}

/**
 * Ein Sprung an ein Ziel (Verweis, Zeile, Suchtreffer, Rückverweis) geht vor:
 * verwirft die offene Stelle des aktiven Reiters der Spalte, auch die eines
 * gerade laufenden Ansichts-Wechsels, und beendet das Nachladen.
 */
export function verwirfStelle(paneIdx) {
  if (paneIdx !== 0 && paneIdx !== 1) return;
  const tab = aktiverReiter(paneIdx);
  if (tab) tab.stelleOffen = null;
  beendeNachladen(paneIdx);
}
