// 4T-0298 (Epic 3E-0053): Preload-Loader der externen Markdown-Plugins.
//
// Die markdown-it-Instanzen leben im Preload (markdown.js) — externe
// Render-Beitraege muessen deshalb HIER evaluiert werden, nicht im
// Renderer (contextBridge kann keine Plugin-Funktionen mit intakten
// Objekt-Graphen durchreichen). Mechanismus laut Spike (4T-0298):
// Quelltext per IPC aus dem Main (ID-Whitelist gegen den Scan-Stand),
// Evaluierung per node:vm in einem leeren Sandbox-Kontext — der Code
// sieht weder require noch process noch DOM, nur module/exports
// (CommonJS-Konvention: module.exports = function (md) { ... }).
// Das ist bewusst KEINE Sicherheits-Sandbox gegen entschlossenen
// Angriff (Vertrauensmodell ist der Warn-Dialog), aber es haelt das
// Versprechen „kein Node-API-Zugriff fuer Erweiterungen" der
// Architekturentscheidung technisch ein.
'use strict';

const { ipcRenderer } = require('electron');
const vm = require('node:vm');
const { configureExternalMarkdownPlugins } = require('../../shared/markdown/markdown.js');

// Evaluierte Plugins je id@version — ein Paket wird pro Version genau
// einmal evaluiert (Umschalten aus/an laedt nicht erneut).
const pluginCache = new Map();

function evaluatePluginSource(id, source) {
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  // timeout faengt Endlosschleifen zur Lade-Zeit ab (Fehler-Isolation);
  // filename macht Stacktraces der Erweiterung zuordenbar.
  vm.runInNewContext(String(source), sandbox, {
    filename: `extension:${id}/markdown-plugin.js`,
    timeout: 2000,
  });
  const plugin = sandbox.module.exports;
  if (typeof plugin !== 'function') {
    throw new Error('module.exports ist keine markdown-it-Plugin-Funktion');
  }
  return plugin;
}

// Setzt den aktiven Satz externer Markdown-Plugins ({ id, version }[]).
// Holt fehlende Quelltexte vom Main, evaluiert sie und baut die
// Pipelines neu. Rueckgabe: { id: fehlertext } aller gescheiterten
// Erweiterungen (Quelltext-, Evaluierungs- und Aufbau-Fehler) — der
// Host deaktiviert sie automatisch.
async function configureExternalExtensions(descriptors) {
  const errors = {};
  const list = [];
  for (const d of Array.isArray(descriptors) ? descriptors : []) {
    if (!d || typeof d.id !== 'string') continue;
    const key = `${d.id}@${String(d.version || '')}`;
    let plugin = pluginCache.get(key);
    if (!plugin) {
      let res;
      try {
        res = await ipcRenderer.invoke('extensions:getMarkdownPluginSource', d.id);
      } catch (err) {
        errors[d.id] = String((err && err.message) || err);
        continue;
      }
      if (!res || res.ok !== true) {
        errors[d.id] = (res && res.error) || 'Quelltext nicht lesbar';
        continue;
      }
      try {
        plugin = evaluatePluginSource(d.id, res.source);
      } catch (err) {
        errors[d.id] = String((err && err.message) || err);
        continue;
      }
      pluginCache.set(key, plugin);
    }
    list.push({ id: d.id, version: d.version, plugin });
  }
  const buildErrors = configureExternalMarkdownPlugins(list);
  return { ...buildErrors, ...errors };
}

module.exports = { configureExternalExtensions };
