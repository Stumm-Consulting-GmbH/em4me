// 4T-001938 (Epic 3E-000257, Bauplan B3, B4; AK4, AK5): Der Kanal
// `database:datensatz` und seine Brücke — ein Datensatz für die Einzel-Maske,
// frisch aus der Datei gelesen.
//
// Gemessen wird am echten Handler über die echte Registrier-Funktion und am
// echten Dateisystem im Temp-Ordner (Muster `db-auftrag-kanal.test.js`): der
// Datensatz aus der Kopf-Datei und aus einem Folge-Segment, die Neuanlage, die
// Bearbeitbarkeit in beiden Ausgängen, fehlende Zellen, die Fehlerlagen, das
// frische Lesen nach einer Änderung von Hand, die vier Stufen der Absperrung und
// der Aus-Zustand der Erweiterung. Dazu der Nachweis, dass die gelieferte
// Erwartung genau die ist, die der Stand-Vergleich der Schreib-Schnittstelle
// annimmt: Ein Auftrag mit ihr geht durch.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
// 4T-002184: der Code der abgewiesenen Masken-Anforderung.
import {
  MASKE_NICHT_DER_TABELLE,
  liesDatensatz,
} from '../../src/main/database/datensatz-auskunft.js';
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';

// --- Aufbau ------------------------------------------------------------------------------

const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

function neueWurzel() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-datensatz-kanal-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, name, text) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

// Eine geteilte Tabelle nach dem Ablage-Format (Muster `db-record-auftrag.test.js`):
// Die Kopf-Datei trägt Definition, öffnenden Zaun und zwei Datensätze, der zweite
// mit fehlenden Zellen; das Folge-Segment trägt einen gebuchten Datensatz und den
// schließenden Zaun.
const KOPF = [
  '---',
  'doc-part: v1|1|Kunden',
  'db-table:',
  '  fields:',
  '    - name: name',
  '      label:',
  '        de: Kundenname',
  '        en: Customer',
  '    - name: ort',
  '    - name: anzahl',
  '      type: number',
  '    - name: status',
  '  key: name',
  '  editable:',
  '    rule: status != "gebucht"',
  '    message: Gebuchte Kunden sind gesperrt.',
  '  lastId: 3',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna',
  '| Basel',
  '| 3',
  '| offen',
  '|- id="r-00002"',
  '| Bert',
  '| Bern',
].join('\n');

const SEGMENT = [
  '---',
  'doc-part: v1|2|Kunden',
  '---',
  '|- id="r-00003"',
  '| Carla',
  '| Chur',
  '| 5',
  '| gebucht',
  // Der Trennabstand vor dem Zaun steht im Text der letzten Zelle und gehört
  // nicht zu ihrem Wert (`zellTexte` in record-write.js).
  '',
  '```',
  '',
].join('\n');

function tabelle(wurzel) {
  return {
    kopf: lege(wurzel, 'Kunden.md', KOPF),
    segment: lege(wurzel, 'Kunden•part-00002.md', SEGMENT),
  };
}

// Die Zeile, an der ein Text in einer Datei steht, gezählt ab 1.
function zeileVon(text, gesucht) {
  return text.split('\n').indexOf(gesucht) + 1;
}

// Der echte Handler. Tor, Sicht und Bereichs-Wurzel sind einstellbar; die
// Wurzel kommt aus dem Ereignis wie im Kanal-Test der Schreib-Schnittstelle.
function registriere({ datenbankAktiv = () => true, ohneTor = false, sicht = null } = {}) {
  const kanaele = new Map();
  const deps = {
    areaRootForEvent: (event) => (event && event.wurzel) || null,
    backlinks: {
      ensureIndexForDemand: () => {},
      datenbankSicht: () =>
        sicht
          ? { status: 'ready', meta: null, sicht }
          : { status: 'unavailable', meta: null, sicht: null },
      bufferTextFor: () => null,
    },
    isMarkdownPath,
    schreibSchnittstelle: { fuehreAuftragAus: vi.fn(), eroeffneNeuanlage: vi.fn() },
  };
  if (!ohneTor) deps.datenbankAktiv = datenbankAktiv;
  registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), deps);
  return kanaele;
}

