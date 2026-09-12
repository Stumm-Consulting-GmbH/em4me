// 4T-001587 (Story 4S-000904, Epic 3E-000160): Prüffälle des Sammelns und der
// Ausgabe.
//
// Geprüft wird die Sammlung gegen einen nachgestellten Speicher: Umfang der
// Auswahl, die gemeldeten Zahlen, die leere Auswahl, die Unversehrtheit der
// Quellen — und vor allem die Fail-closed-Zusicherung, dass ein Schlüssel ohne
// Eintrag in der Registry den Rechner nicht verlässt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DATA_KINDS,
  DATA_KIND_IDS,
  EXCHANGE_KIND,
  NEVER_EXPORTED,
  SETTINGS_PATHS,
  allExportedPaths,
} from '../../src/shared/exchange-data-kinds.js';
import { collectDataKinds, buildExchangeSections } from '../../src/shared/exchange-collect.js';
import { writeExchangeFile, readExchangeFile } from '../../src/shared/exchange-file.js';
import { isExtensionId } from '../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../src/shared/extensions/extensions-core.js';
// 4T-000391 (Epic 3E-000129): Sprachliste aus der einen Quelle.
import { LOCALE_CODES } from '../../src/shared/locales.js';

// Ein nachgestellter Speicher in der Form, die electron-store liefert: Zugriff
// über Punkt-Pfade, ungesetzt ist undefined.
function storeDouble(inhalt) {
  return {
    daten: inhalt,
    get(pfad) {
      return pfad.split('.').reduce((k, teil) => (k == null ? undefined : k[teil]), inhalt);
    },
  };
}

const EINGERICHTET = {
  // Einstellungen (Auszug der Pfade der Datenart)
  language: 'de',
  themePref: 'dark',
  appearance: { editorFont: 'Consolas', editorSize: 14 },
  autoSave: true,
  // eigene Datenarten
  colorSchemes: { custom: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], activeLight: 'a' },
  hotkeys: { 'file.save': 'Ctrl+S', 'file.print': 'Ctrl+P' },
  formatToolbar: [{ type: 'command' }, { type: 'separator' }],
  commandPlacement: { statusbar: ['x'], macros: [] },
  extensions: { disabled: ['mermaid'] },
  extensionsExternal: { enabled: ['fremd-a', 'fremd-b'], trusted: ['fremd-a'] },
  sidebar: { layout: { links: ['outline'] }, widthLeft: 260 },
  panelToggle: { order: ['outline', 'search'] },
  templates: { folder: 'Vorlagen', rules: [{ muster: '*.md' }] },
  bookmarksTree: { children: [{ titel: 'A' }, { titel: 'B', children: [{ titel: 'B1' }] }] },
  // Was nie mitgehen darf
  apps: [{ id: 'app-1', fenster: ['C:/irgendwo/Datei.md'] }],
  workspaces: [{ name: 'Privat', pfad: 'C:/Privat' }],
  recentFiles: ['C:/irgendwo/Datei.md'],
  windowBounds: { x: 0, y: 0, width: 1280, height: 800 },
  tourSeen: { erste: true },
  extensionData: { 'fremde-erweiterung': { apiKey: 'GEHEIM-SOLL-NIE-RAUS' } },
  clock: { options: { sekunden: true }, timers: [{ rest: 42 }], stopwatch: { laeuft: true } },
  bookmarks: { areaFirst: true, sortMigrationDone: true },
};

// 4T-001588: Die Sektion in ihrer WIRKLICHEN Form — `{ blocks: [...] }` mit den
// Zeitrechnungen je Block (normalizeCalendarConfig). Bis hierher stand hier eine
// blosse Liste, und die Zaehl-Regel der Datenart teilte diese falsche Form: Sie
// meldete deshalb immer null, und der Pruefstand bestaetigte den Fehler, statt
// ihn zu finden (Fehlerklassen-Register, L10/U2).
const KALENDER = {
  blocks: [{ id: 'fiskal', name: 'Fiskaljahr', calendars: [{ id: 'fiskal', name: 'Fiskaljahr' }] }],
};

function sammle(inhalt = EINGERICHTET, kalender = KALENDER) {
  const store = storeDouble(inhalt);
  return collectDataKinds({
    readPath: (pfad) => store.get(pfad),
    readAreaSection: kalender
      ? (sektion) => (sektion === 'calendarSystems' ? kalender : undefined)
      : null,
  });
}

