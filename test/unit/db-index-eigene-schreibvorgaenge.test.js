// 4T-002545 (Epic 3E-000368, Nachtrag zu E3): Der Index auf dem Stand der
// eigenen Schreibvorgänge — `trageDateienNach` in src/main/index/build.js über
// die Fassade `backlinks.trageDateienNach`, `invalidiereSofort` in
// src/main/index/store.js und der Schreib-Stand der Datenbank-Schritte
// (src/main/workflows/workflow-db-schreibstand.js).
//
// **Am echten Index:** Der Bereich wird über den Bedarfs-Weg aufgebaut (Muster
// `datensatz-verweis-aufloesung.test.js` und `index-rundruf.test.js`), danach
// wird sein Datei-Beobachter geschlossen. So kann allein der Nachtrag den Index
// fortschreiben, und kein Fall hängt an einer Uhr: Ohne Nachtrag fände die
// Anzeige-Form den neuen Stand nie. Geschrieben wird über die ECHTE
// Schreib-Schnittstelle der Datenbank; die spätere Meldung des Beobachters wird
// über seinen Rückruf `onWatcherChange` nachgestellt.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backlinks = require('../../src/main/backlinks.js');
const store = require('../../src/main/index/store.js');
const { onWatcherChange } = require('../../src/main/index/build.js');
const { vergissAlleDefinitionen } = require('../../src/main/index/datensatz-erfassung.js');
const { zwischenspeicherLeeren } = require('../../src/main/index/datensatz-zugriff.js');
const { loeseDatensatzVerweis } = require('../../src/main/index/datensatz-verweis-aufloesung.js');
const { erzeugeSchreibSchnittstelle } = require('../../src/main/database/record-auftrag.js');
const { erzeugeSperrVerwaltung } = require('../../src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = require('../../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = require('../../src/main/database/intent-recovery.js');
const { verschiebeInPapierkorb } = require('../../src/main/documents/papierkorb.js');
const { createWorkflowDbSteps } = require('../../src/main/workflows/workflow-db-steps.js');
const { createDbSchreibStand } = require('../../src/main/workflows/workflow-db-schreibstand.js');

const BESITZER = 'eigene-schreibvorgaenge';
const SCHRITT_BESITZER = '7:database';
let wurzeln = [];
let verwaltungen = [];

afterEach(async () => {
  for (const v of verwaltungen) await v.gibAllesFrei();
  verwaltungen = [];
  vergissAlleDefinitionen();
  zwischenspeicherLeeren();
  vi.useFakeTimers();
  for (const w of wurzeln) {
    backlinks.releaseRoot(w, BESITZER);
    backlinks.releaseRoot(w, SCHRITT_BESITZER);
  }
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  for (const w of wurzeln) {
    try {
      fs.rmSync(w, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows hält die Datei manchmal noch */
    }
  }
  wurzeln = [];
});

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '    - name: pages',
  '      type: number',
  '  display: title',
  '  lastId: 1',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Solaris',
  '| 224',
  '```',
  '',
].join('\n');

const AUTOREN = [
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: name',
  '    - name: ort',
  '  key: name',
  '  lastId: 1',
  '---',
  '',
].join('\n');

const ADA = ['---', 'db-record: r-00001', 'name: Ada', 'ort: London', '---', ''].join('\n');

function lege(wurzel, relativ, text) {
  const pfad = path.join(wurzel, ...relativ.split('/'));
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

// Ein Bereich mit echtem, bereitem Index ohne Datei-Beobachter.
async function bereich() {
  const wurzel = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-eigene-')));
  wurzeln.push(wurzel);
  const library = lege(wurzel, 'Daten/Library.md', LIBRARY);
  const autoren = lege(wurzel, 'Autoren/Autoren.md', AUTOREN);
  const ada = lege(wurzel, 'Autoren/Ada.md', ADA);
  const notiz = lege(wurzel, 'Notiz.md', '# Notiz\n');
  let stand = backlinks.backlinksFor(notiz, BESITZER, wurzel);
  for (let i = 0; i < 500 && stand.status === 'indexing'; i++) {
    await new Promise((r) => setTimeout(r, 10));
    stand = backlinks.backlinksFor(notiz, BESITZER, wurzel);
  }
  expect(stand.status).toBe('ready');
  const entry = store.indexes.get(wurzel);
  if (entry.watcher) await entry.watcher.close();
  entry.watcher = null;
  return { wurzel, library, autoren, ada, entry };
}

// Die echte Schnittstelle; der Papierkorb verschiebt in einen Punkt-Ordner.
function schnittstelle(b) {
  const korb = path.join(b.wurzel, '.papierkorb-attrappe');
  fs.mkdirSync(korb, { recursive: true });
  const papierkorb = (pfad) =>
    verschiebeInPapierkorb(pfad, {
      trashItem: async (ziel) => fs.renameSync(ziel, path.join(korb, path.basename(ziel))),
    });
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig: async () => undefined });
  verwaltungen.push(sperrVerwaltung);
  const leseKonfig = async () => undefined;
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig, papierkorb });
  const s = erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
      laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
      papierkorb,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-11-10T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    warteAbstaende: [],
  });
  return { schnittstelle: s, sperrVerwaltung };
}

