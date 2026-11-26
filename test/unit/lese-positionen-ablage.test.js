// 4T-002641 (Epic 3E-000397): Prüffälle der Ablage der Lese-Positionen im
// Hauptprozess (src/main/lese-positionen.js) und ihrer beiden Kanäle
// (src/main/ipc/lese-positionen.js).
//
// Gegen ein echtes Wegwerf-Verzeichnis je Fall statt gegen Attrappen, weil
// genau das der Gegenstand ist: eine eigene Datei neben `config.json`, die
// fehlen und defekt sein darf, ohne die Anwendung anzuhalten (Muster
// memory-stats.test.js). Der «Neustart» ist ein erneutes `konfiguriere` mit
// demselben Verzeichnis: Es verwirft den Zustand im Speicher, und der nächste
// Zugriff liest die Datei.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MAX_EINTRAEGE } from '../../src/shared/lese-stelle.js';

// Über `require` statt `import`: Das Kanal-Modul lädt die Ablage selbst mit
// `require`, und nur so teilen sich Prüfdatei und Kanal dieselbe Instanz.
const require = createRequire(import.meta.url);
const ablage = require('../../src/main/lese-positionen.js');
const kanal = require('../../src/main/ipc/lese-positionen.js');

let tmpDirs = [];
let jetzt = 1_000;

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-lese-positionen-'));
  tmpDirs.push(dir);
  return dir;
}

function starte(dir) {
  ablage.konfiguriere(dir, { jetzt: () => jetzt });
}

function dateiInhalt(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, ablage.DATEI_NAME), 'utf8'));
}

const STELLE = { zeileOben: 40, schreibmarke: { zeile: 42, spalte: 3 } };
const PFAD = path.join('C:', 'Bereich', 'Notiz.md');