describe('exchange-data-kinds.js — die eine Liste (AK7)', () => {
  it('führt jede Datenart genau einmal', () => {
    expect(new Set(DATA_KIND_IDS).size).toBe(DATA_KIND_IDS.length);
  });

  it('gibt jeder Datenart genau eine Quelle und eine Zähl-Regel', () => {
    for (const kind of DATA_KINDS) {
      expect(Boolean(kind.paths) !== Boolean(kind.areaSection), kind.id).toBe(true);
      expect(typeof kind.zaehle, kind.id).toBe('function');
      expect(kind.labelKey, kind.id).toBe(`exchange.kind.${kind.id}`);
    }
  });

  it('beansprucht keinen Speicher-Pfad zweimal', () => {
    const alle = DATA_KINDS.flatMap((k) => k.paths || []);
    expect(new Set(alle).size).toBe(alle.length);
  });

  it('nennt keinen Pfad zugleich als ausgegeben und als nie ausgegeben', () => {
    for (const pfad of allExportedPaths()) {
      expect(Object.keys(NEVER_EXPORTED), pfad).not.toContain(pfad);
    }
    // Und kein Ausschluss-Grund bleibt leer — die Liste ist eine Begründung,
    // keine bloße Aufzählung.
    for (const [pfad, grund] of Object.entries(NEVER_EXPORTED)) {
      expect(typeof grund, pfad).toBe('string');
      expect(grund.length, pfad).toBeGreaterThan(20);
    }
  });
});

describe('exchange-collect.js — Sammeln und Zählen (AK2)', () => {
  it('meldet je Datenart die Zahl ihrer Einträge', async () => {
    const nach = Object.fromEntries((await sammle()).map((k) => [k.id, k.count]));
    expect(nach.colorSchemes).toBe(3); // drei eigene Schemas, nicht drei Felder
    expect(nach.hotkeys).toBe(2);
    expect(nach.formatToolbar).toBe(2);
    expect(nach.extensions).toBe(3); // eine abgeschaltete plus zwei freigegebene
    expect(nach.templates).toBe(1); // eine Regel
    expect(nach.bookmarksTree).toBe(3); // zwei Wurzel-Knoten plus ein Kind
    expect(nach.calendarSystems).toBe(1);
  });

  it('lässt eine Datenart ohne Inhalt aus der Auswahl heraus', async () => {
    const gesammelt = await sammle({ language: 'de', colorSchemes: { custom: [] } });
    const vorhanden = gesammelt.filter((k) => k.hasValues).map((k) => k.id);
    expect(vorhanden).toContain('settings');
    // Ein leerer Behälter zählt nicht als vorhanden.
    expect(vorhanden).not.toContain('hotkeys');
  });

  it('lässt die bereichsgebundene Datenart ohne Bereich ganz entfallen', async () => {
    const ohneBereich = await sammle(EINGERICHTET, null);
    expect(ohneBereich.map((k) => k.id)).not.toContain('calendarSystems');
  });

  it('gibt Kopien heraus und keine Bezüge in den laufenden Speicher', async () => {
    const inhalt = JSON.parse(JSON.stringify(EINGERICHTET));
    const gesammelt = await sammle(inhalt);
    const eintrag = gesammelt.find((k) => k.id === 'hotkeys');
    eintrag.values.hotkeys['file.save'] = 'VERAENDERT';
    expect(inhalt.hotkeys['file.save']).toBe('Ctrl+S');
  });
});

describe('exchange-collect.js — Auswahl bestimmt den Umfang (AK3, AK4)', () => {
  it('erzeugt genau die gewählten Abschnitte und keinen weiteren', async () => {
    const gesammelt = await sammle();
    const gebaut = buildExchangeSections(gesammelt, ['hotkeys', 'colorSchemes']);
    expect(gebaut.ok).toBe(true);
    expect(gebaut.sections.map((s) => s.name)).toEqual(['colorSchemes', 'hotkeys']);
  });

  it('ordnet die Abschnitte nach der Registry, nicht nach der Anklick-Folge', async () => {
    const gesammelt = await sammle();
    const a = buildExchangeSections(gesammelt, ['hotkeys', 'settings', 'colorSchemes']);
    const b = buildExchangeSections(gesammelt, ['colorSchemes', 'hotkeys', 'settings']);
    expect(a.sections.map((s) => s.name)).toEqual(b.sections.map((s) => s.name));
  });

  it('meldet die leere Auswahl, statt eine leere Datei zu erzeugen', async () => {
    expect(buildExchangeSections(await sammle(), [])).toEqual({ ok: false, error: 'no-selection' });
  });

  it('meldet eine unbekannte und eine leere Datenart je mit Namen', async () => {
    const gesammelt = await sammle({ language: 'de' });
    expect(buildExchangeSections(gesammelt, ['gibtsNicht'])).toEqual({
      ok: false,
      error: 'unknown-kind',
      kind: 'gibtsNicht',
    });
    expect(buildExchangeSections(gesammelt, ['hotkeys'])).toEqual({
      ok: false,
      error: 'empty-kind',
      kind: 'hotkeys',
    });
  });

  it('setzt die Überschrift des Abschnitts aus der Übersetzung', async () => {
    const gesammelt = await sammle();
    const gebaut = buildExchangeSections(gesammelt, ['hotkeys'], (key) => `<${key}>`);
    expect(gebaut.sections[0].title).toBe('<exchange.kind.hotkeys>');
  });
});