const anzeige = (b, kopf, name) => loeseDatensatzVerweis(b.entry, kopf, name);

describe('trageDateienNach: der Index auf dem Stand eigener Schreibvorgänge (4T-002545)', () => {
  it('ohne Nachtrag kennt der Index den neuen Datensatz nicht, danach sofort und genau einmal', async () => {
    const b = await bereich();
    const { schnittstelle: s } = schnittstelle(b);
    const neu = await s.fuehreAuftragAus(b.wurzel, {
      anweisungen: [
        { tabelle: 'Daten/Library.md', art: 'create', werte: { title: 'Probe-Buch', pages: '1' } },
      ],
    });
    expect(neu.ok).toBe(true);
    // Der Beobachter ist geschlossen: Ohne Nachtrag bleibt der Index beim alten Stand.
    expect(anzeige(b, b.library, 'Probe-Buch').status).toBe('keiner');

    const vorher = store.indexStand(b.wurzel);
    expect(backlinks.trageDateienNach(b.wurzel, [b.library])).toBe(true);
    // Die Invalidierung ist sofort gesendet, nicht erst nach dem Debounce.
    expect(store.indexStand(b.wurzel)).toBe(vorher + 1);
    expect(anzeige(b, b.library, 'Probe-Buch')).toEqual({
      status: 'anzeige',
      kennung: 'r-00002',
      treffers: ['r-00002'],
    });

    // Anzeige-Form ändern: sofort über die neue gefunden, über die alte nicht mehr.
    const umbenannt = await s.fuehreAuftragAus(b.wurzel, {
      anweisungen: [
        {
          tabelle: 'Daten/Library.md',
          art: 'update',
          id: 'r-00002',
          erwartet: { title: 'Probe-Buch', pages: '1' },
          werte: { title: 'Neues Buch' },
        },
      ],
    });
    expect(umbenannt.ok).toBe(true);
    expect(backlinks.trageDateienNach(b.wurzel, [b.library])).toBe(true);
    expect(anzeige(b, b.library, 'Neues Buch')).toMatchObject({
      status: 'anzeige',
      kennung: 'r-00002',
    });
    expect(anzeige(b, b.library, 'Probe-Buch').status).toBe('keiner');

    // Die spätere Meldung des Beobachters ändert nichts: kein doppelter Eintrag.
    const dateien = b.entry.files.size;
    onWatcherChange(b.entry, b.library, 'change');
    expect(b.entry.files.size).toBe(dateien);
    expect(anzeige(b, b.library, 'Neues Buch')).toEqual({
      status: 'anzeige',
      kennung: 'r-00002',
      treffers: ['r-00002'],
    });
    expect(anzeige(b, b.library, 'Solaris')).toEqual({
      status: 'anzeige',
      kennung: 'r-00001',
      treffers: ['r-00001'],
    });
    expect(anzeige(b, b.library, 'Probe-Buch').status).toBe('keiner');
  });

  it('trägt eine neue Karteikarte ein und eine fortgegangene aus', async () => {
    const b = await bereich();
    const { schnittstelle: s } = schnittstelle(b);
    const neu = await s.fuehreAuftragAus(b.wurzel, {
      anweisungen: [
        {
          tabelle: 'Autoren/Autoren.md',
          art: 'create',
          werte: { name: 'Alan', ort: 'Wilmslow' },
          karteikarte: { name: 'Alan' },
        },
      ],
    });
    expect(neu.ok).toBe(true);
    const alan = path.join(b.wurzel, 'Autoren', 'Alan.md');
    expect(anzeige(b, b.autoren, 'Alan').status).toBe('keiner');
    expect(backlinks.trageDateienNach(b.wurzel, [alan])).toBe(true);
    expect(anzeige(b, b.autoren, 'Alan')).toMatchObject({ status: 'anzeige', kennung: 'r-00002' });

    const fort = await s.fuehreAuftragAus(b.wurzel, {
      anweisungen: [
        {
          tabelle: 'Autoren/Autoren.md',
          art: 'delete',
          id: 'r-00001',
          erwartet: { name: 'Ada', ort: 'London' },
        },
      ],
    });
    expect(fort.ok).toBe(true);
    expect(fs.existsSync(b.ada)).toBe(false);
    expect(anzeige(b, b.autoren, 'Ada').status).toBe('anzeige');
    expect(backlinks.trageDateienNach(b.wurzel, [b.ada])).toBe(true);
    expect(anzeige(b, b.autoren, 'Ada').status).toBe('keiner');
    // Die spätere Meldung des Beobachters findet nichts mehr auszutragen.
    onWatcherChange(b.entry, b.ada, 'unlink');
    expect(anzeige(b, b.autoren, 'Alan')).toMatchObject({ status: 'anzeige', kennung: 'r-00002' });
  });

  it('meldet einen nicht bereiten Index und trägt dann nichts nach', async () => {
    const b = await bereich();
    expect(backlinks.trageDateienNach(path.join(b.wurzel, 'Gibt-es-nicht'), [b.library])).toBe(
      false,
    );
  });
});

