// 4T-002648 (Epic 3E-000416): Erklärungs-Pflicht an der Anmelde-Stelle (AK1).
// Jeder angemeldete Kanal ist erklärt oder steht in der Übergangs-Liste, keiner
// steht in beiden, kein Eintrag ist ohne Anmeldung, die Übergangs-Liste wächst
// nicht, und ein Kanal ohne Erklärung lässt sich nicht anmelden.
//
// Bestands-Lesungen: Gezählt wird ohne Electron. Die Anmelde-Funktionen der
// Kanal-Gruppen, die `src/main/main.js` einbindet und in `registerIpc` aufruft,
// laufen hier mit einer aufzeichnenden Registrier-Funktion; die Abhängigkeiten
// ersetzt ein Stellvertreter, der jeden Zugriff und Aufruf beantwortet, weil
// einige Gruppen beim Anmelden Bezüge aufrufen (etwa der Workflow-Ordner).
// Gezählt wird damit, was tatsächlich angemeldet würde, auch die Kanäle, die
// eine Gruppe aus einer Vorlage bildet (`workflow-schedule.js`).
//
// Die Tabelle steht in Teilen je Kanal-Gruppe unter
// `src/main/ipc/channel-declarations/`. Geprüft wird, dass jeder Teil nur
// Kanäle seiner Gruppen trägt und dass der Einstieg beim Laden abbricht, wenn
// ein Kanal in zwei Teilen oder in einem Teil doppelt steht.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  NO_PATH,
  DECLARATIONS,
  NOT_YET_DECLARED,
  declarationOf,
  assertRegistrable,
} = require('../../src/main/ipc/channel-declarations.js');
const { FEHLER_FORM_CHANNELS, createChannelGuard } = require('../../src/main/ipc/channel-guard.js');

const REPO = path.resolve(__dirname, '..', '..');
const MAIN = fs.readFileSync(path.join(REPO, 'src', 'main', 'main.js'), 'utf8');

// Gezählt am 2026-11-21 auf dem Epic-Zweig: 287 angemeldete Kanäle; seit
// 4T-002649 dazu templates:setGlobalConfig, seit 4T-002650 dazu
// extensions:setEnabled, extensions:reportError und settings:setScriptsRun; seit
// der Zusammenführung des Funktions-Releases am 2026-11-25 dazu die drei Kanäle
// des Zuges 3E-000410 (journals:uebertrageAufgaben, lesePosition:lesen,
// lesePosition:merken).
const REGISTERED_COUNT = 294;
// Obergrenze der Übergangs-Liste: ihre Länge am 2026-11-21 (163). Sie darf nur
// sinken; 4T-002649 hat theme:setPref und workflow:setFolder erklärt,
// 4T-002650 settings:get, settings:set und drei Add-on-Kanäle (Art `keys`).
// Am 2026-11-25 beim Zusammenbau des Funktions-Releases um drei neue Kanäle des
// Zuges 3E-000410 erhöht (journals:uebertrageAufgaben, lesePosition:lesen,
// lesePosition:merken); ihre Erklärung gehört zu Stufe 2 (3E-000417), danach
// sinkt die Grenze wieder.
const NOT_YET_DECLARED_LIMIT = 159;

// 4T-002650: die Kanäle mit einer Erklärung der Art `keys`.
const KEY_CHANNELS = {
  'settings:get': 'settingKey',
  'settings:set': 'settingKey',
  'extensions:confirmTrust': 'extensionId',
  'extensions:getMarkdownPluginSource': 'extensionId',
  'extensions:removeExternal': 'extensionId',
  'extensions:setEnabled': 'extensionId',
  'extensions:reportError': 'extensionId',
};

// Kanäle, deren Handler an ein Modul weiterreicht: der Aufruf im Handler und
// das Modul, in dem die Fehler-Form steht.
const WEITERGEREICHT = {
  'task:applyLineEdit': {
    aufruf: 'aufgabenZeile.schreibeAufgabenZeile(',
    modul: require('../../src/main/ipc/aufgaben-zeile-schreiben.js').createAufgabenZeileSchreiben,
  },
};

