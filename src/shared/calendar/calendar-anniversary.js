// 4T-002445 (Epic 3E-000377): Jahrestags-Regeln einer abgeleiteten Zeitrechnung
// auf einer Zeitrechnung mit Jahres-Struktur je Jahr (calendar-yearly.js).
// Prozess-neutral und blattartig: Das Modul lädt nichts; calendar-yearly.js
// lädt es, um aus einer aufbereiteten Bezugs-Quelle die abgeleitete Quelle zu
// bauen, der Kern für die Weichen der Zählung (absAt, tupleFromAbs,
// totalAtLevel) und der Konfigurations-Rand (calendar-config.js) für die
// Regel-Namen. Die Weichen rechnen allein mit dem Kompilat und seiner Quelle.
//
// Weg (b) des Tasks: Die Ableitung bleibt eine vollwertige Definition, deren
// Jahres-Ebene statt einer gedrehten Längen-Tabelle eine abgeleitete Quelle
// nennt. Diese liefert je gezähltem Jahr Y — dem Jahr, dessen Jahrestag im
// Bezugs-Jahr Y liegt — die Monatsfolge in derselben Form wie jede Regel oder
// Tafel ({ start, length, months: [{ length, slot, number, leap }] }), sodass
// Umrechnung, Gültigkeit, Eingabe-Hilfe und «nicht bekannt» ohne Sonderweg
// über den Baustein laufen.
//
// Regel an jeder Monatsgrenze (J0): Jeder gezählte Monat gehört zu genau einem
// Monat des Bezugs und beginnt an dem Tag, den die Regel für den Tag D des
// Nullpunkts in diesem Monat nennt. Der Jahrestag ist der Beginn des Monats,
// auf den die Regel den Monat des Nullpunkts im Zieljahr abbildet; das Jahr
// des Nullpunkts beginnt am Nullpunkt selbst.
//
// Regeln je Quelle:
//   hebrew, «Jahrestag» (anniversary)   Geburtstags-Regel des Referenzwerks
//                                        «Calendrical Calculations» (J1):
//                                        Adar (06) bleibt 06, Adar I (05L)
//                                        fällt im Gemeinjahr in den Adar;
//                                        ein fehlender 30. läuft auf den 1.
//                                        des Folgemonats über.
//   hebrew, «Jahrzeit (aschkenasisch)»   Jahrzeit-Regel (J1): Adar des
//          (yahrzeit)                    Gemeinjahrs fällt im Schaltjahr in den
//                                        Adar I, Adar II bleibt 06, der 30.
//                                        Adar I fällt im Gemeinjahr auf den 30.
//                                        Schevat; fehlte der 30. Cheschwan oder
//                                        Kislew schon im ersten Jahr nach dem
//                                        Nullpunkt, gilt in jedem Jahr der letzte
//                                        Tag dieses Monats (29. oder 30., nach
//                                        dem Referenzwerk, J1a vom 2026-10-30);
//                                        sonst Überlauf wie beim Jahrestag.
//   jede andere Quelle                   Regel des JavaScript-Standards «Intl
//                                        era and monthCode» (J2 bis J4):
//                                        Monat gleicher Kennung, fehlt ein
//                                        Schaltmonat, der Monat gleicher Zahl
//                                        (§4.1.6 «skip-backward»), fehlt der
//                                        Tag, der letzte des Monats (§4.1.20).
//                                        Das ist die Regel der Tafeln chinese
//                                        (J2), persian (J3) und
//                                        islamic-umalqura (J4); eine Proben-
//                                        Quelle der Prüfungen rechnet ebenso,
//                                        und fehlt ihr auch der Monat gleicher
//                                        Zahl, gilt der nächste frühere.
//
// Lesart von J0 bei der Jahrzeit (Schritt 1 des Tasks): Die Zweige zum 30.
// Cheschwan und 30. Kislew greifen an jeder Monatsgrenze im Cheschwan
// beziehungsweise Kislew, mit der Bedingung des ersten Jahres nach dem
// Nullpunkt (Jahr des Nullpunkts plus eins); der Zweig zum 30. Adar I greift
// allein am Jahrestag, weil es den Adar I an einer Monatsgrenze nur in
// Schaltjahren gibt.
'use strict';

const ANNIVERSARY_RULES = Object.freeze(['anniversary', 'yahrzeit']);

function isInt(v) {
  return Number.isSafeInteger(v);
}

