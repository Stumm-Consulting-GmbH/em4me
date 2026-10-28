// 4T-002363 (Epic 3E-000333): Schnittstelle der Jahres-Struktur je Jahr.
// Prozess-neutral (kein DOM, kein Electron) wie der Rechen-Kern; blattartig
// wie calendar-leap.js — es lädt allein die Regel-Module calendar-rule-*.js
// und die erzeugten Tafeln year-tables/*.js, die selbst nichts laden; der Kern
// lädt es.
//
// Eine Zeitrechnung mit Jahres-Struktur nennt an ihrer Jahres-Ebene eine
// Quelle beim Namen: { type: 'yearly', rule: '<Name>' } oder
// { type: 'yearly', table: '<Name>' }. Die Quelle liefert je Jahr der eigenen
// Zählung die ganze Monatsfolge: Zahl der Monate (ein Schaltmonat ist eine
// zusätzliche Stelle), jede Monatslänge in Tagen und den Jahresbeginn. Der
// Inhalt einer Quelle ist Programm-Inhalt und steht in keiner Datei des
// Anwenders (Epic A15, Verweis statt Abschrift).
//
// Tages-Zählung (T6): «Rata Die» nach «Calendrical Calculations» — Tag 1 ist
// der 1. Januar des Jahres 1, gregorianisch proleptisch; der 1. Januar des
// Jahres 0 ist Tag −365 (YEARLY_AXIS_ORIGIN). Alle Tages-Angaben als BigInt.
//
// Zwei Formen einer Quelle:
//   Tafel  erzeugte Programm-Datei { name, erzeugt, ersteJahr, ersterTag,
//          namensStellen, jahre: ['29,30,…', …] } — je Zeile die Monatslängen
//          eines Jahres; ein Schaltmonat trägt ein nachgestelltes L und folgt
//          dem Monat, dessen Schaltmonat er ist. Der Beginn jedes weiteren
//          Jahres ist die Summe der Vorjahre; der Geltungs-Zeitraum sind die
//          Zeilen, erstes bis letztes Jahr, je ganz.
//   Regel  Modul { name, namensStellen, jahresBeginn(jahr) → Tag,
//          monate(jahr) → [{ length, slot, number, leap }, …] } mit Jahr und
//          Tag als BigInt; ganzzahlig, ohne Geltungs-Grenze.
//
// Ein Monat in der Auskunft: { length (Tage), slot (Namens-Stelle, 0-basiert:
// Index in die Namens-Liste der Monats-Ebene), number (Zahl des Monats im
// Jahr ohne Schaltmonate, 1-basiert), leap (Schaltmonat ja/nein) }. number und
// leap tragen die Monats-Kennung nach B1 (Epic A13): «05L» ist der Schaltmonat
// nach dem 5. Monat. In einer Tafel hat der n-te gewöhnliche Monat die
// Namens-Stelle n − 1 und der Schaltmonat nach dem m-ten die Stelle
// (Zahl der gewöhnlichen Monate) + m − 1; die chinesische Tafel kommt damit
// auf 24 Stellen (zwölf Monate, zwölf Schaltmonate).
//
// Die Liste der Regeln und Tafeln des Programms enthält die Regel hebrew
// (4T-002005, calendar-rule-hebrew.js) und die Tafeln persian (4T-002007,
// year-tables/persian.js), chinese (4T-002006, year-tables/chinese.js) und
// islamic-umalqura (4T-002008, year-tables/islamic-umalqura.js). Regeln liegen als
// Module calendar-rule-<Name>.js neben diesem Modul, Tafeln als erzeugte
// Dateien year-tables/<Name>.js
// (Erzeuger scripts/kalender-tafel-erzeugen.js). Prüfungen hängen Proben über
// setYearlySourcesForTests ein.
//
// Keine Internet-Zugriffe und kein eingebauter Kalender der Laufzeit (Intl):
// Die Rechnung stützt sich allein auf Regel und Tafel (Story 4S-001111, AK6).
'use strict';

// Rata Die des 1. Januar des gregorianischen Jahres 0: Ursprung der eigenen
// Achse jeder Zeitrechnung mit Jahres-Struktur (Achse = Tag − Ursprung).
const YEARLY_AXIS_ORIGIN = -365n;

