// 4T-0435 (Epic 3E-0081): Journal-Navigations-Block — Renderer-seitige
// Befüllung des perspective-journal-nav-Fence (Muster frontmatter-query-view).
//
// Der Fence rendert (markdown.js) als leerer Platzhalter
// <div class="perspective-journal-nav">. Dieses Modul ermittelt den Kontext
// aus dem Datei-Pfad des Eintrags (bereichsrelativer Pfad-Abgleich gegen die
// Schema-Auflösung des Perioden-Kerns über alle Journale des Bereichs,
// findPeriodForPath) und baut die Navigation: aktuelle Periode groß, eine
// Zusatz-Zeile („Diese Woche" bei aktueller Periode), darüber die
// übergeordneten Perioden desselben Regals (Monat, Quartal, Jahr — soweit
// als Journal vorhanden, Lücken werden ausgelassen) und Pfeile zu voriger/
// nächster Periode (an den Journal-Grenzen gekappt). Alle Klicks laufen
// über den gemeinsamen Öffnen-/Anlage-Pfad aus 4T-0433; fehlende Einträge
// werden angelegt.
//
// Modus-agnostisch: derselbe Füll-Lauf hängt an applyRenderPipeline
// (Render-Pane, Reading, Notizen-Vorschau) und am Live-Block-Widget
// (_enhance, Listener pro Mount). Außerhalb eines Journal-Eintrags (kein
// Bereich, kein Pfad-Treffer) rendert der Block den lokalisierten Hinweis.
// Für den PDF-Export stellt waitForJournalNavIdle die Idle-Barriere; der
// Portable-Export ersetzt den Fence über replaceJournalNavFencesForExport
// durch die statische Perioden-Beschriftung ohne Anlage-Links.
'use strict';

import { getLanguage, t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  findPeriodForPath,
  nextPeriod,
  periodOf,
  prevPeriod,
  replaceJournalNavFences,
} from '../../../shared/journal-core.js';

// --- Perioden-Beschriftung ---------------------------------------------------------

