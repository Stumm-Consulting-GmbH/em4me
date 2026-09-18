// 4T-001510 (Epic 3E-000250, Baustein T1): Unit-Tests des Katalogs — die
// Tabellen-Liste aus den Index-Marken, die Definition einer einzelnen Tabelle,
// die Fehlerlagen, die Aktualität ohne Neustart und der Nachweis, dass die
// Datensätze dabei nicht gelesen werden.
//
// Der Katalog bekommt Dateizugriff und Index-Sicht injiziert; beide sind hier
// nachgestellt. Das ist dieselbe Prüf-Form wie beim Profil-Katalog, dessen
// Vorbild der Katalog in der Revalidierung folgt.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDatabaseCatalogCache,
  katalogUeberblick,
  tabellenDefinition,
  tabellenName,
} from '../../src/main/database/table-catalog.js';
import {
  KOPF_BYTES,
  leseFrontmatterKopf,
  lesezaehler,
  lesezaehlerZuruecksetzen,
} from '../../src/main/database/frontmatter-kopf.js';
import { parseContent } from '../../src/main/index/parse.js';
import { DB_TABLE_KEY } from '../../src/shared/database/table-definition.js';
import { DB_DATABASE_KEY } from '../../src/shared/database/database-steckbrief.js';

// --- Nachgestellter Dateizugriff ----------------------------------------------------

// Ein Dateisystem aus einer Map Pfad -> Text. Es zählt seine Zugriffe, damit
// die Prüfungen «wirkt ohne Neustart» und «liest die Datensätze nicht» am
// Verhalten und nicht an der Laufzeit hängen.
function fakeFs(dateien) {
  const stand = new Map(Object.entries(dateien).map(([p, text]) => [p, { text, mtimeMs: 1 }]));
  const zaehler = { stat: 0, readFile: 0, open: 0, gelesenBytes: 0 };
  const fsp = {
    async stat(p) {
      zaehler.stat += 1;
      const d = stand.get(p);
      if (!d) throw new Error('ENOENT');
      return { mtimeMs: d.mtimeMs, size: Buffer.byteLength(d.text, 'utf8') };
    },
    async readFile(p) {
      zaehler.readFile += 1;
      const d = stand.get(p);
      if (!d) throw new Error('ENOENT');
      zaehler.gelesenBytes += Buffer.byteLength(d.text, 'utf8');
      return d.text;
    },
    async open(p) {
      zaehler.open += 1;
      const d = stand.get(p);
      if (!d) throw new Error('ENOENT');
      const puffer = Buffer.from(d.text, 'utf8');
      return {
        async read(ziel, offset, laenge, position) {
          const teil = puffer.subarray(position, position + laenge);
          teil.copy(ziel, offset);
          zaehler.gelesenBytes += teil.length;
          return { bytesRead: teil.length };
        },
        async close() {},
      };
    },
  };
  return {
    fsp,
    zaehler,
    aendere(p, text) {
      const d = stand.get(p);
      stand.set(p, { text, mtimeMs: (d ? d.mtimeMs : 0) + 1 });
    },
  };
}

// Eine Index-Sicht ist für den Katalog allein die Marken-Zuordnung.
function sichtMit(eintraege) {
  return { dbKindsPerFile: new Map(Object.entries(eintraege)) };
}

function tabellenDatei(felder, weiteres = '') {
  return `---\n${DB_TABLE_KEY}:\n  fields:\n${felder
    .map((f) => `    - name: ${f.name}\n      type: ${f.type}`)
    .join('\n')}\n${weiteres}---\n\nText der Tabelle.\n`;
}

const PERSONEN = '/db/Personen.md';
const FIRMEN = '/db/Firmen.md';
const STECKBRIEF = '/db/Datenbank.md';

const DATEIEN = {
  [PERSONEN]: tabellenDatei([
    { name: 'nachname', type: 'string' },
    { name: 'alter', type: 'number' },
  ]),
  [FIRMEN]: tabellenDatei([{ name: 'firma', type: 'string' }]),
  [STECKBRIEF]: `---\n${DB_DATABASE_KEY}:\n  name: Mini-CRM\n  schemaVersion: "1.0"\n  fallbackLocale: de\n---\n\nBeschreibung.\n`,
};

const SICHT = sichtMit({
  [PERSONEN]: ['table'],
  [FIRMEN]: ['table'],
  [STECKBRIEF]: ['database'],
});

let cache;
beforeEach(() => {
  cache = createDatabaseCatalogCache();
  lesezaehlerZuruecksetzen();
});

