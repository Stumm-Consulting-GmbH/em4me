// 4T-001904 (Epic 3E-000318): Die Anzeige-Schalter der Kanban-Tafel — die eine
// Liste, aus der Hauptprozess (Menü-Häkchen) und Anzeige-Prozess (Zeichnung,
// Umschalten) dieselbe Antwort lesen.
//
// **Warum eine Liste und nicht ein einzelner Schalter.** Die Ausbaustufe bringt
// zwei gleichartige Schalter: «Tags am Kartenfuß» (4T-001904) und «Termine
// relativ anzeigen» (4T-001903). Beide sind globale Einstellungen, beide
// wirken nur auf die Anzeige, beide stehen als Häkchen im Untermenü
// «Ansicht → Kanban-Tafel». Der zweite kommt hier als zweite Zeile hinzu und
// nicht als Sonderfall; Schlüssel und Vorgabe stehen damit an genau einer
// Stelle und können zwischen den beiden Prozessen nicht auseinanderlaufen.
//
// **Global und nicht je Tafel** (Entscheidung des Product Owners vom
// 2026-09-23). Die dritte Ausbaustufe übersteuert die Werte im
// Einstellungs-Block je Tafel; diese Liste bleibt dann die Vorgabe darunter.
//
// **Seit der Stufe 3** (4T-001955, Epic 3E-000319) trägt die Liste alle fünf
// globalen Vorgaben der Tafel, nicht nur die beiden Menü-Häkchen: dazu
// «Archiv mit Zeitstempel», «Archiv-Obergrenze» und «Datum verweist auf
// Tagesnotiz». Die drei neuen haben kein Kommando — sie stehen allein im
// Abschnitt «Kanban-Tafel» der Einstellungs-Seite —, und die Obergrenze ist als
// einzige eine Zahl. Zielordner, Vorlage und Feldwahl gibt es bewusst **nur**
// je Tafel und deshalb nicht hier. Welche Vorgabe unter welcher Einstellung je
// Tafel liegt, sagt das Feld `tafel` (Name aus `TAFEL_EINSTELLUNGEN` in
// `src/shared/kanban/kanban-einstellungen.js`); die Auflösung selbst steht in
// `src/shared/kanban/kanban-wirksam.js`.
//
// **Ablage** über den bestehenden Einstellungs-Weg (`settings:get`/`settings:set`
// in die Einstellungs-Datei der Anwendung). Durchlauf durch die Ablage-Regel
// im Lösungs-Kapitel des Tasks: Die Angabe beschreibt den Blick und nicht die
// Tafel, soll die Sitzung aber überleben (Frage F2) — sie gehört damit nie in
// die Datei des Anwenders.
//
// Prozessneutral (CJS, reine Daten, kein Electron, kein DOM), Muster
// `panel-access.js`.
'use strict';