describe('exchange — fail closed: was nicht in der Registry steht, geht nicht mit', () => {
  it('gibt keinen der ausdrücklich ausgeschlossenen Schlüssel aus', async () => {
    const gesammelt = await sammle();
    const gebaut = buildExchangeSections(
      gesammelt,
      DATA_KIND_IDS.filter((id) => gesammelt.some((k) => k.id === id && k.hasValues)),
    );
    const text = writeExchangeFile({
      kind: EXCHANGE_KIND,
      created: '2026-09-08T12:00:00Z',
      sections: gebaut.sections,
    }).text;
    for (const pfad of Object.keys(NEVER_EXPORTED)) {
      expect(text, `ausgeschlossen: ${pfad}`).not.toContain(`"${pfad}"`);
    }
    // Und die Probe aufs Exempel am gefährlichsten Fall: dem Ablage-Raum
    // fremder Erweiterungen (Befund B5).
    expect(text).not.toContain('GEHEIM-SOLL-NIE-RAUS');
    expect(text).not.toContain('C:/irgendwo/Datei.md');
  });

  it('nimmt einen Schlüssel, den die Registry nicht kennt, in keine Datenart auf', async () => {
    const mitFremdem = { ...EINGERICHTET, kuenftigeEinstellung: { geheim: 'NEU-UND-UNBEKANNT' } };
    const gesammelt = await sammle(mitFremdem);
    for (const kind of gesammelt) {
      expect(JSON.stringify(kind.values)).not.toContain('NEU-UND-UNBEKANNT');
    }
  });

  it('trennt die freigegebenen von den vertrauten externen Erweiterungen', async () => {
    // `extensionsExternal.enabled` geht mit, `.trusted` nicht: Vertrauen in
    // fremden Code ist je Rechner zu entscheiden.
    const eintrag = (await sammle()).find((k) => k.id === 'extensions');
    expect(eintrag.values['extensionsExternal.enabled']).toEqual(['fremd-a', 'fremd-b']);
    expect(Object.keys(eintrag.values)).not.toContain('extensionsExternal.trusted');
  });

  it('nimmt von der Uhr die Anzeige-Optionen mit, nicht die laufenden Timer', async () => {
    const eintrag = (await sammle()).find((k) => k.id === 'settings');
    expect(eintrag.values['clock.options']).toEqual({ sekunden: true });
    expect(JSON.stringify(eintrag.values)).not.toContain('stopwatch');
  });
});

describe('exchange — die Ausgabe liest ausschließlich (AK6)', () => {
  it('lässt Speicher und Bereichs-Sektion unverändert', async () => {
    const inhalt = JSON.parse(JSON.stringify(EINGERICHTET));
    const kalender = JSON.parse(JSON.stringify(KALENDER));
    const vorher = JSON.stringify({ inhalt, kalender });
    const gesammelt = await sammle(inhalt, kalender);
    buildExchangeSections(
      gesammelt,
      DATA_KIND_IDS.filter((id) => gesammelt.some((k) => k.id === id && k.hasValues)),
    );
    expect(JSON.stringify({ inhalt, kalender })).toBe(vorher);
  });

  it('bekommt vom Speicher-Doppel ausschließlich Lese-Zugriffe', async () => {
    const gelesen = [];
    await collectDataKinds({ readPath: (pfad) => gelesen.push(pfad) && undefined });
    // Gelesen wird genau die Pfad-Menge der Registry — nichts darüber hinaus.
    expect(gelesen).toEqual(allExportedPaths());
  });
});

