// 4T-001957 (Epic 3E-000319, Story 4S-000985): Die Angaben der verlinkten
// Notiz auf der Karte — Anfrage, Nachtragen und Zeichnung der Zeilen.
//
// **Abhängigkeits-frei wie `kanban-tafel.js`** (Injektions-Bauweise): kein
// `api`, kein `i18n`, kein Fenster-Zustand. Der Lese-Kanal und die Übersetzung
// kommen herein; so ist das Modul ohne Preload prüfbar, und der Ordner bleibt
// frei vom großen Datei-Zyklus des Anzeige-Prozesses.
//
// **Die Karten erscheinen sofort, die Angaben werden nachgetragen.** Die
// Zeichnung der Tafel wartet nie auf den Hauptprozess: Sie ist synchron, und
// erst danach geht **eine** gebündelte Anfrage für alle Karten mit Verweis
// hinaus. Kommt die Antwort, trägt sie die Zeilen unter dem Kartentext ein.
// Eine Antwort, die eine inzwischen neuere Anfrage überholt hat, wird
// verworfen — sie beschriebe einen Stand, den es nicht mehr gibt.
//
// **Kein Flackern beim Nachzug.** Die Tafel wird bei jeder Änderung ganz neu
// gezeichnet; ohne Vorkehrung verschwänden dabei alle Angaben bis zur nächsten
// Antwort. Der zuletzt gelesene Stand wird deshalb sofort wieder eingetragen,
// und eine Antwort, die nichts Neues bringt, ändert am Baum nichts.
//
// **Text statt Markup.** Jeder Wert wird als Text gesetzt, nie als HTML; ein
// Bild nur als Daten-Adresse eines Bildes, wie sie der Hauptprozess liefert.
'use strict';

import { angabenAnfrage, angabenName } from '../../../shared/kanban/kanban-angaben.js';

export const ANGABEN_KLASSE = 'kanban-karte-angaben';

// Je Container der letzte Stand: Zähler der Anfragen, zuletzt eingetragene
// Antwort und die Tafel-Wurzel, in die sie eingetragen wurde.
const zustaende = new WeakMap();

function zustandVon(container) {
  let zustand = zustaende.get(container);
  if (!zustand) {
    zustand = { nummer: 0, letzte: null, wurzel: null, eingetragen: null };
    zustaende.set(container, zustand);
  }
  return zustand;
}

/**
 * Baut die Angaben-Zeilen einer Karte.
 *
 * @param {Array<{schluessel: string, text: string, bild?: string}>} werte
 * @param {Array} feldwahl Liste aus `feldwahlAus`.
 * @param {Function} t Übersetzungs-Funktion.
 * @returns {HTMLElement|null} `null`, wenn keine Angabe einen Wert hat.
 */
export function baueAngaben(werte, feldwahl, t) {
  const block = document.createElement('div');
  block.className = ANGABEN_KLASSE;
  block.setAttribute('role', 'group');
  block.setAttribute('aria-label', t('kanban.einstellungen.feldwahl'));
  for (const wert of Array.isArray(werte) ? werte : []) {
    const eintrag = feldwahl.find((e) => e.feld === wert.schluessel);
    if (!eintrag) continue;
    const name = angabenName(eintrag);
    const zeile = document.createElement('div');
    zeile.className = 'kanban-angabe';
    zeile.dataset.schluessel = eintrag.feld;
    if (!eintrag.bezeichnungVerbergen) {
      const beschriftung = document.createElement('span');
      beschriftung.className = 'kanban-angabe-name';
      beschriftung.textContent = `${name}:`;
      zeile.appendChild(beschriftung);
      zeile.appendChild(document.createTextNode(' '));
    }
    // Ein Bild nur als Daten-Adresse eines Bildes: Mehr liefert der
    // Hauptprozess nicht, und etwas anderes wird hier auch nicht angenommen.
    if (typeof wert.bild === 'string' && wert.bild.startsWith('data:image/')) {
      const bild = document.createElement('img');
      bild.className = 'kanban-angabe-bild';
      bild.src = wert.bild;
      bild.alt = name;
      // Ein gezogenes Bild wäre ein zweiter Zug neben dem der Karte.
      bild.draggable = false;
      zeile.classList.add('kanban-angabe-mit-bild');
      zeile.title = name;
      zeile.appendChild(bild);
    } else if (typeof wert.text === 'string') {
      const inhalt = document.createElement('span');
      inhalt.className = 'kanban-angabe-wert';
      inhalt.textContent = wert.text;
      zeile.appendChild(inhalt);
      // Die Zeile ist auf zwei Zeilen gekürzt (Stilblatt); der volle Wert steht
      // im Hinweistext (Story AK8).
      zeile.title = eintrag.bezeichnungVerbergen ? wert.text : `${name}: ${wert.text}`;
    } else {
      continue;
    }
    block.appendChild(zeile);
  }
  return block.childElementCount > 0 ? block : null;
}