function kanal(optionen) {
  return registriere(optionen).get('database:datensatz');
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

// Die Gestalt der Abweisung ohne Zugriff, abgelesen am Vorbild-Kanal statt
// nachgeschrieben: Alle prüfenden Kanäle antworten mit DERSELBEN Funktion.
async function gestaltOhneZugriff() {
  return registriere().get('database:changeLog')({}, undefined);
}

// Die echte Schnittstelle, wie in der Verdrahtung (Muster `db-auftrag-kanal.test.js`).
function echteSchnittstelle() {
  const leseKonfig = async () => undefined;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig }),
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung,
      leseKonfig,
      erweiterungAktiv: () => true,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => '2026-09-25T08:00:00Z',
    herkunft: () => ({ benutzer: 'anna', rechner: 'SC-026' }),
    warteAbstaende: [],
  });
}

// --- Registrierung und Brücke ------------------------------------------------------------

describe('database:datensatz: Registrierung und Brücke (4T-001938, B4)', () => {
  it('registriert den Kanal neben den fünf bestehenden', () => {
    expect([...registriere().keys()].sort()).toEqual([
      'database:auftrag',
      // 4T-002252 (Epic 3E-000262): die Pfad-Ausdrücke der Einzel-Maske.
      'database:ausdruecke',
      'database:changeLog',
      // 4T-001942 (Epic 3E-000257): die Wertehilfe der Verweis-Felder.
      'database:datensaetze',
      'database:datensatz',
      // 4T-001944 (Epic 3E-000257): die Konsistenz-Prüfung über den Bestand.
      'database:konsistenz',
      // 4T-002249 (Epic 3E-000262): die Auskunft über eine Listen-Maske.
      'database:liste',
      // 4T-001943 (Epic 3E-000257): die Masken-Datei herausschreiben.
      'database:maskeSchreiben',
      'database:neuanlage',
      'database:overview',
      // 4T-002253 (Epic 3E-000262): der Positions-Bereich der Einzel-Maske.
      'database:positionsliste',
      // 4T-001941 (Epic 3E-000257): die Sperre der Einzel-Maske.
      'database:sperre',
      'database:table',
      // 4T-002333 (Epic 3E-000264): das Ziel eines Datensatz-Verweises.
      'database:verweisZiel',
      // 4T-001945 (Epic 3E-000257): der Verwendungsnachweis.
      'database:verwendung',
    ]);
  });

  it('bindet die Brücke an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = { tabelle: 'Kunden.md', kennung: null, sprache: 'de' };
    expect(await bruecke.databaseDatensatz(params)).toEqual({ name: 'database:datensatz' });
    expect(invoke).toHaveBeenCalledWith('database:datensatz', params);
    expect(invoke.mock.calls[0][1]).toBe(params);
  });
});

// --- AK4: der gelesene Datensatz -----------------------------------------------------------

