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
import en from '../../../src/i18n/en.json';
import fr from '../../../src/i18n/fr.json';
import es from '../../../src/i18n/es.json';
import it_ from '../../../src/i18n/it.json';
// Die geteilten Module brauchen kein window.api und stehen deshalb statisch da.
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { CALENDAR_TEMPLATES } from '../../../src/shared/calendar/calendar-templates.js';
import {
  formatTuple,
  parseCanonical,
  tupleToAxis,
  validateTuple,
} from '../../../src/shared/calendar/calendar-core.js';

// Der Katalog wird im Programm per fetch geladen; hier kommt er aus der Datei.
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { calendarToDraft, calendarPersistForm, calendarConfigPersistForm, calSysTakeOverNames } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { applyCalendarSection, validateCalendarSection } =
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

// 4T-002204 (Epic 3E-000338): Eine Schalt-Ebene über einer Längen-Tabelle darf
// ein Vielfaches der Zeilen-Zahl umfassen (Kern: count % table.length). Die
// Pflege setzte die Zahl beim Anwenden stets auf die Zeilen-Zahl; aus 24
// Monaten je Jahr wurden 12, und ein gespeicherter Wert bezeichnete danach
// einen anderen Tag. Das Feld «Durchläufe der Längen-Tabelle je Instanz» trägt
// den Faktor; Namen der Positionen jenseits der Zeilen werden durchgetragen.
const TAG = 86400n; // die kleinste Ebene der Vorlage ist die Sekunde

// Gregorianische Vorlage mit eigener Zahl der Monate je Jahr; auf Wunsch mit
// eigenen Monats-Namen und eigenem Schalt-Ziel (0-basiert wie im Modell).
function gregorianischMitJahr(count, { monatsNamen, zielIndex } = {}) {
  const definition = CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian').create(i18n.t);
  const jahr = definition.levels.find((lv) => lv.id === 'year');
  jahr.rel.count = count;
  if (zielIndex !== undefined) jahr.rel.targetIndex = zielIndex;
  if (monatsNamen) definition.levels.find((lv) => lv.id === 'month').names = monatsNamen;
  return normalisiert({ id: `jahr-${count}`, ...definition, name: `Jahr ${count}` });
}

const namenBis = (n) => Array.from({ length: n }, (_, i) => `M${i + 1}`);
const ebenenIndex = (entwurf, id) => entwurf.levels.findIndex((lv) => lv.id === id);
const ablageEbene = (entwurf, id) => calendarPersistForm(entwurf).levels.find((lv) => lv.id === id);

function eingeben(feld, wert) {
  feld.value = wert;
  feld.dispatchEvent(new Event('input', { bubbles: true }));
}

// Der Entwurf im Formular der Pflege, wie ihn die Detail-Ansicht zeigt.
function imFormular(entwurf) {
  document.body.innerHTML = '';
  buildCalendarEditor(document.body, { calendars: [entwurf] }, entwurf, 0);
  return {
    jahr: ebenenIndex(entwurf, 'year'),
    monat: ebenenIndex(entwurf, 'month'),
    feld: (id) => document.getElementById(id),
  };
}

// «Letzte Zeile entfernen» über den Knopf der Zeile.
function letzteZeileEntfernen(entwurf, monatIdx) {
  const zeile = entwurf.levels[monatIdx].table.length - 1;
  document
    .getElementById(`settings-calsys-table-0-${monatIdx}-${zeile}-length`)
    .closest('.settings-calsys-table-row')
    .querySelector('.settings-calsys-row-remove')
    .click();
}

describe('Durchläufe der Längen-Tabelle je Instanz (4T-002204, AK2)', () => {
  it.each([24, 36])('Laden und Anwenden ohne Änderung lässt %i Monate je Jahr unverändert', (n) => {
    const cal = gregorianischMitJahr(n);
    expect(cal).toBeDefined();
    expect(rundlauf(cal)).toStrictEqual(cal);
  });

  it('der gespeicherte Text «2-05-01» bezeichnet nach dem Rundlauf denselben Tag', () => {
    const cal = gregorianischMitJahr(24);
    const tupel = [2, 5, 1, 0, 0, 0];
    const text = formatTuple(cal, tupel);
    expect(text.startsWith('2-05-01')).toBe(true);
    const nachher = rundlauf(cal);
    const gelesen = parseCanonical(nachher, text);
    expect(gelesen.ok).toBe(true);
    expect(tupleToAxis(nachher, gelesen.tuple) / TAG).toBe(tupleToAxis(cal, tupel) / TAG);
    // Monat 20 bleibt ein gültiger Monat.
    expect(validateTuple(nachher, [2, 20, 1, 0, 0, 0]).ok).toBe(true);
  });
});