function floorDiv(a, b) {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

// Gespeicherte Regel einer Ableitung: «yahrzeit» nur bei genau diesem Wert,
// sonst die Vorgabe «anniversary» (auch bei fehlendem oder unbekanntem Wert).
function normalizeAnniversaryRule(value) {
  return value === 'yahrzeit' ? 'yahrzeit' : 'anniversary';
}

function findMonth(months, number, leap) {
  return months.findIndex((m) => m.number === number && m.leap === leap);
}

// Beginn des Monats idx eines Jahres (Tag der Rata-Die-Zählung).
function monthStart(info, idx) {
  let day = info.start;
  for (let k = 0; k < idx; k++) day += BigInt(info.months[k].length);
  return day;
}

// --- Regeln je Quelle --------------------------------------------------------------
// Jede Regel liefert zwei Funktionen: target(info) → Stelle des Monats, auf den
// der Monat des Nullpunkts im Zieljahr fällt; day(info, idx) → Beginn des
// gezählten Monats zum Monat idx des Bezugs (Tag der Rata-Die-Zählung).

function genericRule(zero) {
  return {
    target(info) {
      let idx = findMonth(info.months, zero.number, zero.leap);
      if (idx < 0 && zero.leap) idx = findMonth(info.months, zero.number, false);
      if (idx < 0) {
        idx = 0;
        info.months.forEach((m, k) => {
          if (!m.leap && m.number <= zero.number) idx = k;
        });
      }
      return idx;
    },
    day(info, idx) {
      return monthStart(info, idx) + BigInt(Math.min(zero.d, info.months[idx].length) - 1);
    },
  };
}

// Hebräische Monats-Kennungen der Regel calendar-rule-hebrew.js.
const HEBREW_CHESHVAN = 2;
const HEBREW_KISLEV = 3;
const HEBREW_SHEVAT = 5;
const HEBREW_ADAR = 6;

function hebrewRule(zero, base, rule) {
  const isLeapYear = (info) => info.months.some((m) => m.leap);
  // Jahrzeit: Bedingung des ersten Jahres nach dem Nullpunkt.
  const after = base.yearInfo(zero.year + 1n);
  const lengthAfter = (number) => {
    const idx = after ? findMonth(after.months, number, false) : -1;
    return idx < 0 ? null : after.months[idx].length;
  };
  const short29 = new Set();
  if (rule === 'yahrzeit' && zero.d === 30) {
    if (lengthAfter(HEBREW_CHESHVAN) === 29) short29.add(HEBREW_CHESHVAN);
    if (lengthAfter(HEBREW_KISLEV) === 29) short29.add(HEBREW_KISLEV);
  }
  const adarOfCommonYear = zero.number === HEBREW_ADAR && !zero.leap && !zero.inLeapYear;
  return {
    target(info) {
      const leap = isLeapYear(info);
      if (zero.leap) {
        if (leap) return findMonth(info.months, HEBREW_SHEVAT, true);
        // 30. Adar I im Gemeinjahr: Jahrzeit 30. Schevat, Jahrestag Adar (Überlauf).
        if (rule === 'yahrzeit' && zero.d === 30)
          return findMonth(info.months, HEBREW_SHEVAT, false);
        return findMonth(info.months, HEBREW_ADAR, false);
      }
      if (rule === 'yahrzeit' && adarOfCommonYear && leap) {
        return findMonth(info.months, HEBREW_SHEVAT, true);
      }
      return findMonth(info.months, zero.number, false);
    },
    day(info, idx) {
      const m = info.months[idx];
      // J1a: Fehlte der 30. im ersten Jahr, gilt der letzte Tag des Monats im
      // Zieljahr (der Tag vor dem 1. des Folgemonats im Referenzwerk).
      const d = !m.leap && short29.has(m.number) ? m.length : zero.d;
      // Sonst ohne Klemmung: Ein fehlender 30. läuft auf den 1. des Folgemonats über.
      return monthStart(info, idx) + BigInt(d - 1);
    },
  };
}

// --- Abgeleitete Quelle --------------------------------------------------------------

// Abgeleitete Quelle aus einer aufbereiteten Bezugs-Quelle (Schnittstelle
// prepareTable/prepareRule in calendar-yearly.js) und der Angabe
// { zeroDay (BigInt, Rata Die des Nullpunkts), rule, hebrew (Regel hebrew des
// Bezugs) }; null, wenn der Nullpunkt außerhalb des Zeitraums liegt.
// Zusätzlich zur Schnittstelle der Quellen: zeroYear (BigInt) und
// monthsBefore(Y), die Zahl der gezählten Monate vor dem Jahr Y ab dem
// Nullpunkt (negativ davor; null außerhalb).
function prepareDerivedSource(base, spec) {
  const zeroYear = base.yearOfDay(spec.zeroDay);
  if (zeroYear === null) return null;
  const zeroInfo = base.yearInfo(zeroYear);
  let zeroIdx = 0;
  while (
    spec.zeroDay >= monthStart(zeroInfo, zeroIdx + 1) &&
    zeroIdx + 1 < zeroInfo.months.length
  ) {
    zeroIdx++;
  }
  const zm = zeroInfo.months[zeroIdx];
  const zero = {
    year: zeroYear,
    idx: zeroIdx,
    number: zm.number,
    leap: zm.leap,
    d: Number(spec.zeroDay - monthStart(zeroInfo, zeroIdx)) + 1,
    inLeapYear: zeroInfo.months.some((m) => m.leap),
  };
  const rule = spec.hebrew ? hebrewRule(zero, base, spec.rule) : genericRule(zero);
  const endDay = base.range ? base.range.endDay : null;

  // Jahrestag im Bezugs-Jahr Y: { info, idx, day } oder null außerhalb.
  const anniversaryCache = new Map();
  const anniversaryIn = (Y) => {
    const key = String(Y);
    if (anniversaryCache.has(key)) return anniversaryCache.get(key);
    const info = base.yearInfo(Y);
    let out = null;
    if (info && Y === zeroYear) out = { info, idx: zero.idx, day: spec.zeroDay };
    else if (info) {
      const idx = rule.target(info);
      out = idx < 0 ? null : { info, idx, day: rule.day(info, idx) };
    }
    if (out && endDay !== null && out.day >= endDay) out = null;
    if (anniversaryCache.size > 4096) anniversaryCache.clear();
    anniversaryCache.set(key, out);
    return out;
  };

  const yearCache = new Map();
  const yearInfo = (year) => {
    const Y = typeof year === 'bigint' ? year : BigInt(year);
    const key = String(Y);
    if (yearCache.has(key)) return yearCache.get(key);
    const first = anniversaryIn(Y);
    const next = first ? anniversaryIn(Y + 1n) : null;
    // Ohne Jahrestag des Folgejahrs (Ende einer Tafel) endet das Jahr mit dem
    // Zeitraum; jenseits davon ist ein Tag «nicht bekannt».
    const end = next ? next.day : endDay;
    let info = null;
    if (first && end !== null) {
      const starts = [first.day];
      const slots = [first.info.months[first.idx].slot];
      let cur = first.info;
      let idx = first.idx;
      for (;;) {
        idx += 1;
        if (idx >= cur.months.length) {
          cur = base.yearInfo(cur.year + 1n);
          idx = 0;
          if (!cur) break;
        }
        if (next && cur.year === next.info.year && idx === next.idx) break;
        const day = rule.day(cur, idx);
        if (day >= end) break;
        starts.push(day);
        slots.push(cur.months[idx].slot);
      }
      starts.push(end);
      const months = slots.map((slot, j) => ({
        length: Number(starts[j + 1] - starts[j]),
        slot,
        number: j + 1,
        leap: false,
      }));
      info = { year: Y, start: first.day, length: end - first.day, months };
    }
    if (yearCache.size > 4096) yearCache.clear();
    yearCache.set(key, info);
    return info;
  };

  // Jahr eines Tags: das Bezugs-Jahr des Tags oder das davor, wenn der Tag vor
  // dem Jahrestag liegt.
  const yearOfDay = (day) => {
    const y = base.yearOfDay(day);
    if (y === null) return null;
    for (let Y = y; Y >= y - 2n; Y--) {
      const info = yearInfo(Y);
      if (!info) return null;
      if (day >= info.start) return day < info.start + info.length ? Y : null;
    }
    return null;
  };

  // Stelle des Jahrestags in der fortlaufenden Monats-Zählung des Bezugs.
  const absoluteIndex = (Y) => {
    const a = anniversaryIn(Y);
    const before = a ? base.monthsBefore(Y) : null;
    return before === null ? null : before + BigInt(a.idx);
  };
  const zeroIndex = absoluteIndex(zeroYear);
  const monthsBefore = (year) => {
    const at = absoluteIndex(typeof year === 'bigint' ? year : BigInt(year));
    return at === null ? null : at - zeroIndex;
  };

  const first = base.range ? anniversaryIn(BigInt(base.range.firstYear)) : null;
  return {
    kind: 'derived',
    name: base.name,
    namensStellen: base.namensStellen,
    range: base.range
      ? {
          firstYear: base.range.firstYear,
          lastYear: base.range.lastYear,
          firstDay: first ? first.day : base.range.firstDay,
          endDay: base.range.endDay,
        }
      : null,
    yearInfo,
    yearOfDay,
    monthsBefore,
    zeroYear,
    // Ein gezähltes Jahr kann einen Monat mehr als das Bezugs-Jahr und einen
    // Monat bis einen Tag länger als der längste des Bezugs haben.
    maxMonths: base.maxMonths + 1,
    maxLength: base.maxLength + 1,
  };
}

// --- Zählung abgeleiteter Zeitrechnungen (Weichen im Kern) ------------------------
// Die Zeitspanne einer Ableitung zählt volle Jahre und Monate über den
// absoluten Index einer Instanz (absAt, tupleFromAbs, totalAtLevel des Kerns).
// Bei Jahres-Struktur hat ein Jahr keine feste Zahl von Monaten; der Index des
// Monats kommt deshalb aus der Quelle (monthsBefore). Gebraucht werden allein
// die Jahres- und die Monats-Ebene; jede andere ist ein Fehler des Aufrufers.

function checkSpanLevel(c, levelIdx) {
  if (levelIdx !== c.top && levelIdx !== c.yearly.iMonth) {
    throw new TypeError(`Jahres-Struktur: kein absoluter Index für die Ebene ${levelIdx}`);
  }
}

// Absoluter Index der Jahres- oder Monats-Instanz eines gültigen Tupels.
function yearlyAbsAt(c, levelIdx, tuple) {
  checkSpanLevel(c, levelIdx);
  const year = BigInt(tuple[0]);
  if (levelIdx === c.top) return year;
  const before = c.yearly.source.monthsBefore(year);
  if (before === null) throw new TypeError(`Jahres-Struktur: Jahr ${year} nicht bekannt`);
  return before + BigInt(tuple[c.top - levelIdx] - c.levels[levelIdx].start);
}

// Monate bis zum Ende des Jahres Y (auch eines am Ende einer Tafel gekürzten).
function monthsUntilEnd(source, Y) {
  const next = source.monthsBefore(Y + 1n);
  if (next !== null) return next;
  const before = source.monthsBefore(Y);
  const info = source.yearInfo(Y);
  return before === null || !info ? null : before + BigInt(info.months.length);
}

// Jahr, in dem der Monat mit dem absoluten Index abs liegt; null außerhalb.
function yearOfMonthIndex(source, abs) {
  const contains = (Y) => {
    const before = source.monthsBefore(Y);
    const end = monthsUntilEnd(source, Y);
    if (before === null || end === null) return null;
    return abs < before ? -1 : abs >= end ? 1 : 0;
  };
  let lo;
  let hi;
  if (source.range) {
    lo = BigInt(source.range.firstYear);
    hi = BigInt(source.range.lastYear);
    if (contains(lo) === -1 || contains(hi) === 1) return null;
  } else {
    // Klammer-Aufweitung ab dem Nullpunkt (Muster findYear des Kerns).
    lo = source.zeroYear !== undefined ? source.zeroYear : 0n;
    let step = 1n;
    while (contains(lo) === -1) {
      lo -= step;
      step *= 2n;
    }
    hi = lo;
    step = 1n;
    while (contains(hi) === 1) {
      hi += step;
      step *= 2n;
    }
  }
  while (lo < hi) {
    const mid = floorDiv(lo + hi, 2n);
    const at = contains(mid);
    if (at === null) return null;
    if (at === 0) return mid;
    if (at < 0) hi = mid - 1n;
    else lo = mid + 1n;
  }
  return contains(lo) === 0 ? lo : null;
}

// Tupel aus dem absoluten Index der Ebene (untere Segmente in Start-Stellung);
// Gegenstück zu yearlyAbsAt, null außerhalb oder jenseits von ±2^53.
function yearlyTupleFromAbs(c, levelIdx, abs) {
  checkSpanLevel(c, levelIdx);
  const segs = new Array(c.levels.length);
  for (let i = 0; i < c.top; i++) segs[c.top - i] = c.levels[i].start;
  let year = abs;
  if (levelIdx !== c.top) {
    year = yearOfMonthIndex(c.yearly.source, abs);
    if (year === null) return null;
    const pos = abs - c.yearly.source.monthsBefore(year);
    segs[c.top - levelIdx] = Number(pos) + c.levels[levelIdx].start;
  }
  if (!isInt(Number(year))) return null;
  segs[0] = Number(year);
  return segs;
}

// Zahl voller Einheiten der Ebene seit dem Nullpunkt aus der Zerlegung der
// Zeitspanne (spanParts des Kerns): die vollen Jahre, bei der Monats-Ebene die
// Monate dieser Jahre in der Richtung der Zählung plus die übrigen Monate.
function yearlyTotalAt(c, parts, levelIdx) {
  checkSpanLevel(c, levelIdx);
  const years = parts.counts.get(c.top) || 0;
  if (levelIdx === c.top) return years;
  const before = c.yearly.source.monthsBefore;
  const y0 = BigInt(parts.zeroYear);
  const span =
    parts.direction === 'after'
      ? before(y0 + BigInt(years)) - before(y0)
      : before(y0) - before(y0 - BigInt(years));
  return Number(span) + (parts.counts.get(levelIdx) || 0);
}

module.exports = {
  ANNIVERSARY_RULES,
  normalizeAnniversaryRule,
  prepareDerivedSource,
  // Weichen des Kerns für die Zählung (absAt, tupleFromAbs, totalAtLevel).
  yearlyAbsAt,
  yearlyTupleFromAbs,
  yearlyTotalAt,
};
