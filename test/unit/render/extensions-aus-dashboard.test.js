// 4T-002513 (Epic 3E-000402): Erweiterung «Dashboard» und Kommando «Dashboard
// einfügen». Muster extensions-aus.test.js und extensions-aus-diagramm.test.js:
// An-Zustand, Aus-Zustand und Umschalten an derselben Quelle, dazu der
// Registry-Eintrag samt Modus-Stufe und die Filterung des Kommandos.
//
// **Warum die Nachbar-Module des Editors Attrappen sind** (Muster
// renderer/canvas-einfuegen.test.js): Geprüft wird die Schablone und der
// Dispatch-Pfad, nicht CodeMirror. Die View ist eine Attrappe mit Zähler, der
// Titel der Kachel kommt aus einer Attrappe der Übersetzung, und die Gegenprobe
// läuft über die echte, prozessneutrale Pipeline.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {},
  $: () => null,
  getDocText: (doc) => String(doc),
}));
vi.mock('../../../src/renderer/modules/tasks.js', () => ({
  withCreatedDate: (zeile) => zeile,
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: () => {},
}));
const uebersetzt = [];
vi.mock('../../../src/renderer/i18n.js', () => ({
  t: (key) => {
    uebersetzt.push(key);
    return key === 'command.insert.dashboardKachelTitel' ? 'Anzahl' : key;
  },
}));

const { renderMarkdown, configureExtensions } =
  await import('../../../src/shared/markdown/markdown.js');
const { FORMAT_COMMANDS } = await import('../../../src/renderer/modules/editor/editor-format.js');
const { insertDashboard } = await import('../../../src/shared/markdown-format.js');
const { COMMANDS } = await import('../../../src/shared/commands/commands.js');
const { extensionById, validateExtensionRegistry, internalExtensions } =
  await import('../../../src/shared/extensions/extensions.js');
const {
  disabledCommandIdSet,
  disabledIdsForModeLevel,
  effectiveDisabledSet,
  blockingDependentIds,
  isExtensionEnabled,
} = await import('../../../src/shared/extensions/extensions-core.js');
const { DASHBOARD_EXTENSION_ID, dashboardGeruest } =
  await import('../../../src/shared/dashboard/dashboard-core.js');

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

afterEach(() => {
  configureExtensions([]);
});

const QUELLE =
  '# Überblick\n\n```perspective-dashboard\n!zeile\n!kachel kennzahl titel="Anzahl"\nLIST\n```\n';

function renderOff(src) {
  configureExtensions([DASHBOARD_EXTENSION_ID]);
  return renderMarkdown(src, 'de');
}

// Wendet die Änderungen einer Transaktion an, wie CodeMirror es täte.
function anwenden(text, changes) {
  let ergebnis = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    ergebnis = ergebnis.slice(0, c.from) + c.insert + ergebnis.slice(c.to);
  }
  return ergebnis;
}

function attrappeView({ text = '', pos = text.length, readOnly = false } = {}) {
  const transaktionen = [];
  return {
    transaktionen,
    state: {
      readOnly,
      doc: { toString: () => text },
      selection: { main: { head: pos, from: pos, to: pos } },
    },
    dispatch: (tr) => transaktionen.push(tr),
    focus: () => {},
  };
}

describe('Erweiterung «Dashboard»: Registry-Eintrag (4T-002513, AK1)', () => {
  it('steht mit Kategorie, Stufe Fortgeschritten und Katalog-Schlüsseln in der Registry', () => {
    const m = extensionById('dashboard');
    expect(m).toMatchObject({
      id: DASHBOARD_EXTENSION_ID,
      category: 'render',
      modeLevel: 'advanced',
      nameKey: 'help.featureName.dashboard',
      descKey: 'help.feature.dashboard',
      commands: ['insert.dashboard'],
    });
    expect(m.dependencies === undefined || m.dependencies.length === 0).toBe(true);
    expect(validateExtensionRegistry(internalExtensions())).toEqual([]);
  });

  it('ist im Modus Einsteiger aus, in Fortgeschritten und Voll an', () => {
    expect(disabledIdsForModeLevel('beginner')).toContain('dashboard');
    expect(disabledIdsForModeLevel('advanced')).not.toContain('dashboard');
    expect(disabledIdsForModeLevel('full')).not.toContain('dashboard');
    expect(isExtensionEnabled('dashboard', [])).toBe(true);
    expect(isExtensionEnabled('dashboard', disabledIdsForModeLevel('beginner'))).toBe(false);
  });

  it('hängt an keiner anderen Erweiterung, auch nicht am Abfrage-Diagramm', () => {
    // Regel E3: Ist `query-chart` aus, zeigen Balken und Kreis die Tabelle mit
    // Hinweis; das ist Verarmung, kein Bruch, und schaltet nichts mit ab.
    expect(effectiveDisabledSet(['query-chart']).has('dashboard')).toBe(false);
    expect(blockingDependentIds('query-chart', [])).not.toContain('dashboard');
  });

  it('Name und Beschreibung stehen in allen fünf Sprachfassungen', () => {
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const woerter = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of [
        'help.featureName.dashboard',
        'help.feature.dashboard',
        'help.featureAccess.dashboard',
        'command.insert.dashboard',
        'command.insert.dashboardKachelTitel',
      ]) {
        expect(woerter[key], `${sprache}.json fehlt ${key}`).toBeTruthy();
      }
    }
  });
});

