// 4T-002648 (Epic 3E-000416): Die Absender-Prüfung an der Anmelde-Stelle
// (AK3). Ein Aufruf erreicht seinen Handler nur aus dem Haupt-Rahmen einer
// eigenen Seite des Programms und nur, wenn die Fenster-Art des Absenders den
// Kanal erreichen darf: das Publikums-Fenster genau seine zwei Kanäle, das
// Fenster für Folien-Bilder keinen, das Hauptfenster alle übrigen.
//
// Ohne Electron: Ereignis, Rahmen und webContents sind Ersatz-Objekte mit den
// Feldern, die die Prüfung liest (`sender.id`, `senderFrame.parent`,
// `senderFrame.url`, `once('destroyed')`). Die Plattform wird der Prüfung
// übergeben, damit die Windows- und die POSIX-Fälle auf jedem Prüf-Rechner
// laufen. Die Adressen der Rahmen stehen wörtlich da, in der Form, die
// Chromium für eine mit `loadFile` geladene Seite meldet.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { setPlatformForTests } = require('../../src/shared/platform.js');
const {
  createSenderCheck,
  channelAllowed,
  ownPageAddress,
  SenderRejection,
  REASONS,
  AUDIENCE_CHANNELS,
  WINDOW_KINDS,
} = require('../../src/main/ipc/channel-sender.js');

const WIN = {
  platform: 'win32',
  mainPage: 'C:\\Program Files\\EM4me\\resources\\app.asar\\src\\renderer\\index.html',
  mainUrl: 'file:///C:/Program%20Files/EM4me/resources/app.asar/src/renderer/index.html',
  audiencePage: 'C:\\Program Files\\EM4me\\resources\\app.asar\\src\\renderer\\publikum.html',
  audienceUrl: 'file:///C:/Program%20Files/EM4me/resources/app.asar/src/renderer/publikum.html',
};
const POSIX = {
  platform: 'linux',
  mainPage: '/opt/EM4me/resources/app.asar/src/renderer/index.html',
  mainUrl: 'file:///opt/EM4me/resources/app.asar/src/renderer/index.html',
};

let nextId = 1;

// Ein webContents mit Kennung und dem einen Ereignis, das die Prüfung hört.
function webContents() {
  const listeners = new Map();
  return {
    id: nextId++,
    once: (name, fn) => listeners.set(name, fn),
    destroy() {
      const fn = listeners.get('destroyed');
      listeners.delete('destroyed');
      if (fn) fn();
    },
  };
}

const topFrame = (url) => ({ url, parent: null });
const subFrame = (url) => ({ url, parent: topFrame(url) });
const event = (sender, senderFrame) => ({ sender, senderFrame });

// Baut die Prüfung mit den drei Fenstern; die Warnungen werden mitgeschrieben.
function setup(env = WIN) {
  const warn = vi.fn();
  const check = createSenderCheck({ warn, platform: env.platform });
  const main = webContents();
  check.registerWindow(main, WINDOW_KINDS.main, env.mainPage);
  const audience = webContents();
  if (env.audiencePage) check.registerWindow(audience, WINDOW_KINDS.audience, env.audiencePage);
  const slides = webContents();
  check.registerWindow(slides, WINDOW_KINDS.slideImages);
  return { check, warn, main, audience, slides };
}

// Nachbildung der Anmelde-Stelle in main.js: erst die Absender-Prüfung, dann
// der Handler mit unveränderten Argumenten.
function register(check, channel, fn) {
  return (ev, ...args) => {
    check.assertSender(channel, ev);
    return fn(ev, ...args);
  };
}

// Der Grund einer Abweisung oder null, wenn der Aufruf durchgeht.
function reasonOf(check, channel, ev) {
  try {
    check.assertSender(channel, ev);
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(SenderRejection);
    return err.reason;
  }
}

