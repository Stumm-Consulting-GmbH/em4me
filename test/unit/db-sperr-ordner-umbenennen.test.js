// 4T-001795 (Epic 3E-000255, E9): Der Name des Sperr-Ordners, im
// Haupt-Prozess — die Gültigkeits-Regel samt ihren Gründen (AK6), die
// Umbenennung und ihre Verweigerung bei lebender Sperre (AK7, AK8), der feste
// Ausgang bei einem Fehlschlag (AK9), der Schreibweg der Angabe (AK3 bis AK5)
// und der Kanal, über den beides zusammenkommt.
//
// **Gearbeitet wird an echten Temp-Verzeichnissen**, weil der Gegenstand das
// Umbenennen eines Ordners und das Schreiben einer Datei IST. Eine Attrappe des
// Dateisystems entschiede selbst, wann ein Umbenennen scheitert, und damit wäre
// gerade die Eigenschaft nicht gemessen, auf der die Zusage «ein halber Zustand
// entsteht nicht» ruht.
//
// **Die Fehlschläge entstehen an der Naht und nicht durch eine Attrappe des
// ganzen Dateisystems:** `benenneUm` und der Schreibweg der Bereichsdatei sind
// einzeln ersetzbar, und ein Fall setzt genau den einen Schritt außer Kraft, um
// den es ihm geht. Alles übrige läuft echt weiter.
//
// **Sperren entstehen von Hand und nicht über die geprüfte Funktion.** Der
// Aufbau eines Prüffalls darf nicht den Weg nehmen, den der Fall prüft
// (test/README).
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  DEFAULT_LOCK_FOLDER_NAME,
  LOCK_FOLDER_NAME_CODES,
  MAX_LOCK_FOLDER_NAME_LENGTH,
  pruefeSperrOrdnerName,
} from '../../src/shared/database/lock-folder-name.js';
import {
  SPERR_ORDNER_CODES,
  setzeSperrOrdnerName,
} from '../../src/main/database/lock-folder-rename.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { ART_DATENSATZ, sperrDateiName } from '../../src/main/database/lock-store.js';
import { createAreaConfig, normalisiereDatenbankKonfig } from '../../src/main/area/area-config.js';
import mddStore from '../../src/main/documents/mdd-store.js';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');

// --- Bestands-Lesungen im Modulkopf, nicht im Prüffall (test/README) ---------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function jsDateien(verzeichnis) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...jsDateien(voll));
    else if (eintrag.name.endsWith('.js')) gefunden.push(voll);
  }
  return gefunden;
}

// Wo der Produkt-Code die Sperr-Verwaltung ERZEUGT. Gesucht wird der Aufruf und
// nicht die Nennung: Der Import in der Verdrahtung und der Name in der
// Definition sollen den Fall nicht mitzählen.
// Gesucht wird in `main` und `shared`: Der Anzeige-Prozess kann die Verwaltung
// gar nicht laden, und sein Quellbaum wäre hier nur Lese-Last, die diese
// Prüfdatei an die Änderungsklasse der Oberfläche bände.
const ERZEUGUNGS_STELLEN = ['main', 'shared']
  .flatMap((teil) => jsDateien(path.join(ROOT, 'src', teil)))
  .filter((voll) => /erzeugeSperrVerwaltung\s*\(/.test(fs.readFileSync(voll, 'utf8')))
  .map((voll) => path.relative(ROOT, voll).split(path.sep).join('/'))
  .filter((rel) => rel !== 'src/main/database/lock-lifecycle.js')
  .sort();

const DATENSATZ = { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00042' };
const EIGENE_PID = 4711;
const FREMDE_PID = 9999;
const START_MS = Date.parse('2026-09-19T08:00:00Z');
const VIER_STUNDEN_MS = 4 * 60 * 60 * 1000;

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

// --- Aufbau ------------------------------------------------------------------------------

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-sperrordner-'));
  tmpDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'Kunden.md'), '# Kunden\n', 'utf8');
  return dir;
}

