// 4T-002355 (Epic 3E-000184): Das Untermenü «Datei → Workflows» und der Eintrag
// «Workflow-Läufe anzeigen» im Menü «Ansicht» (Story 4S-001109, AK2, AK3, AK7,
// AK8; Task AK2, AK3).
//
// Geprüft am Aufbau-Modul `menu-workflows.js` (electron-frei) gegen das
// freigegebene Mockup des Entscheidungs-Pakets 3; der Ort in den Menü-Bäumen
// gegen den QUELLTEXT von menu.js, weil jenes Modul Electron lädt (Muster
// druck-menue-ort.test.js).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MENU_ACTION_CHANNEL,
  buildWorkflowRunsViewItem,
  buildWorkflowsSubmenu,
} = require('../../src/main/menu/menu-workflows.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const menuQuelle = fs.readFileSync(path.join(WURZEL, 'src/main/menu/menu.js'), 'utf8');

const t = (k) => `«${k}»`;
// send wie in menu.js: liefert die Klick-Funktion; hier hält sie die Meldung fest.
const gesendet = [];
const send =
  (kanal, ...args) =>
  () =>
    gesendet.push([kanal, ...args]);

function liste(teil = {}) {
  return {
    ok: true,
    enabled: true,
    source: 'area',
    folder: 'C:/Notizen/Abläufe',
    missing: false,
    items: [],
    workflows: [],
    ...teil,
  };
}

const wf = (name, relPath) => ({
  kind: 'workflow',
  name,
  description: '',
  relPath,
  absPath: `C:/Notizen/Abläufe/${relPath}`,
});

const labels = (submenu) => submenu.map((e) => (e.type === 'separator' ? '---' : e.label));

describe('Untermenü «Workflows»: Einträge nach dem Mockup (AK2, AK3)', () => {
  const items = [
    wf('Posteingang leeren', 'Posteingang.md'),
    wf('Wochenrückblick anlegen', 'Woche.md'),
    {
      kind: 'group',
      name: 'Projekt',
      relPath: 'Projekt',
      items: [wf('Projekt abschließen', 'Projekt/Ende.md'), wf('Projekt anlegen', 'Projekt/A.md')],
    },
  ];

  it('zeigt die Workflows in der Reihenfolge der Liste, Unterordner als Untermenüs, dann die drei Einträge', () => {
    const eintrag = buildWorkflowsSubmenu({ t, send, liste: liste({ items }) });
    expect(eintrag.label).toBe('«workflow.menu.title»');
    expect(labels(eintrag.submenu)).toEqual([
      'Posteingang leeren',
      'Wochenrückblick anlegen',
      'Projekt',
      '---',
      '«workflow.seite.kommando»',
      '«workflow.menu.new»',
      '«workflow.menu.chooseFolder»',
    ]);
    expect(labels(eintrag.submenu[2].submenu)).toEqual(['Projekt abschließen', 'Projekt anlegen']);
  });

  it('ein Eintrag startet seinen Workflow über die Meldung an das Fenster', () => {
    gesendet.length = 0;
    const eintrag = buildWorkflowsSubmenu({ t, send, liste: liste({ items }) });
    eintrag.submenu[1].click();
    eintrag.submenu[2].submenu[1].click();
    expect(gesendet).toEqual([
      [MENU_ACTION_CHANNEL, { kind: 'start', path: 'C:/Notizen/Abläufe/Woche.md' }],
      [MENU_ACTION_CHANNEL, { kind: 'start', path: 'C:/Notizen/Abläufe/Projekt/A.md' }],
    ]);
  });

  it('die drei Einträge unter dem Trennstrich melden ihre Handgriffe', () => {
    gesendet.length = 0;
    const eintrag = buildWorkflowsSubmenu({ t, send, liste: liste({ items }) });
    for (const e of eintrag.submenu.slice(4)) e.click();
    expect(gesendet.map((g) => g[1].kind)).toEqual(['runs', 'new', 'folder']);
    expect(MENU_ACTION_CHANNEL).toBe('workflow:menuAction');
  });

  it('maskiert das kaufmännische Und im Namen (Windows-Mnemonic)', () => {
    const eintrag = buildWorkflowsSubmenu({
      t,
      send,
      liste: liste({ items: [wf('Rein & Raus', 'r.md')] }),
    });
    expect(eintrag.submenu[0].label).toBe('Rein && Raus');
  });
});

describe('Ränder (AK3, AK7, AK8)', () => {
  it('ohne Ordner: «Kein Workflow-Ordner festgelegt» und «Workflow-Ordner festlegen …»', () => {
    gesendet.length = 0;
    const eintrag = buildWorkflowsSubmenu({
      t,
      send,
      liste: liste({ source: 'none', folder: null }),
    });
    expect(labels(eintrag.submenu)).toEqual([
      '«workflow.menu.noFolder»',
      '«workflow.menu.chooseFolder»',
    ]);
    expect(eintrag.submenu[0].enabled).toBe(false);
    eintrag.submenu[1].click();
    expect(gesendet).toEqual([[MENU_ACTION_CHANNEL, { kind: 'folder' }]]);
  });

  it('leerer Ordner: ein Hinweis anstelle der Liste, darunter die drei Einträge', () => {
    const eintrag = buildWorkflowsSubmenu({ t, send, liste: liste() });
    expect(labels(eintrag.submenu)).toEqual([
      '«workflow.menu.empty»',
      '---',
      '«workflow.seite.kommando»',
      '«workflow.menu.new»',
      '«workflow.menu.chooseFolder»',
    ]);
    expect(eintrag.submenu[0].enabled).toBe(false);
  });

  it('festgelegter, aber nicht lesbarer Ordner: ein eigener Hinweis', () => {
    const eintrag = buildWorkflowsSubmenu({ t, send, liste: liste({ missing: true }) });
    expect(eintrag.submenu[0]).toEqual({ label: '«workflow.menu.folderMissing»', enabled: false });
  });

  it('erscheint nicht bei abgeschalteter Erweiterung, fehlender oder fehlerhafter Liste', () => {
    expect(buildWorkflowsSubmenu({ t, send, liste: liste({ enabled: false }) })).toBeNull();
    expect(buildWorkflowsSubmenu({ t, send, liste: null })).toBeNull();
    expect(buildWorkflowsSubmenu({ t, send, liste: { ok: false } })).toBeNull();
  });
});

describe('Eintrag im Menü «Ansicht» (4T-002350, AK1)', () => {
  it('ruft die Seite «Workflow-Läufe» über dieselbe Meldung und folgt dem Schalter', () => {
    gesendet.length = 0;
    const eintrag = buildWorkflowRunsViewItem({ t, send, liste: liste() });
    expect(eintrag.label).toBe('«workflow.seite.kommando»');
    eintrag.click();
    expect(gesendet).toEqual([[MENU_ACTION_CHANNEL, { kind: 'runs' }]]);
    expect(buildWorkflowRunsViewItem({ t, send, liste: liste({ enabled: false }) })).toBeNull();
    expect(buildWorkflowRunsViewItem({ t, send, liste: null })).toBeNull();
  });
});

describe('Ort in den Menü-Bäumen (menu.js)', () => {
  it('«Workflows» steht unmittelbar nach dem Untermenü «Bereich» und vor «Buch und Bücherregal»', () => {
    const iBereich = menuQuelle.indexOf("submenuOrNull('menu.file.areaSubmenu'");
    const iWorkflows = menuQuelle.indexOf('buildWorkflowsSubmenu({');
    const iBuch = menuQuelle.indexOf("submenuOrNull('menu.file.booksShelves'");
    expect(iBereich).toBeGreaterThan(-1);
    expect(iWorkflows).toBeGreaterThan(iBereich);
    expect(iBuch).toBeGreaterThan(iWorkflows);
    // Zwischen dem Ende des Bereichs-Untermenüs und «Workflows» liegt nichts.
    const ende = menuQuelle.lastIndexOf(']),', iWorkflows);
    expect(ende).toBeGreaterThan(iBereich);
    const dazwischen = menuQuelle.slice(ende + 3, iWorkflows);
    expect(dazwischen.replace(/\/\/.*$/gm, '').trim()).toBe('');
  });

  it('«Workflow-Läufe anzeigen» steht im Menü «Ansicht» hinter der Übersicht der Datenbank', () => {
    const iAnsicht = menuQuelle.indexOf("label: t('menu.view.title')");
    const iDatenbank = menuQuelle.indexOf("label: t('menu.view.databaseOverview')");
    const iLaeufe = menuQuelle.indexOf('buildWorkflowRunsViewItem({');
    expect(iAnsicht).toBeGreaterThan(-1);
    expect(iDatenbank).toBeGreaterThan(iAnsicht);
    expect(iLaeufe).toBeGreaterThan(iDatenbank);
    const dazwischen = menuQuelle.slice(iDatenbank, iLaeufe);
    expect(dazwischen.match(/label: t\(/g) || []).toHaveLength(1);
  });
});

// 4T-002426 (Epic 3E-000366, Story 4S-001138, AK1, AK5, AK6): Workflows
// verknüpfter Bereiche im Untermenü — je Quelle ein Block mit dem Kürzel.
describe('Untermenü «Workflows»: Workflows verknüpfter Bereiche (4T-002426)', () => {
  const tFremd = (k) => (k === 'workflow.verknuepft.eintrag' ? '{name} (@{prefix})' : `«${k}»`);
  const fremd = (name, relPath) => ({
    kind: 'workflow',
    name,
    relPath,
    absPath: `D:/Zentral/Abläufe/${relPath}`,
    sourceKey: 'zt',
  });
  const quelle = {
    key: 'zt',
    name: 'Zentral',
    folder: 'D:/Zentral/Abläufe',
    items: [
      fremd('Posteingang leeren', 'Posteingang.md'),
      {
        kind: 'group',
        name: 'Projekte',
        relPath: 'Projekte',
        items: [fremd('Start', 'Projekte/Start.md')],
      },
    ],
    workflows: [],
  };

  it('setzt nach den eigenen je Quelle einen Block mit Kürzel; gleiche Namen bleiben unterscheidbar', () => {
    gesendet.length = 0;
    const eintrag = buildWorkflowsSubmenu({
      t: tFremd,
      send,
      liste: liste({ items: [wf('Posteingang leeren', 'Posteingang.md')], linked: [quelle] }),
    });
    expect(labels(eintrag.submenu)).toEqual([
      'Posteingang leeren',
      '---',
      'Posteingang leeren (@zt)',
      'Projekte (@zt)',
      '---',
      '«workflow.seite.kommando»',
      '«workflow.menu.new»',
      '«workflow.menu.chooseFolder»',
    ]);
    expect(labels(eintrag.submenu[3].submenu)).toEqual(['Start (@zt)']);
    eintrag.submenu[2].click();
    eintrag.submenu[0].click();
    expect(gesendet).toEqual([
      [MENU_ACTION_CHANNEL, { kind: 'start', path: 'D:/Zentral/Abläufe/Posteingang.md' }],
      [MENU_ACTION_CHANNEL, { kind: 'start', path: 'C:/Notizen/Abläufe/Posteingang.md' }],
    ]);
  });

  it('zeigt fremde Workflows auch ohne eigenen Ordner und ohne Quelle keinen Block', () => {
    const ohneOrdner = buildWorkflowsSubmenu({
      t: tFremd,
      send,
      liste: liste({ source: 'none', folder: null, linked: [quelle] }),
    });
    expect(labels(ohneOrdner.submenu)).toEqual([
      '«workflow.menu.noFolder»',
      '---',
      'Posteingang leeren (@zt)',
      'Projekte (@zt)',
      '---',
      '«workflow.menu.chooseFolder»',
    ]);
    const ohneQuelle = buildWorkflowsSubmenu({
      t: tFremd,
      send,
      liste: liste({ items: [wf('A', 'A.md')], linked: [] }),
    });
    expect(labels(ohneQuelle.submenu)).not.toContain('Posteingang leeren (@zt)');
    expect(labels(ohneQuelle.submenu).filter((l) => l === '---')).toHaveLength(1);
  });

  it('maskiert das Und-Zeichen auch im Namen eines fremden Workflows', () => {
    const eintrag = buildWorkflowsSubmenu({
      t: tFremd,
      send,
      liste: liste({
        linked: [{ ...quelle, items: [fremd('Hin & Her', 'H.md')] }],
      }),
    });
    expect(labels(eintrag.submenu)).toContain('Hin && Her (@zt)');
  });
});
