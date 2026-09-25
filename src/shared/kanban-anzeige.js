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
// **Ablage** über den bestehenden Einstellungs-Weg (`settings:get`/`settings:set`
// in die Einstellungs-Datei der Anwendung). Durchlauf durch die Ablage-Regel
// im Lösungs-Kapitel des Tasks: Die Angabe beschreibt den Blick und nicht die
// Tafel, soll die Sitzung aber überleben (Frage F2) — sie gehört damit nie in
// die Datei des Anwenders.
//
// Prozessneutral (CJS, reine Daten, kein Electron, kein DOM), Muster
// `panel-access.js`.
'use strict';

// Felder je Schalter:
//   kommando    Kommando der Registry (commands.js): Menü-Häkchen, Palette,
//               belegbares Kürzel, Erweiterungs-Filter.
//   schluessel  Schlüssel im Einstellungs-Speicher; zugleich der Name, unter
//               dem der Menü-Zustand den Wert führt.
//   vorgabe     Wert, solange der Anwender nichts gesetzt hat.
const KANBAN_ANZEIGE_SCHALTER = Object.freeze([
  // «Tags am Kartenfuß»: aus, weil das Vorbild-Werkzeug seinen gleichnamigen
  // Schalter ebenfalls aus vorgibt — eine Tafel sieht beim ersten Öffnen so
  // aus, wie ihr Text geschrieben ist.
  Object.freeze({
    kommando: 'kanban.toggleTagsFooter',
    schluessel: 'kanban.tagsAmFuss',
    vorgabe: false,
  }),
  // 4T-001903: «Termine relativ anzeigen»: aus, weil die Karte ihren Termin
  // dann so zeigt, wie er im Dokument steht; die relative Form ist eine
  // zusätzliche Lesart, die der Anwender wählt.
  Object.freeze({
    kommando: 'kanban.toggleRelativeDates',
    schluessel: 'kanban.terminRelativ',
    vorgabe: false,
  }),
]);

/** Der Schalter zu einem Kommando oder zu einem Einstellungs-Schlüssel, sonst null. */
function kanbanAnzeigeSchalter(kennung) {
  return (
    KANBAN_ANZEIGE_SCHALTER.find((s) => s.kommando === kennung || s.schluessel === kennung) || null
  );
}

/**
 * Bringt einen gelesenen Wert-Satz in die feste Form: je Schalter ein
 * Wahrheitswert, ein fehlender oder fremder Wert fällt auf die Vorgabe.
 *
 * Nur ausdrückliches `true` bzw. `false` zählt. Ein Text wie `"false"` aus
 * einer von Hand bearbeiteten Einstellungs-Datei wäre sonst wahr.
 *
 * @param {object|null} roh { schluessel: wert }
 * @returns {Object<string, boolean>}
 */
function normalisiereKanbanAnzeige(roh) {
  const quelle = roh && typeof roh === 'object' ? roh : {};
  const out = {};
  for (const s of KANBAN_ANZEIGE_SCHALTER) {
    const wert = quelle[s.schluessel];
    out[s.schluessel] = typeof wert === 'boolean' ? wert : s.vorgabe;
  }
  return out;
}

/**
 * Liest alle Schalter aus einem Speicher mit Punkt-Pfaden (electron-store).
 *
 * @param {(schluessel: string) => *} lies
 * @returns {Object<string, boolean>}
 */
function kanbanAnzeigeAusSpeicher(lies) {
  const roh = {};
  for (const s of KANBAN_ANZEIGE_SCHALTER) {
    roh[s.schluessel] = typeof lies === 'function' ? lies(s.schluessel) : undefined;
  }
  return normalisiereKanbanAnzeige(roh);
}

module.exports = {
  KANBAN_ANZEIGE_SCHALTER,
  kanbanAnzeigeSchalter,
  normalisiereKanbanAnzeige,
  kanbanAnzeigeAusSpeicher,
};