describe('Feld «Durchläufe» an der Schalt-Ebene (4T-002204, AK3)', () => {
  it('beim Laden aus der Definition errechnet: 12 ergibt 1, 24 ergibt 2, 36 ergibt 3', () => {
    for (const [n, erwartet] of [
      [12, '1'],
      [24, '2'],
      [36, '3'],
    ]) {
      const entwurf = calendarToDraft(gregorianischMitJahr(n));
      expect(entwurf.levels[ebenenIndex(entwurf, 'year')].leapPasses).toBe(erwartet);
    }
  });

  it('das Formular zeigt das Feld mit dem geladenen Wert, die Auskunft nennt das Ergebnis', () => {
    const entwurf = calendarToDraft(gregorianischMitJahr(24));
    const { jahr, feld } = imFormular(entwurf);
    expect(feld(`settings-calsys-level-0-${jahr}-passes`).value).toBe('2');
    const auskunft = feld(`settings-calsys-level-0-${jahr}-count-auto`);
    expect(auskunft.hidden).toBe(false);
    expect(auskunft.textContent).toBe(
      i18n.t('settings.calendar.leapCountAuto').replace('{count}', '24'),
    );
  });

  it('eine neue Schalt-Ebene ohne Angabe ist mit einem Durchlauf vorbelegt', () => {
    const entwurf = calendarToDraft(gregorianischMitJahr(12));
    delete entwurf.levels[ebenenIndex(entwurf, 'year')].leapPasses;
    const { jahr, feld } = imFormular(entwurf);
    expect(feld(`settings-calsys-level-0-${jahr}-passes`).value).toBe('1');
    expect(ablageEbene(entwurf, 'year').rel.count).toBe(12);
  });

  it('eine Eingabe im Feld setzt die Zahl auf Durchläufe mal Zeilen und führt die Auskunft nach', () => {
    const entwurf = calendarToDraft(gregorianischMitJahr(12));
    const { jahr, feld } = imFormular(entwurf);
    eingeben(feld(`settings-calsys-level-0-${jahr}-passes`), '3');
    expect(ablageEbene(entwurf, 'year').rel.count).toBe(36);
    expect(feld(`settings-calsys-level-0-${jahr}-count-auto`).textContent).toContain('36');
    expect(normalisiert(calendarPersistForm(entwurf))).toBeDefined();
    // Keine ganze Zahl ab 1: die Pflege lehnt ab, die Auskunft verschwindet.
    for (const ungueltig of ['0', '-1', 'zwei', '']) {
      eingeben(feld(`settings-calsys-level-0-${jahr}-passes`), ungueltig);
      expect(feld(`settings-calsys-level-0-${jahr}-count-auto`).hidden).toBe(true);
      expect(normalisiert(calendarPersistForm(entwurf))).toBeUndefined();
    }
  });

  it('bei zwei Durchläufen ergibt «Zeile hinzufügen» 26 Einheiten je Instanz', () => {
    const entwurf = calendarToDraft(gregorianischMitJahr(24));
    const { jahr, monat, feld } = imFormular(entwurf);
    feld(`settings-calsys-table-0-${monat}-add`).click();
    entwurf.levels[monat].table[12].length = '5';
    expect(ablageEbene(entwurf, 'year').rel.count).toBe(26);
    expect(normalisiert(calendarPersistForm(entwurf))).toBeDefined();
    // Nach dem Neuaufbau nennt die Auskunft das Ergebnis.
    imFormular(entwurf);
    expect(feld(`settings-calsys-level-0-${jahr}-passes`).value).toBe('2');
    expect(feld(`settings-calsys-level-0-${jahr}-count-auto`).textContent).toContain('26');
  });

  it('bei zwei Durchläufen ergibt «Zeile entfernen» 22 Einheiten je Instanz', () => {
    const entwurf = calendarToDraft(gregorianischMitJahr(24));
    const { jahr, monat, feld } = imFormular(entwurf);
    letzteZeileEntfernen(entwurf, monat);
    expect(entwurf.levels[monat].table).toHaveLength(11);
    expect(ablageEbene(entwurf, 'year').rel.count).toBe(22);
    expect(normalisiert(calendarPersistForm(entwurf))).toBeDefined();
    imFormular(entwurf);
    expect(feld(`settings-calsys-level-0-${jahr}-count-auto`).textContent).toContain('22');
  });
});

