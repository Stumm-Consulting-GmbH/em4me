// 4T-002829 (Epic 3E-000446): Einzel-Prüfungen der gemeinsamen
// Bereichs-Beobachtung (src/main/area/bereichs-beobachtung.js).
//
// (a) Die Zahl der Überwachungen des Betriebssystems ist fest: unter Windows
//     eine je Wurzel, unter Linux eine je Ordner, nie eine je Datei. Gezählt am
//     eingeschobenen `watch`, an einem echten Baum.
// (c) Auf einer Netz-Freigabe findet der Abgleich-Lauf eine Änderung auch ohne
//     Meldung des Betriebssystems.
// Dazu: Überlauf, Schreib-Ende, geteilte Beobachtung, Abmeldung, und an einem
// echten Ordner mit der echten Überwachung der Plattform alle Ereignis-Arten.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BEOBACHTUNG_ZEITLIMIT } from '../zeitlimits.js';
import { createRequire } from 'node:module';

// Je Meldung des Betriebssystems ein Drittel des Fall-Limits (test/zeitlimits.js).
const WARTEN = { timeout: BEOBACHTUNG_ZEITLIMIT / 3, interval: 25 };
vi.setConfig({ testTimeout: BEOBACHTUNG_ZEITLIMIT });

const require = createRequire(import.meta.url);
const bb = require('../../src/main/area/bereichs-beobachtung.js');

let wurzel;
let offen = [];

function baum(dateienJeOrdner, ordnerZahl) {
  for (let o = 0; o < ordnerZahl; o++) {
    const dir = path.join(wurzel, `ordner-${o}`);
    fs.mkdirSync(dir, { recursive: true });
    for (let d = 0; d < dateienJeOrdner; d++)
      fs.writeFileSync(path.join(dir, `datei-${d}.md`), '# x\n');
  }
}

// Eingeschobenes `watch`: zählt Aufrufe und Ziele, meldet selbst nichts.
function zaehlendesWatch() {
  const aufrufe = [];
  const fn = (ziel, optionen, rueckruf) => {
    const w = new EventEmitter();
    w.close = vi.fn();
    aufrufe.push({ ziel, optionen, rueckruf, w });
    return w;
  };
  return { fn, aufrufe };
}

function sammler() {
  const ereignisse = [];
  return {
    ereignisse,
    melde: (art, p) => ereignisse.push([art, path.relative(wurzel, p).split(path.sep).join('/')]),
  };
}

function anmelden(v) {
  const h = bb.beobachteWurzel(wurzel, v);
  offen.push(h);
  return h;
}

beforeEach(() => {
  wurzel = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-beob-')));
});

afterEach(() => {
  for (const h of offen) h.close();
  offen = [];
  bb._setzeFuerTest({
    watch: null,
    plattform: null,
    netz: null,
    takt: null,
    ueberlauf: null,
    neustart: null,
    stabil: null,
    schreibEnde: null,
  });
  fs.rmSync(wurzel, { recursive: true, force: true });
});

describe('(a) Zahl der Überwachungen des Betriebssystems', () => {
  for (const [name, dateien, ordner] of [
    ['kleiner Baum', 5, 2],
    ['großer Baum', 100, 30],
  ]) {
    it(`Windows-Weg, ${name}: genau eine rekursive Überwachung`, async () => {
      baum(dateien, ordner);
      const z = zaehlendesWatch();
      bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false });
      await anmelden(sammler()).bereit;
      expect(z.aufrufe).toHaveLength(1);
      expect(z.aufrufe[0].ziel).toBe(wurzel);
      expect(z.aufrufe[0].optionen.recursive).toBe(true);
    });

    it(`Linux-Weg, ${name}: eine Überwachung je Ordner, keine je Datei`, async () => {
      baum(dateien, ordner);
      const z = zaehlendesWatch();
      bb._setzeFuerTest({ watch: z.fn, plattform: 'linux', netz: () => false });
      await anmelden(sammler()).bereit;
      expect(z.aufrufe).toHaveLength(ordner + 1);
      for (const a of z.aufrufe) {
        expect(fs.statSync(a.ziel).isDirectory()).toBe(true);
        expect(a.optionen.recursive).toBeUndefined();
      }
    });
  }

  it('Punkt-Ordner und node_modules bekommen unter Linux keine Überwachung', async () => {
    fs.mkdirSync(path.join(wurzel, '.git', 'objects'), { recursive: true });
    fs.mkdirSync(path.join(wurzel, 'node_modules', 'paket'), { recursive: true });
    fs.mkdirSync(path.join(wurzel, 'texte'));
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'linux', netz: () => false });
    await anmelden(sammler()).bereit;
    expect(z.aufrufe.map((a) => path.basename(a.ziel)).sort()).toEqual(
      [path.basename(wurzel), 'texte'].sort(),
    );
  });
});

