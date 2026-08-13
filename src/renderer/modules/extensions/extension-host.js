// 4T-0299/4T-0298 (Epic 3E-0053): Host der externen Erweiterungen —
// API-v1-Fassade, Aktivierungs-Zustand und Fehler-Isolation.
//
// Lade-Modell (Spike-Ergebnis 4T-0298): der UI-Einstiegspunkt (Manifest-
// Feld `entry`) ist ein ES-Modul, das der Renderer per dynamischem
// import() von seiner file://-URL lädt (die CSP `script-src 'self'`
// erlaubt file->file-Modul-Importe; eval/new Function/blob sind bewusst
// blockiert). Der Render-Beitrag (`markdownPlugin`) läuft NICHT hier: die
// markdown-it-Instanzen leben im Preload, dessen Loader evaluiert die
// Datei per node:vm in einem leeren Sandbox-Kontext (kein require, kein
// process) und registriert sie über configureExternalMarkdownPlugins.
//
// API-Oberfläche v1 (Vertrag, klein geschnitten — alles andere ist
// nicht-öffentlich): der default-Export des Einstiegs-Moduls liefert
// activate(ctx) und optional deactivate(). ctx bietet genau die sechs
// Beitrags-Arten der Konzeption (4T-0225): markdown-it-Plugin (über das
// Manifest), registerSidebarPanel, registerCommand (hotkey-fähig über den
// Tastenkürzel-Editor), registerSettingsSection, Lese-Zugriff auf Theme-
// Variablen/Theme/Sprache sowie eigene Übersetzungen mit Fallback auf die
// Standard-Sprache der Erweiterung (addTranslations/ctx.t). Dazu ein
// kleiner storage-Namensraum (extensionData.<id>) für die Werte eigener
// Einstellungs-Bereiche. Die Fassade reicht keine internen Objekte durch
// (keine CodeMirror-Views, kein State-Objekt, keine Modul-Referenzen).
//
// API v1.1 (4T-0825, Epic 3E-0103): dazu der Render-Andockpunkt
// getRenderRoot(paneIdx)/onRenderUpdated(cb). Er schliesst die Luecke, die
// der erste ernsthafte Bau einer Erweiterung offengelegt hat — ohne ihn
// kommt ein Panel nicht an das angezeigte Dokument und muesste App-internes
// DOM raten. Der Schritt ist abwaertskompatibel: Pakete mit apiVersion 1.0
// laufen unveraendert.
//
// Vertrauensmodell (Product-Owner-Entscheidung, 4T-0225/Epic): keine
// Sandbox im Renderer — aktivierter Code hat vollen DOM- und App-Zugriff.
// Deshalb starten neu erkannte Erweiterungen deaktiviert, die Aktivierung
// verlangt den Warn-Dialog (Main, je Erweiterung und Version persistiert),
// und alle Lade-/Hook-Pfade sind fehler-isoliert: eine werfende
// Erweiterung wird zurückgerollt, automatisch deaktiviert und mit
// Fehlertext im Einstellungs-Bereich angezeigt — die App läuft weiter.
//
// Bewusst KEIN Import aus App-Modulen (nur api.js, i18n.js und die
// Electron-freien Shared-Module; sidebar-layout.js ist ein importfreies
// Basis-Modul): App-Andockpunkte mit Zyklen-Risiko (commandHandlers,
// Bereichs-Registry der Einstellungs-Seite) hängt app-init.js zur
// Laufzeit über attachExtensionHostRuntime an (attach-Muster, Begründung
// im Kopf-Kommentar von sidebar-layout.js).
'use strict';

import { api } from '../app/api.js';
import {
  getLanguage,
  registerExtensionTranslations,
  unregisterExtensionTranslations,
  tExtension,
} from '../../i18n.js';
import {
  registerExternalExtension,
  unregisterExternalExtension,
} from '../../../shared/extensions/extensions.js';
import {
  registerDynamicCommand,
  unregisterDynamicCommand,
} from '../../../shared/commands/commands.js';
import {
  EXTENSION_API_VERSION,
  EXTERNAL_ENABLED_KEY,
  EXTERNAL_TRUSTED_KEY,
  EXTERNAL_ERRORS_KEY,
  normalizeEnabledIds,
  normalizeTrustedMap,
  normalizeErrorMap,
  externalExtensionStatus,
} from '../../../shared/extensions/extensions-external.js';
import {
  applySidebarLayout,
  getSidebarLayout,
  registerSidebarPanel,
  unregisterSidebarPanel,
} from '../sidebar-layout.js';

