// IPC-Kanal-Gruppe Bereiche: Oeffnen und Schliessen einer Bereichs-App,
// Ordner-Listing sowie Anlegen und Loeschen innerhalb der Bereichs-Grenze,
// dazu die Anlage der mitgelieferten Demo-Area.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Kanal-Gruppe: area:*,
// demoArea:*.
//
// Eigener Zustand: keiner; Bereichs-Bindung und Applikations-Registry kommen
// als Deps.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { createDemoAreaAt } = require('../area/demo-area.js');
// 4T-000645 (Epic 3E-000127): Zustands-Vorlage der Beispiel-Sammlung.
const { loadDemoWorkspaces } = require('../area/demo-workspace.js');
const {
  isInsideArea,
  sortedAreaListing,
  sanitizeNewFileName,
  // 4T-001349 (Epic 3E-000170): Namens-Pruefung der Ordner-Anlage.
  sanitizeNewFolderName,
} = require('../area/area-path');
// 4T-001293 (Epic 3E-000224): Teil-Dateien bleiben aus der Ordner-Liste heraus.
const { isPartBasename } = require('../../shared/document-parts');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
// 4T-001452 (Epic 3E-000190): Aufloesung eines Verknuepfungs-Links ueber die
// Bereichs-Grenze.
const {
  loeseVerknuepfungsLink,
  beurteileVerknuepfungsLinks,
} = require('../area/area-link-resolve');

/**
 * Registriert die Bereichs- und Demo-Area-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {object} deps.shell Electron-Shell-Modul (Papierkorb).
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
 * @param {(rootPath: string) => Promise<object|null>} deps.resolveAreaStartPage Start-Seite aufloesen.
 * @param {(rootPath: string, relative: string|null) => Promise<object>} deps.writeAreaStartPage Festlegung schreiben.
 * @param {(rootPath: string, absolutePath: string) => string|null} deps.startPageRelative Pfad in die Speicherform bringen.
 * @param {(rootPath: string) => Promise<object|undefined>} deps.readAreaDatabaseConfig Datenbank-Sektion lesen.
 * @param {(rootPath: string, config: object) => Promise<object>} deps.writeAreaDatabaseConfig Datenbank-Sektion schreiben.
 * @param {(roh: object) => object} deps.normalisiereDatenbankKonfig Wirksamer Stand der Datenbank-Sektion.
 */
