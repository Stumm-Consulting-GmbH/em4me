// 4T-001787 (Epic 3E-000255, E9): Der Sperr-Ordner bleibt draußen — aus der
// Ordner-Liste des Bereichs und aus der Beobachtung des Bereichs-Watchers
// (AK14), und aus Index, Suche, Statistik und Verweis-Auflösung über die eine
// Ordner-Regel der Anwendung (AK15).
//
// **Warum die Ordner-Liste am ECHTEN Handler geprüft wird** (Muster
// area-loeschen.test.js, beleg-datei-bereich.test.js): Die Entscheidung, was
// ausgelassen wird, fällt im Handler und nicht in der Sortier-Funktion. Ein Fall
// gegen eine nachgebaute Filter-Bedingung prüfte den Nachbau.
//
// **Warum die Ignorier-Regel des Watchers als reine Funktion geprüft wird:** Ein
// laufender Watcher meldete seine Entscheidung nur indirekt, über ein Ereignis,
// das ausbleibt — und ein ausbleibendes Ereignis ist von einem langsamen nicht
// zu unterscheiden. Die Regel liegt deshalb Electron-frei daneben und wird
// unmittelbar befragt.
//
// **AK15 ist ein Wächter über die FORM, nicht über einen Namen.** Geprüft wird,
// dass jeder nach der Gültigkeits-Regel zulässige Ordnername von
// `isIgnoredDirName` erfasst wird; genau daran hängt, dass die sechs Stellen mit
// dieser Regel den Bereichs-Kontext nicht kennen müssen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  DEFAULT_LOCK_FOLDER_NAME,
  pruefeSperrOrdnerName,
} from '../../src/shared/database/lock-folder-name.js';
import {
  baueIgnorierRegel,
  beziehSperrOrdnerNeu,
  istImSperrOrdner,
} from '../../src/main/area/area-watch-ignore.js';
import { isIgnoredDirName } from '../../src/main/index/scan.js';
import { createAreaConfig, normalisiereDatenbankKonfig } from '../../src/main/area/area-config.js';
import mddStore from '../../src/main/documents/mdd-store.js';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Bestands-Lesungen im Modulkopf, nicht im Prüffall (test/README). Die drei
// Stellen mit eigener Kopie der Ordner-Bedingung, am Quelltext geprüft.
const EIGENE_KOPIEN = [
  'src/main/documents/link-update.js',
  'src/main/ipc/rename.js',
  'src/main/ipc/templates.js',
].map((rel) => ({ rel, quelle: fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8') }));

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ausschluss-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function schreibeSektion(wurzel, sektion) {
  const container = mddStore.emptySettingsContainer();
  container.settings.database = sektion;
  fs.writeFileSync(
    path.join(wurzel, mddStore.MDDA_FILENAME),
    mddStore.serializeContainer(container),
    'utf8',
  );
}

function areaConfig() {
  return createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: vi.fn(),
    mddStore,
    attachmentPath: {},
    resolveTemplatesConfig: () => ({}),
  });
}

// Der echte Handler-Satz, mit dem echten Leser der Bereichsdatei: So misst der
// Fall die Kette vom Datei-Inhalt bis zur Liste und nicht eine Attrappe davon.
function registriere(rootPath, zusatz) {
  const handler = new Map();
  const cfg = areaConfig();
  registerAreasIpc((kanal, fn) => handler.set(kanal, fn), {
    dialog: {},
    shell: {},
    senderWindow: () => ({}),
    areaOfWindow: () => (rootPath ? { rootPath, name: path.basename(rootPath) } : null),
    tForWindow: (_w, key) => key,
    appRegistry: {},
    openAreaPath: (p) => ({ ok: true, rootPath: p }),
    closeAreaApp: async () => ({ ok: true }),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    getStore: () => null,
    workspacesState: [],
    setWorkspacesState: () => {},
    workspacesChanged: () => {},
    resolveAreaStartPage: async () => null,
    writeAreaStartPage: async () => ({ ok: true }),
    startPageRelative: () => null,
    readAreaDatabaseConfig: (p) => cfg.readAreaDatabaseConfig(p),
    writeAreaDatabaseConfig: (p, c) => cfg.writeAreaDatabaseConfig(p, c),
    normalisiereDatenbankKonfig,
    sperrOrdnerNeuBeziehen: async () => {},
    ...zusatz,
  });
  return handler;
}

// --- AK14, erste Hälfte: die Ordner-Liste ----------------------------------------------

describe('area:listDir lässt den Sperr-Ordner aus (4T-001787, AK14)', () => {
  it('zeigt ihn auf der obersten Ebene nicht, die übrigen Ordner schon', async () => {
    const wurzel = bereich();
    fs.mkdirSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));
    fs.mkdirSync(path.join(wurzel, 'Stammdaten'));
    fs.mkdirSync(path.join(wurzel, '.anderer-punkt-ordner'));

    const ergebnis = await registriere(wurzel).get('area:listDir')({}, wurzel);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.dirs).toEqual(['.anderer-punkt-ordner', 'Stammdaten']);
  });

  it('zeigt einen gleichnamigen Ordner tiefer im Baum weiterhin', async () => {
    const wurzel = bereich();
    const tiefer = path.join(wurzel, 'Stammdaten');
    fs.mkdirSync(tiefer);
    fs.mkdirSync(path.join(tiefer, DEFAULT_LOCK_FOLDER_NAME));

    const ergebnis = await registriere(wurzel).get('area:listDir')({}, tiefer);

    expect(ergebnis.dirs).toEqual([DEFAULT_LOCK_FOLDER_NAME]);
  });

  it('folgt dem eingestellten Namen und zeigt dann den Vorgabe-Ordner', async () => {
    const wurzel = bereich();
    fs.mkdirSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));
    fs.mkdirSync(path.join(wurzel, '.eigene-sperren'));
    schreibeSektion(wurzel, { lockFolderName: '.eigene-sperren' });

    const ergebnis = await registriere(wurzel).get('area:listDir')({}, wurzel);

    // Der eingestellte Ordner ist draußen, der frühere Vorgabe-Ordner ist ein
    // Ordner wie jeder andere und bleibt sichtbar.
    expect(ergebnis.dirs).toEqual([DEFAULT_LOCK_FOLDER_NAME]);
  });

  it('liest den Namen bei jedem Aufruf frisch (AK13)', async () => {
    const wurzel = bereich();
    fs.mkdirSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));
    fs.mkdirSync(path.join(wurzel, '.eigene-sperren'));
    const handler = registriere(wurzel);

    const vorher = await handler.get('area:listDir')({}, wurzel);
    expect(vorher.dirs).toEqual(['.eigene-sperren']);

    // Die Bereichsdatei ändert sich zwischen den beiden Aufrufen; derselbe
    // Handler-Satz muss dem folgen, ohne neu aufgebaut zu werden.
    schreibeSektion(wurzel, { lockFolderName: '.eigene-sperren' });

    const nachher = await handler.get('area:listDir')({}, wurzel);
    expect(nachher.dirs).toEqual([DEFAULT_LOCK_FOLDER_NAME]);
  });

  it('fällt bei defekter Bereichsdatei auf den Vorgabe-Namen zurück (AK12)', async () => {
    const wurzel = bereich();
    fs.mkdirSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));
    fs.writeFileSync(path.join(wurzel, mddStore.MDDA_FILENAME), '{ kein json', 'utf8');

    const ergebnis = await registriere(wurzel).get('area:listDir')({}, wurzel);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.dirs).toEqual([]);
  });

  it('lässt den Bereichs-Watcher nach gelungenem Schreiben neu beziehen', async () => {
    const wurzel = bereich();
    const neuBeziehen = vi.fn(async () => {});
    const handler = registriere(wurzel, { sperrOrdnerNeuBeziehen: neuBeziehen });

    await handler.get('area:setDatabaseConfig')({}, { overviewOnOpen: true });

    expect(neuBeziehen).toHaveBeenCalledWith(wurzel);
  });

  it('lässt nach einem gescheiterten Schreiben nicht neu beziehen', async () => {
    const wurzel = bereich();
    fs.writeFileSync(path.join(wurzel, mddStore.MDDA_FILENAME), '{ kein json', 'utf8');
    const neuBeziehen = vi.fn(async () => {});
    const handler = registriere(wurzel, { sperrOrdnerNeuBeziehen: neuBeziehen });

    const ergebnis = await handler.get('area:setDatabaseConfig')({}, { overviewOnOpen: true });

    expect(ergebnis.ok).toBe(false);
    expect(neuBeziehen).not.toHaveBeenCalled();
  });
});

