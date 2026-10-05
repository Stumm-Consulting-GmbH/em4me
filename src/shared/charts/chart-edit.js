// 4T-002024 (Epic 3E-000192): Diagramm einfügen und bearbeiten — Schreib-Kern.
// Prozess-neutral: kein DOM, kein Editor, kein Electron, kein Datei-Zugriff.
//
// Aus einem Dokument-Text und einer Zeile berechnet das Modul, WAS zu
// schreiben ist, als Änderungs-Liste `[{ from, to, insert }]` in Zeichen-
// Offsets des Textes; angewandt wird sie vom Aufrufer in EINER Transaktion,
// damit ein Rückgängig-Schritt Namens-Zeile und Block zusammen zurücknimmt.
// Zeilen sind 1-basiert wie in der Fence-Suche der Datentabelle.
//
// **Gebaut wird aus den Bausteinen des Bestands, nicht aus eigenen Fassungen**
// (Entwicklungsrichtlinien, Kapitel 1, «Erkennungen haben eine Heimat»): die
// Datentabellen über `findPerspectiveDatatableFences`, der Diagramm-Block über
// die Zaun-Regel aus `fence-level.js` und die Marke aus
// `perspective-chart-ref.js`, die Anker über `extractBlockAnchors`, der Inhalt
// des Blocks über `serializeChartSpec` — eine zweite Schreibweise des Blocks
// gibt es nicht. Ob der geschriebene Name die Tabelle wirklich benennt, prüft
// am Ende die Auflösung des Format-Kerns selbst (`resolveTableInDocument`).
//
// **Der Name einer Tabelle** steht seit 4T-002072 in ihrer Kopf-Angabe
// `table: Name`; gelesen wird er aus der Heimat der Kennungen
// (`extractBlockAnchors(text).datentabellen`). Trägt sie dort keinen gültigen,
// gilt weiter die alte Form: die erste nicht leere Zeile nach der Schluss-Zeile
// ihres Zauns, wenn sie genau `^name` lautet; Leerzeilen dazwischen trennen
// nicht. Trägt die Tabelle keinen, wird `tabelle-N` mit der kleinsten freien
// Zahl ab 1 vergeben, ohne Rücksicht auf Groß- und Kleinschreibung der
// vorhandenen Kennungen, und als erste Kopf-Zeile `table: tabelle-N` in den
// Block geschrieben — unter die Tabelle kommt keine Zeile. Das Diagramm nennt
// den Namen ohne Dach-Zeichen, `table: tabelle-N`. Frei ist ein Name, den keine
// Kennung trägt und den das Dokument auch nicht nennt, weder in der Angabe
// `table:` eines Diagramm-Blocks (`scanneTabellenAngabe`, mit und ohne
// Dach-Zeichen) noch in einem Verweis auf einen Block des eigenen Dokuments
// (Wiki-Muster aus link-scan.js).
//
// Ergebnis beider Schreib-Einstiege:
//   { ok: true, changes, name?, blockFrom? }
//                                  changes leer, wenn nichts zu schreiben ist;
//                                  beim Einfügen ist blockFrom der Anfang der
//                                  Öffner-Zeile des neuen Blocks im NEUEN Text
//   { ok: false, grund }           grund aus CHART_EDIT_REASONS; nichts wird
//                                  geschrieben
'use strict';

const { extractBlockAnchors, isValidBlockAnchorId } = require('../block-anchors.js');
const {
  createWikiLinkRegex,
  frontmatterBodyStart,
  maskInlineCode,
} = require('../markdown/link-scan.js');
const { zaunOeffnung, schliesstZaun } = require('../markdown/fence-level.js');
const { findPerspectiveDatatableFences } = require('../markdown/perspective-datatable-view.js');
const {
  istDiagrammFenceInfo,
  scanneTabellenAngabe,
} = require('../markdown/perspective-chart-ref.js');
const {
  CHART_FENCE,
  CHART_KEYS,
  parseChartSpec,
  serializeChartSpec,
} = require('../markdown/perspective-chart.js');
const { resolveTableInDocument } = require('../markdown/perspective-chart-resolve.js');

