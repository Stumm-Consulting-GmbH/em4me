// 4T-0542 (Epic 3E-0097): Kalender-Kern — Definitions-Modell und Rechen-Achse
// benutzerdefinierter Kalender-Systeme (Fantasie-Kalender, reale Nicht-West-
// Kalender). Prozess-neutral (kein DOM, kein Electron; Muster journal-core.js):
// Main (Bereichs-Ablage) und Renderer (Einstellungen, Picker, Wert-Syntax)
// laden dasselbe Modul. Alle anderen Kalender-Tasks konsumieren nur diese API.
//
// Sektions-Schema (Sektion `calendarSystems` der Area_Settings.mdda):
//   calendarSystems: {
//     blocks: [{
//       id            stabile Kennung (eindeutig; Persistenz-Schlüssel)
//       name          Anzeige-Name (Default: id)
//       calendars: [{
//         id          stabile Kennung (eindeutig im Block)
//         name        Anzeige-Name (Default: id); Bezugsname der Wert-Syntax
//         levels      Rechen-Wirbelsäule, KLEINSTE Ebene zuerst; pro Ebene:
//                       id, name, section (benannter Ebenen-Bereich, z.B.
//                       „Zeit"/„Datum"), start (Anzeige-Nummer der ersten
//                       Position, Default 1), names (optionale Namens-Liste
//                       der Positionen, z.B. Monatsnamen) und rel (Beziehung
//                       zur nächst-kleineren Ebene; entfällt bei Ebene 0):
//                         { type: 'factor',  count }            fester Faktor
//                         { type: 'lengths', table: [n, …] }    Längen-Tabelle
//                         { type: 'leap',    count, rules: [{ cycle }, …],
//                           targetIndex, extra }                Schalt-Regel
//                       Schalt-Regeln sind geschachtelte Zyklen mit
//                       „letzter Treffer entscheidet"-Semantik (alle 4,
//                       außer alle 100, außer alle 400: gerader Regel-Index
//                       = Schalt-Instanz); targetIndex benennt die verlängerte
//                       Einheit (Kind-Position), extra die Verlängerung in
//                       Einheiten der Enkel-Ebene.
//         cycles      eigenständige Zyklen (Woche): { id, name, of (Ebenen-id
//                       der Basis), length, names, anchor: { tuple (Datums-
//                       Segmente), position }, numbering: { ruleIndex } | null }.
//                       Nummerierung generisch nach der Donnerstags-Regel: der
//                       Zyklus gehört zu dem „Jahr", in dem sein ruleIndex-ter
//                       Tag liegt; Zählung ab 1 je Jahr.
//         groups      abgeleitete Gruppierungen (Quartal): { id, name, of
//                       (Ebenen-id), size, names } — rein rechnerisch.
//         epochs      geordnet alt → neu: { name, abbr, start }. Erste Epoche
//                       start = null (offen in die Vergangenheit, rückwärts
//                       zählend), alle weiteren mit Datums-Segmenten (ohne
//                       Zeit-Anteil, oberstes Segment in interner Jahres-
//                       Zählung); letzte Epoche offen in die Zukunft. Grenzen
//                       nahtlos per Konstruktion (Ende = Start der nächsten);
//                       Jahres-Zählung je Epoche ab 1, kein Jahr 0.
//         blockAnchor Kalender-Zeitpunkt (volles Tupel), der auf Block-Achse 0
//                       liegt (Default: Jahr 0, alle Segmente minimal)
//         blockScale  { num, den } — Dauer der kleinsten Einheit in Block-
//                       Achsen-Einheiten (Default 1/1); affine Abbildung
//                       Kalender-Achse → Block-Achse (Anker plus Skala)
//       }, …]
//     }, …]
//   }
//
// Struktur-Regeln der Wirbelsäule (Verletzung = Kalender defekt und entfällt):
// höchstens EINE Längen-Tabellen-Ebene und höchstens EINE Schalt-Ebene; die
// Schalt-Ebene braucht Kind und Enkel (Index ≥ 2) und sitzt, wenn eine
// Längen-Ebene existiert, direkt über ihr; der count der Ebene über einer
// Längen-Ebene ist ein Vielfaches der Tabellen-Länge; alle übrigen Ebenen
// sind Faktor-Ebenen. Der Ebenen-Bereich der kleinsten Ebene bildet als
// zusammenhängender Präfix den Zeit-Teil (Doppelpunkt-Syntax), sofern mehr
// als ein Bereich existiert; Epochen-Grenzen liegen auf dem Datums-Teil.
//
// Tupel-Konvention: Array in Anzeige-Reihenfolge (GRÖSSTE Ebene zuerst),
// Segment-Werte in Anzeige-Nummerierung der Ebene (start-basiert); das
// oberste Segment ist die interne fortlaufende Jahres-Zahl (ganze Zahl,
// Jahr 0 intern erlaubt) — die Epochen-Abbildung (Anzeige-Jahr ab 1) liegt
// ausschließlich in epochOf/formatTuple/parseCanonical.
//
// Achsen-Arithmetik in BigInt (Task-Entscheidung nach Messung): Number ist
// nur bis 2^53 exakt; bei Sekunden-Basis sind das ≈ 285 Mio. Jahre, und die
// Umrechnungs-Zwischenprodukte (Achse × Skalen-Zähler) kippen schon bei
// wenigen Tausend Jahren. BigInt rechnet exakt, Achsen-Werte werden nie
// persistiert (gespeichert werden Tupel/Strings), Performance im Picker-/
// Badge-Maßstab unkritisch. Tupel-Segmente bleiben Numbers; das oberste
// Segment ist auf ±2^53 begrenzt (axisToTuple liefert sonst null).
// Umrechnung zwischen Parallel-Kalendern immer über die Block-Achse mit
// EINER deterministischen Floor-Rundung (zur kleineren Achsen-Position, auch
// im Negativen) auf die kleinste Ziel-Ebene.
//
// Normalisierung ist tolerant nach dem Fehler-Isolations-Muster der
// Bereichsdatei (Vorbild normalizeJournalsConfig): defekte Blöcke/Kalender/
// Zyklen/Gruppen/Epochen entfallen einzeln, der Rest bleibt nutzbar; eine
// defekte oder fehlende Sektion wirkt wie nicht konfiguriert (null).
// Die Arithmetik-Funktionen erwarten normalisierte Kalender-Objekte.
//
// Fehler-Codes: validateTuple → segmentCount | segmentType | segmentRange |
// epochUnknown | epochMismatch | calendar; parseCanonical zusätzlich
// malformed | yearZero; convertInBlock zusätzlich unknownCalendar | outOfRange.
'use strict';

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// Kompilierte Rechen-Daten je normalisiertem Kalender-Objekt (BigInt-Tabellen,
// Epochen-Achsen, Zyklus-Anker); WeakMap, damit verworfene Konfigurationen
// nicht gehalten werden.
const COMPILED = new WeakMap();

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isInt(v) {
  return Number.isSafeInteger(v);
}

function isPosInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

// --- BigInt-Grundrechnung (alle Teiler sind positiv) -------------------------------

function floorDiv(a, b) {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

function floorMod(a, b) {
  return a - floorDiv(a, b) * b;
}

function toSafeNumber(v) {
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

// --- Normalisierung ----------------------------------------------------------------

// Schalt-Zyklen: nicht-leere Liste, streng aufsteigend, jeder Zyklus ein
// Vielfaches des vorigen (nur so ist die „letzter Treffer entscheidet"-
// Semantik eindeutig und die Jahres-Summe geschlossen berechenbar).
function normalizeRules(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rules = [];
  for (const entry of raw) {
    const cycle =
      typeof entry === 'number' ? entry : entry && typeof entry === 'object' ? entry.cycle : null;
    if (!isPosInt(cycle)) return null;
    rules.push({ cycle });
  }
  for (let i = 1; i < rules.length; i++) {
    if (rules[i].cycle <= rules[i - 1].cycle || rules[i].cycle % rules[i - 1].cycle !== 0) {
      return null;
    }
  }
  return rules;
}

function normalizeRel(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'factor') {
    return isPosInt(raw.count) ? { type: 'factor', count: raw.count } : null;
  }
  if (raw.type === 'lengths') {
    if (!Array.isArray(raw.table) || raw.table.length === 0) return null;
    if (!raw.table.every((n) => isPosInt(n))) return null;
    return { type: 'lengths', table: raw.table.slice() };
  }
  if (raw.type === 'leap') {
    const rules = normalizeRules(raw.rules);
    if (!rules || !isPosInt(raw.count) || !isPosInt(raw.extra)) return null;
    if (!isInt(raw.targetIndex) || raw.targetIndex < 0 || raw.targetIndex >= raw.count) {
      return null;
    }
    return {
      type: 'leap',
      count: raw.count,
      rules,
      targetIndex: raw.targetIndex,
      extra: raw.extra,
    };
  }
  return null;
}

// Namens-Listen sind weich: nur vollständig nicht-leere String-Listen werden
// übernommen, sonst null (Lookup liefert dann null statt Namen).
function normalizeNames(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const names = raw.map((n) => cleanString(n));
  return names.every((n) => n !== '') ? names : null;
}

// Wirbelsäule normalisieren; null = Kalender strukturell defekt.
function normalizeLevels(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const levels = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i++) {
    const value = raw[i];
    if (!value || typeof value !== 'object') return null;
    const id = cleanString(value.id);
    if (id === '' || seen.has(id)) return null;
    seen.add(id);
    const rel = i === 0 ? null : normalizeRel(value.rel);
    if (i > 0 && !rel) return null;
    levels.push({
      id,
      name: cleanString(value.name) || id,
      section: cleanString(value.section),
      start: isInt(value.start) ? value.start : 1,
      names: normalizeNames(value.names),
      rel,
    });
  }
  const top = levels.length - 1;
  let iLen = -1;
  let iLeap = -1;
  for (let i = 1; i <= top; i++) {
    const t = levels[i].rel.type;
    if (t === 'lengths') {
      if (iLen >= 0) return null;
      iLen = i;
    } else if (t === 'leap') {
      if (iLeap >= 0) return null;
      iLeap = i;
    }
  }
  if (iLeap >= 0) {
    if (iLeap < 2) return null;
    if (iLen >= 0 && iLeap !== iLen + 1) return null;
  }
  if (iLen >= 0 && iLeap >= 0 && iLen > iLeap) return null;
  if (iLen >= 0 && iLen < top) {
    // Der count der Ebene direkt über der Längen-Ebene muss die Tabelle in
    // ganzen Zyklen fassen (sonst wären Jahres-Längen positions-abhängig).
    if (levels[iLen + 1].rel.count % levels[iLen].rel.table.length !== 0) return null;
  }
  // Ebenen-Bereich der kleinsten Ebene: zusammenhängender Präfix, keine
  // Wiederaufnahme weiter oben (sonst wäre der Zeit-Teil mehrdeutig).
  const sec0 = levels[0].section;
  let prefixLen = 0;
  while (prefixLen < levels.length && levels[prefixLen].section === sec0) prefixLen++;
  for (let i = prefixLen; i < levels.length; i++) {
    if (levels[i].section === sec0) return null;
  }
  return levels;
}

