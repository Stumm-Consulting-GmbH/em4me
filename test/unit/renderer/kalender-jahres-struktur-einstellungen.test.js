// @vitest-environment jsdom
// 4T-002363 (Epic 3E-000333), Schritt 9: Einstellungen einer Zeitrechnung mit
// Jahres-Struktur. Beide Beziehungs-Arten (yearly am Jahr, byYear am Monat)
// reisen wörtlich durch den Entwurf; die Definition übersteht die drei
// Rundlauf-Wege — Entwurf und Anwenden, die Bereichsdatei, die Austausch-Datei —
// Zeichen für Zeichen. Monat und Jahr sind schreibgeschützt, Namen, Wochen und
// Zeitalter bearbeitbar; das Feld «Anker» bleibt ohne Anker-Datum leer, ein
// Hinweis nennt den Startpunkt; als Bezug einer Ableitung steht eine solche
// Zeitrechnung nicht zur Wahl, ein Hinweis sagt, warum (B4).
//
// Geprüft wird mit Probe-Tafel und Probe-Regel aus
// test/fixtures/kalender-jahres-struktur/ über den Prüf-Zugang der Schnittstelle,
// geholt über den CommonJS-Lader (Begründung in
// kalender-jahres-struktur-oberflaeche.test.js). Die Übersetzung ist eine
// Attrappe: Schlüssel, bei Platzhaltern samt Platzhalter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import './api-stub.js';
import probeRegel from '../../fixtures/kalender-jahres-struktur/probe-regel.js';
import probeTafel from '../../fixtures/kalender-jahres-struktur/probe-tafel.js';

const PLATZHALTER = {
  'settings.calendar.relYearlyRule': '{name}',
  'settings.calendar.relYearlyTable': '{name}',
  'settings.calendar.startPointHint': '{value}',
  'settings.calendar.derivedBaseYearlyHint': '{names}',
};
vi.mock('../../../src/renderer/i18n.js', async (importOriginal) => ({
  ...(await importOriginal()),
  t: (key) => (PLATZHALTER[key] ? `${key} ${PLATZHALTER[key]}` : key),
}));

const require = createRequire(import.meta.url);
const { setYearlySourcesForTests } = require('../../../src/shared/calendar/calendar-yearly.js');
const mddStore = require('../../../src/main/documents/mdd-store.js');
const { calendarStartPoint, configForPersist, normalizeCalendarConfig } =
  await import('../../../src/shared/calendar/calendar-config.js');
const { formatTuple } = await import('../../../src/shared/calendar/calendar-core.js');
const { createGregorianTemplate } =
  await import('../../../src/shared/calendar/calendar-template.js');
const { istVollstaendigerKalenderBlock } =
  await import('../../../src/shared/exchange-data-kinds.js');
const { collectDataKinds, buildExchangeSections } =
  await import('../../../src/shared/exchange-collect.js');
const { writeExchangeFile, readExchangeFile } =
  await import('../../../src/shared/exchange-file.js');
const { calendarToDraft, calendarPersistForm, calendarConfigPersistForm, calSysHasYearly } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { applyCalendarSection } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');
const { buildCalendarEditor } =
  await import('../../../src/renderer/modules/settings/settings-calendar-editor.js');
const { buildDerivedCalendarEditor } =
  await import('../../../src/renderer/modules/settings/settings-calendar-derived.js');

// --- Zeitrechnungen -------------------------------------------------------------

