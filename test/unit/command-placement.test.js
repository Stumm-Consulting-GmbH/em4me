// 4T-000520 (Epic 3E-000094): Datenmodell-Tests der Kommando-Platzierung
// (src/shared/commands/command-placement.js) plus Wächter über die Hide-Ziele:
// jedes Ziel existiert real in index.html, führt einen belegten i18n-Key
// und die Panel-Ziele decken das komplette Zugangs-Modell — die
// Hinweis-Zeile ist bewusst KEIN Ziel (einziger Warn-Kanal, PO-Festlegung
// Workshop-Punkt 2). Muster panel-access.test.js.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MACRO_MAX_DELAY_SECONDS,
  STATUSBAR_HIDE_TARGETS,
  defaultCommandPlacement,
  hideTargetByKey,
  macroCommandId,
  normalizeCommandPlacement,
  visibleContextMenuEntries,
} from '../../src/shared/commands/command-placement.js';
import { PANEL_ACCESS } from '../../src/shared/panel-access.js';
import { COMMAND_ICON_IDS, DEFAULT_COMMAND_ICON } from '../../src/shared/commands/command-icons.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';
import { disabledSettingsSectionIdSet } from '../../src/shared/extensions/extensions-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = fs.readFileSync(
  path.resolve(HERE, '..', '..', 'src', 'renderer', 'index.html'),
  'utf8',
);
const DE_JSON = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
);

describe('Hide-Ziele der Statusbar (4T-000520)', () => {
  it('Keys sind eindeutig und jedes Ziel existiert real in index.html', () => {
    const keys = STATUSBAR_HIDE_TARGETS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const target of STATUSBAR_HIDE_TARGETS) {
      if (target.elementId) {
        expect(
          INDEX_HTML.includes(`id="${target.elementId}"`),
          `Hide-Ziel ${target.key}: Element ${target.elementId} fehlt in index.html`,
        ).toBe(true);
      } else {
        const view = /data-view="([a-z]+)"/.exec(target.selector);
        expect(view, `Hide-Ziel ${target.key}: weder elementId noch data-view-Selektor`).not.toBe(
          null,
        );
        expect(
          INDEX_HTML.includes(`data-view="${view[1]}"`),
          `Hide-Ziel ${target.key}: Ansichts-Button ${view[1]} fehlt in index.html`,
        ).toBe(true);
      }
    }
  });

  it('labelKeys existieren in de.json (i18n-Wächter sichert die übrigen Sprachen)', () => {
    for (const target of STATUSBAR_HIDE_TARGETS) {
      expect(typeof DE_JSON[target.labelKey], `labelKey ${target.labelKey} (${target.key})`).toBe(
        'string',
      );
      expect(DE_JSON[target.labelKey].length, `labelKey ${target.labelKey} leer`).toBeGreaterThan(
        0,
      );
    }
  });

  it('die Panel-Ziele decken das komplette Zugangs-Modell', () => {
    const panelKeys = STATUSBAR_HIDE_TARGETS.filter((t) => t.key.startsWith('panel:')).map(
      (t) => t.key,
    );
    expect(panelKeys.sort()).toEqual(PANEL_ACCESS.map((p) => `panel:${p.id}`).sort());
  });

  it('die Hinweis-Zeile ist kein Hide-Ziel', () => {
    for (const target of STATUSBAR_HIDE_TARGETS) {
      expect(target.elementId).not.toBe('statusbar-hint');
    }
  });

  it('hideTargetByKey liefert den Eintrag bzw. null', () => {
    expect(hideTargetByKey('right:theme') && hideTargetByKey('right:theme').elementId).toBe(
      'btn-theme',
    );
    expect(hideTargetByKey('gibt-es-nicht')).toBeNull();
  });
});

