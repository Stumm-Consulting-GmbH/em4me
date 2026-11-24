// 4T-002829 (Epic 3E-000446): Einzel-Prüfungen der gemeinsamen
// Bereichs-Beobachtung (src/main/area/bereichs-beobachtung.js), Teil 2: die
// Befunde der drei Review-Runden (Zweitblick und Sicherheits-Review), je
// mit einem Fall, der ohne die Behebung rot würde. Teil 1 mit den Grund-
// und Auflagen-Prüfungen steht in bereichs-beobachtung.test.js; geschnitten
// wegen des Zeilen-Budgets der Prüfdateien.

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

// Befunde des Zweitblicks und des Sicherheits-Reviews, Runde 1 (3E-000446).
describe('Befunde der Review-Runde 1', () => {
  const fsp = require('node:fs/promises');

  async function stumm(extra = {}) {
    const z = zaehlendesWatch();
    bb._setzeFuerTest({
      watch: z.fn,
      plattform: 'win32',
      netz: () => false,
      ueberlauf: 0,
      ...extra,
    });
    const s = sammler();
    const h = anmelden(s);
    await h.bereit;
    return { z, s, b: bb._beobachterFuerTest(wurzel), ruf: (a, n) => z.aufrufe[0].rueckruf(a, n) };
  }

  // Lässt den nächsten Lauf über den Baum erst nach `waehrend` enden.
  function verzoegereLauf(b, waehrend) {
    const echt = b.leseBaum.bind(b);
    b.leseBaum = async (...args) => {
      const ergebnis = await echt(...args);
      b.leseBaum = echt;
      await waehrend();
      return ergebnis;
    };
  }

  it('Zweitblick 1: eine während des Abgleichs angelegte Datei wird nicht als entfernt gemeldet', async () => {
    const { s, b, ruf } = await stumm();
    verzoegereLauf(b, async () => {
      fs.writeFileSync(path.join(wurzel, 'waehrend.md'), 'x');
      ruf('rename', 'waehrend.md');
      await vi.waitFor(() => expect(s.ereignisse).toContainEqual(['add', 'waehrend.md']), WARTEN);
    });
    await b.abgleich();
    expect(s.ereignisse).not.toContainEqual(['unlink', 'waehrend.md']);
    expect(b.abbild.has(path.join(wurzel, 'waehrend.md'))).toBe(true);
  });

  it('Zweitblick 1: eine während des Abgleichs gelöschte Datei kommt nicht als neu zurück', async () => {
    fs.writeFileSync(path.join(wurzel, 'geht.md'), 'x');
    const { s, b, ruf } = await stumm();
    verzoegereLauf(b, async () => {
      fs.rmSync(path.join(wurzel, 'geht.md'));
      ruf('rename', 'geht.md');
      await vi.waitFor(() => expect(s.ereignisse).toContainEqual(['unlink', 'geht.md']), WARTEN);
    });
    await b.abgleich();
    expect(s.ereignisse.filter(([, p]) => p === 'geht.md')).toEqual([['unlink', 'geht.md']]);
  });

  it('Sicherheits-Review: ein beim Abgleich nicht lesbarer Unterordner gilt nicht als gelöscht', async () => {
    fs.mkdirSync(path.join(wurzel, 'netz'));
    fs.writeFileSync(path.join(wurzel, 'netz', 'a.md'), 'x');
    const { s, b } = await stumm();
    const echt = fsp.readdir;
    const spy = vi
      .spyOn(fsp, 'readdir')
      .mockImplementation((p, ...rest) =>
        String(p).endsWith(`${path.sep}netz`)
          ? Promise.reject(Object.assign(new Error('kurz weg'), { code: 'EIO' }))
          : echt.call(fsp, p, ...rest),
      );
    try {
      await b.abgleich();
    } finally {
      spy.mockRestore();
    }
    expect(s.ereignisse).toEqual([]);
    expect(b.abbild.has(path.join(wurzel, 'netz', 'a.md'))).toBe(true);
  });

  it('Zweitblick 2: eine lokale Wurzel erholt sich nach dem Fehlen; ein neuer Verbraucher erfährt den Fehler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fehler = [];
    const z = zaehlendesWatch();
    bb._setzeFuerTest({
      watch: z.fn,
      plattform: 'win32',
      netz: () => false,
      takt: 100,
      neustart: 10,
    });
    const s = sammler();
    await anmelden({ ...s, fehler: (e) => fehler.push(e) }).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    const weg = `${wurzel}-weg`;
    fs.renameSync(wurzel, weg);
    z.aufrufe[0].w.emit('error', Object.assign(new Error('weg'), { code: 'EPERM' }));
    await vi.waitFor(() => expect(fehler).toHaveLength(1), WARTEN);
    const spaeter = [];
    anmelden({ melde: () => {}, fehler: (e) => spaeter.push(e) });
    await vi.waitFor(() => expect(spaeter).toHaveLength(1), WARTEN);
    fs.renameSync(weg, wurzel);
    fs.writeFileSync(path.join(wurzel, 'zurueck.md'), 'x');
    await vi.waitFor(() => expect(s.ereignisse).toContainEqual(['add', 'zurueck.md']), WARTEN);
    expect(b.ueberwachungen.size).toBe(1);
    expect(b.wurzelFehlt).toBe(false);
    warn.mockRestore();
    info.mockRestore();
  });

  it('Zweitblick 3: ein während seines Laufs entfernter neuer Ordner hinterlässt keine Einträge', async () => {
    const { s, b, ruf } = await stumm();
    fs.mkdirSync(path.join(wurzel, 'kurz', 'innen'), { recursive: true });
    verzoegereLauf(b, async () => {
      fs.rmSync(path.join(wurzel, 'kurz'), { recursive: true });
      b.entferne(path.join(wurzel, 'kurz'), b.abbild.get(path.join(wurzel, 'kurz')));
    });
    ruf('rename', 'kurz');
    await vi.waitFor(() => expect(s.ereignisse).toContainEqual(['unlinkDir', 'kurz']), WARTEN);
    await new Promise((r) => setTimeout(r, 100));
    expect(s.ereignisse).not.toContainEqual(['addDir', 'kurz/innen']);
    expect([...b.abbild.keys()].some((p) => p.includes('kurz'))).toBe(false);
  });

  it('Zweitblick 4: der erste Lauf zählt für die Last-Bindung', async () => {
    const { b } = await stumm();
    expect(b.letztesEnde).toBeGreaterThan(0);
    expect(b.letzteDauerMs).toBeGreaterThanOrEqual(0);
  });

  it('Zweitblick 5: ein ausgeschlossener Teilbaum unterhalb der Tiefen-Grenze kostet keine Abfrage', async () => {
    fs.mkdirSync(path.join(wurzel, 'a', 'b', 'c', '.git'), { recursive: true });
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false });
    const s = sammler();
    await anmelden({ ...s, tiefe: 2 }).bereit;
    const echt = fsp.lstat;
    let n = 0;
    const spy = vi.spyOn(fsp, 'lstat').mockImplementation((p, ...rest) => {
      if (String(p).includes('.git')) n++;
      return echt.call(fsp, p, ...rest);
    });
    try {
      for (let i = 0; i < 50; i++)
        z.aufrufe[0].rueckruf('rename', path.join('a', 'b', 'c', '.git', `l${i}`));
      await new Promise((r) => setTimeout(r, 200));
      expect(n).toBe(0);
      expect(s.ereignisse).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('Zweitblick 6: nach stabiler Laufzeit beginnt die Zählung der Neustarts von vorn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const z = zaehlendesWatch();
    bb._setzeFuerTest({
      watch: z.fn,
      plattform: 'win32',
      netz: () => false,
      neustart: 10,
      stabil: 50,
    });
    await anmelden(sammler()).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    for (let i = 0; i < 6; i++) {
      const vorher = z.aufrufe.length;
      z.aufrufe.at(-1).w.emit('error', Object.assign(new Error('kurz'), { code: 'EIO' }));
      await vi.waitFor(() => expect(z.aufrufe.length).toBe(vorher + 1), WARTEN);
      await new Promise((r) => setTimeout(r, 80));
    }
    expect(b.rueckfall).toBe(false);
    warn.mockRestore();
  });

  it('Zweitblick 7: im Meldungs-Weg laufen höchstens acht Datei-Abfragen zugleich', async () => {
    const draussen = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-beob-viele-'));
    fs.mkdirSync(path.join(draussen, 'viele'));
    for (let i = 0; i < 120; i++) fs.writeFileSync(path.join(draussen, 'viele', `d${i}.md`), 'x');
    const { s, ruf } = await stumm();
    const echt = fsp.lstat;
    let laufend = 0;
    let hoechst = 0;
    const spy = vi.spyOn(fsp, 'lstat').mockImplementation(async (p, ...rest) => {
      laufend++;
      hoechst = Math.max(hoechst, laufend);
      try {
        await new Promise((r) => setTimeout(r, 2));
        return await echt.call(fsp, p, ...rest);
      } finally {
        laufend--;
      }
    });
    try {
      fs.renameSync(path.join(draussen, 'viele'), path.join(wurzel, 'viele'));
      ruf('rename', 'viele');
      await vi.waitFor(
        () => expect(s.ereignisse.filter(([a]) => a === 'add')).toHaveLength(120),
        WARTEN,
      );
    } finally {
      spy.mockRestore();
      fs.rmSync(draussen, { recursive: true, force: true });
    }
    // Lauf über den neuen Ordner und Schreib-Ende teilen die Grenze des
    // Meldungs-Wegs; ein frei werdender Platz geht unmittelbar an den nächsten
    // Wartenden (Zweitblick, Runde 2).
    expect(hoechst).toBeLessThanOrEqual(8);
  });

  it.runIf(process.platform === 'win32')(
    'Zweitblick 8: Umbenennen allein in der Schreibung meldet den alten Namen als entfernt',
    async () => {
      fs.writeFileSync(path.join(wurzel, 'klein.md'), 'x');
      const { s, ruf } = await stumm();
      fs.renameSync(path.join(wurzel, 'klein.md'), path.join(wurzel, 'Klein.md'));
      ruf('rename', 'klein.md');
      ruf('rename', 'Klein.md');
      await vi.waitFor(
        () =>
          expect(s.ereignisse).toEqual(
            expect.arrayContaining([
              ['unlink', 'klein.md'],
              ['add', 'Klein.md'],
            ]),
          ),
        WARTEN,
      );
    },
  );
});

