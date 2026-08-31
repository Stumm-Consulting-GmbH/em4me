// 4T-1064 (Epic 3E-0212): Journal-Timeline-Block — Renderer-seitige
// Befüllung des perspective-journal-timeline-Fence (Muster
// journal-nav-view.js).
//
// Der Fence rendert (markdown.js) als Platzhalter
// <div class="perspective-journal-timeline" data-jt-source="…">. Dieses
// Modul wertet den Modus aus (parseTimelineFence), ermittelt Journal und
// Periode des Träger-Eintrags aus dem Datei-Pfad (findPeriodForPath, wie
// der Navigations-Block) und zeichnet die Perioden-Übersicht in einem der
// vier Modi:
//
//   week      eine Wochen-Zeile
//   month     ein Monatsgitter
//   quarter   drei Monatsgitter
//   calendar  zwölf Monatsgitter (Alias: year)
//
// Die Anzeige-Periode leitet sich über den Perioden-START des Träger-
// Eintrags ab (Konzept-Entscheid E3): dieselbe Regel wie parentPeriods im
// Perioden-Kern, damit auch die Jahreswechsel-Woche deterministisch
// zugeordnet ist. Außerhalb eines Journal-Eintrags rendert der Block den
// lokalisierten Hinweis, bei fehlerhaftem Fence-Body die zugehörige
// Fehler-Meldung — nie einen stillen Rückfall.
//
// Modus-agnostisch wie der Navigations-Block: derselbe Füll-Lauf hängt an
// applyRenderPipeline (Render-Pane, Reading, Notizen-Vorschau) und am
// Live-Block-Widget (_enhance, Aufbau pro Mount).
//
// 4T-1065 (Epic 3E-0212) ergänzt drei Dinge, die alle am Regal des Träger-
// Eintrags hängen (Konzept-Entscheide E5 bis E7): die Punkt-Markierung aus
// dem Tages-Journal des Regals (EIN Existenz-Batch je Block, zwischen-
// gespeichert und an die Broadcasts journals:changed und area:changed
// gehängt), die Klick-Ziele aller Ebenen über EINEN Listener am Block
// (Ereignis-Delegation — der Jahres-Modus trägt 504 Klick-Elemente) und die
// Kennzeichnung toter Zellen (keine Journal-Ebene im Regal, außerhalb der
// Datums-Grenzen).
'use strict';

import { getLanguage, t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  monthGrid,
  msToIsoDate,
  periodAllowed,
  periodOf,
  weekRow,
} from '../../../shared/journal-core.js';
import {
  TIMELINE_MODE_GRANULARITY,
  hasJournalTimelineFence,
  parseTimelineFence,
  replaceJournalTimelineFences,
} from '../../../shared/journal-timeline-core.js';
import { createDayCell, renderGridRows, weekdayLabels } from './month-grid-view.js';
// 4T-1067: Kontext, Ziel-Journal und Punkte kommen aus der Datenschicht;
// dieses Modul baut daraus die Anzeige und den statischen Export.
import {
  clearDotsCache,
  contextForPath,
  journalOfLevel,
  loadDots,
} from './journal-timeline-daten.js';
// 4T-1326 (Epic 3E-0236): gemeinsame Plausibilitäts-Prüfung beider Journal-Blöcke.
import { pruefeBlockPfad, zeigeBlockFehler } from './journal-pfad-pruefung.js';

// --- Beschriftungen -----------------------------------------------------------------

// Anzeige-Label einer Perioden-Ebene. Woche und Quartal über die
// i18n-Schablonen des Navigations-Blocks (dieselben Texte, kein zweiter
// Satz Schlüssel), Monat über Intl, Jahr als Zahl.
function levelLabel(period) {
  switch (period.granularity) {
    case 'week':
      return t('journalNav.weekLabel').replace('{week}', String(Number(period.key.split('-W')[1])));
    case 'month':
      return new Intl.DateTimeFormat(getLanguage(), { month: 'long', year: 'numeric' }).format(
        new Date(period.startMs),
      );
    case 'quarter': {
      const [year, q] = period.key.split('-Q');
      return t('journalNav.quarterLabel').replace('{quarter}', q).replace('{year}', year);
    }
    case 'year':
      return period.key;
    default:
      return period.key;
  }
}

// --- Aufbau der Kopfzeile ------------------------------------------------------------

