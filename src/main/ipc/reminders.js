// IPC-Kanal-Gruppe Erinnerungen, Wecker und Timer: Panel-Daten, Muting und
// Wiederauslosung der Erinnerungen, die zuschaltbare System-Benachrichtigung,
// das Bestaetigen bzw. Schlummern eines Weckers und der Anspruch auf die
// Meldung eines abgelaufenen Timers.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Kanal-Gruppe: reminders:*,
// notify:system, alarm:*, timer:* (letztere seit 4T-001728).
//
// Eigener Zustand: keiner; der Session-Zustand liegt in den beiden Pruefern
// und im Zustell-Register (checks/due-delivery.js) und kommt als Deps. Der
// Helfer showSystemNotification bedient zwei Kanaele (reminders:systemNotify
// und den neutralen notify:system).
//
// 4T-001727 (Epic 3E-000305): Eine faellige Erinnerung steht seither in allen
// Fenstern. Jede Bearbeitung beansprucht sie deshalb zuerst hier; der erste
// Anspruch gewinnt und raeumt sie in allen Fenstern, jeder weitere laeuft ohne
// Fehlermeldung ins Leere (E9). Der Bereich einer Aktion kommt aus der
// Erinnerung selbst und nicht aus dem bearbeitenden Fenster (E4), denn das
// kann einen anderen Bereich zeigen oder gar keinen.
//
// Liegt der Stand einer Erinnerung ungespeichert im Editor eines anderen
// Fensters, fuehrt dieses Fenster ihre Bearbeitung aus (reminders:edit).
//
// Aus demselben Grund oeffnet der Datei-Link einer Erinnerung ihre Datei im
// Fenster ihres Herkunfts-Bereichs (reminders:openSource): laeuft der Bereich,
// kommt sein Fenster nach vorn; laeuft er nicht, wird er ueber den
// bestehenden Weg geoeffnet. Nur im Fenster des Herkunfts-Bereichs selbst
// oeffnet das Fenster die Datei wie bisher selbst.
'use strict';

const { isInsideArea, isSamePath } = require('../area/area-path');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
// 4T-001978 (Epic 3E-000330): die mit der Aufgaben-Abfrage geteilte Regel,
// welches Fenster einen Auftrag zum ungespeicherten Stand bekommt.
const { uebergibAnPufferBesitzer } = require('./puffer-fenster');

/**
 * Registriert die Erinnerungs- und Wecker-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.Notification Electron-Benachrichtigungs-Klasse.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(event: object) => string|null} deps.areaRootForEvent Bereichs-Wurzel der Anfrage.
 * @param {(win: object) => void} deps.inDenVordergrund Fenster in den Vordergrund holen.
 * @param {Map} deps.windows Fenster-Register (Frage, ob ein Fenster im Vordergrund steht).
 * @param {object} deps.reminderChecker Erinnerungs-Pruefer (Session-Zustand der Meldungen).
 * @param {object} deps.reminderDelivery Zustell-Register der Erinnerungen.
 * @param {object} deps.alarmChecker Wecker-Pruefer (Session-Zustand der Meldungen).
 * @param {object} deps.alarmDelivery Zustell-Register der Wecker.
 * @param {object} deps.timerDelivery Zustell-Register der Timer.
 * @param {object} deps.backlinks Bereichs-Index (Besitzer eines ungespeicherten Stands).
 * @param {object} deps.appRegistry Registry der logischen Applikationen (Datei-Link).
 * @param {Map} deps.appLastFocused Zuletzt fokussiertes Fenster je Applikation (Datei-Link).
 * @param {Function} deps.sendWhenLoaded Meldung an ein moeglicherweise ladendes Fenster.
 * @param {Function} deps.openAreaPath Bereich oeffnen (bestehender Weg).
 * @param {Function} deps.openBookApp Buch oeffnen (bestehender Weg).
 * @param {Function} deps.openShelfApp Buecherregal oeffnen (bestehender Weg).
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (Erweiterungs-Schalter).
 */