describe('Katalog: Überblick (AK1, AK2)', () => {
  it('nennt die Tabellen des Bestands und den Steckbrief', async () => {
    const { fsp } = fakeFs(DATEIEN);
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(u.status).toBe('ready');
    expect(u.tabellen.map((t) => t.name).sort()).toEqual(['Firmen', 'Personen']);
    expect(u.steckbrief.name).toBe('Mini-CRM');
    expect(u.steckbrief.schemaVersion).toBe('1.0');
    expect(u.hints).toEqual([]);
  });

  it('nennt je Tabelle die Zahl ihrer Felder, aber nicht die Felder selbst', async () => {
    // Der Überblick ist die Liste, nicht die Definition — wer Spalten braucht,
    // fragt die zweite Auskunft.
    const { fsp } = fakeFs(DATEIEN);
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    const personen = u.tabellen.find((t) => t.name === 'Personen');
    expect(personen.felder).toBe(2);
    expect(personen.fields).toBeUndefined();
  });

  it('liefert eine leere Liste, wenn keine Datei eine Marke trägt', async () => {
    const { fsp } = fakeFs(DATEIEN);
    const u = await katalogUeberblick({ sicht: sichtMit({}), status: 'ready', fsp, cache });
    expect(u.tabellen).toEqual([]);
    expect(u.steckbrief).toBeNull();
  });

  it('kommt ohne Steckbrief aus', async () => {
    const { fsp } = fakeFs(DATEIEN);
    const u = await katalogUeberblick({
      sicht: sichtMit({ [PERSONEN]: ['table'] }),
      status: 'ready',
      fsp,
      cache,
    });
    expect(u.steckbrief).toBeNull();
    expect(u.tabellen).toHaveLength(1);
    expect(u.hints).toEqual([]);
  });
});

describe('Katalog: Definition einer Tabelle (AK1)', () => {
  it('liefert Felder und Typen normalisiert', async () => {
    const { fsp } = fakeFs(DATEIEN);
    const d = await tabellenDefinition({
      sicht: SICHT,
      status: 'ready',
      tabelle: 'Personen',
      fsp,
      cache,
    });
    expect(d.gefunden).toBe(true);
    expect(d.name).toBe('Personen');
    expect(d.fields).toEqual([
      { name: 'nachname', type: 'string' },
      { name: 'alter', type: 'number' },
    ]);
  });

  it('nimmt auch den Pfad statt des Namens', async () => {
    const { fsp } = fakeFs(DATEIEN);
    const d = await tabellenDefinition({
      sicht: SICHT,
      status: 'ready',
      tabelle: PERSONEN,
      fsp,
      cache,
    });
    expect(d.gefunden).toBe(true);
    expect(d.path).toBe(PERSONEN);
  });

  it('meldet eine unbekannte Tabelle als nicht gefunden statt als leere Tabelle', async () => {
    // Eine erfundene leere Definition ließe eine Prüfung bestehen, die nicht
    // bestehen darf.
    const { fsp } = fakeFs(DATEIEN);
    for (const gesucht of ['Gibt-es-nicht', '', null]) {
      const d = await tabellenDefinition({
        sicht: SICHT,
        status: 'ready',
        tabelle: gesucht,
        fsp,
        cache,
      });
      expect(d.gefunden, String(gesucht)).toBe(false);
      expect(d.fields).toBeUndefined();
    }
  });

  it('leitet den Namen aus dem Dateinamen ab', () => {
    expect(tabellenName('/db/Verkaufschancen.md')).toBe('Verkaufschancen');
    expect(tabellenName('/db/Personen.MD')).toBe('Personen');
  });
});

