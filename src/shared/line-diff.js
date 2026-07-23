// 4T-0331 (Epic 3E-0060): Zeilenbasierter Diff fuer das Aenderungsprotokoll
// der Dokument-Historie (.mdd). Eigenimplementierung ohne Dependency
// (Dependency-Politik der Entwicklungsrichtlinien): gemeinsamer Praefix/
// Suffix wird abgeschnitten, der veraenderliche Mittelteil ueber eine
// LCS-Matrix (laengste gemeinsame Teilfolge) verglichen. Electron-frei und
// rein, damit unit-testbar und im Renderer (Vergleichs-Ansicht) nutzbar.
//
// Delta-Format: Liste von Operationen { at, del, ins } in aufsteigender
// Position. `at` ist der Zeilen-Index im Basistext, an dem die Operation
// beginnt; `del` sind die dort entfernten Zeilen, `ins` die eingefuegten.
// Texte werden als LF-Zeilenlisten behandelt (Split/Join ueber '\n');
// die LF-Normalisierung uebernimmt der Save-Pfad in main.js.
'use strict';

// Obergrenze fuer die LCS-Matrix (Zellen = Zeilen links x Zeilen rechts im
// Mittelteil). Oberhalb wird der ganze Mittelteil als eine Ersetzungs-
// Operation behandelt: korrekt rekonstruierbar, nur groeber aufgeloest.
// Schuetzt vor O(n*m)-Speicher bei extrem grossen Dokumenten.
const MAX_LCS_CELLS = 4_000_000;

function splitLines(text) {
  return String(text ?? '').split('\n');
}

function joinLines(lines) {
  return lines.join('\n');
}

// LCS-Rueckverfolgung ueber den Mittelteil: liefert Operationen mit
// Positionen relativ zum Mittelteil-Anfang.
function lcsOps(a, b) {
  const n = a.length;
  const m = b.length;
  // DP-Tabelle als flaches Uint32Array, Zeile fuer Zeile.
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  let current = null; // offene Operation waehrend eines Nicht-Match-Laufs
  const openAt = (at) => current || (current = { at, del: [], ins: [] });
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      if (current) {
        ops.push(current);
        current = null;
      }
      i++;
      j++;
    } else if (j < m && (i >= n || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
      openAt(i).ins.push(b[j]);
      j++;
    } else {
      openAt(i).del.push(a[i]);
      i++;
    }
  }
  if (current) ops.push(current);
  return ops;
}

// Diff zweier Texte auf Zeilenbasis. Liefert [] bei Gleichheit.
function diffLines(baseText, newText) {
  const a = splitLines(baseText);
  const b = splitLines(newText);
  // Gemeinsamen Praefix und Suffix abschneiden (haeufigster Fall: kleine
  // lokale Aenderung in grossem Dokument).
  let prefix = 0;
  const maxPrefix = Math.min(a.length, b.length);
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  const maxSuffix = Math.min(a.length, b.length) - prefix;
  while (suffix < maxSuffix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const aMid = a.slice(prefix, a.length - suffix);
  const bMid = b.slice(prefix, b.length - suffix);
  if (aMid.length === 0 && bMid.length === 0) return [];
  let ops;
  if (aMid.length * bMid.length > MAX_LCS_CELLS) {
    ops = [{ at: 0, del: aMid, ins: bMid }];
  } else {
    ops = lcsOps(aMid, bMid);
  }
  for (const op of ops) op.at += prefix;
  return ops;
}

// Wendet ein Delta auf den Basistext an. Prueft dabei, dass die zu
// entfernenden Zeilen tatsaechlich so im Basistext stehen — eine
// Abweichung heisst: das Delta gehoert nicht zu diesem Text (defekte
// oder fremde Historie), dann Fehler statt stiller Korruption.
function applyOps(baseText, ops) {
  const lines = splitLines(baseText);
  let offset = 0;
  for (const op of ops) {
    const at = op.at + offset;
    const del = Array.isArray(op.del) ? op.del : [];
    const ins = Array.isArray(op.ins) ? op.ins : [];
    if (at < 0 || at + del.length > lines.length) {
      throw new Error('line-diff: Delta-Position liegt ausserhalb des Basistexts');
    }
    for (let k = 0; k < del.length; k++) {
      if (lines[at + k] !== del[k]) {
        throw new Error('line-diff: Delta passt nicht zum Basistext');
      }
    }
    lines.splice(at, del.length, ...ins);
    offset += ins.length - del.length;
  }
  return joinLines(lines);
}

// Umfangs-Angabe eines Deltas (fuer Revisionsliste: +x/-y Zeilen).
function countChanges(ops) {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    added += Array.isArray(op.ins) ? op.ins.length : 0;
    removed += Array.isArray(op.del) ? op.del.length : 0;
  }
  return { added, removed };
}

// 4T-0333 (Epic 3E-0060): Zeilen der Vergleichs-Ansicht. Aus Basistext und
// Delta entsteht eine Hunk-Darstellung: geaenderte Stellen mit `context`
// unveraenderten Zeilen davor/danach, ausgelassene Bereiche als 'gap'.
// Typen: 'ctx' (unveraendert), 'del' (entfernt), 'ins' (eingefuegt), 'gap'.
function buildDiffRows(baseText, ops, context = 2) {
  const lines = splitLines(baseText);
  const rows = [];
  let cursor = 0;
  ops.forEach((op, idx) => {
    const ctxStart = Math.max(op.at - context, cursor);
    if (ctxStart > cursor) rows.push({ type: 'gap' });
    for (let i = ctxStart; i < op.at; i++) rows.push({ type: 'ctx', text: lines[i] });
    for (const d of Array.isArray(op.del) ? op.del : []) rows.push({ type: 'del', text: d });
    for (const s of Array.isArray(op.ins) ? op.ins : []) rows.push({ type: 'ins', text: s });
    cursor = op.at + (Array.isArray(op.del) ? op.del.length : 0);
    // Nachlauf-Kontext nicht in den Vorlauf der naechsten Operation laufen
    // lassen (deren Zeilen erscheinen sonst doppelt: als ctx und als del).
    const nextAt = idx + 1 < ops.length ? ops[idx + 1].at : lines.length;
    const ctxEnd = Math.min(cursor + context, nextAt, lines.length);
    for (let i = cursor; i < ctxEnd; i++) rows.push({ type: 'ctx', text: lines[i] });
    cursor = ctxEnd;
  });
  if (cursor < lines.length) rows.push({ type: 'gap' });
  return rows;
}

module.exports = { diffLines, applyOps, countChanges, splitLines, buildDiffRows };
