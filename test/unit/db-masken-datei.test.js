// 4T-001943 (Epic 3E-000257, Bauplan B1 bis B3, B5; AK1 bis AK5): Die Maske als
// Datei herausschreiben und die Masken-Datei lesen.
//
// Gemessen wird am echten Modul, am echten Handler über die echte
// Registrier-Funktion und am echten Dateisystem im Temp-Ordner (Muster
// `db-datensatz-kanal.test.js`): das Herausschreiben mit Frontmatter und
// erzeugtem Körper, das Nicht-Überschreiben, die Absperrung des Kanals, die
// Marke `form` der geschriebenen Datei, der Körper aus der Datei samt Hinweisen
// und seine Rückkehr zur erzeugten Maske nach dem Löschen. Dazu der
// Speicher-Auftrag des Renderers: Ein Feld, das der Körper nicht nennt, bleibt
// unberührt. Die Zuordnung im Katalog prüft `db-katalog.test.js`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerDatabaseIpc } from '../../src/main/ipc/database.js';
import { datenbankBruecke } from '../../src/main/preload-datenbank.js';
import {
  FORM_DATEI_VORHANDEN,
  maskenPfad,
  schreibeMaskenDatei,
} from '../../src/main/database/masken-datei.js';
import { liesDatensatz } from '../../src/main/database/datensatz-auskunft.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import { datenbankMarken } from '../../src/shared/database/behaelter.js';
import { parseFormDefinition } from '../../src/shared/database/table-definition.js';
import { erzeugeMaskenKoerper } from '../../src/shared/database/form-body.js';
import { HINWEIS_META } from '../../src/shared/database/table-hinweise.js';
import {
  baueAuftrag,
  erzeugeSpeicherAblauf,
} from '../../src/renderer/modules/database/masken-speichern.js';

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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-masken-datei-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function lege(wurzel, name, text) {
  const pfad = path.join(wurzel, name);
  fs.writeFileSync(pfad, text, 'utf8');
  return pfad;
}

const TABELLE = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: name',
  '      label:',
  '        de: Kundenname',
  '        en: Customer',
  '    - name: ort',
  '    - name: anzahl',
  '      type: number',
  '  lastId: 2',
  '---',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna',
  '| Basel',
  '| 3',
  '|- id="r-00002"',
  '| Bert',
  '| Bern',
  '| 4',
  '',
  '```',
  '',
].join('\n');

// Eine Masken-Datei, wie ein Anwender sie nach dem Herausschreiben gestaltet:
// eine Überschrift zwischen zwei Feldern, ein Feld weggelassen, dazu ein fremder
// Platzhalter und ein unbekanntes Feld, die beide Text bleiben.
const GESTALTET = [
  '---',
  'title: Kunden Form',
  'db-form:',
  '  table: Kunden',
  '---',
  '',
  '# Kunden',
  '',
  '**Name:** {{field:name}}',
  '',
  '## Wohnort',
  '',
  '{{field:ort}}',
  '',
  '{{value:summe}} {{field:telefon}}',
  '',
].join('\n');

// Die Sicht des Index, wie sie die Kanäle von `lage()` bekommen: nur die
// Marken-Zuordnung.
function sichtMit(eintraege) {
  return { dbKindsPerFile: new Map(Object.entries(eintraege)) };
}

function registriere({ datenbankAktiv = () => true, sicht = null } = {}) {
  const kanaele = new Map();
  registerDatabaseIpc((kanal, fn) => kanaele.set(kanal, fn), {
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
    datenbankAktiv,
  });
  return kanaele;
}

function ereignis(wurzel) {
  return { wurzel, sender: { id: 1 } };
}

async function gestaltOhneZugriff() {
  return registriere().get('database:changeLog')({}, undefined);
}

// --- B1: Herausschreiben -------------------------------------------------------------------

