// 4T-001727 (Epic 3E-000305): Unit-Tests der Zustellung fälliger Meldungen an
// alle Fenster und ihrer einmaligen Bearbeitung im Hauptprozess.
//
// Drei Schichten, jede mit injizierten Nachbarn und ohne Electron:
//   1. das Zustell-Register (src/main/checks/due-delivery.js) — erster Anspruch
//      gewinnt, Rückgabe nach gescheitertem Schreiben, Nachholen, einmalige
//      System-Benachrichtigung;
//   2. die Verdrahtung der Erinnerungen (src/main/checks/checkers.js) — die
//      Meldung geht an alle Fenster und trägt ihre Herkunft;
//   3. die Kanäle (src/main/ipc/reminders.js) — Wegklicken wirkt im Bereich
//      der Erinnerung, zwei fast gleichzeitige Bearbeitungen wirken einmal, die
//      System-Benachrichtigung erscheint höchstens einmal und nur, wenn kein
//      Fenster im Vordergrund steht.
//   3b. (Befund der Abnahme vom 2026-09-24) die Bearbeitung einer Erinnerung,
//      deren Stand ungespeichert im Editor eines anderen Fensters liegt, geht an
//      dieses Fenster (reminders:edit);
//   4. (4T-001728) Wecker und Timer über dasselbe Register: Zustellung an alle
//      Fenster, Schlummern und Bestätigen bzw. der Anspruch des Timers wirken
//      einmal, Nachholen und einmalige Benachrichtigung.
//
// Datumswerte in 2020 (weit vergangen), nie der Kalendertag des Laufs.
import { describe, it, expect } from 'vitest';
import { createDueDelivery } from '../../src/main/checks/due-delivery.js';
import { createCheckers } from '../../src/main/checks/checkers.js';
import { registerRemindersIpc } from '../../src/main/ipc/reminders.js';

// --- Hilfen ------------------------------------------------------------------------

function registerMit(broadcasts, extra = {}) {
  return createDueDelivery({
    broadcast: (channel, payload) => broadcasts.push({ channel, payload }),
    dueChannel: 'reminders:due',
    handledChannel: 'reminders:handled',
    keyOf: (item) => item.key,
    active: extra.active || (() => true),
    stillOpen: extra.stillOpen || (() => true),
  });
}

const eintrag = (key, root = 'R') => ({ key, root, origin: 'Bereich', description: key });

// Fake-Umgebung der drei Prüfer: zwei Bereichs-Apps (A, B) und ein Store.
function pruefUmgebung({ disabled = [], zeilen } = {}) {
  const broadcasts = [];
  const apps = new Map([
    [1, { rootPath: 'C:/A', name: 'Projekte' }],
    [2, { rootPath: 'C:/B', name: 'Privat' }],
  ]);
  const appRegistry = {
    appIds: () => [...apps.keys()],
    getArea: (id) => apps.get(id) || null,
    findAppByArea(pred) {
      for (const [id, area] of apps) if (pred(area)) return id;
      return null;
    },
    windowsOf: () => [],
  };
  const store = {
    werte: { 'extensions.disabled': disabled },
    get(k) {
      return this.werte[k];
    },
    set(k, v) {
      this.werte[k] = v;
    },
  };
  const lines = zeilen || {
    'C:/A': [{ path: 'C:/A/a.md', zeile: 3, text: '- [ ] Rueckruf ⏰ 2020-01-01 08:00' }],
    'C:/B': [],
  };
  const backlinks = { areaTaskLines: (root) => (root in lines ? lines[root] : null) };
  const checkers = createCheckers({
    appRegistry,
    getStore: () => store,
    windows: new Map(),
    backlinks,
    broadcast: (channel, payload) => broadcasts.push({ channel, payload }),
  });
  return { ...checkers, broadcasts, apps, lines, store };
}

// Kanäle mit einer Fake-Registrierfunktion; aufrufen wie der Renderer.
function kanaele(deps) {
  const handler = new Map();
  registerRemindersIpc((kanal, fn) => handler.set(kanal, fn), {
    Notification: FakeNotification,
    senderWindow: () => null,
    areaRootForEvent: () => null,
    inDenVordergrund: () => {},
    windows: new Map(),
    alarmChecker: { snooze: () => true, confirm: () => {} },
    ...deps,
  });
  return (kanal, ...args) => handler.get(kanal)({ sender: { id: 1 } }, ...args);
}

class FakeNotification {
  static gezeigt = [];
  static isSupported() {
    return true;
  }
  constructor(opts) {
    this.opts = opts;
  }
  on() {}
  show() {
    FakeNotification.gezeigt.push(this.opts);
  }
}

// --- 1. Zustell-Register -----------------------------------------------------------