function mddaPath(root) {
  return path.join(root, mddStore.MDDA_FILENAME);
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

// Eine Bereichsdatei von Hand: Der Aufbau eines Prüffalls nimmt nicht den
// Schreibweg, den der Fall prüft.
function schreibeSektion(root, sektion) {
  const container = mddStore.emptySettingsContainer();
  if (sektion !== null) container.settings.database = sektion;
  fs.writeFileSync(mddaPath(root), mddStore.serializeContainer(container), 'utf8');
}

function leseSektion(root) {
  if (!fs.existsSync(mddaPath(root))) return undefined;
  return JSON.parse(fs.readFileSync(mddaPath(root), 'utf8')).settings.database;
}

// Die Umgebung eines Vorgangs: Bereich, Bereichs-Konfiguration, eine
// Sperr-Verwaltung mit beherrschbarer Uhr, Herkunft und Lebend-Prüfung.
function umgebung(abweichung = {}) {
  const root = makeRoot();
  const cfg = areaConfig();
  const zustand = { jetztMs: START_MS, rechner: 'SC-026', benutzer: 'anna', lebendig: new Set() };
  const verwaltungsNaehte = {
    leseKonfig: (p) => cfg.readAreaDatabaseConfig(p),
    uhr: () => zustand.jetztMs,
    herkunft: () => ({ benutzer: zustand.benutzer, rechner: zustand.rechner }),
    prozess: { pid: EIGENE_PID, lebt: (pid) => zustand.lebendig.has(pid) },
  };
  const verwaltung = erzeugeSperrVerwaltung(verwaltungsNaehte);
  const deps = {
    verwaltung,
    leseKonfig: (p) => cfg.readAreaDatabaseConfig(p),
    schreibeKonfig: (p, config, optionen) => cfg.writeAreaDatabaseConfig(p, config, optionen),
    ...abweichung,
  };
  return { root, cfg, zustand, verwaltung, verwaltungsNaehte, deps };
}

function ordnerPfad(root, name) {
  return path.join(root, name);
}

// Eine Sperr-Datei von Hand, im Ordner unter dem gegebenen Namen.
function legeSperreHin(root, ordner, felder = {}) {
  const inhalt = {
    schemaVersion: 1,
    art: DATENSATZ.art,
    tabelle: DATENSATZ.tabelle,
    benutzer: 'bert',
    rechner: 'SC-027',
    zeitpunkt: new Date(START_MS - 60 * 1000).toISOString().slice(0, 19) + 'Z',
    marke: 'fremdfremdfremd0',
    pid: FREMDE_PID,
    ...felder,
  };
  const ziel = path.join(root, ordner, sperrDateiName(root, DATENSATZ).name);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, `${JSON.stringify(inhalt, null, 2)}\n`, 'utf8');
  return ziel;
}

// --- N1: Eine Sperr-Verwaltung je Prozess ------------------------------------------------

describe('Die Sperr-Verwaltung entsteht im Produkt-Code an genau einer Stelle (4T-001795, N1)', () => {
  it('wird allein an der Verdrahtungs-Stelle des Haupt-Prozesses erzeugt', () => {
    // Das Eigen-Register der Verwaltung traegt nur, solange es im Prozess genau
    // eines gibt: Eine zweite Instanz hielte ein eigenes, leeres Register und
    // beurteilte die eigenen Sperren der ersten als fremde. Ein zweiter Aufruf
    // waere damit kein Stil-Verstoss, sondern eine stille Fehlfunktion.
    expect(ERZEUGUNGS_STELLEN).toEqual(['src/main/app/wiring.js']);
  });
});

// --- N2: lebende Sperren -----------------------------------------------------------------

