// 4T-000760 (Epic 3E-000142): Suchlauf über Handbuch und Einstellungen.
//
// Bindeglied zwischen der Suchleiste (search.js), dem Suchraum-Kern
// (shared/search-scope.js), den Lieferanten (search-manual.js, ab 4T-000761
// settings/settings-search.js) und der Trefferliste (search-panel.js).
//
// Grundregel des Epics, Entscheidung des Product Owners vom 2026-07-27:
// Der Suchraum folgt dem aktiven Reiter, und zwar exklusiv. Ein Handbuch-
// Reiter sucht im ganzen Handbuch, die Einstellungs-Seite in allen
// Bereichen, ein Dokument wie bisher in sich selbst. Es gibt keinen
// gemischten Trefferraum und keine Bedienung, mit der der Anwender den
// Raum von Hand wählt.
'use strict';

import { sucheInTexten } from '../../../shared/search-scope.js';
import { handbuchEintraege } from './search-manual.js';
import { zeigeTreffer, leereTreffer, setzeAuswahl, zeigeSuchPanel } from './search-panel.js';
import { state } from '../app/app-state.js';

// Lieferanten je Raum. Ein Lieferant gibt entweder die Eintrags-Liste des
// Kerns zurück (Gruppe, Titel, Volltext) — dann sucht dieses Modul darin —
// oder ein fertiges Ergebnis `{ treffer, gruppen, abgeschnitten }`.
//
// Die zweite Form ist mit 4T-000616 (Epic 3E-000116) dazugekommen: Ein Bereich
// kann seine Volltexte nicht in den Renderer reichen, weil ihre Zahl
// unbegrenzt ist und der Dateizugriff in den Hauptprozess gehört. Er sucht
// deshalb dort und liefert Treffer. Damit ein solcher Lieferant überhaupt
// suchen KANN, bekommt jeder Lieferant den regulären Ausdruck herein; die
// beiden älteren ignorieren ihn.
const LIEFERANTEN = new Map([['manual', handbuchEintraege]]);

export function registriereLieferant(raum, fn) {
  if (typeof raum === 'string' && raum !== '' && typeof fn === 'function') {
    LIEFERANTEN.set(raum, fn);
  }
}

// Laufender Bestand des zuletzt ausgeführten Raum-Suchlaufs. Die Suchleiste
// liest daraus ihren Zähler, die Sprung-Logik ihre Ziele.
let bestand = { treffer: [], gruppen: [], abgeschnitten: false, raum: null, index: -1 };

// Generation gegen Lade-Races: Ein Lieferant arbeitet asynchron (IPC), und
// bis er antwortet, kann der Anwender weitergetippt oder den Reiter
// gewechselt haben. Nur die jüngste Anfrage darf ihr Ergebnis anzeigen.
let generation = 0;

export function raumBestand() {
  return bestand;
}

export function raumTrefferAnzahl() {
  return bestand.treffer.length;
}

export function raumIndex() {
  return bestand.index;
}

export function aktuellerRaumTreffer() {
  return bestand.treffer[bestand.index] || null;
}

export function leereRaumBestand(raum = null) {
  generation++;
  // 4T-002129: Mit dem Bestand verfallen die vorgemerkten Sprünge.
  vormerkung = null;
  bestand = { treffer: [], gruppen: [], abgeschnitten: false, raum, index: -1 };
  leereTreffer(raum);
}

