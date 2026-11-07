// 4T-002462 (Epic 3E-000367, Story 4S-001145): Erkennung des Ereignisses
// «Aufgabe erledigt» (`task-done`) für die Workflows.
//
// **Was der Index dafür mitbringt** (Nachsehen im Task): Je Datei führt er die
// Aufgaben-Zeilen als Roh-Zeile mit Zeilennummer und Überschrift
// (`tasksPerFile`, gefüllt aus `parseContent` in parse.js); den Zustand, die
// Beschreibung und den Status-Typ liefert erst der Marker-Kern
// (`parseTaskLine`) mit der Status-Einstellung (`statusTypeOf` aus task-env.js).
// Den vorigen Stand einer Datei kennt der Index genau in dem Augenblick, in dem
// der Beobachter eine Änderung meldet (`onWatcherChange` in build.js, vor dem
// Austragen). Danach ist er weg; eine eigene Ablage braucht es deshalb nur
// dort, wo zwei Schichten zusammenspielen.
//
// **Zwei Schichten, ein Spiegel.** Erledigt wird auf vier Wegen: Klick auf das
// Kästchen im Fenster (ändert nur den Puffer), Abhaken in der Aufgaben-Abfrage
// (Puffer oder Platte), getipptes `[x]` und eine Änderung von außen (Platte).
// Der Puffer erreicht den Hauptprozess über die Puffer-Overlay-Schicht
// (overlay.js, 300 ms nach der Eingabe), die Platte über den Beobachter. Je
// Datei gilt als Vergleichs-Stand («Spiegel») der zuletzt gesehene wirksame
// Stand: solange ein Puffer-Stand vorliegt, dieser, sonst der der Platte. Jeder
// neue wirksame Stand wird gegen den Spiegel verglichen, und jeder Wechsel
// einer Aufgaben-Zeile von «nicht erledigt» auf «erledigt» ergibt genau eine
// Meldung `task-done` an den Ereignis-Prüfer. So fällt das Ereignis beim Klick
// sofort und beim folgenden Speichern kein zweites Mal.
//
//   meldePuffer      Puffer-Stand gesetzt (setBufferOverlay): Vergleich gegen
//                    den Spiegel, sonst gegen die Platte des Index.
//   meldePufferEnde  Puffer-Stand zurückgenommen (Speichern, Verwerfen,
//                    Schließen, Neu-Laden): Die Platte wird gelesen, weil der
//                    Beobachter erst rund 200 ms später meldet; nach einem
//                    Speichern gleicht sie dem Puffer (keine Meldung), nach
//                    einem Verwerfen trägt sie den alten Stand.
//   meldePlatte      Beobachter meldet eine Änderung (build.js): Mit
//                    Puffer-Stand gilt weiter dieser (keine Meldung); sonst
//                    Vergleich gegen den Spiegel oder den vorigen Index-Stand.
//
// **Wiedererkennung einer Zeile** (`erledigtWechsel`): zuerst über die
// Beschreibung (Text ohne Kästchen, Daten, Priorität und Kennungen; das
// Erledigt-Datum verändert sie nicht), in einer Gruppe gleicher Beschreibung
// erst erledigt zu erledigt, dann offen zu erledigt, dann offen zu offen. Was
// danach übrig ist, sind Zeilen mit geändertem Text: Gleich viele auf beiden
// Seiten werden der Reihe nach gepaart (umformuliert und zugleich abgehakt),
// sonst nur Zeilen mit gleicher Zeilennummer. Eine offene Zeile, die im Puffer
// verschwindet, bleibt bis zum nächsten Platten-Stand als «Geist» stehen: Wer
// das Leerzeichen zwischen den Klammern löscht und danach `x` tippt, sieht
// dazwischen eine Zeile `- [] …`, die keine Aufgabe ist.
//
// **Was keine Meldung ergibt:** eine neue Zeile, die schon erledigt ist; ein
// Zurücksetzen auf offen (ein erneutes Erledigen danach ist ein neuer Wechsel);
// der erste Aufbau des Index (kein Nachholen, 3e). Abgebrochen (CANCELLED) ist
// nicht erledigt. Aufgaben-Zeile ist, was der Index als solche führt, bei
// eingeschalteter Erweiterung «Aufgaben» eingegrenzt durch den Global Filter —
// dieselbe Regel wie beim Befehl `complete-task`.
//
// **Lauf-Marke** (4T-002461): Die Meldung trägt als `task` die Beschreibung der
// Zeile. Hakt ein Workflow mit `complete-task` ab, merkt der Hauptprozess die
// Beschreibung der gefundenen Zeile (`merkeLaufAufgabe`), und die Meldung, deren
// Text sie enthält, gilt als Schreibvorgang des Laufs.
//
// Die Aufgaben-Umgebung (Status-Einstellung, Global Filter) kommt von außen
// (`attachAufgabenUmgebung`, verdrahtet in app/wiring.js), damit dieses Modul
// den Einstellungs-Speicher nicht kennt (Muster task-env.js, index-schalter.js).
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pathCompareKey, isFilesystemCaseInsensitive } = require('../../shared/platform.js');
const { parseTaskLine, modelMatchesGlobalFilter } = require('../../shared/tasks/task-markers.js');
const { isInsideArea } = require('../area/area-path.js');
const { meldeWorkflowEreignis } = require('../checks/workflow-event-check.js');
const { hatLaufMarke, istLaufSchreibvorgang } = require('../documents/self-write.js');
const { indexes, bufferOverlays } = require('./store.js');
const { parseContent } = require('./parse.js');
const { buildTaskEnv } = require('./task-env.js');

