// 4T-002355 (Epic 3E-000184): Der Workflow-Ordner je Fenster — Auflösung,
// Liste, Beobachtung und Meldung an die Fenster.
//
// **Wirksamer Ordner je Fenster.** Er hängt am Bereich des Fensters (Sektion
// `workflows` seiner Bereichsdatei) und am anwendungsweiten Wert; Auflösung und
// Liste in `workflow-folder.js`. Bei abgeschalteter Erweiterung «Workflows»
// liefert die Liste nichts (Registry-Eintrag mit 4T-002352; bis dahin gilt sie
// nach `isExtensionEnabled` als eingeschaltet).
//
// **Ein Beobachter je Ordner, die Fenster als Besitzer** (Muster des
// Datei-Beobachters `documents/file-watching.js` und des Bereichs-Beobachters
// `area/area-apps.js`). Ein Fenster meldet sich mit seiner ersten Listen-Abfrage
// an; jede Struktur- oder Inhalts-Änderung im Ordner (eine Datei bekommt oder
// verliert das Kennzeichen, ein Name ändert sich) geht gebündelt als
// `workflow:folderChanged` an seine Fenster, die die Liste daraufhin neu
// abfragen. Ändern sich die anwendungsweite Einstellung, der Erweiterungs-Schalter
// oder die Bereichsdatei, wird der Ordner jedes angemeldeten Fensters neu
// aufgelöst und jedes Fenster benachrichtigt. Ein geschlossenes Fenster meldet
// sich mit dem Ende seines Anzeige-Prozesses ab; ein Beobachter ohne Besitzer
// wird geschlossen.
//
// Die Meldung trägt keine Liste: Der Empfänger fragt nach, so bleibt die eine
// Lese-Stelle die Abfrage (Muster `area:changed`).
//
// **Workflows verknüpfter Bereiche** (4T-002426, Epic 3E-000366, Entscheidung 2h):
// Die Liste trägt zusätzlich `linked`, je zugestimmter Quelle Kürzel, Name,
// Ordner, Baum und flache Liste (`workflow-linked-sources.js`). Die eigenen
// `items` und `workflows` bleiben unverändert, weil der Aufruf eines Workflows
// per Name (`workflow "Name"`) und die Prüfung «mehrdeutig» allein im eigenen
// Bereich auflösen; ein zugestimmter fremder Bereich ändert so nie, was ein
// eigener Workflow aufruft. Die Ordner der Quellen werden mit beobachtet, damit
// Menü und Palette einer Änderung dort folgen; ein Fenster besitzt damit mehrere
// Ordner.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const chokidar = require('chokidar');
const netzPfade = require('../documents/network-paths');
const selbstSchreib = require('../documents/self-write');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { readAreaSettingsRaw } = require('../area/area-migration');
const { isIgnoredDirName } = require('../index/scan');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { pathCompareKey } = require('../../shared/platform.js');
const { createLinkedWorkflowSources } = require('./workflow-linked-sources.js');
const {
  normalizeWorkflowsConfig,
  readWorkflowFolder,
  resolveWorkflowsFolder,
} = require('./workflow-folder.js');

const EXTENSION_ID = 'workflows';
const GLOBAL_KEY = 'workflows.folder';
const CHANGED_CHANNEL = 'workflow:folderChanged';
const BUENDEL_MS = 300;

// Ausgelassen wird wie beim Lesen der Liste: `node_modules` und Punkt-Einträge
// unterhalb des Ordners, nach der einen Ordner-Regel der Anwendung.
function ignorierRegel(folder) {
  return (p) => {
    const rel = path.relative(folder, p);
    if (!rel || rel.startsWith('..')) return false;
    return rel.split(/[\\/]/).some((teil) => isIgnoredDirName(teil));
  };
}

function standardBeobachter(folder) {
  return chokidar.watch(folder, {
    ignoreInitial: true,
    ignored: ignorierRegel(folder),
    ...netzPfade.watchOptionenFuer(folder),
  });
}

/**
 * Baut den Dienst des Workflow-Ordners.
 *
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {Map} deps.windows Fenster-Register (Kennung des Anzeige-Prozesses -> Fenster).
 * @param {object} deps.mddStore Container-Format der Bereichsdatei.
 * @param {(p: string) => boolean} [deps.isMarkdownPath] Markdown-Erkennung am Namen.
 * @param {number} [deps.MAX_EMBED_BYTES] Größen-Grenze einer gelesenen Datei.
 * @param {(folder: string) => object} [deps.watchFolder] Beobachter-Fabrik (Prüffälle).
 * @param {number} [deps.buendelMs] Bündel-Frist der Meldung (Prüffälle).
 * @param {(disabled: *) => boolean} [deps.workflowsEnabled] Schalter-Abfrage (Prüffälle).
 * @param {object} [deps.linkedWorkflowSources] Quellen verknüpfter Bereiche (Prüffälle).
 * @returns {object} Die Zugriffe des Dienstes.
 */
