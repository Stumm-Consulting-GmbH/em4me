// @vitest-environment jsdom
// 4T-001874 (Epic 3E-000323): Dialog «Datum umrechnen» — Aufbau und Zeilen aus
// blockEquivalents, Wechsel des Ausgangspunkts über eine Zeile, Meldung bei
// ungültigem Datum und Auskunft ohne Ergebnis, Hinweis-Zeilen, Vorbelegung aus
// dem Cursor, Bedienung nur mit Tastatur-Ereignissen, kein Schreibzugriff
// außer über die Tasten «Kopieren» und «Einfügen», kein Text ohne Schlüssel;
// dazu Kommando und Verfügbarkeits-Regel. Auswahl als Quelldatum und die
// beiden Tasten selbst (4T-002097) prüft kalender-umrechnung-uebernahme.test.js.
//
// Die Übersetzung ist eine Attrappe, die den Schlüssel zurückgibt (bei den
// beiden Schlüsseln mit Platzhalter samt `{name}`): Jeder sichtbare Text, der
// nicht aus Name und Wert einer Zeitrechnung besteht, muss so als Schlüssel
// erscheinen. Die Zusammenstellung der Zeilen selbst prüft
// test/unit/kalender-umrechnung-entsprechungen.test.js.
//
// Dieser Fall prüft den Dialog im jsdom-Umfeld ohne Gestaltungs-Regeln; die
// Sichtbarkeit im laufenden Programm weist er nicht nach.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import {
  convertBetween,
  formatTuple,
  parseCanonical,
} from '../../../src/shared/calendar/calendar-core.js';
import { blockEquivalents } from '../../../src/shared/calendar/calendar-convert.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';

const MIT_PLATZHALTER = new Set([
  'calendarConvert.outOfRange',
  'calendarConvert.unknown',
  'calendarConvert.copyTitle',
  'calendarConvert.insertTitle',
]);
vi.mock('../../../src/renderer/i18n.js', async (importOriginal) => ({
  ...(await importOriginal()),
  t: (key) => (MIT_PLATZHALTER.has(key) ? `${key} {name}` : key),
}));

const { showCalendarConvertDialog, calendarValueAt, calendarValueAtCursor, openCalendarConvertAt } =
  await import('../../../src/renderer/modules/calendar/calendar-convert-dialog.js');
const { showCalendarPicker } =
  await import('../../../src/renderer/modules/calendar/calendar-picker.js');
const { setAreaCalendarConfig } =
  await import('../../../src/renderer/modules/calendar/calendar-config.js');
const { buildEditorContextMenuItems } =
  await import('../../../src/renderer/modules/editor/editor-context-menu.js');
const { state: appState } = await import('../../../src/renderer/modules/app/app-state.js');

// --- Zeitrechnungen -----------------------------------------------------------

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

// 30-Tage-Monate, 12-Monate-Jahre, drei Epochen (Muster
// kalender-zeitalter-kuerzel-pflege.test.js); `namen` schaltet die
// Monatsnamen, `anker` verschiebt den Block-Anker.
function jahreskalender(id, { namen = false, anker } = {}) {
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
        ...(namen ? { names: MONATE } : {}),
        rel: { type: 'lengths', table: MONATE.map(() => 30) },
      },
      { id: 'jahr', name: 'Jahr', section: 'Datum', start: 1, rel: { type: 'factor', count: 12 } },
    ],
    epochs: [
      { name: 'Frühzeit', abbr: 'FZ', start: null },
      { name: 'Mittelzeit', abbr: 'MZ', start: [10, 1, 1] },
      { name: 'Neuzeit', abbr: 'NZ', start: [20, 1, 1] },
    ],
    ...(anker ? { blockAnchor: anker } : {}),
  };
}

// Kleine Zeitrechnung mit freiem Maßstab (Muster «taktwerk» in
// test/unit/kalender-umrechnung-entsprechungen.test.js).
function taktwerk(id, num, den) {
  return {
    id,
    name: id,
    levels: [
      { id: 'sekunde', name: 'Sekunde', section: 'Zeit', start: 0 },
      { id: 'tag', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 100 } },
      {
        id: 'monat',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        rel: { type: 'factor', count: 10 },
      },
    ],
    blockAnchor: [1, 1, 0],
    blockScale: { num, den },
  };
}