describe('Katalog: Fehlerlagen (AK4)', () => {
  it('hält eine Tabelle mit fehlerhafter Definition in der Liste und meldet sie', async () => {
    // Die weiche Linie aus E22: Die Datei bleibt lesbar, sie ist nur keine
    // benutzbare Tabelle. Verschwinden darf sie nicht.
    const kaputt = `---\n${DB_TABLE_KEY}:\n  fields:\n    - name: menge\n      type: formula\n---\n`;
    const { fsp } = fakeFs({ ...DATEIEN, [FIRMEN]: kaputt });
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    const firmen = u.tabellen.find((t) => t.name === 'Firmen');
    expect(firmen).toBeTruthy();
    expect(firmen.hints.map((h) => h.code)).toEqual(['typeComputed']);
  });

  it('meldet einen unlesbaren Metadaten-Block, ohne abzubrechen', async () => {
    const yamlKaputt = `---\n${DB_TABLE_KEY}: [\n---\n\nText.\n`;
    const { fsp } = fakeFs({ ...DATEIEN, [FIRMEN]: yamlKaputt });
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(u.tabellen).toHaveLength(2);
    const firmen = u.tabellen.find((t) => t.name === 'Firmen');
    expect(firmen.hints.map((h) => h.code)).toContain('yaml');
  });

  it('meldet zwei Tabellen desselben Namens an beiden, ohne eine zu verschlucken', async () => {
    const zweite = '/db/unterordner/Personen.md';
    const { fsp } = fakeFs({
      ...DATEIEN,
      [zweite]: tabellenDatei([{ name: 'x', type: 'string' }]),
    });
    const u = await katalogUeberblick({
      sicht: sichtMit({ [PERSONEN]: ['table'], [zweite]: ['table'] }),
      status: 'ready',
      fsp,
      cache,
    });
    expect(u.tabellen).toHaveLength(2);
    for (const t of u.tabellen) expect(t.hints.map((h) => h.code)).toContain('duplicateTable');
  });

  it('meldet einen zweiten Steckbrief und benutzt den ersten', async () => {
    const zweiter = '/db/Zweite-Datenbank.md';
    const { fsp } = fakeFs({
      ...DATEIEN,
      [zweiter]: `---\n${DB_DATABASE_KEY}:\n  name: Andere\n---\n`,
    });
    const u = await katalogUeberblick({
      sicht: sichtMit({ [STECKBRIEF]: ['database'], [zweiter]: ['database'] }),
      status: 'ready',
      fsp,
      cache,
    });
    expect(u.steckbrief.name).toBe('Mini-CRM');
    expect(u.hints.map((h) => h.code)).toEqual(['duplicateDatabase']);
  });

  it('übergeht eine Datei, die der Index kennt und die es nicht mehr gibt', async () => {
    const { fsp } = fakeFs({ [PERSONEN]: DATEIEN[PERSONEN] });
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(u.tabellen.map((t) => t.name)).toEqual(['Firmen', 'Personen']);
    // Die verschwundene Datei erscheint ohne Felder statt als Absturz.
    expect(u.tabellen.find((t) => t.name === 'Firmen').felder).toBe(0);
  });
});

describe('Katalog: Aktualität ohne Neustart (AK5)', () => {
  it('liest eine unveränderte Datei kein zweites Mal', async () => {
    const { fsp, zaehler } = fakeFs(DATEIEN);
    await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    const nachErstem = zaehler.readFile;
    await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(zaehler.readFile).toBe(nachErstem);
  });

  it('sieht eine geänderte Definition ohne Neustart', async () => {
    const { fsp, aendere } = fakeFs(DATEIEN);
    const vorher = await tabellenDefinition({
      sicht: SICHT,
      status: 'ready',
      tabelle: 'Firmen',
      fsp,
      cache,
    });
    expect(vorher.fields).toHaveLength(1);
    aendere(
      FIRMEN,
      tabellenDatei([
        { name: 'firma', type: 'string' },
        { name: 'ort', type: 'string' },
      ]),
    );
    const nachher = await tabellenDefinition({
      sicht: SICHT,
      status: 'ready',
      tabelle: 'Firmen',
      fsp,
      cache,
    });
    expect(nachher.fields).toHaveLength(2);
  });

  it('zeigt den ungespeicherten Stand einer offenen Tabelle', async () => {
    // Puffer-Overlay-Zusicherung (E25): Was im Fenster steht, gilt vor dem
    // Stand auf der Platte.
    const { fsp } = fakeFs(DATEIEN);
    const bufferTextFor = (p) =>
      p === FIRMEN
        ? tabellenDatei([
            { name: 'firma', type: 'string' },
            { name: 'ungespeichert', type: 'string' },
          ])
        : null;
    const d = await tabellenDefinition({
      sicht: SICHT,
      status: 'ready',
      tabelle: 'Firmen',
      fsp,
      cache,
      bufferTextFor,
    });
    expect(d.fields.map((f) => f.name)).toEqual(['firma', 'ungespeichert']);
  });

  it('reicht einen nicht bereiten Index durch, statt eine leere Datenbank zu melden', async () => {
    // «Noch nicht bereit» und «keine Tabellen» sind zwei Aussagen; der Katalog
    // bekommt in diesem Fall gar keine Sicht (der Kanal reicht den Status durch).
    const { fsp } = fakeFs(DATEIEN);
    const u = await katalogUeberblick({ sicht: sichtMit({}), status: 'indexing', fsp, cache });
    expect(u.status).toBe('indexing');
    expect(u.tabellen).toEqual([]);
  });
});

