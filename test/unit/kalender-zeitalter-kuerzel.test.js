// 4T-001999 (Epic 3E-000307): Kennzeichen «Kürzel der Epoche immer schreiben»
// im Kalender-Kern — Schreiben der kanonischen und der Namens-Form, Lesen
// beider Schreibweisen, der Anlass des Bausteins (ein später nachgetragenes
// Zeitalter) und der Weg des Kennzeichens durch Normalisierung, Ablage-Form
// und Ableitung. Die Pflege-Oberfläche und die Kopf-Beschriftung der
// Eingabe-Hilfe prüft test/unit/renderer/kalender-zeitalter-kuerzel-pflege.test.js.
import { describe, it, expect } from 'vitest';
import {
  formatTuple,
  parseCanonical,
  writesEpochLabel,
} from '../../src/shared/calendar/calendar-core.js';
import {
  normalizeCalendarConfig,
  configForPersist,
} from '../../src/shared/calendar/calendar-config.js';

// Zeitrechnung «Herrscher» mit drei Epochen (Frühzeit, Mittelzeit, Neuzeit),
// Zeit-Anteil in Stunden und benannten Monaten. Die Grenzen liegen auf
// Jahres-Anfängen, damit die erwarteten Anzeige-Jahre von Hand nachrechenbar
// sind: Frühzeit zählt rückwärts ab dem internen Jahr 9, Mittelzeit ab 10,
// Neuzeit ab 20. `extra` ergänzt Felder der Zeitrechnung (etwa das Kennzeichen
// oder eine nachgetragene Epoche).
const EPOCHEN = [
  { name: 'Frühzeit', abbr: 'FZ', start: null },
  { name: 'Mittelzeit', abbr: 'MZ', start: [10, 1, 1] },
  { name: 'Neuzeit', abbr: 'NZ', start: [20, 1, 1] },
];
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

function herrscher(extra = {}) {
  return {
    id: 'herrscher',
    name: 'Herrscher',
    levels: [
      { id: 'stunde', name: 'Stunde', section: 'Zeit', start: 0 },
      { id: 'tag', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 24 } },
      {
        id: 'monat',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        names: MONATE,
        rel: { type: 'factor', count: 30 },
      },
      { id: 'jahr', name: 'Jahr', section: 'Datum', start: 1, rel: { type: 'factor', count: 12 } },
    ],
    epochs: EPOCHEN,
    ...extra,
  };
}

function normalisiert(roh) {
  const config = normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [roh] }] });
  return config.blocks[0].calendars[0];
}

const OHNE = normalisiert(herrscher());
const MIT = normalisiert(herrscher({ alwaysWriteEpoch: true }));

// Je ein Wert in jeder der drei Epochen (internes Jahr, Monat, Tag, Stunde).
const IN_FRUEHZEIT = [5, 3, 7, 0];
const IN_MITTELZEIT = [12, 3, 7, 0];
const IN_NEUZEIT = [25, 3, 7, 0];
const IN_NEUZEIT_MIT_ZEIT = [25, 3, 7, 14];

describe('Bestand ohne Kennzeichen (4T-001999, AK1)', () => {
  it('schreibt in allen drei Epochen unverändert — Kürzel nur außerhalb der jüngsten', () => {
    expect(formatTuple(OHNE, IN_FRUEHZEIT)).toBe('5-03-07 FZ');
    expect(formatTuple(OHNE, IN_MITTELZEIT)).toBe('3-03-07 MZ');
    expect(formatTuple(OHNE, IN_NEUZEIT)).toBe('6-03-07');
    expect(formatTuple(OHNE, IN_NEUZEIT_MIT_ZEIT)).toBe('6-03-07 14');
    expect(formatTuple(OHNE, IN_NEUZEIT, { named: true })).toBe('6-Saat-07');
    expect(formatTuple(OHNE, IN_MITTELZEIT, { named: true })).toBe('3-Saat-07 MZ');
  });

  it('liest die bisherigen Schreibweisen unverändert', () => {
    expect(parseCanonical(OHNE, '5-03-07 FZ').tuple).toEqual(IN_FRUEHZEIT);
    expect(parseCanonical(OHNE, '3-03-07 MZ').tuple).toEqual(IN_MITTELZEIT);
    expect(parseCanonical(OHNE, '6-03-07').tuple).toEqual(IN_NEUZEIT);
    expect(parseCanonical(OHNE, '6-03-07 14').tuple).toEqual(IN_NEUZEIT_MIT_ZEIT);
  });

  it('die Normalisierung legt kein Feld an; auch false ergibt dieselbe Struktur', () => {
    expect('alwaysWriteEpoch' in OHNE).toBe(false);
    expect(normalisiert(herrscher({ alwaysWriteEpoch: false }))).toStrictEqual(OHNE);
    const { alwaysWriteEpoch, ...rest } = MIT;
    expect(alwaysWriteEpoch).toBe(true);
    expect(rest).toStrictEqual(OHNE);
  });

  it('die Ablage-Form ohne Kennzeichen enthält das Feld nicht', () => {
    const roh = { blocks: [{ id: 'welt', calendars: [herrscher()] }] };
    const ablage = configForPersist(roh, normalizeCalendarConfig(roh));
    expect(JSON.stringify(ablage)).not.toContain('alwaysWriteEpoch');
  });
});