describe('Maske als Datei herausschreiben (B1, AK1)', () => {
  it('legt die Datei neben der Tabelle an, mit Titel, Behälter und erzeugtem Körper', async () => {
    const wurzel = neueWurzel();
    const kopf = lege(wurzel, 'Kunden.md', TABELLE);
    const ergebnis = await schreibeMaskenDatei({
      fsp: fs.promises,
      wurzel,
      tabelle: 'Kunden.md',
      sprache: 'de',
    });
    const ziel = path.join(wurzel, 'Kunden Form.md');
    expect(ergebnis).toEqual({ status: 'ready', pfad: ziel });
    expect(maskenPfad(kopf)).toBe(ziel);

    const fm = extractFrontmatter(fs.readFileSync(ziel, 'utf8'));
    expect(fm.parseError).toBeNull();
    expect(fm.data.title).toBe('Kunden Form');
    expect(parseFormDefinition(fm.data)).toEqual({ istMaske: true, table: 'Kunden', hints: [] });
    // Der Index erkennt die Datei an ihrer Marke, der Katalog findet sie darüber.
    expect(datenbankMarken(fm.data)).toEqual(['form']);
    expect(fm.body).toBe(
      `\n${erzeugeMaskenKoerper(
        {
          fields: [
            { name: 'name', label: { de: 'Kundenname', en: 'Customer' } },
            { name: 'ort' },
            { name: 'anzahl' },
          ],
        },
        { tabellenName: 'Kunden', sprache: 'de' },
      )}`,
    );
    expect(fm.body).toContain('**Kundenname:** {{field:name}}');
  });

  it('überschreibt eine vorhandene Datei nicht, sondern meldet sie', async () => {
    const wurzel = neueWurzel();
    lege(wurzel, 'Kunden.md', TABELLE);
    const ziel = lege(wurzel, 'Kunden Form.md', GESTALTET);
    const ergebnis = await schreibeMaskenDatei({
      fsp: fs.promises,
      wurzel,
      tabelle: 'Kunden.md',
    });
    expect(ergebnis).toEqual({ status: 'error', code: FORM_DATEI_VORHANDEN, pfad: ziel });
    expect(fs.readFileSync(ziel, 'utf8')).toBe(GESTALTET);
  });

  it('setzt einen Tabellen-Namen, der wie eine Zahl aussieht, in Anführung', async () => {
    const wurzel = neueWurzel();
    lege(wurzel, '2024.md', TABELLE);
    const ergebnis = await schreibeMaskenDatei({ fsp: fs.promises, wurzel, tabelle: '2024.md' });
    expect(ergebnis.status).toBe('ready');
    const fm = extractFrontmatter(fs.readFileSync(ergebnis.pfad, 'utf8'));
    expect(parseFormDefinition(fm.data).table).toBe('2024');
  });

  it('meldet ein Dokument ohne Definition als unbekannte Tabelle und schreibt nichts', async () => {
    const wurzel = neueWurzel();
    lege(wurzel, 'Notiz.md', '# Notiz\n');
    const ergebnis = await schreibeMaskenDatei({ fsp: fs.promises, wurzel, tabelle: 'Notiz.md' });
    expect(ergebnis).toEqual({ status: 'error', code: 'auftragTabelleUnbekannt' });
    expect(fs.existsSync(path.join(wurzel, 'Notiz Form.md'))).toBe(false);
  });
});

