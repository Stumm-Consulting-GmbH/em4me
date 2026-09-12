// 4T-001588 (Story 4S-000904, Epic 3E-000160): Prüffälle des Einlesens.
//
// Geprüft wird die Zusammenführung gegen einen nachgestellten Bestand — und
// zwar an den Fällen, die an einer eingerichteten Installation nur mühsam
// herzustellen wären: die Namens-Kollision über mehrere Datenarten hinweg, die
// Datei aus einer neueren Programm-Fassung, der Verweis auf ein umbenanntes
// Makro. Genau dafür ist die Zusammenführung prozessneutral gebaut.
//
// Die tragende Zusicherung des Tasks steht in mehreren Fällen zugleich: **Was
// der Anwender selbst angelegt hat, verändert eine fremde Datei nicht.**
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planeUebernahme, planSignatur } from '../../src/shared/exchange-merge.js';
import { collectDataKinds } from '../../src/shared/exchange-collect.js';
import { readExchangeFile, writeExchangeFile } from '../../src/shared/exchange-file.js';
import { DATA_KINDS, dataKindById, EXCHANGE_KIND } from '../../src/shared/exchange-data-kinds.js';
import { createAreaConfig } from '../../src/main/area/area-config.js';
import mddStore from '../../src/main/documents/mdd-store.js';
import {
  VERTEIL_SCHLUESSEL,
  verteilSchluesselUnter,
} from '../../src/main/ipc/settings-verteilung.js';
import { isExtensionId } from '../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../src/shared/extensions/extensions-core.js';

// Ein nachgestellter Speicher in der Form, die electron-store liefert.
function storeDouble(inhalt) {
  return {
    get(pfad) {
      return pfad.split('.').reduce((k, teil) => (k == null ? undefined : k[teil]), inhalt);
    },
  };
}

// Der Ist-Stand in genau der Form, die auch die Ausgabe sieht.
async function istStand(inhalt, areaSektionen) {
  const store = storeDouble(inhalt);
  return collectDataKinds({
    readPath: (pfad) => store.get(pfad),
    readAreaSection: areaSektionen ? (name) => areaSektionen[name] : null,
  });
}

// Eine eingerichtete Installation: eigene Schemas, ein eigenes Makro, ein
// Lesezeichen-Ordner, eigene Kürzel.
const EINGERICHTET = {
  language: 'de',
  themePref: 'dark',
  hotkeys: { 'file.save': 'Ctrl+S' },
  colorSchemes: {
    custom: [{ id: 'nacht', name: 'Nacht', base: 'dark' }],
    activeLight: 'amber-light',
    activeDark: 'nacht',
  },
  commandPlacement: {
    macros: [{ id: 'abc', name: 'Ablauf', steps: [] }],
    statusbar: [{ commandId: 'macro.abc' }],
    contextMenu: [],
    hiddenButtons: [],
  },
  sidebar: {
    layout: { links: ['outline'] },
    layoutVariants: [{ id: 'v1', name: 'Schreiben' }],
  },
  panelToggle: { order: ['outline'] },
  bookmarksTree: [
    { type: 'folder', id: 'f1', name: 'Projekte', children: [] },
    { type: 'file', id: 'd1', filePath: 'C:/Notizen/a.md' },
  ],
  templates: { folder: 'Vorlagen', rules: [{ folder: 'Notizen', template: 'notiz.md' }] },
};

// Dieselben Namen, andere Kennungen und andere Inhalte: die Datei eines
// zweiten Rechners, auf dem derselbe Mensch dieselben Namen vergeben hat.
const FREMDE_DATEI = [
  { name: 'hotkeys', value: { hotkeys: { 'file.save': 'Ctrl+Alt+S', 'file.print': 'Ctrl+P' } } },
  {
    name: 'colorSchemes',
    value: {
      colorSchemes: {
        custom: [{ id: 'nacht', name: 'Nacht', base: 'dark' }],
        activeLight: 'amber-light',
        activeDark: 'nacht',
      },
    },
  },
  {
    name: 'commandPlacement',
    value: {
      commandPlacement: {
        macros: [
          { id: 'abc', name: 'Ablauf', steps: [{ type: 'command', commandId: 'file.save' }] },
        ],
        statusbar: [{ commandId: 'macro.abc' }],
        contextMenu: [],
        hiddenButtons: [],
      },
    },
  },
  {
    name: 'sidebar',
    value: {
      sidebar: { layout: { links: ['tags'] }, layoutVariants: [{ id: 'v1', name: 'Schreiben' }] },
      panelToggle: { order: ['tags'] },
    },
  },
  {
    name: 'bookmarksTree',
    value: {
      bookmarksTree: [
        { type: 'folder', id: 'f1', name: 'Projekte', children: [] },
        { type: 'file', id: 'd1', filePath: 'C:/Notizen/a.md' },
        { type: 'file', id: 'd9', filePath: 'D:/Fremd/b.md' },
      ],
    },
  },
];

