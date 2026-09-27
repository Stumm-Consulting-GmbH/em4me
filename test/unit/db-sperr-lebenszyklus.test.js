// 4T-001788 (Epic 3E-000255, E9): Der Lebenszyklus der Datensatz-Sperre —
// nehmen und freigeben (AK1, AK2), die Konflikt-Auskunft (AK3), der eigene
// Absturz-Rest (AK4), die Frist und der Bruch (AK5, AK6), die Rücknahme beim
// geordneten Nehmen (AK8), das Anzeigen ohne Sperre (AK9) und die Abwesenheit
// jedes Taktes (AK10).
//
// **Nicht hier:** das Ablösen samt Bruch-Anspruch (L6, L6a). Es steht in
// `db-sperr-abloesen.test.js`, weil es mit dem Anspruch eine eigene
// Fachlichkeit samt eigenem Aufbau geworden ist und diese Datei sonst ihr
// Größen-Budget risse.
//
// **Gearbeitet wird an echten Temp-Verzeichnissen**, weil der Gegenstand das
// exklusive Anlegen und das Umbenennen des Dateisystems IST. Eine Attrappe des
// Dateisystems entschiede selbst, wann sie EEXIST meldet, und damit wäre gerade
// die Eigenschaft nicht gemessen, auf der die ganze Sperre ruht.
//
// **Fremde Sperren entstehen von Hand und nicht über die geprüfte Funktion.**
// Der Aufbau eines Prüffalls darf nicht den Weg nehmen, den der Fall prüft
// (test/README): Eine mit `nimm` angelegte «fremde» Sperre stünde im
// Eigen-Register und wäre damit gerade nicht fremd.
//
// **Uhr, Prozess und Zufall sind Nähte**, damit die Frist ohne Wartezeit und die
// Lebend-Prüfung ohne echten Absturz messbar ist. Die **Vorgabe** der
// Lebend-Prüfung wird eigens an einem gestarteten und beendeten Kindprozess
// gemessen; eine Attrappe prüfte dort die Attrappe.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  LEBEN_CODES,
  SPERR_FRIST_MS,
  VORGABE_PROZESS,
  WEG_BRECHEN,
  WEG_LESEN,
  erzeugeSperrVerwaltung,
} from '../../src/main/database/lock-lifecycle.js';
import {
  ART_CHANGE_LOG,
  ART_DATENSATZ,
  ART_DEFINITION,
  ART_SWEEP,
  SPERR_CODES,
  listeSperren,
  sperrDateiName,
  standVon,
} from '../../src/main/database/lock-store.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';
import { baueRecordFence } from '../../src/shared/database/record-block.js';
import { DB_TABLE_KEY } from '../../src/shared/database/table-definition.js';
import { DB_DATABASE_KEY } from '../../src/shared/database/database-steckbrief.js';
import { schreibeBeleg } from '../../src/main/database/change-log.js';
import { AUFRAEUM_ZEITLIMIT, PROZESS_ZEITLIMIT } from '../zeitlimits.js';

// Die Lebend-Prüfung wird an einem echten Kindprozess gemessen; die Datei trägt
// deshalb das datei-weite Zeitlimit für Prozess-Starts.
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT, hookTimeout: AUFRAEUM_ZEITLIMIT });

const require = createRequire(import.meta.url);
const { registerDatabaseIpc } = require('../../src/main/ipc/database.js');

// --- Bestands-Lesungen im Modulkopf, nicht im Prüffall (test/README) ---------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function quelltext(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

const NEUE_MODULE = [
  'src/main/database/lock-lifecycle.js',
  'src/shared/database/lock-order.js',
  'src/main/database/lock-store.js',
  // 4T-001788 (L6a): Das Ablösen ist mit dem Bruch-Anspruch in ein eigenes
  // Modul gewandert und gehört damit ebenso unter den Takt-Wächter.
  'src/main/database/lock-replace.js',
].map((rel) => ({ rel, quelle: quelltext(rel) }));

// Die lesenden Wege der Datenbank im Haupt-Prozess: die Kanäle der Oberfläche,
// der Katalog samt seinem Kopf-Leser, der Bestands-Aufbau des Index und der
// lesende Zugriff auf Datensätze.
//
// 4T-001825: Das Kanal-Modul trägt seither auch die beiden Schreib-Kanäle der
// Schreib-Schnittstelle. Es bleibt in dieser Liste, weil die Zusage unverändert
// gilt: Sperren nimmt allein die Schnittstelle hinter ihrer Naht, und kein
// Kanal-Modul bindet die Sperr-Verwaltung selbst ein.
const LESENDE_MODULE = [
  'src/main/ipc/database.js',
  'src/main/database/table-catalog.js',
  'src/main/database/frontmatter-kopf.js',
  'src/main/index/datenbank-bestand.js',
  'src/main/index/datensatz-zugriff.js',
].map((rel) => ({ rel, quelle: quelltext(rel) }));

// Gesucht wird in `main` und `shared`; im Renderer hätte die Frist ohnehin
// nichts zu suchen, und sein gebündeltes Erzeugnis wäre nur Lese-Last.
function jsDateien(verzeichnis) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...jsDateien(voll));
    else if (eintrag.name.endsWith('.js')) gefunden.push(voll);
  }
  return gefunden;
}

const FRIST_STELLEN = ['src/main', 'src/shared']
  .flatMap((teil) => jsDateien(path.join(ROOT, ...teil.split('/'))))
  .filter((voll) => /SPERR_FRIST/.test(fs.readFileSync(voll, 'utf8')))
  .map((voll) => path.relative(ROOT, voll).split(path.sep).join('/'));

// --- Aufbau ------------------------------------------------------------------------------

const EIGENE_PID = 4711;
const FREMDE_PID = 9999;
const START_MS = Date.parse('2026-09-19T08:00:00Z');

