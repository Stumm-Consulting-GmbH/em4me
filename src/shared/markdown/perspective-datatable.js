// 4T-000417 (Epic 3E-000079): Perspective Datatable — Format, Parser und
// Serialisierer der typisierten Datentabelle (Fence `perspective-datatable`).
// Prozess-neutral (kein Electron, kein DOM), Muster perspective-table.js.
//
// 4T-000986 (Epic 3E-000196): Kern der Modul-Familie. Neben Format, Parser,
// Serialisierer und Aggregat-Rechnung hält er die zwei Render-Einstiege
// und reicht die Arbeit an die Schwester-Module weiter:
//   perspective-datatable-computed.js  berechnete Spalten (Validierung,
//                                      Auswertung) samt geteilter Grund-
//                                      Helfer; Blatt der Familie
//   perspective-datatable-view.js      Anzeige-Formatierung, Sortierung,
//                                      Filter, Fence-Suche
//   perspective-datatable-html.js      Grid-HTML und Portable-Tabelle
//   perspective-datatable-kopf.js      Zeichen-Ebene der Kopf-Direktiven
//                                      (Spalten-Definition, Aggregat-Eintrag);
//                                      Blatt der Familie, seit 4T-001313
//   perspective-datatable-cells.js     Zell-Zerlegung und Lage der
//                                      Text-Zellen einer Roh-Zeile; seit
//                                      4T-002013, geteilt mit Verweis-Index,
//                                      Umbenennungs-Nachzug und
//                                      Schlagwort-Umbenennung
// Der Import-Graph läuft ausschließlich von hier nach unten (Kern -> html
// -> view -> computed, Kern -> kopf, Kern -> cells -> kopf); kein
// Schwester-Modul lädt den Kern.
//
// Format des Fence-Bodys:
//   table: Umsatz
//   columns: Name:text, Datum:date, Start:time, Betrag:number(2),
//            Erledigt:boolean, Gesamt:number = Betrag * 2
//   aggregate: Betrag:sum+avg, Erledigt:count
//   types: hidden
//   | Anna | 2026-07-08 | 09:30 | 12.50 | x |
//
// 4T-001313 (Epic 3E-000235): Zwei Ergänzungen des Formats. Hinter der Kennung
// einer Spalte darf in doppelten Anführungszeichen ein Anzeigetext stehen
// (`Gesamt "Gesamt (brutto)":number`); angesprochen wird die Spalte in
// Aggregaten und Ausdrücken weiterhin nur über ihre Kennung. Die Kopfzeile
// `types: shown|hidden` schaltet die Typangabe unter der Überschrift; ohne sie
// gilt die Anzeige. Beides ist reine Darstellung und ohne Wirkung auf die
// Typ-Prüfung der Zellen.
//
// 4T-002072 (Epic 3E-000192): Die Kopf-Angabe `table: Name` gibt der Tabelle
// ihren Namen, in derselben Schreibweise, in der ein Diagramm sie nennt. Sie
// steht höchstens einmal vor den Datenzeilen; für den Namen gelten die Regeln
// der Block-Kennungen (`isValidBlockAnchorId`), denn er ist eine Kennung des
// Blocks: Die Heimat der Kennungen (src/shared/block-anchors.js) liest ihn
// selbst aus dem Zaun, nach derselben Regel wie dieser Parser. Ein leerer,
// ungültiger oder doppelter Name ist ein Struktur-Fehler (es gibt keine
// Fehler-Art, die das Gitter bearbeitbar ließe); ein Dach-Zeichen davor ist
// ungültig, weil das Zurückschreiben die Zeile sonst still umschriebe. Der
// Serialisierer schreibt den Namen als erste Zeile.
//
// Kanonische Speicherformate (PO-Entscheidung D, Epic 3E-000079):
//   number  Punkt-Dezimal (optionales Anzeige-Format `number(n)` = Dezimalstellen)
//   date    JJJJ-MM-TT
//   time    HH:MM
//   boolean x / leer
//   text    frei; `|` im Text als `\|` escaped
//
// Datenmodell (Rückgabe von parsePerspectiveDatatable):
//   {
//     name:       string|null   Name aus der Kopf-Angabe `table` (4T-002072);
//                 null ohne Angabe oder bei leerem bzw. ungültigem Wert
//     columns:    [{ name, label|null, type, decimals|null, expr|null }]
//                 expr = Rohtext der berechneten Spalte (Auswertung in
//                 4T-000421); label = Anzeige-Überschrift, null ohne Angabe
//     showTypes:  true|false|null   Typangabe im Spaltenkopf; null = keine
//                 `types`-Zeile im Block. Der Unterschied zu true trägt die
//                 Serialisierung: nur eine ausdrückliche Angabe wird
//                 zurückgeschrieben
//     aggregates: [[func, …], …]   parallel zu columns (leer = keine Aggregate)
//     rows:       [[cell, …], …]   cell = { text, value, error|null }; text ist
//                 der un-escapte Zell-Rohtext (bleibt bei Fehler-Zellen erhalten,
//                 kein Datenverlust), value der typ-geparste Wert (null = leer
//                 bzw. nicht auswertbar), error ein Fehler-Code für die
//                 lokalisierte Anzeige (datatable.cellError.<code>)
//     errors:     [{ code, line, detail }]   Struktur-Fehler; line 1-basiert im
//                 Fence-Body, detail der beanstandete Rohtext
//   }
//
// Fehler-Semantik: Struktur-Fehler (unbekannter Typ, Spalten-Anzahl-Abweichung,
// …) landen in errors und machen die Tabelle für den Grid-Editor unbearbeitbar
// (4T-000419 blockiert das Rückschreiben, solange errors nicht leer ist — sonst
// könnte der kanonische Serialisierer strukturell defekte Zeilen verändern).
// Zell-Wert-Fehler sind dagegen weich: die Zelle trägt den Fehler-Code, der
// Rohtext bleibt erhalten und wird unverändert re-serialisiert.
'use strict';

