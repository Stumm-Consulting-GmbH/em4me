// @vitest-environment jsdom
// 4T-000486 (Epic 3E-000091): Unit-Tests des Datums-/Uhrzeit-Pickers
// (src/renderer/modules/calendar/date-picker.js) — Wert-Parsing und -Komposition,
// Uhrzeit-Normalisierung, Datums-/Monats-Arithmetik ueber Grenzen, die
// Trigger-Ausschluss-Kontexte (Code/Formel/Frontmatter) sowie die
// Registrierung als Erweiterung und die drei Kommandos. Das DOM-Popup
// (showDateTimePicker) wird abschliessend gegen ein injiziertes now
// geprueft. jsdom-Umgebung, weil das Modul beim Oeffnen ein Popup an
// document.body haengt.
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';

const dp = await import('../../../src/renderer/modules/calendar/date-picker.js');

// Voll geparster Markdown-State (Muster struktur-und-state.test.js): ohne
// EditorView parst der Lezer-Kontext nur ueber Zeit-Budgets, deshalb die
// Schleife bis der Syntaxbaum das ganze Dokument abdeckt.
function mdState(doc) {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: [LezerTable] })] });
  let guard = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && guard++ < 400) {
    /* weiter parsen */
  }
  return state;
}

describe('parseDateTimeValue: Trefferformen (4T-000486)', () => {
  it('erkennt alle drei Einfuege-Formen', () => {
    expect(dp.parseDateTimeValue('2026-07-10')).toEqual({ date: '2026-07-10', time: null });
    expect(dp.parseDateTimeValue('09:05')).toEqual({ date: null, time: '09:05' });
    expect(dp.parseDateTimeValue('2026-07-10 09:05')).toEqual({
      date: '2026-07-10',
      time: '09:05',
    });
  });
});

describe('parseDateTimeValue: Ablehnung (4T-000486)', () => {
  it('weist fremde Formen ab', () => {
    // Deutsches Format, ungepaddete Teile, umgebender Text.
    expect(dp.parseDateTimeValue('10.07.2026')).toBeNull();
    expect(dp.parseDateTimeValue('2026-7-1')).toBeNull();
    expect(dp.parseDateTimeValue('7:5')).toBeNull();
    expect(dp.parseDateTimeValue('am 2026-07-10 faellig')).toBeNull();
    expect(dp.parseDateTimeValue('')).toBeNull();
  });

  it('weist kalendarisch und zeitlich ungueltige Werte ab', () => {
    expect(dp.parseDateTimeValue('2026-02-30')).toBeNull();
    expect(dp.parseDateTimeValue('2099-13-01')).toBeNull();
    expect(dp.parseDateTimeValue('24:00')).toBeNull();
    expect(dp.parseDateTimeValue('12:60')).toBeNull();
    // Ungueltige Uhrzeit auch im kombinierten Format.
    expect(dp.parseDateTimeValue('2026-07-10 24:00')).toBeNull();
  });
});

describe('composeDateTimeText (4T-000486)', () => {
  it('komponiert alle Kombinationen und den Leerfall', () => {
    expect(dp.composeDateTimeText('2026-07-10', '09:05')).toBe('2026-07-10 09:05');
    expect(dp.composeDateTimeText('2026-07-10', null)).toBe('2026-07-10');
    expect(dp.composeDateTimeText(null, '09:05')).toBe('09:05');
    expect(dp.composeDateTimeText(null, null)).toBe('');
  });
});

describe('normalizeTimeInput (4T-000486)', () => {
  it('padded einstellige Stunden und akzeptiert gueltige Zeiten', () => {
    expect(dp.normalizeTimeInput('9:05')).toBe('09:05');
    expect(dp.normalizeTimeInput('09:05')).toBe('09:05');
    expect(dp.normalizeTimeInput(' 7:00 ')).toBe('07:00');
    expect(dp.normalizeTimeInput('23:59')).toBe('23:59');
  });

  it('liefert null bei ungueltiger Form oder Uhrzeit', () => {
    expect(dp.normalizeTimeInput('9:5')).toBeNull();
    expect(dp.normalizeTimeInput('24:00')).toBeNull();
    expect(dp.normalizeTimeInput('12:60')).toBeNull();
    expect(dp.normalizeTimeInput('abc')).toBeNull();
    expect(dp.normalizeTimeInput('')).toBeNull();
  });
});

