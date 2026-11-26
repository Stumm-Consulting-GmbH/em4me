// 4T-002647 (Epic 3E-000416): Die Bindung eines Bereichs, Buchs oder Regals
// als Freigabe im Buch (Lösungsansatz der Aufgabe, Punkt 4; Konzept-Stufe
// 4T-002645, T5: «Bereich, Buch, Regal öffnen … Bereich lesen und schreiben,
// wie heute»).
//
// **Buch und Regal sind Bereiche.** Seit 4T-000871 und 4T-000873 bindet ein
// Buch oder Regal seine Applikation zugleich als Bereich an den Buch- bzw.
// Regal-Ordner (`book-apps.js`, `shelf-apps.js`: `appRegistry.setArea`); eine
// Applikation mit fremdem Bereich bekommt kein Buch und kein Regal. Die
// Freigabe aller drei ist deshalb dieselbe: die Bereichs-Wurzel der
// Applikation, Art `area`, Umfang lesen, schreiben und anlegen. Anlegen gehört
// dazu, weil das Programm im Bereich heute Dateien und Ordner neu anlegt;
// ohne es fiele das mit der Verwendung im Endpunkt weg.
//
// **Bindung je Applikation, Buch je Fenster.** Alle Fenster einer Applikation
// teilen ihren Bereich (`app-registry.js`). Die Bindungs-Stellen rufen
// `bindApp` mit allen Fenstern der Applikation; die Fenster-Verwaltung ruft
// `bindWindow` für jedes neue Fenster einer Applikation mit Bereich und
// `windowClosed` an seinem Ende.
//
// **Kein veralteter Eintrag durch die Asynchronität.** `checkRoot` ist
// asynchron, Binden, Lösen und Schließen sind es nicht. Jedes Fenster hat einen
// Zähler, der bei jedem Binden auf eine neue Wurzel, jedem Lösen und dem
// Schließen weiterzählt; ein Ergebnis von `checkRoot` wird nur eingetragen,
// wenn sein Zähler noch gilt. Ein geschlossenes Fenster bleibt als solches
// vermerkt, damit ein später eintreffender Aufruf keinen Eintrag mehr erzeugt;
// der Vermerk ist eine Zahl je in diesem Prozess geöffnetem Fenster.
//
// **Das Verhalten des Programms bleibt unverändert** (AK5 der Aufgabe). Nichts
// hier wirft in den Bindungs-Ablauf, nichts wird abgewartet, nichts erreicht
// den Anwender. Weist `checkRoot` eine Wurzel ab (etwa einen geschützten Ordner
// als Bereich), entsteht kein Eintrag, und eine Warnung mit Kontext geht ins
// Protokoll (Entwicklungsrichtlinien, Kapitel 4: abgefederte Degradation).
// Das Abweisen der Bindung selbst kommt mit der nächsten Aufgabe.
//
// Electron-frei; eigener Zustand nur in der Instanz.
'use strict';

const path = require('node:path');
const { isSamePath } = require('../area/area-path');
const { checkRoot: defaultCheckRoot } = require('./path-check');
const { asListSource, createProgramList, resolveList } = require('./protected-folders');

const AREA_SCOPE = Object.freeze(['read', 'write', 'create']);
// Datei des Einstellungs-Speichers: electron-store legt sie ohne `name`- und
// `cwd`-Angabe als `config.json` im Nutzerdaten-Ordner an
// (`node_modules/conf/dist/source/index.js`, `this.path`; `settings-store.js`
// übergibt nur `defaults`).
const SETTINGS_FILE_NAME = 'config.json';

/**
 * Die Orte der geschützten Ordner des Programms aus den Angaben des Starts.
 *
 * @param {object} start
 * @param {string} start.execPath `process.execPath`.
 * @param {string} start.userDataFolder `app.getPath('userData')`, nach Umlenkung.
 * @param {{portabel: boolean, datenOrdner: string|null}} start.portableMode
 *   Ergebnis von `ermittlePortablenBetrieb`.
 * @param {string} [start.portableProgramFile] `PORTABLE_EXECUTABLE_FILE`, vom
 *   Start-Rahmen der portablen Fassung gesetzt (Vorlage
 *   `app-builder-lib/templates/nsis/portable.nsi`); zählt nur im portablen
 *   Betrieb und nur als absoluter Pfad.
 * @returns {object} Orte für `createProgramList`.
 */
function programPlaces({ execPath, userDataFolder, portableMode, portableProgramFile }) {
  const portable = Boolean(portableMode && portableMode.portabel);
  return {
    programFolder: path.dirname(execPath),
    userDataFolder,
    // Wie `src/main/ipc/extensions.js` und `src/main/ipc/locales.js` sie bilden.
    addonFolder: path.join(userDataFolder, 'extensions'),
    localeFolder: path.join(userDataFolder, 'locales'),
    settingsFile: path.join(userDataFolder, SETTINGS_FILE_NAME),
    portableDataFolder: portable ? portableMode.datenOrdner : null,
    portableProgramFile:
      portable && typeof portableProgramFile === 'string' && path.isAbsolute(portableProgramFile)
        ? portableProgramFile
        : null,
  };
}

/**
 * Die aufgelöste Liste der geschützten Ordner des Programms, ermittelt beim
 * Start und nach einem Scheitern erneut über die Quelle `createListSource`
 * (4T-002922). Asynchron auch für die Prüfung der Angaben: Ein Fehler wird zur
 * Ablehnung des Versprechens und erreicht so nie den Start des Programms.
 *
 * @param {object} start Angaben wie bei `programPlaces`.
 * @param {{fileSystem?: object}} [options]
 * @returns {Promise<object>} Aufgelöste Liste (`resolveList`).
 */