const {
  isValidIsoDate,
  normalizeFloat,
  dataIndexByColumn,
  validateComputedColumns,
  computeComputedCells,
  makeCellValueResolver,
} = require('./perspective-datatable-computed.js');
const {
  buildErrorsHtml,
  buildDatatableTableHtml,
  buildPortableDatatableHtml,
} = require('./perspective-datatable-html.js');
// 4T-001313 (Epic 3E-000235): Zeichen-Ebene der beiden Kopfzeilen.
const { parseColumnDef, parseAggregateEntry } = require('./perspective-datatable-kopf.js');
// 4T-002013 (Epic 3E-000332): Zell-Zerlegung, geteilt mit Verweis-Index,
// Umbenennungs-Nachzug und Schlagwort-Umbenennung.
const { splitTopLevel, splitPipeRow } = require('./perspective-datatable-cells.js');
// 4T-002072 (Epic 3E-000192): die Regel der Block-Kennungen für den Namen der
// Tabelle. Ein Zyklus entsteht nicht: Die Heimat lädt keinen Teil der Familie.
const { isValidBlockAnchorId } = require('../block-anchors.js');
// 4T-002797 (Epic 3E-000449): private Kommentare in Zellen. Die Erkennung lädt
// keinen Teil der Familie; ein Zyklus entsteht nicht.
const { stripPercentComments, findPercentCommentRanges } = require('./plugins/comments.js');

// --- Werte-Parsing pro Typ ----------------------------------------------------

