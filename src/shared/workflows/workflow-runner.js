// 4T-002349 (Epic 3E-000184): Der Ablauf-Kern eines Workflow-Laufs.
//
// Führt die vorbereiteten Schritte eines Laufs strikt nacheinander aus (A1).
// Reine Funktion ohne DOM- und Electron-Abhängigkeit: Alle Wirkungen kommen
// als Abhängigkeiten herein (Vorbild `src/shared/macro-runner.js`), damit der
// Ablauf ohne Fenster und ohne IPC prüfbar ist. Die Vorbereitung (Prüfen vor
// Laufen, Eingabe-Dialoge, Füllen, Aufruf-Baum) leistet der Aufrufer
// (`src/renderer/modules/workflows/workflow-start.js`); hier beginnt der Lauf
// erst, wenn nichts mehr zu fragen ist.
//
// **Wo ein Schritt läuft** (A3): `command`, `macro`, `workflow`, `wait`,
// `notify`, `stop` und seit 4T-002424 `confirm` im startenden Fenster, alle
// übrigen Befehle im
// Hauptprozess über `deps.step`; antwortet er mit einem Fenster-Handgriff, führt
// ihn `deps.runWindowAction` aus.
//
// **Abbruch** (A1, A5): Der erste Fehlschlag beendet den Lauf, ausgeführte
// Schritte bleiben. `stop` beendet den ganzen Lauf, auch aus einem
// verschachtelten Workflow heraus. Eine Ausnahme einer Abhängigkeit wird zum
// Fehlschlag `unexpected`, nie still verschluckt.
//
// **`confirm`** (4T-002424, Regel P4 der Konzept-Runde 4T-002418): Die Frage
// geht an `deps.confirm`; «Ja» setzt den Lauf fort, «Nein» beendet ihn ohne
// Fehlschlag wie `stop`, mit der Frage als Text und dem Kennzeichen
// `declined`, damit die Anzeige «mit Nein beantwortet» sagen kann.
//
// **Aufruf-Tiefe** (A4): eine Zählung über Workflows und Makros wie bei den
// Makros. Der gestartete Workflow ist Ebene 0, ein `workflow`- oder
// `macro`-Schritt öffnet die nächste; abgewiesen wird ab Ebene
// `MAX_CALL_DEPTH` (5). Ein Makro läuft mit seiner Ebene, damit der Zähler der
// Makros dieselbe Kette weiterzählt.
//
// **Bedingungen und Schleife** (4T-002464, Stories 4S-001147 und 4S-001148,
// Entscheidungen 3f und 3g): Die Schritte bleiben eine flache Liste in
// Lese-Reihenfolge; `else` und `end` sind eigene Schritte. Die Paarung liest
// der Kern über `blockStructure` aus dem Prüfer, derselben Erkennung wie das
// Prüfen vor Laufen, das jede fehlerhafte Paarung schon vor dem ersten Schritt
// abgewiesen hat. Die Frage, ob eine Bedingung zutrifft, und die Liste einer
// Schleife beantwortet der Hauptprozess über denselben Weg wie jeden
// Datei-Schritt (`deps.step`, nach dem Puffer-Abgleich), weil nur er den
// Bereich sieht: `{ ok: true, value }` für eine Bedingung, `{ ok: true, files }`
// mit wurzel-relativen Pfaden für eine Schleife. Ein Block, dessen Bedingung
// nicht zutrifft, wird übersprungen, `else` läuft im anderen Fall. Die Liste
// einer Schleife steht beim Eintritt fest, der Kern ordnet sie alphabetisch
// (`compareLoopPaths`) und wiederholt den Block je Datei; ein zurückgestellter
// Schritt (`deferred` aus `prepareRun`) wird dabei je Datei mit `{{item}}`
// gefüllt. Mehr als `MAX_LOOP_FILES` Dateien sind ein Fehlschlag
// `tooManyFiles` vor der ersten Wiederholung; eine leere Liste ist keiner. Ein
// Fehlschlag in einem Block ist ein Fehlschlag des Laufs (A1).
//
// **Skript-Schritt** (4T-002465, Story 4S-001149, Entscheidungen 3h und 3n):
// `script` und `if-script` laufen nie im Hauptprozess, sondern über
// `deps.runScript(source, ort)` in der Sandbox der Skript-Blöcke im Fenster;
// `source` ist der Quelltext, den das Prüfen vor Laufen unter der Überschrift
// gefunden hat. Die Antwort ist `{ ok: true, value }` mit einem Text, einer
// Zahl, einem Wahrheitswert oder null, sonst `{ ok: false, code, detail }`
// (Fehler im Skript, Zeitgrenze, Einstellung aus); jede Nicht-Antwort ist ein
// Fehlschlag des Schritts (A1). Das Ergebnis von `script … as "name"` gilt
// als Text (`scriptResultText`) ab dem nächsten Schritt in `{{script:name}}`;
// ein Schritt mit diesem Platzhalter kommt zurückgestellt aus `prepareRun` und
// wird hier mit den bis dahin gelieferten Ergebnissen gefüllt. Fehlt ein
// Ergebnis, weil sein Schritt in einem nicht gelaufenen Zweig steht, ist das
// der Fehlschlag `scriptResultMissing`. `if-script` trifft zu, wenn das Skript
// `true`, einen nicht leeren Text oder eine Zahl ungleich null liefert
// (`scriptResultTrue`).
//
// **Datenbank-Schritte** (4T-002545, Stories 4S-001196 und 4S-001200): `db-create`,
// `db-update` und `db-delete` laufen wie jeder Datei-Schritt im Hauptprozess.
// Die Antwort von `db-create` trägt die vergebene Kennung (`record`); trägt
// der Schritt einen Namen hinter `as` (`result`), legt der Kern sie unter
// diesem Namen in `lauf.erstellt` ab, für `{{created:name}}` (Da; gefüllt
// seit 4T-002547). `dbDeleteTargets` nennt die Ziele aller
// `db-delete` eines Laufs für die eine Bestätigung vor dem ersten Schritt (D3),
// seit 4T-002547 mit der Art eines erst im Lauf feststehenden Ziels.
//
// **Schleife über Datensätze und Datenbank-Werte** (4T-002547, Stories
// 4S-001198 und 4S-001199, Entscheidungen Dc, Dd und Da): `db-for-each` holt
// die Liste der Datensätze beim Eintritt über `deps.step` (der Hauptprozess
// führt die Abfrage-Datei aus und antwortet `{ ok: true, records }` mit Tabelle,
// Pfad der Tabellen-Datei und Kennung, in der Reihenfolge der Abfrage); mehr als
// `MAX_LOOP_FILES` sind der Fehlschlag `tooManyRecords` vor der ersten
// Wiederholung, eine leere Liste ist keiner. Zu Beginn jeder Wiederholung liest
// `deps.dbRead` den Datensatz frisch; seine Felder, `id`, `table` und `file`
// füllen `{{record:…}}`. Ein Schritt mit einem Feld in `{{record:…}}` liest den
// Datensatz vor sich erneut, damit er sieht, was ein früherer Schritt derselben
// Wiederholung geschrieben hat (Story 4S-001198, AK2); der erste Schritt nach
// dem Lesen zu Beginn liest nicht doppelt (`lauf.datensatzFrisch`). Ein Datensatz, der bis
// dahin verschwunden ist, beendet den Lauf mit dem Grund des Hauptprozesses.
// `{{db:Tabelle:Datensatz:Feld}}` liest `deps.dbRead` beim Schritt selbst,
// `{{created:name}}` kommt aus `lauf.erstellt`; ein fehlender Wert ist ein
// Fehlschlag, nie ein leerer Text.
//
// **Masken und Konsistenz** (4T-002548, Stories 4S-001201 und 4S-001202, Dg):
// `db-open` und `db-open-list` laufen im Hauptprozess und kommen als
// Fenster-Handgriff zurück wie `open`. `db-check` antwortet mit dem fertigen
// Text einer Benachrichtigung (`notify` der Antwort, in der Sprache des
// Fensters); der Kern meldet ihn über `deps.notify` wie den Befehl `notify`,
// und der Lauf geht weiter.
'use strict';

