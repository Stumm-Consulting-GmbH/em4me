// 4T-002347 (Epic 3E-000184): Platzhalter der Workflows (G5, S-a, S-b).
//
// Platzhalter gelten in jedem Text-Argument und werden mit der Vorlagen-Engine
// gefüllt (K6: ein Satz für Vorlagen und Workflows). Alle Eingabe-Dialoge eines
// Laufs werden **vor dem ersten Schritt** erhoben; ein Abbruch lässt keinen
// Schritt laufen. Die Abfolge für den Start (4T-002349):
//
//   1. `workflowInputs` — die Eingaben der Befehls-Zeilen.
//   2. Dialog-Kette des Bestands (`collectAnswers`).
//   3. `templateRefs` — die Pfade hinter `from-template`, gefüllt, weil sie
//      selbst Platzhalter tragen dürfen.
//   4. Der Aufrufer liest die Vorlagen.
//   5. `templateInputs` — die noch nicht beantworteten Eingaben der Vorlagen
//      (S-a), danach erneut die Dialog-Kette.
//   6. `prepareRun` — alle Schritte gefüllt und erneut geprüft.
//
// **S-b, Bedeutung von `{{title}}` und `{{folder}}`:** In einer Befehls-Zeile
// meinen sie das aktive Dokument (Kontext des Aufrufers), in einer eingesetzten
// Vorlage die Ziel-Datei des Schritts wie im Bestand der Vorlagen; `{{file}}`
// und `{{area}}` bleiben in beiden das aktive Dokument und der Bereich.
//
// **Ereignis-Lauf (4T-002459, Entscheidung 3l der Konzept-Runde 4T-002458):**
// Bei einem Lauf nach Ereignis ist `{{file}}` die Datei des Ereignisses, und
// zwei weitere Platzhalter des gemeinsamen Satzes tragen einen Wert: `{{from}}`
// den alten Pfad bei `file-moved`, `{{task}}` den Aufgaben-Text bei
// `task-done`. Der Aufrufer gibt sie im Kontext mit (`file`, `from`, `task`,
// 4T-002460); dieses Modul füllt sie wie jeden anderen Kontext-Platzhalter,
// ohne Wert bleiben sie leer. Welches Ereignis welchen Platzhalter liefert,
// steht in `workflow-event.js`, den Befund dazu meldet der Prüfer.
//
// **Schleife (4T-002464, Entscheidung 3g der Konzept-Runde 4T-002458):** In
// einem Block `for-each` sind `{{item}}` (Pfad der jeweiligen Datei,
// wurzel-relativ mit `/` wie `{{file}}`) und `{{item:name}}` (ihr Name ohne
// Endung) belegt. Ihr Wert steht erst je Wiederholung fest. `prepareRun`
// füllt einen Schritt in der Schleife, der sie trägt, deshalb nur zur Probe
// (mit dem Ersatz-Pfad `PROBE_ITEM`, damit die übrigen Fehler vor dem ersten
// Schritt auffallen) und liefert ihn **zurückgestellt**: `deferred` trägt den
// geprüften Schritt samt Kontext, Antworten und den Vorlagen dieses Schritts,
// übertragbar wie alles hier. Der Ablauf-Kern füllt ihn je Datei mit
// `fillLoopStep`. Alle übrigen Schritte, auch in der Schleife, werden wie
// bisher einmal vor dem ersten Schritt gefüllt; eine Eingabe in der Schleife
// wird damit einmal erhoben und gilt für jede Wiederholung.
//
// **Skript-Ergebnis (4T-002465, Entscheidung 3h):** `{{script:name}}` trägt
// das Ergebnis des Schritts `script … as "name"` und steht damit ebenfalls erst
// im Lauf fest. Ein Schritt mit diesem Platzhalter wird wie ein Schritt der
// Schleife nur zur Probe gefüllt und zurückgestellt; `deferred.item` sagt, ob
// er zudem eine Datei der Schleife braucht. Der Ablauf-Kern füllt ihn mit
// `fillLoopStep` und den bis dahin gelieferten Ergebnissen. Der Schritt
// `script` und `if-script` behält beim Füllen den geprüften Quelltext
// (`script`) und den Namen des Ergebnisses (`result`).
//
// **Datenbank-Befehle (4T-002544):** Tabelle und Datensatz sind Texte, die
// Paare `feld="Wert"` werden gefüllt (`pairs` mit `key` und `value`), das
// Ziel `into` von `db-query` als Pfad (`target`). Trug das erste Argument
// Platzhalter, prüft `dbFilledFindings` Tabelle, Felder und Abfrage-Datei
// nach dem Füllen (Ausführungs-Entscheidung 4 der Konzept-Runde 4T-002543).
// Die Ausführung der Befehle bauen die Folge-Tasks des Epics.
//
// **Wörtliche Quellen** (Entscheidung der Sitzung vom 2026-10-22, O2): Allein
// `from-template` füllt Platzhalter, das ist der Sinn einer Vorlage.
// `from-section` und `from-file` übernehmen ihren Inhalt wörtlich und werden
// erst beim Schritt gelesen (O1), weil ein früherer Schritt sie ändern kann.
//
// **Ein Zeitpunkt je Lauf:** Der Aufrufer gibt `nowMs` einmal mit, damit Datums-
// Platzhalter in mehreren Zeilen nicht um Mitternacht verschiedene Tage nennen.
//
// **Ein leerer Platzhalter am Pfad-Anfang hinterlässt keinen Trenner:**
// `"{{folder}}/Neu.md"` ergibt im Wurzel-Ordner `Neu.md` und nicht `/Neu.md`,
// das als absoluter Pfad abgewiesen würde. Ein Schrägstrich, der im Text selbst
// am Anfang steht, bleibt und wird abgewiesen.
//
// Alle Ergebnisse sind als JSON übertragbar; sie gehen an den Hauptprozess.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { analyzeTemplate, fillTemplate } = require('../template-engine.js');
const { MD_EXT_RE } = require('../markdown/link-scan.js');
const { toLogicalName } = require('../subpages.js');
const { checkAreaPath, checkFileName } = require('./workflow-paths.js');
const { referenceState } = require('./workflow-catalog.js');
const {
  blockStructure,
  hasLoopPlaceholder,
  hasScriptPlaceholder,
  parseLoopPattern,
} = require('./workflow-check.js');
const { dbFilledFindings } = require('./workflow-check-db.js');

