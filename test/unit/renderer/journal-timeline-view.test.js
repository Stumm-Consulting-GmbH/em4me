// @vitest-environment jsdom
// 4T-1064 (Epic 3E-0212): Journal-Timeline-Block — Aufbau der vier Modi im
// Renderer. Geprüft sind die Modus-Ableitung aus dem Fence, die Kopfzeile
// samt Hervorhebung der Modus-Ebene, die Zahl der Gitter und Zellen je Modus
// sowie die beiden Degradations-Fälle (kein Journal-Kontext, fehlerhafte
// Angabe im Fence).
//
// Der Wächter-Charakter liegt in den Zell-Zahlen: Ein Modus, der ein Gitter
// zu viel oder zu wenig zeichnet, fällt sofort auf. Die Kalender-Mathematik
// selbst prüft der Perioden-Kern (journal-perioden.test.js); hier geht es um
// den Aufbau.
//
// Gemockt sind i18n (Schlüssel als Text) und die IPC-Brücke; alles Übrige
// läuft echt, insbesondere der geteilte Gitter-Baustein.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getConfig = vi.fn();
const entriesExist = vi.fn();
const openEntry = vi.fn();
const onJournalsChanged = vi.fn();
const onAreaChanged = vi.fn();

vi.mock('../../../src/renderer/i18n.js', () => ({
  t: (key) => key,
  getLanguage: () => 'de',
}));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {
    journalsGetConfig: () => getConfig(),
    journalsEntriesExist: (paths) => entriesExist(paths),
    onJournalsChanged: (cb) => onJournalsChanged(cb),
    onAreaChanged: (cb) => onAreaChanged(cb),
    relative: (root, p) => String(p).slice(String(root).length + 1),
  },
  $: () => null,
}));
// Der Anlage-Pfad wird zur Laufzeit importiert; hier reicht die Aufzeichnung
// des Aufrufs, geprüft ist die Auswahl von Journal und Periode.
vi.mock('../../../src/renderer/modules/calendar/journals.js', () => ({
  openJournalEntry: (journal, period, opts) => openEntry(journal, period, opts),
}));

const {
  applyJournalTimelineIfPresent,
  waitForJournalTimelineIdle,
  initJournalTimeline,
  refreshJournalTimelines,
  replaceJournalTimelineFencesForExport,
} = await import('../../../src/renderer/modules/calendar/journal-timeline-view.js');

// Ein Regal mit Tages-, Wochen-, Monats-, Quartals- und Jahres-Journal; die
// Schemata bilden das Beleg-Muster des Product Owners nach.
const CONFIG = {
  shelves: ['Tagebuch'],
  journals: [
    {
      id: 'woche',
      name: 'Woche',
      shelf: 'Tagebuch',
      granularity: 'week',
      folderPattern: 'Journal/{{date::yyyy}}',
      namePattern: '{{date::kkkk}}-KW{{date::ww}}',
      template: null,
      startDate: null,
      endDate: null,
    },
    {
      id: 'tag',
      name: 'Tag',
      shelf: 'Tagebuch',
      granularity: 'day',
      folderPattern: 'Journal/{{date::yyyy}}',
      namePattern: '{{date::yyyy-MM-dd}}',
      template: null,
      startDate: null,
      endDate: null,
    },
  ],
};

// Der Träger-Eintrag ist die Wochennotiz der KW 34 des Jahres 2026.
const ROOT = 'C:/Bereich';
const WOCHEN_EINTRAG = `${ROOT}/Journal/2026/2026-KW34.md`;

function block(source) {
  document.body.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'perspective-journal-timeline';
  if (source != null) el.dataset.jtSource = source;
  document.body.appendChild(el);
  return el;
}

async function aufbauen(source, basePath = WOCHEN_EINTRAG) {
  const el = block(source);
  applyJournalTimelineIfPresent(document.body, basePath);
  await waitForJournalTimelineIdle();
  return el;
}

function zaehlen(el) {
  return {
    kopf: [...el.querySelectorAll('.timeline-kopf-teil')].map((e) => e.dataset.jtLevel),
    hervor: [...el.querySelectorAll('.timeline-kopf-teil.modus-ebene')].map(
      (e) => e.dataset.jtLevel,
    ),
    monate: el.querySelectorAll('.timeline-monat').length,
    titel: el.querySelectorAll('.timeline-monat-titel').length,
    wochen: el.querySelectorAll('.calendar-week-btn').length,
    tage: el.querySelectorAll('.calendar-day-btn').length,
    hinweis: el.querySelector('.journal-timeline-hint')?.textContent ?? null,
  };
}