const { MACRO_MAX_CALL_DEPTH } = require('../commands/command-placement.js');
const {
  CONDITION_KEYWORDS,
  ELSE_KEYWORD,
  END_KEYWORD,
  DB_LOOP_KEYWORD,
  LOOP_KEYWORD,
  MAX_LOOP_FILES,
  SCRIPT_CONDITION_KEYWORD,
  SCRIPT_KEYWORD,
} = require('./workflow-catalog.js');
const { blockStructure } = require('./workflow-check.js');
const { fillLoopStep, runValueNodes } = require('./workflow-placeholders.js');
const { analyzeTemplate } = require('../template-engine.js');

// 4T-002545: die Datenbank-Befehle mit eigener Behandlung im Kern.
const DB_CREATE_KEYWORD = 'db-create';
const DB_DELETE_KEYWORD = 'db-delete';

const MAX_CALL_DEPTH = MACRO_MAX_CALL_DEPTH;
// Die Fehlschlag-Codes dieses Moduls; ihre Texte liegen unter
// `workflow.fehlschlag.<code>`.
const RUNNER_CODES = Object.freeze([
  'commandFailed',
  'macroFailed',
  'macroUnknown',
  'workflowFailed',
  'workflowUnknown',
  'depthExceeded',
  'tooManyFiles',
  'scriptFailed',
  'scriptTimeout',
  'scriptsDisabled',
  'scriptResultMissing',
  // 4T-002547: Schleife über Datensätze und Datenbank-Werte.
  'tooManyRecords',
  'createdMissing',
  'dbFieldUnknown',
  'unexpected',
]);