describe('Schreiben mit Kennzeichen (4T-001999, AK2)', () => {
  it('das Kürzel steht auch in der jüngsten Epoche, kanonisch und in Namens-Form', () => {
    expect(formatTuple(MIT, IN_NEUZEIT)).toBe('6-03-07 NZ');
    expect(formatTuple(MIT, IN_NEUZEIT, { named: true })).toBe('6-Saat-07 NZ');
  });

  it('mit Zeit-Anteil steht das Kürzel zwischen Datum und Zeit', () => {
    expect(formatTuple(MIT, IN_NEUZEIT_MIT_ZEIT)).toBe('6-03-07 NZ 14');
    expect(formatTuple(MIT, IN_NEUZEIT_MIT_ZEIT, { named: true })).toBe('6-Saat-07 NZ 14');
  });

  it('in den älteren Epochen ändert sich nichts', () => {
    expect(formatTuple(MIT, IN_FRUEHZEIT)).toBe('5-03-07 FZ');
    expect(formatTuple(MIT, IN_MITTELZEIT)).toBe('3-03-07 MZ');
  });

  it('die Regel selbst: jüngste Epoche nur mit Kennzeichen, ältere immer', () => {
    expect(writesEpochLabel(OHNE, 2)).toBe(false);
    expect(writesEpochLabel(MIT, 2)).toBe(true);
    expect(writesEpochLabel(OHNE, 0)).toBe(true);
    expect(writesEpochLabel(OHNE, 1)).toBe(true);
  });
});

describe('Lesen beider Schreibweisen (4T-001999, AK3)', () => {
  it.each([
    ['ohne Kennzeichen', OHNE],
    ['mit Kennzeichen', MIT],
  ])('%s: Werte mit und ohne Kürzel der jüngsten Epoche ergeben dasselbe Tupel', (_, cal) => {
    expect(parseCanonical(cal, '6-03-07 NZ').tuple).toEqual(IN_NEUZEIT);
    expect(parseCanonical(cal, '6-03-07').tuple).toEqual(IN_NEUZEIT);
    expect(parseCanonical(cal, '6-03-07 NZ 14').tuple).toEqual(IN_NEUZEIT_MIT_ZEIT);
    expect(parseCanonical(cal, '6-03-07 14').tuple).toEqual(IN_NEUZEIT_MIT_ZEIT);
  });

  it('ein geschriebener Wert wird mit Kennzeichen wieder als derselbe Tag gelesen', () => {
    for (const tupel of [IN_FRUEHZEIT, IN_MITTELZEIT, IN_NEUZEIT, IN_NEUZEIT_MIT_ZEIT]) {
      expect(parseCanonical(MIT, formatTuple(MIT, tupel)).tuple).toEqual(tupel);
    }
  });

  // Der Anlass des Bausteins: Nach dem Nachtragen einer weiteren Epoche liest
  // die Anwendung einen Wert ohne Kürzel als Jahr der NEUEN jüngsten Epoche.
  it('nach dem Nachtragen einer Epoche bleibt ein mit Kennzeichen geschriebener Wert derselbe Tag', () => {
    const spaeteEpoche = { name: 'Spätzeit', abbr: 'SZ', start: [40, 1, 1] };
    const mitSchutz = formatTuple(MIT, IN_NEUZEIT);
    const ohneSchutz = formatTuple(OHNE, IN_NEUZEIT);
    const nachherMit = normalisiert(
      herrscher({ alwaysWriteEpoch: true, epochs: [...EPOCHEN, spaeteEpoche] }),
    );
    const nachherOhne = normalisiert(herrscher({ epochs: [...EPOCHEN, spaeteEpoche] }));

    expect(parseCanonical(nachherMit, mitSchutz).tuple).toEqual(IN_NEUZEIT);
    // Gegenprobe: ohne Kennzeichen wandert derselbe Text in die neue Epoche.
    const verschoben = parseCanonical(nachherOhne, ohneSchutz);
    expect(verschoben.ok).toBe(true);
    expect(verschoben.epochIndex).toBe(3);
    expect(verschoben.tuple).not.toEqual(IN_NEUZEIT);
  });
});

describe('Weg des Kennzeichens durch Normalisierung und Ablage (4T-001999, AK4)', () => {
  it('übersteht Normalisierung, Ablage-Form und erneutes Einlesen', () => {
    const roh = { blocks: [{ id: 'welt', calendars: [herrscher({ alwaysWriteEpoch: true })] }] };
    const ablage = configForPersist(roh, normalizeCalendarConfig(roh));
    expect(ablage.blocks[0].calendars[0].alwaysWriteEpoch).toBe(true);
    const wieder = normalizeCalendarConfig(JSON.parse(JSON.stringify(ablage)));
    expect(wieder.blocks[0].calendars[0]).toStrictEqual(MIT);
  });

  it.each([false, 'ja', 1, null, 'true'])('übernimmt %j nicht', (wert) => {
    const cal = normalisiert(herrscher({ alwaysWriteEpoch: wert }));
    expect('alwaysWriteEpoch' in cal).toBe(false);
    expect(formatTuple(cal, IN_NEUZEIT)).toBe('6-03-07');
  });

  it('eine Ableitung trägt das Kennzeichen nicht, ihr Bezug behält es', () => {
    const config = normalizeCalendarConfig({
      blocks: [
        {
          id: 'welt',
          calendars: [
            herrscher({ alwaysWriteEpoch: true }),
            {
              id: 'regierung',
              name: 'Regierung',
              derivedFrom: 'herrscher',
              zero: [25, 1, 1],
              alwaysWriteEpoch: true,
            },
          ],
        },
      ],
    });
    const [bezug, ableitung] = config.blocks[0].calendars;
    expect(bezug.alwaysWriteEpoch).toBe(true);
    expect('alwaysWriteEpoch' in ableitung).toBe(false);
    // Die Ableitung zählt vom Nullpunkt weg; das Vorwärts-Kürzel bleibt weg.
    expect(formatTuple(ableitung, ableitung.epochs[1].start.concat([0]))).toBe('0-0-1');
  });
});