beforeEach(() => {
  getConfig.mockReset();
  entriesExist.mockReset();
  openEntry.mockReset();
  onJournalsChanged.mockReset();
  onAreaChanged.mockReset();
  getConfig.mockResolvedValue({ ok: true, hasArea: true, rootPath: ROOT, config: CONFIG });
  entriesExist.mockResolvedValue({ ok: true, exists: {} });
  // Der Existenz-Cache ist Modul-global und lebt bewusst über einen
  // Block-Aufbau hinaus (das Live-Widget baut sein Element bei jedem Mount
  // neu). Für die Prüffälle wird er über den Broadcast-Weg geleert; bei
  // leerem Dokument ist das genau ein Cache-Leeren.
  document.body.innerHTML = '';
  refreshJournalTimelines();
});

describe('Journal-Timeline-Block: die vier Modi', () => {
  it('week zeichnet genau eine Wochen-Zeile', async () => {
    const z = zaehlen(await aufbauen('mode: week'));
    expect(z.monate).toBe(1);
    expect(z.wochen).toBe(1);
    expect(z.tage).toBe(7);
    expect(z.titel).toBe(0);
  });

  it('month zeichnet ein Monatsgitter ohne Monats-Überschrift', async () => {
    const z = zaehlen(await aufbauen('mode: month'));
    expect(z.monate).toBe(1);
    expect(z.titel).toBe(0);
    // August 2026 braucht sechs Wochen-Zeilen (er beginnt an einem Samstag).
    expect(z.wochen).toBe(6);
    expect(z.tage).toBe(42);
  });

  it('quarter zeichnet drei Monatsgitter mit Überschrift', async () => {
    const z = zaehlen(await aufbauen('mode: quarter'));
    expect(z.monate).toBe(3);
    expect(z.titel).toBe(3);
    expect(z.tage).toBe(z.wochen * 7);
  });

  it('calendar zeichnet zwölf Monatsgitter; year wirkt gleich', async () => {
    const z = zaehlen(await aufbauen('mode: calendar'));
    expect(z.monate).toBe(12);
    expect(z.titel).toBe(12);
    // Kalenderjahr 2026: 63 Wochen-Zeilen über die zwölf Gitter.
    expect(z.wochen).toBe(63);
    expect(z.tage).toBe(441);

    const alias = zaehlen(await aufbauen('mode: year'));
    expect(alias.monate).toBe(12);
    expect(alias.tage).toBe(441);
  });

  it('ein leerer Fence-Körper ergibt den Monats-Modus', async () => {
    const z = zaehlen(await aufbauen(''));
    expect(z.monate).toBe(1);
    expect(z.tage).toBe(42);
  });
});

describe('Journal-Timeline-Block: Kopfzeile', () => {
  it('week nennt Woche, Monat und Jahr und hebt die Woche hervor', async () => {
    const z = zaehlen(await aufbauen('mode: week'));
    expect(z.kopf).toEqual(['week', 'month', 'year']);
    expect(z.hervor).toEqual(['week']);
  });

  it('month nennt Monat und Jahr und hebt den Monat hervor', async () => {
    const z = zaehlen(await aufbauen('mode: month'));
    expect(z.kopf).toEqual(['month', 'year']);
    expect(z.hervor).toEqual(['month']);
  });

  it('quarter nennt Quartal und Jahr und hebt das Quartal hervor', async () => {
    const z = zaehlen(await aufbauen('mode: quarter'));
    expect(z.kopf).toEqual(['quarter', 'year']);
    expect(z.hervor).toEqual(['quarter']);
  });

  it('calendar nennt allein das Jahr und hebt es hervor', async () => {
    const z = zaehlen(await aufbauen('mode: calendar'));
    expect(z.kopf).toEqual(['year']);
    expect(z.hervor).toEqual(['year']);
  });

  it('die Kopf-Perioden gehören zum Träger-Eintrag, nicht zu heute', async () => {
    const el = await aufbauen('mode: week');
    const teile = [...el.querySelectorAll('.timeline-kopf-teil')];
    expect(teile.map((e) => e.dataset.jtKey)).toEqual(['2026-W34', '2026-08', '2026']);
  });
});