describe('Zustell-Register — Zustellung und erster Anspruch (4T-001727)', () => {
  it('verteilt eine Zustellung als EINE Meldung an alle Fenster', () => {
    const b = [];
    const reg = registerMit(b);
    reg.deliver({ catchUp: true, items: [eintrag('k1')] });
    expect(b).toEqual([
      { channel: 'reminders:due', payload: { catchUp: true, items: [eintrag('k1')] } },
    ]);
  });

  it('der erste Anspruch gewinnt und räumt die Meldung in allen Fenstern, der zweite läuft ins Leere', () => {
    const b = [];
    const reg = registerMit(b);
    reg.deliver({ items: [eintrag('k1')] });
    b.length = 0;
    // Zwei fast gleichzeitige Bearbeitungen aus zwei Fenstern: Der Hauptprozess
    // führt sie nacheinander aus, die zweite findet die Meldung bearbeitet vor.
    expect(reg.claim(['k1'])).toEqual(['k1']);
    expect(reg.claim(['k1'])).toEqual([]);
    // Genau EINE Räum-Meldung, keine für den verweigerten Anspruch.
    expect(b).toEqual([{ channel: 'reminders:handled', payload: { keys: ['k1'] } }]);
  });

  it('ein nie zugestellter Schlüssel ist frei und erzeugt keine Räum-Meldung', () => {
    const b = [];
    const reg = registerMit(b);
    expect(reg.claim('frei')).toEqual(['frei']);
    expect(b).toHaveLength(0);
  });

  it('eine erneute Zustellung macht die Meldung wieder beanspruchbar', () => {
    const reg = registerMit([]);
    reg.deliver({ items: [eintrag('k1')] });
    reg.claim(['k1']);
    reg.deliver({ items: [eintrag('k1')] });
    expect(reg.claim(['k1'])).toEqual(['k1']);
  });

  it('gemischter Anspruch: gewährt wird nur, was noch offen oder frei ist', () => {
    const reg = registerMit([]);
    reg.deliver({ items: [eintrag('a'), eintrag('b')] });
    reg.claim(['a']);
    expect(reg.claim(['a', 'b', 'c', 'b', 7, ''])).toEqual(['b', 'c']);
  });
});

describe('Zustell-Register — Rückgabe, Nachholen, Benachrichtigung (4T-001727)', () => {
  it('release liefert den Eintrag nur für einen aus einer offenen Meldung gewährten Anspruch', () => {
    const reg = registerMit([]);
    reg.deliver({ items: [eintrag('k1')] });
    expect(reg.release('k1')).toBeNull();
    reg.claim(['k1']);
    expect(reg.release('k1')).toEqual(eintrag('k1'));
    // Nach der Rückgabe ist der Schlüssel wieder frei, nicht mehr bearbeitet.
    expect(reg.release('k1')).toBeNull();
    expect(reg.claim(['k1'])).toEqual(['k1']);
    // Ein freier Anspruch (nie zugestellt) gibt nichts zurück.
    reg.claim(['frei']);
    expect(reg.release('frei')).toBeNull();
  });

  it('openItems liefert die offenen Meldungen samt Nachhol-Kennung, eine bearbeitete nicht', () => {
    const reg = registerMit([]);
    reg.deliver({ catchUp: true, items: [eintrag('a')] });
    reg.deliver({ catchUp: false, items: [eintrag('b')] });
    reg.claim(['a']);
    expect(reg.openItems()).toEqual({ catchUp: false, items: [eintrag('b')] });
    reg.deliver({ catchUp: true, items: [eintrag('c')] });
    expect(reg.openItems().catchUp).toBe(true);
  });

  it('openItems verwirft nicht mehr gültige Meldungen und liefert bei abgeschalteter Erweiterung nichts', () => {
    let aktiv = true;
    const reg = registerMit([], {
      active: () => aktiv,
      stillOpen: (item) => item.key !== 'weg',
    });
    reg.deliver({ items: [eintrag('weg'), eintrag('da')] });
    expect(reg.openItems().items.map((i) => i.key)).toEqual(['da']);
    aktiv = false;
    expect(reg.openItems()).toEqual({ catchUp: false, items: [] });
  });

  it('claimNotification gewährt je Meldung genau einmal und nur für offene Meldungen', () => {
    const reg = registerMit([]);
    reg.deliver({ items: [eintrag('a'), eintrag('b')] });
    expect(reg.claimNotification(['a', 'b'])).toBe(true);
    // Das zweite und dritte Fenster fordern dieselben Meldungen an.
    expect(reg.claimNotification(['a', 'b'])).toBe(false);
    expect(reg.claimNotification(['a'])).toBe(false);
    // Bearbeitet: keine Benachrichtigung mehr.
    reg.deliver({ items: [eintrag('c')] });
    reg.claim(['c']);
    expect(reg.claimNotification(['c'])).toBe(false);
    // Erneut zugestellt: wieder genau einmal.
    reg.deliver({ items: [eintrag('a')] });
    expect(reg.claimNotification(['a'])).toBe(true);
    expect(reg.claimNotification(['a'])).toBe(false);
  });

  it('bricht laut bei fehlenden Pflicht-Bezügen', () => {
    expect(() => createDueDelivery({ broadcast: () => {} })).toThrow(TypeError);
  });
});