describe('Geteilte Beobachtung und Abmeldung', () => {
  it('zwei Verbraucher teilen einen Beobachter; der letzte schließt ihn', async () => {
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false });
    const a = bb.beobachteWurzel(wurzel, sammler());
    const b = bb.beobachteWurzel(wurzel, sammler());
    await Promise.all([a.bereit, b.bereit]);
    expect(z.aufrufe).toHaveLength(1);
    a.close();
    expect(bb._beobachterFuerTest(wurzel)).not.toBeNull();
    expect(z.aufrufe[0].w.close).not.toHaveBeenCalled();
    b.close();
    expect(bb._beobachterFuerTest(wurzel)).toBeNull();
    expect(z.aufrufe[0].w.close).toHaveBeenCalled();
  });
});

describe('Meldungen, eingeordnet gegen das Abbild', () => {
  async function mitStummemWatch(pf = 'win32') {
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: pf, netz: () => false });
    const s = sammler();
    await anmelden(s).bereit;
    return { z, s, ruf: (art, rel) => z.aufrufe[0].rueckruf(art, rel) };
  }

  it('neue, geänderte und gelöschte Datei; Meldung erst nach dem Schreib-Ende', async () => {
    const { s, ruf } = await mitStummemWatch();
    fs.writeFileSync(path.join(wurzel, 'a.md'), 'eins');
    ruf('rename', 'a.md');
    await new Promise((r) => setTimeout(r, 100));
    expect(s.ereignisse).toEqual([]);
    await vi.waitFor(() => expect(s.ereignisse).toEqual([['add', 'a.md']]), WARTEN);
    fs.writeFileSync(path.join(wurzel, 'a.md'), 'zwei, länger');
    ruf('change', 'a.md');
    await vi.waitFor(() => expect(s.ereignisse.at(-1)).toEqual(['change', 'a.md']), WARTEN);
    fs.rmSync(path.join(wurzel, 'a.md'));
    ruf('rename', 'a.md');
    await vi.waitFor(() => expect(s.ereignisse.at(-1)).toEqual(['unlink', 'a.md']), WARTEN);
  });

  it('ein Ordner samt Inhalt hinein und hinaus: jede Datei meldet sich', async () => {
    const draussen = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-beob-aussen-'));
    fs.mkdirSync(path.join(draussen, 'paket', 'tief'), { recursive: true });
    fs.writeFileSync(path.join(draussen, 'paket', 'x.md'), 'x');
    fs.writeFileSync(path.join(draussen, 'paket', 'tief', 'y.md'), 'y');
    const { s, ruf } = await mitStummemWatch();
    fs.renameSync(path.join(draussen, 'paket'), path.join(wurzel, 'paket'));
    ruf('rename', 'paket');
    await vi.waitFor(
      () =>
        expect(s.ereignisse).toEqual(
          expect.arrayContaining([
            ['addDir', 'paket'],
            ['addDir', 'paket/tief'],
            ['add', 'paket/x.md'],
            ['add', 'paket/tief/y.md'],
          ]),
        ),
      WARTEN,
    );
    s.ereignisse.length = 0;
    fs.renameSync(path.join(wurzel, 'paket'), path.join(draussen, 'paket'));
    ruf('rename', 'paket');
    await vi.waitFor(
      () =>
        expect(s.ereignisse).toEqual([
          ['unlink', 'paket/tief/y.md'],
          ['unlinkDir', 'paket/tief'],
          ['unlink', 'paket/x.md'],
          ['unlinkDir', 'paket'],
        ]),
      WARTEN,
    );
    fs.rmSync(draussen, { recursive: true, force: true });
  });

  it('Meldung ohne Namen (Puffer-Überlauf) führt zum vollständigen Abgleich', async () => {
    bb._setzeFuerTest({ ueberlauf: 0 });
    const { s, ruf } = await mitStummemWatch();
    fs.writeFileSync(path.join(wurzel, 'still.md'), 'ohne Meldung');
    fs.mkdirSync(path.join(wurzel, 'neu'));
    ruf('change', null);
    await vi.waitFor(
      () =>
        expect(s.ereignisse).toEqual(
          expect.arrayContaining([
            ['add', 'still.md'],
            ['addDir', 'neu'],
          ]),
        ),
      WARTEN,
    );
  });

  it('Tiefen-Grenze und eigene Ausschluss-Regel je Verbraucher', async () => {
    fs.mkdirSync(path.join(wurzel, 'a', 'b', 'c'), { recursive: true });
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false });
    const flach = sammler();
    const ohneTmp = sammler();
    await anmelden({ ...flach, tiefe: 2 }).bereit;
    await anmelden({ ...ohneTmp, ignoriert: (p) => p.endsWith('.tmp') }).bereit;
    fs.writeFileSync(path.join(wurzel, 'a', 'b', 'ok.md'), 'x');
    fs.writeFileSync(path.join(wurzel, 'a', 'b', 'c', 'zu-tief.md'), 'x');
    fs.writeFileSync(path.join(wurzel, 'weg.tmp'), 'x');
    const ruf = z.aufrufe[0].rueckruf;
    ruf('rename', path.join('a', 'b', 'ok.md'));
    ruf('rename', path.join('a', 'b', 'c', 'zu-tief.md'));
    ruf('rename', 'weg.tmp');
    await vi.waitFor(() => expect(ohneTmp.ereignisse).toHaveLength(2), WARTEN);
    expect(ohneTmp.ereignisse).not.toContainEqual(['add', 'weg.tmp']);
    expect(flach.ereignisse).toContainEqual(['add', 'a/b/ok.md']);
    expect(flach.ereignisse).toContainEqual(['add', 'weg.tmp']);
    expect(flach.ereignisse).not.toContainEqual(['add', 'a/b/c/zu-tief.md']);
  });
});