describe('Schreib-Schritte im selben Lauf über die Anzeige-Form (4T-002545, Nachtrag E3)', () => {
  it('db-create, unmittelbar danach db-update und db-delete über die Anzeige-Form', async () => {
    const b = await bereich();
    const { schnittstelle: s, sperrVerwaltung } = schnittstelle(b);
    const schreibStand = createDbSchreibStand({ backlinks });
    const modul = createWorkflowDbSteps({
      schreibSchnittstelle: s,
      sperrVerwaltung,
      datenbankAktiv: () => true,
      backlinks,
      fsp,
      schreibStand,
    });
    const ctx = { root: b.wurzel, event: { sender: { id: 7 } } };
    const schritt = (keyword, args, werte) => ({
      line: 3,
      blockLine: 1,
      keyword,
      args,
      source: null,
      position: null,
      ...(werte ? { pairs: Object.entries(werte).map(([key, value]) => ({ key, value })) } : {}),
    });

    const neu = await modul.runDbStep(
      ctx,
      schritt('db-create', ['Library'], { title: 'Probe-Buch', pages: '120' }),
    );
    expect(neu).toMatchObject({ ok: true, record: 'r-00002' });
    expect(schreibStand.offen(b.wurzel)).toEqual([b.library]);

    const geaendert = await modul.runDbStep(
      ctx,
      schritt('db-update', ['Library', 'Probe-Buch'], { title: 'Neues Buch', pages: '130' }),
    );
    expect(geaendert).toMatchObject({ ok: true, record: 'r-00002' });
    const alt = await modul.runDbStep(ctx, schritt('db-delete', ['Library', 'Probe-Buch']));
    expect(alt).toMatchObject({ ok: false, code: 'dbRecordUnknown' });
    const weg = await modul.runDbStep(ctx, schritt('db-delete', ['Library', 'Neues Buch']));
    expect(weg).toMatchObject({ ok: true, record: 'r-00002' });
    const text = fs.readFileSync(b.library, 'utf8');
    expect(text).not.toContain('r-00002');
    expect(text).toContain('| Solaris');
  });
});