beforeEach(() => {
  jetzt = 1_000;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  ablage.konfiguriere(null);
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('Ablage der Lese-Positionen', () => {
  it('merkt eine Stelle und liest sie wieder', () => {
    starte(makeTempDir());
    expect(ablage.lies(PFAD)).toBeNull();
    expect(ablage.merke(PFAD, STELLE)).toBe(true);
    expect(ablage.lies(PFAD)).toEqual(STELLE);
  });

  it('übersteht einen Neustart mit demselben Verzeichnis', async () => {
    const dir = makeTempDir();
    starte(dir);
    ablage.merke(PFAD, STELLE);
    expect(await ablage.schreibeJetzt()).toBe(true);
    expect(dateiInhalt(dir)).toEqual({
      version: 1,
      eintraege: { [PFAD]: { ...STELLE, zuletzt: 1_000 } },
    });
    starte(dir);
    expect(ablage.lies(PFAD)).toEqual(STELLE);
  });

  it.each([
    ['defektes JSON', '{ kein json'],
    ['fremde Form', JSON.stringify([1, 2, 3])],
    ['unbekannte Version', JSON.stringify({ version: 0, eintraege: { [PFAD]: STELLE } })],
    ['Einträge ohne Objekt', JSON.stringify({ version: 1, eintraege: 'x' })],
  ])('beginnt bei %s leer und bleibt schreibbar', async (_name, inhalt) => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, ablage.DATEI_NAME), inhalt, 'utf8');
    starte(dir);
    expect(ablage.lies(PFAD)).toBeNull();
    ablage.merke(PFAD, STELLE);
    expect(await ablage.schreibeJetzt()).toBe(true);
    expect(dateiInhalt(dir).eintraege[PFAD]).toEqual({ ...STELLE, zuletzt: 1_000 });
  });

  it('lässt eine Datei aus einer neueren Programm-Fassung unberührt und merkt nur im Speicher', async () => {
    const dir = makeTempDir();
    const neuer = JSON.stringify({ version: 2, eintraege: { [PFAD]: STELLE }, zusatz: 'x' });
    fs.writeFileSync(path.join(dir, ablage.DATEI_NAME), neuer, 'utf8');
    starte(dir);
    expect(ablage.lies(PFAD)).toBeNull();
    expect(ablage.merke(PFAD, STELLE)).toBe(true);
    expect(ablage.lies(PFAD)).toEqual(STELLE);
    expect(await ablage.schreibeJetzt()).toBe(false);
    expect(fs.readFileSync(path.join(dir, ablage.DATEI_NAME), 'utf8')).toBe(neuer);
  });

  it('verwirft beim Lesen ungültige Einträge und behält die gültigen', () => {
    const dir = makeTempDir();
    const gut = path.join('C:', 'gut.md');
    fs.writeFileSync(
      path.join(dir, ablage.DATEI_NAME),
      JSON.stringify({
        version: 1,
        eintraege: {
          [gut]: { zeileOben: 5, schreibmarke: null, zuletzt: 7 },
          [path.join('C:', 'text.md')]: { zeileOben: '5', schreibmarke: null, zuletzt: 7 },
          [path.join('C:', 'ohne-zeit.md')]: { zeileOben: 5, schreibmarke: null },
          ['x'.repeat(4096)]: { zeileOben: 5, schreibmarke: null, zuletzt: 7 },
        },
      }),
      'utf8',
    );
    starte(dir);
    expect(ablage.lies(gut)).toEqual({ zeileOben: 5, schreibmarke: null });
    expect(ablage.lies(path.join('C:', 'text.md'))).toBeNull();
    expect(ablage.lies(path.join('C:', 'ohne-zeit.md'))).toBeNull();
  });

  it('lässt die Ablage-Datei bei ungültigen Werten am Eingang unverändert', async () => {
    const dir = makeTempDir();
    starte(dir);
    ablage.merke(PFAD, STELLE);
    await ablage.schreibeJetzt();
    const vorher = fs.readFileSync(path.join(dir, ablage.DATEI_NAME), 'utf8');
    const ungueltig = [
      [PFAD, { zeileOben: '12', schreibmarke: null }],
      [PFAD, { zeileOben: -1, schreibmarke: null }],
      [PFAD, { zeileOben: 3, schreibmarke: { zeile: 'a', spalte: 0 } }],
      ['x'.repeat(4096), STELLE],
      ['', STELLE],
      [42, STELLE],
      [null, STELLE],
      [{ pfad: PFAD }, STELLE],
    ];
    for (const [pfad, stelle] of ungueltig) expect(ablage.merke(pfad, stelle)).toBe(false);
    expect(await ablage.schreibeJetzt()).toBe(false);
    expect(fs.readFileSync(path.join(dir, ablage.DATEI_NAME), 'utf8')).toBe(vorher);
    expect(ablage.lies(PFAD)).toEqual(STELLE);
  });

  it('nimmt einen Pfad mit 4095 Zeichen an', () => {
    starte(makeTempDir());
    expect(ablage.merke('y'.repeat(4095), STELLE)).toBe(true);
  });

  it('findet die Stelle auch unter einer anderen Schreibweise desselben Pfads', async () => {
    const dir = makeTempDir();
    starte(dir);
    const gerade = path.join(dir, 'Bereich', 'Notiz.md');
    const umweg = [dir, 'Bereich', 'Ordner', '..', 'Notiz.md'].join(path.sep);
    expect(ablage.merke(umweg, STELLE)).toBe(true);
    expect(ablage.lies(gerade)).toEqual(STELLE);
    await ablage.schreibeJetzt();
    expect(Object.keys(dateiInhalt(dir).eintraege)).toEqual([gerade]);
    // Unter Windows gilt dasselbe für Vorwärts-Schrägstriche (Bereichs-Lesezeichen).
    if (path.sep === '\\') {
      expect(ablage.lies(gerade.replace(/\\/g, '/'))).toEqual(STELLE);
      expect(ablage.benenneUm(gerade.replace(/\\/g, '/'), path.join(dir, 'Neu.md'))).toBe(true);
      expect(ablage.lies(path.join(dir, 'Neu.md'))).toEqual(STELLE);
    }
  });

  it('führt die Stelle beim Umbenennen unter dem neuen Pfad weiter', async () => {
    const dir = makeTempDir();
    starte(dir);
    const neu = path.join('C:', 'Bereich', 'Umbenannt.md');
    ablage.merke(PFAD, STELLE);
    expect(ablage.benenneUm(PFAD, neu)).toBe(true);
    expect(ablage.lies(PFAD)).toBeNull();
    expect(ablage.lies(neu)).toEqual(STELLE);
    expect(ablage.benenneUm(path.join('C:', 'unbekannt.md'), neu)).toBe(false);
    expect(ablage.benenneUm(PFAD, '')).toBe(false);
    await ablage.schreibeJetzt();
    expect(Object.keys(dateiInhalt(dir).eintraege)).toEqual([neu]);
  });

  it('verdrängt über die Höchstzahl hinaus die ältesten Einträge', async () => {
    const dir = makeTempDir();
    starte(dir);
    for (let i = 0; i <= MAX_EINTRAEGE; i += 1) {
      jetzt = 1_000 + i;
      ablage.merke(path.join('C:', `d${i}.md`), STELLE);
    }
    expect(ablage.lies(path.join('C:', 'd0.md'))).toBeNull();
    expect(ablage.lies(path.join('C:', `d${MAX_EINTRAEGE}.md`))).toEqual(STELLE);
    await ablage.schreibeJetzt();
    expect(Object.keys(dateiInhalt(dir).eintraege)).toHaveLength(MAX_EINTRAEGE);
  });

  it('kürzt beim Lesen eine übervolle Datei auf die jüngsten Einträge', () => {
    const dir = makeTempDir();
    const eintraege = {};
    for (let i = 0; i < MAX_EINTRAEGE + 3; i += 1) {
      eintraege[path.join('C:', `d${i}.md`)] = { zeileOben: 1, schreibmarke: null, zuletzt: i };
    }
    fs.writeFileSync(
      path.join(dir, ablage.DATEI_NAME),
      JSON.stringify({ version: 1, eintraege }),
      'utf8',
    );
    starte(dir);
    for (let i = 0; i < 3; i += 1) expect(ablage.lies(path.join('C:', `d${i}.md`))).toBeNull();
    expect(ablage.lies(path.join('C:', 'd3.md'))).not.toBeNull();
  });

  it('schreibt mehrere Änderungen innerhalb von zwei Sekunden in einem Vorgang', async () => {
    vi.useFakeTimers();
    const dir = makeTempDir();
    starte(dir);
    const spion = vi.spyOn(fs.promises, 'mkdir');
    ablage.merke(PFAD, STELLE);
    ablage.merke(PFAD, { zeileOben: 50, schreibmarke: null });
    ablage.merke(path.join('C:', 'zwei.md'), STELLE);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fs.existsSync(path.join(dir, ablage.DATEI_NAME))).toBe(false);
    expect(spion).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(fs.existsSync(path.join(dir, ablage.DATEI_NAME))).toBe(true));
    expect(spion).toHaveBeenCalledTimes(1);
    expect(dateiInhalt(dir).eintraege[PFAD]).toEqual({
      zeileOben: 50,
      schreibmarke: null,
      zuletzt: 1_000,
    });
    expect(await ablage.schreibeJetzt()).toBe(false);
  });

  it('schreibt beim Beenden sofort und hebt das gesammelte Schreiben auf', async () => {
    vi.useFakeTimers();
    const dir = makeTempDir();
    starte(dir);
    const spion = vi.spyOn(fs.promises, 'mkdir');
    ablage.merke(PFAD, STELLE);
    expect(ablage.hatOffenes()).toBe(true);
    expect(await ablage.schreibeJetzt()).toBe(true);
    expect(ablage.hatOffenes()).toBe(false);
    expect(dateiInhalt(dir).eintraege[PFAD]).toEqual({ ...STELLE, zuletzt: 1_000 });
    // Geschrieben hat allein schreibeJetzt; der aufgehobene Sammel-Timer
    // schreibt nicht ein zweites Mal.
    expect(spion).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(spion).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(dir)).toEqual([ablage.DATEI_NAME]);
  });

  it('wartet beim Beenden einen laufenden gesammelten Schreibvorgang ab und schreibt den neuesten Stand zuletzt', async () => {
    vi.useFakeTimers();
    const dir = makeTempDir();
    starte(dir);
    // Der gesammelte Schreibvorgang bleibt am Anlegen des Verzeichnisses
    // stehen, bis der Fall ihn freigibt.
    let freigeben;
    const sperre = new Promise((r) => {
      freigeben = r;
    });
    const echt = fs.promises.mkdir.bind(fs.promises);
    const spion = vi.spyOn(fs.promises, 'mkdir').mockImplementationOnce(async (...args) => {
      await sperre;
      return echt(...args);
    });
    ablage.merke(PFAD, STELLE);
    await vi.advanceTimersByTimeAsync(ablage.SAMMEL_MS);
    vi.useRealTimers();
    expect(spion).toHaveBeenCalledTimes(1);
    expect(ablage.hatOffenes()).toBe(true);
    const neuer = { zeileOben: 77, schreibmarke: { zeile: 80, spalte: 1 } };
    jetzt = 2_000;
    ablage.merke(PFAD, neuer);
    let fertig = false;
    const beenden = ablage.schreibeJetzt().then((wert) => {
      fertig = true;
      return wert;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(fertig).toBe(false);
    expect(spion).toHaveBeenCalledTimes(1);
    freigeben();
    expect(await beenden).toBe(true);
    expect(spion).toHaveBeenCalledTimes(2);
    expect(ablage.hatOffenes()).toBe(false);
    expect(dateiInhalt(dir).eintraege[PFAD]).toEqual({ ...neuer, zuletzt: 2_000 });
    expect(fs.readdirSync(dir)).toEqual([ablage.DATEI_NAME]);
  });

  it('wirft beim Beenden auch bei einem Schreibfehler nicht', async () => {
    starte(makeTempDir());
    vi.spyOn(fs.promises, 'mkdir').mockRejectedValue(
      Object.assign(new Error('Datenträger fort'), { code: 'EIO' }),
    );
    ablage.merke(PFAD, STELLE);
    await expect(ablage.schreibeJetzt()).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalled();
    // Der Stand bleibt offen für den nächsten Anlass.
    expect(ablage.hatOffenes()).toBe(true);
  });

  it('hält bei einem Schreibfehler nicht an und versucht es beim nächsten Anlass', async () => {
    const dir = makeTempDir();
    // Eine Datei am Platz des Verzeichnisses lässt das Anlegen scheitern.
    const blockade = path.join(dir, 'blockiert');
    fs.writeFileSync(blockade, '', 'utf8');
    const ablageDir = path.join(blockade, 'Nutzerdaten');
    starte(ablageDir);
    ablage.merke(PFAD, STELLE);
    expect(await ablage.schreibeJetzt()).toBe(false);
    expect(console.warn).toHaveBeenCalled();
    fs.rmSync(blockade);
    expect(await ablage.schreibeJetzt()).toBe(true);
    expect(dateiInhalt(ablageDir).eintraege[PFAD]).toEqual({ ...STELLE, zuletzt: 1_000 });
  });

  it('arbeitet ohne Konfiguration nur im Speicher, ohne Datei und ohne Fehler', async () => {
    vi.useFakeTimers();
    ablage.konfiguriere(null);
    expect(ablage.ablagePfad()).toBeNull();
    expect(ablage.merke(PFAD, STELLE)).toBe(true);
    expect(ablage.lies(PFAD)).toEqual(STELLE);
    expect(ablage.hatOffenes()).toBe(false);
    expect(await ablage.schreibeJetzt()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

// Halt am Beenden-Punkt (will-quit in main.js): wartet nur bei Offenem,
// beendet nach dem Schreiben oder nach Ablauf der Frist, und nur einmal.
describe('erzeugeBeendenHalt', () => {
  function aufbau({ offen = true, schreibe = async () => true } = {}) {
    const beende = vi.fn();
    const schreiber = vi.fn(schreibe);
    const halt = ablage.erzeugeBeendenHalt({
      hatOffenes: () => offen,
      schreibe: schreiber,
      beende,
    });
    const ereignis = () => ({ preventDefault: vi.fn() });
    return { halt, beende, schreiber, ereignis };
  }

  it('lässt das Beenden ohne Offenes unverändert durch', () => {
    const { halt, beende, schreiber, ereignis } = aufbau({ offen: false });
    const e = ereignis();
    expect(halt(e)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(schreiber).not.toHaveBeenCalled();
    expect(beende).not.toHaveBeenCalled();
  });

  it('hält bei Offenem an, schreibt und beendet danach genau einmal', async () => {
    vi.useFakeTimers();
    const { halt, beende, schreiber, ereignis } = aufbau();
    const e = ereignis();
    expect(halt(e)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(schreiber).toHaveBeenCalledTimes(1);
    expect(beende).toHaveBeenCalledTimes(1);
    // Das erneute Beenden läuft durch, ohne zweites Warten.
    const zweites = ereignis();
    expect(halt(zweites)).toBe(false);
    expect(zweites.preventDefault).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ablage.BEENDEN_FRIST_MS * 2);
    expect(schreiber).toHaveBeenCalledTimes(1);
    expect(beende).toHaveBeenCalledTimes(1);
  });

  it('beendet nach Ablauf der Frist auch ohne Abschluss des Schreibens', async () => {
    vi.useFakeTimers();
    let abschliessen;
    const { halt, beende, ereignis } = aufbau({
      schreibe: () =>
        new Promise((r) => {
          abschliessen = r;
        }),
    });
    expect(halt(ereignis())).toBe(true);
    await vi.advanceTimersByTimeAsync(ablage.BEENDEN_FRIST_MS - 1);
    expect(beende).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(beende).toHaveBeenCalledTimes(1);
    abschliessen(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(beende).toHaveBeenCalledTimes(1);
    expect(halt(ereignis())).toBe(false);
  });

  it('beendet auch, wenn das Schreiben scheitert', async () => {
    vi.useFakeTimers();
    const { halt, beende, ereignis } = aufbau({
      schreibe: async () => {
        throw new Error('kaputt');
      },
    });
    expect(halt(ereignis())).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(beende).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it('wartet höchstens zwei Sekunden', () => {
    expect(ablage.BEENDEN_FRIST_MS).toBe(2_000);
  });
});

describe('Kanäle lesePosition:lesen und lesePosition:merken', () => {
  it('meldet beide Kanäle an', () => {
    const angemeldet = [];
    kanal.registerLesePositionenIpc((name, fn) => angemeldet.push([name, fn]), {});
    expect(angemeldet.map(([name]) => name)).toEqual(['lesePosition:lesen', 'lesePosition:merken']);
  });

  it('liest eine gemerkte Stelle und gibt beim Merken nichts zurück', () => {
    starte(makeTempDir());
    expect(kanal.lesePositionMerken({}, PFAD, STELLE)).toBeUndefined();
    expect(kanal.lesePositionLesen({}, PFAD)).toEqual(STELLE);
  });

  it('weist ungültige Werte still ab', async () => {
    const dir = makeTempDir();
    starte(dir);
    for (const [pfad, stelle] of [
      [PFAD, { zeileOben: 'x' }],
      [PFAD, { zeileOben: 0, schreibmarke: null }],
      ['z'.repeat(5000), STELLE],
      [['a'], STELLE],
      [undefined, STELLE],
    ]) {
      expect(kanal.lesePositionMerken({}, pfad, stelle)).toBeUndefined();
    }
    expect(kanal.lesePositionLesen({}, PFAD)).toBeNull();
    expect(kanal.lesePositionLesen({}, 17)).toBeNull();
    expect(kanal.lesePositionLesen({}, 'z'.repeat(5000))).toBeNull();
    expect(await ablage.schreibeJetzt()).toBe(false);
    expect(fs.existsSync(path.join(dir, ablage.DATEI_NAME))).toBe(false);
  });
});