describe('(c) Abgleich-Lauf auf Netz-Freigaben', () => {
  it('findet neue, geänderte und gelöschte Dateien ohne Meldung des Betriebssystems', async () => {
    fs.writeFileSync(path.join(wurzel, 'bleibt.md'), 'eins');
    fs.writeFileSync(path.join(wurzel, 'geht.md'), 'x');
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => true, takt: 100 });
    const s = sammler();
    await anmelden(s).bereit;
    fs.writeFileSync(path.join(wurzel, 'neu.md'), 'neu');
    fs.writeFileSync(path.join(wurzel, 'bleibt.md'), 'zwei, länger');
    fs.rmSync(path.join(wurzel, 'geht.md'));
    await vi.waitFor(
      () =>
        expect(s.ereignisse).toEqual(
          expect.arrayContaining([
            ['add', 'neu.md'],
            ['change', 'bleibt.md'],
            ['unlink', 'geht.md'],
          ]),
        ),
      WARTEN,
    );
  });

  it('ohne Netz-Freigabe läuft kein Takt', async () => {
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false, takt: 50 });
    const s = sammler();
    await anmelden(s).bereit;
    fs.writeFileSync(path.join(wurzel, 'neu.md'), 'neu');
    await new Promise((r) => setTimeout(r, 300));
    expect(s.ereignisse).toEqual([]);
  });
});

describe('Echte Überwachung der Plattform', () => {
  it('Datei und Ordner: anlegen, ändern, umbenennen, löschen', async () => {
    const s = sammler();
    await anmelden(s).bereit;
    const p = (rel) => path.join(wurzel, rel);
    fs.mkdirSync(p('ordner'));
    await vi.waitFor(() => expect(s.ereignisse).toContainEqual(['addDir', 'ordner']), WARTEN);
    fs.writeFileSync(p('ordner/a.md'), 'eins');
    await vi.waitFor(() => expect(s.ereignisse).toContainEqual(['add', 'ordner/a.md']), WARTEN);
    fs.writeFileSync(p('ordner/a.md'), 'zwei, länger');
    await vi.waitFor(() => expect(s.ereignisse).toContainEqual(['change', 'ordner/a.md']), WARTEN);
    fs.renameSync(p('ordner/a.md'), p('ordner/b.md'));
    await vi.waitFor(
      () =>
        expect(s.ereignisse).toEqual(
          expect.arrayContaining([
            ['unlink', 'ordner/a.md'],
            ['add', 'ordner/b.md'],
          ]),
        ),
      WARTEN,
    );
    fs.rmSync(p('ordner'), { recursive: true });
    await vi.waitFor(
      () =>
        expect(s.ereignisse).toEqual(
          expect.arrayContaining([
            ['unlink', 'ordner/b.md'],
            ['unlinkDir', 'ordner'],
          ]),
        ),
      WARTEN,
    );
  });
});

