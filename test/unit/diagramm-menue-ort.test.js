// 4T-002024 (Epic 3E-000192): Wächter über den Menü-Ort und die Freigabe der
// beiden Diagramm-Befehle «Diagramm zu dieser Tabelle einfügen» und «Diagramm
// bearbeiten» im Menü der Anwendung.
//
// Der Ort ist ein Vorschlag für den Struktur-Prüfschritt vor dem Release:
// Menü «Ansicht», Untermenü «Diagramm», nach «Canvas-Fläche bearbeiten» und vor
// der Checkbox «Bearbeiten». Verrutscht ein Eintrag, ist die spätere Anleitung
// still falsch; deshalb steht der Ort hier fest.
//
// Geprüft wird wie beim Vorbild canvas-menü-ort.test.js zweifach: gegen den
// QUELLTEXT von menu.js und am GEBAUTEN Baum. Electron ist dafür auf die eine
// Stelle gestellt, die buildMenu braucht (Menu.buildFromTemplate reicht die
// Vorlage zurück); das Ergebnis ist damit der Baum, den menu.js baut.
//
// Dazu die eine Zusage, die über die beiden Einträge hinausreicht: Die
// Menü-Fabrik übernimmt seit diesem Vorgang `editMode` aus dem gemeldeten
// Zustand statt fest `false`. Kein anderer Eintrag darf dadurch seine Freigabe
// ändern. Belegt wird das einmal am Modell (keine Bedingung eines anderen
// Menü-Kommandos liest das Feld) und einmal am gebauten Baum (jeder Eintrag
// außer den beiden neuen hat mit und ohne Bearbeiten dieselbe Freigabe), je mit
// Rot-Probe.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extensionById } from '../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../src/shared/extensions/extensions-core.js';
import { COMMANDS } from '../../src/shared/commands/commands.js';
import {
  AVAILABILITY_CATALOG,
  AVAILABILITY_CONTEXT_FIELDS,
  availabilityCondition,
  availabilityContext,
  isAvailable,
} from '../../src/shared/commands/command-availability.js';

const cjs = createRequire(import.meta.url);
const electronPfad = cjs.resolve('electron');
cjs.cache[electronPfad] = {
  id: electronPfad,
  filename: electronPfad,
  loaded: true,
  exports: { Menu: { buildFromTemplate: (template) => template } },
};
const { buildMenu, tForLocale } = cjs('../../src/main/menu/menu.js');
const { normalizeMenuState } = cjs('../../src/main/menu/menu-state.js');
const { diagrammeBruecke } = cjs('../../src/main/preload-diagramme.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');
const menuQuelle = lies('src/main/menu/menu.js');

const NEU = ['chart.insert', 'chart.edit'];
const MARKE_UNTERMENUE = "submenuOrNull('menu.view.chart', [";
const MARKE_CANVAS = "submenuOrNull('menu.view.canvasEdit', [";
const MARKE_BEARBEITEN = "label: t('menu.view.edit'),";

// --- Der Quelltext ----------------------------------------------------------

/**
 * Der Quelltext-Abschnitt eines Untermenüs, von seinem Aufruf bis zur
 * schließenden Klammer seiner Item-Liste, über die Klammer-Zählung
 * geschnitten (Muster canvas-menü-ort.test.js).
 */
function abschnitt(quelle, marke) {
  const start = quelle.indexOf(marke);
  if (start < 0) return null;
  let tiefe = 0;
  for (let i = start + marke.length - 1; i < quelle.length; i++) {
    if (quelle[i] === '[') tiefe++;
    else if (quelle[i] === ']') {
      tiefe--;
      if (tiefe === 0) return quelle.slice(start, i + 1);
    }
  }
  return null;
}

/** Befund-Liste des Orts-Wächters; eigene Funktion für die Rot-Probe. */
function ortsBefunde(quelle) {
  const b = [];
  const eigen = abschnitt(quelle, MARKE_UNTERMENUE);
  if (!eigen) return ['Untermenü «Diagramm» fehlt'];
  const iEigen = quelle.indexOf(MARKE_UNTERMENUE);
  const canvas = abschnitt(quelle, MARKE_CANVAS);
  if (!canvas) b.push('Untermenü «Canvas-Fläche bearbeiten» fehlt');
  else if (quelle.indexOf(MARKE_CANVAS) + canvas.length > iEigen)
    b.push('«Diagramm» steht nicht nach «Canvas-Fläche bearbeiten»');
  const iBearbeiten = quelle.indexOf(MARKE_BEARBEITEN, iEigen);
  if (iBearbeiten < 0) b.push('Checkbox «Bearbeiten» steht nicht nach «Diagramm»');
  const ausserhalb = quelle.replace(eigen, '');
  let letzte = -1;
  for (const id of NEU) {
    const marke = `unless('${id}', {`;
    const i = eigen.indexOf(marke);
    if (i < 0) b.push(`${id} steht nicht im Untermenü`);
    else if (i < letzte) b.push(`${id} steht in falscher Reihenfolge`);
    else letzte = i;
    if (ausserhalb.includes(marke)) b.push(`${id} steht zusätzlich außerhalb des Untermenüs`);
  }
  return b;
}