describe('shiftIsoDate: Grenzen (4T-000486)', () => {
  it('schreitet ueber Monats-, Jahres- und Schaltjahr-Grenzen', () => {
    // Schaltjahr 2020: 28. Februar + 1 = 29. Februar.
    expect(dp.shiftIsoDate('2020-02-28', 1)).toBe('2020-02-29');
    expect(dp.shiftIsoDate('2020-02-29', 1)).toBe('2020-03-01');
    // Jahresgrenze.
    expect(dp.shiftIsoDate('2020-12-31', 1)).toBe('2021-01-01');
    expect(dp.shiftIsoDate('2099-01-01', -1)).toBe('2098-12-31');
    // Wochen-Schritt der Kalender-Navigation.
    expect(dp.shiftIsoDate('2099-01-01', 7)).toBe('2099-01-08');
  });
});

describe('shiftIsoMonth: Tages-Klemmung (4T-000486)', () => {
  it('klemmt den Tag auf den letzten gueltigen Tag des Zielmonats', () => {
    // 31. Januar + 1 Monat -> Februar hat nur 29 Tage (Schaltjahr 2020).
    expect(dp.shiftIsoMonth('2020-01-31', 1)).toBe('2020-02-29');
    // 31. Maerz - 1 Monat -> Februar 2099 (kein Schaltjahr) hat 28 Tage.
    expect(dp.shiftIsoMonth('2099-03-31', -1)).toBe('2099-02-28');
    // Ohne Klemmung bleibt der Tag erhalten.
    expect(dp.shiftIsoMonth('2020-01-15', 1)).toBe('2020-02-15');
    // Jahresgrenze im Monats-Schritt.
    expect(dp.shiftIsoMonth('2020-12-10', 1)).toBe('2021-01-10');
  });
});

describe('isDateTriggerExcludedAt: Kontexte (4T-000486)', () => {
  // Frontmatter, Fliesstext, Inline-Code, Fenced-Code, Block-Math und
  // Inline-Math in einem Dokument; Positionen ueber eindeutige Marker.
  const doc = [
    '---',
    'title: FMVALUE',
    '---',
    '',
    'Ein NORMALTEXT Satz.',
    '',
    'Ein `INLINECODE` Wort.',
    '',
    '```',
    'FENCEDCODE hier',
    '```',
    '',
    '$$',
    'BLOCKMATH = 1',
    '$$',
    '',
    'Eine $YMATH=2$ Formel.',
    '',
    // 4T-000641 (Epic 3E-000069): Perspective-Fences sind technisch Code, fuer
    // den Nutzer aber Tabellen mit Inhaltszellen — sie sind vom
    // Code-Ausschluss ausgenommen.
    '```perspective-table',
    '{| id: pt1',
    '| PTZELLE |',
    '```',
    '',
    '```perspective-datatable',
    '{| id: dt1',
    '| PDTZELLE |',
    '```',
  ].join('\n');
  const state = mdState(doc);
  const at = (marker) => doc.indexOf(marker) + 2;

  it('true im Frontmatter', () => {
    expect(dp.isDateTriggerExcludedAt(state, at('FMVALUE'))).toBe(true);
  });

  it('true im Inline-Code', () => {
    expect(dp.isDateTriggerExcludedAt(state, at('INLINECODE'))).toBe(true);
  });

  it('true im Fenced-Code', () => {
    expect(dp.isDateTriggerExcludedAt(state, at('FENCEDCODE'))).toBe(true);
  });

  it('true im Block-Math ($$)', () => {
    expect(dp.isDateTriggerExcludedAt(state, at('BLOCKMATH'))).toBe(true);
  });

  it('true in der Inline-Formel ($…$)', () => {
    expect(dp.isDateTriggerExcludedAt(state, at('YMATH'))).toBe(true);
  });

  it('false im normalen Fliesstext', () => {
    expect(dp.isDateTriggerExcludedAt(state, at('NORMALTEXT'))).toBe(false);
  });

  // 4T-000641 (Epic 3E-000069): Ausnahme vom Code-Ausschluss fuer die beiden
  // Perspective-Fences; gewoehnlicher Fenced-Code bleibt gesperrt (Fall
  // oben). Die Meldung des Product Owners betraf genau diesen Fall.
  it('false im perspective-table-Fence', () => {
    expect(dp.isDateTriggerExcludedAt(state, at('PTZELLE'))).toBe(false);
  });

  it('false im perspective-datatable-Fence', () => {
    expect(dp.isDateTriggerExcludedAt(state, at('PDTZELLE'))).toBe(false);
  });
});