// Die Gründe, aus denen ein Schreib-Einstieg nichts schreibt.
const CHART_EDIT_REASONS = Object.freeze([
  'no-datatable', //       an der Zeile steht keine Datentabelle
  'table-unclosed', //     der Zaun der Datentabelle ist nicht geschlossen
  'no-chart', //           an der Zeile steht kein Diagramm-Block
  'chart-unclosed', //     der Zaun des Diagramm-Blocks ist nicht geschlossen
  'changed-meanwhile', //  Tabelle bzw. Block weicht vom Stand beim Öffnen ab
  'name-not-unique', //    derselbe Name steht weiter oben schon einmal
  'table-invalid', //      die Datentabelle trägt einen Fehler im Aufbau
  'name-unresolved', //    der Name trifft nach dem Schreiben nicht die Tabelle
]);

const TABLE_NAME_PREFIX = 'tabelle-';
// Der Zaun des neuen Blocks; der Inhalt beginnt je Zeile mit einem Schlüssel
// und kann ihn deshalb nie schließen.
const FENCE_MARK = '```';

// --- Zeilen ---------------------------------------------------------------------

// Text -> Zeilen mit Zeilenende und Offset des Zeilen-Anfangs. Dieselbe
// Zählung wie `split(/\r?\n/)`, aber ohne das Zeilenende zu verlieren.
function splitLines(text) {
  const parts = text.split(/(\r\n|\n)/);
  const lines = [];
  let from = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const eol = parts[i + 1] || '';
    lines.push({ text: parts[i], eol, from });
    from += parts[i].length + eol.length;
  }
  return lines;
}

