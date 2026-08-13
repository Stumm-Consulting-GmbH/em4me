// 4T-0496 (Epic 3E-0090): Unit-Tests des Task-Marker-Kerns — verlustfreier
// Round-Trip realer Referenz-Format-Zeilen, Zeilen-Erkennung, Feld-Extraktion
// (Termine mit optionaler Uhrzeit, Prioritaet, Wiederholung, ID/Abhaengigkeiten),
// Ungueltig-Markierung, Duplikate, Toleranz-Marker, Mutatoren, Global-Filter
// und die Vergleichs-Helfer fuer Prioritaets- und Termin-Ordnung.
import { describe, it, expect } from 'vitest';
import {
  parseTaskLine,
  serializeTaskLine,
  setDateField,
  setPriority,
  setStatusChar,
  setReminder,
  stripIdAndDependsOn,
  isTaskLine,
  modelMatchesGlobalFilter,
  stripGlobalFilter,
  priorityRank,
  comparePriority,
  compareDateValue,
  PRIORITY_ORDER,
} from '../../src/shared/tasks/task-markers.js';
import {
  setRecurrence,
  buildRecurrenceInstance,
  shiftIsoDateByDays,
  primaryDateField,
  computeUrgency,
} from '../../src/shared/tasks/task-recurrence.js';
import {
  setTaskId,
  setDependsOn,
  isValidTaskId,
  generateTaskId,
  computeDependencyFlags,
} from '../../src/shared/tasks/task-dependencies.js';

// --- 1. Round-Trip (Kern-Pflicht) --------------------------------------------------
// serializeTaskLine(parseTaskLine(line)) muss byte-identisch die Eingabe liefern.
const ROUNDTRIP_LINES = [
  '- [ ] Steuererklärung abgeben 📅 2026-07-16',
  '- [ ] Wochenplanung 🔁 every week on Sunday ⏳ 2026-07-14',
  '- [x] Bericht schreiben 🛫 2026-07-12 ⏳ 2026-07-14 📅 2026-07-16 ✅ 2026-07-10',
  '- [ ] Sehr wichtig 🔺',
  '- [ ] Hoch ⏫ 📅 2026-08-01',
  '- [ ] Mittel 🔼',
  '- [ ] Niedrig 🔽',
  '- [ ] Niedrigste ⏬',
  '- [/] In Arbeit mit Termin 📅 2026-07-20 14:30',
  '- [ ] Mit ID 🆔 dcf64c',
  '- [ ] Blockiert ⛔ dcf64c,0h17ye',
  '- [ ] Blockiert mit Spaces ⛔ dcf64c, 0h17ye',
  '- [ ] Abschluss-Aktion 🏁 delete',
  '- [ ] Erinnerung (@fremd) ⏰ 2026-09-16 10:00 📅 2026-09-17',
  '- [-] Abgebrochen ❌ 2026-07-01',
  '- [ ] Erstellt ➕ 2026-06-30 📅 2026-07-16',
  '* [ ] Stern-Bullet ⏫',
  '+ [ ] Plus-Bullet 📅 2026-07-16',
  '3. [ ] Nummeriert 📅 2026-07-16',
  '12) [x] Nummeriert Klammer ✅ 2026-07-09',
  '  - [ ] Eingerückt zwei Spaces 📅 2026-07-16',
  '\t- [ ] Tab-eingerückt ⏳ 2026-07-14',
  '- [ ] Ungültig 📅 2026-02-30',
  '- [ ] Ungültige Zeit 📅 2026-07-16 25:61',
  '- [ ] Variante ⌛ 2026-07-14',
  '- [ ] Variante 📆 2026-07-16',
  '- [ ] #task Global-Filter-Zeile 📅 2026-07-16',
  '- [ ] Doppelt 📅 2026-07-01 📅 2026-07-02',
  '- [ ]',
  '- [ ] ',
  '- [ ] Nur Text ohne Marker',
  '- [ ] Marker mitten ⏫ im Text bleibt Beschreibung',
  '- [ ] Zwei  Spaces  vor  Marker  📅 2026-07-16',
  '- [ ] Trailing Space 📅 2026-07-16 ',
  '- [ ] wiederholend 🔁 every 3 days when done 📅 2026-07-16',
  '- [ ] Alles 🔺 🔁 every month on the last ➕ 2026-06-01 🛫 2026-07-01 ⏳ 2026-07-10 📅 2026-07-15 🆔 abc_1 ⛔ xyz-2',
];

describe('Round-Trip — parse/serialize byte-identisch', () => {
  it.each(ROUNDTRIP_LINES)('erhält die Zeile unverändert: %j', (line) => {
    const model = parseTaskLine(line);
    expect(model).not.toBeNull();
    expect(serializeTaskLine(model)).toBe(line);
  });
});

// --- 2. Erkennung von Checkbox-Zeilen ----------------------------------------------
describe('parseTaskLine — Erkennung', () => {
  it('liefert null für Nicht-Task-Zeilen', () => {
    expect(parseTaskLine('Das ist eine Textzeile')).toBeNull();
    expect(parseTaskLine('- ohne Checkbox')).toBeNull();
    expect(parseTaskLine('- [xy] zwei Zeichen')).toBeNull();
    expect(parseTaskLine('- [ ]Text')).toBeNull();
    expect(parseTaskLine('# Titel')).toBeNull();
    expect(parseTaskLine('')).toBeNull();
  });

  it('erkennt alle Bullet-Formen', () => {
    for (const line of ['- [ ] A', '* [ ] A', '+ [ ] A', '3. [ ] A', '12) [ ] A']) {
      expect(parseTaskLine(line)).not.toBeNull();
    }
  });

  it('erkennt beliebige Status-Zeichen in der Klammer', () => {
    for (const ch of ['/', '-', '?', '*']) {
      const model = parseTaskLine(`- [${ch}] Text`);
      expect(model).not.toBeNull();
      expect(model.statusChar).toBe(ch);
    }
  });
});