describe('Erweiterungs-Manifest date-picker (4T-000486)', () => {
  it('ist als Werkzeug-Erweiterung mit den drei Kommandos registriert', () => {
    const manifest = extensionById('date-picker');
    expect(manifest).toBeTruthy();
    expect(manifest.category).toBe('tools');
    expect(manifest.nameKey).toBe('help.featureName.datePicker');
    expect(manifest.descKey).toBe('help.feature.datePicker');
    expect(manifest.commands).toEqual([
      'edit.insertDateTime',
      'edit.insertDate',
      'edit.insertTime',
    ]);
  });
});

describe('Kommando-Registry: Picker-Kommandos (4T-000486)', () => {
  const byId = (id) => COMMANDS.find((c) => c.id === id);

  it('die drei Kommandos tragen die Default-Bindings Strg+Alt+T/D/U und sind nicht editorScoped', () => {
    const cases = [
      ['edit.insertDateTime', 'CmdOrCtrl+Alt+T'],
      ['edit.insertDate', 'CmdOrCtrl+Alt+D'],
      ['edit.insertTime', 'CmdOrCtrl+Alt+U'],
    ];
    for (const [id, binding] of cases) {
      const cmd = byId(id);
      expect(cmd, id).toBeTruthy();
      expect(cmd.defaultBindings, id).toEqual([binding]);
      expect(cmd.editorScoped, id).toBe(false);
    }
  });
});

describe('findDateValueRanges: Fliesstext-Treffer (4T-000487)', () => {
  it('liefert alle drei Formen mit korrekten Offsets; Kombi ist EIN Treffer', () => {
    // 'x 2026-07-10 y 09:05 z 2026-07-10 09:05 w' — Datum ab 2, Uhrzeit ab
    // 15, Kombi ab 23 (16 Zeichen, ein Leerzeichen als Trenner).
    const ranges = dp.findDateValueRanges('x 2026-07-10 y 09:05 z 2026-07-10 09:05 w');
    expect(ranges).toEqual([
      { from: 2, to: 12, date: '2026-07-10', time: null },
      { from: 15, to: 20, date: null, time: '09:05' },
      { from: 23, to: 39, date: '2026-07-10', time: '09:05' },
    ]);
  });

  it("liefert fuer '14:30:15' keinen Zeit-Treffer (Waechter gegen Sekunden)", () => {
    expect(dp.findDateValueRanges('14:30:15')).toEqual([]);
  });

  it("liefert fuer '2026-07-10T14:30' nichts (Waechter gegen ISO-T-Token)", () => {
    expect(dp.findDateValueRanges('2026-07-10T14:30')).toEqual([]);
  });

  it("zerlegt die Tab-Variante '2026-07-10\\t14:30' in zwei Einzel-Treffer", () => {
    // Nur EIN Leerzeichen bildet den Kombi-Wert; der Tabulator trennt in
    // Datum und Uhrzeit (Muster der Task-Marker mit Tab-Trenner).
    const ranges = dp.findDateValueRanges('2026-07-10\t14:30');
    expect(ranges).toEqual([
      { from: 0, to: 10, date: '2026-07-10', time: null },
      { from: 11, to: 16, date: null, time: '14:30' },
    ]);
  });

  it("filtert kalendarisch/zeitlich ungueltige Werte ('2026-02-30', '24:00')", () => {
    expect(dp.findDateValueRanges('a 2026-02-30 b 24:00 c')).toEqual([]);
  });
});