/** Obergrenze der Dateien im Spiegel (wie die Selbst-Schreib-Marke). */
const MAX_SPIEGEL = 500;
/** Obergrenze der Geister je Datei. */
const MAX_GEISTER = 50;
const ERLEDIGT = 'DONE';

// Pfad-Schlüssel -> { aufgaben, geister, lesen } (lesen: Kennung des laufenden
// Platten-Lesens nach einer Rücknahme).
const spiegel = new Map();
let umgebungFn = null;
let lesFolge = 0;

/**
 * Verdrahtet die Aufgaben-Umgebung (Status-Typen, Global Filter).
 *
 * @param {(() => object)|null} fn liefert eine Umgebung wie `buildTaskEnv`.
 */
function attachAufgabenUmgebung(fn) {
  umgebungFn = typeof fn === 'function' ? fn : null;
}

function umgebung() {
  if (umgebungFn) {
    try {
      const env = umgebungFn();
      if (env && typeof env.statusTypeOf === 'function') return env;
    } catch (err) {
      console.warn('Aufgabe erledigt: Aufgaben-Umgebung nicht bezogen:', err);
    }
  }
  return buildTaskEnv({});
}

/**
 * Die Aufgaben-Zeilen eines Index-Stands mit Beschreibung und Erledigt-Zustand.
 *
 * @param {{zeile: number, text: string}[]|null|undefined} tasks Roh-Zeilen des Index.
 * @param {{enabled: boolean, globalFilter: string, statusTypeOf: Function}} env
 * @returns {{beschreibung: string, erledigt: boolean, zeile: number}[]}
 */
function aufgabenZustaende(tasks, env) {
  const aus = [];
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || typeof t.text !== 'string') continue;
    const model = parseTaskLine(t.text);
    if (!model) continue;
    if (env.enabled && !modelMatchesGlobalFilter(model, env.globalFilter)) continue;
    aus.push({
      beschreibung: model.description,
      erledigt: env.statusTypeOf(model.statusChar) === ERLEDIGT,
      zeile: t.zeile,
    });
  }
  return aus;
}

// Paart der Reihe nach je einen freien Eintrag von `alt`, auf den `wennAlt`
// zutrifft, mit dem nächsten freien von `neu`, auf den `wennNeu` zutrifft.
function paare(alt, neu, wennAlt, wennNeu, beiPaar) {
  let j = 0;
  for (const a of alt) {
    if (a.frei === false || !wennAlt(a)) continue;
    while (j < neu.length && (neu[j].frei === false || !wennNeu(neu[j]))) j++;
    if (j >= neu.length) return;
    a.frei = false;
    neu[j].frei = false;
    beiPaar(a, neu[j]);
    j++;
  }
}

