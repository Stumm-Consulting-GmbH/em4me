// 4T-000716 (Epic 3E-000137): Unit-Test des geteilten Erzeugungs-Moduls der beiden
// generierten Handbuch-Seiten. Prueft, dass die reine Erzeugung deterministisch
// ist und dass die drei veraenderlichen Parameter (Uebersetzung, wirksame
// Bindings, deaktivierte Kommandos) wie erwartet durchschlagen. Damit ist der
// gemeinsame Kern von App (manual.js) und Web-Bau (build-web.js) direkt
// abgesichert, ohne Renderer- oder Electron-Umgebung.
import { describe, it, expect } from 'vitest';
import {
  HELP_FEATURE_GROUPS,
  escapeTableCell,
  splitShortcutKeys,
  localizeKey,
  buildHelpShortcutRows,
  generateFunctionsPage,
  generateShortcutsPage,
} from '../../src/shared/manual/manual-generated.js';
import { mergeBindings } from '../../src/shared/commands/commands.js';

// Identitaets-t (Verhalten der Renderer-t bei fehlendem Schluessel): gibt den
// Schluessel selbst zurueck. localizeKey faellt damit auf das deutsche Token
// zurueck (translated === key), was fuer die Struktur-Pruefungen genuegt.
const tId = (key) => key;

describe('manual-generated: reine Helfer (4T-000716)', () => {
  it('escapeTableCell maskiert Pipes und Zeilenumbrueche, ohne Doppel-Escape', () => {
    expect(escapeTableCell('a|b')).toBe('a\\|b');
    expect(escapeTableCell('a\\|b')).toBe('a\\|b');
    expect(escapeTableCell('a\nb')).toBe('a b');
    expect(escapeTableCell(null)).toBe('');
  });

  it('splitShortcutKeys trennt an + und behandelt das Plus als Inhalt', () => {
    expect(splitShortcutKeys('Strg+Umschalt+T')).toEqual(['Strg', 'Umschalt', 'T']);
    expect(splitShortcutKeys('Strg++')).toEqual(['Strg', '+']);
    expect(splitShortcutKeys('F3')).toEqual(['F3']);
  });

  it('localizeKey uebersetzt bekannte Tokens und reicht unbekannte durch', () => {
    expect(localizeKey('Strg', (k) => (k === 'help.key.ctrl' ? 'Ctrl' : k))).toBe('Ctrl');
    // Fehlende Uebersetzung -> deutsches Token als Rueckfall.
    expect(localizeKey('Strg', tId)).toBe('Strg');
    // Unbekanntes Token bleibt unveraendert.
    expect(localizeKey('Backspace', tId)).toBe('Backspace');
  });
});

describe('manual-generated: Funktions-Seite (4T-000716)', () => {
  it('ist deterministisch und traegt H1, Intro und je Gruppe eine H2', () => {
    const a = generateFunctionsPage(tId);
    const b = generateFunctionsPage(tId);
    expect(a).toBe(b);
    expect(a.startsWith('# manual.page.functions.title')).toBe(true);
    const gruppen = (a.match(/^## /gm) || []).length;
    expect(gruppen).toBe(HELP_FEATURE_GROUPS.length);
    // Je Gruppe genau eine dreispaltige Tabellen-Kopfzeile.
    expect((a.match(/^\|---\|---\|---\|$/gm) || []).length).toBe(HELP_FEATURE_GROUPS.length);
  });
});

describe('manual-generated: Tastenkuerzel-Seite (4T-000716)', () => {
  it('zeigt das Default-Binding der Suche als lokalisiertes Token', () => {
    const md = generateShortcutsPage({
      t: tId,
      effectiveBindings: mergeBindings(),
      disabledCommandIds: new Set(),
    });
    expect(md).toContain('`Strg+F`');
  });

  it('spiegelt eine Binding-Umbelegung (effectiveBindings-Parameter)', () => {
    const md = generateShortcutsPage({
      t: tId,
      effectiveBindings: mergeBindings({ 'search.open': 'Ctrl+Alt+F' }),
      disabledCommandIds: new Set(),
    });
    expect(md).toContain('`Strg+Alt+F`');
    expect(md).not.toContain('`Strg+F`');
  });

  it('unterdrueckt ein deaktiviertes Kommando (disabledCommandIds-Parameter)', () => {
    const voll = generateShortcutsPage({
      t: tId,
      effectiveBindings: mergeBindings(),
      disabledCommandIds: new Set(),
    });
    const ohne = generateShortcutsPage({
      t: tId,
      effectiveBindings: mergeBindings(),
      disabledCommandIds: new Set(['search.open']),
    });
    expect(ohne.length).toBeLessThan(voll.length);
    expect(ohne).not.toContain('`Strg+F`');
  });

  it('buildHelpShortcutRows haengt die statische Rest-Liste hinten an', () => {
    const rows = buildHelpShortcutRows({
      effectiveBindings: mergeBindings(),
      disabledCommandIds: new Set(),
    });
    // Die statische Rest-Liste endet mit der Alt-Menue-Zeile.
    expect(rows[rows.length - 1].descKey).toBe('help.shortcut.menuBar');
  });
});
