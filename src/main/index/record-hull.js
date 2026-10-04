// 4T-002042 (Epic 3E-000258, E6.3): Die transitive Hülle einer Hüllen-Form der
// Abfrage, `ancestors(ziel, feld, …)` oder `descendants(ziel, feld, …)`.
//
// **Eine Menge je Abfrage, nicht ein Urteil je Kandidat.** Die übrige
// Quellen-Auswertung prüft jeden Kandidaten für sich; eine Hülle ließe sich so
// nur beantworten, indem sie je Kandidat neu gebildet würde. Sie entsteht deshalb
// hier einmal je Abfrage durch Breitensuche, und die Datensatz-Ebene prüft danach
// jeden Kandidaten gegen die fertige Menge (`query-records.js`).
//
// **Die beiden Richtungen.** `ancestors` folgt den genannten Verweis-Feldern
// vorwärts: vom Ziel zu dem, worauf es zeigt, und weiter. `descendants` läuft
// sie rückwärts und braucht dafür eine Umkehr-Zuordnung (Ziel auf verweisende
// Datensätze), gebildet einmal je Hülle über die Tabellen, die eines der
// genannten Felder als Verweis-Feld führen. Welche das sind, sagt ihre
// Definition; gelesen wird dafür nur der Kopf jeder Tabelle, und nur die
// passenden Tabellen werden ganz gelesen. Beide Richtungen gehen über
// Tabellen-Grenzen, denn ein Verweis-Wert trägt die Kopf-Datei seines Ziels.
//
// **Die Festlegungen aus E6.3:** Das Ziel gehört nicht zur Menge. Jeder
// Datensatz wird höchstens einmal aufgenommen; der Schlüssel ist Kopf-Datei und
// Kennung, weil die Kennung nur je Tabelle eindeutig ist. Eine Tiefen-Grenze gibt
// es nicht. Ein Zyklus beendet die Suche und ist ein Hinweis, kein Fehler.
//
// **Zyklus heißt Kreis, nicht Mehrfach-Weg.** Dass ein Datensatz auf zwei Wegen
// erreicht wird, etwa ein gemeinsamer Vorfahre über Vater und Mutter, ist kein
// Zyklus. Ob die erkundeten Verweise einen Kreis bilden, prüft nach der Suche
// eine topologische Ordnung über genau diese Verweise (Kahn): Bleibt ein
// Datensatz übrig, liegt er auf einem Kreis oder hinter einem.
//
// **Das Ziel** ist ein Datensatz-Verweis in der Schreibweise des Fließtexts. Die
// Tabelle steht beim Namen oder als Pfad, auch ohne Endung wie in einem
// Wiki-Link; der Anker wird wie eine Verweis-Zelle gelesen (E5.4): die Kennung
// in beiden Schreibweisen, sonst der Wert des einteiligen Schlüssels. Was sich
// nicht auflösen lässt, ergibt die leere Menge (E4); ein mehrdeutiger
// Schlüssel-Wert ebenso, dazu die Meldung «mehrdeutig».
//
// Gelesen wird allein über den Zugriff, den der Aufrufer hereinreicht (die
// Tabellen seines Laufs); dieses Modul hält nichts über eine Abfrage hinaus.
'use strict';

const { pathCompareKey } = require('../../shared/platform.js');
const { isRecordRef } = require('../../shared/query/query-format.js');
const { VERWEIS_ARTEN, legeVerweisZelleAus } = require('../../shared/database/record-verweis.js');
const { VERWEIS_TYP, kopfDateien } = require('../database/record-regel-hilfen.js');
const { definitionAusText, leseKopfSync } = require('./datensatz-erfassung.js');
const { bufferTextFor } = require('./overlay.js');

const MD_EXT_RE = /\.md$/i;

/** Der Schlüssel eines Datensatzes in einer Hülle: Kopf-Datei und Kennung. */
function hullKey(tablePath, id) {
  return `${pathCompareKey(tablePath)}\n${id}`;
}

// Die Namen der Verweis-Felder einer Definition, klein geschrieben.
function refFieldsOf(fields) {
  return fields.filter((f) => f.type === VERWEIS_TYP).map((f) => f.name.toLowerCase());
}

// Die Tabelle des Ziels: beim Namen, als Pfad, als Pfad ohne Endung.
function startTable(node, tableAt) {
  const table = tableAt(node.table);
  if (table || MD_EXT_RE.test(node.table)) return table;
  return tableAt(node.table + '.md');
}

// Der Ziel-Datensatz nach der Ordnung einer Verweis-Zelle.
function startRecord(node, tableAt) {
  const table = startTable(node, tableAt);
  if (!table) return { start: null, ambiguous: false };
  const cell = legeVerweisZelleAus(node.start);
  if (cell.art === VERWEIS_ARTEN.kennung) {
    const r = table.byId.get(cell.wert);
    return { start: r ? { table, r } : null, ambiguous: false };
  }
  const key = table.definition.key;
  if (cell.art === VERWEIS_ARTEN.leer || !key || key.length !== 1) {
    return { start: null, ambiguous: false };
  }
  const hits = table.records.filter((r) => r.key && r.key[0] === cell.wert);
  if (hits.length !== 1) return { start: null, ambiguous: hits.length > 1 };
  return { start: { table, r: hits[0] }, ambiguous: false };
}

