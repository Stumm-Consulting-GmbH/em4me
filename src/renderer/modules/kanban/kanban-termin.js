// 4T-001903 (Epic 3E-000318): Termin der Karte setzen, ändern und entfernen —
// die Anbindung des Kalender-Wählers, die Einträge im Kontextmenü der Karte
// und das Umschreiben eines Vorbild-Termins beim ersten Bearbeiten.
//
// **Warum ein eigenes Modul neben `kanban-bedienung.js`.** Die Karten-Bedienung
// steht nahe an ihrem Zeilen-Budget; die Termin-Bedienung ist ein eigener
// Gegenstand mit eigenem, asynchronem Ablauf (der Wähler antwortet später).
// Sie benutzt deren Schreibweg und Kartensuche, statt eigene zu bauen.
//
// **Der Wähler ist der bestehende Kalender-Wähler** der Anwendung, mit Datum
// und wahlweise Uhrzeit — derselbe, den Aufgaben-Dialog und Aufgaben-Abfrage
// öffnen. Er kommt als Rückruf herein (`waehleTermin`): Ein Import zöge diesen
// Ordner in den eingefrorenen Datei-Zyklus des Anzeige-Prozesses, und die
// Prüffälle stellen ihn so ohne Fenster nach.
//
// **Setzen, Entfernen und Text-Bearbeiten sind ein Bearbeiten der Karte** und
// schreiben einen lesbaren Vorbild-Termin in derselben Transaktion um: ein
// Schreibvorgang, ein Rückgängig-Schritt. Statuswechsel, Ziehen und Archivieren
// laufen nicht hier durch und lassen ihn stehen (Entscheidung des Product
// Owners vom 2026-09-21: umgeschrieben wird erst, wenn der Anwender die Karte
// ohnehin anfasst).
'use strict';

import {
  aendereKarte,
  schreibeVorbildTerminUm,
  setzeKartenTermin,
} from '../../../shared/kanban/kanban-operationen.js';
import { leseTafel } from '../../../shared/kanban/kanban-core.js';

/**
 * Ändert den Text einer Karte und schreibt einen danach noch vorhandenen,
 * lesbaren Vorbild-Termin in derselben Rechnung um.
 *
 * Gemessen wird **nach** der Text-Änderung: Hat der Anwender den Termin beim
 * Bearbeiten selbst gelöscht, gibt es nichts umzuschreiben; hat er ihn
 * unlesbar gemacht, bleibt er als Text stehen. Die Karte behält ihren Platz,
 * weil nur ihre eine Zeile geändert wird.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number, kartenText: string}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
export function aendereKarteUndSchreibeUm(text, angaben = {}) {
  const ergebnis = aendereKarte(text, angaben);
  if (!ergebnis || ergebnis.ok !== true) return ergebnis;
  const spalte = leseTafel(ergebnis.text).spalten[angaben.spalte];
  const karte = spalte ? spalte.karten[angaben.karte] : null;
  if (!karte || !karte.vorbildTermin || !karte.vorbildTermin.lesbar) return ergebnis;
  const umgeschrieben = schreibeVorbildTerminUm(ergebnis.text, {
    spalte: angaben.spalte,
    karte: angaben.karte,
  });
  return umgeschrieben.ok ? umgeschrieben : ergebnis;
}

// Der Termin, mit dem der Wähler öffnet: der gültige Termin der Zeile, sonst
// ein lesbarer Vorbild-Termin, sonst keiner (der Wähler nimmt dann heute).
function aktuellerTermin(karte) {
  const due = karte && karte.aufgabe ? karte.aufgabe.due : null;
  if (due && !due.invalid) return { date: due.date, time: due.time || null };
  const vorbild = karte ? karte.vorbildTermin : null;
  if (vorbild && vorbild.lesbar) return { date: vorbild.datum, time: vorbild.uhrzeit || null };
  return null;
}

/**
 * Verdrahtet die Termin-Bedienung mit der Karten-Bedienung.
 *
 * @param {object} ctx
 * @param {Function} [ctx.t] Übersetzungs-Funktion.
 * @param {Function} ctx.karteImModell (karteEl) => {spalte, karte, modell}|null.
 * @param {Function} ctx.quelle () => Text der letzten Zeichnung.
 * @param {Function} ctx.aenderbar () => boolean.
 * @param {Function} ctx.wendeAn (operation, angaben) => boolean — der
 *   gemeinsame Schreibweg der Tafel: eine Transaktion, ein Rückgängig-Schritt.
 * @param {Function} [ctx.waehleTermin] (optionen) => Promise<{date, time}|null>,
 *   der Kalender-Wähler. Fehlt er, bietet die Karte das Setzen nicht an.
 * @param {Function} [ctx.hinweis] (schluessel) => void.
 * @returns {object}
 */