const WRITE_CHANNELS = [
  'file:save',
  'note:write',
  'blockData:write',
  'blockData:rename',
  'file:rename',
  'subpage:create',
  'pdf:print',
  'html:write',
  'task:applyLineEdit',
  'events:applyFrontmatterEdit',
  'presentationPdf:print',
  'presentationHtml:write',
  'presentationPptx:export',
  'presentationImages:export',
  'demoArea:createAt',
  'shelves:createAt',
  'books:createAt',
  'parts:rejoin',
  'templates:createFile',
  'attachment:store',
  'shelves:assignBook',
  // 4T-002649: die beiden Ordner-Einstellungen (Umfang `bind`).
  'templates:setGlobalConfig',
  'workflow:setFolder',
];

// Stellvertreter für die Abhängigkeiten: jeder Zugriff und jeder Aufruf liefert
// ihn selbst; `then` bleibt leer, damit er nie als Versprechen gilt.
const stub = new Proxy(function () {}, {
  get: (_t, key) => (key === 'then' || typeof key === 'symbol' ? undefined : stub),
  apply: () => stub,
});

// Im Modulkopf, nicht im Prüffall: Das Laden der Kanal-Gruppen liest den
// Bestand (Test-README, «Bestands-Lesungen gehören in den Modulkopf»).
const IMPORTS = [
  ...MAIN.matchAll(/const \{ (register\w+Ipc) \} = require\('\.\/ipc\/([\w-]+)'\);/g),
];
const CALLS = [...MAIN.matchAll(/^ {2}(register\w+Ipc)\(registriere, ipcDeps\);$/gm)].map(
  (m) => m[1],
);
const registered = new Map();
// Kanal -> Kanal-Gruppe (Modul unter src/main/ipc/), die ihn anmeldet.
const groupOf = new Map();
for (const [, name, file] of IMPORTS) {
  const register = require(path.join(REPO, 'src', 'main', 'ipc', `${file}.js`))[name];
  register((channel, fn) => {
    if (registered.has(channel)) throw new Error(`doppelt angemeldet: ${channel}`);
    registered.set(channel, fn);
    groupOf.set(channel, file);
  }, stub);
}

// Die Teile der Tabelle: jede Datei im Ordner außer den Schreib-Hilfen.
const ENTRY = require.resolve('../../src/main/ipc/channel-declarations.js');
const PART_DIR = path.join(REPO, 'src', 'main', 'ipc', 'channel-declarations');
const PART_NAMES = fs
  .readdirSync(PART_DIR)
  .filter((f) => f.endsWith('.js') && f !== 'declaration-form.js')
  .map((f) => f.slice(0, -3));
const partPath = (name) => path.join(PART_DIR, `${name}.js`);
const PARTS = new Map(PART_NAMES.map((n) => [n, require(partPath(n))]));
const channelsOf = (part) => [
  ...(part.NO_PATH_CHANNELS || []),
  ...Object.keys(part.WRITE_DECLARATIONS || {}),
  ...Object.keys(part.KEY_DECLARATIONS || {}),
  ...(part.NOT_YET_DECLARED || []).map(([c]) => c),
];

// Lädt den Einstieg neu, nachdem `change` einen Teil im Modul-Zwischenspeicher
// ersetzt hat, und stellt danach Teil und Einstieg wieder her. So wird geprüft,
// was beim Laden geschieht, ohne eine zusätzliche Ausfuhr des Einstiegs.
function loadEntryWith(name, change) {
  const cachedEntry = require.cache[ENTRY];
  const cachedPart = require.cache[partPath(name)];
  const original = cachedPart.exports;
  cachedPart.exports = change(original);
  delete require.cache[ENTRY];
  try {
    return require(ENTRY);
  } finally {
    cachedPart.exports = original;
    require.cache[ENTRY] = cachedEntry;
  }
}

it('jede eingebundene Kanal-Gruppe wird angemeldet und jede angemeldete eingebunden', () => {
  // Sonst zählte der Fall an der Anmeldung vorbei.
  expect(IMPORTS.map((m) => m[1]).sort()).toEqual([...CALLS].sort());
  expect(CALLS.length).toBeGreaterThan(25);
});

