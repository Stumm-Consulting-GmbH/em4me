// 4T-0182: Unit-Tests fuer die archive-build-Logik (X-01 Tag-Guard,
// X-03 Fehler-Toleranz, X-10 Notes-Archivierung) ueber die exportierte
// archiveBuild()-Funktion mit injizierten Abhaengigkeiten.
import { describe, it, expect, vi } from 'vitest';
import {
  archiveBuild,
  writeChecksumFiles,
  EXE_PATTERN,
  NOTES_PATTERN,
} from '../../scripts/archive-build.js';

describe('archive-build — Pattern', () => {
  it('erkennt Versions-EXEs und Release-Notes', () => {
    expect(EXE_PATTERN.test('EM4me-0.85.0-Portable.exe')).toBe(true);
    expect(EXE_PATTERN.test('EM4me-0.85.0-Setup.exe')).toBe(true);
    // 4T-0643: Altnamen bleiben als Alternation erkannt (Robustheit fuer
    // Bestands-Builds; das Versions-Archiv fuehrt EXEs aller drei Vorgaenger).
    expect(EXE_PATTERN.test('Perspective Markdown++-0.30.0-Portable.exe')).toBe(true);
    expect(EXE_PATTERN.test('Perspective Markdown++-0.30.0-Setup.exe')).toBe(true);
    expect(EXE_PATTERN.test('SCG Markdown-0.24.0-Portable.exe')).toBe(true);
    expect(EXE_PATTERN.test('Markdown Viewer-0.5.1-Setup.exe')).toBe(true);
    expect(EXE_PATTERN.test('EM4me-0.85.0-Setup.exe.blockmap')).toBe(false);
    expect(EXE_PATTERN.test('Perspective Markdown++-0.30.0-Setup.exe.blockmap')).toBe(false);
    expect(NOTES_PATTERN.test('release-notes-0.24.0.md')).toBe(true);
    expect(NOTES_PATTERN.test('release-notes.md')).toBe(false);
  });
});

describe('X-01: Tag-Guard', () => {
  it('bricht ab, wenn die EXE-Version bereits getaggt ist', () => {
    const move = vi.fn(() => true);
    const code = archiveBuild(['SCG Markdown-0.23.0-Portable.exe'], {
      tagExists: (v) => v === '0.23.0',
      guardBuildNumber: () => null,
      move,
      copyNotes: vi.fn(() => true),
    });
    expect(code).toBe(1);
    expect(move).not.toHaveBeenCalled();
  });

  it('laesst ungetaggte Zielversionen (Test-Iterationen) durch', () => {
    const move = vi.fn(() => true);
    const code = archiveBuild(['SCG Markdown-0.24.0-Portable.exe'], {
      tagExists: () => false,
      guardBuildNumber: () => null,
      move,
      copyNotes: vi.fn(() => true),
      writeChecksums: vi.fn(() => true),
    });
    expect(code).toBe(0);
    expect(move).toHaveBeenCalledWith('SCG Markdown-0.24.0-Portable.exe');
  });
});

describe('X-03: Fehler-Toleranz pro Datei', () => {
  it('verschiebt die uebrigen Dateien weiter und meldet Exit 1', () => {
    const move = vi.fn((name) => !name.includes('Setup')); // Setup schlaegt fehl
    const code = archiveBuild(
      ['SCG Markdown-0.24.0-Setup.exe', 'SCG Markdown-0.24.0-Portable.exe'],
      {
        tagExists: () => false,
        guardBuildNumber: () => null,
        move,
        copyNotes: vi.fn(() => true),
        writeChecksums: vi.fn(() => true),
      },
    );
    expect(code).toBe(1);
    expect(move).toHaveBeenCalledTimes(2); // kein harter Abbruch nach dem Fehler
  });
});

describe('X-10/4T-0683: Nur die Notes der gebauten Version wandern ins Archiv', () => {
  // In dist/ sammeln sich die Notes-Dateien aller Releases. Pauschales
  // Kopieren hat am 2026-07-22 die Archiv-Fassung der 0.87.0 mit einer
  // aelteren Probe-Fassung ueberschrieben; seitdem gilt der Filter auf die
  // package.json-Version.
  it('kopiert die zur gebauten Version passende Notes-Datei und nur diese', () => {
    const copyNotes = vi.fn(() => true);
    const code = archiveBuild(
      ['EM4me-0.24.0-Portable.exe', 'release-notes-0.24.0.md', 'release-notes-0.23.0.md'],
      {
        tagExists: () => false,
        guardBuildNumber: () => null,
        pkgVersion: '0.24.0',
        move: vi.fn(() => true),
        copyNotes,
        writeChecksums: vi.fn(() => true),
      },
    );
    expect(code).toBe(0);
    expect(copyNotes).toHaveBeenCalledTimes(1);
    expect(copyNotes).toHaveBeenCalledWith('release-notes-0.24.0.md');
  });

  it('laesst fremde Notes-Dateien liegen, auch ohne EXE im Lauf', () => {
    const copyNotes = vi.fn(() => true);
    const code = archiveBuild(['release-notes-0.23.0.md'], {
      tagExists: () => false,
      guardBuildNumber: () => null,
      pkgVersion: '0.24.0',
      copyNotes,
    });
    expect(code).toBe(0);
    expect(copyNotes).not.toHaveBeenCalled();
  });
});