// --- App-Andockpunkte (attach-Muster) ----------------------------------------------
// app-init.js hängt zur Laufzeit an: commandHandlers (Dispatcher-Ziel),
// registerSettingsSection/unregisterSettingsSection (Bereichs-Registry der
// Einstellungs-Seite). Bis dahin (und in isolierten Unit-Tests) sind die
// betroffenen Beitrags-Arten No-ops.
let runtime = null;

export function attachExtensionHostRuntime(hooks) {
  if (hooks && typeof hooks === 'object') runtime = hooks;
}

// --- Persist-Helfer -----------------------------------------------------------------
// Wie extension-lifecycle: schlanker api-Fallback, app-init hängt
// persistSetting (Statusbar-Feedback) an.
let persistFn = async (key, value) => {
  try {
    await api.setSetting(key, value);
    return true;
  } catch (err) {
    console.warn('setSetting fehlgeschlagen:', key, err);
    return false;
  }
};

export function attachExternalPersistence(fn) {
  if (typeof fn === 'function') persistFn = fn;
}

// --- Laufzeit-Zustand ---------------------------------------------------------------
// entries: letzter Scan-Stand aus dem Main (inkl. entryUrl je gültigem
// Paket). enabledIds/trustedMap/errorMap spiegeln die Store-Schlüssel.
// activeExtensions: tatsächlich geladene Erweiterungen mit Rollback-Daten.
let entries = [];
let enabledIds = [];
let trustedMap = {};
let errorMap = {};
const activeExtensions = new Map(); // id -> { module, disposer }

function entryById(id) {
  return entries.find((e) => e.ok && e.manifest.id === id) || null;
}

// Anzeige-Zustand für den Einstellungs-Bereich (4T-0300): Scan-Einträge
// plus abgeleiteter Status. 'active' zeigt den WIRKLICH geladenen Zustand
// (nicht nur den gewollten) — eine beim Laden gescheiterte Erweiterung
// steht bereits auf 'error'.
export function externalExtensionEntries() {
  return entries.map((entry) => {
    const status = entry.ok
      ? activeExtensions.has(entry.manifest.id)
        ? 'active'
        : externalExtensionStatus(entry, enabledIds, trustedMap, errorMap)
      : 'invalid';
    return {
      ...entry,
      status,
      lastError: entry.ok ? errorMap[entry.manifest.id] || null : entry.error || null,
    };
  });
}

export function isExternalExtensionActive(id) {
  return activeExtensions.has(id);
}

// --- Fehler-Protokoll ---------------------------------------------------------------
// Lade-Fehler deaktivieren automatisch (Enabled-Liste) und persistieren
// den Fehlertext für die Anzeige — auch über den Neustart hinweg.
async function recordLoadError(id, message) {
  errorMap = { ...errorMap, [id]: String(message || 'Unbekannter Fehler') };
  await persistFn(EXTERNAL_ERRORS_KEY, errorMap);
  if (enabledIds.includes(id)) {
    enabledIds = enabledIds.filter((x) => x !== id);
    await persistFn(EXTERNAL_ENABLED_KEY, enabledIds);
  }
  console.warn(`Externe Erweiterung '${id}' deaktiviert:`, message);
}

async function clearLoadError(id) {
  if (!errorMap[id]) return;
  errorMap = { ...errorMap };
  delete errorMap[id];
  await persistFn(EXTERNAL_ERRORS_KEY, errorMap);
}

// --- Übersetzungs-Verwaltung ---------------------------------------------------------
// Erweiterungs-Bundles plus synthetische Einträge (literale Titel von
// Panels/Kommandos/Bereichen werden unter synthetischen Keys abgelegt,
// damit registry-getriebene Konsumenten einheitlich über t() auflösen).
const translationState = new Map(); // id -> { bundles, defaultLocale, synthetic }

function applyTranslationState(id) {
  const state = translationState.get(id);
  if (!state) return;
  const merged = { ...state.bundles };
  const base = { ...(merged[state.defaultLocale] || {}), ...state.synthetic };
  merged[state.defaultLocale] = base;
  registerExtensionTranslations(id, merged, state.defaultLocale);
}