// Die fünf Auflagen der Plan-Freigabe der Steuerung vom 2026-11-23, je eine Prüfung.
describe('Auflagen der Plan-Freigabe', () => {
  const fsp = require('node:fs/promises');

  function lstatZaehler(filter) {
    const echt = fsp.lstat;
    let n = 0;
    const spy = vi.spyOn(fsp, 'lstat').mockImplementation((p, ...rest) => {
      if (filter(String(p))) n++;
      return echt.call(fsp, p, ...rest);
    });
    return { anzahl: () => n, ende: () => spy.mockRestore() };
  }

  it('1: die Pause nach einem Abgleich ist mindestens das Zehnfache seiner Dauer', () => {
    expect(bb.LAST_FAKTOR).toBe(10);
    expect(bb.naechsterAbstand(30000, 100)).toBe(30000);
    expect(bb.naechsterAbstand(30000, 10000)).toBe(100000);
    expect(bb.naechsterAbstand(bb.NETZ_ABGLEICH_MS, 0)).toBe(30000);
  });

  it('2: viele Überläufe kurz hintereinander ergeben einen Abgleich je Mindestabstand', async () => {
    const z = zaehlendesWatch();
    // Mindestabstand 1 s: weit genug, dass eine verzögerte Ereignis-Schleife
    // die Zählung nicht kippt (Hinweis 11 des Zweitblicks).
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false, ueberlauf: 1000 });
    await anmelden(sammler()).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    // Auch der erste Lauf über den Baum zählt: Der erste Abgleich wartet den
    // Mindestabstand nach ihm ab, zwanzig Überläufe ergeben genau einen. Die
    // Wartezeit liegt deutlich über dem Mindestabstand, damit ein zweiter
    // Abgleich aus demselben Stapel sichtbar würde (Zweitblick, Runde 2).
    for (let i = 0; i < 20; i++) z.aufrufe[0].rueckruf('change', null);
    await new Promise((r) => setTimeout(r, 2500));
    expect(b.zaehler.abgleiche).toBe(1);
    const ende = b.letztesEnde;
    for (let i = 0; i < 20; i++) z.aufrufe[0].rueckruf('change', null);
    await new Promise((r) => setTimeout(r, 2500));
    expect(b.zaehler.abgleiche).toBe(2);
    // Der zweite lag mindestens den Mindestabstand nach dem ersten.
    expect(b.letztesEnde - ende).toBeGreaterThanOrEqual(1000);
  });

  it('3: Meldungen aus ausgeschlossenen Teilbäumen kosten höchstens eine Abfrage je Sammel-Fenster', async () => {
    fs.mkdirSync(path.join(wurzel, '.git', 'objects'), { recursive: true });
    fs.mkdirSync(path.join(wurzel, 'node_modules'));
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false });
    const s = sammler();
    await anmelden(s).bereit;
    const zaehler = lstatZaehler((p) => p.includes('.git') || p.includes('node_modules'));
    try {
      const ruf = z.aufrufe[0].rueckruf;
      for (let i = 0; i < 200; i++) ruf('change', path.join('.git', 'objects', `o${i}`));
      for (let i = 0; i < 50; i++) ruf('rename', path.join('.git', `lock${i}`));
      for (let i = 0; i < 50; i++) ruf('change', path.join('node_modules', `m${i}.js`));
      await vi.waitFor(() => expect(s.ereignisse).toEqual([['addDir', '.git']]), WARTEN);
      expect(zaehler.anzahl()).toBe(1);
    } finally {
      zaehler.ende();
    }
  });

  it('4: Dokument in einem hoch gelegenen Ordner: ein Ereignis-Sturm in der Tiefe kostet keine Abfrage', async () => {
    fs.mkdirSync(path.join(wurzel, 'a', 'b', 'c', 'd', 'e'), { recursive: true });
    fs.writeFileSync(path.join(wurzel, 'a', 'b', 'c', 'd', 'e', 'tief.md'), 'x');
    fs.writeFileSync(path.join(wurzel, 'a', 'b', 'flach.md'), 'x');
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false, ueberlauf: 400 });
    const s = sammler();
    await anmelden({ ...s, tiefe: 2 }).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    // Das Abbild reicht nur bis zur Grenze.
    expect(
      [...b.abbild.keys()].map((p) => path.relative(wurzel, p).split(path.sep).length - 1),
    ).not.toContain(3);
    expect(b.abbild.has(path.join(wurzel, 'a', 'b', 'flach.md'))).toBe(true);
    // Eine rekursive Überwachung, nicht eine je Ordner bis zur Grenze.
    expect(z.aufrufe).toHaveLength(1);
    const zaehler = lstatZaehler((p) => p.includes(path.join('c', 'd')));
    try {
      const ruf = z.aufrufe[0].rueckruf;
      for (let i = 0; i < 500; i++)
        ruf('rename', path.join('a', 'b', 'c', 'd', 'e', `sturm${i}.md`));
      await new Promise((r) => setTimeout(r, 300));
      expect(zaehler.anzahl()).toBe(0);
      expect(b.zaehler.abgleiche).toBe(0);
      expect(s.ereignisse).toEqual([]);
    } finally {
      zaehler.ende();
    }
  });

  it('4, Linux-Weg: Ordner-Überwachungen nur bis zur Tiefen-Grenze', async () => {
    fs.mkdirSync(path.join(wurzel, 'a', 'b', 'c', 'd'), { recursive: true });
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'linux', netz: () => false });
    await anmelden({ ...sammler(), tiefe: 2 }).bereit;
    expect(
      z.aufrufe.map((a) => path.relative(wurzel, a.ziel).split(path.sep).join('/')).sort(),
    ).toEqual(['', 'a', 'a/b'].sort());
  });

  it('5: ein dauerhafter Fehler endet nach höchstens drei Neustarts im Abgleich im Takt', async () => {
    const aufrufe = [];
    const kaputt = (ziel, _optionen, _rueckruf) => {
      const w = new EventEmitter();
      w.close = vi.fn();
      aufrufe.push(ziel);
      setTimeout(
        () =>
          w.emit('error', Object.assign(new Error('keine Änderungs-Meldungen'), { code: 'EIO' })),
        5,
      );
      return w;
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bb._setzeFuerTest({
      watch: kaputt,
      plattform: 'win32',
      netz: () => false,
      neustart: 10,
      takt: 100,
    });
    const s = sammler();
    await anmelden(s).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    await vi.waitFor(() => expect(b.rueckfall).toBe(true), WARTEN);
    expect(aufrufe).toHaveLength(1 + bb.NEUSTART_HOECHSTZAHL);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('Abgleich im Takt'))).toHaveLength(
      1,
    );
    fs.writeFileSync(path.join(wurzel, 'trotzdem.md'), 'x');
    await vi.waitFor(() => expect(s.ereignisse).toContainEqual(['add', 'trotzdem.md']), WARTEN);
    await new Promise((r) => setTimeout(r, 200));
    expect(aufrufe).toHaveLength(1 + bb.NEUSTART_HOECHSTZAHL);
    warn.mockRestore();
  });
});

