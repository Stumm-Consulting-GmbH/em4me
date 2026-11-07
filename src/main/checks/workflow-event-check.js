// 4T-002460 (Epic 3E-000367, Story 4S-001143): Der Ereignis-Prüfer der
// Workflows im Hauptprozess.
//
// **Was er tut.** Er nimmt Meldungen aus sechs Quellen entgegen (3a der
// Konzept-Runde 4T-002458), gleicht jedes Ereignis gegen die scharfen
// Workflows des Bereichs mit `trigger: event` ab und stellt jede Fälligkeit
// über das Zustell-Register (`due-delivery.js`) an genau ein Fenster des
// Bereichs zu. **Einen Lauf startet er nie selbst**; der Lauf gehört dem
// Fenster mit allen Regeln A1 bis A5 (Ausführungs-Entscheidung 1).
//
// **Quellen** (alle über `meldeWorkflowEreignis`, die Sammelstelle unten):
//   file-created, file-changed  Index-Beobachter des Bereichs (index/build.js,
//                               chokidar `add`/`change`, Schreib-Abschluss
//                               200 ms); `unlink` hebt ein noch entprelltes
//                               Ereignis derselben Datei auf.
//   file-moved                  Umbenennen und Verschieben in der Anwendung
//                               (renameSingleFile in documents/link-update.js,
//                               der eine Weg aller Bewegungen der Anwendung).
//   area-opened                 `checkNewAreas` nach fertigem Index, angestoßen
//                               über die Index-Invalidierung wie beim
//                               Zeitplan-Prüfer.
//   reminder-due                Zustellung fälliger Erinnerungen (checkers.js),
//                               ohne Nachhol-Lieferung beim Öffnen.
//   task-done                   **Eintritts-Stelle für 4T-002462:** der Baustein
//                               «Aufgabe erledigt» meldet
//                               `meldeWorkflowEreignis({ type: 'task-done',
//                               path, task, root? })`; hier ist nichts weiter
//                               zu tun.
//
// **Entprellung (3e).** Meldungen derselben Datei, die weniger als
// `ENTPRELL_MS` (2 Sekunden) auseinander liegen, ergeben ein Ereignis; es
// fällt 2 Sekunden nach der letzten Meldung, spätestens
// `ENTPRELL_HOECHSTENS_MS` nach der ersten, damit eine fortlaufend
// beschriebene Datei nicht nie auslöst. Treffen verschiedene Arten zusammen,
// gilt `file-moved` vor `file-created` vor `file-changed`: Eine in der
// Anwendung verschobene Datei meldet der Beobachter am neuen Ort zusätzlich als
// angelegt, und eine frisch angelegte meldet er oft gleich danach als geändert.
// Die übrigen Ereignisse sind keine Datei-Meldungen und werden nicht entprellt.
//
// **Reichweite (3e).** Nur Bereiche, die in einem Fenster geöffnet sind;
// Begleitdateien (alle Markdown-Data-Endungen), der Sperr-Ordner der
// Bereichs-Wurzel und alles unter einem Punkt-Ordner oder mit Punkt-Namen
// lösen nie aus. **Kein Nachholen:** Was geschah, während der Bereich
// geschlossen war, löst nichts aus; ein Schließen verwirft die wartenden
// Fälligkeiten des Bereichs.
//
// **Warteschlange je Bereich** (Ausführungs-Entscheidung 1, A2). Die
// Fälligkeiten eines Bereichs laufen strikt nacheinander in der Reihenfolge der
// Ereignisse; zugestellt wird immer nur die erste. Ist das Fenster belegt,
// bleibt sie stehen und wird im Takt `WARTE_TAKT_MS` erneut zugestellt; nach
// dem Ende eines Laufs (`finish`) kommt sofort die nächste. Ein Ereignis, auf
// das mehrere Workflows passen, ergibt je Workflow eine Fälligkeit, in der
// Reihenfolge ihrer Pfade.
//
// **Ketten-Schutz (3d), 4T-002461 (Story 4S-001144).** `deps.istLaufSchreibvorgang`
// bekommt jede Meldung vor allem anderen; liefert er `true` (Schreibvorgang
// eines Workflow-Laufs, erkannt an der Lauf-Marke in documents/self-write.js),
// wird sie verworfen. Er darf ein Versprechen liefern, wenn er die Datei lesen
// muss; dann warten alle folgenden Meldungen in einer Reihe dahinter, damit ihre
// Reihenfolge erhalten bleibt (ein `unlink` überholt so nie das `add` davor).
// `deps.darfEinreihen` bekommt jede Fälligkeit vor dem Einreihen und antwortet
// mit `true` (einreihen), `false` (verwerfen) oder `{ brake }` (Not-Bremse
// hat gegriffen), auch als Versprechen. Die Not-Bremse baut `createEventBrake`
// unten: Mehr als `BREMSE_GRENZE` Läufe desselben Workflows in
// `BREMSE_FENSTER_MS` entschärfen ihn; die Fälligkeit, an der sie greift, läuft
// nicht, sondern geht als Brems-Meldung (`brake`) an genau ein Fenster des
// Bereichs, und die noch wartenden Fälligkeiten desselben Workflows verfallen.
//
// Alle Wirkungen kommen injiziert herein (Muster workflow-schedule-check.js);
// die Logik ist ohne Electron prüfbar. Die Auswertung der Ereignisse läuft
// strikt nacheinander, damit die Reihenfolge der Fälligkeiten der der
// Ereignisse folgt.
'use strict';

