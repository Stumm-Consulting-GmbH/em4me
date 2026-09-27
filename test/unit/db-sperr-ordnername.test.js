// 4T-001787 (Epic 3E-000255, E9): Der Name des Sperr-Ordners — Gültigkeits-Regel
// (AK11), wirksamer Name aus der Bereichs-Konfiguration (AK10 bis AK12) und die
// Zusicherung, dass eine gesetzte Angabe das Zurückschreiben der übrigen
// Angaben überlebt.
//
// **Warum der Überlebens-Fall hier der tragende ist.** Die heutige
// Einstellungs-Oberfläche schickt beim Speichern **allein** den Anzeige-Schalter;
// der Schreibweg bildet die Sektion daraus neu. Ohne eine ausdrückliche
// Bewahrung setzte damit jedes Umschalten der Anzeige den Ordnernamen zurück —
// und die laufenden Sperren lägen in einem Ordner, den danach niemand mehr
// sucht. Ein Prüffall, der nur Lesen und Schreiben derselben Angabe misst, sähe
// das nicht; deshalb schreibt der Fall hier **ohne** die Angabe zurück und misst
// danach.
//
// Gearbeitet wird an echten Temp-Verzeichnissen (Muster
// area-database-config.test.js), weil der Gegenstand die reale Serialisierung
// des Containers einschließt.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_LOCK_FOLDER_NAME,
  LOCK_FOLDER_NAME_CODES,
  MAX_LOCK_FOLDER_NAME_LENGTH,
  pruefeSperrOrdnerName,
  wirksamerSperrOrdnerName,
} from '../../src/shared/database/lock-folder-name.js';
import { createAreaConfig, normalisiereDatenbankKonfig } from '../../src/main/area/area-config.js';
import mddStore from '../../src/main/documents/mdd-store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Bestands-Lesungen im Modulkopf, nicht im Prüffall (test/README).
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const FRAGMENTE = SPRACHEN.map((code) => ({
  code,
  pfad: `src/i18n/fragments/${code}/database.json`,
  schluessel: Object.keys(
    JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'fragments', code, 'database.json'), 'utf8'),
    ),
  ),
}));
const NEUE_MODULE = [
  'src/shared/database/lock-folder-name.js',
  'src/main/database/lock-store.js',
  'src/main/area/area-watch-ignore.js',
].map((rel) => ({
  rel,
  quelle: fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8'),
}));

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-sperrname-'));
  tmpDirs.push(dir);
  return dir;
}

function makeConfig() {
  return createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: vi.fn(),
    mddStore,
    attachmentPath: {},
    resolveTemplatesConfig: () => ({}),
  });
}

function mddaPath(root) {
  return path.join(root, mddStore.MDDA_FILENAME);
}

// Eine Bereichsdatei mit einer von Hand gesetzten Angabe: Den Schreibweg dafür
// gibt es hier noch nicht (er gehört zu 4T-001795), und der Aufbau eines
// Prüffalls darf ohnehin nicht denselben Weg nehmen wie die Prüfung.
function schreibeSektion(root, sektion) {
  const container = mddStore.emptySettingsContainer();
  container.settings.database = sektion;
  fs.writeFileSync(mddaPath(root), mddStore.serializeContainer(container), 'utf8');
}

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

// --- Die Gültigkeits-Regel ------------------------------------------------------------

