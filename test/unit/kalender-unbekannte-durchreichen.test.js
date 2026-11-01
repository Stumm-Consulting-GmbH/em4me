// 4T-002361 (Epic 3E-000371): Eine Programmfassung, die eine Zeitrechnung oder
// ein Feld nicht kennt, lässt es beim Schreiben der Kalender-Sektion stehen,
// statt es still aus der Bereichsdatei zu löschen.
//
// Gemessen wird am echten Schreiber (writeAreaCalendarConfig) an einer echten
// Bereichsdatei in einem Wegwerf-Ordner, auf dem Weg der Einstellungen: lesen,
// normalisieren wie der Lese-Handler, eine andere Zeitrechnung ändern,
// zurückschreiben. Dazu der zweite Schreibweg (Einlesen einer Austausch-Datei)
// und der Lese-Handler mit seiner Zählung. Eine ältere Fassung, der die
// Jahres-Struktur fehlt, wird über eine ausgeschnittene Normalisierung
// nachgestellt, damit der Fall ohne zweite Programmfassung läuft.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAreaConfig } from '../../src/main/area/area-config.js';
import mddStore from '../../src/main/documents/mdd-store.js';
import { registerAreaFeaturesIpc } from '../../src/main/ipc/area-features.js';
import { normalizeCalendarConfig } from '../../src/shared/calendar/calendar-config.js';
import { findCalendarTemplate } from '../../src/shared/calendar/calendar-templates.js';
import {
  unbekannteDurchreichen,
  verborgeneEintraege,
} from '../../src/shared/calendar/calendar-passthrough.js';
import { collectDataKinds } from '../../src/shared/exchange-collect.js';
import { planeUebernahme } from '../../src/shared/exchange-merge.js';

const t = (k) => k;
const tief = (v) => JSON.parse(JSON.stringify(v));

// Eine Zeitrechnung aus einer mitgelieferten Vorlage, unter eigener Kennung.
function vorlage(vorlageId, id, name) {
  const def = findCalendarTemplate(vorlageId).create(t);
  return tief({ ...def, id, name });
}

// Unbekannte Beziehungs-Art an der ersten Ebene mit Beziehung.
function mitKuenftigerArt(id, name) {
  const cal = vorlage('julian', id, name);
  const i = cal.levels.findIndex((l) => l.rel);
  cal.levels[i].rel = { type: 'kuenftige-art', x: 1 };
  return cal;
}

let ordner = [];
afterEach(() => {
  for (const dir of ordner) fs.rmSync(dir, { recursive: true, force: true });
  ordner = [];
});

function bereichMit(sektion, weitere = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-4t2361-'));
  ordner.push(dir);
  const c = mddStore.emptySettingsContainer();
  c.settings.calendarSystems = sektion;
  Object.assign(c.settings, weitere);
  fs.writeFileSync(path.join(dir, mddStore.MDDA_FILENAME), mddStore.serializeContainer(c), 'utf8');
  return dir;
}

function schreiber() {
  return createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: vi.fn(),
    mddStore,
    attachmentPath: {},
    resolveTemplatesConfig: () => ({}),
  });
}

function dateiInhalt(dir) {
  const text = fs.readFileSync(path.join(dir, mddStore.MDDA_FILENAME), 'utf8');
  return mddStore.parseSettingsContainer(text).container.settings;
}

// Der Weg der Einstellungen: lesen, wie der Lese-Handler normalisieren, eine
// Änderung, zurückschreiben über den echten Schreiber.
async function anwenden(dir, aendere) {
  const api = schreiber();
  const gesehen = normalizeCalendarConfig(await api.readAreaCalendarConfig(dir));
  aendere(gesehen);
  const ergebnis = await api.writeAreaCalendarConfig(dir, gesehen);
  expect(ergebnis.ok, ergebnis.error).toBe(true);
  return { gesehen, nachher: dateiInhalt(dir).calendarSystems };
}

const umbenennen = (id, name) => (cfg) => {
  cfg.blocks[0].calendars.find((k) => k.id === id).name = name;
};