describe('Absender-Prüfung: eigene Seite im Haupt-Rahmen', () => {
  it('der Haupt-Rahmen des Hauptfensters mit eigener Adresse erreicht den Handler unverändert', async () => {
    const { check, warn, main } = setup();
    const handler = vi.fn(async () => ({ ok: true }));
    const ev = event(main, topFrame(WIN.mainUrl));
    const payload = { filePath: 'C:\\Daten\\a.md' };
    await expect(register(check, 'file:save', handler)(ev, payload, 'x')).resolves.toEqual({
      ok: true,
    });
    expect(handler).toHaveBeenCalledWith(ev, payload, 'x');
    expect(handler.mock.calls[0][1]).toBe(payload);
    expect(warn).not.toHaveBeenCalled();
  });

  it('ein Aufruf aus einem Unter-Rahmen wird abgewiesen, der Handler läuft nicht', () => {
    const { check, warn, main } = setup();
    const handler = vi.fn();
    const ev = event(main, subFrame(WIN.mainUrl));
    expect(() => register(check, 'file:save', handler)(ev)).toThrow('sender:subFrame');
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Kanal file:save abgewiesen:',
      'sender:subFrame',
      'Fenster-Art main',
    );
  });

  it.each([
    ['https://example.org/', 'fremder Server'],
    ['file:///C:/Users/x/Downloads/boese.html', 'andere Datei'],
    [
      'file:///C:/Program%20Files/EM4me/resources/app.asar/src/renderer/publikum.html',
      'andere eigene Seite',
    ],
    [
      'file:///C:/Program%20Files/EM4me/resources/app.asar/src/renderer/index.html/',
      'Schrägstrich angehängt',
    ],
    [
      'file://nas/C:/Program%20Files/EM4me/resources/app.asar/src/renderer/index.html',
      'anderer Rechner',
    ],
    ['about:blank', 'leere Seite'],
    ['data:text/html,<p>x</p>', 'Daten-Adresse'],
    ['em4me-folie://folie/x/1', 'Schema der Folien-Bilder'],
    ['', 'leer'],
    ['kaputt', 'unlesbar'],
  ])('fremde Adresse %s (%s) wird abgewiesen', (url) => {
    const { check, main } = setup();
    expect(reasonOf(check, 'file:save', event(main, topFrame(url)))).toBe('foreignAddress');
  });

  it('Abfrage-Teil und Anker an der eigenen Adresse sind erlaubt', () => {
    const { check, main } = setup();
    for (const url of [`${WIN.mainUrl}?modus=1`, `${WIN.mainUrl}#anker`, `${WIN.mainUrl}?a=b#c`]) {
      expect(reasonOf(check, 'file:save', event(main, topFrame(url)))).toBeNull();
    }
  });

  it('fehlender Rahmen (aufgelöst oder weiternavigiert) wird abgewiesen', () => {
    const { check, main } = setup();
    expect(reasonOf(check, 'file:save', event(main, null))).toBe('noFrame');
    expect(reasonOf(check, 'file:save', event(main, undefined))).toBe('noFrame');
    expect(reasonOf(check, 'file:save', null)).toBe('noFrame');
  });

  it('ein Rahmen, der beim Lesen wirft (in Electron: schon aufgelöst), wird abgewiesen', () => {
    const { check, main } = setup();
    const ev = {
      sender: main,
      get senderFrame() {
        throw new Error('Render frame was disposed');
      },
    };
    expect(reasonOf(check, 'file:save', ev)).toBe('noFrame');
    const frame = {
      parent: null,
      get url() {
        throw new Error('Render frame was disposed');
      },
    };
    expect(reasonOf(check, 'file:save', event(main, frame))).toBe('noFrame');
  });

  it('ein Rahmen ohne Angabe seines Eltern-Rahmens gilt nicht als Haupt-Rahmen', () => {
    const { check, main } = setup();
    expect(reasonOf(check, 'file:save', event(main, { url: WIN.mainUrl }))).toBe('subFrame');
  });
});