function planFuer(gesammelt, sections) {
  return planeUebernahme(gesammelt, sections);
}

function eintrag(plan, id) {
  return plan.kinds.find((k) => k.id === id);
}

describe('AK4/AK5 — ergaenzen und ersetzen je Datenart', () => {
  it('ergaenzt Farbschemas und laesst das vorhandene als Ganzes unveraendert', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    const werte = eintrag(plan, 'colorSchemes').values.colorSchemes;
    expect(werte.custom).toHaveLength(2);
    // Der vorhandene Eintrag: identisch, Feld fuer Feld.
    expect(werte.custom[0]).toEqual(EINGERICHTET.colorSchemes.custom[0]);
    expect(eintrag(plan, 'colorSchemes').action).toBe('append');
    expect(eintrag(plan, 'colorSchemes').hinzu).toBe(1);
  });

  it('ersetzt die Tastenkuerzel — ein Kommando hat genau ein Kuerzel', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    const zeile = eintrag(plan, 'hotkeys');
    expect(zeile.action).toBe('replace');
    expect(zeile.values.hotkeys).toEqual({ 'file.save': 'Ctrl+Alt+S', 'file.print': 'Ctrl+P' });
  });

  it('ergaenzt die Sidebar-Varianten, ersetzt aber die Anordnung daneben', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    const werte = eintrag(plan, 'sidebar').values;
    expect(werte.sidebar.layoutVariants).toHaveLength(2);
    expect(werte.sidebar.layoutVariants[0]).toEqual({ id: 'v1', name: 'Schreiben' });
    // Die Anordnung ist eine Anordnung: sie tritt an die Stelle der eigenen.
    expect(werte.sidebar.layout).toEqual({ links: ['tags'] });
    expect(werte.panelToggle).toEqual({ order: ['tags'] });
  });

  it('ergaenzt den Lesezeichen-Baum und laesst den vorhandenen Bestand stehen', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    const baum = eintrag(plan, 'bookmarksTree').values.bookmarksTree;
    expect(baum.slice(0, 2)).toEqual(EINGERICHTET.bookmarksTree);
    expect(baum).toHaveLength(4); // Ordner (umbenannt) und die fremde Datei
  });

  it('ersetzt die Vorlagen-Regeln als Ganzes — die Reihenfolge entscheidet ueber den Treffer', async () => {
    const sections = [
      { name: 'templates', value: { templates: { folder: 'T', rules: [{ folder: 'X' }] } } },
    ];
    const plan = planFuer(await istStand(EINGERICHTET), sections);
    expect(eintrag(plan, 'templates').action).toBe('replace');
    expect(eintrag(plan, 'templates').values.templates.rules).toEqual([{ folder: 'X' }]);
  });

  it('ersetzt den Schalt-Zustand der Erweiterungen statt die Listen zu vereinigen', async () => {
    const ist = { extensions: { disabled: ['mermaid'] }, extensionsExternal: { enabled: ['a'] } };
    const sections = [
      {
        name: 'extensions',
        value: { 'extensions.disabled': ['callouts'], 'extensionsExternal.enabled': [] },
      },
    ];
    const plan = planFuer(await istStand(ist), sections);
    // Die Vereinigung haette 'mermaid' abgeschaltet gelassen, obwohl die
    // eingelesene Einrichtung es an hat.
    expect(eintrag(plan, 'extensions').values['extensions.disabled']).toEqual(['callouts']);
  });
});

