// 4T-0525 (Epic 3E-0095): Unit-Tests des Erinnerungs-Kerns
// (src/shared/reminders.js): Konfigurations-Normalisierung (Default-Uhrzeit,
// Snooze-Set), deterministischer Bezugszeitpunkt (injiziertes Date),
// Melde-Zeitpunkt, Anker-Sammlung mit Global-Filter und Status-Typ-Filter,
// Faelligkeit, Panel-Gruppierung ueber Monats-/Jahres-Grenzen und die
// Snooze-Rechnung mit Tages-Uebertrag. Alle Zeitpunkte kommen injiziert; die
// Fixture-Datumswerte liegen in 2020/2099 (nie in der realen Gegenwart).
//
// Testdateien laufen unter Vitest in ESM-Syntax (vitest.config.mjs); das
// CJS-Modul reminders.js wird ueber die ESM-Interop importiert (Konvention der
// bestehenden shared-Tests, z.B. task-markers.test.js).
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REMINDER_TIME,
  DEFAULT_SNOOZE_OPTIONS,
  normalizeRemindersConfig,
  normalizeSnoozeOptions,
  localNowString,
  reminderInstant,
  reminderKey,
  collectReminders,
  computeDue,
  groupForPanel,
  snoozedReminderValue,
} from '../../src/shared/reminders.js';

// Status-Typ-Resolver wie der IPC-Handler, aber ohne Settings: erledigte und
// stornierte Zeichen loesen keine Erinnerung aus, offene und unbekannte schon.
const statusTypeOf = (ch) =>
  ch === 'x' ? 'DONE' : ch === '-' ? 'CANCELLED' : ch === ' ' ? 'TODO' : null;

// --- 1. Konfigurations-Normalisierung ----------------------------------------------
describe('normalizeSnoozeOptions (4T-0525)', () => {
  it('faellt bei null oder Defekt auf das Standard-Set (10m/1h/4h/1d/1w) zurueck', () => {
    expect(normalizeSnoozeOptions(null)).toEqual(DEFAULT_SNOOZE_OPTIONS);
    expect(normalizeSnoozeOptions('kaputt')).toEqual(DEFAULT_SNOOZE_OPTIONS);
    expect(normalizeSnoozeOptions(undefined)).toEqual([
      { amount: 10, unit: 'm' },
      { amount: 1, unit: 'h' },
      { amount: 4, unit: 'h' },
      { amount: 1, unit: 'd' },
      { amount: 1, unit: 'w' },
    ]);
  });

  it('behaelt gueltige Eintraege in Reihenfolge', () => {
    expect(
      normalizeSnoozeOptions([
        { amount: 5, unit: 'm' },
        { amount: 2, unit: 'h' },
        { amount: 3, unit: 'd' },
      ]),
    ).toEqual([
      { amount: 5, unit: 'm' },
      { amount: 2, unit: 'h' },
      { amount: 3, unit: 'd' },
    ]);
  });

  it('wirft ungueltige Eintraege heraus (amount 0, unbekannte Einheit)', () => {
    expect(
      normalizeSnoozeOptions([
        { amount: 0, unit: 'm' },
        { amount: 3, unit: 'x' },
        { amount: 2, unit: 'd' },
      ]),
    ).toEqual([{ amount: 2, unit: 'd' }]);
  });

  it('faellt auf das Default-Set, wenn nach dem Filtern nichts uebrig bleibt oder die Liste leer ist', () => {
    expect(normalizeSnoozeOptions([{ amount: 0, unit: 'm' }])).toEqual(DEFAULT_SNOOZE_OPTIONS);
    expect(normalizeSnoozeOptions([])).toEqual(DEFAULT_SNOOZE_OPTIONS);
  });
});

describe('normalizeRemindersConfig (4T-0525)', () => {
  it('liefert bei null die Defaults (Uhrzeit 09:00, Standard-Snooze, ohne System-Notification)', () => {
    expect(normalizeRemindersConfig(null)).toEqual({
      defaultTime: '09:00',
      snoozeOptions: DEFAULT_SNOOZE_OPTIONS,
      systemNotification: false,
    });
    expect(DEFAULT_REMINDER_TIME).toBe('09:00');
  });

  it('behaelt eine gueltige Default-Uhrzeit und uebernimmt systemNotification nur bei true', () => {
    expect(
      normalizeRemindersConfig({ defaultTime: '07:30', systemNotification: true }),
    ).toMatchObject({
      defaultTime: '07:30',
      systemNotification: true,
    });
    expect(normalizeRemindersConfig({ systemNotification: 'ja' }).systemNotification).toBe(false);
  });

  it('faellt bei formfremder oder ungueltiger Uhrzeit auf 09:00 zurueck', () => {
    expect(normalizeRemindersConfig({ defaultTime: '99:99' }).defaultTime).toBe('09:00');
    expect(normalizeRemindersConfig({ defaultTime: '7:30' }).defaultTime).toBe('09:00');
    expect(normalizeRemindersConfig({ defaultTime: 42 }).defaultTime).toBe('09:00');
  });
});