// --- 2. Verdrahtung der Erinnerungen -----------------------------------------------

describe('Erinnerungs-Zustellung — an alle Fenster mit Herkunft (4T-001727)', () => {
  it('die fällige Erinnerung geht als Broadcast hinaus und nennt Bereichs-Wurzel und Namen', () => {
    const u = pruefUmgebung();
    u.reminderChecker.tick();
    const due = u.broadcasts.filter((m) => m.channel === 'reminders:due');
    expect(due).toHaveLength(1);
    expect(due[0].payload.catchUp).toBe(true);
    expect(due[0].payload.items).toHaveLength(1);
    expect(due[0].payload.items[0]).toMatchObject({ root: 'C:/A', origin: 'Projekte' });
    // Auch die Listen-Aktualisierung geht an alle Fenster.
    expect(u.broadcasts.some((m) => m.channel === 'reminders:changed')).toBe(true);
  });

  it('zwei Bereiche mit je einer fälligen Erinnerung: je Bereich eine Zustellung mit eigener Herkunft', () => {
    const u = pruefUmgebung({
      zeilen: {
        'C:/A': [{ path: 'C:/A/a.md', zeile: 1, text: '- [ ] Eins ⏰ 2020-01-01 08:00' }],
        'C:/B': [{ path: 'C:/B/b.md', zeile: 1, text: '- [ ] Zwei ⏰ 2020-01-02 08:00' }],
      },
    });
    u.reminderChecker.tick();
    const herkunft = u.broadcasts
      .filter((m) => m.channel === 'reminders:due')
      .flatMap((m) => m.payload.items.map((i) => i.origin));
    expect(herkunft.sort()).toEqual(['Privat', 'Projekte']);
    expect(
      u.reminderDelivery
        .openItems()
        .items.map((i) => i.origin)
        .sort(),
    ).toEqual(['Privat', 'Projekte']);
  });

  it('bei abgeschalteter Erweiterung «Erinnerungen» geht nichts hinaus, und nachgeholt wird nichts', () => {
    const u = pruefUmgebung({ disabled: ['reminders'] });
    u.reminderChecker.tick();
    expect(u.broadcasts.filter((m) => m.channel === 'reminders:due')).toHaveLength(0);
    expect(u.reminderDelivery.openItems().items).toEqual([]);
  });

  it('Nachholen: eine inzwischen anders erledigte Erinnerung fällt heraus, bei geschlossenem Bereich bleibt sie stehen', () => {
    const u = pruefUmgebung();
    u.reminderChecker.tick();
    expect(u.reminderDelivery.openItems().items).toHaveLength(1);
    // Die Aufgabe wurde im Editor erledigt: Der Anker ist nicht mehr fällig.
    u.lines['C:/A'] = [{ path: 'C:/A/a.md', zeile: 3, text: '- [x] Rueckruf ⏰ 2020-01-01 08:00' }];
    expect(u.reminderDelivery.openItems().items).toHaveLength(0);

    // Zweiter Durchgang: Das letzte Fenster des Bereichs ist geschlossen, der
    // Index nicht mehr bereit (E14) — die Meldung bleibt stehen.
    const v = pruefUmgebung();
    v.reminderChecker.tick();
    delete v.lines['C:/A'];
    v.apps.delete(1);
    expect(v.reminderDelivery.openItems().items).toHaveLength(1);
  });
});

// --- 3. Kanäle --------------------------------------------------------------------

