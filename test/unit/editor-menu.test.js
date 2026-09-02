// 4T-000377 (Epic 3E-000071): Unit-Tests für die Zustandslogik des Editor-
// Kontextmenü-Klipboard-Blocks (src/shared/editor-menu.js). Prüft die Auswahl
// der Einträge und ihre Aktiv-Zustände je nach Read-only, Selektion,
// Klipboard-Inhalt und Dokument-Füllung.
import { describe, it, expect } from 'vitest';
import { computeClipboardMenuState } from '../../src/shared/editor-menu.js';

// Kleiner Helfer: id -> enabled für bequeme Assertions.
function byId(states) {
  return Object.fromEntries(states.map((s) => [s.id, s.enabled]));
}

describe('computeClipboardMenuState (4T-000377)', () => {
  it('editierbar: alle vier Einträge in Menü-Reihenfolge', () => {
    const states = computeClipboardMenuState({
      readOnly: false,
      hasSelection: true,
      hasClipboardText: true,
      docNotEmpty: true,
    });
    expect(states.map((s) => s.id)).toEqual(['cut', 'copy', 'paste', 'selectAll']);
    expect(states.every((s) => s.enabled)).toBe(true);
  });

  it('editierbar ohne Selektion: Ausschneiden/Kopieren inaktiv', () => {
    const by = byId(
      computeClipboardMenuState({
        readOnly: false,
        hasSelection: false,
        hasClipboardText: true,
        docNotEmpty: true,
      }),
    );
    expect(by.cut).toBe(false);
    expect(by.copy).toBe(false);
    expect(by.paste).toBe(true);
    expect(by.selectAll).toBe(true);
  });

  it('editierbar ohne Klipboard-Text: Einfügen inaktiv', () => {
    const by = byId(
      computeClipboardMenuState({
        readOnly: false,
        hasSelection: true,
        hasClipboardText: false,
        docNotEmpty: true,
      }),
    );
    expect(by.paste).toBe(false);
  });

  it('leeres Dokument: Alles auswählen inaktiv', () => {
    const by = byId(
      computeClipboardMenuState({
        readOnly: false,
        hasSelection: false,
        hasClipboardText: false,
        docNotEmpty: false,
      }),
    );
    expect(by.selectAll).toBe(false);
  });

  it('read-only: nur Kopieren und Alles auswählen (kein Ausschneiden/Einfügen)', () => {
    const states = computeClipboardMenuState({
      readOnly: true,
      hasSelection: true,
      hasClipboardText: true,
      docNotEmpty: true,
    });
    expect(states.map((s) => s.id)).toEqual(['copy', 'selectAll']);
  });

  it('read-only ohne Selektion: Kopieren inaktiv, Alles auswählen aktiv', () => {
    const by = byId(
      computeClipboardMenuState({
        readOnly: true,
        hasSelection: false,
        hasClipboardText: true,
        docNotEmpty: true,
      }),
    );
    expect(by.copy).toBe(false);
    expect(by.selectAll).toBe(true);
  });

  it('robust bei fehlenden Flags (alles falsy)', () => {
    const states = computeClipboardMenuState({});
    expect(states.map((s) => s.id)).toEqual(['cut', 'copy', 'paste', 'selectAll']);
    expect(states.every((s) => s.enabled === false)).toBe(true);
  });
});
