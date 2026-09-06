// 4T-000307 (Epic 3E-000048): Regressionstests für die Containment-/Whitelist-
// Prüfung des embed:read-Pfads. Befund B-02 aus dem Code-Audit 4T-000275:
// embed:read löste Pfade ohne Containment, ohne Extension-Whitelist und
// ohne Größen-Limit auf.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  resolveContainedEmbedPath,
  containmentWurzel,
} from '../../src/main/documents/embed-path.js';

const base = path.join(path.sep === '\\' ? 'C:\\' : '/', 'docs', 'projekt', 'aktiv.md');
const dir = path.dirname(base);

describe('resolveContainedEmbedPath (B-02, 4T-000307)', () => {
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
    // 4T-001485: Der Fehlertext benennt seit der Grenz-Verschiebung die
    // Bereichs-Wurzel; ohne uebergebene Wurzel IST sie der Dokument-Ordner.
    expect(r.error).toBe('outside area root');
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

// 4T-001485 (Epic 3E-000199): Die Containment-Grenze ist die Bereichs-Wurzel.
//
// Entscheidung E2 des Epics: Beide Einbettungs-Wege enden dort, wo auch der
// Klick-Pfad endet. Der Schutz aus B-02 bleibt in seiner Haerte — er zieht
// nur eine andere Linie. Diese Faelle halten fest, WO sie liegt, und
// besonders, wann sie NICHT weiter wird: ohne Bereich und bei einem Bereich,
// der das Dokument gar nicht enthaelt (ein fensterlokal stehengebliebener
// Fremd-Bereich weitete sonst die Grenze fuer ein fremdes Dokument).
describe('resolveContainedEmbedPath mit Bereichs-Wurzel (4T-001485)', () => {
  const wurzel = path.join(path.sep === '\\' ? 'C:\\' : '/', 'docs');
  const nachbar = path.join(wurzel, 'anderer', 'ziel.md');

  it('erlaubt ein Ziel im Nachbar-Ordner desselben Bereichs (AK1)', () => {
    const r = resolveContainedEmbedPath(base, path.join('..', 'anderer', 'ziel.md'), wurzel);
    expect(r.ok).toBe(true);
    expect(r.abs).toBe(nachbar);
  });

  it('sperrt ein Ziel oberhalb der Bereichs-Wurzel (AK2)', () => {
    const r = resolveContainedEmbedPath(base, path.join('..', '..', 'draussen.md'), wurzel);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('outside area root');
  });

  it('ohne Bereich bleibt die Grenze der Dokument-Ordner (AK3)', () => {
    for (const ohne of [undefined, null, '']) {
      const r = resolveContainedEmbedPath(base, path.join('..', 'anderer', 'ziel.md'), ohne);
      expect(r.ok, `Wurzel-Angabe ${JSON.stringify(ohne)}`).toBe(false);
    }
  });

  it('ein Bereich, der das Dokument nicht enthaelt, weitet nichts (AK4)', () => {
    // Der Klassiker: Das Fenster haelt noch einen anderen Bereich, das
    // geoeffnete Dokument liegt gar nicht in ihm.
    const fremd = path.join(path.sep === '\\' ? 'C:\\' : '/', 'woanders');
    const r = resolveContainedEmbedPath(base, path.join('..', 'anderer', 'ziel.md'), fremd);
    expect(r.ok).toBe(false);
  });

  it('die Bereichs-Wurzel selbst zaehlt als innerhalb', () => {
    const r = resolveContainedEmbedPath(base, path.join('..', 'oben.md'), wurzel);
    expect(r.ok).toBe(true);
    expect(r.abs).toBe(path.join(wurzel, 'oben.md'));
  });

  it('ein Praefix-Nachbar der Wurzel ist NICHT innerhalb', () => {
    // 'C:\docs-alt' faengt an wie 'C:\docs', liegt aber daneben.
    const r = resolveContainedEmbedPath(base, path.join('..', '..', 'docs-alt', 'x.md'), wurzel);
    expect(r.ok).toBe(false);
  });

  it('die Endungs-Whitelist wirkt auch im weiteren Suchraum (AK6)', () => {
    const r = resolveContainedEmbedPath(base, path.join('..', 'anderer', 'config.json'), wurzel);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('extension not allowed');
  });

  it('ein absoluter Pfad ausserhalb bleibt gesperrt (AK5)', () => {
    const outside = path.join(path.sep === '\\' ? 'C:\\' : '/', 'etc', 'passwd.md');
    expect(resolveContainedEmbedPath(base, outside, wurzel).ok).toBe(false);
  });

  it('ein relativer Pfad meint weiterhin den Ort neben dem Dokument', () => {
    // Die Aufloesungs-Basis bleibt der Dokument-Ordner; nur die GRENZE ist
    // weiter geworden. 'notiz.md' darf nicht ploetzlich in der Wurzel suchen.
    const r = resolveContainedEmbedPath(base, 'notiz.md', wurzel);
    expect(r.abs).toBe(path.join(dir, 'notiz.md'));
  });
});

describe('containmentWurzel (4T-001485)', () => {
  const wurzel = path.join(path.sep === '\\' ? 'C:\\' : '/', 'docs');

  it('liefert die Bereichs-Wurzel, wenn sie den Ordner enthaelt', () => {
    expect(containmentWurzel(dir, wurzel)).toBe(path.resolve(wurzel));
  });

  it('liefert den Ordner, wenn keine Wurzel angegeben ist', () => {
    expect(containmentWurzel(dir, null)).toBe(dir);
  });

  it('liefert den Ordner, wenn die Wurzel ihn nicht enthaelt', () => {
    const fremd = path.join(path.sep === '\\' ? 'C:\\' : '/', 'woanders');
    expect(containmentWurzel(dir, fremd)).toBe(dir);
  });
});