// Die Codes, mit denen `deps.runScript` einen Fehlschlag melden darf; jeder
// andere wird `scriptFailed`.
const SKRIPT_CODES = Object.freeze(['scriptFailed', 'scriptTimeout', 'scriptsDisabled']);

/**
 * Das Ergebnis eines Skripts als Text für `{{script:name}}` (4T-002465).
 *
 * @param {*} value Antwort von `deps.runScript`.
 * @returns {string} leer für null und alles, was kein Text, keine endliche Zahl
 *   und kein Wahrheitswert ist.
 */
function scriptResultText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Trifft `if-script` zu? Wahr bei `true`, einem nicht leeren Text (Leerraum
 * allein zählt als leer) und einer Zahl ungleich null (4T-002465).
 *
 * @param {*} value Antwort von `deps.runScript`.
 * @returns {boolean}
 */
function scriptResultTrue(value) {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  return false;
}

// Alphabetische Ordnung der Dateien einer Schleife: fest auf Deutsch, damit
// die Reihenfolge nicht von der Sprache der Oberfläche abhängt, Ziffern als
// Zahl wie im Datei-Explorer, bei Gleichheit nach Zeichen-Code.
const SORTIERUNG = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/**
 * Vergleicht zwei Pfade einer Schleife für die alphabetische Abarbeitung.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareLoopPaths(a, b) {
  const grob = SORTIERUNG.compare(a, b);
  if (grob !== 0) return grob;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function fehlschlag(plan, step, code, detail = {}) {
  return { status: 'failed', workflow: plan.name, path: plan.path, line: step.line, code, detail };
}

async function makroSchritt(plan, step, deps, ebene) {
  const name = String(step.args[0]);
  if (ebene + 1 >= MAX_CALL_DEPTH) return fehlschlag(plan, step, 'depthExceeded', { name });
  const ergebnis = await deps.runMacro(name, ebene + 1);
  if (ergebnis && ergebnis.ok) return null;
  const grund = ergebnis && ergebnis.reason;
  if (grund === 'depth') return fehlschlag(plan, step, 'depthExceeded', { name });
  if (grund === 'unknown') return fehlschlag(plan, step, 'macroUnknown', { name });
  return fehlschlag(plan, step, 'macroFailed', { name });
}

async function workflowSchritt(plan, step, deps, ebene) {
  const name = String(step.args[0]);
  if (ebene + 1 >= MAX_CALL_DEPTH) return fehlschlag(plan, step, 'depthExceeded', { name });
  const kind = plan.children && plan.children[step.line];
  if (!kind) return fehlschlag(plan, step, 'workflowUnknown', { name });
  const ergebnis = await runWorkflow(kind, deps, ebene + 1);
  if (ergebnis.status === 'ok') return null;
  if (ergebnis.status === 'stopped') {
    return { ...ergebnis, workflow: plan.name, path: plan.path, line: step.line, inner: ergebnis };
  }
  return fehlschlag(plan, step, 'workflowFailed', { name: kind.name, inner: ergebnis });
}

/** Der Befehl, dessen Ergebnis eine Benachrichtigung ist (4T-002548). */
const DB_CHECK_KEYWORD = 'db-check';

