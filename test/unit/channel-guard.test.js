// 4T-002648 (Epic 3E-000416): Die Prüfung an der Anmelde-Stelle gegen die
// geschützten Ordner (AK2). Je Schreib-Kanal ein Ziel im Ordner des Programms,
// im Add-on-Ordner und im Daten-Ordner der portablen Fassung, das abgewiesen
// wird, ohne dass der Handler läuft, und eine Positiv-Kontrolle mit einem Ziel
// außerhalb, das den Handler mit unveränderten Argumenten erreicht.
//
// Bestands-Lesungen: keine Quelltext-Lesung. Die Liste der geschützten Ordner
// entsteht über denselben Weg wie beim Start (`resolveProgramList`,
// src/main/grants/binding-grants.js) an Wegwerf-Ordnern; der Handler ist ein
// Stellvertreter. Dass die Abweisung die Fehler-Form des jeweiligen Handlers
// nachbildet, prüft test/unit/channel-declarations.test.js am Quelltext.
import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChannelGuard, FEHLER_FORM_CHANNELS } = require('../../src/main/ipc/channel-guard.js');
const { declarationOf } = require('../../src/main/ipc/channel-declarations.js');
const { resolveProgramList } = require('../../src/main/grants/binding-grants.js');

const isWindows = process.platform === 'win32';

// Ein Wegwerf-Profil für alle Fälle: Programm-Ordner, Nutzerdaten mit Add-ons,
// Sprachdateien und Einstellungs-Datei, eine portable Fassung mit Daten-Ordner
// neben der Programmdatei und ein Ordner außerhalb.
const BASE = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-guard-')));
const PROGRAM = path.join(BASE, 'Programm');
const DATA = path.join(BASE, 'Daten');
const ADDONS = path.join(DATA, 'extensions');
const SETTINGS = path.join(DATA, 'config.json');
const PORTABLE = path.join(BASE, 'USB');
const PORTABLE_DATA = path.join(PORTABLE, 'Data');
const OUTSIDE = path.join(BASE, 'Draussen');
for (const dir of [PROGRAM, ADDONS, path.join(DATA, 'locales'), PORTABLE_DATA, OUTSIDE]) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(SETTINGS, '{}');
fs.writeFileSync(path.join(OUTSIDE, 'a.md'), 'x');

