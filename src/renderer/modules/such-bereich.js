// 4T-0616 (Epic 3E-0116): Der Bereich als dritter Lieferant der Raum-Suche.
//
// Anders als Handbuch und Einstellungen liefert dieser Lieferant keine Texte,
// sondern fertige Treffer: Die Dateien eines Bereichs liegen auf Platte, ihre
// Zahl ist unbegrenzt, und Dateizugriff gehört in den Hauptprozess. Gesucht
// wird deshalb dort (src/main/area-search.js), dieses Modul reicht den
// Suchauftrag hinüber und den Sprung zurück.
//
// Die offene Datei bekommt eine Sonderbehandlung: Ihr Editor-Stand wandert
// mit dem Auftrag hinüber, damit ungespeicherte Änderungen gefunden werden
// und der Sprung nicht an veralteten Stellen landet. Der Hauptprozess setzt
// sie als erste Gruppe und spart ihren Platten-Stand aus.
'use strict';

import { activeTab, getPaneEls, state } from './app-state.js';
import { api } from './api.js';
import { normalizeForCompare } from './area.js';
import { openInPane } from './tabs.js';
import {
  buildRegex,
  clearSearchHighlights,
  highlightInContainer,
  search,
  setCurrentMatch,
  performSourceSearch,
} from './search.js';
import {
  aktuellerRaumTreffer,
  indexInGruppe,
  raumIndex,
  registriereLieferant,
} from './such-lauf.js';
import { registriereMarkierWeg, registriereSprungWeg } from './such-sprung.js';

// Lauf-Kennung für den Hauptprozess. Sie erlaubt ihm, einen laufenden
// Vorrat-Aufbau abzubrechen, sobald eine jüngere Anfrage eintrifft; die
// Anzeige-Entscheidung trifft weiterhin such-lauf.js über seine eigene
// Generation.
let generation = 0;

// Die Datei, die die Trefferliste anführt: die, in der die Suche geöffnet
// wurde. Sie steht für die Dauer einer Such-Sitzung fest.
//
// Der naheliegende Weg wäre, immer die gerade offene Datei voranzustellen.
// Genau das war der Fehler des ersten Entwurfs: Nach einem Sprung wurde die
// Zieldatei zur offenen, wanderte an die Spitze, und ihr erster Treffer stand
// damit wieder auf Position 1. Der Zähler lief deshalb nie über die Datei
// hinaus — er zeigte „1 von 4" in drei verschiedenen Dateien —, und die Liste
// sortierte sich bei jedem Sprung neu.
let ankerPfad = null;

// Beim Schließen der Suchleiste endet die Such-Sitzung; die nächste bestimmt
// ihren Anker neu. Über ein Dokument-Ereignis statt eines Imports, weil
// search.js aus diesem Modul nicht importieren kann (Modul-Zyklus).
export function verwirfBereichsAnker() {
  ankerPfad = null;
}

document.addEventListener('scg:search-closed', verwirfBereichsAnker);

// Der aktive Reiter, sofern er ein Dokument mit Datei-Pfad ist. Handbuch-
// und System-Seiten haben keinen Pfad im Bereich und liefern nichts.
function aktivesDokument() {
  const tab = activeTab();
  if (!tab || !tab.path || tab.manualPage || tab.systemPage) return null;
  return tab;
}

// Lieferant: gibt ein fertiges Ergebnis zurück (die zweite zulässige Form,
// siehe such-lauf.js).
export async function bereichsTreffer(regex) {
  const leer = { treffer: [], gruppen: [], abgeschnitten: false };
  if (!state.areaPath || !regex) return leer;

  const tab = aktivesDokument();
  const aktiv =
    tab && typeof tab.content === 'string' ? { pfad: tab.path, text: tab.content } : null;
  // Erster Lauf der Such-Sitzung: Die offene Datei wird zum Anker und bleibt
  // es, auch wenn der Anwender danach in eine andere Datei springt.
  if (!ankerPfad && tab) ankerPfad = tab.path;

  try {
    const antwort = await api.searchArea({
      muster: regex.source,
      flags: regex.flags,
      aktiv,
      anker: ankerPfad,
      generation: ++generation,
    });
    if (!antwort) return leer;
    return {
      treffer: Array.isArray(antwort.treffer) ? antwort.treffer : [],
      gruppen: Array.isArray(antwort.gruppen) ? antwort.gruppen : [],
      abgeschnitten: !!antwort.abgeschnitten,
      vorratModus: antwort.vorratModus || null,
    };
  } catch {
    return leer;
  }
}

// --- Markierung und Sprung --------------------------------------------------