function registerRemindersIpc(handle, deps) {
  const {
    Notification,
    senderWindow,
    areaRootForEvent,
    inDenVordergrund,
    windows,
    reminderChecker,
    reminderDelivery,
    alarmChecker,
    alarmDelivery,
    timerDelivery,
  } = deps;
  registerQuellenLink(handle, deps);
  registerPufferBearbeitung(handle, deps);

  // 4T-000525 (Epic 3E-000095): Erinnerungs-IPC — Panel-Daten, Muting und
  // Wiederauslosung gegen den Session-Zustand des Pruefers; der Bereich
  // kommt fuer Panel-Daten und Wiederauslosung aus dem aufrufenden Fenster
  // (bereichslos gibt es keine Erinnerungs-Liste, siehe Epic-Abgrenzung).
  handle('reminders:list', (event) => {
    const areaRoot = areaRootForEvent(event);
    if (!areaRoot) return { ready: false, nowLocal: null, items: [] };
    return reminderChecker.list(areaRoot);
  });
  // 4T-001727: Wegklicken. Der Renderer schickt je Eintrag Bereich und
  // Schluessel ({ root, key }); gestummt wird nur, was der Anspruch gewaehrt,
  // und zwar im Bereich der Erinnerung. Die bisherige Form (reine Schluessel
  // des eigenen Bereichs) bleibt fuer Aufrufer ohne Herkunft gueltig.
  handle('reminders:mute', (event, entries) => {
    const nachBereich = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const eintrag = typeof entry === 'string' ? { root: null, key: entry } : entry;
      if (!eintrag || typeof eintrag.key !== 'string') continue;
      const root = typeof eintrag.root === 'string' ? eintrag.root : areaRootForEvent(event);
      if (!root) continue;
      if (!nachBereich.has(root)) nachBereich.set(root, []);
      nachBereich.get(root).push(eintrag.key);
    }
    for (const [root, keys] of nachBereich) {
      const granted = reminderDelivery.claim(keys);
      if (granted.length > 0) reminderChecker.mute(root, granted);
    }
  });
  handle('reminders:retrigger', (event, keys) => {
    const areaRoot = areaRootForEvent(event);
    if (areaRoot) reminderChecker.retrigger(areaRoot, keys);
  });
  // 4T-001727: Anspruch vor Erledigen und Verschieben. Die Schreib-Kette
  // (Automatik-Daten, Wiederholung, Konflikt-Schutz) bleibt im Fenster, weil
  // sie dort bereits vollstaendig ist; entschieden wird hier nur, OB das
  // Fenster schreiben darf.
  handle('reminders:claim', (event, payload) => {
    const key = payload && typeof payload.key === 'string' ? payload.key : '';
    if (!key) return { granted: false };
    return { granted: reminderDelivery.claim([key]).length === 1 };
  });
  // 4T-001727: Die Bearbeitung konnte nicht schreiben (Konflikt; eine
  // ungesicherte Datei ist seit 4T-001978 kein Grund mehr). Die Erinnerung ist dann nicht bearbeitet und wird erneut an alle
  // Fenster zugestellt, statt bis zum Neustart zu verschwinden.
  handle('reminders:release', (event, payload) => {
    const key = payload && typeof payload.key === 'string' ? payload.key : '';
    const item = key ? reminderDelivery.release(key) : null;
    if (item && typeof item.root === 'string') reminderChecker.retrigger(item.root, [key]);
    return { released: !!item };
  });
  // 4T-001727: Nachholen fuer ein Fenster, das nach dem Faelligwerden
  // geoeffnet wurde (E10), und fuer Meldungen, die ein Fenster waehrend
  // seines Starts verpasst hat.
  handle('reminders:open', () => reminderDelivery.openItems());

  // 4T-000526 (Epic 3E-000095): zuschaltbare System-Notification — erste
  // Nutzung nativer Benachrichtigungen. Titel und Body kommen lokalisiert
  // aus dem Renderer; der Klick holt das aufrufende Fenster in den
  // Vordergrund (Muster second-instance), der In-App-Dialog ist dort
  // bereits offen. Das Schliessen der Notification hat bewusst keine
  // Muting-Wirkung (einheitliche Muting-Quelle ist der In-App-Dialog).
  // 4T-000637 (Epic 3E-000069): Die Anzeige-Logik ist inhaltlich generisch
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

  // 4T-001727 (E12): Die Bedingung bleibt die bisherige — die Anzeige steht
  // nicht im Vordergrund. Bei einem Fenster hiess das: dieses Fenster hat
  // keinen Fokus. Seit die Meldung in allen Fenstern steht, heisst es: KEIN
  // Fenster der Anwendung hat den Fokus; sonst steht der Dialog im
  // fokussierten Fenster bereits vor dem Anwender. Jedes Fenster ohne Fokus
  // fordert an, gewaehrt wird je Meldung genau einmal.
  function einFensterImVordergrund() {
    for (const win of windows.values()) {
      if (win && !win.isDestroyed() && win.isFocused()) return true;
    }
    return false;
  }
  function darfBenachrichtigen(delivery, keys) {
    return !einFensterImVordergrund() && delivery.claimNotification(keys);
  }
  handle('reminders:systemNotify', (event, payload) => {
    if (payload && Array.isArray(payload.keys)) {
      if (!darfBenachrichtigen(reminderDelivery, payload.keys)) return false;
    }
    return showSystemNotification(event, payload);
  });
  // 4T-001728: Wecker und Timer nennen ihre Meldung (Art und Schluessel), damit
  // die Benachrichtigung je Meldung einmal erscheint und nicht je Fenster.
  const uhrRegister = { alarm: alarmDelivery, timer: timerDelivery };
  handle('notify:system', (event, payload) => {
    const meldung = payload && payload.meldung;
    if (meldung && Array.isArray(meldung.keys)) {
      const delivery = Object.hasOwn(uhrRegister, meldung.art) ? uhrRegister[meldung.art] : null;
      if (!delivery || !darfBenachrichtigen(delivery, meldung.keys)) return false;
    }
    return showSystemNotification(event, payload);
  });

  // 4T-000637 (Epic 3E-000069): Wecker — Bestaetigen und Schlummern gegen den
  // Session-Zustand des Pruefers. Der gespeicherte Wecker bleibt dabei
  // unveraendert; geschlummert wird nur die Meldung.
  // 4T-001728: Beide wirken nur mit gewaehrtem Anspruch. Schlummert ein Fenster
  // und bestaetigt ein anderes fast zugleich, gilt das erste; das zweite
  // loescht den eben gesetzten Schlummer-Termin nicht mehr (E9).
  handle('alarm:snooze', (event, payload) => {
    const key = payload && typeof payload.key === 'string' ? payload.key : '';
    const minutes = payload ? payload.minutes : undefined;
    if (alarmDelivery.claim([key]).length === 0) return false;
    return alarmChecker.snooze(key, minutes);
  });
  handle('alarm:confirm', (event, payload) => {
    const key = payload && typeof payload.key === 'string' ? payload.key : '';
    if (alarmDelivery.claim([key]).length === 0) return;
    alarmChecker.confirm(key);
  });
  handle('alarm:open', () => alarmDelivery.openItems());

  // 4T-001728: Timer. Bestaetigen und Erneut-Starten schreibt das Fenster ueber
  // den Einstellungs-Weg (der Zustand liegt im Speicher); hier faellt nur die
  // Entscheidung, welches Fenster es darf. Geliefert werden die Kennungen,
  // deren Bearbeitung wirken darf.
  handle('timer:claim', (event, ids) => {
    const liste = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
    return { granted: timerDelivery.claim(liste) };
  });
  handle('timer:open', () => timerDelivery.openItems());
}

