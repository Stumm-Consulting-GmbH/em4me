// 4T-002355 (Epic 3E-000184): IPC-Kanäle des Workflow-Ordners — die Liste für
// das Fenster samt Anmeldung an der Beobachtung, der Konfigurations-Stand für
// die Einstellungs-Abschnitte und das Schreiben der Bereichs-Sektion.
//
// Kanal-Gruppe (Namensraum workflow:*, wie die Ausführung in workflows.js):
//   workflow:folderList     Fenster -> Hauptprozess (invoke), Antwort die Liste
//                           { ok, enabled, source, folder, missing, items, workflows };
//   workflow:getConfig      Fenster -> Hauptprozess (invoke), Antwort
//                           { ok, hasArea, areaName, global, area } mit
//                           { folder } oder null je Ebene;
//   workflow:setAreaConfig  Fenster -> Hauptprozess (invoke), Nutzlast { folder }
//                           oder null (Sektion entfernen), Antwort { ok, error? };
//   workflow:folderChanged  Hauptprozess -> Fenster (send), ohne Nutzlast;
//   workflow:setFolder      Fenster -> Hauptprozess (invoke), Nutzlast { folder }
//                           (absolut); mit Bereich in dessen Sektion (innerhalb
//                           wurzel-relativ), sonst anwendungsweit; Antwort { ok, error? };
//                           4T-002649: mit { folder, target: 'global' } immer
//                           anwendungsweit, und dort heißt `folder: ''` «nicht
//                           festgelegt» (Einstellungs-Abschnitt «Workflows»);
//   workflow:create         Fenster -> Hauptprozess (invoke), Nutzlast { name };
//                           legt im wirksamen Ordner eine Workflow-Datei an,
//                           Antwort { ok, path } oder { ok: false, code };
//   workflow:fileInfo       Fenster -> Hauptprozess (invoke), Nutzlast ein Pfad im
//                           Bereich, Antwort { ok, isWorkflow } (Kontextmenü);
//   workflow:menuAction     Hauptprozess -> Fenster (send), Nutzlast { kind, path? }
//                           aus dem Untermenü «Datei → Workflows» (menu-workflows.js).
// Die Ordner-Auswahl der Einstellungen nutzt templates:chooseFolder mit dem
// Zweck `workflows` (ipc/templates.js), statt einen zweiten Dialog-Kanal zu führen.
//
// Muster: Vorlagen-Kanäle templates:getConfig und templates:setAreaConfig in
// templates.js. Eigener Zustand: der Dienst des Workflow-Ordners
// (workflows/workflow-folder-service.js), von der Verdrahtung hereingereicht
// oder hier angelegt.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const { isInsideArea, sanitizeNewFileName } = require('../area/area-path');
const { readWorkflowDocument } = require('../../shared/workflows/workflow-document.js');
const { createWorkflowFolderService } = require('../workflows/workflow-folder-service.js');
const { MAX_WORKFLOW_BYTES, normalizeWorkflowsConfig } = require('../workflows/workflow-folder.js');
const { createWorkflowMenuLists } = require('../workflows/workflow-menu-lists.js');
const { createNewWorkflow } = require('../workflows/workflow-new-file.js');
const { textArtDerAbweisung } = require('./protected-dialog-target.js');

// Längen-Grenzen der Nutzlast (Muster der Ausführungs-Kanäle in workflows.js).
const MAX_PFAD = 4096;
const MAX_NAME = 255;
const istText = (v, max) => typeof v === 'string' && v !== '' && v.length <= max;

// Die festgelegte Ordner-Angabe des Bereichs: innerhalb wurzel-relativ
// (umzugsfest), außerhalb absolut — dieselbe Regel wie die Einstellungs-Seite.
function bereichsAngabe(rootPath, folder) {
  if (!isInsideArea(rootPath, folder)) return folder;
  return path.relative(rootPath, folder).split(path.sep).join('/') || '.';
}

/**
 * Registriert die Kanäle des Workflow-Ordners.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher.
 * @param {Map} deps.windows Fenster-Register.
 * @param {(win: object) => void} deps.applyMenuToWindow Menü eines Fensters neu setzen.
 * @param {(lists: object) => void} deps.setWorkflowMenuLists Menü-Listen an den Menü-Aufbau geben.
 * @param {(win: object, key: string) => string} deps.tForWindow Text in der Sprache des Fensters.
 * @param {object} [deps.workflowFolders] Dienst des Workflow-Ordners (Verdrahtung, Prüffälle).
 * @param {Function} [deps.checkTarget] Prüfung gegen die geschützten Ordner (channel-guard.js).
 * @returns {object} Der Dienst, damit der Menü-Aufbau ihn mitnutzen kann.
 */