// Regeln und Tafeln des Programms (Name → Modul).
const PROGRAM_SOURCES = Object.freeze({
  rules: Object.freeze({ hebrew: require('./calendar-rule-hebrew.js') }),
  tables: Object.freeze({
    persian: require('./year-tables/persian.js'),
    chinese: require('./year-tables/chinese.js'),
    'islamic-umalqura': require('./year-tables/islamic-umalqura.js'),
  }),
});

let activeSources = PROGRAM_SOURCES;

// Aufbereitete Quellen je Modul-Objekt; eine ausgetauschte Tafel ist ein
// neues Objekt und wird neu gelesen.
const PREPARED = new WeakMap();

function isInt(v) {
  return Number.isSafeInteger(v);
}

function isPosInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function floorDiv(a, b) {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

// --- Leser der Tafel-Form ---------------------------------------------------------

// Eine Zeile → Monatsfolge oder null (unlesbar). Ein Schaltmonat braucht einen
// gewöhnlichen Vorgänger und steht nicht doppelt hintereinander.
function parseYearLine(line) {
  if (typeof line !== 'string' || line.trim() === '') return null;
  const months = [];
  let regular = 0;
  let prevLeap = true;
  for (const raw of line.split(',')) {
    const m = /^\s*(\d{1,3})(L?)\s*$/.exec(raw);
    if (!m) return null;
    const length = Number(m[1]);
    if (length < 1) return null;
    const leap = m[2] === 'L';
    if (leap) {
      if (prevLeap) return null;
      months.push({ length, slot: -1, number: regular, leap: true });
    } else {
      regular += 1;
      months.push({ length, slot: regular - 1, number: regular, leap: false });
    }
    prevLeap = leap;
  }
  for (const month of months) if (month.leap) month.slot = regular + month.number - 1;
  return { months, regular };
}

// Liest eine Tafel; null, wenn Kopf oder eine Zeile unlesbar ist (Aufbau-Regel
// 4: die Zeitrechnung wird dann defekt und entfällt allein).
function readYearTable(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.name !== 'string' || raw.name.trim() === '') return null;
  if (!isInt(raw.ersteJahr) || !isInt(raw.ersterTag) || !isPosInt(raw.namensStellen)) return null;
  if (!Array.isArray(raw.jahre) || raw.jahre.length === 0) return null;
  const years = [];
  const starts = [BigInt(raw.ersterTag)];
  for (const line of raw.jahre) {
    const parsed = parseYearLine(line);
    if (!parsed) return null;
    if (parsed.months.some((m) => m.slot >= raw.namensStellen)) return null;
    let total = 0n;
    for (const m of parsed.months) total += BigInt(m.length);
    years.push(parsed.months);
    starts.push(starts[starts.length - 1] + total);
  }
  const lastYear = raw.ersteJahr + years.length - 1;
  if (!isInt(lastYear)) return null;
  return {
    name: raw.name,
    namensStellen: raw.namensStellen,
    firstYear: raw.ersteJahr,
    lastYear,
    years,
    starts,
  };
}

// --- Aufbereitete Quelle -------------------------------------------------------------
// Einheitliche Auskunft für Regel und Tafel:
//   namensStellen           Zahl der Namens-Stellen
//   range                   { firstYear, lastYear, firstDay, endDay } (endDay
//                           ausschließlich) oder null ohne Grenze
//   yearInfo(year)          { year, start, length, months } oder null außerhalb
//   yearOfDay(day)          Jahr (BigInt) des Tags oder null außerhalb
//   maxMonths, maxLength    Höchstwerte für Stellen-Breiten und Wertebereiche