// --- 2. Bezugszeitpunkt und Melde-Zeitpunkt ----------------------------------------
describe('localNowString (4T-0525)', () => {
  it('bildet aus einem injizierten Date deterministisch die lokale Wanduhr-Zeit', () => {
    // Monat 6 (0-basiert) = Juli.
    expect(localNowString(new Date(2026, 6, 11, 9, 5))).toBe('2026-07-11T09:05');
    expect(localNowString(new Date(2099, 0, 1, 0, 0))).toBe('2099-01-01T00:00');
    expect(localNowString(new Date(2099, 11, 31, 23, 59))).toBe('2099-12-31T23:59');
  });
});

describe('reminderInstant (4T-0525)', () => {
  const model = (date, time, invalid = false) => ({ reminder: { date, time, invalid } });

  it('bildet Datum plus Uhrzeit', () => {
    expect(reminderInstant(model('2099-01-01', '08:30'))).toBe('2099-01-01T08:30');
  });

  it('greift bei fehlender Uhrzeit auf die (injizierte bzw. Default-)Uhrzeit zurueck', () => {
    expect(reminderInstant(model('2099-01-01', null), '07:00')).toBe('2099-01-01T07:00');
    expect(reminderInstant(model('2099-01-01', null))).toBe('2099-01-01T09:00');
  });

  it('liefert null ohne Modell, ohne Anker oder bei ungueltigem Anker', () => {
    expect(reminderInstant(null)).toBeNull();
    expect(reminderInstant({ reminder: null })).toBeNull();
    expect(reminderInstant(model('2099-02-30', null, true))).toBeNull();
  });
});

describe('reminderKey (4T-0525)', () => {
  it('setzt sich aus Pfad und Roh-Zeilentext zusammen', () => {
    expect(reminderKey('Ordner/a.md', '- [ ] X ⏰ 2099-01-01')).toBe(
      'Ordner/a.md\n- [ ] X ⏰ 2099-01-01',
    );
  });
});

// --- 3. Anker-Sammlung --------------------------------------------------------------
// Fixture-Zeilen: gueltige Anker (offen / unbekannter Status), erledigte und
// stornierte Anker (loesen nicht aus), eine Zeile ohne ⏰, eine mit ungueltigem
// ⏰-Wert und eine ohne Global Filter. Datumswerte in 2099 (nie Gegenwart).
const LINES = [
  { path: 'a.md', zeile: 1, text: '- [ ] #task Beta ⏰ 2099-05-01 09:00' },
  { path: 'a.md', zeile: 2, text: '- [ ] #task Alpha ⏰ 2099-01-01 08:00' },
  { path: 'a.md', zeile: 3, text: '- [x] #task Erledigt ⏰ 2099-02-01' },
  { path: 'a.md', zeile: 4, text: '- [-] #task Storniert ⏰ 2099-02-01' },
  { path: 'a.md', zeile: 5, text: '- [?] #task Unbekannt ⏰ 2099-03-01' },
  { path: 'a.md', zeile: 6, text: '- [ ] #task OhneAnker 📅 2099-04-01' },
  { path: 'a.md', zeile: 7, text: '- [ ] #task Kaputt ⏰ 2099-02-30' },
  { path: 'a.md', zeile: 8, text: '- [ ] KeinFilter ⏰ 2099-06-01' },
];