// --- 3. Feld-Extraktion ------------------------------------------------------------
describe('parseTaskLine — Feld-Extraktion', () => {
  it('extrahiert Status, Beschreibung und alle Termin-Felder', () => {
    const model = parseTaskLine(
      '- [x] Bericht schreiben 🛫 2026-07-12 ⏳ 2026-07-14 📅 2026-07-16 ✅ 2026-07-10',
    );
    expect(model.statusChar).toBe('x');
    expect(model.description).toBe('Bericht schreiben');
    expect(model.due).toEqual({ date: '2026-07-16', time: null, invalid: false });
    expect(model.scheduled).toEqual({ date: '2026-07-14', time: null, invalid: false });
    expect(model.start).toEqual({ date: '2026-07-12', time: null, invalid: false });
    expect(model.done).toEqual({ date: '2026-07-10', time: null, invalid: false });
    expect(model.cancelled).toBeNull();
    expect(model.created).toBeNull();
    expect(model.priority).toBe('normal');
  });

  it('ordnet jedem Prioritäts-Marker die richtige Stufe zu', () => {
    expect(parseTaskLine('- [ ] Sehr wichtig 🔺').priority).toBe('highest');
    expect(parseTaskLine('- [ ] Hoch ⏫ 📅 2026-08-01').priority).toBe('high');
    expect(parseTaskLine('- [ ] Mittel 🔼').priority).toBe('medium');
    expect(parseTaskLine('- [ ] Niedrig 🔽').priority).toBe('low');
    expect(parseTaskLine('- [ ] Niedrigste ⏬').priority).toBe('lowest');
    expect(parseTaskLine('- [ ] Nur Text ohne Marker').priority).toBe('normal');
  });

  it('liest Wiederholungs-Text, ID und Abhängigkeiten', () => {
    expect(
      parseTaskLine('- [ ] Wochenplanung 🔁 every week on Sunday ⏳ 2026-07-14').recurrence,
    ).toEqual({ text: 'every week on Sunday' });
    expect(parseTaskLine('- [ ] Mit ID 🆔 dcf64c').id).toBe('dcf64c');
    expect(parseTaskLine('- [ ] Blockiert ⛔ dcf64c,0h17ye').dependsOn).toEqual([
      'dcf64c',
      '0h17ye',
    ]);
    expect(parseTaskLine('- [ ] Blockiert mit Spaces ⛔ dcf64c, 0h17ye').dependsOn).toEqual([
      'dcf64c',
      '0h17ye',
    ]);
  });
});

// --- 4. Uhrzeit-Option (Querschnitt B) ---------------------------------------------
describe('parseTaskLine — Uhrzeit hinter dem Datum', () => {
  it('liest HH:mm als eigenes Feld', () => {
    const model = parseTaskLine('- [/] In Arbeit mit Termin 📅 2026-07-20 14:30');
    expect(model.statusChar).toBe('/');
    expect(model.due).toEqual({ date: '2026-07-20', time: '14:30', invalid: false });
  });
});

// --- 5. Ungültig-Markierung --------------------------------------------------------
describe('parseTaskLine — Ungültig-Markierung', () => {
  it('markiert kalendarisch und zeitlich ungültige Werte, formfremdes ist kein Marker', () => {
    expect(parseTaskLine('- [ ] Ungültig 📅 2026-02-30').due.invalid).toBe(true);
    expect(parseTaskLine('- [ ] Ungültige Zeit 📅 2026-07-16 25:61').due.invalid).toBe(true);
    expect(parseTaskLine('- [ ] Schaltjahr 📅 2024-02-29').due.invalid).toBe(false);
    expect(parseTaskLine('- [ ] Kein Schaltjahr 📅 2026-02-29').due.invalid).toBe(true);
    expect(parseTaskLine('- [ ] Formfremd 📅 morgen').due).toBeNull();
  });
});

// --- 6. Duplikate ------------------------------------------------------------------
describe('parseTaskLine — Duplikate', () => {
  it('das rechteste Duplikat gewinnt, beide Segmente bleiben erhalten', () => {
    const line = '- [ ] Doppelt 📅 2026-07-01 📅 2026-07-02';
    const model = parseTaskLine(line);
    expect(model.due.date).toBe('2026-07-02');
    expect(serializeTaskLine(model)).toBe(line);
  });
});