describe('Erklärungs-Pflicht: Bestand', () => {
  it(`es sind ${REGISTERED_COUNT} Kanäle angemeldet`, () => {
    expect(registered.size).toBe(REGISTERED_COUNT);
    expect(DECLARATIONS.size + NOT_YET_DECLARED.size).toBe(REGISTERED_COUNT);
  });

  it('jeder angemeldete Kanal ist erklärt oder steht in der Übergangs-Liste', () => {
    const missing = [...registered.keys()].filter(
      (c) => !DECLARATIONS.has(c) && !NOT_YET_DECLARED.has(c),
    );
    expect(missing).toEqual([]);
  });

  it('kein Kanal ist erklärt und steht zugleich in der Übergangs-Liste', () => {
    expect([...NOT_YET_DECLARED.keys()].filter((c) => DECLARATIONS.has(c))).toEqual([]);
  });

  it('kein erklärter Kanal und kein Eintrag der Übergangs-Liste fehlt in der Anmeldung', () => {
    expect([...DECLARATIONS.keys()].filter((c) => !registered.has(c))).toEqual([]);
    expect([...NOT_YET_DECLARED.keys()].filter((c) => !registered.has(c))).toEqual([]);
  });

  it(`die Übergangs-Liste wächst nicht über ${NOT_YET_DECLARED_LIMIT}`, () => {
    expect(NOT_YET_DECLARED.size).toBeLessThanOrEqual(NOT_YET_DECLARED_LIMIT);
  });

  it('die Übergangs-Liste nennt je Kanal seine Einstufung aus der Erhebung', () => {
    for (const [channel, grade] of NOT_YET_DECLARED) {
      expect(['G0', 'G1', 'G2', 'G3', 'GD', 'new'], channel).toContain(grade);
    }
  });
});

describe('Teile je Kanal-Gruppe', () => {
  it('der Ordner trägt die Teile, und sie decken alle Einträge', () => {
    expect(PART_NAMES.length).toBeGreaterThan(20);
    const all = [...PARTS.values()].flatMap(channelsOf);
    expect(all).toHaveLength(REGISTERED_COUNT);
    expect(new Set(all).size).toBe(REGISTERED_COUNT);
  });

  it('jede angemeldete Kanal-Gruppe gehört zu genau einem Teil', () => {
    const groups = [...PARTS.values()].flatMap((p) => p.GROUPS);
    expect([...groups].sort()).toEqual(IMPORTS.map((m) => m[2]).sort());
  });

  it.each(PART_NAMES)('der Teil %s trägt nur Kanäle seiner Gruppen', (name) => {
    const part = PARTS.get(name);
    const foreign = channelsOf(part).filter((c) => !part.GROUPS.includes(groupOf.get(c)));
    expect(foreign).toEqual([]);
  });

  it('der unveränderte Teil lädt sich neu ohne Befund', () => {
    const fresh = loadEntryWith('settings', (p) => p);
    expect(fresh.DECLARATIONS.size).toBe(DECLARATIONS.size);
    expect(fresh.NOT_YET_DECLARED.size).toBe(NOT_YET_DECLARED.size);
  });

  it('ein erklärter Kanal in einem zweiten Teil bricht das Laden ab', () => {
    const add = (p) => ({ ...p, NO_PATH_CHANNELS: [...p.NO_PATH_CHANNELS, 'theme:current'] });
    expect(() => loadEntryWith('windows', add)).toThrow(
      'Kanal theme:current: in zwei Teilen (windows, settings)',
    );
  });

  it('ein Kanal der Übergangs-Liste in einem zweiten Teil bricht das Laden ab', () => {
    const add = (p) => ({ ...p, NOT_YET_DECLARED: [...p.NOT_YET_DECLARED, ['file:read', 'G2']] });
    expect(() => loadEntryWith('settings', add)).toThrow(
      'Kanal file:read: in zwei Teilen (settings, files)',
    );
  });

  it('ein im selben Teil erklärter und «noch nicht erklärter» Kanal bricht das Laden ab', () => {
    const add = (p) => ({
      ...p,
      NOT_YET_DECLARED: [...p.NOT_YET_DECLARED, ['theme:current', 'G3']],
    });
    expect(() => loadEntryWith('settings', add)).toThrow(
      'Kanal theme:current: erklärt und zugleich «noch nicht erklärt»',
    );
  });

  it('ein doppelter Eintrag im selben Teil bricht das Laden ab', () => {
    const add = (p) => ({ ...p, NO_PATH_CHANNELS: [...p.NO_PATH_CHANNELS, 'theme:current'] });
    expect(() => loadEntryWith('settings', add)).toThrow('Kanal-Erklärung theme:current: doppelt');
  });
});