describe('Journal-Timeline-Block: Zell-Kennzeichnung', () => {
  it('jede Zelle trägt ihre Perioden-Ebene und ihren Schlüssel', async () => {
    const el = await aufbauen('mode: week');
    const tage = [...el.querySelectorAll('.calendar-day-btn')];
    expect(tage[0].dataset.jtLevel).toBe('day');
    expect(tage[0].dataset.jtKey).toBe('2026-08-17');
    expect(tage[6].dataset.jtKey).toBe('2026-08-23');
    const woche = el.querySelector('.calendar-week-btn');
    expect(woche.dataset.jtLevel).toBe('week');
    expect(woche.dataset.jtKey).toBe('2026-W34');
  });
});

describe('Journal-Timeline-Block: Degradation', () => {
  it('außerhalb eines Journal-Eintrags erscheint der Hinweis statt eines Gitters', async () => {
    const z = zaehlen(await aufbauen('mode: month', `${ROOT}/Notizen/Irgendetwas.md`));
    expect(z.hinweis).toBe('journalTimeline.noEntry');
    expect(z.tage).toBe(0);
  });

  it('ohne Bereich erscheint derselbe Hinweis', async () => {
    getConfig.mockResolvedValue({ ok: true, hasArea: false, rootPath: null, config: null });
    const z = zaehlen(await aufbauen('mode: month'));
    expect(z.hinweis).toBe('journalTimeline.noEntry');
  });

  it('ein unbekannter Modus meldet den Fehler, statt still auf month zu fallen', async () => {
    const z = zaehlen(await aufbauen('mode: dekade'));
    expect(z.hinweis).toBe('journalTimeline.badMode');
    expect(z.tage).toBe(0);
  });

  it('ein unbekannter Schlüssel meldet den Fehler', async () => {
    const z = zaehlen(await aufbauen('journal: tagebuch'));
    expect(z.hinweis).toBe('journalTimeline.badKey');
  });

  it('ein Fehler der Konfigurations-Brücke degradiert zum Hinweis', async () => {
    getConfig.mockRejectedValue(new Error('IPC weg'));
    const z = zaehlen(await aufbauen('mode: month'));
    expect(z.hinweis).toBe('journalTimeline.noEntry');
  });
});

// --- 4T-1065 (Epic 3E-0212): Punkte, Klick-Ziele, Leistung -------------------------

describe('Journal-Timeline-Block: Punkt-Markierung', () => {
  it('fragt genau die Pfade des Tages-Journals im Regal ab, in EINEM Batch', async () => {
    await aufbauen('mode: month');
    expect(entriesExist).toHaveBeenCalledTimes(1);
    const pfade = entriesExist.mock.calls[0][0];
    // August 2026 spannt 42 Gitter-Tage über drei Kalender-Monate.
    expect(pfade).toHaveLength(42);
    expect(pfade).toContain('Journal/2026/2026-08-20.md');
    expect(new Set(pfade).size).toBe(pfade.length);
  });

  it('setzt den Punkt genau an den Tagen, die der Batch als vorhanden meldet', async () => {
    entriesExist.mockResolvedValue({
      ok: true,
      exists: { 'Journal/2026/2026-08-20.md': true, 'Journal/2026/2026-08-21.md': false },
    });
    const el = await aufbauen('mode: month');
    const punkte = [...el.querySelectorAll('.calendar-day-btn.has-entry')];
    expect(punkte.map((e) => e.dataset.jtKey)).toEqual(['2026-08-20']);
  });

  it('der Jahres-Modus bleibt mit 371 Pfaden unter der Kappung des Batches', async () => {
    await aufbauen('mode: calendar');
    const pfade = entriesExist.mock.calls[0][0];
    expect(pfade).toHaveLength(371);
    expect(pfade.length).toBeLessThan(1000);
  });

  it('ohne Tages-Journal im Regal entfällt der Batch ganz', async () => {
    getConfig.mockResolvedValue({
      ok: true,
      hasArea: true,
      rootPath: ROOT,
      config: { shelves: ['Tagebuch'], journals: [CONFIG.journals[0]] },
    });
    const el = await aufbauen('mode: month');
    expect(entriesExist).not.toHaveBeenCalled();
    expect(el.querySelectorAll('.calendar-day-btn.has-entry')).toHaveLength(0);
  });

  it('ein Fehler des Batches lässt das Gitter stehen, nur ohne Punkte', async () => {
    entriesExist.mockRejectedValue(new Error('IPC weg'));
    const el = await aufbauen('mode: month');
    expect(el.querySelectorAll('.calendar-day-btn')).toHaveLength(42);
    expect(el.querySelectorAll('.calendar-day-btn.has-entry')).toHaveLength(0);
  });

  it('ein Broadcast baut die eingehängten Blöcke neu auf', async () => {
    await aufbauen('mode: month');
    entriesExist.mockClear();
    refreshJournalTimelines();
    await waitForJournalTimelineIdle();
    expect(entriesExist).toHaveBeenCalledTimes(1);
  });

  it('initJournalTimeline hängt sich an beide Broadcasts', () => {
    initJournalTimeline();
    expect(onJournalsChanged).toHaveBeenCalledTimes(1);
    expect(onAreaChanged).toHaveBeenCalledTimes(1);
  });
});

