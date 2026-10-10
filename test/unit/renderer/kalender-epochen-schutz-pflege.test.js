// @vitest-environment jsdom
// 4T-002003 (Epic 3E-000307): Schutz gespeicherter Werte beim Nachtragen einer
// Epoche — der Weg durch das Anwenden der Einstellungen (`applyCalendarSection`
// mit settings-calendar-epoch-guard.js).
//
// Gemessen wird die Reihenfolge, auf die es ankommt: zählen, fragen,
// speichern, EINMAL neu zählen, in EINEM Lauf schreiben, berichten
// (Plan-Änderung vom 2026-10-01, «alle umschreiben»). Dazu die drei Antworten
// der Rückfrage, keine Rückfrage ohne betroffene Werte, kein Schreiben bei
// fehlgeschlagenem Speichern, die Fortschreibung der Notizen beiderseits der
// neuen Grenze, die Rückfrage ohne Zahl, wenn die Zählung scheitert, und der
// sichtbare Hinweis, wenn gar nicht geprüft werden kann.
//
// Echt laufen der Entwurf der Einstellungen und das geteilte Rechen-Modul
// (calendar-epoch-guard.js) — sie entscheiden, ob ein Nachtrag vorliegt und wie
// eine Notiz-Stelle lautet. Ersetzt sind die Brücke zum Hauptprozess, die
// Ersetzen-Strecke (eigene Prüfdatei such-ersetzen.test.js) und der
// Bericht-Dialog; sie protokollieren nur, in welcher Reihenfolge sie gerufen
// werden und womit.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import {
  epochenNachtraege,
  laufOptionen,
} from '../../../src/shared/calendar/calendar-epoch-guard.js';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const lauf = vi.hoisted(() => ({
  protokoll: [],
  strecke: [],
  antworten: [],
  berichte: [],
  hinweise: [],
  streckeWirft: false,
  rechnungWirft: false,
}));

vi.mock('../../../src/renderer/modules/search/search-ersetzen.js', () => ({
  ersetzeZieleImBereich: async (ziele, opts, bericht) => {
    lauf.protokoll.push('schreiben');
    lauf.strecke.push({ ziele, opts, bericht });
    if (lauf.streckeWirft) throw new Error('Strecke weg');
    return (
      lauf.antworten.shift() || {
        geaendert: ziele.map((z) => ({ pfad: z.pfad, anzahl: z.offsets.length })),
        fehlgeschlagen: [],
        veraendert: [],
      }
    );
  },
  grundText: (grund) => `Grund ${grund}`,
}));
// Die eigene Rechnung des Anzeige-Prozesses läuft echt; für den einen Fall,
// in dem sie scheitern soll, lässt sie sich hier umschalten.
vi.mock('../../../src/shared/calendar/calendar-epoch-guard.js', async (importOriginal) => {
  const echt = await importOriginal();
  return {
    ...echt,
    epochenNachtraege: (...args) => {
      if (lauf.rechnungWirft) throw new Error('Rechnung defekt');
      return echt.epochenNachtraege(...args);
    },
  };
});
vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  showLinkReportDialog: async (opts) => {
    lauf.protokoll.push('bericht');
    lauf.berichte.push(opts);
  },
}));
vi.mock('../../../src/renderer/modules/views/views.js', async (importOriginal) => ({
  ...(await importOriginal()),
  showStatusbarHint: (_key, opts) => lauf.hinweise.push(opts),
}));

const { calendarToDraft, calendarConfigPersistForm } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { applyCalendarSection } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');

