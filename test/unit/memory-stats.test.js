// 4T-001600 (Epic 3E-000191, Story 4S-000906): Prüffälle des
// Kennzahlen-Beschleunigers der Gefäß-Liste
// (src/main/memory/memory-stats.js).
//
// Gegen echte Temp-Ordner und eine echte Datei im Wegwerf-Benutzerprofil statt
// gegen Attrappen, weil genau das der Gegenstand ist: eine eigene Datei neben
// `config.json`, die veralten, fehlen und defekt sein darf, ohne die Anwendung
// anzuhalten (Setup-Muster memory-detect.test.js und custom-locales.test.js).
//
// Der Index-Leser ist hereingereicht (`statsFor`), nicht aufgebaut — der
// Beschleuniger baut ausdrücklich keinen Index an (Punkt 6 des
// Lösungsansatzes). Der Fall «Bereich ohne Index» misst deshalb den
// Regelfall, der Fall «mit Index» die Ergänzung um die drei Index-Zahlen.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanArea } from '../../src/main/area/area-stats.js';
import {
  MEMORY_STATS_VERSION,
  aktualisiereEintrag,
  entferneEintrag,
  erhebe,
  konfiguriereMemoryStats,
  ladeMemoryStats,
  schreibeMemoryStats,
  statsPfad,
} from '../../src/main/memory/memory-stats.js';
import {
  BOOK_SETTINGS_FILENAME,
  emptyBookContainer,
  serializeBookContainer,
} from '../../src/shared/books/book-core.js';
import { SHELF_SETTINGS_FILENAME } from '../../src/shared/books/shelf-core.js';

let tmpDirs = [];
let userData = null;

function makeTempDir(praefix = 'em4me-memory-stats-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  tmpDirs.push(dir);
  return dir;
}

// Bereich mit bekanntem Bestand: zwei Markdown-Dateien (eine davon in einem
// Unterordner), ein Bild, eine Begleitdatei. Die Erwartungswerte stehen als
// Zahl im Fall und nicht als Rechnung.
function makeArea() {
  const root = makeTempDir();
  fs.writeFileSync(path.join(root, 'Start.md'), '# Start\n', 'utf8');
  fs.mkdirSync(path.join(root, 'Unter'));
  fs.writeFileSync(path.join(root, 'Unter', 'Tief.md'), '# Tief\n', 'utf8');
  fs.writeFileSync(path.join(root, 'Bild.png'), 'xxxxx', 'utf8');
  fs.writeFileSync(path.join(root, 'Start.mdd'), '{}', 'utf8');
  return root;
}

function makeBook(name = 'Handbuch') {
  const dir = path.join(makeTempDir(), name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), '# Buch\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Kapitel-1.md'), '# Eins\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Kapitel-2.md'), '# Zwei\n', 'utf8');
  const container = emptyBookContainer(`${name}.md`);
  container.chapters = [
    { path: 'Kapitel-1.md', children: [{ path: 'Kapitel-2.md', children: [] }] },
  ];
  fs.writeFileSync(path.join(dir, BOOK_SETTINGS_FILENAME), serializeBookContainer(container));
  return dir;
}

// Regal mit einem zugeordneten und vorhandenen Buch, einem zugeordneten
// fehlenden und einem vorhandenen ohne Zuordnung.
function makeShelf(name = 'Bibliothek') {
  const dir = path.join(makeTempDir(), name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), '# Regal\n', 'utf8');
  for (const buch of ['Zugeordnet', 'Lose']) {
    const buchDir = path.join(dir, buch);
    fs.mkdirSync(buchDir);
    fs.writeFileSync(path.join(buchDir, `${buch}.md`), '# Buch\n', 'utf8');
    fs.writeFileSync(
      path.join(buchDir, BOOK_SETTINGS_FILENAME),
      serializeBookContainer(emptyBookContainer(`${buch}.md`)),
    );
  }
  fs.writeFileSync(
    path.join(dir, SHELF_SETTINGS_FILENAME),
    JSON.stringify({
      schemaVersion: 1,
      shelf: { file: `${name}.md` },
      books: ['Zugeordnet', 'Verschwunden'],
    }),
    'utf8',
  );
  return dir;
}

