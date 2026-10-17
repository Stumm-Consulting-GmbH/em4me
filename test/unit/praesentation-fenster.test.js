// 4T-002278 (Epic 3E-000348): Der Fenster-Erzeuger des Publikums-Fensters
// (src/main/praesentation-fenster.js), seine Kanal-Gruppe
// (src/main/ipc/presentation-window.js) und die Oberfläche beider Preloads.
//
// Gemessen am echten Erzeuger mit einer Electron-Attrappe (Muster
// praesentation-vollbild-kanal.test.js): BrowserWindow ist eine Klasse, die
// Optionen, Ereignis-Zuhörer und Aufrufe festhält; das Bildschirm-Modul liefert
// einen oder zwei Bildschirme. Main-Verdrahtung und Preloads sind im
// Unit-Kontext nicht ladbar (Electron) und werden gegen den QUELLTEXT geprüft.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createPraesentationFenster,
  waehleBildschirm,
  publikumOptionen,
  pruefeFolie,
  pruefeEingabe,
  FOLIE_MAX_ZEICHEN,
} = require('../../src/main/praesentation-fenster.js');
const { registerPresentationWindowIpc } = require('../../src/main/ipc/presentation-window.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quelle = (...teile) => fs.readFileSync(path.join(WURZEL, ...teile), 'utf8');
const ERZEUGER_QUELLE = quelle('src', 'main', 'praesentation-fenster.js');
const MAIN_QUELLE = quelle('src', 'main', 'main.js');
const PRELOAD_QUELLE = quelle('src', 'main', 'preload.js');
const PUBLIKUM_PRELOAD = quelle('src', 'main', 'preload-publikum.js');

let naechsteId = 100;

// Ein Ereignis-Träger nach Art von EventEmitter, knapp.
function traeger(ziel) {
  ziel.zuhoerer = new Map();
  ziel.on = vi.fn((name, fn) => {
    if (!ziel.zuhoerer.has(name)) ziel.zuhoerer.set(name, []);
    ziel.zuhoerer.get(name).push(fn);
    return ziel;
  });
  ziel.once = ziel.on;
  ziel.removeListener = vi.fn((name, fn) => {
    const liste = ziel.zuhoerer.get(name) || [];
    ziel.zuhoerer.set(
      name,
      liste.filter((f) => f !== fn),
    );
  });
  ziel.feuere = (name, ...args) => {
    for (const fn of [...(ziel.zuhoerer.get(name) || [])]) fn(...args);
  };
  return ziel;
}

function webContents() {
  const wc = traeger({ id: naechsteId++, send: vi.fn() });
  wc.setWindowOpenHandler = vi.fn((fn) => {
    wc.oeffnenHandler = fn;
  });
  return wc;
}

// Das Hauptfenster: lebt, bis `zerstoere` gerufen wird.
function hauptfenster(bounds = { x: 0, y: 0, width: 1200, height: 800 }) {
  const w = traeger({ tot: false, webContents: webContents() });
  w.isDestroyed = () => w.tot;
  w.getBounds = () => bounds;
  w.zerstoere = () => {
    w.tot = true;
    w.feuere('closed');
  };
  return w;
}

function attrappe() {
  const erzeugt = [];
  class BrowserWindow {
    constructor(optionen) {
      traeger(this);
      this.optionen = optionen;
      this.tot = false;
      this.webContents = webContents();
      this.removeMenu = vi.fn();
      this.setBounds = vi.fn();
      this.setTitle = vi.fn();
      this.show = vi.fn();
      this.showInactive = vi.fn();
      this.focus = vi.fn();
      this.setFullScreen = vi.fn();
      this.loadFile = vi.fn();
      this.close = vi.fn(() => {
        this.tot = true;
        this.feuere('closed');
      });
      erzeugt.push(this);
    }
    isDestroyed() {
      return this.tot;
    }
  }
  return { BrowserWindow, erzeugt };
}

const EIN_BILDSCHIRM = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }];
const ZWEI_BILDSCHIRME = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 } },
];

function bildschirm(liste, hauptId = 1) {
  return {
    getAllDisplays: () => liste,
    getDisplayMatching: () => liste.find((b) => b.id === hauptId),
  };
}

function aufbau(liste = EIN_BILDSCHIRM, extra = {}) {
  const { BrowserWindow, erzeugt } = attrappe();
  const fenster = createPraesentationFenster({
    BrowserWindow,
    screen: bildschirm(liste),
    preloadPfad: '/x/preload-publikum.js',
    seitenPfad: '/x/publikum.html',
    titel: () => 'Vorführung',
    ...extra,
  });
  return { fenster, erzeugt };
}

const FOLIE = { html: '<!doctype html><p>A</p>', index: 1, gesamt: 3, breite: 1280, hoehe: 720 };