// --- 7. Toleranz -------------------------------------------------------------------
describe('parseTaskLine — Toleranz und Varianten', () => {
  it('liest ⌛ als scheduled und 📆 als due', () => {
    expect(parseTaskLine('- [ ] Variante ⌛ 2026-07-14').scheduled).toEqual({
      date: '2026-07-14',
      time: null,
      invalid: false,
    });
    expect(parseTaskLine('- [ ] Variante 📆 2026-07-16').due).toEqual({
      date: '2026-07-16',
      time: null,
      invalid: false,
    });
  });

  it('ein Variation Selector hinter dem Symbol stört nicht', () => {
    const line = '- [ ] VS16 📅️ 2026-07-16';
    const model = parseTaskLine(line);
    expect(model.due).toEqual({ date: '2026-07-16', time: null, invalid: false });
    expect(serializeTaskLine(model)).toBe(line);
  });

  it('🏁-Segmente landen nicht in der Beschreibung, sondern als unknown', () => {
    const onCompletion = parseTaskLine('- [ ] Abschluss-Aktion 🏁 delete');
    expect(onCompletion.description).toBe('Abschluss-Aktion');
    expect(onCompletion.segments.some((s) => s.kind === 'unknown')).toBe(true);
  });

  // 4T-0525 (Epic 3E-0095): der ⏰-Marker ist vom Toleranz-Segment zum
  // echten Modell-Feld gehoben.
  it('⏰ mit Wert wird als reminder-Feld geparst und round-trippt', () => {
    const line = '- [ ] Erinnerung (@fremd) ⏰ 2026-09-16 10:00 📅 2026-09-17';
    const model = parseTaskLine(line);
    expect(model.description).toBe('Erinnerung (@fremd)');
    expect(model.due).toEqual({ date: '2026-09-17', time: null, invalid: false });
    expect(model.reminder).toEqual({ date: '2026-09-16', time: '10:00', invalid: false });
    expect(serializeTaskLine(model)).toBe(line);
  });

  it('⏰ ohne Uhrzeit und mit ungültigem Datum wird korrekt markiert', () => {
    expect(parseTaskLine('- [ ] Nur Datum ⏰ 2026-09-16').reminder).toEqual({
      date: '2026-09-16',
      time: null,
      invalid: false,
    });
    expect(parseTaskLine('- [ ] Kaputt ⏰ 2026-02-30').reminder).toEqual({
      date: '2026-02-30',
      time: null,
      invalid: true,
    });
  });

  it('nackter ⏰ ohne Wert bleibt Toleranz-Segment ohne reminder-Feld', () => {
    const line = '- [ ] Wecker ohne Wert ⏰';
    const model = parseTaskLine(line);
    expect(model.reminder).toBe(null);
    expect(model.segments.some((s) => s.kind === 'unknown')).toBe(true);
    expect(serializeTaskLine(model)).toBe(line);
  });
});

// --- 8. Mutatoren ------------------------------------------------------------------
describe('setDateField', () => {
  it('hängt ein neues Feld inklusive Uhrzeit ans Ende an', () => {
    const model = parseTaskLine('- [ ] Task 🔁 every week 📅 2026-07-16');
    setDateField(model, 'done', { date: '2026-07-10', time: '08:15' });
    expect(serializeTaskLine(model)).toBe(
      '- [ ] Task 🔁 every week 📅 2026-07-16 ✅ 2026-07-10 08:15',
    );
    expect(model.done).toEqual({ date: '2026-07-10', time: '08:15', invalid: false });
  });

  it('ersetzt ein bestehendes Feld an seiner Position', () => {
    const model = parseTaskLine('- [x] Task 🔁 every week 📅 2026-07-16 ✅ 2026-07-10');
    setDateField(model, 'due', { date: '2026-07-20' });
    expect(serializeTaskLine(model)).toBe('- [x] Task 🔁 every week 📅 2026-07-20 ✅ 2026-07-10');
  });

  it('entfernt das Segment bei null', () => {
    const model = parseTaskLine('- [ ] Task 📅 2026-07-16');
    setDateField(model, 'due', null);
    expect(serializeTaskLine(model)).toBe('- [ ] Task');
    expect(model.due).toBeNull();
  });

  it('erhält die gelesene Symbol-Variante beim Update', () => {
    const model = parseTaskLine('- [ ] Variante ⌛ 2026-07-14');
    setDateField(model, 'scheduled', { date: '2026-07-21' });
    expect(serializeTaskLine(model)).toBe('- [ ] Variante ⌛ 2026-07-21');
  });

  it('wirft bei unbekanntem Feld', () => {
    const model = parseTaskLine('- [ ] X');
    expect(() => setDateField(model, 'foo', { date: '2026-07-16' })).toThrow();
  });
});

describe('setPriority', () => {
  it('hängt eine Stufe an', () => {
    const model = parseTaskLine('- [ ] Task 📅 2026-07-16');
    setPriority(model, 'high');
    expect(serializeTaskLine(model)).toBe('- [ ] Task 📅 2026-07-16 ⏫');
  });

  it('entfernt das Segment bei normal', () => {
    const model = parseTaskLine('- [ ] Task ⏫');
    setPriority(model, 'normal');
    expect(serializeTaskLine(model)).toBe('- [ ] Task');
  });

  it('wirft bei unbekannter Stufe', () => {
    const model = parseTaskLine('- [ ] X');
    expect(() => setPriority(model, 'urgent')).toThrow();
  });
});

describe('setStatusChar', () => {
  it('ändert nur das Zeichen in der Klammer', () => {
    const model = parseTaskLine('- [ ] Task 📅 2026-07-16');
    setStatusChar(model, 'x');
    expect(serializeTaskLine(model)).toBe('- [x] Task 📅 2026-07-16');
  });
});

// 4T-0506 (Epic 3E-0096): setRecurrence — Wiederholungs-Segment setzen,
// aendern und entfernen (Dialog-Feld). Neuanlage mit kanonischem Symbol,
// bestehendes Segment behaelt Position und fuehrenden Weissraum.
describe('setRecurrence', () => {
  it('legt ein neues Segment mit kanonischem Symbol vor bestehenden Terminen an', () => {
    const model = parseTaskLine('- [ ] Task 📅 2026-07-16');
    setRecurrence(model, 'every week');
    expect(serializeTaskLine(model)).toBe('- [ ] Task 📅 2026-07-16 🔁 every week');
    expect(model.recurrence).toEqual({ text: 'every week' });
  });

  it('trimmt den Regel-Text bei der Neuanlage', () => {
    const model = parseTaskLine('- [ ] Task');
    setRecurrence(model, '  every 3 days  ');
    expect(serializeTaskLine(model)).toBe('- [ ] Task 🔁 every 3 days');
    expect(model.recurrence).toEqual({ text: 'every 3 days' });
  });

  it('ändert den Regel-Text und erhält den führenden Weißraum des Segments', () => {
    const model = parseTaskLine('- [ ] Task  🔁 every week');
    setRecurrence(model, 'every day');
    // Die zwei Leerzeichen vor dem Symbol bleiben erhalten.
    expect(serializeTaskLine(model)).toBe('- [ ] Task  🔁 every day');
    expect(model.recurrence).toEqual({ text: 'every day' });
  });

  it('entfernt das Segment bei null', () => {
    const model = parseTaskLine('- [ ] Task 🔁 every week 📅 2026-07-16');
    setRecurrence(model, null);
    expect(serializeTaskLine(model)).toBe('- [ ] Task 📅 2026-07-16');
    expect(model.recurrence).toBeNull();
  });

  it('entfernt das Segment bei leerem oder reinem Weißraum-Text', () => {
    const model = parseTaskLine('- [ ] Task 🔁 every week');
    setRecurrence(model, '   ');
    expect(serializeTaskLine(model)).toBe('- [ ] Task');
    expect(model.recurrence).toBeNull();
  });

  it('Round-Trip: Setzen und wieder Entfernen führt zur Ausgangszeile zurück', () => {
    const original = '- [ ] Task 📅 2026-07-16';
    const model = parseTaskLine(original);
    setRecurrence(model, 'every month on the last');
    setRecurrence(model, null);
    expect(serializeTaskLine(model)).toBe(original);
  });
});

