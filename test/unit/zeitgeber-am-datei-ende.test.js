// 4T-002883 (Epic 3E-000452): Prüffälle des Zeitgeber-Buchs
// (test/zeitgeber-am-datei-ende.js).
//
// Zwei Teile: das Buch an einem eigenen Ziel-Objekt mit den echten Zeitgebern
// von Node, und der reale Aufbau — ein Kind-Lauf von Vitest über eine
// Beispiel-Prüfdatei, die in ihrem letzten Abbau-Haken einen Zeitgeber
// hinterlässt, dessen Rückruf wirft. Die Vorbereitungs-Datei ist die echte der
// Unit-Suite.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as zeitgeber from 'node:timers';
import { setTimeout as warte } from 'node:timers/promises';
import {
  fuehreBuch,
  loescheOffene,
  meldeSpur,
  spurEin,
  zaehleSofortige,
  meldeSofortSpur,
} from '../zeitgeber-am-datei-ende.js';
import { PROZESS_ZEITLIMIT, AUFRAEUM_ZEITLIMIT } from '../zeitlimits.js';

// Der zweite Teil startet einen realen Vitest-Lauf.
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT, hookTimeout: AUFRAEUM_ZEITLIMIT });

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Ein eigenes Ziel mit den Originalen aus `node:timers`: unabhängig davon, was
// die Vorbereitungs-Datei an der Umgebung dieser Prüfdatei schon gehüllt hat.
function neuesZiel() {
  return {
    setTimeout: zeitgeber.setTimeout,
    clearTimeout: zeitgeber.clearTimeout,
    setInterval: zeitgeber.setInterval,
    clearInterval: zeitgeber.clearInterval,
  };
}

describe('Zeitgeber-Buch an einem eigenen Ziel', () => {
  it('ein offener Zeitgeber feuert nach dem Löschen nicht mehr', async () => {
    const ziel = neuesZiel();
    const buch = fuehreBuch(ziel);
    let gefeuert = 0;
    ziel.setTimeout(() => gefeuert++, 15);
    ziel.setTimeout(() => gefeuert++, 15);
    expect(buch.offen.size).toBe(2);
    expect(loescheOffene(buch)).toBe(2);
    expect(buch.offen.size).toBe(0);
    await warte(60);
    expect(gefeuert).toBe(0);
  });

  it('ein Zeitgeber, der gefeuert hat oder gelöscht wurde, steht nicht mehr im Buch', async () => {
    const ziel = neuesZiel();
    const buch = fuehreBuch(ziel);
    let gefeuert = 0;
    let empfangen = null;
    ziel.setTimeout(
      (a, b) => {
        gefeuert++;
        empfangen = [a, b];
      },
      1,
      'eins',
      'zwei',
    );
    const geloescht = ziel.setTimeout(() => gefeuert++, 1000);
    ziel.clearTimeout(geloescht);
    expect(buch.offen.size).toBe(1);
    await vi.waitFor(() => expect(gefeuert).toBe(1));
    // Der Rückruf bekommt seine Argumente wie ohne Hülle.
    expect(empfangen).toEqual(['eins', 'zwei']);
    expect(buch.offen.size).toBe(0);
    expect(loescheOffene(buch)).toBe(0);
  });

  it('ein wiederkehrender Zeitgeber bleibt im Buch, bis er gelöscht wird', async () => {
    const ziel = neuesZiel();
    const buch = fuehreBuch(ziel);
    let schlaege = 0;
    ziel.setInterval(() => schlaege++, 5);
    await vi.waitFor(() => expect(schlaege).toBeGreaterThanOrEqual(2));
    expect(buch.offen.size).toBe(1);
    expect(loescheOffene(buch)).toBe(1);
    const stand = schlaege;
    await warte(40);
    expect(schlaege).toBe(stand);
  });

  it('ein zweiter Aufruf liefert dasselbe Buch und hüllt nicht doppelt', () => {
    const ziel = neuesZiel();
    const buch = fuehreBuch(ziel);
    const gehuellt = ziel.setTimeout;
    expect(fuehreBuch(ziel)).toBe(buch);
    expect(ziel.setTimeout).toBe(gehuellt);
    expect(buch.echt.setTimeout).toBe(zeitgeber.setTimeout);
  });

  it('die gehüllte Funktion behält Name und die Form für util.promisify', async () => {
    const ziel = neuesZiel();
    const buch = fuehreBuch(ziel);
    expect(ziel.setTimeout.name).toBe('setTimeout');
    expect(ziel.clearInterval.name).toBe('clearInterval');
    // Ohne die übernommene Eigenschaft riefe promisify den Rückruf als Dauer auf.
    await expect(promisify(ziel.setTimeout)(1, 'wert')).resolves.toBe('wert');
    loescheOffene(buch);
  });

  it('gelöscht wird über die Originale, auch wenn die Hülle inzwischen ersetzt ist', async () => {
    const ziel = neuesZiel();
    const buch = fuehreBuch(ziel);
    let gefeuert = 0;
    ziel.setTimeout(() => gefeuert++, 15);
    // Wie eine gestellte Uhr, die beim Abschalten vergessen wurde.
    ziel.clearTimeout = () => {};
    ziel.clearInterval = () => {};
    expect(loescheOffene(buch)).toBe(1);
    await warte(60);
    expect(gefeuert).toBe(0);
  });
});

