// @vitest-environment jsdom
// 4T-002001 (Epic 3E-000307): Schaltjahr-Muster auf der Oberflächen-Seite —
// Weg durch die Entwurfs-Form der Einstellungen (Ausgabe und erneutes
// Einlesen) für beide Formen der Schalt-Regel (AK4) und die Pflege der
// Schalt-Ebene mit Auswahl der Form und den Feldern des Musters (AK5). Die
// Rechnung selbst prüft test/unit/kalender-schaltjahr-muster.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
// Die geteilten Module brauchen kein window.api und stehen deshalb statisch da.
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { createGregorianTemplate } from '../../../src/shared/calendar/calendar-template.js';

// Der Katalog wird im Programm per fetch geladen; hier kommt er aus der Datei.
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { calendarToDraft, calendarPersistForm } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { buildCalendarEditor } =
  await import('../../../src/renderer/modules/settings/settings-calendar-editor.js');

beforeEach(() => {
  document.body.innerHTML = '';
});

const MUSTER_16 = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];

// Mond-Zeitrechnung im Aufbau des tabellarischen islamischen Kalenders; das
// Muster steht an der Schalt-Ebene «Jahr».
function mondKalender(id, pattern) {
  return {
    id,
    name: id,
    levels: [
      { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
      {
        id: 'monat',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        rel: { type: 'lengths', table: [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29] },
      },
      {
        id: 'jahr',
        name: 'Jahr',
        section: 'Datum',
        start: 1,
        rel: { type: 'leap', count: 12, pattern, targetIndex: 11, extra: 1 },
      },
    ],
  };
}

const einlesen = (...kalender) =>
  normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: kalender }] }).blocks[0].calendars;

const [MOND] = einlesen(mondKalender('Mond', { cycle: 30, years: MUSTER_16 }));
const [GREG] = einlesen(createGregorianTemplate());

describe('Entwurfs-Form der Einstellungen (4T-002001, AK4)', () => {
  it('ein Muster kommt als Form «pattern» mit beiden Eingaben in den Entwurf', () => {
    const jahr = calendarToDraft(MOND).levels[2];
    expect(jahr.leapMode).toBe('pattern');
    expect(jahr.leapPatternCycle).toBe('30');
    expect(jahr.leapPatternYears).toBe('2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29');
    expect(jahr.leapRules).toEqual([]);
  });

  it('der Weg Bereichsdatei → Entwurf → Ablage ist für ein Muster verlustfrei', () => {
    const ablage = calendarPersistForm(calendarToDraft(MOND));
    expect(ablage.levels[2].rel).toStrictEqual({
      type: 'leap',
      count: 12,
      pattern: { cycle: 30, years: MUSTER_16 },
      targetIndex: 11,
      extra: 1,
    });
    expect(einlesen(ablage)[0]).toStrictEqual(MOND);
  });

  it('eine Teilbarkeits-Kette bleibt im Entwurf und in der Ablage unverändert', () => {
    const jahr = calendarToDraft(GREG).levels[5];
    expect(jahr.leapMode).toBe('rules');
    expect(jahr.leapRules).toEqual(['4', '100', '400']);
    const ablage = calendarPersistForm(calendarToDraft(GREG));
    expect(JSON.stringify(ablage)).not.toContain('pattern');
    expect(einlesen(ablage)[0]).toStrictEqual(GREG);
  });

  it('die Form entscheidet, welches Feld abgelegt wird; die andere Eingabe bleibt im Entwurf', () => {
    const entwurf = calendarToDraft(MOND);
    const jahr = entwurf.levels[2];
    jahr.leapMode = 'rules';
    jahr.leapRules = ['4'];
    const alsKette = calendarPersistForm(entwurf).levels[2].rel;
    expect(alsKette.rules).toEqual([{ cycle: 4 }]);
    expect('pattern' in alsKette).toBe(false);
    expect(jahr.leapPatternYears).toBe('2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29');
    jahr.leapMode = 'pattern';
    const alsMuster = calendarPersistForm(entwurf).levels[2].rel;
    expect(alsMuster.pattern).toStrictEqual({ cycle: 30, years: MUSTER_16 });
    expect('rules' in alsMuster).toBe(false);
  });

  it('Jahre dürfen mit Komma oder Leerzeichen getrennt sein und werden sortiert übernommen', () => {
    const entwurf = calendarToDraft(MOND);
    entwurf.levels[2].leapPatternYears = ' 29,2  5 ,16 ';
    const [wieder] = einlesen(calendarPersistForm(entwurf));
    expect(wieder.levels[2].rel.pattern).toStrictEqual({ cycle: 30, years: [2, 5, 16, 29] });
  });

  it.each([
    ['leere Jahres-Liste', { leapPatternYears: '' }],
    ['Jahr außerhalb des Zyklus', { leapPatternYears: '2, 31' }],
    ['Jahr ohne Zahl-Wert', { leapPatternYears: '2, fünf' }],
    ['leere Zyklus-Länge', { leapPatternCycle: '' }],
  ])('ungültige Eingabe reicht als ungültig durch: %s', (_, aenderung) => {
    const entwurf = calendarToDraft(MOND);
    Object.assign(entwurf.levels[2], aenderung);
    expect(einlesen(calendarPersistForm(entwurf))).toEqual([]);
  });

  it('ein Entwurf ohne Form-Angabe (neu angelegte Ebene) gilt als Teilbarkeits-Kette', () => {
    const entwurf = calendarToDraft(GREG);
    const jahr = entwurf.levels[5];
    delete jahr.leapMode;
    delete jahr.leapPatternCycle;
    delete jahr.leapPatternYears;
    expect(einlesen(calendarPersistForm(entwurf))[0]).toStrictEqual(GREG);
  });
});