const TEXT_ARTEN = new Set(['path', 'name', 'text', 'key', 'value', 'pattern', 'table', 'record']);
/** Ersatz-Pfad für die Probe-Füllung eines Schritts in der Schleife. */
const PROBE_ITEM = 'x.md';

function befund(step, code, detail = {}) {
  return { code, line: step.line, blockLine: step.blockLine, column: null, detail };
}

// Die Texte eines Schritts mit Platzhaltern, in Lese-Reihenfolge.
function texteDes(step) {
  const texte = step.args
    .filter((a) => TEXT_ARTEN.has(a.type) && a.form !== 'word')
    .map((a) => a.raw);
  if (step.source && step.source.raw !== undefined) texte.push(step.source.raw);
  if (step.position && step.position.raw !== undefined) texte.push(step.position.raw);
  // 4T-002544: Ziel von `db-query` und Werte der Paare.
  if (step.target && step.target.raw !== undefined) texte.push(step.target.raw);
  for (const paar of step.pairs || []) texte.push(paar.raw);
  return texte;
}

// Eingaben einer Analyse ohne die bereits bekannten Schlüssel.
function neueEingaben(analysis, bekannt, hinein) {
  for (const input of analysis.inputs) {
    if (bekannt.has(input.key)) continue;
    bekannt.add(input.key);
    hinein.push(input);
  }
}

/**
 * Die Eingabe-Dialoge der Befehls-Zeilen, im Format der Vorlagen-Engine,
 * entdoppelt und in Reihenfolge des ersten Vorkommens.
 *
 * @param {object[]} steps geprüfte Schritte aus `checkWorkflow`.
 * @returns {object[]} Eingaben `{ key, kind, question, defaultValue|options }`.
 */
function workflowInputs(steps) {
  const bekannt = new Set();
  const inputs = [];
  for (const step of steps || []) {
    for (const raw of texteDes(step)) {
      const analysis = analyzeTemplate(raw);
      if (analysis.ok) neueEingaben(analysis, bekannt, inputs);
    }
  }
  return inputs;
}

function fuelle(raw, kontext, answers) {
  const analysis = analyzeTemplate(raw);
  if (!analysis.ok) return { ok: false, engine: analysis.error.code };
  const gefuellt = fillTemplate(analysis, { ...kontext, answers: answers || {} });
  return gefuellt.ok
    ? { ok: true, text: gefuellt.text }
    : { ok: false, engine: gefuellt.error.code };
}

