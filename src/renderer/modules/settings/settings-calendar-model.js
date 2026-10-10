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
  return Array.isArray(names) && names.length > 0 ? { names: names.slice() } : {};
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
  const levels = cal.levels.map((level) => {
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
    };
    if (level.rel && level.rel.type === 'factor') draft.factorCount = String(level.rel.count);
    if (level.rel && level.rel.type === 'lengths') {
      draft.table = level.rel.table.map((length, i) => ({
        name: level.names ? level.names[i] || '' : '',
        length: String(length),
      }));
    }
    if (level.rel && level.rel.type === 'leap') {
      draft.leapCount = String(level.rel.count);
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
      namesText: cycle.names ? cycle.names.join(', ') : '',
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
    const names = level.table.map((row) => String(row.name || '').trim());
    if (level.table.length > 0 && names.every((n) => n !== '')) {
      out.names = names;
    } else if (level.relType !== 'lengths') {
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
      const below = calDraft.levels[i - 1];
      const count =
        below && below.relType === 'lengths' ? below.table.length : calSysInt(level.leapCount);
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
      const names = String(cycle.namesText || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
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
