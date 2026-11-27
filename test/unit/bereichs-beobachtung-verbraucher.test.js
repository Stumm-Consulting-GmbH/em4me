// 4T-002830 (Epic 3E-000446): Die beiden Verbraucher der gemeinsamen
// Bereichs-Beobachtung an einem echten Ordner, mit der echten Überwachung der
// Plattform.
//
// (b) Alle Ereignis-Arten kommen bei beiden Verbrauchern an: beim Bereichs-Index
//     (neu, geändert, entfernt je Datei, auch für den Inhalt eines Ordners, der
//     als Ganzes hinein- oder hinausgeschoben wird) und bei der Datei-Liste
//     (Struktur-Meldung, Ausschlüsse wie bisher).
// (d) Wächter gegen den Rückfall: Kein Verbraucher einer Bereichs-Wurzel ruft
//     chokidar auf, und die gemeinsame Beobachtung richtet `watch` allein auf
//     die Wurzel oder auf Ordner.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BEOBACHTUNG_ZEITLIMIT } from '../zeitlimits.js';
import { merkeZwischenspeicher, warteAufZwischenspeicher } from './index-abbau-helfer.js';

// Je Meldung des Betriebssystems ein Drittel des Fall-Limits (test/zeitlimits.js).
const WARTEN = { timeout: BEOBACHTUNG_ZEITLIMIT / 3, interval: 25 };
vi.setConfig({ testTimeout: BEOBACHTUNG_ZEITLIMIT });

const require = createRequire(import.meta.url);
const backlinks = require('../../src/main/backlinks.js');
const store = require('../../src/main/index/store.js');
const { beobachteWurzel } = require('../../src/main/area/bereichs-beobachtung.js');
const { baueStrukturVerbraucher } = require('../../src/main/area/area-watch-ignore.js');

const BESITZER = 'pruef:beobachtung';

