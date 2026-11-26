// 4T-002648 (Epic 3E-000416): Die Prüfung an der Anmelde-Stelle, Teil 3
// (AK3): Jeder Aufruf eines Kanals muss aus dem Haupt-Rahmen einer eigenen
// Seite des Programms kommen, und die Fenster-Art des Absenders muss den Kanal
// erreichen dürfen (Lösungsansatz der Aufgabe, Punkt 4; Konzept-Stufe
// 4T-002645, Befund 13).
//
// **Was geprüft wird, in dieser Reihenfolge.** (1) Der Rahmen des Absenders
// (`event.senderFrame`) ist vorhanden und der oberste Rahmen seines
// webContents, also kein Unter-Rahmen. (2) Das webContents ist beim Anlegen
// seines Fensters mit einer Fenster-Art eingetragen worden. (3) Die
// Positiv-Liste dieser Fenster-Art enthält den Kanal. (4) Die Adresse des
// Rahmens ist die Adresse der Seite, die das Programm selbst in dieses Fenster
// geladen hat; Abfrage-Teil und Anker dürfen abweichen. Die Prüfung läuft an
// der Anmelde-Stelle vor der Pfad-Prüfung von `channel-guard.js` und vor dem
// Handler.
//
// **Fenster-Arten und Positiv-Liste.** Das Hauptfenster (`main`) erreicht
// jeden angemeldeten Kanal außer den beiden des Publikums-Fensters; das
// Publikums-Fenster (`audience`) erreicht genau `audience:ready` und
// `audience:input`; das Fenster für Folien-Bilder (`slideImages`) erreicht
// keinen Kanal, es hat weder Preload noch Skript. Ein webContents ohne
// Eintrag erreicht keinen Kanal. Eingetragen wird dort, wo das Programm das
// Fenster baut (window-manager.js, praesentation-fenster.js, slide-images.js);
// ausgetragen wird am Ereignis `destroyed` des webContents, also in jedem
// Ausgang des Fensters. Ein Neu-Laden behält das webContents und damit den
// Eintrag; die Seite und ihre Adresse bleiben dieselben.
//
// **Die eigene Adresse entsteht an genau einer Stelle** (`ownPageAddress`) aus
// der Datei, die das Fenster lädt. Stellt das Programm seinen Ladeweg später
// auf eine eigene Adress-Art um, ändert sich nur diese Funktion samt dem
// Vergleich `addressKey`. Verglichen werden Rechner-Teil und entschlüsselter
// Pfad der `file:`-Adresse; unter Windows ohne Unterschied der Groß- und
// Kleinschreibung, weil dort Laufwerks-Buchstabe und Pfad nicht unterschieden
// werden und Chromium den Laufwerks-Buchstaben selbst groß schreibt.
//
// **Die Abweisung ist ein geworfener Fehler** mit dem Text `sender:<Grund>`;
// der Aufruf im Fenster endet damit als abgelehntes Versprechen. Das weicht
// bewusst vom Rückgabe-Muster `{ ok: false, error }` der Entwicklungsrichtlinien
// (Kapitel 3) und von der Form in `channel-guard.js` ab: Diese Prüfung gilt für
// alle Kanäle, und deren Antworten haben keine gemeinsame Form (Wahrheitswerte,
// `null`, Listen, Objekte mit `ok` oder mit `fehler`). Ein eingesetzter
// Rückgabe-Wert wäre bei manchen Kanälen von einer gültigen Antwort nicht zu
// unterscheiden, etwa `null` bei `audience:ready` («keine Folie») oder `false`
// bei `presentationWindow:close` («keines offen»). Das abgelehnte Versprechen
// ist die eine Form, die jeder Aufrufer als Fehlschlag erkennt. Ein Aufruf aus
// der eigenen Seite des Programms trifft diesen Weg nie; ihn trifft nur
// fremder Code. Je Abweisung schreibt der Hauptprozess eine Warnung mit Kanal,
// Fenster-Art und Grund, ohne Adresse, Pfad und Inhalt.
//
// Electron-frei; eigener Zustand nur in der Instanz.
'use strict';