describe('Katalog: die Datensätze bleiben ungelesen (AK6)', () => {
  it('liest von einer großen Tabelle nur den Kopf', async () => {
    const gross = tabellenDatei([{ name: 'a', type: 'string' }]) + 'x'.repeat(KOPF_BYTES * 3);
    const { fsp, zaehler } = fakeFs({ [PERSONEN]: gross });
    const d = await tabellenDefinition({
      sicht: sichtMit({ [PERSONEN]: ['table'] }),
      status: 'ready',
      tabelle: 'Personen',
      fsp,
      cache,
    });
    expect(d.fields).toHaveLength(1);
    expect(zaehler.readFile).toBe(0);
    expect(zaehler.open).toBe(1);
    // Gelesen wurde der Kopf, nicht die Datei: ein Viertel ihrer Größe.
    expect(zaehler.gelesenBytes).toBeLessThanOrEqual(KOPF_BYTES);
    expect(zaehler.gelesenBytes).toBeLessThan(Buffer.byteLength(gross, 'utf8') / 2);
  });

  it('liest eine kleine Datei ganz, weil ein zweiter Systemaufruf teurer wäre', async () => {
    const { fsp, zaehler } = fakeFs(DATEIEN);
    await tabellenDefinition({ sicht: SICHT, status: 'ready', tabelle: 'Personen', fsp, cache });
    expect(zaehler.open).toBe(0);
    expect(zaehler.readFile).toBe(1);
  });

  it('fällt auf die ganze Datei zurück, wenn der Metadaten-Block über den Kopf hinausreicht', async () => {
    const vieleFelder = Array.from({ length: 4000 }, (_, i) => ({
      name: `feld${i}`,
      type: 'string',
    }));
    const { fsp, zaehler } = fakeFs({ [PERSONEN]: tabellenDatei(vieleFelder) });
    const d = await tabellenDefinition({
      sicht: sichtMit({ [PERSONEN]: ['table'] }),
      status: 'ready',
      tabelle: 'Personen',
      fsp,
      cache,
    });
    expect(d.fields).toHaveLength(4000);
    expect(zaehler.open).toBe(1);
    expect(zaehler.readFile).toBe(1);
  });

  it('rührt die Platte nicht an, wenn ein Puffer-Stand vorliegt', async () => {
    const { fsp, zaehler } = fakeFs(DATEIEN);
    lesezaehlerZuruecksetzen();
    await leseFrontmatterKopf({
      absPath: PERSONEN,
      fsp,
      bufferTextFor: () => DATEIEN[PERSONEN],
    });
    expect(zaehler.stat + zaehler.readFile + zaehler.open).toBe(0);
    expect(lesezaehler().overlay).toBe(1);
  });
});

describe('Index-Marke: welche Dateien der Katalog überhaupt betrachtet', () => {
  it('merkt sich Tabelle und Steckbrief, nicht ihren Inhalt', () => {
    const tabelle = parseContent('/db/Personen.md', DATEIEN[PERSONEN]);
    expect(tabelle.dbKinds).toEqual(['table']);
    // Der Behälter ist ein Objekt und fällt aus den abfragbaren Properties;
    // die Definition holt der Katalog aus der Datei.
    expect(tabelle.properties[DB_TABLE_KEY]).toBeUndefined();

    const steckbrief = parseContent('/db/Datenbank.md', DATEIEN[STECKBRIEF]);
    expect(steckbrief.dbKinds).toEqual(['database']);
  });

  it('führt beide Marken, wenn eine Datei beides erklärt', () => {
    const beides = `---\n${DB_TABLE_KEY}:\n  fields: []\n${DB_DATABASE_KEY}:\n  name: X\n---\n`;
    expect(parseContent('/db/Beides.md', beides).dbKinds).toEqual(['table', 'database']);
  });

  it('lässt ein gewöhnliches Dokument ohne Marke', () => {
    expect(parseContent('/db/Notiz.md', '---\ntitle: Notiz\n---\n\nText.\n').dbKinds).toEqual([]);
    expect(parseContent('/db/Ohne.md', 'Nur Text.\n').dbKinds).toEqual([]);
  });
});