// --- Kompilat (Rechen-Tabellen je Kalender) ----------------------------------------

function compileSafe(cal) {
  if (!cal || !Array.isArray(cal.levels) || cal.levels.length === 0) return null;
  let c = COMPILED.get(cal);
  if (c) return c;
  const levels = cal.levels;
  const top = levels.length - 1;
  let iLen = -1;
  let iLeap = -1;
  for (let i = 1; i <= top; i++) {
    if (levels[i].rel.type === 'lengths') iLen = i;
    else if (levels[i].rel.type === 'leap') iLeap = i;
  }
  const iIrrFirst = iLen >= 0 ? iLen : iLeap >= 0 ? iLeap : levels.length;
  // Konstante Einheiten-Längen (Basis-Einheiten je Instanz) unterhalb der
  // ersten unregelmäßigen Ebene.
  const unitLen = new Array(levels.length).fill(null);
  unitLen[0] = 1n;
  for (let i = 1; i < iIrrFirst; i++) unitLen[i] = unitLen[i - 1] * BigInt(levels[i].rel.count);
  // Zeit-Teil: Präfix mit dem Ebenen-Bereich der kleinsten Ebene, sofern es
  // mehr als einen Bereich gibt (sonst ist alles Datums-Teil).
  const sec0 = levels[0].section;
  let prefixLen = 0;
  while (prefixLen < levels.length && levels[prefixLen].section === sec0) prefixLen++;
  const timeCount = prefixLen < levels.length ? prefixLen : 0;
  const dateCount = levels.length - timeCount;
  c = { levels, top, iLen, iLeap, iIrrFirst, unitLen, timeCount, dateCount };
  // „Jahres-Ebene" für Zyklus-Nummerierung: die Ebene, die die Unregelmäßig-
  // keit trägt (Schalt-Ebene, sonst Eltern der Längen-Ebene, sonst oberste).
  c.iYear = iLeap >= 0 ? iLeap : iLen >= 0 && iLen < top ? iLen + 1 : top;
  if (iLen >= 0) {
    const table = levels[iLen].rel.table;
    const prefixCounts = [0n];
    for (const n of table) prefixCounts.push(prefixCounts[prefixCounts.length - 1] + BigInt(n));
    c.lengthsInfo = {
      table,
      len: table.length,
      childUnit: unitLen[iLen - 1],
      prefixCounts,
      cycleUnits: prefixCounts[table.length] * unitLen[iLen - 1],
    };
  }
  if (iLeap >= 0) {
    const rel = levels[iLeap].rel;
    const cycles = rel.rules.map((r) => BigInt(r.cycle));
    let yearBase;
    if (iLen >= 0) {
      const L = c.lengthsInfo;
      yearBase = BigInt(rel.count / L.len) * L.prefixCounts[L.len] * L.childUnit;
    } else {
      yearBase = BigInt(rel.count) * unitLen[iLeap - 1];
    }
    const extraLen = BigInt(rel.extra) * unitLen[iLeap - 2];
    const period = cycles[cycles.length - 1];
    const info = {
      count: rel.count,
      cycles,
      targetIndex: rel.targetIndex,
      extra: rel.extra,
      yearBase,
      extraLen,
      period,
    };
    info.periodLen = period * yearBase + leapsBeforeWith(cycles, period) * extraLen;
    c.leapInfo = info;
  }
  // Stellen-Breiten der kanonischen Form: Ziffern des größten Anzeige-Werts
  // je Ebene (oberste Ebene bleibt ungepolstert).
  const widths = new Array(levels.length).fill(0);
  for (let i = 0; i < top; i++) {
    const parentRel = levels[i + 1].rel;
    let n = parentRel.type === 'lengths' ? Math.max(...parentRel.table) : parentRel.count;
    if (i + 2 <= top && levels[i + 2].rel.type === 'leap') n += levels[i + 2].rel.extra;
    widths[i] = String(Math.abs(levels[i].start + n - 1)).length;
  }
  c.widths = widths;
  COMPILED.set(cal, c);
  return c;
}

// --- Schalt-Rechnung ----------------------------------------------------------------

// Schalt-Instanz? Letzter treffender Zyklus entscheidet; gerader Regel-Index
// = verlängert (alle 4 [ja], außer alle 100 [nein], außer alle 400 [ja]).
function isLeapY(c, Y) {
  const cycles = c.leapInfo.cycles;
  for (let i = cycles.length - 1; i >= 0; i--) {
    if (floorMod(Y, cycles[i]) === 0n) return i % 2 === 0;
  }
  return false;
}

// Anzahl Schalt-Instanzen in [0, Y) (für negatives Y vorzeichenbehaftet über
// [Y, 0)): Einschluss-Ausschluss über die geschachtelten Zyklen; die Anzahl
// der Vielfachen von cycle in [0, Y) ist floorDiv(Y + cycle - 1, cycle).
function leapsBeforeWith(cycles, Y) {
  let sum = 0n;
  for (let i = 0; i < cycles.length; i++) {
    const term = floorDiv(Y + cycles[i] - 1n, cycles[i]);
    sum += i % 2 === 0 ? term : -term;
  }
  return sum;
}

function yearStartAxis(c, Y) {
  const li = c.leapInfo;
  return Y * li.yearBase + leapsBeforeWith(li.cycles, Y) * li.extraLen;
}

// Start-Offset der Kind-Instanz pos innerhalb einer Schalt-Ebenen-Instanz
// (Basis-Einheiten); die Schalt-Verlängerung wirkt ab der Ziel-Position.
function childStartAxis(c, pos, leapYear) {
  const li = c.leapInfo;
  let u;
  if (c.iLen >= 0) {
    const L = c.lengthsInfo;
    const q = Math.floor(pos / L.len);
    const r = pos % L.len;
    u = (BigInt(q) * L.prefixCounts[L.len] + L.prefixCounts[r]) * L.childUnit;
  } else {
    u = BigInt(pos) * c.unitLen[c.iLeap - 1];
  }
  if (leapYear && pos > li.targetIndex) u += li.extraLen;
  return u;
}