describe('AK6 — Namens-Kollision ueber mehrere Datenarten hinweg', () => {
  it('behaelt den vorhandenen Eintrag und legt den eingelesenen mit Zusatz daneben', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    const schemas = eintrag(plan, 'colorSchemes').values.colorSchemes.custom;
    expect(schemas[0].name).toBe('Nacht');
    expect(schemas[1].name).toBe('Nacht (2)');
    expect(schemas[1].id).not.toBe(schemas[0].id);

    const makros = eintrag(plan, 'commandPlacement').values.commandPlacement.macros;
    expect(makros[0]).toEqual(EINGERICHTET.commandPlacement.macros[0]);
    expect(makros[1].name).toBe('Ablauf (2)');

    const varianten = eintrag(plan, 'sidebar').values.sidebar.layoutVariants;
    expect(varianten[1].name).toBe('Schreiben (2)');

    const baum = eintrag(plan, 'bookmarksTree').values.bookmarksTree;
    expect(baum[2].name).toBe('Projekte (2)');
  });

  it('meldet jede Umbenennung namentlich, statt sie still vorzunehmen', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    expect(eintrag(plan, 'colorSchemes').umbenannt).toEqual([{ von: 'Nacht', nach: 'Nacht (2)' }]);
    expect(eintrag(plan, 'commandPlacement').umbenannt).toEqual([
      { von: 'Ablauf', nach: 'Ablauf (2)' },
    ]);
  });

  it('haelt die Makro-Kennung alphanumerisch, wie normalizeMacro es verlangt', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    const makros = eintrag(plan, 'commandPlacement').values.commandPlacement.macros;
    expect(makros[1].id).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it('zieht den Aktiv-Verweis eines Farbschemas auf die neue Kennung nach', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    const werte = eintrag(plan, 'colorSchemes').values.colorSchemes;
    // Ohne den Nachzug zeigte activeDark auf 'nacht' — das eigene Schema des
    // Anwenders — und das eingelesene bliebe unsichtbar.
    expect(werte.activeDark).toBe(werte.custom[1].id);
  });

  it('zieht einen Makro-Verweis auch in einer ANDEREN Datenart nach', async () => {
    const sections = [
      ...FREMDE_DATEI,
      {
        name: 'formatToolbar',
        value: { formatToolbar: { entries: [{ type: 'command', commandId: 'macro.abc' }] } },
      },
    ];
    const plan = planFuer(await istStand(EINGERICHTET), sections);
    const neueId = eintrag(plan, 'commandPlacement').values.commandPlacement.macros[1].id;
    expect(eintrag(plan, 'formatToolbar').values.formatToolbar.entries[0].commandId).toBe(
      'macro.' + neueId,
    );
    // Und in der eigenen Datenart ebenso.
    expect(eintrag(plan, 'commandPlacement').values.commandPlacement.statusbar[0].commandId).toBe(
      'macro.' + neueId,
    );
  });

  it('laesst einen Verweis auf ein nicht mitgekommenes Makro unberuehrt', async () => {
    const sections = [
      {
        name: 'formatToolbar',
        value: { formatToolbar: { entries: [{ type: 'command', commandId: 'macro.fremd' }] } },
      },
    ];
    const plan = planFuer(await istStand(EINGERICHTET), sections);
    expect(eintrag(plan, 'formatToolbar').values.formatToolbar.entries[0].commandId).toBe(
      'macro.fremd',
    );
  });

  it('ueberspringt ein Lesezeichen, dessen Ziel schon im Baum steht', async () => {
    const plan = planFuer(await istStand(EINGERICHTET), FREMDE_DATEI);
    expect(eintrag(plan, 'bookmarksTree').uebersprungen).toBe(1);
    const ziele = eintrag(plan, 'bookmarksTree')
      .values.bookmarksTree.filter((n) => n.type === 'file')
      .map((n) => n.filePath);
    expect(ziele).toEqual(['C:/Notizen/a.md', 'D:/Fremd/b.md']);
  });

  it('vergibt kollidierende Kennungen im Baum neu, auch in der Tiefe', async () => {
    const sections = [
      {
        name: 'bookmarksTree',
        value: {
          bookmarksTree: [
            {
              type: 'folder',
              id: 'f1',
              name: 'Anderes',
              children: [{ type: 'file', id: 'd1', filePath: 'D:/x.md' }],
            },
          ],
        },
      },
    ];
    const plan = planFuer(await istStand(EINGERICHTET), sections);
    const baum = eintrag(plan, 'bookmarksTree').values.bookmarksTree;
    const neu = baum[baum.length - 1];
    expect(neu.id).not.toBe('f1');
    expect(neu.children[0].id).not.toBe('d1');
  });
});

