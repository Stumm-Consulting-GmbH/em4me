// @vitest-environment jsdom
// 4T-002364 (Epic 3E-000184): Der Bedienweg nach dem Umbenennen eines Workflows
// — Tastendruck und Statusleisten-Knopf starten ihn unter seinem neuen Pfad
// (AK1 und AK2 des Tasks, Unit-Zeile am Bedienweg).
//
// **Echte Module beider Prozess-Seiten** (Regel aus 4T-002359). Hauptprozess:
// Bereich und Workflow-Datei im Temp-Verzeichnis, der Dienst des
// Workflow-Ordners, die echte Umbenenn-Strecke `renameSingleFile`, der Nachzug
// `createWorkflowBindingFollow` und die Verteilung `createSettingsVerteilung`;
// das Fenster des Hauptprozesses ist ein Ersatz, der die gesendeten Kanäle
// aufzeichnet, und die Liste, die das Fenster nach `workflow:folderChanged`
// abfragt, liefert der echte Dienst (`listForWindow`). Fenster: die echten
// Kommandos der Workflows (`syncWorkflowCommands`), die Kommando-Platzierung
// mit ihrem Empfang des Rundrufs (`initCommandPlacementUi`,
// `renderCommandButtons`), die Ausführung per Kennung der Kommando-Palette und
// `mergeBindings`.
//
// **Eine benannte Abweichung:** Der Tasten-Dispatcher des Fensters
// (`rebuildHotkeyDispatchMap` und `handleCommandKeydown` in
// `src/renderer/modules/app/app-commands.js`) ist im Unit-Kontext nicht ladbar
// (Begründung im Kopf von kommando-dispatcher.test.js), ebenso der Empfang von
// `hotkeys:changed` in app-broadcasts.js. Er ist hier aus seinen geteilten
// Bausteinen nachgebaut — `mergeBindings`, `normalizeBinding` und
// `eventToBinding` —, Zeile für Zeile in der Bauart des Originals. Attrappe ist
// allein der Start des Workflows (`starteWorkflow`), dessen Aufruf gemessen wird.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

const require = createRequire(import.meta.url);
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

let zuhoerer = null;
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  getWorkflowFolderList: async () => ({ workflows: [] }),
  onWorkflowFolderListChanged: (cb) => {
    zuhoerer = cb;
    return () => {};
  },
}));
const starteWorkflow = vi.fn(async () => true);
vi.mock('../../../src/renderer/modules/workflows/workflow-start.js', () => ({
  starteWorkflow: (...a) => starteWorkflow(...a),
  laeuftWorkflow: () => false,
  initWorkflowStart: () => {},
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-start-knopf.js', () => ({
  registriereStartKnopf: () => {},
}));

// Empfang des Rundrufs der Kommando-Platzierung: der echte aus
// initCommandPlacementUi, angemeldet über den Preload-Weg.
let platzierungsEmpfang = null;
window.api.onCommandPlacementChanged = (cb) => {
  platzierungsEmpfang = cb;
};

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { initWorkflowCommands, syncWorkflowCommands } =
  await import('../../../src/renderer/modules/workflows/workflow-commands.js');
const { initCommandPlacementUi, setCommandPlacement } =
  await import('../../../src/renderer/modules/command-placement.js');