// Jahres-Index zu einem Achsen-Wert: Schätzung über die exakte Perioden-Länge
// des Schalt-Zyklus, dann Klammer-Aufweitung und Binärsuche (yearStartAxis
// ist streng monoton; robust auch für extreme Schalt-Verlängerungen).
function findYear(c, axis) {
  const li = c.leapInfo;
  let lo = floorDiv(axis * li.period, li.periodLen);
  let step = 1n;
  while (yearStartAxis(c, lo) > axis) {
    lo -= step;
    step *= 2n;
  }
  let hi = lo;
  step = 1n;
  while (yearStartAxis(c, hi + 1n) <= axis) {
    hi += step;
    step *= 2n;
  }
  while (lo < hi) {
    const mid = floorDiv(lo + hi + 1n, 2n);
    if (yearStartAxis(c, mid) <= axis) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

// --- Positions-Rechnung -------------------------------------------------------------

function posOf(c, levelIdx, tuple) {
  return tuple[c.top - levelIdx] - c.levels[levelIdx].start;
}

// Absoluter Instanz-Index der Ebene levelIdx seit dem Kalender-Nullpunkt;
// nur gültig, wenn alle Ebenen darüber count-basiert sind (Faktor/Schalt) —
// die Aufrufer steigen höchstens bis zur Längen-/Schalt-Ebene ab.
function absAt(c, levelIdx, tuple) {
  let v = BigInt(tuple[0]);
  for (let li = c.top - 1; li >= levelIdx; li--) {
    v = v * BigInt(c.levels[li + 1].rel.count) + BigInt(posOf(c, li, tuple));
  }
  return v;
}

// Anzahl der Positionen der Ebene levelIdx innerhalb ihrer Eltern-Instanz im
// Kontext des Tupels (Längen-Tabelle plus Schalt-Verlängerung); defensiv
// gegen unplausible höhere Segmente (Modulo-Klammerung).
function positionCount(c, levelIdx, tuple) {
  const parent = c.levels[levelIdx + 1];
  let n;
  if (parent.rel.type === 'lengths') {
    const L = c.lengthsInfo;
    let idx;
    if (levelIdx + 1 === c.top) {
      idx = Number(floorMod(BigInt(tuple[0]), BigInt(L.len)));
    } else {
      idx = ((posOf(c, levelIdx + 1, tuple) % L.len) + L.len) % L.len;
    }
    n = L.table[idx];
  } else {
    n = parent.rel.count;
  }
  if (levelIdx + 2 <= c.top && c.levels[levelIdx + 2].rel.type === 'leap') {
    const li = c.leapInfo;
    if (posOf(c, levelIdx + 1, tuple) === li.targetIndex && isLeapY(c, absAt(c, c.iLeap, tuple))) {
      n += li.extra;
    }
  }
  return n;
}

// --- Achsen-Arithmetik ---------------------------------------------------------------

function tupleToAxisUnchecked(c, tuple) {
  if (c.iLeap >= 0) {
    const Y = absAt(c, c.iLeap, tuple);
    const leapYear = isLeapY(c, Y);
    let axis = yearStartAxis(c, Y);
    const childIdx = c.iLeap - 1;
    axis += childStartAxis(c, posOf(c, childIdx, tuple), leapYear);
    for (let i = childIdx - 1; i >= 0; i--) {
      axis += BigInt(posOf(c, i, tuple)) * c.unitLen[i];
    }
    return axis;
  }
  if (c.iLen >= 0) {
    const L = c.lengthsInfo;
    const M = absAt(c, c.iLen, tuple);
    const q = floorDiv(M, BigInt(L.len));
    const r = Number(floorMod(M, BigInt(L.len)));
    let axis = (q * L.prefixCounts[L.len] + L.prefixCounts[r]) * L.childUnit;
    for (let i = c.iLen - 1; i >= 0; i--) {
      axis += BigInt(posOf(c, i, tuple)) * c.unitLen[i];
    }
    return axis;
  }
  let axis = BigInt(tuple[0]) * c.unitLen[c.top];
  for (let i = c.top - 1; i >= 0; i--) {
    axis += BigInt(posOf(c, i, tuple)) * c.unitLen[i];
  }
  return axis;
}

// Tupel → Achse (BigInt in Einheiten der kleinsten Ebene, Nullpunkt = Start
// des internen Jahres 0); null bei ungültigem Tupel.
function tupleToAxis(cal, tuple) {
  const c = compileSafe(cal);
  if (!c) return null;
  if (!validateTuple(cal, tuple).ok) return null;
  return tupleToAxisUnchecked(c, tuple);
}

// Achse → Tupel; null, wenn das oberste Segment ±2^53 verließe.
function axisToTuple(cal, axis) {
  const c = compileSafe(cal);
  if (!c) return null;
  if (typeof axis === 'number') {
    if (!Number.isSafeInteger(axis)) return null;
    axis = BigInt(axis);
  }
  if (typeof axis !== 'bigint') return null;
  const segs = new Array(c.levels.length);
  const fillBelow = (fromIdx, remStart) => {
    let rem = remStart;
    for (let i = fromIdx; i >= 0; i--) {
      const p = floorDiv(rem, c.unitLen[i]);
      rem -= p * c.unitLen[i];
      segs[c.top - i] = Number(p) + c.levels[i].start;
    }
  };
  const fillAbove = (fromIdx, absStart) => {
    let above = absStart;
    for (let li = fromIdx; li < c.top; li++) {
      const cnt = BigInt(c.levels[li + 1].rel.count);
      segs[c.top - li] = Number(floorMod(above, cnt)) + c.levels[li].start;
      above = floorDiv(above, cnt);
    }
    const topSeg = toSafeNumber(above);
    if (topSeg === null) return false;
    segs[0] = topSeg;
    return true;
  };
  if (c.iLeap >= 0) {
    const Y = findYear(c, axis);
    const leapYear = isLeapY(c, Y);
    let rem = axis - yearStartAxis(c, Y);
    // Kind-Position (z.B. Monat) per Binärsuche über die Start-Offsets.
    let lo = 0;
    let hi = c.leapInfo.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (childStartAxis(c, mid, leapYear) <= rem) lo = mid;
      else hi = mid - 1;
    }
    const childIdx = c.iLeap - 1;
    segs[c.top - childIdx] = lo + c.levels[childIdx].start;
    rem -= childStartAxis(c, lo, leapYear);
    fillBelow(childIdx - 1, rem);
    if (!fillAbove(c.iLeap, Y)) return null;
    return segs;
  }
  if (c.iLen >= 0) {
    const L = c.lengthsInfo;
    const q = floorDiv(axis, L.cycleUnits);
    let rem = axis - q * L.cycleUnits;
    let r = 0;
    while (r + 1 < L.len && L.prefixCounts[r + 1] * L.childUnit <= rem) r++;
    rem -= L.prefixCounts[r] * L.childUnit;
    segs[c.top - c.iLen] = r + c.levels[c.iLen].start;
    fillBelow(c.iLen - 1, rem);
    if (!fillAbove(c.iLen, q * BigInt(L.len) + BigInt(r))) return null;
    // fillAbove überschreibt das Längen-Segment aus dem absoluten Index —
    // identisch zu r; das oberste Segment trägt den Rest.
    return segs;
  }
  const t = floorDiv(axis, c.unitLen[c.top]);
  const topSeg = toSafeNumber(t);
  if (topSeg === null) return null;
  segs[0] = topSeg;
  fillBelow(c.top - 1, axis - t * c.unitLen[c.top]);
  return segs;
}

// --- Gültigkeit ----------------------------------------------------------------------

function validateTuple(cal, tuple, opts = {}) {
  const c = compileSafe(cal);
  if (!c) return { ok: false, code: 'calendar' };
  if (!Array.isArray(tuple) || tuple.length !== c.levels.length) {
    return { ok: false, code: 'segmentCount' };
  }
  for (let k = 0; k < tuple.length; k++) {
    if (!isInt(tuple[k]))
      return { ok: false, code: 'segmentType', levelId: c.levels[c.top - k].id };
  }
  for (let levelIdx = c.top - 1; levelIdx >= 0; levelIdx--) {
    const pos = posOf(c, levelIdx, tuple);
    if (pos < 0 || pos >= positionCount(c, levelIdx, tuple)) {
      return { ok: false, code: 'segmentRange', levelId: c.levels[levelIdx].id };
    }
  }
  if (opts.epochIndex != null) {
    const e = opts.epochIndex;
    if (!isInt(e) || e < 0 || !Array.isArray(cal.epochs) || e >= cal.epochs.length) {
      return { ok: false, code: 'epochUnknown' };
    }
    const info = epochInfo(cal, c);
    const axis = tupleToAxisUnchecked(c, tuple);
    if (e >= 1 && axis < info.axes[e]) return { ok: false, code: 'epochMismatch' };
    if (e < cal.epochs.length - 1 && axis >= info.axes[e + 1]) {
      return { ok: false, code: 'epochMismatch' };
    }
  }
  return { ok: true };
}

// Gültige Wertebereiche der Segmente im Kontext der höheren Segmente des
// Tupels (Baustein für Picker-Spinner und Editoren): pro Tupel-Position
// { levelId, min, max }; oberste Ebene unbegrenzt (±2^53).
function segmentRanges(cal, tuple) {
  const c = compileSafe(cal);
  if (!c) return null;
  if (!Array.isArray(tuple) || tuple.length !== c.levels.length || !tuple.every(isInt)) {
    return null;
  }
  const out = [{ levelId: c.levels[c.top].id, min: -MAX_SAFE, max: MAX_SAFE }];
  for (let k = 1; k < tuple.length; k++) {
    const levelIdx = c.top - k;
    const level = c.levels[levelIdx];
    out.push({
      levelId: level.id,
      min: level.start,
      max: level.start + positionCount(c, levelIdx, tuple) - 1,
    });
  }
  return out;
}

// --- Epochen -------------------------------------------------------------------------

// Zeit-Segmente in Minimal-Stellung (größte Zeit-Ebene zuerst).
function timeStartSegs(c) {
  const segs = [];
  for (let k = c.dateCount; k < c.levels.length; k++) segs.push(c.levels[c.top - k].start);
  return segs;
}

function epochInfo(cal, c) {
  if (c.epochInfo) return c.epochInfo;
  const axes = [null];
  const startYears = [null];
  for (let i = 1; i < cal.epochs.length; i++) {
    const full = cal.epochs[i].start.concat(timeStartSegs(c));
    axes.push(tupleToAxisUnchecked(c, full));
    startYears.push(cal.epochs[i].start[0]);
  }
  // Anzeige-Jahr 1 der offenen Vergangenheits-Epoche: das Kalenderjahr der
  // letzten Tage vor der Grenze (bei Grenze auf Jahres-Anfang das Vorjahr).
  let e0Year = 0;
  if (cal.epochs.length >= 2) {
    const s = cal.epochs[1].start;
    const atYearStart = s.every((v, k) => k === 0 || v === c.levels[c.top - k].start);
    e0Year = atYearStart ? s[0] - 1 : s[0];
  }
  c.epochInfo = { axes, startYears, e0Year };
  return c.epochInfo;
}

// Epoche und epochen-relatives Anzeige-Jahr (ab 1) eines gültigen Tupels.
function epochOf(cal, tuple) {
  const c = compileSafe(cal);
  if (!c || !Array.isArray(cal.epochs) || cal.epochs.length === 0) return null;
  if (!validateTuple(cal, tuple).ok) return null;
  return epochOfUnchecked(cal, c, tuple);
}

function epochOfUnchecked(cal, c, tuple) {
  const info = epochInfo(cal, c);
  const axis = tupleToAxisUnchecked(c, tuple);
  let e = 0;
  for (let i = cal.epochs.length - 1; i >= 1; i--) {
    if (axis >= info.axes[i]) {
      e = i;
      break;
    }
  }
  const Y = tuple[0];
  const year = e === 0 ? info.e0Year - Y + 1 : Y - info.startYears[e] + 1;
  return { index: e, name: cal.epochs[e].name, abbr: cal.epochs[e].abbr, year };
}

function internalYearOf(cal, c, epochIndex, displayYear) {
  const info = epochInfo(cal, c);
  return epochIndex === 0
    ? info.e0Year - displayYear + 1
    : info.startYears[epochIndex] + displayYear - 1;
}

// --- Zyklen und Gruppierungen ---------------------------------------------------------

function cycleInfo(cal, c, cycle) {
  if (!c.cycleInfo) c.cycleInfo = new Map();
  let info = c.cycleInfo.get(cycle.id);
  if (!info) {
    const ofIdx = c.levels.findIndex((lv) => lv.id === cycle.of);
    const unit = c.unitLen[ofIdx];
    const anchorAxis = tupleToAxisUnchecked(c, cycle.anchor.tuple.concat(timeStartSegs(c)));
    info = { unit, zeroAbs: floorDiv(anchorAxis, unit) - BigInt(cycle.anchor.position) };
    c.cycleInfo.set(cycle.id, info);
  }
  return info;
}

// Zyklus-Stand eines Tupels: Position (0-basiert), Positions-Name und — bei
// Nummerierungs-Regel — Zyklus-Nummer ab 1 im „Jahr" des ruleIndex-ten Tags
// (generische Donnerstags-Regel) plus absolutem Jahres-Index.
function cycleAt(cal, tuple, cycleId) {
  const c = compileSafe(cal);
  if (!c || !Array.isArray(cal.cycles)) return null;
  const cycle = cycleId == null ? cal.cycles[0] : cal.cycles.find((x) => x.id === cycleId);
  if (!cycle || !validateTuple(cal, tuple).ok) return null;
  const info = cycleInfo(cal, c, cycle);
  const axis = tupleToAxisUnchecked(c, tuple);
  const abs = floorDiv(axis, info.unit);
  const position = Number(floorMod(abs - info.zeroAbs, BigInt(cycle.length)));
  const out = {
    id: cycle.id,
    name: cycle.name,
    position,
    positionName: cycle.names ? (cycle.names[position] ?? null) : null,
    number: null,
    year: null,
  };
  if (cycle.numbering) {
    const ruleAxis = (abs - BigInt(position) + BigInt(cycle.numbering.ruleIndex)) * info.unit;
    const rt = axisToTuple(cal, ruleAxis);
    if (rt) {
      const yearTuple = rt.map((seg, k) =>
        c.top - k >= c.iYear ? seg : c.levels[c.top - k].start,
      );
      const ord0 = toSafeNumber(floorDiv(ruleAxis - tupleToAxisUnchecked(c, yearTuple), info.unit));
      const yAbs = toSafeNumber(absAt(c, c.iYear, rt));
      if (ord0 !== null && yAbs !== null) {
        out.number = Math.floor(ord0 / cycle.length) + 1;
        out.year = yAbs;
      }
    }
  }
  return out;
}

// Gruppierungs-Stand eines Tupels (Quartal/Halbjahr): Index (0-basiert),
// Nummer ab 1 und optionaler Positions-Name.
function groupAt(cal, tuple, groupId) {
  const c = compileSafe(cal);
  if (!c || !Array.isArray(cal.groups)) return null;
  const group = groupId == null ? cal.groups[0] : cal.groups.find((x) => x.id === groupId);
  if (!group || !validateTuple(cal, tuple).ok) return null;
  const ofIdx = c.levels.findIndex((lv) => lv.id === group.of);
  const q = Math.floor(posOf(c, ofIdx, tuple) / group.size);
  return {
    id: group.id,
    name: group.name,
    index: q,
    number: q + 1,
    positionName: group.names ? (group.names[q] ?? null) : null,
  };
}

// --- Kanonische Form -----------------------------------------------------------------

function padSeg(value, width) {
  return value < 0 ? String(value) : String(value).padStart(width, '0');
}

function epochLabel(cal, index) {
  return cal.epochs[index].abbr || cal.epochs[index].name || `#${index + 1}`;
}

// Kanonische Form: Datums-Segmente groß nach klein mit '-', Epochen-Kürzel
// nur außerhalb der letzten (offenen Zukunfts-)Epoche, Zeit-Teil mit ':'
// (entfällt in Minimal-Stellung). Mit opts.named ersetzen Positions-Namen
// (z.B. Monatsnamen) die gepolsterten Zahlen. null bei ungültigem Tupel.
function formatTuple(cal, tuple, opts = {}) {
  const c = compileSafe(cal);
  if (!c || !Array.isArray(cal.epochs) || cal.epochs.length === 0) return null;
  if (!validateTuple(cal, tuple).ok) return null;
  // 4T-0747: Abgeleitete Zeitrechnungen zählen vom Nullpunkt weg statt in
  // Kalender-Koordinaten; Positions-Namen gibt es dort nicht.
  if (cal.derived) return formatDerived(cal, c, tuple);
  const ep = epochOfUnchecked(cal, c, tuple);
  const parts = [];
  for (let k = 0; k < c.dateCount; k++) {
    if (k === 0) {
      parts.push(String(ep.year));
      continue;
    }
    const levelIdx = c.top - k;
    const level = c.levels[levelIdx];
    const name = opts.named && level.names ? level.names[tuple[k] - level.start] : null;
    parts.push(name != null ? name : padSeg(tuple[k], c.widths[levelIdx]));
  }
  let out = parts.join('-');
  if (ep.index < cal.epochs.length - 1) out += ` ${epochLabel(cal, ep.index)}`;
  if (c.timeCount > 0) {
    const timeSegs = tuple.slice(c.dateCount);
    const starts = timeStartSegs(c);
    if (!timeSegs.every((s, j) => s === starts[j])) {
      out += ' ' + timeSegs.map((s, j) => padSeg(s, c.widths[c.top - (c.dateCount + j)])).join(':');
    }
  }
  return out;
}

// Kanonische Form parsen: { ok: true, tuple, epochIndex } oder Fehler-Code.
// Ohne Epochen-Label gilt die letzte (offene Zukunfts-)Epoche; der Zeit-Teil
// darf links-bündig verkürzt sein (fehlende kleine Segmente = Minimal-Stellung).
function parseCanonical(cal, text) {
  const c = compileSafe(cal);
  if (!c || !Array.isArray(cal.epochs) || cal.epochs.length === 0) {
    return { ok: false, code: 'calendar' };
  }
  if (cal.derived) return parseDerived(cal, c, text);
  const s = cleanString(text);
  if (s === '') return { ok: false, code: 'malformed' };
  const firstSpace = s.indexOf(' ');
  const dateTok = firstSpace < 0 ? s : s.slice(0, firstSpace);
  let rest = firstSpace < 0 ? '' : s.slice(firstSpace + 1).trim();
  const dateParts = dateTok.split('-');
  if (dateParts.length !== c.dateCount) return { ok: false, code: 'malformed' };
  const dateSegs = [];
  for (const p of dateParts) {
    if (!/^\d{1,15}$/.test(p)) return { ok: false, code: 'malformed' };
    dateSegs.push(Number(p));
  }
  // Epochen-Label: längste Übereinstimmung über Kürzel, Namen und die
  // technische #N-Ersatzform (Labels dürfen Leerzeichen enthalten).
  let epochIndex = cal.epochs.length - 1;
  if (rest !== '') {
    const labels = [];
    for (let i = 0; i < cal.epochs.length; i++) {
      for (const label of [cal.epochs[i].abbr, cal.epochs[i].name, `#${i + 1}`]) {
        if (label) labels.push({ label, index: i });
      }
    }
    labels.sort((a, b) => b.label.length - a.label.length);
    for (const cand of labels) {
      if (rest === cand.label || rest.startsWith(cand.label + ' ')) {
        epochIndex = cand.index;
        rest = rest.slice(cand.label.length).trim();
        break;
      }
    }
  }
  const timeSegs = timeStartSegs(c);
  if (rest !== '') {
    if (c.timeCount === 0) return { ok: false, code: 'malformed' };
    const timeParts = rest.split(':');
    if (timeParts.length > c.timeCount) return { ok: false, code: 'malformed' };
    for (let j = 0; j < timeParts.length; j++) {
      if (!/^\d{1,15}$/.test(timeParts[j])) return { ok: false, code: 'malformed' };
      timeSegs[j] = Number(timeParts[j]);
    }
  }
  if (dateSegs[0] < 1) return { ok: false, code: 'yearZero' };
  const tuple = [
    internalYearOf(cal, c, epochIndex, dateSegs[0]),
    ...dateSegs.slice(1),
    ...timeSegs,
  ];
  const v = validateTuple(cal, tuple, { epochIndex });
  if (!v.ok) return v;
  return { ok: true, tuple, epochIndex };
}

// --- Umrechnung über die Block-Achse --------------------------------------------------

// Umrechnung zwischen zwei Kalendern DESSELBEN Blocks (Block-Grenzen sind
// bewusst nicht umrechenbar — die API nimmt deshalb den Block entgegen):
// Tupel → eigene Achse → Block-Achse (affin: Anker plus Skala als Bruch) →
// fremde Achse mit EINER Floor-Rundung auf die kleinste Ziel-Ebene → Tupel.
function convertInBlock(block, fromId, tuple, toId) {
  if (!block || !Array.isArray(block.calendars)) return { ok: false, code: 'unknownCalendar' };
  const from = block.calendars.find((x) => x && x.id === fromId);
  const to = block.calendars.find((x) => x && x.id === toId);
  if (!from || !to) return { ok: false, code: 'unknownCalendar' };
  return convertBetween(from, tuple, to);
}

// Dieselbe Umrechnung zwischen zwei Kalender-Objekten. Sie trägt auch dann,
// wenn der Ziel-Kalender nicht im Block steht — der Fall einer Ableitung auf
// die eingebaute Standard-Zeitrechnung (4T-0748). Die Block-Zugehörigkeit
// prüft der Aufrufer; die Rechnung selbst braucht nur Anker und Skala.
function convertBetween(from, tuple, to) {
  if (!from || !to) return { ok: false, code: 'unknownCalendar' };
  const v = validateTuple(from, tuple);
  if (!v.ok) return v;
  const cf = compileSafe(from);
  const ct = compileSafe(to);
  if (!cf || !ct) return { ok: false, code: 'calendar' };
  const diff = tupleToAxisUnchecked(cf, tuple) - tupleToAxisUnchecked(cf, from.blockAnchor);
  const num = diff * BigInt(from.blockScale.num) * BigInt(to.blockScale.den);
  const den = BigInt(from.blockScale.den) * BigInt(to.blockScale.num);
  const axisTo = floorDiv(num, den) + tupleToAxisUnchecked(ct, to.blockAnchor);
  const out = axisToTuple(to, axisTo);
  return out ? { ok: true, tuple: out } : { ok: false, code: 'outOfRange' };
}

// Bezugs-Zeitrechnung einer Ableitung: der Kalender des Blocks oder die
// eingebaute Standard-Zeitrechnung; null, wenn der Kalender keine Ableitung
// ist oder der Bezug fehlt.
function baseCalendarOf(block, cal) {
  if (!cal || !cal.derived) return null;
  if (cal.derived.fromId === STANDARD_CALENDAR_ID) return standardCalendar();
  if (!block || !Array.isArray(block.calendars)) return null;
  return block.calendars.find((c) => c && c.id === cal.derived.fromId && !c.derived) || null;
}

// --- Wert-Syntax im Dokument (4T-0546) -------------------------------------------------
// `@{Kalendername: Wert}` — eine Zeile, keine geschachtelten Klammern; der
// erste Doppelpunkt trennt Name und Wert (Kalendernamen mit Doppelpunkt
// sind nicht adressierbar, dokumentierte Grenze). Gemeinsame Erkennungs-
// Quelle für Markdown-Pipeline, Editor-Dekoration und Portable-Export
// (keine Regex-Kopien; Code-Kontexte schliessen die Konsumenten aus).

const CALENDAR_VALUE_SCAN_RE = /@\{[^{}\n]*\}/g;

// Zerlegt ein rohes Vorkommen (inklusive `@{`/`}`) in Name und Wert;
// null, wenn die Form nicht passt (leerer Name oder Wert).
function parseCalendarValueRaw(raw) {
  const s = String(raw == null ? '' : raw);
  if (!s.startsWith('@{') || !s.endsWith('}')) return null;
  const inner = s.slice(2, -1);
  if (inner.includes('{') || inner.includes('}') || inner.includes('\n')) return null;
  const colon = inner.indexOf(':');
  if (colon < 0) return null;
  const name = inner.slice(0, colon).trim();
  const value = inner.slice(colon + 1).trim();
  if (name === '' || value === '') return null;
  return { name, value };
}

// Alle Wert-Vorkommen eines Texts: [{ from, to, name, value, raw }].
function findCalendarValues(text) {
  const out = [];
  const source = String(text == null ? '' : text);
  CALENDAR_VALUE_SCAN_RE.lastIndex = 0;
  let m;
  while ((m = CALENDAR_VALUE_SCAN_RE.exec(source)) !== null) {
    const parsed = parseCalendarValueRaw(m[0]);
    if (!parsed) continue;
    out.push({ from: m.index, to: m.index + m[0].length, raw: m[0], ...parsed });
  }
  return out;
}

// Kalender-Suche für die Wert-Syntax `@{Kalendername: Wert}`: exakter Name
// vor Groß/Klein-toleranter Übereinstimmung vor id-Rückfall, in Block-
// Reihenfolge (erster Treffer gewinnt bei Namens-Kollisionen).
function findCalendarByName(config, name) {
  const q = cleanString(name);
  if (!config || !Array.isArray(config.blocks) || q === '') return null;
  const lower = q.toLowerCase();
  let caseHit = null;
  let idHit = null;
  for (const block of config.blocks) {
    for (const calendar of block.calendars) {
      if (calendar.name === q) return { block, calendar };
      if (!caseHit && calendar.name.toLowerCase() === lower) caseHit = { block, calendar };
      if (!idHit && calendar.id === q) idHit = { block, calendar };
    }
  }
  return caseHit || idHit;
}

// --- Normalisierung der Sektion --------------------------------------------------------

// Minimal-Tupel eines Kalenders: internes Jahr 0, alle Segmente in Start-
// Stellung (Default-Anker der Block-Achse).
function zeroTuple(c) {
  const segs = [0];
  for (let k = 1; k < c.levels.length; k++) segs.push(c.levels[c.top - k].start);
  return segs;
}

// Datums-Segmente prüfen (Struktur plus Kalender-Gültigkeit mit Zeit in
// Minimal-Stellung); Kopie oder null.
function normalizeDateSegs(cal, c, raw) {
  if (!Array.isArray(raw) || raw.length !== c.dateCount || !raw.every(isInt)) return null;
  return validateTuple(cal, raw.concat(timeStartSegs(c))).ok ? raw.slice() : null;
}

function normalizeEpochs(cal, c, raw) {
  let epoch0 = null;
  const candidates = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const name = cleanString(entry.name);
      const abbr = cleanString(entry.abbr) || null;
      if (entry.start == null) {
        if (!epoch0) epoch0 = { name, abbr, start: null };
        continue;
      }
      const start = normalizeDateSegs(cal, c, entry.start);
      if (!start) continue;
      candidates.push({
        epoch: { name, abbr, start },
        axis: tupleToAxisUnchecked(c, start.concat(timeStartSegs(c))),
      });
    }
  }
  candidates.sort((a, b) => (a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : 0));
  const epochs = [epoch0 || { name: '', abbr: null, start: null }];
  let prev = null;
  for (const cand of candidates) {
    if (prev !== null && cand.axis === prev) continue;
    epochs.push(cand.epoch);
    prev = cand.axis;
  }
  if (epochs.length < 2) {
    // Default-Grenze am Start des internen Jahres 1 (Zählung ab 1 davor/danach).
    const start = [1];
    for (let k = 1; k < c.dateCount; k++) start.push(c.levels[c.top - k].start);
    epochs.push({ name: '', abbr: null, start });
  }
  return epochs;
}