function ensureTranslationState(id) {
  if (!translationState.has(id)) {
    translationState.set(id, { bundles: {}, defaultLocale: 'en', synthetic: {} });
  }
  return translationState.get(id);
}

// Liefert den global auflösbaren i18n-Key für eine Beitrags-Definition:
// bevorzugt def.titleKey (erweiterungs-lokal, wird präfixiert), sonst wird
// def.title als Literal unter einem synthetischen Key abgelegt.
function contributionTitleKey(id, def, syntheticKey) {
  if (typeof def.titleKey === 'string' && def.titleKey !== '') {
    return `ext.${id}.${def.titleKey}`;
  }
  const state = ensureTranslationState(id);
  state.synthetic[syntheticKey] = typeof def.title === 'string' ? def.title : syntheticKey;
  applyTranslationState(id);
  return `ext.${id}.${syntheticKey}`;
}

// --- Rollback-Verwaltung --------------------------------------------------------------
// Jede Registrierung einer Erweiterung landet als Disposer im Tracker;
// deactivate/Fehler rollen in umgekehrter Reihenfolge zurück.
function createTracker(id) {
  const disposers = [];
  return {
    add(fn) {
      disposers.push(fn);
    },
    dispose() {
      for (const fn of disposers.reverse()) {
        try {
          fn();
        } catch (err) {
          console.warn(`Rollback-Schritt der Erweiterung '${id}' fehlgeschlagen:`, err);
        }
      }
      disposers.length = 0;
    },
  };
}

// --- Sidebar-Panels -------------------------------------------------------------------
// Erzeugt je Pane eine Panel-Sektion nach dem Muster der eingebauten
// Panels (index.html) und registriert das Panel an der Sidebar-Registry.
// Extern beigetragene Panels sind sichtbar, solange die Erweiterung aktiv
// ist (kein eigener Sichtbarkeits-Toggle in v1 — der Schalter ist die
// Erweiterung selbst); Anordnung und Gruppierung laufen über das normale
// Layout-Modell (Drag-and-Drop, Persistenz inklusive).
function registerPanelContribution(id, def, tracker) {
  if (!def || typeof def.render !== 'function') {
    throw new Error('registerSidebarPanel: render-Funktion fehlt');
  }
  const localId = typeof def.id === 'string' && def.id !== '' ? def.id : 'panel';
  const panelId = `ext-${id}-${localId}`;
  const sectionClass = `sidebar-section-${panelId}`;
  const titleKey = contributionTitleKey(id, def, `__panel.${localId}.title`);

  const sections = [];
  for (const container of document.querySelectorAll('.pane-group .pane-sidebar-left')) {
    const section = document.createElement('section');
    section.className = `sidebar-section ${sectionClass}`;
    const header = document.createElement('header');
    header.className = 'sidebar-section-header';
    const title = document.createElement('h2');
    title.className = 'sidebar-section-title';
    title.setAttribute('data-i18n', titleKey);
    title.textContent = tExtension(id, def.titleKey || `__panel.${localId}.title`);
    header.appendChild(title);
    section.appendChild(header);
    const body = document.createElement('div');
    body.className = 'sidebar-section-body';
    section.appendChild(body);
    container.appendChild(section);
    sections.push(section);
    // Fehler-Isolation: ein werfender Panel-Render bricht weder die
    // Aktivierung der übrigen Panes noch die App ab — er zählt aber als
    // Lade-Fehler der Erweiterung (Exception propagiert zum Aktivierer).
    def.render(body, sections.length - 1);
  }

  registerSidebarPanel({
    id: panelId,
    titleKey,
    sectionClass,
    getVisible: () => activeExtensions.has(id),
    applyVisibility: () => {},
    toggle: () => {},
  });

  tracker.add(() => {
    unregisterSidebarPanel(panelId);
    for (const section of sections) section.remove();
  });
  return panelId;
}

// Nach Panel-Zu-/Abgängen das Layout re-normalisieren (neue Panels landen
// als eigener Slot; entfernte fallen heraus) und die Konsumenten über das
// Layout-Event neu zeichnen lassen. persist:false — die persistierte
// Anordnung bleibt erhalten und greift wieder, wenn das Panel beim
// nächsten Start vor dem Layout-Laden registriert ist.
function refreshSidebarLayout() {
  // applySidebarLayout normalisiert gegen die aktuelle Panel-Registry und
  // feuert bei Änderung selbst das Layout-Event (Re-Render der Sidebars);
  // ohne Panel-Beitrag ist der Aufruf ein No-op.
  applySidebarLayout(getSidebarLayout(), { persist: false });
}

