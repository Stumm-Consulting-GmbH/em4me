// 4T-001826 (Epic 3E-000254): Der versionierte Stand der Demo-Belege entspricht
// dem Erzeugnis von scripts/demo-belege-erzeugen.js.
//
// Die Beleg-Datei `src/demo/Library.mddl`, die Zähler-Datei
// `src/demo/Area_Database.mdda` und die drei geänderten Zellen von
// `src/demo/Library.md` dürfen allein durch das Skript entstehen, das die
// Schreib-Schnittstelle der Anwendung ruft. Dieser Fall fährt es mit
// `--pruefen`: Es erzeugt die drei Dateien in seiner Kopie unter
// `Tests/4T-001826/` neu und vergleicht sie Byte für Byte mit `src/demo/`, ohne
// dort etwas zu schreiben. Wer eine der Dateien von Hand ändert, oder wer die
// Schnittstelle so ändert, dass sie andere Belege schriebe, macht ihn rot.
//
// Gestartet wird ein echter Kindprozess und nicht das Modul im Test-Prozess:
// Das Skript ist ein Werkzeug mit Rückgabewert, und genau der ist die Aussage.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PROZESS_ZEITLIMIT } from '../zeitlimits.js';

// Die Datei startet einen realen Prozess und trägt deshalb das datei-weite
// Zeitlimit für Prozess-Starts.
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT });

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKRIPT = path.join(REPO, 'scripts', 'demo-belege-erzeugen.js');

function fahre(argumente) {
  const kind = spawn(process.execPath, [SKRIPT, ...argumente], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let aus = '';
  let fehlerText = '';
  kind.stdout.on('data', (d) => (aus += d.toString()));
  kind.stderr.on('data', (d) => (fehlerText += d.toString()));
  return new Promise((fertig, scheitern) => {
    kind.once('error', scheitern);
    kind.once('close', (code) => fertig({ code, aus, fehlerText }));
  });
}

describe('Demo-Belege: versionierter Stand gleich dem Erzeugnis des Skripts (4T-001826)', () => {
  it('node scripts/demo-belege-erzeugen.js --pruefen endet mit Rückgabewert 0', async () => {
    const lauf = await fahre(['--pruefen']);
    expect(lauf.fehlerText).toBe('');
    expect(lauf.code).toBe(0);
    expect(lauf.aus).toContain('byte-gleich');
  });
});

// 4T-001966: Regressions-Fall zum Export-Abbruch von 1.142.0. Die rekursive
// Baum-Kopie von Node stürzte unter Windows ab, sobald der Ziel-Pfad einen
// Umlaut trug; das Skript kopiert seither Datei für Datei. Geprüft wird die
// Kopier-Funktion unmittelbar an einem Ziel mit «ö» im Pfad, weil sich das
// Skript selbst nur unter seinem festen Repositoriums-Pfad fahren lässt.
describe('Demo-Belege: Kopie in einen Ziel-Pfad mit Umlaut (4T-001966)', () => {
  it('kopiereBaum legt Unterordner an und kopiert jede Datei byte-gleich', () => {
    const { kopiereBaum } = createRequire(import.meta.url)(SKRIPT);
    const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-belege-'));
    try {
      const quelle = path.join(wurzel, 'quelle');
      fs.mkdirSync(path.join(quelle, 'Unterordner Ä'), { recursive: true });
      const dateien = {
        'Library.md': 'Gödel, Escher, Bach\n',
        [path.join('Unterordner Ä', 'daten.bin')]: Buffer.from([0, 195, 182, 255]),
      };
      for (const [rel, inhalt] of Object.entries(dateien))
        fs.writeFileSync(path.join(quelle, rel), inhalt);

      const ziel = path.join(wurzel, 'Veröffentlichung', 'Kopie');
      kopiereBaum(quelle, ziel);

      for (const [rel, inhalt] of Object.entries(dateien))
        expect(fs.readFileSync(path.join(ziel, rel)).equals(Buffer.from(inhalt)), rel).toBe(true);
      expect(fs.readdirSync(wurzel).sort()).toEqual(['Veröffentlichung', 'quelle']);
    } finally {
      fs.rmSync(wurzel, { recursive: true, force: true });
    }
  });
});