describe('Spur', () => {
  it('schreibt nur, wenn sie eingeschaltet ist und etwas gelöscht wurde', () => {
    const zeilen = [];
    const ziel = (wert) => ({
      process: { env: wert === undefined ? {} : { EM4ME_ZEITGEBER_SPUR: wert } },
      console: { error: (zeile) => zeilen.push(zeile) },
    });
    meldeSpur(3, ziel(undefined));
    meldeSpur(3, ziel('0'));
    meldeSpur(0, ziel('1'));
    expect(zeilen).toEqual([]);
    meldeSpur(3, ziel('1'));
    expect(zeilen).toEqual(['zeitgeber-am-datei-ende: 3 offene Zeitgeber gelöscht']);
  });
});

// 4T-002945: Die Messung, nach der das Buch `setImmediate` nicht erfasst,
// bleibt mit der Spur wiederholbar.
describe('Zähl-Spur für setImmediate', () => {
  const sofortZiel = () => ({
    setImmediate: zeitgeber.setImmediate,
    clearImmediate: zeitgeber.clearImmediate,
  });
  const durchgang = () => new Promise((weiter) => zeitgeber.setImmediate(weiter));

  it('zählt gesetzte Rückrufe; gelaufene und gelöschte sind nicht mehr offen', async () => {
    const ziel = sofortZiel();
    const zaehler = zaehleSofortige(ziel);
    let gelaufen = 0;
    ziel.setImmediate(() => gelaufen++);
    const geloescht = ziel.setImmediate(() => gelaufen++);
    expect(zaehler.gesetzt).toBe(2);
    expect(zaehler.offen.size).toBe(2);
    ziel.clearImmediate(geloescht);
    expect(zaehler.offen.size).toBe(1);
    await durchgang();
    expect(gelaufen).toBe(1);
    expect(zaehler.gesetzt).toBe(2);
    expect(zaehler.offen.size).toBe(0);
  });

  it('ein Rückruf, der noch nicht gelaufen ist, steht als offen im Zähler; gelöscht wird nichts', async () => {
    const ziel = sofortZiel();
    const zaehler = zaehleSofortige(ziel);
    let gelaufen = 0;
    ziel.setImmediate(() => gelaufen++);
    // Stand «am Datei-Ende», bevor die Ereignis-Schleife weiterläuft.
    expect(zaehler.offen.size).toBe(1);
    await durchgang();
    expect(gelaufen).toBe(1);
  });

  it('ein zweiter Aufruf liefert denselben Zähler; ein Ziel ohne setImmediate bleibt, wie es ist', () => {
    const ziel = sofortZiel();
    const zaehler = zaehleSofortige(ziel);
    const gehuellt = ziel.setImmediate;
    expect(zaehleSofortige(ziel)).toBe(zaehler);
    expect(ziel.setImmediate).toBe(gehuellt);
    expect(gehuellt.name).toBe('setImmediate');
    const leer = {};
    expect(zaehleSofortige(leer)).toMatchObject({ gesetzt: 0 });
    expect(leer.setImmediate).toBeUndefined();
  });

  it('die Spur schreibt nur, wenn sie eingeschaltet ist und etwas gesetzt wurde', () => {
    const zeilen = [];
    const ziel = (wert) => ({
      process: { env: wert === undefined ? {} : { EM4ME_ZEITGEBER_SPUR: wert } },
      console: { error: (zeile) => zeilen.push(zeile) },
    });
    expect(spurEin(ziel(undefined))).toBe(false);
    expect(spurEin(ziel('1'))).toBe(true);
    meldeSofortSpur({ gesetzt: 4, offen: new Set() }, ziel(undefined));
    meldeSofortSpur({ gesetzt: 0, offen: new Set() }, ziel('1'));
    expect(zeilen).toEqual([]);
    meldeSofortSpur({ gesetzt: 4, offen: new Set([1]) }, ziel('1'));
    expect(zeilen).toEqual([
      'zeitgeber-am-datei-ende: setImmediate 4 gesetzt, 1 am Datei-Ende offen',
    ]);
  });

  it('ohne die Spur fasst die Vorbereitung dieser Prüfdatei setImmediate nicht an', () => {
    // Die Unit-Suite läuft ohne die Spur; ein Lauf mit Spur überspringt den Fall.
    if (spurEin()) return;
    expect(globalThis.setImmediate).toBe(zeitgeber.setImmediate);
  });
});