const WELT = {
  id: 'welt',
  name: 'Welt',
  calendars: [
    jahreskalender('Mond', { namen: true }),
    jahreskalender('Zahl', { anker: [5, 2, 3] }),
    jahreskalender('Sonne', { namen: true, anker: [3, 7, 11] }),
    { id: 'Regierung', name: 'Regierung', derivedFrom: 'Mond', zero: [25, 1, 1] },
  ],
};
const GROSS = 1e15;
const TAKT = {
  id: 'takt',
  name: 'Takt',
  calendars: [
    taktwerk('quelle', GROSS, 1),
    taktwerk('winzig', 1, 1),
    taktwerk('nachbar', GROSS, 1),
  ],
};
const EINSAM = { id: 'einsam', name: 'Einsam', calendars: [jahreskalender('Solo')] };
const LEER = { id: 'leer', name: 'Leer', calendars: [] };

const CONFIG = normalizeCalendarConfig({ blocks: [WELT, TAKT, EINSAM, LEER] });
const NUR_WELT = normalizeCalendarConfig({ blocks: [WELT] });

const blockVon = (config, id) => config.blocks.find((b) => b.id === id);
const kalender = (config, blockId, id) =>
  blockVon(config, blockId).calendars.find((c) => c.id === id);

// --- Hilfen am Dialog ---------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const feld = () => $('#calendar-convert-date');
// 4T-002097: je Zeile der Knopf «Name: Wert»; «Kopieren» und «Einfügen» stehen daneben.
const zeilenKnoepfe = () => [
  ...document.querySelectorAll('#calendar-convert-list .calendar-convert-entry'),
];
const textZeilen = () => [
  ...document.querySelectorAll('#calendar-convert-list .calendar-convert-row-text'),
];
const meldung = () => $('#calendar-convert-invalid');

function taste(el, key, extra = {}) {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  el.dispatchEvent(ereignis);
  return ereignis;
}

// Die Eingabe-Hilfe löst ihr Versprechen synchron auf; der Dialog setzt nach
// dem `await` fort. Ein Durchlauf der Ereignis-Schleife genügt dafür.
const naechsterDurchlauf = () => new Promise((resolve) => setTimeout(resolve, 0));

function tippe(text) {
  feld().value = text;
  feld().dispatchEvent(new Event('input', { bubbles: true }));
}

