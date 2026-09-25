// 4T-001893 (Epic 3E-000324): Suchraum «Mindmap» der Suchleiste — die Treffer
// der Suche in der Mindmap-Ansicht (Story 4S-000996).
//
// **Markieren und Hinspringen** (Entscheidung des Product Owners vom
// 2026-09-23, Weg A): Die gewohnte Suchleiste bleibt der einzige Zugang; in der
// Mindmap-Ansicht durchsucht sie die Karte statt der dort ausgeblendeten
// Lese-Ansicht. Jeder Treffer-Knoten wird hervorgehoben, der aktuelle stärker,
// die Karte rückt ihn in die Mitte, und ein eingeklappter Teilbaum mit dem
// Treffer wird beim Anspringen aufgeklappt. Die Karte wird dabei nie umgebaut.
//
// **Was eine Fundstelle ist** (Entscheidung des Product Owners vom 2026-09-23):
// der Titel eines Knotens **und** der Text seiner Notizen. Gezählt und
// angesprungen wird der Knoten, einmal je Knoten, auch wenn Titel und Notiz
// beide passen. Gezählt wird nur, was die Karte zeigt: Knoten jenseits der
// Obergrenze des Kerns sind gar nicht im Baum, Knoten in eingeklappten
// Teilbäumen zählen mit, weil das Anspringen sie sichtbar macht.
//
// **Die Suchregel ist die der Suchleiste.** Das Muster kommt fertig aus
// `buildRegex` in search.js herein — mit Groß/Klein-Schalter und regulärem
// Ausdruck —, statt hier eine zweite Normalisierung zu führen.
//
// **Abhängigkeits-frei** (Injektions-Bauweise wie kanban-suche.js): kein
// app-state, kein api, kein i18n und kein Import aus dem Such-Ordner. Die
// Ansicht je Bereich reicht mindmap-pane.js über `initMindmapSuche` herein.
// Ohne diese Richtung entstünde ein Import-Kreis search.js → dieses Modul →
// Pane → Editor → search.js.
'use strict';

let lage = null;
// Die laufende Suche: Bereich, Ansicht und Dokument, das Muster, die Treffer in
// Zeichen-Reihenfolge und der Index des aktuellen.
let stand = leererStand();
// Die zuletzt beendete Suche, damit eine Neu-Ermittlung im selben Dokument den
// aktuellen Treffer behält (jeder Suchlauf der Leiste beginnt mit dem Beenden).
let gemerkt = { paneIdx: -1, tab: null, aktuell: -1 };

function leererStand() {
  return {
    aktiv: false,
    paneIdx: -1,
    ansicht: null,
    tab: null,
    muster: null,
    treffer: [],
    aktuell: -1,
    beiAenderung: null,
  };
}

/**
 * Verdrahtet die Suche mit der Einbettung der Mindmap.
 *
 * @param {object} zugang
 * @param {Function} zugang.lage (paneIdx) => {ansicht, tab}|null — die Ansicht
 *   des Bereichs und das Dokument, für das sie zuletzt gezeichnet hat.
 */
export function initMindmapSuche(zugang) {
  lage = zugang && typeof zugang.lage === 'function' ? zugang.lage : null;
}

// Enthält der Text eine nicht-leere Fundstelle des Musters? Leere Treffer
// (etwa `^` im regulären Ausdruck) zählen nicht, wie in der Suchleiste.
function enthaelt(muster, text) {
  if (!text) return false;
  muster.lastIndex = 0;
  let m;
  while ((m = muster.exec(text)) !== null) {
    if (m[0].length > 0) return true;
    muster.lastIndex += 1;
    if (!muster.global || muster.lastIndex > text.length) return false;
  }
  return false;
}

/**
 * Die Treffer-Knoten einer Knoten-Liste in ihrer Reihenfolge.
 *
 * @param {Array<{schluessel: string, titel: string, notizen: string[]}>} knoten
 * @param {RegExp} muster
 * @returns {Array<{schluessel: string, imTitel: boolean, inNotiz: boolean}>}
 */
export function ermittleMindmapTreffer(knoten, muster) {
  const out = [];
  if (!muster) return out;
  for (const k of knoten || []) {
    const imTitel = enthaelt(muster, k.titel);
    const inNotiz = (k.notizen || []).some((text) => enthaelt(muster, text));
    if (imTitel || inNotiz) out.push({ schluessel: k.schluessel, imTitel, inNotiz });
  }
  return out;
}

function zeigeLage() {
  const { ansicht, treffer, aktuell } = stand;
  if (!ansicht) return;
  const aktueller = aktuell >= 0 && treffer[aktuell] ? treffer[aktuell].schluessel : null;
  ansicht.setzeTreffer(
    treffer.map((t) => t.schluessel),
    aktueller,
    treffer.filter((t) => t.inNotiz).map((t) => t.schluessel),
  );
}

