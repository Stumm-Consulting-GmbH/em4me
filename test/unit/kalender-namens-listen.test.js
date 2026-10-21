// 4T-002205 (Epic 3E-000338): Namens-Listen nach der Zahl der Positionen —
// leere Namen im Definitions-Modell, Länge jeder Namens-Liste beim Einlesen
// (Ebenen, Zyklen, Gruppierungen) und Drehung der Namen in abgeleiteten
// Zeitrechnungen über die Zahl der Positionen. Die Fälle stehen in einer
// eigenen Prüfdatei statt in test/unit/calendar-core.test.js, weil jene am
// Zeilen-Budget eingefroren ist (Ratsche in scripts/datei-groessen-
// ausnahmen.json). Den Weg durch die Pflege prüft
// test/unit/renderer/kalender-entwurf-rundlauf.test.js.
import { describe, it, expect } from 'vitest';
import {
  cycleAt,
  groupAt,
  formatTuple,
  convertInBlock,
} from '../../src/shared/calendar/calendar-core.js';
import {
  normalizeCalendarConfig,
  configForPersist,
  deriveCalendar,
} from '../../src/shared/calendar/calendar-config.js';
import { createGregorianTemplate } from '../../src/shared/calendar/calendar-template.js';

// --- Namens-Listen nach der Zahl der Positionen (4T-002205, Epic 3E-000338) ------
// Entscheidungen A7 und A9 des Epics: Jeder Eintrag einer Namens-Liste steht
// für sich, eine unbenannte Position zeigt ihre Zahl; beim Einlesen wird jede
// Liste auf die Zahl der Positionen gebracht, und eine Ableitung dreht über
// diese Zahl statt über die Länge der Liste. Die Fälle stammen aus den
// Grenz-Proben vom 2026-10-10.

const VORLAGE = createGregorianTemplate();
const MONATE = VORLAGE.levels.find((lv) => lv.id === 'month').names;
const WOCHENTAGE = VORLAGE.cycles.find((cy) => cy.id === 'week').names;
// Bis zwölf die Monate der Vorlage, darüber überzählige Namen.
const monatsNamen = (n) =>
  Array.from({ length: n }, (_, i) => (i < 12 ? MONATE[i] : `Überzählig ${i + 1}`));
const wochentagsNamen = (n) =>
  Array.from({ length: n }, (_, i) => (i < 7 ? WOCHENTAGE[i] : `Überzählig ${i + 1}`));

// Gregorianische Vorlage mit eigenen Namens-Listen; `aendere` greift vor dem
// Einlesen in die Roh-Definition.
function gregorianischRoh(aendere) {
  const def = createGregorianTemplate();
  aendere(def);
  return def;
}
const ebene = (cal, id) => cal.levels.find((lv) => lv.id === id);
const gruppe = (cal, id) => cal.groups.find((g) => g.id === id);
const eingelesen = (def) =>
  normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [def] }] }).blocks[0].calendars[0];
const mitMonaten = (names) =>
  eingelesen(gregorianischRoh((def) => (ebene(def, 'month').names = names)));

describe('Namens-Liste mit leerem Eintrag (4T-002205, AK1)', () => {
  it('wird angenommen; benannte Monate zeigen den Namen, der unbenannte seine Zahl', () => {
    const roh = MONATE.map((n, i) => (i === 4 ? '' : i === 7 ? '   ' : n));
    const cal = mitMonaten(roh);
    expect(ebene(cal, 'month').names).toEqual(
      MONATE.map((n, i) => (i === 4 || i === 7 ? null : n)),
    );
    expect(formatTuple(cal, [2026, 4, 1, 0, 0, 0], { named: true })).toBe('2026-April-01');
    expect(formatTuple(cal, [2026, 5, 15, 0, 0, 0], { named: true })).toBe('2026-05-15');
    expect(formatTuple(cal, [2026, 8, 3, 0, 0, 0], { named: true })).toBe('2026-08-03');
    expect(formatTuple(cal, [2026, 9, 1, 0, 0, 0], { named: true })).toBe('2026-September-01');
  });

  it('ein leerer Wochentags-Name lässt die übrigen stehen; die Position trägt keinen Namen', () => {
    const cal = eingelesen(
      gregorianischRoh((def) => {
        def.cycles[0].names = WOCHENTAGE.map((n, i) => (i === 2 ? '' : n));
      }),
    );
    // Der 01.01.2026 ist ein Donnerstag, der 31.12.2025 ein Mittwoch.
    expect(cycleAt(cal, [2026, 1, 1, 0, 0, 0], 'week').positionName).toBe('Donnerstag');
    expect(cycleAt(cal, [2025, 12, 31, 0, 0, 0], 'week').positionName).toBeNull();
  });
});

