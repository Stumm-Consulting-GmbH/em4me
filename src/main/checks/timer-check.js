// 4T-000638 (Epic 3E-000069): Timer-Pruefer im Main-Prozess.
//
// Anders als der Wecker-Pruefer (fester 30-Sekunden-Takt, reminder-check.js
// und alarm-check.js) arbeitet dieser OHNE Polling: Ein Timer soll auf die
// Sekunde melden, und ein 30-Sekunden-Raster waere dafuer zu grob, ein
// Sekunden-Raster dauerhaft zu teuer. Stattdessen setzt der Pruefer einen
// gezielten Weckruf auf den naechsten Ablauf-Zeitpunkt und rechnet ihn bei
// jeder Aenderung der Timer-Liste neu (reschedule).
//
// Der Weckruf laeuft bewusst im Main: Renderer-Timer werden bei minimiertem
// Fenster gedrosselt, genau dann zaehlt die Meldung.
//
// Standby: Ein verschlafener Weckruf feuert verspaetet — das ist hier
// richtig, der Timer IST abgelaufen. Gemeldet wird beim Feuern immer alles,
// was faellig ist, nicht nur der ausloesende Timer.
//
// Alle Abhaengigkeiten kommen injiziert (deps), damit die Logik ohne
// Electron unit-testbar ist:
//   timers()      -> Roh-Liste der Timer aus dem Store
//   setTimers(l)  -> bereinigte Liste zurueckschreiben (Zustand 'expired')
//   enabled()     -> ist die Uhr-Erweiterung aktiv?
//   send(payload) -> Zustellung an genau ein Fenster
//   now()         -> Millisekunden-Zeitstempel
//   schedule(fn, delayMs) -> Weckruf setzen, liefert ein Handle
//   cancel(handle)        -> Weckruf abraeumen
'use strict';

const {
  expireDueTimers,
  nextExpiryAt,
  normalizeTimers,
} = require('../../shared/clock/clock-timers');

// Obergrenze eines einzelnen Weckrufs. Laengere Wartezeiten werden in
// Etappen geplant: setTimeout ist ueber Stunden hinweg unzuverlaessig
// (Drift, Standby), eine Neuplanung alle paar Minuten faengt das ab.
const MAX_SLEEP_MS = 5 * 60000;
// Mindest-Vorlauf, damit ein Weckruf nicht in einer Endlos-Schleife
// unmittelbar erneut feuert.
const MIN_SLEEP_MS = 20;

function createTimerChecker(deps) {
  let handle = null;

  function clear() {
    if (handle == null) return;
    deps.cancel(handle);
    handle = null;
  }

  // Weckruf auf den naechsten Ablauf setzen. Ohne laufenden Timer bleibt
  // gar kein Weckruf stehen (kein Leerlauf-Polling).
  function reschedule() {
    clear();
    if (!deps.enabled()) return;
    let list;
    try {
      list = normalizeTimers(deps.timers());
    } catch (err) {
      console.warn('Timer-Pruefer: Liste lesen fehlgeschlagen:', err);
      return;
    }
    const now = deps.now();
    const at = nextExpiryAt(list, now);
    if (at == null) return;
    const delay = Math.min(MAX_SLEEP_MS, Math.max(MIN_SLEEP_MS, at - now));
    handle = deps.schedule(fire, delay);
  }

  // Weckruf gefeuert: alles Faellige melden, den Rest neu planen. Fehler
  // brechen die Kette nicht (Logging statt Absturz).
  function fire() {
    handle = null;
    try {
      check();
    } catch (err) {
      console.warn('Timer-Pruefer fehlgeschlagen:', err);
    }
    reschedule();
  }

  function check() {
    if (!deps.enabled()) return;
    const now = deps.now();
    const current = normalizeTimers(deps.timers());
    const next = expireDueTimers(current, now);
    if (next === current) return; // nichts faellig (Etappen-Weckruf)
    const due = next.filter(
      (timer, i) => timer.state === 'expired' && current[i] && current[i].state !== 'expired',
    );
    deps.setTimers(next);
    if (due.length === 0) return;
    deps.send({
      items: due.map((timer) => ({
        id: timer.id,
        label: timer.label,
        durationMs: timer.durationMs,
      })),
    });
  }

  function start() {
    reschedule();
  }

  function stop() {
    clear();
  }

  // Nur fuer Tests: steht gerade ein Weckruf?
  function isScheduled() {
    return handle != null;
  }

  return { start, stop, reschedule, fire, isScheduled };
}

module.exports = { createTimerChecker, MAX_SLEEP_MS, MIN_SLEEP_MS };
