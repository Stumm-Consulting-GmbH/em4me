// 4T-001942 (Epic 3E-000257, Bauplan B1, B3, B4; AK1, AK5): Der Kanal
// `database:datensaetze` und seine Brücke — die Datensätze EINER Tabelle für die
// Wertehilfe der Verweis-Felder, frisch aus den Dateien gelesen.
//
// Gemessen wird am echten Handler über die echte Registrier-Funktion und am
// echten Dateisystem im Temp-Ordner (Muster `db-datensatz-kanal.test.js`): die
// Liste aus Kopf-Datei und Folge-Segment, die Sortierung nach Anzeige-Form, die
// Anzeige-Form aus `display` und aus dem einteiligen Schlüssel, die Tabelle ohne
// Schlüssel, die Auflösung über Namen und Pfad, das frische Lesen, die Stufen
// der Absperrung samt Aus-Zustand und die Kosten bei zweitausend Datensätzen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { liesDatensatzListe } from '../../src/main/database/datensatz-liste.js';

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-datensaetze-kanal-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, name, text) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

// Eine geteilte Tabelle mit einteiligem Schlüssel und eigener Anzeige-Form: Die
// Kopf-Datei trägt zwei Datensätze, einer davon ohne Anzeige-Text und in
// Kurzform der Kennung; das Folge-Segment trägt den dritten und den
// schließenden Zaun.
const KOPF = [
  '---',
  'doc-part: v1|1|Kunden',
  'db-table:',
  '  fields:',
  '    - name: kuerzel',
  '    - name: name',
  '    - name: ort',
  '  key: kuerzel',
  '  display: name',
  '  lastId: 3',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| ZED',
  '| zeta AG',
  '| Basel',
  '|- id="r-2"',
  '| LEER',
  '|',
  '| Bern',
].join('\n');

