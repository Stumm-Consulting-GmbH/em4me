// 4T-002348 (Epic 3E-000184): Aufträge eines Workflow-Schritts an das Fenster,
// das den ungespeicherten Stand der Ziel-Datei hält, mit Antwort und Frist.
//
// **Warum nicht die vorhandene Weiche allein.** `uebergibAnPufferBesitzer`
// schickt einen Auftrag und meldet nur, dass er unterwegs ist; das Ziel-Fenster
// antwortet nicht. Ein Workflow muss nach einem gescheiterten Schritt anhalten
// (A1) und braucht deshalb das Ergebnis. Der Auftrag trägt eine Kennung, das
// Fenster antwortet über `workflow:bufferEditDone` mit derselben Kennung.
//
// **Ohne Antwort wird nichts geschrieben.** Antwortet das Fenster nicht binnen
// der Frist oder wird es geschlossen, endet der Schritt mit
// `bufferUnavailable`. Ein Rückfall auf die Platte erzeugte genau den
// Konflikt-Dialog im Besitzer-Fenster, den die Weiche verhindert
// (Entwicklungsrichtlinien, Kapitel 3: kein stiller Rückfall).
//
// **Lesen vor dem Urteil** (4T-002690, Story 4S-001215, Weg (i) des Tasks): Ist
// die Erweiterung «Datenbank» an, holt der Hauptprozess vor einer Bearbeitung
// über denselben Kanal den Puffer-Stand des haltenden Fensters (Auftrag mit
// `read: true`, Antwort mit `text`), bildet den neuen Stand selbst und urteilt
// (`workflow-db-urteil.js`). Die Bearbeitung geht danach mit dem gelesenen
// Stand als `expected`; weicht der Puffer beim Anwenden davon ab, wendet das
// Fenster nichts an und meldet `bufferChanged`. So wird nie ein Stand
// angewendet, den das Urteil nicht gesehen hat.
//
// Eigener Zustand: die offenen Aufträge je Kennung, nur für die Dauer eines
// Auftrags.
'use strict';

const crypto = require('node:crypto');

/** Kanal, über den das Besitzer-Fenster den Auftrag empfängt. */
const BUFFER_EDIT_CHANNEL = 'workflow:bufferEdit';
/** Frist für die Antwort des Besitzer-Fensters. */
const BUFFER_EDIT_TIMEOUT_MS = 10000;
// 4T-002690: Höchstlänge eines gelesenen Puffer-Stands. Großzügiger als die
// Grenze der Schritt-Nutzlast, weil eine Tabellen-Datei groß werden kann; ein
// längerer Text gilt als nicht gelesen (`bufferUnavailable`).
const MAX_PUFFER_TEXT = 64 * 1024 * 1024;
// Die Codes, die ein Fenster melden darf: die der Bearbeitung und die eigenen.
const ANTWORT_CODES = new Set([
  'invalidStep',
  'headingUnknown',
  'headingAmbiguous',
  'textNotFound',
  'frontmatterInvalid',
  'tagInvalid',
  'bufferUnavailable',
  // 4T-002690: Der Puffer weicht vom gelesenen und beurteilten Stand ab.
  'bufferChanged',
]);

/**
 * Baut die Auftrags-Verwaltung.
 *
 * @param {{timeoutMs?: number, newId?: () => string}} [opts] Frist und
 *   Kennungs-Erzeuger (für Prüffälle).
 * @returns {{request: Function, answer: Function, pending: () => number}}
 */
