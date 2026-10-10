// @vitest-environment jsdom
// 4T-001997 (Epic 3E-000307): Aufklapp-Menü der Kalender-Vorlagen in der
// Einstellungs-Sektion «Kalender-Systeme» — Menü an der Stelle des früheren
// Vorlage-Knopfes, Anlage einer Vorlage ohne weitere Eingabe, eindeutige Namen
// bei zweimaligem Anlegen und der unveränderte Weg ohne Vorlage. Die Sammlung
// selbst prüft test/unit/kalender-vorlagen.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

// Der Katalog wird im Programm per fetch geladen; hier kommt er aus der Datei.
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { renderCalendarSection, validateCalendarSection, calSysFreeTemplateName } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');

// Entwurf der Sektion mit einem geöffneten, leeren Block.
function entwurfMitOffenemBlock() {
  return {
    calendar: {
      hasArea: true,
      areaName: 'Welt',
      openBlock: 0,
      blocks: [{ id: '', name: 'Welt', calendars: [] }],
    },
  };
}

// Die Sektion neu zeichnen, wie es die Einstellungs-Seite nach jeder Änderung
// tut (ohne montierte Seite ist renderActiveSection hier wirkungslos).
function zeichne(draft) {
  document.body.innerHTML = '';
  renderCalendarSection(document.body, draft);
  return document.getElementById('settings-calsys-cal-template');
}