// Wie `fuelle`, ohne führenden Trenner hinter leeren Platzhaltern am Anfang;
// Rückstriche werden zu Schrägstrichen.
function fuellePfad(raw, kontext, answers) {
  const analysis = analyzeTemplate(raw);
  if (!analysis.ok) return { ok: false, engine: analysis.error.code };
  const erstesLiteral = analysis.segments.findIndex((s) => s.type === 'lit');
  let segments = analysis.segments;
  if (erstesLiteral > 0) {
    const davor = fillTemplate(
      { ok: true, segments: segments.slice(0, erstesLiteral) },
      { ...kontext, answers: answers || {} },
    );
    if (davor.ok && davor.text === '') {
      const lit = segments[erstesLiteral];
      segments = [...segments];
      segments[erstesLiteral] = { ...lit, text: lit.text.replace(/^[\\/]+/, '') };
    }
  }
  const gefuellt = fillTemplate({ ok: true, segments }, { ...kontext, answers: answers || {} });
  if (!gefuellt.ok) return { ok: false, engine: gefuellt.error.code };
  return { ok: true, text: gefuellt.text.replace(/\\/g, '/') };
}

// Füllt einen Pfad und prüft ihn auf die Bereichs-Grenze.
function pfadWert(step, raw, kontext, answers, findings) {
  const gefuellt = fuellePfad(raw, kontext, answers);
  if (!gefuellt.ok) {
    findings.push(befund(step, 'placeholderInvalid', { engine: gefuellt.engine }));
    return null;
  }
  const grenze = checkAreaPath(gefuellt.text);
  if (grenze) {
    findings.push(
      befund(step, grenze.code, grenze.kind ? { kind: grenze.kind, path: gefuellt.text } : {}),
    );
    return null;
  }
  return gefuellt.text;
}

/**
 * Die Vorlagen hinter `from-template`, mit gefülltem und geprüftem Pfad.
 *
 * @param {object[]} steps geprüfte Schritte.
 * @param {object} context Kontext des aktiven Dokuments (`file`, `title`,
 *   `folder`, `area`, `nowMs`, `locale`; im Ereignis-Lauf dazu `from`, `task`).
 * @param {object} answers Antworten der Dialog-Kette.
 * @returns {{refs: {line: number, blockLine: number, path: string}[], findings: object[]}}
 */
function templateRefs(steps, context, answers) {
  const refs = [];
  const findings = [];
  for (const step of steps || []) {
    if (!step.source || step.source.kind !== 'template') continue;
    const pfad = pfadWert(step, step.source.raw, context, answers, findings);
    if (pfad !== null) refs.push({ line: step.line, blockLine: step.blockLine, path: pfad });
  }
  return { refs, findings };
}

const hat = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

/**
 * Die noch nicht beantworteten Eingaben der eingesetzten Vorlagen (S-a).
 *
 * @param {object[]} refs aus `templateRefs`.
 * @param {object} templates Pfad → Text der Vorlage, `null` für «nicht lesbar».
 * @param {object} answers bereits erhobene Antworten.
 * @returns {{inputs: object[], findings: object[]}}
 */
function templateInputs(refs, templates, answers) {
  const bekannt = new Set(Object.keys(answers || {}));
  const inputs = [];
  const findings = [];
  for (const ref of refs || []) {
    const text = hat(templates, ref.path) ? templates[ref.path] : null;
    if (typeof text !== 'string') {
      findings.push(befund(ref, 'templateUnreadable', { path: ref.path }));
      continue;
    }
    const analysis = analyzeTemplate(text);
    if (!analysis.ok) {
      findings.push(
        befund(ref, 'templateInvalid', { path: ref.path, engine: analysis.error.code }),
      );
      continue;
    }
    neueEingaben(analysis, bekannt, inputs);
  }
  return { inputs, findings };
}

// Die Knoten-Namen der Datenbank-Werte eines Laufs (`befehlsZeile` in der
// Vorlagen-Engine): `record:…`, `db:…`, `created:…`.
const BEFEHLSZEILEN_WERT_RE = /^(?:record|db|created):/;