// 4T-0525 (Epic 3E-0095): setReminder — Erinnerungs-Segment setzen, aendern
// und entfernen. Neuanlage kanonisch am Zeilenende (` ⏰ <Datum> [<Uhrzeit>]`),
// bestehendes Segment behaelt Position, fuehrenden Weissraum und die gelesene
// Symbol-Variante (inklusive Variation Selector); model.reminder wird jeweils
// nachgefuehrt.
describe('setReminder (4T-0525)', () => {
  it('haengt ein neues Segment kanonisch ans Zeilenende an (mit Uhrzeit)', () => {
    const model = parseTaskLine('- [ ] Task 📅 2099-01-01');
    setReminder(model, { date: '2099-01-05', time: '09:00' });
    expect(serializeTaskLine(model)).toBe('- [ ] Task 📅 2099-01-01 ⏰ 2099-01-05 09:00');
    expect(model.reminder).toEqual({ date: '2099-01-05', time: '09:00', invalid: false });
  });

  it('legt einen Wert ohne Uhrzeit ohne Zeitanteil an', () => {
    const model = parseTaskLine('- [ ] Task');
    setReminder(model, { date: '2099-01-05' });
    expect(serializeTaskLine(model)).toBe('- [ ] Task ⏰ 2099-01-05');
    expect(model.reminder).toEqual({ date: '2099-01-05', time: null, invalid: false });
  });

  it('ersetzt ein bestehendes Segment an seiner Position und erhaelt Weissraum und Variation Selector', () => {
    // Zwei Leerzeichen vor dem Symbol und ein Variation Selector U+FE0F
    // dahinter bleiben beim Update erhalten.
    const model = parseTaskLine('- [ ] Task  ⏰️ 2099-01-01 08:00');
    setReminder(model, { date: '2099-02-02', time: '10:15' });
    expect(serializeTaskLine(model)).toBe('- [ ] Task  ⏰️ 2099-02-02 10:15');
    expect(model.reminder).toEqual({ date: '2099-02-02', time: '10:15', invalid: false });
  });

  it('entfernt das Segment bei null', () => {
    const model = parseTaskLine('- [ ] Task ⏰ 2099-01-01 📅 2099-01-02');
    setReminder(model, null);
    expect(serializeTaskLine(model)).toBe('- [ ] Task 📅 2099-01-02');
    expect(model.reminder).toBeNull();
  });

  it('Round-Trip: Setzen und wieder Entfernen fuehrt zur Ausgangszeile zurueck', () => {
    const original = '- [ ] Task 📅 2099-01-01';
    const model = parseTaskLine(original);
    setReminder(model, { date: '2099-01-05', time: '09:00' });
    setReminder(model, null);
    expect(serializeTaskLine(model)).toBe(original);
  });
});

// 4T-0525 (Epic 3E-0095): buildRecurrenceInstance verschiebt den ⏰-Wert um
// dasselbe Tages-Delta wie das Faelligkeits-Datum (Uhrzeit unveraendert); ein
// ungueltiger ⏰-Wert bleibt byte-identisch stehen.
describe('buildRecurrenceInstance — Erinnerungs-Mitwandern (4T-0525)', () => {
  it('verschiebt den gueltigen ⏰-Wert um dasselbe Delta wie die Faelligkeit, Uhrzeit bleibt', () => {
    const model = parseTaskLine(
      '- [x] Zahlung 🔁 every month 📅 2026-07-16 ⏰ 2026-07-14 09:00 ✅ 2026-07-16',
    );
    // every month: 2026-07-16 -> 2026-08-16 (Delta 31 Tage). ⏰ 2026-07-14 -> 2026-08-14.
    expect(buildRecurrenceInstance(model, { completionDate: '2026-07-16' })).toBe(
      '- [ ] Zahlung 🔁 every month 📅 2026-08-16 ⏰ 2026-08-14 09:00',
    );
    // Klon-Garantie: das Original-Modell bleibt unangetastet.
    expect(serializeTaskLine(model)).toBe(
      '- [x] Zahlung 🔁 every month 📅 2026-07-16 ⏰ 2026-07-14 09:00 ✅ 2026-07-16',
    );
  });

  it('laesst einen ungueltigen ⏰-Wert (2026-02-30) unverschoben byte-identisch stehen', () => {
    const model = parseTaskLine(
      '- [x] Zahlung 🔁 every month 📅 2026-07-16 ⏰ 2026-02-30 ✅ 2026-07-16',
    );
    expect(buildRecurrenceInstance(model, { completionDate: '2026-07-16' })).toBe(
      '- [ ] Zahlung 🔁 every month 📅 2026-08-16 ⏰ 2026-02-30',
    );
  });
});

