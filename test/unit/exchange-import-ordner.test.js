// Review-Befund S2 vom 2026-11-22 (Epic 3E-000416, Aufgabe 4T-002649): Prüffälle
// der Ordner-Prüfung beim Einlesen der Einrichtung. Eigene Datei neben
// test/unit/exchange-import.test.js, weil jene an ihrem Zeilen-Budget steht.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeExchangeFile } from '../../src/shared/exchange-file.js';
import { EXCHANGE_KIND } from '../../src/shared/exchange-data-kinds.js';

// Ein nachgestellter Speicher in der Form, die electron-store liefert.
function storeDouble(inhalt) {
  return {
    get(pfad) {
      return pfad.split('.').reduce((k, teil) => (k == null ? undefined : k[teil]), inhalt);
    },
  };
}

// Das Einlesen schrieb den Workflow- und den Vorlagen-Ordner an der Prüfung
// gegen die geschützten Ordner vorbei, die ihre eigenen Kanäle seit 4T-002649 haben. Die Prüfung
// selbst ist in test/unit/channel-guard.test.js gedeckt; hier zählt, dass das
// Einlesen sie für beide Ordner ruft, in Vorschau und Übernahme gleich, und
// ohne sie nichts schreibt.
describe('Review-Befund S2 — Ordner beim Einlesen gegen die geschützten Ordner', () => {
  let dirs = [];
  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs = [];
  });

  function dateiMit(sections) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-import-s2-'));
    dirs.push(dir);
    const datei = path.join(dir, 'einrichtung.md');
    fs.writeFileSync(datei, writeExchangeFile({ kind: EXCHANGE_KIND, sections }).text, 'utf8');
    return datei;
  }

  async function kanaele(checkTarget, inhalt = { language: 'de' }) {
    const { registerExchangeIpc } = await import('../../src/main/ipc/exchange.js');
    const geschrieben = [];
    const store = {
      ...storeDouble(inhalt),
      set: (pfad, wert) => geschrieben.push([pfad, wert]),
    };
    const handler = {};
    const deps = {
      dialog: {},
      getStore: () => store,
      senderWindow: () => ({ id: 1 }),
      areaOfWindow: () => null,
      readAreaCalendarConfig: async () => undefined,
      writeAreaCalendarConfig: async () => ({ ok: true }),
      broadcast: () => {},
      tForWindow: (_win, key) => key,
      fullVersion: () => '0.0.0',
      app: { getName: () => 'EM4me' },
    };
    if (checkTarget !== undefined) deps.checkTarget = checkTarget;
    registerExchangeIpc((kanal, fn) => (handler[kanal] = fn), deps);
    return { handler, geschrieben };
  }

  const GESCHUETZT = path.resolve(os.tmpdir(), 'em4me-geschuetzt');
  const abweisend = vi.fn(async (_kanal, ordner) =>
    path.resolve(ordner) === GESCHUETZT ? { ok: false, error: 'guard:protectedFolder' } : null,
  );
  const SECTIONS = [
    { name: 'templates', value: { templates: { folder: GESCHUETZT, rules: [] } } },
    { name: 'workflows', value: { 'workflows.folder': GESCHUETZT } },
    { name: 'settings', value: { language: 'en' } },
  ];

  it('die Vorschau überspringt beide Datenarten und nennt den Grund', async () => {
    abweisend.mockClear();
    const { handler } = await kanaele(abweisend);
    const vorschau = await handler['exchange:plan']({}, dateiMit(SECTIONS));
    expect(vorschau.ok).toBe(true);
    for (const id of ['templates', 'workflows']) {
      const zeile = vorschau.kinds.find((k) => k.id === id);
      expect(zeile.action).toBe('skip');
      expect(zeile.grund).toBe('protected-folder');
    }
    expect(vorschau.kinds.find((k) => k.id === 'settings').action).not.toBe('skip');
    expect(abweisend).toHaveBeenCalledWith('exchange:plan', GESCHUETZT, 'bind');
  });

  it('die Übernahme schreibt die abgewiesenen Ordner nicht, den Rest schon', async () => {
    const { handler, geschrieben } = await kanaele(abweisend);
    await handler['exchange:plan']({}, dateiMit(SECTIONS));
    const bericht = await handler['exchange:apply']({});
    expect(bericht.ok).toBe(true);
    const pfade = geschrieben.map(([pfad]) => pfad);
    expect(pfade).not.toContain('templates');
    expect(pfade).not.toContain('workflows.folder');
    expect(pfade).toContain('language');
    expect(abweisend).toHaveBeenCalledWith('exchange:apply', GESCHUETZT, 'bind');
  });

  it('ein erlaubter Ordner wird übernommen, ein leerer nicht geprüft', async () => {
    const erlaubt = path.resolve(os.tmpdir(), 'em4me-erlaubt');
    const pruefung = vi.fn(async () => null);
    const { handler, geschrieben } = await kanaele(pruefung);
    await handler['exchange:plan'](
      {},
      dateiMit([
        { name: 'templates', value: { templates: { folder: '', rules: [] } } },
        { name: 'workflows', value: { 'workflows.folder': erlaubt } },
      ]),
    );
    await handler['exchange:apply']({});
    expect(geschrieben).toContainEqual(['workflows.folder', erlaubt]);
    expect(geschrieben.map(([pfad]) => pfad)).toContain('templates');
    // Vorschau und Übernahme je einmal, nur für den gesetzten Ordner.
    expect(pruefung).toHaveBeenCalledTimes(2);
  });

  it('ohne Prüf-Funktion wird kein Ordner übernommen (fail closed)', async () => {
    const { handler, geschrieben } = await kanaele(undefined);
    const vorschau = await handler['exchange:plan']({}, dateiMit(SECTIONS));
    expect(vorschau.kinds.find((k) => k.id === 'workflows').grund).toBe('protected-folder');
    await handler['exchange:apply']({});
    expect(geschrieben.map(([pfad]) => pfad)).not.toContain('workflows.folder');
  });

  it('ein relativer Ordner wird wie in den eigenen Kanälen abgewiesen', async () => {
    const pruefung = vi.fn(async () => null);
    const { handler, geschrieben } = await kanaele(pruefung);
    const vorschau = await handler['exchange:plan'](
      {},
      dateiMit([{ name: 'workflows', value: { 'workflows.folder': 'Workflows' } }]),
    );
    const zeile = vorschau.kinds.find((k) => k.id === 'workflows');
    expect(zeile.action).toBe('skip');
    expect(zeile.grund).toBe('invalid-folder');
    await handler['exchange:apply']({});
    expect(geschrieben.map(([pfad]) => pfad)).not.toContain('workflows.folder');
    expect(pruefung).not.toHaveBeenCalled();
  });
});