// --- Kommandos ------------------------------------------------------------------------
function registerCommandContribution(id, def, tracker) {
  if (!def || typeof def.run !== 'function') {
    throw new Error('registerCommand: run-Funktion fehlt');
  }
  const localId = typeof def.id === 'string' && def.id !== '' ? def.id : 'command';
  const commandId = `ext.${id}.${localId}`;
  const labelKey = contributionTitleKey(id, def, `__command.${localId}.title`);
  const ok = registerDynamicCommand({
    id: commandId,
    labelKey,
    defaultBindings: typeof def.defaultBinding === 'string' ? [def.defaultBinding] : [],
  });
  if (!ok) throw new Error(`registerCommand: ungültige Definition (${commandId})`);
  if (runtime && runtime.commandHandlers) {
    runtime.commandHandlers[commandId] = () => {
      // Fehler-Isolation am Laufzeit-Hook: ein werfendes Kommando loggt,
      // stürzt aber weder Dispatcher noch App (Entwicklungsrichtlinien §3).
      try {
        return def.run();
      } catch (err) {
        console.warn(`Kommando ${commandId} fehlgeschlagen:`, err);
        return undefined;
      }
    };
  }
  tracker.add(() => {
    unregisterDynamicCommand(commandId);
    if (runtime && runtime.commandHandlers) delete runtime.commandHandlers[commandId];
  });
  return commandId;
}

// --- Einstellungs-Bereiche --------------------------------------------------------------
function registerSettingsContribution(id, def, tracker) {
  if (!def || typeof def.render !== 'function') {
    throw new Error('registerSettingsSection: render-Funktion fehlt');
  }
  if (!runtime || typeof runtime.registerSettingsSection !== 'function') return null;
  const localId = typeof def.id === 'string' && def.id !== '' ? def.id : 'settings';
  const sectionId = `ext-${id}-${localId}`;
  const titleKey = contributionTitleKey(id, def, `__settings.${localId}.title`);
  runtime.registerSettingsSection({
    id: sectionId,
    titleKey,
    // 4T-0889 (Epic 3E-0168): Herkunfts-Marke fuer die Bereichsnavigation —
    // Beitraege externer Erweiterungen sammeln sich im eigenen Block
    // „Erweiterungen (extern)". Hier gesetzt, weil der Host die einzige
    // Stelle ist, die die Herkunft sicher kennt.
    origin: 'external',
    render: (container) => {
      try {
        def.render(container);
      } catch (err) {
        console.warn(`Einstellungs-Bereich ${sectionId} fehlgeschlagen:`, err);
      }
    },
  });
  tracker.add(() => {
    if (runtime && typeof runtime.unregisterSettingsSection === 'function') {
      runtime.unregisterSettingsSection(sectionId);
    }
  });
  return sectionId;
}

// --- Render-Andockpunkt (API v1.1) --------------------------------------------------------
// 4T-0825 (Epic 3E-0103): Eine Erweiterung braucht zwei Dinge, um ein Panel
// an das angezeigte Dokument zu koppeln — den Container der gerenderten
// Ansicht ihrer Spalte und ein Ereignis nach dessen Neuaufbau. Ohne beides
// bliebe ihr nur, App-internes DOM zu raten; genau das schliesst die
// Handbuch-Seite aus.
//
// Die Verteilung liegt bewusst HIER und nicht bei den acht Stellen im
// Renderer, die heute `renderedHtml.innerHTML` setzen (editor, views,
// history-page, history-status, properties-tags). Ein zentraler Setz-Helfer
// waere die architektonisch sauberere Form, aber ein kuenftiger neunter
// Aufrufer, der ihn umgeht, braeche die Zusage still. Der Observer
// beobachtet das Ergebnis statt der Absicht und deckt jeden Schreibweg ab.
const renderCallbacks = new Set();
let renderObservers = [];
let pendingRenderPanes = null;
const renderVisibleState = new Map(); // paneIdx -> boolean

function paneGroups() {
  return [...document.querySelectorAll('.pane-group')];
}