describe('4T-0375: Build-Nummer-Guard', () => {
  it('bricht ab, wenn die Build-Nummer nicht zur Commit-Anzahl passt', () => {
    const move = vi.fn(() => true);
    const code = archiveBuild(['EM4me-0.42.0-Portable.exe'], {
      tagExists: () => false,
      guardBuildNumber: () => 'Build-Nummer-Abweichung: ...',
      move,
      copyNotes: vi.fn(() => true),
    });
    expect(code).toBe(1);
    expect(move).not.toHaveBeenCalled();
  });

  it('archiviert normal, wenn der Guard null liefert', () => {
    const move = vi.fn(() => true);
    const code = archiveBuild(['EM4me-0.42.0-Portable.exe'], {
      tagExists: () => false,
      guardBuildNumber: () => null,
      move,
      copyNotes: vi.fn(() => true),
      writeChecksums: vi.fn(() => true),
    });
    expect(code).toBe(0);
    expect(move).toHaveBeenCalledWith('EM4me-0.42.0-Portable.exe');
  });
});

// 4T-0658: Ohne Code-Signatur ist die Prüfsumme der einzige Integritäts-
// Nachweis. Sie muss deshalb automatisch entstehen und darf nur Dateien
// beschreiben, die tatsächlich im Versions-Archiv liegen.
describe('4T-0658: Prüfsummen beim Archivieren', () => {
  it('erzeugt Prüfsummen nur für erfolgreich archivierte EXEs', () => {
    const writeChecksums = vi.fn(() => true);
    const code = archiveBuild(['EM4me-0.86.0-Setup.exe', 'EM4me-0.86.0-Portable.exe'], {
      tagExists: () => false,
      guardBuildNumber: () => null,
      // Setup schlägt fehl, Portable gelingt.
      move: (name) => !name.includes('Setup'),
      copyNotes: vi.fn(() => true),
      writeChecksums,
    });
    expect(code).toBe(1);
    expect(writeChecksums).toHaveBeenCalledWith(['EM4me-0.86.0-Portable.exe']);
  });

  it('ruft die Prüfsummen-Erzeugung ohne archivierte EXE gar nicht auf', () => {
    const writeChecksums = vi.fn(() => true);
    const code = archiveBuild(['EM4me-0.86.0-Portable.exe'], {
      tagExists: () => false,
      guardBuildNumber: () => null,
      move: () => false,
      copyNotes: vi.fn(() => true),
      writeChecksums,
    });
    expect(code).toBe(1);
    expect(writeChecksums).not.toHaveBeenCalled();
  });

  it('meldet einen Fehlschlag der Prüfsummen-Erzeugung als Exit 1', () => {
    const code = archiveBuild(['EM4me-0.86.0-Portable.exe'], {
      tagExists: () => false,
      guardBuildNumber: () => null,
      move: () => true,
      copyNotes: vi.fn(() => true),
      writeChecksums: () => false,
    });
    expect(code).toBe(1);
  });
});

describe('4T-0658: writeChecksumFiles', () => {
  it('schreibt je Version eine Sammel-Datei im sha256sum-Format', () => {
    const write = vi.fn();
    const ok = writeChecksumFiles(['EM4me-0.86.0-Setup.exe', 'EM4me-0.86.0-Portable.exe'], {
      hash: (name) => (name.includes('Setup') ? 'aaa' : 'bbb'),
      write,
    });
    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const [target, content] = write.mock.calls[0];
    expect(target.endsWith('EM4me-0.86.0-SHA256SUMS.txt')).toBe(true);
    // Alphabetisch sortiert, damit dasselbe Bau-Ergebnis dieselbe Datei liefert.
    expect(content).toBe('bbb  EM4me-0.86.0-Portable.exe\naaa  EM4me-0.86.0-Setup.exe\n');
  });

  it('trennt mehrere Versionen in eigene Dateien und behält den Produktnamen', () => {
    const write = vi.fn();
    writeChecksumFiles(['EM4me-0.86.0-Portable.exe', 'SCG Markdown-0.24.0-Portable.exe'], {
      hash: () => 'ccc',
      write,
    });
    const targets = write.mock.calls.map(([t]) => t.split(/[\\/]/).pop());
    expect(targets).toContain('EM4me-0.86.0-SHA256SUMS.txt');
    expect(targets).toContain('SCG Markdown-0.24.0-SHA256SUMS.txt');
  });

  it('schreibt keine Datei, wenn keine Prüfsumme gebildet werden konnte', () => {
    const write = vi.fn();
    const ok = writeChecksumFiles(['EM4me-0.86.0-Portable.exe'], { hash: () => null, write });
    expect(ok).toBe(true); // fehlende Datei ist kein Fehler, wie bei moveFile
    expect(write).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler beim Bilden der Prüfsumme, ohne die übrigen zu verlieren', () => {
    const write = vi.fn();
    const ok = writeChecksumFiles(['EM4me-0.86.0-Setup.exe', 'EM4me-0.86.0-Portable.exe'], {
      hash: (name) => {
        if (name.includes('Setup')) throw new Error('Lesefehler');
        return 'bbb';
      },
      write,
    });
    expect(ok).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe('bbb  EM4me-0.86.0-Portable.exe\n');
  });
});