describe('Pflege der Schalt-Ebene (4T-002001, AK5)', () => {
  // Baut die Pflege einer Zeitrechnung (Index 0). Ein Wechsel der Form
  // rendert im Programm den ganzen Bereich neu; ohne geöffnete Einstellungs-
  // Seite tut das `renderActiveSection` nicht, der Fall baut deshalb selbst neu.
  function baue(entwurf) {
    document.body.innerHTML = '';
    buildCalendarEditor(document.body, { calendars: [entwurf] }, entwurf, 0);
  }
  const feld = (id) => document.getElementById(id);
  const ungueltig = () => !feld('settings-calsys-cal-invalid-0').hidden;
  const eingeben = (el, wert) => {
    el.value = wert;
    el.dispatchEvent(new Event('input'));
  };

  it('Auswahl und Felder stehen an der Schalt-Ebene und spiegeln den Entwurf', () => {
    const entwurf = calendarToDraft(MOND);
    baue(entwurf);
    const auswahl = feld('settings-calsys-leapmode-0-2');
    expect([...auswahl.options].map((o) => [o.value, o.textContent])).toEqual([
      ['rules', 'nach Teilbarkeit'],
      ['pattern', 'nach Muster'],
    ]);
    expect(auswahl.value).toBe('pattern');
    expect(auswahl.closest('label').textContent).toContain('Schaltjahre bestimmen');
    const ebene = feld('settings-calsys-level-0-2-name').closest('.settings-calsys-level');
    expect(ebene.contains(auswahl)).toBe(true);
    expect(ebene.contains(feld('settings-calsys-leappattern-cycle-0-2'))).toBe(true);
    expect(feld('settings-calsys-leappattern-cycle-0-2').value).toBe('30');
    expect(feld('settings-calsys-leappattern-years-0-2').value).toBe(
      '2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29',
    );
    expect(feld('settings-calsys-leappattern-cycle-0-2').closest('label').textContent).toContain(
      'Länge des Zyklus (Jahre)',
    );
    expect(feld('settings-calsys-leappattern-years-0-2').closest('label').textContent).toContain(
      'Schaltjahre im Zyklus',
    );
    expect(feld('settings-calsys-leappattern-hint-0-2').textContent).toContain(
      'Gezählt wird ab 1.',
    );
    // Bei «nach Muster» fehlt die Kette, die gemeinsamen Felder stehen da.
    expect(feld('settings-calsys-leap-0-2-add')).toBeNull();
    expect(feld('settings-calsys-level-0-2-target').value).toBe('12');
    expect(feld('settings-calsys-level-0-2-extra').value).toBe('1');
    expect(ungueltig()).toBe(false);
  });

  it('die Felder ändern den Entwurf, und die Ablage folgt', () => {
    const entwurf = calendarToDraft(MOND);
    baue(entwurf);
    eingeben(
      feld('settings-calsys-leappattern-years-0-2'),
      '2, 5, 8, 11, 13, 16, 19, 21, 24, 27, 30',
    );
    expect(entwurf.levels[2].leapPatternYears).toBe('2, 5, 8, 11, 13, 16, 19, 21, 24, 27, 30');
    expect(calendarPersistForm(entwurf).levels[2].rel.pattern.years).toEqual([
      2, 5, 8, 11, 13, 16, 19, 21, 24, 27, 30,
    ]);
    expect(ungueltig()).toBe(false);
  });

  it('ein Wechsel auf «nach Teilbarkeit» und zurück erhält die jeweils andere Eingabe', () => {
    const entwurf = calendarToDraft(MOND);
    baue(entwurf);
    const auswahl = feld('settings-calsys-leapmode-0-2');
    auswahl.value = 'rules';
    auswahl.dispatchEvent(new Event('change'));
    expect(entwurf.levels[2].leapMode).toBe('rules');
    baue(entwurf);
    expect(feld('settings-calsys-leappattern-cycle-0-2')).toBeNull();
    feld('settings-calsys-leap-0-2-add').click();
    baue(entwurf);
    eingeben(feld('settings-calsys-leap-0-2-0'), '4');
    expect(entwurf.levels[2].leapRules).toEqual(['4']);
    expect(entwurf.levels[2].leapPatternYears).toBe('2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29');

    const zurueck = feld('settings-calsys-leapmode-0-2');
    zurueck.value = 'pattern';
    zurueck.dispatchEvent(new Event('change'));
    baue(entwurf);
    expect(feld('settings-calsys-leappattern-cycle-0-2').value).toBe('30');
    expect(entwurf.levels[2].leapRules).toEqual(['4']);
    expect(calendarPersistForm(entwurf).levels[2].rel.pattern).toStrictEqual({
      cycle: 30,
      years: MUSTER_16,
    });
  });

  it.each([
    ['Jahr größer als der Zyklus', 'settings-calsys-leappattern-years-0-2', '2, 31'],
    ['doppeltes Jahr', 'settings-calsys-leappattern-years-0-2', '2, 5, 5'],
    ['leere Jahres-Liste', 'settings-calsys-leappattern-years-0-2', ''],
    ['Zyklus-Länge 0', 'settings-calsys-leappattern-cycle-0-2', '0'],
  ])('eine ungültige Eingabe zeigt die Hinweis-Zeile «ungültig»: %s', (_, id, wert) => {
    const entwurf = calendarToDraft(MOND);
    baue(entwurf);
    eingeben(feld(id), wert);
    expect(ungueltig()).toBe(true);
    expect(feld('settings-calsys-cal-invalid-0').textContent).toContain('ungültig');
  });

  it('eine Zeitrechnung mit Teilbarkeits-Kette zeigt die Auswahl auf «nach Teilbarkeit»', () => {
    const entwurf = calendarToDraft(GREG);
    baue(entwurf);
    expect(feld('settings-calsys-leapmode-0-5').value).toBe('rules');
    expect(feld('settings-calsys-leap-0-5-2').value).toBe('400');
    expect(feld('settings-calsys-leappattern-years-0-5')).toBeNull();
  });
});
