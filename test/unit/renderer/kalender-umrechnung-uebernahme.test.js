// @vitest-environment jsdom
// 4T-002097 (Epic 3E-000323): Dialog «Datum umrechnen» — Auswahl als
// Quelldatum (Vorbelegung aus der Auswahl eines Editor-Zustands) und Übernahme
// der Entsprechung über die Tasten «Kopieren» (Zwischenablage über die Brücke)
// und «Einfügen» (Rückruf in einen beschreibbaren Editor, ein Rückgängig-
// Schritt, kein zerrissenes Kalender-Datum). Aufbau, Wechsel des
// Ausgangspunkts, Meldungen und Tastatur des Dialogs selbst prüft
// kalender-umrechnung-dialog.test.js; diese Datei ist der Nachschnitt, weil
// jene ihr Zeilen-Budget sonst risse.
//
// Der Editor ist ein Editor-Zustand mit Verlauf hinter einer schlanken Hülle
// (dispatch, focus): Der Schreibweg der Eingabe-Hilfe braucht nicht mehr. Die
// Übersetzung ist eine Attrappe, die den Schlüssel zurückgibt.
//
// Dieser Fall prüft im jsdom-Umfeld ohne Gestaltungs-Regeln; Sichtbarkeit und
// echte Zwischenablage weist der Ablauf-Fall KS-10 nach.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './api-stub.js';
import { EditorState, Transaction } from '@codemirror/state';
import { history, undo, undoDepth } from '@codemirror/commands';
import de from '../../../src/i18n/de.json';
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { CALENDAR_TEMPLATES } from '../../../src/shared/calendar/calendar-templates.js';
import { formatTuple } from '../../../src/shared/calendar/calendar-core.js';

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

const {
  showCalendarConvertDialog,
  calendarPrefillFromSelection,
  calendarInsertTarget,
  openCalendarConvertAt,
} = await import('../../../src/renderer/modules/calendar/calendar-convert-dialog.js');
const { setAreaCalendarConfig } =
  await import('../../../src/renderer/modules/calendar/calendar-config.js');

// --- Zeitrechnungen -----------------------------------------------------------

// Gregorianisch und julianisch aus den mitgelieferten Vorlagen (deutscher
// Katalog); gregorianisch 2026-10-03 ist julianisch 2026-09-20 (KS-10).
const tDe = (key) => de[key];
const vorlage = (id) => CALENDAR_TEMPLATES.find((e) => e.id === id).create(tDe);

// Ein zweiter Block mit einer Zeitrechnung aus zwei Datums-Stellen: «3-05» ist
// dort gültig, gregorianisch und julianisch nicht.
const RING = {
  id: 'Ring',
  name: 'Ring',
  levels: [
    { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
    { id: 'runde', name: 'Runde', section: 'Datum', start: 1, rel: { type: 'factor', count: 10 } },
  ],
  epochs: [{ name: 'Zeit', abbr: 'Z', start: null }],
};

// Zeitrechnungen mit freiem Maßstab, deren Entsprechung außerhalb des
// darstellbaren Bereichs liegen kann (Muster kalender-umrechnung-dialog.test.js).
function taktwerk(id, num) {
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
    blockScale: { num, den: 1 },
  };
}

const CONFIG = normalizeCalendarConfig({
  blocks: [
    { id: 'erde', name: 'Erde', calendars: [vorlage('gregorian'), vorlage('julian')] },
    { id: 'zwei', name: 'Zwei', calendars: [RING] },
    {
      id: 'takt',
      name: 'Takt',
      calendars: [taktwerk('quelle', 1e15), taktwerk('winzig', 1), taktwerk('nachbar', 1e15)],
    },
  ],
});
const GREG = 'Gregorianischer Kalender';
const JUL = 'Julianischer Kalender';

// --- Hilfen -------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const zeile = (id) => $(`#calendar-convert-list .calendar-convert-item[data-calendar-id="${id}"]`);
const kopieren = (id) => zeile(id).querySelector('.calendar-convert-copy');
const einfuegen = (id) => zeile(id).querySelector('.calendar-convert-insert');
const julianId = () => CONFIG.blocks[0].calendars[1].id;

function taste(el, key, extra = {}) {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  el.dispatchEvent(ereignis);
  return ereignis;
}