afterAll(() => {
  try {
    fs.rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
});

const START = {
  execPath: path.join(PROGRAM, 'EM4me.exe'),
  userDataFolder: DATA,
  portableMode: { portabel: false, datenOrdner: null },
};
const PORTABLE_START = {
  execPath: path.join(BASE, 'Entpackt', 'EM4me.exe'),
  userDataFolder: PORTABLE_DATA,
  portableMode: { portabel: true, datenOrdner: PORTABLE_DATA },
  portableProgramFile: path.join(PORTABLE, 'EM4me.exe'),
};

// Je Kanal: Argumente, deren Schreib-Ziel im Ordner `dir` liegt.
const WRITE_ARGS = {
  'file:save': (dir) => [path.join(dir, 'a.md'), 'x', {}],
  'note:write': (dir) => [path.join(dir, 'a.md'), 'x'],
  'blockData:write': (dir) => [path.join(dir, 'a.md'), 'anker', {}],
  'blockData:rename': (dir) => [path.join(dir, 'a.md'), 'alt', 'neu'],
  'file:rename': (dir) => [{ oldPath: path.join(dir, 'a.md'), newBasename: 'b' }],
  'subpage:create': (dir) => [{ basePath: path.join(dir, 'a.md'), segment: 'Teil' }],
  'pdf:print': (dir) => [path.join(dir, 'a.pdf')],
  'html:write': (dir) => [path.join(dir, 'a.html'), '<p></p>'],
  'task:applyLineEdit': (dir) => [{ filePath: path.join(dir, 'a.md'), line: 1 }],
  'events:applyFrontmatterEdit': (dir) => [{ filePath: path.join(dir, 'a.md'), updates: {} }],
  'presentationPdf:print': (dir) => [path.join(dir, 'a.pdf'), 'A4'],
  'presentationHtml:write': (dir) => [dir, 'Folien', [{ name: 'index.html', text: 'x' }]],
  'presentationPptx:export': (dir) => [{ zielPfad: path.join(dir, 'a.pptx'), folien: [] }],
  'presentationImages:export': (dir) => [{ zielOrdner: dir, unterordner: 'Bilder', folien: [] }],
  'demoArea:createAt': (dir) => [dir],
  'shelves:createAt': (dir) => [{ parentDir: dir, name: 'Regal' }],
  'books:createAt': (dir) => [{ parentDir: dir, name: 'Buch' }],
  'parts:rejoin': (dir) => [path.join(dir, 'a.md')],
  'templates:createFile': (dir) => [{ dirPath: dir, name: 'Neu.md', content: '' }],
  'attachment:store': (dir) => [
    { dokumentPfad: path.join(dir, 'a.md'), quellPfad: path.join(OUTSIDE, 'a.md'), name: 'b.png' },
  ],
  // Der Name kommt unter das Regal des Fensters; das Regal ist hier `dir`.
  'shelves:assignBook': () => ['Buch'],
  // 4T-002649: die beiden Ordner-Einstellungen, gebunden mit Umfang `bind`.
  'templates:setGlobalConfig': (dir) => [{ folder: dir, rules: [] }],
  'workflow:setFolder': (dir) => [{ folder: dir, target: 'global' }],
};
const CHANNELS = Object.keys(WRITE_ARGS);

// Ereignis eines Fensters; `areaRootOf` liest daraus die Bindung des Fensters.
function eventIn(dir) {
  return { sender: { id: 1 }, areaRoot: dir };
}

function setup(start = START, more = {}) {
  const warn = vi.fn();
  const guard = createChannelGuard({
    protectedFolders: resolveProgramList(start),
    areaRootOf: (event) => event.areaRoot,
    warn,
    ...more,
  });
  return { guard, warn };
}

async function call(guard, channel, dir) {
  const handler = vi.fn(async () => ({ ok: true }));
  const args = WRITE_ARGS[channel](dir);
  const result = await guard.wrap(channel, handler)(eventIn(dir), ...args);
  return { result, handler, args };
}

function rejection(channel, reason) {
  const grund = `guard:${reason}`;
  return FEHLER_FORM_CHANNELS.includes(channel)
    ? { ok: false, fehler: { folie: null, grund } }
    : { ok: false, error: grund };
}

describe('Schreib-Kanäle gegen die geschützten Ordner', () => {
  // 4T-002649: zu den 21 Kanälen aus 4T-002648 die beiden Ordner-Einstellungen.
  it('alle 23 erklärten Schreib-Kanäle haben hier ihre Fälle', () => {
    expect(CHANNELS).toHaveLength(23);
    for (const channel of CHANNELS) expect(declarationOf(channel).kind, channel).toBe('paths');
  });

  it.each(CHANNELS)('%s: Ziel im Ordner des Programms wird abgewiesen', async (channel) => {
    const { guard, warn } = setup();
    const { result, handler } = await call(guard, channel, PROGRAM);
    expect(result).toEqual(rejection(channel, 'protectedFolder'));
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(`Kanal ${channel} abgewiesen:`, 'protectedFolder');
  });

  it.each(CHANNELS)('%s: Ziel im Add-on-Ordner wird abgewiesen', async (channel) => {
    const { guard } = setup();
    const { result, handler } = await call(guard, channel, path.join(ADDONS, 'paket'));
    expect(result).toEqual(rejection(channel, 'protectedFolder'));
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(CHANNELS)(
    '%s: Ziel im Daten-Ordner der portablen Fassung wird abgewiesen',
    async (channel) => {
      const { guard } = setup(PORTABLE_START);
      const { result, handler } = await call(guard, channel, PORTABLE_DATA);
      expect(result).toEqual(rejection(channel, 'protectedFolder'));
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each(CHANNELS)(
    '%s: Ziel außerhalb erreicht den Handler mit unveränderten Argumenten',
    async (channel) => {
      const { guard, warn } = setup();
      const { result, handler, args } = await call(guard, channel, OUTSIDE);
      expect(result).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0].slice(1)).toEqual(args);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('die Einstellungs-Datei selbst wird nicht überschrieben, gelesen werden darf sie als Quelle', async () => {
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const save = guard.wrap('file:save', handler);
    expect(await save(eventIn(OUTSIDE), SETTINGS, '{}', {})).toEqual(
      rejection('file:save', 'protectedFolder'),
    );
    const store = guard.wrap('attachment:store', handler);
    const args = {
      dokumentPfad: path.join(OUTSIDE, 'a.md'),
      quellPfad: SETTINGS,
      name: 'kopie.json',
    };
    expect(await store(eventIn(OUTSIDE), args)).toEqual({ ok: true });
  });

  it('die portable Programmdatei selbst wird nicht überschrieben, ihr Ordner bleibt frei', async () => {
    const { guard } = setup(PORTABLE_START);
    const handler = vi.fn(async () => ({ ok: true }));
    const save = guard.wrap('file:save', handler);
    expect((await save(eventIn(PORTABLE), path.join(PORTABLE, 'EM4me.exe'), 'x', {})).error).toBe(
      'guard:protectedFolder',
    );
    expect(await save(eventIn(PORTABLE), path.join(PORTABLE, 'Notiz.md'), 'x', {})).toEqual({
      ok: true,
    });
  });
});

describe('Lösen der Angaben', () => {
  it('ein fehlendes oder falsch getyptes Argument wird abgewiesen, der Handler läuft nicht', async () => {
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const save = guard.wrap('file:save', handler);
    expect(await save(eventIn(OUTSIDE))).toEqual(rejection('file:save', 'invalidArgument'));
    expect(await save(eventIn(OUTSIDE), 42, 'x')).toEqual(
      rejection('file:save', 'invalidArgument'),
    );
    const rename = guard.wrap('file:rename', handler);
    expect(await rename(eventIn(OUTSIDE), { oldPath: path.join(OUTSIDE, 'a.md') })).toEqual(
      rejection('file:rename', 'invalidArgument'),
    );
    expect(await rename(eventIn(OUTSIDE), null)).toEqual(
      rejection('file:rename', 'invalidArgument'),
    );
    const pptx = guard.wrap('presentationPptx:export', handler);
    expect(await pptx(eventIn(OUTSIDE), {})).toEqual(
      rejection('presentationPptx:export', 'invalidArgument'),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('eine freiwillige Angabe darf fehlen; ihre Basis wird trotzdem geprüft', async () => {
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const images = guard.wrap('presentationImages:export', handler);
    expect(await images(eventIn(OUTSIDE), { zielOrdner: OUTSIDE, unterordner: null })).toEqual({
      ok: true,
    });
    expect(await images(eventIn(OUTSIDE), { zielOrdner: PROGRAM })).toEqual(
      rejection('presentationImages:export', 'protectedFolder'),
    );
    const html = guard.wrap('presentationHtml:write', handler);
    const pages = [{ name: 'index.html', text: 'x' }];
    expect(await html(eventIn(OUTSIDE), OUTSIDE, '', pages)).toEqual({ ok: true });
    expect(await html(eventIn(OUTSIDE), DATA, undefined, pages)).toEqual(
      rejection('presentationHtml:write', 'protectedFolder'),
    );
    const store = guard.wrap('attachment:store', handler);
    const daten = new Uint8Array([1]);
    expect(
      await store(eventIn(OUTSIDE), { dokumentPfad: path.join(OUTSIDE, 'a.md'), daten }),
    ).toEqual({
      ok: true,
    });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  // Review-Befund S1 vom 2026-11-22: Ohne Namen erzeugt der Handler den Namen
  // selbst und legt neben dem Dokument an; ein Dokument in einem geschützten
  // Ordner darf so keine Anlage dorthin bringen.
  it('attachment:store ohne Namen: ein Dokument im geschützten Ordner wird abgewiesen', async () => {
    const daten = new Uint8Array([1]);
    const handler = vi.fn(async () => ({ ok: true }));
    const store = setup().guard.wrap('attachment:store', handler);
    for (const dokumentPfad of [
      path.join(ADDONS, 'paket', 'a.md'),
      path.join(PROGRAM, 'a.md'),
      path.join(DATA, 'a.md'),
    ]) {
      expect(await store(eventIn(OUTSIDE), { dokumentPfad, daten })).toEqual(
        rejection('attachment:store', 'protectedFolder'),
      );
      expect(await store(eventIn(OUTSIDE), { dokumentPfad, daten, name: '' })).toEqual(
        rejection('attachment:store', 'protectedFolder'),
      );
    }
    const portableStore = setup(PORTABLE_START).guard.wrap('attachment:store', handler);
    expect(
      await portableStore(eventIn(OUTSIDE), {
        dokumentPfad: path.join(PORTABLE_DATA, 'a.md'),
        quellPfad: path.join(OUTSIDE, 'a.md'),
      }),
    ).toEqual(rejection('attachment:store', 'protectedFolder'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('ein Name unter seiner Basis: der neue Name aus file:rename', async () => {
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const rename = guard.wrap('file:rename', handler);
    const oldPath = path.join(BASE, 'a.md');
    // Der Ordner der Datei ist frei; erst der neue Name führt hinein.
    const hinein = `Daten${path.sep}config.json`;
    expect(await rename(eventIn(OUTSIDE), { oldPath, newBasename: hinein })).toEqual(
      rejection('file:rename', 'protectedFolder'),
    );
    expect(await rename(eventIn(OUTSIDE), { oldPath, newBasename: 'b' })).toEqual({ ok: true });
  });

  it('Namen unter ihrer Basis: Unterordner und Dateinamen aus presentationHtml:write', async () => {
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const html = guard.wrap('presentationHtml:write', handler);
    const up = `..${path.sep}Daten`;
    expect(await html(eventIn(OUTSIDE), OUTSIDE, up, [{ name: 'index.html', text: 'x' }])).toEqual(
      rejection('presentationHtml:write', 'protectedFolder'),
    );
    const intoAddons = `..${path.sep}..${path.sep}Daten${path.sep}extensions${path.sep}x.js`;
    expect(
      await html(eventIn(OUTSIDE), OUTSIDE, 'Folien', [{ name: intoAddons, text: 'x' }]),
    ).toEqual(rejection('presentationHtml:write', 'protectedFolder'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('ein Name, der aus seiner geschützten Basis hinausführt, wird trotzdem abgewiesen', async () => {
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const create = guard.wrap('shelves:createAt', handler);
    const hinaus = `..${path.sep}Draussen${path.sep}Regal`;
    expect(await create(eventIn(OUTSIDE), { parentDir: PROGRAM, name: hinaus })).toEqual(
      rejection('shelves:createAt', 'protectedFolder'),
    );
    expect(handler).not.toHaveBeenCalled();
    // Unter einer Bindung ist die Basis keine eigene Angabe; geprüft wird sie dennoch.
    const assign = guard.wrap('shelves:assignBook', handler);
    expect(await assign(eventIn(DATA), `..${path.sep}Draussen`)).toEqual(
      rejection('shelves:assignBook', 'protectedFolder'),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('ein Name unter der Bindung: ohne gebundenes Regal wird abgewiesen', async () => {
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const assign = guard.wrap('shelves:assignBook', handler);
    expect(await assign({ sender: { id: 1 }, areaRoot: null }, 'Buch')).toEqual(
      rejection('shelves:assignBook', 'invalidArgument'),
    );
    expect(await assign(eventIn(DATA), 'Buch')).toEqual(
      rejection('shelves:assignBook', 'protectedFolder'),
    );
    expect(await assign(eventIn(OUTSIDE), 'Buch')).toEqual({ ok: true });
  });

  it('eine Verknüpfung in einen geschützten Ordner wird erkannt', async (ctx) => {
    const link = path.join(OUTSIDE, `Abkuerzung-${Date.now()}`);
    try {
      fs.symlinkSync(DATA, link, 'junction');
    } catch (err) {
      ctx.skip(`Verzeichnis-Knoten nicht anlegbar (${err.code})`);
    }
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const save = guard.wrap('file:save', handler);
    expect(await save(eventIn(OUTSIDE), path.join(link, 'config.json'), '{}', {})).toEqual(
      rejection('file:save', 'protectedFolder'),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('Groß- und Kleinschreibung: unter Windows derselbe Ordner, unter Linux ein anderer', async () => {
    const { guard } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const save = guard.wrap('file:save', handler);
    const result = await save(
      eventIn(OUTSIDE),
      path.join(DATA.toUpperCase(), 'CONFIG.JSON'),
      '{}',
      {},
    );
    expect(result).toEqual(isWindows ? rejection('file:save', 'protectedFolder') : { ok: true });
  });
});

describe('Die Liste der geschützten Ordner', () => {
  it('ist sie beim ersten Aufruf noch nicht fertig, wartet die Prüfung auf sie', async () => {
    let ready;
    const later = new Promise((resolve) => {
      ready = resolve;
    });
    const { guard } = setup(START, { protectedFolders: later });
    const handler = vi.fn(async () => ({ ok: true }));
    const pending = guard.wrap('file:save', handler)(
      eventIn(PROGRAM),
      path.join(PROGRAM, 'a.md'),
      'x',
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handler).not.toHaveBeenCalled();
    ready(await resolveProgramList(START));
    expect(await pending).toEqual(rejection('file:save', 'protectedFolder'));
  });

  it('ließ sie sich nicht auflösen, weisen die Schreib-Kanäle ab', async () => {
    const failing = Promise.reject(new Error('keine Liste'));
    const { guard, warn } = setup(START, { protectedFolders: failing });
    const handler = vi.fn(async () => ({ ok: true }));
    for (const channel of ['file:save', 'presentationPptx:export']) {
      const args = WRITE_ARGS[channel](OUTSIDE);
      expect(await guard.wrap(channel, handler)(eventIn(OUTSIDE), ...args)).toEqual(
        rejection(channel, 'protectedListUnavailable'),
      );
    }
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Kanal file:save abgewiesen:', 'protectedListUnavailable');
  });

  it('eine nicht aufgelöste Liste zählt wie eine fehlgeschlagene', async () => {
    const { guard } = setup(START, { protectedFolders: [] });
    const handler = vi.fn(async () => ({ ok: true }));
    expect(
      await guard.wrap('file:save', handler)(eventIn(OUTSIDE), path.join(OUTSIDE, 'a.md'), 'x'),
    ).toEqual(rejection('file:save', 'protectedListUnavailable'));
  });
});

describe('Alle übrigen Kanäle', () => {
  it('bekommen ihren Handler ungeprüft zurück', () => {
    const { guard } = setup();
    const handler = async () => ({ ok: true });
    for (const channel of ['theme:current', 'file:read', 'settings:set', 'gibtsnicht:kanal']) {
      expect(guard.wrap(channel, handler), channel).toBe(handler);
    }
  });

  it('ohne Liste oder ohne Bindungs-Auskunft bricht der Aufbau laut', () => {
    expect(() => createChannelGuard({ areaRootOf: () => null })).toThrow(TypeError);
    expect(() => createChannelGuard({ protectedFolders: [] })).toThrow(TypeError);
  });
});

// Review-Befund S1 vom 2026-11-22: Den Ablage-Ordner einer Anlage errechnet erst
// der Handler aus der Anlagen-Einstellung; er kann neben dem Ordner des
// Dokuments oder in der Bereichs-Wurzel liegen. Der Handler prüft ihn mit
// `checkTarget` derselben Instanz, bevor er etwas anlegt.
describe('Errechnete Ziele: der Ablage-Ordner einer Anlage', () => {
  const { registerAttachmentsIpc } = require('../../src/main/ipc/attachments.js');

  function storeHandler(guard, konfig, area = null) {
    const handlers = new Map();
    registerAttachmentsIpc((channel, fn) => handlers.set(channel, fn), {
      dialog: {},
      shell: {},
      senderWindow: () => ({}),
      areaOfWindow: () => area,
      tForWindow: () => '',
      getStore: () => null,
      mddStore: {},
      readAreaAttachmentsConfig: async () => undefined,
      resolveAttachmentsConfig: async () => konfig,
      bereinigterQuellName: () => null,
      checkTarget: guard.checkTarget,
    });
    return handlers.get('attachment:store');
  }

  const daten = new Uint8Array([1]);
  const dokumentPfad = path.join(BASE, 'neben-den-daten.md');

  it('ein Ordnername, der neben dem Dokument in einen geschützten Ordner führt, wird abgewiesen', async () => {
    const { guard, warn } = setup();
    const store = storeHandler(guard, { form: 'fest', ordnername: 'Daten' });
    expect(await store({}, { dokumentPfad, daten })).toEqual(
      rejection('attachment:store', 'protectedFolder'),
    );
    expect(warn).toHaveBeenCalledWith('Kanal attachment:store abgewiesen:', 'protectedFolder');
    expect(fs.readdirSync(DATA).sort()).toEqual(['config.json', 'extensions', 'locales']);
  });

  it('der Ordner in der Bereichs-Wurzel wird ebenso geprüft', async () => {
    const { guard } = setup();
    const area = { rootPath: BASE };
    const store = storeHandler(guard, { form: 'bereich', ordnername: 'Programm' }, area);
    expect(await store({}, { dokumentPfad, daten })).toEqual(
      rejection('attachment:store', 'protectedFolder'),
    );
    expect(fs.readdirSync(PROGRAM)).toEqual([]);
  });

  it('ein freier Ablage-Ordner nimmt die Anlage an', async () => {
    const { guard, warn } = setup();
    const store = storeHandler(guard, { form: 'fest', ordnername: 'Anlagen' });
    const result = await store({}, { dokumentPfad, daten });
    expect(result.ok).toBe(true);
    expect(fs.readdirSync(path.join(BASE, 'Anlagen'))).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('checkTarget weist ein unbrauchbares Ziel ab', async () => {
    const { guard } = setup();
    expect(await guard.checkTarget('attachment:store', '', 'create')).toEqual(
      rejection('attachment:store', 'invalidArgument'),
    );
    expect(await guard.checkTarget('attachment:store', OUTSIDE, 'unbekannt')).toEqual(
      rejection('attachment:store', 'invalidArgument'),
    );
    expect(await guard.checkTarget('attachment:store', OUTSIDE, 'create')).toBeNull();
  });
});