// Zell-Rohtext (un-escaped, getrimmt) -> { value, error }. Leere Zellen sind
// bei allen Typen gültig: text -> '', boolean -> false, sonst null.
function parseCellValue(type, text) {
  if (type === 'text') return { value: text, error: null };
  if (text === '') {
    return type === 'boolean' ? { value: false, error: null } : { value: null, error: null };
  }
  if (type === 'number') {
    if (!/^-?\d+(\.\d+)?$/.test(text)) return { value: null, error: 'invalidNumber' };
    return { value: parseFloat(text), error: null };
  }
  if (type === 'date') {
    if (!isValidIsoDate(text)) return { value: null, error: 'invalidDate' };
    return { value: text, error: null };
  }
  if (type === 'time') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return { value: null, error: 'invalidTime' };
    return { value: text, error: null };
  }
  // boolean: kanonisch 'x'/leer; 'X' wird tolerant gelesen und beim
  // Serialisieren auf 'x' normalisiert.
  if (text === 'x' || text === 'X') return { value: true, error: null };
  return { value: null, error: 'invalidBoolean' };
}

// 4T-002797 (Epic 3E-000449), Zweitblick Runde 2 (Z5, Z6): Bearbeiten einer
// Zelle mit privatem Kommentar im Gitter. Roh ist sie in einer Spalte mit Typ
// eine Fehler-Zelle; die Anzeige zeigt ihren Wert ohne Kommentar und keinen
// Fehler. Geprüft wird deshalb der sichtbare Text, zurückgeschrieben der
// Rohtext samt Kommentar (`roh`, siehe serializeCell). Was ein Kommentar ist,
// entscheidet dieselbe Erkennung wie in der Anzeige.
//
// null: Der Text trägt keinen Kommentar, es gilt parseCellValue.
function zelleMitKommentar(type, text) {
  const roh = String(text == null ? '' : text).trim();
  const sichtbar = stripPercentComments(roh).trim();
  if (sichtbar === roh) return null;
  const { value, error } = parseCellValue(type, sichtbar);
  if (error) return { text: roh, value: null, error };
  return { text: roh, value, error: null, roh: true };
}

// Umschalten einer Wahrheitswert-Zelle mit privatem Kommentar: Der sichtbare
// Wert kippt, jeder Kommentar bleibt wörtlich in der Zelle stehen und folgt
// dem Haken. null: Die Zelle trägt keinen Kommentar, oder ihr sichtbarer Text
// ist kein Wahrheitswert; dann schaltet das Gitter nicht um.
function umgeschalteteZelleMitKommentar(text) {
  const roh = String(text == null ? '' : text).trim();
  const zelle = zelleMitKommentar('boolean', roh);
  if (!zelle || zelle.error) return null;
  const kommentare = findPercentCommentRanges(roh).map((b) => roh.slice(b.from, b.to));
  const next = zelle.value !== true;
  const neu = [next ? 'x' : '', ...kommentare].filter(Boolean).join(' ');
  return { text: neu, value: next, error: null, roh: true };
}

// Zelle aus der Eingabe des Gitters. Bei eingeschalteter Erweiterung trägt
// eine Zelle mit Kommentar in einer Spalte mit Typ ihren Rohtext (`roh`).
function eingegebeneZelle(type, text, ohneKommentare) {
  const mitKommentar = ohneKommentare && type !== 'text' ? zelleMitKommentar(type, text) : null;
  if (mitKommentar) return mitKommentar;
  const { value, error } = parseCellValue(type, text);
  return { text, value, error };
}

// Ob eine Eingabe die Zelle ändert: Eine Zelle mit Rohtext vergleicht den
// Text samt Kommentar, jede andere den Wert; eine Fehler-Zelle ändert sich immer.
function zelleGeaendert(before, zelle) {
  if (!before) return true;
  if (zelle.roh) return before.text !== zelle.text;
  return before.error != null || String(before.value ?? '') !== String(zelle.value ?? '');
}

// Umschalten einer Wahrheitswert-Zelle im Gitter; null, wenn sie nicht
// umschaltet. Eine Fehler-Zelle schaltet nur, wenn ihr Fehler allein aus einem
// privaten Kommentar kommt und die Erweiterung eingeschaltet ist; ohne die
// Erweiterung ist sie auch in der Anzeige ein Fehler.
function umgeschalteteWahrheitsZelle(cell, ohneKommentare) {
  if (cell && cell.error) return ohneKommentare ? umgeschalteteZelleMitKommentar(cell.text) : null;
  const next = !(cell && cell.value === true);
  return { text: next ? 'x' : '', value: next, error: null };
}