describe('database:datensatz: Datensatz, Neuanlage und Bearbeitbarkeit (4T-001938, AK4)', () => {
  it('liefert einen Datensatz der Kopf-Datei mit Zellen, Anzeige, Erwartung und Bedingung', async () => {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const antwort = await kanal()(ereignis(wurzel), {
      tabelle: 'Kunden.md',
      kennung: 'r-1',
      sprache: 'de',
    });

    expect(antwort).toMatchObject({
      status: 'ready',
      tabelle: 'Kunden.md',
      pfad: kopf,
      kennung: 'r-00001',
      datei: kopf,
      zeile: zeileVon(KOPF, '|- id="r-00001"'),
      key: ['name'],
      display: null,
      anzeigeSpalte: 'name',
      anzeige: 'r-00001 (Anna)',
      editable: { erfuellt: true, grund: null, meldung: 'Gebuchte Kunden sind gesperrt.' },
      erwartet: { name: 'Anna', ort: 'Basel', anzahl: '3', status: 'offen' },
    });
    expect(antwort.fields.map((f) => f.name)).toEqual(['name', 'ort', 'anzahl', 'status']);
    expect(antwort.zellen).toEqual([
      { name: 'name', text: 'Anna', value: 'Anna', error: null, fehlt: false },
      { name: 'ort', text: 'Basel', value: 'Basel', error: null, fehlt: false },
      { name: 'anzahl', text: '3', value: 3, error: null, fehlt: false },
      { name: 'status', text: 'offen', value: 'offen', error: null, fehlt: false },
    ]);
    // Der erzeugte Körper in der Sprache des Anwenders, ohne Hinweis.
    expect(antwort.koerper.quelle).toBe('erzeugt');
    expect(antwort.koerper.text.split('\n')[0]).toBe('# Kunden');
    expect(antwort.koerper.text).toContain('**Kundenname:** {{field:name}}');
    expect(antwort.koerper.hints).toEqual([]);
    expect(antwort.koerper.segmente.filter((s) => s.art === 'feld').map((s) => s.name)).toEqual([
      'name',
      'ort',
      'anzahl',
      'status',
    ]);
    // Das Ergebnis übersteht den Struktur-Klon des IPC unverändert.
    expect(structuredClone(antwort)).toEqual(antwort);
  });

  it('liefert einen Datensatz aus dem Folge-Segment; eine nicht erfüllte Bedingung nennt ihre Meldung', async () => {
    const wurzel = neueWurzel();
    const { kopf, segment } = tabelle(wurzel);
    const antwort = await kanal()(ereignis(wurzel), { tabelle: 'Kunden.md', kennung: 'r-00003' });

    expect(antwort).toMatchObject({
      status: 'ready',
      pfad: kopf,
      kennung: 'r-00003',
      datei: segment,
      zeile: zeileVon(SEGMENT, '|- id="r-00003"'),
      anzeige: 'r-00003 (Carla)',
      editable: {
        erfuellt: false,
        grund: 'ausdruck',
        meldung: 'Gebuchte Kunden sind gesperrt.',
      },
      erwartet: { name: 'Carla', ort: 'Chur', anzahl: '5', status: 'gebucht' },
    });
    // Der Trennabstand vor dem Zaun gehört nicht zum Wert der letzten Zelle.
    expect(antwort.zellen[3]).toEqual({
      name: 'status',
      text: 'gebucht',
      value: 'gebucht',
      error: null,
      fehlt: false,
    });
  });

  it('meldet fehlende Zellen als leer und fehlend, die Erwartung trägt sie leer', async () => {
    const wurzel = neueWurzel();
    tabelle(wurzel);
    const antwort = await kanal()(ereignis(wurzel), { tabelle: 'Kunden.md', kennung: 'r-00002' });

    expect(antwort.status).toBe('ready');
    expect(antwort.zellen.map((z) => [z.name, z.text, z.fehlt])).toEqual([
      ['name', 'Bert', false],
      ['ort', 'Bern', false],
      ['anzahl', '', true],
      ['status', '', true],
    ]);
    expect(antwort.erwartet).toEqual({ name: 'Bert', ort: 'Bern', anzahl: '', status: '' });
    // Ein leerer Status ist nicht «gebucht»; die Bedingung ist erfüllt.
    expect(antwort.editable.erfuellt).toBe(true);
  });

  it('liefert bei kennung null den leeren Datensatz einer Neuanlage', async () => {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const antwort = await kanal()(ereignis(wurzel), { tabelle: 'Kunden.md', kennung: null });

    expect(antwort).toMatchObject({
      status: 'ready',
      pfad: kopf,
      kennung: null,
      datei: null,
      zeile: null,
      anzeige: null,
      anzeigeSpalte: 'name',
      editable: null,
      erwartet: {},
    });
    // Leer heißt der leere Wert des Typs: Text bleibt Text, eine Zahl ist null.
    expect(antwort.zellen.map((z) => [z.name, z.text, z.value, z.fehlt])).toEqual([
      ['name', '', '', false],
      ['ort', '', '', false],
      ['anzahl', '', null, false],
      ['status', '', '', false],
    ]);
  });

  it('eine Tabelle ohne Bedingung liefert editable null', async () => {
    const wurzel = neueWurzel();
    lege(
      wurzel,
      'Orte.md',
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: ort',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| Basel',
        '```',
        '',
      ].join('\n'),
    );
    const antwort = await kanal()(ereignis(wurzel), { tabelle: 'Orte.md', kennung: 'r-00001' });
    expect(antwort).toMatchObject({
      status: 'ready',
      editable: null,
      anzeigeSpalte: null,
      anzeige: 'r-00001',
    });
  });

  it('die gelieferte Erwartung ist die, die der Stand-Vergleich der Schnittstelle annimmt', async () => {
    const wurzel = neueWurzel();
    tabelle(wurzel);
    const lesen = kanal();
    const schnittstelle = echteSchnittstelle();
    for (const kennung of ['r-00001', 'r-00002', 'r-00003']) {
      const gelesen = await lesen(ereignis(wurzel), { tabelle: 'Kunden.md', kennung });
      const ergebnis = await schnittstelle.fuehreAuftragAus(wurzel, {
        anweisungen: [
          {
            tabelle: 'Kunden.md',
            art: 'update',
            id: kennung,
            erwartet: gelesen.erwartet,
            werte: { ort: 'Thun' },
          },
        ],
      });
      // Auch der letzte Datensatz vor dem Zaun: Sein Trennabstand zählt nicht
      // als Abweichung. Die Bearbeitbarkeit prüft erst das Regel-Werk, das diese
      // Schnittstelle ohne Prüf-Naht nicht fährt; gemessen wird allein der Stand.
      expect(ergebnis.ok, `${kennung}: ${JSON.stringify(ergebnis)}`).toBe(true);
    }
    // Gegenprobe: Eine Erwartung, die nicht dem gelesenen Stand entspricht,
    // weist derselbe Vergleich ab; der Fall oben ist damit nicht leer.
    const gelesen = await lesen(ereignis(wurzel), { tabelle: 'Kunden.md', kennung: 'r-00001' });
    expect(gelesen.erwartet.ort).toBe('Thun');
    const abgewiesen = await schnittstelle.fuehreAuftragAus(wurzel, {
      anweisungen: [
        {
          tabelle: 'Kunden.md',
          art: 'update',
          id: 'r-00001',
          erwartet: { ...gelesen.erwartet, ort: 'Basel' },
          werte: { ort: 'Bern' },
        },
      ],
    });
    expect(abgewiesen.ok).toBe(false);
    expect(abgewiesen.code).toBe(LAGEN.standWeichtAb);
  });
});