describe('Bildschirm-Wahl (AK2)', () => {
  it('mit einem Bildschirm kein eigener Bildschirm, also gewöhnliches Fenster', () => {
    expect(waehleBildschirm(EIN_BILDSCHIRM, EIN_BILDSCHIRM[0])).toBe(null);
    expect(waehleBildschirm([], null)).toBe(null);
  });

  it('mit zwei Bildschirmen der, auf dem das Hauptfenster nicht liegt', () => {
    expect(waehleBildschirm(ZWEI_BILDSCHIRME, ZWEI_BILDSCHIRME[0]).id).toBe(2);
    expect(waehleBildschirm(ZWEI_BILDSCHIRME, ZWEI_BILDSCHIRME[1]).id).toBe(1);
  });

  it('zwei Bildschirme: Vollbild auf dem anderen, gesetzt für das Publikums-Fenster', () => {
    const { fenster, erzeugt } = aufbau(ZWEI_BILDSCHIRME);
    const owner = hauptfenster();
    expect(fenster.oeffne(owner)).toEqual({ ok: true, vollbild: true, schonOffen: false });
    const [pub] = erzeugt;
    expect(pub.setBounds).toHaveBeenCalledWith(ZWEI_BILDSCHIRME[1].bounds);
    pub.feuere('ready-to-show');
    expect(pub.show).toHaveBeenCalled();
    expect(pub.setFullScreen).toHaveBeenCalledWith(true);
  });

  it('ein Bildschirm: gewöhnliches Fenster ohne Vollbild', () => {
    const { fenster, erzeugt } = aufbau(EIN_BILDSCHIRM);
    expect(fenster.oeffne(hauptfenster()).vollbild).toBe(false);
    const [pub] = erzeugt;
    pub.feuere('ready-to-show');
    expect(pub.setBounds).not.toHaveBeenCalled();
    expect(pub.setFullScreen).not.toHaveBeenCalled();
    expect(pub.show).toHaveBeenCalled();
  });

  it('im Testlauf ohne Fokus gezeigt', () => {
    const { fenster, erzeugt } = aufbau(EIN_BILDSCHIRM, { imTestlauf: true });
    fenster.oeffne(hauptfenster());
    erzeugt[0].feuere('ready-to-show');
    expect(erzeugt[0].showInactive).toHaveBeenCalled();
    expect(erzeugt[0].show).not.toHaveBeenCalled();
  });
});

