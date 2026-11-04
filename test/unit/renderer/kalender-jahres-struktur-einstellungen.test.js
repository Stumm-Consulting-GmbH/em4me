// @vitest-environment jsdom
// 4T-002363 (Epic 3E-000333), Schritt 9: Einstellungen einer Zeitrechnung mit
// Jahres-Struktur. Beide Beziehungs-Arten (yearly am Jahr, byYear am Monat)
// reisen wörtlich durch den Entwurf; die Definition übersteht die drei
// Rundlauf-Wege — Entwurf und Anwenden, die Bereichsdatei, die Austausch-Datei —
// Zeichen für Zeichen. Monat und Jahr sind schreibgeschützt, Namen, Wochen und
// Zeitalter bearbeitbar; das Feld «Anker» bleibt ohne Anker-Datum leer, ein
// Hinweis nennt den Startpunkt. 4T-002446 (Epic 3E-000377): Als Bezug einer
// Ableitung steht eine solche Zeitrechnung zur Wahl (bis dahin B4 mit einem
// Hinweis, warum nicht); bei hebräischem Bezug erscheint die Wahl der
// Jahrestags-Regel, bei jedem Bezug mit Jahres-Struktur der Satz seiner Regel.
//
// Geprüft wird mit Probe-Tafel und Probe-Regel aus
// test/fixtures/kalender-jahres-struktur/ über den Prüf-Zugang der Schnittstelle,
// geholt über den CommonJS-Lader (Begründung in
// kalender-jahres-struktur-oberflaeche.test.js); die Fälle der Regel-Wahl
// nutzen die Regel und Tafeln des Programms mit den vier Vorlagen. Die
// Übersetzung ist eine Attrappe: Schlüssel, bei Platzhaltern samt Platzhalter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import './api-stub.js';
import probeRegel from '../../fixtures/kalender-jahres-struktur/probe-regel.js';
import probeTafel from '../../fixtures/kalender-jahres-struktur/probe-tafel.js';