describe('Durchreichen am echten Schreiber (4T-002361, AK2)', () => {
  it('lässt eine Zeitrechnung mit unbekannter Beziehungs-Art und ein unbekanntes Feld stehen', async () => {
    const bekannt = { ...vorlage('julian', 'bekannt', 'Bekannt'), zukunftsFeld: 'bleibt' };
    const unbekannt = mitKuenftigerArt('neuere-fassung', 'Neuere Fassung');
    const dir = bereichMit(
      {
        blocks: [
          { id: 'b', name: 'B', calendars: [bekannt, unbekannt, vorlage('julian', 'andere', 'A')] },
        ],
      },
      { fremdeSektion: { soll: 'bleiben' } },
    );
    const { gesehen, nachher } = await anwenden(dir, umbenennen('andere', 'Andere umbenannt'));
    // Die Oberfläche sieht weiterhin nur, was sie darstellen kann (4S-000380, AK3).
    expect(gesehen.blocks[0].calendars.map((k) => k.id)).toEqual(['bekannt', 'andere']);
    const kal = nachher.blocks[0].calendars;
    expect(kal.map((k) => k.id)).toEqual(['bekannt', 'neuere-fassung', 'andere']);
    expect(kal[0].zukunftsFeld).toBe('bleibt');
    expect(kal[1]).toEqual(unbekannt);
    expect(kal[2].name).toBe('Andere umbenannt');
    expect(dateiInhalt(dir).fremdeSektion).toEqual({ soll: 'bleiben' });
  });

  it('lässt eine Zeitrechnung mit unbekannter Jahres-Struktur stehen', async () => {
    const kuenftig = vorlage('hebrew', 'kuenftig', 'Künftig');
    kuenftig.levels.at(-1).rel = { type: 'yearly', rule: 'kuenftige-regel' };
    const dir = bereichMit({
      blocks: [{ id: 'b', name: 'B', calendars: [vorlage('julian', 'andere', 'A'), kuenftig] }],
    });
    const { nachher } = await anwenden(dir, umbenennen('andere', 'Andere umbenannt'));
    expect(nachher.blocks[0].calendars.map((k) => k.id)).toEqual(['andere', 'kuenftig']);
    expect(nachher.blocks[0].calendars[1]).toEqual(kuenftig);
  });

  it('lässt die Jahres-Struktur des heutigen Codes unverändert, ohne Anker-Datum (beide Richtungen)', async () => {
    const api = schreiber();
    const dir = bereichMit(null);
    const roh = {
      blocks: [
        {
          id: 'b',
          name: 'B',
          calendars: [vorlage('hebrew', 'hebr', 'H'), vorlage('julian', 'andere', 'A')],
        },
      ],
    };
    await api.writeAreaCalendarConfig(dir, normalizeCalendarConfig(roh));
    const vorher = dateiInhalt(dir).calendarSystems;
    expect('blockAnchor' in vorher.blocks[0].calendars[0]).toBe(false);
    // Richtung 1: Der heutige Code kennt die Jahres-Struktur — sie bleibt Zeichen
    // für Zeichen, das Durchreichen fügt nichts hinzu.
    const { nachher } = await anwenden(dir, umbenennen('andere', 'Andere umbenannt'));
    expect(nachher.blocks[0].calendars[0]).toEqual(vorher.blocks[0].calendars[0]);
    // Richtung 2: Eine Fassung ohne Jahres-Struktur (ausgeschnittene Normalisierung)
    // sieht sie nicht und reicht sie unverändert durch.
    const ohneJahr = (cfg) => {
      const n = normalizeCalendarConfig(cfg);
      const neu = (c) => c.levels.some((l) => l.rel && ['yearly', 'byYear'].includes(l.rel.type));
      if (n) for (const b of n.blocks) b.calendars = b.calendars.filter((c) => !neu(c));
      return n;
    };
    const gesehen = ohneJahr(vorher);
    expect(gesehen.blocks[0].calendars.map((k) => k.id)).toEqual(['andere']);
    gesehen.blocks[0].calendars[0].name = 'Wieder anders';
    const ergebnis = unbekannteDurchreichen(vorher, gesehen, ohneJahr);
    expect(ergebnis.blocks[0].calendars.map((k) => k.id)).toEqual(['hebr', 'andere']);
    expect(ergebnis.blocks[0].calendars[0]).toEqual(vorher.blocks[0].calendars[0]);
    expect(verborgeneEintraege(vorher, ohneJahr).anzahl).toBe(1);
  });

  it('erhält unbekannte Felder an Ebene und Beziehung gleichen Typs, nicht bei anderem Typ', async () => {
    // Minimale Zeitrechnung: Tag und Woche zu sieben Tagen.
    const cal = {
      id: 'j',
      name: 'J',
      levels: [{ id: 'tag' }, { id: 'woche', rel: { type: 'factor', count: 7 } }],
    };
    const i = 1;
    cal.levels[i].ebenenFeld = 1;
    cal.levels[i].rel.relFeld = 2;
    const dir = bereichMit({
      blocks: [{ id: 'b', name: 'B', blockFeld: 3, calendars: [cal] }],
      wurzelFeld: 4,
    });
    const { nachher } = await anwenden(dir, umbenennen('j', 'J2'));
    const lv = nachher.blocks[0].calendars[0].levels[i];
    expect([
      lv.ebenenFeld,
      lv.rel.relFeld,
      nachher.blocks[0].blockFeld,
      nachher.wurzelFeld,
    ]).toEqual([1, 2, 3, 4]);
    // Wechselt die Oberfläche die Beziehungs-Art, gehört das alte Feld nicht dazu.
    const { nachher: n2 } = await anwenden(dir, (cfg) => {
      cfg.blocks[0].calendars[0].levels[i].rel = {
        type: 'lengths',
        table: [cal.levels[i].rel.count],
      };
    });
    expect(n2.blocks[0].calendars[0].levels[i].rel).toEqual({
      type: 'lengths',
      table: [cal.levels[i].rel.count],
    });
  });

  it('löscht, was die Oberfläche kannte und weglässt, und reiht Verborgenes an seiner Stelle ein', async () => {
    const vorn = mitKuenftigerArt('vorn', 'Vorn');
    const mitte = mitKuenftigerArt('mitte', 'Mitte');
    const dir = bereichMit({
      blocks: [
        {
          id: 'b',
          name: 'B',
          calendars: [
            vorn,
            vorlage('julian', 'eins', '1'),
            vorlage('julian', 'zwei', '2'),
            mitte,
            vorlage('julian', 'drei', '3'),
          ],
        },
        { id: 'weg', name: 'Weg', calendars: [mitKuenftigerArt('mit-block-weg', 'X')] },
      ],
    });
    const { nachher } = await anwenden(dir, (cfg) => {
      cfg.blocks[0].calendars = cfg.blocks[0].calendars.filter((k) => k.id !== 'zwei');
      cfg.blocks = cfg.blocks.filter((b) => b.id !== 'weg');
    });
    // «zwei» gelöscht; «mitte» rückt hinter «eins», den nächsten verbliebenen
    // Vorgänger; der gelöschte Block nimmt seine verborgene Zeitrechnung mit.
    expect(nachher.blocks.map((b) => b.id)).toEqual(['b']);
    expect(nachher.blocks[0].calendars.map((k) => k.id)).toEqual(['vorn', 'eins', 'mitte', 'drei']);
  });

  it('behält einen verborgenen Block, wenn die Oberfläche alle Blöcke entfernt', async () => {
    const verborgen = { id: 7, name: 'Kennung als Zahl', calendars: [vorlage('julian', 'k', 'K')] };
    const dir = bereichMit({ blocks: [{ id: 'b', name: 'B', calendars: [] }, verborgen] });
    const api = schreiber();
    expect((await api.writeAreaCalendarConfig(dir, null)).ok).toBe(true);
    expect(dateiInhalt(dir).calendarSystems).toEqual({ blocks: [verborgen] });
    // Ohne Verborgenes entfällt die Sektion wie bisher.
    const leer = bereichMit({ blocks: [{ id: 'b', name: 'B', calendars: [] }] });
    await api.writeAreaCalendarConfig(leer, null);
    expect('calendarSystems' in dateiInhalt(leer)).toBe(false);
  });
});

