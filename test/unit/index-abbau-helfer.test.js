// 4T-002885: Prüffälle der Abbau-Hilfe (test/unit/index-abbau-helfer.js).
// Sie hält fest, dass der Abbau einer Prüfdatei auf den letzten Schreibvorgang
// des Zwischenspeichers wartet, bevor der Wegwerf-Ordner gelöscht wird; ohne
// das Warten meldet das Programm «Area_Cache schreiben fehlgeschlagen» auf die
// Fehler-Ausgabe eines grünen Laufs.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ensureAreaIndex, releaseRoot, tagsFor } from '../../src/main/backlinks.js';
import { merkeZwischenspeicher, warteAufZwischenspeicher } from './index-abbau-helfer.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');

const HALTER = 'abbau-helfer-test';
const MELDUNG = 'Area_Cache schreiben fehlgeschlagen';
let ordner = [];

function neueWurzel() {
  const wurzel = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-abbau-helfer-')));
  ordner.push(wurzel);
  fs.writeFileSync(path.join(wurzel, 'a.md'), '# A\n#abbau\n', 'utf8');
  return wurzel;
}

async function bereit(wurzel) {
  const datei = path.join(wurzel, 'a.md');
  await vi.waitFor(() => expect(tagsFor(datei, undefined, wurzel).status).toBe('ready'), {
    timeout: 5000,
    interval: 10,
  });
}

function abbauen(wurzel) {
  vi.useFakeTimers();
  releaseRoot(wurzel, HALTER);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
}

function schattenkopien(wurzel) {
  return fs.readdirSync(wurzel).filter((name) => name.startsWith('.Area_Cache'));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const wurzel of ordner) {
    indexes.delete(wurzel);
    fs.rmSync(wurzel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  ordner = [];
});

describe('index-abbau-helfer (4T-002885)', () => {
  it('nach dem Warten ist der Zwischenspeicher geschrieben, und das Löschen des Ordners löst keine Meldung aus', async () => {
    const warnungen = vi.spyOn(console, 'warn');
    const wurzel = neueWurzel();
    const cache = path.join(wurzel, 'Area_Cache.mdda');
    ensureAreaIndex(wurzel, HALTER);
    await bereit(wurzel);

    const gemerkt = merkeZwischenspeicher([wurzel]);
    expect(gemerkt).toHaveLength(1);
    const vorher = fs.existsSync(cache) ? fs.statSync(cache, { bigint: true }).mtimeNs : null;
    abbauen(wurzel);
    expect(indexes.has(wurzel)).toBe(false);

    expect(await warteAufZwischenspeicher(gemerkt)).toEqual([]);
    // Der Stand des Abbaus liegt auf der Platte, keine Schattenkopie ist offen.
    expect(fs.existsSync(cache)).toBe(true);
    expect(fs.statSync(cache, { bigint: true }).mtimeNs).not.toBe(vorher);
    expect(schattenkopien(wurzel)).toEqual([]);

    fs.rmSync(wurzel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    // Ein Schreibvorgang, der jetzt noch liefe, träfe den gelöschten Ordner.
    await new Promise((resolve) => setImmediate(resolve));
    const gemeldet = warnungen.mock.calls.filter((aufruf) => String(aufruf[0]).includes(MELDUNG));
    expect(gemeldet).toEqual([]);
  });

  it('eine Wurzel mit weiterem Halter wird nicht abgebaut und nicht abgewartet', async () => {
    const wurzel = neueWurzel();
    ensureAreaIndex(wurzel, HALTER);
    ensureAreaIndex(wurzel, 'zweiter-halter');
    await bereit(wurzel);

    const gemerkt = merkeZwischenspeicher([wurzel]);
    abbauen(wurzel);
    expect(indexes.has(wurzel)).toBe(true);

    const beginn = Date.now();
    expect(await warteAufZwischenspeicher(gemerkt, { wartezeit: 2000 })).toEqual([]);
    expect(Date.now() - beginn).toBeLessThan(1000);

    // Aufräumen: auch den zweiten Halter lösen und den Abbau abwarten.
    const rest = merkeZwischenspeicher([wurzel]);
    vi.useFakeTimers();
    releaseRoot(wurzel, 'zweiter-halter');
    vi.advanceTimersByTime(61_000);
    vi.useRealTimers();
    expect(await warteAufZwischenspeicher(rest)).toEqual([]);
  });

  it('eine Wurzel ohne Bereichs-Index wird übergangen', () => {
    const wurzel = neueWurzel();
    expect(merkeZwischenspeicher([wurzel])).toEqual([]);
  });

  it('bleibt der Schreibvorgang aus, nennt die Hilfe die Wurzel, statt still zurückzukehren', async () => {
    const warnungen = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wurzel = neueWurzel();
    // Nachgestellter Eintrag: als abgebaut gemeldet, aber niemand schreibt.
    const eintrag = { isArea: true, cachePath: path.join(wurzel, 'Area_Cache.mdda') };
    indexes.set(wurzel, eintrag);
    const gemerkt = merkeZwischenspeicher([wurzel]);
    indexes.delete(wurzel);

    expect(await warteAufZwischenspeicher(gemerkt, { wartezeit: 100 })).toEqual([wurzel]);
    expect(warnungen).toHaveBeenCalledTimes(1);
    expect(String(warnungen.mock.calls[0][0])).toContain('nicht geschrieben');
  });

  // Nachgestellter Eintrag wie oben. Zwei Schreibvorgänge enden kurz
  // nacheinander (ein entprellter, der beim Abbau schon lief, und der des
  // Abbaus): Der zweite Stand kommt zwischen zwei Abfragen. Ohne die
  // Bestätigung über zwei Abfragen kehrte die Hilfe beim ersten Stand zurück.
  it('wechselt der Stand zwischen zwei Abfragen, wartet die Hilfe auf den bestätigten Stand', async () => {
    const wurzel = neueWurzel();
    const cache = path.join(wurzel, 'Area_Cache.mdda');
    indexes.set(wurzel, { isArea: true, cachePath: cache });
    const gemerkt = merkeZwischenspeicher([wurzel]);
    indexes.delete(wurzel);

    fs.writeFileSync(cache, 'erster Stand', 'utf8');
    const zweiter = setTimeout(() => fs.writeFileSync(cache, 'zweiter Stand, länger', 'utf8'), 20);
    try {
      expect(await warteAufZwischenspeicher(gemerkt, { abstand: 60 })).toEqual([]);
    } finally {
      clearTimeout(zweiter);
    }
    expect(fs.readFileSync(cache, 'utf8')).toBe('zweiter Stand, länger');
  });

  it('bleibt der Stand bis zur Obergrenze in Bewegung, nennt die Hilfe die Wurzel', async () => {
    const warnungen = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wurzel = neueWurzel();
    const cache = path.join(wurzel, 'Area_Cache.mdda');
    indexes.set(wurzel, { isArea: true, cachePath: cache });
    const gemerkt = merkeZwischenspeicher([wurzel]);
    indexes.delete(wurzel);

    let stand = 'x';
    fs.writeFileSync(cache, stand, 'utf8');
    const unruhe = setInterval(() => {
      stand += 'x';
      fs.writeFileSync(cache, stand, 'utf8');
    }, 10);
    try {
      const rest = await warteAufZwischenspeicher(gemerkt, { wartezeit: 200, abstand: 40 });
      expect(rest).toEqual([wurzel]);
    } finally {
      clearInterval(unruhe);
    }
    expect(warnungen).toHaveBeenCalledTimes(1);
    expect(String(warnungen.mock.calls[0][0])).toContain('bis zuletzt in Bewegung');
  });
});
