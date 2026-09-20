// 4T-001738 (Epic 3E-000308): Der Menüpunkt und das Kommando «Neues Fenster».
//
// Vier Dinge sind hier zu belegen, und jedes ist eine Entscheidung, die man
// auch anders hätte treffen können:
//
//   - **Die Reihenfolge der beiden Einträge** (AK2, E4 des Epics): Das kleinere
//     Werkzeug steht zuerst. Gemessen wird sie an der gebauten Item-Liste aus
//     `src/main/menu/menu-fenster.js` und nicht an einem Quelltext-Ausdruck —
//     genau dafür liegt der Block in einem electron-freien Modul.
//   - **Das Kommando ohne Vorgabe-Kürzel, mit Pflichtfeld und im Menü** (AK8):
//     Ein Kürzel wäre eine Zusage, die niemand getroffen hat, und ein fehlendes
//     `availability` ein Kommando, dessen Freigabe niemand geschrieben hat.
//   - **Der bestehende Kanal trägt** (AK3, AK4, E6): `window:openNew` ohne
//     Panes und ohne Reiter-Nutzlast erzeugt ein Fenster in der Applikation des
//     ABSENDERS und schickt nichts nach. Gemessen am echten Handler aus
//     `src/main/ipc/windows.js`, nicht an einer Nachbildung.
//   - **Die Verdrahtung ist vollständig**: Menü-Kanal, Brücke im Preload,
//     Menü-Horcher und Dispatcher-Eintrag. Fehlt ein Glied, ist der Eintrag da
//     und tut nichts — die Lage von Befund L-06 (`4T-000890`), und keine, die
//     ein Prüffall über das Menü-Objekt allein sehen könnte.
//
// Geprüft wird bei den beiden letzten Punkten gegen den QUELLTEXT, weil
// `preload.js`, `app-menu-bindings.js` und `app-commands.js` im Unit-Kontext
// nicht ladbar sind (Electron bzw. halber Renderer); Muster
// `kommando-dispatcher.test.js`.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { COMMANDS, COMMAND_CATEGORIES } from '../../src/shared/commands/commands.js';
import { LOCALE_CODES } from '../../src/shared/locales.js';

const require = createRequire(import.meta.url);
const { windowMenuItems } = require('../../src/main/menu/menu-fenster.js');
const { registerWindowsIpc } = require('../../src/main/ipc/windows.js');

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');
const FRAGMENTE = path.join(WURZEL, 'src', 'i18n', 'fragments');

function quelle(...teile) {
  return fs.readFileSync(path.join(WURZEL, ...teile), 'utf8');
}

// Übersetzung im Test: der Schlüssel selbst, damit die Zuordnung sichtbar
// bleibt (Muster arbeitsbereiche-zuordnung.test.js).
const t = (key) => key;

describe('Kommando window.newWindow in der Registry (4T-001738, AK8)', () => {
  const cmd = COMMANDS.find((c) => c.id === 'window.newWindow');

  it('ist angelegt und trägt die Schlüssel des Eintrags', () => {
    expect(cmd).toBeDefined();
    expect(cmd.labelKey).toBe('menu.file.newWindow');
    expect(cmd.descKey).toBe('help.shortcut.newWindow');
    expect(COMMAND_CATEGORIES).toContain(cmd.categoryKey);
    // Dieselbe Hilfe-Gruppe wie sein Nachbar: beide sind Datei-Menü-Einträge.
    expect(cmd.categoryKey).toBe(COMMANDS.find((c) => c.id === 'app.newApplication').categoryKey);
  });

  it('belegt KEIN Vorgabe-Kürzel und hat einen Menü-Eintrag', () => {
    // E6: kein Vorgabe-Kürzel. Über die Einstellungen bleibt eines belegbar;
    // das ist der Unterschied zwischen «keines vergeben» und «keines möglich».
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.menu).toBe(true);
    expect(cmd.editorScoped).toBe(false);
  });

  it('trägt das Pflichtfeld availability mit der Bedingung seines Nachbarn', () => {
    // 'immer' ist hier Bauart und nicht Bequemlichkeit: Ein Menü existiert nur
    // in einem Fenster, und jedes Fenster gehört einer Applikation
    // (window-manager.js weist beim Erzeugen eine zu). Eine eigene Bedingung
    // hätte nichts zu messen. AK9 ist damit strukturell erfüllt.
    expect(cmd.availability).toBe('immer');
    expect(cmd.availability).toBe(COMMANDS.find((c) => c.id === 'app.newApplication').availability);
  });

  it('steht in der Registry-Liste VOR der neuen Applikation', () => {
    // Die Array-Reihenfolge bestimmt die Zeilen-Reihenfolge der erzeugten
    // Hilfe-Tabelle und die Reihenfolge in der Kürzel-Einstellung; sie folgt
    // deshalb derselben Entscheidung wie das Menü (E4).
    const ids = COMMANDS.map((c) => c.id);
    expect(ids.indexOf('window.newWindow')).toBeLessThan(ids.indexOf('app.newApplication'));
  });
});