describe('Getrennte Netz-Verbindung', () => {
  it('meldet den Ausfall einmal und richtet die Überwachung nach der Rückkehr neu ein', async () => {
    const z = zaehlendesWatch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    bb._setzeFuerTest({
      watch: z.fn,
      plattform: 'win32',
      netz: () => true,
      takt: 100,
      neustart: 10,
    });
    const fehler = [];
    const s = sammler();
    await anmelden({ ...s, fehler: (e) => fehler.push(e) }).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    expect(z.aufrufe).toHaveLength(1);
    // Verbindung weg: Die Wurzel ist nicht lesbar, die Überwachung meldet einen Fehler.
    const weg = `${wurzel}-weg`;
    fs.renameSync(wurzel, weg);
    z.aufrufe[0].w.emit('error', Object.assign(new Error('Netz getrennt'), { code: 'EPERM' }));
    await new Promise((r) => setTimeout(r, 500));
    expect(fehler).toHaveLength(1);
    expect(b.ueberwachungen.size).toBe(0);
    // Verbindung zurück, mit einer neuen Datei: Der nächste Abgleich findet sie
    // und richtet die Überwachung neu ein.
    fs.renameSync(weg, wurzel);
    fs.writeFileSync(path.join(wurzel, 'nach-der-rueckkehr.md'), 'x');
    await vi.waitFor(
      () => expect(s.ereignisse).toContainEqual(['add', 'nach-der-rueckkehr.md']),
      WARTEN,
    );
    expect(b.ueberwachungen.size).toBe(1);
    expect(z.aufrufe).toHaveLength(2);
    expect(fehler).toHaveLength(1);
    warn.mockRestore();
    info.mockRestore();
  });
});

describe('istAusgeschlossen', () => {
  it('urteilt allein am Pfad', () => {
    const statSpy = vi.spyOn(fs, 'statSync');
    expect(bb.istAusgeschlossen(wurzel, path.join(wurzel, '.git', 'HEAD'))).toBe(true);
    expect(bb.istAusgeschlossen(wurzel, path.join(wurzel, 'a', 'node_modules', 'x.md'))).toBe(true);
    expect(bb.istAusgeschlossen(wurzel, path.join(wurzel, 'a', '.verborgen.md'))).toBe(true);
    expect(bb.istAusgeschlossen(wurzel, path.join(wurzel, 'a', 'b.md'))).toBe(false);
    expect(statSpy).not.toHaveBeenCalled();
    statSpy.mockRestore();
  });
});