function normalizeCycles(cal, c, raw) {
  const cycles = [];
  const seen = new Set();
  if (!Array.isArray(raw)) return cycles;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const id = cleanString(entry.id);
    if (id === '' || seen.has(id)) continue;
    const ofIdx = c.levels.findIndex((lv) => lv.id === cleanString(entry.of));
    if (ofIdx < 0 || ofIdx >= c.iIrrFirst || !isPosInt(entry.length)) continue;
    let anchor = { tuple: zeroTuple(c).slice(0, c.dateCount), position: 0 };
    if (entry.anchor != null) {
      if (!entry.anchor || typeof entry.anchor !== 'object') continue;
      const tuple = normalizeDateSegs(cal, c, entry.anchor.tuple);
      const position = entry.anchor.position;
      if (!tuple || !isInt(position) || position < 0 || position >= entry.length) continue;
      anchor = { tuple, position };
    }
    let numbering = null;
    if (entry.numbering != null) {
      const ruleIndex =
        entry.numbering && typeof entry.numbering === 'object' ? entry.numbering.ruleIndex : null;
      if (!isInt(ruleIndex) || ruleIndex < 0 || ruleIndex >= entry.length) continue;
      numbering = { ruleIndex };
    }
    seen.add(id);
    cycles.push({
      id,
      name: cleanString(entry.name) || id,
      of: c.levels[ofIdx].id,
      length: entry.length,
      names: normalizeNames(entry.names),
      anchor,
      numbering,
    });
  }
  return cycles;
}