const { initCommandPalette } = await import('../../../src/renderer/modules/command-palette.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { buildHotkeysDraftFromState, dirtyHotkeysSection, hotkeysDraftToOverrides } =
  await import('../../../src/renderer/modules/settings/settings-hotkeys.js');
const { COMMANDS, mergeBindings } = await import('../../../src/shared/commands/commands.js');
const { eventToBinding, normalizeBinding } =
  await import('../../../src/shared/commands/command-bindings.js');

const {
  createWorkflowBindingFollow,
  ordnerAllerFenster,
} = require('../../../src/main/workflows/workflow-binding-follow.js');
const {
  createWorkflowFolderService,
} = require('../../../src/main/workflows/workflow-folder-service.js');
const { createSettingsVerteilung } = require('../../../src/main/ipc/settings-verteilung.js');
const { createLinkUpdate } = require('../../../src/main/documents/link-update.js');
const { createFileWatching } = require('../../../src/main/documents/file-watching.js');
const mddStore = require('../../../src/main/documents/mdd-store.js');
const { workflowCommandId } = require('../../../src/shared/workflows/workflow-command-id.js');

const HALLO = '---\nworkflow: true\nname: Hallo-Test\n---\n\n```workflow\nnotify "Hallo"\n```\n';
const KOMBINATION = 'Ctrl+Alt+Shift+H';
const isMarkdownPath = (p) => /\.(md|markdown)$/i.test(p);

// --- Fenster: Handler-Tafel, Dispatcher, Statusleiste --------------------------

const handler = {};
let dispatcher = new Map();
initWorkflowCommands({
  registerHandler: (id, fn) => {
    handler[id] = fn;
  },
  unregisterHandler: (id) => {
    delete handler[id];
  },
  refreshHotkeys: () => baueDispatcher(),
  executeCommand: vi.fn(),
  runMacro: vi.fn(),
});
initCommandPalette({ executeCommand: (id) => (handler[id] ? handler[id]() : false) });
document.body.innerHTML = '<div class="command-buttons" id="command-buttons"></div>';
initCommandPlacementUi();

// Nachbau von rebuildHotkeyDispatchMap und handleCommandKeydown (siehe Kopf).
function baueDispatcher() {
  const effective = mergeBindings(state.hotkeyOverrides);
  const map = new Map();
  for (const cmd of COMMANDS) {
    if (cmd.editorScoped) continue;
    for (const binding of effective[cmd.id] || []) {
      const normalized = normalizeBinding(binding);
      if (normalized && !map.has(normalized)) map.set(normalized, cmd.id);
    }
  }
  dispatcher = map;
}
function drueckeTaste() {
  const e = new KeyboardEvent('keydown', {
    key: 'H',
    ctrlKey: true,
    altKey: true,
    shiftKey: true,
  });
  const id = dispatcher.get(eventToBinding(e));
  if (id === undefined || !handler[id]) return false;
  handler[id]();
  return true;
}
// Empfang von hotkeys:changed in der Bauart von app-broadcasts.js.
function empfangeKuerzel(overrides) {
  state.hotkeyOverrides =
    overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  baueDispatcher();
}
const knopf = () => document.querySelector('#command-buttons .command-placement-button');

// --- Hauptprozess: Bereich, Dienst, Nachzug, Umbenenn-Strecke ------------------

const tmpDirs = [];
afterAll(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Rest ist unkritisch.
    }
  }
});

