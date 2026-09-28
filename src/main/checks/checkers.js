// Aufbau der drei Pruefer des Main-Prozesses: Erinnerungen (30-Sekunden-Takt
// auf dem Bereichs-Index), Wecker (30-Sekunden-Takt auf der app-weiten
// Wecker-Liste) und Timer (gezielter Weckruf auf den naechsten Ablauf). Die
// Pruef-Kerne selbst liegen in den Nachbar-Modulen dieses Ordners; hier
// entsteht ihre Umgebung — Suchraum, Gates, Zustellung und Rueckschreiben.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Rolle: Aufbau-Funktion ohne
// Lade-Zeit-Seiteneffekte; der Takt startet erst mit dem Start-Ablauf.
'use strict';

const path = require('node:path');
const { createReminderChecker } = require('./reminder-check.js');
const { createDueDelivery } = require('./due-delivery.js');
const { normalizeRemindersConfig } = require('../../shared/reminders.js');
const { createAlarmChecker } = require('./alarm-check.js');
const {
  CLOCK_ALARMS_KEY,
  disableFiredOnceAlarms,
  normalizeAlarms,
} = require('../../shared/clock/clock-alarms.js');
const { createTimerChecker } = require('./timer-check.js');
const { CLOCK_TIMERS_KEY, normalizeTimers } = require('../../shared/clock/clock-timers.js');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { createTaskStatusTypeResolver } = require('../../shared/markdown/plugins.js');

/**
 * Baut die drei Pruefer auf.
 *
 * @param {object} deps Bezuege aus der Verdrahtung.
 * @param {object} deps.appRegistry Registry der logischen Applikationen.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (entsteht erst beim Start).
 * @param {object} deps.backlinks Bereichs-Index (Aufgaben-Zeilen des Suchraums).
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @returns {object} Die drei Prüfer (reminderChecker, alarmChecker, timerChecker) und ihre
 *   Zustell-Register (reminderDelivery, alarmDelivery, timerDelivery).
 */