/**
 * Die Wechsel auf «erledigt» zwischen zwei Ständen einer Datei.
 *
 * @param {{beschreibung: string, erledigt: boolean, zeile: number}[]} alt
 * @param {{beschreibung: string, erledigt: boolean, zeile: number}[]} neu
 * @param {{beschreibung: string, zeile: number}[]} [geister] verschwundene offene Zeilen.
 * @returns {{wechsel: object[], geister: object[]}} die erledigten Zeilen von
 *   `neu`, die vorher nicht erledigt waren, und die Geister danach (übrige alte
 *   Geister und die offenen Zeilen von `alt` ohne Gegenstück).
 */
function erledigtWechsel(alt, neu, geister = []) {
  const a = alt.map((e) => ({ ...e, frei: true }));
  const n = neu.map((e) => ({ ...e, frei: true }));
  const g = geister.map((e) => ({ ...e, erledigt: false, frei: true }));
  const wechsel = [];
  const gruppen = new Map();
  const gruppe = (b) => {
    if (!gruppen.has(b)) gruppen.set(b, { a: [], n: [], g: [] });
    return gruppen.get(b);
  };
  for (const e of a) gruppe(e.beschreibung).a.push(e);
  for (const e of n) gruppe(e.beschreibung).n.push(e);
  for (const e of g) gruppe(e.beschreibung).g.push(e);
  const istErledigt = (e) => e.erledigt;
  const istOffen = (e) => !e.erledigt;
  const nichts = () => {};
  const wurdeErledigt = (_von, nach) => wechsel.push(nach);
  for (const { a: ga, n: gn, g: gg } of gruppen.values()) {
    paare(ga, gn, istErledigt, istErledigt, nichts);
    paare(ga, gn, istOffen, istErledigt, wurdeErledigt);
    paare(ga, gn, istOffen, istOffen, nichts);
    paare(ga, gn, istErledigt, istOffen, nichts);
    // Geister zuletzt: erst der Wechsel, dann die wieder aufgetauchte offene Zeile.
    paare(gg, gn, istOffen, istErledigt, wurdeErledigt);
    paare(gg, gn, istOffen, istOffen, nichts);
  }
  // Geänderter Text: gleich viele übrig der Reihe nach, sonst gleiche Zeile.
  const nachZeile = (x, y) => x.zeile - y.zeile;
  const restA = a.filter((e) => e.frei).sort(nachZeile);
  const restN = n.filter((e) => e.frei).sort(nachZeile);
  const verglichen = (von, nach) => {
    von.frei = false;
    nach.frei = false;
    if (!von.erledigt && nach.erledigt) wechsel.push(nach);
  };
  if (restA.length === restN.length) {
    restA.forEach((von, i) => verglichen(von, restN[i]));
  } else {
    for (const von of restA) {
      const nach = restN.find((e) => e.frei && e.zeile === von.zeile);
      if (nach) verglichen(von, nach);
    }
  }
  const bleibend = [...g, ...a].filter((e) => e.frei && !e.erledigt);
  return {
    wechsel: wechsel
      .sort(nachZeile)
      .map((e) => ({ beschreibung: e.beschreibung, erledigt: e.erledigt, zeile: e.zeile })),
    geister: bleibend
      .slice(-MAX_GEISTER)
      .map((e) => ({ beschreibung: e.beschreibung, zeile: e.zeile })),
  };
}

// --- Spiegel --------------------------------------------------------------------

function setzeSpiegel(schluessel, wert) {
  spiegel.delete(schluessel);
  spiegel.set(schluessel, wert);
  while (spiegel.size > MAX_SPIEGEL) {
    const aeltester = spiegel.keys().next().value;
    if (aeltester === undefined) break;
    spiegel.delete(aeltester);
  }
}