describe('Befunde der Review-Runde 2', () => {
  const fsp = require('node:fs/promises');

  it('die Grenze lässt nie mehr Aufgaben zugleich laufen, auch wenn Neue dazwischen kommen', async () => {
    const { neueGrenze } = require('../../src/main/area/bereichs-beobachtung-baum.js');
    const grenze = neueGrenze(3);
    let laufend = 0;
    let hoechst = 0;
    const aufgabe = async () => {
      laufend++;
      hoechst = Math.max(hoechst, laufend);
      await new Promise((r) => setTimeout(r, 1));
      laufend--;
    };
    const alle = [];
    for (let i = 0; i < 40; i++) {
      alle.push(grenze(aufgabe));
      if (i % 5 === 0) await new Promise((r) => setImmediate(r));
    }
    await Promise.all(alle);
    expect(hoechst).toBe(3);
  });

  it('ein neuer Verbraucher bekommt keinen veralteten Fehler, wenn die Wurzel wieder lesbar ist', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const z = zaehlendesWatch();
    bb._setzeFuerTest({
      watch: z.fn,
      plattform: 'win32',
      netz: () => false,
      takt: 60000,
      neustart: 10,
    });
    await anmelden({ melde: () => {}, fehler: () => {} }).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    const weg = `${wurzel}-weg`;
    fs.renameSync(wurzel, weg);
    z.aufrufe[0].w.emit('error', Object.assign(new Error('weg'), { code: 'EPERM' }));
    await vi.waitFor(() => expect(b.wurzelFehlt).toBe(true), WARTEN);
    fs.renameSync(weg, wurzel);
    const spaeter = [];
    anmelden({ melde: () => {}, fehler: (e) => spaeter.push(e) });
    await vi.waitFor(() => expect(b.wurzelFehlt).toBe(false), WARTEN);
    await new Promise((r) => setTimeout(r, 100));
    expect(spaeter).toEqual([]);
    warn.mockRestore();
  });

  it('ein fehlender oder nicht mehr zugänglicher Unterordner gilt als entfernt, ein vorübergehend nicht lesbarer nicht', async () => {
    fs.mkdirSync(path.join(wurzel, 'weg'));
    fs.writeFileSync(path.join(wurzel, 'weg', 'a.md'), 'x');
    fs.mkdirSync(path.join(wurzel, 'zu'));
    fs.writeFileSync(path.join(wurzel, 'zu', 'b.md'), 'x');
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false });
    const s = sammler();
    await anmelden(s).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    const echt = fsp.readdir;
    const spy = vi.spyOn(fsp, 'readdir').mockImplementation((p, ...rest) => {
      const name = path.basename(String(p));
      if (name === 'zu')
        return Promise.reject(Object.assign(new Error('verweigert'), { code: 'EACCES' }));
      if (name === 'weg')
        return Promise.reject(Object.assign(new Error('Netz'), { code: 'ETIMEDOUT' }));
      return echt.call(fsp, p, ...rest);
    });
    try {
      await b.abgleich();
    } finally {
      spy.mockRestore();
    }
    expect(s.ereignisse).toContainEqual(['unlink', 'zu/b.md']);
    expect(s.ereignisse).not.toContainEqual(['unlink', 'weg/a.md']);
  });

  it('eine vorübergehend nicht abfragbare Datei bleibt bei einer einzelnen Meldung stehen', async () => {
    fs.writeFileSync(path.join(wurzel, 'bleibt.md'), 'x');
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false });
    const s = sammler();
    await anmelden(s).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    const echt = fsp.lstat;
    const spy = vi
      .spyOn(fsp, 'lstat')
      .mockImplementation((p, ...rest) =>
        String(p).endsWith('bleibt.md')
          ? Promise.reject(Object.assign(new Error('Netz'), { code: 'EIO' }))
          : echt.call(fsp, p, ...rest),
      );
    try {
      z.aufrufe[0].rueckruf('change', 'bleibt.md');
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      spy.mockRestore();
    }
    expect(s.ereignisse).toEqual([]);
    expect(b.abbild.has(path.join(wurzel, 'bleibt.md'))).toBe(true);
  });
});