const url = require('node:url');
const { pathSeparator } = require('../../shared/platform');

/** Die Fenster-Arten der Anwendung. */
const WINDOW_KINDS = Object.freeze({
  main: 'main',
  audience: 'audience',
  slideImages: 'slideImages',
});

/** Die Kanäle des Publikums-Fensters; das Hauptfenster erreicht sie nicht. */
const AUDIENCE_CHANNELS = Object.freeze(['audience:ready', 'audience:input']);

/** Fenster-Arten, die eine eigene Seite aus einer Datei laden. */
const KINDS_WITH_PAGE = Object.freeze([WINDOW_KINDS.main, WINDOW_KINDS.audience]);

const REASONS = Object.freeze([
  'noFrame',
  'subFrame',
  'unknownWindow',
  'channelNotAllowed',
  'foreignAddress',
]);

class SenderRejection extends Error {
  constructor(reason) {
    super(`sender:${reason}`);
    this.reason = reason;
  }
}

/**
 * Die Adresse der eigenen Seite, die ein Fenster aus `loadedFile` lädt. Die
 * eine Stelle, an der die erlaubte Adresse aus dem Ladeweg entsteht.
 *
 * @param {string} loadedFile absoluter Pfad der geladenen Seite.
 * @param {string} platform Schreibweise der Pfade, `'win32'` für Windows.
 * @returns {string}
 */
function ownPageAddress(loadedFile, platform) {
  return url.pathToFileURL(loadedFile, { windows: platform === 'win32' }).href;
}

/**
 * Der Vergleichs-Schlüssel einer Adresse: Rechner-Teil und entschlüsselter
 * Pfad einer `file:`-Adresse, ohne Abfrage-Teil und Anker; unter Windows klein
 * geschrieben. `null` für jede andere oder unlesbare Adresse.
 *
 * @param {unknown} address
 * @param {string} platform
 * @returns {string|null}
 */
function addressKey(address, platform) {
  if (typeof address !== 'string') return null;
  let key;
  try {
    const parsed = new URL(address);
    if (parsed.protocol !== 'file:') return null;
    key = `${parsed.hostname}|${decodeURIComponent(parsed.pathname)}`;
  } catch {
    // Unlesbare Adresse oder kaputte Prozent-Kodierung: keine eigene Seite.
    return null;
  }
  return platform === 'win32' ? key.toLowerCase() : key;
}

/**
 * Ob eine Fenster-Art einen Kanal erreicht (Positiv-Liste).
 *
 * @param {string} kind
 * @param {string} channel
 * @returns {boolean}
 */
function channelAllowed(kind, channel) {
  if (kind === WINDOW_KINDS.audience) return AUDIENCE_CHANNELS.includes(channel);
  if (kind === WINDOW_KINDS.main) return !AUDIENCE_CHANNELS.includes(channel);
  return false;
}

/**
 * Baut die Absender-Prüfung der Anmelde-Stelle.
 *
 * @param {object} [deps]
 * @param {(...args: unknown[]) => void} [deps.warn] Protokoll-Weg.
 * @param {string} [deps.platform] Schreibweise der Pfade, `'win32'` für Windows;
 *   ohne Angabe aus der zentralen Plattform-Auskunft.
 * @returns {{registerWindow: Function, kindOf: Function, assertSender: Function}}
 */
