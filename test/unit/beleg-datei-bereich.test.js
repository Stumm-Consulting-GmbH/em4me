// 4T-001789 (Epic 3E-000255): Die Beleg-Datei im Bereich (AK2, AK3, AK4).
//
// Drei Aussagen über eine Datei, die im Bereich liegt, aber kein Dokument ist:
// Sie erscheint nicht in der Ordner-Liste, sie zählt in der Statistik als
// Begleit-Datei und nicht als «Sonstige», und der Index liest aus ihr keine
// Block-Daten.
//
// Die dritte Aussage ist durch die Bauart erfüllt und wird hier festgehalten,
// nicht hergestellt: Der Index bildet den Pfad der Begleitdatei aus jeder
// MARKDOWN-Datei und landet dabei immer bei der .mdd. Der Prüffall setzt
// deshalb beide Dateien nebeneinander — dieselben Block-Daten einmal in einer
// .mdd und einmal in einer .mddl — und misst den Unterschied. Ohne die zweite
// Hälfte bliebe er auch dann grün, wenn der Index gar keine Block-Daten läse.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  backlinksFor,
  frontmatterQueryFor,
  releaseRoot,
  rootForActiveFile,
  statsFor,
} from '../../src/main/backlinks.js';
import { collectAreaStats } from '../../src/main/area/area-stats.js';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');
// 4T-001787 (Epic 3E-000255): echte Normalisierung der Datenbank-Sektion.
const { normalisiereDatenbankKonfig } = require('../../src/main/area/area-config.js');

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-beleg-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile, ownerKey, areaRoot) {
  let result = backlinksFor(activeFile, ownerKey, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, ownerKey, areaRoot);
  }
  return result;
}

// Aufloeser der Aufgaben-Zustaende in der Auslieferungs-Belegung (Muster
// area-stats.test.js).
function statusTypeOf(ch) {
  if (ch === 'x' || ch === 'X') return 'DONE';
  if (ch === '-') return 'CANCELLED';
  if (ch === '/') return 'IN_PROGRESS';
  if (ch === ' ') return 'TODO';
  return null;
}

