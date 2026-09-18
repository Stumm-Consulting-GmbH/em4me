// 4T-001610 (Epic 3E-000252): Erfassung der Datensätze beim Index-Aufbau.
//
// Zwei Ebenen in einer Datei, wie bei den Nachbarn im Index-Bestand: die
// **Erfassung** als reine Auskunft über einen Text (Kopf-Datei, Folge-Segment,
// Schlüssel und Anzeige-Form, defekte Fence) und die **Index-Integration**
// gegen echte Temp-Verzeichnisse (Aufbau-Pfad, Watcher, Löschen,
// Zwischenspeicher, Puffer-Overlay, bereichslose Wurzel). Das Setup-Muster
// stammt aus `index-puffer-overlay.test.js`.
//
// **Die tragende Zusage dieser Datei ist der Zuschnitt des Bestands** (A1): Er
// führt je Datensatz Kennung, Schlüssel-Wert, Anzeige-Form und Fundort — und
// **keine Zellwerte**. Ein Test darauf ist keine Förmlichkeit: Die Grenze ist
// unsichtbar, weil ein zu großer Bestand nichts kaputt macht, sondern nur
// Speicher kostet; sie fiele beim nächsten bequemen Zugriff still, wenn hier
// nichts dagegen stünde.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { backlinksFor, releaseRoot, rootForActiveFile } from '../../src/main/backlinks.js';

const require_ = createRequire(import.meta.url);
const { indexes } = require_('../../src/main/index/store.js');
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const {
  erfasseDatensaetze,
  kopfDateiFuer,
  definitionAusText,
  definitionsSignatur,
  holeDefinitionenVorab,
  vergissAlleDefinitionen,
} = require_('../../src/main/index/datensatz-erfassung.js');
const { datensatzRumpf, rolleVon } = require_('../../src/shared/database/record-segment.js');
const { MDDA_CACHE_SCHEMA_VERSION } = require_('../../src/main/documents/mdd-store.js');

const NEUE_ZEILE = '\n';

// --- Fixtures ---------------------------------------------------------------

// Eine Kopf-Datei mit drei Feldern, fachlichem Schlüssel und Anzeige-Form.
// Prosa vor und hinter dem Block, damit die Zeilen-Angabe etwas zu treffen hat.
function kopfDatei({ key = 'Kürzel', display = 'Titel', datensaetze = KOPF_SAETZE } = {}) {
  return [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Kürzel',
    '    - name: Titel',
    '    - name: Ort',
    ...(key ? [`  key: ${key}`] : []),
    ...(display ? [`  display: ${display}`] : []),
    '---',
    '',
    '# Kundenliste',
    '',
    'Eine Beschreibung.',
    '',
    '```perspective-records',
    ...datensaetze,
    '```',
    '',
    'Ein Nachwort.',
    '',
  ].join('\n');
}

const KOPF_SAETZE = [
  '|- id="r-00001"',
  '| K-1',
  '| Anna',
  '| Basel',
  '|- id="r-00002"',
  '| K-2',
  '| Bert',
  '| Bern',
];

// Ein Folge-Segment: keine Marke `db-table`, dafür die Zuordnungs-Zeile und ein
// Rumpf, der mit einem Datensatz-Marker beginnt.
const SEGMENT = [
  '---',
  'doc-part: v1|2|Kundenliste',
  'db-fields: Kürzel, Titel, Ort',
  '---',
  '|- id="r-00003"',
  '| K-3',
  '| Cara',
  '| Chur',
  '```',
  '',
].join('\n');

// --- Setup/Teardown (Muster aus index-puffer-overlay.test.js) ---------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-dsidx-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, areaRoot) {
  let result = backlinksFor(activeFile, undefined, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, undefined, areaRoot);
  }
  return result;
}

// Zeilen-Index einer Zeile im Text. Die Erwartung wird am Text gemessen und
// nicht abgezaehlt: Eine abgezaehlte Zahl prueft die Fixture und nicht die
// Zusage, und sie bricht bei jeder Aenderung an ihr.
function zeileVon(text, zeile) {
  return text.split(NEUE_ZEILE).indexOf(zeile);
}

function bestandVon(root, absPath) {
  const eintrag = indexes.get(root);
  return eintrag && eintrag.recordsPerFile.get(absPath);
}