describe('collectReminders (4T-0525)', () => {
  it('sammelt nur offene Anker mit gueltigem ⏰-Wert, nach Zeitpunkt sortiert', () => {
    const res = collectReminders(LINES, {
      globalFilter: '#task',
      statusTypeOf,
      defaultTime: '09:00',
    });
    // Sortiert nach instant: Alpha (01-01 08:00) < Unbekannt (03-01 09:00) < Beta (05-01 09:00).
    expect(res.map((r) => r.description)).toEqual(['Alpha', 'Unbekannt', 'Beta']);
  });

  it('DONE und CANCELLED loesen nicht aus, TODO und unbekannter Status schon', () => {
    const res = collectReminders(LINES, { globalFilter: '#task', statusTypeOf });
    const descs = res.map((r) => r.description);
    expect(descs).toContain('Beta'); // TODO
    expect(descs).toContain('Unbekannt'); // unbekannter Status (null)
    expect(descs).not.toContain('Erledigt'); // DONE
    expect(descs).not.toContain('Storniert'); // CANCELLED
  });

  it('ignoriert Zeilen ohne ⏰ und mit ungueltigem ⏰-Wert', () => {
    const res = collectReminders(LINES, { globalFilter: '#task', statusTypeOf });
    const descs = res.map((r) => r.description);
    expect(descs).not.toContain('OhneAnker');
    expect(descs).not.toContain('Kaputt');
  });

  it('Global-Filter-Verhalten: Zeilen ohne den Filter fallen bei gesetztem Filter raus', () => {
    const withFilter = collectReminders(LINES, { globalFilter: '#task', statusTypeOf });
    expect(withFilter.map((r) => r.description)).not.toContain('KeinFilter');
    // Ohne Filter zaehlt jede Checkbox-Zeile: KeinFilter kommt hinzu.
    const withoutFilter = collectReminders(LINES, { statusTypeOf });
    expect(withoutFilter.map((r) => r.taskText)).toContain('- [ ] KeinFilter ⏰ 2099-06-01');
    expect(withoutFilter).toHaveLength(withFilter.length + 1);
  });

  it('description ist um den Global Filter bereinigt; Felder key/instant/date/time stimmen', () => {
    const res = collectReminders(LINES, {
      globalFilter: '#task',
      statusTypeOf,
      defaultTime: '09:00',
    });
    // Erster Treffer ist Alpha (fruehester Zeitpunkt).
    expect(res[0]).toEqual({
      key: 'a.md\n- [ ] #task Alpha ⏰ 2099-01-01 08:00',
      path: 'a.md',
      line: 2,
      taskText: '- [ ] #task Alpha ⏰ 2099-01-01 08:00',
      description: 'Alpha',
      instant: '2099-01-01T08:00',
      date: '2099-01-01',
      time: '08:00',
    });
    // Unbekannt hat keine Uhrzeit -> Default-Uhrzeit im instant, time bleibt null.
    const unbekannt = res.find((r) => r.description === 'Unbekannt');
    expect(unbekannt.time).toBeNull();
    expect(unbekannt.instant).toBe('2099-03-01T09:00');
  });

  it('leere oder fehlende Eingabe liefert eine leere Liste', () => {
    expect(collectReminders(null, { statusTypeOf })).toEqual([]);
    expect(collectReminders([], { statusTypeOf })).toEqual([]);
  });
});

// --- 4. Faelligkeit -----------------------------------------------------------------
describe('computeDue (4T-0525)', () => {
  const items = [
    { key: 'k1', instant: '2099-01-01T09:00' },
    { key: 'k2', instant: '2099-01-01T10:00' },
    { key: 'k3', instant: '2099-01-02T09:00' },
  ];

  it('der Grenzfall instant === nowLocal ist faellig (kleiner/gleich)', () => {
    expect(computeDue(items, { nowLocal: '2099-01-01T09:00' }).map((i) => i.key)).toEqual(['k1']);
  });

  it('alle Anker mit erreichtem Zeitpunkt sind faellig', () => {
    expect(computeDue(items, { nowLocal: '2099-01-01T12:00' }).map((i) => i.key)).toEqual([
      'k1',
      'k2',
    ]);
  });

  it('reported- und muted-Mengen filtern faellige Anker heraus', () => {
    expect(
      computeDue(items, {
        nowLocal: '2099-01-01T12:00',
        reportedKeys: new Set(['k1']),
      }).map((i) => i.key),
    ).toEqual(['k2']);
    expect(
      computeDue(items, {
        nowLocal: '2099-01-01T12:00',
        mutedKeys: new Set(['k2']),
      }).map((i) => i.key),
    ).toEqual(['k1']);
  });

  it('ohne nowLocal liefert die Faelligkeit eine leere Liste', () => {
    expect(computeDue(items, {})).toEqual([]);
  });
});

