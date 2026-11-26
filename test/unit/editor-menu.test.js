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
  // 4T-002554 (Epic 3E-000389): «Als reinen Text einfügen» steht als Kern-Eintrag
  // direkt hinter «Einfügen».
  it('editierbar: alle Einträge in Menü-Reihenfolge', () => {
    const states = computeClipboardMenuState({
      readOnly: false,
      hasSelection: true,
      hasClipboardText: true,
      docNotEmpty: true,
    });
    expect(states.map((s) => s.id)).toEqual(['cut', 'copy', 'paste', 'pastePlain', 'selectAll']);
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
    expect(by.pastePlain).toBe(false);
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
    expect(states.map((s) => s.id)).toEqual(['cut', 'copy', 'paste', 'pastePlain', 'selectAll']);
    expect(states.every((s) => s.enabled === false)).toBe(true);
  });
});

// 4T-002554 (Epic 3E-000389): «Als Tabelle einfügen» erscheint nur bei aktiver
// Erweiterung table-tools (AK3), «Als reinen Text einfügen» immer.
describe('computeClipboardMenuState: Einfügen als Tabelle und als reiner Text (4T-002554)', () => {
  const basis = { readOnly: false, hasSelection: false, hasClipboardText: true, docNotEmpty: true };

  it('Erweiterung an: «Als Tabelle einfügen» hinter «Als reinen Text einfügen»', () => {
    const states = computeClipboardMenuState({ ...basis, pasteAsTable: true });
    expect(states.map((s) => s.id)).toEqual([
      'cut',
      'copy',
      'paste',
      'pastePlain',
      'pasteAsTable',
      'selectAll',
    ]);
    expect(byId(states).pasteAsTable).toBe(true);
  });

  it('Erweiterung aus: «Als Tabelle einfügen» fehlt, «Als reinen Text einfügen» bleibt', () => {
    const ids = computeClipboardMenuState({ ...basis, pasteAsTable: false }).map((s) => s.id);
    expect(ids).not.toContain('pasteAsTable');
    expect(ids).toContain('pastePlain');
  });

  it('ohne Text in der Zwischenablage: beide Einträge inaktiv', () => {
    const by = byId(
      computeClipboardMenuState({ ...basis, hasClipboardText: false, pasteAsTable: true }),
    );
    expect(by.pastePlain).toBe(false);
    expect(by.pasteAsTable).toBe(false);
  });

  it('read-only: keiner der beiden Einträge', () => {
    const ids = computeClipboardMenuState({ ...basis, readOnly: true, pasteAsTable: true }).map(
      (s) => s.id,
    );
    expect(ids).toEqual(['copy', 'selectAll']);
  });
});