function waehle(select, wert) {
  select.value = wert;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

// Erwarteter Zeilen-Text: Name und Wert mit Namen, bei einer Ableitung
// kanonisch (wie das Abzeichen).
function erwarteteZeilen(block, vonId, tupel) {
  const ergebnis = blockEquivalents(block, vonId, tupel);
  expect(ergebnis.ok).toBe(true);
  return ergebnis.rows.map((r) =>
    r.ok
      ? `${r.calendar.name}: ${formatTuple(r.calendar, r.tuple, { named: !r.calendar.derived })}`
      : `calendarConvert.${r.code === 'unknown' ? 'unknown' : 'outOfRange'} ${r.calendar.name}`,
  );
}

// Die Eingabe-Hilfe hängt ihr Fenster einmalig an und behält es; es bleibt
// stehen, alles andere wird vor jedem Fall entfernt.
beforeEach(() => {
  for (const el of [...document.body.children]) {
    if (el.id !== 'calendar-picker-popup') el.remove();
  }
});

describe('AK10: Aufbau und Zeilen (4T-001874)', () => {
  it('AK10: Titel, Beschriftungen, Auswahl, Feld und Zeilen gleich blockEquivalents', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    const inhalt = $('.calendar-convert-content');
    expect(inhalt.getAttribute('role')).toBe('dialog');
    expect(inhalt.getAttribute('aria-modal')).toBe('true');
    expect($('#' + inhalt.getAttribute('aria-labelledby')).textContent).toBe(
      'calendarConvert.title',
    );
    expect(inhalt.closest('.bookmark-modal')).not.toBeNull();
    // Beschriftungen an beiden Auswahlen und am Feld.
    for (const [id, schluessel] of [
      ['calendar-convert-block', 'calendarConvert.block'],
      ['calendar-convert-calendar', 'calendarConvert.calendar'],
      ['calendar-convert-date', 'calendarConvert.date'],
    ]) {
      expect($(`label[for="${id}"]`).textContent).toBe(schluessel);
    }
    // Block-Auswahl ohne den Block ohne Zeitrechnung.
    expect([...$('#calendar-convert-block').options].map((o) => o.value)).toEqual([
      'welt',
      'takt',
      'einsam',
    ]);
    expect($('#calendar-convert-block').value).toBe('welt');
    expect([...$('#calendar-convert-calendar').options].map((o) => o.value)).toEqual([
      'Mond',
      'Zahl',
      'Sonne',
      'Regierung',
    ]);
    expect($('#calendar-convert-calendar').value).toBe('Mond');
    expect(feld().value).toBe('6-03-07');
    expect(document.activeElement).toBe(feld());

    const mond = kalender(CONFIG, 'welt', 'Mond');
    const tupel = parseCanonical(mond, '6-03-07').tuple;
    const erwartet = erwarteteZeilen(blockVon(CONFIG, 'welt'), 'Mond', tupel);
    expect(zeilenKnoepfe().map((b) => b.textContent)).toEqual(erwartet);
    expect(zeilenKnoepfe().map((b) => b.dataset.calendarId)).toEqual([
      'Zahl',
      'Sonne',
      'Regierung',
    ]);
    // Die Zeile mit Namen zeigt den Monatsnamen, die Ableitung den kanonischen Wert.
    expect(erwartet[1]).toMatch(/^Sonne: \d+-[A-Za-zÄÖÜäöüß]+-\d+/);
    expect(textZeilen()).toEqual([]);
    expect(meldung().hidden).toBe(true);

    $('#calendar-convert-close').click();
    expect(await fertig).toBeUndefined();
    expect($('.calendar-convert-modal')).toBeNull();
  });

  it('AK10: dieselben Werte wie die «Entsprechungen im Block» der Eingabe-Hilfe', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    const dialogZeilen = zeilenKnoepfe().map((b) => b.textContent);
    $('#calendar-convert-close').click();
    await fertig;

    const hilfe = showCalendarPicker({ config: CONFIG, calendarName: 'Mond', value: '6-03-07' });
    const hilfeZeilen = [
      ...document.querySelectorAll('#calendar-picker-popup .calendar-picker-conv'),
    ].map((b) => b.textContent);
    document.getElementById('calendar-picker-cancel').click();
    expect(await hilfe).toBeNull();

    // Gleiche Zeitrechnungen in gleicher Reihenfolge, je Zeile derselbe
    // Zeitpunkt. Die Eingabe-Hilfe schreibt kanonisch, der Dialog bei einer
    // gewöhnlichen Zeitrechnung mit Namen (Vertrag des Dialogs, wie das
    // Abzeichen); ohne Positions-Namen und bei der Ableitung sind beide Texte
    // gleich.
    expect(hilfeZeilen).toHaveLength(dialogZeilen.length);
    hilfeZeilen.forEach((text, i) => {
      const name = text.slice(0, text.indexOf(':'));
      const wert = text.slice(text.indexOf(':') + 2);
      const cal = kalender(CONFIG, 'welt', name);
      const tupel = parseCanonical(cal, wert).tuple;
      expect(dialogZeilen[i]).toBe(`${name}: ${formatTuple(cal, tupel, { named: !cal.derived })}`);
    });
    expect(dialogZeilen[0]).toBe(hilfeZeilen[0]);
    expect(dialogZeilen[2]).toBe(hilfeZeilen[2]);
  });

  it('AK10: bei genau einem Block entfällt die Block-Auswahl', async () => {
    const fertig = showCalendarConvertDialog({ config: NUR_WELT });
    expect($('#calendar-convert-block')).toBeNull();
    expect($('label[for="calendar-convert-block"]')).toBeNull();
    expect($('#calendar-convert-calendar')).not.toBeNull();
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK10: ohne Zeitrechnung öffnet nichts', async () => {
    expect(await showCalendarConvertDialog({ config: null })).toBeUndefined();
    expect(
      await showCalendarConvertDialog({ config: normalizeCalendarConfig({ blocks: [LEER] }) }),
    ).toBeUndefined();
    expect($('.calendar-convert-modal')).toBeNull();
  });
});

describe('AK11: eine Zeile macht ihre Zeitrechnung zum Ausgangspunkt (4T-001874)', () => {
  it('AK11: Zeile «Zahl» und zurück über Zeile «Mond»', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    const mond = kalender(CONFIG, 'welt', 'Mond');
    const zahl = kalender(CONFIG, 'welt', 'Zahl');
    const imZahl = convertBetween(mond, parseCanonical(mond, '6-03-07').tuple, zahl).tuple;

    zeilenKnoepfe()
      .find((b) => b.dataset.calendarId === 'Zahl')
      .click();
    expect($('#calendar-convert-calendar').value).toBe('Zahl');
    expect(feld().value).toBe(formatTuple(zahl, imZahl));
    expect(document.activeElement).toBe(feld());
    expect(zeilenKnoepfe().map((b) => b.dataset.calendarId)).toEqual([
      'Mond',
      'Sonne',
      'Regierung',
    ]);
    expect(zeilenKnoepfe().map((b) => b.textContent)).toEqual(
      erwarteteZeilen(blockVon(CONFIG, 'welt'), 'Zahl', imZahl),
    );

    zeilenKnoepfe()
      .find((b) => b.dataset.calendarId === 'Mond')
      .click();
    expect($('#calendar-convert-calendar').value).toBe('Mond');
    expect(feld().value).toBe('6-03-07');
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK11: auch eine Ableitung wird Ausgangspunkt, ihr Wert kanonisch', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '30-01-01',
    });
    const regierung = kalender(CONFIG, 'welt', 'Regierung');
    const knopf = zeilenKnoepfe().find((b) => b.dataset.calendarId === 'Regierung');
    const wert = knopf.textContent.slice('Regierung: '.length);
    knopf.click();
    expect($('#calendar-convert-calendar').value).toBe('Regierung');
    expect(feld().value).toBe(wert);
    expect(parseCanonical(regierung, feld().value).ok).toBe(true);
    expect(zeilenKnoepfe()[0].textContent).toBe('Mond: 30-Eis-01');
    $('#calendar-convert-close').click();
    await fertig;
  });
});