// Ein Wert einer Map mit Pfad-Schlüsseln, auf case-insensitiven Dateisystemen
// auch in anderer Schreibweise (der Beobachter und der Reiter schreiben einen
// Pfad nicht zwingend gleich).
function wertFuerPfad(map, abs) {
  if (map.has(abs)) return map.get(abs);
  if (!isFilesystemCaseInsensitive()) return undefined;
  const gesucht = pathCompareKey(abs);
  for (const [pfad, wert] of map) if (pathCompareKey(pfad) === gesucht) return wert;
  return undefined;
}

function hatPuffer(abs) {
  return wertFuerPfad(bufferOverlays, abs) !== undefined;
}

// Aufgaben-Zeilen der Platte aus dem Index (Bereich vor bereichsloser Wurzel).
function plattenAufgaben(abs) {
  let gefunden = null;
  for (const entry of indexes.values()) {
    if (!entry || !entry.tasksPerFile || !entry.wurzel) continue;
    if (!isInsideArea(entry.wurzel, abs)) continue;
    if (gefunden && gefunden.isArea && !entry.isArea) continue;
    gefunden = entry;
  }
  if (!gefunden) return [];
  return wertFuerPfad(gefunden.tasksPerFile, abs) || [];
}

function melde(abs, wechsel, root) {
  for (const w of wechsel) {
    const meldung = { type: 'task-done', path: abs, task: w.beschreibung };
    if (root) meldung.root = root;
    meldeWorkflowEreignis(meldung);
  }
}

/**
 * Ein Puffer-Stand einer Datei ist gesetzt (Puffer-Overlay-Schicht).
 *
 * @param {string} abs absoluter Pfad.
 * @param {{zeile: number, text: string}[]} tasks Aufgaben-Zeilen des Puffers.
 */
function meldePuffer(abs, tasks) {
  if (typeof abs !== 'string' || abs === '') return;
  // Die Erkennung darf das Setzen des Puffer-Stands nie scheitern lassen.
  try {
    pufferAuswerten(abs, tasks);
  } catch (err) {
    console.warn('Aufgabe erledigt: Puffer-Stand nicht ausgewertet:', err);
  }
}

function pufferAuswerten(abs, tasks) {
  const env = umgebung();
  const schluessel = pathCompareKey(abs);
  const bisher = spiegel.get(schluessel);
  const alt = bisher ? bisher.aufgaben : aufgabenZustaende(plattenAufgaben(abs), env);
  const neu = aufgabenZustaende(tasks, env);
  const { wechsel, geister } = erledigtWechsel(alt, neu, bisher ? bisher.geister : []);
  setzeSpiegel(schluessel, { aufgaben: neu, geister, lesen: null });
  melde(abs, wechsel, null);
}

/**
 * Der Puffer-Stand einer Datei ist zurückgenommen. Liest die Platte und
 * vergleicht gegen den Spiegel; ohne Spiegel ist nichts zu tun.
 *
 * @param {string} abs absoluter Pfad.
 * @returns {Promise<void>} erfüllt nach dem Vergleich (Prüffälle).
 */
async function meldePufferEnde(abs) {
  if (typeof abs !== 'string' || abs === '') return;
  const schluessel = pathCompareKey(abs);
  const bisher = spiegel.get(schluessel);
  if (!bisher) return;
  lesFolge += 1;
  const kennung = lesFolge;
  bisher.lesen = kennung;
  let text;
  try {
    text = await fs.readFile(abs, 'utf8');
  } catch {
    if (spiegel.get(schluessel) === bisher && bisher.lesen === kennung) spiegel.delete(schluessel);
    return;
  }
  // Inzwischen neu gesetzt (Puffer) oder vom Beobachter verbraucht: veraltet.
  if (spiegel.get(schluessel) !== bisher || bisher.lesen !== kennung) return;
  if (hatPuffer(abs)) return;
  const env = umgebung();
  const neu = aufgabenZustaende(parseContent(abs, text).tasks, env);
  const { wechsel } = erledigtWechsel(bisher.aufgaben, neu, bisher.geister);
  setzeSpiegel(schluessel, { aufgaben: neu, geister: [], lesen: null });
  melde(abs, wechsel, null);
}