// --- AK4: die Fehlerlagen ------------------------------------------------------------------

describe('database:datensatz: Fehlerlagen (4T-001938, AK4)', () => {
  it('meldet eine unbekannte Tabelle und ein Dokument ohne Definition', async () => {
    const wurzel = neueWurzel();
    lege(wurzel, 'Notiz.md', '---\ntitle: Notiz\n---\n\nText.\n');
    const lesen = kanal();
    for (const angabe of ['Fehlt.md', 'Notiz.md']) {
      expect(await lesen(ereignis(wurzel), { tabelle: angabe, kennung: null }), angabe).toEqual({
        status: 'error',
        code: LAGEN.tabelleUnbekannt,
      });
    }
  });

  it('meldet eine unbekannte und eine nicht auslegbare Kennung als unbekannt', async () => {
    const wurzel = neueWurzel();
    tabelle(wurzel);
    const lesen = kanal();
    for (const kennung of ['r-00099', 'kaputt']) {
      expect(await lesen(ereignis(wurzel), { tabelle: 'Kunden.md', kennung }), kennung).toEqual({
        status: 'error',
        code: LAGEN.datensatzUnbekannt,
      });
    }
  });

  it('meldet eine Kennung, die in der Tabelle zweimal vorkommt, als mehrdeutig', async () => {
    const wurzel = neueWurzel();
    lege(
      wurzel,
      'Doppelt.md',
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: ort',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| Basel',
        '|- id="r-00001"',
        '| Bern',
        '```',
        '',
      ].join('\n'),
    );
    expect(await kanal()(ereignis(wurzel), { tabelle: 'Doppelt.md', kennung: 'r-00001' })).toEqual({
      status: 'error',
      code: LAGEN.datensatzMehrdeutig,
    });
  });
});