describe('AK5: Fälle ohne Ergebnis (4T-001874)', () => {
  it('AK5: ungültiges Datum: Meldung am Feld, keine Zeilen', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    tippe('6-13-07');
    expect(meldung().hidden).toBe(false);
    expect(meldung().textContent).toBe('calendarConvert.invalid');
    expect(meldung().getAttribute('aria-live')).toBe('polite');
    expect(feld().getAttribute('aria-describedby')).toBe('calendar-convert-invalid');
    expect(feld().getAttribute('aria-invalid')).toBe('true');
    expect($('#calendar-convert-list').children).toHaveLength(0);
    // Wieder gültig: Meldung weg, Zeilen da.
    tippe('6-12-07');
    expect(meldung().hidden).toBe(true);
    expect(feld().hasAttribute('aria-invalid')).toBe(false);
    expect(zeilenKnoepfe()).toHaveLength(3);
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK5: Ziel außerhalb des darstellbaren Bereichs: Text-Zeile ohne Knopf', async () => {
    const quelle = kalender(CONFIG, 'takt', 'quelle');
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'quelle',
      value: formatTuple(quelle, [1000000, 1, 0]),
    });
    expect($('#calendar-convert-block').value).toBe('takt');
    expect(textZeilen().map((z) => z.textContent)).toEqual(['calendarConvert.outOfRange winzig']);
    expect(textZeilen()[0].tagName).not.toBe('BUTTON');
    expect(textZeilen()[0].querySelector('button')).toBeNull();
    expect(zeilenKnoepfe().map((b) => b.dataset.calendarId)).toEqual(['nachbar']);
    // Die Reihenfolge ist die des Blocks.
    expect([...$('#calendar-convert-list').children].map((el) => el.dataset.calendarId)).toEqual([
      'winzig',
      'nachbar',
    ]);
    $('#calendar-convert-close').click();
    await fertig;
  });
});

