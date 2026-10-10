// 4T-000760 (Epic 3E-000142): Sprung zu einem Treffer der Raum-Suche.
//
// Ein Treffer der Handbuch- oder Einstellungs-Suche liegt in aller Regel
// NICHT auf dem gerade sichtbaren Inhalt: Die Seite ist nicht geöffnet, der
// Bereich nicht aktiviert. Der Sprung stellt deshalb erst den Zielzustand
// her und hebt danach die Fundstelle hervor.
//
// Die Hervorhebung läuft bewusst über denselben Weg wie die Dokument-Suche
// (highlightInContainer aus search.js): Im Handbuch soll ein gefundener
// Begriff genauso aussehen wie in einem Dokument, und eine zweite
// Markierungs-Mechanik wäre zusätzlicher Bestand ohne Gewinn.
'use strict';

import { activeTab, getPaneEls, state } from '../app/app-state.js';
import { openManualPage } from '../manual.js';
import { buildRegex, clearSearchHighlights, highlightInContainer, search } from './search.js';
import { aktuellerRaumTreffer, indexInGruppe, raumIndex } from './search-run.js';

// Wartet, bis der gerenderte Inhalt der ZIEL-Seite im DOM steht. Das Öffnen
// eines Handbuch-Reiters stößt das Rendern an, ohne es abzuwarten.
//
// Das Warte-Kriterium ist bewusst der gesuchte Begriff und nicht bloß
// „Container nicht leer": Beim Wechsel von einer Seite zur nächsten ist der
// Container nie leer, er trägt noch den Inhalt der VORHERIGEN Seite. Ein
// Test darauf wäre sofort erfüllt und die Hervorhebung liefe gegen den
// falschen Text (genau dieser Fehler trat beim ersten Entwurf auf).
async function warteAufSeitenInhalt(paneIdx, regex, versuche = 60) {
  for (let i = 0; i < versuche; i++) {
    const els = getPaneEls(paneIdx);
    if (els && els.renderedHtml) {
      regex.lastIndex = 0;
      if (regex.test(els.renderedHtml.textContent || '')) return els;
    }
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  return getPaneEls(paneIdx);
}

// Hebt die Fundstellen der aktuellen Seite hervor und scrollt die gesuchte
// heran. Welche das ist, sagt die laufende Nummer des Treffers innerhalb
// seiner Gruppe: Die Hervorhebung zählt je Seite wieder bei null.
//
function hebeHervorUndScrolle(els, nummerInGruppe, regex) {
  if (!els || !els.renderedHtml || !regex) return;
  const marks = highlightInContainer(els.renderedHtml, regex);
  search.matches = marks;
  const ziel = marks[nummerInGruppe] || marks[0];
  if (!ziel) return;
  search.currentIndex = marks.indexOf(ziel);
  ziel.classList.add('mdv-match-current');
  rolleZurFundstelleInDerLeseAnsicht(ziel);
}

// 4T-002099: Rollt die Lese-Ansicht der aktiven Spalte zu einer Fundstelle
// eines Raum-Sprungs und trägt die erreichte Lage zugleich als gemerkte
// Lese-Lage des aktiven Reiters ein. Gemeinsamer Weg für Handbuch- und
// Bereichs-Sprung (search-area.js).
//
// Warum das Eintragen nötig ist: Jeder Raum-Sprung aktiviert den Ziel-Reiter,
// und das Rendern der Ansicht (renderPaneContent in views/pane-render.js)
// stellt die gemerkte Lage erst im nächsten Bild-Takt wieder her — also NACH
// diesem Rollen. Das Merken über das Roll-Ereignis ist in genau diesem
// Fenster abgeschaltet; ohne den Eintrag setzte die Wiederherstellung die
// alte Lage zurück, und der Sprung markierte die Fundstelle, ohne sie zu
// zeigen. Gemessen auf jeder Handbuch-Seite (mitgeliefert und erzeugt, offen
// oder nicht) und beim Sprung in eine Bereichs-Datei in der Ansicht
// «Gerendert»; aufgefallen war es auf der langen Seite «Funktionen».
export function rolleZurFundstelleInDerLeseAnsicht(ziel) {
  if (!ziel || typeof ziel.scrollIntoView !== 'function') return;
  ziel.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  const els = getPaneEls(state.activePaneIndex);
  const tab = activeTab();
  if (tab && els && els.renderedEl && els.renderedEl.contains(ziel)) {
    tab.scrollRen = els.renderedEl.scrollTop;
  }
}

// Sprung-Weg je Herkunft. Das Handbuch trägt sich unten selbst ein, die
// Einstellungen tun das in 4T-000761. Registrierung statt fester Verzweigung,
// damit eine neue Quelle (später die bereichsweite Dokument-Suche) ohne
// Eingriff an dieser Stelle andocken kann.
const SPRUNG_WEGE = new Map();

export function registriereSprungWeg(quelle, fn) {
  if (typeof quelle === 'string' && quelle !== '' && typeof fn === 'function') {
    SPRUNG_WEGE.set(quelle, fn);
  }
}

export async function springeZuTreffer(treffer) {
  if (!treffer || !treffer.gruppe) return;
  // 4T-002107: Jeder Raum-Sprung — F3, Eingabetaste, Weiter-Knopf, Klick oder
  // Eingabetaste in der Trefferliste — zeigt den aktuellen Treffer; der
  // nächste Vorwärts-Sprung geht danach weiter statt zu ihm.
  search.angesprungen = true;
  const weg = SPRUNG_WEGE.get(treffer.quelle);
  if (weg) await weg(treffer);
}

async function springeZuHandbuchSeite(treffer) {
  let regex;
  try {
    regex = buildRegex(search.query, search.useRegex, search.caseSensitive);
  } catch {
    return;
  }
  // Alte Markierungen der zuvor gezeigten Seite entfernen, sonst stehen
  // zwei Sätze <mark> im DOM und der Zähler der Pane wäre zu hoch.
  clearSearchHighlights();
  await openManualPage(treffer.gruppe);
  const els = await warteAufSeitenInhalt(state.activePaneIndex, regex);
  hebeHervorUndScrolle(els, indexInGruppe(raumIndex()), regex);
}

registriereSprungWeg('manual', springeZuHandbuchSeite);

// Markier-Weg je Raum. Wie bei den Sprung-Wegen trägt sich jede Quelle selbst
// ein; der Bereich tut das in search-area.js (4T-000616). Registrierung statt
// fester Verzweigung, weil die Bereichs-Markierung den Editor-Pfad braucht
// und dieses Modul sonst dessen Module kennen müsste.
const MARKIER_WEGE = new Map();

export function registriereMarkierWeg(raum, fn) {
  if (typeof raum === 'string' && raum !== '' && typeof fn === 'function') {
    MARKIER_WEGE.set(raum, fn);
  }
}

// Stellt die Inline-Hervorhebung der gerade offenen Handbuch-Seite her.
//
// Notwendig, weil jeder Suchlauf mit clearSearchHighlights beginnt und ein
// Sprung zwangsläufig einen Suchlauf nach sich zieht: Das Aktivieren des
// Ziel-Reiters löst refreshSearchIfVisible aus. Ohne diese Wiederherstellung
// verschwände die eben gesetzte Markierung unmittelbar wieder — der Sprung
// landete sichtbar im Nichts.
//
// 4T-000616: Für andere Räume übernimmt ein registrierter Markier-Weg. Die
// Aufgabe ist dieselbe, der Weg zum Text nicht: Eine Bereichs-Datei kann im
// Bearbeiten-Modus stehen, wo nicht der DOM markiert wird, sondern der Editor.
export function markiereOffeneRaumSeite() {
  const weg = MARKIER_WEGE.get(search.scope);
  if (weg) {
    weg();
    return;
  }
  const tab = activeTab();
  if (!tab || !tab.manualPage) return;
  let regex;
  try {
    regex = buildRegex(search.query, search.useRegex, search.caseSensitive);
  } catch {
    return;
  }
  const els = getPaneEls(state.activePaneIndex);
  if (!els || !els.renderedHtml) return;
  const marks = highlightInContainer(els.renderedHtml, regex);
  search.matches = marks;
  search.currentIndex = -1;

  // Der aktive Treffer bekommt seine Auszeichnung nur zurück, wenn er zu
  // DIESER Seite gehört; sonst steht er auf einer anderen Seite des Raums.
  const treffer = aktuellerRaumTreffer();
  if (!treffer || treffer.gruppe !== tab.manualPage) return;
  const ziel = marks[indexInGruppe(raumIndex())];
  if (!ziel) return;
  search.currentIndex = marks.indexOf(ziel);
  ziel.classList.add('mdv-match-current');
}