const DATENSATZ = { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00042' };
const DEFINITION = { art: ART_DEFINITION, tabelle: 'Kunden.md' };

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-sperrleben-'));
  tmpDirs.push(wurzel);
  fs.writeFileSync(path.join(wurzel, 'Kunden.md'), '# Kunden\n', 'utf8');
  return wurzel;
}

// Ein Bereich samt Verwaltung und den Stellschrauben Uhr, Rechner und
// Lebend-Prüfung. `abweichung` darf eine Funktion sein, die den Wurzelpfad
// bekommt — Nähte wie `benenneUm` brauchen ihn.
function umgebung(abweichung = {}) {
  const wurzel = bereich();
  const zustand = { jetztMs: START_MS, rechner: 'SC-026', benutzer: 'anna', lebendig: new Set() };
  let zaehler = 0;
  const deps = {
    leseKonfig: async () => undefined,
    jetzt: () => `${new Date(zustand.jetztMs).toISOString().slice(0, 19)}Z`,
    herkunft: () => ({ benutzer: zustand.benutzer, rechner: zustand.rechner }),
    uhr: () => zustand.jetztMs,
    prozess: { pid: EIGENE_PID, lebt: (pid) => zustand.lebendig.has(pid) },
    zufall: () => `marke${(zaehler += 1)}`,
    ...(typeof abweichung === 'function' ? abweichung(wurzel) : abweichung),
  };
  return { wurzel, zustand, deps, verwaltung: erzeugeSperrVerwaltung(deps) };
}

function sperrPfad(wurzel, gegenstand) {
  return path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, sperrDateiName(wurzel, gegenstand).name);
}

// Eine fremde Sperre, von Hand geschrieben.
function fremdeSperre(wurzel, gegenstand, felder = {}) {
  const inhalt = {
    schemaVersion: 1,
    art: gegenstand.art,
    tabelle: gegenstand.tabelle,
    benutzer: 'bert',
    rechner: 'SC-027',
    zeitpunkt: '2026-09-19T07:30:00Z',
    marke: 'fremdfremdfremd0',
    pid: FREMDE_PID,
    ...felder,
  };
  return roheSperre(wurzel, gegenstand, `${JSON.stringify(inhalt, null, 2)}\n`);
}

function roheSperre(wurzel, gegenstand, text) {
  const pfad = sperrPfad(wurzel, gegenstand);
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return { pfad, text, stand: standVon(text) };
}

function inhaltVon(pfad) {
  return JSON.parse(fs.readFileSync(pfad, 'utf8'));
}

function dateienImOrdner(wurzel) {
  const ordner = path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
  return fs.existsSync(ordner) ? fs.readdirSync(ordner).sort() : [];
}

// Ein Dateisystem, dessen Zugriffe gezählt werden; die echten Funktionen laufen
// dabei durch (Muster db-change-verdichtung.test.js).
function beobachtet(abweichung = {}) {
  const sicht = {
    writeFile: fsp.writeFile,
    readFile: fsp.readFile,
    stat: fsp.stat,
    mkdir: fsp.mkdir,
    unlink: fsp.unlink,
    readdir: fsp.readdir,
    ...abweichung,
  };
  return {
    fsp: sicht,
    schreiben: vi.spyOn(sicht, 'writeFile'),
    lesen: vi.spyOn(sicht, 'readFile'),
    stattgeben: vi.spyOn(sicht, 'stat'),
  };
}

// --- AK1, AK2: nehmen und freigeben ------------------------------------------------------