describe('Erweiterung «Dashboard»: An- und Aus-Zustand (4T-002513, AK2 bis AK4)', () => {
  it('AK2: an wird der Block gezeichnet, und das Kommando bleibt erhalten', () => {
    const html = renderMarkdown(QUELLE, 'de');
    expect(html).toContain('class="perspective-dashboard"');
    expect(html).not.toContain('dashboard-aus-hinweis');
    expect(disabledCommandIdSet([]).has('insert.dashboard')).toBe(false);
    expect(disabledCommandIdSet(disabledIdsForModeLevel('advanced')).has('insert.dashboard')).toBe(
      false,
    );
  });

  it('AK3: aus steht der Quelltext mit Hinweis, und das Kommando ist gefiltert', () => {
    const vorher = String(QUELLE);
    const off = renderOff(QUELLE);
    expect(off).not.toContain('class="perspective-dashboard"');
    expect(off).toContain('class="dashboard-aus-hinweis"');
    expect(off).toContain('Die Erweiterung «Dashboard» ist ausgeschaltet');
    expect(off).toContain('language-perspective-dashboard');
    expect(off).toContain('!kachel kennzahl');
    expect(QUELLE).toBe(vorher);
    // Gefiltert über die Kommando-Menge, die Palette, Tastenbelegung,
    // Tastenkürzel-Seite und Kontextmenü gemeinsam lesen; der Modus Einsteiger
    // kommt über denselben Weg.
    expect(disabledCommandIdSet(['dashboard']).has('insert.dashboard')).toBe(true);
    expect(disabledCommandIdSet(disabledIdsForModeLevel('beginner')).has('insert.dashboard')).toBe(
      true,
    );
    // Die Nachbarn im Einfügen-Untermenü bleiben unberührt.
    for (const id of ['insert.table', 'insert.codeBlock', 'insert.canvas']) {
      expect(disabledCommandIdSet(['dashboard']).has(id), id).toBe(false);
    }
  });

  it('AK3: der Kontextmenü-Eintrag hängt an derselben Kommando-Menge', () => {
    const quelle = lies('src/renderer/modules/editor/editor-context-menu.js');
    expect(quelle).toContain(
      "if (!aus.has('insert.dashboard')) submenu.push(ins('dashboard', 'insert-dashboard'));",
    );
  });

  it('AK4: das Umschalten wirkt ohne Neustart auf dieselbe Quelle', () => {
    expect(renderMarkdown(QUELLE, 'de')).toContain('class="perspective-dashboard"');
    expect(renderOff(QUELLE)).toContain('class="dashboard-aus-hinweis"');
    configureExtensions([]);
    const wieder = renderMarkdown(QUELLE, 'de');
    expect(wieder).toContain('class="perspective-dashboard"');
    expect(wieder).not.toContain('dashboard-aus-hinweis');
  });
});

describe('Kommando «Dashboard einfügen» (4T-002513, AK2 und AK5)', () => {
  const cmd = COMMANDS.find((c) => c.id === 'insert.dashboard');

  it('steht in der Registry wie die übrigen Einfüge-Kommandos', () => {
    expect(cmd).toMatchObject({
      labelKey: 'command.insert.dashboard',
      descKey: 'help.feature.dashboard',
      categoryKey: 'help.group.editing',
      defaultBindings: [],
      menu: false,
      editorScoped: true,
      availability: 'editor',
    });
    expect(typeof FORMAT_COMMANDS['insert.dashboard']).toBe('function');
  });

  it('AK5: fügt eine Zeile mit einer Kennzahl-Kachel über alle Treffer ein', () => {
    uebersetzt.length = 0;
    const text = 'Vorher\n\nNachher';
    const view = attrappeView({ text, pos: 6 });
    expect(FORMAT_COMMANDS['insert.dashboard'](view)).toBe(true);
    expect(view.transaktionen).toHaveLength(1);
    const tr = view.transaktionen[0];
    expect(tr.userEvent).toBe('input');
    const ergebnis = anwenden(text, tr.changes);
    expect(ergebnis).toBe(`Vorher\n\n${dashboardGeruest('Anzahl')}\n\nNachher`);
    expect(uebersetzt).toEqual(['command.insert.dashboardKachelTitel']);
    // Die Abfrage der Kachel ist ausgewählt; wer einfügt, ersetzt sie als Nächstes.
    expect(ergebnis.slice(tr.selection.anchor, tr.selection.head)).toBe('LIST');
    const html = renderMarkdown(ergebnis, 'de');
    expect(html.match(/class="dashboard-zeile"/g)).toHaveLength(1);
    expect(html.match(/data-dashboard-zeile=/g)).toHaveLength(1);
    expect(html).toContain('Anzahl');
  });

  it('AK5: eine von Hand ergänzte zweite Kachel erscheint in derselben Zeile daneben', () => {
    const { changes } = insertDashboard('', 0, 'Anzahl');
    const geruest = anwenden('', changes);
    const ergaenzt = geruest.replace('LIST\n```', 'LIST\n!kachel liste titel="Zuletzt"\nLIST\n```');
    const html = renderMarkdown(ergaenzt, 'de');
    expect(html.match(/class="dashboard-zeile"/g)).toHaveLength(1);
    expect(html.match(/data-dashboard-zeile=/g)).toHaveLength(2);
    expect(html).toContain('Zuletzt');
  });

  it('bleibt im schreibgeschützten Editor und ohne Editor folgenlos', () => {
    const view = attrappeView({ text: 'Text', pos: 4, readOnly: true });
    expect(FORMAT_COMMANDS['insert.dashboard'](view)).toBe(false);
    expect(view.transaktionen).toHaveLength(0);
    expect(FORMAT_COMMANDS['insert.dashboard'](null)).toBe(false);
  });
});