describe('Namen der Positionen jenseits der Zeilen (4T-002204, AK4)', () => {
  it('24 Namen bei 24 Monaten je Jahr ergeben nach dem Rundlauf 24 Namen', () => {
    const cal = gregorianischMitJahr(24, { monatsNamen: namenBis(24) });
    expect(cal.levels.find((lv) => lv.id === 'month').names).toHaveLength(24);
    const nachher = rundlauf(cal);
    expect(nachher.levels.find((lv) => lv.id === 'month').names).toEqual(namenBis(24));
    expect(nachher).toStrictEqual(cal);
  });

  it('eine neue Zeile übernimmt den Namen ihrer Position, das Entfernen stellt den Stand wieder her', () => {
    const entwurf = calendarToDraft(gregorianischMitJahr(24, { monatsNamen: namenBis(24) }));
    const geladen = calendarPersistForm(entwurf);
    const { monat, feld } = imFormular(entwurf);
    feld(`settings-calsys-table-0-${monat}-add`).click();
    // Die dreizehnte Zeile belegt Position 13 und trägt deren Namen.
    expect(entwurf.levels[monat].table[12].name).toBe('M13');
    entwurf.levels[monat].table[12].length = '5';
    expect(ablageEbene(entwurf, 'month').names).toEqual(namenBis(24));
    imFormular(entwurf);
    letzteZeileEntfernen(entwurf, monat);
    expect(calendarPersistForm(entwurf)).toStrictEqual(geladen);
  });

  it('weniger Durchläufe schreiben die Namen bis zur Zahl der Positionen, mehr wieder alle', () => {
    const entwurf = calendarToDraft(gregorianischMitJahr(24, { monatsNamen: namenBis(24) }));
    const { jahr, feld } = imFormular(entwurf);
    const durchlaeufe = feld(`settings-calsys-level-0-${jahr}-passes`);
    eingeben(durchlaeufe, '1');
    expect(ablageEbene(entwurf, 'year').rel.count).toBe(12);
    expect(ablageEbene(entwurf, 'month').names).toEqual(namenBis(12));
    eingeben(durchlaeufe, '3');
    expect(ablageEbene(entwurf, 'year').rel.count).toBe(36);
    expect(ablageEbene(entwurf, 'month').names).toEqual(namenBis(24));
  });

  // 4T-002205 (Epic 3E-000338): Bis zu diesem Task endete die Liste an der
  // Lücke, weil das Modell keinen leeren Namen annahm; seither bleibt die
  // Lücke leer, und die durchgetragenen Namen behalten ihre Position.
  it('nach dem Entfernen einer Zeile bleibt die Position dahinter leer; die durchgetragenen Namen behalten ihre Position', () => {
    const entwurf = calendarToDraft(gregorianischMitJahr(24, { monatsNamen: namenBis(24) }));
    const { monat } = imFormular(entwurf);
    letzteZeileEntfernen(entwurf, monat);
    expect(ablageEbene(entwurf, 'year').rel.count).toBe(22);
    // Position 12 hat weder Feld noch durchgetragenen Namen; 13 bis 22 tragen
    // weiter ihre Namen, 23 und 24 liegen über der Zahl der Positionen.
    const erwartet = [...namenBis(11), '', ...namenBis(22).slice(12)];
    expect(ablageEbene(entwurf, 'month').names).toEqual(erwartet);
    const eingelesen = normalisiert(calendarPersistForm(entwurf));
    expect(eingelesen.levels.find((lv) => lv.id === 'month').names).toEqual(
      erwartet.map((n) => n || null),
    );
  });

  it('eine Änderung an anderer Stelle lässt Zahl und Namen unverändert', async () => {
    const cal = gregorianischMitJahr(24, { monatsNamen: namenBis(24) });
    const { gespeichert } = await wendeAnMitAbleitung(cal, (bezug) => {
      bezug.name = 'Zweimond';
    });
    expect(gespeichert.levels.find((lv) => lv.id === 'year').rel.count).toBe(24);
    expect(gespeichert.levels.find((lv) => lv.id === 'month').names).toEqual(namenBis(24));
  });
});