describe('Absender-Prüfung: Positiv-Liste je Fenster-Art', () => {
  it('das Publikums-Fenster erreicht genau seine zwei Kanäle', () => {
    const { check, audience } = setup();
    const ev = event(audience, topFrame(WIN.audienceUrl));
    expect(reasonOf(check, 'audience:ready', ev)).toBeNull();
    expect(reasonOf(check, 'audience:input', ev)).toBeNull();
    for (const channel of [
      'file:save',
      'settings:set',
      'theme:current',
      'presentationWindow:open',
      'presentationWindow:slide',
    ]) {
      expect(reasonOf(check, channel, ev), channel).toBe('channelNotAllowed');
    }
  });

  it('das Publikums-Fenster mit der Adresse des Hauptfensters wird abgewiesen', () => {
    const { check, audience } = setup();
    const ev = event(audience, topFrame(WIN.mainUrl));
    expect(reasonOf(check, 'audience:ready', ev)).toBe('foreignAddress');
  });

  it('das Hauptfenster erreicht die zwei Kanäle des Publikums-Fensters nicht', () => {
    const { check, warn, main } = setup();
    const ev = event(main, topFrame(WIN.mainUrl));
    for (const channel of AUDIENCE_CHANNELS) {
      expect(reasonOf(check, channel, ev), channel).toBe('channelNotAllowed');
    }
    expect(reasonOf(check, 'presentationWindow:open', ev)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'Kanal audience:ready abgewiesen:',
      'sender:channelNotAllowed',
      'Fenster-Art main',
    );
  });

  it('das Fenster für Folien-Bilder erreicht keinen Kanal', () => {
    const { check, slides } = setup();
    const ev = event(
      slides,
      topFrame('em4me-folie://folie/0b5c3c1e-1f6a-4b8e-9d0e-123456789abc/1'),
    );
    for (const channel of ['audience:ready', 'audience:input', 'file:save', 'theme:current']) {
      expect(reasonOf(check, channel, ev), channel).toBe('channelNotAllowed');
    }
  });

  it('ein webContents ohne Eintrag erreicht keinen Kanal', () => {
    const { check, warn } = setup();
    const fremd = webContents();
    expect(reasonOf(check, 'theme:current', event(fremd, topFrame(WIN.mainUrl)))).toBe(
      'unknownWindow',
    );
    expect(reasonOf(check, 'audience:ready', event(undefined, topFrame(WIN.mainUrl)))).toBe(
      'unknownWindow',
    );
    expect(warn).toHaveBeenCalledWith(
      'Kanal theme:current abgewiesen:',
      'sender:unknownWindow',
      'Fenster-Art unbekannt',
    );
  });

  it('die Positiv-Liste als Tabelle', () => {
    expect(channelAllowed('main', 'file:save')).toBe(true);
    expect(channelAllowed('main', 'audience:input')).toBe(false);
    expect(channelAllowed('audience', 'audience:input')).toBe(true);
    expect(channelAllowed('audience', 'file:save')).toBe(false);
    expect(channelAllowed('slideImages', 'file:save')).toBe(false);
    expect(channelAllowed('unbekannt', 'file:save')).toBe(false);
  });
});