// --- Zeilen-Zerlegung ----------------------------------------------------------
//
// 4T-002013 (Epic 3E-000332): `splitTopLevel` und `splitPipeRow` stehen seither
// in perspective-datatable-cells.js. Verweis-Index, Umbenennungs-Nachzug und
// Schlagwort-Umbenennung brauchen dieselbe Zell-Zerlegung und dürfen den Kern
// nicht laden; mit dem Umzug gibt es sie genau einmal.

function escapePipes(text) {
  return String(text == null ? '' : text).replace(/\|/g, '\\|');
}

// --- Parser ---------------------------------------------------------------------
//
// 4T-001313 (Epic 3E-000235): Die Zeichen-Ebene der beiden Kopfzeilen (Lesen einer
// Spalten-Definition und eines Aggregat-Eintrags) liegt in
// perspective-datatable-kopf.js; hier steht ihre Verwendung im Durchlauf über
// den Fence-Body.

// Fence-Body -> Datenmodell (Struktur siehe Kopf-Kommentar). Wirft nie;
// alle Probleme landen strukturiert in errors bzw. als Fehler-Zellen.
//
// 4T-002797 (Epic 3E-000449): `opts.ohneKommentare` entfernt private
// Kommentare aus allem, was eine Ansicht oder Ausgabe der Tabelle zeigt. Eine
// Datenzeile wird zuerst in Zellen zerlegt und erst dann je Zelle befreit; ein
// Kommentar sieht damit nie über seine Zelle hinaus, und eine Zahl mit
// Kommentar dahinter bleibt eine Zahl. Eine Kopfzeile wird als Ganzes befreit,
// ein Kommentar dort reicht höchstens bis zu ihrem Ende. Ob eine Zeile eine
// Datenzeile ist, entscheidet der Rohtext. Ohne die Option bleibt alles roh:
// Der Gitter-Editor schreibt über dieses Modell zurück und braucht den Quelltext.
function parsePerspectiveDatatable(content, opts) {
  const ohne = opts && opts.ohneKommentare ? (s) => stripPercentComments(s).trim() : null;
  const lines = String(content || '').split(/\r?\n/);
  const errors = [];
  let columns = null;
  let columnsLine = 0;
  let aggregates = [];
  // 4T-001313: null = keine `types`-Zeile im Block; die Vorgabe ist die Anzeige.
  // Der Unterschied zwischen null und true trägt die Serialisierung: Nur eine
  // ausdrückliche Angabe wird zurückgeschrieben.
  let showTypes = null;
  // 4T-002072: Name aus der Kopf-Angabe `table`; `tableSeen` merkt die erste
  // Angabe auch dann, wenn ihr Wert ungültig ist.
  let name = null;
  let tableSeen = false;
  const pendingAggregateLines = [];
  const rows = [];
  let inRows = false;
  let dataColumns = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const roh = lines[i].trim();
    if (roh === '') continue;
    const trimmed = ohne && !roh.startsWith('|') ? ohne(roh) : roh;
    if (trimmed === '') continue;

    if (!inRows && !roh.startsWith('|')) {
      // Kopf-Direktive `name: wert`
      const m = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/.exec(trimmed);
      const directive = m ? m[1].toLowerCase() : null;
      if (directive === 'columns') {
        if (columns !== null) {
          errors.push({ code: 'duplicateDirective', line: lineNo, detail: 'columns' });
          continue;
        }
        columnsLine = lineNo;
        columns = [];
        for (const defText of splitTopLevel(m[2])) {
          const col = parseColumnDef(defText, lineNo, errors);
          if (!col) continue;
          if (columns.some((c) => c.name.toLowerCase() === col.name.toLowerCase())) {
            errors.push({ code: 'duplicateColumn', line: lineNo, detail: col.name });
            continue;
          }
          columns.push(col);
        }
        aggregates = columns.map(() => []);
        continue;
      }
      if (directive === 'aggregate') {
        // Aggregate erst nach der columns-Zeile auflösbar; Reihenfolge im
        // Body ist aber frei — Einträge werden gesammelt und am Ende geparst.
        pendingAggregateLines.push({ text: m[2], line: lineNo });
        continue;
      }
      // 4T-001313 (Epic 3E-000235): Anzeige der Typangabe im Spaltenkopf. Reine
      // Darstellung; auf die Typ-Prüfung der Zellen hat sie keine Wirkung.
      if (directive === 'types') {
        if (showTypes !== null) {
          errors.push({ code: 'duplicateDirective', line: lineNo, detail: 'types' });
          continue;
        }
        const wert = m[2].trim().toLowerCase();
        if (wert !== 'shown' && wert !== 'hidden') {
          errors.push({ code: 'unknownTypesValue', line: lineNo, detail: m[2].trim() });
          continue;
        }
        showTypes = wert === 'shown';
        continue;
      }
      // 4T-002072 (Epic 3E-000192): Name der Tabelle nach der Regel der
      // Block-Kennungen; die Heimat der Kennungen liest dieselbe Zeile.
      if (directive === 'table') {
        if (tableSeen) {
          errors.push({ code: 'duplicateDirective', line: lineNo, detail: 'table' });
          continue;
        }
        tableSeen = true;
        if (m[2] === '') {
          errors.push({ code: 'emptyTableName', line: lineNo, detail: '' });
        } else if (!isValidBlockAnchorId(m[2])) {
          errors.push({ code: 'invalidTableName', line: lineNo, detail: m[2] });
        } else {
          name = m[2];
        }
        continue;
      }
      errors.push({ code: 'invalidLine', line: lineNo, detail: trimmed });
      continue;
    }

    // Datenzeilen
    if (!inRows) {
      inRows = true;
      dataColumns = (columns || []).filter((c) => c.expr === null);
    }
    if (!roh.startsWith('|')) {
      errors.push({ code: 'invalidLine', line: lineNo, detail: trimmed });
      continue;
    }
    const cellTexts = ohne ? splitPipeRow(trimmed).map(ohne) : splitPipeRow(trimmed);
    if (cellTexts.length !== dataColumns.length) {
      errors.push({
        code: 'rowCellCount',
        line: lineNo,
        detail: `${cellTexts.length}/${dataColumns.length}`,
      });
    }
    const row = cellTexts.map((text, j) => {
      // Zellen jenseits der deklarierten Daten-Spalten bleiben als Text-
      // Zellen im Modell erhalten (kein Datenverlust; rowCellCount ist
      // bereits gemeldet und blockiert den Grid-Editor).
      const type = j < dataColumns.length ? dataColumns[j].type : 'text';
      const { value, error } = parseCellValue(type, text);
      return { text, value, error };
    });
    // Zu kurze Zeilen auf Daten-Spalten-Breite auffüllen, damit Rendering
    // und Aggregate eine rechteckige Struktur sehen.
    while (row.length < dataColumns.length) {
      const type = dataColumns[row.length].type;
      const { value, error } = parseCellValue(type, '');
      row.push({ text: '', value, error });
    }
    rows.push(row);
  }

  if (columns === null) {
    errors.unshift({ code: 'noColumns', line: 1, detail: '' });
    columns = [];
    aggregates = [];
  } else if (columns.length === 0) {
    errors.push({ code: 'noColumns', line: columnsLine, detail: '' });
  }
  // 4T-000421: Spalten-Formeln validieren (Syntax, Funktions-Katalog,
  // Verweis-Regel) — Verstöße sind Struktur-Fehler.
  validateComputedColumns(columns, columnsLine || 1, errors);
  for (const pending of pendingAggregateLines) {
    for (const entryText of splitTopLevel(pending.text)) {
      parseAggregateEntry(entryText, columns, aggregates, pending.line, errors);
    }
  }

  return { name, columns, aggregates, rows, errors, showTypes };
}

