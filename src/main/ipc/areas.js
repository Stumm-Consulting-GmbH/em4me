// IPC-Kanal-Gruppe Bereiche: Oeffnen und Schliessen einer Bereichs-App,
// Ordner-Listing und Datei-Anlage innerhalb der Bereichs-Grenze, dazu die
// Anlage der mitgelieferten Demo-Area.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: area:*,
// demoArea:*.
//
// Eigener Zustand: keiner; Bereichs-Bindung und Applikations-Registry kommen
// als Deps.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { createDemoAreaAt } = require('../area/demo-area.js');
// 4T-0645 (Epic 3E-0127): Zustands-Vorlage der Beispiel-Sammlung.
const { loadDemoWorkspaces } = require('../area/demo-workspace.js');
const { isInsideArea, sortedAreaListing, sanitizeNewFileName } = require('../area/area-path');
// 4T-1293 (Epic 3E-0224): Teil-Dateien bleiben aus der Ordner-Liste heraus.
const { isPartBasename } = require('../../shared/document-parts');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');

/**
 * Registriert die Bereichs- und Demo-Area-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {object} deps.appRegistry Registry der logischen Applikationen.
 * @param {Function} deps.openAreaPath Bereich unter einem Wurzelpfad oeffnen.
 * @param {(appId: number) => Promise<object>} deps.closeAreaApp Bereichs-App schliessen.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (erst nach loadStore da).
 * @param {Array} deps.workspacesState Ablage der benannten Arbeitsbereiche — das
 *   ARRAY des In-Memory-Stands, kein Getter (Verdrahtung reicht `...areaApps`
 *   durch). setWorkspacesState mutiert genau dieses Array in-place.
 * @param {(list: Array) => void} deps.setWorkspacesState Ablage der Arbeitsbereiche ersetzen.
 * @param {() => void} deps.workspacesChanged Menue und Fenster ueber die Aenderung melden.
 */