const path = require('node:path');
const { pathCompareKey } = require('../../shared/platform.js');
const { isMarkdownDataPath } = require('../../shared/markdown-data-family.js');
const { DEFAULT_LOCK_FOLDER_NAME } = require('../../shared/database/lock-folder-name.js');
const { isInsideArea } = require('../area/area-path.js');
const { istImSperrOrdner } = require('../area/area-watch-ignore.js');
const { readWorkflowDocument } = require('../../shared/workflows/workflow-document.js');
const {
  EVENT_TRIGGER,
  EVENT_TYPES,
  eventMatches,
} = require('../../shared/workflows/workflow-event.js');
const { ARMED_STATUS, armedStatus } = require('../workflows/workflow-run-state.js');
const { sameRoot } = require('./workflow-schedule-check.js');

/** Meldungen derselben Datei mit kleinerem Abstand ergeben ein Ereignis (3e). */
const ENTPRELL_MS = 2000;
/** Spätestens so lange nach der ersten Meldung fällt das entprellte Ereignis. */
const ENTPRELL_HOECHSTENS_MS = 10000;
/** Takt, in dem eine nicht beanspruchte Fälligkeit erneut zugestellt wird. */
const WARTE_TAKT_MS = 2000;
/** Die Herkunft eines Laufs nach Ereignis (Wert von `RUN_ORIGINS`). */
const ORIGIN_EVENT = 'event';
/** Not-Bremse (3d): höchstens so viele Läufe desselben Workflows im Fenster ... */
const BREMSE_GRENZE = 20;
/** ... von dieser Länge (5 Minuten). */
const BREMSE_FENSTER_MS = 5 * 60 * 1000;
/** Interne Meldung des Beobachters: Datei entfernt. Kein Ereignis. */
const MELDUNG_ENTFERNT = 'unlink';

const DATEI_EREIGNISSE = Object.freeze(['file-created', 'file-changed', 'file-moved']);
const VORRANG = Object.freeze({ 'file-changed': 1, 'file-created': 2, 'file-moved': 3 });

// --- Sammelstelle der Quellen -------------------------------------------------

// Die Quellen (Index-Beobachter, Bewegungen der Anwendung, später «Aufgabe
// erledigt») kennen den Prüfer nicht; sie melden hierher, und der Aufbau in
// checkers.js meldet den Prüfer an. Ohne angemeldeten Prüfer verfällt eine
// Meldung still.
const abonnenten = new Set();