async function hauptprozess() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-empfang-'));
  tmpDirs.push(root);
  const datei = path.join(root, 'Workflows', 'Hallo.md');
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, HALLO, 'utf8');
  const alt = workflowCommandId('Hallo.md');
  const werte = {
    hotkeys: { [alt]: KOMBINATION },
    commandPlacement: {
      statusbar: [{ commandId: alt, icon: 'zap', label: null }],
      contextMenu: [],
      macros: [],
      hiddenButtons: [],
    },
  };
  const store = { werte, get: (k) => werte[k], set: (k, v) => (werte[k] = v) };
  const gesendet = [];
  const win = {
    area: { rootPath: root, name: 'Bereich' },
    isDestroyed: () => false,
    webContents: { id: 1, send: (kanal, wert) => gesendet.push({ kanal, wert }) },
  };
  const windows = new Map([[1, win]]);
  const dienst = createWorkflowFolderService({
    getStore: () => store,
    areaOfWindow: (w) => w.area,
    windows,
    mddStore,
    isMarkdownPath,
    MAX_EMBED_BYTES: 1024 * 1024,
    watchFolder: () => ({ on: () => {}, close: async () => {} }),
  });
  await dienst.writeAreaWorkflowsConfig(root, { folder: 'Workflows' });
  const folge = createWorkflowBindingFollow({
    getStore: () => store,
    verteileEinstellung: createSettingsVerteilung({
      BrowserWindow: { getAllWindows: () => [win] },
      getStore: () => store,
      applyMenuToAllWindows: () => {},
      updateAllCaptionColors: () => {},
      timerChecker: { reschedule: () => {} },
    }),
    ordnerJeFenster: ordnerAllerFenster({ windows, resolveForWindow: dienst.resolveForWindow }),
  });
  const { moveWatchEntry } = createFileWatching({ windows: () => new Map() });
  const lu = createLinkUpdate({
    moveWatchEntry,
    mddKeyOf: (p) => p.toLowerCase(),
    mddOpenPackets: new Map(),
    mddSuspendedPaths: new Set(),
    getStore: () => null,
    applyMenuToAllWindows: () => {},
    broadcast: () => {},
    books: { followChapterFileMove: async () => ({ ok: true, changed: false }) },
    followAreaStartPage: async () => {},
    followWorkflowBindings: (a, b) => folge.nachBewegung(a, b),
  });
  const umbenennen = (neuerName) =>
    lu.renameSingleFile(datei, path.join(root, 'Workflows', neuerName));
  const bewege = (von, nach) => {
    fs.mkdirSync(path.dirname(path.join(root, nach)), { recursive: true });
    return lu.renameSingleFile(path.join(root, von), path.join(root, nach));
  };
  const liste = () => dienst.listForWindow(win);
  // Der Stand, den das Fenster beim Start aus dem Speicher holt.
  const fensterStart = async () => {
    syncWorkflowCommands(await liste());
    empfangeKuerzel(werte.hotkeys);
    await setCommandPlacement(werte.commandPlacement, { persist: false });
  };
  const rundrufe = () => gesendet.splice(0);
  return { root, werte, umbenennen, bewege, liste, fensterStart, rundrufe, dienst };
}

// Die Rundrufe des Hauptprozesses an die Empfänger des Fensters.
async function stelleZu(rundrufe) {
  for (const { kanal, wert } of rundrufe) {
    if (kanal === 'hotkeys:changed') empfangeKuerzel(wert);
    if (kanal === 'commandPlacement:changed') platzierungsEmpfang(wert);
  }
  await Promise.resolve();
}

beforeEach(() => {
  starteWorkflow.mockClear();
});

describe('Bedienweg nach dem Umbenennen in der Anwendung', () => {
  for (const reihenfolge of ['erst die neue Liste', 'erst die Rundrufe']) {
    it(`Tastendruck und Statusleisten-Knopf starten den umbenannten Workflow (${reihenfolge})`, async () => {
      const h = await hauptprozess();
      await h.fensterStart();
      // Vorher: Beide Wege starten die Datei unter ihrem alten Pfad.
      expect(drueckeTaste()).toBe(true);
      knopf().click();
      const altPfad = path.join(h.root, 'Workflows', 'Hallo.md');
      expect(starteWorkflow.mock.calls.map((c) => c[0].path)).toEqual([altPfad, altPfad]);
      starteWorkflow.mockClear();

      expect((await h.umbenennen('Hallo umbenannt.md')).ok).toBe(true);
      const rundrufe = h.rundrufe();
      expect(rundrufe.map((r) => r.kanal).sort()).toEqual([
        'commandPlacement:changed',
        'hotkeys:changed',
      ]);
      // Nach der Bewegung meldet der Ordner-Beobachter; das Fenster fragt die
      // Liste neu ab und meldet die Kommandos neu an.
      const neueListe = await h.liste();
      if (reihenfolge === 'erst die neue Liste') {
        zuhoerer(neueListe);
        await stelleZu(rundrufe);
      } else {
        await stelleZu(rundrufe);
        zuhoerer(neueListe);
      }

      const neu = workflowCommandId('Hallo umbenannt.md');
      const neuPfad = path.join(h.root, 'Workflows', 'Hallo umbenannt.md');
      expect(COMMANDS.some((c) => c.id === workflowCommandId('Hallo.md'))).toBe(false);
      expect(drueckeTaste()).toBe(true);
      expect(knopf()).not.toBeNull();
      expect(knopf().dataset.commandId).toBe(neu);
      expect(knopf().title).toBe('Hallo-Test');
      knopf().click();
      expect(starteWorkflow.mock.calls.map((c) => c[0].path)).toEqual([neuPfad, neuPfad]);
      // «Einstellungen → Tastenkürzel» zeigt die Kombination am Kommando.
      expect(mergeBindings(state.hotkeyOverrides)[neu]).toEqual([KOMBINATION]);
      h.dienst.dispose();
    });
  }

  it('ohne Nachzug (Umbenennung außerhalb der Anwendung) verlieren beide ihr Ziel', async () => {
    const h = await hauptprozess();
    await h.fensterStart();
    // Die Datei wandert am Nachzug vorbei, wie im Datei-Explorer.
    fs.renameSync(
      path.join(h.root, 'Workflows', 'Hallo.md'),
      path.join(h.root, 'Workflows', 'Hallo extern.md'),
    );
    zuhoerer(await h.liste());
    expect(h.rundrufe()).toEqual([]);
    expect(drueckeTaste()).toBe(false);
    expect(knopf()).toBeNull();
    expect(starteWorkflow).not.toHaveBeenCalled();
    h.dienst.dispose();
  });
});