describe('Namens-Liste auf die Zahl der Positionen gebracht (4T-002205, AK2)', () => {
  it.each([10, 11])(
    '%i Monats-Namen werden auf zwölf aufgefüllt; die übrigen Monate zeigen ihre Zahl',
    (n) => {
      const cal = mitMonaten(monatsNamen(n));
      expect(ebene(cal, 'month').names).toEqual(
        Array.from({ length: 12 }, (_, i) => (i < n ? MONATE[i] : null)),
      );
      expect(formatTuple(cal, [2026, n, 1, 0, 0, 0], { named: true })).toBe(
        `2026-${MONATE[n - 1]}-01`,
      );
      expect(formatTuple(cal, [2026, 12, 1, 0, 0, 0], { named: true })).toBe('2026-12-01');
    },
  );

  it.each([13, 14])('%i Monats-Namen werden auf zwölf beschnitten', (n) => {
    const cal = mitMonaten(monatsNamen(n));
    expect(ebene(cal, 'month').names).toEqual(MONATE);
    // Die Persistenz-Form trägt die beschnittene Liste.
    const ablage = configForPersist(null, { blocks: [{ id: 'welt', calendars: [cal] }] });
    expect(ebene(ablage.blocks[0].calendars[0], 'month').names).toEqual(MONATE);
  });

  it('Schutz-Fall: zwölf Namen bleiben unverändert, eine Liste ohne Namen bleibt keine Liste', () => {
    expect(ebene(mitMonaten(MONATE.slice()), 'month').names).toEqual(MONATE);
    expect(ebene(mitMonaten(['', ' ', '']), 'month').names).toBeNull();
    expect(ebene(mitMonaten(undefined), 'month').names).toBeNull();
  });

  it('Wochentags-Namen auf die Zyklus-Länge, Quartals- und Halbjahres-Namen auf ihre Zahl', () => {
    const cal = eingelesen(
      gregorianischRoh((def) => {
        def.cycles[0].names = wochentagsNamen(6);
        gruppe(def, 'quarter').names = ['Q1', 'Q2', 'Q3'];
        gruppe(def, 'half-year').names = ['H1', 'H2', 'H3'];
      }),
    );
    expect(cal.cycles[0].names).toEqual([...WOCHENTAGE.slice(0, 6), null]);
    expect(gruppe(cal, 'quarter').names).toEqual(['Q1', 'Q2', 'Q3', null]);
    expect(gruppe(cal, 'half-year').names).toEqual(['H1', 'H2']);
    expect(groupAt(cal, [2026, 11, 1, 0, 0, 0], 'quarter').positionName).toBeNull();
    const acht = eingelesen(gregorianischRoh((def) => (def.cycles[0].names = wochentagsNamen(8))));
    expect(acht.cycles[0].names).toEqual(WOCHENTAGE);
  });

  it('Schutz-Fall: ohne feste Zahl der Positionen bleibt die Liste, wie sie ist', () => {
    // Oberste Ebene, Ebene unter einer Längen-Tabelle, Gruppierung über einer
    // solchen Ebene; dazu eine Ebene, deren Einheit die Schalt-Verlängerung
    // trägt (Tage unter gleich langen Monaten eines Schaltjahrs).
    const cal = eingelesen(
      gregorianischRoh((def) => {
        ebene(def, 'year').names = ['A', 'B', 'C'];
        ebene(def, 'day').names = ['T1', 'T2', 'T3', 'T4', 'T5'];
        def.groups.push({ id: 'dekade', name: 'Dekade', of: 'day', size: 10, names: ['D1'] });
      }),
    );
    expect(ebene(cal, 'year').names).toEqual(['A', 'B', 'C']);
    expect(ebene(cal, 'day').names).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
    expect(gruppe(cal, 'dekade').names).toEqual(['D1']);
    const gleich = eingelesen(
      gregorianischRoh((def) => {
        ebene(def, 'month').rel = { type: 'factor', count: 30 };
        ebene(def, 'day').names = Array.from({ length: 31 }, (_, i) => `T${i + 1}`);
      }),
    );
    expect(ebene(gleich, 'day').names).toHaveLength(31);
  });
});