describe('Gültigkeits-Regel des Sperr-Ordner-Namens (4T-001787, AK11)', () => {
  it('nimmt den Vorgabe-Namen und gewöhnliche Punkt-Namen an', () => {
    expect(pruefeSperrOrdnerName(DEFAULT_LOCK_FOLDER_NAME)).toEqual({
      ok: true,
      name: '.area-locks',
    });
    expect(pruefeSperrOrdnerName('.sperren')).toEqual({ ok: true, name: '.sperren' });
    expect(pruefeSperrOrdnerName('.Sperren_2024')).toEqual({ ok: true, name: '.Sperren_2024' });
  });

  // Je Abweisungs-Code ein Fall: Ein Sammel-Fall über «irgendetwas wird
  // abgewiesen» bliebe grün, wenn zwei Regeln denselben Grund meldeten.
  it.each([
    ['', LOCK_FOLDER_NAME_CODES.leer],
    [undefined, LOCK_FOLDER_NAME_CODES.leer],
    [null, LOCK_FOLDER_NAME_CODES.leer],
    [42, LOCK_FOLDER_NAME_CODES.leer],
    [`.${'x'.repeat(MAX_LOCK_FOLDER_NAME_LENGTH)}`, LOCK_FOLDER_NAME_CODES.zuLang],
    ['sperren', LOCK_FOLDER_NAME_CODES.ohneFuehrendenPunkt],
    [' .sperren', LOCK_FOLDER_NAME_CODES.ohneFuehrendenPunkt],
    ['.', LOCK_FOLDER_NAME_CODES.nurPunkte],
    ['..', LOCK_FOLDER_NAME_CODES.nurPunkte],
    ['.sperren/tief', LOCK_FOLDER_NAME_CODES.pfadTrenner],
    ['.sperren\\tief', LOCK_FOLDER_NAME_CODES.pfadTrenner],
    ['.sperr:en', LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    ['.sperr*en', LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    ['.sperr?en', LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    ['.sperr"en', LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    ['.sperr|en', LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    ['.sperr<en', LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    ['.sperr>en', LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    // Steuerzeichen aus seinem Code-Punkt gebaut: Ein Escape in der Quelle
    // schreibt Prettier zum unsichtbaren Zeichen um, und das wäre selbst ein
    // Verstoß gegen die Quelltext-Regel (Entwicklungsrichtlinien, Kapitel 2).
    [`.sperr${String.fromCharCode(7)}en`, LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    [`.sperr${String.fromCharCode(0)}en`, LOCK_FOLDER_NAME_CODES.verbotenesZeichen],
    ['.sperren.', LOCK_FOLDER_NAME_CODES.endeUnzulaessig],
    ['.sperren ', LOCK_FOLDER_NAME_CODES.endeUnzulaessig],
  ])('weist %p mit dem Code %s ab', (eingabe, code) => {
    expect(pruefeSperrOrdnerName(eingabe)).toEqual({ ok: false, code });
  });

  it('hält die Längen-Grenze genau ein', () => {
    const gerade = `.${'x'.repeat(MAX_LOCK_FOLDER_NAME_LENGTH - 1)}`;
    expect(gerade.length).toBe(MAX_LOCK_FOLDER_NAME_LENGTH);
    expect(pruefeSperrOrdnerName(gerade).ok).toBe(true);
  });

  it('gibt bei jeder Abweisung die Vorgabe als wirksamen Namen zurück', () => {
    expect(wirksamerSperrOrdnerName('.eigen')).toBe('.eigen');
    for (const unbrauchbar of ['', 'sperren', '.', '.a/b', '.a:b', '.a ', undefined, {}]) {
      expect(wirksamerSperrOrdnerName(unbrauchbar)).toBe(DEFAULT_LOCK_FOLDER_NAME);
    }
  });
});

// --- Der wirksame Stand der Bereichs-Konfiguration -------------------------------------

describe('Wirksamer Name aus der Datenbank-Sektion (4T-001787, AK10 bis AK12)', () => {
  it('nimmt eine gesetzte gültige Angabe', () => {
    expect(normalisiereDatenbankKonfig({ lockFolderName: '.eigene-sperren' })).toEqual({
      overviewOnOpen: false,
      lockFolderName: '.eigene-sperren',
    });
  });

  it.each([
    ['fehlend', {}],
    ['leer', { lockFolderName: '' }],
    ['falscher Typ', { lockFolderName: 17 }],
    ['ohne führenden Punkt', { lockFolderName: 'sperren' }],
    ['mit Pfad-Trenner', { lockFolderName: '.a/b' }],
  ])('fällt bei %s auf die Vorgabe zurück', (_lage, sektion) => {
    expect(normalisiereDatenbankKonfig(sektion).lockFolderName).toBe(DEFAULT_LOCK_FOLDER_NAME);
  });

  it('liest eine gesetzte Angabe aus der Bereichsdatei zurück', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    schreibeSektion(root, { lockFolderName: '.eigene-sperren' });

    const roh = await cfg.readAreaDatabaseConfig(root);
    expect(normalisiereDatenbankKonfig(roh).lockFolderName).toBe('.eigene-sperren');
  });

  it('führt eine fehlende und eine defekte Bereichsdatei auf die Vorgabe (AK12)', async () => {
    const ohne = makeRoot();
    const defekt = makeRoot();
    const cfg = makeConfig();
    fs.writeFileSync(mddaPath(defekt), '{ kein json', 'utf8');

    for (const root of [ohne, defekt]) {
      const roh = await cfg.readAreaDatabaseConfig(root);
      expect(roh).toBeUndefined();
      expect(normalisiereDatenbankKonfig(roh).lockFolderName).toBe(DEFAULT_LOCK_FOLDER_NAME);
    }
  });
});

// --- Der Schreibweg der heutigen Oberfläche --------------------------------------------

describe('Der gesetzte Ordnername überlebt den Schreibweg (4T-001787)', () => {
  it('bewahrt die Angabe, wenn die Oberfläche nur den Anzeige-Schalter schickt', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    schreibeSektion(root, { lockFolderName: '.eigene-sperren' });

    // Genau das, was applyDatabaseSection heute sendet: ein Objekt mit einem
    // einzigen Feld.
    expect(await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: true })).toEqual({ ok: true });

    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.database).toEqual({
      overviewOnOpen: true,
      lockFolderName: '.eigene-sperren',
    });
  });

  it('bewahrt die Angabe auch beim Ausschalten, statt die Sektion zu entfernen', async () => {
    const root = makeRoot();
    const cfg = makeConfig();
    schreibeSektion(root, { overviewOnOpen: true, lockFolderName: '.eigene-sperren' });

    await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: false });

    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.database).toEqual({ lockFolderName: '.eigene-sperren' });
  });

  it('schreibt den wirksamen Vorgabe-Namen nicht als Angabe in die Bereichsdatei', async () => {
    const root = makeRoot();
    const cfg = makeConfig();

    await cfg.writeAreaDatabaseConfig(root, { overviewOnOpen: true });

    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.database).toEqual({ overviewOnOpen: true });
    expect('lockFolderName' in roh.settings.database).toBe(false);
  });

  it('nimmt einen Ordnernamen über diesen Weg nicht entgegen', async () => {
    const root = makeRoot();
    const cfg = makeConfig();

    // Der Bedienweg zum SETZEN entsteht in 4T-001795. Solange er fehlt, darf
    // dieser Kanal keinen Namen annehmen — sonst entstünde ein zweiter
    // Schreibweg neben dem geplanten.
    await cfg.writeAreaDatabaseConfig(root, {
      overviewOnOpen: true,
      lockFolderName: '.untergeschoben',
    });

    const roh = JSON.parse(fs.readFileSync(mddaPath(root), 'utf8'));
    expect(roh.settings.database).toEqual({ overviewOnOpen: true });
  });
});

