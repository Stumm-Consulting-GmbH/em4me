// 4T-001770 (Epic 3E-000290): Die Tasten der Karten-Liste und die Ziel-Wahl
// einer neuen Verbindung (Story 4S-000949).
//
// **Ausgezogen in 4T-001771 an der Naht, die 4T-001770 markiert hat.** Das
// Panel stand bei 401 von 500 Code-Zeilen, und das Filter-Feld dieses Tasks
// kommt in dieselbe Datei; der Schnitt liegt dort, wo ihn die Lösung des
// Vorgängers vorgezeichnet hat — die Tasten samt Ziel-Wahl als eigenes Modul,
// mit `zeichne`, `waehle` und `stand` als hereingereichten Griffen. Es ist ein
// reiner Ortswechsel: Am Verhalten ändert dieser Auszug nichts, und die
// Prüffälle aus `canvas-liste-tasten.js` laufen unverändert weiter.
//
// **Hereingereicht statt importiert**, damit kein Modul-Zyklus entsteht: Das
// Panel importiert dieses Modul und meldet seine Griffe einmalig an; dieses
// Modul kennt das Panel nicht. Die Fläche erreicht es dagegen unmittelbar über
// `canvas-pane.js`, wie zuvor.
//
// Die Tasten greifen nur, solange der Fokus **in der Liste** steht (AK11 des
// Vorgängers); geprüft wird das am Ereignis-Ziel, wie im Suchergebnis-Panel.
// Im Filter-Feld darüber, in der offenen Rohtext-Eingabe der Fläche und auf der
// Fläche selbst behalten Entf, Escape und die Eingabetaste ihre bisherige
// Bedeutung.
'use strict';

import { getPaneEls } from '../app/app-state.js';
import { registriereVerbindungsWahl } from '../canvas/canvas-kontextmenue.js';
import { handleCanvasElement, zeigeCanvasElement } from '../canvas/canvas-pane.js';
import { oeffnePanel } from '../sidebar-layout.js';
import { showStatusbarHint } from '../views/views.js';

// Die Zeilen der Liste: Element-Zeilen und Verbindungs-Zeilen gemeinsam, in der
// Reihenfolge, in der sie stehen. Die Pfeiltasten wandern über beide (F3).
export const ZEILEN_WAHL = '[data-canvas-id]';

// Die Rohtext-Eingaben der vier Element-Arten. Sie tragen je eine eigene
// Klasse, weil sie an verschiedenen Orten der Fläche liegen; für den Rückweg
// des Fokus sind sie dieselbe Sache.
const EINGABE_WAHL =
  '.canvas-karte-eingabe, .canvas-linie-eingabe, .canvas-form-eingabe, .canvas-gruppe-eingabe';

// 4T-001770: Läuft gerade die Ziel-Wahl einer neuen Verbindung? `{paneIdx, von}`.
// Der Zustand gehört zur Sitzung und nicht zum Dokument — dieselbe Begründung
// wie beim Klapp-Zustand des Panels.
let zielWahl = null;

// Die Griffe des Panels, einmalig angemeldet (siehe Kopf).
let griffe = null;

/**
 * Meldet die Griffe des Panels an; ohne sie ruhen die Tasten.
 *
 * @param {{stand: Function, waehle: Function, zeichne: Function,
 *   merkeFokus: Function, zeilen: Function, paneZu: Function}} neue
 */
export function initCanvasListenTasten(neue) {
  griffe = neue;
}

export function zielWahlFuer(paneIdx) {
  return zielWahl && zielWahl.paneIdx === paneIdx ? zielWahl : null;
}

/**
 * Beendet eine Ziel-Wahl, deren Ausgangs-Karte nicht mehr in der Liste steht —
 * das Dokument hat gewechselt, die Fläche eine andere, oder die Karte ist fort.
 * Eine Wahl ohne Ausgangspunkt hätte kein erstes Ende. Gerufen beim Zeichnen.
 *
 * @param {number} paneIdx
 * @param {{liste: Array<object>}} lage Stand der Fläche dieser Spalte.
 */
export function haltZielWahlAktuell(paneIdx, lage) {
  const wahl = zielWahlFuer(paneIdx);
  if (wahl && !lage.liste.some((e) => e.id === wahl.von && e.art === 'karte')) zielWahl = null;
}

