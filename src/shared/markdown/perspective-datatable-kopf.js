// 4T-1313 (Epic 3E-0235): Syntax der Kopf-Direktiven der typisierten
// Datentabelle — Spalten-Definition und Aggregat-Eintrag.
//
// Herausgelöst aus dem Kern der Modul-Familie (perspective-datatable.js), als
// dessen Größe mit der Anzeige-Überschrift der Spalte über ihre Grenze wuchs.
// Der Schnitt folgt einer erkennbaren Naht: Hier steht ausschließlich die
// Zeichen-Ebene der beiden Kopfzeilen, also wie eine Definition gelesen wird
// und welche Fehler sie erzeugt. Der Kern behält Format-Vertrag, Zerlegung des
// Bodys, Serialisierer, Aggregat-Rechnung und die Render-Einstiege.
//
// Blatt der Familie: Dieses Modul lädt kein anderes und wird ausschließlich
// vom Kern geladen (Import-Graph Kern -> hier).
'use strict';

const COLUMN_TYPES = new Set(['text', 'number', 'date', 'time', 'boolean']);
const AGGREGATE_FUNCS = new Set(['sum', 'avg', 'min', 'max', 'count']);
// Anzeige-Format v1: nur Dezimalstellen bei number, begrenzt auf 0..10.
const MAX_DECIMALS = 10;

// 4T-1313 (Epic 3E-0235): Erste Stelle eines Zeichens AUSSERHALB von
// Anführungszeichen.
//
// Die Zerlegung der Kopfzeile trennt an Doppelpunkt und Gleichheitszeichen.
// Seit der Anzeige-Überschrift dürfen beide auch im Text vorkommen; eine
// einfache Zeichen-Suche zerrisse die Zeile dann an der falschen Stelle. Die
// Kommata-Trennung eine Ebene höher schützt Anführungszeichen bereits, hier
// zieht die Zerlegung nach.
function indexAusserhalbAnfuehrung(text, zeichen) {
  let inAnfuehrung = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inAnfuehrung = !inAnfuehrung;
    else if (!inAnfuehrung && ch === zeichen) return i;
  }
  return -1;
}