// --- AK5: frisch gelesen -------------------------------------------------------------------

describe('database:datensatz: liest frisch (4T-001938, AK5)', () => {
  it('zeigt einen von Hand geänderten Zell-Text beim nächsten Aufruf', async () => {
    const wurzel = neueWurzel();
    const { segment } = tabelle(wurzel);
    const lesen = kanal();
    const vorher = await lesen(ereignis(wurzel), { tabelle: 'Kunden.md', kennung: 'r-00003' });
    expect(vorher.erwartet.ort).toBe('Chur');

    fs.writeFileSync(segment, SEGMENT.replace('| Chur', '| Davos'), 'utf8');
    const nachher = await lesen(ereignis(wurzel), { tabelle: 'Kunden.md', kennung: 'r-00003' });
    expect(nachher.erwartet.ort).toBe('Davos');
    expect(nachher.zellen[1].text).toBe('Davos');
  });
});

// --- Sprache der erzeugten Maske -----------------------------------------------------------

describe('database:datensatz: Rückfall-Sprache aus dem Steckbrief (4T-001938, B4)', () => {
  it('löst die Beschriftung über die Rückfall-Sprache des Steckbriefs auf', async () => {
    const wurzel = neueWurzel();
    tabelle(wurzel);
    const steckbrief = lege(
      wurzel,
      'Datenbank.md',
      '---\ndb-database:\n  name: Kunden-DB\n  fallbackLocale: en\n---\n',
    );
    const sicht = { dbKindsPerFile: new Map([[steckbrief, ['database']]]) };
    const params = { tabelle: 'Kunden.md', kennung: null, sprache: 'fr' };

    const mitSteckbrief = await kanal({ sicht })(ereignis(wurzel), params);
    expect(mitSteckbrief.koerper.text).toContain('**Customer:** {{field:name}}');
    // Ohne bereite Sicht gibt es keine Rückfall-Sprache; es gilt die erste Fassung.
    const ohneSicht = await kanal()(ereignis(wurzel), params);
    expect(ohneSicht.koerper.text).toContain('**Kundenname:** {{field:name}}');
  });
});

// --- AK4: fail-closed und Aus-Zustand ------------------------------------------------------

describe('database:datensatz: fail-closed vor jedem Dateizugriff (4T-001938, AK4, B3)', () => {
  // Jede Stufe wird mit einer Angabe verletzt, deren Auskunft sonst eine
  // Fehlerlage wäre: Kommt die Abweisung ohne Zugriff, hat der Kanal die
  // Auskunft nicht erreicht.
  async function pruefeAbweisung(optionen, event, liste) {
    const referenz = await gestaltOhneZugriff();
    expect(referenz.status).toBe('unavailable');
    const lesen = kanal(optionen);
    for (const params of liste) {
      expect(await lesen(event, params), JSON.stringify(params)).toEqual(referenz);
    }
  }

  it('Stufe 1: weist eine unbrauchbare Form ab, auch eine fehlende Kennung', async () => {
    const wurzel = neueWurzel();
    await pruefeAbweisung({}, ereignis(wurzel), [
      undefined,
      null,
      'Kunden.md',
      [],
      {},
      { tabelle: '', kennung: null },
      { tabelle: 42, kennung: null },
      { tabelle: ['Kunden.md'], kennung: null },
      // Die Neuanlage muss ausdrücklich dastehen.
      { tabelle: 'Kunden.md' },
      { tabelle: 'Kunden.md', kennung: '' },
      { tabelle: 'Kunden.md', kennung: 42 },
    ]);
  });

  it('Stufe 2: weist ein Fenster ohne gebundenen Bereich ab', async () => {
    await pruefeAbweisung({}, {}, [{ tabelle: 'Kunden.md', kennung: null }]);
  });

  it('Stufe 3: weist eine Tabelle außerhalb des Bereichs ab, relativ wie absolut', async () => {
    const wurzel = neueWurzel();
    const fremd = neueWurzel();
    lege(fremd, 'Kunden.md', KOPF);
    await pruefeAbweisung({}, ereignis(wurzel), [
      { tabelle: '../fremd.md', kennung: null },
      { tabelle: path.join(fremd, 'Kunden.md'), kennung: null },
      { tabelle: `${wurzel}2${path.sep}Kunden.md`, kennung: null },
    ]);
  });

  it('Stufe 4: weist eine Tabelle ohne Markdown-Endung ab', async () => {
    const wurzel = neueWurzel();
    await pruefeAbweisung({}, ereignis(wurzel), [
      { tabelle: 'Kunden.txt', kennung: null },
      { tabelle: 'Geheim.env', kennung: null },
      { tabelle: '.', kennung: null },
    ]);
  });

  it('Aus-Zustand: weist ab, wenn die Erweiterung aus ist oder das Tor fehlt', async () => {
    const wurzel = neueWurzel();
    tabelle(wurzel);
    const params = { tabelle: 'Kunden.md', kennung: 'r-00001' };
    await pruefeAbweisung({ datenbankAktiv: () => false }, ereignis(wurzel), [params]);
    await pruefeAbweisung({ ohneTor: true }, ereignis(wurzel), [params]);

    // Bei jeder Anfrage frisch gefragt: Umschalten wirkt ohne Neu-Registrierung.
    let aktiv = false;
    const lesen = kanal({ datenbankAktiv: () => aktiv });
    expect((await lesen(ereignis(wurzel), params)).status).toBe('unavailable');
    aktiv = true;
    expect((await lesen(ereignis(wurzel), params)).status).toBe('ready');
  });
});

