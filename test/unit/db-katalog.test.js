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
  zaehleAbfrageBloecke,
} from '../../src/main/database/table-catalog.js';
import {
  KOPF_BYTES,
  leseFrontmatterKopf,
  lesezaehler,
  lesezaehlerZuruecksetzen,
} from '../../src/main/database/frontmatter-kopf.js';
import { parseContent } from '../../src/main/index/parse.js';
import { DB_TABLE_KEY, DB_FORM_KEY } from '../../src/shared/database/table-definition.js';
import { DB_DATABASE_KEY } from '../../src/shared/database/database-steckbrief.js';
// 4T-002081: die vierte Marke, die Abfrage-Datei.
import { DB_QUERY_KEY } from '../../src/shared/database/behaelter.js';

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

// 4T-001943 (Epic 3E-000257, Bauplan B2; AK2): Die Masken-Dateien. Die Maske
// nennt ihre Tabelle beim Namen; es gilt die erste nach Pfad.
describe('Katalog: Masken-Dateien (4T-001943, B2)', () => {
  function maske(tabelle) {
    return `---\ntitle: Maske\n${DB_FORM_KEY}:\n  table: ${tabelle}\n---\n\n{{field:nachname}}\n`;
  }
  const MASKE_A = '/db/Personen Form.md';
  const MASKE_B = '/db/Zweite Personen Form.md';
  const MASKE_FREMD = '/db/Kunden Form.md';
  const MASKE_LEER = '/db/Leer Form.md';

  function ueberblick(zusatz) {
    const { fsp } = fakeFs({ ...DATEIEN, ...zusatz.dateien });
    const sicht = sichtMit({
      [PERSONEN]: ['table'],
      [FIRMEN]: ['table'],
      [STECKBRIEF]: ['database'],
      ...zusatz.marken,
    });
    return katalogUeberblick({ sicht, status: 'ready', fsp, cache });
  }

  it('erkennt die Marke form und ordnet die Maske ihrer Tabelle zu', async () => {
    const u = await ueberblick({
      dateien: { [MASKE_A]: maske('personen') },
      marken: { [MASKE_A]: ['form'] },
    });
    expect(u.masken).toEqual([{ path: MASKE_A, table: 'personen', hints: [] }]);
    expect(u.tabellen.find((t) => t.name === 'Personen').maske).toBe(MASKE_A);
    expect(u.tabellen.find((t) => t.name === 'Firmen').maske).toBeNull();
    expect(u.hints).toEqual([]);
  });

  it('lässt die erste Maske nach Pfad gelten und meldet die weitere', async () => {
    const u = await ueberblick({
      dateien: { [MASKE_B]: maske('Personen'), [MASKE_A]: maske('Personen') },
      marken: { [MASKE_B]: ['form'], [MASKE_A]: ['form'] },
    });
    expect(u.tabellen.find((t) => t.name === 'Personen').maske).toBe(MASKE_A);
    const zweite = u.masken.find((m) => m.path === MASKE_B);
    expect(zweite.hints.map((h) => [h.code, h.name])).toEqual([['formMehrereDateien', 'Personen']]);
    expect(u.masken.find((m) => m.path === MASKE_A).hints).toEqual([]);
  });

  it('meldet eine Maske zu einer unbekannten Tabelle und eine ohne Tabelle', async () => {
    const u = await ueberblick({
      dateien: {
        [MASKE_FREMD]: maske('Kunden'),
        [MASKE_LEER]: `---\n${DB_FORM_KEY}: {}\n---\n`,
      },
      marken: { [MASKE_FREMD]: ['form'], [MASKE_LEER]: ['form'] },
    });
    const fremd = u.masken.find((m) => m.path === MASKE_FREMD);
    expect(fremd.hints.map((h) => [h.code, h.name, h.key])).toEqual([
      ['formTabelleUnbekannt', 'Kunden', 'table'],
    ]);
    const leer = u.masken.find((m) => m.path === MASKE_LEER);
    expect(leer.table).toBeNull();
    expect(leer.hints.map((h) => h.code)).toEqual(['formTable']);
    expect(u.tabellen.every((t) => t.maske === null)).toBe(true);
  });

  it('liefert ohne Masken-Datei eine leere Liste', async () => {
    const { fsp } = fakeFs(DATEIEN);
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(u.masken).toEqual([]);
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

// 4T-002081 (Epic 3E-000259, Story 4S-001040 AK3 bis AK5): Die Abfrage-Datei.
// Ein Dokument mit der Marke `db-query` im Frontmatter und genau einem
// Abfrage-Block im Text; keine oder mehrere Blöcke sind eine Fehlerlage, ein
// Block ohne Marke bleibt ein gewöhnliches Dokument (F2 Option A, F3b).
describe('Abfrage-Datei: Marke und Katalog (4T-002081)', () => {
  const ZAUN = '```';
  const block = (abfrage) => [`${ZAUN}perspective-query`, abfrage, ZAUN].join('\n');
  function abfrageDatei(...bloecke) {
    return [
      '---',
      `${DB_QUERY_KEY}:`,
      '---',
      '',
      '# Abfrage',
      '',
      'Beschreibung.',
      '',
      ...bloecke,
      '',
    ].join('\n');
  }
  const EINE = '/db/Abfragen/Bücher je Autor.md';
  const KEINE = '/db/Leer.md';
  const ZWEI = '/db/Zwei.md';
  const OHNE_MARKE = '/db/Notiz mit Abfrage.md';

  it('erkennt die Marke db-query, auch ohne Wert, und nur sie (AK4)', () => {
    expect(DB_QUERY_KEY).toBe('db-query');
    expect(parseContent(EINE, abfrageDatei(block('LIST'))).dbKinds).toEqual(['query']);
    expect(parseContent(EINE, '---\ndb-query: {}\n---\n').dbKinds).toEqual(['query']);
    // Ein Abfrage-Block ohne Marke bleibt ein gewöhnliches Dokument.
    const ohne = `# Notiz\n\n${block('LIST')}\n`;
    expect(parseContent(OHNE_MARKE, ohne).dbKinds).toEqual([]);
    // Neben einer Masken-Marke steht sie als weitere Marke.
    const beides = '---\ndb-form:\n  table: Kunden\ndb-query:\n---\n';
    expect(parseContent('/db/Beides.md', beides).dbKinds).toEqual(['form', 'query']);
  });

  it('zählt die Abfrage-Blöcke der obersten Ebene', () => {
    expect(zaehleAbfrageBloecke(abfrageDatei(block('LIST')))).toBe(1);
    expect(zaehleAbfrageBloecke(abfrageDatei())).toBe(0);
    expect(zaehleAbfrageBloecke(abfrageDatei(block('LIST'), block('TABLE file.name')))).toBe(2);
    // Tilden-Zaun und Infostring mit weiteren Wörtern zählen wie in der Anzeige.
    expect(zaehleAbfrageBloecke('~~~perspective-query\nLIST\n~~~\n')).toBe(1);
    expect(zaehleAbfrageBloecke('```perspective-query zusatz\nLIST\n```\n')).toBe(1);
    // Ein zitierter Block in einem längeren Zaun ist Text, kein Block.
    const zitiert = ['````markdown', block('LIST'), '````', '', block('LIST')].join('\n');
    expect(zaehleAbfrageBloecke(zitiert)).toBe(1);
    // Andere Code-Blöcke zählen nicht, auch nicht mit ähnlichem Namen.
    expect(zaehleAbfrageBloecke('```perspective-script\nx\n```\n```js\ny\n```\n')).toBe(0);
    // Windows-Zeilenenden.
    expect(zaehleAbfrageBloecke('```perspective-query\r\nLIST\r\n```\r\n')).toBe(1);
  });

  it('führt jede Abfrage-Datei mit Name und Pfad, gemeldet bei keinem und mehreren Blöcken (AK3, AK4)', async () => {
    const { fsp } = fakeFs({
      ...DATEIEN,
      [EINE]: abfrageDatei(block('LIST RECORDS FROM "Personen"')),
      [KEINE]: abfrageDatei(),
      [ZWEI]: abfrageDatei(block('LIST'), block('TABLE file.name')),
      [OHNE_MARKE]: `# Notiz\n\n${block('LIST')}\n`,
    });
    const sicht = sichtMit({
      [PERSONEN]: ['table'],
      [STECKBRIEF]: ['database'],
      [EINE]: ['query'],
      [KEINE]: ['query'],
      [ZWEI]: ['query'],
    });
    const u = await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    // Reihenfolge nach Pfad; die Datei ohne Marke fehlt.
    expect(u.abfragen.map((a) => [a.name, a.path, a.bloecke])).toEqual([
      ['Bücher je Autor', EINE, 1],
      ['Leer', KEINE, 0],
      ['Zwei', ZWEI, 2],
    ]);
    const hinweise = Object.fromEntries(
      u.abfragen.map((a) => [a.name, a.hints.map((h) => [h.code, h.name, h.key])]),
    );
    expect(hinweise).toEqual({
      'Bücher je Autor': [],
      Leer: [['queryOhneFence', null, null]],
      Zwei: [['queryMehrereFences', '2', null]],
    });
    // Die Befunde der Abfrage-Dateien berühren weder Steckbrief noch Tabellen.
    expect(u.hints).toEqual([]);
    expect(u.tabellen.every((t) => t.hints.length === 0)).toBe(true);
  });

  it('liefert ohne Abfrage-Datei eine leere Liste', async () => {
    const { fsp } = fakeFs(DATEIEN);
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(u.abfragen).toEqual([]);
  });

  it('liest eine unveränderte Datei kein zweites Mal und sieht eine Änderung ohne Neustart', async () => {
    const { fsp, zaehler, aendere } = fakeFs({ [EINE]: abfrageDatei(block('LIST')) });
    const sicht = sichtMit({ [EINE]: ['query'] });
    await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    expect(zaehler.readFile).toBe(1);
    aendere(EINE, abfrageDatei(block('LIST'), block('LIST')));
    const u = await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    expect(u.abfragen[0].hints.map((h) => h.code)).toEqual(['queryMehrereFences']);
  });

  it('zeigt den ungespeicherten Stand einer offenen Abfrage-Datei (E25)', async () => {
    const { fsp, zaehler } = fakeFs({ [EINE]: abfrageDatei(block('LIST')) });
    const sicht = sichtMit({ [EINE]: ['query'] });
    const u = await katalogUeberblick({
      sicht,
      status: 'ready',
      fsp,
      cache,
      bufferTextFor: (p) => (p === EINE ? abfrageDatei() : null),
    });
    expect(u.abfragen[0].hints.map((h) => h.code)).toEqual(['queryOhneFence']);
    expect(zaehler.readFile).toBe(0);
  });

  it('übergeht eine Abfrage-Datei, die der Index kennt und die es nicht mehr gibt', async () => {
    const { fsp } = fakeFs({});
    const u = await katalogUeberblick({
      sicht: sichtMit({ [EINE]: ['query'] }),
      status: 'ready',
      fsp,
      cache,
    });
    expect(u.abfragen).toEqual([]);
  });
});