afterEach(() => {
  clearAllBufferOverlays();
  vergissAlleDefinitionen();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows haelt die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

// --- AK1 bis AK3: die Erfassung selbst -------------------------------------

describe('Erfassung einer Kopf-Datei (4T-001610, AK1 bis AK3)', () => {
  it('liefert je Datensatz Kennung, Schlüssel-Wert, Anzeige-Form und Zeile', () => {
    const text = kopfDatei();
    const erfasst = erfasseDatensaetze(text, null);
    expect(erfasst.records).toHaveLength(2);
    expect(erfasst.records[0]).toEqual({
      id: 'r-00001',
      key: ['K-1'],
      display: 'Anna',
      // Die Zeile wird nicht abgezaehlt, sondern am Text gemessen: Eine
      // abgezaehlte Zahl misst die Fixture und nicht die Zusage.
      zeile: zeileVon(text, '|- id="r-00001"'),
    });
    expect(erfasst.records[1].id).toBe('r-00002');
    expect(erfasst.records[1].key).toEqual(['K-2']);
    expect(erfasst.records[1].display).toBe('Bert');
  });

  it('führt KEINE Zellwerte mit (A1, die Speicher-Zusage des Bestands)', () => {
    const erfasst = erfasseDatensaetze(kopfDatei(), null);
    // Die Feld-Namen der Definition kommen im Bestand nicht vor, und der Wert
    // der dritten Spalte — weder Schlüssel noch Anzeige-Form — ebenso wenig.
    const alsText = JSON.stringify(erfasst.records);
    expect(alsText).not.toContain('Basel');
    expect(alsText).not.toContain('Ort');
    for (const record of erfasst.records) {
      expect(Object.keys(record).sort()).toEqual(['display', 'id', 'key', 'zeile']);
    }
  });

  it('zeigt die Zeile auf den Datensatz-Marker in der DATEI, nicht im Rumpf', () => {
    const text = kopfDatei();
    const zeilen = text.split('\n');
    const erfasst = erfasseDatensaetze(text, null);
    for (const record of erfasst.records) {
      expect(zeilen[record.zeile]).toContain(record.id);
      expect(zeilen[record.zeile].startsWith('|-')).toBe(true);
    }
  });

  it('mehrteiliger Schlüssel liefert seine Teile in der Reihenfolge der Angabe', () => {
    const text = kopfDatei({ key: '[Ort, Kürzel]', display: null });
    const erfasst = erfasseDatensaetze(text, null);
    expect(erfasst.records[0].key).toEqual(['Basel', 'K-1']);
    // Ohne eigene Anzeige-Form und bei MEHRTEILIGEM Schlüssel fällt sie weg
    // (E5.3: nur der einteilige Schlüssel ist zugleich die Anzeige-Form).
    expect(erfasst.records[0].display).toBeNull();
  });

  it('ohne Anzeige-Form tritt ein einteiliger Schlüssel an ihre Stelle (E5.3)', () => {
    const erfasst = erfasseDatensaetze(kopfDatei({ display: null }), null);
    expect(erfasst.records[0].display).toBe('K-1');
  });

  it('Tabelle ohne Schlüssel und ohne Anzeige-Form bleibt gültig (E5.3)', () => {
    const text = kopfDatei({ key: null, display: null });
    const erfasst = erfasseDatensaetze(text, null);
    expect(erfasst.records[0]).toEqual({
      id: 'r-00001',
      key: null,
      display: null,
      zeile: zeileVon(text, '|- id="r-00001"'),
    });
  });

  it('eine Datei ohne Datensätze liefert null (Regelfall, kostet nichts)', () => {
    expect(erfasseDatensaetze('# Nur Prosa\n\nkein Datensatz weit und breit.', null)).toBeNull();
    expect(erfasseDatensaetze('', null)).toBeNull();
    expect(erfasseDatensaetze(null, null)).toBeNull();
  });
});

describe('Erfassung eines Folge-Segments (4T-001610, AK3)', () => {
  it('ordnet über die Definition der Kopf-Datei zu, nicht über die Lese-Hilfe', () => {
    const definition = definitionAusText(kopfDatei());
    const erfasst = erfasseDatensaetze(SEGMENT, definition);
    expect(erfasst.records).toEqual([{ id: 'r-00003', key: ['K-3'], display: 'Cara', zeile: 4 }]);
    expect(erfasst.defSignatur).toBe(definition.signatur);
  });

  it('ohne Definition bleiben Kennung und Fundort, Schlüssel und Anzeige entfallen', () => {
    // Der Fall eines Segments, dessen Kopf-Datei fehlt. Die Lese-Hilfe
    // `db-fields` steht im Segment und wird ausdrücklich NICHT verwendet
    // (E26.3: ohne Vertragswirkung).
    const erfasst = erfasseDatensaetze(SEGMENT, null);
    expect(erfasst.records).toEqual([{ id: 'r-00003', key: null, display: null, zeile: 4 }]);
  });

  it('erkennt die Rolle einer Datei an der Datei und nicht am Aufrufer', () => {
    expect(rolleVon(kopfDatei())).toBe('kopf');
    expect(rolleVon(SEGMENT)).toBe('folge');
    expect(
      rolleVon('---\ntags: notiz\n---\n\n```perspective-records\n|- id="r-1"\n```'),
    ).toBeNull();
  });

  it('findet die Kopf-Datei allein am Dateinamen', () => {
    const segment = path.join('C:', 'x', 'Kundenliste•part-00002.md');
    expect(kopfDateiFuer(segment)).toBe(path.join('C:', 'x', 'Kundenliste.md'));
    expect(kopfDateiFuer(path.join('C:', 'x', 'Kundenliste.md'))).toBeNull();
  });
});

// --- AK7: Fehler-Isolation --------------------------------------------------

describe('Defekte Datensatz-Fence (4T-001610, AK7)', () => {
  it('eine Fence ohne Datensätze liefert null statt eines leeren Bestands', () => {
    const text = kopfDatei({ datensaetze: ['', '   '] });
    expect(erfasseDatensaetze(text, null)).toBeNull();
  });

  it('loser Text ohne Marker wird zum Datensatz ohne Kennung, nicht zum Fehler', () => {
    // Der Parser verwirft nie (E3): Was er nicht deuten kann, bleibt erhalten.
    const text = kopfDatei({ datensaetze: ['| K-9', '| Zoe', '| Zug'] });
    const erfasst = erfasseDatensaetze(text, null);
    expect(erfasst.records).toEqual([
      { id: null, key: ['K-9'], display: 'Zoe', zeile: zeileVon(text, '| K-9') },
    ]);
  });

  it('eine nicht geschlossene Fence liest bis zum Datei-Ende (geteilte Tabelle)', () => {
    const text = [
      '---',
      'db-table:',
      '  fields:',
      '    - name: Kürzel',
      '  key: Kürzel',
      '---',
      '```perspective-records',
      '|- id="r-00007"',
      '| K-7',
    ].join('\n');
    const erfasst = erfasseDatensaetze(text, null);
    expect(erfasst.records).toEqual([
      { id: 'r-00007', key: ['K-7'], display: 'K-7', zeile: zeileVon(text, '|- id="r-00007"') },
    ]);
  });

  it('ein defektes Frontmatter setzt allein diese Erfassung aus', () => {
    const text = ['---', 'db-table: [', '---', '```perspective-records', '|- id="r-1"', '```'].join(
      '\n',
    );
    expect(() => erfasseDatensaetze(text, null)).not.toThrow();
  });

  it('der Rumpf-Schnitt hält bei mehreren Fences bei der ersten', () => {
    const text = kopfDatei();
    const block = datensatzRumpf(text);
    expect(block.rolle).toBe('kopf');
    expect(block.rumpf.split('\n')).toHaveLength(KOPF_SAETZE.length);
  });
});

// --- AK4: Aufbau-Pfad, Watcher und Löschen ---------------------------------

describe('Index-Integration des Bestands (4T-001610, AK4)', () => {
  it('der Aufbau-Pfad trägt die Datensätze einer Tabelle ein', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kundenliste.md', kopfDatei());
    write(root, 'Notiz.md', '# Notiz\n\nohne Datensatz.');
    await indexFor(datei);
    const bestand = bestandVon(root, datei);
    expect(bestand.map((r) => r.id)).toEqual(['r-00001', 'r-00002']);
    // Die Datei ohne Datensätze steht gar nicht erst in der Map.
    expect(bestandVon(root, path.join(root, 'Notiz.md'))).toBeUndefined();
  });

  it('der Vorlauf ordnet ein Folge-Segment zu, das VOR seiner Kopf-Datei liegt', async () => {
    const root = makeRoot();
    // Die Namensform sortiert die Kopf-Datei zwar vor ihr Segment; der Vorlauf
    // macht die Zuordnung von dieser Reihenfolge unabhängig, und genau das ist
    // hier zu zeigen — geprüft wird das Ergebnis, nicht der Weg dorthin.
    const segment = write(root, 'Kundenliste•part-00002.md', SEGMENT);
    write(root, 'Kundenliste.md', kopfDatei());
    await indexFor(segment);
    expect(bestandVon(root, segment)).toEqual([
      { id: 'r-00003', key: ['K-3'], display: 'Cara', zeile: 4 },
    ]);
  });

  // Waechter statt Watcher-Test: Die watcher-abhaengigen Index-Updates sind im
  // Bestand als Integrations-Luecke dokumentiert (Kopf von backlinks.test.js,
  // awaitWriteFinish plus Debounce sind nicht flakefrei unit-testbar). Der
  // Fehler, um den es hier geht, ist aber ein anderer und strukturell fassbar:
  // eine neue Datei-Map anlegen und vergessen, sie beim Entfallen einer Datei
  // und beim Abbau des Index wieder auszutragen. Der Index hielte dann
  // Eintraege geloeschter Dateien — und keiner der bestehenden Tests saehe es.
  it('jede Datei-Map wird eingetragen, ausgetragen UND geleert', () => {
    const lifecycleQuelle = fs.readFileSync('src/main/index/lifecycle.js', 'utf8');
    const buildQuelle = fs.readFileSync('src/main/index/build.js', 'utf8');
    const maps = [...lifecycleQuelle.matchAll(/^ {4}(\w+PerFile): new Map\(\)/gm)].map((m) => m[1]);
    expect(maps).toContain('recordsPerFile');
    expect(maps).toContain('recordDefSigPerFile');
    const luecken = maps.filter(
      (m) =>
        !buildQuelle.includes(`entry.${m}.set(`) ||
        !buildQuelle.includes(`entry.${m}.delete(`) ||
        !buildQuelle.includes(`entry.${m}.clear()`),
    );
    expect(luecken).toEqual([]);
  });

  it('eine gelöschte Datei hinterlässt keinen Eintrag', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kundenliste.md', kopfDatei());
    const anker = write(root, 'Anker.md', '# Anker');
    await indexFor(anker);
    expect(bestandVon(root, datei)).toBeDefined();

    // Kein Watcher-Event, sondern der Neu-Aufbau ohne die Datei: Er laeuft
    // durch dieselbe Leerung und zeigt dasselbe Ergebnis, ohne auf ein
    // zeitabhaengiges Ereignis zu warten.
    fs.rmSync(datei);
    releaseRoot(root);
    indexes.delete(root);
    await indexFor(anker);
    expect(bestandVon(root, datei)).toBeUndefined();
  });
});