// --- 4T-002184: eine bestimmte Maske derselben Tabelle -------------------------------------

// Epic 3E-000261, AK4: Der Kanal nimmt optional `maske`, den Namen einer
// Masken-Datei der Tabelle, und liefert deren Körper; ohne Angabe die
// Standard-Maske wie bisher. Eine Masken-Datei einer anderen Tabelle, ein
// gewöhnliches Dokument und ein unbekannter Name werden mit eigenem Code
// abgewiesen; eine Angabe in falscher Form endet ohne Zugriff.
describe('database:datensatz: bestimmte Maske derselben Tabelle (4T-002184, AK4)', () => {
  function maskenDatei(tabelle, titel) {
    return ['---', 'db-form:', `  table: ${tabelle}`, '---', '', `# ${titel}`, ''].join('\n');
  }

  function bestand() {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const andere = lege(
      wurzel,
      'Lieferanten.md',
      '---\ndb-table:\n  fields:\n    - name: firma\n---\n',
    );
    const lang = lege(wurzel, 'Kunden Form.md', maskenDatei('Kunden', 'Lang'));
    const kurz = lege(wurzel, 'Kunden Kurz.md', maskenDatei('Kunden', 'Kurz'));
    const fremd = lege(wurzel, 'Lieferanten Form.md', maskenDatei('Lieferanten', 'Fremd'));
    const notiz = lege(wurzel, 'Notiz.md', '# Notiz\n');
    const sicht = {
      dbKindsPerFile: new Map([
        [kopf, ['table']],
        [andere, ['table']],
        [lang, ['form']],
        [kurz, ['form']],
        [fremd, ['form']],
      ]),
    };
    return { wurzel, sicht, lang, kurz, notiz };
  }

  it('liefert ohne Angabe die Standard-Maske und mit Angabe die genannte', async () => {
    const { wurzel, sicht, lang, kurz } = bestand();
    const lesen = kanal({ sicht });
    const basis = { tabelle: 'Kunden.md', kennung: 'r-00001', sprache: 'de' };
    const standard = await lesen(ereignis(wurzel), basis);
    expect(standard.status).toBe('ready');
    expect(standard.koerper.pfad).toBe(lang);
    expect((await lesen(ereignis(wurzel), { ...basis, maske: null })).koerper.pfad).toBe(lang);
    for (const maske of ['Kunden Kurz', 'kunden kurz', 'Kunden Kurz.md', kurz]) {
      const antwort = await lesen(ereignis(wurzel), { ...basis, maske });
      expect(antwort.status, maske).toBe('ready');
      expect(antwort.koerper.quelle).toBe('datei');
      expect(antwort.koerper.pfad).toBe(kurz);
      expect(antwort.koerper.text).toContain('# Kurz');
      expect(antwort.kennung).toBe('r-00001');
    }
    // Auch die Neuanlage zeigt die genannte Maske.
    const neu = await lesen(ereignis(wurzel), { ...basis, kennung: null, maske: 'Kunden Kurz' });
    expect(neu.koerper.pfad).toBe(kurz);
  });

  it('weist eine fremde Maske, ein Dokument und einen unbekannten Namen mit eigenem Code ab', async () => {
    const { wurzel, sicht, notiz } = bestand();
    const lesen = kanal({ sicht });
    const basis = { tabelle: 'Kunden.md', kennung: 'r-00001', sprache: 'de' };
    for (const maske of ['Lieferanten Form', 'Notiz', notiz, 'Gibt Es Nicht']) {
      expect(await lesen(ereignis(wurzel), { ...basis, maske }), maske).toEqual({
        status: 'error',
        code: MASKE_NICHT_DER_TABELLE,
      });
    }
    // Ohne Sicht lässt sich eine Anforderung nicht prüfen und wird abgewiesen.
    expect(await kanal({})(ereignis(wurzel), { ...basis, maske: 'Kunden Kurz' })).toEqual({
      status: 'error',
      code: MASKE_NICHT_DER_TABELLE,
    });
  });

  it('weist eine Angabe in falscher Form ohne Zugriff ab', async () => {
    const { wurzel, sicht } = bestand();
    const referenz = await gestaltOhneZugriff();
    const lesen = kanal({ sicht });
    for (const maske of ['', 42, ['Kunden Kurz'], { name: 'Kunden Kurz' }]) {
      const params = { tabelle: 'Kunden.md', kennung: 'r-00001', maske };
      expect(await lesen(ereignis(wurzel), params), JSON.stringify(maske)).toEqual(referenz);
    }
  });

  it('reicht die Angabe über die Brücke unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = {
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
      sprache: 'de',
      maske: 'Kunden Kurz',
    };
    await bruecke.databaseDatensatz(params);
    expect(invoke.mock.calls[0][1]).toBe(params);
  });
});

