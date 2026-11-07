// 4T-002421 (Epic 3E-000366, Story 4S-001132): Die Kanäle des Laufs nach
// Zeitplan zwischen Fenster und Zeitplan-Prüfer.
//
// Kanäle (Namensraum workflow:*, wie Ausführung, Ordner und Seite):
//   workflow:due            Hauptprozess -> alle Fenster (Zustell-Register),
//                           Nutzlast { catchUp, items: [{ key, root, path,
//                           relPath, name, origin, due }] }.
//   workflow:dueHandled     Hauptprozess -> alle Fenster, { keys }; eine
//                           Fälligkeit ist beansprucht.
//   workflow:scheduleClaim  Fenster -> Hauptprozess (invoke), { key }; Antwort
//                           { granted }. Gewährt nur, wenn die Bereichs-Wurzel
//                           des sendenden Fensters die der Fälligkeit ist und
//                           noch kein Fenster sie beansprucht hat.
//   workflow:scheduleRelease  { key }; das Fenster konnte nach dem Anspruch
//                           nicht starten, die Fälligkeit kommt im nächsten
//                           Takt wieder.
//   workflow:scheduleFinished { key }; der Lauf ist zu Ende (gelungen,
//                           abgebrochen oder beendet), `nextDue` rückt vor.
//   workflow:scheduleOpen   die offenen Fälligkeiten für ein Fenster, dessen
//                           Zuhörer nach der Zustellung entstand.
//
// 4T-002460 (Epic 3E-000367, Story 4S-001143): dieselben Kanäle für den Lauf
// nach Ereignis, mit dem Ereignis-Prüfer (checks/workflow-event-check.js)
// statt des Zeitplan-Prüfers:
//   workflow:eventDue       Hauptprozess -> alle Fenster, { catchUp: false,
//                           items: [{ key, root, path, relPath, name, origin:
//                           'event', event: { type, file, from, task } }] };
//                           je Bereich immer nur die erste Fälligkeit seiner
//                           Warteschlange.
//   workflow:eventDueHandled  { keys }; eine Fälligkeit ist beansprucht.
//   workflow:eventClaim, workflow:eventRelease, workflow:eventFinished,
//   workflow:eventOpen      wie die Zeitplan-Kanäle; das Ende eines Laufs gibt
//                           die nächste Fälligkeit des Bereichs frei.
//
// Die Bereichs-Wurzel ist immer die des sendenden Fensters, nie eine
// mitgeschickte; ein Fenster kann nur seinen eigenen Anspruch zurückgeben oder
// abschließen. Eigener Zustand: keiner (er liegt im Prüfer).
'use strict';

const MAX_SCHLUESSEL = 8192;

function schluesselAus(nutzlast) {
  const key = nutzlast && typeof nutzlast === 'object' ? nutzlast.key : null;
  return typeof key === 'string' && key !== '' && key.length <= MAX_SCHLUESSEL ? key : null;
}

/**
 * Registriert die Kanäle des Laufs nach Zeitplan.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {object} deps.workflowScheduleChecker Zeitplan-Prüfer (checks/workflow-schedule-check.js).
 * @param {object} deps.workflowScheduleDelivery Zustell-Register der Fälligkeiten.
 * @param {object} [deps.workflowEventChecker] Ereignis-Prüfer (checks/workflow-event-check.js).
 * @param {object} [deps.workflowEventDelivery] Zustell-Register der Ereignis-Fälligkeiten.
 */
function registerWorkflowScheduleIpc(handle, deps) {
  const { senderWindow, areaOfWindow, workflowScheduleChecker, workflowScheduleDelivery } = deps;
  registriere(handle, 'schedule', { senderWindow, areaOfWindow }, () => ({
    pruefer: workflowScheduleChecker,
    register: workflowScheduleDelivery,
  }));
  // 4T-002460: Ohne Ereignis-Prüfer (ältere Verdrahtung, Prüffälle) antworten
  // die Kanäle wie bei einer unbekannten Fälligkeit.
  registriere(handle, 'event', { senderWindow, areaOfWindow }, () =>
    deps.workflowEventChecker && deps.workflowEventDelivery
      ? { pruefer: deps.workflowEventChecker, register: deps.workflowEventDelivery }
      : null,
  );
}

// Die vier Kanäle einer Art (`schedule` oder `event`): Anspruch, Rückgabe,
// Ende und offener Stand.
function registriere(handle, art, { senderWindow, areaOfWindow }, quelle) {
  function absender(event) {
    const win = senderWindow(event);
    const area = win ? areaOfWindow(win) : null;
    const windowId = event && event.sender ? event.sender.id : null;
    return { root: area && area.rootPath ? area.rootPath : null, windowId };
  }

  handle(`workflow:${art}Claim`, (event, nutzlast) => {
    const key = schluesselAus(nutzlast);
    const { root, windowId } = absender(event);
    const q = quelle();
    if (!q || !key || !root || windowId === null) return { granted: false };
    return { granted: q.pruefer.claim(key, { root, windowId }) };
  });

  handle(`workflow:${art}Release`, (event, nutzlast) => {
    const key = schluesselAus(nutzlast);
    const { windowId } = absender(event);
    const q = quelle();
    if (!q || !key || windowId === null) return { released: false };
    return { released: q.pruefer.release(key, windowId) };
  });

  handle(`workflow:${art}Finished`, async (event, nutzlast) => {
    const key = schluesselAus(nutzlast);
    const { windowId } = absender(event);
    const q = quelle();
    if (!q || !key || windowId === null) return { finished: false };
    return { finished: await q.pruefer.finish(key, windowId) };
  });

  handle(`workflow:${art}Open`, () => {
    const q = quelle();
    return q ? q.register.openItems() : { catchUp: false, items: [] };
  });
}

module.exports = { registerWorkflowScheduleIpc };