function prepareTable(table) {
  const n = table.years.length;
  let maxMonths = 0;
  let maxLength = 0;
  for (const months of table.years) {
    maxMonths = Math.max(maxMonths, months.length);
    for (const m of months) maxLength = Math.max(maxLength, m.length);
  }
  const yearInfo = (year) => {
    const y = typeof year === 'bigint' ? year : BigInt(year);
    const i = y - BigInt(table.firstYear);
    if (i < 0n || i >= BigInt(n)) return null;
    const k = Number(i);
    return {
      year: y,
      start: table.starts[k],
      length: table.starts[k + 1] - table.starts[k],
      months: table.years[k],
    };
  };
  const yearOfDay = (day) => {
    if (day < table.starts[0] || day >= table.starts[n]) return null;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (table.starts[mid] <= day) lo = mid;
      else hi = mid - 1;
    }
    return BigInt(table.firstYear + lo);
  };
  return {
    kind: 'table',
    name: table.name,
    namensStellen: table.namensStellen,
    range: {
      firstYear: table.firstYear,
      lastYear: table.lastYear,
      firstDay: table.starts[0],
      endDay: table.starts[n],
    },
    yearInfo,
    yearOfDay,
    maxMonths,
    maxLength,
  };
}

// Prüft die Monatsfolge, die eine Regel für ein Jahr liefert; null bei einer
// unbrauchbaren Auskunft.
function checkRuleMonths(months, namensStellen) {
  if (!Array.isArray(months) || months.length === 0) return null;
  for (const m of months) {
    if (!m || !isPosInt(m.length) || !isInt(m.slot) || m.slot < 0 || m.slot >= namensStellen) {
      return null;
    }
    if (!isPosInt(m.number) || typeof m.leap !== 'boolean') return null;
  }
  return months;
}

function prepareRule(rule) {
  if (!rule || typeof rule !== 'object' || !isPosInt(rule.namensStellen)) return null;
  if (typeof rule.jahresBeginn !== 'function' || typeof rule.monate !== 'function') return null;
  const cache = new Map();
  const yearInfo = (year) => {
    const y = typeof year === 'bigint' ? year : BigInt(year);
    const key = String(y);
    if (cache.has(key)) return cache.get(key);
    const start = rule.jahresBeginn(y);
    const months = checkRuleMonths(rule.monate(y), rule.namensStellen);
    let info = null;
    if (typeof start === 'bigint' && months) {
      let length = 0n;
      for (const m of months) length += BigInt(m.length);
      info = { year: y, start, length, months };
    }
    if (cache.size > 4096) cache.clear();
    cache.set(key, info);
    return info;
  };
  const startOf = (y) => {
    const info = yearInfo(y);
    if (!info) throw new Error(`Regel ${rule.name}: keine Auskunft für das Jahr ${y}`);
    return info.start;
  };
  // Jahr eines Tags: Schätzung über die Länge des Jahres 0, dann Klammer-
  // Aufweitung und Binärsuche (Muster findYear des Kerns).
  const yearOfDay = (day) => {
    const len0 = yearInfo(0n);
    if (!len0) return null;
    let lo = floorDiv(day - len0.start, len0.length);
    let step = 1n;
    while (startOf(lo) > day) {
      lo -= step;
      step *= 2n;
    }
    let hi = lo;
    step = 1n;
    while (startOf(hi + 1n) <= day) {
      hi += step;
      step *= 2n;
    }
    while (lo < hi) {
      const mid = floorDiv(lo + hi + 1n, 2n);
      if (startOf(mid) <= day) lo = mid;
      else hi = mid - 1n;
    }
    return lo;
  };
  return {
    kind: 'rule',
    name: rule.name,
    namensStellen: rule.namensStellen,
    range: null,
    yearInfo,
    yearOfDay,
    maxMonths: isPosInt(rule.hoechstMonate) ? rule.hoechstMonate : rule.namensStellen,
    maxLength: isPosInt(rule.hoechstLaenge) ? rule.hoechstLaenge : 99,
  };
}

// --- Liste der Quellen und Auflösung --------------------------------------------------

function isKnownSourceName(kind, name) {
  const list = kind === 'rule' ? activeSources.rules : activeSources.tables;
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(list, name);
}

// Quelle zu einer normalisierten Jahres-Beziehung { type: 'yearly', rule } bzw.
// { type: 'yearly', table }; null bei unbekanntem Namen oder unlesbarer Quelle.
function resolveYearlySource(rel) {
  if (!rel || rel.type !== 'yearly') return null;
  const kind = typeof rel.rule === 'string' ? 'rule' : 'table';
  const name = kind === 'rule' ? rel.rule : rel.table;
  if (!isKnownSourceName(kind, name)) return null;
  const mod = (kind === 'rule' ? activeSources.rules : activeSources.tables)[name];
  if (!mod || typeof mod !== 'object') return null;
  let prepared = PREPARED.get(mod);
  if (prepared === undefined) {
    if (kind === 'rule') {
      prepared = prepareRule(mod);
    } else {
      const table = readYearTable(mod);
      prepared = table ? prepareTable(table) : null;
    }
    PREPARED.set(mod, prepared);
  }
  // Eine Tafel trägt ihren Namen im Kopf; er muss zum Verweis passen.
  if (prepared && kind === 'table' && prepared.name !== name) return null;
  return prepared;
}