const NAMEN = [
  ...Array.from({ length: 12 }, (_, i) => `M${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `S${i + 1}`),
];

// Zeitrechnung mit Jahres-Struktur, wie sie in der Sektion calendarSystems
// steht: ohne Anker-Datum, mit Woche und Zeitalter.
function mitJahresStruktur(id, jahresRel) {
  return {
    id,
    name: id,
    levels: [
      { id: 'second', name: 'Sekunde', section: 'Zeit', start: 0 },
      {
        id: 'minute',
        name: 'Minute',
        section: 'Zeit',
        start: 0,
        rel: { type: 'factor', count: 60 },
      },
      { id: 'hour', name: 'Stunde', section: 'Zeit', start: 0, rel: { type: 'factor', count: 60 } },
      { id: 'day', name: 'Tag', section: 'Datum', start: 1, rel: { type: 'factor', count: 24 } },
      {
        id: 'month',
        name: 'Monat',
        section: 'Datum',
        start: 1,
        names: NAMEN,
        rel: { type: 'byYear' },
      },
      { id: 'year', name: 'Jahr', section: 'Datum', start: 1, rel: jahresRel },
    ],
    cycles: [{ id: 'woche', name: 'Woche', of: 'day', length: 7 }],
    epochs: [
      { name: 'vorher', abbr: 'v', start: null },
      { name: 'Ära', abbr: 'Ä', start: [1, 1, 1] },
    ],
    blockScale: { num: 1, den: 1 },
  };
}

const TAFEL = { type: 'yearly', table: 'probe' };
const REGEL = { type: 'yearly', rule: 'probe' };

// Roh-Sektion: gregorianisch, Tafel, Regel und eine Ableitung auf der
// gregorianischen Zeitrechnung (deren kurze Roh-Form die Ablage behält).
function rohSektion() {
  return {
    blocks: [
      {
        id: 'b',
        name: 'Block',
        calendars: [
          { ...createGregorianTemplate({}), id: 'greg', name: 'greg' },
          mitJahresStruktur('tafel', TAFEL),
          mitJahresStruktur('regel', REGEL),
          { id: 'ab', name: 'ab', derivedFrom: 'greg', zero: [1904, 3, 15] },
        ],
      },
    ],
  };
}

const normalisiert = (sektion) => normalizeCalendarConfig(sektion);
const kalender = (config, id) => config.blocks[0].calendars.find((c) => c.id === id);
const einzeln = (definition) =>
  normalizeCalendarConfig({ blocks: [{ id: 'w', calendars: [definition] }] }).blocks[0]
    .calendars[0];

beforeEach(() => {
  setYearlySourcesForTests({ rules: { probe: probeRegel }, tables: { probe: probeTafel } });
  document.body.innerHTML = '';
});

afterEach(() => setYearlySourcesForTests(null));

// --- Rundlauf -------------------------------------------------------------------

describe('Rundlauf einer Zeitrechnung mit Jahres-Struktur (4T-002363, Schritt 9, AK8)', () => {
  it.each([
    ['Tafel', 'tafel'],
    ['Regel', 'regel'],
  ])('Entwurf: %s kommt Zeichen für Zeichen zurück, beide Beziehungs-Arten wörtlich', (_, id) => {
    const cal = kalender(normalisiert(rohSektion()), id);
    expect(cal.blockAnchor).toBeUndefined();
    const ablage = calendarPersistForm(calendarToDraft(cal));
    expect(ablage.levels[5].rel).toEqual(id === 'tafel' ? TAFEL : REGEL);
    expect(ablage.levels[4].rel).toEqual({ type: 'byYear' });
    expect(ablage).not.toHaveProperty('blockAnchor');
    expect(JSON.stringify(einzeln(ablage))).toBe(JSON.stringify(cal));
    // Ein zweiter Rundlauf ändert die Ablage nicht mehr.
    expect(calendarPersistForm(calendarToDraft(einzeln(ablage)))).toStrictEqual(ablage);
  });

  it('Bereichsdatei: speichern, einlesen und erneut speichern ergibt dieselbe Datei', () => {
    const speichere = (roh) => {
      const container = mddStore.emptySettingsContainer();
      container.settings.calendarSystems = configForPersist(roh, normalizeCalendarConfig(roh));
      return mddStore.serializeContainer(container);
    };
    const erste = speichere(rohSektion());
    const gelesen = mddStore.parseSettingsContainer(erste);
    expect(gelesen.ok).toBe(true);
    const sektion = gelesen.container.settings.calendarSystems;
    expect(sektion.blocks[0].calendars.map((c) => c.id)).toEqual(['greg', 'tafel', 'regel', 'ab']);
    // Die Datei nennt Regel und Tafel beim Namen, nie ihren Inhalt (B3).
    expect(erste).toContain('"table": "probe"');
    expect(erste).not.toContain(probeTafel.jahre[1]);
    expect(speichere(sektion)).toBe(erste);
  });

  it('Austausch-Datei: ein Block mit Jahres-Struktur reist vollständig und unverändert', async () => {
    const roh = rohSektion();
    const gesammelt = await collectDataKinds({
      readPath: () => undefined,
      readAreaSection: (name) => (name === 'calendarSystems' ? roh : undefined),
    });
    const gebaut = buildExchangeSections(gesammelt, [{ id: 'calendarSystems', entries: ['b'] }]);
    expect(gebaut.ok).toBe(true);
    const datei = writeExchangeFile({ kind: 'setup', sections: gebaut.sections });
    const gelesen = readExchangeFile(datei.text);
    expect(gelesen.ok).toBe(true);
    const block = gelesen.sections[0].value.calendarSystems.blocks[0];
    expect(istVollstaendigerKalenderBlock(block)).toBe(true);
    expect(JSON.stringify(normalisiert({ blocks: [block] }))).toBe(
      JSON.stringify(normalisiert(roh)),
    );
  });

  it('Entwurf und Anwenden: ein geänderter Ebenen-Name ändert allein ihn', async () => {
    const config = normalisiert(rohSektion());
    const values = {
      hasArea: true,
      blocks: [
        { id: 'b', name: 'Block', calendars: config.blocks[0].calendars.map(calendarToDraft) },
      ],
    };
    const draft = { calendar: values, calendarSnapshot: calendarConfigPersistForm(values) };
    window.api.calendarConfirmDependents = vi.fn(async () => true);
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    // Unverändert angewendet, wird nichts geschrieben.
    await applyCalendarSection(draft);
    expect(window.api.calendarSetAreaConfig).not.toHaveBeenCalled();
    values.blocks[0].calendars[1].levels[4].name = 'Mond';
    await applyCalendarSection(draft);
    expect(window.api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
    const geschrieben = normalisiert(window.api.calendarSetAreaConfig.mock.calls[0][0]);
    const vorher = kalender(config, 'tafel');
    const nachher = kalender(geschrieben, 'tafel');
    expect(nachher.levels[4].name).toBe('Mond');
    nachher.levels[4].name = vorher.levels[4].name;
    expect(JSON.stringify(nachher)).toBe(JSON.stringify(vorher));
  });
});

// --- Pflege ---------------------------------------------------------------------

describe('Pflege einer Zeitrechnung mit Jahres-Struktur (4T-002363, Schritt 9, AK8)', () => {
  function editor(id) {
    const config = normalisiert(rohSektion());
    const block = {
      id: 'b',
      name: 'Block',
      calendars: config.blocks[0].calendars.map(calendarToDraft),
    };
    const idx = block.calendars.findIndex((c) => c.id === id);
    buildCalendarEditor(document.body, block, block.calendars[idx], idx);
    return { config, idx, el: (s) => document.getElementById(s) };
  }

  it('Monat und Jahr schreibgeschützt mit Auskunft, Name und übrige Ebenen bearbeitbar', () => {
    const { idx, el } = editor('tafel');
    const ebene = (n, teil) => el(`settings-calsys-level-${idx}-${n}-${teil}`);
    for (const n of [4, 5]) {
      expect(ebene(n, 'type')).toBeNull();
      expect(ebene(n, 'section').disabled).toBe(true);
      expect(ebene(n, 'start').disabled).toBe(true);
      expect(ebene(n, 'remove').disabled).toBe(true);
      expect(ebene(n, 'up').disabled).toBe(true);
      expect(ebene(n, 'down').disabled).toBe(true);
      expect(ebene(n, 'name').disabled).toBe(false);
    }
    expect(ebene(4, 'yearly').textContent).toBe('settings.calendar.relByYear');
    expect(ebene(5, 'yearly').textContent).toBe('settings.calendar.relYearlyTable probe');
    // Der Tag lässt sich nicht über den Monat schieben, wohl aber unter sich.
    expect(ebene(3, 'down').disabled).toBe(true);
    expect(ebene(3, 'up').disabled).toBe(false);
    expect(ebene(3, 'type').value).toBe('factor');
    expect(el(`settings-calsys-level-add-${idx}`).disabled).toBe(true);
    expect(el(`settings-calsys-yearly-hint-${idx}`).textContent).toBe(
      'settings.calendar.yearlyReadOnlyHint',
    );
    // Woche und Zeitalter bleiben bearbeitbar.
    expect(el(`settings-calsys-cycle-${idx}-0-length`).disabled).toBe(false);
    expect(el(`settings-calsys-epoch-${idx}-1-name`).disabled).toBe(false);
  });

  it('Feld «Anker» leer, Hinweis nennt den Startpunkt; ein eingetragener Anker blendet ihn aus', () => {
    const { config, idx, el } = editor('tafel');
    const tafel = kalender(config, 'tafel');
    for (let i = 0; i < 6; i++) expect(el(`settings-calsys-anchor-${idx}-${i}`).value).toBe('');
    const hinweis = el(`settings-calsys-start-hint-${idx}`);
    const start = formatTuple(tafel, calendarStartPoint(tafel), { named: true });
    expect(start.startsWith('4700-M1-01')).toBe(true);
    expect(hinweis.hidden).toBe(false);
    expect(hinweis.textContent).toBe(`settings.calendar.startPointHint ${start}`);
    const feld = el(`settings-calsys-anchor-${idx}-0`);
    feld.value = '4701';
    feld.dispatchEvent(new Event('input'));
    expect(hinweis.hidden).toBe(true);
  });

  it('Schutz-Fall: eine Zeitrechnung ohne Jahres-Struktur bleibt voll bearbeitbar', () => {
    const { idx, el } = editor('greg');
    expect(el(`settings-calsys-yearly-hint-${idx}`)).toBeNull();
    expect(el(`settings-calsys-level-add-${idx}`).disabled).toBe(false);
    expect(el(`settings-calsys-level-${idx}-4-type`).value).toBe('lengths');
    expect(el(`settings-calsys-level-${idx}-5-remove`).disabled).toBe(false);
    expect(el(`settings-calsys-start-hint-${idx}`).hidden).toBe(true);
    expect(calSysHasYearly(calendarToDraft(kalender(normalisiert(rohSektion()), 'greg')))).toBe(
      false,
    );
  });
});

describe('Ableitung: keine Zeitrechnung mit Jahres-Struktur als Bezug (4T-002363, B4, AK14)', () => {
  function bezugsAuswahl(sektion) {
    const config = normalisiert(sektion);
    const block = {
      id: 'b',
      name: 'Block',
      calendars: config.blocks[0].calendars.map(calendarToDraft),
    };
    const idx = block.calendars.findIndex((c) => c.derived);
    buildDerivedCalendarEditor(document.body, block, block.calendars[idx], idx);
    const optionen = [...document.getElementById(`settings-calsys-derived-base-${idx}`).options];
    const hinweis = document.getElementById(`settings-calsys-derived-yearly-${idx}`);
    return { werte: optionen.map((o) => o.value), hinweis };
  }

  it('Tafel und Regel stehen nicht zur Wahl, der Hinweis nennt beide', () => {
    const { werte, hinweis } = bezugsAuswahl(rohSektion());
    expect(werte).toEqual(['', '@standard', 'greg']);
    expect(hinweis.textContent).toBe('settings.calendar.derivedBaseYearlyHint tafel, regel');
  });

  it('Schutz-Fall: ohne Jahres-Struktur im Block kein Hinweis, alle eigenständigen zur Wahl', () => {
    const sektion = rohSektion();
    sektion.blocks[0].calendars.splice(1, 2);
    const { werte, hinweis } = bezugsAuswahl(sektion);
    expect(werte).toEqual(['', '@standard', 'greg']);
    expect(hinweis).toBeNull();
  });
});