describe('Erklärungs-Pflicht: Anmelde-Stelle', () => {
  it('ein Kanal ohne Erklärung lässt sich nicht anmelden', () => {
    expect(() => assertRegistrable('gibtsnicht:kanal')).toThrow(/ohne Erklärung/);
    expect(() => assertRegistrable(undefined)).toThrow(/ohne Erklärung/);
  });

  it('ein erklärter Kanal liefert seine Erklärung, einer der Übergangs-Liste null', () => {
    expect(assertRegistrable('theme:current')).toBe(NO_PATH);
    expect(assertRegistrable('file:save')).toBe(declarationOf('file:save'));
    const [transitional] = NOT_YET_DECLARED.keys();
    expect(assertRegistrable(transitional)).toBeNull();
    expect(declarationOf(transitional)).toBeNull();
  });

  it('die Anmelde-Stelle in main.js prüft jeden Kanal vor der Anmeldung', () => {
    const body = MAIN.match(/const registriere = \(kanal, fn\) => \{([\s\S]*?)\n {2}\};/);
    expect(body).not.toBeNull();
    const check = body[1].indexOf('assertRegistrable(kanal);');
    const handle = body[1].indexOf('ipcMain.handle(kanal');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(handle).toBeGreaterThan(check);
    // Der Handler läuft über die Prüfung von channel-guard.js (Teil 2) und
    // bekommt die Argumente unverändert.
    const wrap = body[1].indexOf('const handler = channelGuard.wrap(kanal, fn);');
    expect(wrap).toBeGreaterThan(check);
    expect(handle).toBeGreaterThan(wrap);
    expect(body[1]).toContain('return await handler(event, ...args);');
    // Keine zweite Anmeldung an der Prüfung vorbei.
    expect(MAIN.match(/ipcMain\.handle\(/g)).toHaveLength(1);
  });
});

describe('Erklärungen der schreibenden Endpunkte (21 aus 4T-002648, 2 aus 4T-002649)', () => {
  it.each(WRITE_CHANNELS)('%s ist mit seinen Pfad-Angaben erklärt', (channel) => {
    const decl = declarationOf(channel);
    expect(decl && decl.kind).toBe('paths');
    expect(decl.params.length).toBeGreaterThan(0);
    // Die Angaben gibt es im Handler: genug Argumente, und jedes genannte Feld
    // kommt im Rumpf vor.
    const handler = registered.get(channel);
    const source = handler.toString();
    for (const p of decl.params) {
      const [arg, ...fields] = p.at.replace(/\[\]/g, '').split('.');
      expect(handler.length, `${channel} ${p.at}`).toBeGreaterThanOrEqual(Number(arg) + 2);
      for (const field of fields) expect(source, `${channel} ${p.at}`).toContain(field);
    }
  });

  it('jede Erklärung ist eingefroren', () => {
    const decl = declarationOf('file:rename');
    expect(Object.isFrozen(decl)).toBe(true);
    expect(Object.isFrozen(decl.params[1])).toBe(true);
    expect(Object.isFrozen(decl.params[1].under)).toBe(true);
  });

  // 4T-002648, Teil 2: Die Abweisung der Prüfung nimmt die Fehler-Form des
  // Kanals an; die beiden Folien-Ausgaben melden `fehler`, alle übrigen `error`.
  it.each(WRITE_CHANNELS)(
    '%s meldet Fehler in der Form, die die Abweisung nachbildet',
    (channel) => {
      let source = registered.get(channel).toString();
      // Zusammenbau des Funktions-Release: task:applyLineEdit reicht seit
      // 4T-002813 an das Modul aufgaben-zeile-schreiben.js weiter; die
      // Fehler-Form steht dort. Geprüft werden Weitergabe und Modul.
      const weiter = WEITERGEREICHT[channel];
      if (weiter) {
        expect(source).toContain(weiter.aufruf);
        source += weiter.modul.toString();
      }
      if (FEHLER_FORM_CHANNELS.includes(channel)) expect(source).toMatch(/ok: false, fehler: {/);
      else expect(source).toMatch(/ok: false, error: /);
    },
  );

  it('es gibt genau 23 Erklärungen mit Pfad-Angaben', () => {
    const withPaths = [...DECLARATIONS].filter(([, d]) => d.kind === 'paths').map(([c]) => c);
    expect(withPaths.sort()).toEqual([...WRITE_CHANNELS].sort());
  });
});

// 4T-002650: Erklärungen der Art `keys` (Schlüssel des Einstellungs-Speichers
// oder Kennung eines Add-ons statt eines Pfads).
describe('Erklärungen der Art keys (4T-002650)', () => {
  it('genau die erwarteten Kanäle tragen eine Erklärung der Art keys', () => {
    const withKeys = [...DECLARATIONS].filter(([, d]) => d.kind === 'keys').map(([c]) => c);
    expect(withKeys.sort()).toEqual(Object.keys(KEY_CHANNELS).sort());
  });

  it.each(Object.entries(KEY_CHANNELS))('%s nimmt an der ersten Stelle %s', (channel, form) => {
    const decl = declarationOf(channel);
    expect(Object.isFrozen(decl)).toBe(true);
    expect(decl.params).toHaveLength(1);
    expect(decl.params[0]).toMatchObject({ at: '0', form });
    // Der Handler nimmt die Angabe entgegen.
    expect(registered.get(channel).length).toBeGreaterThanOrEqual(2);
  });

  it('das Lesen eines Schlüssels ist read, das Schreiben write', () => {
    expect(declarationOf('settings:get').params[0].scope).toBe('read');
    expect(declarationOf('settings:set').params[0].scope).toBe('write');
    expect(declarationOf('extensions:getMarkdownPluginSource').params[0].scope).toBe('read');
  });

  it('der Schalter der Skript-Blöcke nimmt weder Pfad noch Schlüssel', () => {
    expect(declarationOf('settings:setScriptsRun')).toBe(NO_PATH);
  });

  it.each([
    ['form', { at: '0', form: 'path', scope: 'read' }, /form path\?/],
    ['scope', { at: '0', form: 'settingKey', scope: 'list' }, /scope list\?/],
    ['at', { at: 'x', form: 'settingKey', scope: 'read' }, /at\?/],
    ['Zusatz-Feld', { at: '0', form: 'settingKey', scope: 'read', grants: ['area'] }, /grants\?/],
  ])('eine Angabe der Art keys mit falschem %s bricht das Laden ab', (_was, param, fehler) => {
    const add = (p) => ({
      ...p,
      KEY_DECLARATIONS: {
        ...p.KEY_DECLARATIONS,
        'settings:get': { kind: 'keys', params: [param] },
      },
    });
    expect(() => loadEntryWith('settings', add)).toThrow(fehler);
  });

  it('die Prüfung der geschützten Ordner lässt Kanäle der Art keys unverändert durch', () => {
    // channel-guard.js umhüllt nur Erklärungen der Art paths; ein Kanal der
    // Art keys erreicht seinen Handler wie vorher, nichts wird anders abgewiesen.
    const guard = createChannelGuard({ protectedFolders: { entries: [] }, areaRootOf: () => null });
    for (const channel of Object.keys(KEY_CHANNELS)) {
      const handler = () => 'handler';
      expect(guard.wrap(channel, handler), channel).toBe(handler);
    }
    // Gegenstück: ein Kanal der Art paths wird umhüllt.
    const save = () => 'handler';
    expect(guard.wrap('file:save', save)).not.toBe(save);
  });
});