describe('taskLineDescriptionEnd: Beschreibungs-Ende einer Checkbox-Zeile (4T-000487)', () => {
  it('liefert null fuer eine Nicht-Task-Zeile', () => {
    expect(dp.taskLineDescriptionEnd('Kein Task 2026-03-05 im Text.')).toBeNull();
  });

  it('trennt den Beschreibungs-Wert vom Marker-Schwanz (Filter-Logik docTo>descEnd)', () => {
    // Checkbox-Zeile mit einem Datum in der Beschreibung (2026-03-05) und
    // einem Termin-Marker im Schwanz (📅 2026-03-07). Der Offset muss den
    // Beschreibungs-Wert VOR und den Marker-Wert NACH sich lassen — genau die
    // Grenze, die der Live-Pass ueber `docTo - line.from > descEnd` zieht.
    const line = '- [ ] Bericht 2026-03-05 abgeben 📅 2026-03-07';
    const descEnd = dp.taskLineDescriptionEnd(line);
    expect(typeof descEnd).toBe('number');

    const ranges = dp.findDateValueRanges(line);
    const desc = ranges.find((r) => r.date === '2026-03-05');
    const marker = ranges.find((r) => r.date === '2026-03-07');
    expect(desc).toBeTruthy();
    expect(marker).toBeTruthy();
    // Beschreibungs-Wert bleibt drin (Ende <= Offset), Marker-Wert faellt
    // heraus (Ende > Offset) — deckt beide Zweige der Ausschluss-Bedingung.
    expect(desc.to).toBeLessThanOrEqual(descEnd);
    expect(marker.to).toBeGreaterThan(descEnd);
  });
});

describe('showDateTimePicker: DOM-Popup (4T-000486)', () => {
  it('oeffnet das Popup, uebernimmt Tag-Klick und injiziertes now', async () => {
    // Referenz-Zeitpunkt injiziert: 15.01.2099 09:30. Kein new Date() ohne
    // Argumente, damit der Test unabhaengig vom Tagesdatum ist.
    const promise = dp.showDateTimePicker({ now: new Date(2099, 0, 15, 9, 30) });
    const popup = document.getElementById('date-picker-popup');
    expect(popup).toBeTruthy();
    expect(popup.hidden).toBe(false);

    // Anderen Tag im Kalender waehlen, dann uebernehmen.
    const day = popup.querySelector('button.date-picker-day[data-iso="2099-01-20"]');
    expect(day).toBeTruthy();
    day.click();
    popup.querySelector('#date-picker-ok').click();

    const result = await promise;
    expect(result).toEqual({
      date: '2099-01-20',
      time: '09:30',
      text: '2099-01-20 09:30',
    });
    expect(document.getElementById('date-picker-popup').hidden).toBe(true);
  });
});

describe('showDateTimePicker: Uhrzeit-Segment-Steuerung (4T-000487)', () => {
  it('klemmt den Stunden-Einer beim Zehner-Sprung auf 2 und laeuft am Minuten-Einer um', async () => {
    // PO-Befund Runde 1: Segment-Steuerung statt Freitext — ungueltige
    // Uhrzeiten sind konstruktionsbedingt nicht eingebbar. Referenz-
    // Zeitpunkt 09:59 injiziert; Events laufen ueber den Capture-Listener
    // am Popup (mousedown waehlt die Stelle, keydown stellt sie).
    const promise = dp.showDateTimePicker({ now: new Date(2099, 0, 15, 9, 59) });
    const popup = document.getElementById('date-picker-popup');
    const digits = [...popup.querySelectorAll('.date-picker-time-digit')];
    const shown = () => digits.map((el) => el.textContent).join('');
    expect(shown()).toBe('0959');

    // Stunden-Zehner per Ziffern-Taste auf 2: der Stunden-Einer 9 wird auf
    // das neue Stellen-Maximum 3 geklemmt (23:59 statt 29:59).
    digits[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    digits[0].dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(shown()).toBe('2359');

    // ArrowUp auf dem Minuten-Einer 9 laeuft auf 0 um (kein Uebertrag).
    digits[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    digits[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(shown()).toBe('2350');

    popup.querySelector('#date-picker-ok').click();
    const result = await promise;
    expect(result.time).toBe('23:50');
  });
});