// Den aktuellen Treffer zeigen: Vorfahren aufklappen, Hervorhebung setzen,
// Knoten in die Mitte rücken. Die Reihenfolge ist nötig, weil ein Knoten in
// einem eingeklappten Teilbaum erst nach dem Aufklappen eine Lage hat.
function springe() {
  const { ansicht, treffer, aktuell } = stand;
  if (!ansicht || aktuell < 0 || !treffer[aktuell]) return;
  const key = treffer[aktuell].schluessel;
  ansicht.klappeAufBis(key);
  zeigeLage();
  ansicht.zentriereKnoten(key);
}

/**
 * Sucht in der Mindmap des Bereichs und zeigt die Treffer.
 *
 * @param {number} paneIdx
 * @param {RegExp} muster das Muster der Suchleiste (`buildRegex`).
 * @param {object} [opts]
 * @param {boolean} [opts.behalteIndex=false] Neu-Ermittlung ohne Bewegung: Der
 *   aktuelle Treffer bleibt, soweit das Dokument dasselbe ist; die Karte wird
 *   weder aufgeklappt noch verschoben. Ohne diese Angabe ist es eine neue
 *   Eingabe, und der erste Treffer wird angesprungen.
 * @param {Function} [opts.beiAenderung] Rückruf nach einer Neu-Ermittlung, die
 *   die Zeichnung auslöst (Zähler der Leiste nachziehen).
 * @returns {{anzahl: number, aktuell: number}}
 */
export function sucheInMindmap(paneIdx, muster, opts = {}) {
  const { behalteIndex = false, beiAenderung = null } = opts;
  beendeMindmapSuche();
  const gefunden = lage ? lage(paneIdx) : null;
  const ansicht = gefunden && gefunden.ansicht ? gefunden.ansicht : null;
  const tab = gefunden ? gefunden.tab : null;
  const treffer = ansicht ? ermittleMindmapTreffer(ansicht.knotenFuerSuche(), muster) : [];
  const gleichesDokument = gemerkt.paneIdx === paneIdx && gemerkt.tab === tab;
  let aktuell = treffer.length > 0 ? 0 : -1;
  if (behalteIndex && gleichesDokument && gemerkt.aktuell >= 0 && treffer.length > 0) {
    aktuell = Math.min(gemerkt.aktuell, treffer.length - 1);
  }
  stand = { aktiv: true, paneIdx, ansicht, tab, muster, treffer, aktuell, beiAenderung };
  if (behalteIndex) zeigeLage();
  else springe();
  return mindmapSuchStand();
}

/** Der Stand für den Zähler der Suchleiste. */
export function mindmapSuchStand() {
  return { anzahl: stand.treffer.length, aktuell: stand.aktuell };
}

function schalte(schritt) {
  const n = stand.treffer.length;
  if (!stand.aktiv || n === 0) return mindmapSuchStand();
  stand.aktuell = (stand.aktuell + schritt + n) % n;
  springe();
  return mindmapSuchStand();
}

/** Zum nächsten Treffer, nach dem letzten wieder zum ersten. */
export function naechsterMindmapTreffer() {
  return schalte(1);
}

/** Zum vorigen Treffer, vor dem ersten zum letzten. */
export function vorigerMindmapTreffer() {
  return schalte(-1);
}

/**
 * Beendet die Suche: alle Hervorhebungen weg. Zoom, Verschiebung und der
 * Klapp-Zustand bleiben, wie sie sind — ein aufgeklappter Teilbaum wird nicht
 * wieder eingeklappt, sonst verschwände der gefundene Knoten erneut.
 */
export function beendeMindmapSuche() {
  if (!stand.aktiv) return;
  if (stand.ansicht) stand.ansicht.loescheTreffer();
  gemerkt = { paneIdx: stand.paneIdx, tab: stand.tab, aktuell: stand.aktuell };
  stand = leererStand();
}

/**
 * Nach jeder Zeichnung der Karte (Live-Aktualisierung, Dokument-Wechsel,
 * geänderte Darstellung): die laufende Suche erneut anwenden, ohne die Karte zu
 * bewegen, und den Zähler nachziehen lassen.
 *
 * @param {number} paneIdx
 */
export function aktualisiereMindmapSuche(paneIdx) {
  if (!stand.aktiv || stand.paneIdx !== paneIdx) return;
  const { muster, beiAenderung } = stand;
  sucheInMindmap(paneIdx, muster, { behalteIndex: true, beiAenderung });
  if (typeof beiAenderung === 'function') beiAenderung();
}