describe('Befunde der Review-Runde 3', () => {
  const fsp = require('node:fs/promises');

  it('ein dauerhaft nicht abfragbares Schreib-Ende hört nach fünf Versuchen auf und überlässt die Datei dem Abgleich', async () => {
    const z = zaehlendesWatch();
    bb._setzeFuerTest({
      watch: z.fn,
      plattform: 'win32',
      netz: () => false,
      ueberlauf: 0,
      schreibEnde: 10,
    });
    const s = sammler();
    await anmelden(s).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    fs.writeFileSync(path.join(wurzel, 'haengt.md'), 'x');
    const echt = fsp.lstat;
    // Die erste Abfrage (Einordnung der Meldung) gelingt, jede weitere
    // scheitert; so hängt der Fall an keinem Zeitfenster (Lauf der vollen
    // Suite vom 2026-11-23, 18:20: das Warten auf den Zwischenzustand riss
    // unter Last).
    let abfragen = 0;
    let versuche = 0;
    const spy = vi.spyOn(fsp, 'lstat').mockImplementation((p, ...rest) => {
      if (String(p).endsWith('haengt.md') && abfragen++ > 0) {
        versuche++;
        return Promise.reject(Object.assign(new Error('Netz'), { code: 'EIO' }));
      }
      return echt.call(fsp, p, ...rest);
    });
    try {
      z.aufrufe[0].rueckruf('rename', 'haengt.md');
      await vi.waitFor(() => expect(b.zaehler.abgleiche).toBeGreaterThanOrEqual(1), WARTEN);
      await vi.waitFor(() => {
        expect(b.schreibEnde.size).toBe(0);
        expect(b.abgleichLaeuft).toBe(null);
      }, WARTEN);
      const nachEnde = versuche;
      await new Promise((r) => setTimeout(r, 400));
      // Ein erster und fünf weitere Versuche des Schreib-Endes, dazu die
      // Abfrage des angeforderten Abgleichs; danach keine weitere.
      expect(nachEnde).toBeGreaterThanOrEqual(6);
      expect(nachEnde).toBeLessThanOrEqual(7);
      expect(versuche).toBe(nachEnde);
      expect(s.ereignisse).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('eine vorübergehend nicht abfragbare Einzel-Meldung fordert auf einer Wurzel ohne Takt einen Abgleich an', async () => {
    fs.writeFileSync(path.join(wurzel, 'gesperrt.md'), 'x');
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false, ueberlauf: 0 });
    await anmelden(sammler()).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    const echt = fsp.lstat;
    const spy = vi
      .spyOn(fsp, 'lstat')
      .mockImplementation((p, ...rest) =>
        String(p).endsWith('gesperrt.md')
          ? Promise.reject(Object.assign(new Error('belegt'), { code: 'EBUSY' }))
          : echt.call(fsp, p, ...rest),
      );
    try {
      z.aufrufe[0].rueckruf('change', 'gesperrt.md');
      await vi.waitFor(() => expect(b.zaehler.abgleiche).toBeGreaterThanOrEqual(1), WARTEN);
      expect(b.abbild.has(path.join(wurzel, 'gesperrt.md'))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('zwanzig Überläufe aus einem Durchlauf ergeben einen Abgleich, auch wenn er sofort startet', async () => {
    const z = zaehlendesWatch();
    bb._setzeFuerTest({ watch: z.fn, plattform: 'win32', netz: () => false, ueberlauf: 0 });
    await anmelden(sammler()).bereit;
    const b = bb._beobachterFuerTest(wurzel);
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 20; i++) {
      z.aufrufe[0].rueckruf('change', null);
      // Uhr bewusst weiterlaufen lassen: Die Deckung hängt nicht an ihr.
      const bis = Date.now() + 2;
      while (Date.now() < bis) {
        /* warten */
      }
    }
    await new Promise((r) => setTimeout(r, 400));
    expect(b.zaehler.abgleiche).toBe(1);
  });
});