describe('database:maskeSchreiben: Kanal und Brücke (B1)', () => {
  it('bindet die Brücke an ihren Kanal und reicht die Parameter unverändert', async () => {
    const invoke = vi.fn(async (name) => ({ name }));
    const bruecke = datenbankBruecke({ invoke, on: vi.fn() });
    const params = { tabelle: 'Kunden.md', sprache: 'de' };
    expect(await bruecke.databaseMaskeSchreiben(params)).toEqual({
      name: 'database:maskeSchreiben',
    });
    expect(invoke).toHaveBeenCalledWith('database:maskeSchreiben', params);
  });

  it('schreibt über den Kanal im Bereich', async () => {
    const wurzel = neueWurzel();
    lege(wurzel, 'Kunden.md', TABELLE);
    const antwort = await registriere().get('database:maskeSchreiben')(ereignis(wurzel), {
      tabelle: 'Kunden.md',
      sprache: 'en',
    });
    expect(antwort).toEqual({ status: 'ready', pfad: path.join(wurzel, 'Kunden Form.md') });
    expect(fs.readFileSync(antwort.pfad, 'utf8')).toContain('**Customer:** {{field:name}}');
  });

  it('weist fail-closed ab, ohne eine Datei anzulegen', async () => {
    const wurzel = neueWurzel();
    lege(wurzel, 'Kunden.md', TABELLE);
    const gestalt = await gestaltOhneZugriff();
    const kanal = registriere().get('database:maskeSchreiben');
    const aus = registriere({ datenbankAktiv: () => false }).get('database:maskeSchreiben');
    const faelle = [
      await kanal(ereignis(wurzel), undefined),
      await kanal(ereignis(wurzel), { tabelle: '' }),
      await kanal(ereignis(null), { tabelle: 'Kunden.md' }),
      await kanal(ereignis(wurzel), { tabelle: '../Kunden.md' }),
      await kanal(ereignis(wurzel), { tabelle: 'Kunden.txt' }),
      await aus(ereignis(wurzel), { tabelle: 'Kunden.md' }),
    ];
    for (const antwort of faelle) expect(antwort).toEqual(gestalt);
    expect(fs.existsSync(path.join(wurzel, 'Kunden Form.md'))).toBe(false);
  });
});

// --- B3: Lesen -----------------------------------------------------------------------------

describe('Der Datensatz-Kanal liest den Körper aus der Masken-Datei (B3, AK3, AK5)', () => {
  function bestand() {
    const wurzel = neueWurzel();
    const kopf = lege(wurzel, 'Kunden.md', TABELLE);
    const maske = lege(wurzel, 'Kunden Form.md', GESTALTET);
    const sicht = sichtMit({ [kopf]: ['table'], [maske]: ['form'] });
    return { wurzel, kopf, maske, sicht };
  }

  it('liefert Quelle, Pfad, Text ohne Frontmatter, Segmente und Hinweise', async () => {
    const { wurzel, maske, sicht } = bestand();
    const antwort = await registriere({ sicht }).get('database:datensatz')(ereignis(wurzel), {
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
      sprache: 'de',
    });
    expect(antwort.status).toBe('ready');
    const { koerper } = antwort;
    expect(koerper.quelle).toBe('datei');
    expect(koerper.pfad).toBe(maske);
    expect(koerper.text.startsWith('\n# Kunden')).toBe(true);
    expect(koerper.text).not.toContain('db-form');
    // Die Überschrift steht zwischen den beiden Feldern; `anzahl` nennt die
    // Datei nicht, es erscheint nicht.
    const arten = koerper.segmente.map((s) => (s.art === 'feld' ? `feld:${s.name}` : 'md'));
    expect(arten).toEqual(['md', 'feld:name', 'md', 'feld:ort', 'md']);
    expect(koerper.segmente[2].text).toContain('## Wohnort');
    // Fremder Platzhalter und unbekanntes Feld bleiben Text und tragen die
    // Zeile der DATEI.
    const zeile = GESTALTET.split('\n').indexOf('{{value:summe}} {{field:telefon}}') + 1;
    expect(koerper.hints).toEqual([
      { code: 'formPlatzhalterUnbekannt', name: 'value:summe', zeile },
      { code: 'formFeldUnbekannt', name: 'telefon', zeile },
    ]);
    expect(koerper.segmente[4].text).toContain('{{value:summe}} {{field:telefon}}');
  });

  it('liest eine geänderte Datei frisch und kehrt nach dem Löschen zur erzeugten Maske zurück', async () => {
    const { wurzel, maske, sicht } = bestand();
    const kanal = registriere({ sicht }).get('database:datensatz');
    const frage = () =>
      kanal(ereignis(wurzel), { tabelle: 'Kunden.md', kennung: 'r-00002', sprache: 'de' });

    fs.writeFileSync(maske, GESTALTET.replace('## Wohnort', '## Anschrift'), 'utf8');
    const geaendert = await frage();
    expect(geaendert.koerper.segmente[2].text).toContain('## Anschrift');

    fs.rmSync(maske);
    const erzeugt = await frage();
    expect(erzeugt.koerper.quelle).toBe('erzeugt');
    expect(erzeugt.koerper.pfad).toBeNull();
    expect(erzeugt.koerper.segmente.filter((s) => s.art === 'feld').map((s) => s.name)).toEqual([
      'name',
      'ort',
      'anzahl',
    ]);
  });

  it('bleibt ohne Sicht bei der erzeugten Maske', async () => {
    const { wurzel } = bestand();
    const antwort = await liesDatensatz({
      fsp: fs.promises,
      wurzel,
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
    });
    expect(antwort.koerper.quelle).toBe('erzeugt');
  });

  it('nimmt eine Masken-Datei mit unbekannter Tabelle nicht', async () => {
    const { wurzel, kopf } = bestand();
    const fremd = lege(
      wurzel,
      'Andere Form.md',
      GESTALTET.replace('table: Kunden', 'table: Andere'),
    );
    const sicht = sichtMit({ [kopf]: ['table'], [fremd]: ['form'] });
    const antwort = await liesDatensatz({
      fsp: fs.promises,
      wurzel,
      tabelle: 'Kunden.md',
      kennung: 'r-00001',
      sicht,
    });
    expect(antwort.koerper.quelle).toBe('erzeugt');
  });

  it('führt die beiden Codes des Katalogs im Hinweis-Katalog', () => {
    expect(HINWEIS_META.formTabelleUnbekannt).toBeDefined();
    expect(HINWEIS_META.formMehrereDateien).toBeDefined();
  });
});

