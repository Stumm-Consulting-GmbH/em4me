// 4T-002221: Wächter der Anordnung des Product Owners vom 2026-10-10.
//
// Im Wortlaut: «Das muss immer eine EXE-Datei sein.» und «… verbiete ich dir
// und allen anderen Clonen, in den dist-Ordnern Dinge als zip-Dateien
// abzulegen. Das heißt, auch diese temporären Dateien müssen immer portable
// .exe-Dateien sein. Es darf nie mehr eine zip-Datei sein.»
//
// Die portable Fassung ist die einzelne Programmdatei, die das Bau-Werkzeug
// mit seinem Ziel `portable` erzeugt, im Release wie im temporären Bau. Dieser
// Wächter hält die Stellen fest, an denen ein Zug die Lieferform zuletzt
// unbemerkt auf ein Archiv umgestellt hatte: die Bau-Ziele und Bau-Kommandos
// in package.json, die erwarteten Artefakte des Versions-Archivs und den
// Bau-Ablauf. Wer hier etwas ändern will, braucht vorher die ausdrückliche
// Anordnung des Product Owners im Wortlaut (Leitdatei, Abschnitt «Test-Phase»).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WURZEL = path.resolve(__dirname, '..', '..');
const paket = JSON.parse(fs.readFileSync(path.join(WURZEL, 'package.json'), 'utf8'));
const muster = require('../../scripts/artefakt-muster.js');

describe('Die portable Fassung ist immer eine EXE (4T-002221)', () => {
  it('baut unter Windows das Ziel «portable» neben dem Installations-Programm', () => {
    const ziele = (paket.build.win.target || []).map((z) => (typeof z === 'string' ? z : z.target));
    expect(ziele).toContain('portable');
    expect(ziele).toContain('nsis');
  });

  it('benennt die portable Datei als Programmdatei «…-Portable.<ext>» des Ziels portable', () => {
    expect(paket.build.portable).toBeTruthy();
    expect(paket.build.portable.artifactName).toBe('${productName}-${version}-Portable.${ext}');
  });

  it('erzeugt in den Bau-Kommandos kein Archiv der portablen Fassung', () => {
    for (const name of ['build', 'build:portable', 'build:pruefstand']) {
      const kommando = paket.scripts[name] || '';
      expect(kommando, name).not.toMatch(/zip|archiv/i);
    }
    expect(paket.scripts['build:portable']).toMatch(/--win portable\b/);
  });

  it('erwartet im Versions-Archiv die portable Programmdatei, nie ein Archiv', () => {
    const windows = muster.FREIGEGEBENE_PLATTFORMEN.find((p) => p.kennung === 'windows');
    expect(windows.endungen).toContain('-Portable.exe');
    for (const plattform of muster.FREIGEGEBENE_PLATTFORMEN) {
      for (const endung of plattform.endungen)
        expect(endung, plattform.kennung).not.toMatch(/\.zip$/i);
    }
    expect(muster.matchArtefakt('EM4me-1.147.0-Portable.exe')).toBeTruthy();
    expect(muster.matchArtefakt('EM4me-1.147.0-Portable.zip')).toBeFalsy();
    expect('EM4me-T-1.147.0-202610101200-Portable.zip').not.toMatch(muster.TEMP_EXE_PATTERN);
  });

  it('kennt im Bau-Ablauf keinen Schritt, der die portable Fassung packt', () => {
    expect(fs.existsSync(path.join(WURZEL, 'scripts', 'build-folder-archive.js'))).toBe(false);
    const bau = fs.readFileSync(path.join(WURZEL, 'scripts', 'build-app.js'), 'utf8');
    expect(bau).not.toMatch(/\.zip\b|ordner-archiv/i);
  });
});