function createSenderCheck(deps) {
  const { warn = console.warn } = deps || {};
  // Ohne Vorgabe kommt die Schreibweise der Pfade aus der zentralen Auskunft
  // (src/shared/platform.js, Regel E1 des Wächters gegen Portierbarkeits-
  // Erosion): Windows-Pfade heißen hier `win32`, alle übrigen `posix`. Die
  // Prüffälle geben die Plattform vor, damit beide Schreibweisen auf jedem
  // Rechner geprüft werden.
  const platform =
    deps && deps.platform ? deps.platform : pathSeparator() === '\\' ? 'win32' : 'posix';
  // webContents.id -> { kind, key }
  const entries = new Map();

  /**
   * Trägt das webContents eines neu gebauten Fensters mit seiner Fenster-Art
   * ein; ausgetragen wird es an seinem Ereignis `destroyed`.
   *
   * @param {{id: number, once: Function}} webContents
   * @param {string} kind eine der `WINDOW_KINDS`.
   * @param {string} [loadedFile] die Seite, die das Fenster lädt; Pflicht für
   *   `main` und `audience`, für `slideImages` nicht vorgesehen.
   */
  function registerWindow(webContents, kind, loadedFile) {
    if (
      !webContents ||
      !Number.isInteger(webContents.id) ||
      typeof webContents.once !== 'function'
    ) {
      throw new TypeError('Sender check: webContents with id and once required.');
    }
    if (!Object.values(WINDOW_KINDS).includes(kind)) {
      throw new TypeError(`Sender check: unknown window kind ${kind}.`);
    }
    const withPage = KINDS_WITH_PAGE.includes(kind);
    if (withPage !== (typeof loadedFile === 'string' && loadedFile !== '')) {
      throw new TypeError(`Sender check: page of window kind ${kind} does not fit.`);
    }
    if (entries.has(webContents.id)) {
      throw new Error(`Sender check: webContents ${webContents.id} already registered.`);
    }
    const key = withPage ? addressKey(ownPageAddress(loadedFile, platform), platform) : null;
    const entry = { kind, key };
    const id = webContents.id;
    entries.set(id, entry);
    webContents.once('destroyed', () => {
      if (entries.get(id) === entry) entries.delete(id);
    });
  }

  /**
   * Die eingetragene Fenster-Art eines webContents oder `null`.
   *
   * @param {{id: number}|null|undefined} webContents
   * @returns {string|null}
   */
  function kindOf(webContents) {
    const entry = webContents ? entries.get(webContents.id) : undefined;
    return entry ? entry.kind : null;
  }

  // Der Grund der Abweisung oder `null`. Ein Rahmen, der beim Lesen schon
  // aufgelöst ist, wirft in Electron beim Zugriff; das zählt als fehlender.
  function reasonFor(channel, event) {
    let frame;
    let parent;
    let frameUrl;
    try {
      frame = event ? event.senderFrame : null;
      if (frame) {
        parent = frame.parent;
        frameUrl = frame.url;
      }
    } catch {
      return 'noFrame';
    }
    if (!frame) return 'noFrame';
    if (parent !== null) return 'subFrame';
    const entry = event.sender ? entries.get(event.sender.id) : undefined;
    if (!entry) return 'unknownWindow';
    if (!channelAllowed(entry.kind, channel)) return 'channelNotAllowed';
    if (entry.key === null || addressKey(frameUrl, platform) !== entry.key) return 'foreignAddress';
    return null;
  }

  /**
   * Weist einen Aufruf ab, der nicht aus dem Haupt-Rahmen einer eigenen Seite
   * einer Fenster-Art kommt, die den Kanal erreicht; sonst ohne Wirkung.
   *
   * @param {string} channel
   * @param {object} event das Ereignis des Aufrufs (`IpcMainInvokeEvent`).
   * @throws {SenderRejection}
   */
  function assertSender(channel, event) {
    const reason = reasonFor(channel, event);
    if (reason === null) return;
    const kind = event && event.sender ? kindOf(event.sender) : null;
    warn(`Kanal ${channel} abgewiesen:`, `sender:${reason}`, `Fenster-Art ${kind || 'unbekannt'}`);
    throw new SenderRejection(reason);
  }

  return { registerWindow, kindOf, assertSender };
}

module.exports = {
  WINDOW_KINDS,
  AUDIENCE_CHANNELS,
  REASONS,
  SenderRejection,
  ownPageAddress,
  addressKey,
  channelAllowed,
  createSenderCheck,
};