// Befund der Runde 2 vom 2026-11-22 (Zweitblick und Sicherheits-Review): Über
// den Pfad `scripts` der Einstellungen schaltete eine Einrichtungs-Datei
// `scripts.run` (Klasse 2) ohne den Dialog von `settings:setScriptsRun` ein.
// Jetzt bleibt der vorhandene Wert, und Vorschau und Bericht nennen den Schlüssel.
describe('Runde 2 — Erlaubnisse reisen beim Einlesen nicht mit', () => {
  let dirs = [];
  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs = [];
  });

  async function einlesen(inhalt, scripts) {
    const { registerExchangeIpc } = await import('../../src/main/ipc/exchange.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-import-r2-'));
    dirs.push(dir);
    const datei = path.join(dir, 'einrichtung.md');
    // Allein `scripts`: Die Verteilung an die Fenster braucht Electron und
    // wirft hier nach dem Schreiben; ein zweiter Pfad danach käme nicht mehr an.
    const sections = [{ name: 'settings', value: { scripts } }];
    fs.writeFileSync(datei, writeExchangeFile({ kind: EXCHANGE_KIND, sections }).text, 'utf8');
    const geschrieben = [];
    const store = { ...storeDouble(inhalt), set: (p, w) => geschrieben.push([p, w]) };
    const handler = {};
    registerExchangeIpc((kanal, fn) => (handler[kanal] = fn), {
      dialog: {},
      getStore: () => store,
      senderWindow: () => ({ id: 1 }),
      areaOfWindow: () => null,
      readAreaCalendarConfig: async () => undefined,
      writeAreaCalendarConfig: async () => ({ ok: true }),
      broadcast: () => {},
      tForWindow: (_win, key) => key,
      fullVersion: () => '0.0.0',
      app: { getName: () => 'EM4me' },
      checkTarget: async () => null,
    });
    const vorschau = await handler['exchange:plan']({}, datei);
    const bericht = await handler['exchange:apply']({});
    const scriptsGeschrieben = geschrieben.find(([p]) => p === 'scripts');
    return { vorschau, bericht, scriptsGeschrieben: scriptsGeschrieben && scriptsGeschrieben[1] };
  }

  it('ein eingelesenes scripts.run = true lässt den ausgeschalteten Wert stehen', async () => {
    const { vorschau, bericht, scriptsGeschrieben } = await einlesen(
      { language: 'de', scripts: { run: false } },
      { run: true },
    );
    const zeile = vorschau.kinds.find((k) => k.id === 'settings');
    expect(zeile.behalten).toEqual(['scripts.run']);
    expect(bericht.kinds.find((k) => k.id === 'settings').behalten).toEqual(['scripts.run']);
    expect(scriptsGeschrieben).toEqual({ run: false });
  });

  it('ohne vorhandenen Wert fällt der eingelesene weg, der Rest des Objekts bleibt', async () => {
    const { scriptsGeschrieben } = await einlesen({ language: 'de' }, { run: true, anderes: 1 });
    expect(scriptsGeschrieben).toEqual({ anderes: 1 });
  });

  // Hinweis der Runde 3: Ein Wert, der kein Objekt ist, löschte scripts.run still.
  it('ein Nicht-Objekt unter scripts fällt weg und wird genannt', async () => {
    const { vorschau, scriptsGeschrieben } = await einlesen(
      { language: 'de', scripts: { run: true } },
      true,
    );
    expect(vorschau.kinds.find((k) => k.id === 'settings').behalten).toEqual(['scripts.run']);
    expect(scriptsGeschrieben).toBeUndefined();
  });

  it('ein gleicher Wert wird nicht als behalten genannt', async () => {
    const { vorschau } = await einlesen({ language: 'de', scripts: { run: true } }, { run: true });
    expect(vorschau.kinds.find((k) => k.id === 'settings').behalten).toEqual([]);
  });
});