// 4T-002308 (Epic 3E-000263, S4; AK3): Die Antwort trägt die Erlaubnis-Menge
// der Tabelle aus derselben Auflösung wie die Übersicht. Ohne bereite Sicht ist
// sie unbekannt (null), nie «alles erlaubt».
describe('database:datensatz: Feld rechte (4T-002308, AK3)', () => {
  function bestand(rollenZeilen) {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const eintraege = [[kopf, ['table']]];
    if (rollenZeilen) {
      const text = ['---', 'db-database:', ...rollenZeilen, '---', ''].join('\n');
      eintraege.push([lege(wurzel, 'Datenbank.md', text), ['database']]);
    }
    return { wurzel, sicht: { dbKindsPerFile: new Map(eintraege) } };
  }
  const ALLES = { create: true, update: true, delete: true, define: true };

  it('trägt ohne Rollen alles und ohne Sicht null (4T-002308)', async () => {
    const { wurzel, sicht } = bestand(null);
    const params = { tabelle: 'Kunden.md', kennung: 'r-00001', sprache: 'de' };
    expect((await kanal({ sicht })(ereignis(wurzel), params)).rechte).toEqual(ALLES);
    expect((await kanal()(ereignis(wurzel), params)).rechte).toBeNull();
    const neu = await kanal({ sicht })(ereignis(wurzel), { ...params, kennung: null });
    expect(neu.rechte).toEqual(ALLES);
  });

  it('trägt die Rechte der eigenen Rolle, Anmeldename über die Naht (4T-002308)', async () => {
    const zeilen = ['  roles:', '    pflege:', '      kunden: [update]', '  defaultRole: pflege'];
    const { wurzel, sicht } = bestand(zeilen);
    const antwort = await liesDatensatz({
      fsp: fs.promises,
      wurzel,
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
      sicht,
      herkunft: () => ({ benutzer: 'gast', rechner: 'pc' }),
    });
    expect(antwort.status).toBe('ready');
    expect(antwort.rechte).toEqual({ create: false, update: true, delete: false, define: false });
    // 4T-002311: dazu die geltende Rolle für den Hinweis-Text der Maske.
    expect(antwort.rolle).toBe('pflege');
  });

  // 4T-002311 (E12.4): Die Tabellen-Definition trägt Rolle und Rechte aus
  // derselben Auflösung; der Datensatz-Block fragt danach, ob er anlegen darf.
  it('trägt in database:table Rolle und Rechte, ohne Sicht und ohne Treffer nicht (4T-002311)', async () => {
    const { wurzel, sicht } = bestand(null);
    const table = (opt, tabelle) =>
      registriere(opt).get('database:table')(ereignis(wurzel), { filePath: wurzel, tabelle });
    const antwort = await table({ sicht }, 'Kunden');
    expect([antwort.gefunden, antwort.rolle, antwort.rechte]).toEqual([true, null, ALLES]);
    expect(await table({ sicht }, 'Fremd')).not.toHaveProperty('rechte');
    expect(await table({}, 'Kunden')).not.toHaveProperty('rechte');
  });
});