// Ebenen der Kopfzeile je Modus, von der Modus-Ebene aufwärts bis zum Jahr
// (Kopfzeilen-Tabelle des Konzepts): week zeigt KW, Monat und Jahr; month
// zeigt Monat und Jahr; quarter zeigt Quartal und Jahr; calendar nur das
// Jahr. Die erste Ebene ist immer die des Modus und wird hervorgehoben.
const HEAD_LEVELS = {
  week: ['week', 'month', 'year'],
  month: ['month', 'year'],
  quarter: ['quarter', 'year'],
  calendar: ['year'],
};

function buildHead(mode, anchorMs) {
  const row = document.createElement('div');
  row.className = 'timeline-kopf';
  const levels = HEAD_LEVELS[mode] || HEAD_LEVELS.month;
  levels.forEach((granularity, index) => {
    const period = periodOf(anchorMs, granularity);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'timeline-kopf-teil';
    // Die Ebene des Modus ist hervorgehoben (Spezifikation der
    // Bildschirm-Kopien: "Hervorhebung der Modus-Ebene in der Kopfzeile").
    if (index === 0) el.classList.add('modus-ebene');
    el.textContent = levelLabel(period);
    // Ebene, Perioden-Schlüssel und Perioden-Start als data-Attribute: der
    // eine Klick-Listener am Block liest daraus sein Ziel (4T-1065).
    el.dataset.jtLevel = granularity;
    el.dataset.jtKey = period.key;
    el.dataset.jtMs = String(period.startMs);
    row.appendChild(el);
  });
  return row;
}

// --- Aufbau der Gitter ---------------------------------------------------------------

// Monatsgitter mit Monats-Überschrift (quarter und calendar) bzw. ohne
// (month). Die Überschrift ist ein eigenes Klick-Ziel der Monats-Ebene.
function buildMonthBlock(year, monthIndex, { todayIso, withTitle, dots }) {
  const wrap = document.createElement('div');
  wrap.className = 'timeline-monat';
  if (withTitle) {
    const monthMs = new Date(year, monthIndex, 1).getTime();
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'timeline-monat-titel';
    title.textContent = new Intl.DateTimeFormat(getLanguage(), { month: 'long' }).format(
      new Date(year, monthIndex, 1, 12),
    );
    title.dataset.jtLevel = 'month';
    title.dataset.jtKey = periodOf(monthMs, 'month').key;
    title.dataset.jtMs = String(monthMs);
    wrap.appendChild(title);
  }
  const grid = document.createElement('div');
  grid.className = 'calendar-grid';
  renderGridRows(grid, monthGrid(year, monthIndex), {
    weekColumnLabel: t('calendar.weekColumn'),
    weekCell: (row) => weekCellFor(row),
    dayCell: (day) => dayCellFor(day, todayIso, dots),
  });
  wrap.appendChild(grid);
  return wrap;
}

function weekCellFor(row) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'calendar-cell calendar-week-col calendar-week-btn';
  btn.textContent = String(row.week.week);
  btn.title = row.week.key;
  btn.dataset.jtLevel = 'week';
  btn.dataset.jtKey = row.week.key;
  btn.dataset.jtMs = String(row.week.startMs);
  return btn;
}

function dayCellFor(day, todayIso, dots) {
  const btn = createDayCell(day, { todayIso });
  btn.title = day.iso;
  btn.dataset.jtLevel = 'day';
  btn.dataset.jtKey = day.iso;
  btn.dataset.jtMs = String(day.ms);
  // Punkt-Markierung: derselbe Klassen-Name wie im Kalender-Panel, damit
  // Panel und Block nicht auseinanderlaufen (4T-1065).
  if (dots && dots.has(day.iso)) btn.classList.add('has-entry');
  return btn;
}

// Gitter-Feld je Modus. Der Aufbau läuft in einem DocumentFragment, damit
// der Jahres-Modus mit seinen zwölf Gittern einen Layout-Durchgang kostet
// statt zwölf (Konzept-Entscheid E7).
function buildGrids(mode, anchorMs, todayIso, dots) {
  const feld = document.createElement('div');
  feld.className = 'timeline-gitter-feld';
  const frag = document.createDocumentFragment();
  const anchor = new Date(anchorMs);
  const year = anchor.getFullYear();

  if (mode === 'week') {
    const wrap = document.createElement('div');
    wrap.className = 'timeline-monat';
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    renderGridRows(grid, [weekRow(anchorMs)], {
      weekColumnLabel: t('calendar.weekColumn'),
      weekCell: (row) => weekCellFor(row),
      dayCell: (day) => dayCellFor(day, todayIso, dots),
    });
    wrap.appendChild(grid);
    frag.appendChild(wrap);
  } else if (mode === 'month') {
    frag.appendChild(
      buildMonthBlock(year, anchor.getMonth(), { todayIso, withTitle: false, dots }),
    );
  } else if (mode === 'quarter') {
    const first = anchor.getMonth() - (anchor.getMonth() % 3);
    for (let m = first; m < first + 3; m++) {
      frag.appendChild(buildMonthBlock(year, m, { todayIso, withTitle: true, dots }));
    }
  } else {
    for (let m = 0; m < 12; m++) {
      frag.appendChild(buildMonthBlock(year, m, { todayIso, withTitle: true, dots }));
    }
  }
  feld.appendChild(frag);
  return feld;
}