describe('exchange — Rundlauf mit dem Format aus 4T-001586', () => {
  it('liest jede ausgegebene Datenart unverändert zurück', async () => {
    const gesammelt = await sammle();
    const vorhanden = gesammelt.filter((k) => k.hasValues);
    const gebaut = buildExchangeSections(
      gesammelt,
      vorhanden.map((k) => k.id),
    );
    const geschrieben = writeExchangeFile({
      kind: EXCHANGE_KIND,
      created: '2026-09-08T12:00:00Z',
      origin: { program: 'EM4me', version: '1.130.0' },
      sections: gebaut.sections,
    });
    expect(geschrieben.ok).toBe(true);

    const gelesen = readExchangeFile(geschrieben.text, { knownSections: DATA_KIND_IDS });
    expect(gelesen.ok).toBe(true);
    expect(gelesen.kind).toBe(EXCHANGE_KIND);
    expect(gelesen.unknownSections).toEqual([]);
    expect(gelesen.sections.map((s) => s.name)).toEqual(vorhanden.map((k) => k.id));
    for (const abschnitt of gelesen.sections) {
      const quelle = vorhanden.find((k) => k.id === abschnitt.name);
      expect(abschnitt.value, abschnitt.name).toEqual(quelle.values);
    }
  });
});

describe('exchange — schaltbare Erweiterung (Zug-Entscheidung Z8)', () => {
  it('reale Registry: setup-exchange filtert das Ausgabe-Kommando', () => {
    expect(isExtensionId('setup-exchange')).toBe(true);
    expect(disabledCommandIdSet(['setup-exchange']).has('file.exportSetup')).toBe(true);
    // Im Ein-Zustand bleibt das Kommando; ein Aus-Zustand einer FREMDEN
    // Erweiterung nimmt es nicht mit.
    expect(disabledCommandIdSet([]).has('file.exportSetup')).toBe(false);
    expect(disabledCommandIdSet(['mermaid']).has('file.exportSetup')).toBe(false);
  });
});

describe('exchange — Beschriftungen in fünf Sprachfassungen (AK8)', () => {
  const SPRACHEN = LOCALE_CODES;
  const kataloge = Object.fromEntries(
    SPRACHEN.map((s) => [
      s,
      JSON.parse(
        readFileSync(fileURLToPath(new URL(`../../src/i18n/${s}.json`, import.meta.url)), 'utf8'),
      ),
    ]),
  );

  it('kennt jede Datenart in jeder Sprache', () => {
    for (const kind of DATA_KINDS) {
      for (const sprache of SPRACHEN) {
        const wert = kataloge[sprache][kind.labelKey];
        expect(typeof wert, `${sprache}: ${kind.labelKey}`).toBe('string');
        expect(wert.trim().length, `${sprache}: ${kind.labelKey}`).toBeGreaterThan(0);
      }
    }
  });

  it('kennt die Texte des Dialogs und den Katalog-Eintrag in jeder Sprache', () => {
    const schluessel = [
      'menu.file.setupSubmenu',
      'menu.file.exportSetup',
      'help.shortcut.exportSetup',
      'help.featureName.setupExchange',
      'help.feature.setupExchange',
      'help.featureAccess.setupExchange',
      'exchange.export.title',
      'exchange.export.intro',
      'exchange.export.confirm',
      'exchange.export.nothingAvailable',
      'exchange.export.nothingSelected',
      'exchange.export.failed',
      'exchange.export.done',
      'exchange.export.fileStem',
      'exchange.entryCountOne',
      'exchange.entryCountMany',
      'exchange.entryCountPresent',
    ];
    for (const key of schluessel) {
      for (const sprache of SPRACHEN) {
        expect(typeof kataloge[sprache][key], `${sprache}: ${key}`).toBe('string');
      }
    }
  });

  it('hält den Platzhalter der Mehrzahl in allen Sprachen', () => {
    for (const sprache of SPRACHEN) {
      expect(kataloge[sprache]['exchange.entryCountMany'], sprache).toContain('{n}');
    }
  });

  it('nennt in der Einstellungs-Datenart keinen Pfad, den es nicht gibt', () => {
    // Die Pfade sind Speicher-Schlüssel und stehen in keiner Sprachdatei; was
    // sie belegt, ist die Erhebung der Konzept-Stufe. Geprüft wird hier nur die
    // Form: keine Leerstelle, kein doppelter Eintrag.
    for (const pfad of SETTINGS_PATHS) {
      expect(pfad.trim()).toBe(pfad);
      expect(pfad.length).toBeGreaterThan(0);
    }
    expect(new Set(SETTINGS_PATHS).size).toBe(SETTINGS_PATHS.length);
  });
});
