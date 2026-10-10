// @vitest-environment jsdom
// 4T-002066 (Epic 3E-000307): Rundlauf einer Zeitrechnung durch den Entwurf
// der Einstellungen — normalisieren, Entwurf laden, Persistenz-Form bilden,
// erneut normalisieren. Der Entwurf bietet nicht jede Angabe des Modells zur
// Pflege an; was er nicht anbietet, muss er unverändert durchtragen, sonst
// verliert ein «Anwenden» an ganz anderer Stelle still einen Teil der
// Definition. Belegt war das an Positions-Namen einer Ebene ohne
// Längen-Tabelle (Monats-Namen an gleich langen Monaten) und an den
// Positions-Namen einer Gruppierung.
import { describe, it, expect, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
// Die geteilten Module brauchen kein window.api und stehen deshalb statisch da.
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { CALENDAR_TEMPLATES } from '../../../src/shared/calendar/calendar-templates.js';
import { formatTuple } from '../../../src/shared/calendar/calendar-core.js';

// Der Katalog wird im Programm per fetch geladen; hier kommt er aus der Datei.
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { calendarToDraft, calendarPersistForm, calendarConfigPersistForm, calSysTakeOverNames } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { applyCalendarSection } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');
const { buildCalendarEditor } =
  await import('../../../src/renderer/modules/settings/settings-calendar-editor.js');

const normalisiert = (definition) =>
  normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [definition] }] }).blocks[0]
    .calendars[0];

// Eine Vorlage der Sammlung so, wie sie die Einstellungs-Sektion einfügt.
const ausVorlage = (eintrag) => normalisiert({ id: eintrag.id, ...eintrag.create(i18n.t) });

// Der Rundlauf ohne jede Änderung.
const rundlauf = (cal) => normalisiert(calendarPersistForm(calendarToDraft(cal)));

// Gregorianische Vorlage mit gleich langen Monaten: Die Monats-Ebene trägt
// statt der Längen-Tabelle einen festen Faktor, die Monats-Namen bleiben an
// ihr stehen — die Gestalt, die der Entwurf vor 4T-002066 verlor.
function gregorianischMitFaktorMonaten() {
  const definition = CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian').create(i18n.t);
  const monat = definition.levels.find((lv) => lv.id === 'month');
  monat.rel = { type: 'factor', count: 30 };
  return normalisiert({ id: 'gleichmonde', ...definition });
}

// Dieselbe Vorlage mit Positions-Namen an den Quartalen; die Pflege bietet
// sie nicht an, das Modell kennt sie.
function gregorianischMitQuartalsNamen() {
  const definition = CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian').create(i18n.t);
  definition.groups.find((g) => g.id === 'quarter').names = ['Q1', 'Q2', 'Q3', 'Q4'];
  return normalisiert({ id: 'quartale', ...definition });
}

describe('Rundlauf «laden, nichts ändern, anwenden» (4T-002066, AK2)', () => {
  it.each(CALENDAR_TEMPLATES.map((e) => [e.id, e]))(
    'die Vorlage %s kommt unverändert zurück',
    (_id, eintrag) => {
      const cal = ausVorlage(eintrag);
      expect(cal).not.toBeNull();
      expect(rundlauf(cal)).toStrictEqual(cal);
    },
  );

  it('Positions-Namen an einer Ebene mit festem Faktor bleiben erhalten', () => {
    const cal = gregorianischMitFaktorMonaten();
    expect(cal.levels.find((lv) => lv.id === 'month').names).toHaveLength(12);
    expect(rundlauf(cal)).toStrictEqual(cal);
  });

  it('Positions-Namen an einer Gruppierung bleiben erhalten', () => {
    const cal = gregorianischMitQuartalsNamen();
    expect(rundlauf(cal)).toStrictEqual(cal);
  });

  it('die Persistenz-Form des Entwurfs ist gegen einen zweiten Rundlauf stabil', () => {
    const cal = gregorianischMitFaktorMonaten();
    const ablage = calendarPersistForm(calendarToDraft(cal));
    expect(calendarPersistForm(calendarToDraft(normalisiert(ablage)))).toStrictEqual(ablage);
  });
});