async function resolveProgramList(start, options) {
  return resolveList(createProgramList(programPlaces(start)), options);
}

/**
 * Baut den Anschluss der Bindungen an das Buch der Freigaben.
 *
 * @param {object} deps
 * @param {object} deps.book Buch aus `createGrantBook`.
 * @param {Function|Promise<object>|object} deps.protectedFolders Quelle der
 *   aufgelösten Liste aus `createListSource` (je Bindung gefragt), die Liste
 *   aus `resolveList` oder das Versprechen darauf.
 * @param {Function} [deps.checkRoot] Prüfung der Wurzel (Naht für Prüffälle).
 * @param {(...args: unknown[]) => void} [deps.warn] Protokoll-Weg für Warnungen.
 * @returns {{book: object, bindApp: Function, bindWindow: Function,
 *   unbindWindow: Function, windowClosed: Function}}
 */
function createBindingGrants(deps) {
  const { book, protectedFolders, checkRoot = defaultCheckRoot, warn = console.warn } = deps || {};
  if (!book || typeof book.grant !== 'function' || typeof book.end !== 'function') {
    throw new TypeError('Binding grants: book from createGrantBook required.');
  }
  if (protectedFolders == null) throw new TypeError('Binding grants: protectedFolders required.');
  // Ein Fehlschlag der Auflösung wird erst an der Bindung gemeldet; die Quelle
  // wird je Bindung gefragt und ermittelt nach einem Scheitern neu (4T-002922).
  const listSource = asListSource(protectedFolders);

  // windowId -> { generation, root, closed, pending }
  const states = new Map();

  function stateOf(windowId) {
    let s = states.get(windowId);
    if (!s) {
      s = { generation: 0, root: null, closed: false, pending: Promise.resolve() };
      states.set(windowId, s);
    }
    return s;
  }

  async function settle(windowId, s, generation, rootPath) {
    try {
      const list = await listSource();
      const result = await checkRoot(rootPath, { scope: AREA_SCOPE, protectedFolders: list });
      if (s.closed || s.generation !== generation) return;
      if (!result.ok) {
        warn(
          'Freigabe der Bindung nicht eingetragen:',
          rootPath,
          `Fenster ${windowId}`,
          result.code,
        );
        return;
      }
      book.grant(windowId, {
        root: result.root,
        chosenRoot: result.chosenRoot,
        kind: 'area',
        scope: AREA_SCOPE,
        origin: 'binding',
        end: 'binding',
      });
    } catch (err) {
      warn('Freigabe der Bindung fehlgeschlagen:', rootPath, `Fenster ${windowId}`, err);
    }
  }

  /**
   * Trägt die Bindung eines Fensters an `rootPath` ein. Dieselbe Wurzel noch
   * einmal ändert nichts; eine andere ersetzt die bisherige Bindung.
   *
   * @returns {Promise<void>} Erfüllt, wenn der Eintrag steht oder verworfen
   *   ist; lehnt nie ab.
   */
  function bindWindow(windowId, rootPath) {
    try {
      const s = stateOf(windowId);
      if (s.closed) return Promise.resolve();
      if (s.root !== null && isSamePath(s.root, rootPath)) return s.pending;
      s.generation += 1;
      s.root = path.resolve(rootPath);
      book.end(windowId, { end: 'binding' });
      s.pending = settle(windowId, s, s.generation, rootPath);
      return s.pending;
    } catch (err) {
      warn('Freigabe der Bindung fehlgeschlagen:', rootPath, `Fenster ${windowId}`, err);
      return Promise.resolve();
    }
  }

  /**
   * Trägt die Bindung einer Applikation für alle ihre Fenster ein.
   *
   * @param {number[]} windowIds Fenster der Applikation (`appRegistry.windowsOf`).
   * @param {string} rootPath Bereichs-Wurzel der Applikation.
   * @returns {Promise<void>} lehnt nie ab.
   */
  function bindApp(windowIds, rootPath) {
    const ids = Array.isArray(windowIds) ? windowIds : [];
    return Promise.all(ids.map((id) => bindWindow(id, rootPath))).then(() => {});
  }

  /** Löst die Bindung eines Fensters; ein laufendes Eintragen verfällt. */
  function unbindWindow(windowId) {
    try {
      const s = stateOf(windowId);
      s.generation += 1;
      s.root = null;
      book.end(windowId, { end: 'binding' });
    } catch (err) {
      warn('Freigabe der Bindung nicht ausgetragen:', `Fenster ${windowId}`, err);
    }
  }

  /** Das Fenster ist geschlossen: alle seine Einträge enden, nichts kommt nach. */
  function windowClosed(windowId) {
    try {
      const s = stateOf(windowId);
      s.closed = true;
      s.generation += 1;
      s.root = null;
      book.endWindow(windowId);
    } catch (err) {
      warn('Freigaben des Fensters nicht beendet:', `Fenster ${windowId}`, err);
    }
  }

  /**
   * Erfüllt, wenn jedes laufende Eintragen fertig oder verworfen ist. Die
   * Bindungs-Stellen warten nie darauf; es ist der Messpunkt der Prüffälle und
   * der nächsten Aufgabe, die vor einer Prüfung den fertigen Stand braucht.
   */
  function settled() {
    return Promise.all([...states.values()].map((s) => s.pending)).then(() => {});
  }

  return { book, bindApp, bindWindow, unbindWindow, windowClosed, settled };
}

module.exports = { AREA_SCOPE, programPlaces, resolveProgramList, createBindingGrants };