const SEGMENT = [
  '---',
  'doc-part: v1|2|Kunden',
  '---',
  '|- id="r-00003"',
  '| ALP',
  '| Alpha GmbH',
  '| Chur',
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

// Eine Tabelle ohne fachlichen Schlüssel und ohne Anzeige-Form.
function tabelleOhneSchluessel(wurzel) {
  return lege(
    wurzel,
    'Messwerte.md',
    [
      '---',
      'db-table:',
      '  fields:',
      '    - name: wert',
      '      type: number',
      '  lastId: 2',
      '---',
      '',
      '```perspective-records',
      '|- id="r-00002"',
      '| 7',
      '|- id="r-00001"',
      '| 3',
      '```',
      '',
    ].join('\n'),
  );
}

// Die Tabellen-Sicht des Index, wie der Katalog sie liest: Kopf-Dateien mit
// ihrer Marke `table`.
function sichtFuer(...kopfDateien) {
  return { dbKindsPerFile: new Map(kopfDateien.map((p) => [p, ['table']])) };
}

function registriere({ datenbankAktiv = () => true, ohneTor = false, sicht = null } = {}) {
  const kanaele = new Map();
  const anstoesse = [];
  const deps = {
    areaRootForEvent: (event) => (event && event.wurzel) || null,
    backlinks: {
      ensureIndexForDemand: (...args) => anstoesse.push(args),
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
  return { kanaele, anstoesse };
}

function kanal(optionen) {
  return registriere(optionen).kanaele.get('database:datensaetze');
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

// Die Gestalt der Abweisung ohne Zugriff, abgelesen am Vorbild-Kanal.
async function gestaltOhneZugriff() {
  return registriere().kanaele.get('database:changeLog')({}, undefined);
}

// --- Registrierung und Brücke ------------------------------------------------------------

describe('database:datensaetze: Registrierung und Brücke (4T-001942, B1)', () => {
  it('registriert den Kanal neben den sieben bestehenden', () => {
    expect([...registriere().kanaele.keys()].sort()).toEqual([
      'database:auftrag',
      'database:changeLog',
      'database:datensaetze',
      'database:datensatz',
      // 4T-001944 (Epic 3E-000257): die Konsistenz-Prüfung über den Bestand.
      'database:konsistenz',
      // 4T-001943 (Epic 3E-000257): die Masken-Datei herausschreiben.
      'database:maskeSchreiben',
      'database:neuanlage',
      'database:overview',
      'database:sperre',
      'database:table',
      // 4T-001945 (Epic 3E-000257): der Verwendungsnachweis.
      'database:verwendung',
    ]);
  });

  it('bindet die Brücke an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = { tabelle: 'Kunden' };
    expect(await bruecke.databaseDatensaetze(params)).toEqual({ name: 'database:datensaetze' });
    expect(invoke).toHaveBeenCalledWith('database:datensaetze', params);
    expect(invoke.mock.calls[0][1]).toBe(params);
  });
});

// --- AK1: die Liste ----------------------------------------------------------------------

describe('database:datensaetze: die Liste der Datensätze (AK1)', () => {
  it('liefert alle Segmente mit Kennung, Anzeige-Form und Schlüssel, sortiert', async () => {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const antwort = await kanal({ sicht: sichtFuer(kopf) })(ereignis(wurzel), {
      tabelle: 'Kunden',
    });
    expect(antwort).toEqual({
      status: 'ready',
      tabelle: 'Kunden',
      pfad: kopf,
      display: 'name',
      keyEinteilig: true,
      // Nach Anzeige-Form ohne Groß-/Kleinschreibung; die leere Anzeige zuletzt;
      // die Kurzform der Kennung aufgefüllt; der Trennabstand vor dem Zaun
      // gehört nicht zum Wert der letzten Zelle.
      datensaetze: [
        { kennung: 'r-00003', anzeige: 'Alpha GmbH', schluessel: 'ALP' },
        { kennung: 'r-00001', anzeige: 'zeta AG', schluessel: 'ZED' },
        { kennung: 'r-00002', anzeige: '', schluessel: 'LEER' },
      ],
    });
  });

  it('nimmt ohne display den einteiligen Schlüssel als Anzeige-Form', async () => {
    const wurzel = neueWurzel();
    const kopf = lege(wurzel, 'Kunden.md', KOPF.replace('  display: name\n', ''));
    const antwort = await liesDatensatzListe({
      fsp: fs.promises,
      wurzel,
      sicht: sichtFuer(kopf),
      tabelle: 'Kunden',
    });
    expect(antwort.display).toBe(null);
    expect(antwort.keyEinteilig).toBe(true);
    // Ohne Folge-Segment: zwei Datensätze aus der Kopf-Datei.
    expect(antwort.datensaetze).toEqual([
      { kennung: 'r-00002', anzeige: 'LEER', schluessel: 'LEER' },
      { kennung: 'r-00001', anzeige: 'ZED', schluessel: 'ZED' },
    ]);
  });

  it('liefert für eine Tabelle ohne Schlüssel und Anzeige-Form nur die Kennungen', async () => {
    const wurzel = neueWurzel();
    const kopf = tabelleOhneSchluessel(wurzel);
    const antwort = await kanal({ sicht: sichtFuer(kopf) })(ereignis(wurzel), {
      tabelle: 'Messwerte',
    });
    expect(antwort.status).toBe('ready');
    expect(antwort.keyEinteilig).toBe(false);
    expect(antwort.display).toBe(null);
    // Gleiche (leere) Anzeige: Die Nummer der Kennung entscheidet.
    expect(antwort.datensaetze).toEqual([
      { kennung: 'r-00001', anzeige: '', schluessel: null },
      { kennung: 'r-00002', anzeige: '', schluessel: null },
    ]);
  });

  it('meldet einen mehrteiligen Schlüssel als nicht einteilig', async () => {
    const wurzel = neueWurzel();
    const kopf = lege(wurzel, 'Kunden.md', KOPF.replace('  key: kuerzel', '  key: [kuerzel, ort]'));
    const antwort = await liesDatensatzListe({
      fsp: fs.promises,
      wurzel,
      sicht: sichtFuer(kopf),
      tabelle: 'Kunden',
    });
    expect(antwort.keyEinteilig).toBe(false);
    expect(antwort.datensaetze.map((d) => d.schluessel)).toEqual([null, null]);
  });

  it('löst die Tabelle über Namen ohne Rücksicht auf die Schreibung, absoluten und relativen Pfad auf', async () => {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const handler = kanal({ sicht: sichtFuer(kopf) });
    for (const angabe of ['Kunden', 'kunden', kopf, 'Kunden.md']) {
      const antwort = await handler(ereignis(wurzel), { tabelle: angabe });
      expect(antwort.status, angabe).toBe('ready');
      expect(antwort.pfad, angabe).toBe(kopf);
    }
  });

  it('liest frisch: Eine Änderung von Hand erscheint beim nächsten Aufruf', async () => {
    const wurzel = neueWurzel();
    const { kopf, segment } = tabelle(wurzel);
    const handler = kanal({ sicht: sichtFuer(kopf) });
    await handler(ereignis(wurzel), { tabelle: 'Kunden' });
    fs.writeFileSync(
      segment,
      SEGMENT.replace('| Chur\n', '| Chur\n|- id="r-00004"\n| BET\n| Beta KG\n| Aarau\n'),
      'utf8',
    );
    const antwort = await handler(ereignis(wurzel), { tabelle: 'Kunden' });
    expect(antwort.datensaetze.map((d) => d.kennung)).toEqual([
      'r-00003',
      'r-00004',
      'r-00001',
      'r-00002',
    ]);
  });

  it('meldet eine unbekannte Tabelle und eine Datei ohne Definition als Fehlerlage', async () => {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const notiz = lege(wurzel, 'Notiz.md', '# Nur eine Notiz\n');
    // Die Notiz steht in der Sicht, als wäre sie eine Tabelle gewesen.
    const handler = kanal({ sicht: sichtFuer(kopf, notiz) });
    expect(await handler(ereignis(wurzel), { tabelle: 'Lieferanten' })).toEqual({
      status: 'error',
      code: LAGEN.tabelleUnbekannt,
    });
    expect(await handler(ereignis(wurzel), { tabelle: 'Notiz' })).toEqual({
      status: 'error',
      code: LAGEN.tabelleUnbekannt,
    });
  });
});

// --- Fail-closed -------------------------------------------------------------------------

describe('database:datensaetze: fail-closed (B1)', () => {
  it('weist ungültige Parameter, fehlenden Bereich und fehlende Sicht ohne Dateizugriff ab', async () => {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const ohne = await gestaltOhneZugriff();
    const lesen = vi.spyOn(fs.promises, 'readFile');
    try {
      const handler = kanal({ sicht: sichtFuer(kopf) });
      for (const params of [undefined, null, {}, { tabelle: '' }, { tabelle: 5 }, []]) {
        expect(await handler(ereignis(wurzel), params)).toEqual(ohne);
      }
      expect(await handler(ereignis(null), { tabelle: 'Kunden' })).toEqual(ohne);
      expect(await kanal()(ereignis(wurzel), { tabelle: 'Kunden' })).toEqual(ohne);
      expect(lesen).not.toHaveBeenCalled();
    } finally {
      lesen.mockRestore();
    }
  });

  it('stößt den Index an wie der Auftrags-Kanal', async () => {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const { kanaele, anstoesse } = registriere({ sicht: sichtFuer(kopf) });
    await kanaele.get('database:datensaetze')(ereignis(wurzel), { tabelle: 'Kunden' });
    expect(anstoesse).toEqual([[null, '1:database', wurzel]]);
  });

  it('prüft die Lage am aufgelösten Pfad: eine Tabelle außerhalb des Bereichs wird abgewiesen', async () => {
    const wurzel = neueWurzel();
    const fremd = neueWurzel();
    const { kopf } = tabelle(fremd);
    // Die Sicht nennt eine Tabelle, die nicht unter der Wurzel des Fensters liegt.
    const handler = kanal({ sicht: sichtFuer(kopf) });
    expect(await handler(ereignis(wurzel), { tabelle: 'Kunden' })).toEqual(
      await gestaltOhneZugriff(),
    );
    expect(await handler(ereignis(wurzel), { tabelle: kopf })).toEqual(await gestaltOhneZugriff());
  });

  it('antwortet im Aus-Zustand der Erweiterung und ohne Tor ohne Zugriff', async () => {
    const wurzel = neueWurzel();
    const { kopf } = tabelle(wurzel);
    const ohne = await gestaltOhneZugriff();
    const aus = kanal({ sicht: sichtFuer(kopf), datenbankAktiv: () => false });
    expect(await aus(ereignis(wurzel), { tabelle: 'Kunden' })).toEqual(ohne);
    const ohneTor = kanal({ sicht: sichtFuer(kopf), ohneTor: true });
    expect(await ohneTor(ereignis(wurzel), { tabelle: 'Kunden' })).toEqual(ohne);
  });

  it('verlangt fsp und meldet eine fehlende Wurzel als Lage', async () => {
    await expect(liesDatensatzListe({ wurzel: 'x', tabelle: 'y' })).rejects.toThrow(TypeError);
    expect(await liesDatensatzListe({ fsp: fs.promises, wurzel: '', tabelle: 'y' })).toEqual({
      status: 'error',
      code: LAGEN.wurzelFehlt,
    });
  });
});

// --- AK5: die Kosten ---------------------------------------------------------------------

// Eine Tabelle mit zweitausend Datensätzen in einer Datei, das Mengengerüst aus
// dem Lösungsansatz des Vorgangs.
function grosseTabelle(wurzel) {
  const zeilen = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: kuerzel',
    '    - name: name',
    '    - name: ort',
    '  key: kuerzel',
    '  display: name',
    '  lastId: 2000',
    '---',
    '',
    '```perspective-records',
  ];
  for (let i = 1; i <= 2000; i++) {
    zeilen.push(
      `|- id="r-${String(i).padStart(5, '0')}"`,
      `| K${i}`,
      `| Kunde ${i}`,
      `| Ort ${i % 17}`,
    );
  }
  zeilen.push('```', '');
  return lege(wurzel, 'Kunden.md', zeilen.join('\n'));
}

describe('database:datensaetze: zweitausend Datensätze (AK5, B3)', () => {
  it('liefert alle zweitausend Datensätze vollständig und sortiert', async () => {
    const wurzel = neueWurzel();
    const kopf = grosseTabelle(wurzel);
    const antwort = await kanal({ sicht: sichtFuer(kopf) })(ereignis(wurzel), {
      tabelle: 'Kunden',
    });
    expect(antwort.status).toBe('ready');
    expect(antwort.datensaetze).toHaveLength(2000);
    expect(antwort.datensaetze[0]).toEqual({
      kennung: 'r-00001',
      anzeige: 'Kunde 1',
      schluessel: 'K1',
    });
    expect(new Set(antwort.datensaetze.map((d) => d.kennung)).size).toBe(2000);
  });
});

// --- Kosten-Messung am Mengengerüst (AK5) -------------------------------------------------

// Nach dem Vorbild des Lösch-Schutzes (`db-regel-loeschschutz.test.js`): Die
// Messung läuft nur auf Zuruf und nie unter dem Gate, weil eine Zeit-Grenze
// unter fremder Last auf dem Rechner zum Flake würde. Aufruf:
// `EM4ME_MESSLAUF=1 npx vitest run test/unit/db-datensaetze-kanal.test.js`.
describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf Wertehilfe (4T-001942, AK5)', () => {
  it('misst das Lesen der Liste bei zweitausend Datensätzen', async () => {
    const wurzel = neueWurzel();
    const kopf = grosseTabelle(wurzel);
    const handler = kanal({ sicht: sichtFuer(kopf) });

    // Ein Aufwärm-Lauf, dann der Median aus fünf Läufen.
    await handler(ereignis(wurzel), { tabelle: 'Kunden' });
    const dauern = [];
    for (let lauf = 0; lauf < 5; lauf++) {
      const start = performance.now();
      const antwort = await handler(ereignis(wurzel), { tabelle: 'Kunden' });
      dauern.push(performance.now() - start);
      expect(antwort.datensaetze).toHaveLength(2000);
    }
    dauern.sort((a, b) => a - b);

    // Die Zeile ist das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
    // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
    // eslint-disable-next-line no-console
    console.log(
      `Messlauf Wertehilfe: 2000 Datensätze, Median ${dauern[2].toFixed(1)} ms ` +
        `(Läufe ${dauern.map((d) => d.toFixed(1)).join(', ')} ms)`,
    );
  });
});