// Wächter: Welche Schlüssel der Klassen 2 und 3 das Einlesen erreicht, steht
// hier fest. Erreicht eine neue Datenart oder ein neuer Pfad einen weiteren,
// wird der Fall rot, und die Behandlung wird bewusst entschieden (Kopf von
// src/main/ipc/exchange.js) statt still auf «bleibt» zu fallen.
describe('Wächter — geschützte Schlüssel im Bereich des Einlesens', () => {
  // Hinweis der Runde 3 beider Prüfer: Die Stelle des Ordners folgt aus dem
  // Schlüssel, nicht aus einer Tabelle je Pfad. Ein künftiger Pfad wie der
  // Namensraum `workflows` erreicht den Ordner deshalb ebenso.
  it('findet den Ordner für jeden Pfad, der einen Ordner-Schlüssel erreicht', async () => {
    const { ordnerIm } = await import('../../src/main/ipc/exchange.js');
    expect(ordnerIm('workflows', { folder: 'X' })).toEqual({ ordner: ['X'], ungueltig: false });
    expect(ordnerIm('workflows.folder', 'Y')).toEqual({ ordner: ['Y'], ungueltig: false });
    expect(ordnerIm('templates', { folder: 'Z', rules: [] })).toEqual({
      ordner: ['Z'],
      ungueltig: false,
    });
    expect(ordnerIm('workflows.folder.teil', 'W').ungueltig).toBe(true);
    expect(ordnerIm('language', 'de')).toEqual({ ordner: [], ungueltig: false });
  });

  it('kennt genau die heute erreichten Schlüssel und ihre Behandlung', async () => {
    const { BEIM_EINLESEN, bleibendeUnter } = await import('../../src/main/ipc/exchange.js');
    const { DATA_KINDS } = await import('../../src/shared/exchange-data-kinds.js');
    const bleibend = new Set();
    for (const kind of DATA_KINDS) {
      for (const pfad of kind.paths || []) for (const k of bleibendeUnter(pfad)) bleibend.add(k);
    }
    expect([...bleibend].sort()).toEqual(['scripts.run']);
    expect(Object.keys(BEIM_EINLESEN).sort()).toEqual([
      'extensionsExternal.enabled',
      'templates.folder',
      'templates.rules',
      'workflows.folder',
    ]);
  });
});
