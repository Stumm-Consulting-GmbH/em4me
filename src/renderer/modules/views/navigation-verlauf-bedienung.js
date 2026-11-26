// --- «Zurück» und «Vor» zwischen besuchten Orten eines Fensters ----------------
// 4T-002642 (Epic 3E-000397, V9 bis V16): Das Fenster führt genau einen Verlauf
// der besuchten Orte (Kern `src/shared/navigations-verlauf.js`). Ein Ort ist ein
// Dokument samt Lese-Stelle; sein Schlüssel ist der Vergleichs-Schlüssel des
// Pfads **des Reiters** (`pathCompareKey`), bei Reitern ohne Pfad eine im Modul
// vergebene Kennung je Reiter-Objekt.
//
// **Verlassen und Ankommen** (`merkeVerlassen`, `merkeAnkunft`): eingehängt in
// `activateTab` (`src/renderer/modules/tabs/tabs.js`), also bei jedem Wechsel
// des gezeigten Dokuments. Vor dem Wechsel wird die Stelle des Orts gemessen,
// den der aktuelle Eintrag meint, sofern sein Reiter in einer Spalte gezeigt
// wird. Ist der gezeigte Reiter der aktiven Spalte nicht der Ort des aktuellen
// Eintrags (leerer Verlauf, oder er ist nach dem Schließen nachgerückt), wird
// er danach als Besuch mit seiner gemessenen Stelle eingetragen; das
// Nachrücken selbst legt keinen Eintrag an. Nach dem Wechsel entsteht der
// Eintrag des nun gezeigten Reiters. Aktivierungen, die
// kein Wechsel des Anwenders sind (Rückfrage vor dem Schließen, Verschieben in
// die andere Spalte, Schritte aus «Zurück» und «Vor»), stehen in der Hülle
// `ohneVerlauf`.
//
// **Sprünge im Dokument** (`merkeSprung`, `merkeSprungZiel`): Anker, Zeile,
// Rückverweis, Inhaltsverzeichnis und Suchtreffer-Liste tragen vor dem Sprung
// die Stelle ein und legen danach einen Eintrag mit dem Ziel an; nahe Stellen
// fasst der Kern zusammen. Folgt der Sprung unmittelbar auf das Öffnen des
// Ziels (Verweis mit Anker), bekommt der eben angelegte Eintrag das Ziel.
//
// **Zurück und Vor** (`geheZurueck`, `geheVor`): Der Reiter des Ziel-Eintrags
// kommt in seiner Spalte nach vorn, ein geschlossenes Dokument öffnet in der
// aktiven Spalte; die Stelle stellt `stelleHer` der Lese-Position her. Nicht
// mehr vorhandene Orte werden entfernt, übersprungen und gezählt.
//
// Den Fenster-Zustand und die Bedienung bekommt das Modul gereicht
// (`verdrahteNavigationsVerlauf`, aufgerufen in `src/renderer/renderer.js`):
// Die Module, die es bräuchte, importieren es selbst. Vor der Verdrahtung ist
// jede Funktion wirkungslos und wirft nicht.
'use strict';

import { erzeugeNavigationsVerlauf } from '../../../shared/navigations-verlauf.js';
import { pathCompareKey } from '../../../shared/platform.js';
import { api } from '../app/api.js';
import { messeStelle, stelleHer } from './lese-position.js';

/** Anzeige-Dauer der Hinweise in der Statusleiste. */
export const HINWEIS_MS = 2000;

const PFLICHT = [
  'spalten',
  'aktiveSpalte',
  'aktiviereSpalte',
  'aktiviereReiter',
  'oeffne',
  'meldeMenue',
  'hinweis',
  't',
];

let zugang = null;
let verlauf = erzeugeNavigationsVerlauf();
// Tiefe der Hülle `ohneVerlauf`; größer 0 heißt: kein Eintrag.
let aus = 0;
// Schlüssel der letzten Ankunft, solange ihr kein Verlassen und kein Sprung
// gefolgt ist; ein Sprung «nach dem Öffnen» setzt dann das Ziel dieses Eintrags.
let frisch = null;
// Spalte, die unmittelbar vor einem Spalten-Wechsel aktiv war, solange im selben
// Zug noch eine Aktivierung folgen kann (`merkeSpaltenWechsel`).
let gewechseltVon = null;
const reiterKennungen = new WeakMap();
let naechsteKennung = 1;