const PLATZHALTER = {
  'settings.calendar.relYearlyRule': '{name}',
  'settings.calendar.relYearlyTable': '{name}',
  'settings.calendar.startPointHint': '{value}',
  'settings.calendar.derivedPreviewBase': '{name}: {value}',
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
const { findCalendarTemplate } = await import('../../../src/shared/calendar/calendar-templates.js');
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

// Formular einer Ableitung bauen; liefert die Werte der Bezugs-Auswahl und
// die Elemente der Regel-Wahl.
function ableitungsFormular(block) {
  document.body.innerHTML = '';
  const idx = block.calendars.findIndex((c) => c.derived);
  buildDerivedCalendarEditor(document.body, block, block.calendars[idx], idx);
  const el = (s) => document.getElementById(`settings-calsys-${s}-${idx}`);
  return {
    idx,
    el,
    werte: [...el('derived-base').options].map((o) => o.value),
    regel: el('derived-rule'),
    satz: el('derived-rule-hint'),
  };
}

describe('Ableitung: Zeitrechnungen mit Jahres-Struktur als Bezug (4T-002446, B4 aufgehoben)', () => {
  function bezugsAuswahl(sektion) {
    const config = normalisiert(sektion);
    return ableitungsFormular({
      id: 'b',
      name: 'Block',
      calendars: config.blocks[0].calendars.map(calendarToDraft),
    });
  }

  it('AK1: Tafel und Regel stehen zur Wahl, der Hinweis «Nicht als Bezug wählbar» fehlt', () => {
    const { werte, el } = bezugsAuswahl(rohSektion());
    expect(werte).toEqual(['', '@standard', 'greg', 'tafel', 'regel']);
    expect(el('derived-yearly')).toBeNull();
  });

  it('Schutz-Fall: ohne Jahres-Struktur alle eigenständigen zur Wahl, weder Regel-Wahl noch Satz', () => {
    const sektion = rohSektion();
    sektion.blocks[0].calendars.splice(1, 2);
    const { werte, el, regel, satz } = bezugsAuswahl(sektion);
    expect(werte).toEqual(['', '@standard', 'greg']);
    expect(el('derived-yearly')).toBeNull();
    expect(regel).toBeNull();
    expect(satz).toBeNull();
  });
});

describe('Ableitung: Regel-Wahl und Satz der Regel je Bezug (4T-002446, AK1 bis AK3)', () => {
  const VORLAGEN = ['hebrew', 'chinese', 'persian', 'islamic-umalqura'];
  // Nullpunkt je Bezug; hebräisch der 10. Adar 5783 (Gemeinjahr).
  const NULLPUNKT = {
    hebrew: [5783, 6, 10],
    chinese: [2025, 1, 1],
    persian: [1403, 1, 1],
    'islamic-umalqura': [1446, 1, 1],
    greg: [2023, 3, 1],
    '@standard': [2023, 3, 1],
  };
  const SATZ = {
    hebrew: 'settings.calendar.derivedRuleText.hebrewAnniversary',
    chinese: 'settings.calendar.derivedRuleText.chinese',
    persian: 'settings.calendar.derivedRuleText.persian',
    'islamic-umalqura': 'settings.calendar.derivedRuleText.umalqura',
  };

  // Block wie nach «Vorlage einfügen»: gregorianisch und die vier Vorlagen mit
  // Jahres-Struktur, dazu die Ableitung als Entwurf (Muster «hinzufügen»).
  function vorlagenBlock(fromId, rule) {
    const roh = {
      blocks: [
        {
          id: 'b',
          name: 'Block',
          calendars: [
            { ...createGregorianTemplate({}), id: 'greg', name: 'greg' },
            ...VORLAGEN.map((id) => ({
              ...findCalendarTemplate(id).create((k) => k),
              id,
              name: id,
            })),
          ],
        },
      ],
    };
    const block = { ...roh.blocks[0], calendars: normalisiert(roh).blocks[0].calendars };
    block.calendars = block.calendars.map(calendarToDraft);
    block.calendars.push({
      id: 'abl',
      name: 'abl',
      derived: {
        fromId,
        zeroSegs: NULLPUNKT[fromId].map(String),
        depth: '',
        labelBefore: 'v',
        labelAfter: 'n',
        ...(rule === undefined ? {} : { anniversaryRule: rule }),
      },
      previewInput: '1-0-1',
    });
    return block;
  }

  // Die Regel und Tafeln des Programms statt der Proben.
  beforeEach(() => setYearlySourcesForTests(null));

  it('AK1: die vier Vorlagen stehen in der Reihenfolge des Blocks zur Wahl', () => {
    const { werte } = ableitungsFormular(vorlagenBlock('hebrew'));
    expect(werte).toEqual(['', '@standard', 'greg', ...VORLAGEN]);
  });

  it.each(VORLAGEN)('AK2/AK3: Bezug %s — Satz der Regel, Regel-Wahl nur bei hebräisch', (id) => {
    const block = vorlagenBlock(id);
    const { regel, satz } = ableitungsFormular(block);
    expect(satz.textContent).toBe(SATZ[id]);
    expect(satz.className).toBe('settings-row-hint');
    const abl = block.calendars[block.calendars.length - 1];
    if (id !== 'hebrew') {
      expect(regel).toBeNull();
      expect(abl.derived.anniversaryRule).toBe('');
      return;
    }
    expect([...regel.options].map((o) => [o.value, o.textContent])).toEqual([
      ['anniversary', 'settings.calendar.derivedRuleAnniversary'],
      ['yahrzeit', 'settings.calendar.derivedRuleYahrzeit'],
    ]);
    expect(regel.value).toBe('anniversary');
    expect(abl.derived.anniversaryRule).toBe('anniversary');
    // Die Regel-Wahl steht unmittelbar unter der Bezugs-Auswahl, der Satz darunter.
    const zeilen = [...document.querySelectorAll('select, p.settings-row-hint')];
    const bezug = zeilen.findIndex((n) => n.id.startsWith('settings-calsys-derived-base-'));
    expect(zeilen[bezug + 1]).toBe(regel);
    expect(zeilen[bezug + 2]).toBe(satz);
  });

  it.each(['greg', '@standard'])('AK3: fester Bezug %s — weder Regel-Wahl noch Satz', (id) => {
    const { regel, satz } = ableitungsFormular(vorlagenBlock(id));
    expect(regel).toBeNull();
    expect(satz).toBeNull();
  });

  it('AK2: Wechsel auf «Jahrzeit» zeigt deren Satz und Jahrestag, Nullpunkt und Tiefe bleiben', () => {
    const block = vorlagenBlock('hebrew');
    const abl = block.calendars[block.calendars.length - 1];
    abl.derived.depth = '2';
    const { regel, satz, el } = ableitungsFormular(block);
    expect(el('preview').textContent).toContain('hebrew: 5784-06-10');
    regel.value = 'yahrzeit';
    regel.dispatchEvent(new Event('change'));
    expect(abl.derived.anniversaryRule).toBe('yahrzeit');
    expect(satz.textContent).toBe('settings.calendar.derivedRuleText.hebrewYahrzeit');
    expect(el('preview').textContent).toContain('hebrew: 5784-05L-10');
    expect(abl.derived.zeroSegs).toEqual(['5783', '6', '10']);
    expect(abl.derived.depth).toBe('2');
  });

  it('AK2: Bezugs-Wechsel — hebräisch mit Vorgabe «Jahrestag», jeder andere ohne Regel', () => {
    const block = vorlagenBlock('hebrew', 'yahrzeit');
    const abl = block.calendars[block.calendars.length - 1];
    const wechsel = (id) => {
      const auswahl = ableitungsFormular(block).el('derived-base');
      auswahl.value = id;
      auswahl.dispatchEvent(new Event('change'));
    };
    wechsel('persian');
    expect(abl.derived.anniversaryRule).toBe('');
    expect(calendarPersistForm(abl)).not.toHaveProperty('anniversaryRule');
    wechsel('hebrew');
    expect(abl.derived.anniversaryRule).toBe('anniversary');
    expect(ableitungsFormular(block).regel.value).toBe('anniversary');
  });

  it('AK2: Rundlauf Entwurf → Definition → Entwurf hält die Regel; ohne hebräischen Bezug kein Feld', () => {
    const rundlauf = (block) => {
      const abl = block.calendars[block.calendars.length - 1];
      const ablage = calendarConfigPersistForm({ blocks: [block] });
      const geladen = kalender(normalisiert(ablage), 'abl');
      expect(geladen).toBeTruthy();
      const zurueck = calendarToDraft(geladen);
      return { abl, ablage: calendarPersistForm(abl), geladen, zurueck };
    };
    const jahrzeit = vorlagenBlock('hebrew', 'yahrzeit');
    const h = rundlauf(jahrzeit);
    expect(h.ablage.anniversaryRule).toBe('yahrzeit');
    expect(h.geladen.derived.anniversaryRule).toBe('yahrzeit');
    expect(h.zurueck.derived.anniversaryRule).toBe('yahrzeit');
    expect(calendarPersistForm(h.zurueck)).toStrictEqual(h.ablage);
    // Eine Ablage ohne Feld lädt mit der Vorgabe «Jahrestag».
    const ohne = rundlauf(vorlagenBlock('hebrew', ''));
    expect(ohne.ablage).not.toHaveProperty('anniversaryRule');
    expect(ohne.zurueck.derived.anniversaryRule).toBe('anniversary');
    for (const id of ['persian', 'greg']) {
      const r = rundlauf(vorlagenBlock(id));
      expect(r.ablage).not.toHaveProperty('anniversaryRule');
      expect(r.geladen.derived).not.toHaveProperty('anniversaryRule');
      expect(r.zurueck.derived.anniversaryRule).toBe('');
    }
  });
});