// --- Serialisierer ---------------------------------------------------------------

function serializeColumnDef(col) {
  const fmt = col.decimals != null ? `(${col.decimals})` : '';
  const expr = col.expr != null ? ` = ${col.expr}` : '';
  // 4T-001313 (Epic 3E-000235): Der Anzeigetext steht hinter der Kennung in
  // Anfuehrungszeichen; ein Anfuehrungszeichen im Text wird verdoppelt. Ohne
  // diese Ausgabe verloere ein Zellklick im Raster die Beschriftung, weil der
  // Serialisierer den ganzen Block neu schreibt.
  const label = col.label ? ` "${String(col.label).replace(/"/g, '""')}"` : '';
  return `${col.name}${label}:${col.type}${fmt}${expr}`;
}

// Zelle -> kanonischer Zelltext. Fehler-Zellen behalten ihren Rohtext
// (kein Datenverlust); gültige Werte werden kanonisch geschrieben.
function serializeCell(cell, type) {
  if (!cell) return '';
  // 4T-002797: Eine Zelle mit privatem Kommentar schreibt ihren Rohtext.
  if (cell.error || cell.roh) return escapePipes(cell.text);
  if (type === 'text') return escapePipes(cell.value == null ? '' : cell.value);
  if (cell.value == null) return '';
  if (type === 'boolean') return cell.value ? 'x' : '';
  return String(cell.value);
}

