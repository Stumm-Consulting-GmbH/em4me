// Preload-Bridge: contextBridge-API fuer den Renderer plus fs-nahe Helfer.
// 4T-0179 (Epic 3E-0039): Die komplette Markdown-Pipeline (markdown-it-
// Konfiguration, eigene Plugins, Frontmatter, Perspective Table, Portable-Konverter)
// ist nach src/shared/markdown/** extrahiert und dort Electron-frei testbar.
// Hier verbleiben nur die Bridge (IPC), Pfad-Helfer und der fs-abhaengige
// Bild-Resolver.
'use strict';

const electron = require('electron');
const { contextBridge, ipcRenderer, webUtils } = electron;
const path = require('node:path');
const fs = require('node:fs');

const { githubLikeSlug } = require('../shared/markdown/slug.js');
const { extractFrontmatter, writeFrontmatter } = require('../shared/markdown/frontmatter.js');
// 4T-1045 (Epic 3E-0151): Mindmap-Kern; die Markdown-Instanz bekommt er hier
// gereicht. Modul-Objekt statt destrukturiertem md, weil configureExtensions
// module.exports.md beim Schalten einer Erweiterung NEU zuweist.
const { mindmapAusDokument } = require('../shared/mindmap-core.js');
const markdownModul = require('../shared/markdown/markdown.js');
const {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
  configureFrontmatterDisplay,
  configureHeadingNumbering,
  // 4T-0546 (Epic 3E-0097): Kalender-Konfiguration der Wert-Badges in der
  // Preload-Pipeline (das Renderer-Bundle haelt seinen eigenen Zustand in
  // calendar-config.js — fuer Render-Pane und Portable-Export zaehlt die
  // hiesige Instanz).
  setCalendarConfig,
} = require('../shared/markdown/markdown.js');
// 4T-0204: Task-Status-Konfiguration der Preload-Pipeline (das Renderer-
// Bundle haelt eine EIGENE plugins.js-Instanz — fuer Render-Pane und
// Portable-Export zaehlt die hiesige).
// 4T-0498 (Epic 3E-0090): dazu die Task-Marker-Konfiguration der
// Erweiterung "Aufgaben" (Global Filter, Ausblende-Option, Labels).
const { configureTaskStates, configureTaskMarkers } = require('../shared/markdown/plugins.js');
// 4T-0298 (Epic 3E-0053): Loader der externen Markdown-Plugins (vm-
// Evaluierung im Preload-Kontext, siehe Kopf-Kommentar des Moduls).
const { configureExternalExtensions } = require('./extensions/extension-loader.js');

// 4T-0017: Electron-Standard-Zoom (Strg + +/-/0, Strg + Mausrad) komplett
// abschalten. Der Renderer implementiert einen eigenen, pro-Tab gehaltenen
// Zoom ueber CSS auf den Inhalts-Containern. Ohne diese Limits wuerde
// Electron zusaetzlich auf webContents-Ebene zoomen — doppelt skaliert und
// inklusive Statusbar/Tabs/Menue, was wir explizit nicht wollen.
//
// Wichtig: Der Aufruf wird in DOMContentLoaded verlagert und defensiv mit
// try/catch geklammert. Direkt zur Preload-Modul-Ladezeit ist `webFrame` je
// nach Electron-Version noch nicht initialisiert; ein Zugriff darauf wirft
// dann eine Exception, die das Preload-Skript abbricht — Renderer kommt
// nicht hoch, ready-to-show feuert nicht, das Fenster bleibt unsichtbar.
window.addEventListener('DOMContentLoaded', () => {
  try {
    if (electron.webFrame && typeof electron.webFrame.setVisualZoomLevelLimits === 'function') {
      electron.webFrame.setVisualZoomLevelLimits(1, 1);
    }
  } catch (err) {
    console.warn('webFrame.setVisualZoomLevelLimits nicht verfuegbar:', err);
  }
});

// 4T-0788 (Epic 3E-0125): Wurzel der Bild-Auflösung, fensterlokal gesetzt.
// Bei gebundenem Bereich ist das dessen Wurzelordner, sonst null. Der Wert
// kommt über configureAttachmentArea vom Renderer (Muster
// configureFrontmatterDisplay); als Parameter der Render-Signatur wäre er an
// jedem Aufrufer einzeln nachzuziehen, und eine vergessene Stelle fiele still
// auf die enge Grenze zurück, ohne dass ein Test das bemerkt.
let bildAufloesungsWurzel = null;

function configureAttachmentArea(rootPath) {
  bildAufloesungsWurzel = typeof rootPath === 'string' && rootPath !== '' ? rootPath : null;
}

// Liegt ziel innerhalb von wurzel? Case-insensitiv wie das Windows-Dateisystem,
// Semantik identisch zu area-path.isInsideArea (die Wurzel selbst zählt als
// innerhalb, Präfix-Nachbarn matchen nicht). Hier nachgebildet statt importiert,
// weil das Preload-Bündel ohne Main-Module auskommt.
function liegtInWurzel(wurzel, ziel) {
  const w = path
    .resolve(wurzel)
    .replace(/[\\/]+$/, '')
    .toLowerCase();
  const z = path.resolve(ziel).toLowerCase();
  return z === w || z.startsWith(w + path.sep);
}

// Bilder mit relativen Pfaden zum data:-URI auflösen, damit sie im
// file://-Kontext zuverlässig laden. Alternativ könnten wir auf file:// URLs
// umstellen, aber data: ist robuster und vermeidet Caching-Probleme.
function resolveImagesForBase(html, basePath) {
  if (!basePath) return html;
  const baseDir = path.dirname(basePath);
  // 4T-0788 (Epic 3E-0125): Die Containment-Wurzel ist bei gebundenem Bereich
  // dessen Wurzel, sonst der Ordner des Dokuments. Damit wird ein zentraler
  // Anlagen-Ordner des Bereichs auch aus einem Unterordner heraus sichtbar,
  // was er unter der reinen Dokument-Ordner-Grenze nie war. Die Prüfung bleibt
  // in ihrer Härte unverändert: eine harte Grenze gegen genau eine Wurzel, und
  // zwar dieselbe, die die App überall sonst als Arbeitsraum-Grenze durchsetzt.
  // Der Bereich muss den Dokument-Ordner tatsächlich enthalten; ein
  // fensterlokal stehengebliebener Fremd-Bereich weitet sonst die Grenze für
  // ein Dokument, das gar nicht in ihm liegt.
  const wurzel =
    bildAufloesungsWurzel && liegtInWurzel(bildAufloesungsWurzel, baseDir)
      ? path.resolve(bildAufloesungsWurzel)
      : baseDir;
  // P-03 (4T-0176): nur echte Bild-Formate mit bekanntem MIME-Typ einbetten.
  const IMAGE_EXT_WHITELIST = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
  return html.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi, (match, pre, src, post) => {
    if (/^(https?:|data:|file:)/i.test(src)) return match;
    // P-01 (4T-0174): decodeURI INNERHALB des try — ein literales '%' im
    // Bildnamen (z.B. aus unkodiertem Wiki-Embed-src) wirft sonst einen
    // URIError und bricht den gesamten Voll-Render des Dokuments ab.
    try {
      const abs = path.resolve(baseDir, decodeURI(src));
      // P-03 (4T-0176): Containment — der Resolver folgt sonst '../' und
      // absoluten Pfaden und liest beliebige lokale Dateien ins DOM.
      // Bilder ausserhalb der Wurzel bleiben unaufgeloest (Browser zeigt das
      // Bild nicht; bewusster Trade-off, im Task dokumentiert). 4T-0788: Die
      // Wurzel ist bei gebundenem Bereich dessen Wurzelordner, sonst wie bisher
      // der Ordner des Dokuments.
      if (!liegtInWurzel(wurzel, abs)) return match;
      const ext = path.extname(abs).slice(1).toLowerCase();
      if (!IMAGE_EXT_WHITELIST.has(ext)) return match;
      // Groessenlimit VOR dem Lesen (Memory-Schutz).
      if (fs.statSync(abs).size > MAX_IMAGE_BYTES) return match;
      const mime = mimeForImage(ext);
      const data = fs.readFileSync(abs).toString('base64');
      // 4T-0790 (Epic 3E-0125): Original-Quelle als Attribut erhalten. Nach der
      // Ersetzung steht in `src` ein data:-URI, aus dem sich kein Pfad mehr
      // ableiten laesst; der Klick-Pfad braucht ihn aber, um die Anlage in der
      // Standardanwendung zu oeffnen. Der Wert stammt aus dem src-Attribut des
      // gerenderten HTML und ist dort bereits attribut-sicher.
      return `<img ${pre}data-src-original="${src}" src="data:${mime};base64,${data}"${post}>`;
    } catch {
      return match;
    }
  });
}