// --- 5. Panel-Gruppen ---------------------------------------------------------------
describe('groupForPanel (4T-0525)', () => {
  it('teilt in ueberfaellig, heute (noch anstehend), morgen und spaeter', () => {
    const items = [
      { key: 'heutePast', instant: '2099-06-15T08:00', date: '2099-06-15' },
      { key: 'gestern', instant: '2099-06-14T09:00', date: '2099-06-14' },
      { key: 'heuteSpaeter', instant: '2099-06-15T18:00', date: '2099-06-15' },
      { key: 'morgen', instant: '2099-06-16T09:00', date: '2099-06-16' },
      { key: 'spaeter', instant: '2099-06-20T09:00', date: '2099-06-20' },
    ];
    const g = groupForPanel(items, { todayIso: '2099-06-15', nowLocal: '2099-06-15T12:00' });
    // Ueberfaellig: der bereits vergangene heutige Anker und der von gestern.
    expect(g.overdue.map((i) => i.key)).toEqual(['heutePast', 'gestern']);
    expect(g.today.map((i) => i.key)).toEqual(['heuteSpaeter']);
    expect(g.tomorrow.map((i) => i.key)).toEqual(['morgen']);
    expect(g.later.map((i) => i.key)).toEqual(['spaeter']);
  });

  it('erkennt die Morgen-Grenze ueber Monats- und Jahres-Wechsel', () => {
    const items = [
      { key: 'heute', instant: '2099-12-31T20:00', date: '2099-12-31' },
      { key: 'morgen', instant: '2100-01-01T09:00', date: '2100-01-01' },
    ];
    const g = groupForPanel(items, { todayIso: '2099-12-31', nowLocal: '2099-12-31T10:00' });
    // Der heutige Anker ist noch anstehend (20:00 > 10:00), der 01.01. ist morgen.
    expect(g.today.map((i) => i.key)).toEqual(['heute']);
    expect(g.tomorrow.map((i) => i.key)).toEqual(['morgen']);
    expect(g.overdue).toEqual([]);
    expect(g.later).toEqual([]);
  });

  it('liefert ohne todayIso/nowLocal leere Gruppen', () => {
    expect(
      groupForPanel([{ key: 'x', instant: '2099-01-01T09:00', date: '2099-01-01' }], {}),
    ).toEqual({ overdue: [], today: [], tomorrow: [], later: [] });
  });
});

// --- 6. Snooze ----------------------------------------------------------------------
describe('snoozedReminderValue (4T-0525)', () => {
  it('Minuten und Stunden rechnen minutengenau ab dem Bezugszeitpunkt', () => {
    expect(snoozedReminderValue('2099-06-15T09:00', { amount: 10, unit: 'm' })).toEqual({
      date: '2099-06-15',
      time: '09:10',
    });
    expect(snoozedReminderValue('2099-06-15T09:00', { amount: 1, unit: 'h' })).toEqual({
      date: '2099-06-15',
      time: '10:00',
    });
    expect(snoozedReminderValue('2099-06-15T09:00', { amount: 4, unit: 'h' })).toEqual({
      date: '2099-06-15',
      time: '13:00',
    });
  });

  it('Minuten/Stunden mit Tages-Uebertrag verschieben das Datum', () => {
    // 23:55 + 10 min -> Folgetag 00:05.
    expect(snoozedReminderValue('2099-06-15T23:55', { amount: 10, unit: 'm' })).toEqual({
      date: '2099-06-16',
      time: '00:05',
    });
    // Uebertrag ueber die Monatsgrenze.
    expect(snoozedReminderValue('2099-06-30T23:30', { amount: 1, unit: 'h' })).toEqual({
      date: '2099-07-01',
      time: '00:30',
    });
  });

  it('Tage und Wochen verschieben das Datum und behalten die Uhrzeit', () => {
    expect(snoozedReminderValue('2099-06-15T09:00', { amount: 1, unit: 'd' })).toEqual({
      date: '2099-06-16',
      time: '09:00',
    });
    expect(snoozedReminderValue('2099-06-15T09:00', { amount: 1, unit: 'w' })).toEqual({
      date: '2099-06-22',
      time: '09:00',
    });
    // Wochen-Verschiebung ueber die Jahresgrenze, Uhrzeit unveraendert.
    expect(snoozedReminderValue('2099-12-30T14:20', { amount: 1, unit: 'w' })).toEqual({
      date: '2100-01-06',
      time: '14:20',
    });
  });
});
