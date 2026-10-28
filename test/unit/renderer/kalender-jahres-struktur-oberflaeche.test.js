// @vitest-environment jsdom
// 4T-002363 (Epic 3E-000333), Schritt 8: Oberfläche des Bausteins «Jahres-Struktur
// je Jahr» — Eingabe-Hilfe, Dialog «Datum umrechnen», Anzeige eines Werts im
// Dokument und der Entwurf der Einstellungen lesen den Startpunkt über die
// Kern-Auskunft `calendarStartPoint` statt über das Anker-Datum, sagen außerhalb
// des Geltungs-Zeitraums «nicht bekannt» und beschriften einen Schaltmonat mit
// Namen und Kennung nach B1.
//
// Die Liste der Regeln und Tafeln des Programms ist leer; geprüft wird mit der
// Probe-Tafel aus test/fixtures/kalender-jahres-struktur/ über den Prüf-Zugang
// `setYearlySourcesForTests`. Der Zugang wirkt nur auf die Instanz, die der Kern
// mit `require` lädt; die Prüfdatei holt ihn deshalb über den CommonJS-Lader
// (wie test/unit/kalender-jahres-struktur.test.js). Im Ablauf-Prüfstand ist er
// nicht erreichbar, weil das gebaute Programm ihn nirgends anbietet.
//
// Die Übersetzung ist eine Attrappe, die den Schlüssel zurückgibt (beim Schlüssel
// mit Platzhalter samt `{name}`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import './api-stub.js';
import probeTafel from '../../fixtures/kalender-jahres-struktur/probe-tafel.js';

const MIT_PLATZHALTER = new Set(['calendarConvert.unknown', 'calendarConvert.outOfRange']);
vi.mock('../../../src/renderer/i18n.js', async (importOriginal) => ({
  ...(await importOriginal()),
  t: (key) => (MIT_PLATZHALTER.has(key) ? `${key} {name}` : key),
}));

const require = createRequire(import.meta.url);
const { setYearlySourcesForTests } = require('../../../src/shared/calendar/calendar-yearly.js');
const { calendarStartPoint, normalizeCalendarConfig } =
  await import('../../../src/shared/calendar/calendar-config.js');
const { cycleAt, formatTuple } = await import('../../../src/shared/calendar/calendar-core.js');
const { createGregorianTemplate } =
  await import('../../../src/shared/calendar/calendar-template.js');
const { calendarValueBadgeSpec, calendarValuesPlugin } =
  await import('../../../src/shared/markdown/plugins/calendar.js');
const { labelsAus } = await import('../../../src/shared/markdown/portable-labels.js');
const MarkdownIt = (await import('markdown-it')).default;
const { showCalendarPicker } =
  await import('../../../src/renderer/modules/calendar/calendar-picker.js');
const { showCalendarConvertDialog } =
  await import('../../../src/renderer/modules/calendar/calendar-convert-dialog.js');
const { calendarToDraft, calendarPersistForm } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');

// --- Zeitrechnungen -------------------------------------------------------------

