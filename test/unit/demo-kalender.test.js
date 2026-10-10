// 4T-001735 (Epic 3E-000307): Wächter über die Kalender-Sektion der
// mitgelieferten Beispiel-Sammlung (`src/demo/Area_Settings.mdda`) und die
// Seite «14 Calendar Systems.md», die Werte in ihren beiden Kalendern schreibt.
//
// Warum ein eigener Prüffall: Die Sektion ist eine Abschrift der Vorlagen
// «Gregorian calendar» und «Japanese calendar» zum Zeitpunkt ihrer Erzeugung.
// Ändert sich eine Vorlage — eine neue japanische Ära, eine berichtigte
// Schalt-Regel, eine geänderte Übersetzung —, bliebe die Abschrift still auf
// dem alten Stand, und die Sammlung zeigte eine andere Zeitrechnung als die,
// die der Anwender über das Aufklapp-Menü der Vorlagen bekommt. Verglichen wird
// deshalb über dieselben Bausteine, mit denen die Anwendung anlegt und ablegt
// (Vorlagen-Sammlung, Normalisierung, Ablage-Form), nicht gegen eine zweite
// Kopie der Definition.
//
// Gelesen wird die Sektion mit dem Leser der Anwendung, gerendert mit der
// Markdown-Kette der Anwendung, genau so, wie der Demo-Bereich sie nach dem
// Anlegen bekommt: Die Anlage kopiert die Bereichsdatei Byte für Byte
// (createDemoAreaAt, Nachweis im Manifest-Wächter demo-area.test.js).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../../src/i18n/en.json';
import { createAreaConfig } from '../../src/main/area/area-config.js';
import mddStore from '../../src/main/documents/mdd-store.js';
import { CALENDAR_TEMPLATES } from '../../src/shared/calendar/calendar-templates.js';
import {
  configForPersist,
  normalizeCalendarConfig,
} from '../../src/shared/calendar/calendar-config.js';
import {
  convertInBlock,
  formatTuple,
  parseCanonical,
} from '../../src/shared/calendar/calendar-core.js';
import {
  configureExtensions,
  renderMarkdown,
  setCalendarConfig,
} from '../../src/shared/markdown/markdown.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(HERE, '..', '..', 'src', 'demo');
const SEITE = path.join(DEMO_DIR, '14 Calendar Systems.md');

const NEU_ERZEUGEN =
  `Die Kalender-Sektion von src/demo/Area_Settings.mdda entspricht nicht mehr dem, was die ` +
  `mitgelieferten Vorlagen heute in englischer Sprache erzeugen (geänderte Vorlage, neue Ära, ` +
  `geänderte Übersetzung oder Änderung von Hand). Neu erzeugen mit ` +
  `«node scripts/demo-kalender-erzeugen.js», danach die Werte in «14 Calendar Systems.md» ` +
  `gegen die Erwartung unten in diesem Wächter prüfen.`;

// Übersetzung der englischen Fassung, wie die Vorlagen sie im englischen
// Fenster bekommen; ein fehlender Schlüssel bricht ab.
const t = (key) => {
  if (!(key in en)) throw new Error(`Schlüssel fehlt in der englischen Fassung: ${key}`);
  return en[key];
};

// Die beiden Kalender der Sammlung, in der Reihenfolge des Blocks.
const ERWARTETE_VORLAGEN = ['gregorian', 'japanese'];

// Die Werte der Seite: je Zeile derselbe Tag in beiden Kalendern, dazu die
// erwartete Anzeige des Abzeichens (Monat ausgeschrieben, Ära immer dabei).
const PAARE = [
  {
    gregorian: '2026-09-30',
    japanese: '8-09-30 Reiwa',
    anzeige: ['2026-September-30', '8-September-30 Reiwa'],
  },
  {
    gregorian: '2019-05-01',
    japanese: '1-05-01 Reiwa',
    anzeige: ['2019-May-01', '1-May-01 Reiwa'],
  },
  {
    gregorian: '2019-04-30',
    japanese: '31-04-30 Heisei',
    anzeige: ['2019-April-30', '31-April-30 Heisei'],
  },
];

const vorlageZuName = (name) => CALENDAR_TEMPLATES.find((e) => t(e.nameKey) === name) || null;

let container;
let gespeichert;

beforeAll(async () => {
  const roh = fs.readFileSync(path.join(DEMO_DIR, mddStore.MDDA_FILENAME), 'utf8');
  const gelesen = mddStore.parseSettingsContainer(roh);
  expect(gelesen.ok, gelesen.error).toBe(true);
  container = gelesen.container;
  const areaConfig = createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: () => {},
    mddStore,
  });
  gespeichert = await areaConfig.readAreaCalendarConfig(DEMO_DIR);
});

afterEach(() => {
  configureExtensions([]);
  setCalendarConfig(null);
});