function normalizeGroups(c, raw) {
  const groups = [];
  const seen = new Set();
  if (!Array.isArray(raw)) return groups;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const id = cleanString(entry.id);
    if (id === '' || seen.has(id)) continue;
    const ofIdx = c.levels.findIndex((lv) => lv.id === cleanString(entry.of));
    if (ofIdx < 0 || ofIdx >= c.top || !isPosInt(entry.size)) continue;
    seen.add(id);
    groups.push({
      id,
      name: cleanString(entry.name) || id,
      of: c.levels[ofIdx].id,
      size: entry.size,
      names: normalizeNames(entry.names),
    });
  }
  return groups;
}

// Einzelnen Kalender normalisieren; null = defekt (Fehler-Isolation pro
// Kalender). Fehlende Anker/Skala/Epochen erhalten Defaults; vorhandene,
// aber ungültige Anker/Skala machen den Kalender defekt (stilles Umdeuten
// würde Umrechnungen unbemerkt verfälschen).
function normalizeCalendar(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanString(value.id);
  if (id === '') return null;
  const levels = normalizeLevels(value.levels);
  if (!levels) return null;
  const cal = {
    id,
    name: cleanString(value.name) || id,
    levels,
    cycles: [],
    groups: [],
    epochs: [],
    blockAnchor: null,
    blockScale: null,
  };
  const c = compileSafe(cal);
  if (value.blockAnchor == null) {
    cal.blockAnchor = zeroTuple(c);
  } else {
    if (!Array.isArray(value.blockAnchor) || !validateTuple(cal, value.blockAnchor).ok) return null;
    cal.blockAnchor = value.blockAnchor.slice();
  }
  if (value.blockScale == null) {
    cal.blockScale = { num: 1, den: 1 };
  } else {
    const { num, den } =
      value.blockScale && typeof value.blockScale === 'object' ? value.blockScale : {};
    if (!isPosInt(num) || !isPosInt(den)) return null;
    cal.blockScale = { num, den };
  }
  cal.epochs = normalizeEpochs(cal, c, value.epochs);
  cal.cycles = normalizeCycles(cal, c, value.cycles);
  cal.groups = normalizeGroups(c, value.groups);
  // 4T-0746: Herkunfts-Angaben einer abgeleiteten Zeitrechnung; sie sind
  // Anzeige- und Pflege-Information und werden von der Arithmetik nicht
  // gebraucht (die Ableitung ist eine vollwertige Definition).
  if (value.derived && typeof value.derived === 'object') {
    const fromId = cleanString(value.derived.fromId);
    if (fromId !== '') {
      cal.derived = {
        fromId,
        fromName: cleanString(value.derived.fromName) || fromId,
        zero: Array.isArray(value.derived.zero) ? value.derived.zero.slice() : null,
        depth: isInt(value.derived.depth) && value.derived.depth >= 0 ? value.derived.depth : null,
      };
    }
  }
  return cal;
}

