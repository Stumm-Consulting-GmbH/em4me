// 4T-001761 (Epic 3E-000253): Der eine Schalter, mit dem der Datensatz-Bestand
// des Index ruht.
//
// **Warum das Index-Subsystem den Einstellungs-Speicher nicht liest.** Kein
// Modul unter `src/main/index/` kennt den Store; die Module sind reine
// Auskunfts-Schichten über einen Datei-Bestand, und ihre Aufrufer reichen
// ihnen hinein, was sie an Umgebung brauchen (so bekommt die Abfrage ihre
// Aufgaben-Umgebung, so bekommt der Cache seinen Schreiber). Diese Linie bleibt
// unangetastet: Der Zustand wird hier von außen **eingeschleust** statt drinnen
// gelesen. Ohne sie hinge der Index an einer Einstellungs-Datei, und jede
// Prüfung müsste einen Speicher stellen, um eine Datei zu indizieren.
//
// **Gesetzt wird er an zwei Stellen.** Beim Start einmal, wenn die Kanäle der
// Index-Sichten registriert werden (`src/main/ipc/index-views.js`, dort steht
// der Speicher fest und noch ist kein Index aufgebaut), und danach bei jedem
// Umlegen des Erweiterungs-Schalters in der Verteilung der Einstellungs-
// Änderung (`src/main/ipc/settings-verteilung.js`), die den Neuaufbau
// anschließt.
//
// **Der Standard ist «an».** Ab Werk ist die Erweiterung eingeschaltet, und ein
// Aufrufer, der den Schalter nie setzt — jede Prüfung des Bestands —, sieht das
// Verhalten von vor diesem Vorgang.
//
// Eigener Zustand: genau ein Wahrheitswert.
'use strict';

let datensaetzeErfassen = true;

/**
 * Werden Datensätze beim Index-Aufbau erfasst und aufgelöst?
 *
 * @returns {boolean} true, solange die Erweiterung «Datenbank» eingeschaltet ist.
 */
function datensatzErfassungAktiv() {
  return datensaetzeErfassen;
}

/**
 * Setzt den Schalter und sagt, ob sich dabei etwas geändert hat.
 *
 * Die Rückgabe trägt die Entscheidung des Aufrufers, ob ein Neuaufbau des
 * Index nötig ist: Ein Umschalten, das nichts ändert, darf den Bestand nicht
 * verwerfen.
 *
 * @param {boolean} aktiv Neuer Stand.
 * @returns {boolean} true, wenn der Stand vorher ein anderer war.
 */
function setzeDatensatzErfassung(aktiv) {
  const neu = aktiv !== false;
  if (neu === datensaetzeErfassen) return false;
  datensaetzeErfassen = neu;
  return true;
}

module.exports = { datensatzErfassungAktiv, setzeDatensatzErfassung };