// Die zwei Knöpfe der Statusleiste (Schritt 7). Ohne möglichen Schritt sind sie
// ausgegraut und bleiben an ihrem Platz: Sie stehen bewusst **nicht** in der
// Liste der Schalter, die die Einstellung «nicht aktivierbare Schalter
// ausblenden» verschwinden lässt (`STATUSBAR_AVAILABILITY_TARGETS`). Sonst
// erschienen und verschwänden sie bei jedem Schritt, und die linke Zone der
// Statusleiste spränge (Zusicherung des Ablauf-Falls `SD-03`).
const KNOEPFE = [
  { id: 'btn-nav-back', moeglich: () => kannZurueck(), aktion: () => geheZurueck() },
  { id: 'btn-nav-forward', moeglich: () => kannVor(), aktion: () => geheVor() },
];

/**
 * Reicht den Zugang zum Fenster; einmal beim Aufbau des Fensters. Ein
 * unvollständiger Zugang hebt die Verdrahtung auf. `vorhanden(pfad)` ist
 * freiwillig (Vorgabe: die Brücke `fileExists`). Die Knöpfe bekommen hier
 * ihren Klick.
 * @param {{spalten: () => object[], aktiveSpalte: () => number,
 *   aktiviereSpalte: (p:number) => void, aktiviereReiter: (p:number, i:number) => void,
 *   oeffne: (p:number, pfad:string, optionen:object) => Promise<unknown>,
 *   meldeMenue: () => void, hinweis: (text:string) => void,
 *   t: (key:string) => string, vorhanden?: (pfad:string) => Promise<boolean>}|null} z
 */
export function verdrahteNavigationsVerlauf(z) {
  const vollstaendig = !!z && PFLICHT.every((name) => typeof z[name] === 'function');
  zugang = vollstaendig ? z : null;
  if (typeof document === 'undefined') return;
  for (const knopf of KNOEPFE) {
    const el = document.getElementById(knopf.id);
    if (!el || el.dataset.navVerdrahtet === '1') continue;
    el.dataset.navVerdrahtet = '1';
    el.addEventListener('click', () => {
      void knopf.aktion();
    });
  }
  // Den Anfangs-Zustand (ausgegraut) trägt das Markup; nachgezogen wird ab der
  // ersten Änderung des Verlaufs (`melde`).
}

// Zieht `disabled` der beiden Knöpfe nach; ausgeblendet werden sie hier nie.
function zieheKnoepfeNach() {
  if (typeof document === 'undefined') return;
  for (const knopf of KNOEPFE) {
    const el = document.getElementById(knopf.id);
    if (el) el.disabled = !knopf.moeglich();
  }
}

/** Leert den Verlauf (frisches Fenster; für Prüfungen). */
export function leereNavigationsVerlauf() {
  verlauf = erzeugeNavigationsVerlauf();
  frisch = null;
  aus = 0;
  gewechseltVon = null;
}

// --- Auskunft --------------------------------------------------------------------

/** Ist «Zurück» gerade möglich? */
export function kannZurueck() {
  return !!zugang && verlauf.kannZurueck();
}

/** Ist «Vor» gerade möglich? */
export function kannVor() {
  return !!zugang && verlauf.kannVor();
}

/** Felder für die Menü-Meldung. */
export function navigationsZustand() {
  return { kannZurueck: kannZurueck(), kannVor: kannVor() };
}

/** Zahl der Einträge (für Prüfungen). */
export function verlaufsLaenge() {
  return verlauf.laenge();
}

// --- Schlüssel und Orte ----------------------------------------------------------

/** Schlüssel eines Reiters: Vergleichs-Schlüssel des Pfads oder Kennung. */
export function schluesselVon(tab) {
  if (!tab || typeof tab !== 'object') return null;
  if (typeof tab.path === 'string' && tab.path !== '') return pathCompareKey(tab.path);
  let kennung = reiterKennungen.get(tab);
  if (!kennung) {
    kennung = `#reiter-${naechsteKennung++}`;
    reiterKennungen.set(tab, kennung);
  }
  return kennung;
}

function spalten() {
  const liste = zugang ? zugang.spalten() : null;
  return Array.isArray(liste) ? liste : [];
}

function aktiveSpalte() {
  const idx = zugang ? zugang.aktiveSpalte() : 0;
  return Number.isInteger(idx) ? idx : 0;
}