// Normalisiert die calendarSystems-Sektion auf { blocks } oder null (keine
// Konfiguration). Defekte Blöcke und Kalender entfallen einzeln; doppelte
// ids behalten den ersten Eintrag. Abgeleitete Zeitrechnungen (4T-0746)
// werden in einem ZWEITEN Durchgang je Block aufgelöst, damit die
// Reihenfolge der Definitionen keine Rolle spielt.
function normalizeCalendarConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const blocks = [];
  const seenBlocks = new Set();
  if (Array.isArray(value.blocks)) {
    for (const rawBlock of value.blocks) {
      if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) continue;
      const id = cleanString(rawBlock.id);
      if (id === '' || seenBlocks.has(id)) continue;
      seenBlocks.add(id);
      const calendars = [];
      const seenCals = new Set();
      const derivedRaw = [];
      if (Array.isArray(rawBlock.calendars)) {
        // Durchgang 1: eigenständige Definitionen.
        for (const rawCal of rawBlock.calendars) {
          if (rawCal && typeof rawCal === 'object' && rawCal.derivedFrom != null) {
            derivedRaw.push(rawCal);
            continue;
          }
          const cal = normalizeCalendar(rawCal);
          if (!cal || seenCals.has(cal.id)) continue;
          seenCals.add(cal.id);
          calendars.push(cal);
        }
        // Durchgang 2: Ableitungen gegen die Bezugs-Zeitrechnung auflösen.
        // Bezug ist ein eigenständiger Kalender desselben Blocks oder die
        // eingebaute Standard-Zeitrechnung; eine Ableitung ist kein
        // zulässiger Bezug (keine Ketten).
        for (const rawCal of derivedRaw) {
          const derivedId = cleanString(rawCal.id);
          if (derivedId === '' || seenCals.has(derivedId)) continue;
          const baseId = cleanString(rawCal.derivedFrom);
          const base =
            baseId === STANDARD_CALENDAR_ID
              ? standardCalendar()
              : calendars.find((c) => c.id === baseId && !c.derived);
          if (!base) continue;
          const cal = normalizeCalendar(deriveCalendar(base, rawCal));
          if (!cal) continue;
          seenCals.add(cal.id);
          calendars.push(cal);
        }
      }
      blocks.push({ id, name: cleanString(rawBlock.name) || id, calendars });
    }
  }
  return blocks.length > 0 ? { blocks } : null;
}

// --- Gregorianische Vorlage ------------------------------------------------------------

// Vollständige gregorianische Definition als Vorlage (Einstellungs-Knopf aus
// 4T-0544) und Referenz-Testfall: zwölf Monate per Längen-Tabelle,
// Schalt-Regel 4/100/400 auf den Februar, Sieben-Tage-Zyklus mit
// Donnerstags-Regel (Anker: 2000-01-01 war ein Samstag), Epochen
// v. Chr./n. Chr., Zeit-Ebenen Sekunde/Minute/Stunde. Namen mit deutschen
// Defaults, per opts lokalisierbar (die i18n-Anbindung liegt beim Aufrufer).
function createGregorianTemplate(opts = {}) {
  const monthNames = opts.monthNames || [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  const weekdayNames = opts.weekdayNames || [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
    'Sonntag',
  ];
  const epochNames = opts.epochNames || [
    { name: 'v. Chr.', abbr: 'v. Chr.' },
    { name: 'n. Chr.', abbr: 'n. Chr.' },
  ];
  const levelNames = {
    second: 'Sekunde',
    minute: 'Minute',
    hour: 'Stunde',
    day: 'Tag',
    month: 'Monat',
    year: 'Jahr',
    ...(opts.levelNames || {}),
  };
  const sectionNames = { time: 'Zeit', date: 'Datum', ...(opts.sectionNames || {}) };
  const groupNames = { quarter: 'Quartal', halfYear: 'Halbjahr', ...(opts.groupNames || {}) };
  return {
    id: cleanString(opts.id) || 'gregorian',
    name: cleanString(opts.name) || 'Gregorianischer Kalender',
    levels: [
      { id: 'second', name: levelNames.second, section: sectionNames.time, start: 0 },
      {
        id: 'minute',
        name: levelNames.minute,
        section: sectionNames.time,
        start: 0,
        rel: { type: 'factor', count: 60 },
      },
      {
        id: 'hour',
        name: levelNames.hour,
        section: sectionNames.time,
        start: 0,
        rel: { type: 'factor', count: 60 },
      },
      {
        id: 'day',
        name: levelNames.day,
        section: sectionNames.date,
        start: 1,
        rel: { type: 'factor', count: 24 },
      },
      {
        id: 'month',
        name: levelNames.month,
        section: sectionNames.date,
        start: 1,
        names: monthNames,
        rel: { type: 'lengths', table: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] },
      },
      {
        id: 'year',
        name: levelNames.year,
        section: sectionNames.date,
        start: 1,
        rel: {
          type: 'leap',
          count: 12,
          rules: [{ cycle: 4 }, { cycle: 100 }, { cycle: 400 }],
          targetIndex: 1,
          extra: 1,
        },
      },
    ],
    cycles: [
      {
        id: 'week',
        name: opts.weekName || 'Woche',
        of: 'day',
        length: 7,
        names: weekdayNames,
        anchor: { tuple: [2000, 1, 1], position: 5 },
        numbering: { ruleIndex: 3 },
      },
    ],
    groups: [
      { id: 'quarter', name: groupNames.quarter, of: 'month', size: 3 },
      { id: 'half-year', name: groupNames.halfYear, of: 'month', size: 6 },
    ],
    epochs: [
      { name: epochNames[0].name, abbr: epochNames[0].abbr, start: null },
      { name: epochNames[1].name, abbr: epochNames[1].abbr, start: [1, 1, 1] },
    ],
    blockScale: { num: 1, den: 1 },
  };
}

// --- Abgeleitete Zeitrechnungen (4T-0746, Epic 3E-0138) --------------------------------
//
// Eine abgeleitete Zeitrechnung ist eine PHASENVERSCHIEBUNG ihres Bezugs:
// dieselben Einheiten, aber ihre Grenzen liegen auf dem Nullpunkt und dessen
// Wiederkehr-Punkten, und die Namens-Listen wandern mit (der erste Monat
// behält den Namen des Bezugs-Monats, in dem der Nullpunkt liegt). Der
// Nullpunkt ist Tag 1; davor zählt die offene Vergangenheits-Epoche rückwärts
// ab 1, eine Null-Stelle gibt es nicht. Das Ergebnis ist eine VOLLWERTIGE
// Definition im selben Modell, deshalb tragen Wert-Syntax, Anzeige, Picker
// und Umrechnung unverändert (Konzept-Runde 4T-0745, Punkte 1 bis 5).
//
// Die naheliegende Alternative, Längen-Tabelle und Schaltregel auf den
// eigenen Jahres-Index anzuwenden, driftet: Drei Jahre ab dem 17.09.2005
// ergeben dort 1095 statt 1096 Tage.

// Reservierte Kennung des Bezugs auf die eingebaute Standard-Zeitrechnung.
const STANDARD_CALENDAR_ID = '@standard';

let standardCal = null;

// Eingebaute Standard-Zeitrechnung als Bezug: die gregorianische Vorlage
// unter reservierter Kennung, damit eine Ableitung ohne selbst definierten
// Kalender möglich ist.
function standardCalendar() {
  if (!standardCal) {
    standardCal = normalizeCalendar(createGregorianTemplate({ id: STANDARD_CALENDAR_ID }));
  }
  return standardCal;
}

// Dreht eine Liste so, dass Position n an den Anfang rückt.
function rotateList(list, n) {
  const len = list.length;
  const k = ((n % len) + len) % len;
  return list.map((_, i) => list[(i + k) % len]);
}

// Anzahl der Kind-Instanzen je Instanz der Ebene levelIdx (nur für Ebenen
// mit fester Kind-Zahl, also Faktor- und Schalt-Ebenen).
function childCountOf(c, levelIdx) {
  const rel = c.levels[levelIdx].rel;
  return rel.type === 'lengths' ? rel.table.length : rel.count;
}

// Tupel-Kopie mit allen Segmenten unterhalb von levelIdx in Start-Stellung
// (der Beginn der Einheit, in welcher der Wert liegt).
function floorAtLevel(c, tuple, levelIdx) {
  const out = tuple.slice();
  for (let i = 0; i < levelIdx; i++) out[c.top - i] = c.levels[i].start;
  return out;
}

// Beginn der NÄCHSTEN Instanz der Ebene levelIdx nach der des Tupels.
function nextAtLevel(c, tuple, levelIdx) {
  const out = floorAtLevel(c, tuple, levelIdx);
  for (let li = levelIdx; li < c.top; li++) {
    const k = c.top - li;
    out[k] += 1;
    if (out[k] - c.levels[li].start < childCountOf(c, li + 1)) return out;
    out[k] = c.levels[li].start;
  }
  out[0] += 1;
  return out;
}