describe('Schalt-Ziel außerhalb der Positionen (4T-002204, AK5)', () => {
  // Gemessen am Zug-3-Stand: 24 Monate je Jahr, Schalt-Ziel Position 14.
  const mitZielVierzehn = () => calendarToDraft(gregorianischMitJahr(24, { zielIndex: 13 }));
  const block = (entwurf) => ({
    calendar: {
      hasArea: true,
      blocks: [{ id: 'welt', name: 'Welt', calendars: [entwurf] }],
    },
  });

  it('mit zwei Durchläufen liegt Position 14 innerhalb; die Pflege meldet nichts', () => {
    const entwurf = mitZielVierzehn();
    const { jahr, feld } = imFormular(entwurf);
    expect(feld(`settings-calsys-level-0-${jahr}-target-outside`).hidden).toBe(true);
    expect(validateCalendarSection(block(entwurf))).toBeNull();
  });

  it('mit einem Durchlauf meldet die Schalt-Ebene den Grund, das Anwenden nennt ihn ebenso', () => {
    const entwurf = mitZielVierzehn();
    const { jahr, feld } = imFormular(entwurf);
    eingeben(feld(`settings-calsys-level-0-${jahr}-passes`), '1');
    const meldung = feld(`settings-calsys-level-0-${jahr}-target-outside`);
    expect(meldung.hidden).toBe(false);
    expect(meldung.textContent).toBe(
      i18n
        .t('settings.calendar.leapTargetOutside')
        .replace('{target}', '14')
        .replaceAll('{count}', '12'),
    );
    // Beim Anwenden: die Prüfung der Seite lehnt mit dem Grund ab, bevor
    // etwas abgelegt wird (die Seite wendet nur nach bestandener Prüfung an).
    expect(validateCalendarSection(block(entwurf))).toBe(
      i18n
        .t('settings.calendar.error.leapTargetOutside')
        .replace('{name}', 'Jahr 24')
        .replace('{block}', 'Welt')
        .replace('{target}', '14')
        .replace('{count}', '12'),
    );
    // Korrigiert: Meldung und Ablehnung verschwinden.
    eingeben(feld(`settings-calsys-level-0-${jahr}-target`), '2');
    expect(meldung.hidden).toBe(true);
    expect(validateCalendarSection(block(entwurf))).toBeNull();
  });
});