describe('normalizeCommandPlacement (4T-000520)', () => {
  it('Nicht-Objekte fallen auf den leeren Default zurück', () => {
    expect(normalizeCommandPlacement(null)).toEqual(defaultCommandPlacement());
    expect(normalizeCommandPlacement('kaputt')).toEqual(defaultCommandPlacement());
    expect(normalizeCommandPlacement([1, 2])).toEqual(defaultCommandPlacement());
  });

  it('übernimmt gültige Einträge und verwirft defekte', () => {
    const result = normalizeCommandPlacement({
      statusbar: [
        { commandId: 'file.save', icon: 'star', label: '  Sichern  ' },
        { commandId: '', icon: 'star', label: 'x' },
        { icon: 'star' },
        'kaputt',
        null,
      ],
    });
    expect(result.statusbar).toEqual([{ commandId: 'file.save', icon: 'star', label: 'Sichern' }]);
  });

  it('unbekannte Icons fallen auf das Default-Icon, leere Namen auf null', () => {
    const result = normalizeCommandPlacement({
      contextMenu: [{ commandId: 'file.save', icon: 'gibt-es-nicht', label: '   ' }],
    });
    expect(result.contextMenu).toEqual([
      { commandId: 'file.save', icon: DEFAULT_COMMAND_ICON, label: null },
    ]);
    expect(COMMAND_ICON_IDS).toContain(DEFAULT_COMMAND_ICON);
  });

  it('hiddenButtons: nur bekannte Ziel-Keys, Duplikate reduziert', () => {
    const result = normalizeCommandPlacement({
      hiddenButtons: ['right:theme', 'fremd', 'right:theme', 'panel:outline', 42],
    });
    expect(result.hiddenButtons).toEqual(['right:theme', 'panel:outline']);
  });

  it('Makros: ID-Muster und Name sind Pflicht, Duplikat-IDs reduziert', () => {
    const result = normalizeCommandPlacement({
      macros: [
        { id: 'm1', name: 'Ablauf', icon: 'play', steps: [] },
        { id: 'm1', name: 'Doppelt', icon: 'play', steps: [] },
        { id: 'böse id', name: 'Ungültig', steps: [] },
        { id: 'm2', name: '   ', steps: [] },
        { id: 'm3', name: 'Ohne Schritte' },
      ],
    });
    expect(result.macros.map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(result.macros[0].name).toBe('Ablauf');
    expect(result.macros[1].steps).toEqual([]);
  });

  it('Makro-Schritte: Kommando- und Verzögerungs-Schritte, Verzögerung geklammert', () => {
    const result = normalizeCommandPlacement({
      macros: [
        {
          id: 'm1',
          name: 'Ablauf',
          steps: [
            { type: 'command', commandId: 'file.save' },
            { type: 'delay', seconds: 99 },
            { type: 'delay', seconds: -1 },
            { type: 'delay', seconds: 0.25 },
            { type: 'delay', seconds: 'kaputt' },
            { type: 'unbekannt' },
            { type: 'command', commandId: '' },
          ],
        },
      ],
    });
    expect(result.macros[0].steps).toEqual([
      { type: 'command', commandId: 'file.save' },
      { type: 'delay', seconds: MACRO_MAX_DELAY_SECONDS },
      { type: 'delay', seconds: 0 },
      { type: 'delay', seconds: 0.3 },
    ]);
  });

  it('macroCommandId bildet den macro.-Namensraum', () => {
    expect(macroCommandId('abc123')).toBe('macro.abc123');
  });
});

// 4T-000521: Sichtbarkeits-Kern der nutzerdefinierten Kontextmenü-Sektion —
// unbekannte Kommandos (gelöschtes Makro) und Kommandos deaktivierter
// Erweiterungen entfallen, kontextbedingte Verfügbarkeit bleibt Sache des
// Aufrufers (deaktivierte Darstellung statt Verschwinden).
describe('visibleContextMenuEntries (4T-000521)', () => {
  const entries = [
    { commandId: 'file.save', icon: 'save', label: null },
    { commandId: 'macro.geloescht', icon: 'zap', label: null },
    { commandId: 'view.toggleTags', icon: 'tag', label: null },
  ];

  it('filtert unbekannte und erweiterungs-gefilterte Kommandos', () => {
    const known = new Set(['file.save', 'view.toggleTags']);
    const disabled = new Set(['view.toggleTags']);
    expect(visibleContextMenuEntries(entries, disabled, known).map((e) => e.commandId)).toEqual([
      'file.save',
    ]);
  });

  it('behält alle bekannten Einträge ohne Filterung', () => {
    const known = new Set(['file.save', 'macro.geloescht', 'view.toggleTags']);
    expect(visibleContextMenuEntries(entries, new Set(), known)).toHaveLength(3);
  });

  it('Nicht-Arrays liefern eine leere Liste', () => {
    expect(visibleContextMenuEntries(null, new Set(), new Set())).toEqual([]);
  });
});

// Registry-Seite des Aus-Zustands (Muster tab-groups.test.js): die
// Erweiterung ist als Werkzeug registriert und ihr Einstellungs-Bereich
// verschwindet mit dem Schalter; die UI-Wirkung (Standard-Statusbar,
// keine Sektion) deckt die E2E-Spec kommando-platzierung ab.
describe('Erweiterung command-placement (4T-000520)', () => {
  it('ist als Werkzeug-Erweiterung mit Einstellungs-Bereich registriert', () => {
    const ext = extensionById('command-placement');
    expect(ext).toBeTruthy();
    expect(ext.category).toBe('tools');
    expect(ext.settingsSections).toEqual(['commandPlacement']);
  });

  it('im Aus-Zustand ist der Einstellungs-Bereich gefiltert', () => {
    expect(disabledSettingsSectionIdSet(['command-placement']).has('commandPlacement')).toBe(true);
    expect(disabledSettingsSectionIdSet([]).has('commandPlacement')).toBe(false);
  });
});