describe('Absender-Prüfung: Adress-Vergleich je Plattform', () => {
  it('Windows: der Laufwerks-Buchstabe darf in beiden Schreibweisen stehen', () => {
    const check = createSenderCheck({ warn: vi.fn(), platform: 'win32' });
    const klein = webContents();
    check.registerWindow(klein, 'main', WIN.mainPage.replace(/^C:/, 'c:'));
    expect(reasonOf(check, 'file:save', event(klein, topFrame(WIN.mainUrl)))).toBeNull();
    const gross = webContents();
    check.registerWindow(gross, 'main', WIN.mainPage);
    const kleineAdresse = WIN.mainUrl.replace('file:///C:', 'file:///c:');
    expect(reasonOf(check, 'file:save', event(gross, topFrame(kleineAdresse)))).toBeNull();
  });

  it('Windows: Pfad ohne Unterschied der Groß- und Kleinschreibung', () => {
    const { check, main } = setup(WIN);
    const anders = WIN.mainUrl.replace('Program%20Files/EM4me', 'PROGRAM%20FILES/em4me');
    expect(reasonOf(check, 'file:save', event(main, topFrame(anders)))).toBeNull();
  });

  it('POSIX: die eigene Adresse erreicht den Kanal, andere Schreibweise nicht', () => {
    const { check, main } = setup(POSIX);
    expect(reasonOf(check, 'file:save', event(main, topFrame(POSIX.mainUrl)))).toBeNull();
    const anders = POSIX.mainUrl.replace('/opt/EM4me/', '/opt/em4me/');
    expect(reasonOf(check, 'file:save', event(main, topFrame(anders)))).toBe('foreignAddress');
  });

  it('Sonderzeichen und Umlaute im Pfad: verschiedene Kodierung derselben Datei passt', () => {
    const check = createSenderCheck({ warn: vi.fn(), platform: 'win32' });
    const wc = webContents();
    check.registerWindow(wc, 'main', 'C:\\Users\\Jürgen\\EM4me {neu}\\src\\renderer\\index.html');
    const chromium = 'file:///C:/Users/J%C3%BCrgen/EM4me%20{neu}/src/renderer/index.html';
    expect(reasonOf(check, 'file:save', event(wc, topFrame(chromium)))).toBeNull();
  });

  it('Programm auf einem Netzlaufwerk: Rechner-Teil gehört zur Adresse', () => {
    const check = createSenderCheck({ warn: vi.fn(), platform: 'win32' });
    const wc = webContents();
    check.registerWindow(wc, 'main', '\\\\NAS\\Programme\\EM4me\\src\\renderer\\index.html');
    const eigen = 'file://nas/Programme/EM4me/src/renderer/index.html';
    expect(reasonOf(check, 'file:save', event(wc, topFrame(eigen)))).toBeNull();
    const anderer = 'file://anderer/Programme/EM4me/src/renderer/index.html';
    expect(reasonOf(check, 'file:save', event(wc, topFrame(anderer)))).toBe('foreignAddress');
  });

  // Erosions-Wächter, Regel E1 (Ausschnitt vom 2026-11-22): Ohne Vorgabe fragt
  // die Prüfung die zentrale Plattform-Auskunft statt `process.platform`.
  it('ohne Vorgabe folgt die Schreibweise der zentralen Plattform-Auskunft', () => {
    try {
      setPlatformForTests('win32');
      const win = createSenderCheck({ warn: vi.fn() });
      const a = webContents();
      win.registerWindow(a, 'main', WIN.mainPage);
      const anders = WIN.mainUrl.replace('Program%20Files/EM4me', 'PROGRAM%20FILES/em4me');
      expect(reasonOf(win, 'file:save', event(a, topFrame(anders)))).toBeNull();
      setPlatformForTests('linux');
      const posix = createSenderCheck({ warn: vi.fn() });
      const b = webContents();
      posix.registerWindow(b, 'main', POSIX.mainPage);
      expect(reasonOf(posix, 'file:save', event(b, topFrame(POSIX.mainUrl)))).toBeNull();
      const andersPosix = POSIX.mainUrl.replace('/opt/EM4me/', '/opt/em4me/');
      expect(reasonOf(posix, 'file:save', event(b, topFrame(andersPosix)))).toBe('foreignAddress');
    } finally {
      setPlatformForTests(undefined);
    }
  });

  it('die eigene Adresse entsteht aus der geladenen Datei', () => {
    expect(ownPageAddress(WIN.mainPage, 'win32')).toBe(WIN.mainUrl);
    expect(ownPageAddress(POSIX.mainPage, 'linux')).toBe(POSIX.mainUrl);
  });
});