function createWorkflowFolderService(deps) {
  const { getStore, areaOfWindow, windows, mddStore } = deps;
  const beobachte = deps.watchFolder || standardBeobachter;
  const buendelMs = Number.isFinite(deps.buendelMs) ? deps.buendelMs : BUENDEL_MS;
  const eingeschaltet =
    deps.workflowsEnabled || ((disabled) => isExtensionEnabled(EXTENSION_ID, disabled));
  const beobachter = new Map(); // Vergleichs-Schlüssel -> { folder, watcher, timer, owners }
  const fensterOrdner = new Map(); // Fenster-Kennung -> Set der Vergleichs-Schlüssel
  // 4T-002426: die Workflows der zugestimmten verknüpften Bereiche.
  const fremde = deps.linkedWorkflowSources || createLinkedWorkflowSources(deps);
  const zuhoerer = new Set();
  let speicherAbonniert = false;

  function mddaPfade(rootPath) {
    return {
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
    };
  }

  // Sektion `workflows` der Bereichsdatei; fehlende oder defekte Datei wirkt wie
  // «nicht festgelegt» (Fehler-Regel der übrigen Leser in area-config.js).
  async function readAreaWorkflowsConfig(rootPath) {
    const raw = await readAreaSettingsRaw({
      ...mddaPfade(rootPath),
      readFile: (p) => fsp.readFile(p, 'utf8'),
      rename: (from, to) => fsp.rename(from, to),
      markSelfWriting: selbstSchreib.merke,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    return parsed.ok ? parsed.container.settings.workflows : undefined;
  }

  // Sektion schreiben (Objekt) oder entfernen (null). Muster templates:setAreaConfig:
  // Die Bereichsdatei entsteht erst beim ersten Setzen, eine defekte wird nie
  // überschrieben.
  async function writeAreaWorkflowsConfig(rootPath, config) {
    const { mddaPath } = mddaPfade(rootPath);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fsp.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalisiert = normalizeWorkflowsConfig(config);
      if (normalisiert) container.settings.workflows = normalisiert;
      else delete container.settings.workflows;
      if (raw === null && !normalisiert) return { ok: true };
      await ersetzeDateiOderWirf(mddaPath, mddStore.serializeContainer(container), {
        markSelfWriting: selbstSchreib.merke,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  async function resolveForWindow(win) {
    const store = getStore();
    const enabled = eingeschaltet(store ? store.get('extensions.disabled') : null);
    const area = win ? areaOfWindow(win) : null;
    const areaConfig = area ? await readAreaWorkflowsConfig(area.rootPath) : undefined;
    const lage = resolveWorkflowsFolder({
      areaRootPath: area ? area.rootPath : null,
      areaConfig,
      globalFolder: store ? store.get(GLOBAL_KEY) : null,
    });
    return { enabled, ...lage };
  }

  async function listForWindow(win) {
    const lage = await resolveForWindow(win);
    if (!lage.enabled) {
      return {
        ok: true,
        enabled: false,
        source: lage.source,
        folder: lage.folder,
        missing: false,
        items: [],
        workflows: [],
        linked: [],
      };
    }
    const liste = await readWorkflowFolder(lage.folder, {
      isMarkdownPath: deps.isMarkdownPath,
      maxBytes: deps.MAX_EMBED_BYTES,
    });
    const area = win ? areaOfWindow(win) : null;
    const linked = area ? await fremde.list(area.rootPath) : [];
    return { ok: true, enabled: true, source: lage.source, folder: lage.folder, ...liste, linked };
  }

  // 4T-002426: die beobachteten Ordner eines Fensters — der eigene und die der
  // zugestimmten Quellen; im Aus-Zustand keiner.
  async function ordnerFuer(win, lage) {
    if (!lage.enabled) return [];
    const area = win ? areaOfWindow(win) : null;
    const quellen = area ? await fremde.sources(area.rootPath) : [];
    return [lage.folder, ...quellen.map((q) => q.folder)].filter(Boolean);
  }

  function melde(fensterIds) {
    for (const id of fensterIds) {
      const win = windows.get(id);
      if (win && !win.isDestroyed()) win.webContents.send(CHANGED_CHANNEL);
    }
    for (const cb of zuhoerer) {
      try {
        cb([...fensterIds]);
      } catch (err) {
        console.warn('Workflow-Ordner: Zuhörer fehlgeschlagen:', err && err.message);
      }
    }
  }

  function schliesse(schluessel) {
    const eintrag = beobachter.get(schluessel);
    if (!eintrag) return;
    if (eintrag.timer) clearTimeout(eintrag.timer);
    try {
      if (eintrag.watcher) void eintrag.watcher.close();
    } catch {
      /* ein nicht schließbarer Beobachter darf das Abmelden nicht verhindern */
    }
    beobachter.delete(schluessel);
  }

  function starte(folder, schluessel) {
    const eintrag = { folder, watcher: null, timer: null, owners: new Set() };
    beobachter.set(schluessel, eintrag);
    try {
      eintrag.watcher = beobachte(folder);
    } catch (err) {
      console.warn('Workflow-Ordner nicht beobachtbar:', folder, err && err.message);
      return eintrag;
    }
    eintrag.watcher.on('all', () => {
      if (eintrag.timer) clearTimeout(eintrag.timer);
      eintrag.timer = setTimeout(() => {
        eintrag.timer = null;
        melde(eintrag.owners);
      }, buendelMs);
    });
    eintrag.watcher.on('error', (err) => {
      console.warn('Workflow-Ordner-Beobachter-Fehler:', folder, err && err.message);
    });
    return eintrag;
  }

  function abmelden(fensterId) {
    const alt = fensterOrdner.get(fensterId);
    fensterOrdner.delete(fensterId);
    for (const schluessel of alt || []) {
      const eintrag = beobachter.get(schluessel);
      if (!eintrag) continue;
      eintrag.owners.delete(fensterId);
      if (eintrag.owners.size === 0) schliesse(schluessel);
    }
  }

  function gleicheMenge(a, b) {
    return a.size === b.size && [...a].every((x) => b.has(x));
  }

  // 4T-002426: ein Fenster besitzt den eigenen Ordner und die der Quellen.
  function anmelden(fensterId, folders) {
    const neu = new Map();
    for (const folder of folders) neu.set(pathCompareKey(path.resolve(folder)), folder);
    const schluessel = new Set(neu.keys());
    if (fensterOrdner.has(fensterId) && gleicheMenge(fensterOrdner.get(fensterId), schluessel)) {
      return;
    }
    abmelden(fensterId);
    fensterOrdner.set(fensterId, schluessel);
    for (const [key, folder] of neu) {
      const eintrag = beobachter.get(key) || starte(folder, key);
      eintrag.owners.add(fensterId);
    }
  }

  // Ordner aller angemeldeten Fenster neu auflösen und alle benachrichtigen.
  async function refreshAll() {
    const ids = [...fensterOrdner.keys()];
    for (const id of ids) {
      const win = windows.get(id);
      if (!win || win.isDestroyed()) {
        abmelden(id);
        continue;
      }
      const lage = await resolveForWindow(win);
      anmelden(id, await ordnerFuer(win, lage));
    }
    melde(new Set(fensterOrdner.keys()));
  }

  function abonniereSpeicher() {
    if (speicherAbonniert) return;
    const store = getStore();
    if (!store || typeof store.onDidChange !== 'function') return;
    speicherAbonniert = true;
    store.onDidChange('workflows', () => void refreshAll());
    store.onDidChange('extensions', () => void refreshAll());
  }

  // Liste für ein Fenster und dessen Anmeldung an der Beobachtung.
  async function folderListFor(win) {
    abonniereSpeicher();
    const ergebnis = await listForWindow(win);
    const id = win.webContents.id;
    if (!fensterOrdner.has(id)) win.webContents.once('destroyed', () => abmelden(id));
    anmelden(id, await ordnerFuer(win, ergebnis));
    return ergebnis;
  }

  // Zuhörer im Hauptprozess (Menü-Aufbau in Teil 2); Rückgabe meldet ab.
  function onChange(cb) {
    zuhoerer.add(cb);
    return () => zuhoerer.delete(cb);
  }

  function dispose() {
    for (const schluessel of [...beobachter.keys()]) schliesse(schluessel);
    fensterOrdner.clear();
  }

  return {
    readAreaWorkflowsConfig,
    writeAreaWorkflowsConfig,
    // 4T-002426: Ist ein Pfad die Definition eines zugestimmten fremden Workflows?
    linkedSourceFor: fremde.sourceFor,
    resolveForWindow,
    listForWindow,
    folderListFor,
    refreshAll,
    onChange,
    dispose,
  };
}

module.exports = { CHANGED_CHANNEL, createWorkflowFolderService };