describe('Zweiter Schreibweg: Einlesen einer Austausch-Datei (4T-002361, AK2)', () => {
  it('lässt eine unbekannte Zeitrechnung des Bereichs stehen, wenn ein Block ergänzt wird', async () => {
    const unbekannt = mitKuenftigerArt('neuere-fassung', 'Neuere Fassung');
    const bestand = {
      blocks: [{ id: 'b', name: 'B', calendars: [vorlage('julian', 'eigen', 'Eigen'), unbekannt] }],
    };
    const dir = bereichMit(bestand);
    const api = schreiber();
    const gesammelt = await collectDataKinds({
      readPath: () => undefined,
      readAreaSection: (s) =>
        s === 'calendarSystems' ? api.readAreaCalendarConfig(dir) : undefined,
    });
    const neuerBlock = { id: 'neu', name: 'Neu', calendars: [vorlage('julian', 'fremd', 'Fremd')] };
    const plan = planeUebernahme(gesammelt, [
      { name: 'calendarSystems', value: { calendarSystems: { blocks: [neuerBlock] } } },
    ]);
    const eintrag = plan.kinds.find((k) => k.id === 'calendarSystems');
    expect(eintrag.action).not.toBe('skip');
    // Derselbe Aufruf wie in src/main/ipc/exchange.js beim Einlesen.
    const ergebnis = await api.writeAreaCalendarConfig(dir, eintrag.values.calendarSystems);
    expect(ergebnis.ok).toBe(true);
    const nachher = dateiInhalt(dir).calendarSystems;
    expect(nachher.blocks.map((b) => b.id)).toEqual(['b', 'neu']);
    expect(nachher.blocks[0].calendars.map((k) => k.id)).toEqual(['eigen', 'neuere-fassung']);
    expect(nachher.blocks[0].calendars[1]).toEqual(unbekannt);
  });
});