/** Entfernt alle Angaben-Zeilen im Container. */
export function entferneAngaben(container) {
  for (const el of [...container.querySelectorAll(`.${ANGABEN_KLASSE}`)]) el.remove();
}

/**
 * Trägt die Angaben in die gezeichneten Karten ein, je Karte unter ihren Text.
 *
 * @param {Element} container Container der Tafel.
 * @param {object} anfrage Ergebnis von `angabenAnfrage`.
 * @param {Map<string, object|null>} jeZiel Antwort je Ziel.
 * @param {Array} feldwahl
 * @param {Function} t
 */
export function trageAngabenEin(container, anfrage, jeZiel, feldwahl, t) {
  entferneAngaben(container);
  for (const eintrag of anfrage.karten) {
    const ergebnis = jeZiel.get(eintrag.ziel);
    if (!ergebnis || !Array.isArray(ergebnis.werte)) continue;
    const karte = container.querySelector(
      `.kanban-karte[data-spalte="${eintrag.spalte}"][data-karte="${eintrag.karte}"]`,
    );
    const inhalt = karte ? karte.querySelector(':scope > .kanban-karte-inhalt') : null;
    if (!inhalt) continue;
    const block = baueAngaben(ergebnis.werte, feldwahl, t);
    if (block) inhalt.after(block);
  }
}

function jeZielAus(anfrage, ergebnisse) {
  const karte = new Map();
  anfrage.ziele.forEach((ziel, nr) => {
    const ergebnis = Array.isArray(ergebnisse) ? ergebnisse[nr] : null;
    karte.set(ziel, ergebnis && typeof ergebnis === 'object' ? ergebnis : null);
  });
  return karte;
}

/**
 * Liest die Angaben der verlinkten Notizen und trägt sie nach.
 *
 * Gerufen nach jeder Zeichnung der Tafel und bei jedem Zeichen-Anstoß, der die
 * Zeichnung als unverändert überspringt — so zeigt die Karte beim nächsten
 * Anzeigen den Stand der Notiz, auch wenn sich die Tafel selbst nicht geändert
 * hat (Story AK7). Einen Beobachter der Ziel-Dateien gibt es nicht.
 *
 * @param {Element} container Container der Tafel.
 * @param {object} p
 * @param {object} p.model Modell der gezeichneten Tafel.
 * @param {Array} p.feldwahl Liste aus `feldwahlAus`; leer heißt: keine Anfrage.
 * @param {string} p.pfad Pfad der Tafel, Bezug der Ziel-Auflösung.
 * @param {Function} p.lade ({basePath, schluessel, ziele}) => Promise<{ok, ergebnisse}>.
 * @param {Function} p.t Übersetzungs-Funktion.
 * @returns {Promise<'leer'|'verworfen'|'unveraendert'|'eingetragen'>}
 */
export async function ladeAngaben(container, { model, feldwahl, pfad, lade, t }) {
  const zustand = zustandVon(container);
  const nummer = ++zustand.nummer;
  const anfrage = pfad ? angabenAnfrage(model, feldwahl) : null;
  if (!anfrage || typeof lade !== 'function') {
    entferneAngaben(container);
    zustand.letzte = null;
    zustand.eingetragen = null;
    return 'leer';
  }
  const wurzel = container.querySelector('.kanban-tafel');
  const bezug = JSON.stringify([pfad, feldwahl]);
  // Nach einer Neu-Zeichnung sofort den letzten Stand wieder eintragen, damit
  // die Karten ihre Angaben nicht bis zur Antwort verlieren.
  if (zustand.letzte && zustand.letzte.bezug === bezug && zustand.wurzel !== wurzel) {
    trageAngabenEin(container, anfrage, zustand.letzte.jeZiel, feldwahl, t);
    zustand.wurzel = wurzel;
    zustand.eingetragen = JSON.stringify([bezug, anfrage.karten, zustand.letzte.roh]);
  }
  let antwort;
  try {
    antwort = await lade({ basePath: pfad, schluessel: anfrage.schluessel, ziele: anfrage.ziele });
  } catch {
    // Ein gescheiterter Kanal zeigt nichts zusätzlich und meldet keinen Fehler
    // (Story AK5); die Karte bleibt beim zuletzt gelesenen Stand.
    return nummer === zustand.nummer ? 'unveraendert' : 'verworfen';
  }
  if (nummer !== zustand.nummer) return 'verworfen';
  if (!antwort || antwort.ok !== true) return 'unveraendert';
  const roh = JSON.stringify(antwort.ergebnisse);
  const stempel = JSON.stringify([bezug, anfrage.karten, roh]);
  const aktuelleWurzel = container.querySelector('.kanban-tafel');
  if (zustand.eingetragen === stempel && zustand.wurzel === aktuelleWurzel) return 'unveraendert';
  const jeZiel = jeZielAus(anfrage, antwort.ergebnisse);
  trageAngabenEin(container, anfrage, jeZiel, feldwahl, t);
  zustand.letzte = { bezug, jeZiel, roh };
  zustand.wurzel = aktuelleWurzel;
  zustand.eingetragen = stempel;
  return 'eingetragen';
}