function createBufferRequests(opts = {}) {
  const frist = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : BUFFER_EDIT_TIMEOUT_MS;
  const neueKennung = typeof opts.newId === 'function' ? opts.newId : () => crypto.randomUUID();
  const offen = new Map();

  function abschliessen(kennung, ergebnis) {
    const eintrag = offen.get(kennung);
    if (!eintrag) return false;
    offen.delete(kennung);
    clearTimeout(eintrag.timer);
    if (typeof eintrag.fenster.removeListener === 'function') {
      eintrag.fenster.removeListener('closed', eintrag.beiSchliessen);
    }
    eintrag.resolve(ergebnis);
    return true;
  }

  // Schickt einen Auftrag mit neuer Kennung und wartet auf die Antwort.
  function auftrag(fenster, nutzlast, lesen) {
    return new Promise((resolve) => {
      const kennung = neueKennung();
      const unerreichbar = { ok: false, code: 'bufferUnavailable' };
      const eintrag = {
        fenster,
        fensterId: fenster.webContents.id,
        lesen,
        resolve,
        timer: setTimeout(() => abschliessen(kennung, unerreichbar), frist),
        beiSchliessen: () => abschliessen(kennung, unerreichbar),
      };
      offen.set(kennung, eintrag);
      if (typeof fenster.once === 'function') fenster.once('closed', eintrag.beiSchliessen);
      try {
        fenster.webContents.send(BUFFER_EDIT_CHANNEL, { requestId: kennung, ...nutzlast });
      } catch (err) {
        console.error('[workflow] Auftrag an das Fenster nicht zugestellt:', err && err.message);
        abschliessen(kennung, unerreichbar);
      }
    });
  }

  /**
   * Schickt eine Bearbeitung an das Besitzer-Fenster und wartet auf seine Antwort.
   *
   * @param {object} fenster BrowserWindow des Besitzers.
   * @param {string} pfad Ziel-Datei.
   * @param {object} edit Bearbeitung für `applyContentEdit`.
   * @param {{expected?: string}} [optionen] 4T-002690: der beurteilte Stand; das
   *   Fenster wendet nur auf genau diesen Stand an, sonst `bufferChanged`.
   * @returns {Promise<{ok: boolean, code?: string, changed?: boolean}>}
   */
  function request(fenster, pfad, edit, optionen = {}) {
    const nutzlast = { path: pfad, edit };
    if (typeof optionen.expected === 'string') nutzlast.expected = optionen.expected;
    return auftrag(fenster, nutzlast, false);
  }

  /**
   * 4T-002690: Liest den Puffer-Stand einer Datei aus dem Besitzer-Fenster.
   *
   * @param {object} fenster BrowserWindow des Besitzers (auch das startende).
   * @param {string} pfad Datei, deren Stand gemeint ist.
   * @returns {Promise<{ok: true, text: string}|{ok: false, code: string}>}
   */
  function read(fenster, pfad) {
    return auftrag(fenster, { path: pfad, read: true }, true);
  }

  /**
   * Nimmt die Antwort eines Fensters an. Eine unbekannte Kennung oder die
   * Antwort eines anderen als des angefragten Fensters wird verworfen.
   *
   * @param {object} event IPC-Ereignis (Absender).
   * @param {{requestId: string, ok: boolean, code?: string, changed?: boolean}} antwort
   * @returns {{ok: boolean}} `ok: false` bei verworfener Antwort.
   */
  function answer(event, antwort) {
    const kennung = antwort && typeof antwort.requestId === 'string' ? antwort.requestId : null;
    const eintrag = kennung ? offen.get(kennung) : null;
    const absender = event && event.sender ? event.sender.id : null;
    if (!eintrag || eintrag.fensterId !== absender) return { ok: false };
    if (eintrag.lesen) {
      // 4T-002690: Eine Lese-Antwort trägt den Stand als Text in Grenzen;
      // alles andere gilt als nicht gelesen.
      const gelesen =
        antwort.ok === true &&
        typeof antwort.text === 'string' &&
        antwort.text.length <= MAX_PUFFER_TEXT;
      abschliessen(
        kennung,
        gelesen ? { ok: true, text: antwort.text } : { ok: false, code: 'bufferUnavailable' },
      );
      return { ok: true };
    }
    const ergebnis = antwort.ok === true ? { ok: true } : { ok: false, code: 'bufferUnavailable' };
    if (antwort.ok !== true && ANTWORT_CODES.has(antwort.code)) {
      ergebnis.code = antwort.code;
    }
    if (antwort.ok === true && antwort.changed === false) ergebnis.changed = false;
    abschliessen(kennung, ergebnis);
    return { ok: true };
  }

  return { request, read, answer, pending: () => offen.size };
}

module.exports = { BUFFER_EDIT_CHANNEL, BUFFER_EDIT_TIMEOUT_MS, createBufferRequests };