describe('Journal-Timeline-Block: Klick-Ziele', () => {
  it('ein Klick auf einen Tag öffnet den Tages-Eintrag des Regals', async () => {
    const el = await aufbauen('mode: week');
    el.querySelector('.calendar-day-btn[data-jt-key="2026-08-20"]').click();
    await waitForJournalTimelineIdle();
    expect(openEntry).toHaveBeenCalledTimes(1);
    const [journal, period, opts] = openEntry.mock.calls[0];
    expect(journal.id).toBe('tag');
    expect(period.key).toBe('2026-08-20');
    expect(opts).toEqual({ inheritGroup: true });
  });

  it('ein Klick auf die KW-Zelle öffnet den Wochen-Eintrag', async () => {
    const el = await aufbauen('mode: week');
    el.querySelector('.calendar-week-btn').click();
    await waitForJournalTimelineIdle();
    const [journal, period] = openEntry.mock.calls[0];
    expect(journal.id).toBe('woche');
    expect(period.key).toBe('2026-W34');
  });

  it('ein Klick auf die hervorgehobene Kopf-Ebene öffnet deren Eintrag', async () => {
    const el = await aufbauen('mode: week');
    el.querySelector('.timeline-kopf-teil.modus-ebene').click();
    await waitForJournalTimelineIdle();
    expect(openEntry.mock.calls[0][1].key).toBe('2026-W34');
  });

  it('Ebenen ohne Journal im Regal sind reine Anzeige und lösen nichts aus', async () => {
    const el = await aufbauen('mode: week');
    // Im Regal gibt es nur Tages- und Wochen-Journal; Monat und Jahr nicht.
    const tot = [...el.querySelectorAll('.timeline-kopf-teil.ohne-ziel')];
    expect(tot.map((e) => e.dataset.jtLevel)).toEqual(['month', 'year']);
    tot[0].click();
    await waitForJournalTimelineIdle();
    expect(openEntry).not.toHaveBeenCalled();
  });

  it('außerhalb der Datums-Grenzen des Journals bleibt die Zelle ohne Klick-Ziel', async () => {
    getConfig.mockResolvedValue({
      ok: true,
      hasArea: true,
      rootPath: ROOT,
      config: {
        shelves: ['Tagebuch'],
        journals: [CONFIG.journals[0], { ...CONFIG.journals[1], endDate: '2026-08-20' }],
      },
    });
    const el = await aufbauen('mode: week');
    const gesperrt = [...el.querySelectorAll('.calendar-day-btn.gesperrt')];
    expect(gesperrt.map((e) => e.dataset.jtKey)).toEqual([
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ]);
    gesperrt[0].click();
    await waitForJournalTimelineIdle();
    expect(openEntry).not.toHaveBeenCalled();
  });
});

describe('Journal-Timeline-Block: Leistung des Jahres-Modus', () => {
  it('trägt EINEN Klick-Listener statt einen je Zelle', async () => {
    // Der Jahres-Modus zeichnet 441 Tages- und 63 KW-Zellen. Gezählt werden
    // die addEventListener-Aufrufe während des Aufbaus: mit Delegation ist
    // es genau einer, ohne wären es über fünfhundert.
    const echt = window.HTMLElement.prototype.addEventListener;
    let zaehler = 0;
    window.HTMLElement.prototype.addEventListener = function (...args) {
      zaehler++;
      return echt.apply(this, args);
    };
    try {
      const el = await aufbauen('mode: calendar');
      expect(el.querySelectorAll('[data-jt-level]')).toHaveLength(441 + 63 + 12 + 1);
      expect(zaehler).toBe(1);
    } finally {
      window.HTMLElement.prototype.addEventListener = echt;
    }
  });

  it('ein Wiedereinhängen desselben Stands kostet keinen zweiten Batch', async () => {
    await aufbauen('mode: calendar');
    expect(entriesExist).toHaveBeenCalledTimes(1);
    applyJournalTimelineIfPresent(document.body, WOCHEN_EINTRAG);
    await waitForJournalTimelineIdle();
    expect(entriesExist).toHaveBeenCalledTimes(1);
  });
});

