// 4T-002738 (Epic 3E-000396): Übertrag offener Aufgaben im Fenster — die
// Verschiebe-Regel des Sprung-Ziels, die Zuordnung der Antworten des Kanals zu
// den Meldungen der Statusleiste und der Auslöser im gemeinsamen Öffnen-/
// Anlage-Pfad (`openJournalEntry`) samt Befehl von Hand.
//
// Gemessen wird am echten Modul `calendar/journals.js` mit echtem Perioden-Kern;
// nachgestellt sind nur die Nachbarn, die am ganzen Fenster hängen (Reiter,
// Statusleiste, Vorlagen-Sprung, Erweiterungs-Zustand, IPC-Brücke). Der Kanal
// selbst ist Gegenstand von journal-uebertrag-kanal.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  openInPane: vi.fn(async () => 0),
  showTemplateSelectDialog: vi.fn(),
  showStatusbarHint: vi.fn(),
  jumpToOffsetInActiveTab: vi.fn(),
  aktiv: { journals: true },
  state: { activePaneIndex: 0, panes: [] },
  reihenfolge: [],
}));

vi.mock('../../../src/renderer/i18n.js', () => ({
  t: (key) =>
    ({
      'journal.carryOver.done': 'Übertragen: {count} aus {entry}',
      'journal.carryOver.sectionMissing': 'Abschnitt {section} in {entry} fehlt',
      'journal.carryOver.unsaved': '{entry} ungespeichert',
      'journal.carryOver.nothingOpen': 'nichts offen in {entry}',
    })[key] || key,
  intlLocale: () => 'de',
}));
vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({
  openInPane: (...args) => {
    h.reihenfolge.push('zeige');
    return h.openInPane(...args);
  },
}));
vi.mock('../../../src/renderer/modules/tabs/tab-ersetzen.js', () => ({
  reiterFuerPfad: () => null,
  ersetzeTabDurchDatei: vi.fn(),
}));
vi.mock('../../../src/renderer/modules/templates.js', () => ({
  collectAnswers: vi.fn(),
  jumpToOffsetInActiveTab: h.jumpToOffsetInActiveTab,
  showTemplateError: vi.fn(),
  showTemplateSelectDialog: h.showTemplateSelectDialog,
  templateDocumentContext: () => ({}),
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: h.showStatusbarHint,
}));
vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', () => ({
  showNameInputDialog: vi.fn(),
}));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({ state: h.state }));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => h.aktiv[id] !== false,
}));

const api = {
  journalsGetConfig: vi.fn(),
  journalsStatEntry: vi.fn(),
  journalsCreateEntry: vi.fn(),
  journalsUebertrageAufgaben: vi.fn(),
  templatesRead: vi.fn(),
};
vi.mock('../../../src/renderer/modules/app/api.js', () => ({ api }));

const { verschiebeSprungZiel, uebertragMeldung, openJournalEntry, uebertrageOffeneAufgaben } =
  await import('../../../src/renderer/modules/calendar/journals.js');
const { periodOf, prevPeriod } = await import('../../../src/shared/journal-core.js');

const TAG = {
  id: 'tag',
  name: 'Tagebuch',
  shelf: null,
  granularity: 'day',
  folderPattern: 'Journal',
  namePattern: '{{date}}',
  template: null,
  startDate: null,
  endDate: null,
  nameProp: 'journal',
  dateProp: 'journal-date',
  startProp: 'journal-start-date',
  endProp: 'journal-end-date',
  carryOverAuto: true,
  carryOverMode: 'mark',
  carryOverSection: '',
};

describe('verschiebeSprungZiel', () => {
  it('ohne Einfügungen bleibt das Ziel stehen', () => {
    expect(verschiebeSprungZiel(10, [])).toBe(10);
    expect(verschiebeSprungZiel(10, undefined)).toBe(10);
  });

  it('Einfügungen vor und genau am Ziel verschieben, spätere nicht', () => {
    const einfuegungen = [
      { offset: 0, laenge: 5 },
      { offset: 10, laenge: 7 },
      { offset: 11, laenge: 100 },
    ];
    expect(verschiebeSprungZiel(10, einfuegungen)).toBe(22);
    expect(verschiebeSprungZiel(9, einfuegungen)).toBe(14);
  });

  it('kein Ziel bleibt kein Ziel; unbrauchbare Einträge zählen nicht', () => {
    expect(verschiebeSprungZiel(null, [{ offset: 0, laenge: 5 }])).toBeNull();
    expect(verschiebeSprungZiel(4, [null, { offset: 'x', laenge: 3 }, { offset: 1 }])).toBe(4);
  });
});