// --- AK5: der Platten-Zwischenspeicher --------------------------------------

describe('Zwischenspeicher (4T-001610, AK5)', () => {
  it('die Schema-Version ist gestiegen, damit ein Alt-Cache verfällt', () => {
    // Ein Zwischenspeicher der Vorgänger-Version trägt den Bestand nicht; ein
    // Warmstart aus ihm meldete für unveränderte Tabellen einen leeren.
    expect(MDDA_CACHE_SCHEMA_VERSION).toBeGreaterThanOrEqual(5);
  });

  it('der Bestand steht im geschriebenen Zwischenspeicher und kommt zurück', async () => {
    const root = makeRoot();
    write(root, '.em4me-area.json', '{}');
    const datei = write(root, 'Kundenliste.md', kopfDatei());
    await indexFor(datei, root);

    const eintrag = indexes.get(root);
    const { writeAreaCache } = require_('../../src/main/index/cache.js');
    await writeAreaCache(eintrag);

    const roh = JSON.parse(fs.readFileSync(path.join(root, 'Area_Cache.mdda'), 'utf8'));
    const abgelegt = roh.linkIndex.files['Kundenliste.md'].parsed;
    expect(abgelegt.records.map((r) => r.id)).toEqual(['r-00001', 'r-00002']);
    // Die Kopf-Datei trägt ihre Definition selbst; ihre Signatur steht mit im
    // Zwischenspeicher, weil der Watcher an ihr die Änderung erkennt.
    expect(abgelegt.recordDefSig).toBe(definitionAusText(kopfDatei()).signatur);
  });

  it('die Signatur ändert sich mit der Schlüssel-Spalte, nicht mit dem Feld-Typ', () => {
    const mitKuerzel = definitionAusText(kopfDatei()).signatur;
    const mitOrt = definitionAusText(kopfDatei({ key: 'Ort' })).signatur;
    expect(mitOrt).not.toBe(mitKuerzel);
    // Ein Typ verschiebt keine Spalte und geht deshalb nicht ein.
    const mitTyp = definitionAusText(
      kopfDatei().replace('- name: Ort', '- name: Ort\n      type: number'),
    );
    expect(mitTyp.signatur).toBe(mitKuerzel);
  });

  it('unterscheidet Feld-Listen, die ohne Trenner zusammenfielen', () => {
    // Ohne Trenner ergaeben ['ab','c'] und ['a','bc'] dieselbe Signatur, und
    // eine Umbenennung bliebe unbemerkt.
    const ab_c = definitionsSignatur({ fields: [{ name: 'ab' }, { name: 'c' }] });
    const a_bc = definitionsSignatur({ fields: [{ name: 'a' }, { name: 'bc' }] });
    expect(ab_c).not.toBe(a_bc);
    // Ohne auslegbare Definition gibt es gar keine Signatur.
    expect(definitionsSignatur(null)).toBe('');
    expect(definitionsSignatur({})).toBe('');
  });
});