describe('stripIdAndDependsOn', () => {
  it('entfernt 🆔- und ⛔-Segmente, der Rest bleibt unverändert', () => {
    const model = parseTaskLine(
      '- [ ] Alles 🔺 🔁 every month on the last ➕ 2026-06-01 🛫 2026-07-01 ⏳ 2026-07-10 📅 2026-07-15 🆔 abc_1 ⛔ xyz-2',
    );
    stripIdAndDependsOn(model);
    expect(model.id).toBeNull();
    expect(model.dependsOn).toEqual([]);
    expect(serializeTaskLine(model)).toBe(
      '- [ ] Alles 🔺 🔁 every month on the last ➕ 2026-06-01 🛫 2026-07-01 ⏳ 2026-07-10 📅 2026-07-15',
    );
  });
});

// --- 9. Global Filter --------------------------------------------------------------
describe('Global Filter', () => {
  it('isTaskLine: leerer Filter greift für jede Checkbox-Zeile', () => {
    expect(isTaskLine('- [ ] irgendwas', '')).toBe(true);
    expect(isTaskLine('normale Zeile', '')).toBe(false);
  });

  it('isTaskLine: nicht-leerer Filter muss vorkommen, Leerraum wird getrimmt', () => {
    expect(isTaskLine('- [ ] #task tun', '#task')).toBe(true);
    expect(isTaskLine('- [ ] anderes', '#task')).toBe(false);
    expect(isTaskLine('- [ ] #task tun', '  #task  ')).toBe(true);
  });

  it('modelMatchesGlobalFilter arbeitet analog am Modell', () => {
    const model = parseTaskLine('- [ ] #task tun');
    expect(modelMatchesGlobalFilter(model, '')).toBe(true);
    expect(modelMatchesGlobalFilter(model, '#task')).toBe(true);
    expect(modelMatchesGlobalFilter(parseTaskLine('- [ ] anderes'), '#task')).toBe(false);
  });

  it('stripGlobalFilter entfernt das Vorkommen samt angrenzendem Leerzeichen', () => {
    expect(stripGlobalFilter('#task Einkaufen gehen', '#task')).toBe('Einkaufen gehen');
    expect(stripGlobalFilter('Einkaufen #task gehen', '#task')).toBe('Einkaufen gehen');
    expect(stripGlobalFilter('Einkaufen gehen', '')).toBe('Einkaufen gehen');
    expect(stripGlobalFilter('Einkaufen gehen', '#task')).toBe('Einkaufen gehen');
  });
});

// --- 10. Vergleichs-Helfer ---------------------------------------------------------
describe('priorityRank / comparePriority', () => {
  it('liefert 0..5 in der Reihenfolge PRIORITY_ORDER', () => {
    PRIORITY_ORDER.forEach((level, index) => {
      expect(priorityRank(level)).toBe(index);
    });
  });

  it('unbekannte Stufe rangiert wie normal (3)', () => {
    expect(priorityRank('unbekannt')).toBe(3);
    expect(priorityRank('normal')).toBe(3);
  });

  it('comparePriority sortiert dringlicher vor weniger dringlich', () => {
    expect(comparePriority('high', 'low')).toBeLessThan(0);
  });
});

describe('compareDateValue', () => {
  const v = (date, time = null, invalid = false) => ({ date, time, invalid });

  it('früheres Datum sortiert vor späterem', () => {
    expect(compareDateValue(v('2026-07-10'), v('2026-07-11'))).toBeLessThan(0);
  });

  it('ohne Uhrzeit zählt als 00:00 und sortiert vor Uhrzeiten desselben Tages', () => {
    expect(compareDateValue(v('2026-07-10'), v('2026-07-10', '08:00'))).toBeLessThan(0);
  });

  it('gültig vor ungültig vor null; null gleich null ergibt 0', () => {
    expect(compareDateValue(v('2026-07-10'), v('2026-02-30', null, true))).toBeLessThan(0);
    expect(compareDateValue(v('2026-02-30', null, true), null)).toBeLessThan(0);
    expect(compareDateValue(null, null)).toBe(0);
  });
});