// --- 4T-1065: Klick-Ziele ------------------------------------------------------------

// Klick-Ziel: gemeinsamer Öffnen-/Anlage-Pfad aus 4T-0433. Zur Laufzeit
// importiert (dynamic import), um denselben Modul-Zyklus zu vermeiden, den
// der Navigations-Block umgeht.
async function openTarget(journal, period) {
  const { openJournalEntry } = await import('./journals.js');
  // Der Block liegt im Dokument-Inhalt: der geöffnete Eintrag erbt die
  // Tab-Gruppe des Quell-Dokuments (Muster Navigations-Block).
  await openJournalEntry(journal, period, { inheritGroup: true });
}

// EIN Listener je Block statt einem je Zelle (Konzept-Entscheid E7): der
// Jahres-Modus trägt 504 Klick-Elemente. Ebene und Datum stehen als
// data-Attribute an der Zelle, das Ziel-Journal steht im Kontext.
function bindClicks(el, context, config) {
  el.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-jt-level]');
    // Beide Kennzeichnungen aus markDeadCells sperren gleich: 'gesperrt' an
    // den Gitter-Zellen, 'ohne-ziel' an den Kopf-Beschriftungen.
    if (!cell || !el.contains(cell)) return;
    if (cell.classList.contains('gesperrt') || cell.classList.contains('ohne-ziel')) return;
    const journal = journalOfLevel(config, context.journal.shelf, cell.dataset.jtLevel);
    if (!journal) return;
    const ms = Number(cell.dataset.jtMs);
    if (!Number.isFinite(ms)) return;
    event.preventDefault();
    event.stopPropagation();
    // Der Klick-Ablauf zählt zu den laufenden Läufen: Sein zweiter Teil ist
    // ein Neu-Aufbau des Blocks, und die Idle-Barriere darf nicht auflösen,
    // während dieser Aufbau noch läuft.
    track(
      (async () => {
        await openTarget(journal, periodOf(ms, cell.dataset.jtLevel));
        // Nach einer Anlage trägt der eigene Block seinen neuen Punkt sofort.
        clearDotsCache();
        await fillTimeline(el, el.dataset.jtBase || '');
      })(),
    );
  });
}

// Zellen ohne Journal ihrer Ebene und Zellen außerhalb der Datums-Grenzen
// sind reine Anzeige (Konzept-Entscheid E6). Die Kennzeichnung läuft nach
// dem Aufbau über den fertigen Baum, damit der Aufbau selbst nichts über
// die Journal-Konfiguration wissen muss.
function markDeadCells(el, context, config) {
  for (const cell of el.querySelectorAll('[data-jt-level]')) {
    const level = cell.dataset.jtLevel;
    const journal = journalOfLevel(config, context.journal.shelf, level);
    const ms = Number(cell.dataset.jtMs);
    const erlaubt = journal && Number.isFinite(ms) && periodAllowed(journal, periodOf(ms, level));
    if (erlaubt) continue;
    cell.classList.add(cell.classList.contains('timeline-kopf-teil') ? 'ohne-ziel' : 'gesperrt');
  }
}

// --- Befüllung -----------------------------------------------------------------------

function showHint(el, text) {
  el.innerHTML = '';
  const hint = document.createElement('div');
  hint.className = 'journal-timeline-hint';
  hint.textContent = text;
  el.appendChild(hint);
}

