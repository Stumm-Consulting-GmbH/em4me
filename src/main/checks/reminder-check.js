// 4T-0525 (Epic 3E-0095): Erinnerungs-Pruefer im Main-Prozess.
//
// Fester 30-Sekunden-Takt auf dem bereichsweiten Index (Workshop-Punkt 7):
// pro Tick und Bereichs-App werden die faelligen, noch nicht gemeldeten
// und nicht gemuteten Erinnerungs-Anker ermittelt und als 'reminders:due'
// an das Ziel-Fenster der Bereichs-App geliefert. Der Timer laeuft bewusst
// im Main: Renderer-Timer werden bei minimiertem Fenster gedrosselt,
// genau dann zaehlen Benachrichtigungen. Die Tipp-Ruhe (10 Sekunden,
// Punkt 7) liegt dagegen im Renderer — nur dort ist Tipp-Aktivitaet
// bekannt; der Pruefer liefert Daten.
//
// Session-Zustand pro Bereichs-Wurzel (bis zum App-Neustart, Punkt 3):
// - reported: bereits gemeldete Schluessel (kein Doppel-Feuern im Takt).
// - muted: weggeklickte Schluessel (Wiederauslosung nur ueber das Panel).
// - deliveredOnce: der erste Lauf mit bereitem Index ist die Nachhol-
//   Lieferung (catchUp-Flag fuer die Dialog-Ueberschrift, Punkt 6);
//   eine "letzter Lauf"-Persistenz braucht es nicht, weil faellig alles
//   ist, was den Zeitpunkt erreicht hat und offen/ungemutet/ungemeldet ist.
//
// Alle Abhaengigkeiten kommen injiziert (deps), damit die Logik ohne
// Electron unit-testbar ist:
//   areas()          -> Array { root } der offenen Bereichs-Apps
//   taskLines(root)  -> Roh-Task-Zeilen des Index oder null (nicht bereit)
//   buildEnv()       -> { enabled, globalFilter, statusTypeOf, defaultTime }
//   send(root, channel, payload) -> Zustellung an das Ziel-Fenster
//   now()            -> Date (Bezugszeitpunkt)
'use strict';

const { collectReminders, computeDue, localNowString } = require('../../shared/reminders');

const CHECK_INTERVAL_MS = 30000;

function createReminderChecker(deps) {
  const states = new Map(); // rootPath -> { reported, muted, deliveredOnce }
  let timer = null;

  function stateFor(root) {
    let st = states.get(root);
    if (!st) {
      st = { reported: new Set(), muted: new Set(), deliveredOnce: false };
      states.set(root, st);
    }
    return st;
  }

  // Ein Pruef-Lauf ueber alle offenen Bereiche. Fehler eines Bereichs
  // brechen den Takt nicht (Logging statt Absturz, Entwicklungsrichtlinie
  // Fehlerbehandlung).
  function tick() {
    let areas;
    try {
      areas = deps.areas();
    } catch (err) {
      console.warn('Erinnerungs-Pruefer: Bereichs-Aufzaehlung fehlgeschlagen:', err);
      return;
    }
    for (const area of areas || []) {
      try {
        checkArea(area.root);
      } catch (err) {
        console.warn(`Erinnerungs-Pruefer fehlgeschlagen (${area.root}):`, err);
      }
    }
  }

  function checkArea(root) {
    const env = deps.buildEnv();
    if (!env.enabled) return;
    const lines = deps.taskLines(root);
    if (lines == null) return; // Index (noch) nicht bereit
    const st = stateFor(root);
    const items = collectReminders(lines, env);
    const nowLocal = localNowString(deps.now());
    const due = computeDue(items, {
      nowLocal,
      reportedKeys: st.reported,
      mutedKeys: st.muted,
    });
    const catchUp = !st.deliveredOnce;
    st.deliveredOnce = true;
    if (due.length === 0) return;
    for (const item of due) st.reported.add(item.key);
    deps.send(root, 'reminders:due', { catchUp, items: due });
    deps.send(root, 'reminders:changed', {});
  }

  // Panel-Daten eines Bereichs: alle Anker mit Zustand. ready false,
  // solange der Index nicht bereit oder die Erweiterung aus ist.
  function list(root) {
    const env = deps.buildEnv();
    if (!env.enabled) return { ready: false, nowLocal: null, items: [] };
    const lines = deps.taskLines(root);
    if (lines == null) return { ready: false, nowLocal: null, items: [] };
    const st = stateFor(root);
    const nowLocal = localNowString(deps.now());
    const items = collectReminders(lines, env).map((it) => ({
      ...it,
      muted: st.muted.has(it.key),
      due: it.instant <= nowLocal,
    }));
    return { ready: true, nowLocal, items };
  }

  // Wegklicken aus dem Dialog: bis zum Neustart stumm (Workshop-Punkt 3).
  function mute(root, keys) {
    const st = stateFor(root);
    for (const key of Array.isArray(keys) ? keys : []) {
      if (typeof key === 'string') st.muted.add(key);
    }
    deps.send(root, 'reminders:changed', {});
  }

  // Wiederauslosung aus der Ueberfaellig-Sektion: Zustand loeschen und
  // sofort neu pruefen — der Anker feuert im selben Aufruf erneut.
  function retrigger(root, keys) {
    const st = stateFor(root);
    for (const key of Array.isArray(keys) ? keys : []) {
      st.muted.delete(key);
      st.reported.delete(key);
    }
    checkArea(root);
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, CHECK_INTERVAL_MS);
    // Der Timer darf ein Beenden der App nicht aufhalten.
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick, list, mute, retrigger };
}

module.exports = { createReminderChecker, CHECK_INTERVAL_MS };