describe('(b) Bereichs-Index an der gemeinsamen Beobachtung', () => {
  let wurzel;
  let eintrag;
  let draussen;

  beforeEach(async () => {
    wurzel = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-idx-beob-')));
    draussen = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-idx-aussen-')));
    fs.writeFileSync(path.join(wurzel, 'Start.md'), '# Start\n', 'utf8');
    backlinks.ensureAreaIndex(wurzel, BESITZER);
    await vi.waitFor(
      () => expect(store.indexes.get(path.resolve(wurzel))?.status).toBe('ready'),
      WARTEN,
    );
    eintrag = store.indexes.get(path.resolve(wurzel));
    await eintrag.watcher.bereit;
  });

  afterEach(async () => {
    const gemerkt = merkeZwischenspeicher([path.resolve(wurzel)]);
    vi.useFakeTimers();
    backlinks.releaseRoot(path.resolve(wurzel), BESITZER);
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
    // 4T-002885: auf den letzten Schreibvorgang des Zwischenspeichers warten
    // statt eine feste Zeit (index-abbau-helfer.js).
    await warteAufZwischenspeicher(gemerkt);
    fs.rmSync(wurzel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.rmSync(draussen, { recursive: true, force: true });
  });

  it('Datei anlegen, ändern, umbenennen und löschen erreicht den Index', async () => {
    const a = path.join(wurzel, 'Notiz.md');
    fs.writeFileSync(a, '# Notiz\n', 'utf8');
    await vi.waitFor(() => expect(eintrag.files.has(a)).toBe(true), WARTEN);
    fs.writeFileSync(a, '# Notiz\n\n#beobachtet\n', 'utf8');
    await vi.waitFor(() => expect(eintrag.tagsPerFile.get(a)).toContain('beobachtet'), WARTEN);
    const b = path.join(wurzel, 'Umbenannt.md');
    fs.renameSync(a, b);
    await vi.waitFor(() => {
      expect(eintrag.files.has(a)).toBe(false);
      expect(eintrag.files.has(b)).toBe(true);
    }, WARTEN);
    fs.rmSync(b);
    await vi.waitFor(() => expect(eintrag.files.has(b)).toBe(false), WARTEN);
  });

  it('ein Ordner samt Inhalt hinein und hinaus: jede Datei folgt', async () => {
    fs.mkdirSync(path.join(draussen, 'Mappe', 'Tief'), { recursive: true });
    fs.writeFileSync(path.join(draussen, 'Mappe', 'Eins.md'), '# Eins\n', 'utf8');
    fs.writeFileSync(path.join(draussen, 'Mappe', 'Tief', 'Zwei.md'), '# Zwei\n', 'utf8');
    fs.renameSync(path.join(draussen, 'Mappe'), path.join(wurzel, 'Mappe'));
    const eins = path.join(wurzel, 'Mappe', 'Eins.md');
    const zwei = path.join(wurzel, 'Mappe', 'Tief', 'Zwei.md');
    await vi.waitFor(() => {
      expect(eintrag.files.has(eins)).toBe(true);
      expect(eintrag.files.has(zwei)).toBe(true);
    }, WARTEN);
    fs.renameSync(path.join(wurzel, 'Mappe'), path.join(draussen, 'Zurück'));
    await vi.waitFor(() => {
      expect(eintrag.files.has(eins)).toBe(false);
      expect(eintrag.files.has(zwei)).toBe(false);
    }, WARTEN);
  });

  it('Punkt-Ordner und node_modules bleiben dem Index fern; Nicht-Markdown führt die Namens-Zuordnung', async () => {
    fs.mkdirSync(path.join(wurzel, '.verborgen'));
    fs.mkdirSync(path.join(wurzel, 'node_modules'));
    fs.writeFileSync(path.join(wurzel, '.verborgen', 'X.md'), '# X\n', 'utf8');
    fs.writeFileSync(path.join(wurzel, 'node_modules', 'Y.md'), '# Y\n', 'utf8');
    const bild = path.join(wurzel, 'Bild.png');
    fs.writeFileSync(bild, 'png');
    await vi.waitFor(
      () => expect([...eintrag.assetNameMap.values()].some((menge) => menge.has(bild))).toBe(true),
      WARTEN,
    );
    expect(eintrag.files.has(path.join(wurzel, '.verborgen', 'X.md'))).toBe(false);
    expect(eintrag.files.has(path.join(wurzel, 'node_modules', 'Y.md'))).toBe(false);
  });

  // Hinweis 9 des Zweitblicks: Eine Punkt-Datei direkt in der Wurzel meldet der
  // Beobachter als Struktur-Meldung weiter; allein die Ignorier-Regel des Index
  // hält sie aus dem Verweis-Bestand. Ohne sie stünde `.verborgen.md` darin.
  it('eine Punkt-Datei in der Wurzel bleibt dem Index fern, auch wenn sie gemeldet wird', async () => {
    const gemeldet = [];
    const zeuge = beobachteWurzel(wurzel, {
      melde: (art, p) => gemeldet.push([art, path.basename(p)]),
    });
    await zeuge.bereit;
    try {
      fs.writeFileSync(path.join(wurzel, '.verborgen.md'), '# V', 'utf8');
      await vi.waitFor(() => expect(gemeldet).toContainEqual(['add', '.verborgen.md']), WARTEN);
      fs.writeFileSync(path.join(wurzel, 'Sichtbar.md'), '# S', 'utf8');
      await vi.waitFor(
        () => expect(eintrag.files.has(path.join(wurzel, 'Sichtbar.md'))).toBe(true),
        WARTEN,
      );
      expect(eintrag.files.has(path.join(wurzel, '.verborgen.md'))).toBe(false);
    } finally {
      zeuge.close();
    }
  });
});

describe('(b) Datei-Liste an der gemeinsamen Beobachtung', () => {
  let wurzel;
  let griff;
  let meldungen;

  beforeEach(async () => {
    wurzel = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-liste-beob-')));
    fs.writeFileSync(path.join(wurzel, 'Start.md'), '# Start\n', 'utf8');
    meldungen = 0;
    const eintrag = { rootPath: wurzel, sperrOrdner: '.area-locks' };
    const isMddPath = (p) => /\.mdd[ab]?$/i.test(p);
    griff = beobachteWurzel(
      wurzel,
      baueStrukturVerbraucher(eintrag, isMddPath, () => meldungen++),
    );
    await griff.bereit;
  });

  afterEach(() => {
    griff.close();
    fs.rmSync(wurzel, { recursive: true, force: true });
  });

  async function ruhe() {
    await new Promise((r) => setTimeout(r, 600));
  }

  it('Struktur-Ereignisse melden sich: Datei und Ordner anlegen, umbenennen, löschen', async () => {
    fs.writeFileSync(path.join(wurzel, 'Neu.md'), 'x');
    await vi.waitFor(() => expect(meldungen).toBeGreaterThan(0), WARTEN);
    for (const schritt of [
      () => fs.mkdirSync(path.join(wurzel, 'Ordner')),
      () => fs.renameSync(path.join(wurzel, 'Neu.md'), path.join(wurzel, 'Ordner', 'Neu.md')),
      () => fs.rmSync(path.join(wurzel, 'Ordner'), { recursive: true }),
    ]) {
      const vorher = meldungen;
      schritt();
      await vi.waitFor(() => expect(meldungen).toBeGreaterThan(vorher), WARTEN);
    }
  });

  // Hinweis 10 des Zweitblicks: Ordner samt Inhalt von außen hinein und hinaus.
  it('ein Ordner samt Inhalt von außen hinein und wieder hinaus meldet sich', async () => {
    const draussen = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-liste-aussen-')));
    try {
      fs.mkdirSync(path.join(draussen, 'Mappe'));
      fs.writeFileSync(path.join(draussen, 'Mappe', 'Eins.md'), 'x');
      let vorher = meldungen;
      fs.renameSync(path.join(draussen, 'Mappe'), path.join(wurzel, 'Mappe'));
      await vi.waitFor(() => expect(meldungen).toBeGreaterThan(vorher), WARTEN);
      await ruhe();
      vorher = meldungen;
      fs.renameSync(path.join(wurzel, 'Mappe'), path.join(draussen, 'Zurück'));
      await vi.waitFor(() => expect(meldungen).toBeGreaterThan(vorher), WARTEN);
    } finally {
      fs.rmSync(draussen, { recursive: true, force: true });
    }
  });

  it('Inhalts-Änderung, Markdown-Daten-Dateien und der Sperr-Ordner melden sich nicht', async () => {
    fs.writeFileSync(path.join(wurzel, 'Area_Cache.mdda'), 'x');
    fs.mkdirSync(path.join(wurzel, '.area-locks'));
    await ruhe();
    meldungen = 0;
    fs.writeFileSync(path.join(wurzel, 'Start.md'), '# Start geändert, länger\n', 'utf8');
    fs.writeFileSync(path.join(wurzel, 'Area_Cache.mdda'), 'y, länger');
    fs.writeFileSync(path.join(wurzel, 'Neu.mddb'), 'z');
    fs.writeFileSync(path.join(wurzel, '.area-locks', 'sperre-1'), 'x');
    fs.rmSync(path.join(wurzel, '.area-locks', 'sperre-1'));
    await ruhe();
    expect(meldungen).toBe(0);
  });
});

describe('(d) Wächter gegen den Rückfall auf eine Überwachung je Datei', () => {
  const quelle = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('die Verbraucher einer Bereichs-Wurzel rufen chokidar nicht auf', () => {
    for (const rel of ['src/main/index/build.js', 'src/main/area/area-apps.js']) {
      const code = quelle(rel)
        .split('\n')
        .filter((z) => !z.trim().startsWith('//'))
        .join('\n');
      expect(code, rel).not.toMatch(/require\(\s*['"]chokidar['"]\s*\)/);
      expect(code, rel).not.toMatch(/chokidar\s*\.\s*watch/);
      expect(code, rel).toMatch(/beobachteWurzel\(/);
    }
  });

  it('die gemeinsame Beobachtung nutzt keine Bibliothek und ruft watch nur an einer Stelle', () => {
    const code = quelle('src/main/area/bereichs-beobachtung.js');
    expect(code).not.toMatch(/require\(\s*['"]chokidar['"]\s*\)/);
    expect(code).not.toMatch(/watchFile\(/);
    expect(code.match(/einstellung\.watch\(/g)).toHaveLength(1);
    // Die beiden Teil-Module richten selbst keine Überwachung ein.
    for (const rel of [
      'src/main/area/bereichs-beobachtung-baum.js',
      'src/main/area/bereichs-beobachtung-einordnung.js',
    ]) {
      const teil = quelle(rel)
        .split(/\r?\n/)
        .filter((z) => !z.trim().startsWith('//'))
        .join('\n');
      expect(teil, rel).not.toMatch(/chokidar|watchFile\(|\.watch\(/);
    }
  });

  it('an einem echten Baum richtet sich watch nur auf Ordner', async () => {
    const bb = require('../../src/main/area/bereichs-beobachtung.js');
    const wurzel = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-waechter-')));
    for (let o = 0; o < 5; o++) {
      fs.mkdirSync(path.join(wurzel, `o${o}`));
      for (let d = 0; d < 20; d++) fs.writeFileSync(path.join(wurzel, `o${o}`, `d${d}.md`), 'x');
    }
    const ziele = [];
    const echt = (p, o, r) => fs.watch(p, o, r);
    for (const pf of ['win32', 'linux']) {
      bb._setzeFuerTest({
        plattform: pf,
        watch: (p, o, r) => {
          ziele.push(p);
          return echt(p, { ...o, recursive: false }, r);
        },
      });
      const g = bb.beobachteWurzel(wurzel, { melde: () => {} });
      await g.bereit;
      g.close();
    }
    bb._setzeFuerTest({ plattform: null, watch: null });
    expect(ziele.length).toBe(1 + 6);
    for (const z of ziele) expect(fs.statSync(z).isDirectory(), z).toBe(true);
    fs.rmSync(wurzel, { recursive: true, force: true });
  });
});
