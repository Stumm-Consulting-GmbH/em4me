// 4T-002333 (Epic 3E-000264, T3): Der Kanal `database:verweisZiel` und seine
// Brücke — führt ein Verweis `[[Tabelle#^…]]` beim Klick in die Maske?
//
// Gemessen wird am echten Handler über die echte Registrier-Funktion (Muster
// `db-datensaetze-kanal.test.js`). Die Sicht ist der echte Index eines
// Temp-Bereichs (Aufbau wie `datensatz-verweis.test.js`), hereingereicht über
// eine Attrappe der Index-Fassade, damit jeder Fall die Absperrung allein misst.
// Die Auflösung selbst prüft `datensatz-verweis-aufloesung.test.js`; hier steht
// die Frage, ob der Kanal sie unverfälscht, fail-closed und am Platten-Stand
// durchreicht.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import { backlinksFor, releaseRoot, rootForActiveFile } from '../../src/main/backlinks.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { zwischenspeicherLeeren } = require_('../../src/main/index/datensatz-zugriff.js');

// --- Aufbau ------------------------------------------------------------------------------

const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);

const TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Kürzel',
  '    - name: Titel',
  '  key: Kürzel',
  '  display: Titel',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| B-1',
  '| Solaris',
  '|- id="r-00002"',
  '| B-2',
  '| Dune',
  '|- id="r-00003"',
  '| B-3',
  '| Dune',
  '```',
  '',
].join('\n');

const openRoots = new Set();
let tmpDirs = [];

afterEach(() => {
  vergissAlleDefinitionen();
  zwischenspeicherLeeren();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

function lege(wurzel, name, text) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

// Ein Bereich mit der Tabelle «Library» und einer Notiz, Index bereit.
async function bereich(tabellenText = TABELLE) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-verweisziel-kanal-'));
  tmpDirs.push(wurzel);
  const kopf = lege(wurzel, 'Library.md', tabellenText);
  const notiz = lege(wurzel, 'Notiz.md', 'Siehe [[Library#^r-1]].');
  let r = backlinksFor(notiz);
  openRoots.add(rootForActiveFile(notiz));
  for (let i = 0; i < 500 && r.status === 'indexing'; i++) {
    await new Promise((fertig) => setTimeout(fertig, 10));
    r = backlinksFor(notiz);
  }
  return { wurzel, kopf, notiz, sicht: indexes.get(rootForActiveFile(notiz)) };
}

function registriere({ sicht = null, datenbankAktiv = () => true, ohneTor = false } = {}) {
  const kanaele = new Map();
  const backlinks = {
    ensureIndexForDemand: vi.fn(),
    datenbankSicht: vi.fn(() =>
      sicht
        ? { status: 'ready', meta: null, sicht }
        : { status: 'indexing', meta: null, sicht: null },
    ),
    bufferTextFor: () => null,
  };
  const deps = {
    areaRootForEvent: (event) => (event && event.wurzel) || null,
    backlinks,
    isMarkdownPath,
    schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
  };
  if (!ohneTor) deps.datenbankAktiv = datenbankAktiv;
  registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), deps);
  return { kanal: kanaele.get('database:verweisZiel'), backlinks };
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

// --- Registrierung und Brücke ------------------------------------------------------------

describe('database:verweisZiel: Registrierung und Brücke (4T-002333, T3)', () => {
  it('registriert den Kanal', () => {
    expect(typeof registriere().kanal).toBe('function');
  });

  it('bindet die Brücke an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = { zielPfad: 'C:/x/Library.md', anker: 'r-1' };
    expect(await bruecke.databaseVerweisZiel(params)).toEqual({ name: 'database:verweisZiel' });
    expect(invoke).toHaveBeenCalledWith('database:verweisZiel', params);
    expect(invoke.mock.calls[0][1]).toBe(params);
  });
});

// --- Treffer -----------------------------------------------------------------------------

