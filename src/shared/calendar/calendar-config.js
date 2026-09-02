// 4T-000995 (Epic 3E-000196): aus src/shared/calendar/calendar-core.js geschnitten.
// Konfigurations-Rand der Kalender-Sektion: Normalisierung der
// calendarSystems-Sektion, die Ableitung abgeleiteter Zeitrechnungen und
// die Persistenz-Form. Der Rechenkern selbst bleibt in calendar-core.js
// ungeteilt (Entscheidung E2 der Bestandsaufnahme 4T-000964).
//
// Import-Richtung: Dieses Modul laedt Kern und Vorlage, nie umgekehrt.
// compileSafe bleibt deshalb einmalig im Kern, und sein WeakMap-Cache
// bleibt eine einzige Instanz — eine Kopie der Funktion haette den Cache
// gedoppelt und Kompilate unbemerkt zweimal aufgebaut.
//
// Mitgewandert sind gegenueber dem Zuschnitt der Bestandsaufnahme drei
// Stuecke, die ohne einen Modul-Zyklus nicht im Kern bleiben konnten:
// STANDARD_CALENDAR_ID samt standardCalendar (baut die eingebaute
// Zeitrechnung aus Vorlage und Normalisierung, haengt also an beidem),
// baseCalendarOf (loest den Bezug einer Ableitung ueber standardCalendar
// auf) und rotateList (Helfer allein von deriveCalendar).
'use strict';

const {
  cleanString,
  isInt,
  isPosInt,
  compileSafe,
  validateTuple,
  timeStartSegs,
  tupleToAxisUnchecked,
  axisToTuple,
  normalizeNames,
  normalizeLevels,
  cycleAt,
} = require('./calendar-core.js');
const { createGregorianTemplate } = require('./calendar-template.js');

// --- Eingebaute Standard-Zeitrechnung und Bezugs-Aufloesung ---------------------------
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

// Bezugs-Zeitrechnung einer Ableitung: der Kalender des Blocks oder die
// eingebaute Standard-Zeitrechnung; null, wenn der Kalender keine Ableitung
// ist oder der Bezug fehlt.
function baseCalendarOf(block, cal) {
  if (!cal || !cal.derived) return null;
  if (cal.derived.fromId === STANDARD_CALENDAR_ID) return standardCalendar();
  if (!block || !Array.isArray(block.calendars)) return null;
  return block.calendars.find((c) => c && c.id === cal.derived.fromId && !c.derived) || null;
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
  // 4T-000746: Herkunfts-Angaben einer abgeleiteten Zeitrechnung; sie sind
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
// ids behalten den ersten Eintrag. Abgeleitete Zeitrechnungen (4T-000746)
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
// normalisierten Form abgelegt (Bestandsverhalten aus 4T-000543).
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

module.exports = {
  normalizeCalendarConfig,
  configForPersist,
  deriveCalendar,
  standardCalendar,
  baseCalendarOf,
  STANDARD_CALENDAR_ID,
};
