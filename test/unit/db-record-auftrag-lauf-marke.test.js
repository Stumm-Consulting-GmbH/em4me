// 4T-002545 (Epic 3E-000368, Story 4S-001196, AK4; Ausführungs-Entscheidung 5
// der Konzept-Runde 4T-002543): die Naht der Lauf-Marke an der
// Schreib-Schnittstelle der Datenbank (`fuehreAuftragAus(…, { vorSchreiben })`
// in src/main/database/record-auftrag.js) und ihre Wirkung im Ereignis-Prüfer.
//
// **Gearbeitet wird an der ECHTEN Schnittstelle** mit echter Sperr-Verwaltung,
// Klammer und Wiederanlauf, in Tabellen- und in Kartei-Form, und mit der
// ECHTEN Lauf-Marke (`merkeLaufStand` und `istLaufSchreibvorgang` aus
// src/main/documents/self-write.js). Die Meldungen des Beobachters werden
// nachgestellt (Art und Pfad wie in src/main/index/build.js), dann prüft der
// echte Ereignis-Prüfer, ob daraus eine Fälligkeit wird (Muster
// `workflow-lauf-marke.test.js`). Die Gegenprobe ohne Marke zeigt, dass der
// Prüfer dieselbe Meldung sonst als fremde Änderung einreiht.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const selbstSchreib = require('../../src/main/documents/self-write.js');
const { hatLaufMarke, istLaufSchreibvorgang, merkeLaufStand } = selbstSchreib;
const { erzeugeSchreibSchnittstelle } = require('../../src/main/database/record-auftrag.js');
const { erzeugeSperrVerwaltung } = require('../../src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = require('../../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = require('../../src/main/database/intent-recovery.js');
const { verschiebeInPapierkorb } = require('../../src/main/documents/papierkorb.js');
const {
  ENTPRELL_MS,
  createWorkflowEventChecker,
} = require('../../src/main/checks/workflow-event-check.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');

let tmpDirs = [];
let verwaltungen = [];

beforeEach(() => {
  selbstSchreib._laufLeeren();
});

afterEach(async () => {
  vi.useRealTimers();
  selbstSchreib._laufLeeren();
  for (const v of verwaltungen) await v.gibAllesFrei();
  verwaltungen = [];
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const ZEITPUNKT = '2026-11-10T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };
const KONFIG = { leseKonfig: async () => undefined };

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '    - name: pages',
  '      type: number',
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
  'Autoren, je Autor eine Karteikarte.',
  '',
].join('\n');

const ADA = ['---', 'db-record: r-00001', 'name: Ada', 'ort: London', '---', '', 'Text.', ''].join(
  '\n',
);

function lege(wurzel, relativ, text) {
  const pfad = path.join(wurzel, ...relativ.split('/'));
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

const lies = (pfad) => fs.readFileSync(pfad, 'utf8');

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-db-marke-'));
  tmpDirs.push(wurzel);
  const papierkorb = path.join(wurzel, '.papierkorb-attrappe');
  return {
    wurzel,
    papierkorb,
    library: lege(wurzel, 'Daten/Library.md', LIBRARY),
    autoren: lege(wurzel, 'Autoren/Autoren.md', AUTOREN),
    ada: lege(wurzel, 'Autoren/Ada.md', ADA),
  };
}

// Die echte Schnittstelle; der Papierkorb verschiebt in einen Punkt-Ordner.
function schnittstelle(b) {
  fs.mkdirSync(b.papierkorb, { recursive: true });
  const papierkorb = (pfad) =>
    verschiebeInPapierkorb(pfad, {
      trashItem: async (ziel) => fs.renameSync(ziel, path.join(b.papierkorb, path.basename(ziel))),
    });
  const sperrVerwaltung = erzeugeSperrVerwaltung(KONFIG);
  verwaltungen.push(sperrVerwaltung);
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({ sperrVerwaltung, ...KONFIG, papierkorb });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      ...KONFIG,
      erweiterungAktiv: () => true,
      laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
      papierkorb,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
  });
}