describe('Sperre nehmen und freigeben (4T-001788, AK1, AK2)', () => {
  it('nimmt die Sperre eines Datensatzes und schreibt Marke und Prozess-Nummer hinein', async () => {
    const { wurzel, verwaltung } = umgebung();

    const genommen = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(genommen).toMatchObject({ ok: true, gehalten: true, uebernommen: false });
    expect(typeof genommen.stand).toBe('string');
    expect(inhaltVon(genommen.pfad)).toMatchObject({
      art: ART_DATENSATZ,
      id: 'r-00042',
      benutzer: 'anna',
      rechner: 'SC-026',
      pid: EIGENE_PID,
      marke: 'marke1',
    });
  });

  it.each([
    ['Datensatz', DATENSATZ],
    ['Tabellen-Definition', DEFINITION],
  ])('gibt die Sperre eines %s wieder frei', async (_lage, gegenstand) => {
    const { wurzel, verwaltung } = umgebung();
    const genommen = await verwaltung.nimm(wurzel, gegenstand);

    expect(await verwaltung.gibFrei(wurzel, gegenstand)).toMatchObject({
      ok: true,
      freigegeben: true,
      entfernt: true,
    });
    expect(fs.existsSync(genommen.pfad)).toBe(false);
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('kennt genau einen Weg aus der Bearbeitung: Speichern und Verwerfen rufen dieselbe Funktion', async () => {
    // Es gibt keinen dritten Weg heraus und deshalb keine zweite Funktion. Ein
    // `gibFreiNachVerwerfen` neben `gibFrei` wäre der Anfang zweier
    // Freigabe-Wege, die auseinanderlaufen.
    //
    // 4T-001795 (Epic 3E-000255): `lebendeSperren` ist hinzugekommen und gehört
    // ausdrücklich NICHT zu den Freigabe-Wegen; es gibt nichts frei und nimmt
    // nichts, sondern beantwortet die Frage, ob in einem Bereich gerade jemand
    // arbeitet. Es steht hier, weil die Einordnung «lebend» aus derselben
    // Mechanik kommen muss wie das Urteil über einen Nehm-Versuch.
    //
    // 4T-001820 (Epic 3E-000254, B2): `zaehlerSperreFuer` ist die zweite
    // Naht-Fabrik neben `belegSperreFuer` und ebenso wenig ein Freigabe-Weg.
    // Beide geben eine Funktion heraus, die eine fremde Arbeit UNTER einer
    // bestimmten Sperre ausführt und danach über `mitSperren` wieder freigibt;
    // ein eigener Freigabe-Weg entsteht dadurch nicht.
    //
    // 4T-001823 (Epic 3E-000254): `gibZurueck` ist der Rückweg des geordneten
    // Nehmens und gibt über `gibFrei` frei; ein eigener Freigabe-Weg entsteht
    // dadurch nicht. Exportiert für die Klammer des Absichts-Protokolls, die
    // `mitSperren` nicht benutzen kann, weil es auch nach der Marke freigäbe.
    const { verwaltung } = umgebung();

    expect(Object.keys(verwaltung).sort()).toEqual([
      'belegSperreFuer',
      'brich',
      'gehalteneSperren',
      'gibAllesFrei',
      'gibFrei',
      'gibZurueck',
      'lebendeSperren',
      'mitSperren',
      'nimm',
      'nimmGeordnet',
      'zaehlerSperreFuer',
    ]);
  });

  it('meldet die Freigabe einer nicht gehaltenen Sperre als folgenlos', async () => {
    const { wurzel, verwaltung } = umgebung();
    await verwaltung.nimm(wurzel, DATENSATZ);
    await verwaltung.gibFrei(wurzel, DATENSATZ);

    expect(await verwaltung.gibFrei(wurzel, DATENSATZ)).toMatchObject({
      ok: true,
      freigegeben: false,
      grund: LEBEN_CODES.nichtGehalten,
    });
  });

  it('nimmt ausschließlich über das exklusive Anlegen und sieht vorher nicht nach (AK2)', async () => {
    // Der tragende Fall: Ein Nachsehen mit anschließendem Schreiben wäre genau
    // der Wettlauf, gegen den die Sperre antritt. Gemessen wird deshalb, WELCHE
    // Zugriffe stattfinden, und nicht das Ergebnis.
    const sicht = beobachtet();
    const { wurzel, verwaltung } = umgebung({ fsp: sicht.fsp });

    expect((await verwaltung.nimm(wurzel, DATENSATZ)).gehalten).toBe(true);

    expect(sicht.lesen).not.toHaveBeenCalled();
    expect(sicht.stattgeben).not.toHaveBeenCalled();
    // Jeder Schreibvorgang trägt das exklusive Kennzeichen. Es sind zwei, weil
    // der Sperr-Ordner bei der ersten Sperre erst entsteht: Der erste Versuch
    // läuft ins Leere, danach wird der Ordner angelegt und derselbe exklusive
    // Aufruf wiederholt.
    expect(sicht.schreiben).toHaveBeenCalled();
    for (const aufruf of sicht.schreiben.mock.calls) {
      expect(aufruf[2]).toMatchObject({ flag: 'wx' });
    }
  });

  it('führt die gehaltenen Sperren und gibt sie gemeinsam wieder frei', async () => {
    const { wurzel, verwaltung } = umgebung();
    await verwaltung.nimm(wurzel, DATENSATZ);
    await verwaltung.nimm(wurzel, DEFINITION);

    expect(
      verwaltung
        .gehalteneSperren()
        .map((e) => e.gegenstand.art)
        .sort(),
    ).toEqual([ART_DEFINITION, ART_DATENSATZ]);

    const alle = await verwaltung.gibAllesFrei();
    expect(alle.ergebnisse.every((e) => e.freigegeben === true)).toBe(true);
    expect(dateienImOrdner(wurzel)).toEqual([]);
  });
});

// --- AK3, L4: die Konflikt-Auskunft ------------------------------------------------------

describe('Konflikt: wer hält, seit wann, und welche zwei Wege es gibt (4T-001788, AK3)', () => {
  it('nennt Benutzer, Rechner und Anlage-Zeitpunkt der haltenden Sperre', async () => {
    const { wurzel, verwaltung } = umgebung();
    // Der fremde Prozess lebt (die Lebend-Naht kennt ihn nicht als tot), und die
    // Sperre ist frisch.
    const fremd = fremdeSperre(wurzel, DATENSATZ);

    const versuch = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(versuch.gehalten).toBe(false);
    expect(versuch.konflikt).toEqual({
      benutzer: 'bert',
      rechner: 'SC-027',
      zeitpunkt: '2026-09-19T07:30:00Z',
      halterUnbekannt: false,
      eigenerProzess: false,
      abgelaufen: false,
      wege: [WEG_LESEN],
      stand: fremd.stand,
    });
    // Die bestehende Sperre bleibt Byte für Byte unberührt.
    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
  });

  it('meldet die zweite Nahme desselben Prozesses als eigenen Fall ohne Weg zum Bruch (L4)', async () => {
    // Das «zweite Fenster»: derselbe Rechner, dieselbe Prozess-Nummer — und
    // trotzdem KEIN Absturz-Rest, weil die Sperre im Eigen-Register steht.
    const { wurzel, verwaltung } = umgebung();
    const erste = await verwaltung.nimm(wurzel, DATENSATZ);

    const zweite = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(zweite.gehalten).toBe(false);
    expect(zweite.konflikt).toMatchObject({ eigenerProzess: true, wege: [WEG_LESEN] });
    // Unverändert dieselbe Sperre: Sie wurde nicht unter der Hand ersetzt.
    expect(zweite.konflikt.stand).toBe(erste.stand);
  });

  it('nennt einen unbrauchbaren Inhalt «Halter unbekannt» und behandelt ihn als fremd', async () => {
    const { wurzel, verwaltung } = umgebung();
    roheSperre(wurzel, DATENSATZ, '{ abgerissen');

    const versuch = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(versuch.gehalten).toBe(false);
    expect(versuch.konflikt).toMatchObject({
      halterUnbekannt: true,
      benutzer: null,
      rechner: null,
      zeitpunkt: null,
      eigenerProzess: false,
    });
  });
});

// --- AK4, L1: der eigene Absturz-Rest ----------------------------------------------------

describe('Absturz-Rest: derselbe Rechner UND ein toter Prozess (4T-001788, AK4, L1)', () => {
  it('übernimmt eine Sperre desselben Rechners ohne Rückfrage, wenn ihr Prozess tot ist', async () => {
    const { wurzel, verwaltung } = umgebung();
    const rest = fremdeSperre(wurzel, DATENSATZ, { rechner: 'SC-026', pid: 5000 });

    const genommen = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(genommen).toMatchObject({ ok: true, gehalten: true, uebernommen: true });
    expect(genommen.stand).not.toBe(rest.stand);
    expect(inhaltVon(genommen.pfad)).toMatchObject({ pid: EIGENE_PID, benutzer: 'anna' });
    // Kein Rest der abgelösten Datei bleibt liegen.
    expect(dateienImOrdner(wurzel)).toEqual([path.basename(genommen.pfad)]);
  });

  it('übernimmt nicht, wenn der genannte Prozess desselben Rechners noch lebt', async () => {
    // Das ist der Fall «zweite Instanz mit anderem Profil-Ordner» und der Fall
    // «zweiter angemeldeter Benutzer»: derselbe Rechnername, ein lebender
    // Halter. Eine stille Übernahme nähme ihm die Sperre unter der Hand weg.
    const { wurzel, zustand, verwaltung } = umgebung();
    const fremd = fremdeSperre(wurzel, DATENSATZ, { rechner: 'SC-026', pid: 5000 });
    zustand.lebendig.add(5000);

    const versuch = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(versuch.gehalten).toBe(false);
    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
  });

  it('übernimmt die eigene Prozess-Nummer, solange sie nicht im Eigen-Register steht', async () => {
    // Der Rest einer FRÜHEREN Sitzung dieses Programms: Die Nummer ist dieselbe,
    // aber diese Verwaltung hat die Sperre nie genommen.
    const { wurzel, verwaltung } = umgebung();
    fremdeSperre(wurzel, DATENSATZ, { rechner: 'SC-026', pid: EIGENE_PID });

    expect(await verwaltung.nimm(wurzel, DATENSATZ)).toMatchObject({
      gehalten: true,
      uebernommen: true,
    });
  });

  it.each([
    ['ein fremder Rechnername', { rechner: 'SC-027', pid: 5000 }],
    ['eine fehlende Prozess-Nummer', { rechner: 'SC-026', pid: undefined }],
    ['eine unbrauchbare Prozess-Nummer', { rechner: 'SC-026', pid: 'viertausend' }],
    ['ein fehlender Rechnername', { rechner: undefined, pid: 5000 }],
  ])('behandelt %s als fremd und übernimmt nicht', async (_lage, felder) => {
    const { wurzel, verwaltung } = umgebung();
    const fremd = fremdeSperre(wurzel, DATENSATZ, felder);

    expect((await verwaltung.nimm(wurzel, DATENSATZ)).gehalten).toBe(false);
    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
  });

  it('vergleicht den Rechnernamen ohne Groß-Kleinschreibung', async () => {
    // Windows meldet denselben Rechner je nach Quelle in verschiedener
    // Schreibweise; ein Vergleich Zeichen für Zeichen ließe den eigenen
    // Absturz-Rest als fremd stehen.
    const { wurzel, verwaltung } = umgebung();
    fremdeSperre(wurzel, DATENSATZ, { rechner: 'sc-026', pid: 5000 });

    expect((await verwaltung.nimm(wurzel, DATENSATZ)).uebernommen).toBe(true);
  });

  it('behandelt eine Sperre als fremd, wenn der eigene Rechnername nicht ermittelbar ist', async () => {
    const { wurzel, zustand, verwaltung } = umgebung();
    zustand.rechner = null;
    fremdeSperre(wurzel, DATENSATZ, { rechner: 'SC-026', pid: 5000 });

    expect((await verwaltung.nimm(wurzel, DATENSATZ)).gehalten).toBe(false);
  });

  it('meldet den Konflikt, wenn der Platz nach dem Ablösen sofort wieder belegt ist', async () => {
    // Keine Schleife: Wer nach dem Ablösen ein zweites Mal verliert, bekommt den
    // Konflikt. Ein Wiederholen wäre ein Kampf zweier Prozesse um denselben
    // Platz, und beide verlören.
    let dazwischen = null;
    const { wurzel, verwaltung } = umgebung((wurzelPfad) => ({
      benenneUm: async (von, nach) => {
        await fsp.rename(von, nach);
        dazwischen = fremdeSperre(wurzelPfad, DATENSATZ, { benutzer: 'clara' });
      },
    }));
    fremdeSperre(wurzel, DATENSATZ, { rechner: 'SC-026', pid: 5000 });

    const versuch = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(versuch.gehalten).toBe(false);
    expect(versuch.konflikt.benutzer).toBe('clara');
    expect(fs.readFileSync(dazwischen.pfad, 'utf8')).toBe(dazwischen.text);
  });
});

// --- AK5, AK6, L7: die Frist -------------------------------------------------------------

describe('Frist: vier Stunden, und niemand entfernt selbsttätig (4T-001788, AK5, AK6)', () => {
  it('beträgt vier Stunden und steht an genau einer Stelle im Code (AK6)', () => {
    expect(SPERR_FRIST_MS).toBe(4 * 60 * 60 * 1000);
    // 4T-001824 (Epic 3E-000254, B6): Der Wiederanlauf BENUTZT die Frist als das
    // Alter, ab dem ein unvollständiges Protokoll verworfen werden darf. Er
    // importiert sie und legt keinen zweiten Wert fest; festgelegt ist sie
    // weiterhin an genau einer Stelle.
    // 4T-001941 (Epic 3E-000257, B4): Die Sperr-Bedienung reicht die Frist als
    // Wert an die Maske weiter, die sie im Satz «Halter unbekannt» nennt; auch
    // sie importiert und legt nichts fest.
    expect(FRIST_STELLEN).toEqual([
      'src/main/database/intent-recovery.js',
      'src/main/database/lock-lifecycle.js',
      'src/main/database/sperre-bedienung.js',
    ]);
    expect(FRIST_STELLEN.filter((rel) => /const SPERR_FRIST_MS\s*=/.test(quelltext(rel)))).toEqual([
      'src/main/database/lock-lifecycle.js',
    ]);
    expect(quelltext('src/main/database/intent-recovery.js')).toMatch(
      /\{ SPERR_FRIST_MS, VORGABE_PROZESS \} = require\('\.\/lock-lifecycle\.js'\)/,
    );

    const quelle = NEUE_MODULE.find((m) => m.rel.endsWith('lock-lifecycle.js')).quelle;
    expect(quelle.match(/const SPERR_FRIST_MS =/g)).toHaveLength(1);
    // Und sie ist dort begründet, nicht bloß gesetzt.
    expect(quelle).toMatch(/Vier Stunden/);
    expect(quelle).toMatch(/Uhren-Abweichung/);
  });

  it.each([
    ['weit vor Ablauf', 60 * 1000, false],
    ['eine Millisekunde vor Ablauf', SPERR_FRIST_MS - 1, false],
    ['genau bei Ablauf', SPERR_FRIST_MS, true],
    ['lange nach Ablauf', SPERR_FRIST_MS * 3, true],
  ])('meldet eine fremde Sperre %s als abgelaufen=%s', async (_lage, alter, erwartet) => {
    const { wurzel, zustand, verwaltung } = umgebung();
    fremdeSperre(wurzel, DATENSATZ, { zeitpunkt: '2026-09-19T08:00:00Z' });
    zustand.jetztMs = START_MS + alter;

    const versuch = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(versuch.konflikt.abgelaufen).toBe(erwartet);
    expect(versuch.konflikt.wege).toEqual(erwartet ? [WEG_LESEN, WEG_BRECHEN] : [WEG_LESEN]);
  });

  it('entfernt eine abgelaufene fremde Sperre nie selbsttätig', async () => {
    const { wurzel, zustand, verwaltung } = umgebung();
    const fremd = fremdeSperre(wurzel, DATENSATZ, { zeitpunkt: '2026-09-19T08:00:00Z' });
    zustand.jetztMs = START_MS + SPERR_FRIST_MS * 5;

    await verwaltung.nimm(wurzel, DATENSATZ);

    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
    const liste = await listeSperren(wurzel, { leseKonfig: async () => undefined });
    expect(liste.sperren).toHaveLength(1);
  });

  it('zählt bei unbekanntem Halter die Änderungszeit der Sperr-Datei', async () => {
    // Fest gesetzt statt von der Uhr genommen: Ein Vergleich gegen die
    // Systemuhr ist unter Windows sporadisch falsch (test/README).
    const { wurzel, verwaltung } = umgebung();
    const rest = roheSperre(wurzel, DATENSATZ, '{ abgerissen');
    const alt = new Date(START_MS - SPERR_FRIST_MS);
    fs.utimesSync(rest.pfad, alt, alt);

    expect((await verwaltung.nimm(wurzel, DATENSATZ)).konflikt.abgelaufen).toBe(true);

    const frisch = new Date(START_MS - 1000);
    fs.utimesSync(rest.pfad, frisch, frisch);
    expect((await verwaltung.nimm(wurzel, DATENSATZ)).konflikt.abgelaufen).toBe(false);
  });

  it('gilt als nicht abgelaufen, wenn weder Zeitpunkt noch Änderungszeit zu haben sind', async () => {
    const sicht = beobachtet({
      stat: async () => {
        throw Object.assign(new Error('kein Zugriff'), { code: 'EACCES' });
      },
    });
    const { wurzel, zustand, verwaltung } = umgebung({ fsp: sicht.fsp });
    fremdeSperre(wurzel, DATENSATZ, { zeitpunkt: 'kein Zeitpunkt' });
    zustand.jetztMs = START_MS + SPERR_FRIST_MS * 10;

    const versuch = await verwaltung.nimm(wurzel, DATENSATZ);

    expect(versuch.konflikt.abgelaufen).toBe(false);
    expect(versuch.konflikt.wege).toEqual([WEG_LESEN]);
  });
});

// --- L7: der Bruch -----------------------------------------------------------------------

describe('Bruch: nur fremd, nur abgelaufen, nur auf demselben Stand (4T-001788, AK5)', () => {
  async function abgelaufeneLage() {
    const u = umgebung();
    const fremd = fremdeSperre(u.wurzel, DATENSATZ, { zeitpunkt: '2026-09-19T08:00:00Z' });
    u.zustand.jetztMs = START_MS + SPERR_FRIST_MS;
    return { ...u, fremd };
  }

  it('bricht eine abgelaufene fremde Sperre und hält sie danach selbst', async () => {
    const { wurzel, verwaltung, fremd } = await abgelaufeneLage();

    const gebrochen = await verwaltung.brich(wurzel, DATENSATZ, fremd.stand);

    expect(gebrochen).toMatchObject({ ok: true, gehalten: true, gebrochen: true });
    expect(inhaltVon(fremd.pfad)).toMatchObject({ benutzer: 'anna', pid: EIGENE_PID });
    expect(dateienImOrdner(wurzel)).toEqual([path.basename(fremd.pfad)]);
  });

  it('weist den Bruch vor Ablauf der Frist ab und lässt die Datei unberührt', async () => {
    const { wurzel, verwaltung } = umgebung();
    const fremd = fremdeSperre(wurzel, DATENSATZ, { zeitpunkt: '2026-09-19T08:00:00Z' });

    const versuch = await verwaltung.brich(wurzel, DATENSATZ, fremd.stand);

    expect(versuch).toMatchObject({ ok: true, gebrochen: false, grund: LEBEN_CODES.vorFrist });
    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
  });

  it('weist den Bruch bei abweichendem Stand ab und liefert die frische Auskunft', async () => {
    // Zwischen Anzeige und Klick ist eine neue Sperre entstanden. Der Stand ist
    // die Probe darauf, ob noch dieselbe Sperre dasteht, über die geurteilt
    // wurde.
    const { wurzel, verwaltung, fremd } = await abgelaufeneLage();
    const frisch = fremdeSperre(wurzel, DATENSATZ, {
      benutzer: 'clara',
      zeitpunkt: '2026-09-19T11:59:00Z',
    });

    const versuch = await verwaltung.brich(wurzel, DATENSATZ, fremd.stand);

    expect(versuch).toMatchObject({
      ok: true,
      gebrochen: false,
      grund: LEBEN_CODES.standAbweichend,
    });
    expect(versuch.konflikt.benutzer).toBe('clara');
    expect(fs.readFileSync(frisch.pfad, 'utf8')).toBe(frisch.text);
  });

  it('weist den Bruch einer Sperre des eigenen Prozesses ab', async () => {
    const { wurzel, zustand, verwaltung } = umgebung();
    const genommen = await verwaltung.nimm(wurzel, DATENSATZ);
    zustand.jetztMs = START_MS + SPERR_FRIST_MS * 2;

    expect(await verwaltung.brich(wurzel, DATENSATZ, genommen.stand)).toMatchObject({
      ok: true,
      gebrochen: false,
      grund: LEBEN_CODES.eigenerProzess,
    });
    expect(fs.existsSync(genommen.pfad)).toBe(true);
  });

  it.each([[undefined], [''], [42]])('verlangt den Stand und weist %p ab', async (stand) => {
    const { wurzel, verwaltung } = umgebung();
    fremdeSperre(wurzel, DATENSATZ);

    expect(await verwaltung.brich(wurzel, DATENSATZ, stand)).toMatchObject({
      ok: false,
      code: LEBEN_CODES.ohneStand,
    });
  });

  it('nimmt die Sperre gewöhnlich, wenn sie zwischen Urteil und Bruch verschwunden ist', async () => {
    const { wurzel, verwaltung } = umgebung();

    const ergebnis = await verwaltung.brich(wurzel, DATENSATZ, standVon('irgendein Stand'));

    expect(ergebnis).toMatchObject({ ok: true, gehalten: true, gebrochen: false });
  });
});

// --- L7: Freigeben einer verlorenen Sperre ----------------------------------------------

describe('Freigeben: nur das Eigene, und der Verlust wird gemeldet (4T-001788, AK1)', () => {
  it('entfernt eine fremde Sperre nie', async () => {
    const { wurzel, verwaltung } = umgebung();
    const fremd = fremdeSperre(wurzel, DATENSATZ);

    expect(await verwaltung.gibFrei(wurzel, DATENSATZ)).toMatchObject({
      ok: true,
      freigegeben: false,
      grund: LEBEN_CODES.nichtGehalten,
    });
    expect(fs.readFileSync(fremd.pfad, 'utf8')).toBe(fremd.text);
  });

  it('meldet eine inzwischen gebrochene eigene Sperre als verloren und rührt die Datei nicht an', async () => {
    const { wurzel, verwaltung } = umgebung();
    await verwaltung.nimm(wurzel, DATENSATZ);
    // Ein anderer hat gebrochen und hält jetzt selbst.
    const neuerHalter = fremdeSperre(wurzel, DATENSATZ, { benutzer: 'clara' });

    const frei = await verwaltung.gibFrei(wurzel, DATENSATZ);

    expect(frei).toMatchObject({ ok: true, freigegeben: false, verloren: true });
    expect(frei.konflikt.benutzer).toBe('clara');
    expect(fs.readFileSync(neuerHalter.pfad, 'utf8')).toBe(neuerHalter.text);
    // Der Register-Eintrag entfällt trotzdem: Gehalten wird sie nicht mehr.
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('meldet auch eine ganz verschwundene eigene Sperre als verloren, ohne Halter', async () => {
    const { wurzel, verwaltung } = umgebung();
    const genommen = await verwaltung.nimm(wurzel, DATENSATZ);
    // Ein anderer hat gebrochen und bereits wieder freigegeben.
    fs.unlinkSync(genommen.pfad);

    const frei = await verwaltung.gibFrei(wurzel, DATENSATZ);

    expect(frei).toMatchObject({ ok: true, freigegeben: false, verloren: true, konflikt: null });
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });
});

// --- AK7, AK8, L9: geordnetes Nehmen -----------------------------------------------------

describe('Geordnetes Nehmen und die Rücknahme bei einem Fehlschlag (4T-001788, AK8)', () => {
  const MEHRERE = [
    { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' },
    { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00007' },
    { art: ART_DEFINITION, tabelle: 'Kunden.md' },
    { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00002' },
  ];

  it('nimmt in der verbindlichen Ordnung: Definition, Datensätze, Beleg-Datei', async () => {
    const { wurzel, verwaltung } = umgebung();

    const ergebnis = await verwaltung.nimmGeordnet(wurzel, MEHRERE);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.genommen.map((g) => `${g.art}${g.id ? `-${g.id}` : ''}`)).toEqual([
      `${ART_DEFINITION}`,
      `${ART_DATENSATZ}-r-00002`,
      `${ART_DATENSATZ}-r-00007`,
      `${ART_CHANGE_LOG}`,
    ]);
    expect(dateienImOrdner(wurzel)).toHaveLength(4);
  });

  it('gibt bei einem Konflikt mittendrin alle bereits genommenen wieder frei (tragender Fall)', async () => {
    const { wurzel, verwaltung } = umgebung();
    // Die Sperre des mittleren Datensatzes hält ein anderer.
    const fremd = fremdeSperre(wurzel, { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00007' });

    const ergebnis = await verwaltung.nimmGeordnet(wurzel, MEHRERE);

    expect(ergebnis).toMatchObject({ ok: true, gehalten: false });
    expect(ergebnis.gegenstand).toMatchObject({ art: ART_DATENSATZ, id: 'r-00007' });
    expect(ergebnis.konflikt.benutzer).toBe('bert');
    // Es wirkt nichts: Im Ordner steht nur noch die fremde Sperre.
    expect(dateienImOrdner(wurzel)).toEqual([path.basename(fremd.pfad)]);
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('weist einen unbrauchbaren Gegenstand ab, bevor irgendeine Sperre entsteht', async () => {
    const { wurzel, verwaltung } = umgebung();

    const ergebnis = await verwaltung.nimmGeordnet(wurzel, [
      { art: ART_DEFINITION, tabelle: 'Kunden.md' },
      { art: 'segment', tabelle: 'Kunden.md' },
    ]);

    expect(ergebnis).toMatchObject({ ok: false, code: SPERR_CODES.gegenstand });
    expect(dateienImOrdner(wurzel)).toEqual([]);
  });

  it('gibt nach der Arbeit frei, auch wenn sie wirft', async () => {
    const { wurzel, verwaltung } = umgebung();

    await expect(
      verwaltung.mitSperren(wurzel, MEHRERE, async () => {
        expect(dateienImOrdner(wurzel)).toHaveLength(4);
        throw new Error('die Arbeit scheitert');
      }),
    ).rejects.toThrow('die Arbeit scheitert');

    expect(dateienImOrdner(wurzel)).toEqual([]);
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('führt die Arbeit gar nicht erst aus, wenn eine Sperre nicht zu bekommen ist', async () => {
    const { wurzel, verwaltung } = umgebung();
    fremdeSperre(wurzel, DEFINITION);
    const gelaufen = vi.fn(async () => 'getan');

    const ergebnis = await verwaltung.mitSperren(wurzel, MEHRERE, gelaufen);

    expect(ergebnis).toMatchObject({ ok: true, nichtGenommen: true });
    expect(ergebnis.konflikt.benutzer).toBe('bert');
    expect(gelaufen).not.toHaveBeenCalled();
  });
});

// --- 4T-001824: die Aufräum-Sperre im Lebenszyklus --------------------------------------

describe('Aufräum-Sperre: dieselben Regeln wie jede Sperre (4T-001824, B1, B2)', () => {
  const AUFRAEUMEN = { art: ART_SWEEP, id: 12 };

  it('wird genommen und freigegeben wie jede andere Art', async () => {
    const { wurzel, verwaltung } = umgebung();

    const genommen = await verwaltung.nimm(wurzel, AUFRAEUMEN);
    expect(genommen).toMatchObject({ ok: true, gehalten: true });
    expect(dateienImOrdner(wurzel)).toEqual(['s+12.lock']);
    expect(inhaltVon(genommen.pfad)).toMatchObject({ art: ART_SWEEP, id: '12', pid: EIGENE_PID });
    // Ein zweiter Versuch desselben Prozesses bekommt sie nicht.
    expect((await verwaltung.nimm(wurzel, AUFRAEUMEN)).konflikt.eigenerProzess).toBe(true);

    expect(await verwaltung.gibFrei(wurzel, AUFRAEUMEN)).toMatchObject({ freigegeben: true });
    expect(dateienImOrdner(wurzel)).toEqual([]);
  });

  it('übernimmt den Absturz-Rest desselben Rechners und bietet eine fremde erst nach der Frist zum Bruch an', async () => {
    const { wurzel, zustand, verwaltung } = umgebung();
    fremdeSperre(wurzel, AUFRAEUMEN, { tabelle: undefined, rechner: 'SC-026', pid: 5000 });

    expect(await verwaltung.nimm(wurzel, AUFRAEUMEN)).toMatchObject({
      gehalten: true,
      uebernommen: true,
    });
    await verwaltung.gibFrei(wurzel, AUFRAEUMEN);

    fremdeSperre(wurzel, AUFRAEUMEN, { tabelle: undefined });
    const frisch = await verwaltung.nimm(wurzel, AUFRAEUMEN);
    expect(frisch.konflikt).toMatchObject({ abgelaufen: false, wege: [WEG_LESEN] });
    zustand.jetztMs = Date.parse('2026-09-19T07:30:00Z') + SPERR_FRIST_MS;
    const spaet = await verwaltung.nimm(wurzel, AUFRAEUMEN);
    expect(spaet.konflikt).toMatchObject({ abgelaufen: true, wege: [WEG_LESEN, WEG_BRECHEN] });
    expect(await verwaltung.brich(wurzel, AUFRAEUMEN, spaet.konflikt.stand)).toMatchObject({
      gehalten: true,
      gebrochen: true,
    });
  });
});

// --- L1: die Vorgabe der Lebend-Prüfung an einem echten Prozess --------------------------

describe('Lebend-Prüfung: die Vorgabe an einem echten Kindprozess (4T-001788, L1)', () => {
  it('meldet einen laufenden Prozess als lebend und einen beendeten als tot', async () => {
    expect(VORGABE_PROZESS.pid).toBe(process.pid);
    expect(VORGABE_PROZESS.lebt(process.pid)).toBe(true);

    const kind = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      stdio: 'ignore',
    });
    await new Promise((fertig, scheitern) => {
      kind.once('spawn', fertig);
      kind.once('error', scheitern);
    });

    expect(VORGABE_PROZESS.lebt(kind.pid)).toBe(true);

    kind.kill();
    await new Promise((fertig) => kind.once('exit', fertig));

    expect(VORGABE_PROZESS.lebt(kind.pid)).toBe(false);
  });
});

// --- AK9, L12: Anzeigen sperrt nicht -----------------------------------------------------

describe('Anzeigen nimmt keine Sperre (4T-001788, AK9, L12)', () => {
  function datenbereich() {
    const wurzel = bereich();
    const tabelle = path.join(wurzel, 'Personen.md');
    const kopf = `---\n${DB_TABLE_KEY}:\n  fields:\n    - name: nachname\n      type: string\n---\n\n`;
    const saetze = baueRecordFence([
      { id: 'r-00001', cells: [{ text: 'Meier' }] },
      { id: 'r-00002', cells: [{ text: 'Schulz' }] },
    ]);
    fs.writeFileSync(tabelle, `${kopf}${saetze}\n`, 'utf8');
    const steckbrief = path.join(wurzel, 'Datenbank.md');
    fs.writeFileSync(
      steckbrief,
      `---\n${DB_DATABASE_KEY}:\n  name: Mini-CRM\n  schemaVersion: "1.0"\n---\n`,
      'utf8',
    );
    return { wurzel, tabelle, steckbrief };
  }

  function kanaele(wurzel, dateien) {
    const map = new Map();
    registerDatabaseIpc((kanal, fn) => map.set(kanal, fn), {
      areaRootForEvent: () => wurzel,
      backlinks: {
        ensureIndexForDemand: () => {},
        datenbankSicht: () => ({
          status: 'ready',
          meta: null,
          sicht: { dbKindsPerFile: new Map(dateien) },
        }),
        bufferTextFor: () => null,
      },
      isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
      // 4T-001825: Die Schreib-Schnittstelle ist bei der Registrierung Pflicht;
      // eine Attrappe genügt, weil hier allein die lesenden Kanäle laufen.
      schreibSchnittstelle: {
        fuehreAuftragAus: async () => ({}),
        eroeffneNeuanlage: async () => ({}),
      },
    });
    return map;
  }

  it('hinterlässt nach Überblick, Definition und Beleg-Ansicht keinen Sperr-Ordner', async () => {
    const { wurzel, tabelle, steckbrief } = datenbereich();
    await schreibeBeleg(tabelle, {
      art: 'create',
      id: 'r-00001',
      vorgang: '1',
      felder: [{ name: 'nachname', neu: 'Meier' }],
    });
    const map = kanaele(wurzel, [
      [tabelle, ['table']],
      [steckbrief, ['database']],
    ]);

    const ueberblick = await map.get('database:overview')({ sender: { id: 1 } }, {});
    const definition = await map.get('database:table')(
      { sender: { id: 1 } },
      { filePath: tabelle, tabelle: 'Personen' },
    );
    const belege = await map.get('database:changeLog')(
      {},
      { filePath: tabelle, recordId: 'r-00001' },
    );

    // Die drei Wege haben wirklich etwas gelesen — sonst wäre der Fall auch
    // dann grün, wenn sie gar nichts täten.
    expect(ueberblick.tabellen.length).toBeGreaterThan(0);
    expect(definition.gefunden).toBe(true);
    expect(belege.belege).toHaveLength(1);

    expect(fs.existsSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);
    const ordner = fs
      .readdirSync(wurzel, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(ordner).toEqual([]);
  });

  it('bindet die Sperr-Verwaltung in keinem lesenden Modul ein', () => {
    const treffer = LESENDE_MODULE.filter((m) => /lock-(lifecycle|store)/.test(m.quelle)).map(
      (m) => m.rel,
    );

    expect(treffer).toEqual([]);
  });

  it('bindet die Sperr-Verwaltung auch nicht in den Schreibweg der Belege ein', () => {
    // Die Verdichtung verlangt die Sperre als NAHT von außen (L10); sie holt
    // sie sich nicht selbst. Andernfalls hinge der Schreibweg der Belege am
    // Lebenszyklus, und die Naht wäre keine mehr.
    expect(quelltext('src/main/database/change-log.js')).not.toMatch(/lock-lifecycle/);
  });
});

// --- AK10, L11: kein Takt ----------------------------------------------------------------

describe('Kein Erneuerungs-Takt und kein Aufräum-Lauf (4T-001788, AK10, L11)', () => {
  // Gemessen wird der CODE und nicht die Prosa darüber: Die Kopf-Kommentare
  // nennen gerade das, was nicht entstehen soll, und ein Wächter, der darüber
  // stolperte, verböte die Begründung statt der Sache (Muster
  // db-change-verdichtung.test.js).
  function ohneKommentare(quelle) {
    return quelle
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((zeile) => (zeile.trimStart().startsWith('//') ? '' : zeile))
      .join('\n');
  }

  it.each(NEUE_MODULE.map((m) => [m.rel, m.quelle]))('führt in %s keinen Takt', (_rel, quelle) => {
    const code = ohneKommentare(quelle);
    for (const muster of [/setInterval/, /setTimeout/, /setImmediate/]) {
      expect(muster.test(code), String(muster)).toBe(false);
    }
  });

  it('meldet einen eingefügten Takt', () => {
    // Die Gegenprobe hält den Wächter ehrlich: Ein Wächter, der nichts findet,
    // weil sein Muster nicht greift, ist von einem sauberen Bestand nicht zu
    // unterscheiden.
    const verstoss = ohneKommentare('// setInterval steht hier nur im Text\nsetInterval(x, 1000);');

    expect(/setInterval/.test(verstoss)).toBe(true);
  });
});