// Erzeugt aus einer normalisierten Bezugs-Definition und einer Roh-Angabe
// { id, name, derivedFrom, zero, depth, labelBefore, labelAfter } die
// vollständige Definition der abgeleiteten Zeitrechnung; null, wenn der
// Nullpunkt im Bezug ungültig ist. Der Nullpunkt trägt nur Datums-Segmente,
// liegt also immer auf einer vollen Tages-Grenze.
function deriveCalendar(base, raw) {
  const c = compileSafe(base);
  if (!c || !raw || typeof raw !== 'object') return null;
  const id = cleanString(raw.id);
  if (id === '') return null;
  const zero = normalizeDateSegs(base, c, raw.zero);
  if (!zero) return null;
  const zeroFull = zero.concat(timeStartSegs(c));
  const posAt = (levelIdx) => zeroFull[c.top - levelIdx] - c.levels[levelIdx].start;

  // Ebenen kopieren, Namens-Listen auf die Position des Nullpunkts drehen.
  // Zeit-Ebenen bleiben dabei unverändert, weil ihre Position null ist.
  const levels = c.levels.map((lv, i) => {
    const out = { id: lv.id, name: lv.name, section: lv.section, start: lv.start };
    if (lv.names) out.names = i < c.top ? rotateList(lv.names, posAt(i)) : lv.names.slice();
    if (lv.rel) out.rel = { ...lv.rel };
    return out;
  });

  // Längen-Tabelle: Die abgeleitete Einheit k beginnt am Tag min(D, Länge)
  // ihrer Bezugs-Einheit (Klemmung auf den letzten vorhandenen Tag), ihre
  // Länge ist der Abstand bis zum Beginn der nächsten.
  let dayInUnit = 1;
  if (c.iLen >= 0) {
    const table = c.levels[c.iLen].rel.table;
    const len = table.length;
    const unitIdx = posAt(c.iLen);
    dayInUnit = c.iLen >= 1 ? posAt(c.iLen - 1) + 1 : 1;
    const startDay = (k) => Math.min(dayInUnit, table[(unitIdx + k) % len]);
    const derivedTable = [];
    for (let k = 0; k < len; k++) {
      derivedTable.push(table[(unitIdx + k) % len] - startDay(k) + startDay(k + 1));
    }
    levels[c.iLen].rel = { type: 'lengths', table: derivedTable };
  }

  // Schalt-Ebene: Das Ziel der Verlängerung wandert mit der Drehung. Liegt
  // der Nullpunkt hinter der kürzesten Länge der Ziel-Einheit, trägt die
  // Einheit DAVOR die variable Länge, weil dann deren Ende wandert.
  if (c.iLeap >= 0) {
    const rel = { ...c.levels[c.iLeap].rel };
    const childIdx = c.iLeap - 1;
    const cnt = rel.count;
    let target = (rel.targetIndex - posAt(childIdx) + cnt) % cnt;
    if (c.iLen === childIdx && dayInUnit > c.levels[c.iLen].rel.table[rel.targetIndex]) {
      target = (target - 1 + cnt) % cnt;
    }
    rel.targetIndex = target;
    levels[c.iLeap].rel = rel;
  }

  // Interner Jahres-Index so wählen, dass die Schaltregel dieselbe Instanz
  // trifft wie im Bezug: Liegt der Nullpunkt hinter der Ziel-Einheit, fällt
  // deren nächstes Vorkommen ins Folgejahr des Bezugs.
  let yearShift = 0;
  if (c.iLeap >= 0) {
    yearShift = posAt(c.iLeap - 1) <= c.levels[c.iLeap].rel.targetIndex ? 0 : 1;
  }
  const zeroDate = [zero[0] + yearShift];
  for (let k = 1; k < c.dateCount; k++) zeroDate.push(c.levels[c.top - k].start);

  // Zyklen: Länge übernehmen, Anker auf den eigenen Tag 1 mit Position 0,
  // Namen um die Zyklus-Position des Nullpunkts drehen. Ein unverändert
  // geerbter Anker zeigte in eigenen Koordinaten auf einen anderen
  // Zeitpunkt. Die Nummerierungs-Regel entfällt, weil die Zyklen ab dem
  // Nullpunkt durchgezählt werden.
  const cycles = (base.cycles || []).map((cy) => {
    const at = cycleAt(base, zeroFull, cy.id);
    return {
      id: cy.id,
      name: cy.name,
      of: cy.of,
      length: cy.length,
      names: cy.names ? rotateList(cy.names, at ? at.position : 0) : null,
      anchor: { tuple: zeroDate.slice(), position: 0 },
      numbering: null,
    };
  });

  // Gruppierungen: Größe übernehmen, Namen um die Gruppe drehen, in welcher
  // der Nullpunkt liegt.
  const groups = (base.groups || []).map((g) => {
    const idx = c.levels.findIndex((lv) => lv.id === g.of);
    return {
      id: g.id,
      name: g.name,
      of: g.of,
      size: g.size,
      names: g.names ? rotateList(g.names, idx >= 0 ? Math.floor(posAt(idx) / g.size) : 0) : null,
    };
  });

  const labelBefore = cleanString(raw.labelBefore) || 'vor';
  const labelAfter = cleanString(raw.labelAfter) || 'nach';
  const draft = {
    id,
    name: cleanString(raw.name) || id,
    levels,
    cycles,
    groups,
    // Zwei Richtungen statt Epochen: Grenze auf dem Nullpunkt, davor
    // rückwärts ab 1, danach vorwärts ab 1.
    epochs: [
      { name: labelBefore, abbr: labelBefore, start: null },
      { name: labelAfter, abbr: labelAfter, start: zeroDate.slice() },
    ],
    blockScale: base.blockScale ? { ...base.blockScale } : { num: 1, den: 1 },
  };

  // Block-Anker so setzen, dass der eigene Tag 1 auf dem Nullpunkt des
  // Bezugs liegt (gleiche Skala, also reine Verschiebung der Achse).
  const dc = compileSafe(draft);
  if (!dc) return null;
  const shift =
    tupleToAxisUnchecked(dc, zeroDate.concat(timeStartSegs(dc))) -
    (tupleToAxisUnchecked(c, zeroFull) - tupleToAxisUnchecked(c, base.blockAnchor));
  const anchor = axisToTuple(draft, shift);
  if (!anchor) return null;
  draft.blockAnchor = anchor;
  draft.derived = {
    fromId: base.id,
    fromName: base.name,
    zero: zero.slice(),
    depth: isInt(raw.depth) && raw.depth >= 0 ? raw.depth : null,
  };
  return draft;
}

// Persistenz-Form einer Konfiguration: wie die normalisierte, aber jede
// abgeleitete Zeitrechnung behält ihre KURZE Roh-Form (Bezug und Nullpunkt).
// Ohne das würde die aufgelöste Abschrift abgelegt, und eine spätere
// Änderung am Bezug erreichte die Ableitung nie mehr — genau die Kopie, die
// das Modell vermeidet. Eigenständige Kalender werden unverändert in ihrer
// normalisierten Form abgelegt (Bestandsverhalten aus 4T-0543).
function configForPersist(raw, normalized) {
  if (!normalized) return null;
  const rawBlocks = raw && Array.isArray(raw.blocks) ? raw.blocks : [];
  return {
    blocks: normalized.blocks.map((block) => {
      const rawBlock = rawBlocks.find((b) => b && cleanString(b.id) === block.id) || null;
      const rawCals = rawBlock && Array.isArray(rawBlock.calendars) ? rawBlock.calendars : [];
      return {
        ...block,
        calendars: block.calendars.map((cal) => {
          if (!cal.derived) return cal;
          return rawCals.find((c) => c && cleanString(c.id) === cal.id) || cal;
        }),
      };
    }),
  };
}

// --- Zeitspannen-Staffelung (4T-0746) --------------------------------------------------

// Einheiten-Leiter einer Zeitrechnung, von der kleinsten zur größten:
// die Datums-Ebenen, dazu Zyklen und Gruppierungen als reine Rechen-
// Einheiten über ihrer Bezugs-Ebene. Im gregorianischen Fall ergibt das
// Tag, Woche, Monat, Quartal, Halbjahr, Jahr.
function spanUnits(cal) {
  const c = compileSafe(cal);
  if (!c) return null;
  const units = [];
  for (let i = c.timeCount; i <= c.top; i++) {
    units.push({ id: c.levels[i].id, name: c.levels[i].name, levelIdx: i, mult: 1, kind: 'level' });
  }
  const add = (entry, mult, kind) => {
    const idx = c.levels.findIndex((lv) => lv.id === entry.of);
    if (idx < c.timeCount || idx > c.top || !isPosInt(mult) || mult < 2) return;
    units.push({ id: entry.id, name: entry.name, levelIdx: idx, mult, kind });
  };
  for (const cy of cal.cycles || []) add(cy, cy.length, 'cycle');
  for (const g of cal.groups || []) add(g, g.size, 'group');
  units.sort((a, b) => a.levelIdx - b.levelIdx || a.mult - b.mult);
  return units;
}

// Zerlegung eines Werts gegenüber dem Nullpunkt: Richtung, Anzahl
// vollständiger Einheiten je Ebene oberhalb der kleinsten Datums-Ebene,
// Ordnungszahl in dieser Ebene (innerhalb der letzten gezählten Einheit)
// und die Gesamt-Ordnungszahl ab dem Nullpunkt. Vorwärts ist der Nullpunkt
// selbst die Nummer 1, rückwärts trägt die Einheit davor die Nummer 1.
function spanParts(cal, tuple) {
  const c = compileSafe(cal);
  if (!c || !cal.derived || !Array.isArray(cal.epochs) || cal.epochs.length < 2) return null;
  if (!cal.epochs[1].start || !validateTuple(cal, tuple).ok) return null;
  const zeroFull = cal.epochs[1].start.concat(timeStartSegs(c));
  const axisZero = tupleToAxisUnchecked(c, zeroFull);
  // Der Zeit-Anteil bleibt außen vor (4T-0745, Punkt 4b): gezählt wird der
  // Datums-Anteil, der Zeit-Anteil wandert unverändert durch die Anzeige.
  const dateOnly = floorAtLevel(c, tuple, c.timeCount);
  const axisVal = tupleToAxisUnchecked(c, dateOnly);
  const forward = axisVal >= axisZero;
  const d0 = c.timeCount;
  const counts = new Map();
  let anchor = zeroFull;
  for (let L = c.top; L > d0 && L >= c.iIrrFirst; L--) {
    const floor = floorAtLevel(c, dateOnly, L);
    const onBoundary = tupleToAxisUnchecked(c, floor) === axisVal;
    let n;
    if (forward) {
      n = Number(absAt(c, L, dateOnly) - absAt(c, L, anchor));
      anchor = floor;
    } else {
      const stop = onBoundary ? floor : nextAtLevel(c, dateOnly, L);
      n = Number(absAt(c, L, anchor) - absAt(c, L, stop));
      anchor = stop;
    }
    counts.set(L, n);
  }
  // Ebenen mit fester Einheiten-Länge unterhalb der ersten unregelmäßigen
  // (z.B. ein Wochen-Ebene-Modell ohne Längen-Tabelle): rein rechnerisch.
  let rest = forward
    ? (axisVal - tupleToAxisUnchecked(c, anchor)) / c.unitLen[d0]
    : (tupleToAxisUnchecked(c, anchor) - axisVal) / c.unitLen[d0];
  for (let L = Math.min(c.iIrrFirst, c.top + 1) - 1; L > d0; L--) {
    const per = BigInt(Number(c.unitLen[L] / c.unitLen[d0]));
    const n = rest / per;
    counts.set(L, Number(n));
    rest -= n * per;
  }
  const total = forward
    ? (axisVal - axisZero) / c.unitLen[d0]
    : (axisZero - axisVal) / c.unitLen[d0];
  return {
    direction: forward ? 'after' : 'before',
    counts,
    ord: Number(rest) + (forward ? 1 : 0),
    totalOrd: Number(total) + (forward ? 1 : 0),
  };
}