describe('Erinnerungs-Kanäle — Bearbeitung wirkt einmal im Herkunfts-Bereich (4T-001727)', () => {
  it('zwei fast gleichzeitige Ansprüche: der erste gewährt, der zweite ohne Fehler verweigert', async () => {
    const u = pruefUmgebung();
    u.reminderChecker.tick();
    const key = u.reminderDelivery.openItems().items[0].key;
    const rufe = kanaele({
      reminderChecker: u.reminderChecker,
      reminderDelivery: u.reminderDelivery,
    });
    const [erste, zweite] = await Promise.all([
      rufe('reminders:claim', { root: 'C:/A', key }),
      rufe('reminders:claim', { root: 'C:/A', key }),
    ]);
    expect(erste).toEqual({ granted: true });
    expect(zweite).toEqual({ granted: false });
    expect(u.broadcasts.filter((m) => m.channel === 'reminders:handled')).toHaveLength(1);
  });

  it('Wegklicken aus einem Fenster ohne Bereich stummt im Bereich der Erinnerung', async () => {
    const u = pruefUmgebung();
    u.reminderChecker.tick();
    const key = u.reminderDelivery.openItems().items[0].key;
    // areaRootForEvent liefert null: das bearbeitende Fenster hat keinen Bereich.
    const rufe = kanaele({
      reminderChecker: u.reminderChecker,
      reminderDelivery: u.reminderDelivery,
    });
    await rufe('reminders:mute', [{ root: 'C:/A', key }]);
    expect(u.reminderChecker.list('C:/A').items[0].muted).toBe(true);
    expect(u.broadcasts.filter((m) => m.channel === 'reminders:handled')).toEqual([
      { channel: 'reminders:handled', payload: { keys: [key] } },
    ]);
    // Ein zweites Wegklicken derselben Meldung aus einem anderen Fenster läuft
    // ins Leere: keine zweite Räum-Meldung.
    await rufe('reminders:mute', [{ root: 'C:/A', key }]);
    expect(u.broadcasts.filter((m) => m.channel === 'reminders:handled')).toHaveLength(1);
  });

  it('Wegklicken nach Erledigen in einem anderen Fenster stummt nichts (erste Bearbeitung gewinnt)', async () => {
    const u = pruefUmgebung();
    u.reminderChecker.tick();
    const key = u.reminderDelivery.openItems().items[0].key;
    const rufe = kanaele({
      reminderChecker: u.reminderChecker,
      reminderDelivery: u.reminderDelivery,
    });
    await rufe('reminders:claim', { root: 'C:/A', key });
    await rufe('reminders:mute', [{ root: 'C:/A', key }]);
    expect(u.reminderChecker.list('C:/A').items[0].muted).toBe(false);
  });

  it('die bisherige Form (reine Schlüssel) stummt weiter im Bereich des Fensters', async () => {
    const u = pruefUmgebung();
    const key = u.reminderChecker.list('C:/A').items[0].key;
    const rufe = kanaele({
      reminderChecker: u.reminderChecker,
      reminderDelivery: u.reminderDelivery,
      areaRootForEvent: () => 'C:/A',
    });
    await rufe('reminders:mute', [key]);
    expect(u.reminderChecker.list('C:/A').items[0].muted).toBe(true);
  });

  it('release nach gescheitertem Schreiben stellt die Erinnerung allen Fenstern erneut zu', async () => {
    const u = pruefUmgebung();
    u.reminderChecker.tick();
    const key = u.reminderDelivery.openItems().items[0].key;
    const rufe = kanaele({
      reminderChecker: u.reminderChecker,
      reminderDelivery: u.reminderDelivery,
    });
    await rufe('reminders:claim', { root: 'C:/A', key });
    u.broadcasts.length = 0;
    expect(await rufe('reminders:release', { root: 'C:/A', key })).toEqual({ released: true });
    const due = u.broadcasts.filter((m) => m.channel === 'reminders:due');
    expect(due).toHaveLength(1);
    expect(due[0].payload.items[0].key).toBe(key);
    // Ein Rückgabe-Versuch ohne gewährten Anspruch bewirkt nichts.
    expect(await rufe('reminders:release', { key: 'unbekannt' })).toEqual({ released: false });
  });

  it('reminders:open liefert den offenen Stand für ein spät geöffnetes Fenster', async () => {
    const u = pruefUmgebung();
    u.reminderChecker.tick();
    const rufe = kanaele({
      reminderChecker: u.reminderChecker,
      reminderDelivery: u.reminderDelivery,
    });
    const stand = await rufe('reminders:open');
    expect(stand.catchUp).toBe(true);
    expect(stand.items).toHaveLength(1);
    await rufe('reminders:claim', { root: 'C:/A', key: stand.items[0].key });
    expect((await rufe('reminders:open')).items).toHaveLength(0);
  });

  it('System-Benachrichtigung: genau einmal je Meldung und nur ohne Fenster im Vordergrund', async () => {
    const u = pruefUmgebung();
    u.reminderChecker.tick();
    const key = u.reminderDelivery.openItems().items[0].key;
    const fenster = new Map([
      [1, { isDestroyed: () => false, isFocused: () => false }],
      [2, { isDestroyed: () => false, isFocused: () => false }],
    ]);
    const rufe = kanaele({
      reminderChecker: u.reminderChecker,
      reminderDelivery: u.reminderDelivery,
      windows: fenster,
    });
    FakeNotification.gezeigt = [];
    const anfrage = { title: 'Erinnerungen', body: 'Rueckruf', keys: [key] };
    // Drei Fenster fordern an: gezeigt wird eine.
    expect(await rufe('reminders:systemNotify', anfrage)).toBe(true);
    expect(await rufe('reminders:systemNotify', anfrage)).toBe(false);
    expect(await rufe('reminders:systemNotify', anfrage)).toBe(false);
    expect(FakeNotification.gezeigt).toHaveLength(1);

    // Steht ein Fenster im Vordergrund, zeigt dort der Dialog die Meldung.
    const v = pruefUmgebung();
    v.reminderChecker.tick();
    const key2 = v.reminderDelivery.openItems().items[0].key;
    const vorn = new Map([[1, { isDestroyed: () => false, isFocused: () => true }]]);
    const rufe2 = kanaele({
      reminderChecker: v.reminderChecker,
      reminderDelivery: v.reminderDelivery,
      windows: vorn,
    });
    FakeNotification.gezeigt = [];
    expect(await rufe2('reminders:systemNotify', { ...anfrage, keys: [key2] })).toBe(false);
    expect(FakeNotification.gezeigt).toHaveLength(0);
  });
});