// --- 4T-002312: gesperrte Felder -------------------------------------------------------------

describe('database:datensatz: Feld gesperrteFelder (4T-002312, AK1, AK3)', () => {
  // `betrag` ist änderbar, solange `gebucht` nicht gesetzt ist; `nummer` fest gesperrt.
  function belege(wurzel, gebuchtZweiter = 'x') {
    return lege(
      wurzel,
      'Belege.md',
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: nummer',
        '      editable: false',
        '    - name: betrag',
        '      type: number',
        '      editable: NOT gebucht',
        '    - name: gebucht',
        '      type: boolean',
        '---',
        '',
        '```perspective-records',
        '|- id="r-00001"',
        '| B-1',
        '| 10',
        '|',
        '|- id="r-00002"',
        '| B-2',
        '| 20',
        gebuchtZweiter === '' ? '|' : `| ${gebuchtZweiter}`,
        '```',
        '',
      ].join('\n'),
    );
  }

  it('4T-002312: nennt die nach ihrer Bedingung gesperrten Felder am gelesenen Datensatz', async () => {
    const wurzel = neueWurzel();
    belege(wurzel);
    const lesen = kanal();
    const offen = await lesen(ereignis(wurzel), { tabelle: 'Belege.md', kennung: 'r-00001' });
    const gebucht = await lesen(ereignis(wurzel), { tabelle: 'Belege.md', kennung: 'r-00002' });
    expect(offen).toMatchObject({ status: 'ready', editable: null, gesperrteFelder: ['nummer'] });
    expect(gebucht.gesperrteFelder).toEqual(['nummer', 'betrag']);
  });

  it('4T-002312: die Sperre wechselt mit dem Datensatz (nächste Antwort)', async () => {
    const wurzel = neueWurzel();
    const pfad = belege(wurzel);
    const lesen = kanal();
    expect(
      (await lesen(ereignis(wurzel), { tabelle: 'Belege.md', kennung: 'r-00002' })).gesperrteFelder,
    ).toEqual(['nummer', 'betrag']);
    fs.writeFileSync(pfad, fs.readFileSync(pfad, 'utf8').replace('| 20\n| x', '| 20\n|'), 'utf8');
    expect(
      (await lesen(ereignis(wurzel), { tabelle: 'Belege.md', kennung: 'r-00002' })).gesperrteFelder,
    ).toEqual(['nummer']);
  });

  it('4T-002312: die Neuanlage und eine Tabelle ohne Feld-Bedingung liefern eine leere Liste', async () => {
    const wurzel = neueWurzel();
    belege(wurzel);
    tabelle(wurzel);
    const lesen = kanal();
    const neu = await lesen(ereignis(wurzel), { tabelle: 'Belege.md', kennung: null });
    expect(neu).toMatchObject({ status: 'ready', kennung: null, gesperrteFelder: [] });
    const kunden = await lesen(ereignis(wurzel), { tabelle: 'Kunden.md', kennung: 'r-00003' });
    expect(kunden.editable.erfuellt).toBe(false);
    expect(kunden.gesperrteFelder).toEqual([]);
  });
});