async function fillTimeline(el, basePath) {
  el.dataset.jtBase = basePath || '';
  const parsed = parseTimelineFence(el.dataset.jtSource || '');
  if (!parsed.ok) {
    showHint(el, t(`journalTimeline.${parsed.error.code}`).replace('{value}', parsed.error.value));
    return;
  }
  const mode = parsed.mode;

  let result;
  try {
    result = await api.journalsGetConfig();
  } catch {
    result = null;
  }
  const config = result && result.ok && result.hasArea ? result.config : null;
  const context = config ? contextForPath(config, result.rootPath, basePath) : null;
  if (!context) {
    showHint(el, t('journalTimeline.noEntry'));
    return;
  }

  // 4T-1326 (Epic 3E-0236): dieselbe Plausibilitäts-Prüfung wie beim
  // Navigations-Block. Die Zeitleiste leitet ihre Bezugs-Periode aus demselben
  // Dateipfad ab und trägt damit dieselbe Anfälligkeit für eine plausible
  // Falschaussage; geprüft wird deshalb an derselben Stelle mit derselben
  // Funktion, statt zwei auseinanderlaufende Prüfungen zu bauen.
  const rel = api.relative(result.rootPath, basePath);
  const pruefung = await pruefeBlockPfad(el, basePath, rel ? rel.replace(/\\/g, '/') : '');
  if (!pruefung.ok) {
    zeigeBlockFehler(el, pruefung.text);
    return;
  }

  // Bezugs-Periode des Träger-Eintrags, umgerechnet auf die Ebene des Modus
  // über den Perioden-START (Konzept-Entscheid E3).
  const anchorMs = periodOf(context.period.startMs, TIMELINE_MODE_GRANULARITY[mode]).startMs;
  const todayIso = msToIsoDate(Date.now());
  const dots = await loadDots(journalOfLevel(config, context.journal.shelf, 'day'), mode, anchorMs);

  el.innerHTML = '';
  el.dataset.jtMode = mode;
  el.appendChild(buildHead(mode, anchorMs));
  el.appendChild(buildGrids(mode, anchorMs, todayIso, dots));
  markDeadCells(el, context, config);
  if (el.dataset.jtBound !== '1') {
    bindClicks(el, context, config);
    el.dataset.jtBound = '1';
  }
}

// --- Einstiege -----------------------------------------------------------------------

// Laufende Füll-Läufe für die PDF-Idle-Barriere (Muster journal-nav-view).
const pendingFills = new Set();

// Einen Lauf in die Barriere aufnehmen; Fehler brechen sie nie ab.
function track(promise) {
  const run = promise.catch(() => {});
  pendingFills.add(run);
  run.finally(() => pendingFills.delete(run));
  return run;
}

export function applyJournalTimelineIfPresent(container, basePath) {
  const blocks = container.querySelectorAll('.perspective-journal-timeline');
  if (blocks.length === 0) return;
  for (const el of blocks) track(fillTimeline(el, basePath || ''));
}

// 4T-1065: Alle eingehängten Blöcke neu aufbauen. Angebunden an den
// Konfigurations-Broadcast (journals:changed) und den Struktur-Watcher des
// Bereichs (area:changed), wie es das Kalender-Panel über
// refreshCalendarPanels tut. Ohne das trüge ein offener Journal-Eintrag
// stundenlang veraltete Punkte. Der eigene Pfad steht am Block, weil der
// Broadcast keinen Kontext mitbringt.
export function refreshJournalTimelines() {
  clearDotsCache();
  for (const el of document.querySelectorAll('.perspective-journal-timeline')) {
    track(fillTimeline(el, el.dataset.jtBase || ''));
  }
}

// Einmalige Verdrahtung der beiden Broadcasts (Muster initCalendarPanel).
export function initJournalTimeline() {
  if (typeof api.onJournalsChanged === 'function') {
    api.onJournalsChanged(() => refreshJournalTimelines());
  }
  if (typeof api.onAreaChanged === 'function') {
    api.onAreaChanged(() => refreshJournalTimelines());
  }
}

// Idle-Barriere: löst auf, sobald alle aktuell laufenden Füll-Läufe fertig
// sind (der PDF-Export druckt sonst den leeren Platzhalter). Angemeldet in
// pdf-export.js neben der Barriere des Navigations-Blocks.
export async function waitForJournalTimelineIdle() {
  while (pendingFills.size > 0) {
    await Promise.allSettled([...pendingFills]);
  }
}

// --- 4T-1066: Portable-Export ---------------------------------------------------------

