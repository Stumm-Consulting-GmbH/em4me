// IPC-Kanal-Gruppe Erinnerungen und Wecker: Panel-Daten, Muting und
// Wiederauslosung der Erinnerungen, die zuschaltbare System-Benachrichtigung
// und das Bestaetigen bzw. Schlummern eines Weckers.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: reminders:*,
// notify:system, alarm:*.
//
// Eigener Zustand: keiner; der Session-Zustand liegt in den beiden Pruefern
// und kommt als Deps. Der Helfer showSystemNotification bedient zwei Kanaele
// (reminders:systemNotify und den neutralen notify:system).
'use strict';

/**
 * Registriert die Erinnerungs- und Wecker-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.Notification Electron-Benachrichtigungs-Klasse.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(event: object) => string|null} deps.areaRootForEvent Bereichs-Wurzel der Anfrage.
 * @param {(win: object) => void} deps.inDenVordergrund Fenster in den Vordergrund holen.
 * @param {object} deps.reminderChecker Erinnerungs-Pruefer (Session-Zustand der Meldungen).
 * @param {object} deps.alarmChecker Wecker-Pruefer (Session-Zustand der Meldungen).
 */
function registerRemindersIpc(handle, deps) {
  const {
    Notification,
    senderWindow,
    areaRootForEvent,
    inDenVordergrund,
    reminderChecker,
    alarmChecker,
  } = deps;

  // 4T-0525 (Epic 3E-0095): Erinnerungs-IPC — Panel-Daten, Muting und
  // Wiederauslosung gegen den Session-Zustand des Pruefers; der Bereich
  // kommt aus dem aufrufenden Fenster (bereichslos gibt es keinen
  // Erinnerungs-Suchraum, siehe Epic-Abgrenzung).
  handle('reminders:list', (event) => {
    const areaRoot = areaRootForEvent(event);
    if (!areaRoot) return { ready: false, nowLocal: null, items: [] };
    return reminderChecker.list(areaRoot);
  });
  handle('reminders:mute', (event, keys) => {
    const areaRoot = areaRootForEvent(event);
    if (areaRoot) reminderChecker.mute(areaRoot, keys);
  });
  handle('reminders:retrigger', (event, keys) => {
    const areaRoot = areaRootForEvent(event);
    if (areaRoot) reminderChecker.retrigger(areaRoot, keys);
  });
  // 4T-0526 (Epic 3E-0095): zuschaltbare System-Notification — erste
  // Nutzung nativer Benachrichtigungen. Titel und Body kommen lokalisiert
  // aus dem Renderer; der Klick holt das aufrufende Fenster in den
  // Vordergrund (Muster second-instance), der In-App-Dialog ist dort
  // bereits offen. Das Schliessen der Notification hat bewusst keine
  // Muting-Wirkung (einheitliche Muting-Quelle ist der In-App-Dialog).
  // 4T-0637 (Epic 3E-0069): Die Anzeige-Logik ist inhaltlich generisch
  // (Titel und Text kommen lokalisiert aus dem Renderer) und wird seit dem
  // Wecker von zwei Kanaelen genutzt. Der Erinnerungs-Kanal bleibt
  // unveraendert bestehen, der neutrale kommt daneben.
  const showSystemNotification = (event, payload) => {
    if (!Notification.isSupported()) return false;
    const owner = senderWindow(event);
    const notification = new Notification({
      title: payload && typeof payload.title === 'string' ? payload.title : '',
      body: payload && typeof payload.body === 'string' ? payload.body : '',
    });
    notification.on('click', () => {
      inDenVordergrund(owner);
    });
    notification.show();
    return true;
  };
  handle('reminders:systemNotify', showSystemNotification);
  handle('notify:system', showSystemNotification);

  // 4T-0637 (Epic 3E-0069): Wecker — Bestaetigen und Schlummern gegen den
  // Session-Zustand des Pruefers. Der gespeicherte Wecker bleibt dabei
  // unveraendert; geschlummert wird nur die Meldung.
  handle('alarm:snooze', (event, payload) => {
    const key = payload && typeof payload.key === 'string' ? payload.key : '';
    const minutes = payload ? payload.minutes : undefined;
    return alarmChecker.snooze(key, minutes);
  });
  handle('alarm:confirm', (event, payload) => {
    const key = payload && typeof payload.key === 'string' ? payload.key : '';
    alarmChecker.confirm(key);
  });
}

module.exports = { registerRemindersIpc };