async function hauptprozessSchritt(plan, step, deps) {
  if (typeof deps.flushBuffers === 'function') await deps.flushBuffers();
  let antwort = await deps.step(plan.path, step);
  if (antwort && antwort.ok && antwort.window) antwort = await deps.runWindowAction(antwort);
  // 4T-002548 (Dg): das Ergebnis von `db-check` als Benachrichtigung.
  if (antwort && antwort.ok && step.keyword === DB_CHECK_KEYWORD) {
    if (typeof antwort.notify !== 'string') return fehlschlag(plan, step, 'unexpected', {});
    deps.notify(antwort.notify);
  }
  if (antwort && antwort.ok) return null;
  const code = antwort && typeof antwort.code === 'string' ? antwort.code : 'unexpected';
  return fehlschlag(plan, step, code, (antwort && antwort.detail) || {});
}

// Eine Frage an den Hauptprozess (Bedingung oder Liste einer Schleife):
// `{ antwort }` oder `{ ende }` mit dem Fehlschlag.
async function abfrage(plan, step, deps) {
  if (typeof deps.flushBuffers === 'function') await deps.flushBuffers();
  const antwort = await deps.step(plan.path, step);
  if (antwort && antwort.ok) return { antwort };
  const code = antwort && typeof antwort.code === 'string' ? antwort.code : 'unexpected';
  return { ende: fehlschlag(plan, step, code, (antwort && antwort.detail) || {}) };
}

const hat = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

// 4T-002547 (Dc): Der Wert eines `{{record:…}}` aus dem frisch gelesenen
// Datensatz: `id`, `table` und `file` als eigene Angaben, sonst das Feld ohne
// Rücksicht auf die Schreibung; undefined, wenn die Tabelle es nicht kennt.
function datensatzWert(datensatz, angabe) {
  const klein = angabe.toLowerCase();
  if (klein === 'id' || klein === 'table' || klein === 'file') return datensatz[klein];
  const felder = datensatz.fields || {};
  const name = Object.keys(felder).find((f) => f.toLowerCase() === klein);
  return name === undefined ? undefined : felder[name];
}

// Ein `{{record:<feld>}}` mit einem Feld, nicht `id`, `table` oder `file`.
function traegtFeld(knoten) {
  const [art, ...rest] = knoten.name.split(':');
  return art === 'record' && !['id', 'table', 'file'].includes(rest.join(':').toLowerCase());
}

// Die Werte eines Laufs, die ein zurückgestellter Schritt braucht: `{ werte }`
// mit Knoten-Name → Wert oder `{ ende }` mit dem Fehlschlag (V5: nie leer).
async function laufWerte(lauf, step, frisch) {
  const { plan, deps } = lauf;
  const werte = {};
  const knotenListe = runValueNodes(step.deferred.step);
  if (lauf.datensatzRef && !frisch && knotenListe.some(traegtFeld)) {
    const gelesen = await liesDatenbank(plan, step, deps, lauf.datensatzRef);
    if (gelesen.ende) return gelesen;
    lauf.datensatz = gelesen.antwort.record;
  }
  for (const knoten of knotenListe) {
    const [art, ...rest] = knoten.name.split(':');
    const angabe = rest.join(':');
    if (art === 'script') {
      if (!hat(lauf.skripte, angabe)) {
        return { ende: fehlschlag(plan, step, 'scriptResultMissing', { name: angabe }) };
      }
    } else if (art === 'created') {
      if (!hat(lauf.erstellt, angabe)) {
        return { ende: fehlschlag(plan, step, 'createdMissing', { name: angabe }) };
      }
      werte[knoten.name] = lauf.erstellt[angabe];
    } else if (art === 'record') {
      if (!lauf.datensatz) return { ende: fehlschlag(plan, step, 'unexpected', {}) };
      const wert = datensatzWert(lauf.datensatz, angabe);
      if (wert === undefined) {
        const detail = { table: lauf.datensatz.table, field: angabe };
        return { ende: fehlschlag(plan, step, 'dbFieldUnknown', detail) };
      }
      werte[knoten.name] = wert;
    } else if (art === 'db') {
      const gelesen = await liesDatenbank(plan, step, deps, { art: 'db', ...knoten.db });
      if (gelesen.ende) return gelesen;
      werte[knoten.name] = gelesen.antwort.value;
    }
  }
  return { werte };
}

// Eine Frage an `deps.dbRead`: `{ antwort }` oder `{ ende }` mit dem Fehlschlag.
async function liesDatenbank(plan, step, deps, anfrage) {
  if (typeof deps.dbRead !== 'function') return { ende: fehlschlag(plan, step, 'unexpected', {}) };
  const antwort = await deps.dbRead(plan.path, anfrage);
  if (antwort && antwort.ok) return { antwort };
  const code = antwort && typeof antwort.code === 'string' ? antwort.code : 'unexpected';
  return { ende: fehlschlag(plan, step, code, (antwort && antwort.detail) || {}) };
}