// --- 3b. Datei-Link im Fenster des Herkunfts-Bereichs (4T-001727) ----------------------

// Fake-Welt: App 1 zeigt Bereich A in den Fenstern 10 und 11 (zuletzt aktiv 11),
// App 2 zeigt Bereich B im Fenster 20, App 9 ist ohne Bereich (Fenster 90).
function linkWelt({ laufend = true, buchOk = false, buecherAus = false } = {}) {
  const apps = new Map([
    [2, { area: { rootPath: 'C:/B' }, fenster: [20] }],
    [9, { area: null, fenster: [90] }],
  ]);
  if (laufend) apps.set(1, { area: { rootPath: 'C:/A' }, fenster: [10, 11] });
  const fenster = new Map();
  const fensterAuf = (id) => fenster.set(id, { id, isDestroyed: () => false, webContents: { id } });
  for (const app of apps.values()) app.fenster.forEach(fensterAuf);
  const w = { vorn: [], gesendet: [], geoeffnet: [] };
  const oeffne = (art, ok) => async (root, sender) => {
    w.geoeffnet.push({ art, root, sender: sender && sender.id });
    if (!ok) return { ok: false, error: 'no-book' };
    apps.set(3, { area: { rootPath: root }, fenster: [30] });
    fensterAuf(30);
    return { ok: true, createdNew: true };
  };
  const rufe = (senderId, payload) =>
    kanaele({
      senderWindow: () => fenster.get(senderId),
      windows: fenster,
      inDenVordergrund: (win) => w.vorn.push(win.id),
      appRegistry: {
        findAppByArea(pred) {
          for (const [id, app] of apps) if (app.area && pred(app.area)) return id;
          return null;
        },
        windowsOf: (appId) => (apps.get(appId) ? apps.get(appId).fenster : []),
        appOf(winId) {
          for (const [id, app] of apps) if (app.fenster.includes(winId)) return id;
          return null;
        },
      },
      appLastFocused: new Map([[1, 11]]),
      sendWhenLoaded: (win, kanal, ziel) => w.gesendet.push({ fenster: win.id, kanal, ziel }),
      openAreaPath: oeffne('bereich', true),
      openBookApp: oeffne('buch', buchOk),
      openShelfApp: oeffne('regal', false),
      getStore: () => ({ get: () => (buecherAus ? ['books'] : []) }),
    })('reminders:openSource', payload);
  return { w, rufe };
}

const quelle = { root: 'C:/A', path: 'C:/A/sub/aufgaben.md', line: 4 };

