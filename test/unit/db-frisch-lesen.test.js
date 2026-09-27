// 4T-001964 (Epic 3E-000254): Lesen am Zwischenspeicher des Netzwerk-Clients
// vorbei — der Baustein `liesFrisch` (AK2) und die Zusage, dass jeder Leser im
// Datenbank-Speicherweg ihn als Vorgabe benutzt (AK5).
//
// **Der Befund selbst ist hier nicht nachstellbar.** Der alte Stand entsteht
// nur, wenn ein ANDERER Rechner die Datei auf einer Netz-Freigabe ersetzt; der
// Nachweis dafür ist der Zwei-Rechner-Lauf mit dem Messprogramm unter
// `Tests/4T-001824/` und das Diagnose-Experiment unter `Tests/4T-001964/`. Was
// hier steht, sichert das Gegenmittel: dass mit Schreibrecht geöffnet wird, dass
// dabei nichts geschrieben wird, dass ein fehlendes Schreibrecht auf das
// gewöhnliche Lesen zurückfällt, und dass niemand im Speicherweg wieder auf das
// gewöhnliche `readFile` zurückstellt.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  liesFrisch,
  frischerDateizugriff,
  RUECKFALL,
} from '../../src/main/documents/frisch-lesen.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ordner = [];
function tempDatei(inhalt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-frisch-'));
  ordner.push(dir);
  const pfad = path.join(dir, 'Kunden.md');
  fs.writeFileSync(pfad, inhalt, 'utf8');
  return pfad;
}

afterEach(() => {
  for (const dir of ordner.splice(0)) {
    for (const name of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, name), 0o666);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Ein Dateizugriff, der mitschreibt, womit geöffnet wird.
function beobachteterZugriff(fehlerBeimOeffnen) {
  const aufrufe = [];
  return {
    aufrufe,
    fsp: {
      async open(pfad, modus) {
        aufrufe.push(['open', modus]);
        if (fehlerBeimOeffnen) throw Object.assign(new Error('x'), { code: fehlerBeimOeffnen });
        return fs.promises.open(pfad, modus);
      },
      async readFile(pfad, optionen) {
        aufrufe.push(['readFile']);
        return fs.promises.readFile(pfad, optionen);
      },
    },
  };
}

describe('liesFrisch (4T-001964)', () => {
  it('öffnet mit Schreibrecht und liefert den Inhalt', async () => {
    const pfad = tempDatei('---\ndb-table: {}\n---\nÄnderung\n');
    const z = beobachteterZugriff();
    expect(await liesFrisch(pfad, 'utf8', { fsp: z.fsp })).toBe(
      '---\ndb-table: {}\n---\nÄnderung\n',
    );
    expect(z.aufrufe).toEqual([['open', 'r+']]);
  });

  it('liefert ohne Kodierung einen Puffer', async () => {
    const pfad = tempDatei('abc');
    const puffer = await liesFrisch(pfad);
    expect(Buffer.isBuffer(puffer)).toBe(true);
    expect(puffer.toString('utf8')).toBe('abc');
  });

  it('schreibt nichts: Inhalt, Größe und Änderungszeit bleiben', async () => {
    const pfad = tempDatei('Stand 1\n');
    const alt = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(pfad, alt, alt);
    await liesFrisch(pfad, 'utf8');
    const stat = fs.statSync(pfad);
    expect(fs.readFileSync(pfad, 'utf8')).toBe('Stand 1\n');
    expect(stat.mtimeMs).toBe(alt.getTime());
  });

  it.each([...RUECKFALL])('fällt bei %s auf das gewöhnliche Lesen zurück', async (code) => {
    const pfad = tempDatei('lesbar');
    const z = beobachteterZugriff(code);
    expect(await liesFrisch(pfad, 'utf8', { fsp: z.fsp })).toBe('lesbar');
    expect(z.aufrufe).toEqual([['open', 'r+'], ['readFile']]);
  });

  it('liest eine schreibgeschützte Datei', async () => {
    const pfad = tempDatei('nur lesen');
    fs.chmodSync(pfad, 0o444);
    expect(await liesFrisch(pfad, 'utf8')).toBe('nur lesen');
  });

  it('meldet eine fehlende Datei unverändert mit ENOENT', async () => {
    const pfad = path.join(os.tmpdir(), 'em4me-frisch-gibt-es-nicht', 'x.md');
    await expect(liesFrisch(pfad, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('der frische Dateizugriff trägt die übrigen Funktionen von fs.promises', () => {
    for (const name of [
      'open',
      'stat',
      'lstat',
      'appendFile',
      'writeFile',
      'rename',
      'unlink',
      'readdir',
    ])
      expect(typeof frischerDateizugriff[name], name).toBe('function');
    expect(frischerDateizugriff.readFile).not.toBe(fs.promises.readFile);
  });
});

describe('Vorgabe im Datenbank-Speicherweg (4T-001964, AK5)', () => {
  const MODULE = [
    'src/main/database/record-auftrag.js',
    'src/main/database/vorgangs-kennung.js',
    'src/main/database/change-log.js',
    'src/main/database/intent-log.js',
    'src/main/database/intent-recovery.js',
    'src/main/database/lock-store.js',
  ];

  it.each(MODULE)('%s liest ohne eigene Naht frisch', (rel) => {
    const text = fs.readFileSync(path.join(WURZEL, rel), 'utf8');
    expect(text).toContain('d.fsp || frischerDateizugriff');
    expect(text).not.toMatch(/require\('node:fs\/promises'\)/);
  });

  it('die Stand-Prüfung vor dem Überschreiben liest frisch', () => {
    const text = fs.readFileSync(path.join(WURZEL, 'src/main/documents/save-guard.js'), 'utf8');
    expect(text).toContain('await liesFrisch(absolute');
    expect(text).not.toMatch(/\bfs\.readFile\(/);
  });
});