// Ein zurückgestellter Schritt, für die Datei der Schleife und mit den
// gelieferten Skript-Ergebnissen und Datenbank-Werten gefüllt.
async function gefuellt(lauf, step, item) {
  const { plan } = lauf;
  // Nur der erste Schritt nach dem Lesen zu Beginn einer Wiederholung sieht
  // den Datensatz ohne erneutes Lesen; jeder spätere kann ihn geändert haben.
  const frisch = lauf.datensatzFrisch === true;
  lauf.datensatzFrisch = false;
  if (!step.deferred) return { step };
  if (step.deferred.item !== false && item === null) {
    return { ende: fehlschlag(plan, step, 'unexpected', {}) };
  }
  const geliefert = await laufWerte(lauf, step, frisch);
  if (geliefert.ende) return geliefert;
  const ergebnis = fillLoopStep(step, item, lauf.skripte, geliefert.werte);
  if (ergebnis.ok) return { step: ergebnis.step };
  // Ein Befund der Füllung; sein Text steht unter den Befunden der Prüfung.
  const erster = ergebnis.findings[0] || { code: 'unexpected', detail: {} };
  return { ende: { ...fehlschlag(plan, step, erster.code, erster.detail || {}), befund: true } };
}

// Ein Schritt; null heißt «gelungen, weiter», sonst das Ende des Laufs.
async function schritt(plan, step, deps, ebene) {
  switch (step.keyword) {
    case 'command': {
      const id = String(step.args[0]);
      const ok = await deps.executeCommand(id);
      return ok === false ? fehlschlag(plan, step, 'commandFailed', { command: id }) : null;
    }
    case 'macro':
      return makroSchritt(plan, step, deps, ebene);
    case 'workflow':
      return workflowSchritt(plan, step, deps, ebene);
    case 'wait':
      await deps.sleep(Number(step.args[0]) * 1000);
      return null;
    case 'notify':
      deps.notify(String(step.args[0]));
      return null;
    case 'confirm': {
      const frage = String(step.args[0]);
      if ((await deps.confirm(frage)) === true) return null;
      return {
        status: 'stopped',
        workflow: plan.name,
        path: plan.path,
        line: step.line,
        text: frage,
        declined: true,
      };
    }
    case 'stop':
      return {
        status: 'stopped',
        workflow: plan.name,
        path: plan.path,
        line: step.line,
        text: String(step.args[0]),
      };
    default:
      return hauptprozessSchritt(plan, step, deps);
  }
}

// 4T-002545 (Da): `db-create`; die vergebene Kennung unter dem Namen hinter `as`.
async function anlageSchritt(lauf, step) {
  const { plan, deps } = lauf;
  if (typeof deps.flushBuffers === 'function') await deps.flushBuffers();
  const antwort = await deps.step(plan.path, step);
  if (!antwort || !antwort.ok) {
    const code = antwort && typeof antwort.code === 'string' ? antwort.code : 'unexpected';
    return fehlschlag(plan, step, code, (antwort && antwort.detail) || {});
  }
  if (typeof step.result === 'string' && typeof antwort.record === 'string') {
    lauf.erstellt[step.result] = antwort.record;
  }
  return null;
}

// Ein Schritt samt Ausnahme-Schutz; null heißt «weiter».
async function sicherSchritt(plan, step, deps, ebene) {
  try {
    return await schritt(plan, step, deps, ebene);
  } catch (err) {
    return fehlschlag(plan, step, 'unexpected', { message: err && err.message });
  }
}

// Führt das Skript eines Schritts in der Sandbox aus (3h): `{ antwort }` mit
// dem Wert oder `{ ende }` mit dem Fehlschlag des Schritts.
async function skript(plan, step, deps) {
  if (typeof deps.runScript !== 'function' || typeof step.script !== 'string') {
    return { ende: fehlschlag(plan, step, 'unexpected', {}) };
  }
  const antwort = await deps.runScript(step.script, { path: plan.path, line: step.line });
  if (antwort && antwort.ok === true) return { antwort: { value: antwort.value } };
  const code = antwort && SKRIPT_CODES.includes(antwort.code) ? antwort.code : 'scriptFailed';
  return { ende: fehlschlag(plan, step, code, (antwort && antwort.detail) || {}) };
}