// Das Zeilenende, mit dem neue Zeilen geschrieben werden: das der Zeile, an
// der eingefügt wird, sonst das erste des Dokuments.
function lineEnd(lines, idx) {
  if (lines[idx] && lines[idx].eol) return lines[idx].eol;
  const first = lines.find((l) => l.eol !== '');
  return first ? first.eol : '\n';
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function fail(grund) {
  return { ok: false, grund };
}

// Wendet eine Änderungs-Liste auf einen Text an (Offsets im Ausgangs-Text).
function applyChanges(text, changes) {
  let out = String(text == null ? '' : text);
  const sorted = [...(changes || [])].sort((a, b) => b.from - a.from);
  for (const c of sorted) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
}

// --- Suchen ---------------------------------------------------------------------

// Name der Tabelle, deren Zaun in `closeLine` (1-basiert) schließt.
function tableNameAfter(lines, closeLine) {
  let i = closeLine;
  while (i < lines.length && lines[i].text.trim() === '') i++;
  const t = i < lines.length ? lines[i].text.trim() : '';
  if (t.startsWith('^') && isValidBlockAnchorId(t.slice(1))) {
    return { name: t.slice(1), nameLine: i + 1 };
  }
  return { name: null, nameLine: null };
}

// 4T-002072: Name aus der Kopf-Angabe `table:` der Tabelle mit dem Öffner
// `openLine`, gelesen aus der Heimat; nameLine ist die Zeile der Angabe. null,
// wenn die Angabe fehlt oder ihr Wert keine gültige Kennung ist. Ob der Name
// dort zählt oder ein Doppel ist, entscheidet erst checkName.
function tableNameInHead(text, openLine) {
  const eintrag = extractBlockAnchors(text).datentabellen.find((t) => t.zaunVon === openLine);
  return eintrag && eintrag.name ? { name: eintrag.name, nameLine: eintrag.nameZeile } : null;
}

// Die Datentabelle, in deren Zaun-Zeilen `line` liegt, oder null:
//   { openLine, closeLine, body, name, nameLine, nameInKopf }
// closeLine null bei einem nicht geschlossenen Zaun; body wie in der
// Fence-Suche (Zeilen mit `\n` verbunden) — er ist der Stand, den der Aufrufer
// beim Öffnen festhält und buildInsertChanges zum Vergleich mitgibt.
// nameInKopf (4T-002072) sagt, ob der Name aus der Kopf-Angabe stammt; sonst
// stammt er aus der alten Zeile `^name` unter dem Zaun (nameLine ist dann
// deren Zeile) oder fehlt.
function findDatatableAtLine(docText, line) {
  const text = String(docText == null ? '' : docText);
  const lines = splitLines(text);
  const fence = findPerspectiveDatatableFences(text).find(
    (f) => line >= f.openLine && line <= Math.min(f.closeLine, lines.length),
  );
  if (!fence) return null;
  const closed = fence.closeLine <= lines.length;
  const kopf = tableNameInHead(text, fence.openLine);
  let name = { name: null, nameLine: null };
  if (kopf) name = kopf;
  else if (closed) name = tableNameAfter(lines, fence.closeLine);
  return {
    openLine: fence.openLine,
    closeLine: closed ? fence.closeLine : null,
    body: fence.body,
    ...name,
    nameInKopf: kopf !== null,
  };
}

// Der Diagramm-Block, in dessen Zaun-Zeilen `line` liegt, oder null:
//   { openLine, closeLine, body, bodyFrom, bodyTo, indent }
// body ist der Text zwischen den Zaun-Zeilen samt seiner Zeilenenden, genau
// der Bereich [bodyFrom, bodyTo); closeLine null bei einem nicht
// geschlossenen Zaun (dann reicht body bis zum Textende).
function findChartBlockAtLine(docText, line) {
  const text = String(docText == null ? '' : docText);
  const lines = splitLines(text);
  const idx = line - 1;
  const block = (open, close) => {
    const bodyFrom = open + 1 < lines.length ? lines[open + 1].from : text.length;
    const bodyTo = close === null ? text.length : lines[close].from;
    return {
      openLine: open + 1,
      closeLine: close === null ? null : close + 1,
      body: text.slice(bodyFrom, bodyTo),
      bodyFrom,
      bodyTo,
      indent: indentOf(lines[open].text),
    };
  };
  let offen = null;
  for (let i = frontmatterBodyStart(lines.map((l) => l.text)); i < lines.length; i++) {
    if (offen) {
      if (!schliesstZaun(lines[i].text, offen.oeffnung)) continue;
      if (idx >= offen.open && idx <= i) {
        return istDiagrammFenceInfo(offen.oeffnung.sprache) ? block(offen.open, i) : null;
      }
      offen = null;
      continue;
    }
    const oeffnung = zaunOeffnung(lines[i].text);
    if (oeffnung) offen = { open: i, oeffnung };
  }
  if (offen && idx >= offen.open && istDiagrammFenceInfo(offen.oeffnung.sprache)) {
    return block(offen.open, null);
  }
  return null;
}

// Namen, die das Dokument nennt, ohne dass ein Anker sie tragen muss: die
// wirksame Angabe `table: name` oder `table: ^name` eines Diagramm-Blocks
// (4T-002072: beide Schreibweisen liefert der Scanner als Form «selbes
// Dokument») und Verweise auf einen
// Block des eigenen Dokuments (`[[#^name]]`, auch als Einbettung und mit
// Bezeichnung). Code-Blöcke nach der Zaun-Regel und Inline-Code zählen nicht,
// wie bei den Ankern. Ein Verweis mit Datei-Namen davor bleibt außer Acht, auch
// wenn er das eigene Dokument meint.
function mentionedNames(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  const names = [];
  let offen = null;
  let chart = false;
  let seen = false;
  for (let i = frontmatterBodyStart(lines); i < lines.length; i++) {
    const line = lines[i];
    if (offen) {
      if (schliesstZaun(line, offen)) offen = null;
      else if (chart && !seen) {
        const angabe = scanneTabellenAngabe(line);
        seen = angabe !== null;
        if (angabe && angabe.form === 'same') names.push(angabe.name);
      }
      continue;
    }
    offen = zaunOeffnung(line);
    if (offen) {
      chart = istDiagrammFenceInfo(offen.sprache);
      seen = false;
      continue;
    }
    for (const m of maskInlineCode(line).matchAll(createWikiLinkRegex())) {
      const ziel = m[1].trim();
      if (ziel.startsWith('#^')) names.push(ziel.slice(2));
    }
  }
  return names.filter(isValidBlockAnchorId);
}

// Der kleinste freie Name `tabelle-N` ab 1. Belegt ist auch ein Name, den das
// Dokument nur nennt (Durchsicht vom 2026-09-30): Zeigt ein Diagramm noch auf
// `tabelle-1`, dessen Tabelle gelöscht wurde, zeichnete es sonst still die
// Werte der neuen Tabelle. Seit 4T-002072 zählen über die Heimat auch die
// Namen in der Kopf-Angabe einer Datentabelle.
function nextFreeTableName(docText) {
  const taken = new Set(
    [...extractBlockAnchors(docText).order, ...mentionedNames(docText)].map((id) =>
      id.toLowerCase(),
    ),
  );
  for (let n = 1; ; n++) {
    const id = `${TABLE_NAME_PREFIX}${n}`;
    if (!taken.has(id)) return id;
  }
}

// --- Einfügen -------------------------------------------------------------------

// Der vollständige Block als Text, jede Zeile mit Einrückung und Zeilenende
// des Dokuments; ohne Zeilenende nach dem Schluss-Zaun. 4T-002072: Der Name
// steht ohne Dach-Zeichen, in derselben Schreibweise wie in der Tabelle.
function chartBlockText(spec, name, eol, indent) {
  const model = parseChartSpec('');
  for (const key of CHART_KEYS) model[key] = spec && spec[key] != null ? spec[key] : null;
  model.table = name;
  const body = serializeChartSpec(model).split('\n').slice(0, -1);
  return [`${FENCE_MARK}${CHART_FENCE}`, ...body, FENCE_MARK].map((l) => indent + l).join(eol);
}

// Trifft `name` im neuen Text genau die Tabelle mit dem Öffner `openLine`?
// `nameLine` ist die Zeile im neuen Text, an der die Heimat den Namen dieser
// Tabelle sehen muss: die Kopf-Angabe oder die alte Zeile `^name`.
function checkName(newText, name, openLine, nameLine) {
  const res = resolveTableInDocument(newText, name);
  if (res.status === 'found' && res.openLine === openLine) return null;
  // Findet die Anker-Erkennung den Namen gar nicht, trifft er nichts; «nicht
  // eindeutig» ist er nur, wenn er weiter oben schon steht.
  const zeile = extractBlockAnchors(newText).lineById.get(name);
  if (zeile === undefined) return 'name-unresolved';
  if (zeile !== nameLine) return 'name-not-unique';
  return res.status === 'invalid' ? 'table-invalid' : 'name-unresolved';
}

// Einfügen eines Diagramms zur Datentabelle an `line`. `spec` trägt die
// Angaben des Formulars (Modell wie parseChartSpec; `table` und `lines` werden
// nicht gelesen). `openedBody` ist der body der Tabelle beim Öffnen des
// Dialogs; weicht die Tabelle davon ab, wird nichts geschrieben. Der Block
// steht unmittelbar unter der Tabelle, bei einem Namen in der alten Zeile
// `^name` unter dieser Zeile, durch eine Leerzeile getrennt, vor einem schon
// vorhandenen Diagramm; folgt direkt weiterer Inhalt, trennt eine Leerzeile
// auch danach.
//
// 4T-002072: Trägt die Tabelle keinen Namen, enthält die Liste ZWEI Änderungen
// in Textfolge — die neue erste Kopf-Zeile `table: tabelle-N` mit der
// Einrückung des Öffners und den Block nach dem Schluss-Zaun. Der Aufrufer
// wendet beide in einer Transaktion an (ein Rückgängig-Schritt).
function buildInsertChanges(docText, line, spec, openedBody) {
  const text = String(docText == null ? '' : docText);
  const table = findDatatableAtLine(text, line);
  if (!table) return fail('no-datatable');
  if (table.closeLine === null) return fail('table-unclosed');
  if (openedBody != null && table.body !== openedBody) return fail('changed-meanwhile');

  const lines = splitLines(text);
  const name = table.name || nextFreeTableName(text);
  const open = table.openLine - 1;
  const indent = ' '.repeat(indentOf(lines[open].text));
  // Der Block kommt nach der Schluss-Zeile, bei einer alten Zeile `^name`
  // darunter nach dieser — auch wenn der Name aus der Kopf-Angabe stammt: Ein
  // Kopf-Name steht im Zaun, und die alte Zeile bliebe sonst unter dem Block
  // statt unter ihrer Tabelle stehen.
  const at = (tableNameAfter(lines, table.closeLine).nameLine || table.closeLine) - 1;
  const eol = lineEnd(lines, at);
  const next = lines[at + 1];
  const pos = lines[at].from + lines[at].text.length;
  const changes = [];
  if (!table.name) {
    const kopfZeile = `${indent}table: ${name}${lineEnd(lines, open)}`;
    changes.push({ from: lines[open + 1].from, to: lines[open + 1].from, insert: kopfZeile });
  }
  const insert =
    eol +
    eol +
    chartBlockText(spec, name, eol, indent) +
    (next && next.text.trim() !== '' ? eol : '');
  changes.push({ from: pos, to: pos, insert });
  const vorher = changes.length > 1 ? changes[0].insert.length : 0;
  const blockFrom = pos + vorher + 2 * eol.length;

  // Die Zeile, an der die Heimat den Namen im neuen Text sehen muss: die
  // vorhandene Kopf-Angabe, die alte Zeile oder die neue Kopf-Zeile.
  const nameLine = table.nameLine || table.openLine + 1;
  const grund = checkName(applyChanges(text, changes), name, table.openLine, nameLine);
  return grund ? fail(grund) : { ok: true, changes, name, blockFrom };
}

// --- Bearbeiten -----------------------------------------------------------------

// Bearbeiten des Diagramm-Blocks an `line`. Ersetzt allein den Inhalt
// zwischen den Zaun-Zeilen: Die Zeilen des Blocks kommen aus seinem jetzigen
// Stand, die Werte der bekannten Angaben aus `spec`; `serializeChartSpec`
// bewahrt unbekannte und unveränderte Zeilen byte-gleich samt Reihenfolge.
// Die Angabe `table:` bleibt, wie sie steht. `openedBody` ist der body des
// Blocks beim Öffnen des Dialogs.
function buildEditChanges(docText, line, spec, openedBody) {
  const text = String(docText == null ? '' : docText);
  const block = findChartBlockAtLine(text, line);
  if (!block) return fail('no-chart');
  if (block.closeLine === null) return fail('chart-unclosed');
  if (openedBody != null && block.body !== openedBody) return fail('changed-meanwhile');

  const current = parseChartSpec(block.body);
  let neu = serializeChartSpec({ ...spec, table: current.table, lines: current.lines });
  // Ein leerer Block führt kein Zeilenende; die neuen Zeilen übernehmen dann
  // das der Öffner-Zeile statt der Vorgabe des Kerns.
  const eol = splitLines(text)[block.openLine - 1].eol;
  if (!block.body.includes('\n') && eol !== '\n') neu = neu.replace(/\n/g, eol);
  // Ein eingerückter Block (etwa in einer Liste): Neu geschriebene Zeilen
  // bekommen die Einrückung des Zauns, bewahrte bleiben, wie sie sind.
  if (block.indent > 0) {
    const kept = new Set(current.lines.map((l) => l.raw));
    const indent = ' '.repeat(block.indent);
    neu = neu
      .split(/(\r\n|\n)/)
      .map((part, i) => (i % 2 === 0 && part !== '' && !kept.has(part) ? indent + part : part))
      .join('');
  }
  if (neu === block.body) return { ok: true, changes: [] };
  return { ok: true, changes: [{ from: block.bodyFrom, to: block.bodyTo, insert: neu }] };
}

module.exports = {
  CHART_EDIT_REASONS,
  TABLE_NAME_PREFIX,
  applyChanges,
  findDatatableAtLine,
  findChartBlockAtLine,
  nextFreeTableName,
  buildInsertChanges,
  buildEditChanges,
};
