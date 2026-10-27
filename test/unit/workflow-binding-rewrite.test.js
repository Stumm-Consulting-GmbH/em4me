// 4T-002364 (Epic 3E-000184): Der Umschreib-Kern der Belegungen eines Workflows
// (src/shared/workflows/workflow-binding-rewrite.js), AK1 und AK2 des Tasks.
//
// Nur echte Module: Die Kennungen bildet das echte `workflowCommandId`, damit
// Kommando und Nachzug nicht auseinanderlaufen können, und jedes Ergebnis muss
// die echte Normalisierung der Leser unverändert bestehen.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  BELEGUNGS_SCHLUESSEL,
  belegungsAbbildung,
  schreibeBelegungenUm,
} = require('../../src/shared/workflows/workflow-binding-rewrite.js');
const { workflowCommandId } = require('../../src/shared/workflows/workflow-command-id.js');
const { normalizeCommandPlacement } = require('../../src/shared/commands/command-placement.js');
const { normalizeFormatToolbar } = require('../../src/shared/format-toolbar.js');

const ALT = workflowCommandId('Hallo.md');
const NEU = workflowCommandId('Hallo umbenannt.md');
const ABB = belegungsAbbildung([[ALT, NEU]]);

const platzierung = (id) =>
  normalizeCommandPlacement({
    statusbar: [
      { commandId: 'file.save', icon: 'save', label: null },
      { commandId: id, icon: 'zap', label: 'Mein Start' },
    ],
    contextMenu: [{ commandId: id, icon: 'play', label: null }],
    macros: [
      {
        id: 'm1',
        name: 'Kette',
        icon: 'star',
        steps: [
          { type: 'command', commandId: 'file.save' },
          { type: 'delay', seconds: 1 },
          { type: 'command', commandId: id },
        ],
      },
    ],
    hiddenButtons: ['right:zoom'],
  });

const toolbar = (id) =>
  normalizeFormatToolbar({
    entries: [
      { type: 'command', commandId: 'format.bold', icon: 'bold', label: null },
      { type: 'separator' },
      { type: 'command', commandId: id, icon: 'zap', label: 'WF' },
    ],
  });

describe('belegungsAbbildung', () => {
  it('lässt Paare ohne Wirkung weg', () => {
    const abb = belegungsAbbildung([[ALT, NEU], [ALT, ALT], ['', NEU], [null, NEU], 'kaputt']);
    expect([...abb]).toEqual([[ALT, NEU]]);
  });
});

describe('schreibeBelegungenUm — Tastenkürzel', () => {
  it('der Eintrag wandert unter die neue Kennung, der Wert bleibt', () => {
    const neu = schreibeBelegungenUm(
      { hotkeys: { 'file.save': 'Ctrl+S', [ALT]: 'Ctrl+Alt+Shift+H' } },
      ABB,
    );
    expect(neu).toEqual({ hotkeys: { 'file.save': 'Ctrl+S', [NEU]: 'Ctrl+Alt+Shift+H' } });
  });

  it('ein entbundenes Kürzel wandert ebenso', () => {
    expect(schreibeBelegungenUm({ hotkeys: { [ALT]: '' } }, ABB)).toEqual({
      hotkeys: { [NEU]: '' },
    });
  });

  it('ein Eintrag unter der neuen Kennung wird ersetzt', () => {
    const neu = schreibeBelegungenUm({ hotkeys: { [NEU]: 'Ctrl+1', [ALT]: 'Ctrl+2' } }, ABB);
    expect(neu).toEqual({ hotkeys: { [NEU]: 'Ctrl+2' } });
  });

  it('ohne Eintrag unter der alten Kennung bleibt alles unverändert: keine Änderung', () => {
    const werte = {
      hotkeys: { [NEU]: 'Ctrl+1', 'file.save': 'Ctrl+S' },
      commandPlacement: platzierung('macro.m1'),
      formatToolbar: toolbar('format.italic'),
    };
    expect(schreibeBelegungenUm(werte, ABB)).toEqual({});
  });

  it('nicht gespeicherte und defekte Werte sind «keine Änderung»', () => {
    expect(schreibeBelegungenUm({}, ABB)).toEqual({});
    expect(
      schreibeBelegungenUm({ hotkeys: [], commandPlacement: 'x', formatToolbar: null }, ABB),
    ).toEqual({});
    expect(schreibeBelegungenUm({ hotkeys: { [ALT]: 'Ctrl+H' } }, new Map())).toEqual({});
    expect(schreibeBelegungenUm(null, ABB)).toEqual({});
  });
});