// --- Einlesen und Aufbau (Schritt 3; Weichen im Kern) ----------------------------------

// Normalisiert eine Beziehung der beiden neuen Arten; undefined für jede andere
// Art (der Kern liest sie wie bisher), null bei einem Verstoß. Die Jahres-
// Beziehung trägt genau eines von rule und table, und der Name muss eine
// lesbare Quelle der geltenden Liste nennen (Aufbau-Regel 4). Gespeichert wird
// die Angabe wörtlich (Rundlauf).
function normalizeYearlyRel(raw) {
  if (raw.type === 'byYear') return { type: 'byYear' };
  if (raw.type !== 'yearly') return undefined;
  const hasRule = typeof raw.rule === 'string' && raw.rule !== '';
  const hasTable = typeof raw.table === 'string' && raw.table !== '';
  if (hasRule === hasTable) return null;
  const rel = hasRule ? { type: 'yearly', rule: raw.rule } : { type: 'yearly', table: raw.table };
  return resolveYearlySource(rel) ? rel : null;
}

// Aufbau-Regeln 1 bis 3 über einer Wirbelsäule (kleinste Ebene zuerst, Ebene 0
// ohne Beziehung): Ohne die beiden Arten true. Mit ihnen steht die Jahres-
// Beziehung an der obersten Ebene, die Monats-Beziehung direkt darunter, unter
// dem Monat mindestens eine Ebene, und alle übrigen Ebenen sind Faktor-Ebenen
// (also weder Längen-Tabelle noch Schalt-Regel).
function checkYearlyLevels(levels) {
  const isNew = (lv) => lv.rel && (lv.rel.type === 'yearly' || lv.rel.type === 'byYear');
  if (!levels.some(isNew)) return true;
  const top = levels.length - 1;
  if (top < 2 || levels[top].rel.type !== 'yearly' || levels[top - 1].rel.type !== 'byYear') {
    return false;
  }
  for (let i = 1; i < top - 1; i++) if (levels[i].rel.type !== 'factor') return false;
  return true;
}

// Trägt die oberste Ebene einer (normalisierten) Wirbelsäule die Jahres-Struktur?
function hasYearly(levels) {
  const rel = levels[levels.length - 1].rel;
  return Boolean(rel && rel.type === 'yearly');
}

// Zahl der Positionen der Ebene i einer Wirbelsäule mit Jahres-Struktur für die
// Namens-Listen (levelPositionCount des Kerns): unter der Jahres-Beziehung die
// Namens-Stellen der Quelle, unter der Monats-Beziehung und an der obersten
// Ebene keine feste Zahl (null), sonst der feste Faktor der Ebene darüber.
function yearlyPositionCount(levels, i) {
  const parent = levels[i + 1];
  if (!parent || parent.rel.type === 'byYear') return null;
  if (parent.rel.type !== 'yearly') return parent.rel.count;
  const source = resolveYearlySource(parent.rel);
  return source ? source.namensStellen : null;
}

// Rechen-Daten einer Zeitrechnung mit Jahres-Struktur für das Kompilat:
// undefined ohne Jahres-Struktur, null bei nicht auflösbarer Quelle, sonst
// { source, iMonth, iDay } (Monats-Ebene und die Ebene, in deren Einheiten
// die Monatslängen zählen).
function compileYearly(levels) {
  const top = levels.length - 1;
  if (!levels[top].rel || levels[top].rel.type !== 'yearly') return undefined;
  const source = resolveYearlySource(levels[top].rel);
  return source ? { source, iMonth: top - 1, iDay: top - 2 } : null;
}