function mimeForImage(ext) {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

contextBridge.exposeInMainWorld('api', {
  // Datei-Operationen
  openDialog: () => ipcRenderer.invoke('file:openDialog'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  // 4T-0945 (Story 4S-0786): opts = { expected, force } — Stand-Pruefung vor
  // dem Ueberschreiben; ohne opts unveraendertes Verhalten.
  saveFile: (p, content, opts) => ipcRenderer.invoke('file:save', p, content, opts),
  saveFileAs: (suggested, content) => ipcRenderer.invoke('file:saveAs', suggested, content),
  pushRecent: (p) => ipcRenderer.invoke('recent:push', p),

  // 4T-0303 (Epic 3E-0054): PDF-Export. Zielpfad-Dialog und Druck sind
  // getrennte Endpunkte, damit der Renderer den Print-Zustand erst nach
  // dem Dialog aufbaut (Begruendung am Handler in main.js).
  choosePdfExportTarget: (params) => ipcRenderer.invoke('pdf:chooseTarget', params),
  printPdfToFile: (targetPath) => ipcRenderer.invoke('pdf:print', targetPath),

  // Dialog-Helfer fuer Dirty-State und Konflikt-Strategie
  confirmCloseDirty: (opts) => ipcRenderer.invoke('dialog:confirmCloseDirty', opts),
  // 4T-0512 (Epic 3E-0092): Lösch-Bestätigung eines Ereignis-Eintrags.
  eventsConfirmDelete: (entryText) => ipcRenderer.invoke('events:confirmDelete', entryText),
  // 4T-0515 (Epic 3E-0092): Ereignis-Aggregation (Index-Abfrage) und
  // Frontmatter-Rueckschreiben in nicht geoeffnete Quell-Dateien.
  eventsQuery: (query) => ipcRenderer.invoke('events:query', query),
  eventsApplyFrontmatterEdit: (params) => ipcRenderer.invoke('events:applyFrontmatterEdit', params),
  confirmConflict: (opts) => ipcRenderer.invoke('dialog:confirmConflict', opts),
  showSaveError: (detail) => ipcRenderer.invoke('dialog:showSaveError', detail),

  // Window-Close-Bestaetigung: Renderer ruft dies, sobald alle dirtigen Tabs
  // gespeichert oder verworfen sind und das Fenster zugehen darf.
  confirmClose: () => ipcRenderer.invoke('window:confirmClose'),
  resolveLink: (basePath, target) => ipcRenderer.invoke('file:resolveLink', basePath, target),
  isMarkdownPath: (p) => ipcRenderer.invoke('file:isMarkdown', p),
  fileExists: (p) => ipcRenderer.invoke('file:exists', p),
  // 4T-0604 (Epic 3E-0113): Dateisystem-Zeitstempel (birthtime/mtime) für die
  // Zeitstempel-Automatik beim Speichern; liefert null, wenn die Datei (noch)
  // nicht lesbar ist.
  getFileTimes: (p) => ipcRenderer.invoke('file:getTimes', p),
  unwatchFile: (p) => ipcRenderer.invoke('file:unwatch', p),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Pfad-Helfer (Dateinamen ohne Verzeichnis)
  basename: (p) => path.basename(p),
  dirname: (p) => path.dirname(p),
  // 4T-0347 (Epic 3E-0062): relativer Pfad fuer die bereichsrelative Ordner-
  // Anzeige in Backlinks- und Tag-Panel (Ordner ab der Index-Wurzel).
  relative: (from, to) => path.relative(from, to),

  // Drag-&-Drop: seit Electron 32 ist File.path weg, daher webUtils.
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // 4T-0787 (Epic 3E-0125): Anlage ablegen und Verweis-Pfad erhalten. Der eine
  // Kanal beider Eingabewege. Das Parameter-Objekt wird als GANZES gereicht und
  // nicht feldweise kopiert; ein feldweises Nachbauen an dieser Naht hat sich
  // als stille Falle erwiesen, sobald der Vertrag um ein Feld waechst
  // (Entwicklungsrichtlinien, Abschnitt „Prozess- und Modul-Schnitt").
  storeAttachment: (params) => ipcRenderer.invoke('attachment:store', params),

  // 4T-0790 (Epic 3E-0125): Anlage in der Standardanwendung öffnen. Eigener
  // Kanal mit shell.openPath; die Beschränkung von openExternal auf http/https
  // bleibt unangetastet, weil sie einen anderen Weg schützt.
  openAttachment: (params) => ipcRenderer.invoke('attachment:open', params),

  // 4T-0791 (Epic 3E-0125): Anlagen-Einstellung lesen und schreiben (global
  // und je Bereich, Muster templates:getConfig/setAreaConfig).
  attachmentsGetConfig: () => ipcRenderer.invoke('attachments:getConfig'),
  attachmentsSetGlobalConfig: (config) => ipcRenderer.invoke('attachments:setGlobalConfig', config),
  attachmentsSetAreaConfig: (config) => ipcRenderer.invoke('attachments:setAreaConfig', config),

  // 4T-0788 (Epic 3E-0125): Wurzel der Bild-Auflösung setzen (Muster
  // configureFrontmatterDisplay). Fensterlokal, weil jedes Fenster einen
  // eigenen Bereich tragen kann; beim App-Start und bei jedem Bereichs-Wechsel
  // aufzurufen, mit null beim Schließen des Bereichs.
  configureAttachmentArea: (rootPath) => configureAttachmentArea(rootPath),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // 4T-0581/4T-0582 (Epic 3E-0107): Rechtschreibpruefung. Das falsch
  // geschriebene Wort samt Vorschlaegen meldet ausschliesslich der
  // Main-Prozess (webContents 'context-menu'); Ersetzen und Woerterbuch
  // brauchen ebenfalls Main-Zugriff. Der Schalter-Broadcast erreicht alle
  // Fenster einschliesslich des ausloesenden.
  onSpellcheckContext: (cb) => ipcRenderer.on('spellcheck:context', (_e, payload) => cb(payload)),
  onSpellcheckChanged: (cb) => ipcRenderer.on('spellcheck:changed', (_e, value) => cb(value)),
  spellcheckReplace: (word) => ipcRenderer.invoke('spellcheck:replace', word),
  spellcheckAddWord: (word) => ipcRenderer.invoke('spellcheck:addWord', word),
  spellcheckRemoveWord: (word) => ipcRenderer.invoke('spellcheck:removeWord', word),
  spellcheckListWords: () => ipcRenderer.invoke('spellcheck:listWords'),

  // 4T-0204: aktives Task-Status-Set der Render-Pipeline setzen (Aufruf
  // beim App-Start und bei jedem taskStates-Broadcast; Labels kommen
  // bereits lokalisiert aus dem Renderer).
  configureTaskStates: (states) => configureTaskStates(states),
  // 4T-0498 (Epic 3E-0090): Task-Marker-Konfiguration der Render-Pipeline
  // (Muster configureTaskStates; Aufruf beim App-Start und bei jedem
  // tasksConfig-Broadcast; Labels kommen lokalisiert aus dem Renderer).
  configureTaskMarkers: (cfg) => configureTaskMarkers(cfg),
  // 4T-0498: Multi-Window-Broadcast bei tasksConfig-Aenderung.
  onTasksConfigChanged: (cb) => ipcRenderer.on('tasksConfig:changed', (_e, cfg) => cb(cfg)),
  // 4T-0204: Multi-Window-Broadcast bei taskStates-Aenderung.
  onTaskStatesChanged: (cb) => ipcRenderer.on('taskStates:changed', (_e, states) => cb(states)),

  // 4T-0526 (Epic 3E-0095): Erinnerungen — Zustellung faelliger Anker vom
  // Main-Pruefer, Panel-Daten, Muting/Wiederausloesung und die zuschaltbare
  // System-Notification (Anzeige im Main, Klick holt das Fenster nach vorn).
  onRemindersDue: (cb) => ipcRenderer.on('reminders:due', (_e, payload) => cb(payload)),
  onRemindersChanged: (cb) => ipcRenderer.on('reminders:changed', (_e, payload) => cb(payload)),
  remindersList: () => ipcRenderer.invoke('reminders:list'),
  remindersMute: (keys) => ipcRenderer.invoke('reminders:mute', keys),
  remindersRetrigger: (keys) => ipcRenderer.invoke('reminders:retrigger', keys),
  remindersSystemNotify: (payload) => ipcRenderer.invoke('reminders:systemNotify', payload),
  // 4T-0528 (Epic 3E-0095): Multi-Window-Broadcast bei remindersConfig-Aenderung.
  onRemindersConfigChanged: (cb) => ipcRenderer.on('remindersConfig:changed', (_e, cfg) => cb(cfg)),

  // 4T-0637 (Epic 3E-0069): Wecker — Zustellung faelliger Wecker vom
  // Main-Pruefer (an genau ein Fenster), Bestaetigen und Schlummern gegen
  // dessen Session-Zustand, Multi-Window-Broadcast der Wecker-Liste. Die
  // System-Benachrichtigung laeuft ueber den neutralen Kanal notify:system
  // (dieselbe Anzeige-Logik wie bei den Erinnerungen).
  onAlarmDue: (cb) => ipcRenderer.on('alarm:due', (_e, payload) => cb(payload)),
  onClockAlarmsChanged: (cb) => ipcRenderer.on('clockAlarms:changed', (_e, list) => cb(list)),
  alarmSnooze: (key, minutes) => ipcRenderer.invoke('alarm:snooze', { key, minutes }),
  alarmConfirm: (key) => ipcRenderer.invoke('alarm:confirm', { key }),
  systemNotify: (payload) => ipcRenderer.invoke('notify:system', payload),

  // 4T-0638 (Epic 3E-0069): Timer und Stoppuhr — Zustellung abgelaufener
  // Timer vom Main-Pruefer (an genau ein Fenster) und die Multi-Window-
  // Broadcasts beider Listen. Start, Pause und Zuruecksetzen laufen ueber
  // den normalen Einstellungs-Weg (setSetting), weil der Zustand im Store
  // liegt; ein eigener Kanal waere doppelte Verdrahtung.
  // 4T-0639 (Epic 3E-0069): Multi-Window-Broadcast der Panel-Ueberschriften.
  onSidebarIconHeadingsChanged: (cb) =>
    ipcRenderer.on('sidebarIconHeadings:changed', (_e, value) => cb(value)),
  // 4T-0855 (Epic 3E-0164): Multi-Window-Broadcast des Hoehen-Modells.
  onSidebarHeightModeChanged: (cb) =>
    ipcRenderer.on('sidebarHeightMode:changed', (_e, value) => cb(value)),

  onTimerDue: (cb) => ipcRenderer.on('timer:due', (_e, payload) => cb(payload)),
  onClockTimersChanged: (cb) => ipcRenderer.on('clockTimers:changed', (_e, list) => cb(list)),
  onClockStopwatchChanged: (cb) => ipcRenderer.on('clockStopwatch:changed', (_e, sw) => cb(sw)),

  // 4T-0208: Multi-Window-Broadcast bei Hotkey-Override-Aenderung (Menue
  // baut der Main selbst neu; der Renderer zieht Dispatcher-Map,
  // Editor-Keymap und Hilfe-Tabelle nach).
  onHotkeysChanged: (cb) => ipcRenderer.on('hotkeys:changed', (_e, overrides) => cb(overrides)),

  // System
  getLocale: () => ipcRenderer.invoke('app:locale'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getTheme: () => ipcRenderer.invoke('theme:current'),
  // 4T-0030: Theme-Vorzug ('light' | 'dark' | 'system'). 'system' folgt dem
  // OS-Theme (alte Logik), die anderen erzwingen das jeweilige Theme.
  getThemePref: () => ipcRenderer.invoke('theme:getPref'),
  setThemePref: (value) => ipcRenderer.invoke('theme:setPref', value),

  // 4T-0377 (Epic 3E-0071): Klipboard-Zugriff für das Editor-Kontextmenü.
  // Electron-Klipboard (synchron, kein Permission-Prompt wie navigator.
  // clipboard, kein Fokus-Verlust). Nur Text — das Kontextmenü arbeitet auf
  // Markdown-Quelltext.
  clipboardReadText: () => electron.clipboard.readText(),
  clipboardWriteText: (text) => electron.clipboard.writeText(text == null ? '' : String(text)),

  // Markdown-Rendering
  // 4T-0282: opts wird an den Kern-Render durchgereicht (frontmatterBlock:
  // false unterdrueckt die Frontmatter-Zeile, z.B. in Markdown-Embeds).
  renderMarkdown: (text, basePath, opts) => {
    // 4T-0179: Kern-Render in src/shared/markdown/markdown.js (inkl.
    // perspective-portable-Weiche und Frontmatter-Strip); hier nur der DOM-nahe
    // lang-Kontext und der fs-abhaengige Bild-Resolver.
    const lang = (document.documentElement.lang || 'de').split('-')[0].toLowerCase();
    const html = renderMarkdown(text, lang, opts);
    return resolveImagesForBase(html, basePath);
  },
  // 4T-1045 (Epic 3E-0151): Knoten-Baum fuer die Mindmap-Ansicht, derselbe
  // Weg wie renderMarkdown. Die Anordnung rechnet bewusst der Renderer, weil
  // sie eine echte Textmessung braucht.
  buildMindmap: (text, opts) => mindmapAusDokument(text, markdownModul.md, opts || {}),
  // 4T-0282/4T-0284: Frontmatter-Zeile der Preload-Pipeline schalten
  // (Muster configureTaskStates; Aufruf beim App-Start und bei jedem
  // Settings-Broadcast).
  configureFrontmatterDisplay: (enabled) => configureFrontmatterDisplay(enabled),
  // 4T-0546 (Epic 3E-0097): calendarSystems-Konfiguration in die Render-
  // Pipeline schalten (Muster configureFrontmatterDisplay).
  calendarConfigureRender: (config) => setCalendarConfig(config),
  // 4T-0284: Multi-Window-Broadcast bei Aenderung von render.showFrontmatter.
  onFrontmatterDisplayChanged: (cb) =>
    ipcRenderer.on('frontmatterDisplay:changed', (_e, enabled) => cb(enabled)),
  // 4T-0471 (Epic 3E-0087): Nummerierungs-Zustand der Preload-Pipeline
  // schalten (Muster configureFrontmatterDisplay) und Multi-Window-Broadcast
  // bei Aenderung von render.headingNumbering.
  configureHeadingNumbering: (cfg) => configureHeadingNumbering(cfg),
  onHeadingNumberingChanged: (cb) =>
    ipcRenderer.on('headingNumbering:changed', (_e, cfg) => cb(cfg)),
  // 4T-0312 (Epic 3E-0055): Multi-Window-Broadcast bei Aenderung von
  // render.frontmatterExpanded (dauerhaft ausgeklappte Darstellung).
  onFrontmatterExpandedChanged: (cb) =>
    ipcRenderer.on('frontmatterExpanded:changed', (_e, expanded) => cb(expanded)),
  // 4T-0414 (Epic 3E-0078): Multi-Window-Broadcast bei Aenderung von
  // scripts.run (Skript-Bloecke ausfuehren).
  onPerspectiveScriptsChanged: (cb) =>
    ipcRenderer.on('perspectiveScripts:changed', (_e, enabled) => cb(enabled)),
  // 4T-0292 (Epic 3E-0052): Erweiterungs-Schalt-Zustand der Preload-
  // Pipeline setzen — baut beide markdown-it-Instanzen mit dem aktiven
  // Plugin-Satz neu auf (Muster configureTaskStates; Aufruf beim App-Start
  // und bei jedem extensions:changed-Broadcast).
  configureExtensions: (disabledIds) => configureExtensions(disabledIds),
  // 4T-0292: Multi-Window-Broadcast bei Aenderung von extensions.disabled.
  onExtensionsChanged: (cb) => ipcRenderer.on('extensions:changed', (_e, ids) => cb(ids)),
  // --- 4T-0298 (Epic 3E-0053): externe Erweiterungen -------------------------
  // Verzeichnis-Scan, Vertrauens-Dialog, Entfernen und Explorer-Zugang
  // laufen im Main (IDs statt Pfade, Whitelist gegen den Scan-Stand);
  // die Markdown-Plugin-Konfiguration evaluiert der Preload-Loader.
  scanExternalExtensions: () => ipcRenderer.invoke('extensions:scanExternal'),
  confirmExternalExtensionTrust: (id) => ipcRenderer.invoke('extensions:confirmTrust', id),
  removeExternalExtension: (id) => ipcRenderer.invoke('extensions:removeExternal', id),
  openExternalExtensionsDir: () => ipcRenderer.invoke('extensions:openDir'),
  // 4T-0927 (Epic 3E-0016): Zugang zu den Entwickler-Werkzeugen, seit dem
  // Entfall des Menueeintrags der einzige. Das Umschalten ist eine Faehigkeit
  // des Hauptprozesses und braucht deshalb den Weg ueber die Prozess-Grenze;
  // der Handler trifft genau das Fenster, aus dem der Aufruf kommt.
  toggleDevTools: () => ipcRenderer.invoke('window:toggleDevTools'),
  configureExternalMarkdownPlugins: (descriptors) => configureExternalExtensions(descriptors),
  // Multi-Window-Broadcast bei Aenderung von extensionsExternal.enabled.
  onExternalExtensionsChanged: (cb) => ipcRenderer.on('extensionsExternal:changed', () => cb()),
  // 4T-0289 (Epic 3E-0051): Multi-Window-Broadcast bei Aenderung des
  // Sidebar-Layouts (sidebar.layout).
  onSidebarLayoutChanged: (cb) =>
    ipcRenderer.on('sidebarLayout:changed', (_e, layout) => cb(layout)),
  // 4T-0624 (Epic 3E-0119): Multi-Window-Broadcast bei Aenderung der
  // globalen Sidebar-Varianten (sidebar.layoutVariants).
  onSidebarLayoutVariantsChanged: (cb) =>
    ipcRenderer.on('sidebarLayoutVariants:changed', (_e, variants) => cb(variants)),
  // 4T-0049: Frontmatter-Daten fuer Renderer-Konsumenten. Wird in 4T-0050
  // (Aliases) und 4T-0051 (Properties-Editor) genutzt. Liefert
  // { raw, data, body, parseError, endOffset } analog extractFrontmatter.
  getFrontmatter: (text) => extractFrontmatter(text),
  // 4T-0051: Round-Trip-Schreiben von Frontmatter-Feldern. Liefert den
  // neuen Datei-Text zurueck (Renderer ruft danach api.saveFile auf).
  // Erhaltung von Kommentaren und Stil fuer nicht-geaenderte Felder.
  writeFrontmatter: (text, newData, options) => writeFrontmatter(text, newData, options),
  // 4T-0014: Slug-Berechnung im Renderer-Modul verfuegbar machen,
  // damit das Outline-Panel im Render-Modus den passenden DOM-Anker findet.
  slugifyHeading: (text) => githubLikeSlug(String(text || '')),

  // 4T-0041: Konverter perspective-table → inline HTML-Tabelle. Liefert den
  // konvertierten Markdown-Text fuer den Export 'Portables Markdown'.
  // 4T-0512 (Epic 3E-0092): lang fuer die lokalisierten Texte der
  // statischen Ereignis-Tabelle im Export (Default 'de').
  convertMarkdownPortable: (text, lang) => convertMarkdownPortable(text, true, lang),

  // 4T-0213 (Epic 3E-0042): gebuendelte Handbuch-Seite aus dem Main holen
  // (Markdown-Quelltext; pageId wird im Main gegen die Registry geprueft).
  // Der fruehere perspective-table-Spezialweg (4T-0036) ist mit 4T-0216 hierin
  // aufgegangen.
  getManualPageContent: (pageId, locale) =>
    ipcRenderer.invoke('help:getManualPage', pageId, locale),

  // 4T-0758 (Epic 3E-0142): alle gebuendelten Handbuch-Seiten einer Sprache
  // in einem Zug, fuer die Suche ueber das ganze Handbuch. Ein Einzel-Abruf
  // je Seite waere hier sinnlos, weil die Suche immer alle Seiten braucht,
  // und kostete rund drei Dutzend Prozess-Grenzen je Suchlauf.
  getAllManualPages: (locale) => ipcRenderer.invoke('help:getAllManualPages', locale),

  // 4T-0015: Backlinks. requestBacklinks registriert den Owner (Fenster +
  // Pane) auf der Wurzel, releaseBacklinks gibt ihn frei (B-01, 4T-0175).
  // onBacklinksInvalidated meldet Watcher-Updates aus dem Main.
  requestBacklinks: (filePath, paneIdx) =>
    ipcRenderer.invoke('backlinks:request', { filePath, paneIdx }),
  releaseBacklinks: (filePath, paneIdx) =>
    ipcRenderer.invoke('backlinks:release', { filePath, paneIdx }),
  // B-13 (4T-0175): Klick-Fallback ueber den Backlinks-Index, wenn das
  // dokument-relative Wiki-Ziel nicht existiert.
  resolveWikiTargetInIndex: (filePath, basename) =>
    ipcRenderer.invoke('wikiLink:resolveInIndex', { filePath, basename }),
  // 4T-0020: Batch-Lookup fuer den Markdown-Linter (broken-wiki-link).
  resolveWikiTargets: (filePath, basenames) =>
    ipcRenderer.invoke('linter:resolveWikiTargets', { filePath, basenames }),
  // 4T-0050: Wiki-Link-Klick mit Alias-Fallback. Renderer ruft das auf,
  // wenn die direkte Datei nicht existiert; Antwort enthaelt Kandidaten-
  // Liste und optional den aufloesenden Alias-Text.
  resolveWikiTargetByAlias: (filePath, basename) =>
    ipcRenderer.invoke('wikiLink:resolveByAlias', { filePath, basename }),
  // 4T-0055: Wiki-Embed-Datei lesen (mit optionaler Anker-Extraktion).
  // Wird vom Renderer-Postprocessing fuer Markdown-Embeds aufgerufen.
  // Antwort: { ok, path, displayPath, content } oder { ok: false, error }.
  readEmbedFile: (basePath, embedPath, anchor) =>
    ipcRenderer.invoke('embed:read', { basePath, embedPath, anchor }),
  // 4T-0056: Tag-System. Liefert Tag-Liste der Wurzel (sortiert nach
  // Haeufigkeit) und optional Datei-Liste fuer einen Filter-Tag.
  requestTags: (filePath, filterTag) =>
    ipcRenderer.invoke('tags:request', { filePath, filterTag: filterTag || null }),
  // 4T-0354 (Epic 3E-0065): Frontmatter-Abfrage (perspective-query). Auswertung
  // im Main; lang ist die Programmsprache der Formatierer (4T-1072).
  runFrontmatterQuery: (filePath, query, lang) =>
    ipcRenderer.invoke('frontmatterQuery:run', { filePath, query: query || '', lang }),
  // 4T-0935 (Befund B-08): geschriebenen Stand einer offenen Datei an den
  // Index-Overlay melden bzw. ihn zuruecknehmen (Speichern, Verwerfen,
  // Schliessen). Die gerenderte Ansicht zeigt damit auch in eingebetteten
  // Konstrukten den Stand des Editors und nicht den der Platte.
  setIndexOverlay: (filePath, content) =>
    ipcRenderer.invoke('index:overlay', { filePath, content }),
  clearIndexOverlay: (filePath) => ipcRenderer.invoke('index:overlay', { filePath, content: null }),
  // 4T-0504 (Epic 3E-0096): Rueckschreiben aus der Abfrage-Ansicht — zeilen-
  // genaue Ersetzung in einer nicht im Fenster geoeffneten Quelldatei
  // (Konflikt-Antwort { ok:false, reason } statt Blind-Schreiben).
  applyTaskLineEdit: (params) => ipcRenderer.invoke('task:applyLineEdit', params),
  // 4T-0413 (Epic 3E-0078): Daten-Snapshot fuer Skript-Bloecke — der
  // Renderer reicht ihn mit dem Run-Auftrag in die Sandbox (kein Live-Kanal).
  getPerspectiveScriptData: (filePath) =>
    ipcRenderer.invoke('perspectiveScript:data', { filePath }),
  // 4T-0453 (Epic 3E-0084): Graph-Daten (Knoten plus Link-Kanten) fuer die
  // Graphenansicht; filePath null = Bereichs-Graph des Fenster-Bereichs.
  getGraphEdges: (filePath) => ipcRenderer.invoke('graph:edges', { filePath: filePath || null }),
  // 4T-0619 (Epic 3E-0117): Kennzahlen des Fenster-Bereichs fuer die
  // Statistik-Seite (Index-Anteil plus ergaenzender Ordner-Scan).
  collectAreaStats: () => ipcRenderer.invoke('areaStats:collect'),
  // 4T-0615 (Epic 3E-0116): Bereichs-Suchlauf ueber alle Markdown-Dateien des
  // Fenster-Bereichs. `aktiv` traegt Pfad und Editor-Stand der offenen Datei;
  // ihre Treffer stehen als erste Gruppe, und der Platten-Stand derselben
  // Datei wird dafuer ausgespart.
  searchArea: (params) => ipcRenderer.invoke('areaSearch:run', params),
  releaseAreaSearch: () => ipcRenderer.invoke('areaSearch:release'),
  // 4T-0057: Autocomplete-Suggestions fuer Wiki-Link- und Tag-Trigger.
  autocompleteWikiTargets: (filePath) =>
    ipcRenderer.invoke('autocomplete:wikiTargets', { filePath }),
  autocompleteAnchors: (filePath, basename, anchorType) =>
    ipcRenderer.invoke('autocomplete:anchors', { filePath, basename, anchorType }),
  autocompleteTags: (filePath) => ipcRenderer.invoke('autocomplete:tags', { filePath }),
  onBacklinksInvalidated: (cb) =>
    ipcRenderer.on('backlinks:invalidated', (_e, payload) => cb(payload)),

  // Multi-Window
  // R4-03 (4T-0170): optionaler zweiter Parameter — Tab-Payload mit
  // content/dirty fuer den verlustfreien "In neues Fenster verschieben"-Pfad.
  openNewWindow: (initialTabs, initialTabPayload) =>
    ipcRenderer.invoke('window:openNew', initialTabs, initialTabPayload),
  // 4T-0319 (Epic 3E-0057): neue logische Applikation mit leerem Fenster.
  newApplication: () => ipcRenderer.invoke('app:newApplication'),
  // 4T-0322 (Epic 3E-0058): Bereich oeffnen (Ordner-Dialog bzw. direkter
  // Pfad) und Bereich schliessen (alle Fenster der Bereichs-App).
  openArea: () => ipcRenderer.invoke('area:open'),
  openAreaPath: (rootPath) => ipcRenderer.invoke('area:openPath', rootPath),
  // 4T-0632 (Epic 3E-0102): Demo-Area erstellen (Dialog-Weg) bzw. direkter
  // Pfad-Einstieg ohne Dialog (Tests; Muster openAreaPath).
  createDemoArea: () => ipcRenderer.invoke('demoArea:create'),
  createDemoAreaAt: (targetDir) => ipcRenderer.invoke('demoArea:createAt', targetDir),
  closeArea: () => ipcRenderer.invoke('area:close'),
  // 4T-0843 (Epic 3E-0147): Buecher. Eigener Namensraum statt flacher
  // book*-Namen, weil der Block als Ganzes zu einer schaltbaren Erweiterung
  // gehoert und der Renderer ihn an EINER Stelle greift.
  //
  // getState liefert { active: null | { bookDir, bookFileName, tree,
  // readingOrder, unlinked, missing, missingSuggestions } } fuer die
  // Applikation des Fensters; `missingSuggestions` bildet einen fehlenden
  // Kapitel-Pfad auf seine namensgleichen Funde ab (4T-0848, nur Eintraege
  // mit Fund). `tree` ist der Kapitel-Baum aus { path, children }-Knoten mit
  // buch-relativen Pfaden. onStateChanged meldet jedes Oeffnen, Schliessen,
  // Anlegen und die Sitzungs-Wiederherstellung an alle Fenster der App.
  books: {
    getState: () => ipcRenderer.invoke('books:getState'),
    openDialog: () => ipcRenderer.invoke('books:openDialog'),
    createDialog: () => ipcRenderer.invoke('books:createDialog'),
    close: () => ipcRenderer.invoke('books:close'),
    openChapter: (relPath) => ipcRenderer.invoke('books:openChapter', relPath),
    onStateChanged: (cb) => ipcRenderer.on('books:stateChanged', (_e, state) => cb(state)),
    // Dialog-freie Pfad-Einstiege beider Wege (Muster openAreaPath und
    // createDemoAreaAt): identische Strecke ab der Ordner-Wahl, damit
    // Oeffnen und Anlegen ohne den nativen Dialog automatisiert pruefbar
    // sind.
    openPath: (bookDir) => ipcRenderer.invoke('books:openPath', bookDir),
    createAt: (parentDir, name) => ipcRenderer.invoke('books:createAt', { parentDir, name }),
    // 4T-0845 (Story 4S-0754): Struktur-Pflege. EINE Baum-Operation je Aufruf;
    // waehrend eines Zuges wird nichts geschrieben, erst die Ablage loest
    // genau einen applyTreeOp aus. Op-Formen (`parentPath: null` = oberste
    // Ebene, `index: null` = ans Ende der Ziel-Ebene):
    //   { type: 'insert', path, parentPath, index }
    //   { type: 'remove', path }
    //   { type: 'moveWithinLevel', path, direction: 'up'|'down' }
    //   { type: 'move', path, parentPath, index }
    //   { type: 'indent', path }
    //   { type: 'outdent', path }
    // Ergebnis { ok } bzw. { ok: false, error }; eine abgelehnte Operation
    // schreibt nichts. createChapter legt genau eine leere Markdown-Datei an
    // (im Ordner der Eltern-Kapitel-Datei, auf oberster Ebene im Buch-Ordner)
    // und haengt sie unmittelbar ein.
    applyTreeOp: (op) => ipcRenderer.invoke('books:applyTreeOp', op),
    createChapter: (parentPath, name) =>
      ipcRenderer.invoke('books:createChapter', { parentPath, name }),
    // 4T-0847 (Story 4S-0756): Kapitel-Datei physisch innerhalb des
    // Buch-Ordners verschieben. Der Ordner-Dialog läuft im Main, das Ziel
    // MUSS im Buch-Ordner liegen; die Links des Bestands und der
    // Kapitel-Baum-Eintrag der Begleitdatei ziehen im selben Zug nach.
    // Ergebnis { ok: true, relPath, path, linkUpdate }, { ok: false,
    // canceled: true } beim Abbruch des Dialogs oder { ok: false, error }.
    // moveChapterFileTo ist der dialogfreie Pfad-Einstieg (Muster openPath).
    moveChapterFile: (relPath) => ipcRenderer.invoke('books:moveChapterFile', relPath),
    moveChapterFileTo: (relPath, targetDir) =>
      ipcRenderer.invoke('books:moveChapterFileTo', { relPath, targetDir }),
    // 4T-0848 (Story 4S-0757): Reparatur fehlender Kapitel. suggestMissing
    // liefert { ok: true, suggestions: [buch-relative Pfade] } — namensgleiche
    // Dateien an anderer Stelle des Buch-Ordners, nie automatisch uebernommen.
    // reassignChapter ordnet dem Baum-Eintrag eine andere Datei zu (`newPath`
    // buch-relativ oder absolut, immer im Buch-Ordner); die Baum-Position
    // bleibt. reassignChapterDialog ist derselbe Weg mit vorgeschaltetem
    // Datei-Dialog des Main-Prozesses (Muster moveChapterFile) und meldet den
    // Abbruch als { ok: false, canceled: true }.
    suggestMissing: (missingPath) => ipcRenderer.invoke('books:suggestMissing', missingPath),
    reassignChapter: (missingPath, newPath) =>
      ipcRenderer.invoke('books:reassignChapter', { missingPath, newPath }),
    reassignChapterDialog: (missingPath) =>
      ipcRenderer.invoke('books:reassignChapterDialog', missingPath),
  },
  // 4T-0867 (Epic 3E-0162): Buecherregale — Zustand des aktiven Regals,
  // beide Oeffnungswege, Neuanlage, Schliessen und die Zuordnung. Die
  // dialog-freien Pfad-Einstiege (openPath, createAt) spiegeln das
  // books-Muster und tragen die automatisierte Pruefung.
  shelves: {
    getState: () => ipcRenderer.invoke('shelves:getState'),
    // 4T-0868: Anzeige-Daten der Regal-Ansicht und das Oeffnen der Seite
    // (der Main meldet es bei jedem Regal-Oeffnen-Weg).
    getViewData: () => ipcRenderer.invoke('shelves:getViewData'),
    onOpenPage: (cb) => ipcRenderer.on('shelves:openPage', () => cb()),
    openDialog: () => ipcRenderer.invoke('shelves:openDialog'),
    createDialog: () => ipcRenderer.invoke('shelves:createDialog'),
    close: () => ipcRenderer.invoke('shelves:close'),
    onStateChanged: (cb) => ipcRenderer.on('shelves:stateChanged', (_e, state) => cb(state)),
    openPath: (shelfDir) => ipcRenderer.invoke('shelves:openPath', shelfDir),
    createAt: (parentDir, name) => ipcRenderer.invoke('shelves:createAt', { parentDir, name }),
    assignBook: (dirName) => ipcRenderer.invoke('shelves:assignBook', dirName),
    unassignBook: (dirName) => ipcRenderer.invoke('shelves:unassignBook', dirName),
  },
  // 4T-0327 (Epic 3E-0059): Verzeichnis-Listing fuer das Bereichs-Panel.
  areaListDir: (dirPath) => ipcRenderer.invoke('area:listDir', dirPath),
  // 4T-0328: neue Markdown-Datei im Bereichs-Ordner anlegen; Struktur-
  // Aenderungen im Bereich meldet der Main-Watcher debounced.
  areaCreateFile: (dirPath, name) => ipcRenderer.invoke('area:createFile', { dirPath, name }),
  onAreaChanged: (cb) => ipcRenderer.on('area:changed', () => cb()),
  reportPanes: (panes) => ipcRenderer.invoke('window:reportPanes', panes),
  // 4T-0368 (Epic 3E-0068): Unbenannt-Tabs mit Inhalt beim Schliessen als
  // Entwurf sichern (additiv im Main). Payload: [{ content, tabSettings, order }].
  saveDrafts: (drafts) => ipcRenderer.invoke('drafts:save', drafts),
  reportMenuState: (state) => ipcRenderer.invoke('window:reportMenuState', state),
  // 4T-0012: Tab in bestehendes Fenster verschieben/kopieren und Titel-Suffix
  notifyWindowMeta: (meta) => ipcRenderer.invoke('window:metaChanged', meta),
  listWindows: () => ipcRenderer.invoke('window:list'),
  appendTabToWindow: (targetWindowId, payload) =>
    ipcRenderer.invoke('tab:appendToWindow', { targetWindowId, payload }),
  // 4T-0537 (Epic 3E-0098): Arbeitsbereichs-Lebenszyklus — benannte logische
  // Applikationen mit Ablage im Store-Key 'workspaces'. onWorkspacesChanged
  // meldet jede Ablage-Aenderung an alle Fenster (UI-Nachzug in 4T-0538).
  workspacesList: () => ipcRenderer.invoke('workspace:list'),
  workspaceSaveAs: (params) => ipcRenderer.invoke('workspace:saveAs', params),
  workspaceCreate: (params) => ipcRenderer.invoke('workspace:create', params),
  workspaceOpen: (id) => ipcRenderer.invoke('workspace:open', id),
  workspaceClose: () => ipcRenderer.invoke('workspace:close'),
  workspaceRename: (params) => ipcRenderer.invoke('workspace:rename', params),
  workspaceSetColor: (params) => ipcRenderer.invoke('workspace:setColor', params),
  workspaceDelete: (id) => ipcRenderer.invoke('workspace:delete', id),
  workspaceConfirmDelete: (name) => ipcRenderer.invoke('workspace:confirmDelete', name),
  onWorkspacesChanged: (cb) => ipcRenderer.on('workspaces:changed', () => cb()),

  // Events vom Main-Prozess
  onFileChanged: (cb) => ipcRenderer.on('file:changed', (_e, p) => cb(p)),
  onFileRemoved: (cb) => ipcRenderer.on('file:removed', (_e, p) => cb(p)),
  // 4T-0331 (Epic 3E-0060): Main meldet eine defekte .mdd (Protokollierung
  // fuer das Dokument ausgesetzt); der Renderer zeigt den Statusbar-Hinweis.
  onMddDefect: (cb) => ipcRenderer.on('mdd:defect', (_e, info) => cb(info)),
  // 4T-0332 (Epic 3E-0060): Historisierungs-Schaltung — Statusbar-Zustand
  // (wirksame Einstellung, Herkunft, .mdd vorhanden) und Bereichs-Default
  // aus der Bereichsdatei Area_Settings.mdda.
  getHistoryState: (p, content) => ipcRenderer.invoke('history:getState', p, content),
  getHistoryAreaDefault: () => ipcRenderer.invoke('history:getAreaDefault'),
  setHistoryAreaDefault: (value) => ipcRenderer.invoke('history:setAreaDefault', value),
  // 4T-0333 (Epic 3E-0060): Historien-Ansicht — Revisionsliste und
  // rekonstruierte Staende.
  getHistoryList: (p) => ipcRenderer.invoke('history:list', p),
  getHistoryRevision: (p, seq) => ipcRenderer.invoke('history:getRevision', p, seq),
  // 4T-0358 (Epic 3E-0066): Dokument-Notiz lesen/schreiben (.mdd notes-Sektion);
  // onNoteChanged meldet den Broadcast nach dem Schreiben an alle Fenster.
  readNote: (p) => ipcRenderer.invoke('note:read', p),
  writeNote: (p, text) => ipcRenderer.invoke('note:write', p, text),
  onNoteChanged: (cb) => ipcRenderer.on('note:changed', (_e, payload) => cb(payload)),
  // 4T-0363 (Epic 3E-0067): Block-Metadaten pro Block-Anker (.mdd blockData-
  // Sektion). readBlockData liefert die Anker->{values,updated}-Map;
  // writeBlockData setzt die values eines Ankers (leeres Objekt entfernt den
  // Eintrag); renameBlockAnchor benennt einen Anker-Schluessel um (Umbenennen/
  // Zuordnen); onBlockDataChanged meldet den Broadcast nach dem Schreiben an
  // alle Fenster.
  readBlockData: (p) => ipcRenderer.invoke('blockData:read', p),
  writeBlockData: (p, anchorId, values) =>
    ipcRenderer.invoke('blockData:write', p, anchorId, values),
  renameBlockAnchor: (p, fromId, toId) => ipcRenderer.invoke('blockData:rename', p, fromId, toId),
  onBlockDataChanged: (cb) => ipcRenderer.on('blockData:changed', (_e, payload) => cb(payload)),
  onOpenExternal: (cb) => ipcRenderer.on('file:openExternal', (_e, files) => cb(files)),
  // 4T-0871 (Buch = Bereich): Main zieht eine in der falschen Applikation
  // geoeffnete Buch-Datei zurueck; der Reiter wandert in die Buch-Applikation.
  onCloseExternal: (cb) => ipcRenderer.on('file:closeExternal', (_e, files) => cb(files)),
  onThemeChanged: (cb) => ipcRenderer.on('theme:changed', (_e, theme) => cb(theme)),
  // 4T-0030: Theme-Pref-Aenderung wird von Main an alle Renderer gebrodcastet,
  // damit Statusbar-Icon und Tooltip auch in anderen Fenstern synchron ziehen.
  onThemePrefChanged: (cb) => ipcRenderer.on('theme:prefChanged', (_e, pref) => cb(pref)),
  // 4T-0465 (Epic 3E-0086): Farbschema-Zustand (Objekt { custom, activeLight,
  // activeDark }) wird von Main an alle Renderer gebrodcastet (Store-Key
  // colorSchemes), damit eigene Schemas sofort in allen Fenstern greifen.
  onColorSchemeChanged: (cb) => ipcRenderer.on('colorScheme:changed', (_e, s) => cb(s)),
  onInitialState: (cb) => ipcRenderer.once('window:initialState', (_e, payload) => cb(payload)),

  // Menue-Events vom Main an den Renderer
  onMenuNew: (cb) => ipcRenderer.on('menu:new', () => cb()),
  // 4T-0319 (Epic 3E-0057): Menue-Eintrag 'Datei -> Neue Applikation'.
  onMenuNewApplication: (cb) => ipcRenderer.on('menu:newApplication', () => cb()),
  // 4T-0322 (Epic 3E-0058): Menue-Eintraege 'Bereich oeffnen...'/'Bereich schliessen'.
  onMenuOpenArea: (cb) => ipcRenderer.on('menu:openArea', () => cb()),
  onMenuCloseArea: (cb) => ipcRenderer.on('menu:closeArea', () => cb()),
  // 4T-0632 (Epic 3E-0102): Menue-Eintrag 'Datei -> Demo-Area erstellen...'.
  onMenuCreateDemoArea: (cb) => ipcRenderer.on('menu:createDemoArea', () => cb()),
  // 4T-0887 (Befund L-04): Menue-Eintrag 'Datei -> Buch und Buecherregal ->
  // Kapitel-Datei verschieben...'. Anders als Oeffnen/Anlegen/Schliessen der
  // Buecher laeuft er ueber den Renderer, weil dort entschieden wird, welche
  // Datei gemeint ist (gerade gelesenes Kapitel der aktiven Spalte).
  onMenuMoveChapterFile: (cb) => ipcRenderer.on('menu:moveChapterFile', () => cb()),
  // 4T-0538 (Epic 3E-0098): Arbeitsbereichs-Aktionen des Datei-Menues
  // (Dialoge laufen im Renderer, das Schliessen geht zurueck an den Main).
  onMenuWorkspaceSaveAs: (cb) => ipcRenderer.on('menu:workspaceSaveAs', () => cb()),
  onMenuWorkspaceCreate: (cb) => ipcRenderer.on('menu:workspaceCreate', () => cb()),
  onMenuWorkspaceClose: (cb) => ipcRenderer.on('menu:workspaceClose', () => cb()),
  onMenuWorkspaceManage: (cb) => ipcRenderer.on('menu:workspaceManage', () => cb()),
  onMenuOpenFile: (cb) => ipcRenderer.on('menu:openFile', () => cb()),
  // 4T-0338 (Epic 3E-0061): 'Datei -> Neue Unterseite...' plus Anlage-IPC.
  onMenuNewSubpage: (cb) => ipcRenderer.on('menu:newSubpage', () => cb()),
  createSubpage: (basePath, segment) => ipcRenderer.invoke('subpage:create', { basePath, segment }),
  // 4T-0424 (Epic 3E-0080): Vorlagen-Quellen — Liste des aufgeloesten
  // Vorlagen-Ordners (Bereich vor global) und Vorlagen-Inhalt; die
  // Anwendungs-Kommandos (4T-0426) und Ordner-Regeln (4T-0427) bauen darauf.
  templatesList: () => ipcRenderer.invoke('templates:list'),
  templatesRead: (relPath) => ipcRenderer.invoke('templates:read', { relPath }),
  // 4T-0426 (Epic 3E-0080): Datei mit gefuelltem Vorlagen-Inhalt anlegen
  // plus Menue-Event 'Datei -> Neue Datei aus Vorlage...'.
  templatesCreateFile: (dirPath, name, content) =>
    ipcRenderer.invoke('templates:createFile', { dirPath, name, content }),
  onMenuNewFromTemplate: (cb) => ipcRenderer.on('menu:newFromTemplate', () => cb()),
  // 4T-0427 (Epic 3E-0080): Ordner-Regel fuer eine neu angelegte Datei.
  templatesRuleFor: (filePath) => ipcRenderer.invoke('templates:ruleFor', { filePath }),
  // 4T-0428 (Epic 3E-0080): Einstellungs-Bereich "Vorlagen" — Konfigurations-
  // Stand lesen, Bereichs-Sektion schreiben, Ordner-Auswahl-Dialog.
  templatesGetConfig: () => ipcRenderer.invoke('templates:getConfig'),
  templatesSetAreaConfig: (config) => ipcRenderer.invoke('templates:setAreaConfig', config),
  templatesChooseFolder: (purpose) => ipcRenderer.invoke('templates:chooseFolder', { purpose }),
  // 4T-0431 (Epic 3E-0081): Journal-Konfiguration des Bereichs (journals-
  // Sektion der Bereichsdatei) lesen/schreiben; onJournalsChanged meldet den
  // Broadcast nach dem Schreiben an alle Fenster (Payload { rootPath }).
  journalsGetConfig: () => ipcRenderer.invoke('journals:getConfig'),
  journalsSetAreaConfig: (config) => ipcRenderer.invoke('journals:setAreaConfig', config),
  onJournalsChanged: (cb) => ipcRenderer.on('journals:changed', (_e, payload) => cb(payload)),
  // 4T-0433 (Epic 3E-0081): Anlage-/Oeffnungs-Pfad der Journal-Eintraege
  // (Existenz-Check und Anlage mit Ordner-Kette) plus Menue-Events der
  // beiden Journal-Kommandos.
  journalsStatEntry: (relPath) => ipcRenderer.invoke('journals:statEntry', { relPath }),
  journalsCreateEntry: (relPath, content) =>
    ipcRenderer.invoke('journals:createEntry', { relPath, content }),
  onMenuJournalToday: (cb) => ipcRenderer.on('menu:journalToday', () => cb()),
  onMenuJournalForDate: (cb) => ipcRenderer.on('menu:journalForDate', () => cb()),
  // 4T-0434 (Epic 3E-0081): Existenz-Batch fuer die Kalender-Punkte.
  journalsEntriesExist: (relPaths) => ipcRenderer.invoke('journals:entriesExist', { relPaths }),
  // 4T-0543 (Epic 3E-0097): Kalender-System-Konfiguration des Bereichs
  // (calendarSystems-Sektion der Bereichsdatei) lesen/schreiben;
  // onCalendarChanged meldet den Broadcast nach dem Schreiben an alle
  // Fenster (Payload { rootPath }).
  calendarGetConfig: () => ipcRenderer.invoke('calendar:getConfig'),
  calendarSetAreaConfig: (config) => ipcRenderer.invoke('calendar:setAreaConfig', config),
  // 4T-0747: Schutz der abgeleiteten Zeitrechnungen (Bestätigung bzw. Sperre).
  calendarConfirmDependents: (names) => ipcRenderer.invoke('calendar:confirmDependents', names),
  calendarBlockedDelete: (names) => ipcRenderer.invoke('calendar:blockedDelete', names),
  onCalendarChanged: (cb) => ipcRenderer.on('calendar:changed', (_e, payload) => cb(payload)),
  // 4T-0446 (Epic 3E-0083): Profil-Konfiguration des Bereichs
  // (propertyProfiles-Sektion der Bereichsdatei) lesen/schreiben;
  // onProfilesChanged meldet den Broadcast nach dem Schreiben an alle
  // Fenster (Payload { rootPath }).
  profilesGetConfig: () => ipcRenderer.invoke('profiles:getConfig'),
  profilesSetAreaConfig: (config) => ipcRenderer.invoke('profiles:setAreaConfig', config),
  onProfilesChanged: (cb) => ipcRenderer.on('profiles:changed', (_e, payload) => cb(payload)),
  // 4T-0625 (Epic 3E-0119): Bereichs-Varianten der Sidebar
  // (sidebarLayouts-Sektion der Bereichsdatei) lesen/schreiben;
  // onSidebarVariantsChanged meldet den Broadcast nach dem Schreiben an
  // alle Fenster (Payload { rootPath }).
  sidebarVariantsGetConfig: () => ipcRenderer.invoke('sidebarVariants:getConfig'),
  sidebarVariantsSetAreaConfig: (config) =>
    ipcRenderer.invoke('sidebarVariants:setAreaConfig', config),
  onSidebarVariantsChanged: (cb) =>
    ipcRenderer.on('sidebarVariants:changed', (_e, payload) => cb(payload)),
  // 4T-0611 (Epic 3E-0115): Bereichs-Lesezeichen (bookmarks-Sektion der
  // Bereichsdatei) lesen/schreiben; onBookmarksChanged meldet den Broadcast
  // nach dem Schreiben an alle Fenster (Payload { rootPath }).
  bookmarksGetConfig: () => ipcRenderer.invoke('bookmarks:getConfig'),
  bookmarksSetAreaConfig: (config) => ipcRenderer.invoke('bookmarks:setAreaConfig', config),
  onBookmarksChanged: (cb) => ipcRenderer.on('bookmarks:changed', (_e, payload) => cb(payload)),
  // 4T-0612 (Epic 3E-0115): Mehr-Fenster-Konsistenz der ALLGEMEINEN Lesezeichen.
  // Der globale Baum liegt im Store; ein Schreibvorgang in einem Fenster meldet
  // 'bookmarksTree:changed' (Payload = der neue Baum) an die uebrigen Fenster.
  onBookmarksTreeChanged: (cb) => ipcRenderer.on('bookmarksTree:changed', (_e, value) => cb(value)),
  // 4T-0447 (Epic 3E-0083): aufgeloeste Definitions-Liste fuer eine Datei.
  // assigned = Zuordnungs-Werte aus dem Live-Frontmatter (Vorrang), path =
  // Disk-Fallback ohne assigned.
  profilesResolve: (params) => ipcRenderer.invoke('profiles:resolve', params),
  // 4T-0450 (Epic 3E-0083): Profil-Liste und Ordner-Auswahl des
  // Einstellungs-Bereichs.
  profilesList: () => ipcRenderer.invoke('profiles:list'),
  profilesChooseFolder: () => ipcRenderer.invoke('profiles:chooseFolder'),
  // 4T-0339 (Epic 3E-0061): Datei umbenennen plus Nachzug-Broadcast an alle
  // Fenster (Tabs, Lesezeichen, Sitzungs-Pfade).
  onMenuRenameFile: (cb) => ipcRenderer.on('menu:renameFile', () => cb()),
  // 4T-0774 (Epic 3E-0128): Unterseite loesen — nutzt denselben Umbenennungs-
  // Pfad (renameFile) und braucht deshalb keinen eigenen Kanal zum Main.
  onMenuDetachSubpage: (cb) => ipcRenderer.on('menu:detachSubpage', () => cb()),
  // 4T-0345 (Epic 3E-0062): updateLinks steuert das automatische Link-Update
  // (Standard aktiv; false schaltet es ab, gesetzt vom Dialog aus 4T-0346).
  renameFile: (oldPath, newBasename, updateLinks) =>
    ipcRenderer.invoke('file:rename', { oldPath, newBasename, updateLinks }),
  onFileRenamed: (cb) => ipcRenderer.on('file:renamed', (_e, payload) => cb(payload)),
  // 4T-0345 (Epic 3E-0062): Vorschau-Trefferzahl (Dry-Run vor dem Umbenennen)
  // und Broadcast nach angewendetem Link-Update (Tabs nachziehen bzw. Buffer-Fix).
  renameLinkUpdatePreview: (oldPath, newBasename) =>
    ipcRenderer.invoke('rename:linkUpdatePreview', { oldPath, newBasename }),
  onLinkUpdateApplied: (cb) => ipcRenderer.on('linkUpdate:applied', (_e, payload) => cb(payload)),
  // 4T-0340 (Epic 3E-0061): Nachfahren-Liste fuer den Kaskaden-Hinweis.
  subpageDescendants: (p) => ipcRenderer.invoke('subpage:descendants', p),
  // 4T-0341 (Epic 3E-0061): 'Ansicht -> Unterseiten'.
  onMenuToggleSubpages: (cb) => ipcRenderer.on('menu:toggleSubpages', () => cb()),
  onMenuViewChange: (cb) => ipcRenderer.on('menu:viewChange', (_e, mode) => cb(mode)),
  onMenuToggleLineNumbers: (cb) => ipcRenderer.on('menu:toggleLineNumbers', () => cb()),
  onMenuToggleWordWrap: (cb) => ipcRenderer.on('menu:toggleWordWrap', () => cb()),
  onMenuSave: (cb) => ipcRenderer.on('menu:save', () => cb()),
  onMenuSaveAs: (cb) => ipcRenderer.on('menu:saveAs', () => cb()),
  // 4T-0041: Menu-Event 'Datei -> Exportieren -> Portables Markdown...'
  onMenuExportPortable: (cb) => ipcRenderer.on('menu:exportPortable', () => cb()),
  // 4T-0303 (Epic 3E-0054): Menu-Event 'Datei -> Als PDF exportieren...'
  onMenuExportPdf: (cb) => ipcRenderer.on('menu:exportPdf', () => cb()),
  onMenuToggleAutoSave: (cb) => ipcRenderer.on('menu:toggleAutoSave', () => cb()),
  // 4T-0013: Menue-Eintrag "Ansicht -> Gliederung" sendet diesen Event;
  // Renderer toggelt die Sichtbarkeit der Folding-Spuren im aktiven Tab.
  onMenuToggleFoldGutter: (cb) => ipcRenderer.on('menu:toggleFoldGutter', () => cb()),
  // 4T-0014: Menue-Eintrag "Ansicht -> Inhaltsverzeichnis" sendet diesen
  // Event; Renderer toggelt die Outline-Sichtbarkeit der aktiven Spalte.
  onMenuToggleOutline: (cb) => ipcRenderer.on('menu:toggleOutline', () => cb()),
  // 4T-0015: Menue-Eintrag "Ansicht -> Backlinks" toggelt die Backlinks-
  // Sichtbarkeit der aktiven Spalte.
  onMenuToggleBacklinks: (cb) => ipcRenderer.on('menu:toggleBacklinks', () => cb()),
  // 4T-0073 (Epic 3E-0013): Menue-Eintrag "Ansicht -> Outgoing-Links" toggelt
  // die Outgoing-Links-Sektion der aktiven Spalte.
  onMenuToggleOutgoingLinks: (cb) => ipcRenderer.on('menu:toggleOutgoingLinks', () => cb()),
  // 4T-0075 (Epic 3E-0013): "Datei -> Lesezeichen -> Aktive Datei merken"
  // sowie der Ansichts-Menue-Toggle fuer die Lesezeichen-Sektion.
  onMenuBookmarkAdd: (cb) => ipcRenderer.on('menu:bookmarkAdd', () => cb()),
  onMenuToggleBookmarks: (cb) => ipcRenderer.on('menu:toggleBookmarks', () => cb()),
  // 4T-0019: Menue-Eintraege "Ansicht -> Fokus-Modus" und "-> Typewriter-Scroll".
  onMenuToggleFocusMode: (cb) => ipcRenderer.on('menu:toggleFocusMode', () => cb()),
  onMenuToggleTypewriterScroll: (cb) => ipcRenderer.on('menu:toggleTypewriterScroll', () => cb()),
  // 4T-0697 (Epic 3E-0141): Menue-Eintraege "Ansicht -> Linke/Rechte Sidebar
  // einklappen" — toggeln die jeweilige Sidebar-Spalte der aktiven Pane-Group.
  onMenuToggleSidebarLeft: (cb) => ipcRenderer.on('menu:toggleSidebarLeft', () => cb()),
  onMenuToggleSidebarRight: (cb) => ipcRenderer.on('menu:toggleSidebarRight', () => cb()),
  // 4T-0019: Menue-Eintrag "Ansicht -> Bearbeiten" (Strg+E). Ersetzt den
  // bisherigen Renderer-only-Tastenkuerzel.
  onMenuToggleEdit: (cb) => ipcRenderer.on('menu:toggleEdit', () => cb()),
  // 4T-0070: Scroll-Synchronisation toggeln (Menue-Klick).
  onMenuToggleScrollSync: (cb) => ipcRenderer.on('menu:toggleScrollSync', () => cb()),
  onMenuOpenHelp: (cb) => ipcRenderer.on('menu:openHelp', () => cb()),
  onMenuOpenAbout: (cb) => ipcRenderer.on('menu:openAbout', () => cb()),
  // 4T-0644 (Epic 3E-0127): Menü-Eintrag „Hilfe -> Produkt-Tour" startet die
  // geführte Tour im Renderer (manueller Start, ohne Nutzlast).
  onMenuStartTour: (cb) => ipcRenderer.on('menu:startTour', () => cb()),
  // 4T-0018: Settings-Dialog ueber Menue-Eintrag Datei -> Einstellungen.
  onMenuOpenSettings: (cb) => ipcRenderer.on('menu:openSettings', () => cb()),
  // 4T-0333 (Epic 3E-0060): Historien-Ansicht des aktiven Dokuments.
  onMenuOpenHistory: (cb) => ipcRenderer.on('menu:openHistory', () => cb()),
  // 4T-0455 (Epic 3E-0084): Bereichs-Graph als read-only Tab.
  onMenuOpenAreaGraph: (cb) => ipcRenderer.on('menu:openAreaGraph', () => cb()),
  // 4T-0620 (Epic 3E-0117): Bereichs-Statistik als read-only Tab.
  onMenuOpenAreaStats: (cb) => ipcRenderer.on('menu:openAreaStats', () => cb()),
  // 4T-0480 (Epic 3E-0089): Kommando-Palette ueber Menue-Eintrag Ansicht.
  onMenuOpenCommandPalette: (cb) => ipcRenderer.on('menu:openCommandPalette', () => cb()),
  // 4T-0456 (Epic 3E-0084): Datei-Graph-Sidebar-Sektion toggeln.
  onMenuToggleFileGraph: (cb) => ipcRenderer.on('menu:toggleFileGraph', () => cb()),
  // 4T-0568 (Epic 3E-0104): zentraler Toggle-Kanal des Panel-Untermenues
  // (Payload = Panel-ID aus dem shared Modell); die Einzel-Kanaele oben
  // bleiben fuer Alt-Sender bestehen.
  onMenuTogglePanel: (cb) => ipcRenderer.on('menu:togglePanel', (_e, id) => cb(id)),
  // 4T-0626 (Epic 3E-0119): Untermenue „Sidebar-Anordnungen" — Standard-
  // Anordnung wiederherstellen, Variante anwenden (Payload
  // { scope: 'global'|'area', id }), aktuelle Anordnung speichern.
  onMenuResetSidebarLayout: (cb) => ipcRenderer.on('menu:resetSidebarLayout', () => cb()),
  onMenuApplySidebarVariant: (cb) =>
    ipcRenderer.on('menu:applySidebarVariant', (_e, payload) => cb(payload)),
  onMenuSaveSidebarVariant: (cb) => ipcRenderer.on('menu:saveSidebarVariant', () => cb()),
  // 4T-0569 (Epic 3E-0104): Fenster-Broadcast der Panel-Toggle-Reihenfolge
  // (Muster onSidebarLayoutChanged).
  onPanelToggleOrderChanged: (cb) =>
    ipcRenderer.on('panelToggleOrder:changed', (_e, order) => cb(order)),
  // 4T-0520 (Epic 3E-0094): Fenster-Broadcast der Kommando-Platzierung
  // (Muster onPanelToggleOrderChanged).
  onCommandPlacementChanged: (cb) =>
    ipcRenderer.on('commandPlacement:changed', (_e, value) => cb(value)),
  // 4T-0607 (Epic 3E-0114): Fenster-Broadcast der Format-Toolbar-Belegung
  // (Muster onCommandPlacementChanged).
  onFormatToolbarChanged: (cb) => ipcRenderer.on('formatToolbar:changed', (_e, value) => cb(value)),
  // 4T-0372 (Epic 3E-0069): Fenster-Broadcast der Uhr-Anzeige-Optionen.
  onClockOptionsChanged: (cb) => ipcRenderer.on('clock:changed', (_e, value) => cb(value)),
  // 4T-0527 (Epic 3E-0095): Erinnerungs-Sidebar-Sektion toggeln.
  onMenuToggleReminders: (cb) => ipcRenderer.on('menu:toggleReminders', () => cb()),
  // 4T-0051: Properties-Sidebar-Sektion ueber Menue-Eintrag Ansicht -> Properties.
  onMenuToggleProperties: (cb) => ipcRenderer.on('menu:toggleProperties', () => cb()),
  // 4T-0359 (Epic 3E-0066): Notizen-Sidebar-Sektion ueber Menue-Eintrag Ansicht -> Notizen.
  onMenuToggleNotes: (cb) => ipcRenderer.on('menu:toggleNotes', () => cb()),
  // 4T-0364 (Epic 3E-0067): Block-Eigenschaften-Sidebar-Sektion ueber Menue.
  onMenuToggleBlockProps: (cb) => ipcRenderer.on('menu:toggleBlockProps', () => cb()),
  // 4T-0056: Tag-Sidebar-Sektion ueber Menue-Eintrag Ansicht -> Tags.
  onMenuToggleTags: (cb) => ipcRenderer.on('menu:toggleTags', () => cb()),
  // 4T-0018: Multi-Window-Broadcast bei appearance.*-Aenderung.
  onAppearanceChanged: (cb) => ipcRenderer.on('appearance:changed', (_e, payload) => cb(payload)),
  // M-08 (4T-0185): Multi-Window-Broadcast bei Sprachwechsel.
  onLanguageChanged: (cb) => ipcRenderer.on('language:changed', (_e, lang) => cb(lang)),
  onMenuToggleRestoreSession: (cb) => ipcRenderer.on('menu:toggleRestoreSession', () => cb()),
  // 4T-0030: Menue-Eintrag 'Ansicht -> Theme -> Hell/Dunkel/System' sendet den
  // gewaehlten Wert; der Renderer ruft daraufhin setThemePref.
  onMenuSetTheme: (cb) => ipcRenderer.on('menu:setTheme', (_e, value) => cb(value)),

  // Window-Close-Anfrage: Main fragt nach Bestaetigung; Renderer prueft
  // Dirty-Tabs und ruft confirmClose() zurueck.
  onWindowRequestClose: (cb) => ipcRenderer.on('window:requestClose', () => cb()),
  // M-01 (4T-0173): Nutzer hat Schliessen/Beenden abgebrochen — Main setzt
  // isQuitting zurueck, damit die Session-Persistenz wieder greift.
  cancelWindowClose: () => ipcRenderer.invoke('window:cancelClose'),

  // 4T-0012: Display-Nummer und Gesamtzahl der Fenster — wird bei jedem
  // Open/Close vom Main gepusht, bestimmt den `(Fenster N)`-Suffix im Titel.
  onWindowDisplayInfo: (cb) => ipcRenderer.on('window:displayInfo', (_e, info) => cb(info)),
  // 4T-0012: Tab-Append-Event vom Main, ausgeloest durch Verschieben/Kopieren
  // aus einem anderen Fenster. Payload = { path, content, dirty, settings,
  // untitledIndex }.
  onAppendTabFromOtherWindow: (cb) =>
    ipcRenderer.on('tab:appendFromOtherWindow', (_e, payload) => cb(payload)),
});