describe('Offene Seite «Einstellungen → Tastenkürzel»', () => {
  it('ein späteres «Übernehmen» nimmt das mitgezogene Kürzel nicht zurück', async () => {
    const h = await hauptprozess();
    await h.fensterStart();
    // Die Seite ist offen: Ihr Entwurf entstand vor der Umbenennung.
    const entwurf = buildHotkeysDraftFromState();
    expect(entwurf[workflowCommandId('Hallo.md')]).toBe(KOMBINATION);

    await h.umbenennen('Hallo umbenannt.md');
    const rundrufe = h.rundrufe();
    zuhoerer(await h.liste());
    await stelleZu(rundrufe);

    const neu = workflowCommandId('Hallo umbenannt.md');
    const overrides = hotkeysDraftToOverrides(entwurf);
    expect(overrides[neu]).toBe(KOMBINATION);
    expect(overrides).toEqual(state.hotkeyOverrides);
    h.dienst.dispose();
  });
});

describe('Hinauswandern aus dem Workflow-Ordner (O1)', () => {
  it('die Belegungen bleiben gespeichert, übersteht ein «Übernehmen» und wirkt nach der Rückkehr', async () => {
    const h = await hauptprozess();
    await h.fensterStart();
    const alt = workflowCommandId('Hallo.md');

    expect((await h.bewege('Workflows/Hallo.md', 'Archiv/Hallo.md')).ok).toBe(true);
    expect(h.rundrufe()).toEqual([]);
    zuhoerer(await h.liste());
    expect(COMMANDS.some((c) => c.id === alt)).toBe(false);
    expect(drueckeTaste()).toBe(false);
    expect(knopf()).toBeNull();

    // Die Seite «Tastenkürzel» wird jetzt geöffnet und übernommen: Die
    // Belegung des nicht angemeldeten Workflows bleibt im gespeicherten Stand.
    const entwurf = buildHotkeysDraftFromState();
    expect(hotkeysDraftToOverrides(entwurf)).toEqual({ [alt]: KOMBINATION });
    expect(dirtyHotkeysSection({ hotkeys: entwurf })).toBe(false);

    expect((await h.bewege('Archiv/Hallo.md', 'Workflows/Hallo.md')).ok).toBe(true);
    zuhoerer(await h.liste());
    expect(drueckeTaste()).toBe(true);
    knopf().click();
    const pfad = path.join(h.root, 'Workflows', 'Hallo.md');
    expect(starteWorkflow.mock.calls.map((c) => c[0].path)).toEqual([pfad, pfad]);
    h.dienst.dispose();
  });

  it('die Reihenfolge der gespeicherten Kürzel macht die Seite nicht geändert', () => {
    state.hotkeyOverrides = { 'workflow.B.md': 'Ctrl+2', 'search.open': 'Ctrl+Alt+F' };
    const entwurf = buildHotkeysDraftFromState();
    state.hotkeyOverrides = { 'search.open': 'Ctrl+Alt+F', 'workflow.B.md': 'Ctrl+2' };
    expect(dirtyHotkeysSection({ hotkeys: entwurf })).toBe(false);
    state.hotkeyOverrides = {};
  });
});