function aktiverReiterDer(paneIdx) {
  const pane = spalten()[paneIdx];
  return pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] || null : null;
}

function eintragFuer(tab, stelle) {
  return {
    schluessel: schluesselVon(tab),
    pfad: typeof tab.path === 'string' && tab.path !== '' ? tab.path : null,
    stelle: stelle || null,
  };
}

// Spalte, die den Reiter mit diesem Schlüssel gerade zeigt; die aktive zuerst.
function gezeigtIn(schluessel) {
  const liste = spalten();
  const reihe = [aktiveSpalte(), ...liste.keys()];
  for (const p of reihe) {
    if (schluesselVon(aktiverReiterDer(p)) === schluessel) return p;
  }
  return -1;
}

// Reiter mit diesem Schlüssel im Fenster; ein gezeigter vor einem verdeckten.
function findeReiter(schluessel) {
  const gezeigt = gezeigtIn(schluessel);
  if (gezeigt >= 0) return { paneIdx: gezeigt, tabIdx: spalten()[gezeigt].activeIndex };
  const liste = spalten();
  for (let p = 0; p < liste.length; p++) {
    const tabs = (liste[p] && liste[p].tabs) || [];
    const i = tabs.findIndex((tab) => schluesselVon(tab) === schluessel);
    if (i >= 0) return { paneIdx: p, tabIdx: i };
  }
  return null;
}

function melde() {
  if (!zugang) return;
  try {
    zugang.meldeMenue();
  } catch (err) {
    console.warn('Verlauf: Menü-Zustand nicht meldbar:', err);
  }
  zieheKnoepfeNach();
}

// Trägt die Stelle des aktuellen Eintrags ein, wenn sein Reiter gezeigt wird.
function trageStelleEin() {
  const akt = verlauf.aktueller();
  if (!akt) return;
  const p = gezeigtIn(akt.schluessel);
  if (p < 0) return;
  const stelle = messeStelle(p);
  if (stelle) verlauf.aktualisiereAktuellen(stelle);
}

// Vor dem Verlassen der Spalte: Die Stelle des aktuellen Eintrags wird
// eingetragen; ist der gezeigte Reiter der Spalte nicht der Ort des aktuellen
// Eintrags (leerer Verlauf, nachgerückt nach dem Schließen), wird er zuerst als
// Besuch mit seiner gemessenen Stelle eingetragen. So führt «Zurück» an die
// Ausgangsstelle und nicht an einen Ort davor.
function trageVerlassenenEin(paneIdx) {
  trageStelleEin();
  const tab = aktiverReiterDer(paneIdx);
  if (!tab) return;
  const akt = verlauf.aktueller();
  if (akt && akt.schluessel === schluesselVon(tab)) return;
  verlauf.besuche(eintragFuer(tab, messeStelle(paneIdx)));
}

// --- Hülle -----------------------------------------------------------------------

/**
 * Führt `fn` aus, ohne dass eine Aktivierung darin einen Eintrag anlegt.
 * Liefert `fn` ein Versprechen, gilt die Hülle bis zu dessen Ende.
 */
export function ohneVerlauf(fn) {
  aus += 1;
  let ergebnis;
  try {
    ergebnis = fn();
  } catch (err) {
    aus -= 1;
    throw err;
  }
  if (ergebnis && typeof ergebnis.then === 'function') {
    return Promise.resolve(ergebnis).finally(() => {
      aus -= 1;
    });
  }
  aus -= 1;
  return ergebnis;
}

// --- Verlassen und Ankommen ------------------------------------------------------

/**
 * Beim Wechsel der aktiven Spalte, bevor er vollzogen ist (`activatePane`):
 * vermerkt die verlassene Spalte bis zum Ende des laufenden Zugs. Holt ein
 * Verweis oder ein Klick ein Dokument der anderen Spalte nach vorn, folgt die
 * Aktivierung des Reiters im selben Zug; der verlassene Ort ist dann der der
 * verlassenen Spalte und nicht der Reiter, den die Ziel-Spalte bis eben zeigte.
 * War der Anwender schon vorher in die Spalte gewechselt, ist der Vermerk
 * verfallen, und der dort gezeigte Reiter ist der verlassene Ort.
 */
export function merkeSpaltenWechsel(vorher) {
  if (!zugang || aus > 0 || !Number.isInteger(vorher)) return;
  gewechseltVon = vorher;
  queueMicrotask(() => {
    gewechseltVon = null;
  });
}