// Index-Leser-Attrappe in der Form von statsFor (views-stats.js): Sie liefert
// genau die drei Felder, die der Beschleuniger davon liest.
function indexLeser(status = 'ready') {
  return () =>
    status !== 'ready'
      ? { status }
      : {
          status: 'ready',
          tags: [
            { name: 'a', dateien: 1 },
            { name: 'b', dateien: 2 },
          ],
          aufgaben: { gesamt: 7, offen: 3, erledigt: 4, abgebrochen: 0 },
          verweise: { wiki: 1, markdown: 0, ohneEingehende: 2 },
        };
}

function eintrag(kind, dir) {
  return { kind, key: dir.toLowerCase(), path: dir, name: path.basename(dir) };
}

beforeEach(() => {
  userData = makeTempDir('em4me-memory-profil-');
  konfiguriereMemoryStats({ userDataDir: userData });
});

afterEach(() => {
  konfiguriereMemoryStats({});
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows-Dateisperren: Rest räumt das Betriebssystem-Temp auf.
    }
  }
  tmpDirs = [];
});

describe('Ablage: eigene Datei im Benutzerprofil (AK1, AK2)', () => {
  it('legt die Datei neben config.json an und liest sie mit Stand zurück', async () => {
    const dir = makeArea();
    const geschrieben = await aktualisiereEintrag(eintrag('area', dir));

    expect(statsPfad()).toBe(path.join(userData, 'memory-stats.json'));
    expect(fs.existsSync(statsPfad())).toBe(true);
    const roh = JSON.parse(fs.readFileSync(statsPfad(), 'utf8'));
    expect(roh.version).toBe(MEMORY_STATS_VERSION);
    expect(Object.keys(roh.eintraege)).toEqual([dir.toLowerCase()]);

    // Der Stand ist UTC, sekundengenau — dieselbe Form wie in area-stats.js.
    expect(geschrieben.stand).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const gelesen = await ladeMemoryStats();
    expect(gelesen[dir.toLowerCase()]).toEqual(geschrieben);
  });

  it('trägt den Arbeitsbereich nicht ein (seine Angaben stehen live im Speicher)', async () => {
    expect(await erhebe({ kind: 'workspace', key: 'workspace:a', path: null })).toBe(null);
    expect(await aktualisiereEintrag({ kind: 'workspace', key: 'workspace:a' })).toBe(null);
    expect(fs.existsSync(statsPfad())).toBe(false);
  });

  it('entfernt den Eintrag eines ausgetragenen Gefäßes', async () => {
    const dir = makeArea();
    await aktualisiereEintrag(eintrag('area', dir));
    expect(await entferneEintrag(dir.toLowerCase())).toBe(true);
    expect(await ladeMemoryStats()).toEqual({});
    // Ein zweiter Lauf ist kein Fehler und schreibt nichts.
    expect(await entferneEintrag(dir.toLowerCase())).toBe(false);
  });
});