describe('AK13: Hinweis-Zeilen (4T-001874)', () => {
  it('AK13: die Hinweis-Zeile zur Block-Grenze steht immer unter der Liste', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    const hinweis = () => $('.calendar-convert-hint');
    expect(hinweis().textContent).toBe('calendarConvert.blockHint');
    expect(
      $('#calendar-convert-list').compareDocumentPosition(hinweis()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    tippe('kein Datum');
    expect(hinweis().textContent).toBe('calendarConvert.blockHint');
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK13: Block mit einer Zeitrechnung: Auskunft statt leerer Liste', async () => {
    const fertig = showCalendarConvertDialog({ config: CONFIG, calendarName: 'Solo' });
    expect(feld().value).toBe(
      formatTuple(
        kalender(CONFIG, 'einsam', 'Solo'),
        kalender(CONFIG, 'einsam', 'Solo').blockAnchor,
      ),
    );
    expect($('.calendar-convert-single').textContent).toBe('calendarConvert.single');
    expect(zeilenKnoepfe()).toEqual([]);
    expect($('.calendar-convert-hint').textContent).toBe('calendarConvert.blockHint');
    // Ungültig: weder Auskunft noch Zeilen, nur die Meldung.
    tippe('0-01-01');
    expect($('.calendar-convert-single')).toBeNull();
    expect(meldung().hidden).toBe(false);
    $('#calendar-convert-close').click();
    await fertig;
  });
});

describe('AK12: Vorbelegung (4T-001874)', () => {
  it('AK12: Name und Wert belegen Block, Zeitrechnung und Datum vor', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Sonne',
      value: '7-02-03',
    });
    expect($('#calendar-convert-block').value).toBe('welt');
    expect($('#calendar-convert-calendar').value).toBe('Sonne');
    expect(feld().value).toBe('7-02-03');
    expect(meldung().hidden).toBe(true);
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK12: ein ungültiger Wert bleibt stehen, die Meldung erscheint sofort', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Zahl',
      value: 'quatsch',
    });
    expect($('#calendar-convert-calendar').value).toBe('Zahl');
    expect(feld().value).toBe('quatsch');
    expect(meldung().hidden).toBe(false);
    expect(zeilenKnoepfe()).toEqual([]);
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK12: ohne oder mit unbekannter Zeitrechnung: erster Block, erste Zeitrechnung, Anker', async () => {
    for (const vorbelegung of [{}, { calendarName: 'Gibt es nicht', value: '1-01-01' }]) {
      const fertig = showCalendarConvertDialog({ config: CONFIG, ...vorbelegung });
      const mond = kalender(CONFIG, 'welt', 'Mond');
      expect($('#calendar-convert-block').value).toBe('welt');
      expect($('#calendar-convert-calendar').value).toBe('Mond');
      expect(feld().value).toBe(formatTuple(mond, mond.blockAnchor));
      $('#calendar-convert-close').click();
      await fertig;
    }
  });

  it('AK12: der Wert unter dem Cursor — innerhalb, an beiden Rändern, außerhalb', () => {
    const zeile = 'Am @{Mond: 6-03-07} und @{Zahl: 1-01-01}.';
    const anfang = zeile.indexOf('@{Mond');
    const ende = zeile.indexOf('}') + 1;
    expect(calendarValueAt(zeile, anfang + 5)).toEqual({ calendarName: 'Mond', value: '6-03-07' });
    expect(calendarValueAt(zeile, anfang)).toEqual({ calendarName: 'Mond', value: '6-03-07' });
    expect(calendarValueAt(zeile, ende)).toEqual({ calendarName: 'Mond', value: '6-03-07' });
    expect(calendarValueAt(zeile, 1)).toBeNull();
    expect(calendarValueAt(zeile, zeile.length - 3)).toEqual({
      calendarName: 'Zahl',
      value: '1-01-01',
    });
    expect(calendarValueAt('ohne Wert', 3)).toBeNull();
  });

  it('AK12: aus einem Editor-Zustand — Zeile des Cursors, ohne Editor nichts', () => {
    const doc = 'erste Zeile\nZweite @{Sonne: 7-02-03} hier';
    const pos = doc.indexOf('7-02');
    const view = { state: EditorState.create({ doc, selection: { anchor: pos } }) };
    expect(calendarValueAtCursor(view)).toEqual({ calendarName: 'Sonne', value: '7-02-03' });
    const daneben = { state: EditorState.create({ doc, selection: { anchor: 3 } }) };
    expect(calendarValueAtCursor(daneben)).toEqual({});
    expect(calendarValueAtCursor(null)).toEqual({});
  });
});