// Größter Anzeige-Umfang der Ebene i für die Stellen-Breite der kanonischen
// Form (parentRel: Beziehung der Ebene darüber): Monate je Jahr unter der
// Jahres-, Tage je Monat unter der Monats-Beziehung; sonst wie bisher im Kern
// die längste Zeile einer Längen-Tabelle oder der feste Faktor.
function yearlyWidthCount(yearly, i, parentRel) {
  if (yearly && i === yearly.iMonth) return yearly.source.maxMonths;
  if (yearly && i === yearly.iDay) return yearly.source.maxLength;
  return parentRel.type === 'lengths' ? Math.max(...parentRel.table) : parentRel.count;
}

// --- Rechnen zwischen Datum und Achse (Schritte 4 und 5; Weichen im Kern) ---------------
// c ist das Kompilat des Kerns (levels, top, unitLen, yearly); Tupel in der
// Konvention des Kerns (größte Ebene zuerst, das Monats-Segment ist die Stelle
// im Jahr in Anzeige-Nummerierung). Die Achse zählt in Einheiten der kleinsten
// Ebene ab dem 01.01. des gregorianischen Jahres 0; gerechnet wird ganzzahlig.

// Liegt das Jahr eines Tupels im Geltungs-Zeitraum der Quelle?
function yearlyKnown(c, year) {
  return isInt(year) && c.yearly.source.yearInfo(BigInt(year)) !== null;
}

// Zahl der Positionen einer Ebene im Kontext des Tupels (positionCount des
// Kerns): Monate des Jahres, Länge des Monats, sonst der feste Faktor der
// Ebene darüber; 0 außerhalb des Zeitraums.
function yearlyPositionCountAt(c, levelIdx, tuple) {
  const y = c.yearly;
  if (levelIdx !== y.iMonth && levelIdx !== y.iDay) return c.levels[levelIdx + 1].rel.count;
  const info = isInt(tuple[0]) ? y.source.yearInfo(BigInt(tuple[0])) : null;
  if (!info) return 0;
  if (levelIdx === y.iMonth) return info.months.length;
  const month = info.months[tuple[c.top - y.iMonth] - c.levels[y.iMonth].start];
  return month ? month.length : 0;
}

// Datum → Achse: (Jahresbeginn − Ursprung + Tage der Vormonate) × Tages-
// Einheit + Rest. Außerhalb des Zeitraums einer Tafel gibt es kein Datum; die
// geprüften Wege (tupleToAxis, validateTuple) lassen ein solches Tupel nie
// hierher. Ungeprüft erreichen es allein Zeitalter-Grenzen, die nach T8
// (Fortschreibung vom 2026-10-23) auf einem Jahresbeginn vor oder nach dem
// Zeitraum liegen dürfen: Sie bekommen eine Ersatz-Stelle knapp vor dem ersten
// beziehungsweise ab dem Ende des Zeitraums, um den Abstand in Jahren
// gestaffelt. Jeder Tag des Zeitraums vergleicht sich mit ihnen damit wie mit
// der echten Grenze, und zwei solche Grenzen bleiben verschieden und geordnet.
function yearlyTupleToAxis(c, tuple) {
  const y = c.yearly;
  const info = y.source.yearInfo(BigInt(tuple[0]));
  if (!info) return outsideBoundaryAxis(c, tuple[0]);
  const monthPos = tuple[c.top - y.iMonth] - c.levels[y.iMonth].start;
  let day = info.start - YEARLY_AXIS_ORIGIN;
  for (let k = 0; k < monthPos; k++) day += BigInt(info.months[k].length);
  let axis = day * c.unitLen[y.iDay];
  for (let i = y.iDay; i >= 0; i--) {
    axis += BigInt(tuple[c.top - i] - c.levels[i].start) * c.unitLen[i];
  }
  return axis;
}

// Ersatz-Stelle einer Zeitalter-Grenze außerhalb des Zeitraums (siehe oben).
function outsideBoundaryAxis(c, year) {
  const range = c.yearly.source.range;
  if (!range) return null;
  const unit = c.unitLen[c.yearly.iDay];
  if (year < range.firstYear) {
    return (range.firstDay - YEARLY_AXIS_ORIGIN) * unit - BigInt(range.firstYear - year);
  }
  return (range.endDay - YEARLY_AXIS_ORIGIN) * unit + BigInt(year - range.lastYear);
}