// Kontext einer Ziel-Datei für das Füllen einer Vorlage (S-b), wie im Bestand
// der Vorlagen: logischer Titel ohne Endung, Ordner wurzel-relativ. Review-Runde 1
// zu 3E-000368: Er trägt keinen Datenbank-Wert des Laufs, auch wenn derselbe
// Platzhalter in der Befehls-Zeile einen hat; in der Vorlage bleibt er so als
// sein eigener Text stehen (Zusicherung der Vorlagen-Engine, «Nur in
// Befehls-Zeilen»). Alle Wege, die eine Vorlage füllen, gehen hier durch.
function zielKontext(context, zielPfad) {
  const schnitt = zielPfad.lastIndexOf('/');
  const basis = zielPfad.slice(schnitt + 1).replace(MD_EXT_RE, '');
  const ohneDatenbank = {};
  for (const [schluessel, wert] of Object.entries(context || {})) {
    if (!BEFEHLSZEILEN_WERT_RE.test(schluessel)) ohneDatenbank[schluessel] = wert;
  }
  return {
    ...ohneDatenbank,
    title: toLogicalName(basis),
    folder: schnitt >= 0 ? zielPfad.slice(0, schnitt) : '',
  };
}

function argumentWert(step, arg, context, answers, findings) {
  if (arg.type === 'number') return Number(arg.raw);
  if (arg.type === 'commandId') return arg.raw;
  if (arg.form === 'word') return arg.type === 'value' ? Number(arg.raw) : arg.raw;
  if (arg.type === 'path') return pfadWert(step, arg.raw, context, answers, findings);
  if (arg.type === 'pattern') {
    const muster = pfadWert(step, arg.raw, context, answers, findings);
    if (muster === null) return null;
    if (!parseLoopPattern(muster).ok) {
      findings.push(befund(step, 'loopPatternInvalid', { pattern: muster }));
      return null;
    }
    return muster;
  }
  const gefuellt = fuelle(arg.raw, context, answers);
  if (!gefuellt.ok) {
    findings.push(befund(step, 'placeholderInvalid', { engine: gefuellt.engine }));
    return null;
  }
  if (arg.type === 'name') {
    const name = checkFileName(gefuellt.text);
    if (name) findings.push(befund(step, name.code));
  }
  return gefuellt.text;
}

function quelleWert(step, args, context, answers, templates, findings) {
  const { source } = step;
  if (!source) return null;
  if (source.kind === 'section') {
    const name = fuelle(source.raw, context, answers);
    if (name.ok) return { kind: 'section', name: name.text };
    findings.push(befund(step, 'placeholderInvalid', { engine: name.engine }));
    return null;
  }
  const pfad = pfadWert(step, source.raw, context, answers, findings);
  if (pfad === null) return null;
  if (source.kind === 'file') return { kind: 'file', path: pfad };
  const text = hat(templates, pfad) ? templates[pfad] : null;
  if (typeof text !== 'string') {
    findings.push(befund(step, 'templateUnreadable', { path: pfad }));
    return null;
  }
  const ziel = typeof args[0] === 'string' ? args[0] : '';
  const gefuellt = fuelle(text, zielKontext(context, ziel), answers);
  if (!gefuellt.ok) {
    findings.push(befund(step, 'templateInvalid', { path: pfad, engine: gefuellt.engine }));
    return null;
  }
  return { kind: 'template', path: pfad, text: gefuellt.text };
}

function bezugPruefen(step, args, options, findings) {
  const name = typeof args[0] === 'string' ? args[0].trim() : '';
  const { keyword } = step;
  if (keyword === 'workflow' && options.ownName && name === options.ownName) {
    findings.push(befund(step, 'selfCall'));
    return;
  }
  if (keyword !== 'workflow' && keyword !== 'macro') return;
  const lage = referenceState(
    keyword === 'workflow' ? options.isKnownWorkflow : options.isKnownMacro,
    name,
  );
  if (lage === 'unknown') findings.push(befund(step, `${keyword}Unknown`, { name }));
  else if (lage === 'ambiguous') findings.push(befund(step, `${keyword}Ambiguous`, { name }));
}

// 4T-002544: Paare und Ziel eines Datenbank-Schritts, gefüllt.
function datenbankTeile(step, gefuellt, context, answers, findings) {
  if (Array.isArray(step.pairs)) {
    gefuellt.pairs = step.pairs.map((paar) => {
      const wert = fuelle(paar.raw, context, answers);
      if (!wert.ok) findings.push(befund(step, 'placeholderInvalid', { engine: wert.engine }));
      return { key: paar.key, value: wert.ok ? wert.text : null };
    });
  }
  if (step.target !== undefined) {
    gefuellt.target = step.target
      ? pfadWert(step, step.target.raw, context, answers, findings)
      : null;
  }
}