describe('Fenster-Optionen und Navigations-Sperre (AK4)', () => {
  it('sandbox, contextIsolation, kein Node, eigenes Preload', () => {
    const o = publikumOptionen({ preloadPfad: '/p.js' });
    expect(o.webPreferences).toMatchObject({
      preload: '/p.js',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    expect(o.show).toBe(false);
  });

  it('das erzeugte Fenster trägt diese Optionen, kein Menü und die eigene Seite', () => {
    const { fenster, erzeugt } = aufbau();
    fenster.oeffne(hauptfenster());
    const [pub] = erzeugt;
    expect(pub.optionen.webPreferences.sandbox).toBe(true);
    expect(pub.optionen.webPreferences.preload).toBe('/x/preload-publikum.js');
    expect(pub.removeMenu).toHaveBeenCalled();
    expect(pub.loadFile).toHaveBeenCalledWith('/x/publikum.html');
    expect(pub.setTitle).toHaveBeenCalledWith('Vorführung');
  });

  it('window.open abgewiesen, Navigation an Ort und Stelle abgewiesen', () => {
    const { fenster, erzeugt } = aufbau();
    fenster.oeffne(hauptfenster());
    const wc = erzeugt[0].webContents;
    expect(wc.oeffnenHandler({ url: 'https://example.org' })).toEqual({ action: 'deny' });
    const ereignis = { preventDefault: vi.fn() };
    wc.feuere('will-navigate', ereignis, 'https://example.org');
    expect(ereignis.preventDefault).toHaveBeenCalled();
  });

  it('die Vorgabe-Pfade zeigen auf das schmale Preload und die eigene Seite', () => {
    expect(ERZEUGER_QUELLE).toMatch(/path\.join\(__dirname, 'preload-publikum\.js'\)/);
    expect(ERZEUGER_QUELLE).toMatch(
      /path\.join\(__dirname, '\.\.', 'renderer', 'publikum\.html'\)/,
    );
  });
});

describe('Lebenszyklus (AK3, AK5)', () => {
  it('höchstens ein Publikums-Fenster je Hauptfenster', () => {
    const { fenster, erzeugt } = aufbau();
    const owner = hauptfenster();
    fenster.oeffne(owner);
    expect(fenster.oeffne(owner).schonOffen).toBe(true);
    expect(erzeugt).toHaveLength(1);
    expect(erzeugt[0].focus).toHaveBeenCalled();
    // Ein zweites Hauptfenster bekommt sein eigenes.
    fenster.oeffne(hauptfenster());
    expect(erzeugt).toHaveLength(2);
  });

  it('keine Schließ-Rückfrage: kein Zuhörer am close-Ereignis', () => {
    const { fenster, erzeugt } = aufbau();
    fenster.oeffne(hauptfenster());
    expect(erzeugt[0].zuhoerer.has('close')).toBe(false);
  });

  it('nicht in Fenster-Liste, Persistenz und Zählung: kein Bezug zur Fenster-Verwaltung', () => {
    // Die drei Bestände führt allein window-manager.js über createWindow; der
    // Erzeuger kennt weder sie noch die Persistenz.
    expect(ERZEUGER_QUELLE).not.toMatch(/require\([^)]*window-manager/);
    expect(ERZEUGER_QUELLE).not.toMatch(/require\([^)]*window-persistence/);
    expect(ERZEUGER_QUELLE).not.toMatch(/\bwindows\.set\(|appRegistry|persistAllWindows/);
  });

  it('Schließen des Hauptfensters schließt das Publikums-Fenster mit', () => {
    const { fenster, erzeugt } = aufbau();
    const owner = hauptfenster();
    fenster.oeffne(owner);
    owner.zerstoere();
    expect(erzeugt[0].close).toHaveBeenCalled();
    expect(fenster.publikumVon(owner)).toBe(null);
  });

  it('Schließen des Publikums-Fensters meldet es dem Hauptfenster', () => {
    const { fenster, erzeugt } = aufbau();
    const owner = hauptfenster();
    fenster.oeffne(owner);
    erzeugt[0].close();
    expect(owner.webContents.send).toHaveBeenCalledWith('presentationWindow:closed');
    expect(owner.removeListener).toHaveBeenCalledWith('closed', expect.any(Function));
    expect(fenster.publikumVon(owner)).toBe(null);
    // Danach öffnet sich ein neues.
    fenster.oeffne(owner);
    expect(erzeugt).toHaveLength(2);
  });

  it('schliesse schließt das offene Publikums-Fenster', () => {
    const { fenster, erzeugt } = aufbau();
    const owner = hauptfenster();
    expect(fenster.schliesse(owner)).toBe(false);
    fenster.oeffne(owner);
    expect(fenster.schliesse(owner)).toBe(true);
    expect(erzeugt[0].close).toHaveBeenCalled();
  });

  it('ein Publikums-Fenster öffnet kein eigenes Publikums-Fenster', () => {
    const { fenster, erzeugt } = aufbau();
    fenster.oeffne(hauptfenster());
    expect(fenster.oeffne(erzeugt[0])).toEqual({ ok: false });
    expect(erzeugt).toHaveLength(1);
  });
});

describe('Folie und Eingabe (Kanal-Verträge)', () => {
  it('pruefeFolie nimmt nur das vollständige Paket', () => {
    expect(pruefeFolie(FOLIE)).toEqual(FOLIE);
    expect(pruefeFolie({ ...FOLIE, html: 5 })).toBe(null);
    expect(pruefeFolie({ ...FOLIE, index: -1 })).toBe(null);
    expect(pruefeFolie({ ...FOLIE, breite: 0 })).toBe(null);
    expect(pruefeFolie({ ...FOLIE, html: 'x'.repeat(FOLIE_MAX_ZEICHEN + 1) })).toBe(null);
    expect(pruefeFolie(null)).toBe(null);
  });

  it('pruefeEingabe lässt nur bekannte Arten und Felder durch', () => {
    expect(pruefeEingabe({ art: 'taste', key: 'ArrowRight', shiftKey: true, x: 1 })).toEqual({
      art: 'taste',
      key: 'ArrowRight',
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    });
    expect(pruefeEingabe({ art: 'rad', deltaY: '-3' })).toEqual({
      art: 'rad',
      deltaY: -3,
      ctrlKey: false,
    });
    expect(pruefeEingabe({ art: 'klick', x: 5 })).toEqual({ art: 'klick' });
    expect(pruefeEingabe({ art: 'beenden' })).toEqual({ art: 'beenden' });
    expect(pruefeEingabe({ art: 'oeffne' })).toBe(null);
    expect(pruefeEingabe({ art: 'rad', deltaY: 'x' })).toBe(null);
    expect(pruefeEingabe({ art: 'taste', key: 'x'.repeat(40) })).toBe(null);
  });

  it('die Folie geht an das Publikums-Fenster und steht für eine ladende Seite bereit', () => {
    const { fenster, erzeugt } = aufbau();
    const owner = hauptfenster();
    expect(fenster.sendeFolie(owner, FOLIE)).toBe(false);
    fenster.oeffne(owner);
    const wc = erzeugt[0].webContents;
    expect(fenster.bereit(wc)).toBe(null);
    expect(fenster.sendeFolie(owner, FOLIE)).toBe(true);
    expect(wc.send).toHaveBeenCalledWith('audience:slide', FOLIE);
    expect(fenster.bereit(wc)).toEqual(FOLIE);
    expect(fenster.sendeFolie(owner, { html: 1 })).toBe(false);
    // Ein fremder Absender bekommt nichts.
    expect(fenster.bereit(owner.webContents)).toBe(null);
  });

  it('eine Eingabe des Publikums-Fensters geht geprüft an sein Hauptfenster', () => {
    const { fenster, erzeugt } = aufbau();
    const owner = hauptfenster();
    fenster.oeffne(owner);
    const wc = erzeugt[0].webContents;
    expect(fenster.eingabe(wc, { art: 'klick', extra: true })).toBe(true);
    expect(owner.webContents.send).toHaveBeenCalledWith('presentationWindow:input', {
      art: 'klick',
    });
    expect(fenster.eingabe(wc, { art: 'unbekannt' })).toBe(false);
    // Das Hauptfenster selbst kann über diesen Weg nichts auslösen.
    expect(fenster.eingabe(owner.webContents, { art: 'klick' })).toBe(false);
  });
});

describe('Kanal-Gruppe presentation-window', () => {
  it('registriert genau die fünf Kanäle und reicht an den Erzeuger', () => {
    const handler = new Map();
    const erzeuger = {
      oeffne: vi.fn(() => ({ ok: true })),
      schliesse: vi.fn(() => true),
      sendeFolie: vi.fn(() => true),
      bereit: vi.fn(() => null),
      eingabe: vi.fn(() => true),
    };
    const owner = { id: 'haupt' };
    registerPresentationWindowIpc((name, fn) => handler.set(name, fn), {
      BrowserWindow: class {},
      screen: bildschirm(EIN_BILDSCHIRM),
      senderWindow: () => owner,
      erzeuger: () => erzeuger,
    });
    expect([...handler.keys()].sort()).toEqual([
      'audience:input',
      'audience:ready',
      'presentationWindow:close',
      'presentationWindow:open',
      'presentationWindow:slide',
    ]);
    const sender = { id: 7 };
    handler.get('presentationWindow:open')({ sender });
    expect(erzeuger.oeffne).toHaveBeenCalledWith(owner);
    handler.get('presentationWindow:close')({ sender });
    expect(erzeuger.schliesse).toHaveBeenCalledWith(owner);
    handler.get('presentationWindow:slide')({ sender }, FOLIE);
    expect(erzeuger.sendeFolie).toHaveBeenCalledWith(owner, FOLIE);
    handler.get('audience:ready')({ sender });
    expect(erzeuger.bereit).toHaveBeenCalledWith(sender);
    handler.get('audience:input')({ sender }, { art: 'klick' });
    expect(erzeuger.eingabe).toHaveBeenCalledWith(sender, { art: 'klick' });
  });

  it('main.js registriert die Gruppe über die zentrale Registrier-Funktion', () => {
    expect(MAIN_QUELLE).toMatch(/require\('\.\/ipc\/presentation-window'\)/);
    expect(MAIN_QUELLE).toMatch(/registerPresentationWindowIpc\(registriere, ipcDeps\)/);
  });
});

describe('Preload-Oberflächen (AK4)', () => {
  it('das Preload des Publikums-Fensters kennt nur electron und genau drei Wege', () => {
    const requires = [...PUBLIKUM_PRELOAD.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
    expect(requires).toEqual(['electron']);
    expect(PUBLIKUM_PRELOAD).toMatch(/exposeInMainWorld\('publikum'/);
    const kanaele = [...PUBLIKUM_PRELOAD.matchAll(/ipcRenderer\.(?:invoke|on)\('([^']+)'/g)]
      .map((m) => m[1])
      .sort();
    expect(kanaele).toEqual(['audience:input', 'audience:ready', 'audience:slide']);
    for (const weg of ['bereit:', 'onFolie:', 'eingabe:']) expect(PUBLIKUM_PRELOAD).toContain(weg);
  });

  it('das Preload des Hauptfensters trägt die Wege der Vorführung im eigenen Fenster', () => {
    for (const kanal of [
      "'menu:presentationStartWindow'",
      "'menu:presentationStop'",
      // 4T-002279: der Menü-Weg der Referenten-Ansicht.
      "'menu:presentationPresenter'",
      "'presentationWindow:open'",
      "'presentationWindow:close'",
      "'presentationWindow:slide'",
      "'presentationWindow:input'",
      "'presentationWindow:closed'",
    ]) {
      expect(PRELOAD_QUELLE).toContain(kanal);
    }
  });
});
