// 4T-002423 (Epic 3E-000366, Entscheidung 2f, Story 4S-001134): Die Art
// `workflow` am Kanal `notify:system` (src/main/ipc/reminders.js).
//
// Ein Lauf nach Zeitplan fordert für `notify` und für einen Fehlschlag eine
// Benachrichtigung des Betriebssystems an. Der Kanal wendet seine Regel an:
// keine, solange ein Fenster der Anwendung den Fokus hat (AK4 der Story), je
// Meldung höchstens eine, und im Aus-Zustand der Erweiterung `workflows` keine
// (AK5 des Tasks). Muster `meldungen-alle-fenster.test.js`: Kanäle mit einer
// Fake-Registrierfunktion und einer Attrappe der Benachrichtigungs-Klasse.
import { describe, it, expect, beforeEach } from 'vitest';
import { registerRemindersIpc } from '../../src/main/ipc/reminders.js';

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

const fenster = (fokus) => ({ isDestroyed: () => false, isFocused: () => fokus });

function kanaele({ fokus = false, aus = [] } = {}) {
  const handler = new Map();
  const leer = { claimNotification: () => false, claim: () => [], openItems: () => ({}) };
  registerRemindersIpc((kanal, fn) => handler.set(kanal, fn), {
    Notification: FakeNotification,
    senderWindow: () => null,
    areaRootForEvent: () => null,
    inDenVordergrund: () => {},
    windows: new Map([
      [1, fenster(false)],
      [2, fenster(fokus)],
    ]),
    alarmChecker: { snooze: () => true, confirm: () => {} },
    reminderDelivery: leer,
    alarmDelivery: leer,
    timerDelivery: leer,
    getStore: () => ({ get: (k) => (k === 'extensions.disabled' ? aus : undefined) }),
  });
  return (kanal, absender, ...args) => handler.get(kanal)({ sender: { id: absender } }, ...args);
}

const meldung = (key, body = 'Angelegt') => ({
  title: 'Wochenrückblick',
  body,
  meldung: { art: 'workflow', keys: [key] },
});

beforeEach(() => {
  FakeNotification.gezeigt = [];
});

describe('notify:system — Art workflow (4T-002423)', () => {
  it('ohne Fokus erscheint die Benachrichtigung mit Titel und Text', async () => {
    const rufe = kanaele();
    expect(await rufe('notify:system', 1, meldung('k1'))).toBe(true);
    expect(FakeNotification.gezeigt).toEqual([{ title: 'Wochenrückblick', body: 'Angelegt' }]);
  });

  it('hat ein Fenster der Anwendung den Fokus, erscheint keine (AK4 der Story)', async () => {
    const rufe = kanaele({ fokus: true });
    expect(await rufe('notify:system', 1, meldung('k1'))).toBe(false);
    expect(FakeNotification.gezeigt).toHaveLength(0);
  });

  it('je Meldung höchstens eine; eine weitere Meldung desselben Laufs erscheint', async () => {
    const rufe = kanaele();
    expect(await rufe('notify:system', 1, meldung('k1'))).toBe(true);
    expect(await rufe('notify:system', 1, meldung('k1'))).toBe(false);
    expect(await rufe('notify:system', 1, meldung('k2', 'Zweitens'))).toBe(true);
    // Derselbe Schlüssel aus einem anderen Fenster ist eine andere Meldung.
    expect(await rufe('notify:system', 2, meldung('k1'))).toBe(true);
    expect(FakeNotification.gezeigt.map((n) => n.body)).toEqual([
      'Angelegt',
      'Zweitens',
      'Angelegt',
    ]);
  });

  it('ohne Schlüssel erscheint nichts', async () => {
    const rufe = kanaele();
    const ohne = { title: 'x', body: 'y', meldung: { art: 'workflow' } };
    expect(await rufe('notify:system', 1, ohne)).toBe(false);
    expect(FakeNotification.gezeigt).toHaveLength(0);
  });

  it('im Aus-Zustand der Erweiterung erscheint keine (AK5 des Tasks)', async () => {
    const rufe = kanaele({ aus: ['workflows'] });
    expect(await rufe('notify:system', 1, meldung('k1'))).toBe(false);
    expect(FakeNotification.gezeigt).toHaveLength(0);
  });

  it('die übrigen Arten bleiben unberührt: ohne Meldungs-Angabe wie bisher', async () => {
    const rufe = kanaele({ aus: ['workflows'] });
    expect(await rufe('notify:system', 1, { title: 'Ohne', body: '' })).toBe(true);
    expect(FakeNotification.gezeigt.map((n) => n.title)).toEqual(['Ohne']);
  });
});
