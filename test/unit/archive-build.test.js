// 4T-000182: Unit-Tests fuer die archive-build-Logik (X-01 Tag-Guard,
// X-03 Fehler-Toleranz, X-10 Notes-Archivierung) ueber die exportierte
// archiveBuild()-Funktion mit injizierten Abhaengigkeiten.
import { describe, it, expect, vi } from 'vitest';
import {
  archiveBuild,
  writeChecksumFiles,
  meldeTemporaere,
  raeumeTemporaere,
  raeumeWaisenBlockmaps,
  matchArtefakt,
  EXE_PATTERN,
  NOTES_PATTERN,
  TEMP_EXE_PATTERN,
} from '../../scripts/archive-build.js';

describe('archive-build — Pattern', () => {
  it('erkennt Versions-EXEs und Release-Notes', () => {
    expect(EXE_PATTERN.test('EM4me-0.85.0-Portable.exe')).toBe(true);
    expect(EXE_PATTERN.test('EM4me-0.85.0-Setup.exe')).toBe(true);
    // 4T-000643: Altnamen bleiben als Alternation erkannt (Robustheit fuer
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

// 4T-001205 (Epic 3E-000121): vorbereitete Artefakt-Formate der Zielplattformen —
// AppImage (Linux) und DMG (macOS) ohne Varianten-Zusatz. Die Windows-Muster
// bleiben unveraendert; matchArtefakt ist die eine Erkennung fuer alle.
describe('4T-001205: Artefakt-Formate der Zielplattformen', () => {
  it('erkennt AppImage und DMG mit der Version als Fanggruppe', () => {
    expect(matchArtefakt('EM4me-1.119.0.AppImage')?.[1]).toBe('1.119.0');
    expect(matchArtefakt('EM4me-1.119.0.dmg')?.[1]).toBe('1.119.0');
    expect(matchArtefakt('EM4me-1.119.0-Setup.exe')?.[1]).toBe('1.119.0');
    expect(matchArtefakt('EM4me-1.119.0.AppImage.blockmap')).toBe(null);
    expect(matchArtefakt('EM4me-1.119.0.zip')).toBe(null);
  });

  it('erkennt temporaere Bauten auch ohne Varianten-Zusatz', () => {
    expect(TEMP_EXE_PATTERN.test('EM4me-T-1.118.0-202608251200.AppImage')).toBe(true);
    expect(TEMP_EXE_PATTERN.test('EM4me-T-1.118.0-202608251200.dmg')).toBe(true);
    // Gegenprobe in beide Richtungen: Release-Artefakt ist kein T-Bau und
    // umgekehrt.
    expect(TEMP_EXE_PATTERN.test('EM4me-1.118.0.AppImage')).toBe(false);
    expect(matchArtefakt('EM4me-T-1.118.0-202608251200.AppImage')).toBe(null);
  });

  it('archiviert gemischte Artefakt-Saetze und schreibt eine Pruefsummen-Datei je Version', () => {
    const move = vi.fn(() => true);
    const writeChecksums = vi.fn(() => true);
    const code = archiveBuild(
      ['EM4me-1.119.0-Portable.exe', 'EM4me-1.119.0-Setup.exe', 'EM4me-1.119.0.AppImage'],
      {
        tagExists: () => false,
        guardBuildNumber: () => null,
        pkgVersion: '1.119.0',
        move,
        copyNotes: vi.fn(() => true),
        writeChecksums,
        raeumeWaisenBlockmaps: () => ({ entfernt: [], gescheitert: [] }),
      },
    );
    expect(code).toBe(0);
    expect(move.mock.calls.map(([name]) => name).sort()).toEqual([
      'EM4me-1.119.0-Portable.exe',
      'EM4me-1.119.0-Setup.exe',
      'EM4me-1.119.0.AppImage',
    ]);
    expect(writeChecksums).toHaveBeenCalledWith([
      'EM4me-1.119.0-Portable.exe',
      'EM4me-1.119.0-Setup.exe',
      'EM4me-1.119.0.AppImage',
    ]);
  });

  it('die Pruefsummen-Datei schneidet den Produktnamen auch ohne Varianten-Zusatz', () => {
    const geschrieben = [];
    const ok = writeChecksumFiles(['EM4me-1.119.0.AppImage'], {
      hash: () => 'abc123',
      write: (file, content) => geschrieben.push({ file, content }),
      read: () => null,
    });
    expect(ok).toBe(true);
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0].file.endsWith('EM4me-1.119.0-SHA256SUMS.txt')).toBe(true);
    expect(geschrieben[0].content).toBe('abc123  EM4me-1.119.0.AppImage\n');
  });
});

// 4T-001223 (Epic 3E-000122): deb als zweites Linux-Format, und die Pruefsummen-
// Sammel-Datei wird fortgeschrieben statt ersetzt, weil die Artefaktsaetze
// einer Version seit den Linux-Zielen in getrennten Bau-Laeufen entstehen.
describe('4T-001223: deb-Format und Pruefsummen-Fortschreibung', () => {
  it('erkennt deb als Release- und als temporaeres Artefakt', () => {
    expect(matchArtefakt('EM4me-1.120.0.deb')?.[1]).toBe('1.120.0');
    expect(TEMP_EXE_PATTERN.test('EM4me-T-1.119.0-202608261200.deb')).toBe(true);
    expect(matchArtefakt('EM4me-T-1.119.0-202608261200.deb')).toBe(null);
    expect(TEMP_EXE_PATTERN.test('EM4me-1.120.0.deb')).toBe(false);
  });

  it('schreibt Bestands-Zeilen fremder Dateien fort und erneuert die eigenen', () => {
    const write = vi.fn();
    const bestand =
      `${'a'.repeat(64)}  EM4me-1.120.0-Portable.exe\n` +
      `${'b'.repeat(64)}  EM4me-1.120.0.AppImage\n`;
    const ok = writeChecksumFiles(['EM4me-1.120.0.AppImage', 'EM4me-1.120.0.deb'], {
      hash: () => 'c'.repeat(64),
      write,
      read: () => bestand,
    });
    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe(
      `${'a'.repeat(64)}  EM4me-1.120.0-Portable.exe\n` +
        `${'c'.repeat(64)}  EM4me-1.120.0.AppImage\n` +
        `${'c'.repeat(64)}  EM4me-1.120.0.deb\n`,
    );
  });

  it('meldet einen unlesbaren Pruefsummen-Bestand und schreibt die eigenen Zeilen dennoch', () => {
    const write = vi.fn();
    const ok = writeChecksumFiles(['EM4me-1.120.0.deb'], {
      hash: () => 'd'.repeat(64),
      write,
      read: () => {
        throw new Error('Lesefehler');
      },
    });
    expect(ok).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe(`${'d'.repeat(64)}  EM4me-1.120.0.deb\n`);
  });
});

// 4T-000921: Ein temporaerer Bau bleibt in dist/ und wird gemeldet statt
// archiviert. Die Meldung ist die Zusicherung an den Product Owner, den
// Ablage-Ort nach jedem solchen Bau genannt zu bekommen.
describe('4T-000921: temporaerer Bau', () => {
  const TEMP = 'EM4me-T-0.105.0-202608071130-Portable.exe';

  it('erkennt den Dateinamen und grenzt ihn gegen Release-EXEs ab', () => {
    expect(TEMP_EXE_PATTERN.test(TEMP)).toBe(true);
    expect(TEMP_EXE_PATTERN.test('EM4me-T-0.105.0-202608071130-Setup.exe')).toBe(true);
    expect(TEMP_EXE_PATTERN.test('EM4me-0.105.0-Portable.exe')).toBe(false);
    expect(TEMP_EXE_PATTERN.test('EM4me-T-0.105.0-2026-Portable.exe')).toBe(false);
    // Gegenprobe: das Muster der Release-EXEs greift beim temporaeren Bau
    // nicht, sonst wanderte er ins Versions-Archiv.
    expect(EXE_PATTERN.test(TEMP)).toBe(false);
  });

  // Befund beim zweiten echten Bau am 2026-08-07: dist/ sammelt die temporaeren
  // Staende, weil keiner archiviert wird. Eine blosse Aufzaehlung liess offen,
  // welche Datei die eben gebaute ist — damit verfehlte die Erinnerung ihren
  // Zweck. Sie nennt den frischen Stand jetzt ausdruecklich.
  it('nennt den frischen Stand und trennt ihn von aelteren temporaeren Staenden', () => {
    const zeilen = [];
    meldeTemporaere(
      [
        'EM4me-T-0.105.0-202608071325-Portable.exe',
        'EM4me-T-0.105.0-202608071358-Setup.exe',
        'EM4me-T-0.105.0-202608071325-Setup.exe',
        'EM4me-T-0.105.0-202608071358-Portable.exe',
      ],
      (zeile) => zeilen.push(zeile),
    );
    const text = zeilen.join('\n');
    const stelleFrisch = text.indexOf('202608071358-Portable.exe');
    const stelleAlt = text.indexOf('202608071325');
    expect(stelleFrisch).toBeGreaterThan(-1);
    // Der frische Stand steht vor dem Hinweis auf die aelteren.
    expect(stelleFrisch).toBeLessThan(stelleAlt);
    expect(text).toContain('Zuletzt gebaut');
    expect(text).toContain('202608071358-Setup.exe');
    // Die aelteren werden gezaehlt, nicht einzeln als Ziel angeboten.
    expect(text).toContain('2 Datei(en) aelterer temporaerer Staende');
    expect(text).not.toContain('dist\\EM4me-T-0.105.0-202608071325-Portable.exe');
  });

  // Anordnung des Product Owners vom 2026-08-07: dist/ traegt nur den
  // aktuellen Bau, ueberholte temporaere Staende verschwinden von selbst.
  describe('Aufraeumen ueberholter Staende', () => {
    const BESTAND = [
      'EM4me-T-0.105.0-202608071325-Portable.exe',
      'EM4me-T-0.105.0-202608071325-Setup.exe',
      'EM4me-T-0.105.0-202608071325-Setup.exe.blockmap',
      'EM4me-T-0.105.0-202608071358-Portable.exe',
      'EM4me-T-0.105.0-202608071358-Setup.exe',
      'EM4me-T-0.105.0-202608071358-Setup.exe.blockmap',
    ];

    it('entfernt die aelteren Staende samt Blockmap und laesst den frischen stehen', () => {
      const entfernt = [];
      const ergebnis = raeumeTemporaere(BESTAND, {
        entfernen: (name) => entfernt.push(name),
        log: () => {},
      });
      expect(entfernt.sort()).toEqual([
        'EM4me-T-0.105.0-202608071325-Portable.exe',
        'EM4me-T-0.105.0-202608071325-Setup.exe',
        'EM4me-T-0.105.0-202608071325-Setup.exe.blockmap',
      ]);
      expect(ergebnis.gescheitert).toEqual([]);
    });

    it('laesst Releases und Zwischenprodukte unangetastet', () => {
      const entfernt = [];
      raeumeTemporaere(
        [
          ...BESTAND,
          'EM4me-0.105.0-Portable.exe',
          'EM4me-0.104.0-Setup.exe.blockmap',
          'release-notes-0.105.0.md',
          'builder-debug.yml',
        ],
        { entfernen: (name) => entfernt.push(name), log: () => {} },
      );
      expect(entfernt.every((name) => name.includes('-T-0.105.0-202608071325-'))).toBe(true);
      expect(entfernt).toHaveLength(3);
    });

    it('entfernt nichts, wenn nur ein Stand vorliegt', () => {
      const entfernt = [];
      raeumeTemporaere(BESTAND.slice(3), {
        entfernen: (name) => entfernt.push(name),
        log: () => {},
      });
      expect(entfernt).toEqual([]);
    });

    it('macht aus einer gesperrten Datei einen Hinweis, keinen Fehlschlag', () => {
      const zeilen = [];
      const ergebnis = raeumeTemporaere(BESTAND, {
        entfernen: (name) => {
          if (name.endsWith('Portable.exe')) throw new Error('EBUSY');
        },
        log: (zeile) => zeilen.push(zeile),
      });
      expect(ergebnis.gescheitert).toEqual(['EM4me-T-0.105.0-202608071325-Portable.exe']);
      expect(ergebnis.entfernt).toHaveLength(2);
      expect(zeilen.join('\n')).toContain('laeuft er noch?');
    });

    it('meldet nach dem Aufraeumen nur noch den frischen Stand', () => {
      const zeilen = [];
      const code = archiveBuild(BESTAND, {
        // 4T-001028: Ein temporaerer Bau entsteht genau dann, wenn die
        // Versions-Angabe bereits eine Release-Marke traegt; der Lauf wird
        // seither daran erkannt und nicht mehr am Datei-Bestand.
        pkgVersion: '0.105.0',
        tagExists: (v) => v === '0.105.0',
        guardBuildNumber: () => null,
        move: vi.fn(() => true),
        copyNotes: vi.fn(() => true),
        writeChecksums: vi.fn(() => true),
        raeumeTemporaere: () => ({
          entfernt: BESTAND.filter((n) => n.includes('202608071325')),
          gescheitert: [],
        }),
        meldeTemporaere: (namen) => zeilen.push(...namen),
      });
      expect(code).toBe(0);
      expect(zeilen).toEqual([
        'EM4me-T-0.105.0-202608071358-Portable.exe',
        'EM4me-T-0.105.0-202608071358-Setup.exe',
      ]);
    });
  });

  // Anordnung des Product Owners vom 2026-08-07: dist/ traegt nur den aktuellen
  // Bau, also auch keine Blockmaps frueherer Bauten. Das Aufraeumen gab es
  // schon einmal (Aenderungsprotokoll 0.11.0) und ging mit dem Rueckbau des
  // Auto-Update-Apparats verloren.
  describe('Aufraeumen verwaister Blockmaps', () => {
    it('entfernt Blockmaps ohne zugehoerige Programmdatei, ueber alle Produktnamen hinweg', () => {
      const entfernt = [];
      raeumeWaisenBlockmaps(
        [
          'EM4me-T-0.105.0-202608071358-Setup.exe',
          'EM4me-T-0.105.0-202608071358-Setup.exe.blockmap',
          'EM4me-0.104.0-Setup.exe.blockmap',
          'Perspective Markdown++-0.30.0-Setup.exe.blockmap',
          'SCG Markdown-0.24.0-Setup.exe.blockmap',
          'builder-debug.yml',
          'win-unpacked',
        ],
        { entfernen: (name) => entfernt.push(name), log: () => {} },
      );
      expect(entfernt).toEqual([
        'EM4me-0.104.0-Setup.exe.blockmap',
        'Perspective Markdown++-0.30.0-Setup.exe.blockmap',
        'SCG Markdown-0.24.0-Setup.exe.blockmap',
      ]);
    });

    it('laesst die Blockmap des aktuellen Baus stehen', () => {
      const entfernt = [];
      raeumeWaisenBlockmaps(['EM4me-0.106.0-Setup.exe', 'EM4me-0.106.0-Setup.exe.blockmap'], {
        entfernen: (name) => entfernt.push(name),
        log: () => {},
      });
      expect(entfernt).toEqual([]);
    });

    it('macht aus einer gesperrten Blockmap einen Hinweis, keinen Fehlschlag', () => {
      const zeilen = [];
      const ergebnis = raeumeWaisenBlockmaps(['EM4me-0.104.0-Setup.exe.blockmap'], {
        entfernen: () => {
          throw new Error('EBUSY');
        },
        log: (zeile) => zeilen.push(zeile),
      });
      expect(ergebnis.entfernt).toEqual([]);
      expect(ergebnis.gescheitert).toEqual(['EM4me-0.104.0-Setup.exe.blockmap']);
      expect(zeilen.join('\n')).toContain('verwaiste Beigabe');
    });

    // 4T-000957 (Nebenpunkt zu Befund B-06, Entscheidung des Product Owners vom
    // 2026-08-11): Dieselbe Regel gilt fuer die Release-Hinweise. Sie sammelten
    // sich ueber alle Versionen an und waren am 2026-07-22 die Voraussetzung
    // eines echten Schadens, als ein pauschales Kopieren eine Archiv-Fassung
    // mit einer aelteren Probe-Fassung ueberschrieb.
    it('entfernt Release-Hinweise fremder Versionen und behaelt die des Baus', () => {
      const entfernt = [];
      raeumeWaisenBlockmaps(
        [
          'EM4me-0.106.0-Setup.exe',
          'EM4me-0.106.0-Portable.exe',
          'release-notes-0.106.0.md',
          'release-notes-0.105.0.md',
          'release-notes-0.88.0.md',
          'builder-debug.yml',
        ],
        { entfernen: (name) => entfernt.push(name), log: () => {} },
      );
      expect(entfernt).toEqual(['release-notes-0.105.0.md', 'release-notes-0.88.0.md']);
    });

    // Ein temporaerer Bau fuehrt seine Basis-Version im Namen; die Hinweise
    // dieser Version gehoeren zu ihm und bleiben.
    it('behaelt die Hinweise der Basis-Version eines temporaeren Baus', () => {
      const entfernt = [];
      raeumeWaisenBlockmaps(
        [
          'EM4me-T-0.105.0-202608111521-Portable.exe',
          'release-notes-0.105.0.md',
          'release-notes-0.104.0.md',
        ],
        { entfernen: (name) => entfernt.push(name), log: () => {} },
      );
      expect(entfernt).toEqual(['release-notes-0.104.0.md']);
    });

    it('greift auch nach dem Archivieren, weil die Blockmap nicht mitwandert', () => {
      const uebergeben = [];
      archiveBuild(['EM4me-0.106.0-Setup.exe', 'EM4me-0.106.0-Setup.exe.blockmap'], {
        tagExists: () => false,
        guardBuildNumber: () => null,
        move: vi.fn(() => true),
        copyNotes: vi.fn(() => true),
        writeChecksums: vi.fn(() => true),
        raeumeWaisenBlockmaps: (verbleibend) => {
          uebergeben.push(...verbleibend);
          return { entfernt: [], gescheitert: [] };
        },
      });
      // Die archivierte EXE ist raus, ihre Blockmap steht allein da.
      expect(uebergeben).toEqual(['EM4me-0.106.0-Setup.exe.blockmap']);
    });
  });

  it('archiviert ihn nicht und nennt stattdessen den Ordner', () => {
    const move = vi.fn(() => true);
    const melde = vi.fn();
    const code = archiveBuild([TEMP], {
      pkgVersion: '0.105.0',
      tagExists: (v) => v === '0.105.0',
      guardBuildNumber: () => null,
      move,
      copyNotes: vi.fn(() => true),
      writeChecksums: vi.fn(() => true),
      meldeTemporaere: melde,
    });
    expect(code).toBe(0);
    expect(move).not.toHaveBeenCalled();
    expect(melde).toHaveBeenCalledWith([TEMP]);
  });

  // Befund des ersten echten Laufs am 2026-08-07: Die EXEs blieben liegen, die
  // Notes-Kopie lief aber weiter und schrieb erneut ins Versions-Archiv, weil
  // ihr Filter allein an der package.json-Version haengt. Seither ruehrt ein
  // temporaerer Bau das Archiv ueberhaupt nicht an.
  it('ruehrt das Versions-Archiv auch dann nicht an, wenn Reste eines Releases in dist/ liegen', () => {
    const move = vi.fn(() => true);
    const copyNotes = vi.fn(() => true);
    const writeChecksums = vi.fn(() => true);
    const code = archiveBuild([TEMP, 'release-notes-0.105.0.md', 'EM4me-0.105.0-Portable.exe'], {
      // 4T-001028: Die 0.105.0 traegt ihre Release-Marke — genau deshalb baut
      // build-app.js hier temporaer, und genau daran erkennt der Archiv-Schritt
      // den Lauf. Vorher stand hier `tagExists: () => false`; damit beschrieb
      // die Vorlage einen Bestand, den es so nie gibt (ohne Marke entstuende
      // gar kein T-Artefakt). Die Zusicherung des Falls ist unveraendert.
      tagExists: (v) => v === '0.105.0',
      guardBuildNumber: () => null,
      pkgVersion: '0.105.0',
      move,
      copyNotes,
      writeChecksums,
      meldeTemporaere: vi.fn(),
    });
    expect(code).toBe(0);
    expect(move).not.toHaveBeenCalled();
    expect(copyNotes).not.toHaveBeenCalled();
    expect(writeChecksums).not.toHaveBeenCalled();
  });

  // 4T-001028: Die Gegenrichtung desselben Bestands — ein frischer Release-Bau,
  // waehrend Artefakte frueherer temporaerer Bauten in dist/ liegen geblieben
  // sind. Befund der Release-Vorbereitung 1.107.0 (2026-08-13): Der Lauf stufte
  // sich am blossen Vorhandensein der T-Dateien als temporaer ein und
  // archivierte nichts; Schritt 5 der gefuehrten Strecke wurde rot, und der
  // Altbestand musste von Hand geraeumt werden.
  it('archiviert einen frischen Release-Bau, obwohl T-Altbestand in dist/ liegt', () => {
    const move = vi.fn(() => true);
    const copyNotes = vi.fn(() => true);
    const writeChecksums = vi.fn(() => true);
    const melde = vi.fn();
    const raeume = vi.fn(() => ({ entfernt: [], gescheitert: [] }));
    const code = archiveBuild(
      [
        TEMP,
        'EM4me-T-0.105.0-202608071358-Setup.exe',
        'EM4me-0.106.0-Portable.exe',
        'EM4me-0.106.0-Setup.exe',
        'release-notes-0.106.0.md',
      ],
      {
        // Die gebaute 0.106.0 traegt noch keine Marke (die Marke folgt nach dem
        // Bau), die Basis 0.105.0 des Altbestands sehr wohl.
        tagExists: (v) => v === '0.105.0',
        guardBuildNumber: () => null,
        pkgVersion: '0.106.0',
        move,
        copyNotes,
        writeChecksums,
        meldeTemporaere: melde,
        raeumeTemporaere: raeume,
        raeumeWaisenBlockmaps: () => ({ entfernt: [], gescheitert: [] }),
      },
    );
    expect(code).toBe(0);
    // Beide Release-EXEs wandern ins Archiv, die Notes-Datei der gebauten
    // Version geht mit, und die Pruefsummen entstehen ueber die archivierten.
    expect(move.mock.calls.map(([name]) => name).sort()).toEqual([
      'EM4me-0.106.0-Portable.exe',
      'EM4me-0.106.0-Setup.exe',
    ]);
    expect(copyNotes).toHaveBeenCalledWith('release-notes-0.106.0.md');
    expect(writeChecksums).toHaveBeenCalledWith([
      'EM4me-0.106.0-Portable.exe',
      'EM4me-0.106.0-Setup.exe',
    ]);
    // Der Altbestand bleibt unangetastet: nicht archiviert, nicht als frischer
    // Bau gemeldet, nicht aufgeraeumt.
    expect(melde).not.toHaveBeenCalled();
    expect(raeume).not.toHaveBeenCalled();
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

describe('X-10/4T-000683: Nur die Notes der gebauten Version wandern ins Archiv', () => {
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

describe('4T-000375: Build-Nummer-Guard', () => {
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

// 4T-000658: Ohne Code-Signatur ist die Prüfsumme der einzige Integritäts-
// Nachweis. Sie muss deshalb automatisch entstehen und darf nur Dateien
// beschreiben, die tatsächlich im Versions-Archiv liegen.
describe('4T-000658: Prüfsummen beim Archivieren', () => {
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

describe('4T-000658: writeChecksumFiles', () => {
  it('schreibt je Version eine Sammel-Datei im sha256sum-Format', () => {
    const write = vi.fn();
    const ok = writeChecksumFiles(['EM4me-0.86.0-Setup.exe', 'EM4me-0.86.0-Portable.exe'], {
      hash: (name) => (name.includes('Setup') ? 'aaa' : 'bbb'),
      write,
      read: () => null,
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
      read: () => null,
    });
    const targets = write.mock.calls.map(([t]) => t.split(/[\\/]/).pop());
    expect(targets).toContain('EM4me-0.86.0-SHA256SUMS.txt');
    expect(targets).toContain('SCG Markdown-0.24.0-SHA256SUMS.txt');
  });

  it('schreibt keine Datei, wenn keine Prüfsumme gebildet werden konnte', () => {
    const write = vi.fn();
    const ok = writeChecksumFiles(['EM4me-0.86.0-Portable.exe'], {
      hash: () => null,
      write,
      read: () => null,
    });
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
      read: () => null,
    });
    expect(ok).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe('bbb  EM4me-0.86.0-Portable.exe\n');
  });
});