// --- B3: Speichern nennt nur die Felder des Körpers ------------------------------------------

describe('Der Speicher-Auftrag nennt nur die Felder des Körpers (B3, AK3)', () => {
  const ERWARTET = { name: 'Anna', ort: 'Basel', anzahl: '3' };

  it('lässt ein Feld unberührt, das der Körper nicht nennt', async () => {
    const seite = {
      tabellenPfad: 'Kunden.md',
      kennung: 'r-00001',
      neu: false,
      // `anzahl` ist geändert, steht aber nicht im Körper der Masken-Datei.
      entwurf: { name: 'Annette', ort: 'Basel', anzahl: '9' },
      daten: {
        fields: [{ name: 'name' }, { name: 'ort' }, { name: 'anzahl' }],
        erwartet: ERWARTET,
        koerper: {
          quelle: 'datei',
          segmente: [
            { art: 'feld', name: 'name' },
            { art: 'markdown', text: '## Wohnort' },
            { art: 'feld', name: 'ort' },
          ],
          hints: [],
        },
      },
      befunde: null,
      auftrag: null,
      loeschFrage: false,
      sendet: false,
      fokus: null,
    };
    const sende = vi.fn(async () => ({ ok: true }));
    const ablauf = erzeugeSpeicherAblauf({
      seite,
      sende,
      t: (key) => key,
      hat: () => false,
      sprache: () => 'de',
      schluessel: () => 'gegenstand',
      zeichne: vi.fn(),
      hinweis: vi.fn(),
      gelungen: vi.fn(),
      neuLaden: vi.fn(),
    });
    ablauf.speichern();
    await vi.waitFor(() => expect(sende).toHaveBeenCalledTimes(1));
    const anweisung = sende.mock.calls[0][0].anweisungen[0];
    expect(anweisung.werte).toEqual({ name: 'Annette' });
  });

  it('nimmt bei der Neuanlage nur die genannten Felder', () => {
    const auftrag = baueAuftrag({
      art: 'create',
      tabellenPfad: 'Kunden.md',
      kennung: 'r-00003',
      entwurf: { name: 'Carla', anzahl: '5' },
      felderDesKoerpers: ['name'],
    });
    expect(auftrag.anweisungen[0].werte).toEqual({ name: 'Carla' });
  });
});
