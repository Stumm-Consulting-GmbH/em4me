// 4T-000277 (Epic 3E-000049): Unit-Tests für die Menü-State-Normalisierung
// (src/main/menu/menu-state.js). Kern ist der Regressionstest zum
// Durchreich-Fehler aus 4T-000213: der Renderer meldete manualTab, das
// frühere getMenuState (main.js) reichte das Feld aber nicht an die
// Menü-Factory durch — Speichern/Speichern unter/Bearbeiten blieben bei
// Handbuch-Tabs fälschlich aktiv. Gleicher Vertrag gilt für das neue
// systemTab der Einstellungs-Seite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { normalizeMenuState } from '../../src/main/menu/menu-state.js';

describe('normalizeMenuState (4T-000277)', () => {
  it('Regression 4T-000277: manualTab und systemTab werden durchgereicht', () => {
    const state = normalizeMenuState({ hasActiveTab: true, manualTab: true, systemTab: true }, {});
    expect(state.manualTab).toBe(true);
    expect(state.systemTab).toBe(true);
  });

  it('fehlende Read-only-Kennungen normalisieren auf false', () => {
    const state = normalizeMenuState({ hasActiveTab: true }, {});
    expect(state.manualTab).toBe(false);
    expect(state.systemTab).toBe(false);
  });

  it('liefert Defaults ohne Renderer-Report (frisches Fenster)', () => {
    const state = normalizeMenuState(null, null);
    expect(state.locale).toBe('en');
    expect(state.viewMode).toBe('rendered');
    expect(state.lineNumbers).toBe(true);
    expect(state.foldGutter).toBe(true);
    expect(state.hasActiveTab).toBe(false);
    expect(state.recentFiles).toEqual([]);
    expect(state.themePref).toBe('system');
    // 4T-000538 (Epic 3E-000098): ohne Store-Werte keine Arbeitsbereichs-Daten.
    expect(state.hasWorkspace).toBe(false);
    expect(state.workspaces).toEqual([]);
  });

  // 4T-000538 (Epic 3E-000098): Arbeitsbereichs-Zuordnung und Untermenue-Liste
  // werden fuer Menue-Dimmung und Untermenue-Aufbau durchgereicht.
  it('4T-000538: hasWorkspace und workspaces werden durchgereicht', () => {
    const list = [{ id: 'ws-1', name: 'Projekt Alpha', color: 'green', open: true }];
    const state = normalizeMenuState({}, { hasWorkspace: true, workspaces: list });
    expect(state.hasWorkspace).toBe(true);
    expect(state.workspaces).toEqual(list);
    expect(normalizeMenuState({}, { workspaces: 'kaputt' }).workspaces).toEqual([]);
  });

  it('übernimmt Renderer- und Store-Werte unverändert', () => {
    const state = normalizeMenuState(
      { locale: 'de', viewMode: 'split', lineNumbers: false, foldGutter: false, editMode: true },
      { restoreSession: true, recentFiles: ['a.md'], themePref: 'dark', hotkeys: { x: 'Ctrl+X' } },
    );
    expect(state.locale).toBe('de');
    expect(state.viewMode).toBe('split');
    expect(state.lineNumbers).toBe(false);
    expect(state.foldGutter).toBe(false);
    expect(state.editMode).toBe(true);
    expect(state.restoreSession).toBe(true);
    expect(state.recentFiles).toEqual(['a.md']);
    expect(state.themePref).toBe('dark');
    expect(state.hotkeys).toEqual({ x: 'Ctrl+X' });
  });

  // 4T-000888 (Epic 3E-000168): Die Listen „Zuletzt geöffnete Bücher/Bücherregale"
  // brauchen denselben Durchreich-Weg wie die Bereichs-Liste — fehlt er, baut
  // die Menü-Factory die beiden Untermenüs dauerhaft leer auf (Regressions-
  // Muster 4T-000277).
  it('4T-000888: reicht recentBooks und recentShelves durch', () => {
    const state = normalizeMenuState(
      {},
      { recentBooks: ['C:\\Buch1'], recentShelves: ['C:\\Regal1', 'C:\\Regal2'] },
    );
    expect(state.recentBooks).toEqual(['C:\\Buch1']);
    expect(state.recentShelves).toEqual(['C:\\Regal1', 'C:\\Regal2']);
  });

  it('4T-000888: normalisiert fehlende und ungültige Buch-/Regal-Listen auf leer', () => {
    const state = normalizeMenuState({}, { recentBooks: 'kein-array', recentShelves: 42 });
    expect(state.recentBooks).toEqual([]);
    expect(state.recentShelves).toEqual([]);
    expect(normalizeMenuState(null, null).recentBooks).toEqual([]);
    expect(normalizeMenuState(null, null).recentShelves).toEqual([]);
  });

  it('verwirft ungültige themePref- und recentFiles-Werte', () => {
    const state = normalizeMenuState({}, { themePref: 'neon', recentFiles: 'kein-array' });
    expect(state.themePref).toBe('system');
    expect(state.recentFiles).toEqual([]);
  });

  // 4T-000294 (Epic 3E-000052): Kommandos deaktivierter Erweiterungen werden
  // an die Menü-Factory durchgereicht (deren Einträge entfallen dort).
  it('reicht disabledCommands durch und normalisiert Nicht-Arrays', () => {
    const state = normalizeMenuState({}, { disabledCommands: ['view.toggleTags'] });
    expect(state.disabledCommands).toEqual(['view.toggleTags']);
    expect(normalizeMenuState({}, { disabledCommands: 'x' }).disabledCommands).toEqual([]);
    expect(normalizeMenuState(null, null).disabledCommands).toEqual([]);
  });

  // 4T-000568 (Epic 3E-000104): geordnete Panel-Liste für das Panel-Untermenü —
  // ersetzt die früheren xxxVisible-Einzel-Flags (vier davon wurden nie
  // durchgereicht, deren Menü-Häkchen blieben dauerhaft leer).
  it('4T-000568: reicht die Panel-Liste geordnet durch und erzwingt boolesche Sichtbarkeit', () => {
    const state = normalizeMenuState(
      {
        panels: [
          { id: 'bookmarks', visible: true },
          { id: 'area', visible: 0 },
          { id: 'outline', visible: 'ja' },
        ],
      },
      {},
    );
    expect(state.panels).toEqual([
      { id: 'bookmarks', visible: true },
      { id: 'area', visible: false },
      { id: 'outline', visible: true },
    ]);
  });

  it('4T-000568: verwirft ungültige Panel-Einträge und Nicht-Arrays', () => {
    const state = normalizeMenuState(
      { panels: [null, { visible: true }, { id: '' }, { id: 'notes' }, 'kaputt'] },
      {},
    );
    expect(state.panels).toEqual([{ id: 'notes', visible: false }]);
    expect(normalizeMenuState({ panels: 'kein-array' }, {}).panels).toEqual([]);
    expect(normalizeMenuState(null, null).panels).toEqual([]);
  });

  // 4T-000626 (Epic 3E-000119): Sidebar-Varianten-Listen für das Untermenü
  // „Sidebar-Anordnungen" — Gruppen global/area plus Bereichs-Name.
  it('4T-000626: reicht die Varianten-Listen durch und verwirft ungültige Einträge', () => {
    const state = normalizeMenuState(
      {
        sidebarVariants: {
          global: [
            { id: 'v1', name: 'Konzeptarbeit' },
            { id: '', name: 'ohne id' },
            { id: 'v2', name: '' },
            null,
          ],
          area: [{ id: 'a1', name: 'Bereichsblick', extra: true }],
          areaName: 'Projekte',
        },
      },
      {},
    );
    expect(state.sidebarVariants).toEqual({
      global: [{ id: 'v1', name: 'Konzeptarbeit' }],
      area: [{ id: 'a1', name: 'Bereichsblick' }],
      areaName: 'Projekte',
    });
  });

  // 4T-000881 (Epic 3E-000162): Regression zur Regal-Bindung — hasShelf wurde
  // nicht durchgereicht, «Bücherregal schließen» blieb dadurch immer
  // deaktiviert. Gleicher Vertrag wie hasArea/hasBook (Muster 4T-000277).
  it('4T-000881: hasBook und hasShelf werden durchgereicht und normalisieren auf false', () => {
    const state = normalizeMenuState({}, { hasArea: true, hasBook: true, hasShelf: true });
    expect(state.hasArea).toBe(true);
    expect(state.hasBook).toBe(true);
    expect(state.hasShelf).toBe(true);
    const leer = normalizeMenuState(null, null);
    expect(leer.hasArea).toBe(false);
    expect(leer.hasBook).toBe(false);
    expect(leer.hasShelf).toBe(false);
  });

  it('4T-000626: liefert ohne Meldung die leere Varianten-Form', () => {
    expect(normalizeMenuState(null, null).sidebarVariants).toEqual({
      global: [],
      area: [],
      areaName: null,
    });
    expect(normalizeMenuState({ sidebarVariants: 'kaputt' }, {}).sidebarVariants).toEqual({
      global: [],
      area: [],
      areaName: null,
    });
  });
});