describe('Fehlende und defekte Datei (AK3)', () => {
  it('startet ohne Datei leer, statt zu werfen', async () => {
    expect(fs.existsSync(statsPfad())).toBe(false);
    expect(await ladeMemoryStats()).toEqual({});
  });

  it('verwirft einen defekten Inhalt, statt ihn zu reparieren', async () => {
    fs.writeFileSync(statsPfad(), '{ das ist kein JSON', 'utf8');
    expect(await ladeMemoryStats()).toEqual({});
  });

  it('verwirft eine fremde Schema-Version und einen Eintrag ohne gültige Form', async () => {
    fs.writeFileSync(statsPfad(), JSON.stringify({ version: 99, eintraege: { a: {} } }), 'utf8');
    expect(await ladeMemoryStats()).toEqual({});

    fs.writeFileSync(
      statsPfad(),
      JSON.stringify({
        version: MEMORY_STATS_VERSION,
        eintraege: {
          gut: {
            kind: 'area',
            stand: '2026-09-11T08:00:00Z',
            status: 'ready',
            werte: { bytes: 1 },
          },
          ohneStatus: { kind: 'area', stand: '2026-09-11T08:00:00Z', werte: {} },
        },
      }),
      'utf8',
    );
    expect(Object.keys(await ladeMemoryStats())).toEqual(['gut']);
  });

  it('baut nach einem verworfenen Inhalt neu auf', async () => {
    const dir = makeArea();
    fs.writeFileSync(statsPfad(), 'kaputt', 'utf8');
    const neu = await aktualisiereEintrag(eintrag('area', dir));
    expect(neu.status).toBe('partial');
    expect((await ladeMemoryStats())[dir.toLowerCase()].stand).toBe(neu.stand);
  });
});

describe('Nicht erreichbares Gefäß (AK4)', () => {
  it('behält Werte und Stand und wechselt allein den Status', async () => {
    const dir = makeArea();
    const vorher = await aktualisiereEintrag(eintrag('area', dir));
    expect(vorher.status).toBe('partial');

    fs.rmSync(dir, { recursive: true, force: true });
    const danach = await aktualisiereEintrag(eintrag('area', dir));
    expect(danach.status).toBe('unreachable');
    expect(danach.stand).toBe(vorher.stand);
    expect(danach.werte).toEqual(vorher.werte);
  });

  it('meldet ein nie erreichbares Gefäß ohne Zahlen und ohne Stand', async () => {
    const dir = path.join(makeTempDir(), 'gibt-es-nicht');
    const neu = await erhebe(eintrag('area', dir));
    expect(neu).toEqual({ kind: 'area', stand: null, status: 'unreachable', werte: {} });
  });

  it('wertet eine Datei nicht als Gefäß', async () => {
    const datei = path.join(makeTempDir(), 'Notiz.md');
    fs.writeFileSync(datei, '# Notiz\n', 'utf8');
    expect((await erhebe(eintrag('area', datei))).status).toBe('unreachable');
  });
});

describe('Neu-Erhebung auf Anforderung (AK5, AK6)', () => {
  it('erhebt beim Eintragen genau einmal und legt genau einen Eintrag an', async () => {
    const dir = makeArea();
    await aktualisiereEintrag(eintrag('area', dir));
    const nachEintrag = await ladeMemoryStats();
    expect(Object.keys(nachEintrag)).toHaveLength(1);
    expect(nachEintrag[dir.toLowerCase()].werte.markdown).toBe(2);
  });

  it('nimmt den geänderten Bestand auf und setzt einen neueren Stand', async () => {
    const dir = makeArea();
    await aktualisiereEintrag(eintrag('area', dir));
    // Alten Stand künstlich zurückdatieren: Die Zeitstempel sind
    // sekundengenau, zwei Läufe in derselben Sekunde wären sonst gleich.
    const bestand = await ladeMemoryStats();
    bestand[dir.toLowerCase()].stand = '2020-01-01T00:00:00Z';
    await schreibeMemoryStats(bestand);

    fs.writeFileSync(path.join(dir, 'Neu.md'), '# Neu\n', 'utf8');
    const danach = await aktualisiereEintrag(eintrag('area', dir));
    expect(danach.werte.markdown).toBe(3);
    expect(danach.stand > '2020-01-01T00:00:00Z').toBe(true);
  });
});