// --- 11. Verschiebe-Helfer (4T-0504, Epic 3E-0096) ---------------------------------
describe('shiftIsoDateByDays', () => {
  it('verschiebt innerhalb des Monats', () => {
    expect(shiftIsoDateByDays('2026-07-11', 1)).toBe('2026-07-12');
    expect(shiftIsoDateByDays('2026-07-11', 7)).toBe('2026-07-18');
  });

  it('ueberschreitet Monats- und Jahresgrenzen korrekt', () => {
    expect(shiftIsoDateByDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(shiftIsoDateByDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('trifft den Schalttag: 2096-02-28 + 1 = 2096-02-29', () => {
    expect(shiftIsoDateByDays('2096-02-28', 1)).toBe('2096-02-29');
  });
});

describe('primaryDateField (4T-0504)', () => {
  it('waehlt due vor scheduled vor start', () => {
    const model = parseTaskLine('- [ ] X 🛫 2026-07-01 ⏳ 2026-07-05 📅 2026-07-10');
    expect(primaryDateField(model)).toBe('due');
  });

  it('ueberspringt ein ungueltiges due auf scheduled', () => {
    const model = parseTaskLine('- [ ] X 📅 2026-02-30 ⏳ 2026-07-05');
    expect(model.due.invalid).toBe(true);
    expect(primaryDateField(model)).toBe('scheduled');
  });

  it('faellt bis auf start durch', () => {
    expect(primaryDateField(parseTaskLine('- [ ] X 🛫 2026-07-01'))).toBe('start');
  });

  it('liefert null ohne verwertbares Termin-Feld', () => {
    expect(primaryDateField(parseTaskLine('- [ ] X'))).toBeNull();
  });
});

// --- 12. Dringlichkeits-Score (4T-0505, Epic 3E-0096) ------------------------------
// computeUrgency(model, { todayIso }) rechnet auf Tages-Basis mit injiziertem
// Bezugstag (deterministisch). Referenz-Formel: Prioritaets-Komponente +
// Faelligkeits-Komponente (Gleit-Verlauf) + Geplant-Bonus + Start-Abwertung.
// Fester Bezugstag 2026-07-11, Termine im Juli drumherum (kein Monats-Ueberlauf).
describe('computeUrgency (4T-0505)', () => {
  const TODAY = '2026-07-11';
  const model = (line) => parseTaskLine(line);
  const urg = (line, todayIso = TODAY) => computeUrgency(model(line), { todayIso });

  it('Faelligkeits-Komponente: Grenzwerte der Ueberfaelligkeit und der Zukunft', () => {
    // Prioritaet 'niedrig' traegt 0.0 bei — der Score ist damit die reine
    // Faelligkeits-Komponente. T = due - today (in Tagen).
    // T <= -7: gedeckelt bei +12.0 (2026-07-04 = -7 Tage, 2026-07-03 = -8).
    expect(urg('- [ ] X 🔽 📅 2026-07-04')).toBeCloseTo(12.0, 5);
    expect(urg('- [ ] X 🔽 📅 2026-07-03')).toBeCloseTo(12.0, 5);
    // T >= 14: gedeckelt bei +2.4 (2026-07-25 = +14 Tage, 2026-07-26 = +15).
    expect(urg('- [ ] X 🔽 📅 2026-07-25')).toBeCloseTo(2.4, 5);
    expect(urg('- [ ] X 🔽 📅 2026-07-26')).toBeCloseTo(2.4, 5);
  });

  it('Faelligkeits-Komponente: Gleit-Verlauf im Fenster (heute 8.8, morgen ~8.3428571)', () => {
    expect(urg('- [ ] X 🔽 📅 2026-07-11')).toBeCloseTo(8.8, 5);
    expect(urg('- [ ] X 🔽 📅 2026-07-12')).toBeCloseTo(8.342857142857143, 6);
  });

  it('Prioritaets-Komponente der sechs Stufen (ohne Termin)', () => {
    expect(urg('- [ ] X 🔺')).toBe(9.0);
    expect(urg('- [ ] X ⏫')).toBe(6.0);
    expect(urg('- [ ] X 🔼')).toBe(3.9);
    expect(urg('- [ ] X')).toBe(1.95); // normal ohne Marker
    expect(urg('- [ ] X 🔽')).toBe(0.0);
    expect(urg('- [ ] X ⏬')).toBe(-1.8);
  });

  it('Geplant-Bonus: heute oder frueher +5.0, morgen kein Bonus', () => {
    // Prioritaet normal (1.95) als Basis; nur der Geplant-Termin variiert.
    expect(urg('- [ ] X ⏳ 2026-07-11')).toBeCloseTo(6.95, 5); // heute
    expect(urg('- [ ] X ⏳ 2026-07-10')).toBeCloseTo(6.95, 5); // gestern
    expect(urg('- [ ] X ⏳ 2026-07-12')).toBeCloseTo(1.95, 5); // morgen: kein Bonus
  });

  it('Start-Abwertung: Start in der Zukunft -3.0, Start heute keine Abwertung', () => {
    expect(urg('- [ ] X 🛫 2026-07-12')).toBeCloseTo(-1.05, 5); // morgen: 1.95 - 3.0
    expect(urg('- [ ] X 🛫 2026-07-11')).toBeCloseTo(1.95, 5); // heute: keine Abwertung
  });

  it('Kombination aus Prioritaet, Faelligkeit, Geplant und Start', () => {
    // highest 9.0 + due heute 8.8 + geplant (<= heute) 5.0 + Start (Zukunft) -3.0.
    expect(urg('- [ ] X 🔺 🛫 2026-07-20 ⏳ 2026-07-10 📅 2026-07-11')).toBeCloseTo(19.8, 5);
  });

  it('ungueltiges Datum zaehlt wie ein fehlendes Termin-Feld', () => {
    // 2026-02-30 ist kalendarisch ungueltig -> keine Faelligkeits-Komponente.
    expect(urg('- [ ] X 📅 2026-02-30')).toBe(urg('- [ ] X'));
    expect(urg('- [ ] X 📅 2026-02-30')).toBe(1.95);
  });

  it('eine Uhrzeit hinter dem Datum hat keinen Score-Einfluss (Tages-Basis)', () => {
    expect(urg('- [ ] X 📅 2026-07-11 14:30')).toBe(urg('- [ ] X 📅 2026-07-11'));
  });

  it('ohne todayIso (oder ohne model) liefert die Formel 0', () => {
    expect(computeUrgency(model('- [ ] X 📅 2026-07-11'), {})).toBe(0);
    expect(computeUrgency(model('- [ ] X 📅 2026-07-11'))).toBe(0);
    expect(computeUrgency(null, { todayIso: TODAY })).toBe(0);
  });
});

// --- 13. Task-ID setzen/entfernen (4T-0508, Epic 3E-0096) --------------------------
// setTaskId schreibt bzw. entfernt das ID-Segment kanonisch, erhaelt den
// fuehrenden Weissraum eines bestehenden Segments und weist ungueltige IDs ab.
describe('setTaskId (4T-0508)', () => {
  it('haengt eine neue ID mit kanonischem Symbol hinter bestehende Marker an', () => {
    const model = parseTaskLine('- [ ] Task 📅 2099-01-01');
    setTaskId(model, 'abc123');
    expect(serializeTaskLine(model)).toBe('- [ ] Task 📅 2099-01-01 🆔 abc123');
    expect(model.id).toBe('abc123');
  });

  it('aendert eine bestehende ID an ihrer Position und erhaelt den fuehrenden Weissraum', () => {
    const model = parseTaskLine('- [ ] Task  🆔 alt99');
    setTaskId(model, 'neu77');
    // Die zwei Leerzeichen vor dem Symbol bleiben erhalten.
    expect(serializeTaskLine(model)).toBe('- [ ] Task  🆔 neu77');
    expect(model.id).toBe('neu77');
  });

  it('entfernt das Segment bei null bzw. leerem String', () => {
    const model = parseTaskLine('- [ ] Task 🆔 abc123 ⛔ xyz-2');
    setTaskId(model, null);
    expect(serializeTaskLine(model)).toBe('- [ ] Task ⛔ xyz-2');
    expect(model.id).toBeNull();
    const model2 = parseTaskLine('- [ ] Task 🆔 abc123');
    setTaskId(model2, '');
    expect(serializeTaskLine(model2)).toBe('- [ ] Task');
    expect(model2.id).toBeNull();
  });

  it('wirft bei ungueltiger ID (nur [A-Za-z0-9_-] erlaubt)', () => {
    const model = parseTaskLine('- [ ] Task');
    expect(() => setTaskId(model, 'hat leerzeichen')).toThrow();
    expect(() => setTaskId(model, 'komma,drin')).toThrow();
    // Das Modell bleibt unveraendert (kein halber Schreibvorgang).
    expect(serializeTaskLine(model)).toBe('- [ ] Task');
  });

  it('Round-Trip: Setzen und wieder Entfernen fuehrt zur Ausgangszeile zurueck', () => {
    const original = '- [ ] Task 📅 2099-01-01';
    const model = parseTaskLine(original);
    setTaskId(model, 'roundtr');
    setTaskId(model, null);
    expect(serializeTaskLine(model)).toBe(original);
  });
});

// --- 14. Vorgaenger-Liste setzen/entfernen (4T-0508, Epic 3E-0096) -----------------
// setDependsOn schreibt eine deduplizierte, gefilterte ID-Liste; ungueltige
// Werte und Duplikate fallen weg, die Eingabe-Reihenfolge bleibt.
describe('setDependsOn (4T-0508)', () => {
  it('legt ein neues Segment mit kanonischer Komma-Liste an', () => {
    const model = parseTaskLine('- [ ] Task 📅 2099-01-01');
    setDependsOn(model, ['abc123', '0h17ye']);
    expect(serializeTaskLine(model)).toBe('- [ ] Task 📅 2099-01-01 ⛔ abc123, 0h17ye');
    expect(model.dependsOn).toEqual(['abc123', '0h17ye']);
  });

  it('aendert eine bestehende Liste und erhaelt den fuehrenden Weissraum des Segments', () => {
    const model = parseTaskLine('- [ ] Task  ⛔ alt01');
    setDependsOn(model, ['neu01', 'neu02']);
    expect(serializeTaskLine(model)).toBe('- [ ] Task  ⛔ neu01, neu02');
  });

  it('dedupliziert in Eingabe-Reihenfolge und filtert ungueltige Werte aus', () => {
    const model = parseTaskLine('- [ ] Task');
    setDependsOn(model, ['a1', 'a1', 'hat leerzeichen', 'b2', '', 'b2']);
    expect(model.dependsOn).toEqual(['a1', 'b2']);
    expect(serializeTaskLine(model)).toBe('- [ ] Task ⛔ a1, b2');
  });

  it('entfernt das Segment bei leerer (oder komplett ungueltiger) Liste', () => {
    const model = parseTaskLine('- [ ] Task ⛔ abc123');
    setDependsOn(model, []);
    expect(serializeTaskLine(model)).toBe('- [ ] Task');
    expect(model.dependsOn).toEqual([]);
    const model2 = parseTaskLine('- [ ] Task ⛔ abc123');
    setDependsOn(model2, ['nur ungueltig', '']);
    expect(serializeTaskLine(model2)).toBe('- [ ] Task');
    expect(model2.dependsOn).toEqual([]);
  });
});

// --- 15. isValidTaskId (4T-0508, Epic 3E-0096) ------------------------------------
describe('isValidTaskId (4T-0508)', () => {
  it('akzeptiert Buchstaben, Ziffern, Unterstrich und Bindestrich', () => {
    expect(isValidTaskId('abc123')).toBe(true);
    expect(isValidTaskId('A-Z_9')).toBe(true);
    expect(isValidTaskId('0h17ye')).toBe(true);
  });

  it('weist Leerraum, Kommata, Leerstrings und Nicht-Strings ab', () => {
    expect(isValidTaskId('hat leerzeichen')).toBe(false);
    expect(isValidTaskId('komma,drin')).toBe(false);
    expect(isValidTaskId('')).toBe(false);
    expect(isValidTaskId(null)).toBe(false);
    expect(isValidTaskId(123)).toBe(false);
  });
});

// --- 16. generateTaskId (4T-0508, Epic 3E-0096) -----------------------------------
// Sechs Zeichen aus [a-z0-9], injizierbarer rng (Determinismus), Eindeutigkeit
// gegen die bestehenden IDs (Set oder Array).
describe('generateTaskId (4T-0508)', () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  // rng-Wert, der deterministisch alphabet[idx] erzeugt (Mitte des Intervalls,
  // damit floor(r * 36) === idx auch bei Fliesskomma sicher trifft).
  const charAt = (idx) => (idx + 0.5) / 36;
  // Skript-rng: liefert die vorgegebene Wert-Folge der Reihe nach.
  const scripted = (seq) => {
    let i = 0;
    return () => seq[i++];
  };
  // Sechs gleiche Zeichen aus einem Index (eine komplette ID).
  const idOf = (idx) => Array(6).fill(charAt(idx));

  it('liefert sechs Zeichen aus [a-z0-9]', () => {
    const id = generateTaskId([], scripted(idOf(0)));
    expect(id).toBe('aaaaaa');
    expect(id).toMatch(/^[a-z0-9]{6}$/);
  });

  it('deckt auch den Ziffern-Bereich des Alphabets ab', () => {
    // Index 26 ist das erste Ziffern-Zeichen ('0').
    expect(alphabet[26]).toBe('0');
    expect(generateTaskId([], scripted(idOf(26)))).toBe('000000');
  });

  it('ist bei injiziertem rng deterministisch', () => {
    expect(generateTaskId([], scripted(idOf(2)))).toBe('cccccc');
    expect(generateTaskId([], scripted(idOf(2)))).toBe('cccccc');
  });

  it('weicht einer Kollisions-ID aus und nimmt die naechste freie', () => {
    // Erst 'aaaaaa' (kollidiert mit dem Bestand), dann 'bbbbbb' (frei).
    const rng = scripted([...idOf(0), ...idOf(1)]);
    expect(generateTaskId(['aaaaaa'], rng)).toBe('bbbbbb');
  });

  it('akzeptiert den Bestand als Set und als Array', () => {
    const rngSet = scripted([...idOf(0), ...idOf(1)]);
    expect(generateTaskId(new Set(['aaaaaa']), rngSet)).toBe('bbbbbb');
    const rngArr = scripted([...idOf(0), ...idOf(1)]);
    expect(generateTaskId(['aaaaaa'], rngArr)).toBe('bbbbbb');
  });

  it('ohne injizierten rng liefert eine gueltige, sechsstellige ID', () => {
    const id = generateTaskId([]);
    expect(id).toMatch(/^[a-z0-9]{6}$/);
  });
});

// --- 17. computeDependencyFlags (4T-0508, Epic 3E-0096) ---------------------------
// Blockierungs-/Duplikat-Flags ueber die Task-Menge eines Bereichs. Offen =
// TODO/IN_PROGRESS/ON_HOLD; erledigte Vorgaenger blockieren nicht; nicht-
// rekursiv (Zyklen tolerant).
describe('computeDependencyFlags (4T-0508)', () => {
  it('blocked nur bei offenem Vorgaenger; der Vorgaenger ist blocking', () => {
    const flags = computeDependencyFlags([
      { id: 'a', dependsOn: [], statusType: 'TODO' },
      { id: 'b', dependsOn: ['a'], statusType: 'TODO' },
    ]);
    expect(flags[0]).toEqual({ blocked: false, blocking: true, duplicateId: false });
    expect(flags[1]).toEqual({ blocked: true, blocking: false, duplicateId: false });
  });

  it('ON_HOLD zaehlt als offener Vorgaenger', () => {
    const flags = computeDependencyFlags([
      { id: 'a', dependsOn: [], statusType: 'ON_HOLD' },
      { id: 'b', dependsOn: ['a'], statusType: 'IN_PROGRESS' },
    ]);
    expect(flags[1].blocked).toBe(true);
    expect(flags[0].blocking).toBe(true);
  });

  it('ein erledigter (DONE) Vorgaenger blockiert nicht', () => {
    const flags = computeDependencyFlags([
      { id: 'd', dependsOn: [], statusType: 'DONE' },
      { id: 'e', dependsOn: ['d'], statusType: 'TODO' },
    ]);
    expect(flags[1].blocked).toBe(false);
    // Der DONE-Vorgaenger ist selbst nicht offen -> nicht blocking.
    expect(flags[0].blocking).toBe(false);
  });

  it('duplicateId markiert jede mehrfach vergebene ID', () => {
    const flags = computeDependencyFlags([
      { id: 'x', dependsOn: [], statusType: 'TODO' },
      { id: 'x', dependsOn: [], statusType: 'DONE' },
      { id: 'y', dependsOn: [], statusType: 'TODO' },
    ]);
    expect(flags[0].duplicateId).toBe(true);
    expect(flags[1].duplicateId).toBe(true);
    expect(flags[2].duplicateId).toBe(false);
  });

  it('Zyklus A<->B (beide offen): beide blocked und beide blocking', () => {
    const flags = computeDependencyFlags([
      { id: 'A', dependsOn: ['B'], statusType: 'TODO' },
      { id: 'B', dependsOn: ['A'], statusType: 'TODO' },
    ]);
    expect(flags[0]).toMatchObject({ blocked: true, blocking: true });
    expect(flags[1]).toMatchObject({ blocked: true, blocking: true });
  });

  it('unbekannter statusType (null) zaehlt nicht als offen — weder blocked noch blocking', () => {
    const flags = computeDependencyFlags([
      { id: 'p', dependsOn: [], statusType: null },
      { id: 'q', dependsOn: ['p'], statusType: 'TODO' },
      { id: 'r', dependsOn: ['q'], statusType: null },
    ]);
    // q haengt an p (nicht offen) -> nicht blocked.
    expect(flags[1].blocked).toBe(false);
    // p selbst ist nicht offen -> nicht blocking, obwohl q (offen) auf p zeigt.
    expect(flags[0].blocking).toBe(false);
    // r ist nicht offen -> weder blocked noch blocking, obwohl es auf q (offen) zeigt.
    expect(flags[2]).toEqual({ blocked: false, blocking: false, duplicateId: false });
  });

  it('dependsOn auf eine nicht existierende ID -> nicht blocked', () => {
    const flags = computeDependencyFlags([
      { id: 's', dependsOn: ['gibtsnicht'], statusType: 'TODO' },
    ]);
    expect(flags[0].blocked).toBe(false);
    expect(flags[0].blocking).toBe(false);
  });

  it('Tasks ohne ID: kein duplicateId, kein blocking (nicht referenzierbar)', () => {
    const flags = computeDependencyFlags([
      { id: null, dependsOn: [], statusType: 'TODO' },
      { id: null, dependsOn: [], statusType: 'TODO' },
    ]);
    expect(flags[0]).toEqual({ blocked: false, blocking: false, duplicateId: false });
    expect(flags[1]).toEqual({ blocked: false, blocking: false, duplicateId: false });
  });
});