describe('uebertragMeldung', () => {
  it('Erfolg nennt Zahl und Quell-Eintrag; null Aufgaben ergibt keine Meldung', () => {
    const m = uebertragMeldung({ ok: true, anzahl: 3, quelle: '2026-11-14' }, TAG, false);
    expect(m.key).toBe('journal.carryOver.done');
    expect(m.text).toBe('Übertragen: 3 aus 2026-11-14');
    expect(m.error).toBe(false);
    expect(uebertragMeldung({ ok: true, anzahl: 0 }, TAG, true)).toBeNull();
  });

  it('kein früherer Eintrag, nichts offen und Aufgaben aus nur beim Befehl', () => {
    for (const grund of ['kein-frueherer-eintrag', 'nichts-offen', 'erweiterung-aus']) {
      expect(uebertragMeldung({ ok: false, grund, quelle: 'q' }, TAG, false)).toBeNull();
    }
    expect(uebertragMeldung({ ok: false, grund: 'kein-frueherer-eintrag' }, TAG, true).key).toBe(
      'journal.carryOver.noPrevious',
    );
    const offen = uebertragMeldung({ ok: false, grund: 'nichts-offen', quelle: 'q' }, TAG, true);
    expect(offen.key).toBe('journal.carryOver.nothingOpen');
    expect(offen.text).toBe('nichts offen in q');
    expect(uebertragMeldung({ ok: false, grund: 'erweiterung-aus' }, TAG, true).key).toBe(
      'journal.carryOver.tasksOff',
    );
  });

  it('die übrigen Gründe melden sich in beiden Fällen', () => {
    for (const vonHand of [false, true]) {
      const abschnitt = uebertragMeldung(
        { ok: false, grund: 'abschnitt-fehlt', quelle: 'q' },
        { ...TAG, carryOverSection: 'Aufgaben' },
        vonHand,
      );
      expect(abschnitt.text).toBe('Abschnitt Aufgaben in q fehlt');
      expect(abschnitt.error).toBe(true);
      const offen = uebertragMeldung(
        { ok: false, grund: 'ungespeichert', eintrag: 'e' },
        TAG,
        vonHand,
      );
      expect(offen.text).toBe('e ungespeichert');
      expect(uebertragMeldung({ ok: false, grund: 'geaendert' }, TAG, vonHand).key).toBe(
        'journal.carryOver.changed',
      );
      expect(uebertragMeldung({ ok: false, grund: 'zu-gross' }, TAG, vonHand).key).toBe(
        'journal.carryOver.tooLarge',
      );
      expect(uebertragMeldung({ ok: false, grund: 'zu-viele-dateien' }, TAG, vonHand).key).toBe(
        'journal.carryOver.tooManyFiles',
      );
      for (const grund of ['schreibfehler', 'ungueltig', 'kein-ziel', undefined]) {
        expect(uebertragMeldung({ ok: false, grund }, TAG, vonHand).key).toBe(
          'journal.carryOver.failed',
        );
      }
      expect(uebertragMeldung(null, TAG, vonHand).key).toBe('journal.carryOver.failed');
    }
  });
});