describe('AK7: Bedienung nur mit der Tastatur (4T-001874)', () => {
  it('AK7: Escape schließt, der Fokus kehrt an seinen Ausgangsort zurück', async () => {
    const vorher = document.createElement('button');
    document.body.appendChild(vorher);
    vorher.focus();
    const fertig = showCalendarConvertDialog({ config: CONFIG });
    expect(document.activeElement).toBe(feld());
    const ereignis = taste(feld(), 'Escape');
    expect(ereignis.defaultPrevented).toBe(true);
    expect(await fertig).toBeUndefined();
    expect($('.calendar-convert-modal')).toBeNull();
    expect(document.activeElement).toBe(vorher);
  });

  it('AK7: Tab läuft in Element-Reihenfolge und bleibt im Dialog', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    // 4T-002097: je Zeile Wert-Knopf und «Kopieren»; «Einfügen» ist ohne
    // Einfüge-Rückruf deaktiviert und fällt aus der Reihe.
    const reihe = [
      '#calendar-convert-block',
      '#calendar-convert-calendar',
      '#calendar-convert-date',
      '#calendar-convert-pick',
      ...zeilenKnoepfe().flatMap((b) => {
        const zeile = `#calendar-convert-list .calendar-convert-item[data-calendar-id="${b.dataset.calendarId}"]`;
        return [`${zeile} .calendar-convert-entry`, `${zeile} .calendar-convert-copy`];
      }),
      '#calendar-convert-close',
    ].map((sel) => $(sel));
    expect(reihe.every(Boolean)).toBe(true);
    // Vom Feld aus vorwärts einmal herum.
    let idx = reihe.indexOf(feld());
    for (let i = 0; i < reihe.length; i++) {
      taste(document.activeElement, 'Tab');
      idx = (idx + 1) % reihe.length;
      expect(document.activeElement).toBe(reihe[idx]);
    }
    // Rückwärts vom ersten Element springt es ans Ende.
    reihe[0].focus();
    taste(reihe[0], 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(reihe[reihe.length - 1]);
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK7: Enter im Feld schließt nicht, Enter auf einer Zeile wechselt den Ausgangspunkt', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    const ereignis = taste(feld(), 'Enter');
    expect(ereignis.defaultPrevented).toBe(true);
    expect($('.calendar-convert-modal')).not.toBeNull();
    expect(feld().value).toBe('6-03-07');

    const zeile = zeilenKnoepfe().find((b) => b.dataset.calendarId === 'Zahl');
    zeile.focus();
    taste(zeile, 'Enter');
    expect($('#calendar-convert-calendar').value).toBe('Zahl');
    expect(document.activeElement).toBe(feld());

    // Enter auf «Schließen» schließt.
    $('#calendar-convert-close').focus();
    taste($('#calendar-convert-close'), 'Enter');
    expect(await fertig).toBeUndefined();
  });

  it('AK7: Wechsel der Zeitrechnung behält den Zeitpunkt, Wechsel des Blocks springt zum Anker', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    const mond = kalender(CONFIG, 'welt', 'Mond');
    const sonne = kalender(CONFIG, 'welt', 'Sonne');
    const tupel = parseCanonical(mond, '6-03-07').tuple;
    waehle($('#calendar-convert-calendar'), 'Sonne');
    expect(feld().value).toBe(formatTuple(sonne, convertBetween(mond, tupel, sonne).tuple));
    // Bei ungültigem Datum: der Anker der neuen Zeitrechnung.
    tippe('quatsch');
    waehle($('#calendar-convert-calendar'), 'Zahl');
    const zahl = kalender(CONFIG, 'welt', 'Zahl');
    expect(feld().value).toBe(formatTuple(zahl, zahl.blockAnchor));

    waehle($('#calendar-convert-block'), 'takt');
    const quelle = kalender(CONFIG, 'takt', 'quelle');
    expect($('#calendar-convert-calendar').value).toBe('quelle');
    expect([...$('#calendar-convert-calendar').options].map((o) => o.value)).toEqual([
      'quelle',
      'winzig',
      'nachbar',
    ]);
    expect(feld().value).toBe(formatTuple(quelle, quelle.blockAnchor));
    expect(zeilenKnoepfe().map((b) => b.dataset.calendarId)).toEqual(['winzig', 'nachbar']);
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK7: «Wählen …» öffnet die Eingabe-Hilfe; Escape dort lässt den Dialog offen, OK übernimmt den reinen Wert', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'Mond',
      value: '6-03-07',
    });
    const popup = () => document.getElementById('calendar-picker-popup');
    const pick = $('#calendar-convert-pick');
    pick.focus();
    taste(pick, 'Enter');
    expect(popup().hidden).toBe(false);
    expect(document.getElementById('calendar-picker-unit-label').textContent).toBe('Saat 6');
    // Escape in der Eingabe-Hilfe: nur sie schließt.
    taste(popup(), 'Escape');
    await naechsterDurchlauf();
    expect(popup().hidden).toBe(true);
    expect($('.calendar-convert-modal')).not.toBeNull();
    expect(document.activeElement).toBe(feld());
    expect(feld().value).toBe('6-03-07');

    // Ein Tag weiter, übernehmen.
    taste(pick, 'Enter');
    taste(popup(), 'ArrowRight');
    document.getElementById('calendar-picker-ok').click();
    await naechsterDurchlauf();
    expect(feld().value).toBe('6-03-08');
    expect(feld().value.includes('@{')).toBe(false);
    expect($('#calendar-convert-calendar').value).toBe('Mond');
    expect(document.activeElement).toBe(feld());
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK7: Klick auf den Hintergrund schließt', async () => {
    const fertig = showCalendarConvertDialog({ config: CONFIG });
    $('.calendar-convert-modal .bookmark-modal-backdrop').click();
    expect(await fertig).toBeUndefined();
  });
});