describe('AK7 — aeltere und neuere Fassung', () => {
  it('liest die bekannten Abschnitte und meldet den unbekannten', async () => {
    const text = writeExchangeFile({
      kind: EXCHANGE_KIND,
      formatVersion: 1,
      sections: [
        { name: 'hotkeys', value: { hotkeys: { 'file.save': 'Ctrl+S' } } },
        { name: 'erfundeneDatenart', value: { irgendwas: 1 } },
      ],
    });
    const gelesen = readExchangeFile(text.text, { knownSections: DATA_KINDS.map((k) => k.id) });
    expect(gelesen.unknownSections).toEqual(['erfundeneDatenart']);
    const plan = planFuer(await istStand(EINGERICHTET), gelesen.sections);
    expect(plan.unknownSections).toEqual(['erfundeneDatenart']);
    expect(eintrag(plan, 'hotkeys').action).toBe('replace');
  });

  it('verwirft einen bekannten Abschnitt in fremder Form, statt ihn zu schreiben', async () => {
    // Der Fall einer neueren Fassung, in der eine Datenart ihre Struktur
    // gewechselt hat: 'hotkeys' als Liste statt als Objekt.
    const sections = [{ name: 'hotkeys', value: { hotkeys: ['Ctrl+S'] } }];
    const plan = planFuer(await istStand(EINGERICHTET), sections);
    expect(eintrag(plan, 'hotkeys').action).toBe('skip');
    expect(eintrag(plan, 'hotkeys').verworfen).toEqual(['hotkeys']);
    expect(eintrag(plan, 'hotkeys').values).toEqual({});
  });

  it('verwirft einen Pfad, den die Registry nicht kennt — fail closed auch beim Einlesen', async () => {
    const sections = [
      { name: 'hotkeys', value: { hotkeys: { a: 'b' }, kuenftigerSchluessel: { x: 1 } } },
    ];
    const plan = planFuer(await istStand(EINGERICHTET), sections);
    expect(eintrag(plan, 'hotkeys').verworfen).toEqual(['kuenftigerSchluessel']);
    expect(Object.keys(eintrag(plan, 'hotkeys').values)).toEqual(['hotkeys']);
  });
});

describe('AK8 — unlesbare und fremde Dateien', () => {
  it('weist eine gewoehnliche Markdown-Datei ab', () => {
    expect(readExchangeFile('# Notiz\n\nText.').ok).toBe(false);
    expect(readExchangeFile('# Notiz\n\nText.').error).toBe('no-frontmatter');
  });

  it('weist eine Markdown-Datei mit Frontmatter ohne unsere Marke ab', () => {
    expect(readExchangeFile('---\ntitle: x\n---\n\nText.').error).toBe('not-an-exchange-file');
  });

  it('weist eine beschaedigte Datei ab, ohne einen Teil zu uebernehmen', () => {
    const kaputt =
      '---\nem4me: "setup"\nformatVersion: 1\n---\n\n```json em4me:hotkeys\n{ kaputt\n```\n';
    const gelesen = readExchangeFile(kaputt);
    expect(gelesen.ok).toBe(false);
    expect(gelesen.error).toBe('invalid-section-content');
  });
});

describe('AK9 — der Plan als Bericht', () => {
  it('nennt jede Abweichung: Umbenennung, Duplikat, verworfener Pfad, unbekannter Abschnitt', async () => {
    const sections = [
      ...FREMDE_DATEI,
      { name: 'erfundeneDatenart', value: { x: 1 } },
      { name: 'templates', value: { templates: [] } },
    ];
    const plan = planFuer(await istStand(EINGERICHTET), sections);
    expect(plan.unknownSections).toEqual(['erfundeneDatenart']);
    expect(eintrag(plan, 'colorSchemes').umbenannt.length).toBe(1);
    expect(eintrag(plan, 'bookmarksTree').uebersprungen).toBe(1);
    expect(eintrag(plan, 'templates').action).toBe('skip');
    expect(eintrag(plan, 'templates').verworfen).toEqual(['templates']);
  });

  it('bildet eine Signatur, die sich mit dem Bestand aendert', async () => {
    const a = planSignatur(planFuer(await istStand(EINGERICHTET), FREMDE_DATEI));
    const b = planSignatur(planFuer(await istStand({}), FREMDE_DATEI));
    // Ohne eigenen Bestand gibt es keine Kollision — also einen anderen Plan.
    expect(a).not.toBe(b);
    const c = planSignatur(planFuer(await istStand(EINGERICHTET), FREMDE_DATEI));
    expect(a).toBe(c);
  });
});