// Zeitrechnung mit drei Epochen; die jüngste (Neuzeit, Kürzel NZ) beginnt im
// internen Jahr 20. Mit `spaet` kommt eine vierte (Spätzeit, SZ) ab dem
// internen Jahr 40 hinzu — das ist der Nachtrag. Neuzeit-Jahr 21 ist damit
// Spätzeit-Jahr 1; «6-03-07» liegt vor der neuen Grenze, «25-02-03» danach.
function zeitrechnung(id, spaet) {
  const epochs = [
    { name: 'Frühzeit', abbr: 'FZ', start: null },
    { name: 'Mittelzeit', abbr: 'MZ', start: [10, 1, 1] },
    { name: 'Neuzeit', abbr: 'NZ', start: [20, 1, 1] },
  ];
  if (spaet) epochs.push({ name: 'Spätzeit', abbr: 'SZ', start: [40, 1, 1] });
  return normalizeCalendarConfig({
    blocks: [
      {
        id: 'welt',
        calendars: [
          {
            id,
            name: id,
            levels: [
              { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
              {
                id: 'monat',
                name: 'Monat',
                section: 'Datum',
                start: 1,
                rel: { type: 'factor', count: 30 },
              },
              {
                id: 'jahr',
                name: 'Jahr',
                section: 'Datum',
                start: 1,
                rel: { type: 'factor', count: 12 },
              },
            ],
            epochs,
          },
        ],
      },
    ],
  }).blocks[0].calendars[0];
}

const DATEI_A = 'C:/Bereich/a.md';
const DATEI_B = 'C:/Bereich/b.md';

// Entwurf mit zwei Zeitrechnungen gegen den Schnappschuss des unveränderten
// Stands; `nachtragen` hängt an die genannten die Epoche «Spätzeit» an.
function entwurf(nachtragen = []) {
  const values = {
    hasArea: true,
    blocks: [
      {
        id: 'welt',
        name: 'Welt',
        calendars: [
          calendarToDraft(zeitrechnung('Herrscher')),
          calendarToDraft(zeitrechnung('Dynastie')),
        ],
      },
    ],
  };
  const draft = { calendar: values, calendarSnapshot: calendarConfigPersistForm(values) };
  for (const idx of nachtragen) {
    const cal = values.blocks[0].calendars[idx];
    cal.epochs.push(calendarToDraft(zeitrechnung(cal.name, true)).epochs[3]);
  }
  return draft;
}

// Eintrag der Zählung für eine Zeitrechnung, in der Form des Hauptprozesses.
function nachtrag(calId, { werte = 2, dokumente = 1 } = {}) {
  return { blockId: 'welt', calId, name: calId, label: 'NZ', werte, dokumente };
}

// Ziel der Strecke mit je Fundstelle eigenem neuen Text.
function ziel(pfad, offsets) {
  return { pfad, offsets, ersetzungen: offsets.map((o) => `@{Herrscher: neu-${o}}`) };
}

// Antwort der Zählung: Nachträge, dazu Dateien und Notizen EINMAL auf oberster
// Ebene über alle Nachträge zusammengeführt.
function zaehlung({ nachtraege, dateien = [ziel(DATEI_A, [10, 40])], notizen = [] }) {
  return { vorratModus: 'vorrat', nachtraege, dateien, notizen };
}

let zaehlungen;
let notizen;

function bruecke({ rueckfrage = 'sichern', speichern = { ok: true } } = {}) {
  const api = window.api;
  api.calendarEpochScan = vi.fn(async (auftrag) => {
    lauf.protokoll.push('zaehlen');
    const naechste = zaehlungen.shift();
    if (naechste instanceof Error) throw naechste;
    expect(auftrag).toHaveProperty('alt');
    expect(auftrag).toHaveProperty('neu');
    return naechste;
  });
  api.calendarConfirmEpochGuard = vi.fn(async () => {
    lauf.protokoll.push('fragen');
    if (rueckfrage instanceof Error) throw rueckfrage;
    return rueckfrage;
  });
  api.calendarConfirmDependents = vi.fn(async () => true);
  api.calendarSetAreaConfig = vi.fn(async () => {
    lauf.protokoll.push('speichern');
    return speichern;
  });
  api.readNote = vi.fn(async (pfad) => {
    lauf.protokoll.push('notiz lesen');
    return { ok: true, note: { text: notizen[pfad] } };
  });
  api.writeNote = vi.fn(async (pfad, text) => {
    lauf.protokoll.push('notiz schreiben');
    notizen[pfad] = text;
    return { ok: true };
  });
  api.basename = (p) => String(p).split(/[\\/]/).pop();
  return api;
}

beforeEach(() => {
  lauf.protokoll.length = 0;
  lauf.strecke.length = 0;
  lauf.antworten.length = 0;
  lauf.berichte.length = 0;
  lauf.hinweise.length = 0;
  lauf.streckeWirft = false;
  lauf.rechnungWirft = false;
  zaehlungen = [];
  notizen = {};
});

describe('Vorbedingung des Aufbaus', () => {
  it('der Entwurf mit nachgetragener Epoche ergibt genau einen Nachtrag mit dem Kürzel NZ', () => {
    const draft = entwurf([0]);
    const neu = calendarConfigPersistForm(draft.calendar);
    const n = epochenNachtraege(
      normalizeCalendarConfig(draft.calendarSnapshot),
      normalizeCalendarConfig(neu),
    );
    expect(n.map((e) => [e.blockId, e.calId, e.label])).toEqual([['welt', 'Herrscher', 'NZ']]);
  });
});

describe('Die drei Antworten der Rückfrage (4T-002003)', () => {
  it('sichern: zählen, fragen, speichern, EINMAL neu zählen, EIN Lauf, berichten', async () => {
    const draft = entwurf([0]);
    const vorher = draft.calendarSnapshot;
    const frisch = [ziel(DATEI_A, [12, 42]), ziel(DATEI_B, [7])];
    zaehlungen = [
      zaehlung({ nachtraege: [nachtrag('Herrscher', { werte: 3, dokumente: 2 })] }),
      zaehlung({ nachtraege: [nachtrag('Herrscher')], dateien: frisch }),
    ];
    const api = bruecke({ rueckfrage: 'sichern' });

    await applyCalendarSection(draft);

    expect(lauf.protokoll).toEqual([
      'zaehlen',
      'fragen',
      'speichern',
      'zaehlen',
      'schreiben',
      'bericht',
    ]);
    expect(api.calendarConfirmEpochGuard).toHaveBeenCalledWith({
      eintraege: [{ name: 'Herrscher', werte: 3, dokumente: 2 }],
      zaehlbar: true,
    });
    // Beide Zählungen gegen dieselbe alte und neue Definition.
    const [erste, zweite] = api.calendarEpochScan.mock.calls.map((c) => c[0]);
    expect(erste.alt).toEqual(vorher);
    expect(zweite.alt).toEqual(vorher);
    expect(zweite.neu).toEqual(erste.neu);
    expect(draft.calendarSnapshot).toEqual(erste.neu);
    // Ein Lauf mit den Zielen der ZWEITEN Zählung, samt ihren Ersetzungs-Texten
    // unverändert, und ohne eigenen Bericht der Strecke.
    expect(lauf.strecke).toHaveLength(1);
    expect(lauf.strecke[0].ziele).toEqual(frisch);
    expect(lauf.strecke[0].opts).toEqual(laufOptionen());
    expect(lauf.strecke[0].bericht).toEqual({ zeigen: false });
    // Ein Bericht, ohne Hinweis, weil nichts ungeändert blieb; Einzahl und
    // Mehrzahl der Werte.
    expect(lauf.berichte).toHaveLength(1);
    const b = lauf.berichte[0];
    expect(b.title).toBe('Gesicherte Datums-Werte');
    expect(b.sections.map((s) => s.title)).toEqual([
      'Gesichert',
      'Nicht geändert',
      'Seit der Zählung geändert',
    ]);
    expect(b.sections[0].rows).toEqual([
      { text: 'a.md', detail: '2 Werte' },
      { text: 'b.md', detail: '1 Wert' },
    ]);
    expect(b.notes).toEqual([]);
  });

  it('ohne Sichern: speichert, schreibt nichts und berichtet nichts', async () => {
    zaehlungen = [zaehlung({ nachtraege: [nachtrag('Herrscher')] })];
    const api = bruecke({ rueckfrage: 'ohne' });

    await applyCalendarSection(entwurf([0]));

    expect(lauf.protokoll).toEqual(['zaehlen', 'fragen', 'speichern']);
    expect(api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
    expect(api.writeNote).not.toHaveBeenCalled();
  });

  it('abbrechen: speichert nicht, lässt den Schnappschuss stehen und meldet nichts', async () => {
    zaehlungen = [zaehlung({ nachtraege: [nachtrag('Herrscher')] })];
    const api = bruecke({ rueckfrage: 'abbrechen' });
    const draft = entwurf([0]);
    const vorher = draft.calendarSnapshot;

    await applyCalendarSection(draft);

    expect(lauf.protokoll).toEqual(['zaehlen', 'fragen']);
    expect(api.calendarSetAreaConfig).not.toHaveBeenCalled();
    expect(draft.calendarSnapshot).toBe(vorher);
    expect(lauf.hinweise).toEqual([]);
  });

  it('ein Fehler der Brücke bei der Rückfrage zählt als Abbruch', async () => {
    zaehlungen = [zaehlung({ nachtraege: [nachtrag('Herrscher')] })];
    const api = bruecke({ rueckfrage: new Error('Kanal weg') });

    await applyCalendarSection(entwurf([0]));

    expect(api.calendarSetAreaConfig).not.toHaveBeenCalled();
  });

  it('eine nicht angebotene Antwort zählt als Abbruch', async () => {
    zaehlungen = [{ ...zaehlung({ nachtraege: [nachtrag('Herrscher')] }), vorratModus: 'direkt' }];
    const api = bruecke({ rueckfrage: 'sichern' });

    await applyCalendarSection(entwurf([0]));

    expect(api.calendarSetAreaConfig).not.toHaveBeenCalled();
  });
});

describe('Keine Rückfrage ohne betroffene Werte (4T-002003)', () => {
  it('ohne Nachtrag einer Epoche wird weder gezählt noch gefragt', async () => {
    const api = bruecke();
    const draft = entwurf();
    draft.calendar.blocks[0].calendars[0].epochs[2].name = 'Jetztzeit';

    await applyCalendarSection(draft);

    expect(api.calendarEpochScan).not.toHaveBeenCalled();
    expect(api.calendarConfirmEpochGuard).not.toHaveBeenCalled();
    expect(api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
  });

  it('mit Nachtrag, aber null betroffenen Werten wird nicht gefragt', async () => {
    zaehlungen = [
      zaehlung({ nachtraege: [nachtrag('Herrscher', { werte: 0, dokumente: 0 })], dateien: [] }),
    ];
    const api = bruecke();

    await applyCalendarSection(entwurf([0]));

    expect(api.calendarConfirmEpochGuard).not.toHaveBeenCalled();
    expect(api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
  });

  it('die Rückfrage nennt nur die Zeitrechnungen mit betroffenen Werten', async () => {
    zaehlungen = [
      zaehlung({
        nachtraege: [
          nachtrag('Herrscher', { werte: 0, dokumente: 0 }),
          nachtrag('Dynastie', { werte: 3, dokumente: 2 }),
        ],
      }),
    ];
    const api = bruecke({ rueckfrage: 'ohne' });

    await applyCalendarSection(entwurf([0, 1]));

    expect(api.calendarConfirmEpochGuard).toHaveBeenCalledWith({
      eintraege: [{ name: 'Dynastie', werte: 3, dokumente: 2 }],
      zaehlbar: true,
    });
  });
});

describe('Speichern vor Schreiben, ein Lauf über alle Nachträge (4T-002003)', () => {
  it('schlägt das Speichern fehl, wird weder neu gezählt noch geschrieben', async () => {
    zaehlungen = [
      zaehlung({
        nachtraege: [nachtrag('Herrscher')],
        notizen: [{ pfad: DATEI_B, anzahl: 1 }],
      }),
    ];
    const api = bruecke({ rueckfrage: 'sichern', speichern: { ok: false } });
    const draft = entwurf([0]);
    const vorher = draft.calendarSnapshot;

    await applyCalendarSection(draft);

    expect(lauf.protokoll).toEqual(['zaehlen', 'fragen', 'speichern']);
    expect(api.readNote).not.toHaveBeenCalled();
    expect(api.writeNote).not.toHaveBeenCalled();
    expect(draft.calendarSnapshot).toBe(vorher);
  });

  it('zwei Nachträge: genau eine zweite Zählung und genau ein Lauf mit allen Zielen', async () => {
    const frisch = [ziel(DATEI_A, [11, 99]), ziel(DATEI_B, [77])];
    zaehlungen = [
      zaehlung({ nachtraege: [nachtrag('Herrscher'), nachtrag('Dynastie', { werte: 1 })] }),
      zaehlung({ nachtraege: [nachtrag('Herrscher'), nachtrag('Dynastie')], dateien: frisch }),
    ];
    const api = bruecke({ rueckfrage: 'sichern' });

    await applyCalendarSection(entwurf([0, 1]));

    expect(api.calendarEpochScan).toHaveBeenCalledTimes(2);
    expect(lauf.strecke).toHaveLength(1);
    expect(lauf.strecke[0].ziele).toEqual(frisch);
    expect(lauf.strecke[0].ziele[1].ersetzungen).toEqual(['@{Herrscher: neu-77}']);
    expect(lauf.berichte).toHaveLength(1);
  });
});

describe('Notizen und Bericht (4T-002003)', () => {
  it('schreibt die Notiz beiderseits der neuen Grenze um; frühere Epochen und andere Zeitrechnungen bleiben', async () => {
    notizen[DATEI_B] =
      'Vorher @{Herrscher: 6-03-07}, danach @{Herrscher: 25-02-03} und @{herrscher: 21-01-01 NZ}, ' +
      'früher @{Herrscher: 2-01-01 MZ}, Grenze @{Herrscher: 20-12-30}, fremd @{Dynastie: 25-02-03}.';
    const notiz = [{ pfad: DATEI_B, anzahl: 4 }];
    zaehlungen = [
      zaehlung({ nachtraege: [nachtrag('Herrscher')], dateien: [], notizen: notiz }),
      zaehlung({ nachtraege: [nachtrag('Herrscher')], dateien: [], notizen: notiz }),
    ];
    const api = bruecke({ rueckfrage: 'sichern' });

    await applyCalendarSection(entwurf([0]));

    expect(api.writeNote).toHaveBeenCalledTimes(1);
    expect(notizen[DATEI_B]).toBe(
      'Vorher @{Herrscher: 6-03-07 NZ}, danach @{Herrscher: 5-02-03} und @{herrscher: 1-01-01}, ' +
        'früher @{Herrscher: 2-01-01 MZ}, Grenze @{Herrscher: 20-12-30 NZ}, fremd @{Dynastie: 25-02-03}.',
    );
    // Ohne Dateien geht nichts an die Strecke.
    expect(lauf.strecke).toHaveLength(0);
    expect(lauf.berichte[0].sections[0].rows).toEqual([
      { text: 'b.md', detail: 'Notiz · 4 Werte' },
    ]);
  });

  it('nennt Fehlschläge mit Grund, eine nicht schreibbare Notiz und den Hinweis zum Berichtigen', async () => {
    notizen[DATEI_B] = 'Termin @{Herrscher: 6-03-07}';
    const notiz = [{ pfad: DATEI_B, anzahl: 1 }];
    zaehlungen = [
      zaehlung({ nachtraege: [nachtrag('Herrscher')], notizen: notiz }),
      zaehlung({ nachtraege: [nachtrag('Herrscher')], notizen: notiz }),
    ];
    lauf.antworten.push({
      geaendert: [],
      fehlgeschlagen: [{ pfad: DATEI_A, grund: 'geteilt' }],
      veraendert: [],
    });
    const api = bruecke({ rueckfrage: 'sichern' });
    api.writeNote = vi.fn(async () => ({ ok: false, error: 'suspended' }));

    await applyCalendarSection(entwurf([0]));

    const b = lauf.berichte[0];
    expect(b.sections[0].rows).toEqual([]);
    expect(b.sections[1].rows).toEqual([
      { text: 'a.md', detail: 'Grund geteilt' },
      { text: 'b.md', detail: 'Notiz · Grund schreiben' },
    ]);
    expect(b.notes).toEqual([
      'In den nicht geänderten Dokumenten sind die betroffenen Werte von Hand zu berichtigen.',
    ]);
  });

  it('was bei der zweiten Zählung fehlt, erscheint unter «Seit der Zählung geändert»', async () => {
    zaehlungen = [
      zaehlung({
        nachtraege: [nachtrag('Herrscher')],
        dateien: [ziel(DATEI_A, [1]), ziel(DATEI_B, [2])],
      }),
      zaehlung({ nachtraege: [nachtrag('Herrscher')], dateien: [ziel(DATEI_A, [1])] }),
    ];
    bruecke({ rueckfrage: 'sichern' });

    await applyCalendarSection(entwurf([0]));

    const b = lauf.berichte[0];
    expect(b.sections[2].rows).toEqual([{ text: 'b.md' }]);
    expect(b.notes).toHaveLength(1);
  });

  it('scheitert die zweite Zählung, wird nichts geschrieben und jedes Ziel mit Grund genannt', async () => {
    zaehlungen = [
      zaehlung({
        nachtraege: [nachtrag('Herrscher')],
        notizen: [{ pfad: DATEI_B, anzahl: 1 }],
      }),
      new Error('Kanal weg'),
    ];
    const api = bruecke({ rueckfrage: 'sichern' });

    await applyCalendarSection(entwurf([0]));

    expect(lauf.strecke).toHaveLength(0);
    expect(api.writeNote).not.toHaveBeenCalled();
    const b = lauf.berichte[0];
    expect(b.sections[1].rows).toEqual([
      { text: 'a.md', detail: 'Grund kanal' },
      { text: 'b.md', detail: 'Notiz · Grund kanal' },
    ]);
    expect(b.notes).toHaveLength(1);
  });

  it('ist der Bereich bei der zweiten Zählung nicht mehr zählbar, wird nichts geschrieben', async () => {
    zaehlungen = [
      zaehlung({ nachtraege: [nachtrag('Herrscher')] }),
      { vorratModus: 'direkt', nachtraege: [nachtrag('Herrscher')], dateien: [], notizen: [] },
    ];
    bruecke({ rueckfrage: 'sichern' });

    await applyCalendarSection(entwurf([0]));

    expect(lauf.strecke).toHaveLength(0);
    expect(lauf.berichte[0].sections[1].rows).toEqual([
      { text: 'a.md', detail: 'Grund keinVorrat' },
    ]);
  });

  it('ein Fehler, den die Strecke nicht abfängt, erscheint im Bericht statt ihn zu verhindern', async () => {
    zaehlungen = [
      zaehlung({ nachtraege: [nachtrag('Herrscher')] }),
      zaehlung({ nachtraege: [nachtrag('Herrscher')] }),
    ];
    lauf.streckeWirft = true;
    bruecke({ rueckfrage: 'sichern' });

    await applyCalendarSection(entwurf([0]));

    expect(lauf.berichte[0].sections[1].rows).toEqual([{ text: 'a.md', detail: 'Grund kanal' }]);
  });
});

describe('Scheitert die Zählung, kommt die Rückfrage ohne Zahl (4T-002003)', () => {
  it('Fehler der Brücke: Rückfrage wie bei zu großem Bereich, «ohne» speichert', async () => {
    zaehlungen = [new Error('Kanal weg')];
    const api = bruecke({ rueckfrage: 'ohne' });

    await applyCalendarSection(entwurf([0]));

    expect(api.calendarConfirmEpochGuard).toHaveBeenCalledWith({
      eintraege: [{ name: 'Herrscher' }],
      zaehlbar: false,
    });
    expect(api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
  });

  it('Fehler der Brücke und Abbrechen: speichert nicht', async () => {
    zaehlungen = [new Error('Kanal weg')];
    const api = bruecke({ rueckfrage: 'abbrechen' });

    await applyCalendarSection(entwurf([0]));

    expect(api.calendarSetAreaConfig).not.toHaveBeenCalled();
  });

  it('zu großer Bereich: Rückfrage ohne Zahl mit den Namen der Zählung', async () => {
    zaehlungen = [
      {
        vorratModus: 'direkt',
        nachtraege: [{ ...nachtrag('Herrscher'), werte: null, dokumente: null }],
        dateien: [],
        notizen: [],
      },
    ];
    const api = bruecke({ rueckfrage: 'ohne' });

    await applyCalendarSection(entwurf([0]));

    expect(api.calendarConfirmEpochGuard).toHaveBeenCalledWith({
      eintraege: [{ name: 'Herrscher' }],
      zaehlbar: false,
    });
    expect(lauf.strecke).toHaveLength(0);
  });

  it('scheitern Zählung UND eigene Rechnung: Hinweis in der Statusleiste, nicht gespeichert', async () => {
    zaehlungen = [new Error('Kanal weg')];
    const api = bruecke();
    lauf.rechnungWirft = true;

    await applyCalendarSection(entwurf([0]));

    expect(api.calendarConfirmEpochGuard).not.toHaveBeenCalled();
    expect(api.calendarSetAreaConfig).not.toHaveBeenCalled();
    expect(lauf.hinweise).toEqual([
      {
        text: 'Die Prüfung der gespeicherten Datums-Werte ist fehlgeschlagen; die Änderung wurde nicht angewendet.',
        error: true,
        duration: 4000,
      },
    ]);
  });
});