// --- AK6: Puffer-Overlay ----------------------------------------------------

describe('Puffer-Overlay (4T-001610, AK6, E25)', () => {
  it('ein ungespeicherter Datensatz erscheint im überlagerten Bestand', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kundenliste.md', kopfDatei());
    await indexFor(datei);

    const erweitert = kopfDatei({
      datensaetze: [...KOPF_SAETZE, '|- id="r-00009"', '| K-9', '| Zoe', '| Zug'],
    });
    setBufferOverlay(datei, erweitert);

    const { entryWithOverlay, overlaysUnder } = require_('../../src/main/index/overlay.js');
    const sicht = entryWithOverlay(indexes.get(root), overlaysUnder(root));
    expect(sicht.recordsPerFile.get(datei).map((r) => r.id)).toEqual([
      'r-00001',
      'r-00002',
      'r-00009',
    ]);
    // Die Platten-Schicht bleibt daneben unangetastet.
    expect(bestandVon(root, datei)).toHaveLength(2);
  });
});

// --- AK9: kein zweiter Scan -------------------------------------------------

describe('Kosten des Vorlaufs (4T-001610, AK9)', () => {
  it('liest im Regelfall nichts — kein Segment-Name, keine Kopf-Datei', async () => {
    // Die Zusage «kein zweiter Scan» steht und faellt damit, dass der Vorlauf
    // an der NAMENSLISTE entscheidet und nicht an den Datei-Inhalten. Ein
    // Bereich ohne geteilte Tabelle darf ihn nicht spueren.
    const gelesen = await holeDefinitionenVorab([
      path.join('C:', 'x', 'Notiz.md'),
      path.join('C:', 'x', 'Kundenliste.md'),
      path.join('C:', 'x', 'Bild.png'),
    ]);
    expect(gelesen).toBe(0);
  });

  it('liest je geteilter Tabelle genau einmal, nicht je Segment', async () => {
    const root = makeRoot();
    write(root, 'Kundenliste.md', kopfDatei());
    write(root, 'Kundenliste•part-00002.md', SEGMENT);
    write(root, 'Kundenliste•part-00003.md', SEGMENT);
    const gelesen = await holeDefinitionenVorab([
      path.join(root, 'Kundenliste.md'),
      path.join(root, 'Kundenliste•part-00002.md'),
      path.join(root, 'Kundenliste•part-00003.md'),
    ]);
    expect(gelesen).toBe(1);
  });
});

// --- AK8: die bereichslose Wurzel -------------------------------------------

describe('Bereichslose Wurzel (4T-001610, AK8)', () => {
  it('führt den Bestand ebenso, ohne Zwischenspeicher zu schreiben', async () => {
    const root = makeRoot();
    const datei = write(root, 'Kundenliste.md', kopfDatei());
    await indexFor(datei);
    const eintrag = indexes.get(root);
    expect(eintrag.isArea).toBe(false);
    expect(bestandVon(root, datei).map((r) => r.id)).toEqual(['r-00001', 'r-00002']);
    // Die Kappungs-Grenzen gelten nur hier und bleiben unberührt: Der Vorlauf
    // läuft NACH dem Scan und dessen oversized-Abbruch, er kann also weder
    // eine Grenze verschieben noch eine gekappte Wurzel doch noch lesen.
    expect(fs.existsSync(path.join(root, 'Area_Cache.mdda'))).toBe(false);
  });
});
