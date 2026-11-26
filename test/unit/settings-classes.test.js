// 4T-002649 (Epic 3E-000416): Der Einstellungs-Kanal in drei Klassen.
//
// Geprüft wird viererlei. (1) Der Wächter: Jeder Schlüssel, den der
// Anzeige-Code über den allgemeinen Weg schreibt, steht in der Tabelle
// `src/main/app/settings-classes.js`, keiner ist Klasse 3 und seit 4T-002650
// keiner Klasse 2; umgekehrt schreibt der Anzeige-Code jeden Schlüssel
// der Klasse 1 irgendwo, die Tabelle trägt also nichts auf Vorrat. (2) Der
// Kanal `settings:set` weist Klasse 2, Klasse 3,
// unbekannte Schlüssel und Werte der falschen Art ab und lässt einen gültigen
// Wert der Klasse 1 unverändert in den Speicher. (3) Der Vorlagen-Kanal
// `templates:setGlobalConfig` weist Regeln in falscher Form ab und, hinter der
// Prüfung der Anmelde-Stelle, einen Ordner in einem geschützten Ort.
//
// Bestands-Lesungen: im Modulkopf, einmal. Gelesen werden die Quelldateien
// unter `src/renderer/` ohne die erzeugten Bundles (Begründung wie in
// save-guard-aufrufer.test.js: Der Bündler minifiziert die gesuchten Aufrufe
// weg). Die Schreib-Stellen sind die Aufrufe von `setSetting`,
// `persistSetting` und `persistFn`; ihr erstes Argument wird als Text gelesen
// und zum Schlüssel aufgelöst: Text-Literal, Konstante der Datei,
// eingebundene Konstante (aus `src/shared/` über das Modul selbst, aus einem
// Anzeige-Modul über seinen Text), dazu drei benannte Formen (Ternär-Ausdruck,
// Aufruf einer geteilten Schlüssel-Funktion, Schleife über eine
// Schlüssel-Tafel) und die Sonderfälle unten. Eine Stelle, die sich nicht
// auflösen lässt, macht den Wächter rot, statt übergangen zu werden.
import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const classes = require('../../src/main/app/settings-classes.js');
const { DISPLAY, PERMISSION, PROTECTED, DISPLAY_KEYS, PERMISSION_KEYS, PROTECTED_KEYS, classOf } =
  classes;
const { registerSettingsIpc } = require('../../src/main/ipc/settings.js');
const { registerTemplatesIpc } = require('../../src/main/ipc/templates.js');
const { createChannelGuard } = require('../../src/main/ipc/channel-guard.js');
const { resolveProgramList } = require('../../src/main/grants/binding-grants.js');
const { CLOCK_MODE_KEYS } = require('../../src/shared/clock/clock-options.js');
const { KANBAN_VORGABEN } = require('../../src/shared/kanban-anzeige.js');
const { extensionDataKey } = require('../../src/shared/extensions/extensions-external.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDERER = path.join(WURZEL, 'src', 'renderer');
const SHARED = path.join(WURZEL, 'src', 'shared');

// --- Bestands-Lesung ---------------------------------------------------------------

function jsDateien(verzeichnis) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...jsDateien(voll));
    else if (eintrag.name.endsWith('.js') && !eintrag.name.endsWith('.bundle.js')) {
      gefunden.push(voll);
    }
  }
  return gefunden;
}

const QUELLEN = jsDateien(RENDERER).map((voll) => ({
  voll,
  relativ: path.relative(WURZEL, voll).replace(/\\/g, '/'),
  text: fs.readFileSync(voll, 'utf8'),
}));

// Anzeige-Module, deren Konstanten eine Schreib-Stelle einbindet (Text-Lesung).
const textCache = new Map(QUELLEN.map((q) => [q.voll, q.text]));
function textVon(voll) {
  if (!textCache.has(voll)) textCache.set(voll, fs.readFileSync(voll, 'utf8'));
  return textCache.get(voll);
}