// Die Frage einer Bedingung: `if-script` im Fenster, alle übrigen im Hauptprozess.
async function bedingung(plan, step, deps) {
  if (step.keyword !== SCRIPT_CONDITION_KEYWORD) return abfrage(plan, step, deps);
  const frage = await skript(plan, step, deps);
  return frage.ende ? frage : { antwort: { value: scriptResultTrue(frage.antwort.value) } };
}

// Der Schritt `script … as "name"`: Ergebnis ablegen oder der Fehlschlag.
async function skriptSchritt(lauf, step) {
  const { plan, deps } = lauf;
  const frage = await skript(plan, step, deps);
  if (frage.ende) return frage.ende;
  lauf.skripte[step.result] = scriptResultText(frage.antwort.value);
  return null;
}

// Führt die Schritte `von` bis ausschließlich `bis` aus; `item` ist der Pfad
// der Datei der umgebenden Schleife oder null.
async function bereich(lauf, von, bis, item) {
  const { plan, steps, blocks, deps, ebene } = lauf;
  let i = von;
  while (i < bis) {
    const roh = steps[i];
    const block = blocks[i];
    const vorbereitet = await gefuellt(lauf, roh, item).catch((err) => ({
      ende: fehlschlag(plan, roh, 'unexpected', { message: err && err.message }),
    }));
    if (vorbereitet.ende) return vorbereitet.ende;
    const step = vorbereitet.step;
    if (block && CONDITION_KEYWORDS.includes(step.keyword)) {
      const frage = await bedingung(plan, step, deps).catch((err) => ({
        ende: fehlschlag(plan, step, 'unexpected', { message: err && err.message }),
      }));
      if (frage.ende) return frage.ende;
      const ende = block.end;
      const zweig =
        frage.antwort.value === true
          ? [i + 1, block.else === null ? ende : block.else]
          : [block.else === null ? ende : block.else + 1, ende];
      const ergebnis = await bereich(lauf, zweig[0], zweig[1], item);
      if (ergebnis) return ergebnis;
      i = ende + 1;
      continue;
    }
    if (block && (step.keyword === LOOP_KEYWORD || step.keyword === DB_LOOP_KEYWORD)) {
      const lauf2 = step.keyword === LOOP_KEYWORD ? schleife : datensatzSchleife;
      const ergebnis = await lauf2(lauf, i, step, block).catch((err) =>
        fehlschlag(plan, step, 'unexpected', { message: err && err.message }),
      );
      if (ergebnis) return ergebnis;
      i = block.end + 1;
      continue;
    }
    if (step.keyword === ELSE_KEYWORD || step.keyword === END_KEYWORD) {
      i++;
      continue;
    }
    const unerwartet = (err) =>
      fehlschlag(plan, step, 'unexpected', { message: err && err.message });
    let ende;
    if (step.keyword === SCRIPT_KEYWORD) ende = await skriptSchritt(lauf, step).catch(unerwartet);
    else if (step.keyword === DB_CREATE_KEYWORD) {
      ende = await anlageSchritt(lauf, step).catch(unerwartet);
    } else ende = await sicherSchritt(plan, step, deps, ebene);
    if (ende) return ende;
    i++;
  }
  return null;
}

// Eine Schleife: Liste beim Eintritt, Grenze vor der ersten Wiederholung.
async function schleife(lauf, i, step, block) {
  const { plan, deps } = lauf;
  const frage = await abfrage(plan, step, deps).catch((err) => ({
    ende: fehlschlag(plan, step, 'unexpected', { message: err && err.message }),
  }));
  if (frage.ende) return frage.ende;
  const files = Array.isArray(frage.antwort.files) ? frage.antwort.files : [];
  if (files.length > MAX_LOOP_FILES) {
    return fehlschlag(plan, step, 'tooManyFiles', { max: MAX_LOOP_FILES, count: files.length });
  }
  const liste = files.map((p) => String(p).replace(/\\/g, '/')).sort(compareLoopPaths);
  for (const datei of liste) {
    const ergebnis = await bereich(lauf, i + 1, block.end, datei);
    if (ergebnis) return ergebnis;
  }
  return null;
}