describe('Wechsel von der Längen-Tabelle auf festen Faktor (4T-002204, AK6)', () => {
  it('das Anwenden schreibt keine Zeilen-Namen der Tabelle an die Faktor-Ebene', () => {
    const entwurf = calendarToDraft(
      ausVorlage(CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian')),
    );
    const monat = entwurf.levels[ebenenIndex(entwurf, 'month')];
    expect(monat.table).toHaveLength(12);
    monat.relType = 'factor';
    monat.factorCount = '30';
    expect(ablageEbene(entwurf, 'month').names).toBeUndefined();
  });

  it('eine Faktor-Ebene mit geladenen Namen behält sie auch nach einem Umweg über die Tabelle', () => {
    const cal = gregorianischMitFaktorMonaten();
    const geladen = cal.levels.find((lv) => lv.id === 'month').names;
    const entwurf = calendarToDraft(cal);
    const monat = entwurf.levels[ebenenIndex(entwurf, 'month')];
    monat.relType = 'lengths';
    calSysTakeOverNames(monat);
    monat.table[0].name = 'Umbenannt';
    monat.relType = 'factor';
    expect(ablageEbene(entwurf, 'month').names).toEqual(geladen);
  });
});

// Anwenden gegen den Schnappschuss des unveränderten Stands, mit einer
// Ableitung auf der Zeitrechnung (Muster wendeAn oben).
async function wendeAnMitAbleitung(cal, aendere) {
  const config = normalizeCalendarConfig({
    blocks: [
      {
        id: 'welt',
        name: 'Welt',
        calendars: [cal, { id: 'projekt', name: 'Projekt', derivedFrom: cal.id, zero: [10, 1, 1] }],
      },
    ],
  });
  const values = {
    hasArea: true,
    blocks: [
      { id: 'welt', name: 'Welt', calendars: config.blocks[0].calendars.map(calendarToDraft) },
    ],
  };
  const draft = { calendar: values, calendarSnapshot: calendarConfigPersistForm(values) };
  aendere(values.blocks[0].calendars[0]);
  window.api.calendarConfirmDependents = vi.fn(async () => true);
  window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
  await applyCalendarSection(draft);
  const aufrufe = window.api.calendarSetAreaConfig.mock.calls;
  return {
    api: window.api,
    gespeichert: aufrufe.length === 1 ? aufrufe[0][0].blocks[0].calendars[0] : null,
  };
}

describe('Schutz bestehender Zählungen (4T-002204, AK7)', () => {
  it('eine Änderung an anderer Stelle verlangt keine Bestätigung und verschiebt nichts', async () => {
    const cal = gregorianischMitJahr(24);
    const { api, gespeichert } = await wendeAnMitAbleitung(cal, (bezug) => {
      bezug.name = 'Zweimond';
    });
    expect(api.calendarConfirmDependents).not.toHaveBeenCalled();
    expect(gespeichert.levels.find((lv) => lv.id === 'year').rel.count).toBe(24);
  });

  it('eine Änderung der Durchläufe verlangt die Bestätigung', async () => {
    const cal = gregorianischMitJahr(24);
    const { api, gespeichert } = await wendeAnMitAbleitung(cal, (bezug) => {
      bezug.levels.find((lv) => lv.id === 'year').leapPasses = '3';
    });
    expect(api.calendarConfirmDependents).toHaveBeenCalledTimes(1);
    expect(gespeichert.levels.find((lv) => lv.id === 'year').rel.count).toBe(36);
  });
});

// 4T-002205 (Epic 3E-000338, A7): Die Namens-Liste gehört zu den Positionen.
// Die Pflege schrieb Zeilen-Namen nur, wenn jede Zeile benannt war, und
// verwarf sonst alle; das Modell bringt jede Liste beim Einlesen auf die Zahl
// der Positionen. Gemessen am Zug-3-Stand (Fälle 2 und 3 der Vorlage vom
// 2026-10-10): zehn oder elf Namen an zwölf Zeilen waren nach dem Anwenden
// alle weg, dreizehn oder vierzehn wurden zwölf.
const monatsNamenDer = (cal) => cal.levels.find((lv) => lv.id === 'month').names;

describe('Namens-Liste nach der Zahl der Positionen im Rundlauf (4T-002205, AK2)', () => {
  it.each([10, 11, 13, 14])(
    '%i Monats-Namen an zwölf Zeilen: das Einlesen bringt sie auf zwölf, der Rundlauf ändert nichts',
    (n) => {
      const cal = gregorianischMitJahr(12, { monatsNamen: namenBis(n) });
      const erwartet = Array.from({ length: 12 }, (_, i) => (i < n ? `M${i + 1}` : null));
      expect(monatsNamenDer(cal)).toEqual(erwartet);
      expect(rundlauf(cal)).toStrictEqual(cal);
    },
  );
});

describe('Die Pflege schreibt die Zeilen-Namen, wie sie dastehen (4T-002205, AK3)', () => {
  const gregorianisch = () =>
    calendarToDraft(ausVorlage(CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian')));

  it('Zeile 5 geleert: die übrigen elf Namen bleiben, Monat 5 zeigt die Zahl', () => {
    const entwurf = gregorianisch();
    const vorher = entwurf.levels[ebenenIndex(entwurf, 'month')].table.map((row) => row.name);
    const { monat, feld } = imFormular(entwurf);
    eingeben(feld(`settings-calsys-table-0-${monat}-4-name`), '');
    const gespeichert = normalisiert(calendarPersistForm(entwurf));
    const erwartet = vorher.map((name, i) => (i === 4 ? null : name));
    expect(monatsNamenDer(gespeichert)).toEqual(erwartet);
    expect(formatTuple(gespeichert, [2026, 5, 15, 0, 0, 0], { named: true })).toBe('2026-05-15');
    expect(formatTuple(gespeichert, [2026, 6, 15, 0, 0, 0], { named: true })).toBe(
      `2026-${vorher[5]}-15`,
    );
  });

  it('eine unbenannte Zeile hinzugefügt: alle zwölf Namen bleiben, die neue Position zeigt die Zahl', () => {
    const entwurf = gregorianisch();
    const vorher = entwurf.levels[ebenenIndex(entwurf, 'month')].table.map((row) => row.name);
    const { monat, feld } = imFormular(entwurf);
    feld(`settings-calsys-table-0-${monat}-add`).click();
    expect(entwurf.levels[monat].table[12].name).toBe('');
    entwurf.levels[monat].table[12].length = '5';
    const gespeichert = normalisiert(calendarPersistForm(entwurf));
    expect(gespeichert.levels.find((lv) => lv.id === 'year').rel.count).toBe(13);
    expect(monatsNamenDer(gespeichert)).toEqual([...vorher, null]);
    expect(formatTuple(gespeichert, [2026, 13, 1, 0, 0, 0], { named: true })).toBe('2026-13-01');
  });
});

describe('Mitgelieferte Vorlagen in fünf Sprachen (4T-002205, AK5)', () => {
  // Schutz-Fall: Alle Vorlagen tragen passende Namens-Listen; das Einlesen
  // nach der neuen Regel ändert keine, und der Rundlauf bleibt unverändert.
  const KATALOGE = { de, en, fr, es, it: it_ };
  const namensListen = (def) =>
    [...def.levels, ...(def.cycles || []), ...(def.groups || [])].map((e) => [e.id, e.names]);

  it.each(Object.keys(KATALOGE))(
    'Sprache %s: Einlesen und Rundlauf lassen jede Namens-Liste',
    (code) => {
      const katalog = KATALOGE[code];
      const t = (key) => {
        if (!(key in katalog)) throw new Error(`Schlüssel fehlt im Katalog ${code}: ${key}`);
        return katalog[key];
      };
      for (const entry of CALENDAR_TEMPLATES) {
        const def = { id: entry.id, ...entry.create(t) };
        const cal = normalisiert(def);
        const roh = namensListen(def).map(([id, names]) => [
          id,
          names ? names.map((n) => n.trim()) : null,
        ]);
        expect(namensListen(cal), `${code}/${entry.id}`).toEqual(roh);
        expect(rundlauf(cal), `${code}/${entry.id}`).toStrictEqual(cal);
      }
    },
  );
});

// 4T-002206 (Epic 3E-000338, A8): Die Positions-Namen eines Zyklus standen in
// einem einzeiligen Feld, beim Laden mit Komma verbunden und beim Anwenden am
// Komma getrennt. Gemessen am Zug-3-Stand (Fall 4 der Vorlage vom 2026-10-10):
// «Mo, früh» als erster Wochentags-Name ergab acht Namen, alle folgenden
// Positionen rückten um eine Stelle, und «So» entfiel. Seither steht je Zeile
// ein Name, und ein Komma ist Teil des Namens.
const gregorianischerEntwurf = () =>
  calendarToDraft(ausVorlage(CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian')));
// Aus dem Modell, nicht aus dem Entwurf: Die Erwartung hängt so nicht an der
// Form, die hier geprüft wird.
const WOCHENTAGE = ausVorlage(CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian')).cycles[0].names;
const namensFeld = () => document.getElementById('settings-calsys-cycle-0-0-names');
const zyklusNamenDer = (entwurf) => normalisiert(calendarPersistForm(entwurf)).cycles[0].names;

describe('Positions-Namen eines Zyklus: Laden, ein Name je Zeile (4T-002206, AK1)', () => {
  it('jeder geladene Name steht in einer eigenen Zeile eines mehrzeiligen Felds', () => {
    const cal = ausVorlage(CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian'));
    expect(cal.cycles[0].names).toHaveLength(7);
    const entwurf = calendarToDraft(cal);
    expect(entwurf.cycles[0].namesText).toBe(cal.cycles[0].names.join('\n'));
    imFormular(entwurf);
    const feld = namensFeld();
    expect(feld.tagName).toBe('TEXTAREA');
    expect(feld.value.split('\n')).toEqual(cal.cycles[0].names);
    // Die Höhe folgt der Zahl der Namen, auch während der Eingabe.
    expect(feld.rows).toBe(7);
    eingeben(feld, `${feld.value}\nAchttag`);
    expect(feld.rows).toBe(8);
  });

  it('ein unbenannter Eintrag steht beim Laden als leere Zeile an seiner Stelle', () => {
    const definition = CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian').create(i18n.t);
    definition.cycles[0].names = WOCHENTAGE.map((n, i) => (i === 2 ? '' : n));
    const cal = normalisiert({ id: 'luecke', ...definition });
    expect(cal.cycles[0].names[2]).toBeNull();
    const zeilen = calendarToDraft(cal).cycles[0].namesText.split('\n');
    expect(zeilen).toEqual(WOCHENTAGE.map((n, i) => (i === 2 ? '' : n)));
  });
});

describe('Positions-Namen eines Zyklus: Anwenden, ein Name je Zeile (4T-002206, AK2)', () => {
  it.each(['Mo, früh', 'Mo,', 'Mo, früh, spät'])(
    'der erste Name «%s» bleibt ein Name, die folgenden Positionen behalten ihre Namen',
    (erster) => {
      const entwurf = gregorianischerEntwurf();
      imFormular(entwurf);
      eingeben(namensFeld(), [erster, ...WOCHENTAGE.slice(1)].join('\n'));
      const namen = zyklusNamenDer(entwurf);
      expect(namen).toEqual([erster, ...WOCHENTAGE.slice(1)]);
      // Der gespeicherte Name erscheint am Montag; der Rundlauf ändert nichts.
      const cal = normalisiert(calendarPersistForm(entwurf));
      expect(rundlauf(cal)).toStrictEqual(cal);
      expect(calendarToDraft(cal).cycles[0].namesText.split('\n')[0]).toBe(erster);
    },
  );

  it('eine leere Zeile mitten in der Liste ergibt eine unbenannte Position an derselben Stelle', () => {
    const entwurf = gregorianischerEntwurf();
    imFormular(entwurf);
    eingeben(namensFeld(), WOCHENTAGE.map((n, i) => (i === 2 ? '' : n)).join('\n'));
    expect(zyklusNamenDer(entwurf)).toEqual(WOCHENTAGE.map((n, i) => (i === 2 ? null : n)));
  });

  it('Zeilenumbrüche im Windows-Format gelten wie einfache; Leerraum am Rand und leere Zeilen am Ende entfallen', () => {
    const entwurf = gregorianischerEntwurf();
    entwurf.cycles[0].namesText = `  Mo, früh \r\n${WOCHENTAGE.slice(1).join('\r\n')}\r\n\r\n`;
    expect(calendarPersistForm(entwurf).cycles[0].names).toEqual([
      'Mo, früh',
      ...WOCHENTAGE.slice(1),
    ]);
  });
});

describe('Positions-Namen eines Zyklus ohne Komma unverändert (4T-002206, AK3)', () => {
  // Schutz-Fälle: Sie waren schon vor dem Task grün und müssen es bleiben.
  it('sieben gewöhnliche Namen laufen über das Feld unverändert rund (Schutz-Fall)', () => {
    const entwurf = gregorianischerEntwurf();
    imFormular(entwurf);
    const feld = namensFeld();
    eingeben(feld, feld.value);
    expect(zyklusNamenDer(entwurf)).toEqual(WOCHENTAGE);
  });

  it('eine unbenannte letzte Position bleibt unbenannt (Schutz-Fall)', () => {
    const definition = CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian').create(i18n.t);
    definition.cycles[0].names = WOCHENTAGE.slice(0, 6);
    const cal = normalisiert({ id: 'sechs', ...definition });
    expect(cal.cycles[0].names).toEqual([...WOCHENTAGE.slice(0, 6), null]);
    expect(rundlauf(cal)).toStrictEqual(cal);
  });

  it.each(CALENDAR_TEMPLATES.map((e) => [e.id, e]))(
    'die Zyklus-Namen der Vorlage %s laufen über das Feld unverändert rund (Schutz-Fall)',
    (_id, eintrag) => {
      const cal = ausVorlage(eintrag);
      const entwurf = calendarToDraft(cal);
      imFormular(entwurf);
      entwurf.cycles.forEach((_cycle, i) => {
        const feld = document.getElementById(`settings-calsys-cycle-0-${i}-names`);
        eingeben(feld, feld.value);
      });
      expect(normalisiert(calendarPersistForm(entwurf))).toStrictEqual(cal);
    },
  );
});