// Render-Ziel einer Spalte im DOM. Spezifisch auf `.pane-rendered`, weil
// die Notizen-Vorschau ebenfalls `.markdown-body` traegt und im DOM davor
// steht (dieselbe Falle wie in app-state.js).
function renderTargetOf(paneIdx) {
  const group = paneGroups()[paneIdx];
  return group ? group.querySelector('.pane-rendered .markdown-body') : null;
}

// Zeigt die Spalte gerade eine gerenderte Ansicht? Nur in der gerenderten
// und der geteilten Ansicht; in Editor-, Live- und System-Ansicht existiert
// der Container zwar, zeigt aber nichts an.
function renderVisibleIn(group) {
  const content = group ? group.querySelector('.content') : null;
  if (!content) return false;
  return content.classList.contains('view-rendered') || content.classList.contains('view-split');
}

// Oeffentliche Sicht: das Ziel nur, wenn dort auch wirklich etwas steht —
// sonst ist null die ehrliche Antwort.
function renderRootOf(paneIdx) {
  const group = paneGroups()[paneIdx];
  if (!group || !renderVisibleIn(group)) return null;
  return group.querySelector('.pane-rendered .markdown-body');
}

// Meldungen eines Aufbaus zu EINEM Ereignis buendeln: ein innerHTML-Aufruf
// erzeugt je nach Inhalt mehrere Mutations-Records.
function queueRenderUpdate(paneIdx) {
  if (!pendingRenderPanes) {
    pendingRenderPanes = new Set();
    Promise.resolve().then(flushRenderUpdates);
  }
  pendingRenderPanes.add(paneIdx);
}

function flushRenderUpdates() {
  const panes = pendingRenderPanes ? [...pendingRenderPanes] : [];
  pendingRenderPanes = null;
  for (const paneIdx of panes) {
    for (const cb of [...renderCallbacks]) {
      // Fehler-Isolation wie an den uebrigen Laufzeit-Hooks: ein werfender
      // Callback loggt, stoppt aber weder die uebrigen noch die App.
      try {
        cb(paneIdx);
      } catch (err) {
        console.warn('onRenderUpdated-Callback fehlgeschlagen:', err);
      }
    }
  }
}

function stopRenderObservers() {
  for (const observer of renderObservers) observer.disconnect();
  renderObservers = [];
  renderVisibleState.clear();
  pendingRenderPanes = null;
}

// Beim Registrieren immer neu aufsetzen: idempotent, und ein Pane-Container,
// den es beim ersten Callback noch nicht gab, kommt so dazu.
//
// ZWEI Beobachtungen je Spalte, und die zweite ist nicht optional: Der
// Ansichts-Wechsel baut das Render-DOM oft gar nicht neu (renderPaneContent
// ueberspringt den Voll-Render per Skip-Cache, wenn Inhalt, Pfad, Sprache
// und Theme gleich blieben). Ohne die Klassen-Beobachtung bekaeme eine
// Erweiterung beim Rueckweg aus der Quelltext-Ansicht kein Ereignis,
// obwohl getRenderRoot dort von null wieder auf das Ziel wechselt.
function startRenderObservers() {
  stopRenderObservers();
  if (typeof MutationObserver !== 'function') return;
  paneGroups().forEach((group, paneIdx) => {
    const target = renderTargetOf(paneIdx);
    if (target) {
      const inhalt = new MutationObserver(() => queueRenderUpdate(paneIdx));
      inhalt.observe(target, { childList: true });
      renderObservers.push(inhalt);
    }
    const content = group.querySelector('.content');
    if (content) {
      renderVisibleState.set(paneIdx, renderVisibleIn(group));
      const sichtbarkeit = new MutationObserver(() => {
        const jetzt = renderVisibleIn(group);
        // Nur der Wechsel zaehlt: Quelltext auf Live etwa laesst die
        // gerenderte Ansicht unsichtbar und ist kein Ereignis.
        if (jetzt === renderVisibleState.get(paneIdx)) return;
        renderVisibleState.set(paneIdx, jetzt);
        queueRenderUpdate(paneIdx);
      });
      sichtbarkeit.observe(content, { attributes: true, attributeFilter: ['class'] });
      renderObservers.push(sichtbarkeit);
    }
  });
}