// Felder je Vorgabe:
//   kommando    Kommando der Registry (commands.js): Menü-Häkchen, Palette,
//               belegbares Kürzel, Erweiterungs-Filter. Nur bei den beiden
//               Anzeige-Schaltern; die übrigen Vorgaben haben keines.
//   schluessel  Schlüssel im Einstellungs-Speicher; zugleich der Name, unter
//               dem der Menü-Zustand den Wert führt.
//   vorgabe     Wert, solange der Anwender nichts gesetzt hat.
//   art         'schalter' (Wahrheitswert) oder 'zahl' (ganze Zahl).
//   tafel       Name der Einstellung je Tafel, die diese Vorgabe übersteuert.
const KANBAN_VORGABEN = Object.freeze([
  // «Tags am Kartenfuß»: aus, weil das Vorbild-Werkzeug seinen gleichnamigen
  // Schalter ebenfalls aus vorgibt — eine Tafel sieht beim ersten Öffnen so
  // aus, wie ihr Text geschrieben ist.
  Object.freeze({
    kommando: 'kanban.toggleTagsFooter',
    schluessel: 'kanban.tagsAmFuss',
    vorgabe: false,
    art: 'schalter',
    tafel: 'tagsAmFuss',
  }),
  // 4T-001903: «Termine relativ anzeigen»: aus, weil die Karte ihren Termin
  // dann so zeigt, wie er im Dokument steht; die relative Form ist eine
  // zusätzliche Lesart, die der Anwender wählt.
  Object.freeze({
    kommando: 'kanban.toggleRelativeDates',
    schluessel: 'kanban.terminRelativ',
    vorgabe: false,
    art: 'schalter',
    tafel: 'termineRelativ',
  }),
  // 4T-001955: «Archiv mit Zeitstempel»: an, weil das Archivieren der Stufe 2
  // den Zeitstempel fest schrieb — eine Tafel ohne eigene Einstellung
  // archiviert damit genau wie vorher.
  Object.freeze({
    schluessel: 'kanban.archivZeitstempel',
    vorgabe: true,
    art: 'schalter',
    tafel: 'archivMitZeitstempel',
  }),
  // 4T-001955: «Archiv-Obergrenze»: 100 Karten, der feste Wert der Stufe 2
  // (Entscheidung des Product Owners vom 2026-09-23). Ein Wert von 0 oder
  // darunter heißt «unbegrenzt», wie beim Vorbild, das mit der Obergrenze
  // `-1` nichts und mit `0` ebenso nichts abschneidet (`archive.slice(-n)`).
  Object.freeze({
    schluessel: 'kanban.archivObergrenze',
    vorgabe: 100,
    art: 'zahl',
    tafel: 'archivObergrenze',
  }),
  // 4T-001955: «Datum verweist auf Tagesnotiz»: aus (Entscheidung C3 des
  // Product Owners vom 2026-09-25).
  Object.freeze({
    schluessel: 'kanban.datumTagesnotiz',
    vorgabe: false,
    art: 'schalter',
    tafel: 'datumZurTagesnotiz',
  }),
]);

// Die beiden Vorgaben mit Menü-Häkchen und Kommando. Der Name bleibt, weil
// Menü, Palette und Umschalten allein diese beiden kennen.
const KANBAN_ANZEIGE_SCHALTER = Object.freeze(KANBAN_VORGABEN.filter((v) => v.kommando));

/** Die Vorgabe zu einem Kommando oder zu einem Einstellungs-Schlüssel, sonst null. */
function kanbanAnzeigeSchalter(kennung) {
  return KANBAN_VORGABEN.find((s) => s.kommando === kennung || s.schluessel === kennung) || null;
}

/**
 * Deutet einen gelesenen Wert nach der Art der Vorgabe; ein fehlender oder
 * fremder Wert fällt auf die Vorgabe.
 *
 * Nur ausdrückliches `true` bzw. `false` zählt. Ein Text wie `"false"` aus
 * einer von Hand bearbeiteten Einstellungs-Datei wäre sonst wahr; ebenso zählt
 * bei der Zahl nur eine ganze Zahl.
 */
function kanbanVorgabeWert(vorgabe, wert) {
  if (vorgabe.art === 'zahl') return Number.isSafeInteger(wert) ? wert : vorgabe.vorgabe;
  return typeof wert === 'boolean' ? wert : vorgabe.vorgabe;
}

/**
 * Bringt einen gelesenen Wert-Satz in die feste Form: je Vorgabe ein Wert der
 * richtigen Art, ein fehlender oder fremder Wert fällt auf die Vorgabe.
 *
 * @param {object|null} roh { schluessel: wert }
 * @returns {Object<string, boolean|number>}
 */
function normalisiereKanbanAnzeige(roh) {
  const quelle = roh && typeof roh === 'object' ? roh : {};
  const out = {};
  for (const s of KANBAN_VORGABEN) out[s.schluessel] = kanbanVorgabeWert(s, quelle[s.schluessel]);
  return out;
}

/**
 * Liest alle Vorgaben aus einem Speicher mit Punkt-Pfaden (electron-store).
 *
 * @param {(schluessel: string) => *} lies
 * @returns {Object<string, boolean|number>}
 */
function kanbanAnzeigeAusSpeicher(lies) {
  const roh = {};
  for (const s of KANBAN_VORGABEN) {
    roh[s.schluessel] = typeof lies === 'function' ? lies(s.schluessel) : undefined;
  }
  return normalisiereKanbanAnzeige(roh);
}

module.exports = {
  KANBAN_VORGABEN,
  KANBAN_ANZEIGE_SCHALTER,
  kanbanAnzeigeSchalter,
  kanbanVorgabeWert,
  normalisiereKanbanAnzeige,
  kanbanAnzeigeAusSpeicher,
};