// 4T-001727 (Epic 3E-000305, Befund der Abnahme vom 2026-09-24): Bearbeitung
// einer Erinnerung, deren Stand ungespeichert im Editor eines ANDEREN Fensters
// liegt. Der Pruefer liest den geschriebenen Stand mit (Puffer-Overlay), die
// Meldung kann also aus einer Zeile stammen, die so noch nicht auf der Platte
// steht. Das klickende Fenster schriebe dann ins Leere («Zeile nicht mehr
// gefunden»). Nach E4 wirkt jede Aktion auf die Daten ihrer Herkunft, und die
// liegen in diesem Fall im Editor des meldenden Fensters: Es bekommt den
// Auftrag und fuehrt ihn ueber seine eigene Schreib-Kette aus, genau so, als
// waere dort geklickt worden.
//
// Aufgerufen NACH dem gewaehrten Anspruch; die Gleichzeitigkeits-Regel bleibt
// damit unberuehrt. Antwort { delegiert: true }, wenn der Auftrag an ein
// anderes Fenster ging; sonst schreibt das klickende Fenster wie bisher selbst
// (kein ungespeicherter Stand, er liegt bei ihm selbst, oder sein Besitzer ist
// nicht mehr da).
//
// 4T-001978 (Epic 3E-000330): Die Besitzer-Regel liegt seither in
// src/main/ipc/puffer-fenster.js, weil auch die Aufgaben-Abfrage sie nutzt
// (taskQuery:edit); das Verhalten dieses Kanals ist unverändert.
function registerPufferBearbeitung(handle, deps) {
  const { windows, backlinks } = deps;
  handle('reminders:edit', (event, auftrag) => {
    const item = auftrag && auftrag.item;
    const art = auftrag && auftrag.bearbeitung ? auftrag.bearbeitung.art : null;
    if (!item || typeof item.path !== 'string' || !item.path) return { delegiert: false };
    if (art !== 'erledigt' && art !== 'aufschub') return { delegiert: false };
    const nutzlast = { item, bearbeitung: auftrag.bearbeitung };
    const quellen = { windows, backlinks };
    return {
      delegiert: uebergibAnPufferBesitzer(quellen, event, item.path, 'reminders:edit', nutzlast),
    };
  });
}

