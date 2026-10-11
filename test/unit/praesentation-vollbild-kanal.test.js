// 4T-002162 (Epic 3E-000149): Der Kanal des Hauptprozesses fuer das Vollbild
// der Vorfuehrung (`window:setFullScreen`) und die Meldung, dass das Fenster
// das Vollbild verlassen hat (`window:leftFullScreen`).
//
// Der Kanal wird am echten Handler aus `src/main/ipc/windows.js` gemessen,
// nicht an einer Nachbildung (Muster neues-fenster.test.js): Das Fenster ist
// eine Attrappe mit `isFullScreen`/`setFullScreen`, mehr braucht der Handler
// nicht. Die Meldung haengt in `window-manager.js` an einem Fenster-Ereignis
// und die Bruecke im Preload; beide sind im Unit-Kontext nicht ladbar
// (Electron) und werden deshalb gegen den QUELLTEXT geprueft.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWindowsIpc } = require('../../src/main/ipc/windows.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quelle = (...teile) => fs.readFileSync(path.join(WURZEL, ...teile), 'utf8');

// Ein Fenster mit dem Vollbild-Zustand `vollbild`; `setFullScreen` schaltet ihn.
function fenster(vollbild = false) {
  const w = {
    zustand: vollbild,
    isDestroyed: () => false,
    isFullScreen: () => w.zustand,
    setFullScreen: vi.fn((an) => {
      w.zustand = an;
    }),
  };
  return w;
}

function kanal(absender) {
  const handler = new Map();
  registerWindowsIpc((name, fn) => handler.set(name, fn), {
    senderWindow: () => absender,
  });
  return handler.get('window:setFullScreen');
}

describe('Kanal window:setFullScreen (4T-002162)', () => {
  it('ist registriert', () => {
    expect(typeof kanal(fenster())).toBe('function');
  });

  it('setzt das Vollbild und meldet den Zustand davor', () => {
    const w = fenster(false);
    const ruf = kanal(w);
    expect(ruf({}, true)).toBe(false);
    expect(w.setFullScreen).toHaveBeenCalledWith(true);
    expect(w.isFullScreen()).toBe(true);
  });

  it('nimmt das Vollbild zurück und meldet den Zustand davor', () => {
    const w = fenster(true);
    const ruf = kanal(w);
    expect(ruf({}, false)).toBe(true);
    expect(w.setFullScreen).toHaveBeenCalledWith(false);
    expect(w.isFullScreen()).toBe(false);
  });

  it('schaltet nicht, wenn das Fenster schon im gewünschten Zustand ist', () => {
    // Ein Fenster, das schon vor der Vorführung im Vollbild war, bleibt
    // unberührt; der Renderer erfährt das an der Antwort true.
    const w = fenster(true);
    expect(kanal(w)({}, true)).toBe(true);
    expect(w.setFullScreen).not.toHaveBeenCalled();
  });

  it('versteht nur ein echtes true als «an»', () => {
    const w = fenster(false);
    kanal(w)({}, 'ja');
    expect(w.setFullScreen).not.toHaveBeenCalled();
  });

  it('bleibt ohne lebendes Fenster stumm und antwortet null', () => {
    expect(kanal(null)({}, true)).toBe(null);
    const tot = { ...fenster(false), isDestroyed: () => true };
    expect(kanal(tot)({}, true)).toBe(null);
    expect(tot.setFullScreen).not.toHaveBeenCalled();
  });
});

describe('Meldung «Vollbild verlassen» und Brücke (4T-002162)', () => {
  it('die Fenster-Verwaltung meldet das Verlassen des Vollbilds an den Renderer', () => {
    const manager = quelle('src', 'main', 'window-manager.js');
    expect(manager).toMatch(
      /win\.on\('leave-full-screen', \(\) => \{\s*if \(!win\.isDestroyed\(\)\) win\.webContents\.send\('window:leftFullScreen'\);/,
    );
  });

  it('der Preload führt Kanal, Meldung und Menü-Eintrag', () => {
    const preload = quelle('src', 'main', 'preload.js');
    expect(preload).toContain(
      "setWindowFullScreen: (an) => ipcRenderer.invoke('window:setFullScreen', !!an)",
    );
    expect(preload).toContain(
      "onWindowLeftFullScreen: (cb) => ipcRenderer.on('window:leftFullScreen', () => cb())",
    );
    expect(preload).toContain(
      "onMenuPresentationStart: (cb) => ipcRenderer.on('menu:presentationStart', () => cb())",
    );
  });
});