// 4T-002097: Seither schreiben «Kopieren» (Zwischenablage) und «Einfügen»
// (Rückruf); alles Übrige bleibt ohne Schreibzugriff. Die beiden Tasten prüft
// kalender-umrechnung-uebernahme.test.js.
describe('AK14: kein Schreibzugriff außer über Kopieren und Einfügen (4T-001874)', () => {
  function tiefGefroren(wert) {
    if (wert && typeof wert === 'object' && !Object.isFrozen(wert)) {
      Object.freeze(wert);
      for (const kind of Object.values(wert)) tiefGefroren(kind);
    }
    return wert;
  }

  it('AK14: weder die Brücke noch ein Editor noch die Konfiguration werden berührt', async () => {
    // Jede Funktion der Prozess-Brücke wird beobachtet.
    const aufrufe = [];
    const original = { ...window.api };
    for (const [name, fn] of Object.entries(original)) {
      if (typeof fn === 'function') {
        window.api[name] = (...args) => {
          aufrufe.push(name);
          return fn(...args);
        };
      }
    }
    // Eine gefrorene Konfiguration: jeder Schreibversuch würfe.
    const config = tiefGefroren(normalizeCalendarConfig({ blocks: [WELT, TAKT] }));
    const vorher = JSON.stringify(config);
    const doc = 'Text @{Mond: 6-03-07}';
    const dispatch = vi.fn();
    const view = {
      state: EditorState.create({ doc, selection: { anchor: 8 } }),
      dispatch,
    };
    const onInsert = vi.fn();
    try {
      const fertig = showCalendarConvertDialog({
        config,
        ...calendarValueAtCursor(view),
        onInsert,
      });
      zeilenKnoepfe()[0].click();
      tippe('7-01-01');
      waehle($('#calendar-convert-calendar'), 'Sonne');
      waehle($('#calendar-convert-block'), 'takt');
      taste(feld(), 'Enter');
      taste(feld(), 'Escape');
      await fertig;
    } finally {
      Object.assign(window.api, original);
    }
    expect(aufrufe).toEqual([]);
    expect(onInsert).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe(doc);
    expect(JSON.stringify(config)).toBe(vorher);
  });
});

describe('AK6: kein Text ohne Schlüssel (4T-001874)', () => {
  it('AK6: jeder sichtbare Text ist ein Schlüssel oder Name und Wert einer Zeitrechnung', async () => {
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'quelle',
      value: formatTuple(kalender(CONFIG, 'takt', 'quelle'), [1000000, 1, 0]),
    });
    const inhalt = $('.calendar-convert-content');
    const namen = CONFIG.blocks.flatMap((b) => [b.name, ...b.calendars.map((c) => c.name)]);
    const blaetter = [...inhalt.querySelectorAll('*')].filter(
      (el) => el.children.length === 0 && el.textContent.trim() !== '' && el.tagName !== 'INPUT',
    );
    expect(blaetter.length).toBeGreaterThan(5);
    const fremd = blaetter
      .map((el) => el.textContent)
      .filter((text) => {
        if (/^calendarConvert\.[A-Za-z]+( \S+)?$/.test(text)) return false;
        if (namen.includes(text)) return false;
        const name = text.slice(0, text.indexOf(':'));
        return !(text.includes(': ') && namen.includes(name));
      });
    expect(fremd).toEqual([]);
    // Und die Texte mit Schlüssel sind die der Tabelle des Vorgangs.
    const schluessel = blaetter
      .map((el) => el.textContent.split(' ')[0])
      .filter((s) => s.startsWith('calendarConvert.'));
    expect(new Set(schluessel)).toEqual(
      new Set([
        'calendarConvert.title',
        'calendarConvert.block',
        'calendarConvert.calendar',
        'calendarConvert.date',
        'calendarConvert.pick',
        'calendarConvert.equivalents',
        'calendarConvert.outOfRange',
        'calendarConvert.blockHint',
        'calendarConvert.close',
        // 4T-002097: die beiden Tasten und der Grund des deaktivierten «Einfügen».
        'calendarConvert.copy',
        'calendarConvert.insert',
        'calendarConvert.insertUnavailable',
      ]),
    );
    $('#calendar-convert-close').click();
    await fertig;
  });
});

describe('AK8/AK9: Kommando und Verfügbarkeit (4T-001874)', () => {
  it('AK9: calendar.convert steht im Katalog direkt nach calendar.insertValue', () => {
    const idx = COMMANDS.findIndex((c) => c.id === 'calendar.convert');
    expect(idx).toBeGreaterThan(0);
    expect(COMMANDS[idx - 1].id).toBe('calendar.insertValue');
    const cmd = COMMANDS[idx];
    expect(cmd).toMatchObject({
      defaultBindings: [],
      labelKey: 'command.calendar.convert',
      descKey: 'help.shortcut.convertCalendarValue',
      categoryKey: COMMANDS[idx - 1].categoryKey,
      menu: false,
      editorScoped: false,
      availability: 'bereichUndKalender',
    });
  });

  it('AK8: verfügbar bei Bereich und Zeitrechnung auch ohne Editor, sonst nicht', () => {
    const ctx = (teil) => availabilityContext(teil);
    expect(isAvailable('bereichUndKalender', ctx({ hasArea: true, hasCalendarConfig: true }))).toBe(
      true,
    );
    expect(
      isAvailable('bereichUndKalender', ctx({ hasArea: false, hasCalendarConfig: true })),
    ).toBe(false);
    expect(
      isAvailable('bereichUndKalender', ctx({ hasArea: true, hasCalendarConfig: false })),
    ).toBe(false);
  });
});

