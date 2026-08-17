// 4T-1067 (Epic 3E-0212): Datenschicht des Journal-Timeline-Blocks —
// Kontext-Ermittlung aus dem Datei-Pfad, Auswahl des Ziel-Journals je
// Perioden-Ebene und die Punkt-Markierung samt ihrem Zwischenspeicher.
//
// Herausgelöst aus journal-timeline-view.js, weil Anzeige und Export
// dieselben Daten brauchen, sie aber verschieden ausgeben (DOM gegen
// Markdown-Tabelle). Auslöser war das Datei-Größen-Budget (4T-0878): Die
// View-Datei überschritt mit dem Export-Teil die 500 Zeilen, und die Naht
// zwischen Beschaffung und Ausgabe ist die tragfähige.
'use strict';

import { api } from '../app/api.js';
import {
  findPeriodForPath,
  monthGrid,
  periodOf,
  resolveEntryPath,
  weekRow,
} from '../../../shared/journal-core.js';

// Journal und Periode des Eintrags-Pfads: erster Treffer über alle Journale
// des Bereichs (Konfigurations-Reihenfolge). null = kein Journal-Eintrag.
// Muster journal-nav-view.js.
export function contextForPath(config, rootPath, basePath) {
  if (!config || !rootPath || !basePath) return null;
  const rel = api.relative(rootPath, basePath);
  if (!rel || rel.startsWith('..')) return null;
  const relPath = rel.replace(/\\/g, '/');
  for (const journal of config.journals) {
    const period = findPeriodForPath(journal, relPath);
    if (period) return { journal, period };
  }
  return null;
}

// Journal einer Perioden-Ebene im REGAL des Träger-Eintrags (Konzept-
// Entscheide E5 und E6). Der Block hat, anders als das Kalender-Panel,
// keinen Filter-Kopf; das Regal ist die Klammer, die auch der
// Navigations-Block verwendet. null = diese Ebene gibt es im Regal nicht.
export function journalOfLevel(config, shelf, granularity) {
  return config.journals.find((j) => j.granularity === granularity && j.shelf === shelf) || null;
}

// Existenz-Ergebnisse je (Journal, Modus, Bezugs-Periode). Der Zwischen-
// speicher hängt bewusst NICHT am Element: Das Live-Widget baut sein
// Container-Element bei jedem Einhängen neu (cloneNode verliert die
// Listener), ein Element-Cache liefe dort immer ins Leere. Verworfen wird er
// bei jeder Konfigurations- und Struktur-Änderung, dazu bei Übergröße als
// Wachstums-Schutz.
const dotsCache = new Map();
const DOTS_CACHE_MAX = 32;

export function clearDotsCache() {
  dotsCache.clear();
}

// Alle Tage der angezeigten Gitter als Map iso -> ms, dedupliziert über die
// Monatsgrenzen hinweg (die Randtage stehen in zwei Gittern).
function visibleDays(mode, anchorMs) {
  const anchor = new Date(anchorMs);
  const year = anchor.getFullYear();
  const rows = [];
  if (mode === 'week') {
    rows.push(weekRow(anchorMs));
  } else if (mode === 'month') {
    rows.push(...monthGrid(year, anchor.getMonth()));
  } else if (mode === 'quarter') {
    const first = anchor.getMonth() - (anchor.getMonth() % 3);
    for (let m = first; m < first + 3; m++) rows.push(...monthGrid(year, m));
  } else {
    for (let m = 0; m < 12; m++) rows.push(...monthGrid(year, m));
  }
  const days = new Map();
  for (const row of rows) {
    for (const day of row.days) if (!days.has(day.iso)) days.set(day.iso, day.ms);
  }
  return days;
}

// Tage mit vorhandenem Eintrag des Tages-Journals im Regal. EIN Batch je
// Block (Konzept-Entscheid E5), nicht einer je Monatsgitter.
export async function loadDots(dayJournal, mode, anchorMs) {
  if (!dayJournal) return new Set();
  const key = `${dayJournal.id}|${mode}|${anchorMs}`;
  const cached = dotsCache.get(key);
  if (cached) return cached;

  const relToIso = new Map();
  for (const [isoDay, ms] of visibleDays(mode, anchorMs)) {
    const resolved = resolveEntryPath(dayJournal, periodOf(ms, 'day'));
    if (resolved.ok && !relToIso.has(resolved.relPath)) relToIso.set(resolved.relPath, isoDay);
  }
  let result;
  try {
    result = await api.journalsEntriesExist([...relToIso.keys()]);
  } catch {
    result = null;
  }
  const dots = new Set();
  if (result && result.ok && result.exists) {
    for (const [relPath, isoDay] of relToIso) if (result.exists[relPath]) dots.add(isoDay);
  }
  if (dotsCache.size >= DOTS_CACHE_MAX) dotsCache.clear();
  dotsCache.set(key, dots);
  return dots;
}
