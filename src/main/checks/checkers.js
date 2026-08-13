// Aufbau der drei Pruefer des Main-Prozesses: Erinnerungen (30-Sekunden-Takt
// auf dem Bereichs-Index), Wecker (30-Sekunden-Takt auf der app-weiten
// Wecker-Liste) und Timer (gezielter Weckruf auf den naechsten Ablauf). Die
// Pruef-Kerne selbst liegen in den Nachbar-Modulen dieses Ordners; hier
// entsteht ihre Umgebung — Suchraum, Gates, Ziel-Fenster und Rueckschreiben.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Rolle: Aufbau-Funktion ohne
// Lade-Zeit-Seiteneffekte; der Takt startet erst mit dem Start-Ablauf.
'use strict';

const { createReminderChecker } = require('./reminder-check.js');
const { normalizeRemindersConfig } = require('../../shared/reminders.js');
const { createAlarmChecker } = require('./alarm-check.js');
const { CLOCK_ALARMS_KEY, disableFiredOnceAlarms } = require('../../shared/clock/clock-alarms.js');
const { createTimerChecker } = require('./timer-check.js');
const { CLOCK_TIMERS_KEY } = require('../../shared/clock/clock-timers.js');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { createTaskStatusTypeResolver } = require('../../shared/markdown/plugins.js');

/**
 * Baut die drei Pruefer auf.
 *
 * @param {object} deps Bezuege aus der Verdrahtung.
 * @param {object} deps.appRegistry Registry der logischen Applikationen.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (entsteht erst beim Start).
 * @param {Map} deps.windows Fenster-Register.
 * @param {object} deps.backlinks Bereichs-Index (Aufgaben-Zeilen des Suchraums).
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @returns {{reminderChecker: object, alarmChecker: object, timerChecker: object}} Die drei Pruefer.
 */
function createCheckers(deps) {
  const { appRegistry, getStore, windows, backlinks, broadcast } = deps;
  // 4T-0525 (Epic 3E-0095): Erinnerungs-Pruefer. Die Umgebung wird pro Lauf
  // frisch aus dem Store gebaut (Muster frontmatterQuery:run) — Einstellungs-
  // und Erweiterungs-Aenderungen wirken ohne eigenen Listener sofort.
  // Doppel-Gate tasks UND reminders: robust unabhaengig davon, ob die
  // Erweiterungs-Registrierung (4T-0528) schon ausgeliefert ist.
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
    // Zustellung an das Ziel-Fenster der Bereichs-App: das fokussierte,
    // sonst das erste lebende Fenster (Dialog-Anzeige gehoert in genau ein
    // Fenster; Muster second-instance).
    send(root, channel, payload) {
      const appId = appRegistry.findAppByArea((area) => area.rootPath === root);
      if (appId == null) return;
      let target = null;
      for (const windowId of appRegistry.windowsOf(appId)) {
        const win = windows.get(windowId);
        if (!win || win.isDestroyed()) continue;
        if (!target) target = win;
        if (win.isFocused()) target = win;
      }
      if (target) target.webContents.send(channel, payload);
    },
    now: () => new Date(),
  });

  // 4T-0637 (Epic 3E-0069): Wecker-Pruefer. Anders als die Erinnerungen sind
  // Wecker app-weit (kein Bereich, keine Datei), deshalb entfaellt hier die
  // Bereichs-Aufzaehlung und die Meldung geht an genau EIN Fenster — sonst
  // erschiene derselbe Wecker in jedem offenen Fenster.
  const alarmChecker = createAlarmChecker({
    alarms: () => (getStore() ? getStore().get(CLOCK_ALARMS_KEY) : []),
    enabled: () =>
      isExtensionEnabled('clock', getStore() ? getStore().get('extensions.disabled') : []),
    // Ziel-Fenster: das fokussierte, sonst das erste lebende (Muster des
    // Erinnerungs-Pruefers, nur ohne Bereichs-Bindung).
    send(payload) {
      let target = null;
      for (const win of windows.values()) {
        if (!win || win.isDestroyed()) continue;
        if (!target) target = win;
        if (win.isFocused()) target = win;
      }
      if (target) target.webContents.send('alarm:due', payload);
    },
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

  // 4T-0638 (Epic 3E-0069): Timer-Pruefer. Kein Polling: der naechste Ablauf
  // bekommt einen gezielten Weckruf, der bei jeder Listen-Aenderung neu
  // gerechnet wird. Das Ziel-Fenster bestimmt derselbe Weg wie beim Wecker.
  const timerChecker = createTimerChecker({
    timers: () => (getStore() ? getStore().get(CLOCK_TIMERS_KEY) : []),
    setTimers(list) {
      const store = getStore();
      if (!store) return;
      store.set(CLOCK_TIMERS_KEY, list);
      broadcast('clockTimers:changed', list);
    },
    enabled: () =>
      isExtensionEnabled('clock', getStore() ? getStore().get('extensions.disabled') : []),
    send(payload) {
      let target = null;
      for (const win of windows.values()) {
        if (!win || win.isDestroyed()) continue;
        if (!target) target = win;
        if (win.isFocused()) target = win;
      }
      if (target) target.webContents.send('timer:due', payload);
    },
    now: () => Date.now(),
    schedule(fn, delayMs) {
      const t = setTimeout(fn, delayMs);
      // Der Weckruf darf ein Beenden der App nicht aufhalten.
      if (typeof t.unref === 'function') t.unref();
      return t;
    },
    cancel: (handle) => clearTimeout(handle),
  });

  return { reminderChecker, alarmChecker, timerChecker };
}

module.exports = { createCheckers };