afterEach(() => {
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// --- AK2: Ordner-Liste des Bereichs -------------------------------------------

// Der echte Handler statt einer nachgebauten Filter-Bedingung (Muster
// area-loeschen.test.js). Die Markdown-Erkennung ist dieselbe, die main.js als
// isMarkdownPath hereinreicht.
function registriere(rootPath) {
  const handler = new Map();
  registerAreasIpc((kanal, fn) => handler.set(kanal, fn), {
    dialog: {},
    shell: {},
    senderWindow: () => ({}),
    areaOfWindow: () => (rootPath ? { rootPath, name: path.basename(rootPath) } : null),
    tForWindow: (_w, key) => key,
    appRegistry: {},
    openAreaPath: (p) => ({ ok: true, rootPath: p }),
    closeAreaApp: async () => ({ ok: true }),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    getStore: () => null,
    workspacesState: [],
    setWorkspacesState: () => {},
    workspacesChanged: () => {},
    resolveAreaStartPage: async () => null,
    writeAreaStartPage: async () => ({ ok: true }),
    startPageRelative: () => null,
    // 4T-001787 (Epic 3E-000255): Die Ordner-Liste laesst den Sperr-Ordner der
    // obersten Ebene aus und braucht dafuer den wirksamen Namen. Gereicht wird
    // hier die ECHTE Normalisierung, damit der Fall nicht gegen eine Attrappe
    // der Rueckfall-Regel prueft; der Bereich fuehrt keine Bereichsdatei-Angabe,
    // also gilt der Vorgabe-Name.
    readAreaDatabaseConfig: async () => undefined,
    normalisiereDatenbankKonfig,
    sperrOrdnerNeuBeziehen: async () => {},
  });
  return handler;
}

describe('area:listDir mit einer Beleg-Datei im Ordner (AK2)', () => {
  it('listet die Tabellen-Datei und keine Datei der Markdown-Data-Familie', async () => {
    const wurzel = makeRoot();
    write(wurzel, 'Kunden.md', '# Kunden\n');
    write(wurzel, 'Kunden.mddl', 'Beleg-Zeile\n');
    write(wurzel, 'Kunden.mdd', '{}');
    write(wurzel, 'Area_Settings.mdda', '{}');

    const handler = registriere(wurzel);
    const ergebnis = await handler.get('area:listDir')({}, wurzel);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.files).toEqual(['Kunden.md']);
    expect(ergebnis.dirs).toEqual([]);
  });
});

// --- AK3: Bereichs-Statistik --------------------------------------------------

describe('Bereichs-Statistik mit Tabellen- und Beleg-Datei (AK3)', () => {
  // Bestand mit bekannten Größen: eine Tabellen-Datei mit Begleitdatei und
  // Beleg-Datei, ein gewöhnliches Dokument ohne beides, dazu eine echte
  // «sonstige» Datei als Gegenprobe.
  function fixture() {
    const root = makeRoot();
    const tabelle = write(root, 'Kunden.md', '# Kunden\n\nEine Zeile.\n');
    write(root, 'Kunden.mdd', 'mdd-Rest'); // 8 Bytes
    write(root, 'Kunden.mddl', 'beleg-eins\n'); // 11 Bytes
    write(root, 'Notiz.md', '# Notiz\n');
    write(root, 'daten.csv', 'a;b'); // 3 Bytes
    return { root, tabelle };
  }

  it('zählt die Beleg-Datei im eigenen Zähler und nicht unter «Sonstige»', async () => {
    const { root, tabelle } = fixture();
    await indexFor(tabelle, 'test:beleg-stats', root);

    const stats = await collectAreaStats(root, { statusTypeOf }, { statsFor });

    expect(stats.status).toBe('ready');
    expect(stats.begleit.mddl).toEqual({ anzahl: 1, bytes: 11 });
    expect(stats.begleit.mdd).toEqual({ anzahl: 1, bytes: 8 });
    // Die Gegenprobe: Ohne eigenen Zähler fiele die Beleg-Datei hierher.
    expect(stats.dateien.nichtMarkdown.sonstige).toBe(1);
    expect(stats.dateien.nichtMarkdown.gesamt).toBe(1);
  });

  it('meldet die Beleg-Datei nicht als Dokument-Begleitdatei', async () => {
    const { root, tabelle } = fixture();
    await indexFor(tabelle, 'test:beleg-stats-mitmdd', root);

    const stats = await collectAreaStats(root, { statusTypeOf }, { statsFor });

    // Genau ein Dokument hat eine Begleitdatei (Kunden.md), und die Beleg-Datei
    // ändert daran nichts — weder nach oben noch als verwaister Eintrag.
    expect(stats.begleit.mitMdd).toBe(1);
    expect(stats.begleit.vonMarkdown).toBe(2);
  });

  it('rechnet die Beleg-Bytes in die Begleit-Summe und damit in die Gesamt-Summe', async () => {
    const { root, tabelle } = fixture();
    await indexFor(tabelle, 'test:beleg-stats-bytes', root);

    const { speicher } = await collectAreaStats(root, { statusTypeOf }, { statsFor });

    expect(speicher.begleit).toBe(19); // 8 (.mdd) + 0 (.mdda) + 11 (.mddl)
    expect(speicher.nichtMarkdown).toBe(3); // allein die CSV-Datei
    expect(speicher.gesamt).toBe(speicher.markdown + speicher.nichtMarkdown + speicher.begleit);
  });
});

// --- AK4: Index-Aufbau --------------------------------------------------------

function blockDatenContainer(blockData) {
  return JSON.stringify({ schemaVersion: 1, history: { anchors: [], packets: [] }, blockData });
}

describe('Index-Aufbau mit einer Beleg-Datei im Bereich (AK4)', () => {
  it('liest Block-Daten aus der Begleitdatei, aus der Beleg-Datei dagegen nicht', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    write(root, 'Kunden.md', '# Kunden\n\nEintrag eins. ^k1\n');
    write(root, 'Preise.md', '# Preise\n\nEintrag zwei. ^p1\n');
    // Dieselben Block-Daten, einmal in der Begleitdatei und einmal in einer
    // Beleg-Datei. Nur die erste darf im Index ankommen.
    write(
      root,
      'Kunden.mdd',
      blockDatenContainer({ k1: { values: { status: 'offen' }, updated: '2026-09-18T08:00:00Z' } }),
    );
    write(
      root,
      'Preise.mddl',
      blockDatenContainer({ p1: { values: { status: 'offen' }, updated: '2026-09-18T08:00:00Z' } }),
    );

    const index = await indexFor(start, 'test:beleg-index', root);
    expect(index.status).toBe('ready');

    const treffer = frontmatterQueryFor(start, 'LIST BLOCKS').files.map((f) => f.name);
    expect(treffer).toEqual(['Kunden#^k1']);
  });

  it('stört den Index-Aufbau nicht und zählt nicht als Markdown-Datei', async () => {
    const root = makeRoot();
    const start = write(root, 'Start.md', '# Start\n');
    write(root, 'Kunden.md', '# Kunden\n');
    write(root, 'Kunden.mddl', 'beleg-eins\nbeleg-zwei\n');

    const index = await indexFor(start, 'test:beleg-index-aufbau', root);

    expect(index.status).toBe('ready');
    const stats = statsFor(root, { statusTypeOf });
    expect(stats.status).toBe('ready');
    expect(stats.markdown.anzahl).toBe(2);
  });
});