// --- AK14, zweite Hälfte: die Ignorier-Regel des Watchers -------------------------------

describe('Ignorier-Regel des Bereichs-Watchers (4T-001787, AK14)', () => {
  const WURZEL = path.resolve('/bereich');
  const nieMdd = () => false;

  function regel(sperrOrdner) {
    const eintrag = { rootPath: WURZEL, sperrOrdner };
    return { eintrag, ignoriert: baueIgnorierRegel(eintrag, nieMdd) };
  }

  it('ignoriert den Ordner selbst und alles darunter', () => {
    const { ignoriert } = regel(DEFAULT_LOCK_FOLDER_NAME);

    expect(ignoriert(path.join(WURZEL, DEFAULT_LOCK_FOLDER_NAME))).toBe(true);
    expect(ignoriert(path.join(WURZEL, DEFAULT_LOCK_FOLDER_NAME, 'd+kunden.md.lock'))).toBe(true);
    expect(ignoriert(path.join(WURZEL, DEFAULT_LOCK_FOLDER_NAME, 'tiefer', 'x.lock'))).toBe(true);
  });

  it('beobachtet andere Punkt-Ordner und gewöhnliche Dateien weiter', () => {
    const { ignoriert } = regel(DEFAULT_LOCK_FOLDER_NAME);

    expect(ignoriert(path.join(WURZEL, '.anderer-punkt-ordner', 'Notiz.md'))).toBe(false);
    expect(ignoriert(path.join(WURZEL, 'Stammdaten', 'Kunden.md'))).toBe(false);
    // Ein gleichnamiger Ordner tiefer im Baum gehört dem Anwender.
    expect(ignoriert(path.join(WURZEL, 'Stammdaten', DEFAULT_LOCK_FOLDER_NAME, 'x.lock'))).toBe(
      false,
    );
    // Ein Präfix-Nachbar ist nicht derselbe Ordner.
    expect(ignoriert(path.join(WURZEL, `${DEFAULT_LOCK_FOLDER_NAME}-alt`, 'x.lock'))).toBe(false);
  });

  it('behält die bestehende Regel für Markdown-Data-Dateien bei', () => {
    const eintrag = { rootPath: WURZEL, sperrOrdner: DEFAULT_LOCK_FOLDER_NAME };
    const ignoriert = baueIgnorierRegel(eintrag, (p) => p.endsWith('.mdda'));

    expect(ignoriert(path.join(WURZEL, 'Area_Settings.mdda'))).toBe(true);
    expect(ignoriert(path.join(WURZEL, 'Kunden.md'))).toBe(false);
  });

  it('folgt einem Namenswechsel am Eintrag ohne Neustart', async () => {
    const wurzel = bereich();
    const cfg = areaConfig();
    const { eintrag, ignoriert } = regel(DEFAULT_LOCK_FOLDER_NAME);
    eintrag.rootPath = wurzel;
    const leseNamen = async (p) =>
      normalisiereDatenbankKonfig(await cfg.readAreaDatabaseConfig(p)).lockFolderName;

    expect(ignoriert(path.join(wurzel, '.spaeter', 'x.lock'))).toBe(false);

    schreibeSektion(wurzel, { lockFolderName: '.spaeter' });
    await beziehSperrOrdnerNeu([eintrag], leseNamen, wurzel);

    // Dieselbe Funktion, kein neuer Watcher — und sie entscheidet nun anders.
    expect(ignoriert(path.join(wurzel, '.spaeter', 'x.lock'))).toBe(true);
    expect(ignoriert(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, 'x.lock'))).toBe(false);
  });

  it('lässt Einträge fremder Bereiche unberührt', async () => {
    const eigen = { rootPath: path.resolve('/eins'), sperrOrdner: DEFAULT_LOCK_FOLDER_NAME };
    const fremd = { rootPath: path.resolve('/zwei'), sperrOrdner: DEFAULT_LOCK_FOLDER_NAME };

    await beziehSperrOrdnerNeu([eigen, fremd], async () => '.neu', path.resolve('/eins'));

    expect(eigen.sperrOrdner).toBe('.neu');
    expect(fremd.sperrOrdner).toBe(DEFAULT_LOCK_FOLDER_NAME);
  });

  it('behält den bisherigen Namen, wenn das Lesen scheitert', async () => {
    const eintrag = { rootPath: path.resolve('/eins'), sperrOrdner: '.bisher' };
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await beziehSperrOrdnerNeu([eintrag], async () => {
      throw new Error('mdda unlesbar');
    });

    expect(eintrag.sperrOrdner).toBe('.bisher');
    expect(warnung).toHaveBeenCalled();
    warnung.mockRestore();
  });

  it('verlangt die Markdown-Data-Erkennung als Funktion', () => {
    expect(() => baueIgnorierRegel({ rootPath: WURZEL, sperrOrdner: '.x' }, null)).toThrow(
      TypeError,
    );
  });

  it('meldet bei unbrauchbaren Eingaben nichts als zugehörig', () => {
    expect(istImSperrOrdner('', '.x', path.join(WURZEL, '.x'))).toBe(false);
    expect(istImSperrOrdner(WURZEL, '', path.join(WURZEL, '.x'))).toBe(false);
    expect(istImSperrOrdner(WURZEL, '.x', '')).toBe(false);
  });
});