// Editor-Hülle: Zustand mit Verlauf, dispatch nimmt Spezifikation oder
// Transaktion (Rückgängig liefert eine Transaktion).
function editor(doc, anchor, head = anchor, { readOnly = false } = {}) {
  const view = {
    state: EditorState.create({
      doc,
      selection: { anchor, head },
      extensions: [history(), ...(readOnly ? [EditorState.readOnly.of(true)] : [])],
    }),
    dispatch(x) {
      view.state = x instanceof Transaction ? x.state : view.state.update(x).state;
    },
    focus: vi.fn(),
  };
  return view;
}
const auswahl = (doc, text) => {
  const from = doc.indexOf(text);
  return editor(doc, from, from + text.length);
};
const zustand = (doc, text) => auswahl(doc, text).state;

let schreiben;
beforeEach(() => {
  for (const el of [...document.body.children]) {
    if (el.id !== 'calendar-picker-popup') el.remove();
  }
  schreiben = vi.fn();
  window.api.clipboardWriteText = schreiben;
  setAreaCalendarConfig(CONFIG);
});
afterEach(() => {
  delete window.api.clipboardWriteText;
  setAreaCalendarConfig(null);
  vi.useRealTimers();
});

// --- Vorbelegung aus der Auswahl ----------------------------------------------

describe('AK1: Auswahl berührt ein Kalender-Datum (4T-002097)', () => {
  it('AK1: teilweise, ganz, über Zeilen hinweg; bei mehreren das erste', () => {
    const doc = `Am @{${JUL}: 2026-09-20} und @{${GREG}: 2026-10-03}.\nzweite Zeile`;
    const erwartet = { calendarName: JUL, value: '2026-09-20' };
    expect(calendarPrefillFromSelection(zustand(doc, 'Am @{Jul'), CONFIG)).toEqual(erwartet);
    expect(calendarPrefillFromSelection(zustand(doc, '09-20'), CONFIG)).toEqual(erwartet);
    expect(calendarPrefillFromSelection(zustand(doc, doc), CONFIG)).toEqual(erwartet);
    // Der Rand zählt mit wie beim Cursor: Auswahl endet direkt vor «@».
    expect(calendarPrefillFromSelection(zustand(doc, 'Am '), CONFIG)).toEqual(erwartet);
    expect(calendarPrefillFromSelection(zustand(doc, '} und @{Greg'), CONFIG)).toEqual(erwartet);
    const zweite = `Zeile eins\nZeile @{${GREG}: 2026-10-03} zwei`;
    expect(calendarPrefillFromSelection(zustand(zweite, 'eins\nZeile @{Greg'), CONFIG)).toEqual({
      calendarName: GREG,
      value: '2026-10-03',
    });
  });

  it('AK1/AK3: ohne Auswahl der Wert unter dem Cursor, sonst nichts', () => {
    const doc = `Text @{${JUL}: 2026-09-20} Ende`;
    const imWert = editor(doc, doc.indexOf('09-20')).state;
    expect(calendarPrefillFromSelection(imWert, CONFIG)).toEqual({
      calendarName: JUL,
      value: '2026-09-20',
    });
    expect(calendarPrefillFromSelection(editor(doc, 2).state, CONFIG)).toEqual({});
    expect(calendarPrefillFromSelection(null, CONFIG)).toEqual({});
  });

  it('AK1: der gemeinsame Weg belegt Kalender und Datum aus der Auswahl vor', async () => {
    const doc = `Am @{${JUL}: 2026-09-20} war es.`;
    const fertig = openCalendarConvertAt(auswahl(doc, '2026-09'));
    expect($('#calendar-convert-calendar').value).toBe(julianId());
    expect($('#calendar-convert-date').value).toBe('2026-09-20');
    $('#calendar-convert-close').click();
    await fertig;
  });
});