/** Vor einem Wechsel des gezeigten Dokuments (Anfang von `activateTab`). */
export function merkeVerlassen() {
  if (!zugang || aus > 0) return;
  frisch = null;
  const verlassen = gewechseltVon !== null ? gewechseltVon : aktiveSpalte();
  gewechseltVon = null;
  trageVerlassenenEin(verlassen);
}

/** Nach einem Wechsel des gezeigten Dokuments (Ende von `activateTab`). */
export function merkeAnkunft() {
  if (!zugang || aus > 0) return;
  const tab = aktiverReiterDer(aktiveSpalte());
  if (!tab) return;
  const schluessel = schluesselVon(tab);
  const akt = verlauf.aktueller();
  if (!akt || akt.schluessel !== schluessel) {
    verlauf.besuche(eintragFuer(tab, tab.stelleOffen || null));
    frisch = schluessel;
  }
  melde();
}

/**
 * Ersetzen des Inhalts eines Reiters (`tab-ersetzen.js`) ist ein Wechsel des
 * gezeigten Dokuments, bei dem das Reiter-Objekt bleibt. `vorher` läuft, solange
 * die Spalte noch die alte Datei zeigt: Ihr Eintrag bekommt ihre Stelle.
 * `nachher` läuft nach der Aktivierung, die selbst in `ohneVerlauf` steht: Der
 * Eintrag der neuen Datei entsteht mit ihrer offenen Stelle.
 */
export function merkeErsetzenVorher(paneIdx) {
  if (!zugang || aus > 0) return;
  frisch = null;
  gewechseltVon = null;
  trageVerlassenenEin(paneIdx);
}

export function merkeErsetzenNachher() {
  merkeAnkunft();
}

/**
 * Beim Schließen des aktiven Reiters, solange er noch gezeigt wird: trägt die
 * Stelle des aktuellen Eintrags ein. Das Nachrücken legt keinen Eintrag an.
 */
export function merkeVorSchliessen() {
  if (!zugang || aus > 0) return;
  trageStelleEin();
}

// --- Sprünge im Dokument ---------------------------------------------------------

/**
 * Vor einem Sprung an eine Zeile `zeile` im Dokument der Spalte. Mit
 * `nachOeffnen` folgt der Sprung auf das Öffnen dieses Dokuments: Ist seit
 * dessen Ankunft nichts geschehen, bekommt ihr Eintrag das Ziel, statt dass ein
 * zweiter entsteht. Ohne bekannte Zeile entsteht der Eintrag ohne Stelle; sie
 * wird beim Verlassen gemessen.
 */
export function merkeSprung(paneIdx, zeile, { nachOeffnen = false } = {}) {
  if (!zugang || aus > 0) return;
  const tab = aktiverReiterDer(paneIdx);
  if (!tab) return;
  const schluessel = schluesselVon(tab);
  const ziel = Number.isInteger(zeile) && zeile >= 1 ? { zeileOben: zeile } : null;
  if (nachOeffnen && frisch === schluessel) {
    frisch = null;
    if (ziel) verlauf.aktualisiereAktuellen(ziel);
    return;
  }
  frisch = null;
  trageVerlassenenEin(paneIdx);
  verlauf.besuche(eintragFuer(tab, ziel));
  melde();
}

/**
 * Nach einem Sprung mit unbekanntem Ziel (Suchtreffer-Liste), vor dem
 * `merkeVerlassen` gelaufen ist. Hat der Sprung das Dokument gewechselt, steht
 * der Eintrag schon; sonst entsteht einer für denselben Ort ohne Stelle.
 */
export function merkeSprungZiel() {
  if (!zugang || aus > 0) return;
  const tab = aktiverReiterDer(aktiveSpalte());
  if (!tab) return;
  const schluessel = schluesselVon(tab);
  if (frisch === schluessel) {
    frisch = null;
    return;
  }
  verlauf.besuche(eintragFuer(tab, null));
  melde();
}

/** Umbenanntes oder verschobenes Dokument: Einträge folgen dem neuen Pfad. */
export function benenneVerlaufUm(altPfad, neuPfad) {
  if (typeof altPfad !== 'string' || typeof neuPfad !== 'string') return;
  if (altPfad === '' || neuPfad === '') return;
  verlauf.benenneUm(pathCompareKey(altPfad), pathCompareKey(neuPfad), neuPfad);
  // Das Zusammenlegen benachbarter gleicher Einträge kann einen Schritt nehmen.
  melde();
}

