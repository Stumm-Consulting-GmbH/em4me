// 4T-000607 (Epic 3E-000114): Datenmodell der Format-Toolbar — Normalisierung
// der Belegung (Kommando-Einträge, Trenner, Überschrift-Menü), Rückfall
// auf die Standard-Belegung, Sichtbarkeits-Kern und Registry-Wächter
// (Standard-Belegung referenziert nur existierende Kommandos und Icons;
// Erweiterung 'toolbar' registriert).
import { describe, it, expect } from 'vitest';
import {
  FORMAT_TOOLBAR_KEY,
  FORMAT_TOOLBAR_EXTENSION_ID,
  defaultFormatToolbarEntries,
  defaultFormatToolbar,
  normalizeFormatToolbarEntry,
  normalizeFormatToolbar,
  collapseToolbarSeparators,
  visibleFormatToolbarEntries,
} from '../../src/shared/format-toolbar.js';
import { COMMANDS } from '../../src/shared/commands/commands.js';
import { COMMAND_ICON_IDS, DEFAULT_COMMAND_ICON } from '../../src/shared/commands/command-icons.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';

describe('format-toolbar: Standard-Belegung', () => {
  it('referenziert nur registrierte Kommandos und bekannte Icons', () => {
    const knownIds = new Set(COMMANDS.map((c) => c.id));
    for (const entry of defaultFormatToolbarEntries()) {
      if (entry.type !== 'command') continue;
      expect(knownIds.has(entry.commandId), `Kommando ${entry.commandId}`).toBe(true);
      expect(COMMAND_ICON_IDS).toContain(entry.icon);
    }
  });

  it('enthält die kuratierte Liste inklusive Überschrift-Menü und Tabelle', () => {
    const entries = defaultFormatToolbarEntries();
    const commandIds = entries.filter((e) => e.type === 'command').map((e) => e.commandId);
    expect(commandIds).toEqual([
      'format.bold',
      'format.italic',
      'format.strikethrough',
      'format.highlight',
      'format.code',
      'paragraph.bulletList',
      'paragraph.orderedList',
      'paragraph.taskList',
      'paragraph.quote',
      'link.insertWiki',
      'link.insertExternal',
      'insert.table',
      // 4T-001309 (Epic 3E-000235): Das Geruest der Perspective-Tabelle steht
      // unmittelbar neben der einfachen Tabelle.
      'insert.perspectiveTable',
    ]);
    expect(entries.filter((e) => e.type === 'headings')).toHaveLength(1);
    // Die Standard-Belegung ist bereits Trenner-bereinigt.
    expect(collapseToolbarSeparators(entries)).toEqual(entries);
  });
});

describe('format-toolbar: Normalisierung', () => {
  it('fällt bei defekter Struktur auf die Standard-Belegung zurück', () => {
    for (const raw of [null, undefined, 'x', 42, [], {}, { entries: 'x' }]) {
      expect(normalizeFormatToolbar(raw)).toEqual(defaultFormatToolbar());
    }
  });

  it('behält eine bewusst leere Liste leer', () => {
    expect(normalizeFormatToolbar({ entries: [] })).toEqual({ entries: [] });
  });

  it('übernimmt gültige Einträge und verwirft defekte', () => {
    const result = normalizeFormatToolbar({
      entries: [
        { type: 'command', commandId: 'format.bold', icon: 'bold', label: null },
        { type: 'separator' },
        { type: 'headings' },
        { type: 'unbekannt' },
        { type: 'command', commandId: '' },
        null,
        'x',
      ],
    });
    expect(result.entries).toEqual([
      { type: 'command', commandId: 'format.bold', icon: 'bold', label: null },
      { type: 'separator' },
      { type: 'headings' },
    ]);
  });

  it('normalisiert Kommando-Einträge über das Eintrag-Modell der Kommando-Platzierung', () => {
    // Unbekanntes Icon fällt auf das Default-Icon, Leerraum-Label auf null;
    // ein typloser Alt-Eintrag mit commandId wird als Kommando gelesen.
    expect(
      normalizeFormatToolbarEntry({ commandId: 'file.save', icon: 'nope', label: '  ' }),
    ).toEqual({ type: 'command', commandId: 'file.save', icon: DEFAULT_COMMAND_ICON, label: null });
    expect(
      normalizeFormatToolbarEntry({
        type: 'command',
        commandId: 'file.save',
        icon: 'save',
        label: 'S',
      }),
    ).toEqual({ type: 'command', commandId: 'file.save', icon: 'save', label: 'S' });
  });
});

describe('format-toolbar: Trenner-Bereinigung', () => {
  const sep = { type: 'separator' };
  const cmd = (id) => ({ type: 'command', commandId: id, icon: 'zap', label: null });

  it('entfernt führende, doppelte und abschließende Trenner', () => {
    expect(collapseToolbarSeparators([sep, cmd('a'), sep, sep, cmd('b'), sep])).toEqual([
      cmd('a'),
      sep,
      cmd('b'),
    ]);
    expect(collapseToolbarSeparators([sep, sep])).toEqual([]);
    expect(collapseToolbarSeparators([])).toEqual([]);
  });
});

describe('format-toolbar: Sichtbarkeits-Kern', () => {
  const sep = { type: 'separator' };
  const cmd = (id) => ({ type: 'command', commandId: id, icon: 'zap', label: null });

  it('filtert unbekannte Kommandos und Kommandos deaktivierter Erweiterungen', () => {
    // 'weg' ist nicht registriert (z.B. gelöschtes Makro), 'b' gehört zu
    // einer deaktivierten Erweiterung; der dadurch verwaiste Doppel-Trenner
    // wird bereinigt, Überschrift-Menü und Trenner bleiben.
    const entries = [cmd('a'), sep, cmd('weg'), sep, { type: 'headings' }, cmd('b')];
    const visible = visibleFormatToolbarEntries(entries, new Set(['b']), new Set(['a', 'b']));
    expect(visible).toEqual([cmd('a'), sep, { type: 'headings' }]);
  });

  it('liefert bei Nicht-Array eine leere Liste', () => {
    expect(visibleFormatToolbarEntries(null, new Set(), new Set())).toEqual([]);
  });
});

describe('format-toolbar: Registrierung', () => {
  it('Store-Key und Erweiterungs-ID sind verdrahtet', () => {
    expect(FORMAT_TOOLBAR_KEY).toBe('formatToolbar');
    const ext = extensionById(FORMAT_TOOLBAR_EXTENSION_ID);
    expect(ext).toBeTruthy();
    expect(ext.nameKey).toBe('help.featureName.formatToolbar');
    expect(ext.descKey).toBe('help.feature.formatToolbar');
  });
});