// Zeigt der Reiter den Editor? Dieselbe Unterscheidung wie in
// determineSearchScope; im Bearbeiten-Modus markiert der Decorations-Weg, in
// der Lese-Ansicht der DOM-Weg.
function zeigtEditor(tab) {
  return (
    !!tab && (tab.viewMode === 'source' || tab.viewMode === 'split' || tab.viewMode === 'live')
  );
}

// Markiert die Treffer der offenen Datei und hebt den gesuchten hervor.
//
// Der Kern der Entscheidung des Product Owners vom 2026-07-29: Der
// Bereichs-Raum ERSETZT die gewohnte Markierung im Dokument nicht, er ergänzt
// sie um die Liste. Ohne diesen Schritt verschwänden beim Tippen die Treffer
// aus dem Text, und die Suche fühlte sich im Editor grundlegend anders an als
// bisher.
function markiereOffeneDatei() {
  const tab = aktivesDokument();
  if (!tab) return;
  let regex;
  try {
    regex = buildRegex(search.query, search.useRegex, search.caseSensitive);
  } catch {
    return;
  }

  // Gehört der aktive Treffer zu DIESER Datei, wird er hervorgehoben; sonst
  // werden nur die Fundstellen markiert.
  const treffer = raumTrefferDerDatei(tab);
  const nummer = treffer ? indexInGruppe(raumIndex()) : -1;

  if (zeigtEditor(tab)) {
    // performSourceSearch füllt search.matches aus dem Editor-Dokument und
    // setzt die Decorations; danach genügt das Umsetzen des aktiven Treffers.
    performSourceSearch(regex, -1);
    if (nummer >= 0 && nummer < search.matches.length) setCurrentMatch(nummer);
    return;
  }

  const els = getPaneEls(state.activePaneIndex);
  if (!els || !els.renderedHtml) return;
  const marks = highlightInContainer(els.renderedHtml, regex);
  search.matches = marks;
  search.currentIndex = -1;
  if (nummer < 0) return;
  const ziel = marks[nummer];
  if (!ziel) return;
  search.currentIndex = nummer;
  ziel.classList.add('mdv-match-current');
}

// Der aktuelle Raum-Treffer, sofern er in der offenen Datei liegt. Die
// Gruppen-Kennung ist wurzel-relativ, die Sprung-Kennung absolut; verglichen
// wird über die absolute, weil sie im Reiter unmittelbar vorliegt.
//
// Normalisiert verglichen: Der eine Pfad kommt über die Prozess-Grenze aus
// dem Verzeichnis-Scan, der andere aus dem geöffneten Reiter. Trenner und
// Schreibweise können sich unterscheiden, und ein Zeichen-genauer Vergleich
// scheiterte dann still — die Fundstelle bliebe unmarkiert, ohne Fehler.
function raumTrefferDerDatei(tab) {
  const aktuell = aktuellerRaumTreffer();
  if (!aktuell || !aktuell.sprung || !aktuell.sprung.kennung) return null;
  return normalizeForCompare(aktuell.sprung.kennung) === normalizeForCompare(tab.path)
    ? aktuell
    : null;
}

// Sprung zu einem Treffer: Zieldatei öffnen (ein bereits offener Reiter wird
// aktiviert), auf ihren Inhalt warten, dann markieren.
async function springeZuBereichsDatei(treffer) {
  const pfad = treffer && treffer.sprung ? treffer.sprung.kennung : null;
  if (!pfad) return;

  // Alte Markierungen der zuvor gezeigten Datei entfernen, sonst stehen zwei
  // Sätze im DOM und der Zähler der Pane wäre zu hoch (Muster Handbuch-Sprung).
  clearSearchHighlights();
  await openInPane(state.activePaneIndex, [pfad]);
  await warteAufInhalt(pfad);
  markiereOffeneDatei();
  scrolleZumAktiven();
}

// Wartet, bis der Reiter der Zieldatei aktiv ist und Inhalt trägt. Das Öffnen
// stößt das Rendern an, ohne es abzuwarten.
async function warteAufInhalt(pfad, versuche = 60) {
  for (let i = 0; i < versuche; i++) {
    const tab = activeTab();
    if (tab && tab.path === pfad && typeof tab.content === 'string' && tab.content !== '') return;
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
}

function scrolleZumAktiven() {
  const tab = aktivesDokument();
  if (!tab || zeigtEditor(tab)) return; // Editor scrollt über setCurrentMatch
  const aktiv = search.matches[search.currentIndex];
  if (aktiv && typeof aktiv.scrollIntoView === 'function') {
    aktiv.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }
}

registriereLieferant('area', bereichsTreffer);
registriereSprungWeg('area', springeZuBereichsDatei);
registriereMarkierWeg('area', markiereOffeneDatei);