// --- Zurück und Vor --------------------------------------------------------------

async function istVorhanden(pfad) {
  try {
    if (typeof zugang.vorhanden === 'function') return !!(await zugang.vorhanden(pfad));
    if (api && typeof api.fileExists === 'function') return !!(await api.fileExists(pfad));
  } catch (err) {
    console.warn('Verlauf: Datei nicht prüfbar:', pfad, err);
    return false;
  }
  return true;
}

// Zeigt den Ort eines Eintrags; liefert false, wenn es ihn nicht mehr gibt.
async function zeige(ziel) {
  const offen = findeReiter(ziel.schluessel);
  if (offen) {
    ohneVerlauf(() => {
      zugang.aktiviereSpalte(offen.paneIdx);
      zugang.aktiviereReiter(offen.paneIdx, offen.tabIdx);
    });
    stelleHer(offen.paneIdx, ziel.stelle);
    return true;
  }
  if (!ziel.pfad || !(await istVorhanden(ziel.pfad))) return false;
  try {
    // Ohne Stelle öffnet das Dokument an seiner gemerkten Lese-Position.
    await ohneVerlauf(() => zugang.oeffne(aktiveSpalte(), ziel.pfad, { zielFolgt: !!ziel.stelle }));
  } catch (err) {
    console.warn('Verlauf: Dokument nicht zu öffnen:', ziel.pfad, err);
    return false;
  }
  const geoeffnet = findeReiter(ziel.schluessel);
  if (!geoeffnet) return false;
  stelleHer(geoeffnet.paneIdx, ziel.stelle);
  return true;
}

function hinweis(key, anzahl) {
  try {
    const text =
      anzahl === undefined ? zugang.t(key) : zugang.t(key).replace('{count}', String(anzahl));
    zugang.hinweis(text);
  } catch (err) {
    console.warn('Verlauf: Hinweis nicht anzeigbar:', err);
  }
}

function hinweisUebersprungen(anzahl) {
  if (anzahl === 1) hinweis('statusbar.navSkippedOne');
  else if (anzahl > 1) hinweis('statusbar.navSkipped', anzahl);
}

let laeuft = false;

// Ein Schritt in Richtung `vorwaerts`. Nicht mehr vorhandene Orte werden erst
// am Ende entfernt, damit der Zeiger des Kerns dazwischen nicht springt.
async function schritt(vorwaerts) {
  if (!zugang || laeuft) return false;
  const moeglich = vorwaerts ? verlauf.kannVor() : verlauf.kannZurueck();
  if (!moeglich) {
    hinweis(vorwaerts ? 'statusbar.navNoForward' : 'statusbar.navNoBack');
    return false;
  }
  laeuft = true;
  frisch = null;
  trageStelleEin();
  const fehlend = new Set();
  let erreicht = false;
  try {
    for (;;) {
      const ziel = vorwaerts ? verlauf.vor() : verlauf.zurueck();
      if (!ziel) break;
      if (fehlend.has(ziel.schluessel)) continue;
      if (await zeige(ziel)) {
        erreicht = true;
        break;
      }
      fehlend.add(ziel.schluessel);
    }
  } finally {
    if (fehlend.size > 0) verlauf.entferneWo((e) => fehlend.has(e.schluessel));
    laeuft = false;
  }
  melde();
  if (fehlend.size > 0) hinweisUebersprungen(fehlend.size);
  else if (!erreicht) hinweis(vorwaerts ? 'statusbar.navNoForward' : 'statusbar.navNoBack');
  return erreicht;
}

/** «Zurück»: zum vorigen Ort des Verlaufs. */
export function geheZurueck() {
  return schritt(false);
}

/** «Vor»: zum nächsten Ort des Verlaufs. */
export function geheVor() {
  return schritt(true);
}

// --- Seitliche Maustasten --------------------------------------------------------

/** Taste 3 (zurück) und 4 (vor) beim Loslassen; alle übrigen bleiben unberührt. */
export function behandleMaustaste(e) {
  if (!e || (e.button !== 3 && e.button !== 4)) return;
  e.preventDefault();
  void (e.button === 3 ? geheZurueck() : geheVor());
}