describe('Die Zahlen je Gefäß-Art (AK7, AK9)', () => {
  it('stimmt für den Bereich mit einer frischen Erhebung desselben Ordners überein', async () => {
    const dir = makeArea();
    const erhoben = await erhebe(eintrag('area', dir));
    const frisch = await scanArea(dir, { mitMarkdown: true });

    expect(erhoben.werte.markdown).toBe(frisch.markdown.anzahl);
    expect(erhoben.werte.nichtMarkdown).toBe(
      frisch.bilder.anzahl + frisch.pdf.anzahl + frisch.sonstige.anzahl,
    );
    expect(erhoben.werte.ordner).toBe(frisch.ordner);
    expect(erhoben.werte.bytes).toBe(
      frisch.markdown.bytes +
        frisch.bilder.bytes +
        frisch.pdf.bytes +
        frisch.sonstige.bytes +
        frisch.mdd.bytes +
        frisch.mdda.bytes,
    );
    // Von Hand am Fixture nachgerechnet: zwei Markdown-Dateien, ein Bild, ein
    // Unterordner, die Begleitdatei zählt nur in den Bytes mit.
    expect(erhoben.werte.markdown).toBe(2);
    expect(erhoben.werte.nichtMarkdown).toBe(1);
    expect(erhoben.werte.ordner).toBe(1);
    expect(erhoben.werte.bytes).toBeGreaterThan(0);
  });

  it('führt die Index-Zahlen eines nicht geöffneten Bereichs als nicht verfügbar', async () => {
    const dir = makeArea();
    const erhoben = await erhebe(eintrag('area', dir), { statsFor: indexLeser('unavailable') });
    expect(erhoben.status).toBe('partial');
    // null und nicht 0: «nicht erhoben» ist keine gezählte Abwesenheit.
    expect(erhoben.werte.tags).toBe(null);
    expect(erhoben.werte.aufgaben).toBe(null);
    expect(erhoben.werte.waisen).toBe(null);
  });

  it('ergänzt die Index-Zahlen eines geöffneten Bereichs und steht auf ready', async () => {
    const dir = makeArea();
    const erhoben = await erhebe(eintrag('area', dir), { statsFor: indexLeser('ready') });
    expect(erhoben.status).toBe('ready');
    expect(erhoben.werte.tags).toBe(2);
    expect(erhoben.werte.aufgaben).toBe(7);
    expect(erhoben.werte.waisen).toBe(2);
    // Der Ordner-Anteil bleibt derselbe wie ohne Index.
    expect(erhoben.werte.markdown).toBe(2);
  });

  it('zählt für das Buch seine Kapitel', async () => {
    const dir = makeBook();
    const erhoben = await erhebe(eintrag('book', dir));
    expect(erhoben.status).toBe('ready');
    // Kapitel und Unterkapitel: zwei Knoten im Baum.
    expect(erhoben.werte.kapitel).toBe(2);
    expect(erhoben.werte.markdown).toBe(3);
    expect(erhoben.werte.bytes).toBeGreaterThan(0);
  });

  it('zählt für das Regal die vorhandenen und die fehlenden Bücher', async () => {
    const dir = makeShelf();
    const erhoben = await erhebe(eintrag('shelf', dir));
    expect(erhoben.status).toBe('ready');
    // Zugeordnet und vorhanden (1) plus vorhanden ohne Zuordnung (1); das
    // zugeordnete, aber fehlende Buch zählt allein bei `fehlend`.
    expect(erhoben.werte.buecher).toBe(2);
    expect(erhoben.werte.fehlend).toBe(1);
  });
});

describe('Ohne konfigurierten Ablage-Ort', () => {
  it('arbeitet ohne Persistenz weiter, statt zu werfen', async () => {
    konfiguriereMemoryStats({});
    expect(statsPfad()).toBe(null);
    expect(await ladeMemoryStats()).toEqual({});
    await schreibeMemoryStats({ a: {} });
    const dir = makeArea();
    // Die Erhebung selbst läuft; allein das Schreiben entfällt.
    expect((await aktualisiereEintrag(eintrag('area', dir))).status).toBe('partial');
    expect(await ladeMemoryStats()).toEqual({});
  });
});
