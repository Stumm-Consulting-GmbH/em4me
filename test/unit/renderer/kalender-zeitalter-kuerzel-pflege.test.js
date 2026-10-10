// @vitest-environment jsdom
// 4T-001999 (Epic 3E-000307): Kennzeichen «Kürzel der Epoche immer schreiben»
// auf der Oberflächen-Seite — Weg durch die Entwurfs-Form der Einstellungen
// (Ausgabe und erneutes Einlesen), das Kontrollkästchen in der Gruppe der
// Epochen samt Live-Vorschau, keine Warnung vor verschobenen Werten, wenn am
// Bezug nur das Kennzeichen geändert wird, und die Kopf-Beschriftung der
// Eingabe-Hilfe. Die Regel selbst prüft test/unit/kalender-zeitalter-kuerzel.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
// Die geteilten Module brauchen kein window.api und stehen deshalb statisch da.
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';

// Der Katalog wird im Programm per fetch geladen; hier kommt er aus der Datei.
global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { calendarToDraft, calendarPersistForm, calendarConfigPersistForm } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { applyCalendarSection } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');
const { buildCalendarEditor } =
  await import('../../../src/renderer/modules/settings/settings-calendar-editor.js');
const { showCalendarPicker } =
  await import('../../../src/renderer/modules/calendar/calendar-picker.js');

// Zeitrechnung mit drei Epochen (Frühzeit, Mittelzeit, Neuzeit), 30-Tage-
// Monaten mit Namen und 12-Monate-Jahren; `mitKennzeichen` setzt das Feld.
// Die Neuzeit beginnt im internen Jahr 20, der Wert «6-03-07» liegt in ihr.
// Die Monate stehen als Längen-Tabelle da, weil der Entwurf der Einstellungen
// Positions-Namen nur an einer Längen-Tabelle führt.
const MONATE = [
  'Eis',
  'Tau',
  'Saat',
  'Blüte',
  'Grün',
  'Licht',
  'Glut',
  'Ernte',
  'Wein',
  'Nebel',
  'Frost',
  'Nacht',
];

function herrscher(id, mitKennzeichen) {
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
        names: MONATE,
        rel: { type: 'lengths', table: MONATE.map(() => 30) },
      },
      { id: 'jahr', name: 'Jahr', section: 'Datum', start: 1, rel: { type: 'factor', count: 12 } },
    ],
    epochs: [
      { name: 'Frühzeit', abbr: 'FZ', start: null },
      { name: 'Mittelzeit', abbr: 'MZ', start: [10, 1, 1] },
      { name: 'Neuzeit', abbr: 'NZ', start: [20, 1, 1] },
    ],
    ...(mitKennzeichen ? { alwaysWriteEpoch: true } : {}),
  };
}

const CONFIG = normalizeCalendarConfig({
  blocks: [
    {
      id: 'welt',
      calendars: [
        herrscher('Mit', true),
        herrscher('Ohne', false),
        { id: 'regierung', name: 'Regierung', derivedFrom: 'Ohne', zero: [25, 1, 1] },
      ],
    },
  ],
});
const MIT = CONFIG.blocks[0].calendars[0];
const OHNE = CONFIG.blocks[0].calendars[1];
const REGIERUNG = CONFIG.blocks[0].calendars[2];

const wieder = (ablage) =>
  normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [ablage] }] }).blocks[0].calendars[0];

// Die Eingabe-Hilfe hängt ihr Fenster einmalig an und behält es; es bleibt
// deshalb stehen, alles andere wird vor jedem Fall entfernt.
beforeEach(() => {
  for (const el of [...document.body.children]) {
    if (el.id !== 'calendar-picker-popup') el.remove();
  }
});

describe('Entwurfs-Form der Einstellungen (4T-001999, AK4)', () => {
  it('mit Kennzeichen: Entwurf trägt true, Ausgabe und erneutes Einlesen tragen es unverändert', () => {
    const entwurf = calendarToDraft(MIT);
    expect(entwurf.alwaysWriteEpoch).toBe(true);
    const ablage = calendarPersistForm(entwurf);
    expect(ablage.alwaysWriteEpoch).toBe(true);
    expect(wieder(ablage)).toStrictEqual(MIT);
  });

  it('ohne Kennzeichen: Entwurf trägt false, die Ausgabe kommt ohne das Feld zurück', () => {
    const entwurf = calendarToDraft(OHNE);
    expect(entwurf.alwaysWriteEpoch).toBe(false);
    const ablage = calendarPersistForm(entwurf);
    expect(JSON.stringify(ablage)).not.toContain('alwaysWriteEpoch');
    expect(wieder(ablage)).toStrictEqual(OHNE);
  });

  it('eine abgeleitete Zeitrechnung trägt das Kennzeichen weder im Entwurf noch in der Ablage', () => {
    const entwurf = calendarToDraft(REGIERUNG);
    expect('alwaysWriteEpoch' in entwurf).toBe(false);
    expect(JSON.stringify(calendarPersistForm(entwurf))).not.toContain('alwaysWriteEpoch');
  });
});