// --- Auflösung der Schreib-Stellen -------------------------------------------------

const AUFRUF = /\b(setSetting|persistSetting|persistFn)\(/g;

// Die drei Hüllen, die einen Schlüssel nur durchreichen (views.js,
// extension-lifecycle.js, sidebar-layout.js): Sie tragen selbst keinen
// Schlüssel, ihre Aufrufer sind die Schreib-Stellen. Seit 4T-002650 halten sie
// die Antwort fest (`antwort = await api.setSetting(...)`); die vierte Hülle in
// extension-host.js ist entfallen, weil der Host keine Erlaubnis mehr schreibt.
const HUELLE =
  /\(key, value\)\s*(?:=>\s*)?\{\s*(?:let\s+\w+;\s*)?try\s*\{\s*(?:\w+\s*=\s*)?await\s+api\.$/;

// Geteilte Schlüssel-Funktionen: der Aufruf liefert einen der Schlüssel.
const SCHLUESSEL_FUNKTIONEN = {
  clockModeKey: () => [...CLOCK_MODE_KEYS],
  // Jede gültige Kennung eines Add-ons; ein Beispiel genügt, die Familie
  // prüft die Kennung selbst.
  extensionDataKey: () => [extensionDataKey('beispiel-erweiterung')],
};

// Sonderfälle mit Begründung: Die Kanban-Schalter schreiben den Schlüssel der
// Vorgabe, die sie vorher in `KANBAN_VORGABEN` nachgeschlagen haben
// (`kanbanAnzeigeSchalter`); ein unbekannter Schlüssel bricht dort vor dem
// Schreiben ab.
const KANBAN_SCHLUESSEL = () => KANBAN_VORGABEN.map((v) => v.schluessel);
const SONDERFAELLE = {
  'src/renderer/modules/kanban/kanban-anzeige-schalter.js|schalter.schluessel': KANBAN_SCHLUESSEL,
  'src/renderer/modules/kanban/kanban-anzeige-schalter.js|schluessel': KANBAN_SCHLUESSEL,
};

// Erstes Argument eines Aufrufs ab der öffnenden Klammer, bis zum ersten
// Komma oder zur schließenden Klammer auf oberster Ebene.
function erstesArgument(text, klammer) {
  let tiefe = 0;
  let quote = null;
  for (let i = klammer + 1; i < text.length; i++) {
    const z = text[i];
    if (quote) {
      if (z === '\\') i += 1;
      else if (z === quote) quote = null;
      continue;
    }
    if (z === "'" || z === '"' || z === '`') quote = z;
    else if ('([{'.includes(z)) tiefe += 1;
    else if (')]}'.includes(z)) {
      if (tiefe === 0) return text.slice(klammer + 1, i).trim();
      tiefe -= 1;
    } else if (z === ',' && tiefe === 0) return text.slice(klammer + 1, i).trim();
  }
  return null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rechteSeite(rhs, datei, text, pos, tiefe) {
  const r = rhs.trim();
  let m = /^'([^']*)'$/.exec(r) || /^"([^"]*)"$/.exec(r);
  if (m) return [m[1]];
  m = /^[^?]+\?\s*'([^']+)'\s*:\s*'([^']+)'$/.exec(r);
  if (m) return [m[1], m[2]];
  m = /^(\w+)\(/.exec(r);
  if (m && SCHLUESSEL_FUNKTIONEN[m[1]]) return SCHLUESSEL_FUNKTIONEN[m[1]]();
  if (/^\w+$/.test(r)) return bezeichner(r, datei, text, pos, tiefe + 1);
  return null;
}

// Ein Bezeichner: Konstante der Datei, Schleife über eine Schlüssel-Tafel oder
// eingebundene Konstante.
function bezeichner(name, datei, text, pos, tiefe = 0) {
  if (tiefe > 5) return null;
  const n = escapeRe(name);
  const konstanten = [...text.matchAll(new RegExp(`\\bconst\\s+${n}\\s*=\\s*([^;]+);`, 'g'))];
  if (konstanten.length > 0) {
    const davor = konstanten.filter((k) => k.index < pos);
    const treffer = davor.length > 0 ? davor[davor.length - 1] : konstanten[0];
    return rechteSeite(treffer[1], datei, text, treffer.index, tiefe);
  }
  const schleife = new RegExp(
    `for\\s*\\(\\s*const\\s*\\[\\s*\\w+\\s*,\\s*${n}\\s*\\]\\s*of\\s+Object\\.entries\\((\\w+)\\)\\)`,
  ).exec(text);
  if (schleife) {
    const tafel = new RegExp(`\\bconst\\s+${escapeRe(schleife[1])}\\s*=\\s*\\{([^}]*)\\}`).exec(
      text,
    );
    if (!tafel) return null;
    return [...tafel[1].matchAll(/:\s*'([^']+)'/g)].map((x) => x[1]);
  }
  for (const imp of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    for (const teil of imp[1].split(',')) {
      const [orig, alias] = teil.trim().split(/\s+as\s+/);
      if ((alias || orig) !== name) continue;
      const ziel = path.resolve(path.dirname(datei), imp[2]);
      if (ziel.startsWith(SHARED + path.sep)) {
        const wert = require(ziel)[orig];
        return typeof wert === 'string' ? [wert] : null;
      }
      return bezeichner(orig, ziel, textVon(ziel), Infinity, tiefe + 1);
    }
  }
  return null;
}

/**
 * Die Schreib-Stellen einer Menge von Quellen samt ihren Schlüsseln.
 *
 * @param {{voll: string, relativ: string, text: string}[]} quellen
 * @returns {{stellen: object[], huellen: string[], offen: string[]}}
 */
function schreibStellen(quellen) {
  const stellen = [];
  const huellen = [];
  const offen = [];
  for (const { voll, relativ, text } of quellen) {
    for (const m of text.matchAll(AUFRUF)) {
      const zeilenAnfang = text.lastIndexOf('\n', m.index) + 1;
      const zeile = text.slice(zeilenAnfang, text.indexOf('\n', m.index));
      if (/^\s*(\/\/|\*)/.test(zeile)) continue;
      if (/function\s+$/.test(text.slice(zeilenAnfang, m.index))) continue;
      const ort = `${relativ}:${text.slice(0, m.index).split('\n').length}`;
      const klammer = m.index + m[0].length - 1;
      const arg = erstesArgument(text, klammer);
      if (arg === 'key' && HUELLE.test(text.slice(Math.max(0, m.index - 120), m.index))) {
        huellen.push(ort);
        continue;
      }
      const sonder = SONDERFAELLE[`${relativ}|${arg}`];
      const schluessel = sonder
        ? sonder()
        : arg === null
          ? null
          : rechteSeite(arg, voll, text, m.index, 0);
      if (!schluessel || schluessel.length === 0) offen.push(`${ort} (${arg})`);
      else stellen.push({ ort, arg, sonder: !!sonder, schluessel });
    }
  }
  return { stellen, huellen, offen };
}

// Abgleich der Stellen mit der Tabelle; dieselbe Funktion trägt Wächter und
// Gegenprobe.
function abgleich(stellen) {
  const unbekannt = [];
  const klasse2 = [];
  const klasse3 = [];
  for (const s of stellen) {
    for (const key of s.schluessel) {
      const eintrag = classOf(key);
      if (!eintrag) unbekannt.push(`${s.ort} ${key}`);
      else if (eintrag.klass === PROTECTED) klasse3.push(`${s.ort} ${key}`);
      else if (eintrag.klass === PERMISSION) klasse2.push(`${s.ort} ${key}`);
    }
  }
  return { unbekannt, klasse2, klasse3 };
}

const BESTAND = schreibStellen(QUELLEN);
const GESCHRIEBEN = new Set(BESTAND.stellen.flatMap((s) => s.schluessel));

describe('Wächter: die Schreib-Stellen des Anzeige-Codes gegen die Tabelle', () => {
  it('jede Schreib-Stelle lässt sich zu ihren Schlüsseln auflösen', () => {
    expect(BESTAND.offen).toEqual([]);
  });

  it('die Hüllen, die nur durchreichen, sind genau die drei bekannten', () => {
    expect(BESTAND.huellen.map((o) => o.replace(/:\d+$/, '')).sort()).toEqual([
      'src/renderer/modules/extensions/extension-lifecycle.js',
      'src/renderer/modules/sidebar-layout.js',
      'src/renderer/modules/views/views.js',
    ]);
  });

  it('jeder Sonderfall wird noch gebraucht', () => {
    const genutzt = new Set(
      BESTAND.stellen.filter((s) => s.sonder).map((s) => `${s.ort.replace(/:\d+$/, '')}|${s.arg}`),
    );
    expect([...genutzt].sort()).toEqual(Object.keys(SONDERFAELLE).sort());
  });

  it('der Wächter sieht den ganzen Bestand (Plausibilitäts-Schranke)', () => {
    // Am 2026-11-22: 126 Schreib-Stellen mit 125 Schlüsseln (120 der Klasse 1,
    // ein Beispiel der Familie extensionData, 4 der Klasse 2); seit 4T-002650
    // ohne die neun Stellen der Klasse 2, also 117 Stellen mit 121 Schlüsseln.
    expect(BESTAND.stellen.length).toBeGreaterThanOrEqual(110);
    expect(GESCHRIEBEN.size).toBeGreaterThanOrEqual(120);
  });

  it('jeder geschriebene Schlüssel steht in der Tabelle, keiner ist Klasse 3', () => {
    const { unbekannt, klasse3 } = abgleich(BESTAND.stellen);
    expect(unbekannt).toEqual([]);
    expect(klasse3).toEqual([]);
  });

  it('Klasse 2 schreibt der Anzeige-Code nicht (seit 4T-002650)', () => {
    const { klasse2 } = abgleich(BESTAND.stellen);
    expect(klasse2).toEqual([]);
  });

  it('jeder Schlüssel der Klasse 1 wird irgendwo geschrieben (nichts auf Vorrat)', () => {
    const ungenutzt = Object.keys(DISPLAY_KEYS).filter((k) => !GESCHRIEBEN.has(k));
    expect(ungenutzt).toEqual([]);
  });

  it('Gegenprobe: ein erfundener Schlüssel und eine unlesbare Stelle werden gemeldet', () => {
    const erfunden = schreibStellen([
      {
        voll: path.join(RENDERER, 'modules', 'erfunden.js'),
        relativ: 'src/renderer/modules/erfunden.js',
        text: [
          "const ERFUNDEN_KEY = 'erfunden.schluessel';",
          'export async function a() {',
          "  await persistSetting('autoSave', true);",
          '  await persistSetting(ERFUNDEN_KEY, 1);',
          "  await api.setSetting('templates.folder', '/x');",
          '  await api.setSetting(irgendwas(), 1);',
          '}',
        ].join('\n'),
      },
    ]);
    expect(erfunden.offen).toEqual(['src/renderer/modules/erfunden.js:6 (irgendwas())']);
    const { unbekannt, klasse3 } = abgleich(erfunden.stellen);
    expect(unbekannt).toEqual(['src/renderer/modules/erfunden.js:4 erfunden.schluessel']);
    expect(klasse3).toEqual(['src/renderer/modules/erfunden.js:5 templates.folder']);
  });
});

// --- Der Kanal settings:set ----------------------------------------------------------

function settingsKanal() {
  const werte = new Map();
  const store = {
    get: (k) => werte.get(k),
    set: vi.fn((k, v) => werte.set(k, v)),
  };
  const warn = vi.fn();
  const kanaele = new Map();
  registerSettingsIpc((k, fn) => kanaele.set(k, fn), {
    BrowserWindow: { getAllWindows: () => [] },
    nativeTheme: {},
    senderWindow: () => null,
    getStore: () => store,
    applyMenuToAllWindows: vi.fn(),
    updateAllCaptionColors: vi.fn(),
    timerChecker: { reschedule: vi.fn() },
    pushRecent: vi.fn(),
    routeShelfFileToBookApp: vi.fn(),
    bindBookIfBookFile: vi.fn(),
    bindShelfIfShelfFile: vi.fn(),
    broadcast: vi.fn(),
    warn,
  });
  const setze = (key, value) => kanaele.get('settings:set')({ sender: null }, key, value);
  return { setze, store, werte, warn };
}

const GEHEIM = 'GEHEIMER-WERT-4711';

describe('settings:set nach Klassen', () => {
  it('Klasse 3 wird abgewiesen, auch über einen Eltern- oder Kind-Schlüssel', () => {
    const { setze, store, warn } = settingsKanal();
    for (const key of [...PROTECTED_KEYS, 'templates', 'workflows', 'apps.0', 'windows.main']) {
      expect(setze(key, GEHEIM)).toEqual({ ok: false, error: 'settings:protected' });
    }
    expect(store.set).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Einstellung abgewiesen:', 'templates.folder', 'protected');
  });

  it('Klasse 2 wird abgewiesen, auch mit gültigem Wert und über Eltern- oder Kind-Schlüssel', () => {
    const { setze, store } = settingsKanal();
    for (const key of ['extensionsExternal', 'scripts', 'extensionsExternal.trusted.x']) {
      expect(setze(key, {})).toEqual({ ok: false, error: 'settings:permission' });
    }
    // 4T-002650: Der Übergang ist geschlossen; die Erlaubnisse schreibt allein
    // der Hauptprozess über eigene Kanäle.
    const gueltig = {
      'extensionsExternal.trusted': { a: '1.0.0' },
      'extensionsExternal.enabled': ['a'],
      'extensionsExternal.lastError': {},
      'scripts.run': true,
    };
    expect(Object.keys(gueltig).sort()).toEqual([...PERMISSION_KEYS].sort());
    for (const [key, value] of Object.entries(gueltig)) {
      expect(setze(key, value)).toEqual({ ok: false, error: 'settings:permission' });
    }
    expect(store.set).not.toHaveBeenCalled();
  });

  it('unbekannte Schlüssel werden abgewiesen', () => {
    const { setze, store } = settingsKanal();
    for (const key of [
      'erfunden.schluessel',
      '__proto__',
      'constructor',
      'extensionData',
      'extensionData.Gross',
      'extensionData.a.b',
      'autoSave.x',
      'a'.repeat(201),
    ]) {
      expect(setze(key, true)).toEqual({ ok: false, error: 'settings:unknownKey' });
    }
    expect(store.set).not.toHaveBeenCalled();
  });

  it('ein Schlüssel, der kein Text ist, wird abgewiesen', () => {
    const { setze, store, warn } = settingsKanal();
    for (const key of [42, '', null, undefined, { a: 1 }]) {
      expect(setze(key, true)).toEqual({ ok: false, error: 'settings:invalidKey' });
    }
    expect(store.set).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Einstellung abgewiesen:', '<number>', 'invalidKey');
  });

  it('die Warnung nennt Schlüssel und Grund, nie den Wert, und kürzt einen langen Schlüssel', () => {
    const { setze, warn } = settingsKanal();
    setze('templates.folder', GEHEIM);
    setze('erfunden', GEHEIM);
    setze('autoSave', GEHEIM);
    setze('x'.repeat(5000), GEHEIM);
    expect(warn).toHaveBeenCalledTimes(4);
    for (const aufruf of warn.mock.calls) {
      expect(JSON.stringify(aufruf)).not.toContain(GEHEIM);
      expect(aufruf[1].length).toBeLessThanOrEqual(200);
    }
  });

  // Je Art ein Wert der falschen Art; die Arten liest der Fall aus der Tabelle.
  const FALSCH = {
    boolean: ['true', 1, null],
    number: ['1', Number.NaN, Number.POSITIVE_INFINITY, null],
    string: [42, null, ['x']],
    enum: ['__keine-option__', null],
    object: [[], null, 'x', new Date(0)],
    array: [{}, 'x', null],
    null: [false, {}, ''],
  };

  it('je Art wird ein Wert der falschen Art abgewiesen', () => {
    const arten = new Set(Object.values(DISPLAY_KEYS).map((k) => k.kind));
    expect([...arten].sort()).toEqual(Object.keys(FALSCH).sort());
    const { setze, store } = settingsKanal();
    for (const art of arten) {
      const key = Object.keys(DISPLAY_KEYS).find((k) => DISPLAY_KEYS[k].kind === art);
      for (const wert of FALSCH[art]) {
        expect(setze(key, wert), `${key} = ${String(wert)}`).toEqual({
          ok: false,
          error: 'settings:invalidValue',
        });
      }
    }
    expect(store.set).not.toHaveBeenCalled();
  });

  it('die Feinheiten der Arten: ganze Zahl, Länge und Muster des Texts, Elemente der Liste', () => {
    const { setze } = settingsKanal();
    const falsch = { ok: false, error: 'settings:invalidValue' };
    expect(setze('appearance.editorSize', 14.5)).toEqual(falsch);
    expect(setze('appearance.editorFont', 'x'.repeat(201))).toEqual(falsch);
    expect(setze('language', 'de; rm')).toEqual(falsch);
    expect(setze('language', 'custom:../x')).toEqual(falsch);
    expect(setze('app.editViewMode', 'rendered')).toEqual(falsch);
    expect(setze('panelToggle.order', ['outline', 7])).toEqual(falsch);
    expect(setze('extensionData.meine-erweiterung', [])).toEqual(falsch);
  });

  it('ein gültiger Wert der Klasse 1 erreicht den Speicher unverändert', () => {
    const { setze, store, werte } = settingsKanal();
    const hotkeys = { 'file.save': 'Ctrl+S', verschachtelt: { a: [1, 2] } };
    const faelle = [
      ['autoSave', false],
      ['appearance.editorSize', 16],
      ['historyMaxPacketMinutes', 2.5],
      ['language', 'custom:de-CH'],
      ['app.defaultViewMode', 'live'],
      ['hotkeys', hotkeys],
      ['panelToggle.order', ['outline', 'tags']],
      ['bookmarks', null],
      ['extensionData.meine-erweiterung', { zaehler: 3 }],
    ];
    for (const [key, value] of faelle) {
      expect(classOf(key).klass).toBe(DISPLAY);
      expect(setze(key, value)).toEqual({ ok: true });
      expect(store.set).toHaveBeenLastCalledWith(key, value);
      expect(werte.get(key)).toBe(value);
    }
    expect(werte.get('hotkeys')).toEqual({ 'file.save': 'Ctrl+S', verschachtelt: { a: [1, 2] } });
  });
});

// --- Der Vorlagen-Kanal ----------------------------------------------------------------

const BASE = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-klassen-')));
const PROGRAMM = path.join(BASE, 'Programm');
const DATEN = path.join(BASE, 'Daten');
const DRAUSSEN = path.join(BASE, 'Vorlagen');
for (const dir of [PROGRAMM, path.join(DATEN, 'extensions'), DRAUSSEN]) {
  fs.mkdirSync(dir, { recursive: true });
}

afterAll(() => {
  try {
    fs.rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
});

function vorlagenKanal() {
  const werte = new Map();
  const store = { get: (k) => werte.get(k), set: vi.fn((k, v) => werte.set(k, v)) };
  const kanaele = new Map();
  registerTemplatesIpc((k, fn) => kanaele.set(k, fn), {
    dialog: {},
    senderWindow: () => null,
    areaOfWindow: () => null,
    tForWindow: () => '',
    getStore: () => store,
    mddStore: {},
    isMarkdownPath: () => true,
    MAX_EMBED_BYTES: 0,
    readAreaTemplatesConfig: vi.fn(),
    resolveTemplatesForWindow: vi.fn(),
  });
  const guard = createChannelGuard({
    protectedFolders: resolveProgramList({
      execPath: path.join(PROGRAMM, 'EM4me.exe'),
      userDataFolder: DATEN,
      portableMode: { portabel: false, datenOrdner: null },
    }),
    areaRootOf: () => null,
    warn: vi.fn(),
  });
  const roh = kanaele.get('templates:setGlobalConfig');
  const geprueft = guard.wrap('templates:setGlobalConfig', roh);
  const rufe = (config) => geprueft({ sender: { id: 1 } }, config);
  return { rufe, roh, store, werte };
}

describe('templates:setGlobalConfig', () => {
  it('speichert Ordner und Regeln getrimmt und nur mit ihren Feldern', async () => {
    const { rufe, werte } = vorlagenKanal();
    const antwort = await rufe({
      folder: ` ${DRAUSSEN} `,
      rules: [{ folder: ' Notizen ', template: ' Notiz.md ', fremd: 1 }],
    });
    expect(antwort).toEqual({ ok: true });
    expect(werte.get('templates.folder')).toBe(DRAUSSEN);
    expect(werte.get('templates.rules')).toEqual([{ folder: 'Notizen', template: 'Notiz.md' }]);
  });

  it('ein leerer Ordner heißt «nicht festgelegt»', async () => {
    const { rufe, werte } = vorlagenKanal();
    expect(await rufe({ folder: '', rules: [] })).toEqual({ ok: true });
    expect(werte.get('templates.folder')).toBe('');
  });

  it('weist ein Ziel im geschützten Ordner ab, ohne zu speichern', async () => {
    const { rufe, store } = vorlagenKanal();
    for (const ordner of [PROGRAMM, path.join(DATEN, 'extensions'), path.join(PROGRAMM, 'neu')]) {
      expect(await rufe({ folder: ordner, rules: [] })).toEqual({
        ok: false,
        error: 'guard:protectedFolder',
      });
    }
    expect(store.set).not.toHaveBeenCalled();
  });

  it('weist eine falsche Form ab, ohne zu speichern', async () => {
    const { rufe, store } = vorlagenKanal();
    const faelle = [
      [null, 'invalid config'],
      [[], 'invalid config'],
      ['x', 'invalid config'],
      [{ folder: 'relativ', rules: [] }, 'invalid folder'],
      [{ folder: DRAUSSEN, rules: {} }, 'invalid rules'],
      [{ folder: DRAUSSEN, rules: [null] }, 'invalid rules'],
      [{ folder: DRAUSSEN, rules: [['Notizen', 'Notiz.md']] }, 'invalid rules'],
      [{ folder: DRAUSSEN, rules: [{ folder: 'Notizen' }] }, 'invalid rules'],
      [{ folder: DRAUSSEN, rules: [{ folder: 'Notizen', template: '  ' }] }, 'invalid rules'],
      [{ folder: DRAUSSEN, rules: [{ folder: 7, template: 'Notiz.md' }] }, 'invalid rules'],
      [{ folder: DRAUSSEN, rules: [{ folder: 'N', template: 'x'.repeat(5000) }] }, 'invalid rules'],
      [
        {
          folder: DRAUSSEN,
          rules: Array.from({ length: 1001 }, () => ({ folder: '', template: 'a' })),
        },
        'invalid rules',
      ],
    ];
    for (const [config, fehler] of faelle) {
      // Der Ordner-Typ fällt schon an der Anmelde-Stelle; geprüft wird hier
      // der Handler selbst.
      const { roh } = vorlagenKanal();
      expect(await roh({}, config)).toEqual({ ok: false, error: fehler });
    }
    // Und hinter der Anmelde-Stelle: ein Ordner, der kein Text ist.
    expect(await rufe({ folder: 42, rules: [] })).toEqual({
      ok: false,
      error: 'guard:invalidArgument',
    });
    expect(store.set).not.toHaveBeenCalled();
  });
});