describe('AK2: ausgewählter Text ist das Datum (4T-002097)', () => {
  it('AK2: erster Kalender in Block-Reihenfolge, in dem der Text gültig ist', () => {
    expect(calendarPrefillFromSelection(zustand('Am 2026-10-03.', '2026-10-03'), CONFIG)).toEqual({
      calendarName: GREG,
      value: '2026-10-03',
    });
    // Beschnitten; gültig erst im zweiten Block.
    expect(calendarPrefillFromSelection(zustand('x  3-05  y', '  3-05  '), CONFIG)).toEqual({
      calendarName: 'Ring',
      value: '3-05',
    });
  });

  it('AK2: in keinem Kalender gültig: erster Kalender, der Text, die Meldung', async () => {
    const vorbelegung = calendarPrefillFromSelection(zustand('am 3.10.2026', '3.10.2026'), CONFIG);
    expect(vorbelegung).toEqual({ calendarName: GREG, value: '3.10.2026' });
    const fertig = openCalendarConvertAt(auswahl('am 3.10.2026', '3.10.2026'));
    expect($('#calendar-convert-calendar').value).toBe(CONFIG.blocks[0].calendars[0].id);
    expect($('#calendar-convert-date').value).toBe('3.10.2026');
    expect($('#calendar-convert-invalid').hidden).toBe(false);
    expect($('#calendar-convert-invalid').textContent).toBe('calendarConvert.invalid');
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK2/AK3: mehrzeilig, leer oder nur Leerraum gilt als nichts ausgewählt', () => {
    expect(calendarPrefillFromSelection(zustand('a 2026\n10-03 b', '2026\n10-03'), CONFIG)).toEqual(
      {},
    );
    expect(calendarPrefillFromSelection(zustand('a    b', '   '), CONFIG)).toEqual({});
    // Ein Zeilenumbruch am Rand fällt beim Beschneiden weg.
    expect(
      calendarPrefillFromSelection(zustand('x\n2026-10-03\n', '2026-10-03\n'), CONFIG),
    ).toEqual({ calendarName: GREG, value: '2026-10-03' });
    // Ohne Zeitrechnung gibt es nichts vorzubelegen.
    expect(calendarPrefillFromSelection(zustand('2026-10-03', '2026-10-03'), null)).toEqual({});
  });

  it('AK3: ohne Auswahl und ohne Kalender-Datum beginnt der Dialog wie bisher', async () => {
    const fertig = openCalendarConvertAt(editor('nur Text', 3));
    const greg = CONFIG.blocks[0].calendars[0];
    expect($('#calendar-convert-calendar').value).toBe(greg.id);
    expect($('#calendar-convert-date').value).toBe(formatTuple(greg, greg.blockAnchor));
    $('#calendar-convert-close').click();
    await fertig;
  });
});

// --- Die beiden Tasten --------------------------------------------------------

function oeffneGregorianisch(extra = {}) {
  return showCalendarConvertDialog({
    config: CONFIG,
    calendarName: GREG,
    value: '2026-10-03',
    ...extra,
  });
}

describe('AK4: Tasten je Zeile mit Ergebnis (4T-002097)', () => {
  it('AK4: Wert-Knopf, Kopieren, Einfügen; mit Namen in Kurzhinweis und Beschriftung', async () => {
    const fertig = oeffneGregorianisch({ onInsert: vi.fn() });
    const knoepfe = [...zeile(julianId()).querySelectorAll('button')];
    expect(knoepfe.map((b) => b.className)).toEqual([
      'btn calendar-picker-conv calendar-convert-entry',
      'btn calendar-convert-action calendar-convert-copy',
      'btn calendar-convert-action calendar-convert-insert',
    ]);
    expect(knoepfe.map((b) => b.textContent)).toEqual([
      `${JUL}: ${knoepfe[0].textContent.slice(JUL.length + 2)}`,
      'calendarConvert.copy',
      'calendarConvert.insert',
    ]);
    expect(kopieren(julianId()).title).toBe(`calendarConvert.copyTitle ${JUL}`);
    expect(kopieren(julianId()).getAttribute('aria-label')).toBe(
      `calendarConvert.copyTitle ${JUL}`,
    );
    expect(einfuegen(julianId()).title).toBe(`calendarConvert.insertTitle ${JUL}`);
    expect(einfuegen(julianId()).disabled).toBe(false);
    $('#calendar-convert-close').click();
    await fertig;
  });

  it('AK4: eine Zeile ohne Ergebnis trägt keine Taste', async () => {
    const quelle = CONFIG.blocks[2].calendars[0];
    const fertig = showCalendarConvertDialog({
      config: CONFIG,
      calendarName: 'quelle',
      value: formatTuple(quelle, [1000000, 1, 0]),
      onInsert: vi.fn(),
    });
    const ohne = $('#calendar-convert-list .calendar-convert-row-text');
    expect(ohne.dataset.calendarId).toBe('winzig');
    expect(ohne.querySelector('button')).toBeNull();
    expect(document.querySelectorAll('.calendar-convert-copy')).toHaveLength(1);
    expect(document.querySelectorAll('.calendar-convert-insert')).toHaveLength(1);
    $('#calendar-convert-close').click();
    await fertig;
  });
});