describe('Rundlauf mit einer Änderung an anderer Stelle (4T-002066, AK1)', () => {
  // Der Entwurf wird gegen den Schnappschuss des unveränderten Stands
  // angewendet, wie es die Einstellungs-Seite tut.
  async function wendeAn(cal, aendere) {
    const values = {
      hasArea: true,
      blocks: [{ id: 'welt', name: 'Welt', calendars: [calendarToDraft(cal)] }],
    };
    const draft = { calendar: values, calendarSnapshot: calendarConfigPersistForm(values) };
    aendere(values.blocks[0].calendars[0]);
    window.api.calendarConfirmDependents = vi.fn(async () => true);
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    await applyCalendarSection(draft);
    expect(window.api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
    return normalisiert(window.api.calendarSetAreaConfig.mock.calls[0][0].blocks[0].calendars[0]);
  }

  it('eine umbenannte Zeitrechnung behält die Monats-Namen der Faktor-Ebene', async () => {
    const cal = gregorianischMitFaktorMonaten();
    const gespeichert = await wendeAn(cal, (entwurf) => {
      entwurf.name = 'Gleichmond-Kalender';
    });
    const monate = cal.levels.find((lv) => lv.id === 'month').names;
    expect(gespeichert.levels.find((lv) => lv.id === 'month').names).toEqual(monate);
    // Der Wert im Dokument zeigt weiter den Monats-Namen, nicht die Zahl.
    expect(formatTuple(gespeichert, [2026, 3, 15, 0, 0, 0], { named: true })).toBe(
      `2026-${monate[2]}-15`,
    );
  });

  it('ein geänderter Faktor an anderer Ebene behält die Namen von Ebene und Gruppierung', async () => {
    const cal = gregorianischMitQuartalsNamen();
    const gespeichert = await wendeAn(cal, (entwurf) => {
      entwurf.levels.find((lv) => lv.id === 'hour').factorCount = '30';
    });
    expect(gespeichert.groups.find((g) => g.id === 'quarter').names).toEqual([
      'Q1',
      'Q2',
      'Q3',
      'Q4',
    ]);
    expect(gespeichert.levels.find((lv) => lv.id === 'month').names).toHaveLength(12);
  });
});

describe('Wechsel einer Ebene auf die Längen-Tabelle (4T-002066)', () => {
  it('die gemerkten Namen werden zu den Zeilen der leeren Tabelle', () => {
    const entwurf = calendarToDraft(gregorianischMitFaktorMonaten());
    const monat = entwurf.levels.find((lv) => lv.id === 'month');
    expect(monat.table).toEqual([]);
    monat.relType = 'lengths';
    calSysTakeOverNames(monat);
    expect(monat.table.map((row) => row.name)).toEqual(monat.positionNames);
    expect(monat.table.every((row) => row.length === '')).toBe(true);
  });

  it('der Wechsel im Beziehungs-Typ der Pflege übernimmt die Namen', () => {
    document.body.innerHTML = '';
    const entwurf = calendarToDraft(gregorianischMitFaktorMonaten());
    buildCalendarEditor(document.body, { calendars: [entwurf] }, entwurf, 0);
    const monatIdx = entwurf.levels.findIndex((lv) => lv.id === 'month');
    const typ = document.getElementById(`settings-calsys-level-0-${monatIdx}-type`);
    typ.value = 'lengths';
    typ.dispatchEvent(new Event('change'));
    const monat = entwurf.levels[monatIdx];
    expect(monat.relType).toBe('lengths');
    expect(monat.table.map((row) => row.name)).toEqual(monat.positionNames);
    // Mit eingetragenen Längen trägt die Ablage die Namen aus den Zeilen.
    for (const row of monat.table) row.length = '30';
    expect(calendarPersistForm(entwurf).levels[monatIdx].names).toEqual(monat.positionNames);
  });

  it('eine Tabelle mit Zeilen bleibt unberührt', () => {
    const entwurf = calendarToDraft(gregorianischMitFaktorMonaten());
    const monat = entwurf.levels.find((lv) => lv.id === 'month');
    monat.table = [{ name: 'Eigen', length: '30' }];
    monat.relType = 'lengths';
    calSysTakeOverNames(monat);
    expect(monat.table).toEqual([{ name: 'Eigen', length: '30' }]);
  });
});