// 4T-002547 (Dc): Die Schleife über die Datensätze einer Abfrage-Datei: Liste
// beim Eintritt, Grenze vor der ersten Wiederholung, je Wiederholung der
// Datensatz frisch gelesen. Keine Schleife in einer Schleife (`loopNested`),
// deshalb genügt ein Datensatz je Lauf.
async function datensatzSchleife(lauf, i, step, block) {
  const { plan, deps } = lauf;
  const frage = await abfrage(plan, step, deps);
  if (frage.ende) return frage.ende;
  const records = Array.isArray(frage.antwort.records) ? frage.antwort.records : [];
  if (records.length > MAX_LOOP_FILES) {
    return fehlschlag(plan, step, 'tooManyRecords', { max: MAX_LOOP_FILES, count: records.length });
  }
  for (const ref of records) {
    const anfrage = { art: 'record', tabelle: ref.path, kennung: ref.id };
    const gelesen = await liesDatenbank(plan, step, deps, anfrage);
    if (gelesen.ende) return gelesen.ende;
    lauf.datensatz = gelesen.antwort.record;
    lauf.datensatzRef = anfrage;
    lauf.datensatzFrisch = true;
    try {
      const ergebnis = await bereich(lauf, i + 1, block.end, null);
      if (ergebnis) return ergebnis;
    } finally {
      lauf.datensatz = null;
      lauf.datensatzRef = null;
    }
  }
  return null;
}

/**
 * Führt einen vorbereiteten Workflow aus.
 *
 * @param {{path: string, name: string, steps: object[], children?: object}} plan
 *   Schritte aus `prepareRun`; `children` ordnet der Zeile eines
 *   `workflow`-Schritts den vorbereiteten Unter-Workflow zu.
 * @param {object} deps `step(path, step)`, `runWindowAction(antwort)`,
 *   `flushBuffers()`, `executeCommand(id)`, `runMacro(name, ebene)` →
 *   `{ ok, reason? }`, `sleep(ms)`, `notify(text)`, `confirm(frage)` → true für
 *   «Ja», `runScript(source, { path, line })` → `{ ok: true, value }` oder
 *   `{ ok: false, code, detail }` (4T-002465), wahlweise
 *   `finish(plan, ergebnis)` am Ende jedes Workflows, auch eines verschachtelten.
 * @param {number} [ebene] Aufruf-Ebene, 0 für den gestarteten Workflow.
 * @returns {Promise<object>} `{ status: 'ok' }`, `{ status: 'stopped', workflow,
 *   path, line, text, inner? }` oder `{ status: 'failed', workflow, path, line,
 *   code, detail }`; Ort ist immer der dieses Workflows, der innere steht in
 *   `inner` bzw. `detail.inner`.
 */
async function runWorkflow(plan, deps, ebene = 0) {
  const steps = plan.steps || [];
  const { blocks } = blockStructure(steps);
  const lauf = {
    plan,
    steps,
    blocks,
    deps,
    ebene,
    skripte: {},
    erstellt: {},
    datensatz: null,
    datensatzRef: null,
    datensatzFrisch: false,
  };
  const ende = await bereich(lauf, 0, steps.length, null);
  const ergebnis = ende || { status: 'ok' };
  // Der Lauf-Stand ist Spur: `finish` fängt seine Fehler selbst ab.
  if (typeof deps.finish === 'function') await deps.finish(plan, ergebnis);
  return ergebnis;
}

/**
 * Die Ziele aller `delete`-Schritte eines vorbereiteten Laufs samt der
 * aufgerufenen Workflows, in Lauf-Reihenfolge und ohne Doppel (4T-002424,
 * Regel P1: eine Bestätigung nennt alle Ziele des Laufs).
 *
 * @param {{steps?: object[], children?: object}} plan wie bei `runWorkflow`.
 * @returns {string[]} Pfade relativ zur Bereichs-Wurzel.
 */
function deleteTargets(plan) {
  return sammleZiele(plan, 'delete', (step) => String(step.args && step.args[0]));
}

// Die Ziele aller Schritte `keyword` samt der aufgerufenen Workflows, in
// Lauf-Reihenfolge und ohne Doppel. `zielVon` bekommt dazu den Schritt der
// umgebenden Schleife `db-for-each` oder null (4T-002547).
function sammleZiele(plan, keyword, zielVon) {
  const ziele = [];
  const gesehen = new Set();
  const besuche = (p) => {
    const steps = (p && p.steps) || [];
    const { loopKind, loopOf } = blockStructure(steps);
    for (const [index, step] of steps.entries()) {
      if (step.keyword === keyword) {
        const schleife = loopKind[index] === DB_LOOP_KEYWORD ? steps[loopOf[index]] : null;
        const ziel = zielVon(step, schleife);
        const schluessel = JSON.stringify(ziel);
        if (!gesehen.has(schluessel)) ziele.push(ziel);
        gesehen.add(schluessel);
      }
      if (step.keyword === 'workflow' && p.children) besuche(p.children[step.line]);
    }
  };
  besuche(plan);
  return ziele;
}