// Namen der 24 Namens-Stellen der Probe-Tafel: die zwölf Monate, dahinter die
// zwölf möglichen Schaltmonate (der Schaltmonat nach dem m-ten trägt die
// Stelle 12 + m − 1).
const NAMEN = [
  ...Array.from({ length: 12 }, (_, i) => `M${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `S${i + 1}`),
];

// Zeitrechnung «tafel» auf der Probe-Tafel (Jahre 4700 bis 4703, erster Tag der
// 05.02.2000), ohne Anker-Datum, mit Woche und Zeitalter.
function tafelRoh() {
  return {
    id: 'tafel',
    name: 'tafel',
    levels: [
      { id: 'second', name: 'Sekunde', section: 'Zeit', start: 0 },
      {
        id: 'minute',
        name: 'Minute',
        section: 'Zeit',
        start: 0,
        rel: { type: 'factor', count: 60 },
      },
      { id: 'hour', name: 'Stunde', section: 'Zeit', start: 0, rel: { type: 'factor', count: 60 } },
      { id: 'day', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 24 } },
      {
        id: 'month',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        names: NAMEN,
        rel: { type: 'byYear' },
      },
      {
        id: 'year',
        name: 'Jahr',
        section: 'Datum',
        start: 1,
        rel: { type: 'yearly', table: 'probe' },
      },
    ],
    // Die Woche zählt ab Montag wie in den Vorlagen; der erste Tag der Tafel,
    // der 05.02.2000, ist ein Samstag und steht damit nicht am Anfang einer
    // Gitter-Zeile (Nachbesserung vom 2026-10-24).
    cycles: [
      {
        id: 'woche',
        name: 'Woche',
        of: 'day',
        length: 7,
        anchor: { tuple: [4700, 1, 1], position: 5 },
      },
    ],
    epochs: [
      { name: 'vorher', abbr: 'v', start: null },
      { name: 'Ära', abbr: 'Ä', start: [1, 1, 1] },
    ],
    blockScale: { num: 1, den: 1 },
  };
}

function konfiguration() {
  const greg = { ...createGregorianTemplate({}), id: 'greg', name: 'greg' };
  return normalizeCalendarConfig({ blocks: [{ id: 'b', calendars: [greg, tafelRoh()] }] });
}

function kalender(config, id) {
  return config.blocks[0].calendars.find((c) => c.id === id);
}

// --- Bedienung ------------------------------------------------------------------

const text = (id) => document.getElementById(id).textContent;
const klick = (id) => document.getElementById(id).click();

// Öffnet die Eingabe-Hilfe, führt die Handgriffe aus, liest die Auskünfte und
// übernimmt mit «OK».
async function hilfe(options, handgriffe = []) {
  const ergebnis = showCalendarPicker(options);
  const vorher = {
    kopf: text('calendar-picker-unit-label'),
    hinweis: document.getElementById('calendar-picker-unknown')?.textContent ?? null,
    zeilen: [...document.querySelectorAll('.calendar-picker-conv')].map((b) => b.textContent),
  };
  for (const id of handgriffe) klick(id);
  const nachher = {
    kopf: text('calendar-picker-unit-label'),
    hinweis: document.getElementById('calendar-picker-unknown')?.textContent ?? null,
  };
  klick('calendar-picker-ok');
  return { vorher, nachher, wert: (await ergebnis).text };
}

beforeEach(() => {
  setYearlySourcesForTests({ tables: { probe: probeTafel } });
  for (const el of [...document.body.children]) {
    if (el.id !== 'calendar-picker-popup') el.remove();
  }
});

afterEach(() => {
  document.getElementById('calendar-convert-close')?.click();
  setYearlySourcesForTests(null);
});

describe('Eingabe-Hilfe bei Jahres-Struktur (4T-002363, Schritt 8)', () => {
  it('ohne Wert steht sie auf dem Startpunkt, dem ersten Tag des Zeitraums', async () => {
    const config = konfiguration();
    const tafel = kalender(config, 'tafel');
    expect(tafel.blockAnchor).toBeUndefined();
    const start = formatTuple(tafel, calendarStartPoint(tafel));
    expect(start.startsWith('4700-01-01')).toBe(true);
    expect((await hilfe({ config, calendarName: 'tafel' })).wert).toBe(start);
  });

  it('«Referenz» springt zum Startpunkt', async () => {
    const config = konfiguration();
    const tafel = kalender(config, 'tafel');
    const r = await hilfe({ config, calendarName: 'tafel', value: '4702-07-12' }, [
      'calendar-picker-reference',
    ]);
    expect(r.wert).toBe(formatTuple(tafel, calendarStartPoint(tafel)));
  });

  it('auf einem Wert außerhalb geöffnet: «nicht bekannt» und Auswahl auf dem Startpunkt', async () => {
    const config = konfiguration();
    const tafel = kalender(config, 'tafel');
    const r = await hilfe({ config, calendarName: 'tafel', value: '4699-03-01' }, [
      'calendar-picker-next',
    ]);
    expect(r.vorher.hinweis).toBe('calendarConvert.unknown tafel');
    expect(r.vorher.kopf).toBe('M1 4700');
    // Nach dem ersten Schritt steht die Auswahl nicht mehr auf dem Startpunkt.
    expect(r.nachher.hinweis).toBeNull();
    expect(r.wert.startsWith('4700-02-01')).toBe(true);
    // Ein Wert im Zeitraum, auch auf dem Startpunkt selbst, zeigt keinen Hinweis.
    const innen = await hilfe({ config, calendarName: 'tafel', value: '4700-01-01' });
    expect(innen.vorher.hinweis).toBeNull();
    expect(innen.wert).toBe(formatTuple(tafel, calendarStartPoint(tafel)));
  });

  it('die Entsprechung sagt «nicht bekannt» statt eines Strichs, im Zeitraum den Wert', async () => {
    const config = konfiguration();
    const davor = await hilfe({ config, calendarName: 'greg', value: '2000-02-04' });
    expect(davor.vorher.zeilen).toEqual(['calendarConvert.unknown tafel']);
    const erster = await hilfe({ config, calendarName: 'greg', value: '2000-02-05' });
    expect(erster.vorher.zeilen).toHaveLength(1);
    expect(erster.vorher.zeilen[0].startsWith('tafel: 4700-01-01')).toBe(true);
  });

  it('der Schaltmonat trägt im Kopf seinen Namen und die Kennung nach B1', async () => {
    const config = konfiguration();
    const kopf = async (value) =>
      (await hilfe({ config, calendarName: 'tafel', value })).vorher.kopf;
    expect(await kopf('4701-04-01')).toBe('M4 4701');
    expect(await kopf('4701-04L-01')).toBe('S4 (04L) 4701');
    expect(await kopf('4701-05-01')).toBe('M5 4701');
    // Blättern vom 4. Monat führt über den Schaltmonat.
    const r = await hilfe({ config, calendarName: 'tafel', value: '4701-04-10' }, [
      'calendar-picker-next',
    ]);
    expect(r.nachher.kopf).toBe('S4 (04L) 4701');
    expect(r.wert.startsWith('4701-04L-10')).toBe(true);
  });

  it('das Blättern über den Rand des Zeitraums bleibt am Rand stehen', async () => {
    const config = konfiguration();
    const vor = await hilfe({ config, calendarName: 'tafel', value: '4703-03-05' }, [
      'calendar-picker-next-top',
    ]);
    expect(vor.nachher.kopf).toBe('M3 4703');
    expect(vor.wert.startsWith('4703-03-05')).toBe(true);
    const zurueck = await hilfe({ config, calendarName: 'tafel', value: '4700-03-05' }, [
      'calendar-picker-prev-top',
    ]);
    expect(zurueck.wert.startsWith('4700-03-05')).toBe(true);
    const innen = await hilfe({ config, calendarName: 'tafel', value: '4702-03-05' }, [
      'calendar-picker-next-top',
    ]);
    expect(innen.wert.startsWith('4703-03-05')).toBe(true);
  });

  it('Schutz-Fall: eine Zeitrechnung ohne Jahres-Struktur startet am Anker-Datum wie bisher', async () => {
    const config = konfiguration();
    const greg = kalender(config, 'greg');
    expect(calendarStartPoint(greg)).toEqual(greg.blockAnchor);
    const r = await hilfe({ config, calendarName: 'greg' }, ['calendar-picker-reference']);
    expect(r.wert).toBe(formatTuple(greg, greg.blockAnchor));
    expect(r.vorher.kopf).toBe('Januar 1 v. Chr.');
  });
});

// Liest das Tages-Gitter der offenen Eingabe-Hilfe: Tage der Einheit, Rand-Tage
// der Nachbar-Einheiten, leere Zellen außerhalb des Zeitraums (ihre Stellen)
// und den gewählten Tag.
function gitter() {
  const grid = document.getElementById('calendar-picker-grid');
  const tage = [...grid.querySelectorAll('.calendar-picker-day')];
  const zellen = [...grid.children].filter((el) => !el.classList.contains('calendar-head'));
  return {
    tage: tage.filter((b) => !b.classList.contains('other-month')).map((b) => b.textContent),
    leer: zellen.flatMap((el, i) => (el.classList.contains('calendar-picker-empty') ? [i] : [])),
    zellen: zellen.length,
    gewaehlt: grid.querySelector('.calendar-picker-day.selected')?.textContent ?? null,
  };
}

// Nachbesserung vom 2026-10-24: Beginnt die Tafel nicht am ersten Tag einer
// Wochen-Zeile, liegt der Vorlauf ihres ersten Monats vor dem Zeitraum; das
// Gitter brach dort an der ersten Zeile ab, statt die Zellen leer zu lassen.
describe('Tages-Gitter am Rand des Zeitraums (4T-002363, Nachbesserung vom 2026-10-24)', () => {
  const tageBis = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

  it('der erste Monat der Tafel zeigt alle Tage, der Vorlauf davor bleibt leer', async () => {
    const config = konfiguration();
    const tafel = kalender(config, 'tafel');
    const start = calendarStartPoint(tafel);
    const vorlauf = cycleAt(tafel, start, 'woche').position;
    // Die Probe trägt nur, wenn der erste Tag nicht am Zeilen-Anfang steht.
    expect(vorlauf).toBeGreaterThan(0);
    const ergebnis = showCalendarPicker({ config, calendarName: 'tafel' });
    const g = gitter();
    expect(text('calendar-picker-unit-label')).toBe('M1 4700');
    expect(g.tage).toEqual(tageBis(29));
    expect(g.gewaehlt).toBe('1');
    // Die Vorlauf-Zellen stehen vorn und sind leer; die Zeilen bleiben voll.
    expect(g.leer).toEqual(Array.from({ length: vorlauf }, (_, i) => i));
    expect(g.zellen % 7).toBe(0);
    klick('calendar-picker-ok');
    expect((await ergebnis).text).toBe(formatTuple(tafel, start));
  });

  it('der letzte Monat der Tafel zeigt alle Tage, der Nachlauf danach bleibt leer', async () => {
    const config = konfiguration();
    const ergebnis = showCalendarPicker({ config, calendarName: 'tafel', value: '4703-12-30' });
    const g = gitter();
    expect(text('calendar-picker-unit-label')).toBe('M12 4703');
    expect(g.tage).toEqual(tageBis(30));
    expect(g.gewaehlt).toBe('30');
    // Leere Zellen nur am Ende; zusammen mit den Tagen füllen sie die Zeilen.
    expect(g.leer.length).toBeGreaterThan(0);
    expect(g.leer).toEqual(
      Array.from({ length: g.leer.length }, (_, i) => g.zellen - g.leer.length + i),
    );
    expect(g.zellen % 7).toBe(0);
    klick('calendar-picker-ok');
    expect((await ergebnis).text.startsWith('4703-12-30')).toBe(true);
  });

  it('«Referenz» landet auf dem gefüllten ersten Monat', async () => {
    const config = konfiguration();
    const ergebnis = showCalendarPicker({ config, calendarName: 'tafel', value: '4702-07-12' });
    klick('calendar-picker-reference');
    const g = gitter();
    expect(text('calendar-picker-unit-label')).toBe('M1 4700');
    expect(g.tage).toEqual(tageBis(29));
    expect(g.gewaehlt).toBe('1');
    klick('calendar-picker-ok');
    await ergebnis;
  });
});

describe('Dialog «Datum umrechnen» bei Jahres-Struktur (4T-002363, Schritt 8)', () => {
  const feld = () => document.getElementById('calendar-convert-date');
  const meldung = () => document.getElementById('calendar-convert-invalid');

  it('ohne Wert beginnt er am Startpunkt der Zeitrechnung', () => {
    const config = konfiguration();
    const tafel = kalender(config, 'tafel');
    showCalendarConvertDialog({ config, calendarName: 'tafel' });
    expect(feld().value).toBe(formatTuple(tafel, calendarStartPoint(tafel)));
    expect(meldung().hidden).toBe(true);
  });

  it('ein Ausgangs-Wert außerhalb heißt «nicht bekannt», nicht «ungültig»', () => {
    const config = konfiguration();
    showCalendarConvertDialog({ config, calendarName: 'tafel', value: '4699-05-01' });
    expect(meldung().hidden).toBe(false);
    expect(meldung().textContent).toBe('calendarConvert.unknown tafel');
    // Schutz-Fall: ein unlesbarer Wert bleibt «ungültig».
    feld().value = '4700-xx';
    feld().dispatchEvent(new Event('input'));
    expect(meldung().textContent).toBe('calendarConvert.invalid');
  });

  it('die Zeile einer Ziel-Zeitrechnung außerhalb sagt «nicht bekannt»', () => {
    const config = konfiguration();
    showCalendarConvertDialog({ config, calendarName: 'greg', value: '2000-02-04' });
    const zeile = document.querySelector('.calendar-convert-row-text[data-calendar-id="tafel"]');
    expect(zeile.textContent).toBe('calendarConvert.unknown tafel');
  });

  it('der Wechsel auf eine Zeitrechnung, die den Tag nicht kennt, springt auf ihren Startpunkt', () => {
    const config = konfiguration();
    const tafel = kalender(config, 'tafel');
    showCalendarConvertDialog({ config, calendarName: 'greg', value: '1999-01-01' });
    const auswahl = document.getElementById('calendar-convert-calendar');
    auswahl.value = 'tafel';
    auswahl.dispatchEvent(new Event('change'));
    expect(feld().value).toBe(formatTuple(tafel, calendarStartPoint(tafel)));
    expect(meldung().hidden).toBe(true);
  });
});

describe('Wert im Dokument bei Jahres-Struktur (4T-002363, Schritt 8)', () => {
  const L = (key) => ({ 'calendarConvert.unknown': '{name}: nicht bekannt' })[key];

  it('ein Wert außerhalb ist eine eigene Auskunft mit dem Namen im Kurzhinweis', () => {
    const config = konfiguration();
    const spec = calendarValueBadgeSpec('tafel', '4699-01-01', config, L);
    expect(spec).toEqual({
      cls: 'calendar-value calendar-value-notknown',
      title: 'tafel: nicht bekannt',
      text: '@{tafel: 4699-01-01}',
      ok: false,
      unknown: true,
    });
    // Ohne Beschriftungen bleibt der Name der Zeitrechnung.
    expect(calendarValueBadgeSpec('tafel', '4704-01-01', config, null).title).toBe('tafel');
  });

  it('Schutz-Fälle: im Zeitraum ein Wert mit Namen, ein unlesbarer Wert bleibt ungültig', () => {
    const config = konfiguration();
    expect(calendarValueBadgeSpec('tafel', '4701-04L-02', config, L)).toMatchObject({
      cls: 'calendar-value',
      text: '4701-S4-02',
      ok: true,
    });
    expect(calendarValueBadgeSpec('tafel', '4701-14-02', config, L).cls).toBe(
      'calendar-value calendar-value-invalid',
    );
  });

  it('Vorschau und Export: Klasse, Kurzhinweis und Gestaltung im portablen Export', () => {
    const config = konfiguration();
    const env = {
      calendarSystems: config,
      calendarLabels: { 'calendarConvert.unknown': '{name}: ?!' },
    };
    const md = new MarkdownIt();
    calendarValuesPlugin(md);
    const html = md.render('@{tafel: 4699-01-01}', env);
    expect(html).toContain('class="calendar-value calendar-value-notknown" title="tafel: ?!"');
    const portabel = new MarkdownIt();
    calendarValuesPlugin(portabel, { portable: true });
    const out = portabel.render('@{tafel: 4699-01-01} @{tafel: 4701-14-02}', env);
    // «nicht bekannt» trägt die gewöhnliche Gestaltung, nur der unlesbare Wert die
    // Fehler-Markierung.
    expect(out.match(/border:1px solid #c8ccd4/g)).toHaveLength(1);
    expect(out.match(/border:1px dashed #c0392b/g)).toHaveLength(1);
  });

  it('der Text reist mit den Beschriftungen von Vorschau und Export', () => {
    expect(labelsAus({ 'calendarConvert.unknown': '{name}: nicht bekannt' })).toMatchObject({
      'calendarConvert.unknown': '{name}: nicht bekannt',
    });
  });
});

describe('Entwurf der Einstellungen ohne Anker-Datum (4T-002363, Schritt 8)', () => {
  it('Feld «Anker» leer, Vorschau auf dem Startpunkt, kein Anker beim Zurückschreiben', () => {
    const config = konfiguration();
    const tafel = kalender(config, 'tafel');
    const entwurf = calendarToDraft(tafel);
    expect(entwurf.anchorSegs).toEqual(['', '', '', '', '', '']);
    expect(entwurf.previewInput).toBe(formatTuple(tafel, calendarStartPoint(tafel)));
    expect(calendarPersistForm(entwurf)).not.toHaveProperty('blockAnchor');
  });

  it('Schutz-Fall: mit Anker-Datum stehen Feld und Vorschau auf dem Anker wie bisher', () => {
    const greg = kalender(konfiguration(), 'greg');
    const entwurf = calendarToDraft(greg);
    expect(entwurf.anchorSegs).toEqual(greg.blockAnchor.map(String));
    expect(entwurf.previewInput).toBe(formatTuple(greg, greg.blockAnchor));
    expect(calendarPersistForm(entwurf).blockAnchor).toEqual(greg.blockAnchor);
  });
});