// Datenmodell -> kanonischer Fence-Body (stabile Spalten-Ausrichtung über
// Leerzeichen-Padding; parse -> serialize -> parse ist bei fehlerfreier
// Struktur modell-identisch). Grundlage des Grid-Editor-Rückschreibens.
function serializePerspectiveDatatable(model) {
  const columns = model.columns || [];
  const aggregates = model.aggregates || [];
  const rows = model.rows || [];
  const lines = [];
  // 4T-002072: Der Name steht als erste Zeile, der Schlüssel klein wie bei den
  // übrigen Kopf-Angaben; ohne Namen entsteht keine Zeile.
  if (model.name) lines.push('table: ' + model.name);
  lines.push('columns: ' + columns.map(serializeColumnDef).join(', '));
  const aggParts = [];
  columns.forEach((col, i) => {
    const funcs = aggregates[i] || [];
    if (funcs.length > 0) aggParts.push(`${col.name}:${funcs.join('+')}`);
  });
  if (aggParts.length > 0) lines.push('aggregate: ' + aggParts.join(', '));
  // 4T-001313 (Epic 3E-000235): Nur eine ausdrückliche Angabe wird
  // zurückgeschrieben; ohne diese Unterscheidung bekäme jede Tabelle beim
  // ersten Zellklick eine Zeile, die der Anwender nie geschrieben hat.
  if (model.showTypes === false) lines.push('types: hidden');
  else if (model.showTypes === true) lines.push('types: shown');

  const dataColumns = columns.filter((c) => c.expr === null);
  // Zelltexte vorab serialisieren, dann spaltenweise auf die Maximal-
  // Breite auffüllen (stabile Ausrichtung; Zellen jenseits der Daten-
  // Spalten werden als Text mitgeschrieben — Verlustfreiheit vor Form).
  const rowTexts = rows.map((row) =>
    row.map((cell, j) =>
      serializeCell(cell, j < dataColumns.length ? dataColumns[j].type : 'text'),
    ),
  );
  const colCount = rowTexts.reduce((max, r) => Math.max(max, r.length), dataColumns.length);
  const widths = [];
  for (let j = 0; j < colCount; j++) {
    let w = 1;
    for (const r of rowTexts) {
      if (r[j] != null && r[j].length > w) w = r[j].length;
    }
    widths.push(w);
  }
  for (const r of rowTexts) {
    const padded = [];
    for (let j = 0; j < r.length; j++) padded.push(r[j].padEnd(widths[j]));
    lines.push(`| ${padded.join(' | ')} |`);
  }
  return lines.join('\n');
}

// --- Aggregat-Rechnung (4T-000418) --------------------------------------------------