function registerRenderCallback(cb, tracker) {
  if (typeof cb !== 'function') {
    throw new Error('onRenderUpdated: Callback fehlt');
  }
  renderCallbacks.add(cb);
  startRenderObservers();
  const off = () => {
    if (!renderCallbacks.delete(cb)) return;
    // Ohne Zuhoerer keine Beobachtungs-Last.
    if (renderCallbacks.size === 0) stopRenderObservers();
  };
  tracker.add(off);
  return off;
}

// --- ctx-Fassade (API v1) ---------------------------------------------------------------
function buildContext(entry, tracker) {
  const m = entry.manifest;
  const id = m.id;
  const storageKey = `extensionData.${id}`;
  return Object.freeze({
    apiVersion: EXTENSION_API_VERSION,
    manifest: Object.freeze({
      id,
      name: m.name,
      version: m.version,
      description: m.description || '',
    }),
    // Übersetzungen: bundles = { sprache: { key: text } }; ctx.t löst in
    // der aktiven Sprache auf und fällt auf defaultLocale zurück.
    addTranslations(bundles, defaultLocale) {
      const state = ensureTranslationState(id);
      state.bundles = bundles && typeof bundles === 'object' ? bundles : {};
      if (typeof defaultLocale === 'string' && defaultLocale !== '') {
        state.defaultLocale = defaultLocale;
      }
      applyTranslationState(id);
      tracker.add(() => {
        translationState.delete(id);
        unregisterExtensionTranslations(id);
      });
    },
    t: (key) => tExtension(id, key),
    getLanguage: () => getLanguage(),
    getTheme: () => document.documentElement.getAttribute('data-theme') || 'light',
    getThemeVariable: (name) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(String(name || ''))
        .trim(),
    registerSidebarPanel: (def) => registerPanelContribution(id, def, tracker),
    registerCommand: (def) => registerCommandContribution(id, def, tracker),
    registerSettingsSection: (def) => registerSettingsContribution(id, def, tracker),
    // 4T-0825: Andockpunkt an die gerenderte Ansicht. Der Spalten-Index ist
    // derselbe wie im zweiten Argument von registerSidebarPanel().render.
    getRenderRoot: (paneIdx) => renderRootOf(Number.isInteger(paneIdx) ? paneIdx : 0),
    onRenderUpdated: (cb) => registerRenderCallback(cb, tracker),
    // Persistenz-Namensraum der Erweiterung (electron-store, ein Objekt
    // pro Erweiterung unter extensionData.<id>).
    storage: Object.freeze({
      async get(key) {
        const data = await api.getSetting(storageKey);
        return data && typeof data === 'object' ? data[key] : undefined;
      },
      async set(key, value) {
        const data = await api.getSetting(storageKey);
        const next = data && typeof data === 'object' ? { ...data } : {};
        next[String(key)] = value;
        await api.setSetting(storageKey, next);
      },
    }),
  });
}

// --- Markdown-Plugins (Preload) -----------------------------------------------------------
// Deskriptoren der AKTIVEN Erweiterungen mit Render-Beitrag; der Preload-
// Loader holt die Quelltexte vom Main, evaluiert sie per vm und baut die
// Pipelines neu. Fehler kommen als { id: text } zurück und führen zur
// automatischen Deaktivierung der betroffenen Erweiterung.
async function reconfigureMarkdownPlugins() {
  const descriptors = [];
  for (const id of activeExtensions.keys()) {
    const entry = entryById(id);
    if (entry && entry.manifest.markdownPlugin) {
      descriptors.push({ id, version: entry.manifest.version });
    }
  }
  let pluginErrors;
  try {
    pluginErrors =
      (typeof api.configureExternalMarkdownPlugins === 'function' &&
        (await api.configureExternalMarkdownPlugins(descriptors))) ||
      {};
  } catch (err) {
    console.warn('configureExternalMarkdownPlugins fehlgeschlagen:', err);
    return;
  }
  for (const [id, message] of Object.entries(pluginErrors)) {
    await deactivateExtension(id);
    await recordLoadError(id, message);
  }
}