describe('Kontrollkästchen in der Pflege einer Zeitrechnung (4T-001999, AK5)', () => {
  function baue(cal) {
    const entwurf = { ...calendarToDraft(cal), previewInput: '6-03-07' };
    buildCalendarEditor(document.body, { calendars: [entwurf] }, entwurf, 0);
    return entwurf;
  }

  it('steht in der Gruppe der Epochen, beschriftet und mit Hinweis', () => {
    baue(OHNE);
    const kaestchen = document.getElementById('settings-calsys-epoch-always-0');
    expect(kaestchen.type).toBe('checkbox');
    const ueberschriften = [...document.querySelectorAll('h4')];
    const epochen = ueberschriften.find((h) => h.textContent === 'Epochen');
    const naechste = ueberschriften[ueberschriften.indexOf(epochen) + 1];
    expect(
      epochen.compareDocumentPosition(kaestchen) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      naechste.compareDocumentPosition(kaestchen) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(document.querySelector('label[for="settings-calsys-epoch-always-0"]').textContent).toBe(
      'Kürzel der Epoche immer schreiben',
    );
    expect(document.getElementById('settings-calsys-epoch-always-hint-0').textContent).toContain(
      'auch in der jüngsten Epoche',
    );
  });

  it('spiegelt den Entwurf, ändert ihn und aktualisiert die Vorschau sofort', () => {
    const entwurf = baue(MIT);
    const kaestchen = document.getElementById('settings-calsys-epoch-always-0');
    const vorschau = () => document.getElementById('settings-calsys-preview-0').textContent;
    expect(kaestchen.checked).toBe(true);
    expect(vorschau()).toContain('Kanonisch: 6-03-07 NZ');

    kaestchen.checked = false;
    kaestchen.dispatchEvent(new Event('change'));
    expect(entwurf.alwaysWriteEpoch).toBe(false);
    expect(vorschau()).toContain('Kanonisch: 6-03-07 ·');

    kaestchen.checked = true;
    kaestchen.dispatchEvent(new Event('change'));
    expect(entwurf.alwaysWriteEpoch).toBe(true);
    expect(vorschau()).toContain('Mit Namen: 6-Saat-07 NZ');
  });

  it('eine neu angelegte Zeitrechnung ohne Feld zeigt das Kästchen leer', () => {
    const entwurf = calendarToDraft(OHNE);
    delete entwurf.alwaysWriteEpoch;
    buildCalendarEditor(document.body, { calendars: [entwurf] }, entwurf, 0);
    expect(document.getElementById('settings-calsys-epoch-always-0').checked).toBe(false);
    expect(JSON.stringify(calendarPersistForm(entwurf))).not.toContain('alwaysWriteEpoch');
  });
});

describe('Warnung vor verschobenen Werten beim Anwenden (4T-001999)', () => {
  // Bezug «Ohne» mit der Ableitung «Regierung»: Der Entwurf wird gegen den
  // Schnappschuss des unveränderten Stands angewendet.
  async function wendeAn(aendere) {
    const values = {
      hasArea: true,
      blocks: [
        {
          id: 'welt',
          name: 'Welt',
          calendars: [calendarToDraft(OHNE), calendarToDraft(REGIERUNG)],
        },
      ],
    };
    const draft = { calendar: values, calendarSnapshot: calendarConfigPersistForm(values) };
    aendere(values.blocks[0].calendars[0]);
    window.api.calendarConfirmDependents = vi.fn(async () => true);
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    await applyCalendarSection(draft);
    return window.api;
  }

  it('das am Bezug gesetzte Kennzeichen löst keine Warnung aus und wird gespeichert', async () => {
    const api = await wendeAn((bezug) => {
      bezug.alwaysWriteEpoch = true;
    });
    expect(api.calendarConfirmDependents).not.toHaveBeenCalled();
    expect(api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
    const gespeichert = api.calendarSetAreaConfig.mock.calls[0][0].blocks[0].calendars[0];
    expect(gespeichert.alwaysWriteEpoch).toBe(true);
  });

  it('Gegenprobe: eine Änderung, die Werte verschiebt, warnt weiterhin', async () => {
    const api = await wendeAn((bezug) => {
      bezug.levels[1].table[0].length = '31';
    });
    expect(api.calendarConfirmDependents).toHaveBeenCalledTimes(1);
  });
});

describe('Kopf-Beschriftung der Eingabe-Hilfe (4T-001999, AK2)', () => {
  // Öffnet die Eingabe-Hilfe auf dem Wert, liest den sichtbaren Kopf und
  // schließt sie wieder (Abbrechen löst das Versprechen mit null auf).
  async function kopf(calendarName) {
    const ergebnis = showCalendarPicker({ config: CONFIG, calendarName, value: '6-03-07' });
    const text = document.getElementById('calendar-picker-unit-label').textContent;
    document.getElementById('calendar-picker-cancel').click();
    expect(await ergebnis).toBeNull();
    return text;
  }

  it('mit Kennzeichen steht das Kürzel der jüngsten Epoche im Kopf', async () => {
    expect(await kopf('Mit')).toBe('Saat 6 NZ');
  });

  it('ohne Kennzeichen bleibt der Kopf der jüngsten Epoche ohne Kürzel', async () => {
    expect(await kopf('Ohne')).toBe('Saat 6');
  });

  it('ältere Epochen tragen ihr Kürzel in beiden Fällen', async () => {
    const ergebnis = showCalendarPicker({
      config: CONFIG,
      calendarName: 'Ohne',
      value: '3-03-07 MZ',
    });
    expect(document.getElementById('calendar-picker-unit-label').textContent).toBe('Saat 3 MZ');
    document.getElementById('calendar-picker-cancel').click();
    await ergebnis;
  });
});
