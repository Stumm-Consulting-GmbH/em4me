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
  geltendeMaske,
  katalogUeberblick,
  maskenDerTabelle,
  tabellenDefinition,
  tabellenName,
  trifftMaskenAngabe,
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
// 4T-002307: Die Konsistenz-Prüfung führt die Hinweise der Rollen als Befund.
import {
  KONSISTENZ_BEFUNDE,
  pruefeKonsistenz,
} from '../../src/main/database/konsistenz-pruefung.js';

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

  // 4T-002184 (F2 A, AK2): Mehrere Masken je Tabelle sind erlaubt; ohne
  // Angabe gilt die erste nach Pfad, und keine der beiden trägt einen Hinweis.
  it('lässt ohne Angabe die erste Maske nach Pfad gelten und meldet die weitere nicht', async () => {
    const u = await ueberblick({
      dateien: { [MASKE_B]: maske('Personen'), [MASKE_A]: maske('Personen') },
      marken: { [MASKE_B]: ['form'], [MASKE_A]: ['form'] },
    });
    const personen = u.tabellen.find((t) => t.name === 'Personen');
    expect(personen.maske).toBe(MASKE_A);
    expect(personen.maskenPfade).toEqual([MASKE_A, MASKE_B]);
    expect(personen.hints).toEqual([]);
    expect(u.masken.every((m) => m.hints.length === 0)).toBe(true);
    expect(u.tabellen.find((t) => t.name === 'Firmen').maskenPfade).toEqual([]);
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

// 4T-002184 (Epic 3E-000261, F1 A, F2 A; AK1 bis AK3): Die Angabe `form` der
// Tabellen-Definition wählt die Standard-Maske; eine Angabe, die keine eigene
// Masken-Datei trifft, ist ein Befund der Definition, und es gilt die Regel
// «ohne Angabe».
describe('Katalog: Standard-Maske über die Angabe form (4T-002184)', () => {
  function maske(tabelle) {
    return `---\n${DB_FORM_KEY}:\n  table: ${tabelle}\n---\n\n{{field:nachname}}\n`;
  }
  const MASKE_A = '/db/Personen Form.md';
  const MASKE_KURZ = '/db/masken/Personen Kurz.md';
  const MASKE_FIRMEN = '/db/Firmen Form.md';

  function personenMitForm(angabe) {
    return tabellenDatei(
      [
        { name: 'nachname', type: 'string' },
        { name: 'alter', type: 'number' },
      ],
      `  form: ${angabe}\n`,
    );
  }

  function bestand(angabe) {
    const { fsp } = fakeFs({
      ...DATEIEN,
      ...(angabe === null ? {} : { [PERSONEN]: personenMitForm(angabe) }),
      [MASKE_A]: maske('Personen'),
      [MASKE_KURZ]: maske('Personen'),
      [MASKE_FIRMEN]: maske('Firmen'),
    });
    const sicht = sichtMit({
      [PERSONEN]: ['table'],
      [FIRMEN]: ['table'],
      [STECKBRIEF]: ['database'],
      [MASKE_A]: ['form'],
      [MASKE_KURZ]: ['form'],
      [MASKE_FIRMEN]: ['form'],
    });
    return { fsp, sicht };
  }

  async function personen(angabe) {
    const { fsp, sicht } = bestand(angabe);
    const u = await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    return u.tabellen.find((t) => t.name === 'Personen');
  }

  it('macht die genannte Masken-Datei zur Standard-Maske (AK1)', async () => {
    const eintrag = await personen('Personen Kurz');
    expect(eintrag.maske).toBe(MASKE_KURZ);
    expect(eintrag.maskenPfade).toEqual([MASKE_A, MASKE_KURZ]);
    expect(eintrag.hints).toEqual([]);
  });

  it('nimmt den Namen ohne Rücksicht auf die Schreibung, mit Ordner und mit Endung', async () => {
    for (const angabe of ['personen kurz', 'masken/Personen Kurz', 'Personen Kurz.md']) {
      cache = createDatabaseCatalogCache();
      expect((await personen(angabe)).maske, angabe).toBe(MASKE_KURZ);
    }
  });

  it('bleibt ohne Angabe bei der ersten Masken-Datei nach Pfad (AK2)', async () => {
    const eintrag = await personen(null);
    expect(eintrag.maske).toBe(MASKE_A);
    expect(eintrag.hints).toEqual([]);
  });

  it('meldet eine fehlende Masken-Datei an der Definition und fällt zurück (AK3)', async () => {
    const eintrag = await personen('Gibt Es Nicht');
    expect(eintrag.maske).toBe(MASKE_A);
    expect(eintrag.hints).toEqual([
      { code: 'formDateiUnbekannt', index: -1, name: 'Gibt Es Nicht', key: 'form', expected: null },
    ]);
  });

  it('meldet die Masken-Datei einer anderen Tabelle und fällt zurück (AK3)', async () => {
    const eintrag = await personen('Firmen Form');
    expect(eintrag.maske).toBe(MASKE_A);
    expect(eintrag.hints.map((h) => [h.code, h.name, h.key, h.expected])).toEqual([
      ['formDateiFremd', 'Firmen Form', 'form', 'Firmen'],
    ]);
  });

  it('fällt ohne eigene Masken-Datei auf die erzeugte Maske zurück und meldet die Angabe', async () => {
    const { fsp } = fakeFs({ ...DATEIEN, [PERSONEN]: personenMitForm('Personen Kurz') });
    const sicht = sichtMit({ [PERSONEN]: ['table'], [FIRMEN]: ['table'] });
    const u = await katalogUeberblick({ sicht, status: 'ready', fsp, cache });
    const eintrag = u.tabellen.find((t) => t.name === 'Personen');
    expect(eintrag.maske).toBeNull();
    expect(eintrag.hints.map((h) => h.code)).toEqual(['formDateiUnbekannt']);
  });

  it('gibt dieselbe Antwort über die Auskunft je Tabelle wie im Überblick', async () => {
    const { fsp, sicht } = bestand('Firmen Form');
    const masken = await maskenDerTabelle({ sicht, fsp, cache, tabellenPfad: PERSONEN });
    expect(masken.masken).toEqual([MASKE_A, MASKE_KURZ]);
    expect(masken.standard).toBe(MASKE_A);
    expect(masken.hinweis.code).toBe('formDateiFremd');
    const kurz = bestand('Personen Kurz');
    expect(await geltendeMaske({ sicht: kurz.sicht, fsp: kurz.fsp, tabellenPfad: PERSONEN })).toBe(
      MASKE_KURZ,
    );
    expect(await geltendeMaske({ sicht: kurz.sicht, fsp: kurz.fsp, tabellenPfad: FIRMEN })).toBe(
      MASKE_FIRMEN,
    );
  });

  it('vergleicht einen Masken-Namen wie ein Wiki-Link-Ziel', () => {
    expect(trifftMaskenAngabe(MASKE_KURZ, 'Personen Kurz')).toBe(true);
    expect(trifftMaskenAngabe(MASKE_KURZ, 'masken\\Personen Kurz')).toBe(true);
    expect(trifftMaskenAngabe(MASKE_KURZ, MASKE_KURZ)).toBe(true);
    expect(trifftMaskenAngabe(MASKE_KURZ, 'Kurz')).toBe(false);
    expect(trifftMaskenAngabe(MASKE_KURZ, 'andere/Personen Kurz')).toBe(false);
    expect(trifftMaskenAngabe(MASKE_KURZ, '')).toBe(false);
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

// 4T-002248 (Epic 3E-000262, F1 A; AK2, AK3): Die Angaben der Listen-Maske im
// Behälter der Abfrage-Datei. Der Katalog legt sie aus, reicht sie mit dem
// Eintrag weiter und prüft die Angabe `form` gegen alle Masken-Dateien der
// Sicht; eine Angabe, die keine trifft, ist ein Befund der Abfrage-Datei.
describe('Abfrage-Datei: Angaben der Listen-Maske (4T-002248)', () => {
  const ZAUN = '```';
  const LISTE = '/db/Abfragen/Personen-Liste.md';
  const MASKE = '/db/Masken/Personen Form.md';
  function listenDatei(behaelter) {
    return [
      '---',
      `${DB_QUERY_KEY}: ${behaelter}`,
      '---',
      '',
      `${ZAUN}perspective-query`,
      'TABLE nachname FROM "Personen"',
      ZAUN,
      '',
    ].join('\n');
  }
  const MASKEN_DATEI = `---\n${DB_FORM_KEY}:\n  table: Personen\n---\n\n{{field:nachname}}\n`;

  async function ueberblick(behaelter, { mitMaske = false } = {}) {
    const dateien = { ...DATEIEN, [LISTE]: listenDatei(behaelter) };
    const marken = { [PERSONEN]: ['table'], [STECKBRIEF]: ['database'], [LISTE]: ['query'] };
    if (mitMaske) {
      dateien[MASKE] = MASKEN_DATEI;
      marken[MASKE] = ['form'];
    }
    const { fsp } = fakeFs(dateien);
    return katalogUeberblick({ sicht: sichtMit(marken), status: 'ready', fsp, cache });
  }

  it('trägt editable, form und allow im Eintrag einer Listen-Maske', async () => {
    const u = await ueberblick('{ editable: true, form: Personen Form, allow: [create, update] }', {
      mitMaske: true,
    });
    const [liste] = u.abfragen;
    expect(liste).toMatchObject({
      name: 'Personen-Liste',
      path: LISTE,
      bloecke: 1,
      editable: true,
      form: 'Personen Form',
      allow: ['create', 'update'],
      hints: [],
    });
  });

  it('lässt ohne allow allein update gelten und eine gewöhnliche Abfrage-Datei ohne Angaben', async () => {
    const mit = await ueberblick('{ editable: true }');
    expect(mit.abfragen[0]).toMatchObject({ editable: true, form: null, allow: ['update'] });
    expect(mit.abfragen[0].hints).toEqual([]);
    const ohne = await ueberblick('');
    expect(ohne.abfragen[0]).toMatchObject({ editable: false, form: null, allow: [], hints: [] });
  });

  it('meldet listFormDateiUnbekannt, wenn form keine Masken-Datei trifft', async () => {
    const u = await ueberblick('{ editable: true, form: Gibt Es Nicht }', { mitMaske: true });
    const [liste] = u.abfragen;
    // Die Angabe bleibt stehen; welche Maske dann öffnet, entscheidet die Liste.
    expect(liste.form).toBe('Gibt Es Nicht');
    expect(liste.hints.map((h) => [h.code, h.key, h.name])).toEqual([
      ['listFormDateiUnbekannt', 'form', 'Gibt Es Nicht'],
    ]);
    // Der Befund hängt an der Abfrage-Datei und berührt weder Tabellen noch Masken.
    expect(u.tabellen.every((t) => t.hints.length === 0)).toBe(true);
    expect(u.masken.every((m) => m.hints.length === 0)).toBe(true);
  });

  it('nimmt eine bekannte Masken-Datei ohne Hinweis, auch mit Ordner und Endung', async () => {
    for (const angabe of ['Personen Form', 'personen form', 'Masken/Personen Form.md']) {
      const u = await ueberblick(`{ editable: true, form: ${angabe} }`, { mitMaske: true });
      expect(u.abfragen[0].hints, angabe).toEqual([]);
    }
  });

  it('reicht die Hinweise der Auslegung an den Eintrag weiter', async () => {
    const u = await ueberblick('{ editable: true, allow: [update, archive], table: Personen }');
    expect(u.abfragen[0].allow).toEqual(['update']);
    expect(u.abfragen[0].hints.map((h) => [h.code, h.name])).toEqual([
      ['listAllowUnbekannt', 'archive'],
      ['listAngabeUnbekannt', 'table'],
    ]);
  });
});

// 4T-002307 (Epic 3E-000263, S3; AK2, AK3): Die Rollen des Steckbriefs im
// Überblick. Erst der Katalog kennt die Tabellen und hält die Rollen gegen sie;
// die Hinweise gehen denselben Weg wie die übrigen Hinweise des Steckbriefs.
// Die Konsistenz-Prüfung liest dieselbe Datei über `readFile` und muss
// dieselben Fälle melden, deshalb steht ihr Fall hier neben dem des Überblicks.
describe('Katalog: Rollen im Steckbrief (4T-002307)', () => {
  // Der Steckbrief mit den übergebenen Zeilen unter `roles`.
  function mitRollen(rollenZeilen) {
    const kopf = ['---', `${DB_DATABASE_KEY}:`, '  name: Mini-CRM', '  roles:'];
    return { ...DATEIEN, [STECKBRIEF]: [...kopf, ...rollenZeilen, '---', ''].join('\n') };
  }

  it('reicht die gegen die Tabellen geprüften Rollen im Steckbrief weiter (AK3)', async () => {
    const zeilen = [
      '    vertrieb:',
      '      personen: [update]',
      '      Firmen: [create, update]',
      '    admin: all',
    ];
    const { fsp } = fakeFs(mitRollen(zeilen));
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(u.hints).toEqual([]);
    expect(u.steckbrief.rollen).toEqual({
      vertrieb: {
        alle: false,
        operationen: { personen: ['update'], Firmen: ['create', 'update'] },
        alleTabellen: null,
      },
      admin: { alle: true, operationen: {}, alleTabellen: null },
    });
  });

  it('führt ohne roles kein Feld rollen im Steckbrief', async () => {
    const { fsp } = fakeFs(DATEIEN);
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(u.steckbrief).not.toHaveProperty('rollen');
  });

  it('meldet unbekannte Tabelle und Operation; die Rolle gilt als nicht gesetzt (AK2)', async () => {
    const zeilen = [
      '    vertrieb:',
      '      Firmen: [create, archive]',
      '      Orte: [update]',
      '    admin: all',
    ];
    const { fsp } = fakeFs(mitRollen(zeilen));
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache });
    expect(Object.keys(u.steckbrief.rollen)).toEqual(['admin']);
    const kurz = (h) => [h.code, h.name, h.key, h.wert || null];
    expect(u.hints.map(kurz)).toEqual([
      ['roleOperation', 'vertrieb', 'Firmen', 'archive'],
      ['roleTable', 'vertrieb', 'Orte', null],
    ]);
    expect(u.steckbrief.hints.map(kurz)).toEqual(u.hints.map(kurz));
    expect(u.hints[1].expected).toEqual(['Firmen', 'Personen']);

    // Dieselben Fälle als Befund der Konsistenz-Prüfung, über readFile allein.
    const nurLesen = { readFile: fsp.readFile };
    const ergebnis = await pruefeKonsistenz({ fsp: nurLesen, wurzel: '/db', sicht: SICHT });
    const rollen = ergebnis.befunde.filter((b) => b.code === KONSISTENZ_BEFUNDE.steckbriefRollen);
    expect(KONSISTENZ_BEFUNDE.steckbriefRollen).toBe('konsistenzSteckbriefRollen');
    expect(rollen.map((b) => [b.datei, b.wert, b.zieltabelle, b.tabelle])).toEqual([
      [STECKBRIEF, 'vertrieb', 'Firmen', null],
      [STECKBRIEF, 'vertrieb', 'Orte', null],
    ]);
    // Die Prüfung einer einzelnen Tabelle führt die Rollen nicht.
    const einzeln = await pruefeKonsistenz({
      fsp: nurLesen,
      wurzel: '/db',
      sicht: SICHT,
      tabelle: 'Firmen',
    });
    expect(einzeln.befunde.some((b) => b.code === KONSISTENZ_BEFUNDE.steckbriefRollen)).toBe(false);
  });
});

// 4T-002308 (S3, S4; AK2, AK3): eigene Rolle, Rechte je Tabelle und die
// Zuordnung auf eine unbekannte Rolle; weitere Fälle in `db-rechte.test.js`.
describe('Katalog: eigene Rolle und Rechte (4T-002308)', () => {
  it('trägt eigeneRolle und je Tabelle rechte, Herkunft als Naht (4T-002308)', async () => {
    const zeilen = ['  roles:', '    admin: all', '    leser:', '      Firmen: [update]'];
    zeilen.push('  defaultRole: leser', '  users:', '    mstumm: admin', '    gast: editor');
    const text = ['---', `${DB_DATABASE_KEY}:`, ...zeilen, '---', ''].join('\n');
    const { fsp } = fakeFs({ ...DATEIEN, [STECKBRIEF]: text });
    const herkunft = () => ({ benutzer: 'gast', rechner: 'pc' });
    const u = await katalogUeberblick({ sicht: SICHT, status: 'ready', fsp, cache, herkunft });
    expect(u.eigeneRolle).toEqual({ rolle: 'leser', anmeldename: 'gast', quelle: 'vorgabe' });
    const rechte = Object.fromEntries(u.tabellen.map((t) => [t.name, t.rechte.update]));
    expect(rechte).toEqual({ Firmen: true, Personen: false });
    expect(u.hints.map((h) => [h.code, h.name, h.wert])).toEqual([
      ['userRoleUnknown', 'gast', 'editor'],
    ]);
    expect(u.steckbrief).toMatchObject({ defaultRole: 'leser', users: { mstumm: 'admin' } });
  });
});