// --- Aktivieren / Deaktivieren --------------------------------------------------------------
async function activateExtension(entry) {
  const id = entry.manifest.id;
  if (activeExtensions.has(id)) return true;
  const tracker = createTracker(id);
  try {
    // Registry-Anbindung (3E-0052): Herkunfts-Kennzeichnung 'extern' und
    // ID-Kollisionsschutz gegen interne Erweiterungen.
    registerExternalExtension({
      id,
      name: entry.manifest.name,
      description: entry.manifest.description,
    });
    tracker.add(() => unregisterExternalExtension(id));

    let module = null;
    if (entry.manifest.entry) {
      // Dynamischer file://-Import (Spike 4T-0298); esbuild bundelt
      // variable Importe nicht und lässt den Aufruf unangetastet.
      module = await import(entry.entryUrl);
      const def = module && module.default;
      if (!def || typeof def.activate !== 'function') {
        throw new Error('Einstiegs-Modul hat keinen default-Export mit activate()');
      }
      const ctx = buildContext(entry, tracker);
      await def.activate(ctx);
    }
    activeExtensions.set(id, { module, tracker });
    refreshSidebarLayout();
    return true;
  } catch (err) {
    tracker.dispose();
    await recordLoadError(id, (err && err.message) || err);
    return false;
  }
}

async function deactivateExtension(id) {
  const active = activeExtensions.get(id);
  if (!active) return false;
  try {
    const def = active.module && active.module.default;
    if (def && typeof def.deactivate === 'function') def.deactivate();
  } catch (err) {
    console.warn(`deactivate() der Erweiterung '${id}' fehlgeschlagen:`, err);
  }
  active.tracker.dispose();
  activeExtensions.delete(id);
  refreshSidebarLayout();
  return true;
}

// --- Synchronisation Store <-> Laufzeit --------------------------------------------------
// Zielbild: genau die Einträge mit Status 'active' sind geladen. Läuft
// beim App-Start, nach jedem Scan, nach lokalen Schalt-Aktionen und beim
// Multi-Window-Broadcast (idempotent; ein unveränderter Zustand ist ein
// No-op). Änderungen feuern 'scg:extensions-changed' — derselbe
// Re-Render-/Dispatcher-Pfad wie bei internen Erweiterungen.
async function syncActiveExtensions({ notify = true } = {}) {
  const changed = [];
  const targetIds = new Set();
  for (const entry of entries) {
    if (entry.ok && externalExtensionStatus(entry, enabledIds, trustedMap, errorMap) === 'active') {
      targetIds.add(entry.manifest.id);
    }
  }
  for (const id of [...activeExtensions.keys()]) {
    if (!targetIds.has(id)) {
      await deactivateExtension(id);
      changed.push(id);
    }
  }
  for (const id of targetIds) {
    if (!activeExtensions.has(id)) {
      if (await activateExtension(entryById(id))) changed.push(id);
    }
  }
  if (changed.length > 0) {
    await reconfigureMarkdownPlugins();
    if (notify) {
      document.dispatchEvent(new CustomEvent('scg:extensions-changed', { detail: { changed } }));
    }
  }
  return changed;
}

async function reloadStoreState() {
  try {
    enabledIds = normalizeEnabledIds(await api.getSetting(EXTERNAL_ENABLED_KEY));
    trustedMap = normalizeTrustedMap(await api.getSetting(EXTERNAL_TRUSTED_KEY));
    errorMap = normalizeErrorMap(await api.getSetting(EXTERNAL_ERRORS_KEY));
  } catch (err) {
    console.warn('Externe Erweiterungs-Einstellungen laden fehlgeschlagen:', err);
    enabledIds = [];
    trustedMap = {};
    errorMap = {};
  }
}

// --- Öffentliche Host-Operationen ------------------------------------------------------------
// App-Start: Store-Stand laden, Verzeichnis scannen, aktive Erweiterungen
// laden — VOR dem Sidebar-Layout-Laden aufrufen, damit registrierte
// Panels ihre persistierte Position behalten, und ohne Event (der
// Erst-Render folgt ohnehin).
export async function initExternalExtensions() {
  if (typeof api.scanExternalExtensions !== 'function') return;
  await reloadStoreState();
  try {
    entries = await api.scanExternalExtensions();
  } catch (err) {
    console.warn('Erweiterungs-Scan fehlgeschlagen:', err);
    entries = [];
  }
  await syncActiveExtensions({ notify: false });
}

// Erneuter Verzeichnis-Scan (Aktualisieren-Aktion des Einstellungs-
// Bereichs; auch nach Entfernen). Verschwundene aktive Erweiterungen
// werden deaktiviert, neue erscheinen als 'inactive'.
export async function rescanExternalExtensions() {
  if (typeof api.scanExternalExtensions !== 'function') return externalExtensionEntries();
  try {
    entries = await api.scanExternalExtensions();
  } catch (err) {
    console.warn('Erweiterungs-Scan fehlgeschlagen:', err);
  }
  await syncActiveExtensions();
  return externalExtensionEntries();
}

