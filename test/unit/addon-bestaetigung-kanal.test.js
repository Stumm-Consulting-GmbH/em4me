// 4T-002650 (Epic 3E-000416): Bestätigung und Erlaubnis-Schalter der Add-ons
// im Hauptprozess, dazu der eigene Kanal des Schalters «Skript-Blöcke
// ausführen».
//
// Geprüft wird an den echten Kanälen: `registerExtensionsIpc` über echte
// Pakete in einem Temp-Ordner (manifest.json, main.js, md.js) und
// `registerSettingsIpc` für `settings:setScriptsRun` und den allgemeinen Weg
// `settings:set`. Attrappen sind nur der Speicher (eine Map mit den
// Punkt-Pfaden als Schlüssel), der Dialog (liefert den gewählten Knopf), das
// Fenster-Verzeichnis für die Verteilung und die Übersetzung im Fenster, die
// aus den Sprach-Fragmenten liest. Ein mitgeliefertes Paket gibt es im
// Bestand noch nicht; die Prüfdatei setzt deshalb die Naht `options.isBundled`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { registerExtensionsIpc } = require('../../src/main/ipc/extensions.js');
const { registerSettingsIpc } = require('../../src/main/ipc/settings.js');
const { MAX_ERROR_TEXT } = require('../../src/main/extensions/extension-trust.js');
const {
  EXTERNAL_ENABLED_KEY,
  EXTERNAL_TRUSTED_KEY,
  EXTERNAL_ERRORS_KEY,
} = require('../../src/shared/extensions/extensions-external.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Wörterbuch einer Sprache aus den Fragmenten (die Quelle der Texte; die
// zusammengesetzten Sprachdateien entstehen erst beim Bau).
function fragmente(code) {
  const ordner = path.join(WURZEL, 'src', 'i18n', 'fragments', code);
  const dict = {};
  for (const datei of fs.readdirSync(ordner)) {
    if (datei.endsWith('.json')) {
      Object.assign(dict, JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8')));
    }
  }
  return dict;
}
const DICT = { de: fragmente('de'), en: fragmente('en') };

// --- Aufbau ------------------------------------------------------------------------

let tmp;

function legePaketAn(id, version, { markdownPlugin = true } = {}) {
  const dir = path.join(tmp, 'extensions', id);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { id, name: `Paket ${id}`, version, apiVersion: '1.0', entry: 'main.js' };
  if (markdownPlugin) manifest.markdownPlugin = 'md.js';
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'main.js'), 'export default { activate() {} };');
  fs.writeFileSync(path.join(dir, 'md.js'), 'module.exports = () => {};');
  return dir;
}

function speicher(start = {}) {
  const werte = new Map(Object.entries(start));
  return {
    werte,
    get: (k) => werte.get(k),
    set: vi.fn((k, v) => werte.set(k, v)),
  };
}

function fenster(locale = 'de') {
  return { locale, isDestroyed: () => false, webContents: { send: vi.fn() } };
}

function gemeinsameDeps(store, win, dialogAntwort) {
  return {
    BrowserWindow: { getAllWindows: () => [win] },
    getStore: () => store,
    senderWindow: () => win,
    tForWindow: (w, key) => DICT[w.locale][key] ?? key,
    dialog: { showMessageBox: vi.fn(async () => ({ response: dialogAntwort() })) },
    applyMenuToAllWindows: vi.fn(),
    updateAllCaptionColors: vi.fn(),
    timerChecker: { reschedule: vi.fn() },
  };
}

// Kanäle der Add-ons; `antwort` ist der Knopf, den der Dialog liefert
// (0 = «Ja», 1 = «Abbrechen»).
function addonKanaele({ start = {}, antwort = 0, isBundled, locale = 'de' } = {}) {
  const store = speicher(start);
  const win = fenster(locale);
  const knopf = { wert: antwort };
  const deps = {
    ...gemeinsameDeps(store, win, () => knopf.wert),
    app: { getPath: () => tmp },
    shell: { openPath: vi.fn() },
  };
  const kanaele = new Map();
  registerExtensionsIpc((k, fn) => kanaele.set(k, fn), deps, isBundled ? { isBundled } : {});
  const rufe = (kanal, ...args) => kanaele.get(kanal)({ sender: null }, ...args);
  return { rufe, store, win, knopf, dialog: deps.dialog };
}

