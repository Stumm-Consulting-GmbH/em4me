// 4T-0760 (Epic 3E-0142): Suchlauf über Handbuch und Einstellungen.
//
// Bindeglied zwischen der Suchleiste (search.js), dem Suchraum-Kern
// (shared/such-raum.js), den Lieferanten (such-handbuch.js, ab 4T-0761
// such-einstellungen.js) und der Trefferliste (such-panel.js).
//
// Grundregel des Epics, Entscheidung des Product Owners vom 2026-07-27:
// Der Suchraum folgt dem aktiven Reiter, und zwar exklusiv. Ein Handbuch-
// Reiter sucht im ganzen Handbuch, die Einstellungs-Seite in allen
// Bereichen, ein Dokument wie bisher in sich selbst. Es gibt keinen
// gemischten Trefferraum und keine Bedienung, mit der der Anwender den
// Raum von Hand wählt.
'use strict';

import { sucheInTexten } from '../../shared/such-raum.js';
import { handbuchEintraege } from './such-handbuch.js';
import { zeigeTreffer, leereTreffer, setzeAuswahl, zeigeSuchPanel } from './such-panel.js';
import { state } from './app-state.js';

// Lieferanten je Raum. Ein Lieferant gibt entweder die Eintrags-Liste des
// Kerns zurück (Gruppe, Titel, Volltext) — dann sucht dieses Modul darin —
// oder ein fertiges Ergebnis `{ treffer, gruppen, abgeschnitten }`.
//
// Die zweite Form ist mit 4T-0616 (Epic 3E-0116) dazugekommen: Ein Bereich
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
export async function sucheImRaum(raum, regex, { behalteIndex = false } = {}) {
  const lieferant = LIEFERANTEN.get(raum);
  const vorherigerIndex = behalteIndex && bestand.raum === raum ? bestand.index : -1;
  const meine = ++generation;
  if (!lieferant) {
    bestand = { treffer: [], gruppen: [], abgeschnitten: false, raum, index: -1 };
    zeigeTreffer({ treffer: [], gruppen: [], abgeschnitten: false, raum });
    return true;
  }

  let geliefert;
  try {
    geliefert = await lieferant(regex);
  } catch {
    geliefert = [];
  }
  if (meine !== generation) return false;

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
  zeigeTreffer({ ...ergebnis, raum });
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

// Nächster bzw. vorheriger Treffer über Gruppen-Grenzen hinweg, zyklisch
// wie die Dokument-Suche. Genau hier lebt der Grenz-Durchlauf: Die Treffer
// liegen bereits in einer flachen Liste über alle Seiten bzw. Bereiche, ein
// Sonderfall an der Grenze entfällt deshalb.
export function naechsterRaumTreffer() {
  if (bestand.treffer.length === 0) return null;
  return setzeRaumIndex((bestand.index + 1) % bestand.treffer.length);
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