// Führt den Suchlauf für einen Raum aus und übergibt das Ergebnis an die
// Trefferliste. Liefert true, wenn das Ergebnis angezeigt wurde, und false,
// wenn eine jüngere Anfrage es überholt hat.
// behalteIndex: true beim Refresh nach einem Reiter-Wechsel. Ohne diese
// Unterscheidung fiele der Trefferzeiger bei jedem Sprung auf null zurück:
// Ein Sprung aktiviert den Ziel-Reiter, das löst refreshSearchIfVisible aus,
// und ein zurückgesetzter Zeiger schickte den nächsten F3-Druck wieder zum
// ersten Treffer — die Seitengrenze wäre nie zu überschreiten.
// 4T-002216: Behalten wird der Zeiger beim EINTREFFEN des Ergebnisses, nicht
// der beim Start des Laufs. Ein Sprung während des Laufs (etwa die vorgemerkten
// Sprünge eines neuen Begriffs, während das Öffnen der Trefferliste die Suche
// nachzieht) bewegt ihn, und das spätere Ergebnis setzte ihn sonst zurück.
export async function sucheImRaum(raum, regex, { behalteIndex = false } = {}) {
  const lieferant = LIEFERANTEN.get(raum);
  const meine = ++generation;
  // 4T-001525 (Epic 3E-000169): Die Anfrage reist zur Trefferliste mit. Sie
  // entscheidet dort, ob eine bestehende Auswahl weiterhin gilt — dasselbe
  // Muster im selben Raum meint dieselben Fundstellen, ein anderes nicht.
  const anfrage = { muster: regex ? regex.source : '', flags: regex ? regex.flags : '' };
  if (!lieferant) {
    bestand = { treffer: [], gruppen: [], abgeschnitten: false, raum, index: -1 };
    zeigeTreffer({ treffer: [], gruppen: [], abgeschnitten: false, raum, ...anfrage });
    return true;
  }

  let geliefert;
  try {
    geliefert = await lieferant(regex);
  } catch {
    geliefert = [];
  }
  if (meine !== generation) return false;
  const vorherigerIndex = behalteIndex && bestand.raum === raum ? bestand.index : -1;

  // Eintrags-Liste: hier suchen. Fertiges Ergebnis: übernehmen, aber die
  // erwarteten Felder absichern — ein Lieferant, der über eine Prozess-Grenze
  // antwortet, ist keine vertrauenswürdige Struktur-Quelle.
  const ergebnis = Array.isArray(geliefert)
    ? sucheInTexten(geliefert, regex)
    : {
        treffer: Array.isArray(geliefert && geliefert.treffer) ? geliefert.treffer : [],
        gruppen: Array.isArray(geliefert && geliefert.gruppen) ? geliefert.gruppen : [],
        abgeschnitten: !!(geliefert && geliefert.abgeschnitten),
        // Nur der Bereichs-Lieferant setzt ihn: 'direkt' meldet, dass der
        // Bereich über dem Vorrats-Deckel liegt und je Lauf gelesen wird.
        vorratModus: (geliefert && geliefert.vorratModus) || null,
      };
  const index =
    vorherigerIndex >= 0 && vorherigerIndex < ergebnis.treffer.length
      ? vorherigerIndex
      : ergebnis.treffer.length > 0
        ? 0
        : -1;
  bestand = {
    treffer: ergebnis.treffer,
    gruppen: ergebnis.gruppen,
    abgeschnitten: ergebnis.abgeschnitten,
    raum,
    index,
  };
  zeigeTreffer({ ...ergebnis, raum, ...anfrage });
  if (index > 0) setzeAuswahl(index);
  // Ein Treffer, den niemand sieht, ist keiner: Bei Fundstellen öffnet sich
  // das Panel, falls es zu ist.
  if (ergebnis.treffer.length > 0) await zeigeSuchPanel(state.activePaneIndex);
  return true;
}

// Setzt den aktiven Treffer und hält die Trefferliste synchron. Der Sprung
// selbst hängt am Sprung-Handler des Panels (verdrahtet in app-init).
export function setzeRaumIndex(index) {
  if (index < 0 || index >= bestand.treffer.length) return null;
  bestand.index = index;
  setzeAuswahl(index);
  return bestand.treffer[index];
}

// 4T-002107: Ziel eines Vorwärts-Sprungs, gemeinsam für Dokument- und
// Raum-Suche (search.js nutzt es für die Dokument-Suche mit).
//
// Eine Neu-Ermittlung der Treffer markiert den aktuellen Treffer, zeigt ihn
// aber nicht (B-10, 4T-000904: sie bewegt weder Schreibmarke noch Bildlauf).
// Der erste Vorwärts-Sprung danach führt deshalb zu GENAU diesem Treffer und
// zeigt ihn; vorher übersprang er ihn, und der als «1 / n» gemeldete Treffer
// war nie zu sehen (Entscheidung des Product Owners vom 2026-10-03). Ist der
// aktuelle Treffer schon angesprungen, geht es wie bisher zum nächsten, im
// Kreis. Liefert -1 ohne Treffer.
export function vorwaertsZiel(aktuell, anzahl, angesprungen) {
  if (!(anzahl > 0)) return -1;
  if (!angesprungen && aktuell >= 0 && aktuell < anzahl) return aktuell;
  return (aktuell + 1) % anzahl;
}

// 4T-002129: Hält die Eingabe-Drossel der Suchleiste an (`debounceTimer` am
// übergebenen Such-Zustand) und meldet, ob noch ein Suchlauf ausstand. Ein
// Sprung ruft sie zuerst und holt einen ausstehenden Lauf sofort nach: Lief
// die Drossel erst nach dem Sprung ab, bestimmte sie die Treffer neu und warf
// den eben angesprungenen Treffer auf den ersten zurück (gemessen: Eingabe,
// zweimal die Eingabetaste binnen 150 ms, «2 / 3» fiel auf «1 / 3»).
export function stoppeEingabeDrossel(zustand) {
  if (!zustand.debounceTimer) return false;
  clearTimeout(zustand.debounceTimer);
  zustand.debounceTimer = null;
  return true;
}