describe('Fenster-Block des Datei-Menüs (4T-001738, AK1, AK2)', () => {
  const items = () =>
    windowMenuItems({
      t,
      acc: (id) => (id === 'window.newWindow' ? undefined : 'Ctrl+Alt+9'),
      avail: () => true,
      send: (channel) => () => channel,
    });

  it('führt genau zwei Einträge, «Neues Fenster» vor «Neue Applikation»', () => {
    expect(items().map((i) => i.label)).toEqual(['menu.file.newWindow', 'menu.file.newApp']);
  });

  it('löst den Menü-Kanal jedes Eintrags aus', () => {
    // Ein Eintrag ohne Kanal wäre eine Beschriftung ohne Wirkung.
    expect(items().map((i) => i.click())).toEqual(['menu:newWindow', 'menu:newApplication']);
  });

  it('holt Kürzel und Freigabe je Eintrag über SEINE Kommando-Kennung', () => {
    const gesehen = { acc: [], avail: [] };
    windowMenuItems({
      t,
      acc: (id) => {
        gesehen.acc.push(id);
        return undefined;
      },
      avail: (id) => {
        gesehen.avail.push(id);
        return true;
      },
      send: () => () => null,
    });
    expect(gesehen.acc).toEqual(['window.newWindow', 'app.newApplication']);
    expect(gesehen.avail).toEqual(gesehen.acc);
  });

  it('reicht das Ergebnis der Freigabe unverändert durch', () => {
    // Der Block entscheidet nichts selbst — das Verfügbarkeits-Modell
    // entscheidet, und dieser Fall hält fest, dass der Wert ankommt.
    const gesperrt = windowMenuItems({
      t,
      acc: () => undefined,
      avail: () => false,
      send: () => () => null,
    });
    expect(gesperrt.map((i) => i.enabled)).toEqual([false, false]);
  });
});

// --- window:openNew ohne Panes (E6) -------------------------------------------

// Der echte Handler mit genau den Abhängigkeiten, die `window:openNew`
// benutzt. Mehr hereinzugeben hiesse, einen halben Hauptprozess zu stellen.
function openNewHandler({ senderAppId = 7, sender = undefined } = {}) {
  const handler = new Map();
  const createWindow = vi.fn(() => ({ isDestroyed: () => false, webContents: { once: vi.fn() } }));
  const absender =
    sender === undefined
      ? {
          isDestroyed: () => false,
          isMaximized: () => false,
          getBounds: () => ({ x: 100, y: 200, width: 1200, height: 800 }),
          getNormalBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
          webContents: { id: 42 },
        }
      : sender;
  registerWindowsIpc((kanal, fn) => handler.set(kanal, fn), {
    senderWindow: () => absender,
    appRegistry: { appOf: (id) => (id === 42 ? senderAppId : null) },
    createWindow,
  });
  return { ruf: handler.get('window:openNew'), createWindow };
}