describe('AK10 — geschrieben wird nur ueber die bestehenden Wege', () => {
  let tmpDirs = [];
  afterEach(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
    tmpDirs = [];
  });
  function makeRoot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-import-'));
    tmpDirs.push(dir);
    return dir;
  }
  function makeConfig() {
    return createAreaConfig({
      getStore: () => null,
      areaOfWindow: () => null,
      markSelfWriting: vi.fn(),
      mddStore,
      attachmentPath: {},
      resolveTemplatesConfig: () => ({}),
    });
  }

  it('ueberschreibt eine defekte Bereichsdatei nicht', async () => {
    const root = makeRoot();
    const datei = path.join(root, mddStore.MDDA_FILENAME);
    const defekt = '{ das ist kein Container';
    fs.writeFileSync(datei, defekt, 'utf8');
    const { writeAreaCalendarConfig } = makeConfig();
    const ergebnis = await writeAreaCalendarConfig(root, {
      blocks: [{ id: 'b', name: 'B', calendars: [] }],
    });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toMatch(/mdda defekt/);
    // Byte-genau unveraendert: nichts ist verloren gegangen.
    expect(fs.readFileSync(datei, 'utf8')).toBe(defekt);
  });

  it('laesst unbekannte Sektionen der Bereichsdatei ueberleben', async () => {
    const root = makeRoot();
    const datei = path.join(root, mddStore.MDDA_FILENAME);
    const { writeAreaCalendarConfig } = makeConfig();
    const container = mddStore.emptySettingsContainer();
    container.settings.eineKuenftigeSektion = { bleibt: true };
    fs.writeFileSync(datei, mddStore.serializeContainer(container), 'utf8');

    await writeAreaCalendarConfig(root, {
      blocks: [{ id: 'b', name: 'B', calendars: [] }],
    });
    const danach = mddStore.parseSettingsContainer(fs.readFileSync(datei, 'utf8'));
    expect(danach.ok).toBe(true);
    expect(danach.container.settings.eineKuenftigeSektion).toEqual({ bleibt: true });
  });

  it('legt keine Bereichsdatei an, wenn nichts zu setzen ist', async () => {
    const root = makeRoot();
    const { writeAreaCalendarConfig } = makeConfig();
    const ergebnis = await writeAreaCalendarConfig(root, null);
    expect(ergebnis.ok).toBe(true);
    expect(fs.existsSync(path.join(root, mddStore.MDDA_FILENAME))).toBe(false);
  });

  it('kennt keinen eigenen Schreibweg: das Einlesen ruft nur die bestehenden auf', () => {
    // Ersatz fuer das urspruengliche AK11 (Entscheidung des Product Owners vom
    // 2026-09-08): Bereichs-Lesezeichen sind keine Datenart des Austauschs, ihre
    // Grenzpruefung kann also nie greifen. Was bleibt und was zaehlt, ist die
    // Zusicherung dahinter — der Einlese-Weg schreibt ausschliesslich ueber die
    // Wege, die ihre Pruefungen schon mitbringen.
    const quelle = readFileSync(
      fileURLToPath(new URL('../../src/main/ipc/exchange.js', import.meta.url)),
      'utf8',
    );
    // Kein direkter Datei-Schreibzugriff und keine eigene Serialisierung.
    expect(quelle).not.toMatch(/writeFile|ersetzeDatei|serializeContainer/);
    // Der globale Speicher ausschliesslich ueber store.set samt Verteilung.
    expect(quelle).toMatch(/verteileEinstellung\(/);
    // Die Bereichsdatei ausschliesslich ueber den Sektions-Schreiber.
    expect(quelle).toMatch(/writeAreaCalendarConfig\(/);
  });
});