describe('Ableitung dreht über die Zahl der Positionen (4T-002205, AK4)', () => {
  // Block aus der Vorlage mit eigenen Namen und einer Ableitung ab `zero`.
  function ableitung(aendere, zero) {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'real',
          calendars: [
            gregorianischRoh(aendere),
            { id: 'abl', name: 'Ableitung', derivedFrom: 'gregorian', zero },
          ],
        },
      ],
    });
    return { block: config.blocks[0], abl: config.blocks[0].calendars[1] };
  }

  // Jeder Monat der Ableitung trägt den Namen, den der Bezug für den Monat
  // führt, in dem er beginnt — aus der eingegebenen Liste, oder keinen.
  function pruefeMonate(n, zero) {
    const roh = monatsNamen(n);
    const { block, abl } = ableitung((def) => (ebene(def, 'month').names = roh), zero);
    for (let p = 0; p < 12; p++) {
      const res = convertInBlock(block, 'abl', [zero[0] + 1, p + 1, 1, 0, 0, 0], 'gregorian');
      expect(res.ok).toBe(true);
      const bezugsMonat = res.tuple[1] - 1;
      expect(ebene(abl, 'month').names[p] ?? null, `Position ${p + 1}`).toBe(
        bezugsMonat < n ? roh[bezugsMonat] : null,
      );
    }
  }

  it.each([10, 11, 13])(
    'ab 15. März mit %i Monats-Namen: jede Position trägt den Namen ihres Bezugs-Monats oder keinen',
    (n) => {
      pruefeMonate(n, [2026, 3, 15]);
    },
  );

  it('Schutz-Fall: ab 15. März mit zwölf Monats-Namen', () => {
    pruefeMonate(12, [2026, 3, 15]);
  });

  it.each([10, 13])('Schutz-Fall: ab 1. Januar (keine Drehung) mit %i Monats-Namen', (n) => {
    pruefeMonate(n, [2026, 1, 1]);
  });

  // Jeder Tag der Ableitung trägt den Wochentags-Namen, den der Bezug für
  // denselben Tag führt (gemessen am Wert von cycleAt).
  function pruefeWochentage(n) {
    const roh = wochentagsNamen(n);
    const zero = [2026, 3, 15];
    const { block, abl } = ableitung((def) => (def.cycles[0].names = roh), zero);
    const bezug = block.calendars[0];
    for (let tag = 1; tag <= 14; tag++) {
      const tupel = [zero[0] + 1, 1, tag, 0, 0, 0];
      const res = convertInBlock(block, 'abl', tupel, 'gregorian');
      const imBezug = cycleAt(bezug, res.tuple, 'week');
      expect(cycleAt(abl, tupel, 'week').positionName, `Tag ${tag}`).toBe(
        roh[imBezug.position] ?? null,
      );
    }
  }

  it.each([6, 8])(
    'ab 15. März mit %i Wochentags-Namen trägt jeder Tag den Namen seines Bezugs-Tags',
    (n) => {
      pruefeWochentage(n);
    },
  );

  it('Schutz-Fall: ab 15. März mit sieben Wochentags-Namen', () => {
    pruefeWochentage(7);
  });

  it('Quartals-Namen ab 15. Mai werden über die Zahl der Quartale gedreht', () => {
    const { abl } = ableitung(
      (def) => (gruppe(def, 'quarter').names = ['Q1', 'Q2', 'Q3']),
      [2026, 5, 15],
    );
    expect(gruppe(abl, 'quarter').names).toEqual(['Q2', 'Q3', null, 'Q1']);
  });

  it('auch eine Liste, die nicht über das Einlesen kam, wird über die Positionen gedreht', () => {
    // Rückfall-Schutz für die Drehung selbst: die Namen am eingelesenen Bezug
    // nachträglich gekürzt, ohne den Weg über die Normalisierung.
    const bezug = eingelesen(createGregorianTemplate());
    ebene(bezug, 'month').names = MONATE.slice(0, 10);
    bezug.cycles[0].names = WOCHENTAGE.slice(0, 6);
    const roh = deriveCalendar(bezug, { id: 'abl', zero: [2026, 3, 15] });
    expect(ebene(roh, 'month').names).toEqual(
      Array.from({ length: 12 }, (_, p) => MONATE.slice(0, 10)[(p + 2) % 12] ?? null),
    );
    // Der 15.03.2026 ist ein Sonntag (Position 6).
    expect(roh.cycles[0].names).toEqual([null, ...WOCHENTAGE.slice(0, 6)]);
  });
});