/**
 * Meldet ein Geschehen an den Ereignis-Prüfer.
 *
 * @param {{type: string, path?: string, from?: string, task?: string, root?: string}} meldung
 *   `type` aus `EVENT_TYPES` oder `unlink`; Pfade absolut; `root` grenzt auf
 *   einen Bereich ein (sonst jeder offene Bereich, der die Datei enthält).
 */
function meldeWorkflowEreignis(meldung) {
  for (const fn of abonnenten) {
    try {
      fn(meldung);
    } catch (err) {
      console.warn('Ereignis-Prüfer: Meldung fehlgeschlagen:', err);
    }
  }
}

/**
 * Meldet einen Empfänger der Ereignisse an.
 *
 * @param {(meldung: object) => void} fn
 * @returns {() => void} Abmeldung.
 */
function abonniereWorkflowEreignisse(fn) {
  abonnenten.add(fn);
  return () => abonnenten.delete(fn);
}

// --- Not-Bremse (4T-002461) -----------------------------------------------------

/**
 * Baut die Not-Bremse der Ereignis-Läufe (3d) für die Eintritts-Stelle
 * `darfEinreihen` des Prüfers.
 *
 * Gezählt wird je Workflow-Datei jede eingereihte Fälligkeit nach Ereignis, im
 * gleitenden Fenster `BREMSE_FENSTER_MS`. Die ersten `BREMSE_GRENZE` laufen; an
 * der nächsten greift die Bremse, BEVOR sie läuft: `entschaerfe` nimmt den
 * Scharf-Zustand im Lauf-Stand zurück und vermerkt den Grund, erst danach
 * antwortet die Bremse (der Prüfer wertet strikt nacheinander aus, und ein
 * folgendes Ereignis findet den Workflow schon entschärft). Danach beginnt die
 * Zählung neu, damit ein wieder scharf geschalteter Workflow frisch anfängt.
 *
 * @param {object} deps
 * @param {(item: object, brake: {limit: number, minutes: number}) => Promise<*>} deps.entschaerfe
 * @param {() => number} [deps.now] Uhr (Prüffälle).
 * @returns {{darfEinreihen: (item: object) => (boolean|Promise<{brake: object}>)}}
 */
function createEventBrake(deps) {
  const jetzt = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const zeiten = new Map(); // Pfad-Schlüssel -> Zeitpunkte der gezählten Läufe

  function darfEinreihen(item) {
    if (!item || typeof item.path !== 'string') return true;
    const t = jetzt();
    for (const [schluessel, liste] of [...zeiten.entries()]) {
      const frisch = liste.filter((z) => t - z < BREMSE_FENSTER_MS);
      if (frisch.length === 0) zeiten.delete(schluessel);
      else zeiten.set(schluessel, frisch);
    }
    const schluessel = pathCompareKey(path.resolve(item.path));
    const liste = zeiten.get(schluessel) || [];
    if (liste.length < BREMSE_GRENZE) {
      liste.push(t);
      zeiten.set(schluessel, liste);
      return true;
    }
    zeiten.delete(schluessel);
    const brake = { limit: BREMSE_GRENZE, minutes: BREMSE_FENSTER_MS / 60000 };
    return Promise.resolve()
      .then(() => deps.entschaerfe(item, brake))
      .catch((err) => console.warn('Ereignis-Prüfer: Entschärfen fehlgeschlagen:', err))
      .then(() => ({ brake }));
  }

  return { darfEinreihen };
}

// --- Hilfen ---------------------------------------------------------------------

const istVersprechen = (wert) => !!wert && typeof wert.then === 'function';

const wurzelSchluessel = (root) => pathCompareKey(path.resolve(root));

// Pfad relativ zur Bereichs-Wurzel mit `/`, wie `{{file}}` und das Journal.
function relativ(root, abs) {
  return path.relative(path.resolve(root), path.resolve(abs)).split(path.sep).join('/');
}