// Die Kopf-Dateien der Tabellen, die eines der Felder als Verweis-Feld führen.
// Gelesen wird der Kopf, der ungespeicherte Stand vor der Platte.
function refTableHeads(sicht, fields) {
  return kopfDateien(sicht).filter((head) => {
    const buffer = bufferTextFor(head);
    const read = definitionAusText(buffer !== null ? buffer : leseKopfSync(head));
    return !!read && refFieldsOf(read.definition.fields).some((f) => fields.includes(f));
  });
}

// Vorwärts: die Ziele der genannten Verweis-Felder eines Datensatzes.
function forward(fields, tableAt, flags) {
  return (table, r) => {
    const out = [];
    for (const field of fields) {
      const v = r.values.get(field);
      if (isRecordRef(v) && typeof v.path === 'string' && v.path !== '') {
        const target = tableAt(v.path);
        const hit = target ? target.byId.get(v.id) : null;
        if (hit) out.push({ table: target, r: hit });
        continue;
      }
      const ref = r.refs.get(field);
      if (ref && ref.status === 'ambiguous') flags.ambiguous = true;
    }
    return out;
  };
}

// Rückwärts: die Umkehr-Zuordnung, einmal gebildet.
function backward(fields, tableAt, sicht) {
  const reverse = new Map();
  for (const head of refTableHeads(sicht, fields)) {
    const table = tableAt(head);
    if (!table) continue;
    const own = refFieldsOf(table.definition.fields).filter((f) => fields.includes(f));
    for (const r of table.records) {
      for (const field of own) {
        const v = r.values.get(field);
        if (!isRecordRef(v) || typeof v.path !== 'string' || v.path === '') continue;
        const key = hullKey(v.path, v.id);
        const list = reverse.get(key);
        if (list) list.push({ table, r });
        else reverse.set(key, [{ table, r }]);
      }
    }
  }
  return (table, r) => reverse.get(hullKey(table.path, r.id)) || [];
}

// Bilden die erkundeten Verweise einen Kreis? Kahn über genau diese Kanten; jeder
// erkundete Datensatz ist ein Knoten, auch das Ziel.
function hasCycle(edges) {
  const indegree = new Map();
  for (const key of edges.keys()) indegree.set(key, 0);
  for (const outs of edges.values()) {
    for (const key of outs) indegree.set(key, indegree.get(key) + 1);
  }
  const ready = [];
  for (const [key, degree] of indegree) if (degree === 0) ready.push(key);
  let done = 0;
  while (ready.length > 0) {
    const key = ready.pop();
    done += 1;
    for (const next of edges.get(key)) {
      const degree = indegree.get(next) - 1;
      indegree.set(next, degree);
      if (degree === 0) ready.push(next);
    }
  }
  return done < indegree.size;
}

/**
 * Bildet die Hülle einer Hüllen-Form.
 *
 * @param {{ kind: 'ancestors'|'descendants', table: string, start: string, fields: string[] }} node
 *   Der Quellen-Knoten aus `src/shared/query/query-record-sources.js`.
 * @param {(ref: string) => object|null} tableAt Liest eine Tabelle beim Namen oder
 *   Pfad aus dem Lauf des Aufrufers (Form wie `readRecordTable`).
 * @param {object} sicht Die Sicht des Bereichs-Index mit Puffer-Overlay.
 * @returns {{ members: Map<string, { table: object, r: object }>, cycle: boolean,
 *   ambiguous: boolean }} `members` nach `hullKey`, ohne das Ziel.
 */
function buildHull(node, tableAt, sicht) {
  const members = new Map();
  const { start, ambiguous } = startRecord(node, tableAt);
  const flags = { ambiguous };
  if (!start) return { members, cycle: false, ambiguous: flags.ambiguous };
  const successors =
    node.kind === 'ancestors'
      ? forward(node.fields, tableAt, flags)
      : backward(node.fields, tableAt, sicht);
  const startKey = hullKey(start.table.path, start.r.id);
  const edges = new Map();
  const queue = [start];
  const seen = new Set([startKey]);
  // Ein Index statt `shift()`, damit eine lange Kette linear bleibt.
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const outs = [];
    for (const next of successors(current.table, current.r)) {
      const key = hullKey(next.table.path, next.r.id);
      outs.push(key);
      if (seen.has(key)) continue;
      seen.add(key);
      members.set(key, next);
      queue.push(next);
    }
    edges.set(hullKey(current.table.path, current.r.id), outs);
  }
  return { members, cycle: hasCycle(edges), ambiguous: flags.ambiguous };
}

module.exports = { buildHull, hullKey };