describe('Lebende Sperren kommen aus dem Lebenszyklus (4T-001795, N2)', () => {
  it('meldet eine frische fremde Sperre als lebend', async () => {
    const { root, verwaltung } = umgebung();
    legeSperreHin(root, DEFAULT_LOCK_FOLDER_NAME);

    const lebend = await verwaltung.lebendeSperren(root);

    expect(lebend.ok).toBe(true);
    expect(lebend.sperren).toHaveLength(1);
    expect(lebend.sperren[0].konflikt.benutzer).toBe('bert');
    expect(lebend.sperren[0].gegenstand.tabelle).toBe('kunden.md');
  });

  it('meldet eine abgelaufene fremde Sperre nicht als lebend', async () => {
    const { root, verwaltung, zustand } = umgebung();
    legeSperreHin(root, DEFAULT_LOCK_FOLDER_NAME);
    zustand.jetztMs = START_MS + VIER_STUNDEN_MS;

    expect((await verwaltung.lebendeSperren(root)).sperren).toEqual([]);
  });

  it('meldet den Absturz-Rest desselben Rechners nicht als lebend', async () => {
    const { root, verwaltung } = umgebung();
    // Derselbe Rechner, eine Prozess-Nummer, die nicht mehr laeuft.
    legeSperreHin(root, DEFAULT_LOCK_FOLDER_NAME, { rechner: 'SC-026', pid: 12345 });

    expect((await verwaltung.lebendeSperren(root)).sperren).toEqual([]);
  });

  it('meldet eine Sperre des eigenen Prozesses als lebend', async () => {
    const { root, verwaltung } = umgebung();
    const genommen = await verwaltung.nimm(root, DATENSATZ);
    expect(genommen.gehalten).toBe(true);

    const lebend = await verwaltung.lebendeSperren(root);
    expect(lebend.sperren).toHaveLength(1);
    expect(lebend.sperren[0].konflikt.eigenerProzess).toBe(true);
  });

  it('zaehlt bei unbekanntem Halter die Aenderungszeit der Datei', async () => {
    // «Halter unbekannt» ist lebend, bis die Aenderungszeit der Datei die Frist
    // ueberschreitet. Ohne die mitgelieferte Aenderungszeit bliebe eine Sperre
    // mit unbrauchbarem Inhalt ewig lebend und hielte jede Umbenennung auf.
    const { root, verwaltung, zustand } = umgebung();
    const pfad = path.join(root, DEFAULT_LOCK_FOLDER_NAME, sperrDateiName(root, DATENSATZ).name);
    fs.mkdirSync(path.dirname(pfad), { recursive: true });
    fs.writeFileSync(pfad, 'kein json', 'utf8');
    const geaendert = fs.statSync(pfad).mtimeMs;

    zustand.jetztMs = geaendert + VIER_STUNDEN_MS - 60 * 1000;
    expect((await verwaltung.lebendeSperren(root)).sperren).toHaveLength(1);

    zustand.jetztMs = geaendert + VIER_STUNDEN_MS;
    expect((await verwaltung.lebendeSperren(root)).sperren).toEqual([]);
  });

  it('meldet einen leeren Ordner und einen fehlenden Ordner als frei', async () => {
    const { root, verwaltung } = umgebung();
    expect((await verwaltung.lebendeSperren(root)).sperren).toEqual([]);
    fs.mkdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME));
    expect((await verwaltung.lebendeSperren(root)).sperren).toEqual([]);
  });
});

// --- AK6: die sechs Gültigkeits-Regeln, je Grund ein Fall --------------------------------