// Der Rückruf des Schritt-Moduls: jede Datei des Plans in die Lauf-Marke.
function mitMarke(protokoll = []) {
  return {
    vorSchreiben: (dateien) => {
      for (const datei of dateien) {
        // Zum Zeitpunkt des Rückrufs trägt die Datei noch ihren alten Stand.
        protokoll.push({
          ...datei,
          vorher: fs.existsSync(datei.pfad) ? lies(datei.pfad) : null,
        });
        merkeLaufStand(datei.pfad, datei.neu);
      }
    },
  };
}

const aendere = (tabelle, id, erwartet, werte) => ({
  anweisungen: [{ tabelle, art: 'update', id, erwartet, werte }],
});

// --- Die Naht an der Schnittstelle --------------------------------------------------------

describe('Naht der Lauf-Marke an der Schreib-Schnittstelle (4T-002545, AK4)', () => {
  it('ohne Option verhält sich die Schnittstelle unverändert und merkt nichts', async () => {
    const a = bereich();
    const b = bereich();
    const auftrag = aendere(
      'Daten/Library.md',
      'r-00001',
      { title: 'Solaris', pages: '224' },
      {
        pages: '225',
      },
    );
    const ohne = await schnittstelle(a).fuehreAuftragAus(a.wurzel, auftrag);
    const leer = await schnittstelle(b).fuehreAuftragAus(b.wurzel, auftrag, {});
    const mit = await schnittstelle(b).fuehreAuftragAus(
      b.wurzel,
      aendere('Daten/Library.md', 'r-00001', { title: 'Solaris', pages: '225' }, { pages: '226' }),
      mitMarke(),
    );
    expect(ohne.ok).toBe(true);
    expect(leer.ok).toBe(true);
    expect(mit.ok).toBe(true);
    expect(Object.keys(ohne).sort()).toEqual(Object.keys(leer).sort());
    expect(Object.keys(mit).sort()).toEqual(Object.keys(ohne).sort());
    expect(lies(a.library)).toBe(LIBRARY.replace('| 224', '| 225'));
    expect(hatLaufMarke(a.library)).toBe(false);
    expect(hatLaufMarke(b.library)).toBe(true);
  });

  it('übergibt vor dem ersten Schreiben jede Datei mit Pfad und neuem Inhalt (Tabellen-Form)', async () => {
    const b = bereich();
    const protokoll = [];
    const ergebnis = await schnittstelle(b).fuehreAuftragAus(
      b.wurzel,
      {
        anweisungen: [
          { tabelle: 'Daten/Library.md', art: 'create', werte: { title: 'Probe', pages: '1' } },
        ],
      },
      mitMarke(protokoll),
    );
    expect(ergebnis.ok).toBe(true);
    expect(protokoll).toHaveLength(1);
    expect(path.resolve(protokoll[0].pfad)).toBe(path.resolve(b.library));
    expect(protokoll[0].vorher).toBe(LIBRARY);
    expect(protokoll[0].neu).toBe(lies(b.library));
  });

  it('ruft den Rückruf nicht, wenn der Auftrag vor dem Schreiben abgewiesen wird', async () => {
    const b = bereich();
    const protokoll = [];
    const ergebnis = await schnittstelle(b).fuehreAuftragAus(
      b.wurzel,
      aendere('Daten/Library.md', 'r-00001', { title: 'Anders', pages: '224' }, { pages: '1' }),
      mitMarke(protokoll),
    );
    expect(ergebnis).toMatchObject({ ok: false, code: 'auftragStandWeichtAb' });
    expect(protokoll).toEqual([]);
    expect(hatLaufMarke(b.library)).toBe(false);
  });

  it('übergibt in der Kartei-Form die neue und die geänderte Karteikarte', async () => {
    const b = bereich();
    const protokoll = [];
    const s = schnittstelle(b);
    const neu = await s.fuehreAuftragAus(
      b.wurzel,
      {
        anweisungen: [
          {
            tabelle: 'Autoren/Autoren.md',
            art: 'create',
            werte: { name: 'Alan', ort: 'Wilmslow' },
            karteikarte: { name: 'Alan' },
          },
        ],
      },
      mitMarke(protokoll),
    );
    expect(neu.ok).toBe(true);
    const alan = path.join(b.wurzel, 'Autoren', 'Alan.md');
    const karte = protokoll.find((d) => path.resolve(d.pfad) === path.resolve(alan));
    expect(karte).toMatchObject({ anlegen: true, vorher: null });
    expect(karte.neu).toBe(lies(alan));

    protokoll.length = 0;
    const geaendert = await s.fuehreAuftragAus(
      b.wurzel,
      aendere('Autoren/Autoren.md', 'r-00001', { name: 'Ada', ort: 'London' }, { ort: 'Paris' }),
      mitMarke(protokoll),
    );
    expect(geaendert.ok).toBe(true);
    expect(protokoll.map((d) => path.resolve(d.pfad))).toEqual([path.resolve(b.ada)]);
    expect(protokoll[0].neu).toBe(lies(b.ada));
  });
});