function waehle(menue, wert) {
  menue.value = wert;
  menue.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Aufklapp-Menü der Vorlagen (4T-001997)', () => {
  it('AK1: das Menü steht an der Stelle des Knopfes und zeigt die Vorlagen in Reihenfolge', () => {
    const menue = zeichne(entwurfMitOffenemBlock());
    expect(menue.tagName).toBe('SELECT');
    expect(menue.classList.contains('settings-select')).toBe(true);
    expect(menue.classList.contains('settings-calsys-cal-template')).toBe(true);
    // Dieselbe Knopf-Zeile, dieselbe Position: nach «Kalender hinzufügen» und
    // «Abgeleitete Zeitrechnung hinzufügen».
    const zeile = menue.parentElement;
    expect(zeile.className).toBe('settings-calsys-detail-buttons');
    expect([...zeile.children].map((el) => el.id)).toEqual([
      'settings-calsys-cal-add',
      'settings-calsys-derived-add',
      'settings-calsys-cal-template',
    ]);
    const eintraege = [...menue.options].map((opt) => [opt.value, opt.textContent]);
    expect(eintraege).toEqual([
      ['', 'Vorlage einfügen …'],
      ['gregorian', 'Gregorianischer Kalender'],
      // 4T-001998 (Epic 3E-000307): die sechs Vorlagen im heutigen Modell.
      ['julian', 'Julianischer Kalender'],
      // 4T-002002 (Epic 3E-000307): die tabellarische islamische an Platz 3.
      ['islamic-tabular', 'Hidschri-Kalender (tabellarisch)'],
      ['indian', 'Indischer Nationalkalender'],
      ['buddhist', 'Buddhistischer Kalender'],
      ['ethiopic', 'Äthiopischer Kalender'],
      ['coptic', 'Koptischer Kalender'],
      // 4T-002000 (Epic 3E-000307): die japanische Vorlage an Platz 12.
      ['japanese', 'Japanischer Kalender'],
      ['minguo', 'Minguo-Kalender'],
    ]);
    expect(menue.value).toBe('');
    expect(menue.getAttribute('aria-label')).toBe('Vorlage einfügen …');
  });

  it('AK2: die Auswahl legt die Definition ohne weitere Eingabe an', () => {
    const draft = entwurfMitOffenemBlock();
    const menue = zeichne(draft);
    waehle(menue, 'gregorian');
    const kalender = draft.calendar.blocks[0].calendars;
    expect(kalender).toHaveLength(1);
    expect(kalender[0].name).toBe('Gregorianischer Kalender');
    expect(kalender[0].id).toBe('');
    expect(kalender[0].levels.map((lv) => lv.id)).toEqual([
      'second',
      'minute',
      'hour',
      'day',
      'month',
      'year',
    ]);
    // Das Menü steht danach wieder auf dem ersten Eintrag, auch nach dem
    // Neuzeichnen, und der Editor der neuen Zeitrechnung ist da.
    expect(menue.value).toBe('');
    expect(zeichne(draft).value).toBe('');
    expect(document.getElementById('settings-calsys-cal-name-0').value).toBe(
      'Gregorianischer Kalender',
    );
    expect(validateCalendarSection(draft)).toBeNull();
  });

  // 4T-001998 (Epic 3E-000307): Jede der sechs weiteren Vorlagen legt über das
  // Menü ihre Definition an, mit Monaten, Woche und beiden Zeitaltern, und die
  // Prüfung der Sektion bleibt ohne Fehler.
  it('AK1 (4T-001998): jede weitere Vorlage legt über das Menü ihre Definition an', () => {
    const erwartet = [
      ['julian', 'Julianischer Kalender', 12],
      // 4T-002002: die tabellarische islamische Vorlage legt sich ebenso an.
      ['islamic-tabular', 'Hidschri-Kalender (tabellarisch)', 12],
      ['indian', 'Indischer Nationalkalender', 12],
      ['buddhist', 'Buddhistischer Kalender', 12],
      ['ethiopic', 'Äthiopischer Kalender', 13],
      ['coptic', 'Koptischer Kalender', 13],
      ['minguo', 'Minguo-Kalender', 12],
    ];
    const draft = entwurfMitOffenemBlock();
    for (const [wert] of erwartet) waehle(zeichne(draft), wert);
    const kalender = draft.calendar.blocks[0].calendars;
    expect(kalender.map((k) => k.name)).toEqual(erwartet.map(([, name]) => name));
    kalender.forEach((k, i) => {
      expect(k.levels.map((lv) => lv.id)).toEqual([
        'second',
        'minute',
        'hour',
        'day',
        'month',
        'year',
      ]);
      expect(k.cycles.map((c) => c.id)).toEqual(['week']);
      expect(k.epochs).toHaveLength(2);
      // Im Entwurf stehen Länge und Name je Monat in der Tabelle der Ebene.
      const monate = k.levels.find((lv) => lv.id === 'month').table;
      expect(monate).toHaveLength(erwartet[i][2]);
      expect(monate.every((m) => m.name !== '')).toBe(true);
    });
    expect(validateCalendarSection(draft)).toBeNull();
  });

  // 4T-002000 (Epic 3E-000307): Die japanische Vorlage legt über das Menü ihre
  // Definition mit «vor Meiji» und fünf Ären an und trägt das Kennzeichen
  // «Kürzel immer schreiben» in den Entwurf.
  it('AK4 (4T-002000): die japanische Vorlage legt über das Menü ihre Definition an', () => {
    const draft = entwurfMitOffenemBlock();
    waehle(zeichne(draft), 'japanese');
    const [kalender] = draft.calendar.blocks[0].calendars;
    expect(kalender.name).toBe('Japanischer Kalender');
    expect(kalender.alwaysWriteEpoch).toBe(true);
    expect(kalender.epochs).toHaveLength(6);
    expect(kalender.cycles.map((c) => c.id)).toEqual(['week']);
    expect(kalender.levels.find((lv) => lv.id === 'month').table).toHaveLength(12);
    expect(validateCalendarSection(draft)).toBeNull();
  });

  it('AK3: zweimaliges Anlegen ergibt zwei unterscheidbare Einträge, die Prüfung bleibt ohne Fehler', () => {
    const draft = entwurfMitOffenemBlock();
    waehle(zeichne(draft), 'gregorian');
    waehle(zeichne(draft), 'gregorian');
    const namen = draft.calendar.blocks[0].calendars.map((c) => c.name);
    expect(namen).toEqual(['Gregorianischer Kalender', 'Gregorianischer Kalender 2']);
    expect(validateCalendarSection(draft)).toBeNull();
  });

  it('AK3: der freie Name zählt über alle Blöcke und ohne Groß-/Kleinschreibung', () => {
    const values = {
      blocks: [
        { calendars: [{ name: 'gregorianischer kalender' }] },
        { calendars: [{ name: ' Gregorianischer Kalender 2 ' }, { name: 'Eigen' }] },
      ],
    };
    expect(calSysFreeTemplateName(values, 'Gregorianischer Kalender')).toBe(
      'Gregorianischer Kalender 3',
    );
    expect(calSysFreeTemplateName(values, 'Julianischer Kalender')).toBe('Julianischer Kalender');
  });

  it('AK6: «Kalender hinzufügen» legt weiterhin eine leere Zeitrechnung an', () => {
    const draft = entwurfMitOffenemBlock();
    zeichne(draft);
    document.getElementById('settings-calsys-cal-add').click();
    const kalender = draft.calendar.blocks[0].calendars;
    expect(kalender).toHaveLength(1);
    expect(kalender[0].name).toBe('');
    expect(kalender[0].levels).toHaveLength(1);
    expect(kalender[0].levels[0].id).toBe('ebene-1');
  });
});
