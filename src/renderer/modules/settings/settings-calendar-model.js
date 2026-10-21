// 4T-000544 (Epic 3E-000097): Datenmodell des Bereichs „Kalender-Systeme".
//
// Umrechnung zwischen Bereichsdatei und Entwurf, Persistenz-Form,
// Normalisierung über die Kern-API, Abhängigkeits-Ermittlung der
// abgeleiteten Zeitrechnungen und das Lesen der Bereichs-Konfiguration.
'use strict';

import {
  STANDARD_CALENDAR_ID,
  normalizeCalendarConfig,
  standardCalendar,
} from '../../../shared/calendar/calendar-config.js';
import { formatTuple } from '../../../shared/calendar/calendar-core.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { jsonEqual } from './settings-shared.js';

// Spiegelt applyCalendarSection (Persistenz-Form gegen den Snapshot;
// id-Vergabe entfällt wie bei den Journalen).
export function dirtyCalendarSection(draft) {
  const values = draft.calendar;
  if (!values || !values.hasArea) return false;
  return !jsonEqual(calendarConfigPersistForm(values), draft.calendarSnapshot);
}

// --- Bereich Kalender-Systeme (4T-000544, Epic 3E-000097) --------------------------
// Zweistufige Pflege der calendarSystems-Sektion der Bereichsdatei
// (Datenpfad aus 4T-000543): Übersicht = Blöcke, Detail = Kalender-Editoren
// des geöffneten Blocks. Struktur-Änderungen (Ebene/Zyklus/Epoche anlegen,
// entfernen, verschieben, Typ-Wechsel) rendern den Bereich neu (Muster
// Journale); Text-/Zahlen-Eingaben aktualisieren nur Hinweis und Vorschau.
// Validierung läuft ausschließlich über die Kern-Normalisierung: weich im
// Entwurf (Hinweis-Zeile pro Kalender), hart beim Anwenden (validate).