// Ein Argument eines Schritts als Text; ein zurückgestellter Schritt nennt es
// noch ungefüllt, wie es in der Zeile steht.
function argumentText(step, i) {
  if (!step.deferred) return String(step.args && step.args[i]);
  const roh = step.deferred.step && step.deferred.step.args && step.deferred.step.args[i];
  return roh && typeof roh.raw === 'string' ? roh.raw : '';
}

// 4T-002547 (Nachzug nach der Entscheidung des Product Owners vom 2026-11-12,
// Empfehlung pauschal übernommen): Steht der Datensatz eines `db-delete` erst
// im Lauf fest, sagt die eine Bestätigung in Worten, was gelöscht wird. Dafür
// die Art des Ziels: genau ein Datenbank-Wert als ganze Angabe (Leerraum darum
// zählt nicht) ergibt `schleife`, `schleifenFeld`, `erstellt` oder `feld`,
// jede übrige Form mit Platzhalter `offen`.
function einzigerLaufWert(roh) {
  const analysis = analyzeTemplate(roh);
  if (!analysis.ok) return null;
  const teile = analysis.segments.filter((seg) => !(seg.type === 'lit' && seg.text.trim() === ''));
  if (teile.length !== 1 || teile[0].type !== 'context' || !teile[0].befehlsZeile) return null;
  return teile[0];
}

// Das Ziel eines `db-delete` für die Bestätigung; ein festes Ziel unverändert
// als Tabelle und Datensatz, wie die Zeile sie nennt.
function datensatzZiel(step, schleife) {
  const table = argumentText(step, 0);
  const record = argumentText(step, 1);
  if (!step.deferred) return { table, record };
  const lauf = schleife ? { query: argumentText(schleife, 0), max: MAX_LOOP_FILES } : null;
  const knoten = einzigerLaufWert(record);
  const [art, ...rest] = knoten ? knoten.name.split(':') : [];
  const angabe = rest.join(':');
  if (art === 'record' && lauf && angabe.toLowerCase() === 'id') {
    return { table, record, art: 'schleife', ...lauf };
  }
  if (art === 'record' && lauf && traegtFeld(knoten)) {
    return { table, record, art: 'schleifenFeld', field: angabe, ...lauf };
  }
  if (art === 'created') return { table, record, art: 'erstellt' };
  if (art === 'db' && knoten.db) {
    const { table: sourceTable, record: source, field } = knoten.db;
    return { table, record, art: 'feld', field, source, sourceTable, ...(lauf || {}) };
  }
  return { table, record, art: 'offen' };
}

/**
 * Die Ziele aller `db-delete`-Schritte eines vorbereiteten Laufs samt der
 * aufgerufenen Workflows, in Lauf-Reihenfolge und ohne Doppel (4T-002545, D3:
 * eine Bestätigung nennt alle Ziele des Laufs).
 *
 * @param {{steps?: object[], children?: object}} plan wie bei `runWorkflow`.
 * @returns {{table: string, record: string, art?: string, query?: string,
 *   max?: number, field?: string, source?: string, sourceTable?: string}[]}
 *   Tabelle und Datensatz, wie die Zeile sie nennt; ein Platzhalter, der erst
 *   im Lauf feststeht, ungefüllt. Seit 4T-002547 trägt ein solches Ziel `art`
 *   (`schleife`, `schleifenFeld`, `erstellt`, `feld` oder `offen`), in einer
 *   Schleife `db-for-each` dazu ihre Abfrage-Datei (`query`) und Grenze
 *   (`max`), bei einem Feldwert Feld, Datensatz und Tabelle der Quelle.
 */
function dbDeleteTargets(plan) {
  return sammleZiele(plan, DB_DELETE_KEYWORD, datensatzZiel);
}

module.exports = {
  MAX_CALL_DEPTH,
  RUNNER_CODES,
  compareLoopPaths,
  dbDeleteTargets,
  deleteTargets,
  runWorkflow,
  scriptResultText,
  scriptResultTrue,
};
