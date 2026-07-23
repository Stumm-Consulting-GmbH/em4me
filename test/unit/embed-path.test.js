// 4T-0307 (Epic 3E-0048): Regressionstests für die Containment-/Whitelist-
// Prüfung des embed:read-Pfads. Befund B-02 aus dem Code-Audit 4T-0275:
// embed:read löste Pfade ohne Containment, ohne Extension-Whitelist und
// ohne Größen-Limit auf.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveContainedEmbedPath } from '../../src/main/embed-path.js';

const base = path.join(path.sep === '\\' ? 'C:\\' : '/', 'docs', 'projekt', 'aktiv.md');
const dir = path.dirname(base);

describe('resolveContainedEmbedPath (B-02, 4T-0307)', () => {
  it('erlaubt eine Markdown-Datei im Dokument-Ordner', () => {
    const r = resolveContainedEmbedPath(base, 'notiz.md');
    expect(r.ok).toBe(true);
    expect(r.abs).toBe(path.join(dir, 'notiz.md'));
  });

  it('erlaubt einen Unterordner (abwärts)', () => {
    const r = resolveContainedEmbedPath(base, 'sub/tief.md');
    expect(r.ok).toBe(true);
  });

  it('erlaubt die Alt-Markdown-Endungen', () => {
    for (const name of ['a.markdown', 'b.mdown', 'c.mkd']) {
      expect(resolveContainedEmbedPath(base, name).ok).toBe(true);
    }
  });

  it('sperrt ../-Ausbruch nach oben', () => {
    const r = resolveContainedEmbedPath(base, '../../../geheim.md');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('outside document folder');
  });

  it('sperrt absoluten Pfad außerhalb', () => {
    const outside = path.join(path.sep === '\\' ? 'C:\\' : '/', 'etc', 'passwd.md');
    const r = resolveContainedEmbedPath(base, outside);
    expect(r.ok).toBe(false);
  });

  it('sperrt nicht-Markdown-Endung (z.B. per Traversal getarnt)', () => {
    const r = resolveContainedEmbedPath(base, 'config.json');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('extension not allowed');
  });

  it('URL-kodierte Separatoren brechen nicht aus (decodeURI dekodiert %2f nicht, bleibt literaler Name im Ordner)', () => {
    const r = resolveContainedEmbedPath(base, '..%2f..%2fgeheim.md');
    // Sicherheits-Eigenschaft: falls überhaupt aufgelöst, bleibt der Pfad
    // innerhalb des Dokument-Ordners (kein Ausbruch nach oben).
    if (r.ok) expect(r.abs.startsWith(dir + path.sep)).toBe(true);
  });

  it('meldet fehlende Parameter', () => {
    expect(resolveContainedEmbedPath('', 'x.md').ok).toBe(false);
    expect(resolveContainedEmbedPath(base, '').ok).toBe(false);
  });
});