describe('AK9/AK12: gemeinsamer Weg von Kommando und Kontextmenü (4T-001874)', () => {
  it('AK12: openCalendarConvertAt liest die Konfiguration des Bereichs und belegt aus dem Cursor vor', async () => {
    setAreaCalendarConfig(CONFIG);
    try {
      const doc = 'Text @{Zahl: 7-01-01} Ende';
      const view = { state: EditorState.create({ doc, selection: { anchor: 10 } }) };
      const fertig = openCalendarConvertAt(view);
      expect($('#calendar-convert-calendar').value).toBe('Zahl');
      expect(feld().value).toBe('7-01-01');
      $('#calendar-convert-close').click();
      await fertig;
      // Ohne Editor: keine Vorbelegung, erste Zeitrechnung.
      const ohne = openCalendarConvertAt(null);
      expect($('#calendar-convert-calendar').value).toBe('Mond');
      $('#calendar-convert-close').click();
      await ohne;
    } finally {
      setAreaCalendarConfig(null);
    }
  });

  it('AK7: nach dem Schließen geht der Fokus in den Editor zurück, wenn sein Ausgangsort verschwunden ist', async () => {
    setAreaCalendarConfig(CONFIG);
    // Ausgangsort wie das Feld der Kommando-Palette: beim Schließen des
    // Dialogs schon aus dem Dokument entfernt.
    const ausgang = document.createElement('input');
    document.body.appendChild(ausgang);
    ausgang.focus();
    try {
      let fokussiert = 0;
      const view = {
        state: EditorState.create({ doc: 'Text' }),
        focus: () => {
          fokussiert += 1;
        },
      };
      const fertig = openCalendarConvertAt(view);
      ausgang.remove();
      $('#calendar-convert-close').click();
      await fertig;
      expect(fokussiert).toBe(1);
      // Steht der Ausgangsort noch, bekommt er den Fokus und der Editor nicht.
      const bleibt = document.createElement('input');
      document.body.appendChild(bleibt);
      bleibt.focus();
      const zweiter = openCalendarConvertAt(view);
      $('#calendar-convert-close').click();
      await zweiter;
      expect(document.activeElement).toBe(bleibt);
      expect(fokussiert).toBe(1);
      bleibt.remove();
    } finally {
      setAreaCalendarConfig(null);
    }
  });

  // Ein Editor-Zustand ohne Bildschirm genügt dem Aufbau des Menüs: Er liest
  // Zustand, Auswahl und Zeile des Cursors.
  function menueEintraege(readOnly) {
    const view = {
      state: EditorState.create({
        doc: 'Am @{Mond: 6-03-07} war es.',
        selection: { anchor: 8 },
        extensions: readOnly ? [EditorState.readOnly.of(true)] : [],
      }),
    };
    return buildEditorContextMenuItems(view);
  }
  const kennung = (eintrag) => (eintrag.separator ? '|' : eintrag.dataId);

  it('AK9: Eintrag auf der obersten Ebene zwischen «Einfügen» und dem Klipboard-Block', () => {
    const ids = menueEintraege(false).map(kennung);
    const idx = ids.indexOf('calendar-convert');
    expect(idx).toBeGreaterThan(0);
    expect(ids.slice(idx - 2, idx + 3)).toEqual(['insert', '|', 'calendar-convert', '|', 'cut']);
    // Nicht im Untermenü «Einfügen».
    const einfuegen = menueEintraege(false).find((e) => e.dataId === 'insert');
    expect(einfuegen.submenu.map(kennung)).not.toContain('calendar-convert');
    expect(menueEintraege(false)[idx].key).toBe('command.calendar.convert');
  });

  // 4T-002097: Dort rechnet und kopiert der Dialog, nur «Einfügen» ist deaktiviert.
  it('AK9: auch im schreibgeschützten Editor da, weil der Dialog dort nur umrechnet', () => {
    const ids = menueEintraege(true).map(kennung);
    expect(ids).not.toContain('insert');
    expect(ids).toContain('calendar-convert');
  });

  it('AK9: ohne Bereich mit Zeitrechnung deaktiviert, mit Bereich und Zeitrechnung aktiv', () => {
    const eintrag = () => menueEintraege(false).find((e) => e.dataId === 'calendar-convert');
    expect(eintrag().disabled).toBe(true);
    const vorher = appState.areaPath;
    setAreaCalendarConfig(CONFIG);
    appState.areaPath = 'C:/Bereich';
    try {
      expect(eintrag().disabled).toBe(false);
    } finally {
      appState.areaPath = vorher;
      setAreaCalendarConfig(null);
    }
  });
});