// --- Wirkung im echten Ereignis-Prüfer ---------------------------------------------------

describe('Kein Ereignis aus einem Datenbank-Befehl eines Workflows (4T-002545, AK4)', () => {
  const workflowText = (ereignis) =>
    [
      '---',
      'workflow: true',
      'name: Wächter',
      'trigger: event',
      `event: ${ereignis}`,
      '---',
      '',
      '```workflow',
      'notify "geändert"',
      '```',
      '',
    ].join('\n');

  function pruefer(wurzel, ereignis) {
    const zugestellt = [];
    const text = workflowText(ereignis);
    const wf = path.join(wurzel, 'Workflows', 'Wächter.md');
    const c = createWorkflowEventChecker({
      areas: () => [{ root: wurzel }],
      workflowFiles: () => ({
        status: 'ready',
        dateien: [{ absPath: wf, relPath: 'Workflows/Wächter.md' }],
      }),
      readText: async () => text,
      readRunState: async () => ({
        stand: { runs: 0, armed: { at: 'x', hash: definitionsPruefsumme(text) } },
        defekt: false,
      }),
      enabled: () => true,
      deliver: (nutzlast) => zugestellt.push(...nutzlast.items),
      claimDelivery: () => true,
      releaseDelivery: () => {},
      windowAlive: () => true,
      istLaufSchreibvorgang,
    });
    return { c, zugestellt };
  }

  async function ablauf(c) {
    await c.idle();
    await vi.advanceTimersByTimeAsync(ENTPRELL_MS);
    await c.idle();
  }

  const meldung = (type, pfad, root) => ({ type, path: pfad, root });

  it('die Tabellen-Datei nach einem Workflow-Auftrag löst nichts aus, ohne Marke schon (Gegenprobe)', async () => {
    const b = bereich();
    const s = schnittstelle(b);
    const erst = await s.fuehreAuftragAus(
      b.wurzel,
      aendere('Daten/Library.md', 'r-00001', { title: 'Solaris', pages: '224' }, { pages: '225' }),
      mitMarke(),
    );
    expect(erst.ok).toBe(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { c, zugestellt } = pruefer(b.wurzel, 'file-changed in "Daten"');
    // Der Beobachter meldet das Umbenennen der Schattenkopie als Änderung, auf
    // manchen Dateisystemen als neue Datei; beides ist der Inhalt des Laufs.
    c.report(meldung('file-changed', b.library, b.wurzel));
    c.report(meldung('file-created', b.library, b.wurzel));
    await ablauf(c);
    expect(zugestellt).toEqual([]);

    // Gegenprobe: derselbe Auftrag ohne Marke ist für den Prüfer eine fremde Änderung.
    vi.useRealTimers();
    const zweit = await s.fuehreAuftragAus(
      b.wurzel,
      aendere('Daten/Library.md', 'r-00001', { title: 'Solaris', pages: '225' }, { pages: '226' }),
    );
    expect(zweit.ok).toBe(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    c.report(meldung('file-changed', b.library, b.wurzel));
    await ablauf(c);
    expect(zugestellt).toHaveLength(1);
    c.stop();
  });

  // Eine gelöschte Karteikarte hat hier keinen eigenen Teil (Review-Runde 1 zu
  // 3E-000368): Sie geht aus dem Bereich in den Papierkorb, der Beobachter meldet
  // nur `unlink`, das kein abonnierbares Ereignis ist, und ihr Beleg geht in eine
  // Begleitdatei, die der Prüfer siebt (Fall unten).
  it('eine angelegte und eine geänderte Karteikarte lösen nichts aus', async () => {
    const b = bereich();
    const s = schnittstelle(b);
    const echteUhr = () => vi.useRealTimers();
    const pruefUhr = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const angelegt = pruefer(b.wurzel, 'file-created in "Autoren"');
    const geaendert = pruefer(b.wurzel, 'file-changed in "Autoren"');

    // Neue Karteikarte: Der Beobachter meldet sie als neue Datei.
    const neu = await s.fuehreAuftragAus(
      b.wurzel,
      {
        anweisungen: [
          {
            tabelle: 'Autoren/Autoren.md',
            art: 'create',
            werte: { name: 'Alan', ort: 'Wilmslow' },
            karteikarte: { name: 'Alan' },
          },
        ],
      },
      mitMarke(),
    );
    expect(neu.ok).toBe(true);
    const alan = path.join(b.wurzel, 'Autoren', 'Alan.md');
    pruefUhr();
    angelegt.c.report(meldung('file-created', alan, b.wurzel));
    await ablauf(angelegt.c);
    expect(angelegt.zugestellt).toEqual([]);
    echteUhr();

    // Geänderte Karteikarte: Meldung, solange die Datei den Stand des Laufs trägt.
    const zweit = await s.fuehreAuftragAus(
      b.wurzel,
      aendere('Autoren/Autoren.md', 'r-00001', { name: 'Ada', ort: 'London' }, { ort: 'Paris' }),
      mitMarke(),
    );
    expect(zweit.ok).toBe(true);
    pruefUhr();
    geaendert.c.report(meldung('file-changed', b.ada, b.wurzel));
    await ablauf(geaendert.c);
    expect(geaendert.zugestellt).toEqual([]);
    echteUhr();

    // Gegenprobe: eine Änderung der Karteikarte «Alan» von Hand löst aus.
    pruefUhr();
    fs.writeFileSync(alan, lies(alan).replace('Wilmslow', 'Manchester'), 'utf8');
    geaendert.c.report(meldung('file-changed', alan, b.wurzel));
    await ablauf(geaendert.c);
    expect(geaendert.zugestellt).toHaveLength(1);
    angelegt.c.stop();
    geaendert.c.stop();
  });

  it('die Schattenkopie der Schreib-Klammer und die Beleg-Datei lösen nie aus', async () => {
    const b = bereich();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { c, zugestellt } = pruefer(b.wurzel, 'file-created in "Daten"');
    const schatten = path.join(b.wurzel, 'Daten', '.Library.md.em4me-absicht-1-1');
    fs.writeFileSync(schatten, 'x', 'utf8');
    c.report(meldung('file-created', schatten, b.wurzel));
    c.report(meldung('file-created', path.join(b.wurzel, 'Daten', 'Library.mddl'), b.wurzel));
    await ablauf(c);
    expect(zugestellt).toEqual([]);
    c.stop();
  });
});