describe('Datei-Link — öffnet im Fenster des Herkunfts-Bereichs (4T-001727)', () => {
  it('aus dem Fenster eines fremden Bereichs: das zuletzt aktive Fenster des Herkunfts-Bereichs kommt nach vorn und öffnet', async () => {
    const { w, rufe } = linkWelt();
    expect(await rufe(20, quelle)).toEqual({ ok: true, hier: false });
    expect(w.vorn).toEqual([11]);
    expect(w.gesendet).toEqual([
      {
        fenster: 11,
        kanal: 'reminders:openSource',
        ziel: { path: 'C:/A/sub/aufgaben.md', line: 4 },
      },
    ]);
    expect(w.geoeffnet).toEqual([]);
  });

  it('aus dem Fenster ohne Bereich ebenso', async () => {
    const { w, rufe } = linkWelt();
    expect(await rufe(90, quelle)).toEqual({ ok: true, hier: false });
    expect(w.gesendet.map((g) => g.fenster)).toEqual([11]);
  });

  it('im Fenster des Herkunfts-Bereichs selbst: öffnet dort wie bisher, nichts wird gesendet', async () => {
    const { w, rufe } = linkWelt();
    expect(await rufe(10, quelle)).toEqual({ ok: true, hier: true });
    expect(w.vorn).toEqual([]);
    expect(w.gesendet).toEqual([]);
  });

  it('läuft der Bereich nicht, wird er über den bestehenden Weg geöffnet und die Datei darin', async () => {
    const { w, rufe } = linkWelt({ laufend: false });
    expect(await rufe(20, quelle)).toEqual({ ok: true, hier: false });
    // Buch und Regal lehnen den gewöhnlichen Ordner ab; es bleibt der Bereich.
    expect(w.geoeffnet.map((g) => g.art)).toEqual(['buch', 'regal', 'bereich']);
    expect(w.geoeffnet[2]).toEqual({ art: 'bereich', root: 'C:/A', sender: 20 });
    expect(w.gesendet).toEqual([
      {
        fenster: 30,
        kanal: 'reminders:openSource',
        ziel: { path: 'C:/A/sub/aufgaben.md', line: 4 },
      },
    ]);
  });

  it('ein geschlossenes Buch öffnet als Buch; bei abgeschalteten Büchern gleich als Bereich', async () => {
    const buch = linkWelt({ laufend: false, buchOk: true });
    await buch.rufe(20, quelle);
    expect(buch.w.geoeffnet.map((g) => g.art)).toEqual(['buch']);
    const aus = linkWelt({ laufend: false, buecherAus: true });
    await aus.rufe(20, quelle);
    expect(aus.w.geoeffnet.map((g) => g.art)).toEqual(['bereich']);
  });

  it('eine Datei außerhalb der Herkunft wird nicht geöffnet', async () => {
    const { w, rufe } = linkWelt();
    expect(await rufe(20, { root: 'C:/A', path: 'C:/B/fremd.md', line: 1 })).toEqual({
      ok: false,
    });
    expect(await rufe(20, null)).toEqual({ ok: false });
    expect(w.gesendet).toEqual([]);
    expect(w.geoeffnet).toEqual([]);
  });
});

// --- 3b. Bearbeitung im Fenster mit dem ungespeicherten Stand (Befund 2026-09-24) ----
//
// Der Prüfer liest den ungespeicherten Stand geöffneter Dateien mit. Stammt die
// Erinnerung aus dem Editor eines anderen Fensters, geht der Auftrag dorthin;
// das klickende Fenster schriebe sonst auf die Platte, wo die Zeile so nicht
// steht («Zeile nicht mehr gefunden»).

function pufferWelt({ besitzer = null, zerstoert = false } = {}) {
  const gesendet = [];
  const fenster = (id) => ({
    isDestroyed: () => zerstoert,
    webContents: { id, send: (kanal, daten) => gesendet.push({ an: id, kanal, daten }) },
  });
  const rufe = kanaele({
    windows: new Map([
      [1, fenster(1)],
      [7, fenster(7)],
    ]),
    backlinks: { bufferOwnerFor: (p) => (p === 'C:/A/a.md' ? besitzer : null) },
  });
  return { gesendet, rufe };
}

const pufferItem = {
  key: 'C:/A/a.md|- [ ] Newsletter ⏰ 2020-01-01 08:00',
  root: 'C:/A',
  path: 'C:/A/a.md',
  line: 19,
  taskText: '- [ ] Newsletter ⏰ 2020-01-01 08:00',
};