describe('database:verweisZiel: Ziel eines Datensatz-Verweises (4T-002333, AK1, AK3)', () => {
  it('liefert Kopf-Datei und aufgefüllte Kennung über die Kennung, lang und kurz', async () => {
    const { wurzel, kopf, sicht } = await bereich();
    const { kanal, backlinks } = registriere({ sicht });
    const ziel = { tabelle: kopf, kennung: 'r-00001' };
    expect(await kanal(ereignis(wurzel), { zielPfad: kopf, anker: 'r-00001' })).toEqual(ziel);
    expect(await kanal(ereignis(wurzel), { zielPfad: kopf, anker: 'r-1' })).toEqual(ziel);
    // Am Platten-Stand wie die Gültigkeit, mit Index-Anstoß des sendenden Fensters.
    expect(backlinks.datenbankSicht).toHaveBeenCalledWith(kopf, wurzel, { ohnePuffer: true });
    expect(backlinks.ensureIndexForDemand).toHaveBeenCalledWith(kopf, '1:database', wurzel);
  });

  it('liefert das Ziel über die Anzeige-Form', async () => {
    const { wurzel, kopf, sicht } = await bereich();
    const { kanal } = registriere({ sicht });
    expect(await kanal(ereignis(wurzel), { zielPfad: kopf, anker: 'Solaris' })).toEqual({
      tabelle: kopf,
      kennung: 'r-00001',
    });
  });

  it('lässt einer Überschrift gleicher Anker-Form den Vortritt, ohne sie gilt der Name', async () => {
    // Im fertigen Link ist das `^` entfernt; der Kanal sieht `Solaris` auch für
    // den Überschriften-Anker `[[Library#Solaris]]`.
    const mitUeberschrift = TABELLE.replace('---\n\n```', '---\n\n# Solaris\n\n```');
    expect(mitUeberschrift).toContain('# Solaris');
    const a = await bereich(mitUeberschrift);
    const kanalA = registriere({ sicht: a.sicht }).kanal;
    expect(await kanalA(ereignis(a.wurzel), { zielPfad: a.kopf, anker: 'Solaris' })).toBeNull();
    // Die Kennung desselben Datensatzes führt weiterhin in die Maske.
    expect(await kanalA(ereignis(a.wurzel), { zielPfad: a.kopf, anker: 'r-1' })).toEqual({
      tabelle: a.kopf,
      kennung: 'r-00001',
    });
    const b = await bereich();
    const kanalB = registriere({ sicht: b.sicht }).kanal;
    expect(await kanalB(ereignis(b.wurzel), { zielPfad: b.kopf, anker: 'Solaris' })).toEqual({
      tabelle: b.kopf,
      kennung: 'r-00001',
    });
  });

  it('nimmt einen Pfad relativ zur Bereichs-Wurzel wie die Nachbar-Kanäle', async () => {
    const { wurzel, kopf, sicht } = await bereich();
    const { kanal } = registriere({ sicht });
    expect(await kanal(ereignis(wurzel), { zielPfad: 'Library.md', anker: 'r-1' })).toEqual({
      tabelle: kopf,
      kennung: 'r-00001',
    });
  });
});

// --- Kein Ziel ---------------------------------------------------------------------------

describe('database:verweisZiel: null für den bisherigen Weg (4T-002333, AK4, AK6)', () => {
  it('bei einer Prosa-Datei, einem mehrdeutigen Namen und einem unbekannten Anker', async () => {
    const { wurzel, kopf, notiz, sicht } = await bereich();
    const { kanal } = registriere({ sicht });
    expect(await kanal(ereignis(wurzel), { zielPfad: notiz, anker: 'r-1' })).toBeNull();
    expect(await kanal(ereignis(wurzel), { zielPfad: kopf, anker: 'Dune' })).toBeNull();
    expect(await kanal(ereignis(wurzel), { zielPfad: kopf, anker: 'r-9' })).toBeNull();
  });

  it('bei geschlossenem und bei fehlendem Tor, ohne die Sicht zu fragen', async () => {
    const { wurzel, kopf, sicht } = await bereich();
    for (const optionen of [
      { sicht, datenbankAktiv: () => false },
      { sicht, ohneTor: true },
    ]) {
      const { kanal, backlinks } = registriere(optionen);
      expect(await kanal(ereignis(wurzel), { zielPfad: kopf, anker: 'r-1' })).toBeNull();
      expect(backlinks.datenbankSicht).not.toHaveBeenCalled();
      expect(backlinks.ensureIndexForDemand).not.toHaveBeenCalled();
    }
  });

  it('bei unbrauchbarer Form, ohne Bereich, außerhalb des Bereichs und ohne Markdown-Endung', async () => {
    const { wurzel, kopf, sicht } = await bereich();
    const { kanal, backlinks } = registriere({ sicht });
    for (const params of [
      undefined,
      null,
      'Library.md',
      [],
      {},
      { zielPfad: kopf },
      { anker: 'r-1' },
      { zielPfad: '', anker: 'r-1' },
      { zielPfad: kopf, anker: '' },
      { zielPfad: kopf, anker: 42 },
      { zielPfad: path.join(wurzel, '..', 'fremd', 'Library.md'), anker: 'r-1' },
      { zielPfad: path.join(wurzel, 'Library.txt'), anker: 'r-1' },
    ]) {
      expect(await kanal(ereignis(wurzel), params), JSON.stringify(params)).toBeNull();
    }
    expect(await kanal({ sender: { id: 1 } }, { zielPfad: kopf, anker: 'r-1' })).toBeNull();
    expect(backlinks.datenbankSicht).not.toHaveBeenCalled();
  });

  it('solange der Index nicht bereit ist', async () => {
    const { wurzel, kopf } = await bereich();
    const { kanal } = registriere({ sicht: null });
    expect(await kanal(ereignis(wurzel), { zielPfad: kopf, anker: 'r-1' })).toBeNull();
  });
});
