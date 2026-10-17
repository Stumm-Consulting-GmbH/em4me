// 4T-002278 (Epic 3E-000348): Das Publikums-Fenster der Präsentation, die
// zweite Fensterart der Anwendung (Entscheidung B1 des Product Owners vom
// 2026-10-14: Das neue Fenster ist das Publikums-Fenster, die
// Referenten-Ansicht bleibt im Hauptfenster).
//
// **Warum ein eigener Erzeuger neben der Fenster-Verwaltung** und nicht eine
// Ergänzung von `createWindow` in window-manager.js: Das Publikums-Fenster teilt
// mit dem Hauptfenster weder Menü noch Sitzungs-Persistenz noch Fenster-Liste
// noch Schließ-Rückfrage, und jene Datei steht an ihrem Größen-Budget. Weil es
// nie in die Fenster-Liste (`windows`) eingetragen wird, fehlt es dort, in der
// Persistenz, in der Fenster-Zählung und im Fenster-Menü von selbst.
//
// **Was das Fenster ist:** eine schmale eigene Seite (src/renderer/publikum.html)
// mit eigenem Preload (preload-publikum.js), `sandbox: true`, ohne Node, ohne
// Menü. Es zeigt die fertig gezeichnete Folie, die das Hauptfenster liefert;
// den Folien-Zustand hält allein das Hauptfenster. Tasten, Mausklick und
// Mausrad im Publikums-Fenster gehen als Eingabe an das Hauptfenster zurück.
//
// **Lebenszyklus:** höchstens ein Publikums-Fenster je Hauptfenster. Schließt
// das Hauptfenster, schließt das Publikums-Fenster mit; schließt der Anwender
// das Publikums-Fenster, erfährt das Hauptfenster es über
// `presentationWindow:closed` und beendet seine Vorführung. Es gibt keine
// Schließ-Rückfrage: Das Fenster hält keinen eigenen Inhalt.
//
// **Bildschirm:** Mit zwei oder mehr Bildschirmen öffnet es im Vollbild auf
// einem Bildschirm, auf dem das Hauptfenster nicht liegt; mit einem
// Bildschirm als gewöhnliches Fenster, das der Anwender selbst auf den Beamer
// zieht (Bedien-Frage zu B1, mit der Empfehlung entschieden).
//
// Zur Lade-Zeit electron-frei: Electron-Klassen und Bildschirm-Modul kommen
// über das Deps-Objekt (Muster der ipc-Module), damit die Prüfdatei den
// Erzeuger mit Attrappen messen kann.
'use strict';

const path = require('node:path');

/** Größe des gewöhnlichen Fensters bei nur einem Bildschirm (16:9). */
const FENSTER_BREITE = 960;
const FENSTER_HOEHE = 540;

/** Obergrenze einer übertragenen Folie (Bilder reisen als Daten-Adressen mit). */
const FOLIE_MAX_ZEICHEN = 64 * 1024 * 1024;

/** Erlaubte Eingabe-Arten aus dem Publikums-Fenster. */
const EINGABE_ARTEN = new Set(['taste', 'rad', 'klick', 'beenden']);

/**
 * Wählt den Bildschirm des Publikums-Fensters: einen anderen als den des
 * Hauptfensters, bevorzugt in der Reihenfolge des Systems.
 *
 * @param {Array<{id: number, bounds: object}>} bildschirme alle Bildschirme.
 * @param {{id: number}|null} hauptBildschirm der Bildschirm des Hauptfensters.
 * @returns {{id: number, bounds: object}|null} null bei nur einem Bildschirm.
 */
function waehleBildschirm(bildschirme, hauptBildschirm) {
  const liste = Array.isArray(bildschirme) ? bildschirme.filter((b) => b && b.bounds) : [];
  if (liste.length < 2) return null;
  const hauptId = hauptBildschirm ? hauptBildschirm.id : null;
  return liste.find((b) => b.id !== hauptId) || null;
}

/**
 * Die Optionen des Publikums-Fensters. Die Abweichung `sandbox: false` des
 * Hauptfensters gilt hier ausdrücklich nicht.
 *
 * @param {object} angaben
 * @param {string} angaben.preloadPfad
 * @param {string} [angaben.iconPfad]
 * @param {boolean} [angaben.imTestlauf]
 * @returns {object}
 */
function publikumOptionen({ preloadPfad, iconPfad, imTestlauf }) {
  return {
    width: FENSTER_BREITE,
    height: FENSTER_HOEHE,
    minWidth: 320,
    minHeight: 180,
    backgroundColor: '#000000',
    ...(iconPfad ? { icon: iconPfad } : {}),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPfad,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      // Begründung wie im Hauptfenster (window-manager.js): im Testlauf ohne
      // Drosselung, weil das Fenster dort ohne Fokus erscheint.
      ...(imTestlauf ? { backgroundThrottling: false } : {}),
    },
  };
}