// 4T-000900 (Epic 3E-000016): Durchlauf-Waechter der Menue-Zustands-Durchreichung.
//
// Die Einzelfaelle oben sind je aus einem Vorfall entstanden, in dem ein Feld
// still unter den Tisch fiel: 4T-000277 (manualTab), 4T-000568 (vier Panel-Flags)
// und 4T-000881 (hasShelf, der Menuepunkt blieb dauerhaft deaktiviert). Sie
// sichern genau die damals gefundenen Felder — das naechste neue Feld faellt
// genauso still aus. Dieser Waechter prueft stattdessen die ganze Menge.
//
// normalizeMenuState speist sich aus zwei Quellen, daraus zwei Richtungen:
//   base   (b.*) meldet der Renderer in tabs.js
//   stored (s.*) stellt der Hauptprozess in main.js bereit
// Beide Bereitsteller sind je ein einziges Objekt-Literal, deshalb genuegt ein
// Quelltext-Vergleich (Muster: kommando-dispatcher.test.js).
describe('Menü-Zustands-Durchreichung: Feldmengen (4T-000900)', () => {
  const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

  // Top-Level-Schluessel des Objekt-Literals, das auf `marker` folgt.
  //
  // Die Kurzschreibweise wird mitgelesen (`viewMode,` statt `viewMode: …`):
  // Beide Literale nutzen sie real, ein Ausdruck nur fuer `name: wert` meldete
  // `viewMode` und `recentFiles` faelschlich als fehlend.
  function literalSchluessel(text, marker) {
    const i = text.indexOf(marker);
    if (i < 0) throw new Error(`Marker nicht gefunden: ${marker}`);
    const start = text.indexOf('{', i);
    let tiefe = 0;
    let ende = start;
    for (; ende < text.length; ende++) {
      if (text[ende] === '{') tiefe++;
      else if (text[ende] === '}' && --tiefe === 0) break;
    }
    const schlüssel = [];
    let verschachtelt = 0;
    for (const zeile of text.slice(start + 1, ende).split('\n')) {
      if (verschachtelt === 0) {
        const treffer = zeile.trim().match(/^([A-Za-z_]\w*)\s*[,:]/);
        if (treffer) schlüssel.push(treffer[1]);
      }
      verschachtelt += (zeile.match(/[{[(]/g) || []).length - (zeile.match(/[}\])]/g) || []).length;
    }
    return schlüssel;
  }

  // Felder, die normalizeMenuState aus einer Quelle liest. Das Muster kommt als
  // Regex-Literal herein, nicht als zusammengebaute Zeichenkette: Deren
  // Maskierung ueberlebt den Schreibweg durch Werkzeuge nicht zuverlaessig, und
  // ein still entwerteter Ausdruck faende nichts mehr — der Waechter waere dann
  // gruen, ohne zu pruefen. Dagegen steht zusaetzlich die untere Schranke unten.
  const gelesene = (text, muster) => [...new Set([...text.matchAll(muster)].map((m) => m[1]))];

  const menuState = lies('src/main/menu/menu-state.js');

  it('jedes vom Renderer gemeldete Feld wird gelesen, und umgekehrt', () => {
    const gemeldet = literalSchluessel(
      lies('src/renderer/modules/tabs/tabs.js'),
      'api.reportMenuState(',
    );
    const gelesen = gelesene(menuState, /\bb\.(\w+)/g);
    // Untere Schranke gegen ein stilles Leerlaufen beider Auswertungen.
    expect(gemeldet.length).toBeGreaterThan(10);
    expect(gelesen.length).toBeGreaterThan(10);
    expect(gemeldet.filter((k) => !gelesen.includes(k))).toEqual([]);
    expect(gelesen.filter((k) => !gemeldet.includes(k))).toEqual([]);
  });

  it('jedes vom Hauptprozess bereitgestellte Feld wird gelesen, und umgekehrt', () => {
    // 4T-000998: getMenuState liegt seit dem Main-Schnitt in menu/menu-apply.js;
    // der Anker selbst ist unveraendert mitgereist.
    const bereitgestellt = literalSchluessel(
      lies('src/main/menu/menu-apply.js'),
      'return normalizeMenuState(menuStates.get(id), {',
    );
    const gelesen = gelesene(menuState, /\bs\.(\w+)/g);
    expect(bereitgestellt.length).toBeGreaterThan(8);
    expect(gelesen.length).toBeGreaterThan(8);
    expect(bereitgestellt.filter((k) => !gelesen.includes(k))).toEqual([]);
    expect(gelesen.filter((k) => !bereitgestellt.includes(k))).toEqual([]);
  });
});