// --- AK15: die eine Ordner-Regel der Anwendung -----------------------------------------

describe('Der Sperr-Ordner fällt unter die eine Ordner-Regel (4T-001787, AK15)', () => {
  it('erfasst den Vorgabe-Namen', () => {
    expect(isIgnoredDirName(DEFAULT_LOCK_FOLDER_NAME)).toBe(true);
  });

  it('erfasst jeden nach der Gültigkeits-Regel zulässigen Namen', () => {
    // Kandidaten quer durch den erlaubten Raum, plus die Gegenprobe: Was die
    // Regel abweist, muss hier gar nicht erst ankommen.
    const kandidaten = [
      '.area-locks',
      '.sperren',
      '.Sperren',
      '.a',
      '.locks-2026',
      '.sperr ordner',
      '.sperr.ordner',
      '.ünlaut',
      `.${'x'.repeat(63)}`,
      'sperren',
      '..',
      '.a/b',
      '.a:b',
      '',
    ];
    const durchgefallen = [];
    let gueltige = 0;
    for (const name of kandidaten) {
      if (!pruefeSperrOrdnerName(name).ok) continue;
      gueltige += 1;
      if (!isIgnoredDirName(name)) durchgefallen.push(name);
    }

    expect(durchgefallen).toEqual([]);
    // Untere Plausibilitäts-Schranke: Ohne sie wäre der Fall auch dann grün,
    // wenn die Gültigkeits-Regel alles abwiese und gar nichts geprüft würde.
    expect(gueltige).toBeGreaterThanOrEqual(9);
  });

  it('belegt, dass die drei Stellen mit eigener Kopie Punkt-Ordner überspringen', () => {
    // Die Kopien lauten wörtlich «node_modules oder Name beginnt mit Punkt».
    // Damit betritt keine von ihnen den Sperr-Ordner, solange sein Name die
    // Form trägt — und genau das erzwingt die Gültigkeits-Regel.
    const ohneBedingung = EIGENE_KOPIEN.filter(
      (stelle) => !/name === 'node_modules' \|\| \w+\.name\.startsWith\('\.'\)/.test(stelle.quelle),
    ).map((stelle) => stelle.rel);

    expect(ohneBedingung).toEqual([]);
  });
});
