// 4T-002421 (Epic 3E-000366, Story 4S-001132): Der Zeitplan-Prüfer der
// Workflows im Hauptprozess.
//
// **Was er tut.** Im Takt der Erinnerungen (`CHECK_INTERVAL_MS`, 30 Sekunden)
// liest er je offenem Bereich die Workflow-Dateien aus der Index-Sicht, je Datei
// Dateikopf und Lauf-Stand aus der Begleitdatei (4T-002420), und stellt jede
// Fälligkeit über das Zustell-Register (`due-delivery.js`) an alle Fenster zu.
// Fällig ist ein Workflow mit `trigger: schedule`, lesbarem Zeitplan,
// Scharf-Zustand mit passender Prüfsumme und einem `nextDue`, das die lokale
// Wanduhr-Zeit erreicht hat. **Einen Lauf startet er nie selbst**; der Lauf
// gehört dem Fenster (Ausführungs-Entscheidung 1 der Konzept-Runde 4T-002418).
//
// **Zustellung an genau ein Fenster.** Das Register stellt an alle Fenster zu
// und lässt den ersten Anspruch gewinnen. Ein Fenster beansprucht nur, wenn
// seine Bereichs-Wurzel die der Fälligkeit ist und in ihm kein Workflow läuft;
// diese Prüfung liegt im Fenster VOR dem Anspruch (`claim` hier prüft die
// Wurzel zusätzlich, weil der Kanal eine Vertrauens-Grenze ist). Das Register
// selbst bleibt unverändert.
//
// **Schlüssel einer Fälligkeit** ist Pfad und Termin: Nach einem Lauf rückt
// `nextDue` vor, und derselbe Termin kann nicht zweimal laufen. Solange eine
// Fälligkeit beansprucht ist (der Lauf im Fenster dauert), stellt der Prüfer sie
// nicht erneut zu; eine nicht beanspruchte stellt er in jedem Takt erneut zu,
// damit ein belegtes Fenster sie beim nächsten Takt übernimmt (A2, AK5).
//
// **Pünktlich oder nachgeholt (2d).** Ein Termin ist verpasst, wenn er fällig
// wurde, während der Bereich nicht unter Beobachtung stand: bei der ersten
// Prüfung eines Bereichs nach seinem Öffnen, nach einer Lücke im Takt von mehr
// als `WATCH_GAP_MS` (etwa nach dem Ruhezustand des Rechners) und bei einem
// Termin vor der vorigen Prüfung. Sonst ist er pünktlich (Herkunft `schedule`).
// Verpasst mit `missed: run-once` läuft er einmal mit der Herkunft `catch-up`,
// auch bei mehreren verpassten Terminen; mit `missed: skip` verfällt er, und der
// Lauf-Stand vermerkt «verfallen» samt nächstem künftigen Termin.
//
// **Sofort-Prüfung beim Öffnen (2c).** `checkNewAreas` prüft jeden Bereich, der
// noch nie geprüft wurde, sofort; angestoßen wird es wie beim Erinnerungs-Prüfer
// über die Index-Invalidierung (`onBacklinksInvalidated` in app/wiring.js).
// Solange der Index nicht bereit ist, bleibt der Bereich ungeprüft, und die
// nächste Invalidierung (der fertige Aufbau) holt die Prüfung nach.
//
// **Fortschreiben (Punkt 4 des Tasks).** Meldet das Fenster das Ende eines
// Laufs nach Zeitplan (`finish`), setzt der Prüfer `nextDue` auf den nächsten
// künftigen Termin, gleich ob der Lauf gelungen, abgebrochen oder beendet ist.
// Schließt das Fenster mitten im Lauf, gilt der Lauf als abgebrochen und
// `nextDue` rückt ebenso vor, damit keine Schritte doppelt laufen.
//
// Alle Wirkungen kommen injiziert herein (Muster reminder-check.js); die Logik
// ist ohne Electron prüfbar. Takt, Sofort-Prüfung und Abschluss laufen strikt
// nacheinander, damit ein Takt nie einen gerade abgeschlossenen Termin erneut
// zustellt.
'use strict';