function registerWorkflowFolderIpc(handle, deps) {
  const {
    senderWindow,
    areaOfWindow,
    getStore,
    windows,
    applyMenuToWindow,
    setWorkflowMenuLists,
    tForWindow,
    checkTarget,
  } = deps;
  const dienst = deps.workflowFolders || createWorkflowFolderService(deps);
  // Die Liste je Fenster für das Untermenü «Datei → Workflows»; ohne
  // Menü-Aufbau (Prüffälle) entfällt sie.
  const menuListen =
    typeof setWorkflowMenuLists === 'function' && typeof applyMenuToWindow === 'function'
      ? createWorkflowMenuLists({ dienst, windows, applyMenuToWindow })
      : null;
  if (menuListen) setWorkflowMenuLists(menuListen);

  handle('workflow:folderList', async (event) => {
    const win = senderWindow(event);
    if (!win) return { ok: false, error: 'no window' };
    const liste = await dienst.folderListFor(win);
    if (menuListen) menuListen.merke(win, liste);
    return liste;
  });

  handle('workflow:getConfig', async (event) => {
    const win = senderWindow(event);
    const area = win ? areaOfWindow(win) : null;
    const store = getStore();
    const areaConfig = area ? await dienst.readAreaWorkflowsConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      global: normalizeWorkflowsConfig({ folder: store ? store.get('workflows.folder') : null }),
      area: normalizeWorkflowsConfig(areaConfig),
    };
  });

  handle('workflow:setAreaConfig', async (event, config) => {
    const win = senderWindow(event);
    const area = win ? areaOfWindow(win) : null;
    if (!area) return { ok: false, error: 'no area' };
    const ergebnis = await dienst.writeAreaWorkflowsConfig(area.rootPath, config);
    if (ergebnis.ok) await dienst.refreshAll();
    return ergebnis;
  });

  // «Neuer Workflow …» ohne festgelegten Ordner: die Wahl festhalten.
  // 4T-002649 (Epic 3E-000416): Seit der allgemeine Einstellungs-Weg den
  // Schlüssel workflows.folder abweist (Klasse 3, app/settings-classes.js),
  // schreibt auch der Einstellungs-Abschnitt hierüber, mit dem Ziel 'global':
  // Er stellt den anwendungsweiten Ordner auch in einem Fenster mit Bereich
  // ein und darf ihn leeren. Den Ordner prüft die Anmelde-Stelle vorher gegen
  // die geschützten Ordner (channel-declarations/workflows.js).
  handle('workflow:setFolder', async (event, nutzlast) => {
    const win = senderWindow(event);
    const folder = nutzlast && nutzlast.folder;
    const global = !!nutzlast && nutzlast.target === 'global';
    if (!win) return { ok: false, error: 'no window' };
    const leeren = global && folder === '';
    if (!leeren && (!istText(folder, MAX_PFAD) || !path.isAbsolute(folder))) {
      return { ok: false, error: 'invalid folder' };
    }
    const area = global ? null : areaOfWindow(win);
    if (area) {
      const angabe = bereichsAngabe(area.rootPath, path.resolve(folder));
      const ergebnis = await dienst.writeAreaWorkflowsConfig(area.rootPath, { folder: angabe });
      if (ergebnis.ok) await dienst.refreshAll();
      return ergebnis;
    }
    const store = getStore();
    if (!store) return { ok: false, error: 'no store' };
    store.set('workflows.folder', leeren ? '' : path.resolve(folder));
    await dienst.refreshAll();
    return { ok: true };
  });

  handle('workflow:create', async (event, nutzlast) => {
    const win = senderWindow(event);
    const name = nutzlast && nutzlast.name;
    if (!win) return { ok: false, code: 'noWindow' };
    if (!istText(name, MAX_NAME)) return { ok: false, code: 'invalidName' };
    const lage = await dienst.resolveForWindow(win);
    if (!lage.enabled) return { ok: false, code: 'disabled' };
    if (!lage.folder) return { ok: false, code: 'noFolder' };
    // Review-Befund S1 vom 2026-11-22 (4T-002827): Der Ordner kommt aus der
    // Bereichsdatei (workflow:setAreaConfig, noch nicht erklärt) oder aus einer
    // älteren Einstellung und ist damit ungeprüft. Geprüft wird hier das Ziel
    // der neuen Datei, mit demselben Umfang wie die übrigen Anlege-Wege.
    const fileName = sanitizeNewFileName(name);
    if (fileName && typeof checkTarget === 'function') {
      const abweisung = await checkTarget(
        'workflow:create',
        path.join(lage.folder, fileName),
        'create',
      );
      if (abweisung) return { ok: false, code: textArtDerAbweisung(abweisung) };
    }
    const t = (k) => tForWindow(win, k);
    return createNewWorkflow({
      fsp,
      folder: lage.folder,
      name,
      texts: {
        description: t('workflow.neu.kopfBeschreibung'),
        hints: [t('workflow.neu.hilfe1'), t('workflow.neu.hilfe2')],
      },
    });
  });

  // Trägt eine Datei des Bereichs das Kennzeichen? Für «Starten» im
  // Kontextmenü des Bereichs-Panels; gelesen wird allein im Bereich des Fensters.
  handle('workflow:fileInfo', async (event, filePath) => {
    const win = senderWindow(event);
    const area = win ? areaOfWindow(win) : null;
    if (!area || !istText(filePath, MAX_PFAD) || !path.isAbsolute(filePath)) {
      return { ok: false, isWorkflow: false };
    }
    const abs = path.resolve(filePath);
    if (!isInsideArea(area.rootPath, abs)) return { ok: false, isWorkflow: false };
    try {
      const stat = await fsp.stat(abs);
      if (!stat.isFile() || stat.size > MAX_WORKFLOW_BYTES) return { ok: true, isWorkflow: false };
      const text = await fsp.readFile(abs, 'utf8');
      const doc = readWorkflowDocument(text, { fileName: path.basename(abs) });
      return { ok: true, isWorkflow: doc.isWorkflow };
    } catch {
      return { ok: false, isWorkflow: false };
    }
  });

  return dienst;
}

module.exports = { registerWorkflowFolderIpc };