describe('AK5: Kopieren (4T-002097)', () => {
  it('AK5: legt die Dokument-Form in die Zwischenablage, bleibt offen, bestätigt kurz', async () => {
    vi.useFakeTimers();
    const onInsert = vi.fn();
    const fertig = oeffneGregorianisch({ onInsert });
    const knopf = kopieren(julianId());
    knopf.focus();
    knopf.click();
    expect(schreiben).toHaveBeenCalledTimes(1);
    expect(schreiben).toHaveBeenCalledWith(`@{${JUL}: 2026-09-20}`);
    expect(knopf.textContent).toBe('calendarConvert.copied');
    expect($('.calendar-convert-modal')).not.toBeNull();
    expect(document.activeElement).toBe(knopf);
    expect(onInsert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1499);
    expect(knopf.textContent).toBe('calendarConvert.copied');
    vi.advanceTimersByTime(1);
    expect(knopf.textContent).toBe('calendarConvert.copy');
    // Schließen während der Bestätigung räumt den Zeitgeber ab.
    knopf.click();
    $('#calendar-convert-close').click();
    await fertig;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('AK5: schlägt das Schreiben fehl, gibt es keine Bestätigung', async () => {
    schreiben.mockImplementation(() => {
      throw new Error('gesperrt');
    });
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fertig = oeffneGregorianisch();
    kopieren(julianId()).click();
    expect(kopieren(julianId()).textContent).toBe('calendarConvert.copy');
    expect(warnung).toHaveBeenCalledTimes(1);
    warnung.mockRestore();
    $('#calendar-convert-close').click();
    await fertig;
  });
});

describe('AK6: Einfügen (4T-002097)', () => {
  it('AK6: ersetzt die Auswahl, ein Rückgängig-Schritt, Schreibmarke dahinter, Dialog zu', async () => {
    const doc = 'Termin 2026-10-03 hier.';
    const view = auswahl(doc, '2026-10-03');
    const fertig = openCalendarConvertAt(view);
    expect($('#calendar-convert-calendar').value).toBe(CONFIG.blocks[0].calendars[0].id);
    einfuegen(julianId()).click();
    await fertig;
    const eingefuegt = `@{${JUL}: 2026-09-20}`;
    expect(view.state.doc.toString()).toBe(`Termin ${eingefuegt} hier.`);
    expect(view.state.selection.main.head).toBe('Termin '.length + eingefuegt.length);
    expect(view.focus).toHaveBeenCalled();
    expect($('.calendar-convert-modal')).toBeNull();
    expect(schreiben).not.toHaveBeenCalled();
    expect(undoDepth(view.state)).toBe(1);
    undo(view);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('AK6: Schreibmarke im Datum fügt dahinter mit Leerzeichen ein, am Rand an der Schreibmarke', () => {
    const doc = `A @{${GREG}: 2026-10-03} B`;
    const von = doc.indexOf('@');
    const bis = doc.indexOf('}') + 1;
    for (const pos of [von + 1, von + 2, doc.indexOf('10-03'), bis - 1]) {
      expect(calendarInsertTarget(editor(doc, pos).state)).toEqual({
        from: bis,
        to: bis,
        prefix: ' ',
      });
    }
    for (const pos of [von, bis, 0]) {
      expect(calendarInsertTarget(editor(doc, pos).state)).toEqual({
        from: pos,
        to: pos,
        prefix: '',
      });
    }
  });

  it('AK6: Teil-Auswahl im Kalender-Datum ersetzt das ganze Datum', async () => {
    const doc = `A @{${GREG}: 2026-10-03} und @{${JUL}: 2026-09-20} B`;
    const erstes = [doc.indexOf('@'), doc.indexOf('}') + 1];
    const zweitesEnde = doc.lastIndexOf('}') + 1;
    // Nur der Wert-Teil: das ganze erste Datum.
    expect(calendarInsertTarget(zustand(doc, '2026-10-03'))).toEqual({
      from: erstes[0],
      to: erstes[1],
      prefix: '',
    });
    // Über zwei Daten hinweg, beide nur teilweise: Vereinigung.
    expect(calendarInsertTarget(zustand(doc, '10-03} und @{Jul'))).toEqual({
      from: erstes[0],
      to: zweitesEnde,
      prefix: '',
    });
    // Auswahl ohne Kalender-Datum, auch direkt am Rand: genau die Auswahl.
    const vorher = doc.indexOf('A ');
    expect(calendarInsertTarget(zustand(doc, 'A '))).toEqual({
      from: vorher,
      to: vorher + 2,
      prefix: '',
    });
    // Am Editor: kein verschachteltes Datum.
    const view = auswahl(doc, '2026-10-03');
    const fertig = openCalendarConvertAt(view);
    einfuegen(julianId()).click();
    await fertig;
    expect(view.state.doc.toString()).toBe(`A @{${JUL}: 2026-09-20} und @{${JUL}: 2026-09-20} B`);
  });

  it('AK6: im Datum ohne Auswahl entsteht kein zerrissenes Datum', async () => {
    const doc = `X @{${GREG}: 2026-10-03} Y`;
    const view = editor(doc, doc.indexOf('10-03'));
    const fertig = openCalendarConvertAt(view);
    einfuegen(julianId()).click();
    await fertig;
    expect(view.state.doc.toString()).toBe(`X @{${GREG}: 2026-10-03} @{${JUL}: 2026-09-20} Y`);
  });
});

describe('AK7: ohne beschreibbaren Editor ist Einfügen deaktiviert (4T-002097)', () => {
  it('AK7: schreibgeschützter Editor und kein Editor: deaktiviert mit Grund', async () => {
    const doc = 'Termin 2026-10-03 hier.';
    const start = doc.indexOf('2026');
    const geschuetzt = editor(doc, start, start + 10, { readOnly: true });
    for (const view of [geschuetzt, null]) {
      const fertig = openCalendarConvertAt(view);
      const knopf = einfuegen(julianId());
      expect(knopf.disabled).toBe(true);
      expect(knopf.title).toBe('calendarConvert.insertUnavailable');
      expect(knopf.getAttribute('aria-label')).toBe(`calendarConvert.insertTitle ${JUL}`);
      const grund = $(`#${knopf.getAttribute('aria-describedby')}`);
      expect(grund.textContent).toBe('calendarConvert.insertUnavailable');
      expect(grund.hidden).toBe(true);
      knopf.click();
      expect($('.calendar-convert-modal')).not.toBeNull();
      // Kopieren bleibt möglich.
      expect(kopieren(julianId()).disabled).toBe(false);
      $('#calendar-convert-close').click();
      await fertig;
    }
    expect(geschuetzt.state.doc.toString()).toBe(doc);
  });
});

describe('AK8: beide Tasten mit der Tastatur (4T-002097)', () => {
  it('AK8: Tab je Zeile Wert-Knopf, Kopieren, Einfügen; Enter löst genau einmal aus', async () => {
    const onInsert = vi.fn();
    const fertig = oeffneGregorianisch({ onInsert });
    const eintrag = zeile(julianId()).querySelector('.calendar-convert-entry');
    eintrag.focus();
    taste(eintrag, 'Tab');
    expect(document.activeElement).toBe(kopieren(julianId()));
    taste(document.activeElement, 'Tab');
    expect(document.activeElement).toBe(einfuegen(julianId()));
    taste(document.activeElement, 'Tab');
    expect(document.activeElement).toBe($('#calendar-convert-close'));
    taste(document.activeElement, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(einfuegen(julianId()));

    kopieren(julianId()).focus();
    const ereignis = taste(kopieren(julianId()), 'Enter');
    expect(ereignis.defaultPrevented).toBe(true);
    expect(schreiben).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(kopieren(julianId()));

    einfuegen(julianId()).focus();
    taste(einfuegen(julianId()), 'Enter');
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(`@{${JUL}: 2026-09-20}`);
    expect(await fertig).toBeUndefined();
    expect($('.calendar-convert-modal')).toBeNull();
  });
});

describe('AK12: bisheriges Verhalten unverändert (4T-002097)', () => {
  it('AK12: der Wert-Knopf wechselt weiter den Ausgangspunkt und schreibt nichts', async () => {
    const onInsert = vi.fn();
    const fertig = oeffneGregorianisch({ onInsert });
    zeile(julianId()).querySelector('.calendar-convert-entry').click();
    expect($('#calendar-convert-calendar').value).toBe(julianId());
    expect($('#calendar-convert-date').value).toBe('2026-09-20');
    expect(document.activeElement).toBe($('#calendar-convert-date'));
    // Die Zeile des gregorianischen Kalenders trägt jetzt die Tasten.
    expect(kopieren(CONFIG.blocks[0].calendars[0].id)).not.toBeNull();
    taste($('#calendar-convert-date'), 'Escape');
    await fertig;
    expect(onInsert).not.toHaveBeenCalled();
    expect(schreiben).not.toHaveBeenCalled();
  });
});