const path = require('node:path');
const { CHECK_INTERVAL_MS } = require('./reminder-check.js');
const { localNowString } = require('../../shared/reminders.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { readWorkflowDocument } = require('../../shared/workflows/workflow-document.js');
const {
  SCHEDULE_TRIGGER,
  nextScheduleDue,
} = require('../../shared/workflows/workflow-schedule.js');
const { ARMED_STATUS, armedStatus } = require('../workflows/workflow-run-state.js');

/** Größte Lücke zwischen zwei Prüfungen eines Bereichs, die noch als Beobachtung gilt. */
const WATCH_GAP_MS = 4 * CHECK_INTERVAL_MS;
/** Die Herkunft eines Laufs nach Zeitplan (Werte von `RUN_ORIGINS` in workflow-run-state.js). */
const ORIGIN_SCHEDULE = 'schedule';
const ORIGIN_CATCH_UP = 'catch-up';
const MISSED_SKIP = 'skip';

/**
 * Der Schlüssel einer Fälligkeit im Zustell-Register.
 *
 * @param {string} absPath absoluter Pfad der Workflow-Datei.
 * @param {string} due Termin `JJJJ-MM-TTTHH:MM`.
 * @returns {string}
 */
function scheduleKey(absPath, due) {
  return `workflow:${due}:${absPath}`;
}

/**
 * Gleiche Bereichs-Wurzel? Unter Windows ohne Rücksicht auf Groß- und
 * Kleinschreibung, weil derselbe Ort verschieden geschrieben ankommen kann.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameRoot(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false;
  // Vergleich ueber die Plattform-Eigenschaft statt einer Plattform-Abfrage (Erosions-Waechter).
  const norm = (p) => pathCompareKey(path.resolve(p));
  return norm(a) === norm(b);
}

/**
 * Baut den Zeitplan-Prüfer.
 *
 * @param {object} deps Bezüge der Verdrahtung (checkers.js).
 * @param {() => {root: string}[]} deps.areas offene Bereiche.
 * @param {(root: string) => {status: string, dateien: {absPath: string, relPath: string}[]}} deps.workflowFiles
 *   Index-Sicht `workflowFilesFor`.
 * @param {(absPath: string) => Promise<string|null>} deps.readText Text der Workflow-Datei.
 * @param {(absPath: string) => Promise<{stand: object|null, defekt: boolean}>} deps.readRunState
 *   Lauf-Stand aus der Begleitdatei.
 * @param {{setNextDue: Function, recordSkipped: Function}} deps.runState Schreibweg des Lauf-Stands.
 * @param {() => boolean} deps.enabled Ist die Erweiterung «Workflows» an?
 * @param {(payload: {catchUp: boolean, items: object[]}) => void} deps.deliver Zustellung an alle Fenster.
 * @param {(key: string) => boolean} deps.claimDelivery Anspruch im Zustell-Register.
 * @param {(key: string) => void} deps.releaseDelivery Anspruch im Register zurückgeben.
 * @param {(windowId: number) => boolean} deps.windowAlive Lebt das Fenster noch?
 * @param {() => Date} deps.now Uhr.
 * @param {(wall: string) => boolean} [deps.minuteExists] Prüfung der Wanduhr-Minute (Prüffälle).
 * @returns {object} start, stop, tick, checkNewAreas, claim, release, finish, isPending.
 */
function createWorkflowScheduleChecker(deps) {
  const areaStates = new Map(); // Bereichs-Wurzel -> { lastCheckMs }
  const pending = new Map(); // Schlüssel -> { item, claimedBy }
  const rechenOptionen = deps.minuteExists ? { minuteExists: deps.minuteExists } : {};
  let timer = null;
  let kette = Promise.resolve();
  let tickGeplant = null;
  let neueGeplant = null;

  // Strikt nacheinander; ein Fehler bricht die Reihe nicht.
  function reihe(fn) {
    const lauf = kette.then(fn);
    kette = lauf.catch((err) => console.warn('Zeitplan-Prüfer:', err));
    return lauf;
  }

  function naechsterTermin(rule, ab) {
    return nextScheduleDue(rule, ab, rechenOptionen);
  }

  // Die Fälligkeit einer Workflow-Datei oder null.
  async function bewerte(datei, jetztWand) {
    const text = await deps.readText(datei.absPath);
    if (typeof text !== 'string') return null;
    const doc = readWorkflowDocument(text, { fileName: path.basename(datei.absPath) });
    if (!doc.isWorkflow || doc.meta.trigger !== SCHEDULE_TRIGGER || !doc.meta.schedule) return null;
    const { stand, defekt } = await deps.readRunState(datei.absPath);
    if (defekt || !stand || !stand.armed) return null;
    // Eine geänderte Definition ist nicht scharf (2e, AK4).
    if (armedStatus(stand.armed, text) !== ARMED_STATUS.armed) return null;
    if (!stand.nextDue) {
      // Scharf ohne Termin (etwa ein von Hand geschriebener Lauf-Stand): den
      // nächsten künftigen Termin setzen, ohne zu laufen.
      const termin = naechsterTermin(doc.meta.schedule, jetztWand);
      if (termin) await deps.runState.setNextDue(null, datei.absPath, termin);
      return null;
    }
    if (stand.nextDue > jetztWand) return null;
    return {
      absPath: datei.absPath,
      relPath: datei.relPath,
      name: doc.meta.name,
      missed: doc.meta.missed,
      rule: doc.meta.schedule,
      due: stand.nextDue,
    };
  }

  // Ein Lauf ist zu Ende (oder sein Fenster ist fort): `nextDue` vorrücken.
  async function abschliessen(key) {
    const eintrag = pending.get(key);
    if (!eintrag) return;
    pending.delete(key);
    const { path: absPath, due } = eintrag.item;
    const text = await deps.readText(absPath);
    if (typeof text !== 'string') return;
    const doc = readWorkflowDocument(text, { fileName: path.basename(absPath) });
    if (!doc.isWorkflow || !doc.meta.schedule) return;
    const { stand } = await deps.readRunState(absPath);
    // Nur den Termin dieses Laufs fortschreiben; ein inzwischen anders
    // gesetzter Termin (neue Scharf-Schaltung) bleibt stehen.
    if (!stand || stand.nextDue !== due) return;
    const termin = naechsterTermin(doc.meta.schedule, localNowString(deps.now()));
    await deps.runState.setNextDue(null, absPath, termin);
  }

  // Verpasst mit `missed: skip`: vermerken und den nächsten Termin setzen.
  async function verfallen(faellig, jetztWand) {
    const termin = naechsterTermin(faellig.rule, jetztWand);
    await deps.runState.recordSkipped(null, faellig.absPath, { due: faellig.due, nextDue: termin });
  }

  async function pruefeBereich(root) {
    const sicht = deps.workflowFiles(root);
    if (!sicht || sicht.status !== 'ready') return [];
    let st = areaStates.get(root);
    if (!st) {
      st = { lastCheckMs: null };
      areaStates.set(root, st);
    }
    const jetzt = deps.now();
    const jetztMs = jetzt.getTime();
    const jetztWand = localNowString(jetzt);
    const vorher = st.lastCheckMs;
    const beobachtet = vorher !== null && jetztMs - vorher <= WATCH_GAP_MS;
    const vorherWand = vorher === null ? null : localNowString(new Date(vorher));
    st.lastCheckMs = jetztMs;

    const zuzustellen = [];
    const gesehen = new Set();
    for (const datei of sicht.dateien) {
      const faellig = await bewerte(datei, jetztWand);
      if (!faellig) continue;
      const key = scheduleKey(faellig.absPath, faellig.due);
      gesehen.add(key);
      const bisher = pending.get(key);
      if (bisher) {
        if (bisher.claimedBy === null) zuzustellen.push(bisher.item);
        else if (!deps.windowAlive(bisher.claimedBy)) await abschliessen(key);
        continue;
      }
      const puenktlich = beobachtet && faellig.due >= vorherWand;
      if (!puenktlich && faellig.missed === MISSED_SKIP) {
        await verfallen(faellig, jetztWand);
        continue;
      }
      const item = {
        key,
        root,
        path: faellig.absPath,
        relPath: faellig.relPath,
        name: faellig.name,
        origin: puenktlich ? ORIGIN_SCHEDULE : ORIGIN_CATCH_UP,
        due: faellig.due,
      };
      pending.set(key, { item, claimedBy: null });
      zuzustellen.push(item);
    }
    // Was nicht mehr fällig ist (Termin vorgerückt, nicht mehr scharf), fällt
    // heraus; ein laufender Anspruch bleibt, bis sein Fenster das Ende meldet.
    for (const [key, eintrag] of [...pending.entries()]) {
      if (eintrag.item.root !== root || gesehen.has(key)) continue;
      if (eintrag.claimedBy === null || !deps.windowAlive(eintrag.claimedBy)) pending.delete(key);
    }
    return zuzustellen;
  }

  function stelleZu(items) {
    if (items.length === 0) return;
    deps.deliver({ catchUp: items.some((i) => i.origin === ORIGIN_CATCH_UP), items });
  }

  function offeneBereiche() {
    let areas;
    try {
      areas = deps.areas();
    } catch (err) {
      console.warn('Zeitplan-Prüfer: Bereichs-Aufzählung fehlgeschlagen:', err);
      return null;
    }
    const wurzeln = [...new Set((areas || []).map((a) => a && a.root).filter(Boolean))];
    // Geschlossene Bereiche vergessen: Beim nächsten Öffnen beginnt die
    // Beobachtung neu, und Verpasstes wird nachgeholt.
    for (const root of [...areaStates.keys()]) {
      if (!wurzeln.includes(root)) areaStates.delete(root);
    }
    for (const [key, eintrag] of [...pending.entries()]) {
      if (!wurzeln.includes(eintrag.item.root) && eintrag.claimedBy === null) pending.delete(key);
    }
    return wurzeln;
  }

  async function pruefe(nurNeue) {
    if (!deps.enabled()) return;
    const wurzeln = offeneBereiche();
    if (!wurzeln) return;
    const items = [];
    for (const root of wurzeln) {
      const st = areaStates.get(root);
      if (nurNeue && st && st.lastCheckMs !== null) continue;
      try {
        items.push(...(await pruefeBereich(root)));
      } catch (err) {
        console.warn(`Zeitplan-Prüfer fehlgeschlagen (${root}):`, err);
      }
    }
    stelleZu(items);
  }

  /** Ein Takt über alle offenen Bereiche; ein geplanter Takt wird nicht verdoppelt. */
  function tick() {
    if (!tickGeplant) {
      tickGeplant = reihe(() => {
        tickGeplant = null;
        return pruefe(false);
      });
    }
    return tickGeplant;
  }

  /** Sofort-Prüfung der Bereiche, die noch nie geprüft wurden (2c). */
  function checkNewAreas() {
    if (!neueGeplant) {
      neueGeplant = reihe(() => {
        neueGeplant = null;
        return pruefe(true);
      });
    }
    return neueGeplant;
  }

  /**
   * Anspruch eines Fensters auf eine Fälligkeit. Gewährt nur bei
   * eingeschalteter Erweiterung, offener und nicht beanspruchter Fälligkeit,
   * gleicher Bereichs-Wurzel und gewährtem Anspruch im Register.
   *
   * @param {string} key Schlüssel der Fälligkeit.
   * @param {{root: string, windowId: number}} fenster Bereichs-Wurzel und Kennung des Fensters.
   * @returns {boolean}
   */
  function claim(key, fenster) {
    if (!deps.enabled()) return false;
    const eintrag = pending.get(key);
    if (!eintrag || eintrag.claimedBy !== null) return false;
    if (!fenster || !sameRoot(eintrag.item.root, fenster.root)) return false;
    if (!deps.claimDelivery(key)) return false;
    eintrag.claimedBy = fenster.windowId;
    return true;
  }

  /**
   * Das Fenster konnte nach dem Anspruch nicht starten (inzwischen belegt): Die
   * Fälligkeit wird im nächsten Takt erneut zugestellt.
   *
   * @param {string} key
   * @param {number} windowId
   * @returns {boolean} true, wenn der Anspruch dieses Fensters zurückgegeben ist.
   */
  function release(key, windowId) {
    const eintrag = pending.get(key);
    if (!eintrag || eintrag.claimedBy !== windowId) return false;
    eintrag.claimedBy = null;
    deps.releaseDelivery(key);
    return true;
  }

  /**
   * Das Fenster meldet das Ende seines Laufs nach Zeitplan; `nextDue` rückt vor.
   *
   * @param {string} key
   * @param {number} windowId
   * @returns {Promise<boolean>} true, wenn der Anspruch dieses Fensters abgeschlossen ist.
   */
  function finish(key, windowId) {
    const eintrag = pending.get(key);
    if (!eintrag || eintrag.claimedBy !== windowId) return Promise.resolve(false);
    return reihe(async () => {
      await abschliessen(key);
      return true;
    });
  }

  /**
   * Ist die Fälligkeit offen und nicht beansprucht? (`stillOpen` des Registers.)
   *
   * @param {string} key
   * @returns {boolean}
   */
  function isPending(key) {
    const eintrag = pending.get(key);
    return !!eintrag && eintrag.claimedBy === null;
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
    // Der Takt darf ein Beenden der App nicht aufhalten.
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick, checkNewAreas, claim, release, finish, isPending };
}

module.exports = {
  WATCH_GAP_MS,
  createWorkflowScheduleChecker,
  sameRoot,
  scheduleKey,
};