describe('Diagramm: Menü-Ort im Quelltext (4T-002024)', () => {
  it('Untermenü «Diagramm» nach «Canvas-Fläche bearbeiten», vor «Bearbeiten», mit beiden Einträgen', () => {
    expect(ortsBefunde(menuQuelle)).toEqual([]);
  });

  it('die Prüfung feuert an einem eingebauten Verstoß', () => {
    // Rot-Probe: Der Bearbeiten-Eintrag zieht auf die oberste Ebene.
    const eigen = abschnitt(menuQuelle, MARKE_UNTERMENUE);
    const marke = "unless('chart.edit', {";
    const verschoben = menuQuelle.replace(
      eigen,
      `${marke}\n}),\n${eigen.replace(marke, "unless('chart.editX', {")}`,
    );
    expect(ortsBefunde(verschoben).join(' | ')).toContain('chart.edit');
  });
});

// --- Der gebaute Baum -------------------------------------------------------

const EDIT_LABEL = tForLocale('de', 'menu.view.edit');
const UNTERMENUE = tForLocale('de', 'menu.view.chart');
const LABEL = {
  'chart.insert': tForLocale('de', 'command.chart.insert'),
  'chart.edit': tForLocale('de', 'command.chart.edit'),
};

/** Das Ansichtsmenü eines gebauten Baums, gefunden über «Bearbeiten». */
function ansichtsMenue(template) {
  const top = template.find(
    (t) => Array.isArray(t.submenu) && t.submenu.some((i) => i && i.label === EDIT_LABEL),
  );
  return top ? top.submenu : [];
}

function baue(roh, win = null) {
  // Der Weg des Programms: der gemeldete Zustand durch die Normalisierung,
  // danach die Menü-Fabrik (menu-apply.js).
  const state = normalizeMenuState({ locale: 'de', ...roh }, roh.stored || {});
  return buildMenu(win, state, null);
}

function diagrammEintraege(roh) {
  const ansicht = ansichtsMenue(baue(roh));
  const u = ansicht.find((i) => i.label === UNTERMENUE);
  return u ? u.submenu : null;
}

/** Jede Ebene des Baums, damit die Suche kein Untermenü auslässt. */
function alleEbenen(items) {
  const out = [items];
  for (const i of items) if (i && Array.isArray(i.submenu)) out.push(...alleEbenen(i.submenu));
  return out;
}

const LIVE_BEARBEITEN = { viewMode: 'live', hasActiveTab: true, editMode: true };