/**
 * Prüft eine Folie des Hauptfensters: eigenständiges HTML-Dokument, Index und
 * Gesamtzahl, Entwurfsgröße.
 *
 * @param {unknown} folie
 * @returns {{html: string, index: number, gesamt: number, breite: number, hoehe: number}|null}
 */
function pruefeFolie(folie) {
  if (!folie || typeof folie !== 'object') return null;
  const { html, index, gesamt, breite, hoehe } = folie;
  if (typeof html !== 'string' || html.length > FOLIE_MAX_ZEICHEN) return null;
  const ganz = (n, min) => Number.isInteger(n) && n >= min;
  if (!ganz(index, 0) || !ganz(gesamt, 0) || !ganz(breite, 1) || !ganz(hoehe, 1)) return null;
  return { html, index, gesamt, breite, hoehe };
}

/**
 * Prüft eine Eingabe des Publikums-Fensters und gibt nur die bekannten Felder
 * weiter: Tasten mit Taste und Umschalt-Zuständen, das Rad mit seiner
 * senkrechten Bewegung, Klick und Beenden ohne Nutzlast.
 *
 * @param {unknown} eingabe
 * @returns {object|null}
 */
function pruefeEingabe(eingabe) {
  if (!eingabe || typeof eingabe !== 'object' || !EINGABE_ARTEN.has(eingabe.art)) return null;
  if (eingabe.art === 'taste') {
    if (typeof eingabe.key !== 'string' || eingabe.key.length > 32) return null;
    return {
      art: 'taste',
      key: eingabe.key,
      shiftKey: eingabe.shiftKey === true,
      ctrlKey: eingabe.ctrlKey === true,
      altKey: eingabe.altKey === true,
      metaKey: eingabe.metaKey === true,
    };
  }
  if (eingabe.art === 'rad') {
    const deltaY = Number(eingabe.deltaY);
    if (!Number.isFinite(deltaY)) return null;
    return { art: 'rad', deltaY, ctrlKey: eingabe.ctrlKey === true };
  }
  return { art: eingabe.art };
}

/**
 * Baut den Erzeuger der Publikums-Fenster.
 *
 * @param {object} deps
 * @param {Function} deps.BrowserWindow Electron-Klasse.
 * @param {object} deps.screen Electron-Bildschirm-Modul (getAllDisplays, getDisplayMatching).
 * @param {string} [deps.preloadPfad] Vorgabe: preload-publikum.js neben dieser Datei.
 * @param {string} [deps.seitenPfad] Vorgabe: ../renderer/publikum.html.
 * @param {string} [deps.iconPfad] Programm-Symbol.
 * @param {boolean} [deps.imTestlauf] E2E-Lauf: Fenster ohne Fokus zeigen.
 * @param {(owner: object) => string} [deps.titel] Fenster-Titel in der Sprache des Hauptfensters.
 * @returns {object}
 */