// Zahlen-Eingabe streng parsen (ganze Zahl, auch negativ); null = ungültig.
// 4T-002098 (Epic 3E-000323): Die Grenze ist dieselbe wie im Kern, der jede
// Zahl beim Einlesen über isInt/isPosInt prüft — eine sichere ganze Zahl
// (Number.isSafeInteger). Bis dahin ließ die Pflege höchstens 15 Ziffern zu;
// eine Definition mit sechzehnstelligem Wert (etwa einem Maßstab) lud der Kern
// und rechnete damit, die Pflege hielt sie für ungültig und sperrte damit das
// Anwenden der ganzen Einstellungs-Seite. Jenseits der sicheren Grenze bleibt
// die Eingabe ungültig: Dort wäre die Zahl nicht mehr genau darstellbar.
export function calSysInt(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

// Zeit-Teil-Länge der Entwurfs-Ebenen (Regel des Kerns: Präfix mit dem
// Ebenen-Bereich der kleinsten Ebene, sofern mehr als ein Bereich existiert).
function calSysTimeCount(levels) {
  if (levels.length === 0) return 0;
  const sec0 = String(levels[0].section || '').trim();
  let prefix = 0;
  while (prefix < levels.length && String(levels[prefix].section || '').trim() === sec0) prefix++;
  return prefix < levels.length ? prefix : 0;
}

// Datums-Ebenen des Entwurfs in Anzeige-Reihenfolge (größte zuerst) — die
// Beschriftungs- und Segment-Basis der Epochen-/Anker-Eingaben.
export function calSysDateLevels(levels) {
  return levels.slice(calSysTimeCount(levels)).reverse();
}

// Segment-Liste eines Entwurfs an eine Ziel-Länge angleichen (Ebenen-
// Änderungen ändern die Anzahl der Eingabe-Felder; Bestand bleibt erhalten).
export function calSysSyncSegs(segs, length) {
  const out = Array.isArray(segs) ? segs.slice(0, length) : [];
  while (out.length < length) out.push('');
  return out;
}

// Nächste freie laufende Kennung (ebene-1, zyklus-2, …) im Entwurf.
export function calSysNextId(prefix, taken) {
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

// Stabile Kennung aus dem Namen beim Anwenden (Muster journalIdFromName).
export function calSysIdFromName(name, fallback, taken) {
  const base =
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, '-')
      .replace(/^-+|-+$/g, '') || fallback;
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

// Normalisierten Kalender in die Entwurfs-Form bringen (bearbeitbare Kopien,
// Zahlen als Eingabe-Strings, 1-basierte Positionen für die UI).
// Kanonischer Wert des Nullpunkts einer abgeleiteten Zeitrechnung: alle
// groeberen Einheiten null, die kleinste Datums-Einheit 1 (4T-000747).
export function calSysZeroValue(segCount) {
  if (!segCount || segCount < 1) return '';
  return new Array(segCount)
    .fill('0')
    .fill('1', segCount - 1)
    .join('-');
}

// 4T-001863 (Epic 3E-000307): Mehrzahl eines Namens in der Ablage-Form — die
// Eigenschaft entsteht nur mit Inhalt, damit Definitionen ohne Mehrzahl beim
// Anwenden unverändert bleiben (Entwurf und Schnappschuss gleich).
function pluralOf(draftEntry) {
  const namePlural = String(draftEntry.namePlural || '').trim();
  return namePlural === '' ? {} : { namePlural };
}

// 4T-002066 (Epic 3E-000307): Durchgetragene Positions-Namen in der Ablage-
// Form; ein Entwurf ohne sie (etwa eine neu angelegte Ebene) bleibt ohne Feld.
function keptNamesOf(draftEntry) {
  const names = draftEntry.positionNames;
  // 4T-002205 (Epic 3E-000338): Eine unbenannte Position (im Modell null)
  // geht als leerer Name zurück, wie eine leere Zeile der Längen-Tabelle.
  return Array.isArray(names) && names.length > 0 ? { names: names.map((n) => n ?? '') } : {};
}

// 4T-002066 (Epic 3E-000307): Wechselt eine Ebene mit durchgetragenen
// Positions-Namen auf die Längen-Tabelle, werden die Namen zu deren Zeilen —
// die Zeilen sind dort die Quelle der Namen. Das geschieht nur bei leerer
// Tabelle: Dann ergibt sich die Zahl der Zeilen aus den Namen und passt. Eine
// Tabelle mit Zeilen (etwa aus einem früheren Wechsel) bleibt, wie sie ist;
// die Längen trägt der Anwender ein.
export function calSysTakeOverNames(level) {
  if (!level || level.relType !== 'lengths' || level.table.length > 0) return;
  const { names } = keptNamesOf(level);
  if (names) level.table = names.map((name) => ({ name, length: '' }));
}

// 4T-002001 (Epic 3E-000307): Regel-Teil einer Schalt-Ebene in der Ablage-Form
// — je nach Form genau eines der Felder rules oder pattern. Ein Entwurf ohne
// Form-Angabe (etwa eine neu angelegte Ebene) gilt als Teilbarkeits-Kette.
// Die Jahre des Musters dürfen mit Komma oder Leerzeichen getrennt sein;
// ungültige Einträge reichen als ungültige Werte durch, die Kern-
// Normalisierung lehnt die Zeitrechnung dann ab.
function calSysLeapRule(level) {
  if (level.leapMode !== 'pattern') {
    return { rules: level.leapRules.map((cycle) => ({ cycle: calSysInt(cycle) })) };
  }
  const years = String(level.leapPatternYears || '')
    .split(/[\s,]+/)
    .filter((s) => s !== '')
    .map((s) => calSysInt(s));
  return { pattern: { cycle: calSysInt(level.leapPatternCycle), years } };
}

// 4T-002204 (Epic 3E-000338): Durchläufe der Längen-Tabelle je Instanz als
// Eingabe-Text. Ein Entwurf ohne die Angabe (etwa eine neu angelegte Ebene)
// gilt als ein Durchlauf — die Vorbelegung des Feldes.
export function calSysLeapPassesText(level) {
  return level.leapPasses == null ? '1' : String(level.leapPasses);
}

// 4T-002204 (Epic 3E-000338): Zahl der Einheiten je Instanz einer Schalt-Ebene,
// so wie die Ablage-Form sie schreibt. Über einer Längen-Tabelle ist sie
// Durchläufe mal Zeilen: Der Kern verlangt ein Vielfaches der Zeilen-Zahl
// (calendar-core.js, normalizeLevels), und eine Definition mit zwei Durchläufen
// (etwa 24 Monate je Jahr) verlor beim Anwenden ohne Änderung bis dahin die
// Hälfte, weil die Pflege die Zahl stets auf die Zeilen-Zahl setzte. Über
// anderen Ebenen gilt die eingegebene Zahl. null = keine gültige Angabe.
export function calSysLeapCount(calDraft, levelIdx) {
  const level = calDraft.levels[levelIdx];
  const below = calDraft.levels[levelIdx - 1];
  if (!level) return null;
  if (below && below.relType === 'lengths') {
    const passes = calSysInt(calSysLeapPassesText(level));
    if (passes === null || passes < 1) return null;
    const count = passes * below.table.length;
    return Number.isSafeInteger(count) ? count : null;
  }
  return calSysInt(level.leapCount);
}

// 4T-002204 (Epic 3E-000338): Liegt das Schalt-Ziel einer Schalt-Ebene nicht
// innerhalb ihrer Positionen, nennt die Pflege genau diesen Grund (Kern-Regel:
// targetIndex kleiner als count, calendar-core.js, normalizeRel). Geliefert
// wird { target, count } oder null, wenn Ziel oder Zahl selbst keine gültige
// Angabe sind — dann bleibt es bei der allgemeinen Meldung «ungültig».
export function calSysLeapTargetOutside(calDraft, levelIdx) {
  const level = calDraft.levels ? calDraft.levels[levelIdx] : null;
  if (!level || levelIdx < 1 || level.relType !== 'leap') return null;
  const count = calSysLeapCount(calDraft, levelIdx);
  const target = calSysInt(level.leapTarget);
  if (count === null || count < 1 || target === null) return null;
  return target < 1 || target > count ? { target, count } : null;
}

// 4T-002204 (Epic 3E-000338): Erste Schalt-Ebene eines Entwurfs mit einem
// Schalt-Ziel außerhalb der Positionen (für die Meldung beim Anwenden).
export function calSysFirstLeapTargetOutside(calDraft) {
  if (!calDraft || calDraft.derived || !Array.isArray(calDraft.levels)) return null;
  for (let i = 1; i < calDraft.levels.length; i++) {
    const outside = calSysLeapTargetOutside(calDraft, i);
    if (outside) return outside;
  }
  return null;
}

// 4T-002204 (Epic 3E-000338): Zahl der Positionen einer Ebene mit
// Längen-Tabelle — so viele Einheiten fasst eine Instanz der Ebene darüber.
// Ohne Ebene darüber (oder ohne gültige Zahl dort) sind es die Zeilen.
function calSysLengthsPositions(calDraft, levelIdx) {
  const level = calDraft.levels[levelIdx];
  const above = calDraft.levels[levelIdx + 1];
  let positions = null;
  if (above && above.relType === 'leap') positions = calSysLeapCount(calDraft, levelIdx + 1);
  else if (above && above.relType === 'factor') positions = calSysInt(above.factorCount);
  return positions === null ? level.table.length : positions;
}

// 4T-002204 (Epic 3E-000338): Namen der Positionen jenseits der Tabellen-
// Zeilen, die beim Laden kein eigenes Feld hatten (bei 24 Monaten je Jahr die
// Monate 13 bis 24). Sie gehören zur Position, nicht zur Zeile: Der Name an
// Position p bleibt an Position p. Geschrieben wird ab der heutigen
// Zeilen-Zahl bis zur heutigen Zahl der Positionen.
// 4T-002205 (Epic 3E-000338, A7): Seit das Modell leere Namen annimmt, steht
// an einer Position ohne durchgetragenen Namen ein leerer Eintrag, und die
// Liste läuft dahinter weiter — nach «Zeile entfernen» bleibt die Position
// direkt hinter der letzten Zeile leer, die übrigen behalten ihre Namen.
// Hinter dem letzten durchgetragenen Namen endet die Liste; das Auffüllen auf
// die Zahl der Positionen übernimmt das Modell.
// Namen über der Zahl der Positionen werden nicht geschrieben, bleiben aber im
// Entwurf, damit ein Zurückstellen der Durchläufe sie wieder ergibt.
function calSysBeyondNames(calDraft, levelIdx) {
  const level = calDraft.levels[levelIdx];
  const beyond = level.beyondNames;
  if (!beyond || !Array.isArray(beyond.names)) return [];
  const positions = calSysLengthsPositions(calDraft, levelIdx);
  const out = [];
  let named = 0;
  for (let p = level.table.length; p < positions; p++) {
    const name = p < beyond.from ? '' : String(beyond.names[p - beyond.from] ?? '').trim();
    out.push(name);
    if (name !== '') named = out.length;
  }
  return out.slice(0, named);
}

// 4T-002204 (Epic 3E-000338): Durchgetragener Name einer Position, wenn eine
// neue Zeile sie bekommt — die Zeile übernimmt ihn in ihr Namens-Feld, statt
// ihn zu verdecken. Leer, wenn die Position keinen durchgetragenen Namen hat.
export function calSysBeyondNameAt(level, position) {
  const beyond = level && level.beyondNames;
  if (!beyond || !Array.isArray(beyond.names) || position < beyond.from) return '';
  // 4T-002205: Eine unbenannte Position führt das Modell als null.
  return beyond.names[position - beyond.from] ?? '';
}

export function calendarToDraft(cal) {
  // 4T-000747: Eine abgeleitete Zeitrechnung trägt im Entwurf nur ihre eigenen
  // Angaben; Ebenen, Zyklen, Gruppierungen und Epochen entstehen bei der
  // Auflösung im Kern und sind nicht bearbeitbar.
  if (cal.derived) {
    return {
      id: cal.id,
      name: cal.name,
      derived: {
        fromId: cal.derived.fromId,
        zeroSegs: (cal.derived.zero || []).map(String),
        depth: cal.derived.depth == null ? '' : String(cal.derived.depth),
        labelBefore: cal.epochs[0].abbr || cal.epochs[0].name || '',
        labelAfter: cal.epochs[1] ? cal.epochs[1].abbr || cal.epochs[1].name || '' : '',
      },
      previewInput: calSysZeroValue(calSysDateLevels(cal.levels).length),
    };
  }
  const levels = cal.levels.map((level, levelIdx) => {
    const draft = {
      id: level.id,
      name: level.name,
      // 4T-001863 (Epic 3E-000307): Mehrzahl im Entwurf immer als Eingabe-Text.
      namePlural: level.namePlural || '',
      section: level.section,
      start: String(level.start),
      relType: level.rel ? level.rel.type : '',
      factorCount: '',
      table: [],
      leapCount: '',
      leapRules: [],
      leapTarget: '',
      leapExtra: '',
      // 4T-002001 (Epic 3E-000307): Form der Schalt-Regel und die beiden
      // Eingaben des Musters, im Entwurf immer vorhanden (Muster der übrigen
      // Schalt-Felder); die jeweils andere Form bleibt beim Wechsel erhalten.
      leapMode: 'rules',
      leapPatternCycle: '',
      leapPatternYears: '',
      // 4T-002066 (Epic 3E-000307): Positions-Namen einer Ebene ohne Längen-
      // Tabelle. Die Pflege bietet sie dort nicht an, das Modell erlaubt sie an
      // jeder Ebene (etwa Monats-Namen an gleich langen Monaten); der Entwurf
      // trägt sie deshalb unverändert durch, sonst gingen sie beim nächsten
      // Anwenden still verloren. An der Längen-Tabelle sind die Zeilen die Quelle.
      positionNames:
        level.names && !(level.rel && level.rel.type === 'lengths') ? level.names.slice() : null,
      // 4T-002204 (Epic 3E-000338): Durchläufe der Längen-Tabelle je Instanz
      // an der Schalt-Ebene, vorbelegt mit einem; beim Laden aus der
      // Definition errechnet (siehe unten).
      leapPasses: '1',
      // 4T-002204: Namen der Positionen jenseits der Tabellen-Zeilen, ohne
      // eigenes Feld und deshalb unverändert durchgetragen ({ from, names }).
      beyondNames: null,
    };
    if (level.rel && level.rel.type === 'factor') draft.factorCount = String(level.rel.count);
    if (level.rel && level.rel.type === 'lengths') {
      draft.table = level.rel.table.map((length, i) => ({
        name: level.names ? level.names[i] || '' : '',
        length: String(length),
      }));
      // 4T-002204: Bis zur Zahl der Positionen — so viele Einheiten fasst eine
      // Instanz der Ebene darüber; eine oberste Ebene hat nur ihre Zeilen.
      const above = cal.levels[levelIdx + 1];
      const positions = above && above.rel ? above.rel.count : level.rel.table.length;
      const rows = level.rel.table.length;
      if (level.names && level.names.length > rows && positions > rows) {
        draft.beyondNames = { from: rows, names: level.names.slice(rows, positions) };
      }
    }
    if (level.rel && level.rel.type === 'leap') {
      draft.leapCount = String(level.rel.count);
      // 4T-002204: Über einer Längen-Tabelle ist die Zahl ein Vielfaches der
      // Zeilen-Zahl (Regel des Kerns); das Feld zeigt den Faktor.
      const below = cal.levels[levelIdx - 1];
      if (below && below.rel && below.rel.type === 'lengths') {
        draft.leapPasses = String(level.rel.count / below.rel.table.length);
      }
      if (level.rel.pattern) {
        draft.leapMode = 'pattern';
        draft.leapPatternCycle = String(level.rel.pattern.cycle);
        draft.leapPatternYears = level.rel.pattern.years.join(', ');
      } else {
        draft.leapRules = level.rel.rules.map((r) => String(r.cycle));
      }
      draft.leapTarget = String(level.rel.targetIndex + 1);
      draft.leapExtra = String(level.rel.extra);
    }
    return draft;
  });
  return {
    id: cal.id,
    name: cal.name,
    levels,
    cycles: cal.cycles.map((cycle) => ({
      id: cycle.id,
      name: cycle.name,
      namePlural: cycle.namePlural || '',
      of: cycle.of,
      length: String(cycle.length),
      // 4T-002206 (Epic 3E-000338): ein Name je Zeile, damit ein Komma Teil
      // des Namens sein kann; eine unbenannte Position steht als leere Zeile.
      namesText: cycle.names ? cycle.names.map((n) => n ?? '').join('\n') : '',
      anchorSegs: cycle.anchor.tuple.map(String),
      anchorPosition: String(cycle.anchor.position + 1),
      ruleIndex: cycle.numbering ? String(cycle.numbering.ruleIndex + 1) : '',
    })),
    groups: cal.groups.map((group) => ({
      id: group.id,
      name: group.name,
      namePlural: group.namePlural || '',
      of: group.of,
      size: String(group.size),
      // 4T-002066 (Epic 3E-000307): Positions-Namen der Gruppierung, ebenfalls
      // ohne Eingabe-Feld und deshalb unverändert durchgetragen.
      positionNames: group.names ? group.names.slice() : null,
    })),
    epochs: cal.epochs.map((epoch) => ({
      name: epoch.name,
      abbr: epoch.abbr || '',
      startSegs: epoch.start ? epoch.start.map(String) : null,
    })),
    // 4T-001999 (Epic 3E-000307): Kennzeichen «Epochen-Kürzel immer
    // schreiben» im Entwurf immer als Wahrheitswert (Kontrollkästchen).
    alwaysWriteEpoch: cal.alwaysWriteEpoch === true,
    anchorSegs: cal.blockAnchor.map(String),
    scaleNum: String(cal.blockScale.num),
    scaleDen: String(cal.blockScale.den),
    previewInput: formatTuple(cal, cal.blockAnchor) || '',
  };
}

// 4T-002206 (Epic 3E-000338): Positions-Namen eines Zyklus aus dem
// mehrzeiligen Feld, ein Name je Zeile. Getrennt wurde früher am Komma; ein
// Name wie «Mo, früh» zerfiel dabei in zwei, und alle folgenden Positionen
// rückten um eine Stelle. Eine leere Zeile mitten in der Liste bleibt eine
// unbenannte Position (das Modell führt sie als null), weil ihr Verwerfen
// die Namen dahinter verschöbe; leere Zeilen am Ende entfallen, das Modell
// bringt die Liste ohnehin auf die Zyklus-Länge. «\r\n» gilt wie «\n».
function cycleNamesOf(text) {
  const names = String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim());
  while (names.length > 0 && names[names.length - 1] === '') names.pop();
  return names;
}

// Entwurfs-Form eines Kalenders in die Persistenz-/Kern-Form bringen.
// Ungültige Zahlen werden bewusst als ungültige Werte durchgereicht — die
// Kern-Normalisierung lehnt den Kalender dann ab (weiche/harte Validierung
// aus einer Quelle).
export function calendarPersistForm(calDraft) {
  // 4T-000747: Kurze Form der abgeleiteten Zeitrechnung; die vollständige
  // Definition erzeugt der Kern beim Normalisieren aus Bezug und Nullpunkt.
  if (calDraft.derived) {
    const depth = String(calDraft.derived.depth || '').trim();
    return {
      id: calDraft.id,
      name: String(calDraft.name || '').trim(),
      derivedFrom: calDraft.derived.fromId,
      zero: calDraft.derived.zeroSegs.map((s) => calSysInt(s)),
      depth: depth === '' ? null : calSysInt(depth),
      labelBefore: String(calDraft.derived.labelBefore || '').trim(),
      labelAfter: String(calDraft.derived.labelAfter || '').trim(),
    };
  }
  const levels = calDraft.levels.map((level, i) => {
    const out = {
      id: level.id,
      name: String(level.name || '').trim(),
      ...pluralOf(level),
      section: String(level.section || '').trim(),
      start: calSysInt(level.start) ?? NaN,
    };
    // 4T-002204 (Epic 3E-000338, A11): Ob die Zeilen die Namen tragen,
    // entscheidet der Beziehungs-Typ, nicht die im Entwurf liegende Tabelle.
    // Wechselt eine Ebene von der Längen-Tabelle auf einen festen Faktor,
    // bleibt die Tabelle im Entwurf stehen (für einen Wechsel zurück); ihre
    // Zeilen-Namen gehören dann nicht an die Faktor-Ebene.
    if (level.relType === 'lengths') {
      // 4T-002205 (Epic 3E-000338, A7): Die Zeilen-Namen gehen so zurück, wie
      // sie dastehen, auch mit leeren Zeilen; früher wurde die Liste nur
      // geschrieben, wenn jede Zeile benannt war, und ging sonst ganz
      // verloren. Ohne jeden Namen entsteht kein Feld (Definition ohne Namen
      // bleibt unverändert).
      // 4T-002204: Hinter den Zeilen die durchgetragenen Namen der übrigen
      // Positionen.
      const names = level.table
        .map((row) => String(row.name || '').trim())
        .concat(calSysBeyondNames(calDraft, i));
      if (names.some((n) => n !== '')) out.names = names;
    } else {
      // 4T-002066 (Epic 3E-000307): Ebene ohne Längen-Tabelle — die geladenen
      // Namen gehen unverändert zurück.
      Object.assign(out, keptNamesOf(level));
    }
    if (i === 0) return out;
    if (level.relType === 'factor') {
      out.rel = { type: 'factor', count: calSysInt(level.factorCount) };
    } else if (level.relType === 'lengths') {
      out.rel = { type: 'lengths', table: level.table.map((row) => calSysInt(row.length)) };
    } else if (level.relType === 'leap') {
      // 4T-002204 (Epic 3E-000338): über einer Längen-Tabelle Durchläufe mal
      // Zeilen, sonst die eingegebene Zahl.
      const count = calSysLeapCount(calDraft, i);
      const target = calSysInt(level.leapTarget);
      out.rel = {
        type: 'leap',
        count,
        ...calSysLeapRule(level),
        targetIndex: target === null ? null : target - 1,
        extra: calSysInt(level.leapExtra),
      };
    }
    return out;
  });
  const segsOf = (segs) => segs.map((s) => calSysInt(s));
  const out = {
    id: calDraft.id,
    name: String(calDraft.name || '').trim(),
    levels,
    cycles: calDraft.cycles.map((cycle) => {
      const position = calSysInt(cycle.anchorPosition);
      const rule = String(cycle.ruleIndex || '').trim();
      const names = cycleNamesOf(cycle.namesText);
      const entry = {
        id: cycle.id,
        name: String(cycle.name || '').trim(),
        ...pluralOf(cycle),
        of: cycle.of,
        length: calSysInt(cycle.length),
        anchor: {
          tuple: segsOf(cycle.anchorSegs),
          position: position === null ? null : position - 1,
        },
        numbering:
          rule === '' ? null : { ruleIndex: calSysInt(rule) === null ? null : calSysInt(rule) - 1 },
      };
      if (names.length > 0) entry.names = names;
      return entry;
    }),
    groups: calDraft.groups.map((group) => ({
      id: group.id,
      name: String(group.name || '').trim(),
      ...pluralOf(group),
      of: group.of,
      size: calSysInt(group.size),
      ...keptNamesOf(group),
    })),
    epochs: calDraft.epochs.map((epoch) => ({
      name: String(epoch.name || '').trim(),
      abbr: String(epoch.abbr || '').trim() || null,
      start: epoch.startSegs === null ? null : segsOf(epoch.startSegs),
    })),
    // 4T-001999 (Epic 3E-000307): Die Eigenschaft entsteht nur, wenn sie
    // gesetzt ist — Definitionen ohne Kennzeichen bleiben beim Anwenden
    // unverändert (Entwurf und Schnappschuss gleich).
    ...(calDraft.alwaysWriteEpoch === true ? { alwaysWriteEpoch: true } : {}),
  };
  // Leerer Anker/leere Skala = Kern-Defaults (Minimal-Tupel bzw. 1/1);
  // teilweise gefüllte Eingaben reichen als ungültig durch.
  if (calDraft.anchorSegs.some((s) => String(s).trim() !== '')) {
    out.blockAnchor = segsOf(calDraft.anchorSegs);
  }
  const num = String(calDraft.scaleNum || '').trim();
  const den = String(calDraft.scaleDen || '').trim();
  if (num !== '' || den !== '') {
    out.blockScale = { num: calSysInt(num), den: calSysInt(den) };
  }
  return out;
}

// Persistenz-Form des gesamten Entwurfs ({ blocks } oder null bei leerem
// Stand) — Grundlage für Snapshot-Vergleich und Anwenden.
export function calendarConfigPersistForm(values) {
  const blocks = values.blocks.map((block) => ({
    id: block.id,
    name: String(block.name || '').trim(),
    calendars: block.calendars.map((cal) => calendarPersistForm(cal)),
  }));
  if (blocks.length === 0) return null;
  return { blocks };
}

// Einzelnen Entwurfs-Kalender über die Kern-Normalisierung prüfen; liefert
// den normalisierten Kalender oder null (ungültig).
export function calSysNormalizedDraft(calDraft, block) {
  if (calDraft.derived) {
    const probe = calSysDerivedProbe(block, calDraft);
    return probe ? probe.calendars.find((c) => c.id === 'probe-cal') || null : null;
  }
  const probe = normalizeCalendarConfig({
    blocks: [{ id: 'probe', calendars: [{ ...calendarPersistForm(calDraft), id: 'probe-cal' }] }],
  });
  return probe && probe.blocks[0].calendars.length === 1 ? probe.blocks[0].calendars[0] : null;
}

// 4T-000747: Probe-Block aus Bezug und Ableitung. Er ist die gemeinsame
// Grundlage von weicher Validierung, Vorschau und Rückschau auf das
// Bezugs-Datum; der Bezug auf die Standard-Zeitrechnung löst der Kern selbst
// auf und braucht deshalb keinen Eintrag im Block.
export function calSysDerivedProbe(block, calDraft) {
  const fromId = String(calDraft.derived.fromId || '').trim();
  if (fromId === '') return null;
  const calendars = [];
  if (fromId !== STANDARD_CALENDAR_ID) {
    const base = (block ? block.calendars : []).find((c) => !c.derived && c.id === fromId);
    if (!base) return null;
    calendars.push({ ...calendarPersistForm(base), id: 'probe-base' });
  }
  calendars.push({
    ...calendarPersistForm(calDraft),
    id: 'probe-cal',
    derivedFrom: fromId === STANDARD_CALENDAR_ID ? STANDARD_CALENDAR_ID : 'probe-base',
  });
  const probe = normalizeCalendarConfig({ blocks: [{ id: 'probe', calendars }] });
  return probe ? probe.blocks[0] : null;
}

// Datums-Ebenen der Bezugs-Zeitrechnung (Beschriftung der Nullpunkt-Felder).
export function calSysBaseDateLevels(block, fromId) {
  if (fromId === STANDARD_CALENDAR_ID) {
    const std = standardCalendar();
    return std ? calSysDateLevels(std.levels) : [];
  }
  const base = (block ? block.calendars : []).find((c) => !c.derived && c.id === fromId);
  return base ? calSysDateLevels(base.levels) : [];
}

// Namen der Ableitungen, die auf einem Kalender-Entwurf stehen.
export function calSysDependents(block, calDraft) {
  const id = String(calDraft.id || '').trim();
  if (!block || id === '') return [];
  return block.calendars
    .filter((c) => c.derived && c.derived.fromId === id)
    .map((c) => String(c.name || '').trim() || t('settings.calendar.calUntitled'));
}

// 4T-002191 (Epic 3E-000353): Name der Zeitrechnung, an deren Punkt der
// Block-Achse ein Entwurf ohne Anker und Maßstab beginnt, sonst null. Leere
// Felder sind der einzige Zustand, der sich sicher von einer bewussten Angabe
// und einer eingefügten Vorlage unterscheidet: Eingelesene und eingefügte
// Zeitrechnungen tragen den Anker ausdrücklich (calendarToDraft), auch wenn er
// dem Ausgangswert gleicht. Genannt wird die erste andere des Blocks
// (Entscheidung des Product Owners vom 2026-10-10, Weg A′).
export function calSysAxisUnsetPeer(block, calDraft) {
  if (!block || calDraft.derived) return null;
  const empty = (v) => String(v == null ? '' : v).trim() === '';
  const unset =
    (calDraft.anchorSegs || []).every(empty) &&
    empty(calDraft.scaleNum) &&
    empty(calDraft.scaleDen);
  const peer = unset ? block.calendars.find((c) => c !== calDraft) : null;
  return peer ? String(peer.name || '').trim() || t('settings.calendar.calUntitled') : null;
}

export async function readCalendarFromConfig() {
  let config;
  try {
    config = await api.calendarGetConfig();
  } catch {
    config = null;
  }
  const cfg = config && config.config ? config.config : { blocks: [] };
  const draft = {
    hasArea: !!(config && config.hasArea),
    areaName: (config && config.areaName) || '',
    blocks: (cfg.blocks || []).map((block) => ({
      id: block.id,
      name: block.name,
      calendars: block.calendars.map((cal) => calendarToDraft(cal)),
    })),
    // Ansichts-Zustand der zweistufigen Navigation: null = Block-Übersicht,
    // sonst der Index des geöffneten Blocks (flüchtig, Muster openShelf).
    openBlock: null,
  };
  return { draft, snapshot: calendarConfigPersistForm(draft) };
}
