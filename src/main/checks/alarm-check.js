// 4T-000637 (Epic 3E-000069): Wecker-Pruefer im Main-Prozess.
//
// Fester 30-Sekunden-Takt (minutengenaue Meldung sicher, ohne unnoetiges
// Aufwachen). Der Timer laeuft bewusst im Main: Renderer-Timer werden bei
// minimiertem Fenster gedrosselt, genau dann zaehlt eine Weckmeldung.
// Muster und Begruendung wie beim Erinnerungs-Pruefer (reminder-check.js);
// die Wecker sind aber app-weit statt bereichsgebunden, weshalb hier keine
// Bereichs-Aufzaehlung vorkommt und die Meldung an genau EIN Fenster geht.
//
// Faelligkeits-Fenster statt „Zeitpunkt erreicht": gemeldet wird, was seit
// dem letzten Lauf faellig wurde. Damit loest ein laengst vergangener
// Wecker beim App-Start nicht nachtraeglich aus. Nach einem langen Standby
// wird das Fenster auf MAX_WINDOW_MS geklemmt — ein Wecker, der Stunden
// zurueckliegt, ist keine Meldung mehr wert.
//
// Session-Zustand (bis zum App-Neustart):
// - fired:   bereits gemeldete Schluessel (Kennung plus Kalendertag), damit
//            derselbe Wecker am selben Tag nicht doppelt feuert.
// - snoozed: geschlummerte Wecker (Schluessel -> Ziel-Zeitpunkt). Der
//            gespeicherte Wecker bleibt dabei unveraendert.
//
// Alle Abhaengigkeiten kommen injiziert (deps), damit die Logik ohne
// Electron unit-testbar ist:
//   alarms()   -> Roh-Liste der Wecker aus dem Store
//   enabled()  -> ist die Uhr-Erweiterung aktiv?
//   send(payload) -> Zustellung an genau ein Fenster
//   onFired(ids)  -> gemeldete Kennungen (einmalige Wecker abschalten)
//   now()      -> Date (Bezugszeitpunkt)
'use strict';

const {
  computeDueAlarms,
  normalizeAlarms,
  snoozeUntil,
} = require('../../shared/clock/clock-alarms');

const CHECK_INTERVAL_MS = 30000;
// Obergrenze des Faelligkeits-Fensters (Standby, Uhr-Sprung): aelter als
// fuenf Minuten wird nicht nachgemeldet.
const MAX_WINDOW_MS = 5 * 60000;

function createAlarmChecker(deps) {
  const fired = new Set();
  const snoozed = new Map(); // key -> { at: Date, alarm }
  let timer = null;
  let lastCheck = null;

  // Ein Pruef-Lauf. Fehler brechen den Takt nicht (Logging statt Absturz,
  // Entwicklungsrichtlinie Fehlerbehandlung).
  function tick() {
    try {
      check();
    } catch (err) {
      console.warn('Wecker-Pruefer fehlgeschlagen:', err);
    }
  }

  function check() {
    const now = deps.now();
    const from = windowStart(now);
    if (!deps.enabled()) {
      // Aus-Zustand der Erweiterung: kein Melden, aber der Bezugspunkt
      // wandert mit, damit beim Wiedereinschalten nichts nachfeuert.
      snoozed.clear();
      lastCheck = now;
      return;
    }
    const list = normalizeAlarms(deps.alarms());
    const due = computeDueAlarms(list, { from, to: now, firedKeys: fired });
    const items = [...due, ...dueSnoozed(list, now)];
    // Bezugspunkt erst nach der Ermittlung setzen: bricht der Lauf vorher ab
    // (Store-Fehler), bleibt das Fenster erhalten und der naechste Lauf holt
    // es nach, statt die Faelligkeit dieses Fensters zu verschlucken.
    lastCheck = now;
    if (items.length === 0) return;
    for (const item of items) fired.add(item.key);
    deps.send({ items: items.map(toPayload) });
    if (typeof deps.onFired === 'function') {
      deps.onFired([...new Set(items.map((it) => it.id))]);
    }
  }

  // Start des Faelligkeits-Fensters: der letzte Lauf, geklemmt auf
  // MAX_WINDOW_MS. Beim allerersten Lauf gibt es kein Fenster in die
  // Vergangenheit (nur ab jetzt).
  function windowStart(now) {
    const earliest = new Date(now.getTime() - MAX_WINDOW_MS);
    if (!lastCheck) return new Date(now.getTime() - CHECK_INTERVAL_MS);
    return lastCheck < earliest ? earliest : lastCheck;
  }

  // Faellige Schlummer-Termine. Der Schluessel bleibt derselbe wie beim
  // ersten Feuern; er ist zu diesem Zeitpunkt bereits in `fired`, deshalb
  // laufen die Schlummer-Termine an der normalen Rechnung vorbei.
  function dueSnoozed(list, now) {
    const out = [];
    for (const [key, entry] of [...snoozed.entries()]) {
      if (entry.at > now) continue;
      snoozed.delete(key);
      // Der Wecker kann zwischenzeitlich geloescht oder abgeschaltet worden
      // sein; dann entfaellt die Meldung.
      const current = list.find((a) => a.id === entry.alarm.id);
      if (!current || !current.enabled) continue;
      out.push({ ...current, key, at: entry.at.getTime() });
    }
    return out;
  }

  function toPayload(item) {
    return {
      key: item.key,
      id: item.id,
      time: item.time,
      label: item.label,
      repeat: item.repeat,
      at: item.at,
    };
  }

  // Schlummern aus dem Faelligkeits-Dialog: erneut melden in `minutes`.
  // Der gespeicherte Wecker bleibt unveraendert (Session-Zustand).
  function snooze(key, minutes) {
    if (typeof key !== 'string' || key === '') return false;
    const id = key.split('|')[0];
    const alarm = normalizeAlarms(deps.alarms()).find((a) => a.id === id);
    if (!alarm) return false;
    const now = deps.now();
    snoozed.set(key, { at: snoozeUntil(now, minutes), alarm });
    return true;
  }

  // Bestaetigen: nichts weiter zu tun (der Schluessel bleibt gemeldet). Ein
  // eventuell laufender Schlummer-Termin desselben Weckers entfaellt.
  function confirm(key) {
    snoozed.delete(key);
  }

  function start() {
    if (timer) return;
    lastCheck = deps.now();
    timer = setInterval(tick, CHECK_INTERVAL_MS);
    // Der Timer darf ein Beenden der App nicht aufhalten.
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  // Nur fuer Tests: Session-Zustand einsehen.
  function state() {
    return { fired: new Set(fired), snoozed: new Map(snoozed), lastCheck };
  }

  return { start, stop, tick, snooze, confirm, state };
}

module.exports = { createAlarmChecker, CHECK_INTERVAL_MS, MAX_WINDOW_MS };