describe('Diagramm: das gebaute Untermenü (4T-002024)', () => {
  it('steht im Ansichtsmenü nach «Canvas-Fläche bearbeiten» und vor «Bearbeiten»', () => {
    const ansicht = ansichtsMenue(baue(LIVE_BEARBEITEN));
    const iEigen = ansicht.findIndex((i) => i.label === UNTERMENUE);
    const iCanvas = ansicht.findIndex((i) => i.label === tForLocale('de', 'menu.view.canvasEdit'));
    const iEdit = ansicht.findIndex((i) => i.label === EDIT_LABEL);
    expect(iEigen).toBeGreaterThan(-1);
    expect(iCanvas).toBeGreaterThan(-1);
    expect(iCanvas).toBeLessThan(iEigen);
    expect(iEigen).toBeLessThan(iEdit);
    expect(ansicht[iEigen].submenu.map((i) => i.label)).toEqual([
      LABEL['chart.insert'],
      LABEL['chart.edit'],
    ]);
  });

  // Freigabe je Lage und Ansicht (AK16, AK17, AK24, AK31 des Vorgangs), am
  // gebauten Baum und durch die Normalisierung des gemeldeten Zustands.
  const FAELLE = [
    [
      'Live, Bearbeiten, Tabelle angeklickt',
      { ...LIVE_BEARBEITEN, inDatentabelle: true },
      [true, false],
    ],
    [
      'Live, Bearbeiten, Diagramm ausgewählt',
      { ...LIVE_BEARBEITEN, diagrammGewaehlt: true },
      [false, true],
    ],
    [
      'Quelltext, Bearbeiten, beide Lagen',
      { ...LIVE_BEARBEITEN, viewMode: 'source', inDatentabelle: true, diagrammGewaehlt: true },
      [true, true],
    ],
    [
      'geteilt, Bearbeiten, beide Lagen',
      { ...LIVE_BEARBEITEN, viewMode: 'split', inDatentabelle: true, diagrammGewaehlt: true },
      [true, true],
    ],
    ['Live, Bearbeiten, ohne Lage', LIVE_BEARBEITEN, [false, false]],
    [
      'Live, Anzeige, beide Lagen',
      { ...LIVE_BEARBEITEN, editMode: false, inDatentabelle: true, diagrammGewaehlt: true },
      [false, false],
    ],
    [
      'geteilt, Anzeige, beide Lagen',
      {
        ...LIVE_BEARBEITEN,
        viewMode: 'split',
        editMode: false,
        inDatentabelle: true,
        diagrammGewaehlt: true,
      },
      [false, false],
    ],
    [
      'Lese-Ansicht, beide Lagen',
      { ...LIVE_BEARBEITEN, viewMode: 'rendered', inDatentabelle: true, diagrammGewaehlt: true },
      [false, false],
    ],
    [
      'Canvas-Ansicht, beide Lagen',
      {
        ...LIVE_BEARBEITEN,
        viewMode: 'canvas',
        canvasTab: true,
        inDatentabelle: true,
        diagrammGewaehlt: true,
      },
      [false, false],
    ],
    [
      'Handbuch-Seite, beide Lagen',
      { ...LIVE_BEARBEITEN, manualTab: true, inDatentabelle: true, diagrammGewaehlt: true },
      [false, false],
    ],
    ['frisches Fenster ohne Report', {}, [false, false]],
  ];
  for (const [name, roh, [insert, edit]] of FAELLE) {
    it(`Freigabe: ${name}`, () => {
      const eintraege = diagrammEintraege(roh);
      expect(eintraege, 'Untermenü «Diagramm» fehlt').toBeTruthy();
      expect(eintraege.map((i) => i.enabled)).toEqual([insert, edit]);
    });
  }

  it('ein Klick sendet den Kanal des Eintrags an das Fenster', () => {
    const send = vi.fn();
    const win = { isDestroyed: () => false, webContents: { send } };
    const ansicht = ansichtsMenue(baue({ ...LIVE_BEARBEITEN, inDatentabelle: true }, win));
    const [einfuegen, bearbeiten] = ansicht.find((i) => i.label === UNTERMENUE).submenu;
    einfuegen.click();
    bearbeiten.click();
    expect(send.mock.calls).toEqual([['menu:chartInsert'], ['menu:chartEdit']]);
  });
});

describe('Diagramm: Aus-Zustand der Erweiterung (AK22)', () => {
  it('die Erweiterung führt beide Kommandos, auch über ihre Abhängigkeit', () => {
    expect(extensionById('perspective-chart').commands).toEqual(NEU);
    // Die Datentabelle ist die einzige Quelle; ist sie aus, ist es auch das
    // Diagramm, und mit ihm die beiden Kommandos.
    for (const aus of [['perspective-chart'], ['perspective-datatable']]) {
      const menge = disabledCommandIdSet(aus);
      for (const id of NEU) expect(menge.has(id), `${id} bei ${aus}`).toBe(true);
    }
  });

  it('abgeschaltet: weder Einträge noch leeres Untermenü noch Trenner bleiben stehen', () => {
    const ansicht = ansichtsMenue(
      baue({
        ...LIVE_BEARBEITEN,
        inDatentabelle: true,
        diagrammGewaehlt: true,
        stored: { disabledCommands: [...disabledCommandIdSet(['perspective-chart'])] },
      }),
    );
    expect(ansicht.length).toBeGreaterThan(5);
    for (const ebene of alleEbenen(ansicht)) {
      expect(ebene.some((i) => i.label === UNTERMENUE)).toBe(false);
      for (const id of NEU) expect(ebene.some((i) => i.label === LABEL[id])).toBe(false);
      expect(ebene.some((i) => Array.isArray(i.submenu) && i.submenu.length === 0)).toBe(false);
      expect(ebene[ebene.length - 1] && ebene[ebene.length - 1].type).not.toBe('separator');
      for (let i = 1; i < ebene.length; i++) {
        expect(ebene[i].type === 'separator' && ebene[i - 1].type === 'separator').toBe(false);
      }
    }
  });
});