// 4T-002129: Sprünge, die kommen, solange der Lauf eines NEUEN Begriffs in
// einem Raum aussteht oder läuft. Der Lauf ist asynchron (Handbuch-Seiten und
// Bereich per IPC, auch die Einstellungen liefern über ein Versprechen); ein
// Sprung davor bediente den alten Bestand, und das eintreffende Ergebnis setzte
// ihn zurück (gemessen am gebauten Programm: «Bereichs-Panel» getippt, binnen
// 0,3 Sekunden zweimal Enter, «1 / 27» statt «2 / 27»). Jetzt wird er hier
// vorgemerkt (1 vorwärts, -1 rückwärts) und in seiner Reihenfolge auf dem
// Ergebnis DIESES Laufs ausgeführt. Ein neuer Begriff beginnt eine neue
// Vormerkung, die Sprünge des älteren Laufs verfallen damit. Ein Nachzieh-Lauf
// (gleicher Begriff) merkt nichts vor; trifft er vor dem neuen ein, gilt sein
// Ergebnis als das des neuen, weil er denselben, aktuellen Begriff sucht.
let vormerkung = null;

/**
 * Sprung-Vorlauf für nextMatch/prevMatch: holt eine noch gedrosselte Eingabe
 * sofort nach (stoppeEingabeDrossel) und merkt den Sprung vor, wenn danach der
 * Lauf eines neuen Begriffs in einem Raum aussteht.
 *
 * @returns {boolean} true, wenn der Sprung vorgemerkt ist und jetzt nichts tun darf.
 */
export function sprungVormerken(zustand, richtung, suchlauf) {
  if (stoppeEingabeDrossel(zustand)) suchlauf();
  if (!vormerkung || !LIEFERANTEN.has(zustand.scope)) return false;
  vormerkung.push(richtung);
  return true;
}

/**
 * Startet den Lauf eines Raums samt Vormerkung (performSearch, Raum-Zweig).
 *
 * @param {object} zustand Der Such-Zustand (`search`): Raum und «angesprungen».
 * @param {(ziel: object|null) => void} nachher Zähler und Markierung, dazu der
 *   Sprung zum Ziel der vorgemerkten Sprünge (null: keiner vorgemerkt), sobald
 *   das Ergebnis angezeigt ist.
 */
export function starteRaumLauf(zustand, regex, behalteIndex, neu, nachher) {
  if (neu) vormerkung = [];
  return sucheImRaum(zustand.scope, regex, { behalteIndex }).then((angezeigt) => {
    if (!angezeigt) return;
    const spruenge = vormerkung;
    vormerkung = null;
    // 4T-002107: Die neue Menge kommt erst jetzt an und ist noch nicht gezeigt.
    if (neu || spruenge) zustand.angesprungen = false;
    nachher(zielDerSpruenge(spruenge, zustand.angesprungen));
  });
}

// Mehrere vorgemerkte Sprünge werden zu EINEM: Der Zeiger wandert Schritt für
// Schritt nach denselben Regeln wie F3 und Umschalt+F3, gesprungen wird nur zum
// Ziel. Zwei Sprünge in derselben Aufgabe liefen sonst nebeneinander — jeder
// öffnet seine Seite bzw. Datei asynchron —, und der ältere überholte den
// jüngeren (gemessen im Bereich: «1 / 4» statt «2 / 4»).
function zielDerSpruenge(spruenge, angesprungen) {
  let ziel = null;
  let gezeigt = angesprungen;
  for (const richtung of spruenge || []) {
    ziel = richtung < 0 ? vorherigerRaumTreffer() : naechsterRaumTreffer({ angesprungen: gezeigt });
    gezeigt = true;
  }
  return ziel;
}

// Nächster bzw. vorheriger Treffer über Gruppen-Grenzen hinweg, zyklisch
// wie die Dokument-Suche. Genau hier lebt der Grenz-Durchlauf: Die Treffer
// liegen bereits in einer flachen Liste über alle Seiten bzw. Bereiche, ein
// Sonderfall an der Grenze entfällt deshalb.
// 4T-002107: `angesprungen` sagt, ob der aktuelle Treffer schon gezeigt
// wurde; ohne Angabe geht es wie bisher zum nächsten.
export function naechsterRaumTreffer({ angesprungen = true } = {}) {
  if (bestand.treffer.length === 0) return null;
  return setzeRaumIndex(vorwaertsZiel(bestand.index, bestand.treffer.length, angesprungen));
}

export function vorherigerRaumTreffer() {
  if (bestand.treffer.length === 0) return null;
  const n = (bestand.index - 1 + bestand.treffer.length) % bestand.treffer.length;
  return setzeRaumIndex(n);
}

// Laufende Nummer eines Treffers INNERHALB seiner Gruppe. Der Sprung braucht
// sie, um auf der geöffneten Seite die richtige Fundstelle anzusteuern: Dort
// wird erneut über den DOM hervorgehoben, und die Zählung beginnt je Seite
// wieder bei null.
export function indexInGruppe(globalerIndex) {
  if (globalerIndex < 0 || globalerIndex >= bestand.treffer.length) return -1;
  let start = 0;
  for (const gruppe of bestand.gruppen) {
    if (globalerIndex < start + gruppe.anzahl) return globalerIndex - start;
    start += gruppe.anzahl;
  }
  return -1;
}