// Tupel aus einem absoluten Instanz-Index der Ebene levelIdx (untere
// Segmente in Start-Stellung); Gegenstück zu absAt.
function tupleFromAbs(c, levelIdx, abs) {
  const segs = new Array(c.levels.length);
  for (let i = 0; i < levelIdx; i++) segs[c.top - i] = c.levels[i].start;
  let above = abs;
  for (let li = levelIdx; li < c.top; li++) {
    const cnt = BigInt(childCountOf(c, li + 1));
    segs[c.top - li] = Number(floorMod(above, cnt)) + c.levels[li].start;
    above = floorDiv(above, cnt);
  }
  const topSeg = toSafeNumber(above);
  if (topSeg === null) return null;
  segs[0] = topSeg;
  return segs;
}

// Achse um n Instanzen der Ebene levelIdx verschieben (n darf negativ sein).
// Unterhalb der ersten unregelmäßigen Ebene ist das reine Achsen-Arithmetik,
// darüber läuft es über den absoluten Instanz-Index.
function stepAxisAtLevel(cal, c, axis, levelIdx, n) {
  if (n === 0) return axis;
  if (levelIdx < c.iIrrFirst) return axis + BigInt(n) * c.unitLen[levelIdx];
  const at = axisToTuple(cal, axis);
  if (!at) return null;
  const next = tupleFromAbs(c, levelIdx, absAt(c, levelIdx, at) + BigInt(n));
  return next ? tupleToAxisUnchecked(c, next) : null;
}

// --- Kanonische Form abgeleiteter Zeitrechnungen (4T-0747, Variante B) -----------------
//
// Sie zählt in BEIDE Richtungen vom Nullpunkt weg: gröbere Einheiten als
// vollständige Anzahl ab 0, die kleinste Datums-Einheit als Ordnungszahl ab
// 1. Der Nullpunkt selbst ist damit 0-0-1, der Tag davor 0-0-1 mit dem
// Richtungs-Kürzel. Der Zeit-Anteil hängt unverändert hinten an.

function formatDerived(cal, c, tuple) {
  const parts = spanParts(cal, tuple);
  if (!parts) return null;
  const segs = [];
  for (let L = c.top; L > c.timeCount; L--) segs.push(parts.counts.get(L) || 0);
  segs.push(parts.ord);
  let out = segs.join('-');
  if (parts.direction === 'before') out += ` ${epochLabel(cal, 0)}`;
  if (c.timeCount > 0) {
    const timeSegs = tuple.slice(c.dateCount);
    const starts = timeStartSegs(c);
    if (!timeSegs.every((s, j) => s === starts[j])) {
      out += ' ' + timeSegs.map((s, j) => padSeg(s, c.widths[c.top - (c.dateCount + j)])).join(':');
    }
  }
  return out;
}

function parseDerived(cal, c, text) {
  const s = cleanString(text);
  if (s === '') return { ok: false, code: 'malformed' };
  const firstSpace = s.indexOf(' ');
  const dateTok = firstSpace < 0 ? s : s.slice(0, firstSpace);
  let rest = firstSpace < 0 ? '' : s.slice(firstSpace + 1).trim();
  const dateParts = dateTok.split('-');
  if (dateParts.length !== c.dateCount) return { ok: false, code: 'malformed' };
  const nums = [];
  for (const p of dateParts) {
    if (!/^\d{1,15}$/.test(p)) return { ok: false, code: 'malformed' };
    nums.push(Number(p));
  }
  // Richtungs-Kürzel: nur das der Vergangenheits-Richtung ist zulässig;
  // ohne Kürzel zählt vorwärts.
  let before = false;
  for (const cand of [
    { label: cal.epochs[0].abbr, before: true },
    { label: cal.epochs[0].name, before: true },
    { label: '#1', before: true },
    // Das Kürzel der Vorwärts-Richtung schreibt die kanonische Form nicht,
    // wird beim Lesen aber angenommen (Eingabe-Toleranz).
    { label: cal.epochs[1].abbr, before: false },
    { label: cal.epochs[1].name, before: false },
  ]) {
    if (!cand.label) continue;
    if (rest === cand.label || rest.startsWith(`${cand.label} `)) {
      before = cand.before;
      rest = rest.slice(cand.label.length).trim();
      break;
    }
  }
  const timeSegs = timeStartSegs(c);
  if (rest !== '') {
    if (c.timeCount === 0) return { ok: false, code: 'malformed' };
    const timeParts = rest.split(':');
    if (timeParts.length > c.timeCount) return { ok: false, code: 'malformed' };
    for (let j = 0; j < timeParts.length; j++) {
      if (!/^\d{1,15}$/.test(timeParts[j])) return { ok: false, code: 'malformed' };
      timeSegs[j] = Number(timeParts[j]);
    }
  }
  const ord = nums[nums.length - 1];
  if (ord < 1) return { ok: false, code: 'segmentRange', levelId: c.levels[c.timeCount].id };
  let axis = tupleToAxisUnchecked(c, cal.epochs[1].start.concat(timeStartSegs(c)));
  for (let k = 0; k < nums.length - 1; k++) {
    const level = c.top - k;
    axis = stepAxisAtLevel(cal, c, axis, level, before ? -nums[k] : nums[k]);
    if (axis === null) return { ok: false, code: 'segmentRange' };
  }
  axis += BigInt(before ? -ord : ord - 1) * c.unitLen[c.timeCount];
  const dateTuple = axisToTuple(cal, axis);
  if (!dateTuple) return { ok: false, code: 'segmentRange' };
  const tuple = dateTuple.slice(0, c.dateCount).concat(timeSegs);
  const v = validateTuple(cal, tuple);
  if (!v.ok) return v;
  return { ok: true, tuple, epochIndex: before ? 0 : 1 };
}

// Betrag der Ebene levelIdx in ihren eigenen Einheiten, also die Anzahl
// vollständiger Einheiten dieser Ebene samt der aufgelösten gröberen.
function totalAtLevel(c, counts, levelIdx) {
  let total = 0;
  for (let L = c.top; L > levelIdx; L--) {
    total = (total + (counts.get(L) || 0)) * childCountOf(c, L);
  }
  return total + (counts.get(levelIdx) || 0);
}

// Gestaffelte Zeitspanne eines Werts: je Gliederungs-Tiefe eine Liste von
// Einheiten mit ihrer Anzahl, von der gröbsten zur feinsten. Tiefe 0 nennt
// allein die kleinste Einheit, jede weitere nimmt die nächst-gröbere hinzu.
// Bestandteile der Länge null bleiben enthalten; das Weglassen ist Sache
// der Anzeige.
function spanTiers(cal, tuple) {
  const c = compileSafe(cal);
  const parts = spanParts(cal, tuple);
  const units = spanUnits(cal);
  if (!c || !parts || !units || units.length === 0) return null;
  const d0 = c.timeCount;
  const tiers = [];
  for (let i = 0; i < units.length; i++) {
    const used = units.slice(0, i + 1);
    const top = used[used.length - 1];
    let amount = top.levelIdx === d0 ? parts.totalOrd : totalAtLevel(c, parts.counts, top.levelIdx);
    const items = [];
    for (let j = used.length - 1; j >= 0; j--) {
      const u = used[j];
      if (j < used.length - 1 && u.levelIdx !== used[j + 1].levelIdx) {
        amount = u.levelIdx === d0 ? parts.ord : parts.counts.get(u.levelIdx) || 0;
      }
      const n = Math.floor(amount / u.mult);
      amount -= n * u.mult;
      items.push({ id: u.id, name: u.name, kind: u.kind, mult: u.mult, count: n });
    }
    tiers.push(items);
  }
  return { direction: parts.direction, tiers };
}

module.exports = {
  normalizeCalendarConfig,
  createGregorianTemplate,
  // 4T-0746 (Epic 3E-0138): abgeleitete Zeitrechnungen und Zeitspannen.
  STANDARD_CALENDAR_ID,
  standardCalendar,
  deriveCalendar,
  configForPersist,
  spanUnits,
  spanTiers,
  tupleToAxis,
  axisToTuple,
  validateTuple,
  segmentRanges,
  epochOf,
  cycleAt,
  groupAt,
  formatTuple,
  parseCanonical,
  convertInBlock,
  convertBetween,
  baseCalendarOf,
  findCalendarByName,
  // 4T-0546: Wert-Syntax im Dokument (gemeinsame Erkennungs-Quelle).
  parseCalendarValueRaw,
  findCalendarValues,
};