describe('Diagramm: Verdrahtung vom Menü bis zur Ausführung (4T-002024)', () => {
  it('Brücke: beide Kanäle rufen den eingetragenen Hörer', () => {
    const hoerer = new Map();
    const ipcRenderer = { on: (kanal, fn) => hoerer.set(kanal, fn), invoke: vi.fn() };
    const bruecke = diagrammeBruecke(ipcRenderer);
    const insert = vi.fn();
    const edit = vi.fn();
    bruecke.onMenuChartInsert(insert);
    bruecke.onMenuChartEdit(edit);
    hoerer.get('menu:chartInsert')({});
    hoerer.get('menu:chartEdit')({});
    expect(insert).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('Bindung und Kommando-Tabelle führen zu denselben beiden Funktionen', () => {
    // Gelesen wird der Quelltext, weil beide Module den ganzen Anzeige-Prozess
    // nachziehen (Muster kanban-anlegen.test.js).
    const bindungen = lies('src/renderer/modules/app/app-menu-bindings.js');
    expect(bindungen).toContain(
      'api.onMenuChartInsert(() => runChartInsert(state.activePaneIndex))',
    );
    expect(bindungen).toContain('api.onMenuChartEdit(() => runChartEdit(state.activePaneIndex))');
    const tabelle = lies('src/renderer/modules/app/app-commands.js');
    expect(tabelle).toContain("'chart.insert': () => runChartInsert(state.activePaneIndex)");
    expect(tabelle).toContain("'chart.edit': () => runChartEdit(state.activePaneIndex)");
    for (const quelle of [bindungen, tabelle]) {
      expect(quelle).toContain("from '../charts/chart-commands.js'");
    }
  });

  it('die Lage kommt aus derselben Quelle wie in der Palette und wird gemeldet', () => {
    const tabs = lies('src/renderer/modules/tabs/tabs.js');
    const palette = lies('src/renderer/modules/command-palette.js');
    const aufruf = 'lageFuer(paneEditors[state.activePaneIndex], tab)';
    expect(tabs).toContain(aufruf);
    expect(palette).toContain(aufruf);
    for (const quelle of [tabs, palette]) {
      expect(quelle).toContain('inDatentabelle: lage.inDatentabelle');
      expect(quelle).toContain('diagrammGewaehlt: lage.diagrammGewaehlt');
    }
  });
});

// --- editMode ändert keinen anderen Eintrag -----------------------------------

describe('Diagramm: das echte editMode ändert keinen anderen Menü-Eintrag (4T-002024)', () => {
  // Am Modell: Kein Menü-Kommando außer den beiden neuen trägt eine Bedingung,
  // die editMode liest. Die Menge der Menü-Kommandos ist die Registry-Markierung
  // menu: true; dass sie mit den Einträgen in menu.js übereinstimmt, hält
  // menu-accelerator.test.js fest.
  function modellBefunde(kommandos, katalog) {
    const liest = new Set(katalog.filter((b) => b.felder.includes('editMode')).map((b) => b.name));
    return kommandos
      .filter((c) => c.menu && !NEU.includes(c.id) && liest.has(c.availability))
      .map((c) => `${c.id}: ${c.availability}`);
  }

  it('am Modell: keine Bedingung eines anderen Menü-Kommandos liest editMode', () => {
    expect(modellBefunde(COMMANDS, AVAILABILITY_CATALOG)).toEqual([]);
    // Und die beiden neuen lesen es wirklich — sonst prüfte der Fall nichts.
    for (const id of NEU) {
      const cmd = COMMANDS.find((c) => c.id === id);
      expect(availabilityCondition(cmd.availability).felder).toContain('editMode');
    }
  });

  it('am Modell: die Prüfung feuert, wenn ein Menü-Kommando die Editor-Bedingung trüge (Rot-Probe)', () => {
    const gedreht = COMMANDS.map((c) =>
      c.id === 'file.save' ? { ...c, availability: 'editor' } : c,
    );
    expect(modellBefunde(gedreht, AVAILABILITY_CATALOG)).toEqual(['file.save: editor']);
  });

  // Am gebauten Baum: Jeder Eintrag außer den beiden neuen hat mit und ohne
  // Bearbeiten dieselbe Freigabe, über eine Reihe gemeldeter Zustände.
  function freigaben(items, pfad = '', out = new Map()) {
    items.forEach((i, n) => {
      if (!i || i.type === 'separator') return;
      const schluessel = `${pfad}/${i.label || i.role || n}`;
      out.set(schluessel, i.enabled);
      if (Array.isArray(i.submenu)) freigaben(i.submenu, schluessel, out);
    });
    return out;
  }

  function baumBefunde(zustaende, ausgenommen) {
    const b = [];
    for (const roh of zustaende) {
      const ohne = freigaben(baue({ ...roh, editMode: false }));
      const mit = freigaben(baue({ ...roh, editMode: true }));
      for (const [schluessel, wert] of mit) {
        if (ausgenommen.some((a) => schluessel.includes(a))) continue;
        if (ohne.get(schluessel) !== wert) b.push(`${schluessel} (${JSON.stringify(roh)})`);
      }
      if (ohne.size !== mit.size) b.push(`Baum-Größe weicht ab (${JSON.stringify(roh)})`);
    }
    return b;
  }

  const ZUSTAENDE = [];
  for (const viewMode of ['source', 'split', 'live', 'rendered', 'mindmap', 'canvas', 'kanban']) {
    for (const hasActiveTab of [true, false]) {
      ZUSTAENDE.push({
        viewMode,
        hasActiveTab,
        canvasTab: viewMode === 'canvas',
        tafelTab: viewMode === 'kanban',
        inDatentabelle: true,
        diagrammGewaehlt: true,
      });
    }
  }
  ZUSTAENDE.push({ viewMode: 'live', hasActiveTab: true, manualTab: true });
  ZUSTAENDE.push({ viewMode: 'source', hasActiveTab: true, systemTab: true });
  ZUSTAENDE.push({ viewMode: 'source', hasActiveTab: true, leeresDokument: true });

  it('am gebauten Baum: jeder andere Eintrag hat mit und ohne Bearbeiten dieselbe Freigabe', () => {
    const ausgenommen = [`/${UNTERMENUE}/`];
    expect(baumBefunde(ZUSTAENDE, ausgenommen)).toEqual([]);
    // Der Vergleich umfasst den ganzen Baum, nicht eine Handvoll Einträge.
    expect(freigaben(baue(ZUSTAENDE[0])).size).toBeGreaterThan(80);
  });

  it('am gebauten Baum: der Vergleich findet einen Eintrag, der editMode folgt (Rot-Probe)', () => {
    // Ohne die Ausnahme sind die beiden Diagramm-Einträge selbst solche
    // Einträge: Der Vergleich muss sie melden, sonst wäre sein Schweigen oben
    // wertlos.
    const befunde = baumBefunde([ZUSTAENDE[0]], []);
    expect(befunde.some((b) => b.includes(LABEL['chart.insert']))).toBe(true);
    expect(befunde.some((b) => b.includes(LABEL['chart.edit']))).toBe(true);
  });

  it('am Modell über alle Kontexte: nur die beiden Diagramm-Bedingungen folgen editMode unter den Menü-Kommandos', () => {
    // Die Grundgesamtheit wie in command-availability.test.js, ohne die beiden
    // Lage-Felder (sie stehen auf true, damit die Diagramm-Bedingungen
    // überhaupt freigeben können).
    const bool = AVAILABILITY_CONTEXT_FIELDS.filter(
      (f) => !['viewMode', 'editMode', 'inDatentabelle', 'diagrammGewaehlt'].includes(f),
    );
    const namen = new Set(COMMANDS.filter((c) => c.menu).map((c) => c.availability));
    const folgen = new Set();
    for (let maske = 0; maske < 1 << bool.length; maske += 1) {
      for (const viewMode of ['source', 'split', 'live', 'rendered', 'canvas', 'kanban', null]) {
        const roh = { viewMode, inDatentabelle: true, diagrammGewaehlt: true };
        bool.forEach((f, i) => {
          roh[f] = (maske & (1 << i)) !== 0;
        });
        const ohne = availabilityContext({ ...roh, editMode: false });
        const mit = availabilityContext({ ...roh, editMode: true });
        for (const name of namen)
          if (isAvailable(name, ohne) !== isAvailable(name, mit)) folgen.add(name);
      }
    }
    expect([...folgen].sort()).toEqual(['datentabelleAenderbar', 'diagrammAenderbar']);
  });
});
