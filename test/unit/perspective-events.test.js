// 4T-000512 (Epic 3E-000092): Unit-Tests für die HTML-Bausteine des Ereignis-
// Fence — interaktive Tabelle (Struktur, Badges, Hinweise, Formular,
// Fehler-Liste, Art-2-Platzhalter, Zeilen-Limit), statische Portable-
// Tabelle (Labels, Staffelung, Meilensteine, Wiederkehr) und die
// Text-Kompositions-Helfer. Alle Rechen-Fälle mit festem Stichtag.
import { describe, it, expect } from 'vitest';
import {
  MAX_EVENT_RENDER_ROWS,
  localTodayIso,
  renderPerspectiveEventsViewer,
  convertPerspectiveEventsBlockToHtml,
  PORTABLE_EVENT_LABEL_KEYS,
  composeDiffLines,
  composeSpanText,
  composeMilestoneText,
  composeCountdownText,
  buildEventsViewBarHtml,
  buildEventsDashboardHtml,
  buildEventsCalendarHtml,
  buildEventsTimelineHtml,
  buildEventsGanttHtml,
  buildEventsTableHtml,
} from '../../src/shared/markdown/perspective-events.js';
import { eventDiff, spanDiff } from '../../src/shared/events/events-core.js';
import { parsePerspectiveEvents } from '../../src/shared/events/events-fence.js';

// Label-Resolver der Tests: deutsches Mini-Wörterbuch, Fallback = Key.
const LABELS = {
  'events.unit.day': 'Tag',
  'events.unit.days': 'Tage',
  'events.unit.week': 'Woche',
  'events.unit.weeks': 'Wochen',
  'events.unit.month': 'Monat',
  'events.unit.months': 'Monate',
  'events.unit.year': 'Jahr',
  'events.unit.years': 'Jahre',
  'events.diff.past': 'vergangen',
  'events.milestone.jubilee': 'Jubiläum: {n} Jahre',
  'events.recurring.today': 'heute',
  'events.recurring.inDay': 'in 1 Tag',
  'events.recurring.inDays': 'in {n} Tagen',
  'events.recurring.year': '{n}. Jahr',
  'events.span.label': 'Dauer',
  'events.column.date': 'Zeitpunkt',
  'events.category.projekt': 'Projekt',
};
const L = (key) => LABELS[key] ?? key;

describe('perspective-events — Text-Komposition', () => {
  it('staffelt die Differenz-Zeilen und lässt Null-Staffeln aus', () => {
    const diff = eventDiff('2020-01-01', '2026-07-15');
    expect(composeDiffLines(diff, L)).toEqual([
      '2387 Tage',
      '341 Wochen, 0 Tage',
      '78 Monate, 2 Wochen, 0 Tage',
      '6 Jahre, 6 Monate, 2 Wochen, 0 Tage',
    ]);
    // Kurze Differenz: nur die Tages-Zeile (keine 0-Wochen/-Monate/-Jahre).
    const short = eventDiff('2026-07-12', '2026-07-15');
    expect(composeDiffLines(short, L)).toEqual(['3 Tage']);
    expect(composeDiffLines({ valid: false }, L)).toEqual([]);
  });

  it('setzt Singular und Plural pro Einheit', () => {
    const one = eventDiff('2026-07-14', '2026-07-15');
    expect(composeDiffLines(one, L)).toEqual(['1 Tag']);
    const eightDays = eventDiff('2026-07-07', '2026-07-15');
    expect(composeDiffLines(eightDays, L)).toEqual(['8 Tage', '1 Woche, 1 Tag']);
  });

  it('komponiert Spanne, Meilenstein und Wiederkehr', () => {
    expect(composeSpanText(spanDiff('2024-02-29', '2024-06-30'), L)).toBe('4 Monate, 1 Tag');
    expect(composeSpanText(spanDiff('2026-01-01', '2026-01-01'), L)).toBe('0 Tage');
    expect(composeMilestoneText({ kind: 'jubilee', value: 25 }, L)).toBe('Jubiläum: 25 Jahre');
    expect(composeCountdownText({ dateIso: '2027-03-10', inDays: 238, years: 37 }, L)).toBe(
      '2027-03-10 · in 238 Tagen · 37. Jahr',
    );
    expect(composeCountdownText({ dateIso: '2026-07-15', inDays: 0, years: 36 }, L)).toBe(
      '2026-07-15 · heute · 36. Jahr',
    );
  });
});