function createCheckers(deps) {
  const { appRegistry, getStore, backlinks, broadcast } = deps;
  // 4T-000525 (Epic 3E-000095): Erinnerungs-Pruefer. Die Umgebung wird pro Lauf
  // frisch aus dem Store gebaut (Muster frontmatterQuery:run) — Einstellungs-
  // und Erweiterungs-Aenderungen wirken ohne eigenen Listener sofort.
  // Doppel-Gate tasks UND reminders: robust unabhaengig davon, ob die
  // Erweiterungs-Registrierung (4T-000528) schon ausgeliefert ist.
  const reminderChecker = createReminderChecker({
    areas() {
      const roots = new Set();
      for (const appId of appRegistry.appIds()) {
        const area = appRegistry.getArea(appId);
        if (area && area.rootPath) roots.add(area.rootPath);
      }
      return [...roots].map((root) => ({ root }));
    },
    taskLines: (root) => backlinks.areaTaskLines(root),
    buildEnv() {
      const store = getStore();
      const disabled = store ? store.get('extensions.disabled') : [];
      const tasksConfig = store ? store.get('tasksConfig') : null;
      const remindersConfig = normalizeRemindersConfig(store ? store.get('remindersConfig') : null);
      return {
        enabled: isExtensionEnabled('tasks', disabled) && isExtensionEnabled('reminders', disabled),
        globalFilter:
          tasksConfig && typeof tasksConfig.globalFilter === 'string'
            ? tasksConfig.globalFilter.trim()
            : '',
        statusTypeOf: createTaskStatusTypeResolver(store ? store.get('taskStates') : null),
        defaultTime: remindersConfig.defaultTime,
      };
    },
    // 4T-001727 (Epic 3E-000305): Zustellung an ALLE Fenster, unabhängig vom
    // Bereich des Fensters (E1). Bis dahin ging die Meldung bewusst an genau
    // ein Fenster der Bereichs-App; diese Absicht ist mit dem Epic revidiert.
    // Jeder Eintrag trägt seine Herkunft mit: die Bereichs-Wurzel als
    // Bezugspunkt jeder Bearbeitung (E4) und den Namen für die Anzeige (E3).
    send(root, channel, payload) {
      if (channel !== 'reminders:due') {
        broadcast(channel, payload);
        return;
      }
      const origin = herkunftsName(root);
      reminderDelivery.deliver({
        ...payload,
        items: payload.items.map((item) => ({ ...item, root, origin })),
      });
    },
    now: () => new Date(),
  });

  // Anzeige-Name der Herkunft: der Name der Bereichs-App; ein Buch oder
  // Bücherregal ist dort ebenfalls als Bereich eingetragen und heißt wie sein
  // Ordner. Ohne laufende App (nur im Übergang denkbar) der Ordner-Name.
  function herkunftsName(root) {
    const appId = appRegistry.findAppByArea((area) => area.rootPath === root);
    const area = appId == null ? null : appRegistry.getArea(appId);
    return area && area.name ? area.name : path.basename(root);
  }

  // 4T-001727: Zustell-Register der Erinnerungen. Eine offene Meldung gilt
  // beim Nachholen noch, solange ihr Anker im Index steht, fällig und nicht
  // stumm ist; ist der Index nicht bereit (etwa weil der Herkunfts-Bereich
  // inzwischen geschlossen ist, E14), bleibt sie stehen.
  const reminderDelivery = createDueDelivery({
    broadcast,
    dueChannel: 'reminders:due',
    handledChannel: 'reminders:handled',
    keyOf: (item) => item.key,
    active: () => {
      const disabled = getStore() ? getStore().get('extensions.disabled') : [];
      return isExtensionEnabled('tasks', disabled) && isExtensionEnabled('reminders', disabled);
    },
    stillOpen(item) {
      const stand = reminderChecker.list(item.root);
      if (!stand.ready) return true;
      return stand.items.some((it) => it.key === item.key && it.due && !it.muted);
    },
  });

  // 4T-001728 (Epic 3E-000305): Wecker und Timer melden sich wie die
  // Erinnerungen in ALLEN Fenstern und werden einmal bearbeitet (E5). Beide
  // gehören der Anwendung und keinem Bereich; eine Herkunft tragen sie nicht.
  // Bis dahin ging die Meldung bewusst an genau EIN Fenster, damit derselbe
  // Wecker nicht in jedem Fenster erscheint — dieselbe Absicht, die das Epic
  // revidiert; die Mehrfach-Anzeige räumt jetzt das Zustell-Register.
  const uhrAktiv = () =>
    isExtensionEnabled('clock', getStore() ? getStore().get('extensions.disabled') : []);
  const alarmDelivery = createDueDelivery({
    broadcast,
    dueChannel: 'alarm:due',
    handledChannel: 'alarm:handled',
    keyOf: (item) => item.key,
    active: uhrAktiv,
    // Ein einmaliger Wecker ist nach dem Auslösen abgeschaltet und bleibt
    // trotzdem eine offene Meldung; es zählt allein, dass es ihn noch gibt.
    stillOpen: (item) =>
      normalizeAlarms(getStore() ? getStore().get(CLOCK_ALARMS_KEY) : []).some(
        (alarm) => alarm.id === item.id,
      ),
  });
  const timerDelivery = createDueDelivery({
    broadcast,
    dueChannel: 'timer:due',
    handledChannel: 'timer:handled',
    keyOf: (item) => item.id,
    active: uhrAktiv,
    stillOpen: (item) =>
      normalizeTimers(getStore() ? getStore().get(CLOCK_TIMERS_KEY) : []).some(
        (timer) => timer.id === item.id && timer.state === 'expired',
      ),
  });

  // 4T-000637 (Epic 3E-000069): Wecker-Pruefer. Anders als die Erinnerungen sind
  // Wecker app-weit (kein Bereich, keine Datei), deshalb entfaellt hier die
  // Bereichs-Aufzaehlung.
  const alarmChecker = createAlarmChecker({
    alarms: () => (getStore() ? getStore().get(CLOCK_ALARMS_KEY) : []),
    enabled: uhrAktiv,
    send: (payload) => alarmDelivery.deliver(payload),
    // Ein einmaliger Wecker schaltet sich nach dem Ausloesen selbst ab. Der
    // Store-Schreibvorgang laeuft ueber denselben Broadcast-Weg wie eine
    // Aenderung aus der Oberflaeche, damit offene Fenster die Liste nachziehen.
    onFired(ids) {
      const store = getStore();
      if (!store) return;
      const current = store.get(CLOCK_ALARMS_KEY);
      const next = disableFiredOnceAlarms(current, new Set(ids));
      if (next === current) return;
      store.set(CLOCK_ALARMS_KEY, next);
      broadcast('clockAlarms:changed', next);
    },
    now: () => new Date(),
  });

  // 4T-000638 (Epic 3E-000069): Timer-Pruefer. Kein Polling: der naechste Ablauf
  // bekommt einen gezielten Weckruf, der bei jeder Listen-Aenderung neu
  // gerechnet wird. Die Zustellung läuft über dasselbe Register wie beim Wecker.
  const timerChecker = createTimerChecker({
    timers: () => (getStore() ? getStore().get(CLOCK_TIMERS_KEY) : []),
    setTimers(list) {
      const store = getStore();
      if (!store) return;
      store.set(CLOCK_TIMERS_KEY, list);
      broadcast('clockTimers:changed', list);
    },
    enabled: uhrAktiv,
    send: (payload) => timerDelivery.deliver(payload),
    now: () => Date.now(),
    schedule(fn, delayMs) {
      const t = setTimeout(fn, delayMs);
      // Der Weckruf darf ein Beenden der App nicht aufhalten.
      if (typeof t.unref === 'function') t.unref();
      return t;
    },
    cancel: (handle) => clearTimeout(handle),
  });

  return {
    reminderChecker,
    alarmChecker,
    timerChecker,
    reminderDelivery,
    alarmDelivery,
    timerDelivery,
  };
}

module.exports = { createCheckers };