// Leer-Definition pro Typ (count zählt nicht-leere Zellen): text '' und
// boolean false sind die kanonischen Leer-Werte, sonst null.
function isEmptyValue(type, value) {
  if (value == null) return true;
  if (type === 'text') return value === '';
  if (type === 'boolean') return value === false;
  return false;
}

// Aggregate über die (ggf. gefilterten) Zeilen. rows default = alle Zeilen
// des Modells; getValue erlaubt 4T-000421, berechnete Spalten-Werte zu
// liefern (Default: berechnete Spalten -> null, Fehler-Zellen -> null).
// Rückgabe parallel zu columns: je Spalte [{ func, value }] in der
// deklarierten Reihenfolge; value null, wenn keine gültige Zelle einfließt.
function computeAggregates(model, rows, getValue) {
  const columns = model.columns || [];
  const aggregates = model.aggregates || [];
  const dataIdx = dataIndexByColumn(columns);
  const rowList = rows || model.rows || [];
  const valueOf =
    getValue ||
    ((row, colIdx) => {
      const di = dataIdx[colIdx];
      if (di == null) return null;
      const cell = row[di];
      if (!cell || cell.error) return null;
      return cell.value;
    });
  return columns.map((col, colIdx) => {
    const funcs = aggregates[colIdx] || [];
    if (funcs.length === 0) return [];
    const values = [];
    let nonEmpty = 0;
    for (const row of rowList) {
      const v = valueOf(row, colIdx);
      if (!isEmptyValue(col.type, v)) nonEmpty++;
      if (v != null && !(col.type === 'text' && v === '')) values.push(v);
    }
    return funcs.map((func) => {
      if (func === 'count') return { func, value: nonEmpty };
      if (col.type === 'number') {
        const nums = values.filter((v) => typeof v === 'number');
        if (nums.length === 0) return { func, value: null };
        if (func === 'min') return { func, value: Math.min(...nums) };
        if (func === 'max') return { func, value: Math.max(...nums) };
        const sum = normalizeFloat(nums.reduce((a, b) => a + b, 0));
        if (func === 'sum') return { func, value: sum };
        // avg rundet auf das Spalten-Format (Dezimalstellen), sonst
        // Float-normalisiert.
        const avg = sum / nums.length;
        return {
          func,
          value: col.decimals != null ? parseFloat(avg.toFixed(col.decimals)) : normalizeFloat(avg),
        };
      }
      // min/max auf date/time: ISO- bzw. HH:MM-Strings sind lexikographisch
      // chronologisch geordnet.
      const strs = values.filter((v) => typeof v === 'string' && v !== '');
      if (strs.length === 0) return { func, value: null };
      if (func === 'min') return { func, value: strs.reduce((a, b) => (b < a ? b : a)) };
      if (func === 'max') return { func, value: strs.reduce((a, b) => (b > a ? b : a)) };
      return { func, value: null };
    });
  });
}

// --- Render-Einstiege (4T-000418) -----------------------------------------------------

// Berechnete Zellen und Aggregate einmal pro Render auswerten; die
// HTML-Bauer bekommen beides gereicht (Arbeitsteilung 4T-000986).
function computeRenderData(model) {
  const computed = computeComputedCells(model);
  const aggs = computeAggregates(model, model.rows, makeCellValueResolver(model, computed));
  return { computed, aggs };
}

// Innen-HTML des Platzhalter-Containers (der Container selbst mit den
// data-dt-Attributen entsteht im Fence-Override von markdown.js).
// 4T-002014 (Epic 3E-000332): `opts.zellHtml` ist der enge Zell-Renderer der
// Pipeline für die Text-Zellen; beide Einstiege reichen `opts` unverändert an
// den HTML-Bauer weiter. Ohne ihn bleibt die Anzeige maskierter Reintext.
function renderPerspectiveDatatableViewer(content, opts) {
  const model = parsePerspectiveDatatable(content, opts);
  const out = [];
  if (model.errors.length > 0) out.push(buildErrorsHtml(model.errors));
  if (model.columns.length > 0) {
    const { computed, aggs } = computeRenderData(model);
    out.push(buildDatatableTableHtml(model, computed, aggs, opts));
  }
  return out.join('');
}