describe('Gültigkeits-Regel des Ordnernamens (4T-001795, AK6)', () => {
  it('weist den reservierten Gerätenamen mit eigenem Grund ab', () => {
    // Er scheiterte ohnehin an der Punkt-Regel; was der Anwender eintippt, ist
    // aber `CON`, und dann soll er den Grund erfahren, der seinen Namen
    // unbrauchbar macht, statt der bloßen Form-Vorgabe.
    for (const name of ['CON', 'con', 'NUL', 'com1', 'LPT9', 'aux.txt', 'PRN.log']) {
      expect(pruefeSperrOrdnerName(name), name).toEqual({
        ok: false,
        code: LOCK_FOLDER_NAME_CODES.reservierterName,
      });
    }
  });

  it('nimmt einen Punkt-Namen an, der einen Gerätenamen nur enthält', () => {
    // `.con` ist unter Windows anlegbar: Der Gerätename gilt für den Teil VOR
    // dem ersten Punkt, und der ist hier leer.
    expect(pruefeSperrOrdnerName('.con').ok).toBe(true);
    expect(pruefeSperrOrdnerName('.consulting').ok).toBe(true);
  });

  it.each([
    ['', LOCK_FOLDER_NAME_CODES.leer],
    [`.${'x'.repeat(MAX_LOCK_FOLDER_NAME_LENGTH)}`, LOCK_FOLDER_NAME_CODES.zuLang],
    ['CON', LOCK_FOLDER_NAME_CODES.reservierterName],
    ['sperren', LOCK_FOLDER_NAME_CODES.ohneFuehrendenPunkt],
    ['..', LOCK_FOLDER_NAME_CODES.nurPunkte],
    ['.sperren/tief', LOCK_FOLDER_NAME_CODES.pfadTrenner],
    ['.sperr:en', LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    ['.sperren.', LOCK_FOLDER_NAME_CODES.endeUnzulaessig],
  ])('weist %p im Vorgang mit dem Grund %s ab und rührt nichts an', async (name, code) => {
    const { root, deps } = umgebung();
    legeSperreHin(root, DEFAULT_LOCK_FOLDER_NAME);

    const ergebnis = await setzeSperrOrdnerName(root, name, deps);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(code);
    // Ein abgewiesener Name speichert nicht: weder Ordner noch Bereichsdatei.
    expect(fs.existsSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME))).toBe(true);
    expect(fs.existsSync(mddaPath(root))).toBe(false);
  });

  it('weist einen bereits vergebenen Namen als sechste Regel ab', async () => {
    const { root, deps } = umgebung();
    fs.mkdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME));
    fs.mkdirSync(ordnerPfad(root, '.belegt'));

    const ergebnis = await setzeSperrOrdnerName(root, '.belegt', deps);

    expect(ergebnis).toMatchObject({ ok: false, code: SPERR_ORDNER_CODES.belegt });
    expect(fs.existsSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME))).toBe(true);
  });

  it('weist auch eine Datei unter dem Namen ab', async () => {
    const { root, deps } = umgebung();
    fs.writeFileSync(ordnerPfad(root, '.belegt'), 'Notiz des Anwenders', 'utf8');

    const ergebnis = await setzeSperrOrdnerName(root, '.belegt', deps);

    expect(ergebnis.code).toBe(SPERR_ORDNER_CODES.belegt);
    expect(fs.readFileSync(ordnerPfad(root, '.belegt'), 'utf8')).toBe('Notiz des Anwenders');
  });
});

// --- AK7 bis AK9: die Umbenennung und ihr fester Ausgang ---------------------------------