describe('perspective-events — Viewer-HTML', () => {
  const BODY = [
    'view: table',
    '| 2020-01-01 | 2020-06-30 | Projektstart | projekt | Zeile1\\nZeile2 | | | | |',
    '| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | a3f | | |',
    '| 2026-03-01 | | | fantasie | | | | | |',
  ].join('\n');

  it('baut Tabelle mit Köpfen, Badges, Notizen und Aktions-Spalte', () => {
    const html = renderPerspectiveEventsViewer(BODY);
    expect(html).toContain('data-i18n="events.column.date"');
    expect(html).toContain('data-i18n="events.column.diff"');
    expect(html).toContain('data-i18n="events.column.actions"');
    expect(html).toContain(
      'class="pev-badge" data-ev-cat="projekt" data-i18n="events.category.projekt"',
    );
    // Unbekannte Kategorie: Roh-Text ohne data-i18n, plus weicher Hinweis.
    expect(html).toContain('data-ev-cat="fantasie"');
    expect(html).not.toContain('data-i18n="events.category.fantasie"');
    expect(html).toContain('data-ev-hint="unknownCategory"');
    expect(html).toContain('data-ev-hint="missingText"');
    // Mehrzeilige Notizen als <br>.
    expect(html).toContain('Zeile1<br>Zeile2');
    // Differenz-Zelle leer, nur Daten-Attribute (rechnet der Renderer).
    expect(html).toContain('data-ev-date="1990-03-10"');
    expect(html).toContain('data-ev-recurring="x"');
    // Aktions-Knöpfe und Formularzeile im Markup (CSS gated die Anzeige).
    expect(html).toContain('pev-edit-btn');
    expect(html).toContain('pev-dup-btn');
    expect(html).toContain('pev-del-btn');
    expect(html).toContain('pev-add-form');
    expect(html).toContain('data-i18n-placeholder="events.form.datePlaceholder"');
  });

  it('escapt Nutzer-Text im Tabellen-HTML', () => {
    const html = renderPerspectiveEventsViewer('| 2026-01-01 | | <script>x</script> | | | | | | |');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('zeigt Struktur-Fehler als Liste ohne Tabelle', () => {
    const html = renderPerspectiveEventsViewer('spalten: kaputt');
    expect(html).toContain('pev-errors');
    expect(html).toContain('data-ev-code="unknownDirective"');
    expect(html).not.toContain('pev-table');
    expect(html).not.toContain('pev-add-form');
  });

  it('rendert die Aggregations-Art als Platzhalter (Art 2, 4T-000515)', () => {
    const html = renderPerspectiveEventsViewer('query: WHERE event-category = geburtstag');
    expect(html).toContain('class="pev-aggregation"');
    expect(html).toContain('data-ev-query="WHERE event-category = geburtstag"');
    expect(html).toContain('data-i18n="events.aggregationPending"');
    expect(html).not.toContain('pev-table');
  });

  it('begrenzt große Blöcke auf Kopf plus Hinweis', () => {
    const rows = [];
    for (let i = 0; i <= MAX_EVENT_RENDER_ROWS; i++) {
      rows.push(`| 2026-01-01 | | Eintrag ${i} | | | | | | |`);
    }
    const html = renderPerspectiveEventsViewer(rows.join('\n'));
    expect(html).toContain('pev-limit');
    expect(html).toContain(`data-ev-total="${MAX_EVENT_RENDER_ROWS + 1}"`);
    expect(html).not.toContain('<tbody>');
    expect(html).not.toContain('pev-add-form');
  });
});

describe('perspective-events — Portable-HTML', () => {
  it('schreibt die statische Tabelle mit Labels, Staffelung und Badge', () => {
    const html = convertPerspectiveEventsBlockToHtml(
      '| 2020-01-01 | 2020-06-30 | Projektstart | projekt | Notiz | | | | |',
      { todayIso: '2026-07-15', labels: LABELS },
    );
    expect(html).toContain('<table>');
    expect(html).toContain('Zeitpunkt');
    // Kategorie-Badge mit Inline-Hell-Farben und lokalisiertem Label.
    expect(html).toContain('background-color: #fff3e0');
    expect(html).toContain('>Projekt</span>');
    // Staffelung zum Stichtag; Richtung lokalisiert.
    expect(html).toContain('vergangen');
    expect(html).toContain('2387 Tage');
    // Dauer-Zusatz in der Ende-Zelle.
    expect(html).toContain('Dauer: 5 Monate, 4 Wochen, 1 Tag');
    // Nicht aufgelöste Keys fallen auf den Key-Namen zurück.
    expect(html).toContain('events.column.end');
  });

  it('schreibt Meilenstein und Wiederkehr-Countdown', () => {
    const html = convertPerspectiveEventsBlockToHtml(
      '| 2000-06-15 | | Jubiläum | jubilaeum | | x | | | |',
      { todayIso: '2025-06-15', labels: LABELS },
    );
    expect(html).toContain('★');
    expect(html).toContain('Jubiläum: 25 Jahre');
    expect(html).toContain('events.recurring.label');
    expect(html).toContain('heute');
  });

  it('liefert null für Struktur-Fehler und die Aggregations-Art', () => {
    expect(convertPerspectiveEventsBlockToHtml('spalten: kaputt', {})).toBeNull();
    expect(convertPerspectiveEventsBlockToHtml('query: FROM "Ordner"', {})).toBeNull();
  });

  it('deckt alle Portable-Label-Keys über die Key-Liste ab', () => {
    expect(PORTABLE_EVENT_LABEL_KEYS).toContain('events.column.date');
    expect(PORTABLE_EVENT_LABEL_KEYS).toContain('events.category.sonstiges');
    expect(PORTABLE_EVENT_LABEL_KEYS).toContain('events.unit.years');
    expect(new Set(PORTABLE_EVENT_LABEL_KEYS).size).toBe(PORTABLE_EVENT_LABEL_KEYS.length);
  });
});

describe('perspective-events — Stichtag', () => {
  it('liefert den lokalen Kalendertag als ISO-Datum', () => {
    expect(localTodayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// --- 4T-000514: Zusatz-Ansichten ---------------------------------------------------------

describe('perspective-events — Zusatz-Ansichten (4T-000514)', () => {
  const VIEW_LABELS = {
    ...LABELS,
    'events.dashboard.upcoming': 'Anstehende Ereignisse',
    'events.dashboard.milestones': 'Meilensteine',
    'events.dashboard.reached': 'heute erreicht',
    'events.dashboard.categories': 'Kategorien',
    'events.dashboard.empty': 'Keine anstehenden Ereignisse',
    'events.dashboard.noMilestones': 'Keine Meilensteine in den nächsten {n} Tagen',
    'events.milestone.days': '{n} Tage',
    'events.milestone.weeks': '{n} Wochen',
    'events.category.termin': 'Termin',
    'events.category.geburtstag': 'Geburtstag',
    'events.view.empty': 'Keine Ereignisse in dieser Ansicht',
    'calendar.today': 'Heute',
    'calendar.prevMonth': 'Voriger Monat',
    'calendar.nextMonth': 'Nächster Monat',
    'events.cal.more': '+{n} weitere',
  };
  const LV = (key) => VIEW_LABELS[key] ?? key;
  const BODY = [
    '| 2026-07-20 | | Workshop | termin | | | | | |',
    '| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |',
    '| 2023-10-19 | | Tausend Tage | projekt | | | | | |',
    '| 2026-07-30 | 2026-08-02 | Spannen-Termin | termin | | | | | |',
  ].join('\n');
  const model = parsePerspectiveEvents(BODY);
  const all = model.entries.map((_, i) => i);

  it('baut den Umschalter mit aktiver Ansicht', () => {
    const html = buildEventsViewBarHtml('dashboard');
    expect(html).toContain('data-ev-viewbtn="table"');
    expect(html).toContain('data-i18n="events.view.timeline"');
    expect(html).toContain('class="pev-viewbtn active" data-ev-viewbtn="dashboard"');
  });

  it('Dashboard: Anstehende, Meilensteine und Kategorie-Statistik', () => {
    const html = buildEventsDashboardHtml(model, all, { todayIso: '2026-07-15', L: LV });
    expect(html).toContain('Anstehende Ereignisse');
    // Workshop in 5 Tagen; Wiederkehr-Vorkommen der Anna als Chip.
    expect(html).toContain('in 5 Tagen');
    expect(html).toContain('2027-03-10');
    // 1000-Tage-Meilenstein heute erreicht.
    expect(html).toContain('★ 1000 Tage');
    expect(html).toContain('heute erreicht');
    // Kategorie-Statistik mit lokalisiertem Badge und Zähler.
    expect(html).toContain('>Termin</span>');
    expect(html).toContain('pev-dash-count">2<');
    // Chips tragen das Sprung-Ziel.
    expect(html).toContain('data-ev-jump="0"');
  });

  it('Monats-Kalender: Titel, Heute-Markierung, Chips und Spannen-Balken', () => {
    const html = buildEventsCalendarHtml(model, all, {
      todayIso: '2026-07-15',
      mode: 'month',
      L: LV,
      lang: 'de',
    });
    expect(html).toContain('Juli 2026');
    expect(html).toContain('pev-cal-today');
    expect(html).toContain('data-ev-day="2026-07-20"');
    expect(html).toContain('pev-chip-start');
    expect(html).toContain('pev-chip-mid');
    expect(html).toContain('title="Voriger Monat"');
    // Wochentags-Kopf beginnt mit Montag (Intl de: 'Mo.').
    expect(html).toContain('pev-cal-weekday');
  });

  it('Wochen-Kalender: sieben Tage ab Montag mit Titel-Spanne', () => {
    const html = buildEventsCalendarHtml(model, all, {
      todayIso: '2026-07-15',
      mode: 'week',
      L: LV,
      lang: 'de',
    });
    expect(html).toContain('2026-07-13 – 2026-07-19');
    expect((html.match(/pev-cal-day/g) || []).length).toBeGreaterThanOrEqual(7);
    expect(html).toContain('pev-cal-week');
  });

  it('Timeline: Jahres- und Monats-Gruppen chronologisch', () => {
    const html = buildEventsTimelineHtml(model, all, { L: LV, lang: 'de' });
    expect(html).toContain('pev-tl-year">1990<');
    expect(html).toContain('März 1990');
    expect(html).toContain('Juli 2026');
    expect(html.indexOf('1990')).toBeLessThan(html.indexOf('2026'));
    const empty = buildEventsTimelineHtml(model, [], { L: LV, lang: 'de' });
    expect(empty).toContain('Keine Ereignisse in dieser Ansicht');
  });

  it('Viewer rendert die view:-Direktive mit Umschalter und Anzeige-Wrapper', () => {
    const html = renderPerspectiveEventsViewer(`view: dashboard\n${BODY}`, {
      todayIso: '2026-07-15',
      lang: 'de',
      labels: VIEW_LABELS,
    });
    expect(html).toContain('pev-switcher');
    expect(html).toContain('data-ev-display="dashboard"');
    expect(html).toContain('Anstehende Ereignisse');
    expect(html).not.toContain('pev-add-form');
    const table = renderPerspectiveEventsViewer(BODY, { todayIso: '2026-07-15' });
    expect(table).toContain('data-ev-display="table"');
    expect(table).toContain('pev-add-form');
  });
});

// --- 4T-000722: Gantt-Ansicht -------------------------------------------------------------

describe('perspective-events — Gantt-Ansicht (4T-000722)', () => {
  const GANTT_LABELS = {
    ...LABELS,
    'events.view.empty': 'Keine Ereignisse in dieser Ansicht',
    'events.gantt.recurring': 'Wiederkehr: nächstes Vorkommen',
    'events.link.indicator': 'Verknüpfungen anzeigen',
    'events.milestone.days': '{n} Tage',
    'calendar.today': 'Heute',
  };
  const LG = (key) => GANTT_LABELS[key] ?? key;
  // Vorgänger/Nachfolger sind bidirektional gepflegt (e1 -> e2), dazu ein
  // Ereignis ohne Ende, ein wiederkehrendes und ein Meilenstein-Träger.
  const BODY = [
    '| 2026-08-01 | 2026-09-15 | Konzeptphase | projekt | | | e1 | | e2 |',
    '| 2026-09-16 | 2026-12-20 | Umsetzung | projekt | | | e2 | e1 | |',
    '| 2026-09-20 | | Freigabe | termin | | | | | |',
    '| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |',
    '| 2023-10-19 | | Tausend Tage | projekt | | | | | |',
  ].join('\n');
  const model = parsePerspectiveEvents(BODY);
  const all = model.entries.map((_, i) => i);
  const html = buildEventsGanttHtml(model, all, {
    todayIso: '2026-07-15',
    L: LG,
    lang: 'de',
  });

  it('setzt Achse, Gitter-Marken und die gewählte Einheit', () => {
    // Die Wiederkehr zieht die Spanne bis 2027-03-10, das ergibt Monate;
    // die Achse beginnt beim frühesten Eintrag (2023-10-19), auf den
    // Monats-Ersten gerundet.
    expect(html).toContain('data-ev-gantt-unit="month"');
    expect(html).toContain('class="pev-gantt-tick"');
    expect(html).toContain('>Okt. 23<');
    // Ausgedünnt auf die Ober-Grenze, nicht eine Marke je Monat.
    expect((html.match(/pev-gantt-tick/g) || []).length).toBeLessThanOrEqual(16);
  });

  it('zeichnet Balken mit Breite und Rauten ohne Breite', () => {
    expect(html).toMatch(
      /class="pev-event-chip pev-chip-gantt-bar" data-ev-cat="projekt" style="left: [\d.]+%; width: [\d.]+%"/,
    );
    expect(html).toMatch(/pev-chip-gantt-point" data-ev-cat="termin" style="left: [\d.]+%"/);
    // Sprung-Ziel und sprechender Titel je Chip.
    expect(html).toContain('data-ev-jump="0"');
    expect(html).toContain('title="Konzeptphase · 2026-08-01 – 2026-09-15"');
    expect(html).toContain('title="Freigabe · 2026-09-20"');
  });

  it('markiert Wiederkehr, Meilenstein und Verknüpfungs-Zahl in der Label-Spalte', () => {
    expect(html).toContain('title="Wiederkehr: nächstes Vorkommen">↻');
    // Verschobenes Vorkommen statt Ursprungs-Datum.
    expect(html).toContain('title="Geburtstag Anna · 2027-03-10"');
    expect(html).toContain('title="1000 Tage">★');
    expect(html).toContain('title="Verknüpfungen anzeigen">⛓1');
  });

  it('legt Heute-Linie und Abhängigkeits-Linie als Overlay darüber', () => {
    expect(html).toContain('<svg class="pev-gantt-overlay"');
    expect(html).toMatch(/<line class="pev-gantt-today" x1="[\d.]+%"/);
    expect(html).toContain('<title>Heute</title>');
    expect(html).toMatch(/<line class="pev-gantt-link" x1="[\d.]+%" y1="[\d.]+%"/);
  });

  it('lässt die Heute-Linie weg, wenn der Stichtag außerhalb der Spanne liegt', () => {
    // Ohne Wiederkehr endet die Spanne mit dem letzten Ereignis; ein
    // Stichtag dahinter liegt außerhalb der Achse.
    const eng = parsePerspectiveEvents('| 2026-08-01 | 2026-09-15 | Konzeptphase | projekt |');
    const spaeter = buildEventsGanttHtml(eng, [0], {
      todayIso: '2030-01-01',
      L: LG,
      lang: 'de',
    });
    expect(spaeter).toContain('pev-chip-gantt-bar');
    expect(spaeter).not.toContain('pev-gantt-today');
  });

  it('meldet die leere Menge statt einer Achse', () => {
    const leer = buildEventsGanttHtml(model, [], { todayIso: '2026-07-15', L: LG, lang: 'de' });
    expect(leer).toContain('Keine Ereignisse in dieser Ansicht');
    expect(leer).not.toContain('pev-gantt-tick');
  });

  it('Viewer rendert die Gantt-Direktive in den Anzeige-Wrapper', () => {
    const viewer = renderPerspectiveEventsViewer(`view: gantt\n${BODY}`, {
      todayIso: '2026-07-15',
      lang: 'de',
      labels: GANTT_LABELS,
    });
    expect(viewer).toContain('data-ev-display="gantt"');
    expect(viewer).toContain('class="pev-viewbtn active" data-ev-viewbtn="gantt"');
    expect(viewer).toContain('pev-gantt-body');
  });

  it('führt die Gantt-Label-Keys in der Portable-Label-Liste', () => {
    expect(PORTABLE_EVENT_LABEL_KEYS).toContain('events.gantt.recurring');
    expect(PORTABLE_EVENT_LABEL_KEYS).toContain('events.link.indicator');
  });
});

// --- 4T-000515: Aggregations-Tabelle ------------------------------------------------------

describe('perspective-events — Aggregations-Tabelle (4T-000515)', () => {
  it('Quell-Zeile, Titel-Fallback kursiv, nur Bearbeiten, kein Formular', () => {
    const aggModel = {
      view: null,
      savedFilters: [],
      query: '',
      errors: [],
      entries: [
        {
          date: '1990-03-10',
          end: '',
          text: 'Anna',
          textFallback: true,
          category: 'geburtstag',
          notes: '',
          recurring: true,
          id: null,
          predecessors: [],
          successors: [],
          line: 0,
          source: { path: 'C:/bereich/Anna.md', name: 'Anna', mtimeMs: 123 },
        },
        {
          date: '2020-01-01',
          end: '',
          text: '',
          category: 'projekt',
          notes: '',
          recurring: false,
          id: null,
          predecessors: [],
          successors: [],
          line: 0,
          source: { path: 'C:/bereich/Projekt.md', name: 'Projekt', mtimeMs: 456 },
        },
      ],
    };
    const html = buildEventsTableHtml(aggModel, { aggregation: true });
    expect(html).toContain('pev-agg-row');
    expect(html).toContain('data-ev-source="C:/bereich/Anna.md"');
    expect(html).toContain('data-ev-mtime="123"');
    expect(html).toContain('class="pev-source"');
    expect(html).toContain('pev-text-fallback');
    expect(html).toContain('pev-edit-btn');
    expect(html).not.toContain('pev-dup-btn');
    expect(html).not.toContain('pev-del-btn');
    expect(html).not.toContain('pev-add-form');
    // Leerer Text erzeugt in der Aggregation keinen missingText-Hinweis
    // (der Titel-Fallback ist definiert).
    expect(html).not.toContain('data-ev-hint="missingText"');
  });
});

// --- 4T-000516: Verknüpfungs-Indikator -----------------------------------------------------

describe('perspective-events — Verknüpfungs-Indikator (4T-000516)', () => {
  it('zeigt den Indikator mit Anzahl nur bei verknüpften Einträgen', () => {
    const html = renderPerspectiveEventsViewer(
      [
        '| 2026-01-01 | | A | | | | e1 | | e2 |',
        '| 2026-01-02 | | B | | | | e2 | e1 | |',
        '| 2026-01-03 | | C | | | | | | |',
      ].join('\n'),
    );
    expect((html.match(/pev-link-ind/g) || []).length).toBe(2);
    expect(html).toContain('⛓1');
    expect(html).toContain('pev-link-btn');
  });
});