// Begleitdatei oder Punkt-Ordner/-Name irgendwo im Pfad unter der Wurzel?
function ausgeschlossen(rel, abs) {
  if (isMarkdownDataPath(abs)) return true;
  return rel.split('/').some((teil) => teil.startsWith('.'));
}

/**
 * Baut den Ereignis-Prüfer.
 *
 * @param {object} deps Bezüge der Verdrahtung (checkers.js).
 * @param {() => {root: string}[]} deps.areas offene Bereiche.
 * @param {(root: string) => {status: string, dateien: {absPath: string, relPath: string}[]}} deps.workflowFiles
 *   Index-Sicht `workflowFilesFor`.
 * @param {(absPath: string) => Promise<string|null>} deps.readText Text der Workflow-Datei.
 * @param {(absPath: string) => Promise<{stand: object|null, defekt: boolean}>} deps.readRunState
 *   Lauf-Stand aus der Begleitdatei.
 * @param {() => boolean} deps.enabled Ist die Erweiterung «Workflows» an?
 * @param {(payload: {catchUp: boolean, items: object[]}) => void} deps.deliver Zustellung an alle Fenster.
 * @param {(key: string) => boolean} deps.claimDelivery Anspruch im Zustell-Register.
 * @param {(key: string) => void} deps.releaseDelivery Anspruch im Register zurückgeben.
 * @param {(windowId: number) => boolean} deps.windowAlive Lebt das Fenster noch?
 * @param {(root: string) => (Promise<string>|string)} [deps.sperrOrdnerName] wirksamer
 *   Name des Sperr-Ordners; ohne ihn gilt der Vorgabe-Name.
 * @param {(meldung: object) => (boolean|Promise<boolean>)} [deps.istLaufSchreibvorgang]
 *   Ketten-Schutz (4T-002461): Schreibvorgang eines Workflow-Laufs?
 * @param {(item: object) => (boolean|object|Promise<boolean|object>)} [deps.darfEinreihen]
 *   Not-Bremse (4T-002461): `true`, `false` oder `{ brake }`.
 * @returns {object} report, checkNewAreas, claim, release, finish, isPending, idle, stop.
 */