// Anzeige-Label einer Periode, lokalisiert: Tag und Monat über Intl in der
// App-Sprache, Woche/Quartal über i18n-Schablonen, Jahr als Zahl.
export function periodLabel(period) {
  const lang = getLanguage();
  const d = new Date(period.startMs);
  switch (period.granularity) {
    case 'day':
      return new Intl.DateTimeFormat(lang, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d);
    case 'week': {
      const week = period.key.split('-W')[1] || '';
      return t('journalNav.weekLabel').replace('{week}', String(Number(week)));
    }
    case 'month':
      return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(d);
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

// Zusatz-Zeile bei aktueller Periode („Heute", „Diese Woche", …); null sonst.
function currentPeriodLine(period) {
  if (periodOf(Date.now(), period.granularity).key !== period.key) return null;
  const keys = {
    day: 'journalNav.today',
    week: 'journalNav.thisWeek',
    month: 'journalNav.thisMonth',
    quarter: 'journalNav.thisQuarter',
    year: 'journalNav.thisYear',
  };
  return t(keys[period.granularity]);
}

// --- Kontext-Ermittlung --------------------------------------------------------------

// Journal und Periode des Eintrags-Pfads: erster Treffer über alle Journale
// des Bereichs (Konfigurations-Reihenfolge). null = kein Journal-Eintrag.
function contextForPath(config, rootPath, basePath) {
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

// Übergeordnete Journale desselben Regals: pro gröberer Granularität das
// erste Journal (Konfigurations-Reihenfolge) mit gleichem Regal-Wert;
// Lücken (keine solche Granularität im Regal) werden ausgelassen.
function parentTargets(config, journal, period) {
  const order = ['day', 'week', 'month', 'quarter', 'year'];
  const startIdx = order.indexOf(period.granularity);
  const out = [];
  for (const granularity of order.slice(startIdx + 1)) {
    const parent = config.journals.find(
      (j) => j.granularity === granularity && j.shelf === journal.shelf,
    );
    if (parent) out.push({ journal: parent, period: periodOf(period.startMs, granularity) });
  }
  return out;
}

// --- Befüllung -----------------------------------------------------------------------

// Klick-Ziel: gemeinsamer Öffnen-/Anlage-Pfad. Zur Laufzeit importiert
// (dynamic import), um den Modul-Zyklus views -> journal-nav-view ->
// journals -> templates -> views zur Lade-Zeit zu vermeiden.
async function openTarget(journal, period) {
  const { openJournalEntry } = await import('./journals.js');
  // 4T-0631 (Epic 3E-0102): der Navigations-Block liegt im Dokument-Inhalt —
  // der geöffnete Eintrag erbt die Tab-Gruppe des Quell-Dokuments.
  await openJournalEntry(journal, period, { inheritGroup: true });
}

// 4T-1311 (Epic 3E-0235): Blättern mit den Pfeilen. Der Nachbar-Eintrag löst
// den bisherigen im selben Reiter ab, statt einen weiteren zu öffnen; der
// Reiter behält dabei seinen Ansichts- und Änderungs-Modus.
//
// Entscheidung E1 des Product Owners vom 2026-08-30: Das gilt nur für die
// Pfeile. Die Verweise auf Monat, Quartal und Jahr öffnen weiterhin einen
// eigenen Reiter, weil sie die Ebene wechseln statt zu blättern — ein
// Ebenen-Wechsel, der den Ausgangs-Eintrag schließt, nähme dem Anwender die
// Stelle, zu der er zurückwill.
async function blaettereZu(journal, period, basePath) {
  const { openJournalEntry } = await import('./journals.js');
  await openJournalEntry(journal, period, {
    inheritGroup: true,
    imSelbenReiter: true,
    quellPfad: basePath,
  });
}

function buildLink(label, title, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'journal-nav-link';
  btn.textContent = label;
  if (title) btn.title = title;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

async function fillJournalNav(el, basePath) {
  let result;
  try {
    result = await api.journalsGetConfig();
  } catch {
    result = null;
  }
  const config = result && result.ok && result.hasArea ? result.config : null;
  const context = config ? contextForPath(config, result.rootPath, basePath) : null;
  el.innerHTML = '';
  if (!context) {
    const hint = document.createElement('div');
    hint.className = 'journal-nav-hint';
    hint.textContent = t('journalNav.noEntry');
    el.appendChild(hint);
    return;
  }
  const { journal, period } = context;

  // Übergeordnete Perioden desselben Regals (Lücken ausgelassen).
  const parents = parentTargets(config, journal, period);
  if (parents.length > 0) {
    const row = document.createElement('div');
    row.className = 'journal-nav-parents';
    for (const target of parents) {
      row.appendChild(
        buildLink(periodLabel(target.period), target.period.key, () =>
          openTarget(target.journal, target.period),
        ),
      );
    }
    el.appendChild(row);
  }

  // Aktuelle Periode mit Pfeilen zu voriger/nächster (an Grenzen gekappt).
  const row = document.createElement('div');
  row.className = 'journal-nav-current';
  const prev = prevPeriod(journal, period);
  const next = nextPeriod(journal, period);
  if (prev) {
    const btn = buildLink('‹', periodLabel(prev), () => blaettereZu(journal, prev, basePath));
    btn.classList.add('journal-nav-arrow');
    row.appendChild(btn);
  }
  const title = document.createElement('div');
  title.className = 'journal-nav-title';
  const label = document.createElement('div');
  label.className = 'journal-nav-label';
  label.textContent = periodLabel(period);
  title.appendChild(label);
  const subText = currentPeriodLine(period);
  if (subText) {
    const sub = document.createElement('div');
    sub.className = 'journal-nav-sub';
    sub.textContent = subText;
    title.appendChild(sub);
  }
  row.appendChild(title);
  if (next) {
    const btn = buildLink('›', periodLabel(next), () => blaettereZu(journal, next, basePath));
    btn.classList.add('journal-nav-arrow');
    row.appendChild(btn);
  }
  el.appendChild(row);
}

// --- Einstiege -----------------------------------------------------------------------

// Laufende Füll-Läufe für die PDF-Idle-Barriere (Muster frontmatter-query-view).
const pendingFills = new Set();

export function applyJournalNavIfPresent(container, basePath) {
  const blocks = container.querySelectorAll('.perspective-journal-nav');
  if (blocks.length === 0) return;
  for (const el of blocks) {
    const run = fillJournalNav(el, basePath || '').catch(() => {});
    pendingFills.add(run);
    run.finally(() => pendingFills.delete(run));
  }
}

// Idle-Barriere: löst auf, sobald alle aktuell laufenden Füll-Läufe fertig
// sind (der PDF-Export druckt sonst den leeren Platzhalter).
export async function waitForJournalNavIdle() {
  while (pendingFills.size > 0) {
    await Promise.allSettled([...pendingFills]);
  }
}

// --- Portable-Export -----------------------------------------------------------------

// Ersetzt die journal-nav-Fences im exportierten Text durch die statische
// Perioden-Beschriftung ohne Anlage-Links (Task-Vorgabe Export-Verhalten;
// die Fence-Erkennung liegt rein und unit-getestet im Perioden-Kern).
// Außerhalb eines Journal-Eintrags bleibt der Fence unverändert (der
// Empfänger sieht den Quelltext-Block, keine irreführende Beschriftung).
export async function replaceJournalNavFencesForExport(text, basePath) {
  const source = String(text == null ? '' : text);
  if (replaceJournalNavFences(source, '') === source) return source;
  let result;
  try {
    result = await api.journalsGetConfig();
  } catch {
    result = null;
  }
  const config = result && result.ok && result.hasArea ? result.config : null;
  const context = config ? contextForPath(config, result.rootPath, basePath) : null;
  if (!context) return source;
  return replaceJournalNavFences(source, `**${periodLabel(context.period)}**`);
}