describe('Erinnerungs-Kanäle — Bearbeitung dort, wo der ungespeicherte Stand liegt (4T-001727)', () => {
  it('liegt der Stand im Editor eines anderen Fensters, bekommt dieses den Auftrag', async () => {
    const { gesendet, rufe } = pufferWelt({ besitzer: 7 });
    const aufschub = { art: 'aufschub', wert: { date: '2020-01-02', time: '09:00' } };
    expect(await rufe('reminders:edit', { item: pufferItem, bearbeitung: aufschub })).toEqual({
      delegiert: true,
    });
    expect(gesendet).toEqual([
      { an: 7, kanal: 'reminders:edit', daten: { item: pufferItem, bearbeitung: aufschub } },
    ]);
  });

  it('liegt er beim klickenden Fenster selbst oder gar nicht vor, schreibt das klickende Fenster', async () => {
    for (const besitzer of [1, null]) {
      const { gesendet, rufe } = pufferWelt({ besitzer });
      const auftrag = { item: pufferItem, bearbeitung: { art: 'erledigt' } };
      expect(await rufe('reminders:edit', auftrag)).toEqual({ delegiert: false });
      expect(gesendet).toEqual([]);
    }
  });

  it('ist das Fenster des Stands nicht mehr da, schreibt das klickende Fenster', async () => {
    const weg = pufferWelt({ besitzer: 12 });
    const auftrag = { item: pufferItem, bearbeitung: { art: 'erledigt' } };
    expect(await weg.rufe('reminders:edit', auftrag)).toEqual({ delegiert: false });
    const zu = pufferWelt({ besitzer: 7, zerstoert: true });
    expect(await zu.rufe('reminders:edit', auftrag)).toEqual({ delegiert: false });
    expect([...weg.gesendet, ...zu.gesendet]).toEqual([]);
  });

  it('unvollständige oder unbekannte Aufträge werden nicht weitergegeben', async () => {
    const { gesendet, rufe } = pufferWelt({ besitzer: 7 });
    expect(await rufe('reminders:edit', null)).toEqual({ delegiert: false });
    expect(await rufe('reminders:edit', { item: { key: 'x' } })).toEqual({ delegiert: false });
    expect(
      await rufe('reminders:edit', { item: pufferItem, bearbeitung: { art: 'loeschen' } }),
    ).toEqual({ delegiert: false });
    expect(gesendet).toEqual([]);
  });
});

// --- 4. Wecker und Timer (4T-001728) --------------------------------------------------

const WECKER = {
  id: 'a1',
  time: '07:30',
  label: 'Aufstehen',
  enabled: true,
  repeat: 'daily',
  days: [],
};
const weckerMeldung = { key: 'a1|2020-01-01', id: 'a1', time: '07:30', label: 'Aufstehen' };

function uhrKanaele(u, extra = {}) {
  return kanaele({
    reminderChecker: u.reminderChecker,
    reminderDelivery: u.reminderDelivery,
    alarmChecker: u.alarmChecker,
    alarmDelivery: u.alarmDelivery,
    timerDelivery: u.timerDelivery,
    ...extra,
  });
}

describe('Wecker — Meldung in allen Fenstern, einmal bearbeitet (4T-001728)', () => {
  it('die Meldung geht als Broadcast an alle Fenster, ohne Herkunfts-Angabe', () => {
    const u = pruefUmgebung();
    u.alarmDelivery.deliver({ items: [weckerMeldung] });
    const due = u.broadcasts.filter((m) => m.channel === 'alarm:due');
    expect(due).toHaveLength(1);
    expect(due[0].payload.items[0]).not.toHaveProperty('origin');
  });

  it('Schlummern gewinnt gegen ein fast gleichzeitiges Bestätigen aus einem anderen Fenster', async () => {
    const u = pruefUmgebung();
    u.store.set('clock.alarms', [WECKER]);
    u.alarmDelivery.deliver({ items: [weckerMeldung] });
    const rufe = uhrKanaele(u);
    const [schlummern, bestaetigen] = await Promise.all([
      rufe('alarm:snooze', { key: weckerMeldung.key, minutes: 5 }),
      rufe('alarm:confirm', { key: weckerMeldung.key }),
    ]);
    expect(schlummern).toBe(true);
    expect(bestaetigen).toBeUndefined();
    // Das zweite Fenster hat den Schlummer-Termin NICHT gelöscht.
    expect(u.alarmChecker.state().snoozed.has(weckerMeldung.key)).toBe(true);
    expect(u.broadcasts.filter((m) => m.channel === 'alarm:handled')).toEqual([
      { channel: 'alarm:handled', payload: { keys: [weckerMeldung.key] } },
    ]);
    // Ein zweites Schlummern derselben Meldung schlummert nicht erneut.
    expect(await rufe('alarm:snooze', { key: weckerMeldung.key, minutes: 5 })).toBe(false);
  });

  it('Nachholen: offene Meldung ja, bearbeitete nein, gelöschter Wecker nein, Uhr aus nichts', async () => {
    const u = pruefUmgebung();
    u.store.set('clock.alarms', [WECKER]);
    u.alarmDelivery.deliver({ items: [weckerMeldung] });
    const rufe = uhrKanaele(u);
    expect((await rufe('alarm:open')).items).toEqual([weckerMeldung]);
    // Ein einmaliger Wecker schaltet sich nach dem Auslösen ab und bleibt offen.
    u.store.set('clock.alarms', [{ ...WECKER, enabled: false }]);
    expect((await rufe('alarm:open')).items).toHaveLength(1);
    u.store.set('extensions.disabled', ['clock']);
    expect((await rufe('alarm:open')).items).toHaveLength(0);
    u.store.set('extensions.disabled', []);
    u.store.set('clock.alarms', []);
    expect((await rufe('alarm:open')).items).toHaveLength(0);
  });
});