// 4T-1313: Kennung und optionaler Anzeigetext aus dem Teil vor dem Doppelpunkt.
// Form: `Kennung` oder `Kennung "Anzeigetext"`. Liefert null bei fehlerhafter
// Anführung, damit der Aufrufer den Struktur-Fehler meldet.
function parseSpaltenKennung(text) {
  const roh = text.trim();
  if (!roh.includes('"')) return { name: roh, label: null };
  const m = /^([^"]*?)\s*"((?:[^"]|"")*)"$/.exec(roh);
  if (!m) return null;
  const name = m[1].trim();
  // Zwei aufeinanderfolgende Anführungszeichen stehen für eines im Text; ohne
  // diese Form wäre ein Anführungszeichen im Anzeigetext nicht schreibbar.
  const label = m[2].replace(/""/g, '"');
  if (!name || !label) return null;
  return { name, label };
}

// Spalten-Definition `Name:typ`, `Name:typ(dez)`, `Name:typ = ausdruck`,
// seit 4T-1313 mit optionalem Anzeigetext: `Name "Anzeigetext":typ`.
// Der Ausdruck wird nur als Rohtext erfasst (Auswertung in 4T-0421).
function parseColumnDef(defText, line, errors) {
  const colonIdx = indexAusserhalbAnfuehrung(defText, ':');
  if (colonIdx <= 0) {
    // 4T-1313: Steckt ein Anführungszeichen in der Definition, ist die nicht
    // geschlossene Anführung die wahrscheinliche Ursache — der Doppelpunkt
    // fehlt dann nicht, er steht nur innerhalb der offenen Anführung. Die
    // genauere Meldung erspart die Suche.
    const code = defText.includes('"') ? 'badColumnLabel' : 'badColumnDef';
    errors.push({ code, line, detail: defText });
    return null;
  }
  const kennung = parseSpaltenKennung(defText.slice(0, colonIdx));
  if (!kennung) {
    errors.push({ code: 'badColumnLabel', line, detail: defText });
    return null;
  }
  const name = kennung.name;
  const label = kennung.label;
  let rest = defText.slice(colonIdx + 1).trim();
  let expr = null;
  const eqIdx = rest.indexOf('=');
  if (eqIdx >= 0) {
    expr = rest.slice(eqIdx + 1).trim();
    rest = rest.slice(0, eqIdx).trim();
    if (expr === '') {
      errors.push({ code: 'badColumnDef', line, detail: defText });
      return null;
    }
  }
  const m = /^([A-Za-z]+)(?:\s*\((\d{1,2})\))?$/.exec(rest);
  if (!m) {
    errors.push({ code: 'badColumnDef', line, detail: defText });
    return null;
  }
  const type = m[1].toLowerCase();
  if (!COLUMN_TYPES.has(type)) {
    errors.push({ code: 'unknownType', line, detail: m[1] });
    return null;
  }
  let decimals = null;
  if (m[2] != null) {
    if (type !== 'number') {
      errors.push({ code: 'badFormat', line, detail: defText });
      return null;
    }
    decimals = parseInt(m[2], 10);
    if (decimals > MAX_DECIMALS) {
      errors.push({ code: 'badFormat', line, detail: defText });
      return null;
    }
  }
  return { name, label, type, decimals, expr };
}

// Typ-Gerechtigkeit der Aggregate: sum/avg nur auf number; min/max auf
// number/date/time (chronologisch bzw. numerisch geordnete Typen); count
// zählt nicht-leere Zellen jedes Typs (boolean: nur `x`-Zellen sind
// nicht-leer, count zählt also die wahren).
function aggregateAllowed(func, type) {
  if (func === 'count') return true;
  if (func === 'sum' || func === 'avg') return type === 'number';
  return type === 'number' || type === 'date' || type === 'time';
}

// Aggregat-Eintrag `Name:func+func`; Spalten-Zuordnung case-insensitiv,
// Mehrfach-Einträge derselben Spalte werden zusammengeführt (Duplikate
// dedupliziert).
function parseAggregateEntry(entryText, columns, aggregates, line, errors) {
  const colonIdx = entryText.indexOf(':');
  if (colonIdx <= 0) {
    errors.push({ code: 'badAggregate', line, detail: entryText });
    return;
  }
  const name = entryText.slice(0, colonIdx).trim().toLowerCase();
  const colIdx = columns.findIndex((c) => c.name.toLowerCase() === name);
  if (colIdx < 0) {
    errors.push({ code: 'unknownAggregateColumn', line, detail: entryText.slice(0, colonIdx) });
    return;
  }
  const funcs = entryText
    .slice(colonIdx + 1)
    .split('+')
    .map((f) => f.trim().toLowerCase())
    .filter((f) => f !== '');
  if (funcs.length === 0) {
    errors.push({ code: 'badAggregate', line, detail: entryText });
    return;
  }
  for (const func of funcs) {
    if (!AGGREGATE_FUNCS.has(func)) {
      errors.push({ code: 'unknownAggregate', line, detail: func });
      continue;
    }
    if (!aggregateAllowed(func, columns[colIdx].type)) {
      errors.push({
        code: 'aggregateTypeMismatch',
        line,
        detail: `${columns[colIdx].name}:${func}`,
      });
      continue;
    }
    if (!aggregates[colIdx].includes(func)) aggregates[colIdx].push(func);
  }
}

module.exports = {
  COLUMN_TYPES,
  AGGREGATE_FUNCS,
  MAX_DECIMALS,
  indexAusserhalbAnfuehrung,
  parseSpaltenKennung,
  parseColumnDef,
  aggregateAllowed,
  parseAggregateEntry,
};