describe('Die Umbenennung des Sperr-Ordners (4T-001795, AK7 bis AK9)', () => {
  it('benennt den bestehenden Ordner um, statt einen zweiten anzulegen (AK7)', async () => {
    const { root, deps } = umgebung();
    const sperre = legeSperreHin(root, DEFAULT_LOCK_FOLDER_NAME);
    const inhalt = fs.readFileSync(sperre, 'utf8');
    // Die Sperre ist abgelaufen und hält deshalb nicht auf.
    fs.utimesSync(sperre, new Date(0), new Date(0));

    const ergebnis = await setzeSperrOrdnerName(root, '.eigene-sperren', {
      ...deps,
      verwaltung: { lebendeSperren: async () => ({ ok: true, sperren: [] }) },
    });

    expect(ergebnis).toMatchObject({ ok: true, name: '.eigene-sperren', umbenannt: true });
    expect(fs.existsSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);
    const neu = ordnerPfad(root, '.eigene-sperren');
    expect(fs.readdirSync(neu)).toHaveLength(1);
    // Der Inhalt ist MITGEZOGEN und nicht neu entstanden.
    expect(fs.readFileSync(path.join(neu, fs.readdirSync(neu)[0]), 'utf8')).toBe(inhalt);
    expect(leseSektion(root)).toEqual({ lockFolderName: '.eigene-sperren' });
  });

  it('weist die Änderung bei einer lebenden Sperre ab und nennt den Halter (AK8)', async () => {
    const { root, deps } = umgebung();
    legeSperreHin(root, DEFAULT_LOCK_FOLDER_NAME);

    const ergebnis = await setzeSperrOrdnerName(root, '.eigene-sperren', deps);

    expect(ergebnis).toMatchObject({
      ok: false,
      code: SPERR_ORDNER_CODES.inArbeit,
      benutzer: 'bert',
      rechner: 'SC-027',
    });
    expect(fs.existsSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME))).toBe(true);
    expect(fs.existsSync(ordnerPfad(root, '.eigene-sperren'))).toBe(false);
    expect(fs.existsSync(mddaPath(root))).toBe(false);
  });

  it('schreibt die Angabe auch ohne bestehenden Ordner', async () => {
    // Vor der ersten Sperre gibt es den Ordner nicht; das ist der Normalfall
    // und kein Fehler.
    const { root, deps } = umgebung();

    const ergebnis = await setzeSperrOrdnerName(root, '.eigene-sperren', deps);

    expect(ergebnis).toMatchObject({ ok: true, umbenannt: false });
    expect(leseSektion(root)).toEqual({ lockFolderName: '.eigene-sperren' });
  });

  it('lässt bei endgültig gescheitertem Umbenennen beides auf dem alten Stand (AK9)', async () => {
    const { root, deps } = umgebung({
      benenneUm: async () => {
        const err = new Error('EPERM: kein Zugriff');
        err.code = 'EPERM';
        throw err;
      },
    });
    fs.mkdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME));

    const ergebnis = await setzeSperrOrdnerName(root, '.eigene-sperren', deps);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(SPERR_ORDNER_CODES.umbenennen);
    expect(fs.existsSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME))).toBe(true);
    expect(fs.existsSync(mddaPath(root))).toBe(false);
  });

  it('läuft über die Wiederhol-Schleife des gemeinsamen Schreibwegs (AK9)', async () => {
    // Auf einer Netz-Freigabe scheitert ein Umbenennen regelmäßig beim ersten
    // Versuch; ohne die Schleife wäre jede Umbenennung dort ein Glücksspiel.
    const versuche = [];
    const { root, deps } = umgebung({
      benenneUm: async (von, nach) => {
        versuche.push([path.basename(von), path.basename(nach)]);
      },
    });
    fs.mkdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME));

    await setzeSperrOrdnerName(root, '.eigene-sperren', deps);

    expect(versuche).toEqual([[DEFAULT_LOCK_FOLDER_NAME, '.eigene-sperren']]);
    const quelle = fs.readFileSync(
      path.join(ROOT, 'src', 'main', 'database', 'lock-folder-rename.js'),
      'utf8',
    );
    expect(quelle).toMatch(/benenneUmMitWiederholung/);
  });

  it('nimmt die Umbenennung zurück, wenn die Bereichsdatei nicht zu schreiben ist (AK9)', async () => {
    const { root, deps } = umgebung({
      schreibeKonfig: async () => ({ ok: false, error: 'mdda defekt: kaputt' }),
    });
    fs.mkdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME));
    fs.writeFileSync(path.join(root, DEFAULT_LOCK_FOLDER_NAME, 'merkmal.txt'), 'da', 'utf8');

    const ergebnis = await setzeSperrOrdnerName(root, '.eigene-sperren', deps);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(SPERR_ORDNER_CODES.umbenennen);
    // Ein halber Zustand entsteht nicht: Der Ordner heißt wieder wie vorher.
    expect(fs.existsSync(ordnerPfad(root, '.eigene-sperren'))).toBe(false);
    expect(fs.readdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME))).toEqual(['merkmal.txt']);
  });

  it('nennt beide Namen, wenn auch die Rücknahme scheitert', async () => {
    let erster = true;
    const { root, deps } = umgebung({
      schreibeKonfig: async () => ({ ok: false, error: 'mdda defekt: kaputt' }),
      benenneUm: async (von, nach) => {
        if (!erster) throw new Error('EBUSY: Ordner belegt');
        erster = false;
        fs.renameSync(von, nach);
      },
    });
    fs.mkdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME));

    const ergebnis = await setzeSperrOrdnerName(root, '.eigene-sperren', deps);

    expect(ergebnis).toMatchObject({
      ok: false,
      code: SPERR_ORDNER_CODES.ruecknahme,
      alt: DEFAULT_LOCK_FOLDER_NAME,
      neu: '.eigene-sperren',
    });
    expect(ergebnis.error).toContain(DEFAULT_LOCK_FOLDER_NAME);
    expect(ergebnis.error).toContain('.eigene-sperren');
  });

  it('nimmt denselben wirksamen Namen als Erfolg ohne Wirkung', async () => {
    const { root, deps } = umgebung();

    const ergebnis = await setzeSperrOrdnerName(root, DEFAULT_LOCK_FOLDER_NAME, deps);

    expect(ergebnis).toEqual({
      ok: true,
      name: DEFAULT_LOCK_FOLDER_NAME,
      geaendert: false,
      umbenannt: false,
    });
    expect(fs.existsSync(mddaPath(root))).toBe(false);
  });

  it('verlangt Leser, Schreiber und Verwaltung und bricht laut statt still', async () => {
    // Eine halbe Naht fiele sonst auf eine Vorgabe zurück, und der Vorgang
    // urteilte über einen anderen Bereich als den, den er umbenennt.
    const { root } = umgebung();
    await expect(setzeSperrOrdnerName(root, '.x', {})).rejects.toThrow(TypeError);
    await expect(
      setzeSperrOrdnerName(root, '.x', { leseKonfig: async () => undefined }),
    ).rejects.toThrow(TypeError);
    await expect(
      setzeSperrOrdnerName(root, '.x', {
        leseKonfig: async () => undefined,
        schreibeKonfig: async () => ({ ok: true }),
      }),
    ).rejects.toThrow(TypeError);
  });
});