// 4T-001727 (Epic 3E-000305, Entscheidung vom 2026-09-23 als Folge von E1 und
// E4): Datei-Link einer Erinnerung. Die Datei oeffnet im Fenster ihres
// Herkunfts-Bereichs statt im klickenden Fenster, das einen anderen Bereich
// zeigen kann (dort griffe die harte Bereichs-Grenze) oder keinen.
//
// Antwort an das klickende Fenster:
//   { ok: true, hier: true }  — es IST ein Fenster des Herkunfts-Bereichs (oder
//                               wurde eben an ihn gebunden) und oeffnet selbst;
//   { ok: true, hier: false } — ein anderes Fenster oeffnet die Datei;
//   { ok: false }             — der Bereich laesst sich nicht oeffnen.
function registerQuellenLink(handle, deps) {
  const {
    senderWindow,
    inDenVordergrund,
    windows,
    appRegistry,
    appLastFocused,
    sendWhenLoaded,
    openAreaPath,
    openBookApp,
    openShelfApp,
    getStore,
  } = deps;

  const appDesBereichs = (root) => appRegistry.findAppByArea((a) => isSamePath(a.rootPath, root));

  // Ziel ist das zuletzt aktive Fenster der Bereichs-App, sonst ihr erstes
  // (Muster focusLastActiveAppWindow).
  function zielFenster(appId) {
    const ids = appRegistry.windowsOf(appId);
    const zuletzt = appLastFocused ? appLastFocused.get(appId) : null;
    const id = zuletzt != null && ids.includes(zuletzt) ? zuletzt : ids[0];
    const win = id != null ? windows.get(id) : null;
    return win && !win.isDestroyed() ? win : null;
  }

  // Laeuft der Herkunfts-Bereich nicht mehr (E14), wird er ueber den Weg
  // geoeffnet, der zu seiner Art gehoert: Buch und Buecherregal sind Bereiche
  // mit eigener Oeffnung, jeder andere Ordner ein gewoehnlicher Bereich. Die
  // beiden ersten Wege lehnen einen Ordner ohne ihre Begleitdatei still ab.
  async function bereichOeffnen(root, sender) {
    const store = getStore ? getStore() : null;
    if (isExtensionEnabled('books', store ? store.get('extensions.disabled') : [])) {
      const buch = await openBookApp(root, sender);
      if (buch && buch.ok) return buch;
      const regal = await openShelfApp(root, sender);
      if (regal && regal.ok) return regal;
    }
    return openAreaPath(root, sender);
  }

  handle('reminders:openSource', async (event, payload) => {
    const root = payload && typeof payload.root === 'string' ? payload.root : '';
    const datei = payload && typeof payload.path === 'string' ? payload.path : '';
    if (!root || !datei || !isInsideArea(root, datei)) return { ok: false };
    const line = Number.isInteger(payload.line) ? payload.line : null;
    const sender = senderWindow(event);
    const senderApp =
      sender && !sender.isDestroyed() ? appRegistry.appOf(sender.webContents.id) : null;

    let appId = appDesBereichs(root);
    if (appId == null) {
      const geoeffnet = await bereichOeffnen(root, sender);
      if (!geoeffnet || !geoeffnet.ok) return { ok: false };
      appId = appDesBereichs(root);
      if (appId == null) return { ok: false };
    }
    if (senderApp != null && appId === senderApp) return { ok: true, hier: true };
    const ziel = zielFenster(appId);
    if (!ziel) return { ok: false };
    inDenVordergrund(ziel);
    sendWhenLoaded(ziel, 'reminders:openSource', { path: datei, line });
    return { ok: true, hier: false };
  });
}

module.exports = { registerRemindersIpc };