// Aktivierung durch den Nutzer. Zeigt bei unbestätigter Version den
// Warn-Dialog (Main, lokalisiert); ohne Bestätigung passiert nichts.
// Rückgabe: 'active' | 'canceled' | 'error'.
export async function enableExternalExtension(id) {
  const entry = entryById(id);
  if (!entry) return 'error';
  const status = externalExtensionStatus(entry, enabledIds, trustedMap, {});
  if (status === 'incompatible' || status === 'invalid') return 'error';
  if (trustedMap[id] !== entry.manifest.version) {
    let confirmed = false;
    try {
      confirmed = await api.confirmExternalExtensionTrust(id);
    } catch (err) {
      console.warn('Warn-Dialog fehlgeschlagen:', err);
    }
    if (!confirmed) return 'canceled';
    trustedMap = { ...trustedMap, [id]: entry.manifest.version };
    await persistFn(EXTERNAL_TRUSTED_KEY, trustedMap);
  }
  await clearLoadError(id);
  if (!enabledIds.includes(id)) {
    enabledIds = [...enabledIds, id];
    await persistFn(EXTERNAL_ENABLED_KEY, enabledIds);
  }
  await syncActiveExtensions();
  return activeExtensions.has(id) ? 'active' : 'error';
}

export async function disableExternalExtension(id) {
  if (!enabledIds.includes(id)) return false;
  enabledIds = enabledIds.filter((x) => x !== id);
  await persistFn(EXTERNAL_ENABLED_KEY, enabledIds);
  await syncActiveExtensions();
  return true;
}

// Entfernen: deaktivieren, Verzeichnis über den Main löschen (der zeigt
// die Bestätigung), Store-Spuren aufräumen, neu scannen.
export async function removeExternalExtension(id) {
  if (typeof api.removeExternalExtension !== 'function') return false;
  let result;
  try {
    result = await api.removeExternalExtension(id);
  } catch (err) {
    console.warn('Entfernen fehlgeschlagen:', err);
    return false;
  }
  if (!result || result.removed !== true) return false;
  if (enabledIds.includes(id)) {
    enabledIds = enabledIds.filter((x) => x !== id);
    await persistFn(EXTERNAL_ENABLED_KEY, enabledIds);
  }
  if (trustedMap[id]) {
    trustedMap = { ...trustedMap };
    delete trustedMap[id];
    await persistFn(EXTERNAL_TRUSTED_KEY, trustedMap);
  }
  await clearLoadError(id);
  await rescanExternalExtensions();
  return true;
}

// Multi-Window-Broadcast (extensionsExternal:changed): Store-Stand UND
// Scan neu laden (das andere Fenster kann installiert/entfernt haben)
// und die Laufzeit angleichen — idempotent, ein unveränderter Zustand
// ist ein No-op.
export async function syncExternalExtensionsFromBroadcast() {
  await reloadStoreState();
  if (typeof api.scanExternalExtensions === 'function') {
    try {
      entries = await api.scanExternalExtensions();
    } catch (err) {
      console.warn('Erweiterungs-Scan fehlgeschlagen:', err);
    }
  }
  await syncActiveExtensions();
}

// Nur für Tests: Zustand zurücksetzen und Scan-Einträge injizieren.
export function resetExternalHostForTests(testEntries = []) {
  for (const id of [...activeExtensions.keys()]) {
    const active = activeExtensions.get(id);
    active.tracker.dispose();
    activeExtensions.delete(id);
    unregisterExternalExtension(id);
  }
  translationState.clear();
  renderCallbacks.clear();
  stopRenderObservers();
  entries = testEntries;
  enabledIds = [];
  trustedMap = {};
  errorMap = {};
}

// Nur für Tests: direkter Zugriff auf die Sync-Logik ohne IPC.
export async function applyExternalStateForTests(state) {
  enabledIds = normalizeEnabledIds(state.enabled);
  trustedMap = normalizeTrustedMap(state.trusted);
  errorMap = normalizeErrorMap(state.errors);
  return syncActiveExtensions({ notify: state.notify !== false });
}