describe('window:openNew ohne Panes und ohne Nutzlast (4T-001738, AK3, AK4)', () => {
  it('erzeugt das Fenster in der Applikation des Absenders', () => {
    // AK3: Das ist der Kern des Unterschieds zu «Neue Applikation», und er
    // steckt allein in dieser einen Zeile des Kanals.
    const { ruf, createWindow } = openNewHandler();
    ruf({}, []);
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(createWindow.mock.calls[0][0].appId).toBe(7);
  });

  it('gibt eine LEERE Pane-Liste weiter und schickt keinen Reiter nach', () => {
    // AK4: Ohne Panes startet der Anzeige-Prozess mit einem einzelnen
    // unbenannten Reiter, wie bei einem frischen Start. Der Nachtrag-Weg von
    // «In neues Fenster verschieben» (`tab:appendFromOtherWindow`) darf hier
    // nicht anlaufen; gemessen am ausbleibenden did-finish-load-Horcher.
    const { ruf, createWindow } = openNewHandler();
    const fenster = ruf({}, []);
    expect(fenster).toBeUndefined();
    const opts = createWindow.mock.calls[0][0];
    expect(opts.initialPanes).toEqual([]);
    expect(opts.maximized).toBe(false);
    expect(createWindow.mock.results[0].value.webContents.once).not.toHaveBeenCalled();
  });

  it('versetzt das neue Fenster gegen den Absender, statt es zu überdecken', () => {
    // Bestands-Verhalten, das der Menü-Weg erbt (Lösungsansatz Punkt 6): Ein
    // deckungsgleiches zweites Fenster sähe wie ein hängendes erstes aus.
    const { ruf, createWindow } = openNewHandler();
    ruf({}, []);
    expect(createWindow.mock.calls[0][0].bounds).toEqual({
      x: 130,
      y: 230,
      width: 1200,
      height: 800,
    });
  });

  it('bleibt ohne lebendes Absender-Fenster stumm statt zu werfen', () => {
    // Defensiv wie die Nachbarn: Der Aufruf kann ein Fenster treffen, das
    // gerade geschlossen wird.
    const { ruf, createWindow } = openNewHandler({ sender: null });
    expect(() => ruf({}, [])).not.toThrow();
    expect(createWindow.mock.calls[0][0].bounds).toBe(null);
    expect(createWindow.mock.calls[0][0].appId).toBe(null);
  });
});

// --- Verdrahtung vom Menü bis zur Handlung ------------------------------------

describe('Verdrahtung des Menü-Wegs (4T-001738)', () => {
  it('die Brücke im Preload horcht auf den Menü-Kanal', () => {
    const preload = quelle('src', 'main', 'preload.js');
    expect(preload).toContain("onMenuNewWindow: (cb) => ipcRenderer.on('menu:newWindow'");
  });

  it('der Menü-Horcher des Anzeige-Prozesses ruft den bestehenden Kanal ohne Panes', () => {
    const bindings = quelle('src', 'renderer', 'modules', 'app', 'app-menu-bindings.js');
    expect(bindings).toContain('api.onMenuNewWindow(() => api.openNewWindow([]))');
  });

  it('der Dispatcher bedient das Kommando auf demselben Weg', () => {
    // Menü-Eintrag und Kommando müssen dieselbe Handlung auslösen; zwei Wege
    // mit unterschiedlicher Nutzlast wären der Anfang zweier Verhaltensweisen.
    const dispatcher = quelle('src', 'renderer', 'modules', 'app', 'app-commands.js');
    expect(dispatcher).toContain("'window.newWindow':");
    const block = dispatcher.slice(dispatcher.indexOf("'window.newWindow':"));
    expect(block.slice(0, 120)).toContain('api.openNewWindow([])');
  });

  it('der Menü-Kanal wird nirgends sonst gesendet', () => {
    // Die Gegenrichtung: Ein zweiter Sender wäre ein zweiter Weg, der beim
    // nächsten Umbau auseinanderliefe.
    const menuOrdner = path.join(WURZEL, 'src', 'main', 'menu');
    const treffer = fs
      .readdirSync(menuOrdner)
      .filter((name) => name.endsWith('.js'))
      .filter((name) =>
        fs.readFileSync(path.join(menuOrdner, name), 'utf8').includes("send('menu:newWindow')"),
      );
    expect(treffer).toEqual(['menu-fenster.js']);
  });
});

describe('Beschriftung in fünf Sprachfassungen (4T-001738, AK12)', () => {
  it('jede Fassung führt beide Schlüssel mit nicht-leerem Wert', () => {
    for (const code of LOCALE_CODES) {
      const menu = JSON.parse(fs.readFileSync(path.join(FRAGMENTE, code, 'menu.json'), 'utf8'));
      const kurz = JSON.parse(
        fs.readFileSync(path.join(FRAGMENTE, code, 'help-shortcut.json'), 'utf8'),
      );
      expect(menu['menu.file.newWindow'], `${code}: menu.file.newWindow`).toBeTruthy();
      expect(kurz['help.shortcut.newWindow'], `${code}: help.shortcut.newWindow`).toBeTruthy();
      // Kein ASCII-Anführungszeichen im Text-Inhalt (Entwicklungsrichtlinien,
      // Kapitel 11): Es terminiert den JSON-String vorzeitig.
      expect(menu['menu.file.newWindow']).not.toContain('"');
      expect(kurz['help.shortcut.newWindow']).not.toContain('"');
    }
  });
});