// --- AK3 bis AK5: der Schreibweg der Angabe ----------------------------------------------

describe('Der Schreibweg der Angabe (4T-001795, AK3 bis AK5, Bauplan N4)', () => {
  it('nimmt den Namen nur über den dritten Parameter entgegen', async () => {
    const root = makeRoot();
    const cfg = areaConfig();

    await cfg.writeAreaDatabaseConfig(root, {
      overviewOnOpen: true,
      lockFolderName: '.untergeschoben',
    });
    expect(leseSektion(root)).toEqual({ overviewOnOpen: true });

    await cfg.writeAreaDatabaseConfig(
      root,
      { overviewOnOpen: true },
      { sperrOrdnerName: '.eigene-sperren' },
    );
    expect(leseSektion(root)).toEqual({
      overviewOnOpen: true,
      lockFolderName: '.eigene-sperren',
    });
  });

  it('entfernt die Angabe beim Vorgabe-Namen, statt ein leeres Feld zu hinterlassen (AK4)', async () => {
    const root = makeRoot();
    const cfg = areaConfig();
    schreibeSektion(root, { overviewOnOpen: true, lockFolderName: '.eigene-sperren' });

    await cfg.writeAreaDatabaseConfig(
      root,
      { overviewOnOpen: true },
      { sperrOrdnerName: DEFAULT_LOCK_FOLDER_NAME },
    );

    expect(leseSektion(root)).toEqual({ overviewOnOpen: true });
    expect(normalisiereDatenbankKonfig(leseSektion(root)).lockFolderName).toBe(
      DEFAULT_LOCK_FOLDER_NAME,
    );
  });

  it('entfernt die ganze Sektion, wenn nach dem Vorgabe-Namen nichts bleibt (AK4)', async () => {
    const root = makeRoot();
    const cfg = areaConfig();
    schreibeSektion(root, { lockFolderName: '.eigene-sperren' });

    await cfg.writeAreaDatabaseConfig(
      root,
      { overviewOnOpen: false },
      { sperrOrdnerName: DEFAULT_LOCK_FOLDER_NAME },
    );

    expect(leseSektion(root)).toBeUndefined();
  });

  it('überschreibt eine defekte Bereichsdatei nie und meldet den Fehlschlag (AK5)', async () => {
    const { root, deps } = umgebung();
    fs.writeFileSync(mddaPath(root), '{ kein json', 'utf8');

    const ergebnis = await setzeSperrOrdnerName(root, '.eigene-sperren', deps);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toContain('mdda defekt');
    expect(fs.readFileSync(mddaPath(root), 'utf8')).toBe('{ kein json');
  });

  it('lässt fremde Angaben der Sektion und fremde Sektionen unberührt', async () => {
    const { root, deps } = umgebung();
    const container = mddStore.emptySettingsContainer();
    container.settings.startPage = 'Start.md';
    container.settings.database = { overviewOnOpen: true };
    fs.writeFileSync(mddaPath(root), mddStore.serializeContainer(container), 'utf8');

    expect((await setzeSperrOrdnerName(root, '.eigene-sperren', deps)).ok).toBe(true);

    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.startPage).toBe('Start.md');
    expect(roh.settings.database).toEqual({
      overviewOnOpen: true,
      lockFolderName: '.eigene-sperren',
    });
  });
});

// --- AK3: der Kanal ----------------------------------------------------------------------