describe('Demo-Area: Kalender-Sektion gegen die Vorlagen (4T-001735)', () => {
  it('die Bereichsdatei trägt neben der Start-Seite genau die Kalender-Sektion', () => {
    expect(Object.keys(container.settings).sort()).toEqual(['calendarSystems', 'startPage']);
    expect(container.settings.startPage).toBe('00 Welcome.md');
  });

  it('ein Block mit dem gregorianischen und dem japanischen Kalender, benannt wie die englischen Vorlagen', () => {
    expect(gespeichert.blocks).toHaveLength(1);
    const namen = gespeichert.blocks[0].calendars.map((c) => c.name);
    const erwartet = ERWARTETE_VORLAGEN.map((id) =>
      t(CALENDAR_TEMPLATES.find((e) => e.id === id).nameKey),
    );
    expect(namen, NEU_ERZEUGEN).toEqual(erwartet);
    expect(namen).toEqual(['Gregorian calendar', 'Japanese calendar']);
  });

  it('jede Zeitrechnung ist genau das, was ihre Vorlage heute in englischer Sprache erzeugt', () => {
    const block = gespeichert.blocks[0];
    const roh = {
      blocks: [
        {
          id: block.id,
          name: block.name,
          calendars: block.calendars.map((cal) => {
            const vorlage = vorlageZuName(cal.name);
            expect(vorlage, `${cal.name}: keine Vorlage dieses Namens. ${NEU_ERZEUGEN}`).not.toBe(
              null,
            );
            return { ...vorlage.create(t), id: cal.id };
          }),
        },
      ],
    };
    const normalisiert = normalizeCalendarConfig(roh);
    // Je Zeitrechnung nach der Normalisierung, damit die Meldung sagt, welche.
    block.calendars.forEach((cal, i) => {
      expect(
        normalizeCalendarConfig(gespeichert).blocks[0].calendars[i],
        `${cal.name}: ${NEU_ERZEUGEN}`,
      ).toEqual(normalisiert.blocks[0].calendars[i]);
    });
    // Und die ganze Sektion in der Ablage-Form, die der Schreiber der
    // Bereichsdatei ablegt (writeAreaCalendarConfig).
    expect(gespeichert, NEU_ERZEUGEN).toEqual(configForPersist(roh, normalisiert));
  });

  it('die Ablage-Form ist ein Fixpunkt der Normalisierung', () => {
    // Ein Anwenden der Einstellungen ohne Änderung schreibt die Sektion damit
    // Zeichen für Zeichen unverändert zurück.
    expect(normalizeCalendarConfig(gespeichert)).toEqual(gespeichert);
  });
});

describe('Demo-Area: «14 Calendar Systems.md» zeigt die Werte mit Namen (4T-001735)', () => {
  const seite = fs.readFileSync(SEITE, 'utf8');

  it('jedes Paar der Seite bezeichnet im Block denselben Tag', () => {
    const block = normalizeCalendarConfig(gespeichert).blocks[0];
    const [greg, jap] = block.calendars;
    for (const paar of PAARE) {
      expect(seite).toContain(`@{${greg.name}: ${paar.gregorian}}`);
      expect(seite).toContain(`@{${jap.name}: ${paar.japanese}}`);
      const g = parseCanonical(greg, paar.gregorian);
      const j = parseCanonical(jap, paar.japanese);
      expect(g.ok && j.ok, paar.gregorian).toBe(true);
      const hin = convertInBlock(block, greg.id, g.tuple, jap.id);
      const her = convertInBlock(block, jap.id, j.tuple, greg.id);
      expect(formatTuple(jap, hin.tuple)).toBe(paar.japanese);
      expect(formatTuple(greg, her.tuple)).toBe(paar.gregorian);
    }
  });

  it('gerendert mit der Sektion aus der Bereichsdatei: jeder Wert ein Abzeichen mit Namen', () => {
    setCalendarConfig(normalizeCalendarConfig(gespeichert));
    const html = renderMarkdown(seite, 'en');
    expect(html).not.toContain('calendar-value-unknown');
    expect(html).not.toContain('calendar-value-invalid');
    const abzeichen = [
      ...html.matchAll(/<span class="calendar-value" title="([^"]*)"[^>]*>([^<]*)<\/span>/g),
    ].map((m) => ({ title: m[1], text: m[2] }));
    const erwartet = PAARE.flatMap((paar) => [
      { title: `Gregorian calendar: ${paar.gregorian}`, text: paar.anzeige[0] },
      { title: `Japanese calendar: ${paar.japanese}`, text: paar.anzeige[1] },
    ]);
    expect(abzeichen).toEqual(erwartet);
  });

  it('Aus-Zustand: ohne die Erweiterung bleibt jeder Wert Klartext, wie die Seite es sagt', () => {
    setCalendarConfig(normalizeCalendarConfig(gespeichert));
    configureExtensions(['custom-calendars']);
    const html = renderMarkdown(seite, 'en');
    expect(html).not.toContain('calendar-value');
    for (const paar of PAARE) {
      expect(html).toContain(`@{Gregorian calendar: ${paar.gregorian}}`);
      expect(html).toContain(`@{Japanese calendar: ${paar.japanese}}`);
    }
  });

  it('die Liste der mitgelieferten Kalender folgt dem Aufklapp-Menü der Vorlagen', () => {
    const abschnitt = seite.split('## More calendars from the templates')[1].split('\n## ')[0];
    const liste = [...abschnitt.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]);
    expect(
      liste,
      'Liste in «14 Calendar Systems.md» nachziehen, dazu die Anzahl dort und in «00 Welcome.md»',
    ).toEqual(CALENDAR_TEMPLATES.map((e) => t(e.nameKey)));
  });
});