function registerAreasIpc(handle, deps) {
  const {
    dialog,
    // 4T-001351 (Epic 3E-000170): Papierkorb des Betriebssystems.
    shell,
    senderWindow,
    areaOfWindow,
    tForWindow,
    appRegistry,
    openAreaPath,
    closeAreaApp,
    isMarkdownPath,
    // 4T-000645 (Epic 3E-000127): Ablage der Arbeitsbereiche fuer die
    // Zustands-Vorlage der Beispiel-Sammlung.
    getStore,
    workspacesState,
    setWorkspacesState,
    workspacesChanged,
    // 4T-001364 (Epic 3E-000171): Start-Seite des Bereichs.
    resolveAreaStartPage,
    writeAreaStartPage,
    startPageRelative,
    // 4T-001452 (Epic 3E-000190): Verknuepfungen des Bereichs lesen und
    // seit 4T-001455 auch schreiben.
    readAreaLinks,
    writeAreaLinks,
    // 4T-001758 (Epic 3E-000253): Anzeige-Einstellung der Datenbank im Bereich.
    readAreaDatabaseConfig,
    writeAreaDatabaseConfig,
    normalisiereDatenbankKonfig,
  } = deps;

  // 4T-000645 (Epic 3E-000127): Die Beispiel-Sammlung bringt ihren Fenster- und
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

  // --- 4T-000322 (Epic 3E-000058): Bereiche ---------------------------------------
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

  // --- 4T-000632 (Epic 3E-000102): Demo-Area --------------------------------------
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

  // --- 4T-000327 (Epic 3E-000059): Bereichs-Panel ---------------------------------
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
      // 4T-001293 (Epic 3E-000224, Entscheidung des Product Owners vom
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

  // 4T-000328: "Neue Datei in diesem Ordner" — legt eine leere Markdown-Datei
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

  // 4T-001349 (Epic 3E-000170): "Neuer Unterordner in diesem Ordner" — legt
  // einen Ordner im (bereichs-internen) Ordner an. Aufbau und Prueffolge sind
  // die des Datei-Wegs darueber: erst der Name, dann der Ziel-Ordner, dann das
  // gebildete Ziel; die Bereichs-Grenze wird zweimal geprueft, weil ein Name
  // aus dem Renderer den Ordner sonst ueber Trenner-Zeichen verlassen koennte.
  // mkdir OHNE recursive: Ein bestehender Ordner meldet EEXIST, statt still
  // als Erfolg durchzugehen, und ein fehlender Zwischen-Ordner entsteht nicht
  // nebenbei mit.
  handle('area:createFolder', async (event, params) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const dirPath = params && params.dirPath;
    const folderName = sanitizeNewFolderName(params && params.name);
    if (!folderName) return { ok: false, error: 'invalid name' };
    if (typeof dirPath !== 'string' || !dirPath || !isInsideArea(area.rootPath, dirPath)) {
      return { ok: false, error: 'outside-area' };
    }
    const target = path.join(dirPath, folderName);
    if (!isInsideArea(area.rootPath, target)) return { ok: false, error: 'outside-area' };
    try {
      await fs.mkdir(target);
      return { ok: true, path: target };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-001351 (Epic 3E-000170): "Loeschen" — verschiebt eine Datei des Bereichs
  // in den Papierkorb des Betriebssystems.
  //
  // Entscheidung E2 des Epics (Product Owner, 2026-09-01): Papierkorb statt
  // endgueltigem Loeschen, und **kein stiller Rueckfall**. Das ist hier keine
  // Verzweigung, sondern die Bauart: `shell.trashItem` ist der EINZIGE
  // Loesch-Aufruf dieses Handlers. Es gibt keinen `fs.unlink`-Zweig, auf den
  // ein Fehlschlag ausweichen koennte — ein abgelehntes Versprechen wird
  // gemeldet und sonst nichts. Wer diesen Handler spaeter erweitert, muss das
  // wissen: Ein Rueckfall waere genau die Falle, die E2 vermeidet.
  //
  // `shell.trashItem` loest nach der Electron-Schnittstelle (33.2.0) bei JEDEM
  // Fehler ab und unterscheidet den fehlenden Papierkorb nicht vom uebrigen
  // Fehlschlag. Beide Faelle sind fuer den Anwender derselbe: Die Datei liegt
  // noch da, und er erfaehrt es.
  //
  // Die Rueckfrage stellt der Renderer VOR diesem Aufruf ueber einen eigenen
  // Kanal, weil zwischen Zustimmung und Loeschung noch die offenen Reiter
  // geschlossen werden muessen; eine Rueckfrage in diesem Handler laege dafuer
  // zu spaet.
  handle('area:trashFile', async (event, filePath) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    if (typeof filePath !== 'string' || !filePath || !isInsideArea(area.rootPath, filePath)) {
      return { ok: false, error: 'outside-area' };
    }
    if (!isMarkdownPath(filePath)) return { ok: false, error: 'not a document' };
    try {
      await shell.trashItem(path.resolve(filePath));
      return { ok: true, path: filePath };
    } catch (err) {
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

  // --- 4T-001364 (Epic 3E-000171): Start-Seite des Bereichs -----------------------

  // Aktuelle Festlegung des Bereichs melden. { hasArea: false } ohne Bereich;
  // sonst { hasArea: true, path } mit dem absoluten Pfad bzw. null.
  handle('area:getStartPage', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { hasArea: false };
    const resolved = await resolveAreaStartPage(area.rootPath);
    return { hasArea: true, path: resolved ? resolved.path : null, missing: !!resolved?.missing };
  });

  // Start-Seite setzen (absoluter Pfad einer Datei im Bereich) oder entfernen
  // (filePath = null). Gespeichert wird ein WURZEL-RELATIVER Pfad, damit die
  // Festlegung den Umzug des Bereichs ueberlebt (4T-001363, Invariante I2).
  //
  // Muster history:setAreaDefault: Die Bereichsdatei entsteht erst beim ersten
  // tatsaechlichen Setzen, und eine defekte Bereichsdatei wird nie
  // ueberschrieben.
  handle('area:setStartPage', async (event, filePath) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    let relative = null;
    if (filePath !== null && filePath !== undefined) {
      if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'invalid path' };
      if (!isMarkdownPath(filePath)) return { ok: false, error: 'not a document' };
      relative = startPageRelative(area.rootPath, filePath);
      if (relative === null) return { ok: false, error: 'outside area' };
    }
    try {
      return await writeAreaStartPage(area.rootPath, relative);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // --- 4T-001758 (Epic 3E-000253): Datenbank-Anzeige des Bereichs ------------------

  // Stand der Anzeige-Einstellung melden. { hasArea: false } ohne Bereich;
  // sonst { hasArea: true, overviewOnOpen }. Die Bereichs-ART steht bewusst
  // nicht hier, sondern kommt aus dem Katalog-Kanal: Sie haengt am Steckbrief
  // im Bestand und nicht an dieser Sektion (Entscheidung des Product Owners
  // vom 2026-09-15).
  handle('area:getDatabaseConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { hasArea: false };
    const roh = await readAreaDatabaseConfig(area.rootPath);
    return { hasArea: true, ...normalisiereDatenbankKonfig(roh) };
  });

  // Anzeige-Einstellung setzen. Muster area:setStartPage: Die Bereichsdatei
  // entsteht erst beim ersten tatsaechlichen Setzen, und eine defekte
  // Bereichsdatei wird nie ueberschrieben.
  handle('area:setDatabaseConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    try {
      return await writeAreaDatabaseConfig(area.rootPath, config);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-001457 (Epic 3E-000190): Alle Verknuepfungs-Kanaele haengen am
  // Aus-Zustand der Erweiterung. Die AUTORITATIVE Stelle ist hier und nicht im
  // Anzeige-Prozess: Wer den Kanal fragt, bekommt im Aus-Zustand nichts — und
  // damit loest kein Klick auf, markiert kein Linter und prueft nichts beim
  // Oeffnen. Die eingetragenen Verknuepfungen bleiben unberuehrt; abgeschaltet
  // wird die Wirkung, nicht die Angabe (Entscheidung E7).
  const verknuepfungenAktiv = () =>
    isExtensionEnabled('area-links', getStore() ? getStore().get('extensions.disabled') : null);

  // --- 4T-001452 (Epic 3E-000190): Verknuepfungs-Links aufloesen ---------------

  // Kuerzel und Ziel eines Verknuepfungs-Links auf eine Datei im verknuepften
  // Bereich abbilden. Der Anker ist bereits abgetrennt; der Aufrufer setzt ihn
  // nach dem Oeffnen selbst.
  //
  // Bewusst ein EIGENER Kanal neben file:resolveLink und nicht dessen Umbau:
  // Jener loest gegen den Ordner der Basis-Datei auf (files.js), was fuer ein
  // Ziel in einem fremden Bereich die falsche Basis waere.
  handle('areaLink:resolve', async (event, params) => {
    if (!verknuepfungenAktiv()) return { ok: false, grund: 'abgeschaltet' };
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, grund: 'kein-bereich' };
    const prefix = params && params.prefix;
    const target = params && params.target;
    if (typeof prefix !== 'string' || typeof target !== 'string') {
      return { ok: false, grund: 'ungueltiges-ziel' };
    }
    try {
      const links = await readAreaLinks(area.rootPath);
      return await loeseVerknuepfungsLink({ links, prefix, target });
    } catch (err) {
      return { ok: false, grund: 'fehler', error: err && err.message ? err.message : String(err) };
    }
  });
  // 4T-001454 (Epic 3E-000190): Verknuepfungs-Links fuer den Linter beurteilen.
  // Ein Roundtrip je Lint-Lauf statt einer Anfrage je Link — dasselbe Muster
  // wie resolveWikiTargets fuer die lokalen Ziele.
  handle('areaLink:beurteile', async (event, anfragen) => {
    // Im Aus-Zustand faellt kein Urteil: Der Linter unterdrueckt seine Regel
    // dann, statt Links zu markieren, die niemand aufloesen soll.
    if (!verknuepfungenAktiv()) return { status: 'abgeschaltet', urteile: [] };
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { status: 'kein-bereich', urteile: [] };
    if (!Array.isArray(anfragen) || anfragen.length === 0) {
      return { status: 'ready', urteile: [] };
    }
    try {
      const links = await readAreaLinks(area.rootPath);
      return { status: 'ready', urteile: await beurteileVerknuepfungsLinks(links, anfragen) };
    } catch {
      // Wie bei resolveWikiTargets: Der Linter unterdrueckt die Regel in
      // diesem Lauf, statt falsche Marken zu setzen.
      return { status: 'unavailable', urteile: [] };
    }
  });
  // 4T-001455 (Epic 3E-000190): Verknuepfungs-Stand fuer die Einstellungs-
  // Oberflaeche. Muster templates:getConfig — hasArea und areaName steuern die
  // Bereichs-Gruppe der Oberflaeche, die Liste kommt normalisiert.
  handle('areaLink:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: true, hasArea: false, areaName: null, links: [] };
    let links;
    try {
      links = await readAreaLinks(area.rootPath);
    } catch {
      links = []; // defekte Bereichsdatei wirkt wie keine Verknuepfung
    }
    return { ok: true, hasArea: true, areaName: area.name, links };
  });

  // 4T-001455: Verknuepfungen schreiben. Muster templates:setAreaConfig — eine
  // defekte Bereichsdatei wird nie ueberschrieben, der Fehler kommt als Wert
  // zurueck und die Oberflaeche meldet ihn sichtbar.
  handle('areaLink:setConfig', async (event, links) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    try {
      return await writeAreaLinks(area.rootPath, links);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

module.exports = { registerAreasIpc };