export function createTerminBedienung(ctx) {
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;
  const kannWaehlen = () => typeof ctx.waehleTermin === 'function';

  /**
   * Öffnet den Wähler für eine Karte und setzt den gewählten Termin.
   *
   * Der Wähler antwortet später. Hat sich das Dokument inzwischen geändert,
   * wird die Wahl verworfen statt auf einen Stand zu schreiben, auf dem die
   * Karten-Nummern etwas anderes bedeuten (Vorsichtsregel des Schreibwegs).
   *
   * @returns {Promise<boolean>} `true`, wenn geschrieben wurde.
   */
  async function setze(karteEl, ort = {}) {
    if (!karteEl || !ctx.aenderbar() || !kannWaehlen()) return false;
    const treffer = ctx.karteImModell(karteEl);
    if (!treffer) return false;
    const vorher = ctx.quelle();
    const aktuell = aktuellerTermin(treffer.modell);
    let gewaehlt;
    try {
      gewaehlt = await ctx.waehleTermin({
        x: ort.x,
        y: ort.y,
        date: aktuell ? aktuell.date : undefined,
        time: aktuell && aktuell.time ? aktuell.time : undefined,
        dateEnabled: true,
        timeEnabled: !!(aktuell && aktuell.time),
      });
    } catch {
      gewaehlt = null;
    }
    if (!gewaehlt || !gewaehlt.date) return false;
    if (ctx.quelle() !== vorher || !ctx.aenderbar()) {
      if (typeof ctx.hinweis === 'function') ctx.hinweis('kanban.verworfen');
      return false;
    }
    return ctx.wendeAn(setzeKartenTermin, {
      spalte: treffer.spalte,
      karte: treffer.karte,
      termin: { date: gewaehlt.date, time: gewaehlt.time || null },
    });
  }

  /** Entfernt den Termin einer Karte; ein Rückgängig-Schritt. */
  function entferne(karteEl) {
    if (!karteEl || !ctx.aenderbar()) return false;
    const treffer = ctx.karteImModell(karteEl);
    if (!treffer) return false;
    return ctx.wendeAn(setzeKartenTermin, {
      spalte: treffer.spalte,
      karte: treffer.karte,
      termin: null,
    });
  }

  /**
   * Die Termin-Einträge des Kontextmenüs einer Karte. «Termin entfernen» steht
   * nur da, wo es etwas zu entfernen gibt: an einer Karte mit Termin oder mit
   * lesbarem Vorbild-Termin. Im nicht änderbaren Dokument gibt es keine.
   */
  function kartenEintraege(karteEl, ort = {}) {
    if (!karteEl || !ctx.aenderbar()) return [];
    const treffer = ctx.karteImModell(karteEl);
    if (!treffer) return [];
    const eintraege = [];
    if (kannWaehlen()) {
      eintraege.push({
        label: t('kanban.terminSetzen'),
        dataId: 'kanban-card-set-date',
        action: () => setze(karteEl, ort),
      });
    }
    const karte = treffer.modell;
    const hatTermin =
      !!(karte.aufgabe && karte.aufgabe.due) ||
      !!(karte.vorbildTermin && karte.vorbildTermin.lesbar);
    if (hatTermin) {
      eintraege.push({
        label: t('kanban.terminEntfernen'),
        dataId: 'kanban-card-remove-date',
        action: () => entferne(karteEl),
      });
    }
    return eintraege;
  }

  /**
   * Der Klick auf ein Termin-Abzeichen öffnet den Wähler unter dem Abzeichen.
   *
   * @param {HTMLElement} abzeichen Element mit `data-kanban-termin`.
   * @returns {Promise<boolean>|boolean}
   */
  function beiAbzeichen(abzeichen) {
    const karteEl =
      abzeichen && typeof abzeichen.closest === 'function'
        ? abzeichen.closest('.kanban-karte')
        : null;
    if (!karteEl) return false;
    const rahmen =
      typeof abzeichen.getBoundingClientRect === 'function'
        ? abzeichen.getBoundingClientRect()
        : null;
    return setze(karteEl, rahmen ? { x: rahmen.left, y: rahmen.bottom + 4 } : {});
  }

  return { setze, entferne, kartenEintraege, beiAbzeichen };
}