function einstellungsKanaele({ start = {}, antwort = 1, locale = 'de' } = {}) {
  const store = speicher(start);
  const win = fenster(locale);
  const knopf = { wert: antwort };
  const deps = {
    ...gemeinsameDeps(store, win, () => knopf.wert),
    nativeTheme: {},
    pushRecent: vi.fn(),
    routeShelfFileToBookApp: vi.fn(),
    bindBookIfBookFile: vi.fn(),
    bindShelfIfShelfFile: vi.fn(),
    broadcast: vi.fn(),
    warn: vi.fn(),
  };
  const kanaele = new Map();
  registerSettingsIpc((k, fn) => kanaele.set(k, fn), deps);
  const rufe = (kanal, ...args) => kanaele.get(kanal)({ sender: null }, ...args);
  return { rufe, store, win, knopf, dialog: deps.dialog };
}

function gesendet(win, kanal) {
  return win.webContents.send.mock.calls.filter(([k]) => k === kanal).map(([, v]) => v);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-bestaetigung-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- Bestätigung ---------------------------------------------------------------------

describe('Bestätigung eines Add-ons im Hauptprozess', () => {
  it('nach «Ja» gespeichert, an die Version gebunden und an die Fenster verteilt', async () => {
    legePaketAn('alpha', '1.2.0');
    const { rufe, store, win, dialog } = addonKanaele({ antwort: 0 });
    await rufe('extensions:scanExternal');
    expect(await rufe('extensions:confirmTrust', 'alpha')).toBe(true);
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(store.werte.get(EXTERNAL_TRUSTED_KEY)).toEqual({ alpha: '1.2.0' });
    expect(gesendet(win, 'extensionsExternal:changed')).toHaveLength(1);
    // Der Scan meldet die geltende Bestätigung.
    const [eintrag] = await rufe('extensions:scanExternal');
    expect(eintrag.trusted).toBe(true);
  });

  it('nach «Abbrechen» nicht gespeichert', async () => {
    legePaketAn('alpha', '1.2.0');
    const { rufe, store, win } = addonKanaele({ antwort: 1 });
    await rufe('extensions:scanExternal');
    expect(await rufe('extensions:confirmTrust', 'alpha')).toBe(false);
    expect(store.set).not.toHaveBeenCalled();
    expect(gesendet(win, 'extensionsExternal:changed')).toEqual([]);
  });

  it('eine andere Version gilt nicht als bestätigt', async () => {
    legePaketAn('alpha', '2.0.0');
    const { rufe } = addonKanaele({
      start: { [EXTERNAL_TRUSTED_KEY]: { alpha: '1.2.0' }, [EXTERNAL_ENABLED_KEY]: ['alpha'] },
    });
    const [eintrag] = await rufe('extensions:scanExternal');
    expect(eintrag.trusted).toBe(false);
    expect(eintrag.entryUrl).toBeNull();
    expect(await rufe('extensions:setEnabled', 'alpha', true)).toEqual({
      ok: false,
      error: 'extensions:notTrusted',
    });
  });

  it('ein bestehender Eintrag gilt beim ersten Start ohne Nachfrage weiter', async () => {
    const dir = legePaketAn('alpha', '1.2.0');
    const { rufe, dialog } = addonKanaele({
      start: { [EXTERNAL_TRUSTED_KEY]: { alpha: '1.2.0' }, [EXTERNAL_ENABLED_KEY]: ['alpha'] },
    });
    const [eintrag] = await rufe('extensions:scanExternal');
    expect(eintrag.trusted).toBe(true);
    expect(eintrag.entryUrl).toBe(pathToFileURL(path.join(dir, 'main.js')).href);
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });
});

// --- Ein- und Ausschalten -------------------------------------------------------------

describe('Ein- und Ausschalten über extensions:setEnabled', () => {
  it('Einschalten ohne Bestätigung wird abgewiesen und schreibt nichts', async () => {
    legePaketAn('alpha', '1.2.0');
    const { rufe, store } = addonKanaele();
    await rufe('extensions:scanExternal');
    expect(await rufe('extensions:setEnabled', 'alpha', true)).toEqual({
      ok: false,
      error: 'extensions:notTrusted',
    });
    expect(store.set).not.toHaveBeenCalled();
  });

  it('Einschalten nach der Bestätigung gelingt, nimmt den Fehler zurück und verteilt', async () => {
    legePaketAn('alpha', '1.2.0');
    const { rufe, store, win } = addonKanaele({
      start: { [EXTERNAL_TRUSTED_KEY]: { alpha: '1.2.0' }, [EXTERNAL_ERRORS_KEY]: { alpha: 'x' } },
    });
    await rufe('extensions:scanExternal');
    expect(await rufe('extensions:setEnabled', 'alpha', true)).toEqual({
      ok: true,
      enabled: ['alpha'],
    });
    expect(store.werte.get(EXTERNAL_ENABLED_KEY)).toEqual(['alpha']);
    expect(store.werte.get(EXTERNAL_ERRORS_KEY)).toEqual({});
    expect(gesendet(win, 'extensionsExternal:changed')).toEqual([['alpha']]);
    // Ausschalten geht immer.
    expect(await rufe('extensions:setEnabled', 'alpha', false)).toEqual({
      ok: true,
      enabled: [],
    });
  });

  it('ein mitgeliefertes Paket lässt sich ohne Bestätigung einschalten', async () => {
    legePaketAn('beta', '1.0.0');
    const { rufe, dialog } = addonKanaele({ isBundled: (pkg) => pkg.id === 'beta' });
    await rufe('extensions:scanExternal');
    expect(await rufe('extensions:confirmTrust', 'beta')).toBe(true);
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(await rufe('extensions:setEnabled', 'beta', true)).toEqual({
      ok: true,
      enabled: ['beta'],
    });
  });

  it('unbekannte Pakete und ungültige Angaben werden abgewiesen', async () => {
    legePaketAn('alpha', '1.2.0');
    const { rufe } = addonKanaele();
    await rufe('extensions:scanExternal');
    expect(await rufe('extensions:setEnabled', 'gibt-es-nicht', true)).toEqual({
      ok: false,
      error: 'extensions:unknown',
    });
    for (const [id, on] of [
      ['../alpha', true],
      [42, true],
      ['alpha', 'ja'],
    ]) {
      expect(await rufe('extensions:setEnabled', id, on)).toEqual({
        ok: false,
        error: 'extensions:invalidArgument',
      });
    }
  });
});

// --- Auslieferung von Code und Einstiegs-Adresse -------------------------------------

describe('Code und Einstiegs-Adresse nur für erlaubte Pakete', () => {
  const FAELLE = [
    { name: 'bestätigt und eingeschaltet', trusted: true, enabled: true, bundled: false, ja: true },
    { name: 'bestätigt, aber aus', trusted: true, enabled: false, bundled: false, ja: false },
    {
      name: 'eingeschaltet, nicht bestätigt',
      trusted: false,
      enabled: true,
      bundled: false,
      ja: false,
    },
    {
      name: 'mitgeliefert und eingeschaltet',
      trusted: false,
      enabled: true,
      bundled: true,
      ja: true,
    },
    { name: 'mitgeliefert, aber aus', trusted: false, enabled: false, bundled: true, ja: false },
  ];
  for (const fall of FAELLE) {
    it(fall.name, async () => {
      legePaketAn('alpha', '1.2.0');
      const start = {};
      if (fall.trusted) start[EXTERNAL_TRUSTED_KEY] = { alpha: '1.2.0' };
      if (fall.enabled) start[EXTERNAL_ENABLED_KEY] = ['alpha'];
      const { rufe } = addonKanaele({ start, isBundled: () => fall.bundled });
      const [eintrag] = await rufe('extensions:scanExternal');
      const quelle = await rufe('extensions:getMarkdownPluginSource', 'alpha');
      if (fall.ja) {
        expect(eintrag.entryUrl).toMatch(/^file:/);
        expect(quelle).toMatchObject({ ok: true, version: '1.2.0' });
      } else {
        expect(eintrag.entryUrl).toBeNull();
        expect(quelle).toEqual({ ok: false, error: 'extensions:notPermitted' });
      }
    });
  }

  // Review-Befund Z3 vom 2026-11-22: Eine Kennung, die der letzte Scan nicht
  // kennt, bekommt keinen Quelltext, auch wenn die Erlaubnisse sie führen.
  it('eine unbekannte oder ungültige Kennung bekommt keinen Quelltext', async () => {
    legePaketAn('alpha', '1.2.0');
    const start = {
      [EXTERNAL_TRUSTED_KEY]: { alpha: '1.2.0', beta: '1.0.0' },
      [EXTERNAL_ENABLED_KEY]: ['alpha', 'beta'],
    };
    const { rufe } = addonKanaele({ start });
    await rufe('extensions:scanExternal');
    for (const id of ['beta', '../alpha', 'Alpha']) {
      expect(await rufe('extensions:getMarkdownPluginSource', id)).toEqual({
        ok: false,
        error: 'extensions:notPermitted',
      });
    }
  });
});

// --- Fehler-Kanal ----------------------------------------------------------------------

describe('Fehler-Kanal extensions:reportError', () => {
  it('kürzt den Text, schaltet aus und verteilt', async () => {
    legePaketAn('alpha', '1.2.0');
    const { rufe, store, win } = addonKanaele({
      start: { [EXTERNAL_TRUSTED_KEY]: { alpha: '1.2.0' }, [EXTERNAL_ENABLED_KEY]: ['alpha'] },
    });
    await rufe('extensions:scanExternal');
    const lang = 'F'.repeat(MAX_ERROR_TEXT + 300);
    expect(await rufe('extensions:reportError', 'alpha', lang)).toEqual({
      ok: true,
      enabled: [],
    });
    expect(store.werte.get(EXTERNAL_ERRORS_KEY).alpha).toHaveLength(MAX_ERROR_TEXT);
    expect(gesendet(win, 'extensionsExternal:changed')).toEqual([[]]);
  });

  it('weist leeren Text und unbekannte Pakete ab', async () => {
    legePaketAn('alpha', '1.2.0');
    const { rufe, store } = addonKanaele();
    await rufe('extensions:scanExternal');
    expect(await rufe('extensions:reportError', 'alpha', '')).toEqual({
      ok: false,
      error: 'extensions:invalidArgument',
    });
    expect(await rufe('extensions:reportError', 'gibt-es-nicht', 'x')).toEqual({
      ok: false,
      error: 'extensions:unknown',
    });
    expect(store.set).not.toHaveBeenCalled();
  });
});

// --- Der allgemeine Weg ----------------------------------------------------------------

describe('settings:set nimmt keine Erlaubnis an', () => {
  it('die drei Schlüssel der Add-ons und scripts.run werden abgewiesen', () => {
    const { rufe, store } = einstellungsKanaele();
    for (const [key, wert] of [
      [EXTERNAL_TRUSTED_KEY, { alpha: '1.2.0' }],
      [EXTERNAL_ENABLED_KEY, ['alpha']],
      [EXTERNAL_ERRORS_KEY, {}],
      ['scripts.run', true],
    ]) {
      expect(rufe('settings:set', key, wert)).toEqual({ ok: false, error: 'settings:permission' });
    }
    expect(store.set).not.toHaveBeenCalled();
  });
});

// --- Skript-Schalter ------------------------------------------------------------------

describe('Kanal settings:setScriptsRun', () => {
  it('«Abbrechen» lässt den Schalter aus', async () => {
    const { rufe, store, win, dialog } = einstellungsKanaele({ antwort: 1 });
    expect(await rufe('settings:setScriptsRun', true)).toEqual({ ok: true, enabled: false });
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
    expect(gesendet(win, 'perspectiveScripts:changed')).toEqual([]);
  });

  it('«Einschalten» schaltet ihn an und verteilt', async () => {
    const { rufe, store, win } = einstellungsKanaele({ antwort: 0 });
    expect(await rufe('settings:setScriptsRun', true)).toEqual({ ok: true, enabled: true });
    expect(store.werte.get('scripts.run')).toBe(true);
    expect(gesendet(win, 'perspectiveScripts:changed')).toEqual([true]);
  });

  it('Ausschalten braucht keinen Dialog', async () => {
    const { rufe, store, dialog } = einstellungsKanaele({ start: { 'scripts.run': true } });
    expect(await rufe('settings:setScriptsRun', false)).toEqual({ ok: true, enabled: false });
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(store.werte.get('scripts.run')).toBe(false);
  });

  it('ein Wert, der kein Wahrheitswert ist, wird abgewiesen', async () => {
    const { rufe, store } = einstellungsKanaele({ antwort: 0 });
    expect(await rufe('settings:setScriptsRun', 'ja')).toEqual({
      ok: false,
      error: 'settings:invalidValue',
    });
    expect(store.set).not.toHaveBeenCalled();
  });

  it('der Dialog zeigt den Wortlaut der Sprachdatei, Vorgabe «Abbrechen»', async () => {
    const erwartet = {
      de: {
        title: 'Skript-Blöcke ausführen?',
        message:
          'Skript-Blöcke in Dokumenten werden künftig ausgeführt. Schalte das nur ein, wenn du den Dokumenten vertraust, die du öffnest.',
        buttons: ['Einschalten', 'Abbrechen'],
      },
      en: {
        title: 'Run script blocks?',
        message:
          'Script blocks in documents will be run from now on. Only turn this on if you trust the documents you open.',
        buttons: ['Turn on', 'Cancel'],
      },
    };
    for (const locale of ['de', 'en']) {
      const { rufe, dialog } = einstellungsKanaele({ antwort: 1, locale });
      await rufe('settings:setScriptsRun', true);
      const [, optionen] = dialog.showMessageBox.mock.calls[0];
      expect(optionen).toMatchObject({ ...erwartet[locale], defaultId: 1, cancelId: 1 });
    }
  });
});