function createPraesentationFenster(deps) {
  const {
    BrowserWindow,
    screen,
    preloadPfad = path.join(__dirname, 'preload-publikum.js'),
    seitenPfad = path.join(__dirname, '..', 'renderer', 'publikum.html'),
    iconPfad,
    imTestlauf = false,
    titel = () => '',
  } = deps;

  // Hauptfenster-Kennung (webContents.id) -> { owner, publikum, folie, ownerZu }
  const jeHaupt = new Map();
  // Publikums-Kennung (webContents.id) -> Hauptfenster-Kennung
  const hauptVon = new Map();

  const lebt = (win) => !!win && !win.isDestroyed();

  function bildschirmFuer(owner) {
    if (!screen || typeof screen.getAllDisplays !== 'function') return null;
    const haupt =
      typeof screen.getDisplayMatching === 'function'
        ? screen.getDisplayMatching(owner.getBounds())
        : null;
    return waehleBildschirm(screen.getAllDisplays(), haupt);
  }

  function zeige(win, vollbild) {
    if (!lebt(win)) return;
    if (imTestlauf) win.showInactive();
    else win.show();
    if (vollbild) win.setFullScreen(true);
  }

  /**
   * Öffnet das Publikums-Fenster des Hauptfensters; ein bereits offenes wird
   * nur nach vorn geholt.
   *
   * @param {object} owner Hauptfenster.
   * @returns {{ok: boolean, vollbild?: boolean, schonOffen?: boolean}}
   */
  function oeffne(owner) {
    if (!lebt(owner)) return { ok: false };
    const ownerId = owner.webContents.id;
    // Ein Publikums-Fenster hat selbst kein Publikums-Fenster.
    if (hauptVon.has(ownerId)) return { ok: false };
    const eintrag = jeHaupt.get(ownerId);
    if (eintrag && lebt(eintrag.publikum)) {
      if (!imTestlauf) eintrag.publikum.focus();
      return { ok: true, vollbild: eintrag.vollbild, schonOffen: true };
    }
    const bildschirm = bildschirmFuer(owner);
    const win = new BrowserWindow(publikumOptionen({ preloadPfad, iconPfad, imTestlauf }));
    const publikumId = win.webContents.id;
    // Kein Menü: Ohne eigenes Anwendungs-Menü setzte Electron unter Windows
    // und Linux sein Vorgabe-Menü an jedes neue Fenster.
    win.removeMenu();
    // Die Kennung ist festgehalten: Nach 'closed' ist owner.webContents fort.
    const ownerZu = () => schliesseVon(ownerId);
    const neu = { owner, publikum: win, folie: null, vollbild: !!bildschirm, ownerZu };
    jeHaupt.set(ownerId, neu);
    hauptVon.set(publikumId, ownerId);
    owner.once('closed', ownerZu);

    if (bildschirm) {
      // Zweimal, aus demselben Grund wie in window-manager.js (Verzerrung bei
      // Bildschirmen mit unterschiedlicher Skalierung, 4T-000025).
      win.setBounds(bildschirm.bounds);
      win.setBounds(bildschirm.bounds);
    }
    const name = titel(owner);
    if (name) win.setTitle(name);
    // Der Titel der Seite überschreibt den Fenster-Titel nicht.
    win.on('page-title-updated', (e) => e.preventDefault());
    win.once('ready-to-show', () => zeige(win, !!bildschirm));

    // Navigation gesperrt: kein window.open, keine Navigation an Ort und Stelle.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());

    win.on('closed', () => {
      hauptVon.delete(publikumId);
      if (jeHaupt.get(ownerId) === neu) jeHaupt.delete(ownerId);
      if (lebt(owner)) {
        owner.removeListener('closed', ownerZu);
        owner.webContents.send('presentationWindow:closed');
      }
    });

    win.loadFile(seitenPfad);
    return { ok: true, vollbild: !!bildschirm, schonOffen: false };
  }

  /**
   * Schließt das Publikums-Fenster des Hauptfensters.
   *
   * @param {object} owner
   * @returns {boolean} true, wenn eines offen war.
   */
  function schliesse(owner) {
    if (!lebt(owner)) return false;
    return schliesseVon(owner.webContents.id);
  }

  function schliesseVon(ownerId) {
    const eintrag = jeHaupt.get(ownerId);
    if (!eintrag || !lebt(eintrag.publikum)) return false;
    eintrag.publikum.close();
    return true;
  }

  /**
   * Reicht eine Folie an das Publikums-Fenster des Hauptfensters und merkt
   * sie für ein Fenster, das noch lädt.
   *
   * @param {object} owner
   * @param {unknown} folie
   * @returns {boolean} true, wenn sie angenommen ist.
   */
  function sendeFolie(owner, folie) {
    const geprueft = pruefeFolie(folie);
    if (!geprueft || !owner || !owner.webContents) return false;
    const eintrag = jeHaupt.get(owner.webContents.id);
    if (!eintrag || !lebt(eintrag.publikum)) return false;
    eintrag.folie = geprueft;
    eintrag.publikum.webContents.send('audience:slide', geprueft);
    return true;
  }

  // Der Eintrag des Hauptfensters zu einem Absender aus dem Publikums-Fenster.
  function eintragVonPublikum(sender) {
    const ownerId = sender ? hauptVon.get(sender.id) : undefined;
    return ownerId == null ? null : jeHaupt.get(ownerId) || null;
  }

  /**
   * Die Seite des Publikums-Fensters ist bereit: Antwort ist die zuletzt
   * gelieferte Folie oder null.
   *
   * @param {object} sender webContents des Publikums-Fensters.
   */
  function bereit(sender) {
    const eintrag = eintragVonPublikum(sender);
    return eintrag ? eintrag.folie : null;
  }

  /**
   * Eine Eingabe des Publikums-Fensters geht geprüft an sein Hauptfenster.
   *
   * @param {object} sender webContents des Publikums-Fensters.
   * @param {unknown} eingabe
   * @returns {boolean}
   */
  function eingabe(sender, roh) {
    const eintrag = eintragVonPublikum(sender);
    const geprueft = pruefeEingabe(roh);
    if (!eintrag || !geprueft || !lebt(eintrag.owner)) return false;
    eintrag.owner.webContents.send('presentationWindow:input', geprueft);
    return true;
  }

  /** Das Publikums-Fenster eines Hauptfensters oder null (für Prüfungen). */
  function publikumVon(owner) {
    const eintrag = owner && owner.webContents ? jeHaupt.get(owner.webContents.id) : null;
    return eintrag && lebt(eintrag.publikum) ? eintrag.publikum : null;
  }

  return { oeffne, schliesse, sendeFolie, bereit, eingabe, publikumVon };
}

module.exports = {
  createPraesentationFenster,
  waehleBildschirm,
  publikumOptionen,
  pruefeFolie,
  pruefeEingabe,
  FOLIE_MAX_ZEICHEN,
};