// Füllt einen Schritt; Befunde gehen in `findings`.
function fuelleSchritt(step, context, answers, templates, options, findings) {
  const args = step.args.map((a) => argumentWert(step, a, context, answers, findings));
  bezugPruefen(step, args, options, findings);
  const source = quelleWert(step, args, context, answers, templates, findings);
  let position = null;
  if (step.position && step.position.kind === 'atStart') position = { kind: 'atStart' };
  else if (step.position) {
    const ueberschrift = fuelle(step.position.raw, context, answers);
    if (ueberschrift.ok) position = { kind: 'under', heading: ueberschrift.text };
    else findings.push(befund(step, 'placeholderInvalid', { engine: ueberschrift.engine }));
  }
  const gefuellt = {
    line: step.line,
    blockLine: step.blockLine,
    keyword: step.keyword,
    args,
    source,
    position,
  };
  if (typeof step.script === 'string') gefuellt.script = step.script;
  if (typeof step.result === 'string') gefuellt.result = step.result;
  datenbankTeile(step, gefuellt, context, answers, findings);
  dbFilledFindings(step, args, options, (code, detail) =>
    findings.push(befund(step, code, detail)),
  );
  return gefuellt;
}

/**
 * Die Belegung der Skript-Platzhalter aus den gelieferten Ergebnissen.
 *
 * @param {Object<string, string>} [ergebnisse] Name (klein) → Ergebnis als Text.
 * @returns {Object<string, string>} `script:<name>` → Text.
 */
function scriptResultContext(ergebnisse) {
  const kontext = {};
  for (const [name, wert] of Object.entries(ergebnisse || {})) kontext[`script:${name}`] = wert;
  return kontext;
}

/**
 * Die Belegung der Schleifen-Platzhalter für eine Datei (3g).
 *
 * @param {string} pfad wurzel-relativ mit `/`.
 * @returns {{item: string, 'item:name': string}} Pfad und Name ohne Endung.
 */
function loopItemContext(pfad) {
  const text = String(pfad == null ? '' : pfad).replace(/\\/g, '/');
  const name = text.slice(text.lastIndexOf('/') + 1);
  const punkt = name.lastIndexOf('.');
  return { item: text, 'item:name': punkt > 0 ? name.slice(0, punkt) : name };
}

// Trägt ein Schritt einen Schleifen-Platzhalter?
function traegtItem(step) {
  return texteDes(step).some((raw) => hasLoopPlaceholder(raw));
}

// Trägt ein Schritt einen Platzhalter eines Skript-Ergebnisses?
function traegtSkript(step) {
  return texteDes(step).some((raw) => hasScriptPlaceholder(raw));
}

/**
 * 4T-002547: Die Platzhalter eines Schritts, deren Wert erst im Lauf feststeht:
 * `{{script:…}}` und die Datenbank-Werte `{{record:…}}`, `{{db:…}}` und
 * `{{created:…}}` (Knoten mit `befehlsZeile`), je Knoten-Name einmal.
 *
 * @param {object} step geprüfter Schritt (bei einem zurückgestellten `deferred.step`).
 * @returns {Array<{name: string, db?: {table: string, record: string, field: string}}>}
 */
function runValueNodes(step) {
  const knoten = new Map();
  for (const raw of texteDes(step)) {
    const analysis = analyzeTemplate(raw);
    if (!analysis.ok) continue;
    for (const seg of analysis.segments) {
      if (seg.type !== 'context') continue;
      if (!seg.befehlsZeile && !seg.name.startsWith('script:')) continue;
      if (!knoten.has(seg.name))
        knoten.set(seg.name, seg.db ? { name: seg.name, db: seg.db } : { name: seg.name });
    }
  }
  return [...knoten.values()];
}

// Trägt ein Schritt einen Datenbank-Wert eines Laufs (4T-002547)?
function traegtDatenbankWert(step) {
  return runValueNodes(step).some((k) => !k.name.startsWith('script:'));
}

// Ersatz-Werte der Lauf-Platzhalter eines Schritts für die Probe-Füllung: ein
// harmloser Name wie beim Ersatz im Prüfer, damit ein Pfad aus einem
// Skript-Ergebnis oder einem Datenbank-Wert nicht schon als leer auffällt.
function skriptProbe(step) {
  const probe = {};
  for (const k of runValueNodes(step)) probe[k.name] = 'x';
  return probe;
}