// --- AK16: ohne Oberfläche und ohne Sprach-Schlüssel ----------------------------------

describe('Der Sperr-Speicher kommt ohne Oberfläche aus (4T-001787, AK16)', () => {
  // 4T-001795 (Epic 3E-000255): Der Fall hat seine Aussage gewechselt, weil
  // seine Voraussetzung planmäßig entfallen ist. AK16 von 4T-001787 sagte,
  // **jener** Vorgang bringe keine Oberfläche mit, und der Bedienweg entstehe
  // erst hier; dieser Vorgang bringt ihn. Ein Fall, der weiterhin die
  // Abwesenheit jedes Sprach-Schlüssels behauptete, hielte damit nicht mehr
  // eine Zusage fest, sondern einen überholten Zwischenstand.
  //
  // Was bleibt, ist die Zusage dahinter: Die Sprach-Schlüssel zum Sperr-Ordner
  // gehören **einer** Familie am Bedienort und stehen in allen fünf Fassungen.
  // Ein Schlüssel daneben wäre ein zweiter Bedienweg, und einer, der nur auf
  // Deutsch steht, erschiene den übrigen vier Sprachen roh.
  //
  // 4T-001825 (Epic 3E-000254): Die Lage-Texte der Schreib-Schnittstelle
  // (`database.auftrag.<Code>`) tragen den Lage-Code wörtlich im Schlüssel, und
  // ein Code nennt die nicht erlangte Sperre. Sie sind kein Bedienweg zum
  // Sperr-Ordner, sondern die Antwort auf einen Auftrag; die Familie bleibt
  // deshalb außerhalb dieser Zusage.
  //
  // 4T-001941 (Epic 3E-000257): Die Texte der Sperre in der Einzel-Maske
  // (`database.sperre.<Name>`, Konflikt-Block mit Halter, Frist und den Wegen
  // «nur lesen» und «Sperre brechen») nennen die Sperre am Datensatz, nicht den
  // Sperr-Ordner; sie sind die Antwort der Maske auf eine belegte Sperre und
  // kein zweiter Bedienweg zum Ordnernamen. Gefunden vom Gate «alle» nach dem
  // Rebase-Lauf 4 des Zuges 3E-000314 (2026-09-25); die Einzel-Läufe des Epics
  // hatten diesen Wächter nicht mitgefahren.
  it('führt Schlüssel zum Sperr-Ordner nur als eine Familie und in allen fünf Fassungen', () => {
    const familie = 'settings.database.lockFolder';
    const lageTexte = 'database.auftrag.';
    const maskenSperre = 'database.sperre.';
    const fremde = [];
    const jeSprache = new Map();
    for (const fragment of FRAGMENTE) {
      const eigene = [];
      for (const schluessel of fragment.schluessel) {
        if (!/lock|sperr/i.test(schluessel)) continue;
        if (schluessel.startsWith(lageTexte)) continue;
        if (schluessel.startsWith(maskenSperre)) continue;
        if (schluessel.startsWith(familie)) eigene.push(schluessel);
        else fremde.push(`${fragment.pfad}: ${schluessel}`);
      }
      jeSprache.set(fragment.code, eigene.sort());
    }
    expect(fremde).toEqual([]);
    const deutsch = jeSprache.get('de');
    expect(deutsch.length).toBeGreaterThan(0);
    for (const [code, schluessel] of jeSprache) {
      expect(schluessel, `Sprachfassung ${code}`).toEqual(deutsch);
    }
  });

  it('bindet in den neuen Modulen keine Übersetzung und keinen nutzer-sichtbaren Text ein', () => {
    const treffer = [];
    for (const modul of NEUE_MODULE) {
      if (/require\([^)]*i18n/.test(modul.quelle)) treffer.push(`${modul.rel}: i18n-Import`);
      if (/\bt\(['"]/.test(modul.quelle)) treffer.push(`${modul.rel}: Übersetzungs-Aufruf`);
    }
    expect(treffer).toEqual([]);
  });
});