describe('Auslöser beim Anlegen und Befehl von Hand', () => {
  const heute = () => periodOf(Date.now(), 'day');

  beforeEach(() => {
    vi.clearAllMocks();
    h.reihenfolge.length = 0;
    h.aktiv.journals = true;
    h.state.panes = [];
    api.journalsStatEntry.mockImplementation(async (relPath) => ({
      ok: true,
      exists: false,
      path: `C:/B/${relPath}`,
    }));
    api.journalsCreateEntry.mockImplementation(async (relPath) => ({
      ok: true,
      existed: false,
      path: `C:/B/${relPath}`,
    }));
    api.journalsUebertrageAufgaben.mockImplementation(async () => {
      h.reihenfolge.push('uebertrag');
      return { ok: true, anzahl: 2, eingesetzt: 2, quelle: 'gestern', einfuegungen: [] };
    });
  });

  it('überträgt bei neu angelegtem Eintrag der laufenden Periode vor dem Zeigen', async () => {
    h.state.panes = [
      {
        tabs: [
          { path: 'C:/B/a.md', dirty: true },
          { path: 'C:/B/b.md', dirty: false },
        ],
      },
      {
        tabs: [
          { path: 'C:/B/c.md', dirty: true },
          { path: null, dirty: true },
        ],
      },
    ];
    const period = heute();
    expect(await openJournalEntry(TAG, period)).toBe(true);
    expect(api.journalsUebertrageAufgaben).toHaveBeenCalledWith('tag', period.startMs, [
      'C:/B/a.md',
      'C:/B/c.md',
    ]);
    expect(h.reihenfolge).toEqual(['uebertrag', 'zeige']);
    expect(h.showStatusbarHint).toHaveBeenCalledWith(
      'journal.carryOver.done',
      expect.objectContaining({ error: false }),
    );
  });

  it('verschiebt das Sprung-Ziel der Vorlage um die Einfügungen davor', async () => {
    api.templatesRead.mockResolvedValue({ ok: true, content: 'A\n{{cursor}}\nB' });
    api.journalsUebertrageAufgaben.mockResolvedValue({
      ok: true,
      anzahl: 1,
      quelle: 'gestern',
      einfuegungen: [{ offset: 0, laenge: 4 }],
    });
    const ohne = { ...TAG, template: 'v.md', carryOverAuto: false };
    await openJournalEntry(ohne, heute());
    const ohneZiel = h.jumpToOffsetInActiveTab.mock.calls[0][0];
    h.jumpToOffsetInActiveTab.mockClear();
    await openJournalEntry({ ...ohne, carryOverAuto: true }, heute());
    expect(h.jumpToOffsetInActiveTab).toHaveBeenCalledWith(ohneZiel + 4);
  });

  it('kein Übertrag: Schalter aus, Erweiterung aus, andere Periode, ohneUebertrag, bestehend', async () => {
    await openJournalEntry({ ...TAG, carryOverAuto: false }, heute());
    h.aktiv.journals = false;
    await openJournalEntry(TAG, heute());
    h.aktiv.journals = true;
    await openJournalEntry(TAG, prevPeriod(TAG, heute()));
    await openJournalEntry(TAG, heute(), { ohneUebertrag: true });
    api.journalsCreateEntry.mockResolvedValueOnce({ ok: true, existed: true, path: 'C:/B/x.md' });
    await openJournalEntry(TAG, heute());
    api.journalsStatEntry.mockResolvedValueOnce({ ok: true, exists: true, path: 'C:/B/x.md' });
    await openJournalEntry(TAG, heute());
    expect(api.journalsUebertrageAufgaben).not.toHaveBeenCalled();
    expect(h.openInPane).toHaveBeenCalledTimes(6);
  });

  it('ein Fehler oder eine Ablehnung des Kanals verhindert das Öffnen nie', async () => {
    api.journalsUebertrageAufgaben.mockRejectedValueOnce(new Error('kaputt'));
    expect(await openJournalEntry(TAG, heute())).toBe(true);
    expect(h.showStatusbarHint).toHaveBeenCalledWith(
      'journal.carryOver.failed',
      expect.objectContaining({ error: true }),
    );
    api.journalsUebertrageAufgaben.mockResolvedValueOnce({ ok: false, grund: 'nichts-offen' });
    expect(await openJournalEntry(TAG, heute())).toBe(true);
    expect(h.openInPane).toHaveBeenCalledTimes(2);
    expect(h.showStatusbarHint).toHaveBeenCalledTimes(1);
  });

  it('der Befehl wählt unter allen Journalen, öffnet ohne Übertrag und überträgt danach', async () => {
    const woche = { ...TAG, id: 'woche', name: 'Woche', granularity: 'week', carryOverAuto: false };
    api.journalsGetConfig.mockResolvedValue({
      ok: true,
      hasArea: true,
      config: { shelves: [], journals: [TAG, woche] },
    });
    h.showTemplateSelectDialog.mockResolvedValue('Woche');
    api.journalsUebertrageAufgaben.mockImplementation(async () => {
      h.reihenfolge.push('uebertrag');
      return { ok: false, grund: 'kein-frueherer-eintrag' };
    });
    await uebertrageOffeneAufgaben();
    expect(h.showTemplateSelectDialog.mock.calls[0][1]).toEqual(['Tagebuch', 'Woche']);
    expect(h.reihenfolge).toEqual(['zeige', 'uebertrag']);
    expect(api.journalsUebertrageAufgaben).toHaveBeenCalledTimes(1);
    expect(api.journalsUebertrageAufgaben.mock.calls[0][0]).toBe('woche');
    expect(api.journalsUebertrageAufgaben.mock.calls[0][1]).toBe(
      periodOf(Date.now(), 'week').startMs,
    );
    expect(h.showStatusbarHint).toHaveBeenCalledWith(
      'journal.carryOver.noPrevious',
      expect.objectContaining({ error: false }),
    );
  });

  it('der Befehl endet ohne Übertrag und ohne eigene Meldung, wenn der Eintrag nicht geöffnet wurde', async () => {
    api.journalsGetConfig.mockResolvedValue({
      ok: true,
      hasArea: true,
      config: { shelves: [], journals: [TAG] },
    });
    api.journalsStatEntry.mockResolvedValueOnce({ ok: false });
    await uebertrageOffeneAufgaben();
    expect(api.journalsUebertrageAufgaben).not.toHaveBeenCalled();
    expect(h.showStatusbarHint).toHaveBeenCalledTimes(1);
    expect(h.showStatusbarHint.mock.calls[0][0]).toBe('journal.createFailed');
  });
});