describe('Waechter — die Naht am bestehenden Schreibweg', () => {
  it('haelt die Schluessel-Liste gegen die Zweige im Quelltext', () => {
    const quelle = readFileSync(
      fileURLToPath(new URL('../../src/main/ipc/settings-verteilung.js', import.meta.url)),
      'utf8',
    );
    // Alles hinter dem Listen-Ende ist der Rumpf mit den Zweigen.
    const rumpf = quelle.slice(quelle.indexOf('function createSettingsVerteilung'));
    const ausZweigen = new Set(
      [...rumpf.matchAll(/key === '([^']+)'/g)].map((m) => m[1]).filter((k) => k !== 'string'),
    );
    for (const k of ausZweigen) {
      expect(VERTEIL_SCHLUESSEL, `Zweig ohne Eintrag in der Liste: ${k}`).toContain(k);
    }
    // Und die drei ueber Konstanten geschriebenen Zweige.
    for (const konstante of ['SPELLCHECK_KEY', 'CLOCK_ALARMS_KEY', 'CLOCK_TIMERS_KEY']) {
      expect(rumpf).toContain(`key === ${konstante}`);
    }
    expect(VERTEIL_SCHLUESSEL.length).toBe(ausZweigen.size + 3);
  });

  it('findet die Kind-Schluessel eines groeber geschriebenen Pfads', () => {
    // Das Einlesen schreibt 'sidebar' als Ganzes; ohne diesen Nachlauf bliebe
    // die eingelesene Anordnung bis zum naechsten Programmstart unsichtbar.
    expect(verteilSchluesselUnter('sidebar')).toEqual(
      expect.arrayContaining(['sidebar.layout', 'sidebar.layoutVariants']),
    );
    expect(verteilSchluesselUnter('panelToggle')).toContain('panelToggle.order');
    expect(verteilSchluesselUnter('appearance')).toContain('appearance.editorFont');
    expect(verteilSchluesselUnter('hotkeys')).toEqual([]);
  });
});

describe('Registry — die Regel steht an einer Stelle', () => {
  it('gibt jeder Datenart eine Zusammenfuehrungs-Regel', () => {
    for (const kind of DATA_KINDS) {
      expect(kind.merge, `Datenart ohne merge: ${kind.id}`).toBeTruthy();
      expect(['replace', 'append', 'appendTree']).toContain(kind.merge.mode);
    }
  });

  it('zaehlt die Kalender-Systeme ueber die Bloecke — nicht als Liste', () => {
    // 4T-001588: Die fruehere Regel las die Sektion als Liste und meldete
    // deshalb IMMER null; die Zeile zeigte dauerhaft «vorhanden».
    const kind = dataKindById('calendarSystems');
    expect(
      kind.zaehle({
        calendarSystems: {
          blocks: [
            { id: 'a', calendars: [{ id: 'x' }, { id: 'y' }] },
            { id: 'b', calendars: [{ id: 'z' }] },
          ],
        },
      }),
    ).toBe(3);
    expect(kind.zaehle({ calendarSystems: { blocks: [] } })).toBe(0);
  });

  it('filtert im Aus-Zustand der Erweiterung beide Kommandos', () => {
    expect(isExtensionId('setup-exchange')).toBe(true);
    const aus = disabledCommandIdSet(['setup-exchange']);
    expect(aus.has('file.exportSetup')).toBe(true);
    expect(aus.has('file.importSetup')).toBe(true);
  });
});

describe('Rundlauf — ausgeben und wieder einlesen', () => {
  it('trifft auf den unveraenderten eigenen Bestand und aendert nichts Benanntes', async () => {
    const gesammelt = await istStand(EINGERICHTET);
    const abschnitte = gesammelt
      .filter((k) => k.hasValues)
      .map((k) => ({ name: k.id, value: k.values }));
    const datei = writeExchangeFile({ kind: EXCHANGE_KIND, sections: abschnitte });
    expect(datei.ok).toBe(true);
    const gelesen = readExchangeFile(datei.text, { knownSections: DATA_KINDS.map((k) => k.id) });
    const plan = planFuer(gesammelt, gelesen.sections);

    // Die eigene Datei auf den eigenen Bestand: Jeder benannte Gegenstand
    // kollidiert mit sich selbst und kommt genau einmal mit Zusatz dazu. Das
    // ist die richtige Antwort — nicht «nichts tun», denn die Datei kann von
    // einem anderen Rechner mit denselben Namen stammen, und ein Abgleich auf
    // Gleichheit waere ein Vergleich, den niemand bestellt hat.
    expect(eintrag(plan, 'colorSchemes').hinzu).toBe(1);
    expect(eintrag(plan, 'colorSchemes').values.colorSchemes.custom[0]).toEqual(
      EINGERICHTET.colorSchemes.custom[0],
    );
    // Und der Lesezeichen-Baum bleibt, wie er ist: alle Ziele sind bekannt.
    expect(eintrag(plan, 'bookmarksTree').uebersprungen).toBe(1);
  });
});