// Statische Tabelle für den Portable-Export. Bei Struktur-Fehlern null —
// der Fence bleibt dann unverändert im Export (Muster perspective-table).
//
// 4T-002072: Trägt die Tabelle einen Namen, folgt ihr die Zeile `^Name`, damit
// Verweise im exportierten Dokument ihr Ziel behalten. Die Leerzeile davor ist
// eine Festlegung: Nach CommonMark endet ein HTML-Block erst an einer
// Leerzeile; ohne sie gehörte die Zeile zum Block und bliebe Text darin. Ein
// Zeilenende dahinter setzt der Konverter nicht: Die Fence-Ersetzung des
// Exports lässt seit 4T-002102 das Zeilenende und eine Leerzeile nach dem Zaun
// stehen und sichert vor direkt folgendem Text selbst eine Leerzeile
// (portable-fences.js). Bis dahin nahm sie die Leerzeile mit in ihren Treffer,
// und ein eigenes Zeilenende glich das aus.
//
// 4T-002072, Nachbesserung F5: `opts.ankerZeileFolgt` sagt, dass unter dem
// Zaun schon eine Zeile `^Name` desselben Namens steht (die Heimat zählt sie
// als dieselbe Kennung). Dann kommt keine zweite dazu; die Leerzeile, die sie
// vom HTML-Block trennt, sichert die Fence-Ersetzung. Der Aufrufer weiß es,
// weil nur er den Text um den Zaun sieht.
function convertPerspectiveDatatableBlockToHtml(content, opts) {
  const model = parsePerspectiveDatatable(content, opts);
  if (model.errors.length > 0 || model.columns.length === 0) return null;
  const { computed, aggs } = computeRenderData(model);
  const html = buildPortableDatatableHtml(model, computed, aggs, opts);
  if (!model.name) return html;
  return opts && opts.ankerZeileFolgt ? html : html + '\n\n^' + model.name;
}

// 4T-002797 (Epic 3E-000449): der Rumpf einer Tabelle, die der portable Export
// wegen eines Struktur-Fehlers als Quelltext stehen lässt, ohne private
// Kommentare. Dieselbe Grenze wie im Zerleger: Eine Datenzeile wird je Zelle
// befreit und mit maskierten Pipes neu gesetzt, jede andere Zeile als Ganzes.
// Eine Zeile ohne Kommentar bleibt Zeichen für Zeichen, wie sie war.
function befreieDatentabellenRumpf(content) {
  return String(content || '')
    .split('\n')
    .map((zeile) => {
      const einzug = zeile.slice(0, zeile.length - zeile.trimStart().length);
      const kern = zeile.trim();
      // Befreit wird allein der Inhalt hinter dem Einzug: Die Code-Erkennung
      // läse eine Zeile ab vier Leerzeichen Einzug als Code und ließe den
      // Kommentar stehen, den die Anzeige verbirgt.
      if (!kern.startsWith('|')) return einzug + stripPercentComments(zeile.slice(einzug.length));
      const roh = splitPipeRow(kern);
      const frei = roh.map((z) => stripPercentComments(z).trim());
      if (frei.every((z, i) => z === roh[i])) return zeile;
      const ende = zeile.endsWith('\r') ? '\r' : '';
      return `${einzug}| ${frei.map(escapePipes).join(' | ')} |${ende}`;
    })
    .join('\n');
}

module.exports = {
  befreieDatentabellenRumpf,
  parsePerspectiveDatatable,
  serializePerspectiveDatatable,
  parseCellValue,
  zelleMitKommentar,
  eingegebeneZelle,
  umgeschalteteWahrheitsZelle,
  zelleGeaendert,
  computeAggregates,
  renderPerspectiveDatatableViewer,
  convertPerspectiveDatatableBlockToHtml,
};