function createWorkflowEventChecker(deps) {
  const istLaufSchreibvorgang =
    typeof deps.istLaufSchreibvorgang === 'function' ? deps.istLaufSchreibvorgang : () => false;
  const darfEinreihen = typeof deps.darfEinreihen === 'function' ? deps.darfEinreihen : () => true;
  const entprellung = new Map(); // Wurzel+Datei -> { root, ereignis, erste, timer }
  const schlangen = new Map(); // Wurzel-Schlüssel -> { root, eintraege: [{ item, claimedBy }], zugestellt }
  const bekannteBereiche = new Set(); // Wurzel-Schlüssel der gesehenen Öffnungen (area-opened)
  let folge = 0;
  let kette = Promise.resolve();
  let meldungsKette = Promise.resolve(); // Meldungen mit gelesener Lauf-Marke, in Reihe
  let wartendeMeldungen = 0;
  let takt = null;
  let neueGeplant = null;

  // Strikt nacheinander; ein Fehler bricht die Reihe nicht.
  function reihe(fn) {
    const lauf = kette.then(fn);
    kette = lauf.catch((err) => console.warn('Ereignis-Prüfer:', err));
    return lauf;
  }

  // Die offenen Bereiche; räumt zugleich, was zu geschlossenen gehört.
  function offeneBereiche() {
    let areas;
    try {
      areas = deps.areas();
    } catch (err) {
      console.warn('Ereignis-Prüfer: Bereichs-Aufzählung fehlgeschlagen:', err);
      return null;
    }
    const wurzeln = [...new Set((areas || []).map((a) => a && a.root).filter(Boolean))];
    const offen = new Set(wurzeln.map(wurzelSchluessel));
    for (const schluessel of [...bekannteBereiche]) {
      if (!offen.has(schluessel)) bekannteBereiche.delete(schluessel);
    }
    for (const [schluessel, e] of [...entprellung.entries()]) {
      if (offen.has(wurzelSchluessel(e.root))) continue;
      clearTimeout(e.timer);
      entprellung.delete(schluessel);
    }
    for (const [schluessel, schlange] of [...schlangen.entries()]) {
      if (offen.has(schluessel)) continue;
      // Kein Nachholen: Wartendes verfällt; ein laufender Anspruch bleibt, bis
      // sein Fenster das Ende meldet.
      const kopf = schlange.eintraege[0];
      if (kopf && kopf.claimedBy !== null && deps.windowAlive(kopf.claimedBy)) {
        schlange.eintraege = [kopf];
      } else {
        schlangen.delete(schluessel);
      }
    }
    return wurzeln;
  }

  // Die offenen Bereiche, in denen die Meldung wirkt.
  function wurzelnFuer(meldung, abs) {
    const wurzeln = offeneBereiche() || [];
    if (typeof meldung.root === 'string' && meldung.root !== '') {
      return wurzeln.filter((r) => sameRoot(r, meldung.root) && (!abs || isInsideArea(r, abs)));
    }
    return abs ? wurzeln.filter((r) => isInsideArea(r, abs)) : [];
  }

  // Das Ereignis im Bereich `root` oder null, wenn die Datei nicht auslösen darf.
  function ereignisIm(root, meldung, abs) {
    const rel = relativ(root, abs);
    if (rel === '' || ausgeschlossen(rel, abs)) return null;
    const ereignis = { type: meldung.type, path: abs, relPath: rel, from: null, task: null };
    if (typeof meldung.from === 'string' && meldung.from !== '') {
      ereignis.from = path.resolve(meldung.from);
    }
    if (typeof meldung.task === 'string') ereignis.task = meldung.task;
    return ereignis;
  }

  function entprelle(root, ereignis) {
    const schluessel = `${wurzelSchluessel(root)}\u0000${pathCompareKey(ereignis.path)}`;
    const bisher = entprellung.get(schluessel);
    if (ereignis.type === MELDUNG_ENTFERNT) {
      if (bisher) {
        clearTimeout(bisher.timer);
        entprellung.delete(schluessel);
      }
      return;
    }
    const jetzt = Date.now();
    const e = bisher || { root, ereignis, erste: jetzt, timer: null };
    if (bisher) {
      if (VORRANG[ereignis.type] > VORRANG[bisher.ereignis.type]) e.ereignis = ereignis;
      clearTimeout(bisher.timer);
    } else {
      entprellung.set(schluessel, e);
    }
    const warte = Math.max(0, Math.min(ENTPRELL_MS, e.erste + ENTPRELL_HOECHSTENS_MS - jetzt));
    e.timer = setTimeout(() => {
      entprellung.delete(schluessel);
      void ausloesen(e.root, e.ereignis);
    }, warte);
    if (typeof e.timer.unref === 'function') e.timer.unref();
  }

  /**
   * Nimmt eine Meldung einer Quelle entgegen (über `meldeWorkflowEreignis`).
   *
   * @param {{type: string, path?: string, from?: string, task?: string, root?: string}} meldung
   */
  function report(meldung) {
    if (!meldung || typeof meldung !== 'object') return;
    const typ = meldung.type;
    // `area-opened` entsteht allein in checkNewAreas, nach fertigem Index.
    if (typ === 'area-opened') return;
    if (typ !== MELDUNG_ENTFERNT && !EVENT_TYPES.includes(typ)) return;
    if (!deps.enabled()) return;
    // Ketten-Schutz (3d, 4T-002461): erst die Lauf-Marke, dann alles andere.
    let urteil;
    try {
      urteil = istLaufSchreibvorgang(meldung);
    } catch (err) {
      console.warn('Ereignis-Prüfer: Lauf-Marke nicht geprüft:', err);
      urteil = false;
    }
    if (wartendeMeldungen === 0 && !istVersprechen(urteil)) {
      if (!urteil) verarbeite(meldung);
      return;
    }
    wartendeMeldungen += 1;
    meldungsKette = meldungsKette
      .then(async () => {
        let lauf = false;
        try {
          lauf = await urteil;
        } catch (err) {
          console.warn('Ereignis-Prüfer: Lauf-Marke nicht geprüft:', err);
        }
        if (!lauf) verarbeite(meldung);
      })
      .catch((err) => console.warn('Ereignis-Prüfer:', err))
      .finally(() => {
        wartendeMeldungen -= 1;
      });
  }

  // Eine Meldung, die nicht von einem Workflow-Lauf stammt.
  function verarbeite(meldung) {
    const typ = meldung.type;
    if (typeof meldung.path !== 'string' || meldung.path === '') return;
    const abs = path.resolve(meldung.path);
    for (const root of wurzelnFuer(meldung, abs)) {
      const ereignis = ereignisIm(root, meldung, abs);
      if (!ereignis) continue;
      if (typ === MELDUNG_ENTFERNT || DATEI_EREIGNISSE.includes(typ)) entprelle(root, ereignis);
      else void ausloesen(root, ereignis);
    }
  }

  // Passt der Workflow (scharf, passende Prüfsumme, Regel trifft)? Name oder null.
  async function passt(datei, ereignis) {
    const text = await deps.readText(datei.absPath);
    if (typeof text !== 'string') return null;
    const doc = readWorkflowDocument(text, { fileName: path.basename(datei.absPath) });
    if (!doc.isWorkflow || doc.meta.trigger !== EVENT_TRIGGER || !doc.meta.event) return null;
    if (!eventMatches(doc.meta.event, { type: ereignis.type, path: ereignis.relPath })) {
      return null;
    }
    const { stand, defekt } = await deps.readRunState(datei.absPath);
    if (defekt || !stand || !stand.armed) return null;
    // Eine geänderte Definition ist nicht scharf (AK6).
    if (armedStatus(stand.armed, text) !== ARMED_STATUS.armed) return null;
    return doc.meta.name;
  }

  function schlangeVon(root) {
    const schluessel = wurzelSchluessel(root);
    let schlange = schlangen.get(schluessel);
    if (!schlange) {
      schlange = { root, eintraege: [], zugestellt: null };
      schlangen.set(schluessel, schlange);
    }
    return schlange;
  }

  // Wertet ein Ereignis aus und reiht die Fälligkeiten ein (nicht verkettet).
  async function werteAus(root, ereignis) {
    if (!deps.enabled()) return;
    const wurzeln = offeneBereiche();
    if (!wurzeln || !wurzeln.some((r) => sameRoot(r, root))) return;
    if (ereignis.path) {
      const sperr = await sperrOrdnerVon(root);
      if (istImSperrOrdner(root, sperr, ereignis.path)) return;
    }
    const sicht = deps.workflowFiles(root);
    if (!sicht || sicht.status !== 'ready') return;
    const dateien = [...sicht.dateien].sort((a, b) =>
      a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0,
    );
    for (const datei of dateien) {
      let name = null;
      try {
        name = await passt(datei, ereignis);
      } catch (err) {
        console.warn(`Ereignis-Prüfer: Workflow nicht lesbar (${datei.absPath}):`, err);
      }
      if (!name) continue;
      folge += 1;
      const item = {
        key: `event:${folge}:${datei.absPath}`,
        root,
        path: datei.absPath,
        relPath: datei.relPath,
        name,
        origin: ORIGIN_EVENT,
        event: {
          type: ereignis.type,
          file: ereignis.path || null,
          from: ereignis.from || null,
          task: ereignis.task === null || ereignis.task === undefined ? null : ereignis.task,
        },
      };
      // Not-Bremse (3d, 4T-002461).
      const urteil = await darfEinreihen(item);
      if (urteil && typeof urteil === 'object' && urteil.brake) {
        verwirfWartendeVon(item.path);
        const bremsMeldung = { ...item, brake: urteil.brake };
        schlangeVon(root).eintraege.push({ item: bremsMeldung, claimedBy: null });
        continue;
      }
      if (!urteil) continue;
      schlangeVon(root).eintraege.push({ item, claimedBy: null });
    }
    pumpe();
  }

  // Not-Bremse: Die noch nicht beanspruchten Fälligkeiten eines Workflows
  // verfallen; ein laufender Anspruch bleibt bis zu seiner Ende-Meldung.
  function verwirfWartendeVon(workflowAbs) {
    const schluessel = pathCompareKey(path.resolve(workflowAbs));
    for (const schlange of schlangen.values()) {
      schlange.eintraege = schlange.eintraege.filter(
        (e) => e.claimedBy !== null || pathCompareKey(path.resolve(e.item.path)) !== schluessel,
      );
    }
  }

  function ausloesen(root, ereignis) {
    return reihe(() => werteAus(root, ereignis));
  }

  async function sperrOrdnerVon(root) {
    if (typeof deps.sperrOrdnerName !== 'function') return DEFAULT_LOCK_FOLDER_NAME;
    try {
      const name = await deps.sperrOrdnerName(root);
      return typeof name === 'string' && name !== '' ? name : DEFAULT_LOCK_FOLDER_NAME;
    } catch (err) {
      console.warn('Ereignis-Prüfer: Name des Sperr-Ordners nicht bezogen:', err);
      return DEFAULT_LOCK_FOLDER_NAME;
    }
  }

  // Stellt je Bereich die erste Fälligkeit zu, wenn sie neu an der Spitze steht
  // (oder `erneut` gesetzt ist); ein verlassener Anspruch gilt als beendet.
  function pumpe(erneut = false) {
    const items = [];
    for (const [schluessel, schlange] of [...schlangen.entries()]) {
      let kopf = schlange.eintraege[0];
      while (kopf && kopf.claimedBy !== null && !deps.windowAlive(kopf.claimedBy)) {
        // Fenster mitten im Lauf geschlossen: der Lauf gilt als abgebrochen.
        schlange.eintraege.shift();
        kopf = schlange.eintraege[0];
      }
      if (!kopf) {
        schlangen.delete(schluessel);
        continue;
      }
      if (kopf.claimedBy !== null) continue;
      if (erneut || schlange.zugestellt !== kopf.item.key) {
        schlange.zugestellt = kopf.item.key;
        items.push(kopf.item);
      }
    }
    if (items.length > 0) deps.deliver({ catchUp: false, items });
    plane();
  }

  // Im Aus-Zustand der Erweiterung gibt es keine Ereignisse (AK6): Was noch
  // wartet oder entprellt wird, verfällt und läuft auch nach dem Einschalten
  // nicht nach; ein laufender Anspruch bleibt bis zu seiner Ende-Meldung.
  function verwirfWartendes() {
    for (const e of entprellung.values()) clearTimeout(e.timer);
    entprellung.clear();
    for (const [schluessel, schlange] of [...schlangen.entries()]) {
      const kopf = schlange.eintraege[0];
      if (kopf && kopf.claimedBy !== null) schlange.eintraege = [kopf];
      else schlangen.delete(schluessel);
    }
  }

  // Der Warte-Takt läuft nur, solange etwas wartet.
  function plane() {
    if (schlangen.size === 0) {
      if (takt) clearTimeout(takt);
      takt = null;
      return;
    }
    if (takt) return;
    takt = setTimeout(() => {
      takt = null;
      if (!deps.enabled()) verwirfWartendes();
      offeneBereiche();
      pumpe(true);
    }, WARTE_TAKT_MS);
    if (typeof takt.unref === 'function') takt.unref();
  }

  /**
   * Bereich geöffnet (3a): jeder offene Bereich, der seit seinem Öffnen noch
   * nicht gesehen wurde und dessen Index bereit ist, löst `area-opened` aus.
   * Angestoßen über die Index-Invalidierung; ein noch nicht bereiter Index
   * wartet auf die nächste.
   *
   * @returns {Promise<void>}
   */
  function checkNewAreas() {
    if (!neueGeplant) {
      neueGeplant = reihe(async () => {
        neueGeplant = null;
        const wurzeln = offeneBereiche();
        if (!wurzeln) return;
        for (const root of wurzeln) {
          const schluessel = wurzelSchluessel(root);
          if (bekannteBereiche.has(schluessel)) continue;
          const sicht = deps.workflowFiles(root);
          if (!sicht || sicht.status !== 'ready') continue;
          bekannteBereiche.add(schluessel);
          if (!deps.enabled()) continue;
          const ereignis = { type: 'area-opened', path: null, relPath: '', from: null, task: null };
          try {
            await werteAus(root, ereignis);
          } catch (err) {
            console.warn(`Ereignis-Prüfer fehlgeschlagen (${root}):`, err);
          }
        }
      });
    }
    return neueGeplant;
  }

  function kopfMit(key) {
    for (const schlange of schlangen.values()) {
      const kopf = schlange.eintraege[0];
      if (kopf && kopf.item.key === key) return { schlange, kopf };
    }
    return null;
  }

  /**
   * Anspruch eines Fensters auf eine Fälligkeit; nur die erste des Bereichs,
   * nur unbeansprucht, nur bei gleicher Bereichs-Wurzel und gewährtem Anspruch
   * im Register.
   *
   * @param {string} key
   * @param {{root: string, windowId: number}} fenster
   * @returns {boolean}
   */
  function claim(key, fenster) {
    if (!deps.enabled()) return false;
    const treffer = kopfMit(key);
    if (!treffer || treffer.kopf.claimedBy !== null) return false;
    if (!fenster || !sameRoot(treffer.kopf.item.root, fenster.root)) return false;
    if (!deps.claimDelivery(key)) return false;
    treffer.kopf.claimedBy = fenster.windowId;
    return true;
  }

  /**
   * Das Fenster konnte nach dem Anspruch nicht starten: Die Fälligkeit bleibt
   * erste ihres Bereichs und kommt im nächsten Takt wieder.
   *
   * @param {string} key
   * @param {number} windowId
   * @returns {boolean}
   */
  function release(key, windowId) {
    const treffer = kopfMit(key);
    if (!treffer || treffer.kopf.claimedBy !== windowId) return false;
    treffer.kopf.claimedBy = null;
    deps.releaseDelivery(key);
    plane();
    return true;
  }

  /**
   * Das Fenster meldet das Ende seines Laufs; die nächste Fälligkeit des
   * Bereichs wird sofort zugestellt.
   *
   * @param {string} key
   * @param {number} windowId
   * @returns {boolean}
   */
  function finish(key, windowId) {
    const treffer = kopfMit(key);
    if (!treffer || treffer.kopf.claimedBy !== windowId) return false;
    treffer.schlange.eintraege.shift();
    offeneBereiche();
    pumpe();
    return true;
  }

  /**
   * Ist die Fälligkeit offen und nicht beansprucht? (`stillOpen` des Registers.)
   *
   * @param {string} key
   * @returns {boolean}
   */
  function isPending(key) {
    const treffer = kopfMit(key);
    return !!treffer && treffer.kopf.claimedBy === null;
  }

  /** @returns {Promise<void>} erfüllt, wenn alle angestoßenen Auswertungen fertig sind (Prüffälle). */
  function idle() {
    return meldungsKette.then(() => kette).then(() => undefined);
  }

  function stop() {
    for (const e of entprellung.values()) clearTimeout(e.timer);
    entprellung.clear();
    if (takt) clearTimeout(takt);
    takt = null;
  }

  return { report, checkNewAreas, claim, release, finish, isPending, idle, stop };
}

module.exports = {
  BREMSE_FENSTER_MS,
  BREMSE_GRENZE,
  ENTPRELL_HOECHSTENS_MS,
  ENTPRELL_MS,
  ORIGIN_EVENT,
  WARTE_TAKT_MS,
  abonniereWorkflowEreignisse,
  createEventBrake,
  createWorkflowEventChecker,
  meldeWorkflowEreignis,
};