// --- 4T-1066 (Epic 3E-0212): Portable-Export ---------------------------------------

describe('Journal-Timeline-Block: Portable-Export', () => {
  const FENCE = (mode) => '```perspective-journal-timeline\nmode: ' + mode + '\n```';

  it('ersetzt den Fence durch Perioden-Beschriftung und Pipe-Tabelle', async () => {
    const out = await replaceJournalTimelineFencesForExport(FENCE('week'), WOCHEN_EINTRAG);
    expect(out).not.toContain('perspective-journal-timeline');
    expect(out).toContain('**journalNav.weekLabel**');
    // Kopfzeile der Tabelle: KW-Spalte plus sieben Wochentage.
    expect(out).toContain('| calendar.weekColumn |');
    expect(out.split('\n').filter((z) => z.startsWith('| 34 |'))).toHaveLength(1);
  });

  it('markiert vorhandene Einträge und den heutigen Tag', async () => {
    entriesExist.mockResolvedValue({
      ok: true,
      exists: { 'Journal/2026/2026-08-18.md': true },
    });
    const out = await replaceJournalTimelineFencesForExport(FENCE('week'), WOCHEN_EINTRAG);
    expect(out).toContain('18 •');
    // Der heutige Tag steht fett; welcher das ist, hängt am Testlauf-Datum,
    // deshalb wird nur die Form geprüft.
    expect(out).toMatch(/\| 34 \|.*\|/);
  });

  it('quarter ergibt drei Tabellen, calendar zwölf, je mit Monatsnamen', async () => {
    const quartal = await replaceJournalTimelineFencesForExport(FENCE('quarter'), WOCHEN_EINTRAG);
    expect(quartal.match(/\| calendar\.weekColumn \|/g)).toHaveLength(3);
    const jahr = await replaceJournalTimelineFencesForExport(FENCE('calendar'), WOCHEN_EINTRAG);
    expect(jahr.match(/\| calendar\.weekColumn \|/g)).toHaveLength(12);
    expect(jahr).toContain('*Januar*');
    expect(jahr).toContain('*Dezember*');
  });

  it('lässt den Fence außerhalb eines Journal-Eintrags unverändert', async () => {
    const src = FENCE('month');
    const out = await replaceJournalTimelineFencesForExport(src, `${ROOT}/Notizen/Etwas.md`);
    expect(out).toBe(src);
  });

  it('lässt einen Fence mit fehlerhaftem Modus unverändert', async () => {
    const src = '```perspective-journal-timeline\nmode: dekade\n```';
    const out = await replaceJournalTimelineFencesForExport(src, WOCHEN_EINTRAG);
    expect(out).toBe(src);
  });

  it('rührt einen Text ohne Timeline-Fence nicht an und fragt nichts ab', async () => {
    const src = 'Nur Text mit einem ```perspective-journal-nav\n```-Block.';
    expect(await replaceJournalTimelineFencesForExport(src, WOCHEN_EINTRAG)).toBe(src);
    expect(getConfig).not.toHaveBeenCalled();
  });

  it('beschafft die Punkte je Modus einmal, auch bei mehreren gleichen Fences', async () => {
    const src = `${FENCE('month')}\n\n${FENCE('month')}\n\n${FENCE('week')}`;
    const out = await replaceJournalTimelineFencesForExport(src, WOCHEN_EINTRAG);
    expect(out).not.toContain('perspective-journal-timeline');
    // Zwei Modi, also zwei Batches — nicht drei.
    expect(entriesExist).toHaveBeenCalledTimes(2);
  });
});

describe('Journal-Timeline-Block: Wiederholter Aufbau', () => {
  it('ein zweiter Lauf ersetzt den Inhalt, statt ihn zu verdoppeln', async () => {
    const el = await aufbauen('mode: month');
    const erste = zaehlen(el);
    applyJournalTimelineIfPresent(document.body, WOCHEN_EINTRAG);
    await waitForJournalTimelineIdle();
    expect(zaehlen(el)).toEqual(erste);
  });

  it('ohne Timeline-Block im Container passiert nichts', async () => {
    document.body.innerHTML = '<div class="etwas-anderes"></div>';
    applyJournalTimelineIfPresent(document.body, WOCHEN_EINTRAG);
    await waitForJournalTimelineIdle();
    expect(getConfig).not.toHaveBeenCalled();
  });
});