function hinweis(schluessel) {
  showStatusbarHint(schluessel, { error: true, duration: 2500 });
  return false;
}

// --- Bewegung und Handlungen ---------------------------------------------------

// Die Zeilen, auf die die Pfeiltasten gerade wandern dürfen. Im Regelfall alle;
// während der Ziel-Wahl nur die Karten, und die Ausgangs-Karte nicht — eine
// Verbindung braucht zwei verschiedene Enden, und eine Zeile anzubieten, die
// nicht in Frage kommt, wäre ein Angebot ohne Gegenstand.
function kandidaten(paneIdx, liste) {
  const alle = griffe.zeilen(liste);
  const wahl = zielWahlFuer(paneIdx);
  if (!wahl) return alle;
  return alle.filter(
    (el) => el.classList.contains('canvas-liste-karte') && el.dataset.canvasId !== wahl.von,
  );
}

function bewege(paneIdx, ziel, schritt) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.canvasListList) return;
  const reihen = kandidaten(paneIdx, els.canvasListList);
  if (reihen.length === 0) return;
  const jetzt = reihen.indexOf(ziel.closest(ZEILEN_WAHL));
  let stelle;
  if (schritt === 'anfang') stelle = 0;
  else if (schritt === 'ende') stelle = reihen.length - 1;
  else stelle = Math.min(Math.max((jetzt < 0 ? 0 : jetzt) + schritt, 0), reihen.length - 1);
  const zeile = reihen[stelle];
  // Die Stelle zählt über **alle** Zeilen, nicht über die gefilterten: Sie ist
  // die Anschrift, unter der die Fokus-Rückgabe die Zeile nach dem Zeichnen
  // sucht.
  griffe.waehle(paneIdx, zeile.dataset.canvasId, griffe.zeilen(els.canvasListList).indexOf(zeile));
}

function istKontextmenueTaste(ev) {
  return ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey);
}

/**
 * Öffnet die Rohtext-Eingabe des Elements und holt den Fokus danach zurück.
 *
 * **Der Rückweg hängt an der Eingabe selbst.** Sie meldet ihr Ende niemandem,
 * und die beiden Tasten, mit denen sie endet, hält die Bedienung der Fläche an
 * (`stopPropagation`) — an einem fensterweiten Listener kämen sie nie an. Der
 * Griff steht deshalb am Feld: Sein Listener stirbt mit ihm, und der Aufschub
 * um einen Zyklus lässt der Übernahme den Vortritt, die den Fokus ihrerseits
 * auf die Fläche holt.
 */
function bearbeite(paneIdx, id) {
  if (!handleCanvasElement(paneIdx, id, { art: 'bearbeiten' })) return;
  const els = getPaneEls(paneIdx);
  const eingabe = els && els.canvasEl ? els.canvasEl.querySelector(EINGABE_WAHL) : null;
  if (!eingabe) return;
  eingabe.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' && !(ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) return;
    setTimeout(() => {
      griffe.merkeFokus(id, -1);
      griffe.zeichne(paneIdx);
    }, 0);
  });
}

function loesche(paneIdx, id, stelle) {
  handleCanvasElement(paneIdx, id, { art: 'loeschen' });
  // Die Zeile ist weg; der Fokus geht an ihre Stelle — dort steht jetzt die
  // nächste. Ohne die Rückgabe fiele er auf den Dokument-Rumpf, und die
  // Tastatur wäre nach dem ersten Löschen aus der Liste heraus.
  griffe.merkeFokus(null, stelle);
  griffe.zeichne(paneIdx);
}

function oeffneMenue(paneIdx, id, zeile) {
  const rect =
    zeile && typeof zeile.getBoundingClientRect === 'function'
      ? zeile.getBoundingClientRect()
      : null;
  // An der Stelle des Eintrags und nicht in der Ecke des Fensters: Das Menü
  // soll dort aufgehen, wo der Anwender gerade steht.
  handleCanvasElement(paneIdx, id, {
    art: 'menue',
    x: rect ? rect.left : 0,
    y: rect ? rect.bottom : 0,
  });
}

// --- Die Tastatur-Weiche -------------------------------------------------------