// Ketten-Schutz für Wechsel von der Platte (3d): Hat ein Workflow-Lauf die
// Datei geschrieben (Lauf-Stand, etwa ein `replace`, das `[ ]` zu `[x]`
// macht), trägt die Datei seinen Inhalt; die Probe ist dieselbe, die der
// Ereignis-Prüfer für die Meldung `file-changed` derselben Änderung stellt, und
// sie liefert für beide dasselbe Urteil. Dann entfällt die Meldung; eine
// Einmal-Marke von `complete-task` mit derselben Beschreibung wird dabei
// verbraucht, damit sie keine spätere Handlung des Anwenders schluckt.
async function meldePlatteNachProbe(abs, wechsel, root) {
  let lauf = false;
  try {
    lauf = await istLaufSchreibvorgang({ type: 'file-changed', path: abs });
  } catch (err) {
    console.warn('Aufgabe erledigt: Lauf-Marke nicht geprüft:', err);
  }
  if (!lauf) {
    melde(abs, wechsel, root);
    return;
  }
  for (const w of wechsel)
    istLaufSchreibvorgang({ type: 'task-done', path: abs, task: w.beschreibung });
}

/**
 * Der Beobachter meldet eine geänderte Datei (build.js, nach dem Eintragen).
 *
 * @param {string} root Wurzel des Index-Eintrags.
 * @param {string} abs absoluter Pfad.
 * @param {{zeile: number, text: string}[]|undefined} vorher Aufgaben-Zeilen des Index davor.
 * @param {{zeile: number, text: string}[]|undefined} nachher Aufgaben-Zeilen danach.
 * @returns {Promise<void>|undefined} bei einer Datei mit Lauf-Marke ein Versprechen,
 *   das nach der Probe erfüllt wird (Prüffälle).
 */
function meldePlatte(root, abs, vorher, nachher) {
  if (typeof abs !== 'string' || abs === '') return undefined;
  // Die Erkennung darf die Index-Pflege des Beobachters nie scheitern lassen.
  try {
    return platteAuswerten(root, abs, vorher, nachher);
  } catch (err) {
    console.warn('Aufgabe erledigt: Platten-Stand nicht ausgewertet:', err);
    return undefined;
  }
}

function platteAuswerten(root, abs, vorher, nachher) {
  // Ein Puffer-Stand geht der Platte vor; sie wird erst mit seiner Rücknahme wirksam.
  if (hatPuffer(abs)) return undefined;
  const env = umgebung();
  const schluessel = pathCompareKey(abs);
  const bisher = spiegel.get(schluessel);
  spiegel.delete(schluessel);
  const alt = bisher ? bisher.aufgaben : aufgabenZustaende(vorher, env);
  const neu = aufgabenZustaende(nachher, env);
  const { wechsel } = erledigtWechsel(alt, neu, bisher ? bisher.geister : []);
  if (wechsel.length === 0) return undefined;
  if (hatLaufMarke(abs)) return meldePlatteNachProbe(abs, wechsel, root);
  melde(abs, wechsel, root);
  return undefined;
}

/**
 * Datei entfernt oder Index einer Wurzel abgebaut: Der Spiegel der Pfade fällt.
 *
 * @param {string} abs Datei oder Wurzel.
 * @param {{unter?: boolean}} [opts] `unter: true` nimmt alles unter `abs`.
 */
function vergissAufgaben(abs, opts = {}) {
  if (typeof abs !== 'string' || abs === '') return;
  if (!opts.unter) {
    spiegel.delete(pathCompareKey(abs));
    return;
  }
  const wurzel = pathCompareKey(path.resolve(abs));
  for (const schluessel of [...spiegel.keys()]) {
    if (schluessel === wurzel || schluessel.startsWith(wurzel + path.sep))
      spiegel.delete(schluessel);
  }
}

// Nur für Prüffälle.
function _spiegelLeeren() {
  spiegel.clear();
}

module.exports = {
  attachAufgabenUmgebung,
  aufgabenZustaende,
  erledigtWechsel,
  meldePuffer,
  meldePufferEnde,
  meldePlatte,
  vergissAufgaben,
  _spiegelLeeren,
};