// Der Portable-Export ersetzt Konstrukte durch ihre informationserhaltende
// statische Entsprechung (Perspective-Table und Datatable werden zu
// Pipe-Tabellen, Ereignisse zur statischen Tabelle). Beim Timeline-Block ist
// das Gitter der Inhalt, also wird es zur Pipe-Tabelle; eine bloße
// Perioden-Beschriftung wie beim Navigations-Block würde ihn wegwerfen
// (Konzept-Entscheid E8).
//
// Zeichen-Regeln der Tabelle: ein vorhandener Eintrag hängt '•' an die
// Tageszahl, der heutige Tag steht fett, Randtage der Nachbar-Monate stehen
// kursiv. Anlage-Links gibt es nicht, der Empfänger hat die Anwendung nicht.
function tableCell(day, todayIso, dots) {
  let text = String(day.day);
  if (dots && dots.has(day.iso)) text += ' •';
  if (day.iso === todayIso) return `**${text}**`;
  if (!day.inMonth) return `*${text}*`;
  return text;
}

function rowsToTable(rows, todayIso, dots) {
  const head = `| ${t('calendar.weekColumn')} | ${weekdayLabels().join(' | ')} |`;
  const sep = `|${'---|'.repeat(8)}`;
  const body = rows.map(
    (row) =>
      `| ${row.week.week} | ${row.days.map((d) => tableCell(d, todayIso, dots)).join(' | ')} |`,
  );
  return [head, sep, ...body].join('\n');
}

// Statische Entsprechung eines Modus: Perioden-Beschriftung, danach eine
// Tabelle je Monatsgitter (mit Monatsnamen als Zwischen-Überschrift, sobald
// es mehr als eines ist).
function timelineToMarkdown(mode, anchorMs, todayIso, dots) {
  const anchor = new Date(anchorMs);
  const year = anchor.getFullYear();
  const kopf = `**${levelLabel(periodOf(anchorMs, TIMELINE_MODE_GRANULARITY[mode]))}**`;
  const teile = [kopf, ''];

  const monatsTabelle = (monthIndex) => {
    teile.push(
      `*${new Intl.DateTimeFormat(getLanguage(), { month: 'long' }).format(
        new Date(year, monthIndex, 1, 12),
      )}*`,
    );
    teile.push('');
    teile.push(rowsToTable(monthGrid(year, monthIndex), todayIso, dots));
    teile.push('');
  };

  if (mode === 'week') {
    teile.push(rowsToTable([weekRow(anchorMs)], todayIso, dots));
    teile.push('');
  } else if (mode === 'month') {
    teile.push(rowsToTable(monthGrid(year, anchor.getMonth()), todayIso, dots));
    teile.push('');
  } else if (mode === 'quarter') {
    const first = anchor.getMonth() - (anchor.getMonth() % 3);
    for (let m = first; m < first + 3; m++) monatsTabelle(m);
  } else {
    for (let m = 0; m < 12; m++) monatsTabelle(m);
  }
  return teile.join('\n').trimEnd();
}

// Ersetzt die Timeline-Fences im exportierten Text. Außerhalb eines
// Journal-Kontexts und bei fehlerhafter Modus-Angabe bleibt der Fence
// unverändert stehen (der Empfänger sieht den Quelltext, keine
// irreführende Ausgabe) — dieselbe Regel wie beim Navigations-Block.
export async function replaceJournalTimelineFencesForExport(text, basePath) {
  const source = String(text == null ? '' : text);
  if (!hasJournalTimelineFence(source)) return source;

  let result;
  try {
    result = await api.journalsGetConfig();
  } catch {
    result = null;
  }
  const config = result && result.ok && result.hasArea ? result.config : null;
  const context = config ? contextForPath(config, result.rootPath, basePath) : null;
  if (!context) return source;

  const todayIso = msToIsoDate(Date.now());
  const dayJournal = journalOfLevel(config, context.journal.shelf, 'day');

  // Die Punkte je Modus vorab beschaffen: die Ersetzung selbst ist synchron
  // (sie läuft über String.replace), der Existenz-Batch ist es nicht.
  const modi = new Map();
  replaceJournalTimelineFences(source, (body) => {
    const parsed = parseTimelineFence(body);
    if (parsed.ok) modi.set(parsed.mode, null);
    return null;
  });
  for (const mode of modi.keys()) {
    const anchorMs = periodOf(context.period.startMs, TIMELINE_MODE_GRANULARITY[mode]).startMs;
    modi.set(mode, { anchorMs, dots: await loadDots(dayJournal, mode, anchorMs) });
  }

  return replaceJournalTimelineFences(source, (body) => {
    const parsed = parseTimelineFence(body);
    if (!parsed.ok) return null;
    const daten = modi.get(parsed.mode);
    return timelineToMarkdown(parsed.mode, daten.anchorMs, todayIso, daten.dots);
  });
}