describe('Timer — Meldung in allen Fenstern, einmal bearbeitet (4T-001728)', () => {
  it('ein abgelaufener Timer geht über das Register an alle Fenster', () => {
    const u = pruefUmgebung();
    const vorZehnMinuten = Date.now() - 10 * 60000;
    u.store.set('clock.timers', [
      { id: 't1', label: 'Tee', durationMs: 60000, state: 'running', startedAt: vorZehnMinuten },
    ]);
    u.timerChecker.fire();
    const due = u.broadcasts.filter((m) => m.channel === 'timer:due');
    expect(due).toHaveLength(1);
    expect(due[0].payload.items[0]).toMatchObject({ id: 't1', label: 'Tee' });
    expect(u.timerDelivery.openItems().items.map((i) => i.id)).toEqual(['t1']);
  });

  it('zwei fast gleichzeitige Ansprüche: der erste erhält den Timer, der zweite nichts', async () => {
    const u = pruefUmgebung();
    u.store.set('clock.timers', [{ id: 't1', durationMs: 60000, state: 'expired' }]);
    u.timerDelivery.deliver({ items: [{ id: 't1', label: '', durationMs: 60000 }] });
    const rufe = uhrKanaele(u);
    const [erste, zweite] = await Promise.all([
      rufe('timer:claim', ['t1']),
      rufe('timer:claim', ['t1']),
    ]);
    expect(erste).toEqual({ granted: ['t1'] });
    expect(zweite).toEqual({ granted: [] });
    expect(u.broadcasts.filter((m) => m.channel === 'timer:handled')).toHaveLength(1);
    expect((await rufe('timer:open')).items).toHaveLength(0);
  });

  it('Nachholen nur, solange der Timer abgelaufen und unbearbeitet ist', async () => {
    const u = pruefUmgebung();
    u.store.set('clock.timers', [{ id: 't1', durationMs: 60000, state: 'expired' }]);
    u.timerDelivery.deliver({ items: [{ id: 't1', label: '', durationMs: 60000 }] });
    const rufe = uhrKanaele(u);
    expect((await rufe('timer:open')).items).toHaveLength(1);
    // Im Panel eines Fensters neu gestartet: keine offene Meldung mehr.
    u.store.set('clock.timers', [{ id: 't1', durationMs: 60000, state: 'idle' }]);
    expect((await rufe('timer:open')).items).toHaveLength(0);
  });
});

describe('Uhr-Meldungen — System-Benachrichtigung einmal je Meldung (4T-001728)', () => {
  it('Wecker und Timer: je Meldung eine, unbekannte Art keine, ohne Meldungs-Angabe wie bisher', async () => {
    const u = pruefUmgebung();
    u.store.set('clock.timers', [{ id: 't1', durationMs: 60000, state: 'expired' }]);
    u.alarmDelivery.deliver({ items: [weckerMeldung] });
    u.timerDelivery.deliver({ items: [{ id: 't1', label: '', durationMs: 60000 }] });
    const rufe = uhrKanaele(u);
    FakeNotification.gezeigt = [];
    const wecker = {
      title: 'Wecker',
      body: '07:30',
      meldung: { art: 'alarm', keys: [weckerMeldung.key] },
    };
    expect(await rufe('notify:system', wecker)).toBe(true);
    expect(await rufe('notify:system', wecker)).toBe(false);
    const timer = { title: 'Timer', body: 'Tee', meldung: { art: 'timer', keys: ['t1'] } };
    expect(await rufe('notify:system', timer)).toBe(true);
    expect(await rufe('notify:system', timer)).toBe(false);
    expect(
      await rufe('notify:system', { title: 'x', meldung: { art: 'fremd', keys: ['t1'] } }),
    ).toBe(false);
    expect(await rufe('notify:system', { title: 'Ohne', body: '' })).toBe(true);
    expect(FakeNotification.gezeigt.map((n) => n.title)).toEqual(['Wecker', 'Timer', 'Ohne']);
  });

  it('steht ein Fenster im Vordergrund, erscheint keine', async () => {
    const u = pruefUmgebung();
    u.alarmDelivery.deliver({ items: [weckerMeldung] });
    const vorn = new Map([[1, { isDestroyed: () => false, isFocused: () => true }]]);
    const rufe = uhrKanaele(u, { windows: vorn });
    FakeNotification.gezeigt = [];
    const wecker = { title: 'Wecker', meldung: { art: 'alarm', keys: [weckerMeldung.key] } };
    expect(await rufe('notify:system', wecker)).toBe(false);
    expect(FakeNotification.gezeigt).toHaveLength(0);
  });
});