// Achse → Datum: Tag → Jahr über die Quelle, Monat über die Monatslängen, Rest
// über die festen Faktoren; null außerhalb des Zeitraums oder wenn das Jahr
// ±2^53 verließe (Muster axisToTuple des Kerns).
function yearlyAxisToTuple(c, axis) {
  const y = c.yearly;
  const unit = c.unitLen[y.iDay];
  const days = floorDiv(axis, unit);
  let rem = axis - days * unit;
  const day = days + YEARLY_AXIS_ORIGIN;
  const year = y.source.yearOfDay(day);
  if (year === null || !isInt(Number(year))) return null;
  const info = y.source.yearInfo(year);
  let offset = day - info.start;
  let m = 0;
  while (offset >= BigInt(info.months[m].length)) offset -= BigInt(info.months[m++].length);
  const segs = new Array(c.levels.length);
  segs[0] = Number(year);
  segs[c.top - y.iMonth] = m + c.levels[y.iMonth].start;
  segs[c.top - y.iDay] = Number(offset) + c.levels[y.iDay].start;
  for (let i = y.iDay - 1; i >= 0; i--) {
    const p = floorDiv(rem, c.unitLen[i]);
    rem -= p * c.unitLen[i];
    segs[c.top - i] = Number(p) + c.levels[i].start;
  }
  return segs;
}

// Wertebereich der Jahres-Ebene für die Eingabe-Hilfe: der Zeitraum einer
// Tafel, sonst der Bereich des Kerns (±maxSafe).
function yearlyYearRange(c, maxSafe) {
  const range = c.yearly && c.yearly.source.range;
  return range ? { min: range.firstYear, max: range.lastYear } : { min: -maxSafe, max: maxSafe };
}

// --- Bezugspunkt, Zeitalter, Wochen, Umrechnung (Schritt 6) ---------------------------

// Datums-Segmente des Startpunkts einer Zeitrechnung ohne Anker-Datum (T9):
// der erste Tag des Zeitraums einer Tafel; bei einer Regel ohne Grenze der
// Tag am Ursprung der eigenen Achse (01.01. des gregorianischen Jahres 0),
// derselbe Tag, auf dem die Vorlagen der ersten Stufe ihren Anker haben.
// null ohne Jahres-Struktur.
function yearlyStartSegs(c) {
  if (!c.yearly) return null;
  const range = c.yearly.source.range;
  if (range) {
    const segs = [range.firstYear];
    for (let k = 1; k < c.dateCount; k++) segs.push(c.levels[c.top - k].start);
    return segs;
  }
  const t = yearlyAxisToTuple(c, 0n);
  return t ? t.slice(0, c.dateCount) : null;
}

// Zeitalter-Grenze außerhalb des Zeitraums einer Tafel (T8): zulässig, wenn
// sie auf einem Jahresbeginn liegt; Kopie der Datums-Segmente oder null.
function yearlyOutsideYearStart(c, raw) {
  if (!c.yearly || !c.yearly.source.range) return null;
  if (!Array.isArray(raw) || raw.length !== c.dateCount || !raw.every(isInt)) return null;
  if (yearlyKnown(c, raw[0])) return null;
  for (let k = 1; k < raw.length; k++) if (raw[k] !== c.levels[c.top - k].start) return null;
  return raw.slice();
}

// Fehler-Code der Umrechnung, wenn das Ziel keinen Tag liefert: «nicht
// bekannt» (unknown) bei einer Tafel, sonst wie bisher outOfRange (±2^53).
function missingDateCode(c) {
  return c.yearly && c.yearly.source.range ? 'unknown' : 'outOfRange';
}

// --- Schreibweise des Monats nach B1 (Schritt 7; Weichen im Kern) -----------------------
// Ein Kalender-Wert nennt den Monat einer Zeitrechnung mit Jahres-Struktur mit
// seiner festen Kennung, nicht mit der Stelle im Jahr: Jeder Monat behält in
// jedem Jahr seine Zahl, ein Schaltmonat trägt die Zahl des Monats, dem er
// folgt, und ein nachgestelltes L («05L» ist der Schaltmonat nach dem 5.
// Monat). Vorbild ist die Monats-Kennung von TC39 «Temporal» (M05L). Das Tupel
// führt intern weiter die Stelle im Jahr; übersetzt wird allein beim Schreiben
// und Lesen der kanonischen Form. Die Zahl folgt der Anzeige-Nummerierung der
// Monats-Ebene (start).