describe('schreibeBelegungenUm — Plätze', () => {
  it('Statusleiste, Kontextmenü und Makro-Schritt je einmal; Symbol und Beschriftung bleiben', () => {
    const neu = schreibeBelegungenUm({ commandPlacement: platzierung(ALT) }, ABB);
    expect(Object.keys(neu)).toEqual(['commandPlacement']);
    expect(neu.commandPlacement).toEqual(platzierung(NEU));
    expect(neu.commandPlacement.statusbar[1]).toEqual({
      commandId: NEU,
      icon: 'zap',
      label: 'Mein Start',
    });
  });

  it('Format-Toolbar: der Eintrag mit Symbol und Beschriftung, Trenner bleiben', () => {
    const neu = schreibeBelegungenUm({ formatToolbar: toolbar(ALT) }, ABB);
    expect(neu).toEqual({ formatToolbar: toolbar(NEU) });
  });

  it('alle drei Schlüssel zugleich, fremde Kennungen bleiben unberührt', () => {
    const neu = schreibeBelegungenUm(
      {
        hotkeys: { [ALT]: 'Ctrl+H', 'workflow.Anderer.md': 'Ctrl+J' },
        commandPlacement: platzierung(ALT),
        formatToolbar: toolbar(ALT),
      },
      ABB,
    );
    expect(Object.keys(neu).sort()).toEqual([...BELEGUNGS_SCHLUESSEL].sort());
    expect(neu.hotkeys['workflow.Anderer.md']).toBe('Ctrl+J');
    expect(neu.commandPlacement.statusbar[0].commandId).toBe('file.save');
    expect(neu.commandPlacement.macros[0].steps[0].commandId).toBe('file.save');
    expect(neu.formatToolbar.entries[0].commandId).toBe('format.bold');
  });

  it('eine Beschriftung, die wie die Kennung lautet, bleibt Beschriftung', () => {
    const werte = {
      commandPlacement: {
        statusbar: [{ commandId: 'file.save', icon: 'save', label: ALT }],
        contextMenu: [],
        macros: [],
        hiddenButtons: [],
      },
    };
    expect(schreibeBelegungenUm(werte, ABB)).toEqual({});
  });

  it('jedes Ergebnis besteht die echte Normalisierung unverändert', () => {
    const neu = schreibeBelegungenUm(
      { commandPlacement: platzierung(ALT), formatToolbar: toolbar(ALT) },
      ABB,
    );
    expect(normalizeCommandPlacement(neu.commandPlacement)).toEqual(neu.commandPlacement);
    expect(normalizeFormatToolbar(neu.formatToolbar)).toEqual(neu.formatToolbar);
  });

  it('der Eingabewert bleibt unangetastet', () => {
    const werte = { hotkeys: { [ALT]: 'Ctrl+H' }, commandPlacement: platzierung(ALT) };
    const kopie = JSON.parse(JSON.stringify(werte));
    schreibeBelegungenUm(werte, ABB);
    expect(werte).toEqual(kopie);
  });
});

describe('Kennungen aus dem echten workflowCommandId', () => {
  const faelle = [
    ['Umlaute', 'Wöchentlich/Rückblick.md', 'Wöchentlich/Rückblick neu.md'],
    ['Leerzeichen', 'Ordner anlegen.md', 'Ordner anlegen 2.md'],
    ['Unterordner', 'Hallo.md', 'Projekte/Alt/Hallo.md'],
    ['Groß- und Kleinschreibung', 'hallo.md', 'Hallo.md'],
    ['NFD-Eingabe', 'Rückblick.md', 'Rückblick 2.md'],
  ];
  for (const [fall, alt, neu] of faelle) {
    it(fall, () => {
      const a = workflowCommandId(alt);
      const n = workflowCommandId(neu);
      expect(a).not.toBe(n);
      const ergebnis = schreibeBelegungenUm(
        { hotkeys: { [a]: 'Ctrl+K' }, commandPlacement: platzierung(a) },
        belegungsAbbildung([[a, n]]),
      );
      expect(ergebnis.hotkeys).toEqual({ [n]: 'Ctrl+K' });
      expect(ergebnis.commandPlacement).toEqual(platzierung(n));
    });
  }

  it('NFC und NFD derselben Datei ergeben dieselbe Kennung und damit keine Abbildung', () => {
    const nfd = workflowCommandId('Rückblick.md');
    const nfc = workflowCommandId('Rückblick.md');
    expect(belegungsAbbildung([[nfd, nfc]]).size).toBe(0);
  });
});