describe('Der Kanal area:setDatabaseConfig (4T-001795, AK3, Bauplan N5)', () => {
  function registriere(root, cfg, verwaltung) {
    const kanaele = new Map();
    const bezogen = [];
    registerAreasIpc((kanal, fn) => kanaele.set(kanal, fn), {
      senderWindow: () => ({}),
      areaOfWindow: () => (root === null ? null : { rootPath: root, name: 'Bereich' }),
      workspacesState: [],
      setWorkspacesState: () => {},
      workspacesChanged: () => {},
      readAreaDatabaseConfig: (p) => cfg.readAreaDatabaseConfig(p),
      writeAreaDatabaseConfig: (p, config, optionen) =>
        cfg.writeAreaDatabaseConfig(p, config, optionen),
      normalisiereDatenbankKonfig,
      sperrOrdnerNeuBeziehen: async (p) => bezogen.push(p),
      sperrVerwaltung: verwaltung,
    });
    return {
      setzen: kanaele.get('area:setDatabaseConfig'),
      holen: kanaele.get('area:getDatabaseConfig'),
      bezogen,
    };
  }

  it('benennt um, schreibt beide Angaben und lässt den Watcher nachziehen', async () => {
    const { root, cfg, verwaltung } = umgebung();
    fs.mkdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME));
    const { setzen, holen, bezogen } = registriere(root, cfg, verwaltung);

    const ergebnis = await setzen({}, { overviewOnOpen: true, lockFolderName: '.eigene-sperren' });

    expect(ergebnis).toEqual({ ok: true });
    expect(fs.existsSync(ordnerPfad(root, '.eigene-sperren'))).toBe(true);
    expect(leseSektion(root)).toEqual({
      overviewOnOpen: true,
      lockFolderName: '.eigene-sperren',
    });
    expect(bezogen).toEqual([root]);
    // Derselbe Kanal liefert den wirksamen Namen auch wieder zurück.
    expect(await holen({})).toEqual({
      hasArea: true,
      overviewOnOpen: true,
      lockFolderName: '.eigene-sperren',
    });
  });

  it('schreibt nichts, wenn die Umbenennung abgewiesen wird', async () => {
    const { root, cfg, verwaltung } = umgebung();
    legeSperreHin(root, DEFAULT_LOCK_FOLDER_NAME);
    const { setzen, bezogen } = registriere(root, cfg, verwaltung);

    const ergebnis = await setzen({}, { overviewOnOpen: true, lockFolderName: '.eigene-sperren' });

    expect(ergebnis).toMatchObject({ ok: false, code: SPERR_ORDNER_CODES.inArbeit });
    // Weder der Anzeige-Schalter noch der Name: Die Änderung gilt als Ganzes
    // oder gar nicht.
    expect(fs.existsSync(mddaPath(root))).toBe(false);
    expect(bezogen).toEqual([]);
  });

  it('rührt den Ordner nicht an, wenn der Name unverändert mitgeschickt wird', async () => {
    // Die Oberfläche schickt den Namen bei jedem Anwenden mit; ein Umschalten
    // der Anzeige darf deshalb keine Umbenennung auslösen.
    const { root, cfg, verwaltung } = umgebung();
    fs.mkdirSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME));
    const { setzen } = registriere(root, cfg, verwaltung);

    const ergebnis = await setzen(
      {},
      { overviewOnOpen: true, lockFolderName: DEFAULT_LOCK_FOLDER_NAME },
    );

    expect(ergebnis).toEqual({ ok: true });
    expect(fs.existsSync(ordnerPfad(root, DEFAULT_LOCK_FOLDER_NAME))).toBe(true);
    expect(leseSektion(root)).toEqual({ overviewOnOpen: true });
  });

  it('gibt den Grund einer unzulässigen Eingabe sprachneutral zurück', async () => {
    const { root, cfg, verwaltung } = umgebung();
    const { setzen } = registriere(root, cfg, verwaltung);

    const ergebnis = await setzen({}, { overviewOnOpen: false, lockFolderName: 'sperren' });

    expect(ergebnis).toMatchObject({
      ok: false,
      code: LOCK_FOLDER_NAME_CODES.ohneFuehrendenPunkt,
    });
    expect(typeof ergebnis.error).toBe('string');
  });
});