// Monats-Teil der kanonischen Form: mit named der Name an der Namens-Stelle
// des Monats (fehlt er, die Kennung), sonst die Kennung; undefined für jede
// andere Ebene und ohne Jahres-Struktur.
function yearlyMonthPart(c, levelIdx, tuple, named) {
  const y = c.yearly;
  if (!y || levelIdx !== y.iMonth) return undefined;
  const level = c.levels[y.iMonth];
  const month = y.source.yearInfo(BigInt(tuple[0])).months[tuple[c.top - y.iMonth] - level.start];
  const name = named && level.names ? level.names[month.slot] : null;
  if (name != null) return name;
  const zahl = month.number - 1 + level.start;
  return String(zahl).padStart(c.widths[y.iMonth], '0') + (month.leap ? 'L' : '');
}

// Entfernt beim Lesen ein nachgestelltes L am Monats-Teil (dateParts[1], in
// place) und meldet, ob es da war; ohne Jahres-Struktur false.
function yearlyTakeLeapMark(c, dateParts) {
  if (!c.yearly || !/^\d+L$/.test(dateParts[1] || '')) return false;
  dateParts[1] = dateParts[1].slice(0, -1);
  return true;
}

// Übersetzt im gelesenen Tupel die Monats-Kennung (Zahl und Schalt-Merkmal) in
// die Stelle im Jahr; null bei Erfolg, sonst der Fehler der Gültigkeits-
// Prüfung: unknown außerhalb des Zeitraums, segmentRange für einen Monat, den
// es in diesem Jahr nicht gibt (etwa «05L» in einem Jahr ohne Schaltmonat).
function yearlyCodeToPosition(c, tuple, leap) {
  const y = c.yearly;
  if (!yearlyKnown(c, tuple[0])) return { ok: false, code: 'unknown' };
  const level = c.levels[y.iMonth];
  const number = tuple[c.top - y.iMonth] - level.start + 1;
  const months = y.source.yearInfo(BigInt(tuple[0])).months;
  const pos = months.findIndex((m) => m.number === number && m.leap === leap);
  if (pos < 0) return { ok: false, code: 'segmentRange', levelId: level.id };
  tuple[c.top - y.iMonth] = pos + level.start;
  return null;
}

// Prüf-Zugang: hängt Proben-Regeln und -Tafeln anstelle der Liste des
// Programms ein; null stellt die Liste des Programms wieder her. Allein für
// Prüfungen — das Programm ruft ihn nie auf.
function setYearlySourcesForTests(sources) {
  if (sources == null) {
    activeSources = PROGRAM_SOURCES;
    return;
  }
  activeSources = {
    rules: { ...(sources.rules || {}) },
    tables: { ...(sources.tables || {}) },
  };
}

// Namen der Regeln und Tafeln, die gerade gelten (Auskunft für Einstellungen
// und Prüfungen).
function yearlySourceNames() {
  return {
    rules: Object.keys(activeSources.rules),
    tables: Object.keys(activeSources.tables),
  };
}

module.exports = {
  YEARLY_AXIS_ORIGIN,
  readYearTable,
  resolveYearlySource,
  isKnownSourceName,
  yearlySourceNames,
  setYearlySourcesForTests,
  // Schritt 3: Weichen des Kerns für Einlesen, Aufbau und Kompilat.
  normalizeYearlyRel,
  checkYearlyLevels,
  hasYearly,
  yearlyPositionCount,
  compileYearly,
  yearlyWidthCount,
  // Schritte 4 und 5: Weichen des Kerns für das Rechnen.
  yearlyKnown,
  yearlyPositionCountAt,
  yearlyTupleToAxis,
  yearlyAxisToTuple,
  yearlyYearRange,
  // Schritt 6: Bezugspunkt, Zeitalter, Wochen, Umrechnung.
  yearlyStartSegs,
  yearlyOutsideYearStart,
  missingDateCode,
  // Schritt 7: Schreibweise des Monats nach B1.
  yearlyMonthPart,
  yearlyTakeLeapMark,
  yearlyCodeToPosition,
};