describe('Absender-Prüfung: Eintragen und Austragen', () => {
  it('mit dem webContents endet der Eintrag; danach erreicht es keinen Kanal', () => {
    const { check, main } = setup();
    const ev = event(main, topFrame(WIN.mainUrl));
    expect(reasonOf(check, 'file:save', ev)).toBeNull();
    expect(check.kindOf(main)).toBe('main');
    main.destroy();
    expect(check.kindOf(main)).toBeNull();
    expect(reasonOf(check, 'file:save', ev)).toBe('unknownWindow');
  });

  it('Neu-Laden derselben Seite: dasselbe webContents bleibt eingetragen', () => {
    const { check, main } = setup();
    // Nach einem Neu-Laden meldet der neue Haupt-Rahmen dieselbe Adresse.
    for (let i = 0; i < 3; i += 1) {
      expect(reasonOf(check, 'theme:current', event(main, topFrame(WIN.mainUrl)))).toBeNull();
    }
    expect(check.kindOf(main)).toBe('main');
  });

  it('ein webContents lässt sich nicht zweimal eintragen, nach dem Austragen neu', () => {
    const check = createSenderCheck({ warn: vi.fn(), platform: 'win32' });
    const wc = webContents();
    check.registerWindow(wc, 'audience', WIN.audiencePage);
    expect(() => check.registerWindow(wc, 'main', WIN.mainPage)).toThrow(/already registered/);
    expect(check.kindOf(wc)).toBe('audience');
    wc.destroy();
    check.registerWindow(wc, 'main', WIN.mainPage);
    expect(check.kindOf(wc)).toBe('main');
  });

  it('ein veralteter destroyed-Zuhörer trägt einen neueren Eintrag nicht aus', () => {
    const check = createSenderCheck({ warn: vi.fn(), platform: 'win32' });
    const listeners = [];
    const wc = { id: nextId++, once: (_name, fn) => listeners.push(fn) };
    check.registerWindow(wc, 'audience', WIN.audiencePage);
    listeners[0]();
    check.registerWindow(wc, 'main', WIN.mainPage);
    listeners[0]();
    expect(check.kindOf(wc)).toBe('main');
  });

  it('Vertrag der Eintragung bricht laut', () => {
    const check = createSenderCheck({ warn: vi.fn(), platform: 'win32' });
    expect(() => check.registerWindow(webContents(), 'dialog', WIN.mainPage)).toThrow(/kind/);
    expect(() => check.registerWindow(webContents(), 'main')).toThrow(/page/);
    expect(() => check.registerWindow(webContents(), 'audience', '')).toThrow(/page/);
    expect(() => check.registerWindow(webContents(), 'slideImages', WIN.mainPage)).toThrow(/page/);
    expect(() => check.registerWindow({ id: 'x', once() {} }, 'main', WIN.mainPage)).toThrow(
      /webContents/,
    );
    expect(() => check.registerWindow(null, 'main', WIN.mainPage)).toThrow(/webContents/);
  });
});

describe('Absender-Prüfung: Form der Abweisung', () => {
  it('jeder Grund ist ein geworfener Fehler mit dem Text sender:<Grund>, ohne Adresse', () => {
    const { check, main, slides } = setup();
    const cases = {
      noFrame: event(main, null),
      subFrame: event(main, subFrame(WIN.mainUrl)),
      unknownWindow: event(webContents(), topFrame(WIN.mainUrl)),
      channelNotAllowed: event(slides, topFrame(WIN.mainUrl)),
      foreignAddress: event(main, topFrame('file:///C:/Users/x/boese.html')),
    };
    expect(Object.keys(cases).sort()).toEqual([...REASONS].sort());
    for (const [reason, ev] of Object.entries(cases)) {
      let thrown;
      try {
        check.assertSender('theme:current', ev);
      } catch (err) {
        thrown = err;
      }
      expect(thrown, reason).toBeInstanceOf(Error);
      expect(thrown.message).toBe(`sender:${reason}`);
      expect(thrown.reason).toBe(reason);
    }
  });

  it('die Warnung nennt Kanal, Grund und Fenster-Art, nie Adresse oder Pfad', () => {
    const { check, warn, main } = setup();
    reasonOf(check, 'file:save', event(main, topFrame('file:///C:/Users/x/geheim.html')));
    expect(warn).toHaveBeenCalledTimes(1);
    const text = warn.mock.calls[0].join(' ');
    expect(text).toBe('Kanal file:save abgewiesen: sender:foreignAddress Fenster-Art main');
    expect(text).not.toMatch(/geheim|Users|file:\/\//);
  });
});