describe('Lese-Handler der Kalender-Einstellungen (4T-002361, Entscheidung F3)', () => {
  async function getConfig(roh) {
    const kanaele = new Map();
    registerAreaFeaturesIpc((name, fn) => kanaele.set(name, fn), {
      senderWindow: () => ({}),
      areaOfWindow: () => ({ name: 'Welt', rootPath: 'X:/welt' }),
      broadcast: () => {},
      mddStore,
      readAreaJournalsConfig: async () => undefined,
      readAreaCalendarConfig: async () => roh,
      writeAreaCalendarConfig: async () => ({ ok: true }),
      readAreaSidebarVariantsConfig: async () => undefined,
      readAreaBookmarksConfig: async () => undefined,
    });
    return kanaele.get('calendar:getConfig')({});
  }

  it('meldet die Zahl und die Kennungen der Zeitrechnungen, die die Normalisierung nicht besteht', async () => {
    const res = await getConfig({
      blocks: [
        {
          id: 'b',
          name: 'B',
          calendars: [
            vorlage('julian', 'j', 'J'),
            mitKuenftigerArt('n1', 'N1'),
            mitKuenftigerArt('n2', 'N2'),
          ],
        },
        { id: 5, name: 'Verborgen', calendars: [vorlage('julian', 'v', 'V')] },
      ],
    });
    expect(res.config.blocks[0].calendars.map((k) => k.id)).toEqual(['j']);
    expect(res.hiddenCalendars).toBe(3);
    expect(res.reservedIds).toEqual({ blocks: [], calendars: { b: ['n1', 'n2'] } });
  });

  it('meldet null ohne Verborgenes und ohne Sektion', async () => {
    expect(
      (
        await getConfig({
          blocks: [{ id: 'b', name: 'B', calendars: [vorlage('julian', 'j', 'J')] }],
        })
      ).hiddenCalendars,
    ).toBe(0);
    expect((await getConfig(undefined)).hiddenCalendars).toBe(0);
  });
});
