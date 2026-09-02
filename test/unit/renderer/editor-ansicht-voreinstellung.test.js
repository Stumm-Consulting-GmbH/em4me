// @vitest-environment jsdom
// 4T-000572 (Epic 3E-000105): Voreinstellung der Editor-Ansicht-Schalter —
// Ebenen-Aufloesung (Frontmatter → Tab-Settings → globale Voreinstellung →
// Konstante) und Frontmatter-Schreiben beim Umschalten (Content-
// Transformation buildEditorViewFrontmatterUpdate).
import { describe, it, expect, afterEach } from 'vitest';
import './api-stub.js';

const appState = await import('../../../src/renderer/modules/app/app-state.js');
const views = await import('../../../src/renderer/modules/views/views.js');

// Die globale Voreinstellung ist Modul-Zustand — nach jedem Test auf die
// Konstanten zuruecksetzen, damit die Tests reihenfolge-unabhaengig bleiben.
afterEach(() => {
  appState.setEditorViewDefaults({
    wrapLines: appState.DEFAULT_WRAP_LINES,
    showLineNumbers: appState.DEFAULT_SHOW_LINE_NUMBERS,
    showFoldGutter: appState.DEFAULT_SHOW_FOLD_GUTTER,
  });
});

describe('Ebenen-Aufloesung (resolveEditorViewSettings)', () => {
  it('ohne Frontmatter und ohne Settings greifen die Konstanten-Defaults', () => {
    const r = appState.resolveEditorViewSettings('# Nur Text\n');
    expect(r.wrapLines).toBe(appState.DEFAULT_WRAP_LINES);
    expect(r.showLineNumbers).toBe(appState.DEFAULT_SHOW_LINE_NUMBERS);
    expect(r.showFoldGutter).toBe(appState.DEFAULT_SHOW_FOLD_GUTTER);
  });

  it('globale Voreinstellung uebersteuert die Konstante', () => {
    appState.setEditorViewDefaults({ wrapLines: true, showLineNumbers: false });
    const r = appState.resolveEditorViewSettings('# Nur Text\n');
    expect(r.wrapLines).toBe(true);
    expect(r.showLineNumbers).toBe(false);
    expect(r.showFoldGutter).toBe(true);
  });

  it('Frontmatter uebersteuert Voreinstellung UND uebergebene Tab-Settings', () => {
    appState.setEditorViewDefaults({ wrapLines: false });
    const content = '---\nword-wrap: true\nline-numbers: false\n---\n# T\n';
    const r = appState.resolveEditorViewSettings(content, {
      wrapLines: false,
      showLineNumbers: true,
    });
    expect(r.wrapLines).toBe(true);
    expect(r.showLineNumbers).toBe(false);
  });

  it('Tab-Settings (Session/Transfer) gewinnen gegen die Voreinstellung, wenn kein Frontmatter-Schluessel gesetzt ist', () => {
    appState.setEditorViewDefaults({ showFoldGutter: true });
    const r = appState.resolveEditorViewSettings('# T\n', { showFoldGutter: false });
    expect(r.showFoldGutter).toBe(false);
  });

  it('nur echtes true/false im Frontmatter zaehlt (Strings/Zahlen fallen durch)', () => {
    const content = "---\nword-wrap: 'true'\nline-numbers: 1\n---\n# T\n";
    const r = appState.resolveEditorViewSettings(content);
    expect(r.wrapLines).toBe(appState.DEFAULT_WRAP_LINES);
    expect(r.showLineNumbers).toBe(appState.DEFAULT_SHOW_LINE_NUMBERS);
  });

  it('defektes Frontmatter-YAML faellt auf Settings/Voreinstellung zurueck', () => {
    const content = '---\nword-wrap: [kaputt\n---\n# T\n';
    const r = appState.resolveEditorViewSettings(content, { wrapLines: true });
    expect(r.wrapLines).toBe(true);
  });

  it('setEditorViewDefaults ignoriert Nicht-Boolean-Werte, getEditorViewDefaults liefert Kopie', () => {
    appState.setEditorViewDefaults({ wrapLines: 'ja', showLineNumbers: null, extra: true });
    const d = appState.getEditorViewDefaults();
    expect(d.wrapLines).toBe(appState.DEFAULT_WRAP_LINES);
    expect(d.showLineNumbers).toBe(appState.DEFAULT_SHOW_LINE_NUMBERS);
    d.wrapLines = true;
    expect(appState.getEditorViewDefaults().wrapLines).toBe(appState.DEFAULT_WRAP_LINES);
  });

  it('createTab loest die drei Schalter gegen Frontmatter und Voreinstellung auf', () => {
    appState.setEditorViewDefaults({ wrapLines: true });
    const tab = appState.createTab('C:/x.md', '---\nfold-gutter: false\n---\n# T\n');
    expect(tab.showFoldGutter).toBe(false);
    expect(tab.wrapLines).toBe(true);
    expect(tab.showLineNumbers).toBe(appState.DEFAULT_SHOW_LINE_NUMBERS);
  });
});

describe('Frontmatter-Schreiben beim Umschalten (buildEditorViewFrontmatterUpdate)', () => {
  it('legt bei frontmatter-losen Dokumenten einen Block an', () => {
    const text = views.buildEditorViewFrontmatterUpdate('# T\n\nAbsatz\n', {
      'word-wrap': true,
    });
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('word-wrap: true');
    expect(text).toContain('# T');
  });

  it('erhaelt fremde Schluessel und aktualisiert den eigenen Wert', () => {
    const src = '---\ntitle: Bleibt\nline-numbers: true\n---\n# T\n';
    const text = views.buildEditorViewFrontmatterUpdate(src, { 'line-numbers': false });
    expect(text).toContain('title: Bleibt');
    expect(text).toContain('line-numbers: false');
    expect(text).not.toContain('line-numbers: true');
  });

  it('ist idempotent bei unveraendertem Wert (No-Op-Erkennung der Aufrufer)', () => {
    const src = '---\nfold-gutter: false\n---\n# T\n';
    expect(views.buildEditorViewFrontmatterUpdate(src, { 'fold-gutter': false })).toBe(src);
  });

  it('liefert null bei defektem Frontmatter-YAML (nie ueberschreiben)', () => {
    const src = '---\ntitle: [kaputt\n---\n# T\n';
    expect(views.buildEditorViewFrontmatterUpdate(src, { 'word-wrap': true })).toBeNull();
  });

  it('erhaelt CRLF-Zeilenenden (Churn-Schutz)', () => {
    const src = '# T\r\n\r\nAbsatz\r\n';
    const text = views.buildEditorViewFrontmatterUpdate(src, { 'line-numbers': false });
    expect(text.startsWith('---\r\n')).toBe(true);
    expect(text).toContain('line-numbers: false');
    expect(text).not.toMatch(/[^\r]\n/);
  });

  it('schreibt mehrere Schluessel in einem Schritt (Uebernahme beim ersten Speichern)', () => {
    const text = views.buildEditorViewFrontmatterUpdate('Entwurf\n', {
      'word-wrap': true,
      'fold-gutter': false,
    });
    expect(text).toContain('word-wrap: true');
    expect(text).toContain('fold-gutter: false');
  });
});