function registerAreasIpc(handle, deps) {
  const {
    dialog,
    senderWindow,
    areaOfWindow,
    tForWindow,
    appRegistry,
    openAreaPath,
    closeAreaApp,
    isMarkdownPath,
    // 4T-0645 (Epic 3E-0127): Ablage der Arbeitsbereiche fuer die
    // Zustands-Vorlage der Beispiel-Sammlung.
    getStore,
    workspacesState,
    setWorkspacesState,
    workspacesChanged,
  } = deps;

  // 4T-0645 (Epic 3E-0127): Die Beispiel-Sammlung bringt ihren Fenster- und
  // Gruppen-Zustand als Vorlage mit; hier wird sie nach dem Kopieren zu
  // benannten Arbeitsbereichen. Die reine Bau-Logik liegt in
  // area/demo-workspace.js, dieses Stueck traegt sie in die Ablage ein.
  //
  // Drei Regeln, alle aus dem Bestand abgeleitet:
  //   - Erweiterung 'workspaces' aus  -> nichts eintragen (Muster area-apps.js).
  //     Zustand fuer eine abgeschaltete Funktion anzulegen waere ein stiller
  //     Nebeneffekt, den der Anwender nicht bestellt hat.
  //   - Kennungen kollisionsfrei gegen den vorhandenen Stand vergeben; ein
  //     doppelter Eintrag verliert bei der Normalisierung stillschweigend.
  //   - In-Memory-Stand UND Store schreiben, danach die Oberflaeche melden
  //     (Muster startup.js / window-manager.js).
  //
  // Ein Fehlschlag bleibt folgenlos fuer die Anlage selbst: Die Dateien sind
  // dann kopiert, nur der Arbeitsbereich fehlt. Das ist dieselbe Degradation
  // wie bei einer defekten Vorlage und bewusst kein Grund, dem Anwender den
  // fertigen Bestand zu verweigern.

  // Vertrag der Ablage, EINMAL geprueft und mit lautem Bruch statt stiller
  // Weiche. Anlass ist der Datenverlust vom 2026-08-18: Eine defensive
  // `typeof workspacesState === 'function' ? … : []`-Weiche lief immer in den
  // leeren Zweig, weil die Verdrahtung das ARRAY durchreicht und keinen
  // Getter. Der Bestand des Anwenders wurde dadurch ersetzt statt ergaenzt.
  // Die Weiche hat den Irrtum nicht abgefangen, sondern verborgen: Aus einem
  // Absturz, der sofort aufgefallen waere, wurde ein stiller Datenverlust.
  // Deshalb hier keine Rueckfall-Werte ueber eine fremde Schnittstelle.
  function pruefeAblageVertrag() {
    if (!Array.isArray(workspacesState)) {
      throw new TypeError(
        'deps.workspacesState muss das Array des In-Memory-Stands sein (Verdrahtung: ...areaApps)',
      );
    }
    if (typeof setWorkspacesState !== 'function') {
      throw new TypeError('deps.setWorkspacesState muss eine Funktion sein');
    }
    if (typeof workspacesChanged !== 'function') {
      throw new TypeError('deps.workspacesChanged muss eine Funktion sein');
    }
  }

  async function materialisiereDemoArbeitsbereiche(targetDir) {
    const store = typeof getStore === 'function' ? getStore() : null;
    if (!store) return;
    if (!isExtensionEnabled('workspaces', store.get('extensions.disabled'))) return;
    try {
      pruefeAblageVertrag();
      // Die Kopie ist Pflicht: setWorkspacesState leert dasselbe Array
      // in-place (`workspacesState.length = 0`), eine Referenz darauf waere
      // im Moment des Schreibens bereits leer.
      const vorhanden = [...workspacesState];
      const belegt = new Set(vorhanden.map((ws) => ws && ws.id));
      let n = 0;
      const naechsteId = () => {
        let id;
        do {
          n += 1;
          id = `demo-${n}`;
        } while (belegt.has(id));
        belegt.add(id);
        return id;
      };
      const neue = await loadDemoWorkspaces(targetDir, naechsteId);
      if (neue.length === 0) return;
      setWorkspacesState([...vorhanden, ...neue]);
      // Nach setWorkspacesState traegt dasselbe Array den neuen Gesamtstand.
      store.set('workspaces', workspacesState);
      workspacesChanged();
    } catch (err) {
      console.warn(
        '[demo-area] Arbeitsbereiche der Vorlage nicht angelegt:',
        err && err.message ? err.message : err,
      );
    }
  }

  // --- 4T-0322 (Epic 3E-0058): Bereiche ---------------------------------------
  // "Bereich oeffnen..." mit Ordner-Dialog.
  handle('area:open', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'area.openDialogTitle'),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return openAreaPath(result.filePaths[0], owner);
  });

  // --- 4T-0632 (Epic 3E-0102): Demo-Area --------------------------------------
  // "Demo-Area erstellen..." mit Ordner-Dialog: mitgelieferte Demo-Inhalte
  // in einen LEEREN Zielordner kopieren und direkt als Bereich oeffnen.
  // Nicht-leerer Zielordner: lokalisierter Hinweis, es wird niemals
  // ueberschrieben (Epic-Abgrenzung).
  handle('demoArea:create', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'demoArea.dialogTitle'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const targetDir = result.filePaths[0];
    const created = await createDemoAreaAt(targetDir);
    if (!created.ok) {
      if (created.error === 'not-empty') {
        await dialog.showMessageBox(owner || undefined, {
          type: 'warning',
          title: tForWindow(owner, 'demoArea.notEmptyTitle'),
          message: tForWindow(owner, 'demoArea.notEmptyMessage'),
          detail: targetDir,
          buttons: ['OK'],
        });
      }
      return created;
    }
    await materialisiereDemoArbeitsbereiche(targetDir);
    return openAreaPath(targetDir, owner);
  });

  // Direkter Pfad-Einstieg ohne Dialog (Tests; Muster area:openPath).
  handle('demoArea:createAt', async (event, targetDir) => {
    if (typeof targetDir !== 'string' || !targetDir) return { ok: false, error: 'invalid path' };
    const created = await createDemoAreaAt(targetDir);
    if (!created.ok) return created;
    // Dieselbe Behandlung wie im Dialog-Weg: Sonst pruefen die Tests einen
    // Ablauf, den der Anwender so nicht erlebt.
    await materialisiereDemoArbeitsbereiche(targetDir);
    return openAreaPath(targetDir, senderWindow(event));
  });

  // Direkter Pfad-Einstieg (Zuletzt-geoeffnete-Bereiche, Tests). Prueft die
  // Existenz des Ordners, sonst identische Regeln wie der Dialog-Weg.
  handle('area:openPath', async (event, rootPath) => {
    if (typeof rootPath !== 'string' || !rootPath) return { ok: false, error: 'invalid path' };
    try {
      const stat = await fs.stat(rootPath);
      if (!stat.isDirectory()) return { ok: false, error: 'not a directory' };
    } catch {
      return { ok: false, error: 'not found' };
    }
    return openAreaPath(rootPath, senderWindow(event));
  });

  // --- 4T-0327 (Epic 3E-0059): Bereichs-Panel ---------------------------------
  // Listet Unterordner und Markdown-Dateien EINES Ordners innerhalb des
  // Bereichs der aufrufenden App (lazy pro aufgeklapptem Ordner). Lese-
  // Fehler einzelner Ordner liefern leere Listen statt eines Abbruchs
  // (Entwicklungsrichtlinien: Fehler pro Knoten tolerieren).
  handle('area:listDir', async (event, dirPath) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    if (typeof dirPath !== 'string' || !dirPath || !isInsideArea(area.rootPath, dirPath)) {
      return { ok: false, error: 'outside-area' };
    }
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const listing = sortedAreaListing(
        entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })),
        isMarkdownPath,
      );
      // 4T-1293 (Epic 3E-0224, Entscheidung des Product Owners vom
      // 2026-08-31): Teil-Dateien erscheinen nicht in der Ordner-Liste. Sie
      // sind keine eigenen Dokumente, und ein Klick auf einen Teil oeffnet
      // ohnehin dasselbe Gesamt-Dokument — der Eintrag waere redundant und
      // widerspraeche an der sichtbarsten Stelle der Zusage, dass die
      // Anwendung die Teile als EIN Dokument fuehrt. Die Spur der Teilung
      // bleibt, wo F6 sie vorsieht (Zuordnungs-Zeile, Eigenschaften-Panel,
      // Historie), und im Datei-Verwalter des Betriebssystems ohnehin.
      const dateien = listing.files.filter(
        (name) => !isPartBasename(name.replace(/\.[^./]+$/, '')),
      );
      return { ok: true, dirs: listing.dirs, files: dateien };
    } catch (err) {
      console.warn('Bereichs-Listing fehlgeschlagen:', dirPath, err && err.message);
      return { ok: true, dirs: [], files: [] };
    }
  });

  // 4T-0328: "Neue Datei in diesem Ordner" — legt eine leere Markdown-Datei
  // im (bereichs-internen) Ordner an. Namens-Validierung ueber
  // sanitizeNewFileName; bestehende Dateien werden nicht ueberschrieben.
  handle('area:createFile', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const dirPath = params && params.dirPath;
    const fileName = sanitizeNewFileName(params && params.name);
    if (!fileName) return { ok: false, error: 'invalid name' };
    if (typeof dirPath !== 'string' || !dirPath || !isInsideArea(area.rootPath, dirPath)) {
      return { ok: false, error: 'outside-area' };
    }
    const target = path.join(dirPath, fileName);
    if (!isInsideArea(area.rootPath, target)) return { ok: false, error: 'outside-area' };
    try {
      // wx: exklusives Anlegen — existierende Datei bleibt unangetastet.
      await fs.writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
      return { ok: true, path: target };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // "Bereich schliessen": alle Fenster der Bereichs-App des Absenders.
  handle('area:close', async (event) => {
    const owner = senderWindow(event);
    const appId = owner && !owner.isDestroyed() ? appRegistry.appOf(owner.webContents.id) : null;
    if (appId == null || !appRegistry.getArea(appId)) return { ok: false };
    return closeAreaApp(appId);
  });
}

module.exports = { registerAreasIpc };