// Die Vorlagen, die ein Schritt liest (sein Pfad trägt kein `{{item}}`).
function vorlagenDes(step, context, answers, templates) {
  if (!step.source || step.source.kind !== 'template') return {};
  const pfad = fuellePfad(step.source.raw, context, answers);
  if (!pfad.ok || !hat(templates, pfad.text)) return {};
  return { [pfad.text]: templates[pfad.text] };
}

/**
 * Füllt einen zurückgestellten Schritt für eine Datei der Schleife und mit den
 * bis dahin gelieferten Skript-Ergebnissen.
 *
 * @param {{line: number, blockLine: number, deferred: {step: object,
 *   context: object, answers: object, templates: object, item?: boolean}}}
 *   deferredStep aus `prepareRun`.
 * @param {string|null} itemPath Pfad der Datei, wurzel-relativ mit `/`; null
 *   außerhalb einer Schleife.
 * @param {Object<string, string>} [scriptResults] Name (klein) → Ergebnis.
 * @param {Object<string, string>} [runValues] 4T-002547: Knoten-Name
 *   (`record:…`, `db:…`, `created:…`) → Wert, vom Ablauf-Kern gelesen.
 * @returns {{ok: boolean, step: object|null, findings: object[]}}
 */
function fillLoopStep(deferredStep, itemPath, scriptResults, runValues = {}) {
  const findings = [];
  const d = deferredStep && deferredStep.deferred;
  if (!d || !d.step) {
    return { ok: false, step: null, findings: [befund(deferredStep || {}, 'unexpected')] };
  }
  const kontext = {
    ...d.context,
    ...(itemPath == null ? {} : loopItemContext(itemPath)),
    ...scriptResultContext(scriptResults),
    // 4T-002547: Datenbank-Werte des Laufs unter ihren Knoten-Namen.
    ...runValues,
  };
  const step = fuelleSchritt(d.step, kontext, d.answers, d.templates || {}, {}, findings);
  return { ok: findings.length === 0, step: findings.length === 0 ? step : null, findings };
}

/**
 * Füllt alle Schritte und prüft sie erneut, vor dem ersten Schritt.
 *
 * @param {object[]} steps geprüfte Schritte aus `checkWorkflow`.
 * @param {object} context Kontext des aktiven Dokuments, mit einem `nowMs` je Lauf.
 * @param {object} answers alle Antworten der Dialog-Kette.
 * @param {object} templates Pfad → Text der Vorlagen aus `templateRefs`.
 * @param {{ownName?: string, isKnownMacro?: Function, isKnownWorkflow?: Function}} [options]
 * @returns {{ok: boolean, steps: object[], findings: object[]}} Schritte je
 *   `{ line, blockLine, keyword, args, source, position }`.
 */
function prepareRun(steps, context, answers, templates, options = {}) {
  const findings = [];
  const fertig = [];
  const { inLoop } = blockStructure(steps || []);
  (steps || []).forEach((step, index) => {
    const item = inLoop[index] === true && traegtItem(step);
    const datenbank = traegtDatenbankWert(step);
    if (item || traegtSkript(step) || datenbank) {
      // Probe mit Ersatz-Pfad und Ersatz-Werten; die Füllung im Lauf leistet
      // `fillLoopStep`. 4T-002547: Ein Datenbank-Wert steht erst im Lauf fest;
      // Tabelle und Abfrage-Datei aus ihm prüft dann der Hauptprozess, nicht die
      // Probe mit Ersatz-Werten.
      const probe = { ...context, ...skriptProbe(step) };
      if (item) Object.assign(probe, loopItemContext(PROBE_ITEM));
      const probeOptionen = datenbank
        ? { ...options, dbTable: undefined, dbQuery: undefined }
        : options;
      fuelleSchritt(step, probe, answers, templates, probeOptionen, findings);
      fertig.push({
        line: step.line,
        blockLine: step.blockLine,
        keyword: step.keyword,
        args: [],
        source: null,
        position: null,
        deferred: {
          step,
          context,
          answers: answers || {},
          templates: vorlagenDes(step, context, answers, templates),
          item,
        },
      });
      return;
    }
    fertig.push(fuelleSchritt(step, context, answers, templates, options, findings));
  });
  return { ok: findings.length === 0, steps: findings.length === 0 ? fertig : [], findings };
}

module.exports = {
  PROBE_ITEM,
  fillLoopStep,
  loopItemContext,
  prepareRun,
  runValueNodes,
  scriptResultContext,
  templateInputs,
  templateRefs,
  workflowInputs,
};