describe('Einhängung in der Vorbereitungs-Datei der Unit-Suite', () => {
  it('die Umgebung dieser Prüfdatei führt das Buch', () => {
    // Erst die Marke, dann das Buch: `fuehreBuch()` hüllte sonst in diesem
    // Augenblick selbst, und der Fall bliebe auch ohne Einhängung grün.
    expect(globalThis[Symbol.for('em4me.zeitgeber-am-datei-ende')]).toBeDefined();
    const buch = fuehreBuch();
    const griff = setTimeout(() => {}, 60_000);
    expect(buch.offen.has(griff)).toBe(true);
    clearTimeout(griff);
    expect(buch.offen.has(griff)).toBe(false);
  });

  it('eine gestellte Uhr setzt sich auf die Hülle und stellt sie wieder her', () => {
    const gehuellt = globalThis.setTimeout;
    const buch = fuehreBuch();
    vi.useFakeTimers();
    const vorher = buch.offen.size;
    setTimeout(() => {}, 1000);
    // Ein gestellter Zeitgeber steht nicht im Buch.
    expect(buch.offen.size).toBe(vorher);
    vi.useRealTimers();
    expect(globalThis.setTimeout).toBe(gehuellt);
  });
});

// Der reale Aufbau. Die Beispiel-Prüfdatei hinterlässt in ihrem eigenen
// Abbau-Haken einen Zeitgeber, dessen Rückruf wirft: die Bauart des Vorfalls
// vom 2026-11-21 (Rückruf scheitert nach dem Abbau der Prüf-Umgebung, der Lauf
// wird rot, obwohl jeder Fall grün ist). Mit der Vorbereitungs-Datei bleibt der
// Lauf grün, und die Spur nennt den einen gelöschten Zeitgeber; das belegt
// zugleich, dass ihr Haken nach dem Abbau-Haken der Prüfdatei läuft.
describe('realer Aufbau: eine Prüfdatei hinterlässt einen werfenden Zeitgeber', () => {
  let ordner;

  beforeAll(() => {
    ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-zeitgeber-probe-'));
    const vorbereitung = path.join(WURZEL, 'test', 'zeitgrenze-je-fall.js');
    fs.writeFileSync(
      path.join(ordner, 'beispiel.test.mjs'),
      [
        "import { it, expect, afterAll } from 'vitest';",
        "it('ist grün', () => {",
        '  expect(1).toBe(1);',
        '});',
        'afterAll(() => {',
        '  setTimeout(() => {',
        "    throw new Error('Zeitgeber nach dem Ende der Prüfdatei');",
        '  }, 10);',
        '});',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(ordner, 'vitest.config.mjs'),
      `export default { test: { include: ['*.test.mjs'], setupFiles: [${JSON.stringify(
        vorbereitung.split(path.sep).join('/'),
      )}] } };\n`,
    );
  });
  afterAll(() => {
    if (ordner) fs.rmSync(ordner, { recursive: true, force: true });
  });

  it('der Lauf bleibt grün, und die Spur nennt den gelöschten Zeitgeber', () => {
    const lauf = spawnSync(
      process.execPath,
      [
        path.join(WURZEL, 'node_modules', 'vitest', 'vitest.mjs'),
        'run',
        '--root',
        ordner,
        '--config',
        path.join(ordner, 'vitest.config.mjs'),
        '--reporter=dot',
      ],
      { cwd: ordner, encoding: 'utf8', env: { ...process.env, EM4ME_ZEITGEBER_SPUR: '1' } },
    );
    const ausgabe = `${lauf.stdout}\n${lauf.stderr}`;
    expect(lauf.status, ausgabe).toBe(0);
    expect(ausgabe).toContain('zeitgeber-am-datei-ende: 1 offene Zeitgeber gelöscht');
    expect(ausgabe).not.toContain('Zeitgeber nach dem Ende der Prüfdatei');
  });
});