function onKeydown(ev) {
  const ziel = ev.target;
  if (!griffe || !ziel || typeof ziel.closest !== 'function') return;
  if (!ziel.closest('.sidebar-canvaslist')) return;
  // 4T-001771: Das Filter-Feld über der Liste führt seine Tasten selbst; hier
  // enden sie, bevor Eingabe, Entfernen oder Escape etwas am gewählten Element
  // täten (AK11 des Vorgängers, jetzt mit einem zweiten Ort im Panel).
  if (ziel.closest('.canvas-liste-filter')) return;
  const paneIdx = griffe.paneZu(ziel, 'canvasListSection');
  if (paneIdx < 0) return;
  if (zielWahlFuer(paneIdx)) {
    zielWahlTaste(ev, paneIdx, ziel);
    return;
  }
  const zeile = ziel.closest(ZEILEN_WAHL);
  const id = zeile ? zeile.dataset.canvasId : null;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    bewege(paneIdx, ziel, ev.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (ev.key === 'Home' || ev.key === 'End') {
    ev.preventDefault();
    bewege(paneIdx, ziel, ev.key === 'Home' ? 'anfang' : 'ende');
    return;
  }
  if (ev.key === 'Enter' && id) {
    // Ohne das Anhalten löste der Tastendruck am Knopf zusätzlich einen Klick
    // aus, und der wählte das Element ein zweites Mal aus.
    ev.preventDefault();
    bearbeite(paneIdx, id);
    return;
  }
  if (ev.key === 'Delete' && id) {
    ev.preventDefault();
    loesche(paneIdx, id, griffe.zeilen(getPaneEls(paneIdx).canvasListList).indexOf(zeile));
    return;
  }
  if (istKontextmenueTaste(ev)) {
    ev.preventDefault();
    oeffneMenue(paneIdx, id, zeile);
    return;
  }
  if (ev.key === 'Escape') {
    // Nicht weiterreichen: Die Escape-Kaskade des Fensters schlösse sonst
    // zusätzlich Suchleiste oder Menü, obwohl der Nutzer die Auswahl meinte
    // (dieselbe Begründung wie auf der Fläche selbst).
    ev.preventDefault();
    ev.stopPropagation();
    const stelle = zeile ? griffe.zeilen(getPaneEls(paneIdx).canvasListList).indexOf(zeile) : -1;
    zeigeCanvasElement(paneIdx, null);
    // Der Fokus bleibt in der Liste (AK8) — abgewählt ist das Element, nicht
    // der Ort, an dem der Anwender steht. Gemerkt wird er **nach** dem
    // Abwählen: Das meldet den neuen Stand und zeichnet dabei schon einmal.
    griffe.merkeFokus(id, stelle);
    griffe.zeichne(paneIdx);
  }
}

// --- Ziel-Wahl einer neuen Verbindung (4T-001770) ------------------------------
//
// Der Weg: «Verbindung anlegen…» im Kontextmenü einer Karte oder das Kommando
// `canvas.addConnection` starten die Wahl, die Pfeiltasten wählen die
// Gegenstelle unter den übrigen Karten, die Eingabetaste bestätigt und Escape
// bricht ab. Angelegt wird über den bestehenden Griff der Verbindungs-Bedienung.

async function starteVerbindungsWahl(paneIdx, von) {
  if (paneIdx < 0 || !von) return false;
  // Ohne sichtbares Panel gäbe es keine Liste, in der gewählt werden könnte —
  // und wer die Wahl über das Kontextmenü der Fläche startet, hat es nicht
  // zwangsläufig offen.
  await oeffnePanel('canvaslist', paneIdx);
  return beginneZielWahl(paneIdx, von);
}

function beginneZielWahl(paneIdx, von) {
  zielWahl = { paneIdx, von };
  const els = getPaneEls(paneIdx);
  const reihen = els && els.canvasListList ? kandidaten(paneIdx, els.canvasListList) : [];
  if (reihen.length === 0) {
    // Eine Wahl ohne Auswahl wäre eine Sackgasse: Es wird gesagt, warum nichts
    // geschieht (Guard-Muster der Canvas-Kommandos).
    zielWahl = null;
    return hinweis('canvas.liste.keinZiel');
  }
  griffe.zeichne(paneIdx);
  const zeile = reihen[0];
  griffe.waehle(paneIdx, zeile.dataset.canvasId, griffe.zeilen(els.canvasListList).indexOf(zeile));
  return true;
}

function zielWahlTaste(ev, paneIdx, ziel) {
  const zeile = ziel.closest(ZEILEN_WAHL);
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    bewege(paneIdx, ziel, ev.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (ev.key === 'Home' || ev.key === 'End') {
    ev.preventDefault();
    bewege(paneIdx, ziel, ev.key === 'Home' ? 'anfang' : 'ende');
    return;
  }
  if (ev.key === 'Enter') {
    ev.preventDefault();
    bestaetigeZielWahl(paneIdx, zeile ? zeile.dataset.canvasId : null);
    return;
  }
  if (ev.key === 'Escape') {
    ev.preventDefault();
    ev.stopPropagation();
    brichZielWahlAb(paneIdx);
    return;
  }
  // AK7: Die übrigen Tasten der Liste ruhen, solange die Wahl läuft. Sie
  // wirken nicht — und sie tun es sichtbar nicht, statt nebenbei etwas
  // anderes zu bearbeiten oder zu löschen.
  if (ev.key === 'Delete' || istKontextmenueTaste(ev)) ev.preventDefault();
}

/**
 * Bestätigt die laufende Ziel-Wahl an der Gegenstelle. Auch der Weg des Klicks
 * auf eine Zeile — die Wahl ist damit auch mit der Maus zu Ende zu bringen.
 *
 * @param {number} paneIdx
 * @param {string|null} nach Kennung der Gegenstelle.
 * @returns {boolean}
 */
export function bestaetigeZielWahl(paneIdx, nach) {
  const wahl = zielWahlFuer(paneIdx);
  if (!wahl) return false;
  const lage = griffe.stand(paneIdx);
  const ziel = lage.liste.find((e) => e.id === nach && e.art === 'karte');
  if (!ziel || nach === wahl.von) return false;
  zielWahl = null;
  handleCanvasElement(paneIdx, wahl.von, { art: 'verbinden', nach });
  // Der Fokus bleibt an der Gegenstelle: Dort steht der Anwender, und dort
  // hängt die neue Verbindung als Zeile darunter.
  griffe.merkeFokus(nach, -1);
  griffe.zeichne(paneIdx);
  return true;
}

function brichZielWahlAb(paneIdx) {
  const wahl = zielWahlFuer(paneIdx);
  if (!wahl) return;
  zielWahl = null;
  // Der Stand davor: Gewählt und gezeigt ist wieder die Karte, von der die
  // Verbindung ausgehen sollte. Geschrieben wurde nichts, es gibt also nichts
  // zurückzunehmen.
  griffe.waehle(paneIdx, wahl.von);
}

/**
 * Startet die Ziel-Wahl für die gewählte Karte der Spalte — der Weg des
 * Kommandos `canvas.addConnection` aus Menü und Kommando-Palette (4T-001770).
 *
 * Die drei Bedingungen, die das Verfügbarkeits-Modell nicht trägt, stehen hier
 * und werden gesagt statt still verworfen: offene Canvas-Ansicht, änderbares
 * Dokument, gewählte Karte.
 *
 * @param {number} paneIdx
 * @returns {Promise<boolean>}
 */
export async function starteCanvasVerbindung(paneIdx) {
  const lage = griffe.stand(paneIdx);
  if (!lage.inAnsicht) return hinweis('canvas.nurInAnsicht');
  if (!lage.aenderbar) return hinweis('canvas.nurLesbar');
  const eintrag = lage.liste.find((e) => e.id === lage.gewaehlt && e.art === 'karte');
  if (!eintrag) return hinweis('canvas.liste.keineKarte');
  return starteVerbindungsWahl(paneIdx, eintrag.id);
}

// 4T-001770: Die Tasten der Liste hängen am Dokument und nicht an der Sektion,
// wie im Suchergebnis-Panel und aus demselben Grund: Die Zeilen entstehen bei
// jedem Zeichnen neu, ein Listener an ihnen müsste jedes Mal mitwandern.
document.addEventListener('keydown', onKeydown);

// 4T-001770: «Verbindung anlegen…» im Kontextmenü einer Karte startet die
// Ziel-Wahl hier. Angemeldet statt importiert — der Canvas-Ordner darf dieses
// Modul nicht kennen (Ordner-Import-Wächter), und die Spalte löst dieses Modul
// an der Wurzel der Ansicht auf, die der Rückruf mitbringt.
registriereVerbindungsWahl((id, wurzelEl) => {
  void starteVerbindungsWahl(griffe.paneZu(wurzelEl, 'canvasEl'), id);
});
